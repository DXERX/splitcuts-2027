-- =============================================================================
-- Migration 0024: one visit, one confirmation.
--
-- A sitting can include more than one service. Those used to be separate
-- appointment rows tied together only by a note ("Combined booking"), so the
-- confirmation email, the calendar, and any later status change could only
-- see the first row.
--
-- visit_id groups every appointment that belongs to the same sitting. A
-- single-service booking is a visit of one: visit_id equals that row's id.
-- create_visit() books the whole sitting in one transaction, so a failure
-- on the second service cannot leave the first one behind.
--
-- The column is filled by a BEFORE INSERT trigger. create_visit() publishes
-- the first row's id with set_config(..., true), which lasts only for this
-- transaction, and later inserts in that sitting pick it up. No extra UPDATE
-- is required, so guest bookings (which cannot pass the customer update
-- policy) still get a visit id.
-- =============================================================================

alter table public.appointments
  add column if not exists visit_id uuid;

create index if not exists appointments_visit_id_idx
  on public.appointments (visit_id);

comment on column public.appointments.visit_id is
  'Groups every service in one sitting. Equals id when the visit is a single service.';

comment on table public.appointments is
  'One chair reservation. A multi-service sitting is several rows that share visit_id. appointment_date is the business day; appointment_start is the real Riyadh instant, including after-midnight slots.';

comment on table public.services is
  'Bookable menu. Loyalty visits count only for CUTS named Hair or Hair + Beard.';

comment on table public.loyalty_programs is
  'Split Rewards rules. One active shop-wide program (branch_id null) is the default; a branch program wins when both exist.';

comment on table public.loyalty_transactions is
  'Ledger of visit_earned, visit_removed, and reward_earned. Progress is earned minus removed. At most one visit_earned per customer, program, and business day.';

comment on table public.rewards is
  'A free cut unlocked when earned visits hit a multiple of visits_required. Written by evaluate_loyalty_on_completion and by the 0023 backfill.';

comment on table public.staff_notifications is
  'Shop-floor alerts. title and message are required. Do not write a payload column.';

create or replace function public.assign_visit_id()
returns trigger
language plpgsql
as $$
declare
  v_configured text;
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  if new.visit_id is null then
    v_configured := nullif(current_setting('splitcuts.visit_id', true), '');
    new.visit_id := coalesce(v_configured::uuid, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists assign_visit_id on public.appointments;
create trigger assign_visit_id
  before insert on public.appointments
  for each row execute function public.assign_visit_id();

update public.appointments
  set visit_id = id
  where visit_id is null;

-- Books every selected service back-to-back for one barber. The package, when
-- present, applies only to the first service. Raises the same error codes as
-- create_appointment(), and rolls the entire sitting back if any leg fails.
create or replace function public.create_visit(
  p_customer_id uuid,
  p_barber_id uuid,
  p_service_ids uuid[],
  p_appointment_date date,
  p_appointment_time time,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_notes text default null,
  p_customer_package_id uuid default null
)
returns setof public.appointments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_service uuid;
  v_index integer := 0;
  v_row public.appointments;
  v_cursor time := p_appointment_time;
  v_duration integer;
begin
  if p_service_ids is null or cardinality(p_service_ids) = 0 then
    raise exception 'SERVICE_REQUIRED' using errcode = 'P0001';
  end if;

  if cardinality(p_service_ids) > 4 then
    raise exception 'TOO_MANY_SERVICES' using errcode = 'P0001';
  end if;

  perform set_config('splitcuts.visit_id', '', true);

  foreach v_service in array p_service_ids loop
    v_index := v_index + 1;

    v_row := public.create_appointment(
      p_customer_id,
      p_barber_id,
      v_service,
      p_appointment_date,
      v_cursor,
      p_customer_name,
      p_customer_phone,
      p_customer_email,
      case
        when cardinality(p_service_ids) > 1 then 'Combined visit'
        else p_notes
      end,
      case when v_index = 1 then p_customer_package_id else null end
    );

    if v_index = 1 then
      perform set_config('splitcuts.visit_id', v_row.id::text, true);
    end if;

    select coalesce(duration, 30)
      into v_duration
    from public.services
    where id = v_service;

    v_cursor := (v_cursor + make_interval(mins => coalesce(v_duration, 30)))::time;
    return next v_row;
  end loop;
end;
$$;

grant execute on function public.create_visit(uuid, uuid, uuid[], date, time, text, text, text, text, uuid) to anon, authenticated;

-- A table created outside the migrations and left open on the Data API.
-- Enabling RLS with no policy closes the public API. The dashboard role
-- still reads it. Skip quietly when the table does not exist.
do $$
begin
  if to_regclass('public.customer_loyalty') is not null then
    execute 'alter table public.customer_loyalty enable row level security';
  end if;
end $$;
