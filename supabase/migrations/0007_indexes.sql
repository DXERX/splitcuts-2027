-- 0007_indexes.sql
-- Indexes for production query patterns: branch-scoped lookups, realtime
-- filters, calendar/availability queries, and foreign keys Postgres doesn't
-- index automatically.

-- profiles
create index profiles_branch_id_idx on public.profiles (branch_id);
create index profiles_role_idx on public.profiles (role);
create index profiles_phone_idx on public.profiles (phone);

-- customers
create index customers_preferred_branch_id_idx on public.customers (preferred_branch_id);

-- barbers
create index barbers_branch_id_idx on public.barbers (branch_id);
create index barbers_branch_bookable_idx on public.barbers (branch_id, is_bookable);

-- services
create index services_branch_id_idx on public.services (branch_id);
create index services_branch_active_idx on public.services (branch_id, is_active);
create index barber_services_service_id_idx on public.barber_services (service_id);

-- barber availability
create index barber_schedules_barber_id_idx on public.barber_schedules (barber_id);
create index barber_schedules_barber_day_idx on public.barber_schedules (barber_id, day_of_week);
create index barber_breaks_barber_id_idx on public.barber_breaks (barber_id);
create index barber_time_off_barber_id_idx on public.barber_time_off (barber_id);
create index barber_time_off_range_idx on public.barber_time_off using gist (barber_id, tstzrange(starts_at, ends_at, '[)'));

-- bookings: the hottest table. Cover branch dashboards, barber calendars,
-- customer history, and realtime filters.
create index bookings_branch_id_idx on public.bookings (branch_id);
create index bookings_branch_starts_at_idx on public.bookings (branch_id, starts_at);
create index bookings_barber_id_starts_at_idx on public.bookings (barber_id, starts_at);
create index bookings_customer_id_idx on public.bookings (customer_id, starts_at desc);
create index bookings_status_idx on public.bookings (branch_id, status);
create index bookings_service_id_idx on public.bookings (service_id);

-- booking_events
create index booking_events_booking_id_idx on public.booking_events (booking_id, created_at);
create index booking_events_branch_id_idx on public.booking_events (branch_id, created_at desc);

-- loyalty
create index loyalty_transactions_customer_id_idx on public.loyalty_transactions (customer_id, created_at desc);
create index loyalty_transactions_program_id_idx on public.loyalty_transactions (loyalty_program_id);
create index loyalty_transactions_booking_id_idx on public.loyalty_transactions (booking_id);
create index rewards_customer_id_idx on public.rewards (customer_id, status);
create index rewards_branch_id_idx on public.rewards (branch_id);

-- notifications: realtime + unread-count queries
create index notifications_branch_id_idx on public.notifications (branch_id, created_at desc);
create index notifications_recipient_idx on public.notifications (recipient_user_id, is_read, created_at desc);
create index notifications_barber_id_idx on public.notifications (barber_id, created_at desc);

-- shop devices
create index shop_devices_branch_id_idx on public.shop_devices (branch_id);
create index device_sessions_shop_device_id_idx on public.device_sessions (shop_device_id, started_at desc);

-- staff / settings / audit
create index staff_roles_user_id_idx on public.staff_roles (user_id);
create index staff_roles_branch_id_idx on public.staff_roles (branch_id, role);
create index settings_branch_id_idx on public.settings (branch_id);
create index audit_logs_branch_id_idx on public.audit_logs (branch_id, created_at desc);
create index audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id);
