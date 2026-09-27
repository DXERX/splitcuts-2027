-- 0010_triggers.sql
-- updated_at maintenance, the booking timeline, automatic loyalty
-- evaluation on completion, and administrative audit logging.
-- Keep external API calls (WhatsApp/SMS/etc.) OUT of triggers -- those are
-- handled by Edge Functions reacting to Realtime/webhook events instead.

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'branches', 'profiles', 'customers', 'barbers', 'services',
      'barber_schedules', 'barber_breaks', 'barber_time_off',
      'bookings', 'loyalty_programs', 'rewards', 'shop_devices',
      'staff_roles', 'settings'
    ])
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- BOOKING STATUS TRANSITION GUARD (belt-and-suspenders for any write path
-- that isn't update_booking_status(), e.g. a future admin tool)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_booking_status_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not exists (
    select 1 from public.booking_status_transitions t
    where t.from_status = old.status and t.to_status = new.status
  ) then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger enforce_booking_status_transition
  before update of status on public.bookings
  for each row execute function public.enforce_booking_status_transition();

-- ---------------------------------------------------------------------------
-- BOOKING TIMELINE (booking_events)
-- ---------------------------------------------------------------------------
create or replace function public.log_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type public.booking_event_type;
begin
  if tg_op = 'INSERT' then
    insert into public.booking_events (booking_id, branch_id, event_type, performed_by, new_status, metadata)
    values (new.id, new.branch_id, 'booking_created', auth.uid(), new.status, jsonb_build_object('barber_id', new.barber_id, 'service_id', new.service_id));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.barber_id is distinct from old.barber_id then
      insert into public.booking_events (booking_id, branch_id, event_type, performed_by, old_status, new_status, metadata)
      values (new.id, new.branch_id, 'barber_changed', auth.uid(), old.status, new.status, jsonb_build_object('old_barber_id', old.barber_id, 'new_barber_id', new.barber_id));
    end if;

    if new.starts_at is distinct from old.starts_at then
      insert into public.booking_events (booking_id, branch_id, event_type, performed_by, old_status, new_status, metadata)
      values (new.id, new.branch_id, 'booking_rescheduled', auth.uid(), old.status, new.status, jsonb_build_object('old_starts_at', old.starts_at, 'new_starts_at', new.starts_at));
    end if;

    if new.status is distinct from old.status then
      v_event_type := case new.status
        when 'confirmed' then 'booking_confirmed'
        when 'checked_in' then 'customer_checked_in'
        when 'in_service' then 'service_started'
        when 'completed' then 'service_completed'
        when 'cancelled' then 'booking_cancelled'
        when 'no_show' then 'marked_no_show'
        else 'booking_status_changed'
      end;

      insert into public.booking_events (booking_id, branch_id, event_type, performed_by, old_status, new_status, metadata)
      values (new.id, new.branch_id, v_event_type, auth.uid(), old.status, new.status, jsonb_build_object('reason', new.cancelled_reason));
    end if;

    return new;
  end if;

  return new;
end;
$$;

create trigger log_booking_event_insert
  after insert on public.bookings
  for each row execute function public.log_booking_event();

create trigger log_booking_event_update
  after update on public.bookings
  for each row execute function public.log_booking_event();

-- ---------------------------------------------------------------------------
-- LOYALTY EVALUATION ON COMPLETION
-- ---------------------------------------------------------------------------
create or replace function public.evaluate_loyalty_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program public.loyalty_programs;
  v_progress int;
  v_reward_id uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  -- A booking can count toward more than one active program, so each program
  -- gets its OWN visit_earned row (not one shared row re-attributed in a
  -- loop -- that ordering bug undercounts the very booking that just
  -- completed, since its row isn't attributed to a program until after the
  -- progress SELECT below runs).
  for v_program in
    select * from public.loyalty_programs
    where is_active and (branch_id is null or branch_id = new.branch_id)
  loop
    insert into public.loyalty_transactions (customer_id, loyalty_program_id, booking_id, type, amount, reason, created_by)
    values (new.customer_id, v_program.id, new.id, 'visit_earned', 1, 'Completed booking', auth.uid());

    select coalesce(sum(amount) filter (where type = 'visit_earned'), 0)
         - coalesce(sum(amount) filter (where type = 'visit_removed'), 0)
      into v_progress
    from public.loyalty_transactions
    where customer_id = new.customer_id and loyalty_program_id = v_program.id;

    if v_progress > 0 and v_progress % v_program.visits_required = 0 then
      insert into public.rewards (customer_id, loyalty_program_id, branch_id, reward_type, status, max_value, metadata)
      values (
        new.customer_id, v_program.id, new.branch_id, v_program.reward_type, 'available',
        (select price from public.services where id = coalesce(v_program.reward_service_id, new.service_id)),
        jsonb_build_object('triggered_by_booking_id', new.id)
      )
      returning id into v_reward_id;

      insert into public.loyalty_transactions (customer_id, loyalty_program_id, booking_id, type, amount, reason, created_by)
      values (new.customer_id, v_program.id, new.id, 'reward_earned', 1, 'Reached ' || v_program.visits_required || ' visits', auth.uid());

      insert into public.notifications (branch_id, recipient_user_id, booking_id, type, title, message)
      values (
        new.branch_id, new.customer_id, new.id, 'reward_earned',
        'Reward earned!', 'You earned a reward: ' || v_program.name
      );
    end if;
  end loop;

  return new;
end;
$$;

create trigger evaluate_loyalty_on_completion
  after update of status on public.bookings
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.evaluate_loyalty_on_completion();

-- ---------------------------------------------------------------------------
-- NEW BOOKING NOTIFICATION (drives shop-mode realtime + audio/TTS)
-- ---------------------------------------------------------------------------
create or replace function public.notify_new_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_name text;
  v_service_name text;
begin
  select coalesce(p.full_name, 'A customer') into v_customer_name
  from public.profiles p where p.id = new.customer_id;

  select name into v_service_name from public.services where id = new.service_id;

  insert into public.notifications (branch_id, barber_id, booking_id, type, title, message)
  values (
    new.branch_id, new.barber_id, new.id, 'new_booking',
    'New booking',
    v_customer_name || ' booked ' || coalesce(v_service_name, 'a service') || ' at ' || to_char(new.starts_at, 'HH12:MI AM')
  );

  return new;
end;
$$;

create trigger notify_new_booking
  after insert on public.bookings
  for each row execute function public.notify_new_booking();

-- ---------------------------------------------------------------------------
-- ADMINISTRATIVE AUDIT LOG (settings + staff_roles changes)
-- ---------------------------------------------------------------------------
create or replace function public.log_admin_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (branch_id, actor_id, action, table_name, record_id, old_data, new_data)
  values (
    coalesce(new.branch_id, old.branch_id),
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_settings_changes
  after insert or update or delete on public.settings
  for each row execute function public.log_admin_audit_event();

create trigger audit_staff_roles_changes
  after insert or update or delete on public.staff_roles
  for each row execute function public.log_admin_audit_event();
