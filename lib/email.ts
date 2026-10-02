// lib/email.ts
// Minimal client-side sanity check for an email address -- just enough to
// catch obvious typos before it's sent to create_appointment() as
// customer_email. Not meant to be a strict RFC validator (nothing is), and
// deliberately permissive -- the real validation that matters is Supabase's
// own at actual signup/OTP time.
export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}
