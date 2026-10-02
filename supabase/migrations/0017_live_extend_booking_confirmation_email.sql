-- =============================================================================
-- Tracks whether a booking-confirmation email has already gone out for an
-- appointment (app/api/bookings/send-confirmation/route.ts). Nullable,
-- defaults to untouched for every existing row -- purely additive, no
-- existing data is read or changed by running this migration. Lets the
-- send route be idempotent (skip if already sent) instead of re-sending on
-- a retry or on a combined booking's multiple appointment rows.
-- =============================================================================
alter table public.appointments
  add column if not exists confirmation_email_sent_at timestamptz;
