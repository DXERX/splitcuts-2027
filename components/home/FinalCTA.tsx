import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { LinkButton } from "@/components/ui/Button";
import { ConcretePanel } from "@/components/ui/ConcretePanel";

export function FinalCTA() {
  return (
    <section className="hairline-t relative overflow-hidden bg-ink py-24 md:py-36">
      <ConcretePanel className="absolute inset-0 h-full w-full" tone="steel" />
      <div className="absolute inset-0 bg-ink/70" />
      <Container wide className="relative z-10 text-center">
        <Reveal className="mx-auto flex max-w-2xl flex-col items-center">
          <h2 className="font-display text-display-lg uppercase text-paper">CUT DIFFERENT.</h2>
          <p className="mt-4 font-sans text-ink-200">
            Your chair is waiting. Pick a service, pick a time, walk in ready.
          </p>
          <LinkButton href="/book" variant="primary" size="lg" className="mt-8">
            BOOK YOUR CHAIR
          </LinkButton>
        </Reveal>
      </Container>
    </section>
  );
}
