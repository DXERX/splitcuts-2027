-- =============================================================================
-- When a guest books online without signing in, create_appointment() stores
-- their phone and (as of this app update) email on the appointment row, but
-- customer_id stays null -- loyalty only ever accrues to an actual
-- profiles.id (profiles.id is a hard FK to auth.users.id, so there is no
-- such thing as a "guest profile"). That's fine going forward once they
-- sign in, except their past guest bookings had no way to reattach to the
-- account they just created.
--
-- The natural place to catch this is NOT account creation itself: this
-- app's login flow (app/(auth)/login/page.tsx) creates the auth.users row
-- via email OTP with no phone on it yet, then only collects the phone as a
-- separate step straight after (a plain UPDATE of profiles.phone). So the
-- actual signal to act on is "this profile's phone was just set", not "this
-- account was just created" -- hence a new trigger on public.profiles
-- rather than touching handle_new_auth_user() (left exactly as migration
-- 0007 defined it).
--
-- Deliberately narrow and safe:
--   - Only touches appointments where customer_id is still null -- never
--     reassigns an appointment that already belongs to someone.
--   - Only matches this exact profile's own phone number -- never
--     cross-links two different people.
--   - Does NOT retroactively grant missed loyalty visits: the loyalty
--     trigger (evaluate_loyalty_on_completion, see
--     0003_live_extend_events_loyalty_shopmode.sql) only fires on an UPDATE
--     OF status into 'completed' -- updating customer_id here never touches
--     the status column, so it can't re-fire that trigger. A guest visit
--     that already finished before they signed up stays un-pointed, same
--     as before; it just now shows up in their own booking history. A
--     still-upcoming ('booked') guest appointment, once linked here, DOES
--     correctly earn its visit when staff later marks it completed --
--     because by then customer_id is already set.
--
-- Purely additive: a new trigger function and a new trigger on
-- public.profiles. Does not alter handle_new_auth_user(), does not touch
-- any existing row by itself, and only starts linking appointments going
-- forward as phones get set/changed on profiles from here on. Safe to run
-- against the live database.
-- =============================================================================
create or replace function public.link_guest_bookings_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone is not null then
    update public.appointments
      set customer_id = new.id
      where customer_id is null
        and customer_phone = new.phone;
  end if;
  return new;
end;
$$;

drop trigger if exists link_guest_bookings_to_profile on public.profiles;
create trigger link_guest_bookings_to_profile
  after insert or update of phone on public.profiles
  for each row
  when (new.phone is not null)
  execute function public.link_guest_bookings_to_profile();
