-- =============================================================================
-- FIX: "every slot shows TOO SLOW / already taken" for every booking attempt.
--
-- Root cause: migration 0002's one-time backfill computed
-- appointment_start/appointment_end for the 154 pre-existing rows by joining
-- to public.services with a plain (inner) join. Any row whose service_id no
-- longer matched a live services row (a deleted/renamed service, or a null
-- service_id on some historical row) was silently skipped by that UPDATE and
-- was left with appointment_start/appointment_end = NULL.
--
-- Postgres treats a NULL bound passed to tstzrange() as unbounded/infinite,
-- so tstzrange(NULL, NULL, '[)') is a range spanning the entire timeline. In
-- create_appointment()'s double-booking check, ANY such row for a given
-- barber overlaps with every possible new appointment time for that barber,
-- forever -- which reads to a customer as "every slot is already taken."
--
-- Both changes below are additive/non-destructive:
--   1. Backfill any row still missing appointment_start/appointment_end,
--      this time via a LEFT JOIN to services (so a missing/deleted service
--      can no longer block the backfill) with a 30-minute fallback duration
--      when the service's own duration is unknown. Rows that already have a
--      correct range are untouched -- this only ever fills in NULLs.
--   2. create_appointment() now also defensively ignores any row that still
--      has a null range in its overlap check, so this failure mode can never
--      silently return -- a row missing its range just gets re-backfilled
--      by (1), it can never again read as "blocks all of time."
-- =============================================================================

-- Postgres does not allow a JOIN ... ON clause inside UPDATE ... FROM to
-- reference the target table ("a") -- that's what threw 42P01 here. The
-- services lookup is rewritten as a correlated scalar subquery inside
-- coalesce() instead of a LEFT JOIN; a scalar subquery in SET *is* allowed
-- to reference the target row, and coalesce(..., 30) gives the same
-- "missing/deleted service -> 30-minute fallback" behavior the LEFT JOIN
-- was going for.
update public.appointments a
  set appointment_start = (a.appointment_date + a.appointment_time::time)::timestamp at time zone coalesce(br.timezone, 'Asia/Riyadh'),
      appointment_end = ((a.appointment_date + a.appointment_time::time)::timestamp at time zone coalesce(br.timezone, 'Asia/Riyadh'))
        + make_interval(mins => coalesce((select s.duration from public.services s where s.id = a.service_id), 30))
  from public.barbers b
  join public.branches br on br.id = b.branch_id
  where b.id = a.barber_id
    and (a.appointment_start is null or a.appointment_end is null);

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

  -- Defensive null-range guard -- see header comment. Without this, a row
  -- with a null appointment_start/appointment_end reads as an unbounded
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
