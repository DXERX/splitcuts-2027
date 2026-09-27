-- =============================================================================
-- Migration 0014:
--   Lets the University Student Package (migration 0013) be paid for with
--   Tamara instead of only cash-at-counter. A cashier can still activate a
--   pending request manually (activate_customer_package, unchanged) -- this
--   just adds a second path: pay online, and the package activates itself
--   the moment Tamara confirms the charge.
--
-- Fully additive: one nullable column on the existing payments table (its
-- NOT NULL appointment_ids stays exactly as-is -- a package payment simply
-- inserts '{}' for it, same array type, no constraint relaxed), two new RLS
-- policies, and one new function. Nothing existing is altered.
-- =============================================================================

alter table public.payments
  add column if not exists customer_package_id uuid references public.customer_packages (id) on delete set null;

create index if not exists payments_customer_package_id_idx
  on public.payments (customer_package_id) where customer_package_id is not null;

-- RLS: the existing payments_select_own / payments_select_branch_staff
-- policies only look at appointment_ids, which is '{}' for a package
-- payment, so they'd never match one. These two cover that case the same
-- way: the paying customer can see their own package payments, and branch
-- staff can see package payments for packages sold at their branch.
do $$ begin
  create policy "payments_select_own_package" on public.payments for select to authenticated
    using (exists (
      select 1 from public.customer_packages cp
      where cp.id = payments.customer_package_id and cp.customer_id = auth.uid()
    ));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "payments_select_branch_staff_package" on public.payments for select to authenticated
    using (exists (
      select 1 from public.customer_packages cp
      join public.packages pk on pk.id = cp.package_id
      where cp.id = payments.customer_package_id and public.is_branch_staff(pk.branch_id)
    ));
exception when duplicate_object then null; end $$;

-- Flips a package from pending_payment -> active once its Tamara payment is
-- confirmed (called from the webhook handler and from the payment-result
-- page, whichever fires first -- idempotent so the second call is a no-op).
--
-- SECURITY: this must NEVER be callable by an ordinary signed-in customer.
-- Under RLS, "customer_packages_update_own" lets a customer update their OWN
-- pending row -- if this function ran with that customer's ordinary
-- privileges (or if EXECUTE were left grantable to `authenticated`, which is
-- Postgres's default for a newly created function), any customer could call
-- it directly on their own pending_payment row and activate their package
-- for free, without ever paying. Locked down below: execute is revoked from
-- PUBLIC and granted only to service_role, i.e. only our own server-side
-- (service-role) code -- the webhook and the result page -- can ever call it.
create or replace function public.activate_package_from_payment(p_payment_id uuid)
returns public.customer_packages
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_payment public.payments;
  v_row public.customer_packages;
  v_package public.packages;
begin
  select * into v_payment from public.payments where id = p_payment_id;
  if not found or v_payment.customer_package_id is null then
    raise exception 'PAYMENT_NOT_PACKAGE' using errcode = 'P0001';
  end if;

  select * into v_row from public.customer_packages where id = v_payment.customer_package_id;
  if not found then
    raise exception 'PACKAGE_REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Idempotent: the webhook and the browser-redirect result page can both
  -- end up calling this for the same payment -- once it's active, later
  -- calls just hand back the current row instead of erroring or re-rolling
  -- expires_at forward.
  if v_row.status = 'active' then
    return v_row;
  end if;

  if v_row.status <> 'pending_payment' then
    raise exception 'PACKAGE_NOT_PENDING' using errcode = 'P0001';
  end if;

  select * into v_package from public.packages where id = v_row.package_id;

  update public.customer_packages
    set status = 'active',
        activated_at = now(),
        expires_at = now() + make_interval(days => v_package.validity_days)
    where id = v_row.id
    returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.activate_package_from_payment(uuid) from public;
grant execute on function public.activate_package_from_payment(uuid) to service_role;
