import clsx from "clsx";

/** "01 — SERVICES" style section marker used at the top of every homepage
 * section instead of a generic centered "Our Services" heading. */
export function SectionLabel({
  index,
  label,
  className,
}: {
  index: string;
  label: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-center gap-3", className)}>
      <span className="tag-number text-ink-400">{index}</span>
      <span className="h-px w-8 bg-ink-600" aria-hidden />
      <span className="eyebrow">{label}</span>
    </div>
  );
}
