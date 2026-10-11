-- Filtered realtime (branch_id=eq...) only delivers UPDATE/DELETE when the
-- replica identity includes the filtered columns. Default identity is the
-- primary key, so the shop tablet never saw a new status until a full reload.
alter table public.appointments replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $$;
