"use client";

import clsx from "clsx";
import { motion } from "framer-motion";

/** Numbered visit-progress dots -- explicitly not a generic progress bar. */
export function RewardDots({ total, progress }: { total: number; progress: number }) {
  return (
    <div className="flex flex-wrap gap-3">
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < progress;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4 }}
            className={clsx(
              "flex h-14 w-14 flex-col items-center justify-center gap-0.5 border font-sans text-xs font-semibold",
              filled
                ? "border-paper bg-paper text-ink"
                : "border-ink-800 text-ink-600",
            )}
          >
            <span className="tag-number">{String(i + 1).padStart(2, "0")}</span>
          </motion.div>
        );
      })}
    </div>
  );
}
