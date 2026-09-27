import type { ReactNode } from "react";
import clsx from "clsx";

/** Vertical, strongly-typographic account panel -- deliberately not a
 * generic rounded dashboard widget. */
export function StatPanel({
  label,
  value,
  sub,
  className,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={clsx("hairline flex flex-col justify-between p-6", className)}>
      <span className="tag-number text-ink-600">{label}</span>
      <div className="mt-6">
        <p className="font-display text-3xl uppercase leading-none text-paper">{value}</p>
        {sub && <p className="mt-2 font-sans text-xs tracking-widest text-ink-400">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
