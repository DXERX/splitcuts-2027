import clsx from "clsx";

export const WIZARD_STEPS = [
  { n: "01", label: "SERVICE" },
  { n: "02", label: "BARBER" },
  { n: "03", label: "DATE" },
  { n: "04", label: "TIME" },
  { n: "05", label: "DETAILS" },
] as const;

/** Editorial numbered progress header -- explicitly not a generic stepper
 * with circles/checkmarks. Past steps are dim + clickable (to go back),
 * the current step is full-contrast with an underline, future steps are
 * faint and inert. */
export function WizardProgress({
  step,
  onStepClick,
}: {
  step: number; // 1-5
  onStepClick?: (step: number) => void;
}) {
  return (
    <div className="hairline-b">
      <div className="mx-auto flex max-w-content items-stretch overflow-x-auto no-scrollbar px-6 md:px-10">
        {WIZARD_STEPS.map((s, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "active" : "upcoming";
          const clickable = state === "done" && !!onStepClick;
          return (
            <button
              key={s.n}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick?.(n)}
              className={clsx(
                "flex shrink-0 items-center gap-2 border-r border-ink-800 px-4 py-4 font-sans text-xs font-semibold tracking-widest transition-colors duration-400 ease-editorial last:border-r-0 md:px-6",
                state === "active" && "text-paper",
                state === "done" && "text-ink-200 hover:text-paper cursor-pointer",
                state === "upcoming" && "text-ink-600",
              )}
            >
              <span className="tag-number">{s.n}</span>
              <span className="hidden sm:inline">{s.label}</span>
              {state === "active" && (
                <span className="ml-1 hidden h-1 w-1 rounded-full bg-paper sm:inline-block" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
