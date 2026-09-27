"use client";

import { motion } from "framer-motion";

/** Subtle metallic/chrome shimmer for an unlocked reward -- one soft sweep,
 * not a slot-machine flash. Respects prefers-reduced-motion via globals.css. */
export function UnlockBanner({ label }: { label: string }) {
  return (
    <div className="hairline relative overflow-hidden p-6">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-transparent via-chrome-light/25 to-transparent"
        initial={{ x: "-100%" }}
        animate={{ x: "100%" }}
        transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }}
      />
      <span className="relative bg-gradient-to-b from-chrome-light via-chrome to-chrome-dark bg-clip-text font-display text-2xl uppercase tracking-tight text-transparent">
        {label}
      </span>
    </div>
  );
}
