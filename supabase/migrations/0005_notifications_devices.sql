-- 0005_notifications_devices.sql
-- Shop device registry (cashier terminals, etc.), device sessions, and the
-- notifications table that powers the realtime shop-mode UI.

create table public.shop_devices (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  device_name text not null,
  device_type public.shop_device_type not null default 'cashier_terminal',
  last_seen_at timestamptz,
  notifications_enabled boolean not null default true,
  voice_enabled boolean not null default true,
  language text not null default 'en',
  volume numeric(3, 2) not null default 0.80 check (volume between 0 and 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shop_devices is 'A registered "Shop Mode" screen (cashier terminal, barber display, kiosk). Heartbeats update last_seen_at.';

create table public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_device_id uuid not null references public.shop_devices (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table public.device_sessions is 'Tracks who was signed into a given shop device and for how long.';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  recipient_user_id uuid references public.profiles (id) on delete cascade,
  barber_id uuid references public.barbers (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.notifications is 'Drives the in-app notification bell and (via Realtime INSERT events) the shop-mode audio/TTS announcement.';
