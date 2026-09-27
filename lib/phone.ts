// lib/phone.ts
// Single source of truth for Saudi phone normalization -- used at login
// (profile phone), in the booking flow (customer_phone on appointments),
// and by the Tamara checkout route (consumer.phone_number + the guest
// ownership check). Idempotent: normalizing an already-normalized number
// (or one a user pastes with +966/966 already on it) returns it unchanged
// instead of double-prefixing.
export function toE164Saudi(input: string): string {
  const digits = input.replace(/\D/g, "");
  const local = digits.replace(/^966/, "").replace(/^0+/, "");
  return `+966${local}`;
}

/** Saudi mobile numbers are 9 digits after the country code, starting with 5. */
export function isValidSaudiPhone(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  const local = digits.replace(/^966/, "").replace(/^0+/, "");
  return /^5\d{8}$/.test(local);
}
