-- 0003_bookings.sql
-- Bookings, the double-booking exclusion constraint, and the booking_events
-- audit/timeline table.

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  barber_id uuid not null references public.barbers (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  status public.booking_status not null default 'pending',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Redundant range column, kept in sync by trigger, purely so the exclusion
  -- constraint below can index it with a gist operator class.
  during tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  price_at_booking numeric(10, 2) not null,
  notes text,
  cancelled_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_valid_range check (starts_at < ends_at)
);

comment on table public.bookings is 'Authoritative booking record. Rows are only ever written through public.create_booking / public.update_booking_status so validation and events stay consistent.';

-- ---------------------------------------------------------------------------
-- DOUBLE-BOOKING PROTECTION (database-level, not just app-level)
-- ---------------------------------------------------------------------------
-- A GiST exclusion constraint guarantees, at the database level, that the
-- same barber can never hold two overlapping bookings that are still "live"
-- (not cancelled and not a no_show). This holds even under concurrent
-- transactions -- Postgres takes the necessary locks itself.
alter table public.bookings
  add constraint bookings_no_overlap_per_barber
  exclude using gist (
    barber_id with =,
    during with &&
  )
  where (status not in ('cancelled', 'no_show'));

-- ---------------------------------------------------------------------------
-- BOOKING EVENTS (timeline / audit history)
-- ---------------------------------------------------------------------------
create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  event_type public.booking_event_type not null,
  performed_by uuid references public.profiles (id) on delete set null,
  old_status public.booking_status,
  new_status public.booking_status,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.booking_events is 'Append-only timeline for a booking. Populated by triggers on public.bookings, never written directly by clients.';
