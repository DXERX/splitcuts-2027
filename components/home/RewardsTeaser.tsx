import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Reveal } from "@/components/ui/Reveal";
import { LinkButton } from "@/components/ui/Button";
import clsx from "clsx";

const STEPS = ["01", "02", "03", "FREE"];

/** Framed as membership, never "a coffee stamp card." */
export function RewardsTeaser() {
  return (
    <section className="hairline-t bg-ink-950 py-18 md:py-30">
      <Container wide className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
        <Reveal>
          <SectionLabel index="06" label="SPLIT REWARDS" />
          <h2 className="mt-6 font-display text-display-md uppercase text-paper">
            EVERY CUT COUNTS.
          </h2>
          <p className="mt-4 max-w-md font-sans text-ink-200">
            Split Rewards is a membership, not a punch card. Every visit moves you closer to a
            cut on the house.
          </p>
          <LinkButton href="/account/rewards" variant="chrome" size="lg" className="mt-8">
            VIEW YOUR REWARDS
          </LinkButton>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="hairline flex items-center justify-between divide-x divide-ink-800">
            {STEPS.map((step, i) => (
              <div
                key={step}
                className="flex flex-1 flex-col items-center gap-3 px-4 py-10 text-center"
              >
                <span
                  className={clsx(
                    "font-display text-3xl",
                    step === "FREE"
                      ? "bg-gradient-to-b from-chrome-light via-chrome to-chrome-dark bg-clip-text text-transparent"
                      : "text-paper",
                  )}
                >
                  {step}
                </span>
                <span className="font-sans text-[10px] font-semibold tracking-widest text-ink-400">
                  {step === "FREE" ? "UNLOCKED" : `VISIT ${i + 1}`}
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
