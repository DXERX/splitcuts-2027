import { formatSlotLabel } from "@/lib/timeSlots";

/** Slot-taken conflict, styled like the rest of the product instead of a
 * generic error banner. */
export function BookingError({ time, onDismiss }: { time: string; onDismiss: () => void }) {
  return (
    <div className="hairline p-8 text-center">
      <h3 className="font-display text-3xl uppercase text-paper">TOO SLOW.</h3>
      <p className="mt-3 font-sans text-sm text-ink-200">
        {formatSlotLabel(time)} just got taken. Pick another time.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-6 font-sans text-xs font-semibold tracking-widest text-ink-400 hover:text-paper"
      >
        ← BACK TO TIMES
      </button>
    </div>
  );
}
