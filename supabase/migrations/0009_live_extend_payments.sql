-- =============================================================================
-- PART F: payments table for the Tamara (BNPL) integration.
--
-- Booking is NEVER gated on payment -- the appointment is already created
-- (slot already reserved, exactly as every booking works today) before a
-- payment row is ever created. Tamara is offered as an optional "pay in
-- advance" action on the confirmation screen once the total is >= 100 SAR
-- (see lib/payments/tamaraEligibility.ts), not a checkout you must clear to
-- book. If a customer abandons the Tamara checkout, their appointment still
-- stands -- they just pay at the shop as before. This keeps the existing
-- create_appointment()/slot-locking logic completely untouched.
--
-- One payment can cover a combined multi-service booking (several chained
-- appointment rows created back-to-back for one visit), hence
-- appointment_ids as an array rather than a single FK.
--
-- Purely additive: a new table, nothing existing is altered.
-- =============================================================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  appointment_ids uuid[] not null,
  provider text not null default 'tamara',
  -- Our own reference, minted before the Tamara checkout session exists, so
  -- the post-checkout redirect (success/failure/cancel) and the webhook both
  -- have something to look this row up by even before/independent of
  -- provider_order_id being known.
  merchant_reference text not null,
  provider_order_id text,
  provider_checkout_id text,
  checkout_url text,
  status text not null default 'pending',
  amount numeric(10, 2) not null,
  currency text not null default 'SAR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.payments
    add constraint payments_status_check
    check (status in ('pending', 'approved', 'authorised', 'declined', 'canceled', 'expired', 'captured', 'refunded'));
exception when duplicate_object then null; end $$;

create index if not exists payments_appointment_ids_idx on public.payments using gin (appointment_ids);
create unique index if not exists payments_provider_order_id_idx on public.payments (provider, provider_order_id) where provider_order_id is not null;
create unique index if not exists payments_merchant_reference_idx on public.payments (merchant_reference);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;

-- Reads only -- every write (create-checkout, webhook, authorise) goes
-- through the service-role client from a Route Handler, never straight from
-- the browser, so there are no insert/update policies here.
do $$ begin
  create policy "payments_select_own" on public.payments for select to authenticated
    using (exists (
      select 1 from public.appointments ap
      where ap.id = any (payments.appointment_ids) and ap.customer_id = auth.uid()
    ));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "payments_select_branch_staff" on public.payments for select to authenticated
    using (exists (
      select 1 from public.appointments ap
      where ap.id = any (payments.appointment_ids) and public.is_branch_staff(ap.branch_id)
    ));
exception when duplicate_object then null; end $$;
