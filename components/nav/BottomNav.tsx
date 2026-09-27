"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/**
 * A persistent full-width "BOOK A CHAIR" strip -- not a 4-tab app nav bar.
 * Account/Rewards live in the hamburger menu; this bar has one job.
 */
export function BottomNav() {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      <Link
        href="/book"
        className="flex w-full items-center justify-center bg-paper py-4 font-sans text-sm font-semibold tracking-widest text-ink"
      >
        {t("bottomNav.book")}
      </Link>
    </div>
  );
}
