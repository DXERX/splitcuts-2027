-- =============================================================================
-- Migration 0023: rewards actually land in public.rewards, and the owner
-- dashboard can read a 7-day snapshot without pulling the appointments table
-- down to the browser.
--
-- What was broken:
--   1. evaluate_loyalty_on_completion() (0022) inserted staff_notifications
--      with a `payload` column that this table does not have. title/message
--      are NOT NULL. The insert threw, the AFTER UPDATE trigger aborted, and
--      Postgres rolled the reward row back together with the visit and the
--      status change to 'completed'. The rewards table stayed empty, and
--      the fifth eligible visit could not be completed.
--   2. Eligibility was two hardcoded service UUIDs, so Hair / Hair + Beard
--      rows created for another branch (or recreated) never earned a visit.
--   3. The owner screen loaded every column of the latest 400 appointments
--      plus every appointment from a UTC date onward, with no end date.
--      "7 day" revenue included the future, the banned list only saw those
--      400 rows, and the date window drifted from the Riyadh business day.
--
-- Safe to re-run: functions are replaced, indexes use IF NOT EXISTS, and the
-- backfill inserts only visits and rewards that are not already recorded.
-- =============================================================================

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

create or replace function public.evaluate_loyalty_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program public.loyalty_programs;
  v_progress integer;
begin
  if new.status <> 'completed'
     or old.status = 'completed'
     or new.customer_id is null then
    return new;
  end if;

  if not public.service_earns_loyalty(new.service_id) then
    return new;
  end if;

  -- One program per visit: the branch program when one is active, otherwise
  -- the shop-wide Split Rewards row. Awarding every matching program was
  -- double-counting a single haircut.
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
    where lt.customer_id = new.customer_id
      and lt.loyalty_program_id = v_program.id
      and lt.type = 'visit_earned'
      and a.appointment_date = new.appointment_date
  ) then
    return new;
  end if;

  insert into public.loyalty_transactions (
    customer_id, loyalty_program_id, appointment_id, type, amount, reason
  ) values (
    new.customer_id, v_program.id, new.id, 'visit_earned', 1,
    'Completed eligible Split Rewards visit'
  );

  select
    coalesce(sum(lt.amount) filter (where lt.type = 'visit_earned'), 0)
    - coalesce(sum(lt.amount) filter (where lt.type = 'visit_removed'), 0)
  into v_progress
  from public.loyalty_transactions lt
  where lt.customer_id = new.customer_id
    and lt.loyalty_program_id = v_program.id;

  if v_progress > 0 and v_program.visits_required > 0
     and v_progress % v_program.visits_required = 0 then
    insert into public.rewards (
      customer_id, loyalty_program_id, branch_id, reward_type, status, metadata
    ) values (
      new.customer_id,
      v_program.id,
      new.branch_id,
      v_program.reward_type,
      'available',
      jsonb_build_object('triggered_by_appointment_id', new.id)
    );

    insert into public.loyalty_transactions (
      customer_id, loyalty_program_id, appointment_id, type, amount, reason
    ) values (
      new.customer_id, v_program.id, new.id, 'reward_earned', 0, 'Free cut unlocked'
    );

    -- A notification failure must not roll back the reward. The previous
    -- function wrote a column this table does not have, and that error
    -- erased the reward insert.
    begin
      insert into public.staff_notifications (
        branch_id, recipient_user_id, appointment_id, type, title, message
      ) values (
        new.branch_id,
        new.customer_id,
        new.id,
        'reward_earned',
        'Reward earned',
        'Free cut unlocked'
      );
    exception
      when others then
        raise warning 'loyalty notification skipped for appointment %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Owner dashboard: one indexed aggregate instead of shipping appointment rows
-- to the browser. security definer so RLS is not re-evaluated per row; the
-- staff check below is what authorizes the read.
-- -----------------------------------------------------------------------------
create or replace function public.branch_dashboard_stats(
  p_branch_id uuid,
  p_from date,
  p_to date,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_revenue numeric;
  v_bookings integer;
  v_banned jsonb;
  v_recent jsonb;
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', b.key,
        'name', b.name,
        'phone', b.phone,
        'count', b.count
      )
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
      a.id,
      a.status,
      a.total_price,
      a.appointment_date,
      a.appointment_time,
      a.appointment_start,
      a.customer_name,
      a.customer_phone,
      a.barber_id
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

create index if not exists appointments_branch_date_status_idx
  on public.appointments (branch_id, appointment_date, status);

create index if not exists appointments_branch_start_idx
  on public.appointments (branch_id, appointment_start desc);

create index if not exists appointments_noshow_customer_idx
  on public.appointments (branch_id, customer_id)
  where status = 'no_show';

create index if not exists loyalty_tx_customer_program_type_idx
  on public.loyalty_transactions (customer_id, loyalty_program_id, type);

create index if not exists rewards_customer_earned_idx
  on public.rewards (customer_id, earned_at desc);

-- Progress for one customer, not a cross join of every profile with every
-- program. security_invoker so the view follows the caller's RLS.
create or replace view public.customer_loyalty_progress as
select
  p.id as customer_id,
  lp.id as loyalty_program_id,
  lp.branch_id,
  lp.name,
  lp.visits_required,
  coalesce(sum(lt.amount) filter (where lt.type = 'visit_earned'), 0)
    - coalesce(sum(lt.amount) filter (where lt.type = 'visit_removed'), 0) as visits_progress
from public.profiles p
join public.loyalty_programs lp
  on lp.is_active
 and (lp.branch_id is null or lp.branch_id = p.branch_id)
left join public.loyalty_transactions lt
  on lt.customer_id = p.id
 and lt.loyalty_program_id = lp.id
where p.role = 'customer'
group by p.id, lp.id, lp.branch_id, lp.name, lp.visits_required;

alter view public.customer_loyalty_progress set (security_invoker = true);

revoke all on table public.customer_loyalty_progress from anon;
grant select on table public.customer_loyalty_progress to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Backfill. Completed Hair / Hair + Beard visits that never received a
-- loyalty row (wrong service id, or the reward insert rolled the visit back)
-- are recorded once per customer, per program, per appointment date. A reward
-- row is then inserted for every visits_required boundary that is still missing.
-- -----------------------------------------------------------------------------
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
    a.id as appointment_id,
    a.appointment_date
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
    and existing.appointment_date = picked.appointment_date
);

insert into public.rewards (
  customer_id, loyalty_program_id, branch_id, reward_type, status, metadata
)
select
  owed.customer_id,
  owed.loyalty_program_id,
  owed.branch_id,
  owed.reward_type,
  'available',
  jsonb_build_object(
    'triggered_by_appointment_id', owed.appointment_id,
    'backfill', true
  )
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
