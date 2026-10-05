"use client";

import clsx from "clsx";

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Day switcher for staff dashboards. Unlike DateQuickPicker (the customer
 * booking flow's picker, which only ever looks forward from today), staff
 * need to step backward too -- pulling up yesterday's appointments or
 * anything further back -- so this is a plain prev/today/next stepper plus
 * a native date input for jumping straight to a specific day.
 */
export function StaffDatePicker({
  value,
  today,
  onChange,
}: {
  value: string;
  today: string;
  onChange: (date: string) => void;
}) {
  const isToday = value === today;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(shiftDate(value, -1))}
        aria-label="Previous day"
        className="hairline px-3 py-2 font-sans text-sm text-paper hover:border-ink-400"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => onChange(today)}
        className={clsx(
          "px-4 py-2 font-sans text-xs font-semibold tracking-widest transition-colors duration-300 ease-editorial",
          isToday ? "bg-paper text-ink" : "hairline text-paper hover:border-ink-400",
        )}
      >
        TODAY
      </button>
      <input
        type="date"
        value={value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="hairline bg-transparent px-3 py-2 font-sans text-sm text-paper outline-none [color-scheme:dark]"
      />
      <button
        type="button"
        onClick={() => onChange(shiftDate(value, 1))}
        aria-label="Next day"
        className="hairline px-3 py-2 font-sans text-sm text-paper hover:border-ink-400"
      >
        ›
      </button>
    </div>
  );
}
