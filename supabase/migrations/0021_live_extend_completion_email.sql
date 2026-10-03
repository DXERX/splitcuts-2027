-- Delivery claim prevents simultaneous DONE-email requests from double-sending.
alter table public.appointments
  add column if not exists completion_email_sent_at timestamptz,
  add column if not exists completion_email_claimed_at timestamptz;
