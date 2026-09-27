-- =============================================================================
-- Migration 0013:
--   A) Rewards bumped to "5 cuts, 6th free" -- upserts the one branch-wide
--      loyalty program row instead of assuming it already exists, so this is
--      safe whether or not one was ever seeded.
--   B) University Student Package: a real, trackable monthly bundle (4x
--      "Hair + Beard" cuts for 149 SAR). Sold in person -- a customer
--      requests it online, a cashier activates it once paid in cash at the
--      shop (exactly like a physical punch-card), and it's redeemable at
--      booking time so the 4 uses and 30-day window are actually enforced
--      server-side, not just an honor-system marketing line.
--
-- Fully additive: two new tables, one nullable column on appointments, and
-- create_appointment() gains one new optional trailing parameter that
-- defaults to null -- every existing call site keeps working unchanged.
-- =============================================================================

-- --- A) Rewards: 5 cuts, 6th free -------------------------------------------
do $$
declare
  v_id uuid;
begin
  select id into v_id from public.loyalty_programs where is_active and branch_id is null limit 1;
  if v_id is not null then
    update public.loyalty_programs set visits_required = 5, updated_at = now() where id = v_id;
  else
    insert into public.loyalty_programs (branch_id, name, description, visits_required, reward_type, is_active)
    values (null, 'Split Rewards', '5 cuts, 6th free', 5, 'free_service', true);
  end if;
end $$;

-- --- B) Student package -------------------------------------------------------
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  code text not null,
  name_en text not null,
  name_ar text,
  price numeric(10, 2) not null,
  session_count int not null check (session_count > 0),
  service_id uuid not null references public.services (id) on delete restrict,
  validity_days int not null default 30 check (validity_days > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, code)
);

create table if not exists public.customer_packages (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'active', 'expired', 'cancelled')),
  sessions_total int not null,
  sessions_used int not null default 0,
  requested_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz,
  activated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_packages_customer_idx on public.customer_packages (customer_id);

-- public.set_updated_at() already exists (migration 0009).
drop trigger if exists customer_packages_set_updated_at on public.customer_packages;
create trigger customer_packages_set_updated_at
  before update on public.customer_packages
  for each row execute function public.set_updated_at();

-- Appointments: which package redemption (if any) paid for this visit.
alter table public.appointments
  add column if not exists customer_package_id uuid references public.customer_packages (id) on delete set null;

-- Seed one "University Student Package" per active branch, pointing at that
-- branch's own "Hair + Beard" (CUTS, 60 SAR) service -- same NOT EXISTS-style
-- guard as migration 0012, safe to re-run. No-ops for a branch that doesn't
-- have that exact service (e.g. not yet catalogued) rather than erroring.
do $$
declare
  v_branch record;
  v_service_id uuid;
begin
  for v_branch in select id from public.branches where is_active loop
    select id into v_service_id from public.services
      where branch_id = v_branch.id and is_active
        and category = 'CUTS' and name_en = 'Hair + Beard'
      limit 1;

    if v_service_id is not null and not exists (
      select 1 from public.packages where branch_id = v_branch.id and code = 'STUDENT_MONTHLY'
    ) then
      insert into public.packages (branch_id, code, name_en, name_ar, price, session_count, service_id, validity_days)
      values (v_branch.id, 'STUDENT_MONTHLY', 'University Student Package', 'باقة طلاب الجامعة', 149, 4, v_service_id, 30);
    end if;
  end loop;
end $$;

-- RLS -------------------------------------------------------------------------
alter table public.packages enable row level security;
do $$ begin create policy "packages_select_public" on public.packages for select using (is_active or public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "packages_write_manager" on public.packages for all to authenticated using (public.is_branch_manager(branch_id)) with check (public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;

alter table public.customer_packages enable row level security;
do $$ begin create policy "customer_packages_select_own" on public.customer_packages for select to authenticated using (customer_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin
  create policy "customer_packages_select_branch_staff" on public.customer_packages for select to authenticated using (
    exists (select 1 from public.packages pk where pk.id = customer_packages.package_id and public.is_branch_staff(pk.branch_id))
  );
exception when duplicate_object then null; end $$;
do $$ begin create policy "customer_packages_insert_own" on public.customer_packages for insert to authenticated with check (customer_id = auth.uid()); exception when duplicate_object then null; end $$;
-- Two separate update policies (permissive -- Postgres ORs them together):
-- the owning customer can update their own row (needed so create_appointment,
-- which runs as that customer, can increment sessions_used on redemption),
-- and branch staff can update any row tied to their branch's packages (needed
-- to activate a pending request after taking payment).
do $$ begin create policy "customer_packages_update_own" on public.customer_packages for update to authenticated using (customer_id = auth.uid()) with check (customer_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin
  create policy "customer_packages_update_branch_staff" on public.customer_packages for update to authenticated using (
    exists (select 1 from public.packages pk where pk.id = customer_packages.package_id and public.is_branch_staff(pk.branch_id))
  ) with check (
    exists (select 1 from public.packages pk where pk.id = customer_packages.package_id and public.is_branch_staff(pk.branch_id))
  );
exception when duplicate_object then null; end $$;

-- RPCs --------------------------------------------------------------------------
create or replace function public.request_package(p_package_id uuid)
returns public.customer_packages
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_package public.packages;
  v_row public.customer_packages;
begin
  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_package from public.packages where id = p_package_id and is_active;
  if not found then
    raise exception 'PACKAGE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- One pending-or-active request per package per customer at a time -- stops
  -- someone stacking duplicate pending requests.
  if exists (
    select 1 from public.customer_packages
    where customer_id = auth.uid() and package_id = p_package_id and status in ('pending_payment', 'active')
  ) then
    raise exception 'PACKAGE_ALREADY_REQUESTED' using errcode = 'P0001';
  end if;

  insert into public.customer_packages (package_id, customer_id, status, sessions_total)
  values (p_package_id, auth.uid(), 'pending_payment', v_package.session_count)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.request_package(uuid) to authenticated;

create or replace function public.activate_customer_package(p_customer_package_id uuid)
returns public.customer_packages
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.customer_packages;
  v_package public.packages;
begin
  select * into v_row from public.customer_packages where id = p_customer_package_id;
  if not found then
    raise exception 'PACKAGE_REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_package from public.packages where id = v_row.package_id;

  if not public.is_branch_staff(v_package.branch_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if v_row.status <> 'pending_payment' then
    raise exception 'PACKAGE_NOT_PENDING' using errcode = 'P0001';
  end if;

  update public.customer_packages
    set status = 'active',
        activated_at = now(),
        expires_at = now() + make_interval(days => v_package.validity_days),
        activated_by = auth.uid()
    where id = p_customer_package_id
    returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.activate_customer_package(uuid) to authenticated;

-- create_appointment(): adds one optional trailing parameter,
-- p_customer_package_id. Everything above the two new blocks (marked below)
-- is byte-for-byte identical to migration 0011's version.
--
-- IMPORTANT: Postgres identifies a function by its parameter TYPES, not by
-- name or defaults -- a 10-arg signature is a distinct overload from the old
-- 9-arg one, not a replacement of it. Left alone, both would exist side by
-- side and PostgREST's named-argument RPC calls (every existing call site
-- passes exactly the original 9 names) would then match BOTH overloads and
-- fail with "could not choose the best candidate function". Drop the old
-- signature first so there's exactly one create_appointment again.
drop function if exists public.create_appointment(uuid, uuid, uuid, date, time, text, text, text, text);

create or replace function public.create_appointment(
  p_customer_id uuid,
  p_barber_id uuid,
  p_service_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_notes text default null,
  p_customer_package_id uuid default null
)
returns public.appointments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_barber public.barbers;
  v_service public.services;
  v_branch public.branches;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_local_time time;
  v_hours jsonb;
  v_open time;
  v_close time;
  v_lockdown jsonb;
  v_no_show_count int;
  v_package public.customer_packages;
  v_price numeric(10, 2);
  v_appt public.appointments;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_barber_id::text, 42));

  select * into v_barber from public.barbers where id = p_barber_id and is_active;
  if not found then
    raise exception 'BARBER_NOT_BOOKABLE' using errcode = 'P0001';
  end if;

  select * into v_service from public.services where id = p_service_id and branch_id = v_barber.branch_id and is_active;
  if not found then
    raise exception 'SERVICE_NOT_AVAILABLE_AT_BRANCH' using errcode = 'P0001';
  end if;

  -- Two strikes and you can't book again -- checked before anything else
  -- customer-specific. p_customer_id is null for a guest, so that half of
  -- the OR is skipped for them and only the phone match applies.
  if p_customer_id is not null or p_customer_phone is not null then
    select count(*) into v_no_show_count
    from public.appointments existing
    where existing.status = 'no_show'
      and (
        (p_customer_id is not null and existing.customer_id = p_customer_id)
        or (p_customer_phone is not null and existing.customer_phone = p_customer_phone)
      );

    if v_no_show_count >= 2 then
      raise exception 'CUSTOMER_BLOCKED_NO_SHOW' using errcode = 'P0001';
    end if;
  end if;

  -- --- NEW: package redemption validation ---------------------------------
  v_price := v_service.price;
  if p_customer_package_id is not null then
    select * into v_package from public.customer_packages
      where id = p_customer_package_id and customer_id = p_customer_id and status = 'active';
    if not found then
      raise exception 'PACKAGE_NOT_REDEEMABLE' using errcode = 'P0001';
    end if;
    if v_package.expires_at is not null and v_package.expires_at < now() then
      raise exception 'PACKAGE_EXPIRED' using errcode = 'P0001';
    end if;
    if v_package.sessions_used >= v_package.sessions_total then
      raise exception 'PACKAGE_SESSIONS_USED_UP' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.packages pk where pk.id = v_package.package_id and pk.service_id = p_service_id
    ) then
      raise exception 'PACKAGE_SERVICE_MISMATCH' using errcode = 'P0001';
    end if;
    v_price := 0;
  end if;
  -- -------------------------------------------------------------------------

  select * into v_branch from public.branches where id = v_barber.branch_id;

  -- See resolve_appointment_start() -- rolls a pre-opening time (like
  -- "01:30") onto the following calendar date, since that's genuinely later
  -- that same overnight business day, not earlier that same afternoon. Using
  -- the shared helper here keeps this pre-insert check consistent with what
  -- sync_appointment_range will actually store.
  v_starts_at := public.resolve_appointment_start(p_appointment_date, p_appointment_time, v_branch.timezone);
  if v_starts_at <= now() then
    raise exception 'START_TIME_IN_PAST' using errcode = 'P0001';
  end if;

  v_ends_at := v_starts_at + make_interval(mins => v_service.duration);

  -- Shop-wide lockdown toggle (already live in site_settings, used by the
  -- old site for a "closed today" banner) blocks new bookings outright.
  select value into v_lockdown from public.site_settings where key = 'booking_lockdown';
  if v_lockdown is not null and (v_lockdown ->> 'enabled')::boolean is true then
    raise exception 'BOOKING_LOCKED: %', coalesce(v_lockdown ->> 'message', 'Booking is temporarily closed') using errcode = 'P0001';
  end if;

  -- Business hours (also already live in site_settings). This shop runs an
  -- OVERNIGHT shift (e.g. 14:00 -> 02:00), so "open" means local time is at
  -- or after the opening time OR before the closing time, not a simple range.
  select value into v_hours from public.site_settings where key = 'business_hours';
  if v_hours is not null then
    v_open := (v_hours ->> 'default_start')::time;
    v_close := (v_hours ->> 'default_end')::time;
    v_local_time := (v_starts_at at time zone coalesce(v_branch.timezone, 'Asia/Riyadh'))::time;

    if v_open is not null and v_close is not null then
      if v_open > v_close then
        -- overnight window
        if not (v_local_time >= v_open or v_local_time < v_close) then
          raise exception 'OUTSIDE_BUSINESS_HOURS' using errcode = 'P0001';
        end if;
      else
        if not (v_local_time >= v_open and v_local_time < v_close) then
          raise exception 'OUTSIDE_BUSINESS_HOURS' using errcode = 'P0001';
        end if;
      end if;
    end if;
  end if;

  -- Defensive null-range guard -- see 0008's header comment. Without this, a
  -- row with a null appointment_start/appointment_end reads as an unbounded
  -- (all-of-time) range and blocks every slot for that barber forever.
  if exists (
    select 1 from public.appointments existing
    where existing.barber_id = p_barber_id
      and existing.status not in ('cancelled', 'no_show')
      and existing.appointment_start is not null
      and existing.appointment_end is not null
      and tstzrange(existing.appointment_start, existing.appointment_end, '[)') && tstzrange(v_starts_at, v_ends_at, '[)')
  ) then
    raise exception 'SLOT_ALREADY_BOOKED' using errcode = 'P0001';
  end if;

  -- appointment_time is a text column (existing rows are stored as 'HH24:MI',
  -- e.g. '21:30', no seconds) rather than a native time column, so the time
  -- parameter is formatted to match on the way in.
  insert into public.appointments (
    branch_id, barber_id, service_id, customer_id,
    customer_name, customer_phone, customer_email,
    appointment_date, appointment_time, status, notes, total_price, customer_package_id
  ) values (
    v_barber.branch_id, p_barber_id, p_service_id, p_customer_id,
    coalesce(p_customer_name, (select full_name from public.profiles where id = p_customer_id)),
    p_customer_phone, p_customer_email,
    p_appointment_date, to_char(p_appointment_time, 'HH24:MI'), 'booked', p_notes, v_price, p_customer_package_id
  )
  returning * into v_appt;

  -- --- NEW: mark the session as spent (retire the package once used up) ---
  if p_customer_package_id is not null then
    update public.customer_packages
      set sessions_used = sessions_used + 1,
          status = case when sessions_used + 1 >= sessions_total then 'expired' else status end
      where id = p_customer_package_id;
  end if;
  -- -------------------------------------------------------------------------

  return v_appt;
exception
  when exclusion_violation then
    raise exception 'SLOT_ALREADY_BOOKED' using errcode = 'P0001';
end;
$$;

grant execute on function public.create_appointment(uuid, uuid, uuid, date, time, text, text, text, text, uuid) to authenticated;
