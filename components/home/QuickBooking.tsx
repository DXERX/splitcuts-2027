"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import type { Database } from "@/lib/database.types";

type Barber = Pick<Database["public"]["Tables"]["barbers"]["Row"], "id" | "name" | "nickname">;
type Service = Pick<
  Database["public"]["Tables"]["services"]["Row"],
  "id" | "name_en" | "duration" | "price"
>;

const STEPS = [
  { index: "01", label: "SERVICE" },
  { index: "02", label: "BARBER" },
  { index: "03", label: "DATE" },
  { index: "04", label: "TIME" },
] as const;

/**
 * "One of the most important homepage sections." A light preference-capture
 * form -- not the real booking engine (that lives at /book, step-by-step,
 * with real availability). Selecting a service/barber here just deep-links
 * into the wizard pre-filled; date/time are picked for real once inside it.
 */
export function QuickBooking({ barbers, services }: { barbers: Barber[]; services: Service[] }) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState("");
  const [barberId, setBarberId] = useState("");

  const canContinue = serviceId.length > 0;

  const href = useMemo(() => {
    const params = new URLSearchParams();
    if (serviceId) params.set("service", serviceId);
    if (barberId) params.set("barber", barberId);
    const qs = params.toString();
    return qs ? `/book?${qs}` : "/book";
  }, [serviceId, barberId]);

  function goToBook() {
    if (!canContinue) return;
    router.push(href);
  }

  return (
    <section className="hairline-t bg-ink-950 py-18 md:py-30">
      <Container wide>
        <Reveal>
          <SectionLabel index="02" label="QUICK BOOKING" />
        </Reveal>

        <Reveal delay={0.05}>
          <h2 className="mt-6 font-display text-display-md uppercase text-paper">
            BOOK YOUR CHAIR.
          </h2>
          <p className="mt-3 max-w-md font-sans text-ink-200">No calls. No waiting.</p>
        </Reveal>

        {/* Desktop: single hairline-bordered control row */}
        <Reveal delay={0.1} className="mt-10 hidden md:block">
          <div className="hairline grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-stretch divide-x divide-ink-800">
            <Field label="SERVICE">
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full bg-transparent font-sans text-sm text-paper outline-none"
              >
                <option value="" className="bg-ink-950">
                  Choose a service
                </option>
                {services.map((s) => (
                  <option key={s.id} value={s.id} className="bg-ink-950">
                    {s.name_en} · {s.duration}min
                  </option>
                ))}
              </select>
            </Field>
            <Field label="BARBER">
              <select
                value={barberId}
                onChange={(e) => setBarberId(e.target.value)}
                className="w-full bg-transparent font-sans text-sm text-paper outline-none"
              >
                <option value="" className="bg-ink-950">
                  First available
                </option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id} className="bg-ink-950">
                    {b.nickname || b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="DATE">
              <span className="font-sans text-sm text-ink-400">Pick in next step</span>
            </Field>
            <Field label="TIME">
              <span className="font-sans text-sm text-ink-400">Pick in next step</span>
            </Field>
            <button
              onClick={goToBook}
              disabled={!canContinue}
              className={clsx(
                "flex items-center justify-center px-8 font-sans text-sm font-semibold tracking-widest transition-colors duration-400 ease-editorial",
                canContinue
                  ? "bg-paper text-ink hover:bg-white"
                  : "bg-ink-900 text-ink-600 pointer-events-none",
              )}
            >
              [ CONTINUE ]
            </button>
          </div>
        </Reveal>

        {/* Mobile: numbered steps, each one tap away from the real wizard */}
        <Reveal delay={0.1} className="mt-10 md:hidden">
          <div className="hairline divide-y divide-ink-800">
            {STEPS.map((step) => (
              <div key={step.index} className="flex items-center gap-4 px-5 py-4">
                <span className="tag-number text-ink-400">{step.index}</span>
                <span className="font-sans text-sm font-semibold tracking-widest text-paper">
                  {step.label}
                </span>
              </div>
            ))}
          </div>
          <Button variant="primary" size="lg" className="mt-4 w-full" onClick={goToBook}>
            START BOOKING
          </Button>
        </Reveal>
      </Container>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-center gap-2 px-6 py-6">
      <span className="tag-number text-ink-600">{label}</span>
      {children}
    </div>
  );
}
