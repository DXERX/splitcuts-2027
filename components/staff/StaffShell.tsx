"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BrandMark } from "@/components/ui/BrandMark";

const LINKS = [
  { href: "/admin", label: "OWNER" },
  { href: "/cashier", label: "CASHIER" },
  { href: "/barber", label: "FLOOR" },
];

export function StaffShell({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-ink font-sans text-paper">
      <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="flex items-center gap-4">
            <BrandMark className="h-5 w-auto" />
            <span className="tag-number text-ink-400">/ {title}</span>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={clsx(
                  "px-3 py-2 font-sans text-[11px] font-semibold tracking-widest",
                  pathname === l.href ? "bg-paper text-ink" : "text-ink-200 hover:text-paper",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          {meta ? <span className="font-sans text-xs text-ink-400">{meta}</span> : <span />}
        </div>
      </header>
      {children}
    </main>
  );
}
