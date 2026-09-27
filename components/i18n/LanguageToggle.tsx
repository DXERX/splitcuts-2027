"use client";

import clsx from "clsx";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/** Shows the language you'd switch TO, not the one you're on (so it reads
 * "عربي" in English and "EN" in Arabic) -- standard convention, and it
 * doubles as the dictionary key so there's nothing extra to translate. */
export function LanguageToggle({ className }: { className?: string }) {
  const { locale, toggleLocale, t } = useLanguage();
  return (
    <button
      type="button"
      onClick={toggleLocale}
      className={clsx(
        "inline-flex items-center justify-center border border-ink-700 px-3 py-2 font-sans text-xs font-semibold tracking-widest text-ink-200 transition-colors duration-300 ease-editorial hover:border-paper hover:text-paper",
        className,
      )}
      aria-label={locale === "en" ? "Switch to Arabic" : "التبديل إلى الإنجليزية"}
    >
      {t("nav.langToggle")}
    </button>
  );
}
