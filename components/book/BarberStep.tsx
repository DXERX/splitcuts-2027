"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import { ConcretePanel } from "@/components/ui/ConcretePanel";
import { staggerChildren, fadeUp } from "@/lib/motion";
import type { Database } from "@/lib/database.types";

type Barber = Pick<
  Database["public"]["Tables"]["barbers"]["Row"],
  "id" | "name" | "nickname" | "specialty"
>;

export const FIRST_AVAILABLE = "any" as const;

export function BarberStep({
  barbers,
  selectedId,
  onSelect,
  availableToday,
}: {
  barbers: Barber[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** barberId -> has an open slot today. Omitted entries render no badge. */
  availableToday?: Record<string, boolean>;
}) {
  return (
    <motion.div initial="hidden" animate="show" variants={staggerChildren(0.05)} className="space-y-4">
      <motion.button
        type="button"
        variants={fadeUp}
        onClick={() => onSelect(FIRST_AVAILABLE)}
        className={clsx(
          "flex w-full items-center justify-between gap-4 px-6 py-6 text-left transition-colors duration-400 ease-editorial",
          selectedId === FIRST_AVAILABLE ? "bg-paper text-ink" : "hairline text-paper hover:border-ink-400",
        )}
      >
        <div>
          <span className="tag-number opacity-60">FASTEST OPTION</span>
          <h3 className="mt-1 font-display text-2xl uppercase tracking-tight">FIRST AVAILABLE</h3>
          <p
            className={clsx(
              "mt-1 font-sans text-sm",
              selectedId === FIRST_AVAILABLE ? "text-ink/70" : "text-ink-400",
            )}
          >
            We'll match you with whoever's free soonest.
          </p>
        </div>
        <span className="hidden font-sans text-xs font-semibold tracking-widest sm:inline">
          RECOMMENDED
        </span>
      </motion.button>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {barbers.map((barber) => {
          const selected = barber.id === selectedId;
          const available = availableToday?.[barber.id];
          return (
            <motion.button
              key={barber.id}
              type="button"
              variants={fadeUp}
              onClick={() => onSelect(barber.id)}
              className={clsx(
                "group text-left transition-colors duration-400 ease-editorial",
                selected ? "bg-paper text-ink" : "hairline text-paper hover:border-ink-400",
              )}
            >
              <ConcretePanel className="aspect-[3/4] w-full" tone={selected ? "steel" : "dark"} />
              <div className="p-4">
                <h3 className="font-display text-lg uppercase tracking-tight">
                  {barber.nickname || barber.name}
                </h3>
                {barber.specialty && (
                  <p
                    className={clsx(
                      "mt-0.5 font-sans text-[11px] tracking-widest",
                      selected ? "text-ink/60" : "text-ink-400",
                    )}
                  >
                    {barber.specialty.toUpperCase()}
                  </p>
                )}
                {available !== undefined && (
                  <p
                    className={clsx(
                      "mt-2 font-sans text-[10px] font-semibold tracking-widest",
                      available
                        ? selected
                          ? "text-status-live"
                          : "text-status-live"
                        : "text-ink-600",
                    )}
                  >
                    {available ? "AVAILABLE TODAY" : "BOOKED TODAY"}
                  </p>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
