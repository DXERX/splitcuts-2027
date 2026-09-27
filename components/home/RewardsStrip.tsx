"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

const DOTS = [
  { label: "01", done: true },
  { label: "02", done: true },
  { label: "03", done: true },
  { label: "04", done: false },
  { label: "05", done: false },
];

/** The only other major feature besides booking. No points, no tiers --
 * just cuts counted toward a free one. The dot row now doubles as a small
 * "literal game element": an original chrome chomper wedge (not a copy of
 * any existing game's character) sits beside the next un-earned dot, and
 * each earned dot pulses once on mount like it was just eaten. */
export function RewardsStrip() {
  const { t } = useLanguage();
  const nextTargetIndex = DOTS.findIndex((d) => !d.done);

  return (
    <section className="hairline-t bg-ink-950 py-14 md:py-20">
      <Container wide className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
        <div>
          <span className="tag-number text-ink-600">{t("rewards.tag")}</span>
          <h2 className="mt-3 font-display text-3xl uppercase text-paper md:text-4xl">
            {t("rewards.headline")}
          </h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {DOTS.map((d, i) => (
              <span key={d.label} className="relative flex h-10 w-10 items-center justify-center">
                {i === nextTargetIndex && (
                  <span
                    aria-hidden
                    className="chomper absolute -left-3 h-3 w-3 bg-gradient-to-br from-chrome-light via-chrome to-chrome-dark"
                  />
                )}
                <motion.span
                  initial={d.done ? { scale: 1.5, opacity: 0 } : false}
                  animate={d.done ? { scale: 1, opacity: 1 } : undefined}
                  transition={{ duration: 0.35, delay: 0.15 * i, ease: "backOut" }}
                  className={
                    d.done
                      ? "flex h-10 w-10 items-center justify-center border border-paper bg-paper font-sans text-xs font-semibold text-ink"
                      : "flex h-10 w-10 items-center justify-center border border-ink-700 font-sans text-xs font-semibold text-ink-600"
                  }
                >
                  {d.label}
                </motion.span>
              </span>
            ))}
            <span className="ml-2 bg-gradient-to-b from-chrome-light via-chrome to-chrome-dark bg-clip-text font-display text-sm uppercase tracking-widest text-transparent">
              {t("rewards.free")}
            </span>
          </div>
          <Link
            href="/account/rewards"
            className="whitespace-nowrap font-sans text-xs font-semibold tracking-widest text-ink-200 hover:text-paper"
          >
            {t("rewards.view")}
          </Link>
        </div>
      </Container>
    </section>
  );
}
