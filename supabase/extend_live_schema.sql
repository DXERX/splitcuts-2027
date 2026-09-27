-- =============================================================================
-- Split Cuts — ADDITIVE migration for the LIVE "splitcuts" project.
-- Paste this whole file into the Supabase SQL Editor and run it once.
--
-- What this does NOT do: it never drops, renames, or rewrites your existing
-- appointments / barbers / services / bookings / booking_analytics /
-- google_reviews / notifications / site_settings tables or any of their 154+
-- real rows. It only ADDS columns, tables, RLS policies, triggers and two
-- RPCs on top.
--
-- What this DOES do:
--   - Adds branches (seeds one row for your current shop), profiles (auth-
--     linked accounts), customers, staff_roles -- the account model for
--     customer login (phone OTP / email) and owner/manager/cashier staff.
--   - Extends appointments with branch_id, customer_id (nullable -- old
--     guest bookings stay guest bookings), and real appointment_start/
--     appointment_end timestamptz columns kept in sync by trigger. Your
--     appointment_time column is stored as plain text (e.g. '21:30', no
--     seconds) rather than a native time value, so every place that combines
--     it with the date casts it explicitly (::time) first.
--   - Adds a status CHECK constraint covering your 4 real status values
--     (booked/completed/cancelled/no_show) plus checked_in/in_service for
--     the new shop-mode workflow.
--   - Adds double-booking protection GOING FORWARD ONLY (a GiST exclusion
--     constraint scoped to appointment_start >= 2026-09-27). Your historical
--     data has 5 pairs of already-overlapping appointments from before this
--     protection existed -- those are left exactly as they are.
--   - Adds booking_events (timeline), loyalty_programs/loyalty_transactions/
--     rewards (an automatic loyalty engine that fires when an appointment is
--     marked completed, only for logged-in customers), shop_devices/
--     device_sessions + staff_notifications (the Shop Mode realtime feed --
--     named staff_notifications, not "notifications", since that name is
--     already your site-banners table), and audit_logs.
--   - Enables Row Level Security on your EXISTING barbers/services/
--     appointments/google_reviews/notifications/site_settings tables (today
--     they have none, so the anon key can currently read AND write them) --
--     public read of active content is preserved, writes are restricted to
--     staff. appointments RLS: customers see only their own bookings, staff
--     see everything for their branch.
--   - Adds create_appointment() / update_appointment_status() -- the only
--     supported write paths for new bookings and status changes, race-safe
--     via an advisory lock, aware of your real overnight business hours
--     and the booking_lockdown toggle you already have.
--   - Updates site_settings.business_hours from 16:30-04:00 to your new
--     hours, 14:00-02:00 (2pm-2am) -- still an overnight window, so the
--     same open>close comparison in create_appointment() applies unchanged.
--
-- SAFE TO RE-RUN: Supabase's SQL editor commits each statement as it executes
-- rather than the whole paste as one transaction, so if anything ever fails
-- partway through, whatever ran before the failure stays applied. Every
-- statement here that isn't naturally re-runnable (types, columns,
-- constraints, triggers, policies) is guarded so pasting this whole file
-- again -- for any reason -- finishes the job instead of erroring on
-- "already exists". This was verified by applying the corrected file twice
-- in a row against a real-data replica with no errors either time.
--
-- Every piece of this was tested against a byte-for-byte replica of your
-- actual 154 appointments + all other real rows before being written here --
-- see the assistant's message for what was checked (overlap detection,
-- overnight-hours math including the new 2pm-2am window, RLS isolation, a
-- genuine two-connection concurrency race, and the full booking lifecycle
-- including the loyalty reward).
-- =============================================================================


-- =============================================================================
-- 0001_live_extend_foundation.sql
-- =============================================================================
-- =============================================================================
-- PART A: extensions, roles, branches, accounts
--
-- Everything in this file is written to be safely re-runnable: if a previous
-- paste got partway through before failing on something later in the script
-- (Supabase's SQL editor commits each statement as it goes, it does not roll
-- back earlier statements when a later one errors), running this file again
-- must not blow up on "already exists" -- it should just finish the job.
-- =============================================================================
create extension if not exists "uuid-ossp";

do $$ begin
  create type public.app_role as enum ('owner', 'manager', 'cashier', 'customer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reward_status as enum ('available', 'reserved', 'redeemed', 'expired', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.staff_notification_type as enum ('new_booking', 'booking_cancelled', 'booking_rescheduled', 'customer_checked_in', 'booking_starting_soon', 'reward_earned');
exception when duplicate_object then null;
end $$;

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address text,
  city text,
  timezone text not null default 'Asia/Riyadh',
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.branches (id, name, slug, city, timezone, is_active)
values ('00000000-0000-0000-0000-000000000001', 'Split Cuts', 'main', 'Jeddah', 'Asia/Riyadh', true)
on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text unique,
  role public.app_role not null default 'customer',
  branch_id uuid references public.branches (id) on delete set null,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', null), new.phone, 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create table if not exists public.customers (
  id uuid primary key references public.profiles (id) on delete cascade,
  notes text,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  role public.app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, branch_id, role)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  table_name text,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 0002_live_extend_appointments.sql
-- =============================================================================
-- =============================================================================
-- PART B: extend barbers / services / appointments in place
-- =============================================================================

alter table public.barbers add column if not exists branch_id uuid references public.branches (id);
update public.barbers set branch_id = '00000000-0000-0000-0000-000000000001' where branch_id is null;
alter table public.barbers alter column branch_id set not null;
alter table public.barbers alter column branch_id set default '00000000-0000-0000-0000-000000000001';

alter table public.services add column if not exists branch_id uuid references public.branches (id);
update public.services set branch_id = '00000000-0000-0000-0000-000000000001' where branch_id is null;
alter table public.services alter column branch_id set not null;
alter table public.services alter column branch_id set default '00000000-0000-0000-0000-000000000001';

-- appointments: add branch scoping, an optional link to a logged-in customer
-- account (existing rows stay null -- they were guest bookings and remain
-- readable by staff only), and real timestamptz start/end columns computed
-- from appointment_date + appointment_time + the service's duration. Existing
-- date/time/status/notes/total_price columns are untouched.
alter table public.appointments add column if not exists branch_id uuid references public.branches (id);
alter table public.appointments add column if not exists customer_id uuid references public.profiles (id) on delete set null;
alter table public.appointments add column if not exists appointment_start timestamptz;
alter table public.appointments add column if not exists appointment_end timestamptz;

-- Branch timezone is Asia/Riyadh (see the branches insert above) -- historical
-- appointment_date/appointment_time are that branch's local wall-clock time,
-- same as new bookings, so the backfill must go through the same "at time
-- zone" conversion the RPC and trigger use (a plain ::timestamptz cast would
-- silently assume the session/server timezone and be off by the UTC offset).
-- appointment_time is stored as plain text (e.g. '21:30', no seconds), not a
-- native time column, so it must be cast explicitly before it can be added
-- to a date. Safe to re-run: it always recomputes the same values.
update public.appointments a
  set branch_id = '00000000-0000-0000-0000-000000000001',
      appointment_start = (a.appointment_date + a.appointment_time::time)::timestamp at time zone 'Asia/Riyadh',
      appointment_end = ((a.appointment_date + a.appointment_time::time)::timestamp at time zone 'Asia/Riyadh') + make_interval(mins => s.duration)
  from public.services s
  where s.id = a.service_id;

alter table public.appointments alter column branch_id set not null;
alter table public.appointments alter column branch_id set default '00000000-0000-0000-0000-000000000001';

-- Known live status values today: booked, completed, cancelled, no_show.
-- checked_in / in_service are added for the new shop-mode workflow.
do $$ begin
  alter table public.appointments
    add constraint appointments_status_check
    check (status in ('booked', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show'));
exception when duplicate_object then null;
end $$;

-- Keep appointment_start/appointment_end correct regardless of write path
-- (new RPC, admin dashboard, or a manual edit).
create or replace function public.sync_appointment_range()
returns trigger
language plpgsql
as $$
declare
  v_duration int;
  v_timezone text;
begin
  select s.duration, coalesce(br.timezone, 'Asia/Riyadh')
    into v_duration, v_timezone
  from public.services s
  join public.barbers b on b.id = new.barber_id
  join public.branches br on br.id = b.branch_id
  where s.id = new.service_id;

  -- appointment_date/appointment_time are the branch's LOCAL wall-clock time
  -- (what the customer picked), so they must go through the branch's own
  -- timezone here too -- casting straight to timestamptz would silently use
  -- the session/server timezone instead and store the wrong UTC instant.
  -- appointment_time is text (e.g. '21:30'), so it needs an explicit ::time
  -- cast before it can be added to the date.
  new.appointment_start := (new.appointment_date + new.appointment_time::time)::timestamp at time zone coalesce(v_timezone, 'Asia/Riyadh');
  new.appointment_end := new.appointment_start + make_interval(mins => coalesce(v_duration, 30));
  return new;
end;
$$;

drop trigger if exists sync_appointment_range on public.appointments;
create trigger sync_appointment_range
  before insert or update of appointment_date, appointment_time, service_id on public.appointments
  for each row execute function public.sync_appointment_range();

-- Double-booking protection GOING FORWARD only. All 154 existing rows predate
-- this migration (Jan-Feb 2026) and five pairs of them genuinely overlap
-- (the old app had no protection) -- an unconditional constraint would fail
-- to even install. The WHERE clause exempts anything before this migration's
-- cutover so history is untouched, while every new booking from here on is
-- fully protected by the same guarantee as before: the constraint is checked
-- at the database level, not just in application code.
do $$ begin
  alter table public.appointments
    add constraint appointments_no_overlap_per_barber
    exclude using gist (
      barber_id with =,
      tstzrange(appointment_start, appointment_end, '[)') with &&
    )
    where (status not in ('cancelled', 'no_show') and appointment_start >= '2026-09-27 00:00:00+00'::timestamptz);
exception when duplicate_object or duplicate_table then null;
end $$;

-- =============================================================================
-- 0003_live_extend_events_loyalty_shopmode.sql
-- =============================================================================
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

-- =============================================================================
-- 0004_live_extend_rls.sql
-- =============================================================================
-- =============================================================================
-- PART D: RLS helper functions + policies (new tables AND retrofitted onto
-- the existing barbers/services/appointments/google_reviews/notifications/
-- site_settings tables, which currently have none -- anyone with the
-- anon key can read AND write them today).
--
-- Every "create policy" below is wrapped in a do-block that swallows
-- "already exists" so this file can be re-run safely.
-- =============================================================================

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner' and is_active);
$$;

create or replace function public.is_branch_staff(branch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.branch_id = branch and p.role in ('owner','manager','cashier')
  ) or exists (
    select 1 from public.staff_roles sr where sr.user_id = auth.uid() and sr.is_active and sr.branch_id = branch
  );
$$;

create or replace function public.is_branch_manager(branch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.branch_id = branch and p.role in ('owner','manager')
  ) or exists (
    select 1 from public.staff_roles sr where sr.user_id = auth.uid() and sr.is_active and sr.branch_id = branch and sr.role in ('owner','manager')
  );
$$;

-- ---------------------------------------------------------------------------
-- Existing tables: enable RLS + add policies matching how they're actually
-- used (public site read of active content, staff-only writes). This CLOSES
-- what is currently open write access via the anon key.
-- ---------------------------------------------------------------------------
alter table public.barbers enable row level security;
do $$ begin create policy "barbers_select_public" on public.barbers for select using (is_active or public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "barbers_write_manager" on public.barbers for all to authenticated using (public.is_branch_manager(branch_id)) with check (public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;

alter table public.services enable row level security;
do $$ begin create policy "services_select_public" on public.services for select using (is_active or public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "services_write_manager" on public.services for all to authenticated using (public.is_branch_manager(branch_id)) with check (public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;

alter table public.google_reviews enable row level security;
do $$ begin create policy "google_reviews_select_public" on public.google_reviews for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "google_reviews_write_owner" on public.google_reviews for all to authenticated using (public.is_owner()) with check (public.is_owner()); exception when duplicate_object then null; end $$;

alter table public.notifications enable row level security;
do $$ begin create policy "notifications_select_public" on public.notifications for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "notifications_write_owner" on public.notifications for all to authenticated using (public.is_owner()) with check (public.is_owner()); exception when duplicate_object then null; end $$;

alter table public.site_settings enable row level security;
do $$ begin create policy "site_settings_select_public" on public.site_settings for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "site_settings_write_owner" on public.site_settings for all to authenticated using (public.is_owner()) with check (public.is_owner()); exception when duplicate_object then null; end $$;

-- appointments: customers see/manage their own (logged-in) bookings, staff
-- see their branch's bookings including historical guest rows (customer_id
-- is null on all pre-migration rows -- staff still needs to see those).
alter table public.appointments enable row level security;
do $$ begin create policy "appointments_select_own" on public.appointments for select to authenticated using (customer_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "appointments_select_branch_staff" on public.appointments for select to authenticated using (public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "appointments_insert_own" on public.appointments for insert to authenticated with check (customer_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "appointments_insert_staff" on public.appointments for insert to authenticated with check (public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "appointments_update_own" on public.appointments for update to authenticated using (customer_id = auth.uid()) with check (customer_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "appointments_update_branch_staff" on public.appointments for update to authenticated using (public.is_branch_staff(branch_id)) with check (public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------
alter table public.branches enable row level security;
do $$ begin create policy "branches_select_all" on public.branches for select to authenticated using (is_active or public.is_owner()); exception when duplicate_object then null; end $$;
do $$ begin create policy "branches_write_owner" on public.branches for all to authenticated using (public.is_owner()) with check (public.is_owner()); exception when duplicate_object then null; end $$;

alter table public.profiles enable row level security;
do $$ begin create policy "profiles_select_self" on public.profiles for select to authenticated using (id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "profiles_select_branch_staff" on public.profiles for select to authenticated using (branch_id is not null and public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "profiles_update_self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid()); exception when duplicate_object then null; end $$;

alter table public.customers enable row level security;
do $$ begin create policy "customers_select_self" on public.customers for select to authenticated using (id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "customers_insert_self" on public.customers for insert to authenticated with check (id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "customers_update_self" on public.customers for update to authenticated using (id = auth.uid()) with check (id = auth.uid()); exception when duplicate_object then null; end $$;

alter table public.staff_roles enable row level security;
do $$ begin create policy "staff_roles_select_self" on public.staff_roles for select to authenticated using (user_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "staff_roles_select_manager" on public.staff_roles for select to authenticated using (public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "staff_roles_write_manager" on public.staff_roles for all to authenticated using (public.is_branch_manager(branch_id)) with check (public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;

alter table public.booking_events enable row level security;
do $$ begin
  create policy "booking_events_select_own" on public.booking_events for select to authenticated using (
    exists (select 1 from public.appointments a where a.id = booking_events.appointment_id and a.customer_id = auth.uid())
  );
exception when duplicate_object then null;
end $$;
do $$ begin create policy "booking_events_select_branch_staff" on public.booking_events for select to authenticated using (public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;

alter table public.loyalty_programs enable row level security;
do $$ begin create policy "loyalty_programs_select_public" on public.loyalty_programs for select using (is_active or branch_id is null or public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "loyalty_programs_write_manager" on public.loyalty_programs for all to authenticated using (branch_id is null and public.is_owner() or branch_id is not null and public.is_branch_manager(branch_id)) with check (branch_id is null and public.is_owner() or branch_id is not null and public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;

alter table public.loyalty_transactions enable row level security;
do $$ begin create policy "loyalty_transactions_select_own" on public.loyalty_transactions for select to authenticated using (customer_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "loyalty_transactions_select_staff" on public.loyalty_transactions for select to authenticated using (public.is_owner()); exception when duplicate_object then null; end $$;

alter table public.rewards enable row level security;
do $$ begin create policy "rewards_select_own" on public.rewards for select to authenticated using (customer_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "rewards_select_branch_staff" on public.rewards for select to authenticated using (branch_id is not null and public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "rewards_update_branch_staff" on public.rewards for update to authenticated using (branch_id is not null and public.is_branch_staff(branch_id)) with check (branch_id is not null and public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;

alter table public.shop_devices enable row level security;
do $$ begin create policy "shop_devices_select_staff" on public.shop_devices for select to authenticated using (public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "shop_devices_write_manager" on public.shop_devices for all to authenticated using (public.is_branch_manager(branch_id)) with check (public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;

alter table public.device_sessions enable row level security;
do $$ begin
  create policy "device_sessions_select_staff" on public.device_sessions for select to authenticated using (
    exists (select 1 from public.shop_devices d where d.id = device_sessions.shop_device_id and public.is_branch_staff(d.branch_id))
  );
exception when duplicate_object then null;
end $$;
do $$ begin create policy "device_sessions_insert_self" on public.device_sessions for insert to authenticated with check (user_id = auth.uid()); exception when duplicate_object then null; end $$;

alter table public.staff_notifications enable row level security;
do $$ begin create policy "staff_notifications_select_recipient" on public.staff_notifications for select to authenticated using (recipient_user_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "staff_notifications_select_branch_staff" on public.staff_notifications for select to authenticated using (public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "staff_notifications_update_recipient" on public.staff_notifications for update to authenticated using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid()); exception when duplicate_object then null; end $$;

alter table public.audit_logs enable row level security;
do $$ begin create policy "audit_logs_select_manager" on public.audit_logs for select to authenticated using (branch_id is not null and public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "audit_logs_select_owner" on public.audit_logs for select to authenticated using (public.is_owner()); exception when duplicate_object then null; end $$;

-- =============================================================================
-- 0005_live_extend_rpcs.sql
-- =============================================================================
-- =============================================================================
-- PART E: booking RPCs, adapted for appointments (overnight hours aware)
-- =============================================================================

create table if not exists public.appointment_status_transitions (
  from_status text not null,
  to_status text not null,
  primary key (from_status, to_status)
);

insert into public.appointment_status_transitions (from_status, to_status) values
  ('booked', 'checked_in'),
  ('booked', 'cancelled'),
  ('booked', 'no_show'),
  ('checked_in', 'in_service'),
  ('checked_in', 'cancelled'),
  ('in_service', 'completed'),
  ('in_service', 'cancelled')
on conflict (from_status, to_status) do nothing;

alter table public.appointment_status_transitions enable row level security;
do $$ begin
  create policy "appointment_status_transitions_select_all" on public.appointment_status_transitions for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

create or replace function public.create_appointment(
  p_customer_id uuid,
  p_barber_id uuid,
  p_service_id uuid,
  p_appointment_date date,
  p_appointment_time time,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_notes text default null
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

  select * into v_branch from public.branches where id = v_barber.branch_id;

  -- p_appointment_date/p_appointment_time are the branch's LOCAL wall-clock
  -- time (what the customer picked on the booking form), not UTC -- so they
  -- must be interpreted via the branch's own timezone, not the session's.
  v_starts_at := (p_appointment_date + p_appointment_time)::timestamp at time zone coalesce(v_branch.timezone, 'Asia/Riyadh');
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
  -- OVERNIGHT shift (e.g. 16:30 -> 04:00), so "open" means local time is at
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

  if exists (
    select 1 from public.appointments existing
    where existing.barber_id = p_barber_id
      and existing.status not in ('cancelled', 'no_show')
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
    appointment_date, appointment_time, status, notes, total_price
  ) values (
    v_barber.branch_id, p_barber_id, p_service_id, p_customer_id,
    coalesce(p_customer_name, (select full_name from public.profiles where id = p_customer_id)),
    p_customer_phone, p_customer_email,
    p_appointment_date, to_char(p_appointment_time, 'HH24:MI'), 'booked', p_notes, v_service.price
  )
  returning * into v_appt;

  return v_appt;
exception
  when exclusion_violation then
    raise exception 'SLOT_ALREADY_BOOKED' using errcode = 'P0001';
end;
$$;

grant execute on function public.create_appointment(uuid, uuid, uuid, date, time, text, text, text, text) to authenticated;

create or replace function public.update_appointment_status(
  p_appointment_id uuid,
  p_new_status text,
  p_reason text default null
)
returns public.appointments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_appt public.appointments;
begin
  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_appt.status = p_new_status then
    return v_appt;
  end if;

  if not exists (
    select 1 from public.appointment_status_transitions t
    where t.from_status = v_appt.status and t.to_status = p_new_status
  ) then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;

  update public.appointments
    set status = p_new_status,
        notes = case when p_new_status = 'cancelled' and p_reason is not null
                      then coalesce(notes || E'\n', '') || 'Cancelled: ' || p_reason
                      else notes end
    where id = p_appointment_id
    returning * into v_appt;

  return v_appt;
end;
$$;

grant execute on function public.update_appointment_status(uuid, text, text) to authenticated;

-- Working hours: 2pm-2am local time (was 16:30-04:00). Still an overnight
-- window (open > close), so the existing overnight-aware comparison in
-- create_appointment() above keeps working unchanged.
update public.site_settings
  set value = value || jsonb_build_object('default_start', '14:00', 'default_end', '02:00')
  where key = 'business_hours';

-- =============================================================================
-- 0006_live_extend_realtime.sql
-- =============================================================================
-- =============================================================================
-- PART F: Realtime (Shop Mode needs INSERT/UPDATE on appointments + the new
-- staff_notifications feed). ALTER PUBLICATION ... ADD TABLE has no IF NOT
-- EXISTS clause, so this guards manually against a table already being
-- published (we don't control what's already in supabase_realtime here).
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['appointments', 'booking_events', 'staff_notifications', 'rewards']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
