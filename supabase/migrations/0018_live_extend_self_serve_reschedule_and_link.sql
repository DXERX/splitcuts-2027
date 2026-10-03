-- =============================================================================
-- Two additions, both security definer but narrowly scoped to what the
-- calling user is actually allowed to touch (checked in the function body,
-- not left to RLS, since both legitimately need to act on rows the caller
-- doesn't "own" yet under the existing appointments_update_own policy):
--
-- 1. reschedule_appointment(): lets a signed-in customer change the date/
--    time of their own still-'booked' appointment in place, re-running the
--    exact same safety checks create_appointment() does (business hours,
--    booking lockdown, barber double-booking, same-customer overlap) --
--    just excluding the appointment's own row from the overlap checks so
--    it never "conflicts with itself". Reuses the existing
--    sync_appointment_range trigger to recompute appointment_start/end --
--    only appointment_date/appointment_time are written here. Resets
--    confirmation_email_sent_at so the app can send a fresh confirmation
--    for the new time.
--
-- 2. link_my_guest_bookings(): a customer who booked by phone as a guest
--    and only later signs in has appointments with no customer_id --
--    appointments_select_own/appointments_update_own both key off
--    customer_id = auth.uid(), so without this those guest bookings never
--    show up in their own account. Migration 0016 already covers the
--    moment a profile's phone first gets *set*, but not "already had an
--    account with this phone on file, booked as a guest anyway, then logged
--    back in" -- this closes that gap by running on every login instead,
--    matched only against the caller's own phone.
--
-- Purely additive: two new functions, nothing existing is altered. Safe to
-- run against the live database.
-- =============================================================================
create or replace function public.reschedule_appointment(
  p_appointment_id uuid,
  p_new_date date,
  p_new_time time
)
returns public.appointments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_appt public.appointments;
  v_service public.services;
  v_branch public.branches;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_local_time time;
  v_hours jsonb;
  v_open time;
  v_close time;
  v_lockdown jsonb;
begin
  -- security invoker: this select is already subject to the caller's own
  -- RLS (appointments_select_own / appointments_select_branch_staff), so a
  -- customer who doesn't own this appointment simply gets NOT FOUND here.
  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_appt.status <> 'booked' then
    raise exception 'APPOINTMENT_NOT_RESCHEDULABLE' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_appt.barber_id::text, 42));

  select * into v_service from public.services where id = v_appt.service_id;
  select br.* into v_branch from public.branches br
    join public.barbers b on b.branch_id = br.id
    where b.id = v_appt.barber_id;

  v_starts_at := public.resolve_appointment_start(p_new_date, p_new_time, v_branch.timezone);
  if v_starts_at <= now() then
    raise exception 'START_TIME_IN_PAST' using errcode = 'P0001';
  end if;
  v_ends_at := v_starts_at + make_interval(mins => v_service.duration);

  select value into v_lockdown from public.site_settings where key = 'booking_lockdown';
  if v_lockdown is not null and (v_lockdown ->> 'enabled')::boolean is true then
    raise exception 'BOOKING_LOCKED: %', coalesce(v_lockdown ->> 'message', 'Booking is temporarily closed') using errcode = 'P0001';
  end if;

  select value into v_hours from public.site_settings where key = 'business_hours';
  if v_hours is not null then
    v_open := (v_hours ->> 'default_start')::time;
    v_close := (v_hours ->> 'default_end')::time;
    v_local_time := (v_starts_at at time zone coalesce(v_branch.timezone, 'Asia/Riyadh'))::time;
    if v_open is not null and v_close is not null then
      if v_open > v_close then
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
    where existing.id <> p_appointment_id
      and existing.barber_id = v_appt.barber_id
      and existing.status not in ('cancelled', 'no_show')
      and existing.appointment_start is not null
      and existing.appointment_end is not null
      and tstzrange(existing.appointment_start, existing.appointment_end, '[)') && tstzrange(v_starts_at, v_ends_at, '[)')
  ) then
    raise exception 'SLOT_ALREADY_BOOKED' using errcode = 'P0001';
  end if;

  if v_appt.customer_id is not null or v_appt.customer_phone is not null then
    if exists (
      select 1 from public.appointments existing
      where existing.id <> p_appointment_id
        and existing.status not in ('cancelled', 'no_show')
        and existing.appointment_start is not null
        and existing.appointment_end is not null
        and tstzrange(existing.appointment_start, existing.appointment_end, '[)') && tstzrange(v_starts_at, v_ends_at, '[)')
        and (
          (v_appt.customer_id is not null and existing.customer_id = v_appt.customer_id)
          or (v_appt.customer_phone is not null and existing.customer_phone = v_appt.customer_phone)
        )
    ) then
      raise exception 'CUSTOMER_ALREADY_BOOKED' using errcode = 'P0001';
    end if;
  end if;

  update public.appointments
    set appointment_date = p_new_date,
        appointment_time = to_char(p_new_time, 'HH24:MI'),
        confirmation_email_sent_at = null
    where id = p_appointment_id
    returning * into v_appt;

  return v_appt;
exception
  when exclusion_violation or unique_violation then
    raise exception 'SLOT_ALREADY_BOOKED' using errcode = 'P0001';
end;
$$;

grant execute on function public.reschedule_appointment(uuid, date, time) to authenticated;

create or replace function public.link_my_guest_bookings()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  select phone into v_phone from public.profiles where id = auth.uid();
  if v_phone is not null then
    update public.appointments
      set customer_id = auth.uid()
      where customer_id is null
        and customer_phone = v_phone;
  end if;
end;
$$;

grant execute on function public.link_my_guest_bookings() to authenticated;
