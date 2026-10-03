"use client";

import { useState } from "react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DateQuickPicker } from "@/components/booking/DateQuickPicker";
import { TimeSlots } from "@/components/book/TimeSlots";
import { Button } from "@/components/ui/Button";
import {
  FALLBACK_HOURS,
  generateSlots,
  isSlotInPast,
  slotFitsFreely,
  todayDateString,
  type BusinessHours,
} from "@/lib/timeSlots";

const ERROR_MESSAGES: Record<string, string> = {
  APPOINTMENT_NOT_RESCHEDULABLE: "This booking can no longer be changed online -- call the shop.",
  TOO_CLOSE_TO_RESCHEDULE: "It's too close to your appointment time to reschedule online -- call the shop.",
  START_TIME_IN_PAST: "Pick a time in the future.",
  OUTSIDE_BUSINESS_HOURS: "That time is outside our business hours.",
  SLOT_ALREADY_BOOKED: "That slot just got taken -- pick another time.",
  CUSTOMER_ALREADY_BOOKED: "You already have a booking at that time.",
};

const RESCHEDULE_CUTOFF_MS = 15 * 60 * 1000;

const STATUS_LABEL: Record<string, string> = {
  booked: "BOOKED",
  checked_in: "CHECKED IN",
  in_service: "IN SERVICE",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
  no_show: "NO SHOW",
};

/** Same read-only row as before, but a 'booked' upcoming appointment gets
 * Cancel / Reschedule actions inline -- no separate page, no dialog. */
export function ManageBookingRow({
  id,
  barberId,
  serviceName,
  barberName,
  durationMinutes,
  start,
  status,
}: {
  id: string;
  barberId: string;
  serviceName: string;
  barberName: string;
  durationMinutes: number;
  start: string;
  status: string;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [mode, setMode] = useState<"idle" | "confirm_cancel" | "reschedule">("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayDateString());
  const [time, setTime] = useState("");
  const [hours, setHours] = useState<BusinessHours>(FALLBACK_HOURS);
  const [dayBusy, setDayBusy] = useState<{ start: string; duration: number }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const dimmed = status === "cancelled" || status === "no_show";
  const isUpcoming = status === "booked" && new Date(start).getTime() > Date.now();
  // Cancel stays allowed right up to the appointment, but reschedule closes
  // 15 minutes out -- the barber may already be prepping/expecting them by
  // then. The RPC enforces this too (TOO_CLOSE_TO_RESCHEDULE), this just
  // hides the button before the customer wastes a trip picking a new slot.
  const canReschedule = isUpcoming && new Date(start).getTime() > Date.now() + RESCHEDULE_CUTOFF_MS;

  async function loadSlotsFor(newDate: string) {
    setSlotsLoading(true);
    const [{ data: hoursRow }, { data: busyRows }] = await Promise.all([
      supabase.from("site_settings").select("value").eq("key", "business_hours").maybeSingle(),
      supabase
        .from("appointments")
        .select("appointment_time, services:services(duration)")
        .eq("barber_id", barberId)
        .eq("appointment_date", newDate)
        .neq("id", id)
        .not("status", "in", "(cancelled,no_show)"),
    ]);

    const value = hoursRow?.value as Partial<BusinessHours> | null | undefined;
    const resolvedHours =
      value?.default_start && value?.default_end
        ? { default_start: value.default_start, default_end: value.default_end }
        : FALLBACK_HOURS;
    setHours(resolvedHours);

    type Row = { appointment_time: string | null; services: { duration: number | null } | { duration: number | null }[] | null };
    const busy = ((busyRows ?? []) as Row[]).flatMap((row) => {
      const t = row.appointment_time?.slice(0, 5);
      if (!t) return [];
      const svc = Array.isArray(row.services) ? row.services[0] : row.services;
      return [{ start: t, duration: svc?.duration ?? 30 }];
    });
    setDayBusy(busy);
    setSlotsLoading(false);
  }

  function startReschedule() {
    setError(null);
    setMode("reschedule");
    setTime("");
    void loadSlotsFor(date);
  }

  function pickDate(newDate: string) {
    setDate(newDate);
    setTime("");
    void loadSlotsFor(newDate);
  }

  const slotStates = generateSlots(hours, 30).map((t) => {
    const past = date === todayDateString() && isSlotInPast(date, t, hours);
    return { time: t, available: !past && slotFitsFreely(t, durationMinutes, dayBusy, hours) };
  });

  async function confirmReschedule() {
    if (!time) return;
    setLoading(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("reschedule_appointment", {
      p_appointment_id: id,
      p_new_date: date,
      p_new_time: `${time}:00`,
    });
    setLoading(false);
    if (rpcError) {
      setError(ERROR_MESSAGES[rpcError.message] ?? rpcError.message);
      return;
    }
    void fetch("/api/bookings/send-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: id }),
    }).catch(() => {});
    setMode("idle");
    router.refresh();
  }

  async function confirmCancel() {
    setLoading(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("update_appointment_status", {
      p_appointment_id: id,
      p_new_status: "cancelled",
      p_reason: "Cancelled by customer",
    });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setMode("idle");
    router.refresh();
  }

  return (
    <div className="px-6 py-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className={clsx("font-display text-lg uppercase tracking-tight", dimmed ? "text-ink-400" : "text-paper")}>
            {serviceName}
          </p>
          <p className="mt-0.5 font-sans text-xs tracking-widest text-ink-400">
            with {barberName} ·{" "}
            {new Date(start).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <span
            className={clsx(
              "font-sans text-[10px] font-semibold tracking-widest",
              status === "completed" && "text-status-live",
              (status === "cancelled" || status === "no_show") && "text-ink-600",
              (status === "booked" || status === "checked_in" || status === "in_service") && "text-paper",
            )}
          >
            {STATUS_LABEL[status] ?? status.toUpperCase()}
          </span>

          {isUpcoming && mode === "idle" && (
            <div className="flex gap-3">
              {canReschedule && (
                <button
                  type="button"
                  onClick={startReschedule}
                  className="font-sans text-xs font-semibold tracking-widest text-ink-300 hover:text-paper"
                >
                  RESCHEDULE
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("confirm_cancel");
                }}
                className="font-sans text-xs font-semibold tracking-widest text-red-400/80 hover:text-red-400"
              >
                CANCEL
              </button>
            </div>
          )}
        </div>
      </div>

      {mode === "confirm_cancel" && (
        <div className="mt-4 hairline p-4">
          <p className="font-sans text-sm text-paper">Cancel this booking?</p>
          {error && <p className="mt-2 font-sans text-sm text-red-400">{error}</p>}
          <div className="mt-3 flex gap-3">
            <Button variant="primary" size="md" disabled={loading} onClick={() => void confirmCancel()}>
              {loading ? "CANCELLING…" : "YES, CANCEL"}
            </Button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="font-sans text-xs font-semibold tracking-widest text-ink-400 hover:text-paper"
            >
              NEVER MIND
            </button>
          </div>
        </div>
      )}

      {mode === "reschedule" && (
        <div className="mt-4 hairline p-4">
          <p className="tag-number text-ink-600">NEW DATE</p>
          <div className="mt-3">
            <DateQuickPicker selected={date} onSelect={pickDate} />
          </div>
          <p className="mt-5 tag-number text-ink-600">NEW TIME</p>
          <div className="mt-3">
            {slotsLoading ? (
              <p className="font-sans text-sm text-ink-400">Loading times…</p>
            ) : (
              <TimeSlots slots={slotStates} selected={time} onSelect={setTime} />
            )}
          </div>
          {error && <p className="mt-3 font-sans text-sm text-red-400">{error}</p>}
          <div className="mt-4 flex gap-3">
            <Button
              variant="primary"
              size="md"
              disabled={loading || !time}
              onClick={() => void confirmReschedule()}
            >
              {loading ? "SAVING…" : "CONFIRM NEW TIME"}
            </Button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="font-sans text-xs font-semibold tracking-widest text-ink-400 hover:text-paper"
            >
              NEVER MIND
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
