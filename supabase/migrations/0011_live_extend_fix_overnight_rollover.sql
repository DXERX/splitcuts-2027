-- =============================================================================
-- Migration 0011: fix "Please choose a time in the future" for legitimate
-- late-night slots.
--
-- Root cause: the shop runs an OVERNIGHT shift (e.g. 14:00 -> 02:00), so a
-- slot like "01:30" picked while browsing "today" is really tonight's late
-- shift, i.e. calendar date TOMORROW at 01:30 -- not today at 01:30. The
-- booking UI's own slot generation (lib/timeSlots.ts: extendedMinutes,
-- isSlotInPast) already treats it that way, which is why the slot shows up
-- as selectable in the first place. But nothing on the database side ever
-- rolled the calendar date forward:
--   - create_appointment()'s own v_starts_at (used for the START_TIME_IN_PAST
--     check and the double-booking overlap check) just combined the raw
--     appointment_date + appointment_time.
--   - the sync_appointment_range trigger (the actual source of the stored
--     appointment_start/appointment_end on every write path) did the exact
--     same raw combination.
-- So a customer picking a real, future "01:30" slot got rejected as if it
-- were already in the past, because the server computed it as TODAY 01:30
-- instead of TOMORROW 01:30.
--
-- Fix: one shared helper both call sites now use, so they can never drift
-- apart from each other again. appointment_date/appointment_time themselves
-- are untouched -- they still record the BUSINESS DAY a slot belongs to
-- (matching how "today's" busy slots are queried), only the derived
-- appointment_start/appointment_end (and the in-memory pre-insert checks)
-- get the correct calendar-day rollover applied.
--
-- Fully additive: new function, replaced function bodies (no data loss), and
-- a narrowly-scoped backfill limited to appointments that (a) haven't
-- happened yet and (b) are a late-night slot that predates this fix -- never
-- touches history or anything already correct.
-- =============================================================================

create or replace function public.resolve_appointment_start(
  p_appointment_date date,
  p_appointment_time time,
  p_timezone text default 'Asia/Riyadh'
)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_hours jsonb;
  v_open time;
  v_starts_on date;
begin
  select value into v_hours from public.site_settings where key = 'business_hours';
  v_open := coalesce((v_hours ->> 'default_start')::time, '14:00'::time);

  -- A time before the shop's opening time belongs to THAT NIGHT, i.e. the
  -- following calendar date, not that same afternoon.
  v_starts_on := case when p_appointment_time < v_open then p_appointment_date + 1 else p_appointment_date end;

  return (v_starts_on + p_appointment_time)::timestamp at time zone coalesce(p_timezone, 'Asia/Riyadh');
end;
$$;

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

  -- appointment_time is text (e.g. '21:30'), so it needs an explicit ::time
  -- cast before it can be compared/combined with a date.
  new.appointment_start := public.resolve_appointment_start(new.appointment_date, new.appointment_time::time, v_timezone);
  new.appointment_end := new.appointment_start + make_interval(mins => coalesce(v_duration, 30));
  return new;
end;
$$;

-- Backfill: only appointments that haven't happened yet, whose stored
-- appointment_start still reflects the pre-fix (non-rolled) calculation.
-- Never touches history, and is a no-op if run twice.
update public.appointments a
  set appointment_start = public.resolve_appointment_start(a.appointment_date, a.appointment_time::time, br.timezone),
      appointment_end = public.resolve_appointment_start(a.appointment_date, a.appointment_time::time, br.timezone)
        + make_interval(mins => coalesce((select sv.duration from public.services sv where sv.id = a.service_id), 30))
  from public.barbers b
  join public.branches br on br.id = b.branch_id
  where b.id = a.barber_id
    and a.status not in ('cancelled', 'no_show')
    and a.appointment_start > now()
    and a.appointment_time::time < coalesce(
      (select (s.value ->> 'default_start')::time from public.site_settings s where s.key = 'business_hours'),
      '14:00'::time
    );

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
  v_no_show_count int;
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
