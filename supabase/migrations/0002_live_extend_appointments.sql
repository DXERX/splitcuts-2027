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
