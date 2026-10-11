-- Loyalty cycle.
-- Points stay on Hair and Hair + Beard only, one per customer per day.
-- The next eligible cut after a reward is the free cut: it does not add a
-- point, the reward is marked used, and the counter returns to 0.
-- Opening this file in the SQL editor also writes any missing points from
-- the last 14 Riyadh days, so last fortnight is on the ledger immediately.

create or replace function public.is_owner()
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text = 'owner'
      and is_active
  );
$$;

create or replace function public.is_branch_staff(branch uuid)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  select public.is_owner() or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.branch_id = branch
      and p.role::text in ('owner', 'manager', 'cashier', 'barber')
  ) or exists (
    select 1
    from public.staff_roles sr
    where sr.user_id = auth.uid()
      and sr.is_active
      and sr.branch_id = branch
  );
$$;

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
  v_reward uuid;
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

  -- One loyalty event per customer per day. A second cut the same day
  -- neither earns another point nor spends a reward.
  if exists (
    select 1
    from public.loyalty_transactions lt
    join public.appointments a on a.id = lt.appointment_id
    where lt.customer_id = v_customer
      and lt.loyalty_program_id = v_program.id
      and lt.type in ('visit_earned', 'reward_redeemed')
      and a.appointment_date = new.appointment_date
  ) then
    return new;
  end if;

  -- The cut after a full card is the free one. It spends the reward and
  -- does not start the next card, so the count returns to 0.
  select r.id
    into v_reward
  from public.rewards r
  where r.customer_id = v_customer
    and r.loyalty_program_id = v_program.id
    and r.status = 'available'
  order by r.earned_at
  limit 1;

  if v_reward is not null then
    update public.rewards
      set status = 'redeemed',
          redeemed_at = now(),
          redeemed_appointment_id = new.id
      where id = v_reward
        and status = 'available';

    insert into public.loyalty_transactions (
      customer_id, loyalty_program_id, appointment_id, type, amount, reason
    ) values (
      v_customer, v_program.id, new.id, 'reward_redeemed', 0, 'Free cut used'
    );

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
volatile
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
      where p.id = auth.uid()
        and p.is_active
        and p.role::text in ('owner', 'manager')
    )
    or exists (
      select 1 from public.staff_roles sr
      where sr.user_id = auth.uid()
        and sr.is_active
        and sr.role::text in ('owner', 'manager')
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
      and not exists (
        select 1
        from public.loyalty_transactions spent
        where spent.appointment_id = a.id
          and spent.type = 'reward_redeemed'
      )
    order by a.customer_id, lp.id, a.appointment_date, a.appointment_start nulls last, a.created_at
  ) picked
  where not exists (
    select 1
    from public.loyalty_transactions lt
    join public.appointments existing on existing.id = lt.appointment_id
    where lt.customer_id = picked.customer_id
      and lt.loyalty_program_id = picked.loyalty_program_id
      and lt.type in ('visit_earned', 'reward_redeemed')
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
volatile
security definer
set search_path = public
as $$
declare
  v_cuts jsonb;
  v_signups jsonb;
  v_role text;
  v_branch uuid;
  v_active boolean;
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED' using errcode = 'P0001';
  end if;

  select p.role::text, p.branch_id, p.is_active
    into v_role, v_branch, v_active
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(v_active, false) and v_role = 'owner' then
    v_allowed := true;
  elsif p_branch_id is null and coalesce(v_active, false) and v_role = 'manager' then
    v_allowed := true;
  elsif p_branch_id is not null
    and coalesce(v_active, false)
    and v_role in ('manager', 'cashier', 'barber')
    and v_branch = p_branch_id then
    v_allowed := true;
  elsif exists (
    select 1
    from public.staff_roles sr
    where sr.user_id = auth.uid()
      and sr.is_active
      and (p_branch_id is null or sr.branch_id = p_branch_id or sr.role::text in ('owner', 'manager'))
  ) then
    v_allowed := true;
  end if;

  if not v_allowed then
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
      exists (
        select 1
        from public.loyalty_transactions lt
        where lt.appointment_id = a.id and lt.type = 'reward_redeemed'
      ) as reward_used,
      (pr.created_at >= now() - interval '14 days') as signed_up_recently
    from public.appointments a
    left join public.services s on s.id = a.service_id
    left join public.profiles pr on pr.id = a.customer_id
    where a.status = 'completed'
      and a.appointment_date >= ((timezone('Asia/Riyadh', now()))::date - 14)
      and (p_branch_id is null or a.branch_id = p_branch_id)
    order by a.appointment_date desc, a.appointment_start desc nulls last
    limit 300
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
    where p.role::text = 'customer'
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
    limit 80
  ) x;

  return jsonb_build_object('cuts', v_cuts, 'signups', v_signups);
end;
$$;

revoke all on function public.recent_loyalty_report(uuid) from public;
grant execute on function public.recent_loyalty_report(uuid) to authenticated;

create or replace function public.branch_dashboard_stats(
  p_branch_id uuid,
  p_from date,
  p_to date,
  p_status text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_revenue numeric;
  v_bookings integer;
  v_banned jsonb;
  v_recent jsonb;
  v_role text;
  v_branch uuid;
  v_active boolean;
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED' using errcode = 'P0001';
  end if;

  select p.role::text, p.branch_id, p.is_active
    into v_role, v_branch, v_active
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(v_active, false) and v_role = 'owner' then
    v_allowed := true;
  elsif p_branch_id is null and coalesce(v_active, false) and v_role = 'manager' then
    v_allowed := true;
  elsif p_branch_id is not null
    and coalesce(v_active, false)
    and v_role in ('manager', 'cashier', 'barber')
    and v_branch = p_branch_id then
    v_allowed := true;
  elsif exists (
    select 1
    from public.staff_roles sr
    where sr.user_id = auth.uid()
      and sr.is_active
      and (p_branch_id is null or sr.branch_id = p_branch_id or sr.role::text in ('owner', 'manager'))
  ) then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_from is null or p_to is null or p_to < p_from or (p_to - p_from) > 31 then
    raise exception 'INVALID_RANGE' using errcode = 'P0001';
  end if;

  if p_status is not null and p_status not in (
    'booked', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show'
  ) then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  select
    coalesce(sum(a.total_price) filter (where a.status = 'completed'), 0),
    count(*) filter (where a.status <> 'cancelled')
  into v_revenue, v_bookings
  from public.appointments a
  where a.appointment_date between p_from and p_to
    and (p_branch_id is null or a.branch_id = p_branch_id);

  if to_regclass('public.booking_pardons') is null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object('key', b.key, 'name', b.name, 'phone', b.phone, 'count', b.count)
        order by b.count desc, b.name
      ),
      '[]'::jsonb
    )
    into v_banned
    from (
      select
        coalesce(a.customer_id::text, nullif(a.customer_phone, ''), a.id::text) as key,
        coalesce(max(a.customer_name), 'Guest') as name,
        coalesce(max(nullif(a.customer_phone, '')), '—') as phone,
        count(*)::int as count
      from public.appointments a
      where a.status = 'no_show'
        and (p_branch_id is null or a.branch_id = p_branch_id)
      group by coalesce(a.customer_id::text, nullif(a.customer_phone, ''), a.id::text)
      having count(*) >= 2
    ) b;
  else
    select coalesce(
      jsonb_agg(
        jsonb_build_object('key', b.key, 'name', b.name, 'phone', b.phone, 'count', b.count)
        order by b.count desc, b.name
      ),
      '[]'::jsonb
    )
    into v_banned
    from (
      select
        coalesce(a.customer_id::text, nullif(a.customer_phone, ''), a.id::text) as key,
        coalesce(max(a.customer_name), 'Guest') as name,
        coalesce(max(nullif(a.customer_phone, '')), '—') as phone,
        count(*)::int as count
      from public.appointments a
      where a.status = 'no_show'
        and (p_branch_id is null or a.branch_id = p_branch_id)
        and not exists (
          select 1
          from public.booking_pardons p
          where p.created_at >= a.created_at
            and (
              (p.phone is not null and a.customer_phone is not null and p.phone = a.customer_phone)
              or (p.customer_id is not null and a.customer_id is not null and p.customer_id = a.customer_id)
            )
        )
      group by coalesce(a.customer_id::text, nullif(a.customer_phone, ''), a.id::text)
      having count(*) >= 2
    ) b;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'total_price', r.total_price,
        'appointment_date', r.appointment_date,
        'appointment_time', r.appointment_time,
        'customer_name', r.customer_name,
        'customer_phone', r.customer_phone,
        'barber_id', r.barber_id
      )
      order by r.appointment_start desc nulls last
    ),
    '[]'::jsonb
  )
  into v_recent
  from (
    select
      a.id, a.status, a.total_price, a.appointment_date, a.appointment_time,
      a.appointment_start, a.customer_name, a.customer_phone, a.barber_id
    from public.appointments a
    where (p_branch_id is null or a.branch_id = p_branch_id)
      and (p_status is null or a.status = p_status)
    order by a.appointment_start desc nulls last
    limit 12
  ) r;

  return jsonb_build_object(
    'revenue_7d', v_revenue,
    'week_bookings', v_bookings,
    'banned', v_banned,
    'recent', v_recent
  );
end;
$$;

grant execute on function public.branch_dashboard_stats(uuid, date, date, text) to authenticated;

-- Record the last 14 days now. The SQL editor has no auth.uid(), so this
-- block writes the rows directly instead of calling the staff-only function.
do $$
declare
  v_linked integer := 0;
  v_visits integer := 0;
  v_rewards integer := 0;
begin
  update public.appointments a
    set customer_id = public.match_profile_by_phone(a.customer_phone)
    where a.customer_id is null
      and a.status = 'completed'
      and a.appointment_date >= ((timezone('Asia/Riyadh', now()))::date - 14)
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
      and a.appointment_date >= ((timezone('Asia/Riyadh', now()))::date - 14)
      and public.service_earns_loyalty(a.service_id)
    order by a.customer_id, lp.id, a.appointment_date, a.appointment_start nulls last, a.created_at
  ) picked
  where not exists (
    select 1
    from public.loyalty_transactions lt
    join public.appointments existing on existing.id = lt.appointment_id
    where lt.customer_id = picked.customer_id
      and lt.loyalty_program_id = picked.loyalty_program_id
      and lt.type in ('visit_earned', 'reward_redeemed')
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

  raise notice 'loyalty backfill linked % bookings, added % points, added % rewards', v_linked, v_visits, v_rewards;
end $$;

do $$ begin
  create policy "loyalty_transactions_select_branch_staff" on public.loyalty_transactions
    for select to authenticated
    using (
      public.is_owner()
      or exists (
        select 1
        from public.appointments a
        where a.id = loyalty_transactions.appointment_id
          and public.is_branch_staff(a.branch_id)
      )
    );
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
