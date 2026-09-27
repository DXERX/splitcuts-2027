-- 0006_staff_settings_audit.sql
-- Explicit staff-role assignments (separate from profiles.role so a person
-- can hold different roles at different branches), branch/global settings,
-- and a general-purpose audit log for administrative changes.

create table public.staff_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  role public.app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, branch_id, role)
);

comment on table public.staff_roles is 'Authoritative per-branch role grants, used by RLS policies. profiles.role/branch_id is the primary/home assignment; this table is the source of truth for multi-branch staff.';

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete cascade, -- null = global default
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, key)
);

comment on table public.settings is 'Key/value config, e.g. booking lead-time, cancellation window, shop-mode defaults. branch_id null = platform-wide default, overridden per branch.';

create table public.audit_logs (
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

comment on table public.audit_logs is 'General administrative audit trail (settings changes, role changes, etc.). Booking-specific history lives in booking_events instead.';
