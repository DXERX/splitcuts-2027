// lib/payments/tamaraEligibility.ts
// Tamara only supports orders at or above this total (per the shop's Tamara
// merchant agreement). Centralized here so the booking flow, and later the
// actual Tamara checkout integration once it's wired in, agree on one number
// instead of each hardcoding "100" separately.
export const TAMARA_MIN_SAR = 100;

// Flat processing fee charged only on the Tamara path (paying in-store stays
// fee-free). Added on top of the service total when the checkout session is
// created, so the amount Tamara actually charges always matches what the
// customer was shown before they tapped "pay".
export const TAMARA_PROCESSING_FEE_SAR = 1;

// A 99 SAR booking rides the fee up to exactly TAMARA_MIN_SAR -- e.g.
// Cornrows -- so eligibility is checked against the fee-INCLUSIVE total, not
// the raw service price. This is the number customer-facing copy should
// advertise as "the minimum", since it's the actual bar a booking needs to
// clear.
export const TAMARA_MIN_BOOKING_SAR = TAMARA_MIN_SAR - TAMARA_PROCESSING_FEE_SAR;

export function tamaraChargeTotal(totalSar: number): number {
  return Math.round((totalSar + TAMARA_PROCESSING_FEE_SAR) * 100) / 100;
}

export function isTamaraEligible(totalSar: number): boolean {
  return tamaraChargeTotal(totalSar) >= TAMARA_MIN_SAR;
}
