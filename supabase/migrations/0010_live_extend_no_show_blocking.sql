-- =============================================================================
-- Migration 0010: no-show strikes
--
-- Fully additive -- no new tables or columns. "How many times has this
-- customer no-showed" is just a COUNT(*) over the existing appointments.status
-- = 'no_show' rows (a value the schema already supported; staff just had no
-- button to set it -- that's a frontend-only fix, shipped alongside this).
--
-- Rule: 1st no-show -> a warning banner on their account (frontend-only,
-- reads this same count). 2nd no-show -> create_appointment() itself refuses
-- any further booking from that customer, so the block can't be bypassed by
-- going around the UI. Matched by customer_id for a signed-in customer, OR
-- by phone for a guest (guests have no account to warn in, so they only ever
-- see the block, at the moment they try to book again).
-- =============================================================================

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
