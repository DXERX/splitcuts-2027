import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Reveal } from "@/components/ui/Reveal";
import { ConcretePanel } from "@/components/ui/ConcretePanel";
import { LinkButton } from "@/components/ui/Button";
import type { Database } from "@/lib/database.types";

type Service = Pick<
  Database["public"]["Tables"]["services"]["Row"],
  "id" | "name_en" | "duration" | "price"
>;

export function ServicesPreview({ services }: { services: Service[] }) {
  const shown = services.slice(0, 6);

  return (
    <section className="hairline-t bg-ink py-18 md:py-30">
      <Container wide>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <SectionLabel index="03" label="SERVICES" />
            <h2 className="mt-6 font-display text-display-md uppercase text-paper">
              EVERY CUT. ONE STANDARD.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <Link
              href="/services"
              className="font-sans text-xs font-semibold tracking-widest text-ink-200 hover:text-paper"
            >
              VIEW ALL SERVICES →
            </Link>
          </Reveal>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-px bg-ink-800 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((service, i) => (
            <Reveal key={service.id} delay={0.05 * (i % 3)} className="bg-ink">
              <Link href="/services" className="group block">
                <ConcretePanel className="aspect-[4/5] w-full" tone="steel">
                  <span className="absolute left-4 top-4 tag-number text-ink-200/80">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </ConcretePanel>
                <div className="flex items-start justify-between gap-4 p-5">
                  <div>
                    <h3 className="font-display text-xl uppercase tracking-tight text-paper group-hover:text-ink-200">
                      {service.name_en}
                    </h3>
                    <p className="mt-1 font-sans text-xs tracking-widest text-ink-400">
                      {service.duration} MIN
                    </p>
                  </div>
                  <span className="font-sans text-sm font-semibold text-paper">
                    {service.price} SAR
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2} className="mt-10 sm:hidden">
          <LinkButton href="/services" variant="secondary" size="lg" className="w-full">
            VIEW ALL SERVICES
          </LinkButton>
        </Reveal>
      </Container>
    </section>
  );
}
