"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export function BottomNav() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const items = [
    { href: "/book", label: t("nav.bookFull") },
    { href: "/account/rewards", label: t("nav.rewards") },
    { href: authed ? "/account" : "/login", label: authed ? t("nav.account") : t("nav.signIn") },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-800 bg-ink pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="grid grid-cols-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex min-h-14 items-center justify-center px-2 text-center font-sans text-sm font-semibold",
                active ? "bg-paper text-ink" : "text-paper",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
