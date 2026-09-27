"use client";

import clsx from "clsx";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Elegant horizontal scrollable date strip -- deliberately not a native
 * <input type="date"> or a boxed month-grid calendar. */
export function DateStrip({
  selected,
  onSelect,
  days = 21,
}: {
  selected: string;
  onSelect: (date: string) => void;
  days?: number;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-2 no-scrollbar md:mx-0 md:px-0">
      {dates.map((d) => {
        const value = toDateString(d);
        const isSelected = value === selected;
        const isToday = value === toDateString(today);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onSelect(value)}
            className={clsx(
              "flex shrink-0 flex-col items-center gap-1 px-5 py-4 transition-colors duration-400 ease-editorial",
              isSelected
                ? "bg-paper text-ink"
                : "hairline text-paper hover:border-ink-400",
            )}
          >
            <span
              className={clsx(
                "font-sans text-[10px] font-semibold tracking-widest",
                isSelected ? "text-ink/60" : "text-ink-400",
              )}
            >
              {WEEKDAYS[d.getDay()]}
            </span>
            <span className="font-display text-2xl">{d.getDate()}</span>
            {isToday && (
              <span
                className={clsx(
                  "h-1 w-1 rounded-full",
                  isSelected ? "bg-ink" : "bg-paper",
                )}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
