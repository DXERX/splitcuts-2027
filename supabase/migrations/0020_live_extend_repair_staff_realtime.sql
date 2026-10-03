-- =============================================================================
-- Migration 0020
-- Repair the live appointment status constraint.
--
-- Older databases may still have the original appointments_status_check.
-- Migration 0002 attempted to add the expanded constraint but deliberately
-- ignored duplicate_object, so an existing legacy constraint was left intact.
-- =============================================================================

alter table public.appointments
  drop constraint if exists appointments_status_check;

alter table public.appointments
  add constraint appointments_status_check
  check (
    status in (
      'booked',
      'checked_in',
      'in_service',
      'completed',
      'cancelled',
      'no_show'
    )
  );

-- Ensure the expected shop-floor transitions exist.
insert into public.appointment_status_transitions (from_status, to_status)
values
  ('booked', 'checked_in'),
  ('checked_in', 'in_service'),
  ('in_service', 'completed'),
  ('booked', 'no_show')
on conflict do nothing;

-- Make sure both tables required by the live staff UI are published
-- through Supabase Realtime.
do $$
declare
  t text;
begin
  foreach t in array array['appointments', 'staff_notifications']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        t
      );
    end if;
  end loop;
end $$;
