import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Reveal } from "@/components/ui/Reveal";

const REVIEWS = [
  {
    quote: "Cleanest fade I've had in Jeddah. Booked in under a minute, no back and forth.",
    name: "Faisal A.",
  },
  {
    quote: "The loyalty thing actually feels worth it. Fourth cut was free, no gimmicks.",
    name: "Omar S.",
  },
  {
    quote: "Braids came out exactly like the reference photos. Booking again next week.",
    name: "Karim D.",
  },
];

export function Social() {
  return (
    <section className="hairline-t bg-ink-950 py-18 md:py-30">
      <Container wide>
        <Reveal>
          <SectionLabel index="08" label="REVIEWS" />
          <h2 className="mt-6 font-display text-display-md uppercase text-paper">
            NO SCRIPTED REVIEWS.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-px bg-ink-800 md:grid-cols-3">
          {REVIEWS.map((review, i) => (
            <Reveal key={review.name} delay={0.06 * i} className="bg-ink-950 p-8">
              <p className="font-display text-2xl leading-tight text-paper">“{review.quote}”</p>
              <p className="mt-6 font-sans text-xs font-semibold tracking-widest text-ink-400">
                — {review.name.toUpperCase()}
              </p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
