// lib/timeSlots.ts
// Pure helpers for turning business-hours JSON + existing appointments into a
// list of bookable time slots. No network calls here -- the wizard fetches
// site_settings/appointments and hands the raw data to these functions.

export interface BusinessHours {
  default_start: string; // "14:00"
  default_end: string; // "02:00" (past midnight -- shop closes the next day)
}

export const FALLBACK_HOURS: BusinessHours = { default_start: "14:00", default_end: "02:00" };

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function toHHMM(totalMinutes: number): string {
  const m = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Extended minutes-since-midnight for a "HH:MM" slot, pushed past 24:00 when
 * it falls before opening time (a past-midnight slot like "00:30" is later
 * that same business night, not earlier that afternoon) -- lets slot/duration
 * arithmetic stay monotonic across the overnight boundary. */
export function extendedMinutes(hhmm: string, hours: BusinessHours): number {
  const open = toMinutes(hours.default_start);
  const raw = toMinutes(hhmm);
  return raw < open ? raw + 24 * 60 : raw;
}

/** True if a booking starting at `slot` and running `durationMinutes` would
 * NOT overlap any of a barber's already-busy intervals for the day (each
 * given as an "HH:MM" start plus its own duration in minutes). Duration-aware
 * -- unlike a flat set of taken start-times, this correctly blocks a slot
 * that falls inside another appointment's block even if it doesn't share
 * its exact start time. */
export function slotFitsFreely(
  slot: string,
  durationMinutes: number,
  busy: { start: string; duration: number }[],
  hours: BusinessHours,
): boolean {
  const start = extendedMinutes(slot, hours);
  const end = start + durationMinutes;
  return busy.every((b) => {
    const bStart = extendedMinutes(b.start, hours);
    const bEnd = bStart + b.duration;
    return end <= bStart || start >= bEnd;
  });
}

/** Generates "HH:MM" slots from open to close, stepping every `step` minutes.
 * Handles the shop closing after midnight (close < open means +24h). */
export function generateSlots(hours: BusinessHours, step = 30): string[] {
  const open = toMinutes(hours.default_start);
  let close = toMinutes(hours.default_end);
  if (close <= open) close += 24 * 60;

  const slots: string[] = [];
  for (let t = open; t < close; t += step) {
    slots.push(toHHMM(t));
  }
  return slots;
}

/** True if `slot` ("HH:MM") on `dateStr` (YYYY-MM-DD) has already passed,
 * accounting for slots that land after midnight (belong to the "next day"
 * relative to the shop's opening). */
export function isSlotInPast(dateStr: string, slot: string, hours: BusinessHours): boolean {
  const now = new Date();
  const [y, mo, d] = dateStr.split("-").map(Number);
  const openMinutes = toMinutes(hours.default_start);
  const [sh, sm] = slot.split(":").map(Number);
  const hh = sh ?? 0;
  const mm = sm ?? 0;
  const slotMinutes = hh * 60 + mm;
  // A slot that's numerically "earlier" than opening belongs to the next
  // calendar day (e.g. shop opens 14:00, closes 02:00 -- "01:30" is later
  // that night, not earlier that same afternoon).
  const dayOffset = slotMinutes < openMinutes ? 1 : 0;
  const slotDate = new Date(y ?? 1970, (mo ?? 1) - 1, (d ?? 1) + dayOffset, hh, mm);
  return slotDate.getTime() < now.getTime();
}

export function formatSlotLabel(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const hh = h ?? 0;
  const mm = m ?? 0;
  const period = hh >= 12 ? "PM" : "AM";
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${String(mm).padStart(2, "0")} ${period}`;
}

export function dateToString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayDateString(): string {
  return dateToString(new Date());
}

/** Business day the shop is currently in. Before opening (e.g. 01:20 when
 * the shop opened at 14:00 yesterday) still belongs to yesterday's board. */
export function businessDateString(hours: BusinessHours = FALLBACK_HOURS, now = new Date()): string {
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < toMinutes(hours.default_start)) {
    const prev = new Date(now);
    prev.setDate(prev.getDate() - 1);
    return dateToString(prev);
  }
  return dateToString(now);
}

export function slotTime(value: string | null | undefined): string {
  return (value ?? "").slice(0, 5);
}
