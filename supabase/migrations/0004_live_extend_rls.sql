-- =============================================================================
-- PART D: RLS helper functions + policies (new tables AND retrofitted onto
-- the existing barbers/services/appointments/google_reviews/notifications/
-- site_settings tables, which currently have none -- anyone with the
-- anon key can read AND write them today).
--
-- Every "create policy" below is wrapped in a do-block that swallows
-- "already exists" so this file can be re-run safely.
-- =============================================================================

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner' and is_active);
$$;

create or replace function public.is_branch_staff(branch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.branch_id = branch and p.role in ('owner','manager','cashier')
  ) or exists (
    select 1 from public.staff_roles sr where sr.user_id = auth.uid() and sr.is_active and sr.branch_id = branch
  );
$$;

create or replace function public.is_branch_manager(branch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.branch_id = branch and p.role in ('owner','manager')
  ) or exists (
    select 1 from public.staff_roles sr where sr.user_id = auth.uid() and sr.is_active and sr.branch_id = branch and sr.role in ('owner','manager')
  );
$$;

-- ---------------------------------------------------------------------------
-- Existing tables: enable RLS + add policies matching how they're actually
-- used (public site read of active content, staff-only writes). This CLOSES
-- what is currently open write access via the anon key.
-- ---------------------------------------------------------------------------
alter table public.barbers enable row level security;
do $$ begin create policy "barbers_select_public" on public.barbers for select using (is_active or public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "barbers_write_manager" on public.barbers for all to authenticated using (public.is_branch_manager(branch_id)) with check (public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;

alter table public.services enable row level security;
do $$ begin create policy "services_select_public" on public.services for select using (is_active or public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "services_write_manager" on public.services for all to authenticated using (public.is_branch_manager(branch_id)) with check (public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;

alter table public.google_reviews enable row level security;
do $$ begin create policy "google_reviews_select_public" on public.google_reviews for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "google_reviews_write_owner" on public.google_reviews for all to authenticated using (public.is_owner()) with check (public.is_owner()); exception when duplicate_object then null; end $$;

alter table public.notifications enable row level security;
do $$ begin create policy "notifications_select_public" on public.notifications for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "notifications_write_owner" on public.notifications for all to authenticated using (public.is_owner()) with check (public.is_owner()); exception when duplicate_object then null; end $$;

alter table public.site_settings enable row level security;
do $$ begin create policy "site_settings_select_public" on public.site_settings for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "site_settings_write_owner" on public.site_settings for all to authenticated using (public.is_owner()) with check (public.is_owner()); exception when duplicate_object then null; end $$;

-- appointments: customers see/manage their own (logged-in) bookings, staff
-- see their branch's bookings including historical guest rows (customer_id
-- is null on all pre-migration rows -- staff still needs to see those).
alter table public.appointments enable row level security;
do $$ begin create policy "appointments_select_own" on public.appointments for select to authenticated using (customer_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "appointments_select_branch_staff" on public.appointments for select to authenticated using (public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "appointments_insert_own" on public.appointments for insert to authenticated with check (customer_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "appointments_insert_staff" on public.appointments for insert to authenticated with check (public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "appointments_update_own" on public.appointments for update to authenticated using (customer_id = auth.uid()) with check (customer_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "appointments_update_branch_staff" on public.appointments for update to authenticated using (public.is_branch_staff(branch_id)) with check (public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------
alter table public.branches enable row level security;
do $$ begin create policy "branches_select_all" on public.branches for select to authenticated using (is_active or public.is_owner()); exception when duplicate_object then null; end $$;
do $$ begin create policy "branches_write_owner" on public.branches for all to authenticated using (public.is_owner()) with check (public.is_owner()); exception when duplicate_object then null; end $$;

alter table public.profiles enable row level security;
do $$ begin create policy "profiles_select_self" on public.profiles for select to authenticated using (id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "profiles_select_branch_staff" on public.profiles for select to authenticated using (branch_id is not null and public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "profiles_update_self" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid()); exception when duplicate_object then null; end $$;

alter table public.customers enable row level security;
do $$ begin create policy "customers_select_self" on public.customers for select to authenticated using (id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "customers_insert_self" on public.customers for insert to authenticated with check (id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "customers_update_self" on public.customers for update to authenticated using (id = auth.uid()) with check (id = auth.uid()); exception when duplicate_object then null; end $$;

alter table public.staff_roles enable row level security;
do $$ begin create policy "staff_roles_select_self" on public.staff_roles for select to authenticated using (user_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "staff_roles_select_manager" on public.staff_roles for select to authenticated using (public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "staff_roles_write_manager" on public.staff_roles for all to authenticated using (public.is_branch_manager(branch_id)) with check (public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;

alter table public.booking_events enable row level security;
do $$ begin
  create policy "booking_events_select_own" on public.booking_events for select to authenticated using (
    exists (select 1 from public.appointments a where a.id = booking_events.appointment_id and a.customer_id = auth.uid())
  );
exception when duplicate_object then null;
end $$;
do $$ begin create policy "booking_events_select_branch_staff" on public.booking_events for select to authenticated using (public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;

alter table public.loyalty_programs enable row level security;
do $$ begin create policy "loyalty_programs_select_public" on public.loyalty_programs for select using (is_active or branch_id is null or public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "loyalty_programs_write_manager" on public.loyalty_programs for all to authenticated using (branch_id is null and public.is_owner() or branch_id is not null and public.is_branch_manager(branch_id)) with check (branch_id is null and public.is_owner() or branch_id is not null and public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;

alter table public.loyalty_transactions enable row level security;
do $$ begin create policy "loyalty_transactions_select_own" on public.loyalty_transactions for select to authenticated using (customer_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "loyalty_transactions_select_staff" on public.loyalty_transactions for select to authenticated using (public.is_owner()); exception when duplicate_object then null; end $$;

alter table public.rewards enable row level security;
do $$ begin create policy "rewards_select_own" on public.rewards for select to authenticated using (customer_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "rewards_select_branch_staff" on public.rewards for select to authenticated using (branch_id is not null and public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "rewards_update_branch_staff" on public.rewards for update to authenticated using (branch_id is not null and public.is_branch_staff(branch_id)) with check (branch_id is not null and public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;

alter table public.shop_devices enable row level security;
do $$ begin create policy "shop_devices_select_staff" on public.shop_devices for select to authenticated using (public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "shop_devices_write_manager" on public.shop_devices for all to authenticated using (public.is_branch_manager(branch_id)) with check (public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;

alter table public.device_sessions enable row level security;
do $$ begin
  create policy "device_sessions_select_staff" on public.device_sessions for select to authenticated using (
    exists (select 1 from public.shop_devices d where d.id = device_sessions.shop_device_id and public.is_branch_staff(d.branch_id))
  );
exception when duplicate_object then null;
end $$;
do $$ begin create policy "device_sessions_insert_self" on public.device_sessions for insert to authenticated with check (user_id = auth.uid()); exception when duplicate_object then null; end $$;

alter table public.staff_notifications enable row level security;
do $$ begin create policy "staff_notifications_select_recipient" on public.staff_notifications for select to authenticated using (recipient_user_id = auth.uid()); exception when duplicate_object then null; end $$;
do $$ begin create policy "staff_notifications_select_branch_staff" on public.staff_notifications for select to authenticated using (public.is_branch_staff(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "staff_notifications_update_recipient" on public.staff_notifications for update to authenticated using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid()); exception when duplicate_object then null; end $$;

alter table public.audit_logs enable row level security;
do $$ begin create policy "audit_logs_select_manager" on public.audit_logs for select to authenticated using (branch_id is not null and public.is_branch_manager(branch_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "audit_logs_select_owner" on public.audit_logs for select to authenticated using (public.is_owner()); exception when duplicate_object then null; end $$;
