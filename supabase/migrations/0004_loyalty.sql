-- 0004_loyalty.sql
-- Loyalty programs, an append-only transaction ledger, and earned rewards.

create table public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete cascade, -- null = applies to all branches
  name text not null,
  description text,
  visits_required int not null check (visits_required > 0),
  reward_type text not null default 'free_service',
  reward_service_id uuid references public.services (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.loyalty_programs is 'e.g. "3 paid visits -> next eligible visit free". Evaluated automatically when a booking is marked completed.';

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  loyalty_program_id uuid references public.loyalty_programs (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  type public.loyalty_transaction_type not null,
  amount int not null default 1,
  reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.loyalty_transactions is 'Append-only ledger. Never derive customer loyalty progress from a mutable counter -- always sum this table.';

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  loyalty_program_id uuid not null references public.loyalty_programs (id) on delete restrict,
  branch_id uuid references public.branches (id) on delete set null,
  reward_type text not null default 'free_service',
  status public.reward_status not null default 'available',
  earned_at timestamptz not null default now(),
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_booking_id uuid references public.bookings (id) on delete set null,
  max_value numeric(10, 2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A view that computes each customer's live progress toward every active
-- program, so the frontend never has to re-derive it from the ledger itself.
create view public.customer_loyalty_progress as
select
  c.id as customer_id,
  lp.id as loyalty_program_id,
  lp.branch_id,
  lp.name,
  lp.visits_required,
  coalesce(sum(lt.amount) filter (where lt.type = 'visit_earned'), 0)
    - coalesce(sum(lt.amount) filter (where lt.type = 'visit_removed'), 0) as visits_progress
from public.customers c
cross join public.loyalty_programs lp
left join public.loyalty_transactions lt
  on lt.customer_id = c.id and lt.loyalty_program_id = lp.id
where lp.is_active
group by c.id, lp.id, lp.branch_id, lp.name, lp.visits_required;
