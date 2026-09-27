"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/ui/BrandMark";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { LanguageToggle } from "@/components/i18n/LanguageToggle";

// Deliberately minimal -- not a normal website nav. Everything else
// (services, barbers, location) lives inline on the homepage itself.
const LINKS = [{ href: "/account/rewards", labelKey: "nav.rewards" as const }];

export function GlobalNav() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const solid = scrolled || menuOpen || pathname !== "/";

  return (
    <>
      <header
        className={clsx(
          "fixed inset-x-0 top-[var(--promo-height)] z-50 transition-colors duration-400 ease-editorial",
          solid ? "bg-ink/95 backdrop-blur hairline-b" : "bg-transparent",
        )}
        style={{ height: "var(--nav-bar-height)" }}
      >
        <div className="mx-auto flex h-full max-w-content items-center justify-between px-6 md:px-10">
          <Link href="/" className="flex items-center">
            <BrandMark />
          </Link>

          <nav className="hidden items-center gap-8 lg:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="font-sans text-xs font-semibold tracking-widest text-ink-200 transition-colors hover:text-paper"
              >
                {t(l.labelKey)}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <LanguageToggle />
            <Link
              href={authed ? "/account" : "/book"}
              className="inline-flex items-center rounded-xs border border-paper px-6 py-3 font-sans text-xs font-semibold tracking-widest text-paper transition-colors duration-400 ease-editorial hover:bg-paper hover:text-ink"
            >
              {authed ? t("nav.account") : t("nav.book")}
            </Link>
          </div>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex flex-col items-end gap-[5px] lg:hidden"
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            <span
              className={clsx(
                "h-px bg-paper transition-all duration-400 ease-editorial",
                menuOpen ? "w-6 translate-y-[3px] rotate-45" : "w-6",
              )}
            />
            <span
              className={clsx(
                "h-px bg-paper transition-all duration-400 ease-editorial",
                menuOpen ? "w-6 -translate-y-[3px] -rotate-45" : "w-4",
              )}
            />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 flex flex-col justify-center bg-ink px-8 lg:hidden"
          >
            <nav className="flex flex-col gap-6">
              {LINKS.map((l, i) => (
                <motion.div
                  key={l.href}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * i, duration: 0.4 }}
                >
                  <Link href={l.href} className="font-display text-4xl text-paper">
                    {t(l.labelKey)}
                  </Link>
                </motion.div>
              ))}
            </nav>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href={authed ? "/account" : "/book"}
                className="inline-flex items-center rounded-xs bg-paper px-8 py-4 font-sans text-sm font-semibold tracking-widest text-ink"
              >
                {authed ? t("nav.account") : t("nav.bookFull")}
              </Link>
              <LanguageToggle />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
