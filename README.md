# Split Cuts

Multi-branch barbershop booking platform. Next.js (App Router, TypeScript
strict) + Supabase (Postgres, Auth, Realtime, Storage, Edge Functions) as the
single source of truth.

## Architecture

- **Database is authoritative.** All booking validation (schedule, breaks,
  time off, overlap) happens in `public.create_booking()`, a Postgres
  function, not in the frontend. Double-booking is additionally guaranteed
  impossible by a GiST exclusion constraint on `bookings`
  (`bookings_no_overlap_per_barber`).
- **RLS everywhere.** Every sensitive table has Row Level Security enabled.
  Staff accounts never rely on frontend role checks — see
  `supabase/migrations/0008_rls_policies.sql`.
- **Branch isolation.** Every operational table carries `branch_id`, and RLS
  policies + Realtime subscription filters both key off it.
- **Loyalty is server-side.** A trigger on `bookings` evaluates active
  loyalty programs when a booking transitions to `completed`, writes to the
  `loyalty_transactions` ledger, and creates a `rewards` row when a threshold
  is reached.
- **Realtime is filtered.** Clients subscribe per branch (`lib/realtime`) —
  never to the whole `bookings` table.
- **Secrets stay server-side.** `SUPABASE_SERVICE_ROLE_KEY` is only read from
  `lib/supabase/server.ts`'s `createServiceRoleClient()`, Route Handlers, and
  Edge Functions — never from a Client Component.

## Getting started

### Prerequisites

- Node 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase`, or `brew install supabase/tap/supabase`)
- Docker (for local Supabase)

### 1. Install dependencies

```bash
npm install
```

### 2. Start Supabase locally

```bash
npm run supabase:start
```

This boots Postgres, Auth, Realtime, Storage, and Studio in Docker and prints
your local `API URL`, `anon key`, and `service_role key`.

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in the values `supabase start` printed (or, for a hosted project,
values from your Supabase Dashboard -> Project Settings -> API).

### 4. Apply migrations + seed data

```bash
npm run supabase:reset
```

`supabase db reset` drops and recreates the local database, runs every file
in `supabase/migrations/` in order, then runs `supabase/seed.sql`. Seed data
creates one branch ("Split Cuts — Abhur"), an owner/manager/cashier and three
barbers (Sam, Barber Two, Barber Three), six services, working hours, a
loyalty program, and a shop device — all local-dev-only accounts using the
password `password123`.

### 5. Generate TypeScript types from your schema

```bash
npm run supabase:types
```

This overwrites `lib/database.types.ts` with types generated straight from
your running database, so it can never drift from the migrations. Re-run it
after every schema change.

### 6. Run the app

```bash
npm run dev
```

- `/` — landing page, redirects signed-in users to their role's home
- `/login` — phone OTP or email/password sign-in
- `/book`, `/account` — customer booking flow + booking history/loyalty
- `/cashier` — Shop Mode: realtime booking feed, audio + text-to-speech
  announcements (click **ENABLE SHOP AUDIO** first — browsers block
  autoplay audio until a user gesture unlocks it)
- `/barber` — a barber's schedule for today, with status controls
- `/admin` — owner/manager dashboard

## Project structure

```
app/
  (auth)/login/        phone OTP + email sign-in
  (customer)/book/      booking flow (calls create_booking RPC)
  (customer)/account/    booking history + loyalty progress
  (staff)/cashier/      Shop Mode (realtime + audio/TTS)
  (staff)/barber/       barber's daily schedule
  (staff)/admin/        owner/manager dashboard
  api/bookings/         example Route Handler wrapping the RPC
  api/webhooks/         target for a Supabase Database Webhook
lib/
  supabase/             browser / server / middleware Supabase clients
  realtime/             branch- and barber-scoped Realtime hooks
  audio/                Shop Mode audio + SpeechSynthesis wrapper
  database.types.ts     generated Supabase types (see step 5 above)
  roles.ts              role -> route mapping (UX only, not enforcement)
supabase/
  migrations/           versioned schema, RLS, triggers, RPCs (0001-0011)
  seed.sql              local dev seed data
  functions/             Edge Functions (WhatsApp/SMS notification sender)
  config.toml           local Supabase CLI configuration
```

## Adding a branch

Insert a row into `public.branches`, then create `barbers`, `services`, and
`shop_devices` rows with that `branch_id`. No schema changes are needed —
multi-branch support is built into the data model from the start.

## Before going to production

- [ ] Wire a real SMS/WhatsApp provider into `supabase/functions/send-notification`
      and set its secrets with `supabase secrets set` (never in `.env`).
- [ ] Configure a Database Webhook (Dashboard -> Database -> Webhooks) on
      `INSERT` into `bookings`, pointed at `/api/webhooks/notifications` or
      directly at the Edge Function.
- [ ] Replace the seed-data auth users/password with real accounts.
- [ ] Test every RLS policy: Customer A cannot read Customer B; Barber A
      cannot read Barber B's private schedule; Branch A staff cannot reach
      Branch B's operational data; anonymous visitors get nothing sensitive.
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` never appears in a client bundle
      (`grep -r SUPABASE_SERVICE_ROLE_KEY .next/static` after `next build`
      should return nothing).
- [ ] Add `sounds/new-booking-chime.mp3` under `public/sounds/` (referenced
      by `lib/audio/shopAudio.ts` — any short chime works).
- [ ] Point `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` at
      your hosted project and run migrations there with `supabase db push`
      (or link the project with `supabase link`).
