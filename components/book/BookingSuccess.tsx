"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button, LinkButton } from "@/components/ui/Button";
import { ConcretePanel } from "@/components/ui/ConcretePanel";
import { formatSlotLabel } from "@/lib/timeSlots";
import { fadeUp, staggerChildren } from "@/lib/motion";
import {
  isTamaraEligible,
  TAMARA_MIN_BOOKING_SAR,
  TAMARA_PROCESSING_FEE_SAR,
  tamaraChargeTotal,
} from "@/lib/payments/tamaraEligibility";
import { TamaraBadge } from "@/components/ui/TamaraBadge";
import { isValidSaudiPhone, toE164Saudi } from "@/lib/phone";

const TAMARA_ERROR_MESSAGES: Record<string, string> = {
  PHONE_REQUIRED: "Enter a phone number to pay with Tamara.",
  BELOW_TAMARA_MINIMUM:
    "This total is below Tamara's minimum for instalments.",
  FORBIDDEN: "Couldn't verify this booking is yours.",
  APPOINTMENTS_NOT_FOUND:
    "Couldn't find that booking anymore.",
};

interface Summary {
  serviceName: string;
  barberName: string;
  date: string;
  time: string;
  bookingId: string;

  /**
   * Every appointment row this confirmation covers.
   * A combined multi-service booking creates one row
   * per selected service.
   */
  appointmentIds?: string[];

  totalPrice?: number;
  phone?: string;
  name?: string;
}

/**
 * Escape values that are written inside an ICS file.
 */
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * Booking times are stored as Jeddah/Saudi local time.
 *
 * ICS TZID prevents a device in another timezone from
 * interpreting 17:00 Jeddah as 17:00 in its own timezone.
 */
function normalizeIcsLocalDateTime(
  date: string,
  time: string,
): string {
  const cleanDate = date.replace(/-/g, "");

  const [hour = "00", minute = "00"] =
    time.slice(0, 5).split(":");

  return `${cleanDate}T${hour.padStart(2, "0")}${minute.padStart(2, "0")}00`;
}

function addMinutesToLocalBooking(
  date: string,
  time: string,
  minutes: number,
): {
  date: string;
  time: string;
} {
  const [year = 1970, month = 1, day = 1] =
    date.split("-").map(Number);

  const [hour = 0, minute = 0] =
    time.slice(0, 5).split(":").map(Number);

  /**
   * UTC is intentionally used here only as a safe
   * timezone-neutral arithmetic container.
   *
   * We are NOT converting the booking to UTC.
   */
  const value = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
    ),
  );

  value.setUTCMinutes(
    value.getUTCMinutes() + minutes,
  );

  const endDate = [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(
      2,
      "0",
    ),
    String(value.getUTCDate()).padStart(
      2,
      "0",
    ),
  ].join("-");

  const endTime = [
    String(value.getUTCHours()).padStart(
      2,
      "0",
    ),
    String(value.getUTCMinutes()).padStart(
      2,
      "0",
    ),
  ].join(":");

  return {
    date: endDate,
    time: endTime,
  };
}

function buildIcs(summary: Summary): string {
  const start = normalizeIcsLocalDateTime(
    summary.date,
    summary.time,
  );

  /**
   * Keep the current 45-minute calendar duration.
   * This can later be replaced with the actual
   * service duration if you want.
   */
  const endBooking =
    addMinutesToLocalBooking(
      summary.date,
      summary.time,
      45,
    );

  const end = normalizeIcsLocalDateTime(
    endBooking.date,
    endBooking.time,
  );

  const title = escapeIcs(
    `Split Cuts - ${summary.serviceName}`,
  );

  const description = escapeIcs(
    [
      `Your appointment at Split Cuts.`,
      `Service: ${summary.serviceName}`,
      `Barber: ${summary.barberName}`,
      `Booking: ${summary.bookingId}`,
      "",
      "We look forward to seeing you.",
    ].join("\n"),
  );

  const location = escapeIcs(
    "Split Cuts, Abhur Al Shamaliyah, Jeddah, Saudi Arabia",
  );

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Split Cuts//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",

    "BEGIN:VTIMEZONE",
    "TZID:Asia/Riyadh",
    "X-LIC-LOCATION:Asia/Riyadh",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0300",
    "TZOFFSETTO:+0300",
    "TZNAME:+03",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",

    "BEGIN:VEVENT",

    `UID:${escapeIcs(
      summary.bookingId,
    )}@splithairstudio.com`,

    `DTSTART;TZID=Asia/Riyadh:${start}`,
    `DTEND;TZID=Asia/Riyadh:${end}`,

    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,

    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",

    /**
     * Calendar reminder 30 minutes before
     * the appointment.
     */
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Split Cuts appointment in 30 minutes",
    "END:VALARM",

    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadCalendar(
  summary: Summary,
): void {
  try {
    const ics = buildIcs(summary);

    const blob = new Blob(
      [ics],
      {
        type: "text/calendar;charset=utf-8",
      },
    );

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement("a");

    anchor.href = url;

    anchor.download =
      `split-cuts-${summary.date}-${summary.time
        .slice(0, 5)
        .replace(":", "-")}.ics`;

    anchor.style.display = "none";

    document.body.appendChild(anchor);

    anchor.click();

    anchor.remove();

    /**
     * Give Safari/Chrome enough time to consume
     * the object URL before revoking it.
     */
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  } catch (error) {
    console.error(
      "Failed to create calendar event:",
      error,
    );
  }
}

export function BookingSuccess({
  summary,
}: {
  summary: Summary;
}) {
  const dateLabel = new Date(
    `${summary.date}T00:00:00`,
  ).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const [
    tamaraLoading,
    setTamaraLoading,
  ] = useState(false);

  const [
    tamaraError,
    setTamaraError,
  ] = useState<string | null>(null);

  /**
   * A signed-in customer can finish a booking
   * without ever entering a phone.
   *
   * Tamara requires one on every order, so we
   * collect it here when necessary.
   */
  const [
    phoneInput,
    setPhoneInput,
  ] = useState(
    summary.phone ?? "",
  );

  const needsPhoneInput =
    !summary.phone;

  const canPayWithTamara =
    (summary.appointmentIds?.length ??
      0) > 0 &&
    isTamaraEligible(
      summary.totalPrice ?? 0,
    );

  const tamaraTotal =
    tamaraChargeTotal(
      summary.totalPrice ?? 0,
    );

  async function payWithTamara() {
    if (!summary.appointmentIds) {
      return;
    }

    const phoneToSend =
      summary.phone ||
      phoneInput;

    if (
      !isValidSaudiPhone(
        phoneToSend,
      )
    ) {
      setTamaraError(
        "Enter a valid Saudi mobile number to continue.",
      );

      return;
    }

    setTamaraLoading(true);
    setTamaraError(null);

    try {
      const res = await fetch(
        "/api/payments/tamara/create-checkout",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            appointmentIds:
              summary.appointmentIds,

            phone:
              toE164Saudi(
                phoneToSend,
              ),

            ...(summary.name
              ? {
                  name: summary.name,
                }
              : {}),
          }),
        },
      );

      const data =
        await res.json();

      if (
        !res.ok ||
        !data.checkoutUrl
      ) {
        throw new Error(
          TAMARA_ERROR_MESSAGES[
            data.error
          ] ??
            data.error ??
            "Couldn't start Tamara checkout.",
        );
      }

      window.location.href =
        data.checkoutUrl;
    } catch (err) {
      setTamaraError(
        (err as Error).message,
      );

      setTamaraLoading(false);
    }
  }

  return (
    <section className="relative flex min-h-[calc(100svh-var(--nav-height))] w-full items-center overflow-hidden bg-ink">
      <ConcretePanel
        className="absolute inset-0 h-full w-full"
        tone="steel"
      />

      <div className="absolute inset-0 bg-ink/75" />

      <motion.div
        initial="hidden"
        animate="show"
        variants={staggerChildren(
          0.08,
        )}
        className="relative z-10 mx-auto w-full max-w-2xl px-6 py-20 text-center md:px-10"
      >
        <motion.h1
          variants={fadeUp}
          className="font-display text-display-lg uppercase text-paper"
        >
          LOCKED IN.
        </motion.h1>

        <motion.div
          variants={fadeUp}
          className="mt-10 text-left"
        >
          <p className="font-display text-3xl uppercase text-paper">
            {summary.barberName}
          </p>

          <p className="mt-2 font-sans text-base text-ink-200">
            {summary.serviceName}
            {" · "}
            {formatSlotLabel(
              summary.time,
            )}
          </p>

          <p className="mt-1 font-sans text-sm text-ink-400">
            {dateLabel}
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mt-8 flex flex-wrap justify-center gap-4"
        >
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={() => {
              downloadCalendar(
                summary,
              );
            }}
          >
            ADD TO CALENDAR
          </Button>

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
          <motion.div
            variants={fadeUp}
            className="mt-6 flex flex-col items-center gap-3"
          >
            <p className="font-display text-sm uppercase tracking-wide text-paper">
              Get a New Look with{" "}
              <TamaraBadge className="align-middle" />
            </p>

            {needsPhoneInput && (
              <input
                type="tel"
                inputMode="numeric"
                placeholder="05XXXXXXXX"
                value={phoneInput}
                onChange={(e) =>
                  setPhoneInput(
                    e.target.value,
                  )
                }
                className="w-48 border-b border-ink-600 bg-transparent px-2 py-1 text-center font-sans text-sm text-paper placeholder:text-ink-600 focus:border-paper focus:outline-none"
              />
            )}

            <Button
              variant="secondary"
              size="lg"
              disabled={
                tamaraLoading
              }
              onClick={() => {
                void payWithTamara();
              }}
            >
              {tamaraLoading
                ? "OPENING TAMARA…"
                : `PAY ${tamaraTotal} SAR WITH TAMARA`}
            </Button>

            <p className="font-sans text-xs text-ink-500">
              Includes a{" "}
              {
                TAMARA_PROCESSING_FEE_SAR
              }{" "}
              SAR processing fee —
              optional, your booking
              stands either way.
            </p>

            {tamaraError && (
              <p className="font-sans text-xs text-red-400">
                {tamaraError}
              </p>
            )}
          </motion.div>
        )}

        {!canPayWithTamara &&
          !isTamaraEligible(
            summary.totalPrice ??
              0,
          ) &&
          (summary.totalPrice ??
            0) >
            0 && (
            <motion.p
              variants={fadeUp}
              className="mt-6 font-sans text-xs text-ink-600"
            >
              Orders over{" "}
              {
                TAMARA_MIN_BOOKING_SAR
              }{" "}
              SAR can split payment
              with Tamara.
            </motion.p>
          )}

        <motion.p
          variants={fadeUp}
          className="mt-10 font-sans text-[10px] tracking-widest text-ink-600"
        >
          SPLIT CUTS / ABHUR,
          JEDDAH
        </motion.p>
      </motion.div>
    </section>
  );
}