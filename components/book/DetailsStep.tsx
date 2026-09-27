"use client";

import { Button } from "@/components/ui/Button";
import { formatSlotLabel } from "@/lib/timeSlots";

interface Summary {
  serviceName: string;
  servicePrice: number;
  barberName: string;
  date: string;
  time: string;
}

export function DetailsStep({
  summary,
  isGuest,
  name,
  phone,
  email,
  notes,
  onNameChange,
  onPhoneChange,
  onEmailChange,
  onNotesChange,
  onSubmit,
  submitting,
  error,
}: {
  summary: Summary;
  isGuest: boolean;
  name: string;
  phone: string;
  email: string;
  notes: string;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const dateLabel = new Date(`${summary.date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <h2 className="font-display text-display-sm uppercase text-paper">ALMOST DONE.</h2>
        <p className="mt-2 font-sans text-ink-400">A few details and your chair is booked.</p>

        <div className="mt-8 space-y-5">
          {isGuest && (
            <>
              <FormField label="NAME" value={name} onChange={onNameChange} placeholder="Full name" />
              <FormField
                label="PHONE"
                value={phone}
                onChange={onPhoneChange}
                placeholder="+966 5X XXX XXXX"
                type="tel"
              />
              <FormField
                label="EMAIL (OPTIONAL)"
                value={email}
                onChange={onEmailChange}
                placeholder="you@example.com"
                type="email"
              />
            </>
          )}
          <div>
            <label className="tag-number text-ink-600">NOTES (OPTIONAL)</label>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              rows={3}
              placeholder="Anything your barber should know"
              className="hairline mt-2 w-full resize-none bg-transparent px-4 py-3 font-sans text-sm text-paper outline-none placeholder:text-ink-600 focus:border-ink-400"
            />
          </div>
        </div>

        {error && <p className="mt-4 font-sans text-sm text-red-400">{error}</p>}

        <Button
          variant="primary"
          size="lg"
          className="mt-8 w-full sm:w-auto"
          disabled={submitting}
          onClick={onSubmit}
        >
          {submitting ? "BOOKING…" : "CONFIRM BOOKING"}
        </Button>
      </div>

      <div className="hairline h-fit p-6">
        <span className="tag-number text-ink-600">SUMMARY</span>
        <dl className="mt-4 space-y-4">
          <Row label="SERVICE" value={summary.serviceName} />
          <Row label="BARBER" value={summary.barberName} />
          <Row label="DATE" value={dateLabel} />
          <Row label="TIME" value={formatSlotLabel(summary.time)} />
        </dl>
        <div className="hairline-t mt-6 flex items-center justify-between pt-4">
          <span className="font-sans text-xs font-semibold tracking-widest text-ink-400">
            TOTAL
          </span>
          <span className="font-display text-2xl text-paper">{summary.servicePrice} SAR</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-sans text-[11px] font-semibold tracking-widest text-ink-600">{label}</dt>
      <dd className="text-right font-sans text-sm text-paper">{value}</dd>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="tag-number text-ink-600">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="hairline mt-2 w-full bg-transparent px-4 py-3 font-sans text-sm text-paper outline-none placeholder:text-ink-600 focus:border-ink-400"
      />
    </div>
  );
}
