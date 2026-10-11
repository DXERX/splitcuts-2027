-- Points for completed cuts, including guests whose phone matches a signup,
-- and a 14-day backfill so last fortnight's done bookings are on the ledger.
-- The owner report reads the same rows so staff can see whether a point landed.

create or replace function public.service_earns_loyalty(p_service_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.services s
    where s.id = p_service_id
      and btrim(s.name_en) in ('Hair', 'Hair + Beard')
      and (
        s.category = 'CUTS'
        or (
          s.category is null
          and not (btrim(s.name_en) = 'Hair' and s.price >= 90)
        )
      )
  );
$$;

grant execute on function public.service_earns_loyalty(uuid) to authenticated, service_role;

create or replace function public.match_profile_by_phone(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.role = 'customer'
    and p.phone is not null
    and p_phone is not null
    and length(right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 9)) = 9
    and right(regexp_replace(p.phone, '[^0-9]', '', 'g'), 9)
      = right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 9)
    and (
      select count(*)
      from public.profiles p2
      where p2.role = 'customer'
        and p2.phone is not null
        and right(regexp_replace(p2.phone, '[^0-9]', '', 'g'), 9)
          = right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 9)
    ) = 1
  limit 1;
$$;

revoke all on function public.match_profile_by_phone(text) from public, anon, authenticated;

create or replace function public.evaluate_loyalty_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_program public.loyalty_programs;
  v_progress integer;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  if not public.service_earns_loyalty(new.service_id) then
    return new;
  end if;

  v_customer := new.customer_id;
  if v_customer is null then
    v_customer := public.match_profile_by_phone(new.customer_phone);
    if v_customer is null then
      return new;
    end if;
    update public.appointments
      set customer_id = v_customer
      where id = new.id and customer_id is null;
  end if;

  select *
    into v_program
  from public.loyalty_programs
  where is_active
    and (branch_id is null or branch_id = new.branch_id)
  order by (branch_id is not distinct from new.branch_id) desc, created_at
  limit 1;

  if not found then
    return new;
  end if;

  if exists (
    select 1
    from public.loyalty_transactions lt
    join public.appointments a on a.id = lt.appointment_id
    where lt.customer_id = v_customer
      and lt.loyalty_program_id = v_program.id
      and lt.type = 'visit_earned'
      and a.appointment_date = new.appointment_date
  ) then
    return new;
  end if;

  insert into public.loyalty_transactions (
    customer_id, loyalty_program_id, appointment_id, type, amount, reason
  ) values (
    v_customer, v_program.id, new.id, 'visit_earned', 1,
    'Completed eligible Split Rewards visit'
  );

  select
    coalesce(sum(lt.amount) filter (where lt.type = 'visit_earned'), 0)
    - coalesce(sum(lt.amount) filter (where lt.type = 'visit_removed'), 0)
  into v_progress
  from public.loyalty_transactions lt
  where lt.customer_id = v_customer
    and lt.loyalty_program_id = v_program.id;

  if v_progress > 0 and v_program.visits_required > 0
     and v_progress % v_program.visits_required = 0 then
    insert into public.rewards (
      customer_id, loyalty_program_id, branch_id, reward_type, status, metadata
    ) values (
      v_customer,
      v_program.id,
      new.branch_id,
      v_program.reward_type,
      'available',
      jsonb_build_object('triggered_by_appointment_id', new.id)
    );

    insert into public.loyalty_transactions (
      customer_id, loyalty_program_id, appointment_id, type, amount, reason
    ) values (
      v_customer, v_program.id, new.id, 'reward_earned', 0, 'Free cut unlocked'
    );

    begin
      insert into public.staff_notifications (
        branch_id, recipient_user_id, appointment_id, type, title, message
      ) values (
        new.branch_id, v_customer, new.id, 'reward_earned', 'Reward earned', 'Free cut unlocked'
      );
    exception
      when others then
        raise warning 'loyalty notification skipped for appointment %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

create or replace function public.backfill_recent_loyalty(p_days integer default 14)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linked integer := 0;
  v_visits integer := 0;
  v_rewards integer := 0;
begin
  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED' using errcode = 'P0001';
  end if;

  if not (
    public.is_owner()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_active and p.role in ('owner', 'manager')
    )
  ) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception 'INVALID_RANGE' using errcode = 'P0001';
  end if;

  update public.appointments a
    set customer_id = public.match_profile_by_phone(a.customer_phone)
    where a.customer_id is null
      and a.status = 'completed'
      and a.appointment_date >= ((timezone('Asia/Riyadh', now()))::date - p_days)
      and public.match_profile_by_phone(a.customer_phone) is not null;
  get diagnostics v_linked = row_count;

  insert into public.loyalty_transactions (
    customer_id, loyalty_program_id, appointment_id, type, amount, reason
  )
  select
    picked.customer_id,
    picked.loyalty_program_id,
    picked.appointment_id,
    'visit_earned',
    1,
    'Completed eligible Split Rewards visit'
  from (
    select distinct on (a.customer_id, lp.id, a.appointment_date)
      a.customer_id,
      lp.id as loyalty_program_id,
      a.id as appointment_id
    from public.appointments a
    join lateral (
      select p.id
      from public.loyalty_programs p
      where p.is_active
        and (p.branch_id is null or p.branch_id = a.branch_id)
      order by (p.branch_id is not distinct from a.branch_id) desc, p.created_at
      limit 1
    ) lp on true
    where a.status = 'completed'
      and a.customer_id is not null
      and a.appointment_date >= ((timezone('Asia/Riyadh', now()))::date - p_days)
      and public.service_earns_loyalty(a.service_id)
    order by a.customer_id, lp.id, a.appointment_date, a.appointment_start nulls last, a.created_at
  ) picked
  where not exists (
    select 1
    from public.loyalty_transactions lt
    join public.appointments existing on existing.id = lt.appointment_id
    where lt.customer_id = picked.customer_id
      and lt.loyalty_program_id = picked.loyalty_program_id
      and lt.type = 'visit_earned'
      and existing.appointment_date = (
        select appointment_date from public.appointments where id = picked.appointment_id
      )
  );
  get diagnostics v_visits = row_count;

  insert into public.rewards (
    customer_id, loyalty_program_id, branch_id, reward_type, status, metadata
  )
  select
    owed.customer_id,
    owed.loyalty_program_id,
    owed.branch_id,
    owed.reward_type,
    'available',
    jsonb_build_object('triggered_by_appointment_id', owed.appointment_id, 'backfill', true)
  from (
    select
      ranked.customer_id,
      ranked.loyalty_program_id,
      ranked.appointment_id,
      ranked.branch_id,
      ranked.reward_type
    from (
      select
        lt.customer_id,
        lt.loyalty_program_id,
        lt.appointment_id,
        a.branch_id,
        lp.reward_type,
        row_number() over (
          partition by lt.customer_id, lt.loyalty_program_id
          order by a.appointment_date, a.appointment_start nulls last, lt.created_at
        ) as visit_n,
        lp.visits_required
      from public.loyalty_transactions lt
      join public.appointments a on a.id = lt.appointment_id
      join public.loyalty_programs lp on lp.id = lt.loyalty_program_id
      where lt.type = 'visit_earned'
        and public.service_earns_loyalty(a.service_id)
    ) ranked
    where ranked.visits_required > 0
      and ranked.visit_n % ranked.visits_required = 0
  ) owed
  where not exists (
    select 1
    from public.rewards r
    where r.customer_id = owed.customer_id
      and r.loyalty_program_id = owed.loyalty_program_id
      and r.metadata ->> 'triggered_by_appointment_id' = owed.appointment_id::text
  );
  get diagnostics v_rewards = row_count;

  insert into public.loyalty_transactions (
    customer_id, loyalty_program_id, appointment_id, type, amount, reason
  )
  select
    r.customer_id,
    r.loyalty_program_id,
    (r.metadata ->> 'triggered_by_appointment_id')::uuid,
    'reward_earned',
    0,
    'Free cut unlocked'
  from public.rewards r
  where r.metadata ? 'triggered_by_appointment_id'
    and (r.metadata ->> 'triggered_by_appointment_id') ~* '^[0-9a-f-]{36}$'
    and not exists (
      select 1
      from public.loyalty_transactions lt
      where lt.customer_id = r.customer_id
        and lt.loyalty_program_id = r.loyalty_program_id
        and lt.type = 'reward_earned'
        and lt.appointment_id = (r.metadata ->> 'triggered_by_appointment_id')::uuid
    );

  return jsonb_build_object(
    'linked', v_linked,
    'visits_added', v_visits,
    'rewards_added', v_rewards
  );
end;
$$;

revoke all on function public.backfill_recent_loyalty(integer) from public;
grant execute on function public.backfill_recent_loyalty(integer) to authenticated;

create or replace function public.recent_loyalty_report(p_branch_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cuts jsonb;
  v_signups jsonb;
begin
  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED' using errcode = 'P0001';
  end if;

  if p_branch_id is null then
    if not public.is_owner() then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
  elsif not public.is_branch_staff(p_branch_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
  into v_cuts
  from (
    select
      a.id,
      a.appointment_date,
      coalesce(a.customer_name, 'Guest') as customer_name,
      a.customer_phone,
      a.customer_email,
      a.customer_id,
      coalesce(s.name_en, 'Service') as service_name,
      public.service_earns_loyalty(a.service_id) as eligible,
      exists (
        select 1
        from public.loyalty_transactions lt
        where lt.appointment_id = a.id and lt.type = 'visit_earned'
      ) as point_recorded,
      (pr.created_at >= now() - interval '14 days') as signed_up_recently
    from public.appointments a
    left join public.services s on s.id = a.service_id
    left join public.profiles pr on pr.id = a.customer_id
    where a.status = 'completed'
      and a.appointment_date >= ((timezone('Asia/Riyadh', now()))::date - 14)
      and (p_branch_id is null or a.branch_id = p_branch_id)
    order by a.appointment_date desc, a.appointment_start desc nulls last
    limit 80
  ) x;

  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
  into v_signups
  from (
    select
      p.id,
      coalesce(p.full_name, 'Guest') as name,
      p.phone,
      p.created_at,
      (
        select count(*)
        from public.appointments a
        where a.customer_id = p.id
          and a.appointment_date >= ((timezone('Asia/Riyadh', now()))::date - 14)
          and a.status <> 'cancelled'
      ) as bookings,
      (
        select count(*)
        from public.loyalty_transactions lt
        where lt.customer_id = p.id
          and lt.type = 'visit_earned'
          and lt.created_at >= now() - interval '14 days'
      ) as points
    from public.profiles p
    where p.role = 'customer'
      and p.created_at >= now() - interval '14 days'
      and exists (
        select 1
        from public.appointments a
        where a.appointment_date >= ((timezone('Asia/Riyadh', now()))::date - 14)
          and a.status <> 'cancelled'
          and (
            a.customer_id = p.id
            or (
              a.customer_phone is not null
              and p.phone is not null
              and right(regexp_replace(a.customer_phone, '[^0-9]', '', 'g'), 9)
                = right(regexp_replace(p.phone, '[^0-9]', '', 'g'), 9)
            )
          )
          and (p_branch_id is null or a.branch_id = p_branch_id)
      )
    order by p.created_at desc
    limit 40
  ) x;

  return jsonb_build_object('cuts', v_cuts, 'signups', v_signups);
end;
$$;

revoke all on function public.recent_loyalty_report(uuid) from public;
grant execute on function public.recent_loyalty_report(uuid) to authenticated;
