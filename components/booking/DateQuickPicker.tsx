"use client";

import { useState } from "react";
import clsx from "clsx";
import { DateStrip } from "@/components/book/DateStrip";

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** TODAY / TOMORROW / <next weekday> / MORE -- no full calendar up front.
 * "MORE" expands into the horizontal date strip for anything further out. */
export function DateQuickPicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (date: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextDay = new Date(today);
  nextDay.setDate(nextDay.getDate() + 2);

  const quickOptions = [
    { label: "TODAY", value: toDateString(today) },
    { label: "TOMORROW", value: toDateString(tomorrow) },
    { label: WEEKDAYS[nextDay.getDay()], value: toDateString(nextDay) },
  ];

  if (expanded) {
    return <DateStrip selected={selected} onSelect={onSelect} />;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {quickOptions.map((opt) => {
        const isSelected = selected === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            className={clsx(
              "px-6 py-4 font-sans text-sm font-semibold tracking-widest transition-colors duration-300 ease-editorial",
              isSelected ? "bg-paper text-ink" : "hairline text-paper hover:border-ink-400",
            )}
          >
            {opt.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="px-6 py-4 font-sans text-sm font-semibold tracking-widest text-ink-400 hover:text-paper"
      >
        MORE →
      </button>
    </div>
  );
}
