-- Unban a phone (or the account tied to it) without deleting the no-show
-- rows, and let staff attach one active offer to a service so the charged
-- price follows that offer until they clear it.

create table if not exists public.booking_pardons (
  id uuid primary key default gen_random_uuid(),
  phone text,
  customer_id uuid,
  pardoned_by uuid,
  created_at timestamptz not null default now(),
  constraint booking_pardons_target check (phone is not null or customer_id is not null)
);

create index if not exists booking_pardons_phone_idx on public.booking_pardons (phone, created_at desc);
create index if not exists booking_pardons_customer_idx on public.booking_pardons (customer_id, created_at desc);

comment on table public.booking_pardons is
  'A staff pardon. No-show rows created before this timestamp no longer count toward the two-strike booking block.';

create table if not exists public.service_offers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  service_id uuid not null references public.services (id) on delete cascade,
  name text not null,
  offer_price numeric(10, 2) not null check (offer_price >= 0),
  is_active boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists service_offers_one_active_idx
  on public.service_offers (service_id)
  where is_active;

comment on table public.service_offers is
  'One active offer per service replaces the menu price at booking time. Clearing it restores services.price.';

alter table public.booking_pardons enable row level security;
alter table public.service_offers enable row level security;

do $$ begin
  create policy "booking_pardons_select_staff" on public.booking_pardons
    for select to authenticated
    using (
      public.is_owner()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.is_active and p.role in ('owner', 'manager', 'cashier')
      )
      or exists (
        select 1 from public.staff_roles sr
        where sr.user_id = auth.uid() and sr.is_active
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "service_offers_select" on public.service_offers
    for select
    using (is_active or public.is_branch_staff(branch_id));
exception when duplicate_object then null; end $$;

create or replace function public.no_show_strike_count(
  p_customer_id uuid,
  p_phone text
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.appointments a
  where a.status = 'no_show'
    and (
      (p_customer_id is not null and a.customer_id = p_customer_id)
      or (p_phone is not null and btrim(p_phone) <> '' and a.customer_phone = p_phone)
    )
    and not exists (
      select 1
      from public.booking_pardons p
      where p.created_at >= a.created_at
        and (
          (p.phone is not null and a.customer_phone is not null and p.phone = a.customer_phone)
          or (p.customer_id is not null and a.customer_id is not null and p.customer_id = a.customer_id)
        )
    );
$$;

revoke all on function public.no_show_strike_count(uuid, text) from public;
grant execute on function public.no_show_strike_count(uuid, text) to anon, authenticated;

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
  v_offer numeric(10, 2);
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
    v_no_show_count := public.no_show_strike_count(p_customer_id, p_customer_phone);
    if v_no_show_count >= 2 then
      raise exception 'CUSTOMER_BLOCKED_NO_SHOW' using errcode = 'P0001';
    end if;
  end if;

  v_price := v_service.price;
  select o.offer_price into v_offer
  from public.service_offers o
  where o.service_id = p_service_id and o.is_active
  limit 1;
  if v_offer is not null then
    v_price := v_offer;
  end if;

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

create or replace function public.clear_phone_ban(
  p_phone text default null,
  p_customer_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := nullif(btrim(p_phone), '');
  v_digits text;
  v_customer uuid;
  v_matched_phone text;
begin
  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED' using errcode = 'P0001';
  end if;

  if not (
    public.is_owner()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_active and p.role in ('owner', 'manager', 'cashier')
    )
    or exists (
      select 1 from public.staff_roles sr
      where sr.user_id = auth.uid() and sr.is_active
    )
  ) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if v_phone = '—' then
    v_phone := null;
  end if;

  if v_phone is null and p_customer_id is null then
    raise exception 'PHONE_REQUIRED' using errcode = 'P0001';
  end if;

  v_digits := nullif(regexp_replace(coalesce(v_phone, ''), '[^0-9]', '', 'g'), '');

  if v_phone is not null then
    insert into public.booking_pardons (phone, pardoned_by)
    values (v_phone, auth.uid());
  end if;

  if p_customer_id is not null then
    insert into public.booking_pardons (customer_id, pardoned_by)
    values (p_customer_id, auth.uid());
  end if;

  for v_customer, v_matched_phone in
    select distinct a.customer_id, nullif(btrim(a.customer_phone), '')
    from public.appointments a
    where a.status = 'no_show'
      and (
        (p_customer_id is not null and a.customer_id = p_customer_id)
        or (v_phone is not null and a.customer_phone = v_phone)
        or (
          v_digits is not null
          and regexp_replace(coalesce(a.customer_phone, ''), '[^0-9]', '', 'g') = v_digits
        )
      )
  loop
    if v_customer is not null then
      insert into public.booking_pardons (customer_id, pardoned_by)
      values (v_customer, auth.uid());
    end if;
    if v_matched_phone is not null then
      insert into public.booking_pardons (phone, pardoned_by)
      values (v_matched_phone, auth.uid());
    end if;
  end loop;
end;
$$;

revoke all on function public.clear_phone_ban(text, uuid) from public;
grant execute on function public.clear_phone_ban(text, uuid) to authenticated;

create or replace function public.apply_service_offer(
  p_service_id uuid,
  p_name text,
  p_offer_price numeric,
  p_offer_id uuid default null
)
returns public.service_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.services;
  v_offer public.service_offers;
  v_name text := nullif(btrim(p_name), '');
begin
  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_service from public.services where id = p_service_id;
  if not found then
    raise exception 'SERVICE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.is_branch_staff(v_service.branch_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if v_name is null then
    raise exception 'OFFER_NAME_REQUIRED' using errcode = 'P0001';
  end if;

  if p_offer_price is null or p_offer_price < 0 then
    raise exception 'OFFER_PRICE_REQUIRED' using errcode = 'P0001';
  end if;

  update public.service_offers
    set is_active = false, updated_at = now()
    where service_id = p_service_id and is_active;

  if p_offer_id is not null then
    update public.service_offers
      set name = v_name,
          offer_price = p_offer_price,
          is_active = true,
          updated_at = now()
      where id = p_offer_id and service_id = p_service_id
      returning * into v_offer;
    if not found then
      raise exception 'OFFER_NOT_FOUND' using errcode = 'P0001';
    end if;
  else
    insert into public.service_offers (branch_id, service_id, name, offer_price, is_active, created_by)
    values (v_service.branch_id, p_service_id, v_name, p_offer_price, true, auth.uid())
    returning * into v_offer;
  end if;

  return v_offer;
end;
$$;

revoke all on function public.apply_service_offer(uuid, text, numeric, uuid) from public;
grant execute on function public.apply_service_offer(uuid, text, numeric, uuid) to authenticated;

create or replace function public.clear_service_offer(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch uuid;
begin
  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED' using errcode = 'P0001';
  end if;

  select branch_id into v_branch from public.services where id = p_service_id;
  if not found then
    raise exception 'SERVICE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.is_branch_staff(v_branch) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  update public.service_offers
    set is_active = false, updated_at = now()
    where service_id = p_service_id and is_active;
end;
$$;

revoke all on function public.clear_service_offer(uuid) from public;
grant execute on function public.clear_service_offer(uuid) to authenticated;

create or replace function public.my_no_show_strikes()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select public.no_show_strike_count(
    auth.uid(),
    (select phone from public.profiles where id = auth.uid())
  );
$$;

revoke all on function public.my_no_show_strikes() from public;
grant execute on function public.my_no_show_strikes() to authenticated;

create or replace function public.branch_dashboard_stats(
  p_branch_id uuid,
  p_from date,
  p_to date,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_revenue numeric;
  v_bookings integer;
  v_banned jsonb;
  v_recent jsonb;
begin
  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED' using errcode = 'P0001';
  end if;

  if p_branch_id is null then
    if not public.is_owner() then
      raise exception 'FORBIDDEN' using errcode = 'P0001';
    end if;
  elsif not public.is_branch_staff(p_branch_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_from is null or p_to is null or p_to < p_from or (p_to - p_from) > 31 then
    raise exception 'INVALID_RANGE' using errcode = 'P0001';
  end if;

  if p_status is not null and p_status not in (
    'booked', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show'
  ) then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  select
    coalesce(sum(a.total_price) filter (where a.status = 'completed'), 0),
    count(*) filter (where a.status <> 'cancelled')
  into v_revenue, v_bookings
  from public.appointments a
  where a.appointment_date between p_from and p_to
    and (p_branch_id is null or a.branch_id = p_branch_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', b.key,
        'name', b.name,
        'phone', b.phone,
        'count', b.count
      )
      order by b.count desc, b.name
    ),
    '[]'::jsonb
  )
  into v_banned
  from (
    select
      coalesce(a.customer_id::text, nullif(a.customer_phone, ''), a.id::text) as key,
      coalesce(max(a.customer_name), 'Guest') as name,
      coalesce(max(nullif(a.customer_phone, '')), '—') as phone,
      count(*)::int as count
    from public.appointments a
    where a.status = 'no_show'
      and (p_branch_id is null or a.branch_id = p_branch_id)
      and not exists (
        select 1
        from public.booking_pardons p
        where p.created_at >= a.created_at
          and (
            (p.phone is not null and a.customer_phone is not null and p.phone = a.customer_phone)
            or (p.customer_id is not null and a.customer_id is not null and p.customer_id = a.customer_id)
          )
      )
    group by coalesce(a.customer_id::text, nullif(a.customer_phone, ''), a.id::text)
    having count(*) >= 2
  ) b;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'total_price', r.total_price,
        'appointment_date', r.appointment_date,
        'appointment_time', r.appointment_time,
        'customer_name', r.customer_name,
        'customer_phone', r.customer_phone,
        'barber_id', r.barber_id
      )
      order by r.appointment_start desc nulls last
    ),
    '[]'::jsonb
  )
  into v_recent
  from (
    select
      a.id,
      a.status,
      a.total_price,
      a.appointment_date,
      a.appointment_time,
      a.appointment_start,
      a.customer_name,
      a.customer_phone,
      a.barber_id
    from public.appointments a
    where (p_branch_id is null or a.branch_id = p_branch_id)
      and (p_status is null or a.status = p_status)
    order by a.appointment_start desc nulls last
    limit 12
  ) r;

  return jsonb_build_object(
    'revenue_7d', v_revenue,
    'week_bookings', v_bookings,
    'banned', v_banned,
    'recent', v_recent
  );
end;
$$;

grant execute on function public.branch_dashboard_stats(uuid, date, date, text) to authenticated;
