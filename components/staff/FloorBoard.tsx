"use client";

import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import {
  extendedMinutes,
  formatSlotLabel,
  generateSlots,
  slotTime,
  type BusinessHours,
} from "@/lib/timeSlots";
import {
  STATUS_LABEL,
  STATUS_STYLE,
  type Barber,
  type LiveAppointment,
} from "@/lib/staff/appointments";
import type { AppointmentStatus } from "@/lib/database.types";

const NEXT_STATUS: Partial<Record<AppointmentStatus, AppointmentStatus>> = {
  booked: "checked_in",
  checked_in: "in_service",
  in_service: "completed",
};

const NEXT_LABEL: Partial<Record<AppointmentStatus, string>> = {
  booked: "CHECK IN",
  checked_in: "START",
  in_service: "DONE",
};

function occupies(appt: LiveAppointment, slot: string, hours: BusinessHours): boolean {
  const start = slotTime(appt.appointment_time);
  if (!start) return false;
  const startMin = extendedMinutes(start, hours);
  const endMin = startMin + (appt.duration || 30);
  const slotMin = extendedMinutes(slot, hours);
  return slotMin >= startMin && slotMin < endMin;
}

function isStart(appt: LiveAppointment, slot: string): boolean {
  return slotTime(appt.appointment_time) === slot;
}

export function FloorBoard({
  barbers,
  appointments,
  hours,
  interactive = false,
  confirmingNoShow,
  onAdvance,
  onNoShow,
}: {
  barbers: Barber[];
  appointments: LiveAppointment[];
  hours: BusinessHours;
  interactive?: boolean;
  confirmingNoShow?: string | null;
  onAdvance?: (appointment: LiveAppointment) => void;
  onNoShow?: (appointment: LiveAppointment) => void;
}) {
  const slots = generateSlots(hours, 30);
  const active = appointments.filter((a) => a.status !== "cancelled");

  if (barbers.length === 0) {
    return <p className="px-5 py-8 font-sans text-sm text-ink-400">No barbers on this branch yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-24 bg-ink px-3 py-3 font-sans text-[10px] font-semibold tracking-widest text-ink-400">
              TIME
            </th>
            {barbers.map((b) => (
              <th
                key={b.id}
                className="min-w-[180px] border-l border-ink-800 px-3 py-3 font-display text-sm uppercase text-paper"
              >
                {b.name || b.nickname || "Barber"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot} className="border-t border-ink-800">
              <td className="sticky left-0 z-10 bg-ink px-3 py-2 font-sans text-xs tabular-nums text-ink-200">
                {formatSlotLabel(slot)}
              </td>
              {barbers.map((b) => {
                const appt = active.find((a) => a.barber_id === b.id && occupies(a, slot, hours));
                const start = appt ? isStart(appt, slot) : false;
                return (
                  <td key={`${b.id}-${slot}`} className="border-l border-ink-800 px-2 py-1.5 align-top">
                    {!appt ? (
                      <span className="block min-h-[2.25rem] text-[10px] tracking-widest text-ink-600">OPEN</span>
                    ) : start ? (
                      <div
                        className={clsx(
                          "min-h-[2.25rem] px-2 py-1",
                          appt.status === "in_service" && "bg-status-live/15",
                          appt.status === "checked_in" && "bg-status-hold/15",
                          appt.status === "no_show" && "bg-red-500/10",
                          appt.status === "booked" && "bg-ink-900",
                        )}
                      >
                        <p className="font-sans text-xs text-paper">{appt.customer_name ?? "Guest"}</p>
                        <p className="font-sans text-[10px] text-ink-400">
                          {appt.service_name ?? "Service"}
                          {appt.customer_phone ? ` · ${appt.customer_phone}` : ""}
                        </p>
                        <p className={clsx("mt-0.5 font-sans text-[10px] font-semibold tracking-widest", STATUS_STYLE[appt.status])}>
                          {STATUS_LABEL[appt.status] ?? appt.status}
                        </p>
                        {interactive && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {appt.status === "booked" && onNoShow && (
                              <button
                                type="button"
                                onClick={() => onNoShow(appt)}
                                className={clsx(
                                  "px-2 py-0.5 font-sans text-[10px] tracking-widest",
                                  confirmingNoShow === appt.id ? "bg-red-500 text-white" : "text-ink-400 hover:text-red-400",
                                )}
                              >
                                {confirmingNoShow === appt.id ? "CONFIRM?" : "NO SHOW"}
                              </button>
                            )}
                            {NEXT_STATUS[appt.status] && onAdvance && (
                              <Button
                                variant="secondary"
                                size="md"
                                className="!px-2 !py-1 !text-[10px]"
                                onClick={() => onAdvance(appt)}
                              >
                                {NEXT_LABEL[appt.status]}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="block min-h-[2.25rem] text-[10px] text-ink-600">↕</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
