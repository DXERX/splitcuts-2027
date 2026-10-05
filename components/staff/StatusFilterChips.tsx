"use client";

import clsx from "clsx";
import type { AppointmentStatus } from "@/lib/database.types";

const STATUS_FILTER_LABEL: Record<AppointmentStatus, string> = {
  booked: "BOOKED",
  checked_in: "CHECKED IN",
  in_service: "IN SERVICE",
  completed: "DONE",
  cancelled: "CANCELLED",
  no_show: "NO SHOW",
};

/** "ALL" plus one chip per appointment status -- lets staff narrow a flat
 * appointments list (recent activity, the day's list) without touching the
 * floor board, which is laid out by barber/time and isn't a good fit for
 * status filtering. */
export function StatusFilterChips({
  value,
  onChange,
  statuses,
}: {
  value: AppointmentStatus | "all";
  onChange: (status: AppointmentStatus | "all") => void;
  statuses: AppointmentStatus[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={clsx(
          "px-3 py-1.5 font-sans text-[10px] font-semibold tracking-widest transition-colors duration-300 ease-editorial",
          value === "all" ? "bg-paper text-ink" : "hairline text-ink-400 hover:text-paper",
        )}
      >
        ALL
      </button>
      {statuses.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onChange(status)}
          className={clsx(
            "px-3 py-1.5 font-sans text-[10px] font-semibold tracking-widest transition-colors duration-300 ease-editorial",
            value === status ? "bg-paper text-ink" : "hairline text-ink-400 hover:text-paper",
          )}
        >
          {STATUS_FILTER_LABEL[status]}
        </button>
      ))}
    </div>
  );
}
