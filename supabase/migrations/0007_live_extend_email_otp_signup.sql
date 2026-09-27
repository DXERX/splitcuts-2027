-- =============================================================================
-- Broadens the auto-profile trigger for the new email-OTP registration flow.
--
-- Before this, handle_new_auth_user() only ever set profiles.phone from
-- new.phone -- a column Supabase only populates for phone-based signups. The
-- new login flow authenticates by email OTP instead (free; SMS needs a paid
-- provider), so new.phone is always null there. This adds a fallback to
-- pull the phone out of raw_user_meta_data when present, and makes a
-- duplicate-phone conflict fail soft (profile still gets created, just
-- without the phone) instead of blocking account creation outright.
--
-- Purely additive: CREATE OR REPLACE FUNCTION does not touch any existing
-- row, and every already-registered profile is untouched. Safe to run
-- against the live database.
-- =============================================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_phone text := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');
begin
  begin
    insert into public.profiles (id, full_name, phone, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', null),
      coalesce(new.phone, meta_phone),
      'customer'
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    -- Another profile already owns this phone number -- still create the
    -- account, just without attaching the phone, rather than failing the
    -- whole signup.
    insert into public.profiles (id, full_name, role)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', null), 'customer')
    on conflict (id) do nothing;
  end;
  return new;
end;
$$;
