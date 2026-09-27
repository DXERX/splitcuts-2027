import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { ConcretePanel } from "@/components/ui/ConcretePanel";
import { LinkButton } from "@/components/ui/Button";
import { SectionLabel } from "@/components/ui/SectionLabel";
import {
  FALLBACK_HOURS,
  formatSlotLabel,
  generateSlots,
  isSlotInPast,
  todayDateString,
  type BusinessHours,
} from "@/lib/timeSlots";

export default async function BarberProfilePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const [{ data: barber }, { data: services }, { data: hoursRow }, { data: todaysAppointments }] =
    await Promise.all([
      supabase
        .from("barbers")
        .select("id, name, nickname, specialty, is_active")
        .eq("id", params.id)
        .maybeSingle(),
      supabase
        .from("services")
        .select("id, name_en, duration, price")
        .eq("is_active", true)
        .order("price"),
      supabase.from("site_settings").select("value").eq("key", "business_hours").maybeSingle(),
      supabase
        .from("appointments")
        .select("appointment_time")
        .eq("barber_id", params.id)
        .eq("appointment_date", todayDateString())
        .not("status", "in", "(cancelled,no_show)"),
    ]);

  if (!barber || !barber.is_active) notFound();

  const value = hoursRow?.value as Partial<BusinessHours> | null | undefined;
  const hours: BusinessHours =
    value?.default_start && value?.default_end
      ? { default_start: value.default_start, default_end: value.default_end }
      : FALLBACK_HOURS;

  const busy = new Set((todaysAppointments ?? []).map((a) => a.appointment_time?.slice(0, 5)));
  const today = todayDateString();
  const nextSlots = generateSlots(hours)
    .filter((t) => !busy.has(t) && !isSlotInPast(today, t, hours))
    .slice(0, 4);

  const displayName = barber.name || barber.nickname || "Barber";

  return (
    <main className="min-h-screen bg-ink pt-[var(--nav-height)]">
      <section className="grid gap-0 md:grid-cols-2">
        <ConcretePanel className="aspect-square w-full md:aspect-auto md:h-[calc(100svh-var(--nav-height))]" tone="steel" />
        <div className="flex flex-col justify-center px-6 py-16 md:px-16">
          <SectionLabel index="—" label="BARBER PROFILE" />
          <h1 className="mt-6 font-display text-display-lg uppercase text-paper">
            {displayName}
          </h1>
          {barber.specialty && (
            <p className="mt-3 font-sans text-sm tracking-widest text-ink-400">
              {barber.specialty.toUpperCase()}
            </p>
          )}
          <p className="mt-6 max-w-md font-sans text-ink-200">
            {displayName} keeps every chair to the same standard: clean lines, no rushed edges,
            built around what actually suits you.
          </p>

          {nextSlots.length > 0 && (
            <div className="mt-8">
              <span className="tag-number text-ink-600">NEXT AVAILABLE TODAY</span>
              <div className="mt-3 flex flex-wrap gap-2">
                {nextSlots.map((slot) => (
                  <span
                    key={slot}
                    className="hairline px-4 py-2 font-sans text-xs font-semibold tracking-widest text-paper"
                  >
                    {formatSlotLabel(slot)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <LinkButton
            href={`/book?barber=${barber.id}`}
            variant="primary"
            size="lg"
            className="mt-10 w-fit"
          >
            BOOK WITH {displayName.toUpperCase()}
          </LinkButton>
        </div>
      </section>

      <section className="hairline-t py-16 md:py-24">
        <Container wide>
          <SectionLabel index="01" label="SERVICES" />
          <div className="mt-8 grid grid-cols-1 gap-px bg-ink-800 sm:grid-cols-2 lg:grid-cols-3">
            {(services ?? []).map((service) => (
              <div key={service.id} className="flex items-center justify-between bg-ink p-5">
                <div>
                  <p className="font-sans text-sm text-paper">{service.name_en}</p>
                  <p className="mt-0.5 font-sans text-xs tracking-widest text-ink-400">
                    {service.duration} MIN
                  </p>
                </div>
                <span className="font-sans text-sm font-semibold text-paper">
                  {service.price} SAR
                </span>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="hairline-t py-16 md:py-24">
        <Container wide>
          <SectionLabel index="02" label="WORK" />
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ConcretePanel key={i} className="aspect-square w-full" tone={i % 2 === 0 ? "dark" : "steel"} />
            ))}
          </div>
        </Container>
      </section>
    </main>
  );
}
