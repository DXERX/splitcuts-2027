"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { GlobalNav } from "./GlobalNav";
import { BottomNav } from "./BottomNav";
import { PromoBar } from "./PromoBar";

const CHROME_FREE_PREFIXES = ["/login", "/cashier", "/barber", "/admin"];

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Exact-segment match -- "/barber" (staff tool, chrome-free) must not also
  // swallow the public "/barbers" team pages, which keep the site nav.
  const bare = CHROME_FREE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hideBottom = pathname === "/book" || pathname.startsWith("/book/");

  if (bare) {
    return <>{children}</>;
  }

  return (
    <>
      <PromoBar />
      <GlobalNav />
      <div className={hideBottom ? "" : "pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0"}>{children}</div>
      {!hideBottom && <BottomNav />}
    </>
  );
}
