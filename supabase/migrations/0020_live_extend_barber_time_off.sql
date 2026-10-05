-- Lets branch staff mark a barber off for a day (vacation, sick, etc.) so
-- the booking RPCs stop offering that barber's chair for that date. Barbers
-- don't have their own logins (see lib/roles.ts) -- staff set this on a
-- barber's behalf from the dashboard.

create table if not exists public.barber_time_off (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  off_date date not null,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (barber_id, off_date)
);

alter table public.barber_time_off enable row level security;

-- Readable by everyone, including anonymous booking-flow visitors -- the
-- booking form needs to know a barber is off to stop offering their chair
-- for that day, same "public can read the schedule shape" visibility
-- barbers/services already have (migration 0004's barbers_select_public).
-- The reason text is a plain "vacation"/"sick" note, not sensitive.
do $$ begin
  create policy "barber_time_off_select_public" on public.barber_time_off
    for select
    using (true);
exception when duplicate_object then null; end $$;

-- Writes stay staff-only, scoped to the barber's own branch (same pattern
-- as appointments_insert_staff/appointments_update_branch_staff).
do $$ begin
  create policy "barber_time_off_write_staff" on public.barber_time_off
    for all to authenticated
    using (
      exists (
        select 1 from public.barbers b
        where b.id = barber_time_off.barber_id and public.is_branch_staff(b.branch_id)
      )
    )
    with check (
      exists (
        select 1 from public.barbers b
        where b.id = barber_time_off.barber_id and public.is_branch_staff(b.branch_id)
      )
    );
exception when duplicate_object then null; end $$;

create index if not exists barber_time_off_barber_date_idx on public.barber_time_off (barber_id, off_date);

-- create_appointment(): re-defined with the exact signature from migration
-- 0015, adding one check right after the barber-active lookup (barber-
-- related checks grouped together), before anything else runs.
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

  if exists (
    select 1 from public.barber_time_off bto
    where bto.barber_id = p_barber_id and bto.off_date = p_appointment_date
  ) then
    raise exception 'BARBER_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select * into v_service from public.services where id = p_service_id and branch_id = v_barber.branch_id and is_active;
  if not found then
    raise exception 'SERVICE_NOT_AVAILABLE_AT_BRANCH' using errcode = 'P0001';
  end if;

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

  select * into v_branch from public.branches where id = v_barber.branch_id;

  v_starts_at := public.resolve_appointment_start(p_appointment_date, p_appointment_time, v_branch.timezone);
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
    where existing.barber_id = p_barber_id
      and existing.status not in ('cancelled', 'no_show')
      and existing.appointment_start is not null
      and existing.appointment_end is not null
      and tstzrange(existing.appointment_start, existing.appointment_end, '[)') && tstzrange(v_starts_at, v_ends_at, '[)')
  ) then
    raise exception 'SLOT_ALREADY_BOOKED' using errcode = 'P0001';
  end if;

  -- Same customer (account or phone) cannot occupy two chairs at the same time.
  -- Adjacent back-to-back services on a combined booking do not overlap
  -- because ranges are half-open [start, end).
  if p_customer_id is not null or p_customer_phone is not null then
    if exists (
      select 1 from public.appointments existing
      where existing.status not in ('cancelled', 'no_show')
        and existing.appointment_start is not null
        and existing.appointment_end is not null
        and tstzrange(existing.appointment_start, existing.appointment_end, '[)') && tstzrange(v_starts_at, v_ends_at, '[)')
        and (
          (p_customer_id is not null and existing.customer_id = p_customer_id)
          or (p_customer_phone is not null and existing.customer_phone = p_customer_phone)
        )
    ) then
      raise exception 'CUSTOMER_ALREADY_BOOKED' using errcode = 'P0001';
    end if;
  end if;

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

  if p_customer_package_id is not null then
    update public.customer_packages
      set sessions_used = sessions_used + 1,
          status = case when sessions_used + 1 >= sessions_total then 'expired' else status end
      where id = p_customer_package_id;
  end if;

  return v_appt;
exception
  when exclusion_violation or unique_violation then
    raise exception 'SLOT_ALREADY_BOOKED' using errcode = 'P0001';
end;
$$;

grant execute on function public.create_appointment(uuid, uuid, uuid, date, time, text, text, text, text, uuid) to authenticated;

-- reschedule_appointment(): re-defined with the exact signature from
-- migration 0019, adding the same check (against the new target date).
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
  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_appt.status <> 'booked' then
    raise exception 'APPOINTMENT_NOT_RESCHEDULABLE' using errcode = 'P0001';
  end if;

  -- Once we're inside the 15-minute window before the existing appointment
  -- (or it's already started), the customer has to call the shop instead --
  -- the barber may already be prepping/expecting them.
  if v_appt.appointment_start is not null and v_appt.appointment_start - now() < interval '15 minutes' then
    raise exception 'TOO_CLOSE_TO_RESCHEDULE' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.barber_time_off bto
    where bto.barber_id = v_appt.barber_id and bto.off_date = p_new_date
  ) then
    raise exception 'BARBER_UNAVAILABLE' using errcode = 'P0001';
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
