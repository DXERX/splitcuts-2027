-- 0009_booking_rpc.sql
-- Transactional, race-safe booking creation. The frontend never inserts into
-- public.bookings directly for a new reservation -- it calls create_booking()
-- and the database performs final validation.
--
-- Race protection strategy (belt AND suspenders):
--   1. pg_advisory_xact_lock on the barber id serializes concurrent attempts
--      to book the same barber for the lifetime of this transaction.
--   2. All availability checks (schedule / breaks / time off / overlap) run
--      inside that lock.
--   3. The bookings_no_overlap_per_barber EXCLUDE constraint (0003) is the
--      final, unconditional guarantee even if application logic above has a
--      bug or a second connection somehow bypasses the lock.

create or replace function public.create_booking(
  p_customer_id uuid,
  p_barber_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_notes text default null
)
returns public.bookings
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_barber public.barbers;
  v_service public.services;
  v_branch_tz text;
  v_ends_at timestamptz;
  v_dow int;
  v_local_start time;
  v_local_end time;
  v_local_date date;
  v_booking public.bookings;
begin
  if p_starts_at <= now() then
    raise exception 'START_TIME_IN_PAST' using errcode = 'P0001';
  end if;

  -- Serialize all booking attempts for this barber. Held until commit/rollback.
  perform pg_advisory_xact_lock(hashtextextended(p_barber_id::text, 42));

  -- Not "for update": a customer has no UPDATE-level RLS grant on barbers,
  -- and Postgres requires a row to satisfy an applicable UPDATE policy for
  -- any locking read (FOR UPDATE/SHARE), not just the SELECT policy -- so a
  -- locking read here would silently return zero rows for customers. The
  -- pg_advisory_xact_lock above already serializes concurrent bookings for
  -- this barber; no row lock on public.barbers is needed on top of that.
  select * into v_barber from public.barbers where id = p_barber_id and is_bookable;
  if not found then
    raise exception 'BARBER_NOT_BOOKABLE' using errcode = 'P0001';
  end if;

  select s.* into v_service
  from public.services s
  where s.id = p_service_id
    and s.branch_id = v_barber.branch_id
    and s.is_active;
  if not found then
    raise exception 'SERVICE_NOT_AVAILABLE_AT_BRANCH' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.barber_services bs
    where bs.barber_id = p_barber_id and bs.service_id = p_service_id
  ) then
    raise exception 'BARBER_DOES_NOT_OFFER_SERVICE' using errcode = 'P0001';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes);

  select b.timezone into v_branch_tz from public.branches b where b.id = v_barber.branch_id;
  v_branch_tz := coalesce(v_branch_tz, 'UTC');

  v_dow := extract(dow from (p_starts_at at time zone v_branch_tz))::int;
  v_local_date := (p_starts_at at time zone v_branch_tz)::date;
  v_local_start := (p_starts_at at time zone v_branch_tz)::time;
  v_local_end := (v_ends_at at time zone v_branch_tz)::time;

  if v_local_end < v_local_start then
    -- booking would cross midnight in branch-local time; keep the model simple for v1
    raise exception 'BOOKING_CANNOT_CROSS_MIDNIGHT' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.barber_schedules sch
    where sch.barber_id = p_barber_id
      and sch.is_active
      and sch.day_of_week = v_dow
      and sch.start_time <= v_local_start
      and sch.end_time >= v_local_end
  ) then
    raise exception 'OUTSIDE_WORKING_HOURS' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.barber_breaks brk
    where brk.barber_id = p_barber_id
      and (
        (brk.specific_date is null and brk.day_of_week = v_dow)
        or brk.specific_date = v_local_date
      )
      and brk.start_time < v_local_end
      and brk.end_time > v_local_start
  ) then
    raise exception 'OVERLAPS_BREAK' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.barber_time_off t
    where t.barber_id = p_barber_id
      and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_starts_at, v_ends_at, '[)')
  ) then
    raise exception 'BARBER_ON_TIME_OFF' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.bookings existing
    where existing.barber_id = p_barber_id
      and existing.status not in ('cancelled', 'no_show')
      and tstzrange(existing.starts_at, existing.ends_at, '[)') && tstzrange(p_starts_at, v_ends_at, '[)')
  ) then
    raise exception 'SLOT_ALREADY_BOOKED' using errcode = 'P0001';
  end if;

  insert into public.bookings (
    branch_id, customer_id, barber_id, service_id, status,
    starts_at, ends_at, price_at_booking, notes, created_by
  ) values (
    v_barber.branch_id, p_customer_id, p_barber_id, p_service_id, 'pending',
    p_starts_at, v_ends_at, v_service.price, p_notes, auth.uid()
  )
  returning * into v_booking;

  return v_booking;
exception
  when exclusion_violation then
    raise exception 'SLOT_ALREADY_BOOKED' using errcode = 'P0001';
end;
$$;

grant execute on function public.create_booking(uuid, uuid, uuid, timestamptz, text) to authenticated;

comment on function public.create_booking is 'The only supported way to create a booking. Validates schedule/breaks/time-off/overlap under an advisory lock, with the bookings_no_overlap_per_barber exclusion constraint as a final guarantee.';

-- ---------------------------------------------------------------------------
-- CONTROLLED STATUS TRANSITIONS
-- ---------------------------------------------------------------------------
-- Valid transitions. Anything not listed here is rejected by the
-- enforce_booking_status_transition trigger in 0010_triggers.sql.
create table public.booking_status_transitions (
  from_status public.booking_status not null,
  to_status public.booking_status not null,
  primary key (from_status, to_status)
);

insert into public.booking_status_transitions (from_status, to_status) values
  ('pending', 'confirmed'),
  ('pending', 'cancelled'),
  ('confirmed', 'checked_in'),
  ('confirmed', 'cancelled'),
  ('confirmed', 'no_show'),
  ('checked_in', 'in_service'),
  ('checked_in', 'cancelled'),
  ('in_service', 'completed'),
  ('in_service', 'cancelled');

create or replace function public.update_booking_status(
  p_booking_id uuid,
  p_new_status public.booking_status,
  p_reason text default null
)
returns public.bookings
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_booking.status = p_new_status then
    return v_booking;
  end if;

  if not exists (
    select 1 from public.booking_status_transitions t
    where t.from_status = v_booking.status and t.to_status = p_new_status
  ) then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;

  update public.bookings
    set status = p_new_status,
        cancelled_reason = case when p_new_status = 'cancelled' then p_reason else cancelled_reason end
    where id = p_booking_id
    returning * into v_booking;

  return v_booking;
end;
$$;

grant execute on function public.update_booking_status(uuid, public.booking_status, text) to authenticated;

comment on function public.update_booking_status is 'Enforces the booking state machine (booking_status_transitions) instead of trusting a raw status string from the client. RLS on bookings still governs who may call this for a given row.';

alter table public.booking_status_transitions enable row level security;

create policy "booking_status_transitions_select_all"
  on public.booking_status_transitions for select
  to authenticated
  using (true);
