"use client";

// Optional Arabic support: a tiny client-side locale context, persisted to
// localStorage, no routing changes (no /ar or /en URL segments -- this is a
// toggle, not a locale-per-route setup, matching how the rest of the app is
// built). `app/layout.tsx` runs a small inline script before hydration that
// reads the same storage key and sets `dir`/`lang` on <html> synchronously,
// so there's no flash of the wrong direction on reload.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { en, type DictKey } from "./dictionaries/en";
import { ar } from "./dictionaries/ar";

export type Locale = "en" | "ar";

const DICTS: Record<Locale, Record<string, string>> = { en, ar };
export const LOCALE_STORAGE_KEY = "split-cuts-locale";

type LanguageContextValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY) === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

function applyToDocument(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Starts "en" for a consistent server render, then syncs to whatever the
  // pre-hydration script already applied to <html> (see app/layout.tsx) so
  // there's no visible flip immediately after hydration either.
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    setLocaleState(readStoredLocale());
  }, []);

  useEffect(() => {
    applyToDocument(locale);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // best-effort only -- a private window or blocked storage just means
      // the toggle resets on reload, which is fine.
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);
  const toggleLocale = useCallback(() => setLocaleState((l) => (l === "en" ? "ar" : "en")), []);

  const t = useCallback(
    (key: DictKey, vars?: Record<string, string | number>) => {
      const dict = DICTS[locale];
      const value = dict[key] ?? en[key] ?? key;
      return interpolate(value, vars);
    },
    [locale],
  );

  return (
    <LanguageContext.Provider
      value={{ locale, dir: locale === "ar" ? "rtl" : "ltr", t, setLocale, toggleLocale }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage() must be used inside <LanguageProvider>");
  }
  return ctx;
}
