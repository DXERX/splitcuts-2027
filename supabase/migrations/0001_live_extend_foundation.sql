-- =============================================================================
-- PART A: extensions, roles, branches, accounts
--
-- Everything in this file is written to be safely re-runnable: if a previous
-- paste got partway through before failing on something later in the script
-- (Supabase's SQL editor commits each statement as it goes, it does not roll
-- back earlier statements when a later one errors), running this file again
-- must not blow up on "already exists" -- it should just finish the job.
-- =============================================================================
create extension if not exists "uuid-ossp";

do $$ begin
  create type public.app_role as enum ('owner', 'manager', 'cashier', 'customer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reward_status as enum ('available', 'reserved', 'redeemed', 'expired', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.staff_notification_type as enum ('new_booking', 'booking_cancelled', 'booking_rescheduled', 'customer_checked_in', 'booking_starting_soon', 'reward_earned');
exception when duplicate_object then null;
end $$;

create table if not exists public.branches (
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

insert into public.branches (id, name, slug, city, timezone, is_active)
values ('00000000-0000-0000-0000-000000000001', 'Split Cuts', 'main', 'Jeddah', 'Asia/Riyadh', true)
on conflict (id) do nothing;

create table if not exists public.profiles (
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

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', null), new.phone, 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create table if not exists public.customers (
  id uuid primary key references public.profiles (id) on delete cascade,
  notes text,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  role public.app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, branch_id, role)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  table_name text,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
