-- =============================================================================
-- PART C: booking timeline, loyalty engine, shop devices, staff notifications
-- =============================================================================

create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  event_type text not null,
  performed_by uuid references public.profiles (id) on delete set null,
  old_status text,
  new_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete cascade,
  name text not null,
  description text,
  visits_required int not null check (visits_required > 0),
  reward_type text not null default 'free_service',
  reward_service_id uuid references public.services (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  loyalty_program_id uuid references public.loyalty_programs (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  type text not null check (type in ('visit_earned', 'visit_removed', 'reward_earned', 'reward_redeemed', 'manual_adjustment', 'reward_expired')),
  amount int not null default 1,
  reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  loyalty_program_id uuid not null references public.loyalty_programs (id) on delete restrict,
  branch_id uuid references public.branches (id) on delete set null,
  reward_type text not null default 'free_service',
  status public.reward_status not null default 'available',
  earned_at timestamptz not null default now(),
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_appointment_id uuid references public.appointments (id) on delete set null,
  max_value numeric(10, 2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace view public.customer_loyalty_progress as
select
  p.id as customer_id, lp.id as loyalty_program_id, lp.branch_id, lp.name, lp.visits_required,
  coalesce(sum(lt.amount) filter (where lt.type = 'visit_earned'), 0)
    - coalesce(sum(lt.amount) filter (where lt.type = 'visit_removed'), 0) as visits_progress
from public.profiles p
cross join public.loyalty_programs lp
left join public.loyalty_transactions lt on lt.customer_id = p.id and lt.loyalty_program_id = lp.id
where lp.is_active and p.role = 'customer'
group by p.id, lp.id, lp.branch_id, lp.name, lp.visits_required;

-- Shop Mode: registered cashier/kiosk screens and the realtime feed that
-- drives them. Named staff_notifications (not "notifications") because that
-- name is already used by the existing site-banner table.
create table if not exists public.shop_devices (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  device_name text not null,
  device_type text not null default 'cashier_terminal',
  last_seen_at timestamptz,
  notifications_enabled boolean not null default true,
  voice_enabled boolean not null default true,
  language text not null default 'en',
  volume numeric(3, 2) not null default 0.80 check (volume between 0 and 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_device_id uuid not null references public.shop_devices (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_notifications (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  recipient_user_id uuid references public.profiles (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete cascade,
  type public.staff_notification_type not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- TRIGGERS: booking timeline, loyalty evaluation, new-booking staff alert
-- ---------------------------------------------------------------------------
create or replace function public.log_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.booking_events (appointment_id, branch_id, event_type, performed_by, new_status, metadata)
    values (new.id, new.branch_id, 'booking_created', auth.uid(), new.status,
      jsonb_build_object('barber_id', new.barber_id, 'service_id', new.service_id));
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.booking_events (appointment_id, branch_id, event_type, performed_by, old_status, new_status, metadata)
    values (new.id, new.branch_id, 'status_changed', auth.uid(), old.status, new.status, '{}'::jsonb);
  end if;

  return new;
end;
$$;

drop trigger if exists log_booking_event_insert on public.appointments;
create trigger log_booking_event_insert after insert on public.appointments for each row execute function public.log_booking_event();
drop trigger if exists log_booking_event_update on public.appointments;
create trigger log_booking_event_update after update on public.appointments for each row execute function public.log_booking_event();

create or replace function public.evaluate_loyalty_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program public.loyalty_programs;
  v_progress int;
begin
  if new.status <> 'completed' or old.status = 'completed' or new.customer_id is null then
    return new; -- loyalty only accrues for logged-in customers
  end if;

  for v_program in
    select * from public.loyalty_programs where is_active and (branch_id is null or branch_id = new.branch_id)
  loop
    insert into public.loyalty_transactions (customer_id, loyalty_program_id, appointment_id, type, amount, reason, created_by)
    values (new.customer_id, v_program.id, new.id, 'visit_earned', 1, 'Completed appointment', auth.uid());

    select coalesce(sum(amount) filter (where type = 'visit_earned'), 0)
         - coalesce(sum(amount) filter (where type = 'visit_removed'), 0)
      into v_progress
    from public.loyalty_transactions
    where customer_id = new.customer_id and loyalty_program_id = v_program.id;

    if v_progress > 0 and v_progress % v_program.visits_required = 0 then
      insert into public.rewards (customer_id, loyalty_program_id, branch_id, reward_type, status, max_value, metadata)
      values (new.customer_id, v_program.id, new.branch_id, v_program.reward_type, 'available',
        (select price from public.services where id = coalesce(v_program.reward_service_id, new.service_id)),
        jsonb_build_object('triggered_by_appointment_id', new.id));

      insert into public.loyalty_transactions (customer_id, loyalty_program_id, appointment_id, type, amount, reason, created_by)
      values (new.customer_id, v_program.id, new.id, 'reward_earned', 1, 'Reached ' || v_program.visits_required || ' visits', auth.uid());

      insert into public.staff_notifications (branch_id, recipient_user_id, appointment_id, type, title, message)
      values (new.branch_id, new.customer_id, new.id, 'reward_earned', 'Reward earned!', 'You earned a reward: ' || v_program.name);
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists evaluate_loyalty_on_completion on public.appointments;
create trigger evaluate_loyalty_on_completion
  after update of status on public.appointments
  for each row when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.evaluate_loyalty_on_completion();

create or replace function public.notify_new_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_name text;
begin
  select coalesce(name_en, name_ar) into v_service_name from public.services where id = new.service_id;

  insert into public.staff_notifications (branch_id, appointment_id, type, title, message)
  values (new.branch_id, new.id, 'new_booking', 'New booking',
    coalesce(new.customer_name, 'A customer') || ' booked ' || coalesce(v_service_name, 'a service') ||
    ' at ' || to_char(new.appointment_start, 'HH12:MI AM'));
  return new;
end;
$$;

drop trigger if exists notify_new_appointment on public.appointments;
create trigger notify_new_appointment after insert on public.appointments for each row execute function public.notify_new_appointment();
