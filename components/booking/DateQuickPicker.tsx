"use client";

import { useState } from "react";
import clsx from "clsx";
import { DateStrip } from "@/components/book/DateStrip";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

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
  const { t } = useLanguage();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextDay = new Date(today);
  nextDay.setDate(nextDay.getDate() + 2);

  const quickOptions = [
    { label: t("booking.today"), value: toDateString(today) },
    { label: t("booking.tomorrow"), value: toDateString(tomorrow) },
    { label: WEEKDAYS[nextDay.getDay()] ?? "", value: toDateString(nextDay) },
  ];

  if (expanded) {
    return <DateStrip selected={selected} onSelect={onSelect} />;
  }

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      {quickOptions.map((opt) => {
        const isSelected = selected === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            className={clsx(
              "min-h-12 shrink-0 px-4 py-3 font-sans text-sm font-semibold tracking-widest transition-colors duration-300 ease-editorial sm:px-6",
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
        className="min-h-12 shrink-0 px-4 py-3 font-sans text-sm font-semibold tracking-widest text-ink-400 hover:text-paper"
      >
        {t("booking.more")}
      </button>
    </div>
  );
}
