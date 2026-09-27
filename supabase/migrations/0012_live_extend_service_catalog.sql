-- =============================================================================
-- Migration 0012: real service catalog (from the posted price menu) + a real
-- category column.
--
-- Fully additive:
--   1. `category` is a new NULLABLE column -- every existing service keeps
--      category = null and keeps rendering exactly as before (see
--      lib/serviceCategories.ts, which now prefers this column but falls
--      back to its old name-keyword guess whenever it's null).
--   2. Each new service is inserted only if a service with that exact name
--      doesn't already exist for that branch (NOT EXISTS guard) -- safe to
--      re-run, and never creates a duplicate if some of these were already
--      entered by hand.
--   3. "Perm" is not deleted outright (it may be referenced by past
--      appointments via service_id) -- it's deactivated (is_active = false)
--      the same way any other retired service would be, so it silently
--      disappears from booking without breaking a single historical row.
--      No-op if no such row exists.
--
-- Prices/categories match the menu exactly. Durations aren't on the menu, so
-- they're a barbershop-reasonable estimate -- edit the `duration` column
-- (minutes) directly in the services table for any that need adjusting.
-- =============================================================================

alter table public.services add column if not exists category text;

-- Retire Perm (Style, listed at 150 SAR on the old sheet) without touching
-- any appointment history that points at it.
update public.services
  set is_active = false
  where is_active
    and (name_en ilike '%perm%' or name_ar ilike '%كيرلي%');

do $$
declare
  v_services jsonb := '[
    {"name_en": "Hair + Beard", "name_ar": "شعر ودقن", "price": 60,  "duration": 45,  "category": "CUTS"},
    {"name_en": "Hair",         "name_ar": "شعر",       "price": 40,  "duration": 30,  "category": "CUTS"},
    {"name_en": "Beard",        "name_ar": "دقن",       "price": 20,  "duration": 15,  "category": "CUTS"},
    {"name_en": "Design",       "name_ar": "رسم",       "price": 20,  "duration": 15,  "category": "CUTS"},

    {"name_en": "Cornrows",     "name_ar": "كورن روز",  "price": 99,  "duration": 90,  "category": "STYLE"},
    {"name_en": "Dreadlocks",   "name_ar": "دريدز",     "price": 199, "duration": 180, "category": "STYLE"},
    {"name_en": "Twists",       "name_ar": "تويست",     "price": 199, "duration": 120, "category": "STYLE"},

    {"name_en": "Dreadlocks",   "name_ar": "دريدز",     "price": 149, "duration": 90,  "category": "CARE"},
    {"name_en": "Hair",         "name_ar": "شعر",       "price": 99,  "duration": 30,  "category": "CARE"},
    {"name_en": "Skin",         "name_ar": "بشرة",      "price": 49,  "duration": 20,  "category": "CARE"},
    {"name_en": "Hair Dye",     "name_ar": "صبغة شعر",  "price": 99,  "duration": 60,  "category": "CARE"},
    {"name_en": "Color pull",   "name_ar": "سحب لون",   "price": 149, "duration": 90,  "category": "CARE"}
  ]';
  v_row jsonb;
  v_branch record;
begin
  for v_branch in select id from public.branches where is_active loop
    for v_row in select * from jsonb_array_elements(v_services) loop
      if not exists (
        select 1 from public.services s
        where s.branch_id = v_branch.id
          and s.name_en = (v_row ->> 'name_en')
          and s.price = (v_row ->> 'price')::numeric
      ) then
        insert into public.services (branch_id, name_en, name_ar, price, duration, category, is_active)
        values (
          v_branch.id,
          v_row ->> 'name_en',
          v_row ->> 'name_ar',
          (v_row ->> 'price')::numeric,
          (v_row ->> 'duration')::int,
          v_row ->> 'category',
          true
        );
      end if;
    end loop;
  end loop;
end $$;
