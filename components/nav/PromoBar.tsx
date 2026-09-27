"use client";

import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type { DictKey } from "@/lib/i18n/dictionaries/en";

const OFFER_KEYS: DictKey[] = ["promo.tamara", "promo.rewards", "promo.student"];

/**
 * A slim strip pinned above the main nav so the shop's current offers (Tamara
 * instalments, rewards, the student package) are visible everywhere,
 * immediately -- not something a visitor only finds by scrolling to the
 * bottom of the homepage. Sits at the very top (z-50, top-0); GlobalNav sits
 * just below it (top: var(--promo-height)).
 */
export function PromoBar() {
  const { t } = useLanguage();
  const items = OFFER_KEYS.map((k) => t(k));
  // Doubled so the CSS scroll (translateX to -50%) loops seamlessly.
  const track = [...items, ...items];

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 overflow-hidden bg-paper"
      style={{ height: "var(--promo-height)" }}
      aria-hidden={false}
    >
      <div className="promo-track flex h-full items-center whitespace-nowrap">
        {track.map((text, i) => (
          <span key={i} className="mx-6 font-sans text-[11px] font-semibold tracking-widest text-ink">
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
