-- 0008_rls_policies.sql
-- Row Level Security for every sensitive table. Staff accounts never rely on
-- frontend-only role checks -- every access path below is enforced here.
--
-- Helper functions are STABLE and SECURITY DEFINER so they can read
-- public.profiles / public.staff_roles without recursive RLS evaluation on
-- those tables themselves, while still being safe to call from any policy.

-- ---------------------------------------------------------------------------
-- HELPER FUNCTIONS
-- ---------------------------------------------------------------------------

create function public.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.current_profile_branch()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id from public.profiles where id = auth.uid();
$$;

create function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner' and is_active
  );
$$;

-- True if the caller holds `role` (or is an owner, who can act as anyone) at `branch`.
-- Checks both the home assignment on profiles and the explicit staff_roles grants,
-- so a person can hold different roles at different branches.
create function public.has_branch_role(branch uuid, roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_owner()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_active
        and p.branch_id = branch
        and p.role = any (roles)
    )
    or exists (
      select 1 from public.staff_roles sr
      where sr.user_id = auth.uid()
        and sr.is_active
        and sr.branch_id = branch
        and sr.role = any (roles)
    );
$$;

-- True if the caller can see operational data for `branch` at all
-- (cashier, manager, barber assigned there, or owner).
create function public.can_access_branch(branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_branch_role(branch, array['owner', 'manager', 'cashier', 'barber']::public.app_role[]);
$$;

create function public.is_branch_manager(branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_branch_role(branch, array['owner', 'manager']::public.app_role[]);
$$;

create function public.current_barber_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.barbers where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- BRANCHES
-- ---------------------------------------------------------------------------
alter table public.branches enable row level security;

create policy "branches_select_all_authenticated"
  on public.branches for select
  to authenticated
  using (is_active or public.is_owner());

create policy "branches_write_owner_only"
  on public.branches for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_select_self"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_select_branch_staff"
  on public.profiles for select
  to authenticated
  using (branch_id is not null and public.can_access_branch(branch_id));

create policy "profiles_select_owner_all"
  on public.profiles for select
  to authenticated
  using (public.is_owner());

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
  -- customers/staff can edit their own contact info but cannot self-promote their role.

create policy "profiles_write_owner_manager"
  on public.profiles for update
  to authenticated
  using (branch_id is not null and public.is_branch_manager(branch_id))
  with check (branch_id is not null and public.is_branch_manager(branch_id));

-- ---------------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;

create policy "customers_select_self"
  on public.customers for select
  to authenticated
  using (id = auth.uid());

create policy "customers_select_branch_staff"
  on public.customers for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.customer_id = customers.id
        and public.can_access_branch(b.branch_id)
    )
    or public.is_owner()
  );

create policy "customers_insert_self"
  on public.customers for insert
  to authenticated
  with check (id = auth.uid());

create policy "customers_update_self"
  on public.customers for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "customers_update_staff"
  on public.customers for update
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.customer_id = customers.id
        and public.is_branch_manager(b.branch_id)
    )
  );

-- ---------------------------------------------------------------------------
-- BARBERS
-- ---------------------------------------------------------------------------
alter table public.barbers enable row level security;

create policy "barbers_select_public"
  on public.barbers for select
  to authenticated
  using (is_bookable or public.can_access_branch(branch_id));

create policy "barbers_select_own_row"
  on public.barbers for select
  to authenticated
  using (id = auth.uid());

create policy "barbers_write_manager"
  on public.barbers for all
  to authenticated
  using (public.is_branch_manager(branch_id))
  with check (public.is_branch_manager(branch_id));

-- ---------------------------------------------------------------------------
-- SERVICES / BARBER_SERVICES
-- ---------------------------------------------------------------------------
alter table public.services enable row level security;
alter table public.barber_services enable row level security;

create policy "services_select_active_public"
  on public.services for select
  to authenticated
  using (is_active or public.can_access_branch(branch_id));

create policy "services_write_manager"
  on public.services for all
  to authenticated
  using (public.is_branch_manager(branch_id))
  with check (public.is_branch_manager(branch_id));

create policy "barber_services_select_public"
  on public.barber_services for select
  to authenticated
  using (true);

create policy "barber_services_write_manager"
  on public.barber_services for all
  to authenticated
  using (
    exists (
      select 1 from public.barbers b
      where b.id = barber_services.barber_id and public.is_branch_manager(b.branch_id)
    )
  )
  with check (
    exists (
      select 1 from public.barbers b
      where b.id = barber_services.barber_id and public.is_branch_manager(b.branch_id)
    )
  );

-- ---------------------------------------------------------------------------
-- BARBER SCHEDULES / BREAKS / TIME OFF
-- ---------------------------------------------------------------------------
alter table public.barber_schedules enable row level security;
alter table public.barber_breaks enable row level security;
alter table public.barber_time_off enable row level security;

create policy "barber_schedules_select_public"
  on public.barber_schedules for select
  to authenticated
  using (true); -- needed by anyone building a booking calendar

create policy "barber_schedules_own_or_manager"
  on public.barber_schedules for all
  to authenticated
  using (
    barber_id = auth.uid()
    or exists (select 1 from public.barbers b where b.id = barber_schedules.barber_id and public.is_branch_manager(b.branch_id))
  )
  with check (
    exists (select 1 from public.barbers b where b.id = barber_schedules.barber_id and public.is_branch_manager(b.branch_id))
  );

create policy "barber_breaks_select_public"
  on public.barber_breaks for select
  to authenticated
  using (true);

create policy "barber_breaks_own_or_manager"
  on public.barber_breaks for all
  to authenticated
  using (
    barber_id = auth.uid()
    or exists (select 1 from public.barbers b where b.id = barber_breaks.barber_id and public.is_branch_manager(b.branch_id))
  )
  with check (
    barber_id = auth.uid()
    or exists (select 1 from public.barbers b where b.id = barber_breaks.barber_id and public.is_branch_manager(b.branch_id))
  );

create policy "barber_time_off_select_public"
  on public.barber_time_off for select
  to authenticated
  using (true);

create policy "barber_time_off_own_or_manager"
  on public.barber_time_off for all
  to authenticated
  using (
    barber_id = auth.uid()
    or exists (select 1 from public.barbers b where b.id = barber_time_off.barber_id and public.is_branch_manager(b.branch_id))
  )
  with check (
    barber_id = auth.uid()
    or exists (select 1 from public.barbers b where b.id = barber_time_off.barber_id and public.is_branch_manager(b.branch_id))
  );

-- ---------------------------------------------------------------------------
-- BOOKINGS
-- ---------------------------------------------------------------------------
alter table public.bookings enable row level security;

create policy "bookings_select_own"
  on public.bookings for select
  to authenticated
  using (customer_id = auth.uid());

create policy "bookings_select_own_as_barber"
  on public.bookings for select
  to authenticated
  using (barber_id = auth.uid());

create policy "bookings_select_branch_staff"
  on public.bookings for select
  to authenticated
  using (public.can_access_branch(branch_id));

-- Customers may only ever INSERT their own bookings, and only through the
-- create_booking() RPC below in practice (it runs as the caller and this
-- policy still applies) -- never a raw status/price of their choosing beyond
-- what the RPC computes.
create policy "bookings_insert_own"
  on public.bookings for insert
  to authenticated
  with check (customer_id = auth.uid());

create policy "bookings_insert_staff"
  on public.bookings for insert
  to authenticated
  with check (public.can_access_branch(branch_id));

-- Status transitions are further constrained in the update_booking_status()
-- RPC; RLS here just governs *who* may touch the row at all.
create policy "bookings_update_customer_cancel_own"
  on public.bookings for update
  to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy "bookings_update_barber_own"
  on public.bookings for update
  to authenticated
  using (barber_id = auth.uid())
  with check (barber_id = auth.uid());

create policy "bookings_update_branch_staff"
  on public.bookings for update
  to authenticated
  using (public.can_access_branch(branch_id))
  with check (public.can_access_branch(branch_id));

-- ---------------------------------------------------------------------------
-- BOOKING EVENTS (read-only to clients; written only by triggers/RPCs as
-- the definer, so no insert/update/delete policy is granted here at all)
-- ---------------------------------------------------------------------------
alter table public.booking_events enable row level security;

create policy "booking_events_select_own"
  on public.booking_events for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_events.booking_id
        and (b.customer_id = auth.uid() or b.barber_id = auth.uid())
    )
  );

create policy "booking_events_select_branch_staff"
  on public.booking_events for select
  to authenticated
  using (public.can_access_branch(branch_id));

-- ---------------------------------------------------------------------------
-- LOYALTY
-- ---------------------------------------------------------------------------
alter table public.loyalty_programs enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.rewards enable row level security;

create policy "loyalty_programs_select_public"
  on public.loyalty_programs for select
  to authenticated
  using (is_active or branch_id is null or public.can_access_branch(branch_id));

create policy "loyalty_programs_write_manager"
  on public.loyalty_programs for all
  to authenticated
  using (branch_id is null and public.is_owner() or branch_id is not null and public.is_branch_manager(branch_id))
  with check (branch_id is null and public.is_owner() or branch_id is not null and public.is_branch_manager(branch_id));

-- No insert/update/delete policy for loyalty_transactions: the ledger is
-- only ever written by public.evaluate_loyalty_on_completion() and manual
-- adjustment RPCs, both SECURITY DEFINER. Clients get read-only access.
create policy "loyalty_transactions_select_own"
  on public.loyalty_transactions for select
  to authenticated
  using (customer_id = auth.uid());

create policy "loyalty_transactions_select_branch_staff"
  on public.loyalty_transactions for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = loyalty_transactions.booking_id and public.can_access_branch(b.branch_id)
    )
    or public.is_owner()
  );

create policy "rewards_select_own"
  on public.rewards for select
  to authenticated
  using (customer_id = auth.uid());

create policy "rewards_select_branch_staff"
  on public.rewards for select
  to authenticated
  using (branch_id is not null and public.can_access_branch(branch_id));

create policy "rewards_update_branch_staff"
  on public.rewards for update
  to authenticated
  using (branch_id is not null and public.can_access_branch(branch_id))
  with check (branch_id is not null and public.can_access_branch(branch_id));

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;

create policy "notifications_select_recipient"
  on public.notifications for select
  to authenticated
  using (recipient_user_id = auth.uid() or barber_id = auth.uid());

create policy "notifications_select_branch_staff"
  on public.notifications for select
  to authenticated
  using (public.can_access_branch(branch_id));

create policy "notifications_update_recipient_mark_read"
  on public.notifications for update
  to authenticated
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- SHOP DEVICES / DEVICE SESSIONS
-- ---------------------------------------------------------------------------
alter table public.shop_devices enable row level security;
alter table public.device_sessions enable row level security;

create policy "shop_devices_select_branch_staff"
  on public.shop_devices for select
  to authenticated
  using (public.can_access_branch(branch_id));

create policy "shop_devices_write_manager"
  on public.shop_devices for all
  to authenticated
  using (public.is_branch_manager(branch_id))
  with check (public.is_branch_manager(branch_id));

create policy "device_sessions_select_branch_staff"
  on public.device_sessions for select
  to authenticated
  using (
    exists (
      select 1 from public.shop_devices d
      where d.id = device_sessions.shop_device_id and public.can_access_branch(d.branch_id)
    )
  );

create policy "device_sessions_insert_self"
  on public.device_sessions for insert
  to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- STAFF ROLES / SETTINGS / AUDIT LOGS
-- ---------------------------------------------------------------------------
alter table public.staff_roles enable row level security;
alter table public.settings enable row level security;
alter table public.audit_logs enable row level security;

create policy "staff_roles_select_self"
  on public.staff_roles for select
  to authenticated
  using (user_id = auth.uid());

create policy "staff_roles_select_branch_manager"
  on public.staff_roles for select
  to authenticated
  using (public.is_branch_manager(branch_id));

create policy "staff_roles_write_owner_manager"
  on public.staff_roles for all
  to authenticated
  using (public.is_branch_manager(branch_id))
  with check (public.is_branch_manager(branch_id));

create policy "settings_select_branch_staff"
  on public.settings for select
  to authenticated
  using (branch_id is null or public.can_access_branch(branch_id));

create policy "settings_write_owner_manager"
  on public.settings for all
  to authenticated
  using (branch_id is null and public.is_owner() or branch_id is not null and public.is_branch_manager(branch_id))
  with check (branch_id is null and public.is_owner() or branch_id is not null and public.is_branch_manager(branch_id));

-- audit_logs: read-only for managers/owners, never client-writable. Rows are
-- inserted exclusively by SECURITY DEFINER trigger functions.
create policy "audit_logs_select_branch_manager"
  on public.audit_logs for select
  to authenticated
  using (branch_id is not null and public.is_branch_manager(branch_id));

create policy "audit_logs_select_owner"
  on public.audit_logs for select
  to authenticated
  using (public.is_owner());
