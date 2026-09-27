-- =============================================================================
-- PART F: Realtime (Shop Mode needs INSERT/UPDATE on appointments + the new
-- staff_notifications feed). ALTER PUBLICATION ... ADD TABLE has no IF NOT
-- EXISTS clause, so this guards manually against a table already being
-- published (we don't control what's already in supabase_realtime here).
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['appointments', 'booking_events', 'staff_notifications', 'rewards']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
