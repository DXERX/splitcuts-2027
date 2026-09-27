import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Reveal } from "@/components/ui/Reveal";
import { LinkButton } from "@/components/ui/Button";

export function Location() {
  return (
    <section id="location" className="hairline-t bg-ink py-18 md:py-30 scroll-mt-[76px]">
      <Container wide className="grid gap-10 lg:grid-cols-[1fr_1fr]">
        <Reveal>
          <SectionLabel index="07" label="LOCATION" />
          <h2 className="mt-6 font-display text-display-md uppercase text-paper">
            JEDDAH / ABHUR.
          </h2>
          <div className="mt-8 space-y-6">
            <div>
              <p className="tag-number text-ink-600">ADDRESS</p>
              <p className="mt-2 font-sans text-paper">Abhur Al Shamaliyah, Jeddah, Saudi Arabia</p>
            </div>
            <div>
              <p className="tag-number text-ink-600">HOURS</p>
              <p className="mt-2 font-sans text-paper">Daily · 2:00 PM — 2:00 AM</p>
            </div>
            <div>
              <p className="tag-number text-ink-600">CONTACT</p>
              <p className="mt-2 font-sans text-paper">+966 5X XXX XXXX</p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-4">
            <LinkButton href="/book" variant="primary" size="lg">
              BOOK YOUR CHAIR
            </LinkButton>
            <LinkButton
              href="https://maps.app.goo.gl/i7tVN1uw8ZLwkyGu6"
              variant="secondary"
              size="lg"
              target="_blank"
              rel="noreferrer"
            >
              GET DIRECTIONS
            </LinkButton>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="relative h-full min-h-[360px] w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- static local asset, no next/image loader needed */}
            <img
              src="/photos/storefront-night.jpg"
              alt="Split Cuts storefront, Abhur, Jeddah"
              className="h-full w-full object-cover"
            />
            <div className="grain-overlay" />
            <span className="absolute bottom-3 left-3 font-sans text-[10px] font-semibold uppercase tracking-widest text-paper/80">
              SPLIT CUTS — ABHUR, JEDDAH
            </span>
            <div className="pointer-events-none absolute inset-3 border border-white/[0.06]" />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
