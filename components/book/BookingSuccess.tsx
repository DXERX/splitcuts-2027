"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button, LinkButton } from "@/components/ui/Button";
import { ConcretePanel } from "@/components/ui/ConcretePanel";
import { formatSlotLabel } from "@/lib/timeSlots";
import { fadeUp, staggerChildren } from "@/lib/motion";
import { isTamaraEligible, TAMARA_MIN_BOOKING_SAR, TAMARA_PROCESSING_FEE_SAR, tamaraChargeTotal } from "@/lib/payments/tamaraEligibility";
import { TamaraBadge } from "@/components/ui/TamaraBadge";
import { isValidSaudiPhone, toE164Saudi } from "@/lib/phone";

const TAMARA_ERROR_MESSAGES: Record<string, string> = {
  PHONE_REQUIRED: "Enter a phone number to pay with Tamara.",
  BELOW_TAMARA_MINIMUM: "This total is below Tamara's minimum for instalments.",
  FORBIDDEN: "Couldn't verify this booking is yours.",
  APPOINTMENTS_NOT_FOUND: "Couldn't find that booking anymore.",
};

interface Summary {
  serviceName: string;
  barberName: string;
  date: string;
  time: string;
  bookingId: string;
  /** Every appointment row this confirmation covers (a combined multi-service
   * booking creates one per selected service) -- needed so a Tamara payment
   * can be tied to all of them at once. */
  appointmentIds?: string[];
  totalPrice?: number;
  phone?: string;
  name?: string;
}

function buildIcs(summary: Summary): string {
  const [y, mo, d] = summary.date.split("-").map(Number);
  const [h, mi] = summary.time.split(":").map(Number);
  const start = new Date(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  const fmt = (dt: Date) =>
    dt.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `UID:${summary.bookingId}@splitcuts`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:Split Cuts -- ${summary.serviceName} with ${summary.barberName}`,
    "LOCATION:Split Cuts, Abhur Al Shamaliyah, Jeddah",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

export function BookingSuccess({ summary }: { summary: Summary }) {
  const dateLabel = new Date(`${summary.date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const [tamaraLoading, setTamaraLoading] = useState(false);
  const [tamaraError, setTamaraError] = useState<string | null>(null);
  // A signed-in customer can finish a booking without ever entering a phone
  // (only guests are required to), so Tamara -- which needs one on every
  // order -- may need to collect it right here instead of failing later.
  const [phoneInput, setPhoneInput] = useState(summary.phone ?? "");
  const needsPhoneInput = !summary.phone;
  const canPayWithTamara =
    (summary.appointmentIds?.length ?? 0) > 0 && isTamaraEligible(summary.totalPrice ?? 0);
  const tamaraTotal = tamaraChargeTotal(summary.totalPrice ?? 0);

  async function payWithTamara() {
    if (!summary.appointmentIds) return;
    const phoneToSend = summary.phone || phoneInput;
    if (!isValidSaudiPhone(phoneToSend)) {
      setTamaraError("Enter a valid Saudi mobile number to continue.");
      return;
    }
    setTamaraLoading(true);
    setTamaraError(null);
    try {
      const res = await fetch("/api/payments/tamara/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Omit `name` entirely when blank -- sending it as "" used to trip
        // the API route's validation and fail the whole request.
        body: JSON.stringify({
          appointmentIds: summary.appointmentIds,
          phone: toE164Saudi(phoneToSend),
          ...(summary.name ? { name: summary.name } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(TAMARA_ERROR_MESSAGES[data.error] ?? data.error ?? "Couldn't start Tamara checkout.");
      }
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setTamaraError((err as Error).message);
      setTamaraLoading(false);
    }
  }

  return (
    <section className="relative flex min-h-[calc(100svh-var(--nav-height))] w-full items-center overflow-hidden bg-ink">
      <ConcretePanel className="absolute inset-0 h-full w-full" tone="steel" />
      <div className="absolute inset-0 bg-ink/75" />

      <motion.div
        initial="hidden"
        animate="show"
        variants={staggerChildren(0.08)}
        className="relative z-10 mx-auto w-full max-w-2xl px-6 py-20 text-center md:px-10"
      >
        <motion.h1
          variants={fadeUp}
          className="font-display text-display-lg uppercase text-paper"
        >
          LOCKED IN.
        </motion.h1>

        <motion.div variants={fadeUp} className="mt-10 text-left">
          <p className="font-display text-3xl uppercase text-paper">{summary.barberName}</p>
          <p className="mt-2 font-sans text-base text-ink-200">
            {summary.serviceName} · {formatSlotLabel(summary.time)}
          </p>
          <p className="mt-1 font-sans text-sm text-ink-400">{dateLabel}</p>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-8 flex flex-wrap justify-center gap-4">
          <LinkButton href={buildIcs(summary)} download="split-cuts-booking.ics" variant="primary" size="lg">
            ADD TO CALENDAR
          </LinkButton>
          <LinkButton
            href="https://maps.app.goo.gl/i7tVN1uw8ZLwkyGu6"
            target="_blank"
            rel="noreferrer"
            variant="secondary"
            size="lg"
          >
            DIRECTIONS
          </LinkButton>
        </motion.div>

        {canPayWithTamara && (
          <motion.div variants={fadeUp} className="mt-6 flex flex-col items-center gap-3">
            <p className="font-display text-sm uppercase tracking-wide text-paper">
              Get a New Look with <TamaraBadge className="align-middle" />
            </p>
            {needsPhoneInput && (
              <input
                type="tel"
                inputMode="numeric"
                placeholder="05XXXXXXXX"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="w-48 border-b border-ink-600 bg-transparent px-2 py-1 text-center font-sans text-sm text-paper placeholder:text-ink-600 focus:border-paper focus:outline-none"
              />
            )}
            <Button variant="secondary" size="lg" disabled={tamaraLoading} onClick={() => void payWithTamara()}>
              {tamaraLoading ? "OPENING TAMARA…" : `PAY ${tamaraTotal} SAR WITH TAMARA`}
            </Button>
            <p className="font-sans text-xs text-ink-500">
              Includes a {TAMARA_PROCESSING_FEE_SAR} SAR processing fee — optional, your booking stands either way.
            </p>
            {tamaraError && <p className="font-sans text-xs text-red-400">{tamaraError}</p>}
          </motion.div>
        )}

        {!canPayWithTamara && !isTamaraEligible(summary.totalPrice ?? 0) && (summary.totalPrice ?? 0) > 0 && (
          <motion.p variants={fadeUp} className="mt-6 font-sans text-xs text-ink-600">
            Orders over {TAMARA_MIN_BOOKING_SAR} SAR can split payment with Tamara.
          </motion.p>
        )}

        <motion.p variants={fadeUp} className="mt-10 font-sans text-[10px] tracking-widest text-ink-600">
          SPLIT CUTS / ABHUR, JEDDAH
        </motion.p>
      </motion.div>
    </section>
  );
}
