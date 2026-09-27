-- 0002_core_tables.sql
-- Branches, profiles (linked to auth.users), customers, barbers, services and
-- everything needed to describe a barber's working hours.

-- ---------------------------------------------------------------------------
-- BRANCHES
-- ---------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address text,
  city text,
  timezone text not null default 'Asia/Riyadh',
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.branches is 'A physical Split Cuts location. All operational data is scoped to a branch.';

-- ---------------------------------------------------------------------------
-- PROFILES (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text unique,
  role public.app_role not null default 'customer',
  branch_id uuid references public.branches (id) on delete set null,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Supabase Auth owns identity; this table owns role + branch assignment. branch_id is the home branch for staff, null for customers (customers are not branch-scoped).';

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', null),
    new.phone,
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- CUSTOMERS (extends a profile with barbershop-specific customer data)
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key references public.profiles (id) on delete cascade,
  preferred_branch_id uuid references public.branches (id) on delete set null,
  notes text,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customers is 'Customer-facing extension of profiles. Row is created lazily the first time a customer profile needs shop-specific fields.';

-- ---------------------------------------------------------------------------
-- BARBERS (extends a profile with staffing data, branch-scoped)
-- ---------------------------------------------------------------------------
create table public.barbers (
  id uuid primary key references public.profiles (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  display_name text,
  bio text,
  photo_url text,
  is_bookable boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.barbers is 'A staff member who performs services. branch_id is authoritative for RLS branch isolation.';

-- ---------------------------------------------------------------------------
-- SERVICES (branch-scoped catalog)
-- ---------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  name text not null,
  description text,
  duration_minutes int not null check (duration_minutes > 0),
  price numeric(10, 2) not null check (price >= 0),
  image_path text, -- Supabase Storage object path in the "services" bucket
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.barber_services (
  barber_id uuid not null references public.barbers (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (barber_id, service_id)
);

comment on table public.barber_services is 'Which services a given barber is qualified/willing to perform.';

-- ---------------------------------------------------------------------------
-- BARBER AVAILABILITY: recurring schedule, one-off breaks, and time off
-- ---------------------------------------------------------------------------

-- Recurring weekly working hours per barber.
create table public.barber_schedules (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers (id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint barber_schedules_valid_range check (start_time < end_time)
);

-- Recurring or one-off short breaks within a working day (e.g. prayer time, lunch).
create table public.barber_breaks (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers (id) on delete cascade,
  day_of_week int check (day_of_week between 0 and 6), -- null = applies to a specific date instead
  specific_date date,
  start_time time not null,
  end_time time not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint barber_breaks_valid_range check (start_time < end_time),
  constraint barber_breaks_day_or_date check (
    (day_of_week is not null and specific_date is null)
    or (day_of_week is null and specific_date is not null)
  )
);

-- Multi-day time off (vacation, sick leave, etc.) that blocks bookings entirely.
create table public.barber_time_off (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint barber_time_off_valid_range check (starts_at < ends_at)
);
