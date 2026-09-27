import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Reveal } from "@/components/ui/Reveal";
import { ConcretePanel } from "@/components/ui/ConcretePanel";

export const metadata = { title: "The Team — Split Cuts" };

export default async function BarbersPage() {
  const supabase = await createClient();
  const { data: barbers } = await supabase
    .from("barbers")
    .select("id, name, nickname, specialty, is_active")
    .eq("is_active", true)
    .order("name");

  return (
    <main className="min-h-screen bg-ink pt-[var(--nav-height)]">
      <section className="hairline-b py-16 md:py-24">
        <Container wide>
          <SectionLabel index="—" label="BARBERS" />
          <h1 className="mt-6 font-display text-display-lg uppercase text-paper">THE TEAM.</h1>
          <p className="mt-4 max-w-lg font-sans text-ink-200">
            Every chair, one standard. Pick a specialist or let us match you with whoever's
            fastest.
          </p>
        </Container>
      </section>

      <section className="py-16 md:py-24">
        <Container wide>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
            {(barbers ?? []).map((barber, i) => (
              <Reveal key={barber.id} delay={0.04 * i}>
                <Link href={`/barbers/${barber.id}`} className="group block">
                  <ConcretePanel className="relative aspect-[3/4] w-full md:aspect-[4/5]">
                    <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-ink/90 via-ink/10 to-transparent p-5 opacity-0 transition-opacity duration-400 ease-editorial group-hover:opacity-100">
                      <span className="font-sans text-xs font-semibold tracking-widest text-status-live">
                        AVAILABLE
                      </span>
                    </div>
                  </ConcretePanel>
                  <div className="mt-3">
                    <h2 className="font-display text-xl uppercase tracking-tight text-paper transition-transform duration-400 ease-editorial group-hover:translate-x-1">
                      {barber.name || barber.nickname}
                    </h2>
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

          {(barbers ?? []).length === 0 && (
            <p className="font-sans text-ink-400">The team will appear here shortly.</p>
          )}
        </Container>
      </section>
    </main>
  );
}
