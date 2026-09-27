-- 0001_extensions_and_enums.sql
-- Extensions and shared enum types used across the Split Cuts schema.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "btree_gist"; -- needed for exclusion constraints on time ranges

-- Staff / account roles. "customer" is included so profiles.role can represent everyone.
create type public.app_role as enum (
  'owner',
  'manager',
  'cashier',
  'barber',
  'customer'
);

-- Controlled booking lifecycle. Never accept a free-text status from the client.
create type public.booking_status as enum (
  'pending',
  'confirmed',
  'checked_in',
  'in_service',
  'completed',
  'cancelled',
  'no_show'
);

create type public.booking_event_type as enum (
  'booking_created',
  'booking_confirmed',
  'booking_rescheduled',
  'barber_changed',
  'customer_checked_in',
  'service_started',
  'service_completed',
  'booking_cancelled',
  'marked_no_show',
  'booking_status_changed'
);

create type public.loyalty_transaction_type as enum (
  'visit_earned',
  'visit_removed',
  'reward_earned',
  'reward_redeemed',
  'manual_adjustment',
  'reward_expired'
);

create type public.reward_status as enum (
  'available',
  'reserved',
  'redeemed',
  'expired',
  'cancelled'
);

create type public.notification_type as enum (
  'new_booking',
  'booking_cancelled',
  'booking_rescheduled',
  'customer_arrived',
  'booking_starting_soon',
  'reward_earned'
);

create type public.shop_device_type as enum (
  'cashier_terminal',
  'barber_display',
  'kiosk',
  'other'
);
