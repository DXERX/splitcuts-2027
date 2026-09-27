-- 0011_storage_and_realtime.sql
-- Supabase Storage buckets/policies and Realtime publication for the tables
-- Shop Mode and the customer app subscribe to.

-- ---------------------------------------------------------------------------
-- STORAGE BUCKETS
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('barbers', 'barbers', true),   -- barber profile photos: public read
  ('services', 'services', true), -- service photos: public read
  ('gallery', 'gallery', true),   -- website gallery images: public read
  ('avatars', 'avatars', true)    -- customer avatars: public read (opt-in upload only)
on conflict (id) do nothing;

-- Public buckets above are readable by anyone (including anon), matching the
-- "do not hard-code image URLs" requirement while keeping uploads staff-only.
create policy "public_buckets_read"
  on storage.objects for select
  using (bucket_id in ('barbers', 'services', 'gallery', 'avatars'));

create policy "barbers_bucket_write_staff"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'barbers'
    and public.can_access_branch(((storage.foldername(name))[1])::uuid)
  );

create policy "barbers_bucket_update_staff"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'barbers'
    and public.can_access_branch(((storage.foldername(name))[1])::uuid)
  );

create policy "services_bucket_write_manager"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'services'
    and public.is_branch_manager(((storage.foldername(name))[1])::uuid)
  );

create policy "services_bucket_update_manager"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'services'
    and public.is_branch_manager(((storage.foldername(name))[1])::uuid)
  );

create policy "gallery_bucket_write_manager"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'gallery'
    and public.is_branch_manager(((storage.foldername(name))[1])::uuid)
  );

-- Avatars: object path convention is "<user_id>/<filename>"; a user may only
-- manage their own folder.
create policy "avatars_bucket_write_self"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_bucket_update_self"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

comment on policy "barbers_bucket_write_staff" on storage.objects is
  'Object paths under these buckets are expected as "<branch_id>/<file>" so branch-scoped RLS can apply to uploads.';

-- ---------------------------------------------------------------------------
-- REALTIME
-- ---------------------------------------------------------------------------
-- Only publish the tables that clients actually need to subscribe to.
-- Realtime respects each table's RLS policies, and the client is additionally
-- responsible for filtering subscriptions by branch_id/barber_id (see
-- lib/realtime/useBookingChannel.ts) so a branch's cashier terminal is never
-- sent every branch's traffic.
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.booking_events;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.rewards;
