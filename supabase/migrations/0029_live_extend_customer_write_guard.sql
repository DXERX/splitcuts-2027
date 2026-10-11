-- Customers can update their own profile and their own appointments.
-- Those policies were open on every column, so a signed-in customer could
-- set profiles.role to owner, or set an appointment status to completed and
-- collect a loyalty point without a haircut.
--
-- Staff and the service role are unchanged. A customer may still:
--   * save their name, phone, and avatar
--   * cancel a booked or checked-in appointment
--   * reschedule a booked appointment (date, time, and clearing the
--     confirmation email so a new one can be sent)
--   * attach a guest booking to their own account

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.role is not distinct from old.role
     and new.is_active is not distinct from old.is_active
     and new.branch_id is not distinct from old.branch_id
     and new.id is not distinct from old.id
  then
    return new;
  end if;

  if old.id = auth.uid() then
    if old.role::text = 'owner' and old.is_active then
      return new;
    end if;
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'owner' and p.is_active
  ) then
    return new;
  end if;

  raise exception 'FORBIDDEN' using errcode = 'P0001';
end;
$$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

create or replace function public.guard_customer_appointment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  select
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_active
        and p.role::text in ('owner', 'manager', 'cashier', 'barber')
    )
    or exists (
      select 1 from public.staff_roles sr
      where sr.user_id = auth.uid()
        and sr.is_active
        and (sr.branch_id = old.branch_id or sr.role::text = 'owner')
    )
  into v_staff;

  if v_staff then
    return new;
  end if;

  if old.customer_id is distinct from auth.uid()
     and not (old.customer_id is null and new.customer_id = auth.uid())
  then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if new.customer_id is distinct from old.customer_id
     and not (old.customer_id is null and new.customer_id = auth.uid())
  then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if new.total_price is distinct from old.total_price
     or new.service_id is distinct from old.service_id
     or new.barber_id is distinct from old.barber_id
     or new.branch_id is distinct from old.branch_id
     or new.customer_phone is distinct from old.customer_phone
     or new.customer_email is distinct from old.customer_email
     or new.customer_name is distinct from old.customer_name
     or new.customer_package_id is distinct from old.customer_package_id
     or new.visit_id is distinct from old.visit_id
     or new.completion_email_sent_at is distinct from old.completion_email_sent_at
     or new.completion_email_claimed_at is distinct from old.completion_email_claimed_at
  then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if new.confirmation_email_sent_at is distinct from old.confirmation_email_sent_at
     and new.confirmation_email_sent_at is not null
  then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status
     and (new.status <> 'cancelled' or old.status not in ('booked', 'checked_in'))
  then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if (new.appointment_date is distinct from old.appointment_date
      or new.appointment_time is distinct from old.appointment_time)
     and (old.status <> 'booked' or new.status <> 'booked')
  then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if new.appointment_date is not distinct from old.appointment_date
     and new.appointment_time is not distinct from old.appointment_time
     and (new.appointment_start is distinct from old.appointment_start
          or new.appointment_end is distinct from old.appointment_end)
  then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if new.notes is distinct from old.notes and new.status <> 'cancelled' then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_customer_appointment_update on public.appointments;
create trigger guard_customer_appointment_update
  before update on public.appointments
  for each row execute function public.guard_customer_appointment_update();

notify pgrst, 'reload schema';
