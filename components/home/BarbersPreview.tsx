import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Reveal } from "@/components/ui/Reveal";
import { ConcretePanel } from "@/components/ui/ConcretePanel";
import type { Database } from "@/lib/database.types";

type Barber = Pick<
  Database["public"]["Tables"]["barbers"]["Row"],
  "id" | "name" | "nickname" | "specialty"
>;

export function BarbersPreview({ barbers }: { barbers: Barber[] }) {
  const shown = barbers.slice(0, 4);

  return (
    <section className="hairline-t bg-ink-950 py-18 md:py-30">
      <Container wide>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <SectionLabel index="04" label="BARBERS" />
            <h2 className="mt-6 font-display text-display-md uppercase text-paper">THE TEAM.</h2>
          </Reveal>
          <Reveal delay={0.1}>
            <Link
              href="/barbers"
              className="font-sans text-xs font-semibold tracking-widest text-ink-200 hover:text-paper"
            >
              MEET EVERYONE →
            </Link>
          </Reveal>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          {shown.map((barber, i) => (
            <Reveal key={barber.id} delay={0.05 * i}>
              <Link href={`/barbers/${barber.id}`} className="group block">
                <ConcretePanel className="aspect-[3/4] w-full" label={barber.specialty ?? undefined}>
                  <div className="absolute inset-0 flex items-end bg-gradient-to-t from-ink/80 via-transparent to-transparent opacity-0 transition-opacity duration-400 ease-editorial group-hover:opacity-100" />
                </ConcretePanel>
                <div className="mt-3">
                  <h3 className="font-display text-lg uppercase tracking-tight text-paper">
                    {barber.nickname || barber.name}
                  </h3>
                  {barber.specialty && (
                    <p className="mt-0.5 font-sans text-[11px] tracking-widest text-ink-400">
                      {barber.specialty.toUpperCase()}
                    </p>
                  )}
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
