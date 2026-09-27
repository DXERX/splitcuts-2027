import type { ReactNode } from "react";
import clsx from "clsx";

export function Container({
  children,
  className,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  /** true = up to 1600px (full editorial width), false = 1440px (prose-ish sections) */
  wide?: boolean;
}) {
  return (
    <div
      className={clsx(
        "mx-auto w-full px-6 md:px-10 3xl:px-0",
        wide ? "max-w-content" : "max-w-prose",
        className,
      )}
    >
      {children}
    </div>
  );
}
