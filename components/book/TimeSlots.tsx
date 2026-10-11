"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { formatSlotLabel } from "@/lib/timeSlots";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

interface Slot {
  time: string; // "HH:MM"
  available: boolean;
}

export function TimeSlots({
  slots,
  selected,
  onSelect,
}: {
  slots: Slot[];
  selected: string;
  onSelect: (time: string) => void;
}) {
  const { t } = useLanguage();
  if (slots.length === 0) {
    return <p className="font-sans text-sm text-ink-400">{t("booking.noSlots")}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2 xs:grid-cols-3 sm:gap-3">
      <AnimatePresence initial={false}>
        {slots.map((slot) => {
          const isSelected = slot.time === selected;
          return (
            <motion.button
              key={slot.time}
              type="button"
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              disabled={!slot.available}
              onClick={() => slot.available && onSelect(slot.time)}
              className={clsx(
                "flex min-h-14 flex-col items-center justify-center gap-1 px-2 py-3 font-sans transition-colors duration-400 ease-editorial",
                !slot.available &&
                  "hairline text-ink-600 pointer-events-none opacity-50",
                slot.available && isSelected && "bg-paper text-ink",
                slot.available && !isSelected && "hairline text-paper hover:border-ink-400",
              )}
            >
              <span className="text-base font-semibold tracking-wide">
                {formatSlotLabel(slot.time)}
              </span>
              {!slot.available && (
                <span className="text-[10px] font-semibold tracking-widest">{t("booking.unavailable")}</span>
              )}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
