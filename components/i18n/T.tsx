"use client";

// Tiny translation helpers, safe to drop into a server component (they're
// each a client leaf) wherever a static server-rendered string needs to
// become locale-aware without converting the whole parent to "use client".

import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type { DictKey } from "@/lib/i18n/dictionaries/en";
import { SERVICE_CATEGORIES, type ServiceCategory } from "@/lib/serviceCategories";

/** Renders a single dictionary string. `vars` fills `{placeholders}`. */
export function T({ k, vars }: { k: DictKey; vars?: Record<string, string | number> }) {
  const { t } = useLanguage();
  return <>{t(k, vars)}</>;
}

/** Picks between an English and (optional) Arabic value already on hand --
 * for real data (service names) rather than static UI copy. Falls back to
 * `en` whenever `ar` is missing, same as the dictionary does. */
export function Localized({ en, ar }: { en: string | null | undefined; ar?: string | null }) {
  const { locale } = useLanguage();
  return <>{locale === "ar" && ar ? ar : (en ?? "")}</>;
}

/** Translates one of the fixed service-category codes (CUTS, STYLE, ...). */
export function CategoryLabel({ category }: { category: ServiceCategory | (string & {}) }) {
  const { t } = useLanguage();
  const key = (SERVICE_CATEGORIES as readonly string[]).includes(category)
    ? (`category.${category}` as DictKey)
    : ("category.OTHER" as DictKey);
  return <>{t(key)}</>;
}
