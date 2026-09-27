import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Stand-in for photography. There are no real Split Cuts photo/video assets
 * wired up yet, so every "photo" slot in this build is one of these: a flat,
 * intentional concrete/steel surface with a thin technical frame and a
 * small caption naming what belongs there. This is a deliberate placeholder
 * treatment (not a fake stock photo) -- swap the caption's spot for a real
 * <Image>/<video> once assets exist; the frame/label styling can come off.
 */
export function ConcretePanel({
  label,
  className,
  children,
  tone = "dark",
}: {
  label?: string;
  className?: string;
  children?: ReactNode;
  tone?: "dark" | "steel";
}) {
  return (
    <div
      className={clsx(
        "relative overflow-hidden",
        tone === "dark" ? "concrete-panel" : "bg-ink-800",
        className,
      )}
    >
      {tone === "steel" && <div className="grain-overlay" />}
      {children}
      {label && (
        <span className="absolute bottom-3 left-3 font-sans text-[10px] font-semibold uppercase tracking-widest text-ink-200/70">
          {label}
        </span>
      )}
      <div className="pointer-events-none absolute inset-3 border border-white/[0.06]" />
    </div>
  );
}
