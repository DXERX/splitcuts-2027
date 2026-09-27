import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Reveal } from "@/components/ui/Reveal";
import { ConcretePanel } from "@/components/ui/ConcretePanel";

const PIECES = [
  { label: "SKIN FADE", span: "row-span-2" },
  { label: "BRAIDS", span: "" },
  { label: "BEARD SCULPT", span: "" },
  { label: "TWISTS", span: "row-span-2" },
  { label: "DREADS RETWIST", span: "" },
  { label: "DESIGN LINE-UP", span: "" },
];

/** Asymmetrical masonry-style gallery -- deliberately not a uniform grid. */
export function Gallery() {
  return (
    <section className="hairline-t bg-ink py-18 md:py-30">
      <Container wide>
        <Reveal>
          <SectionLabel index="05" label="WORK" />
          <h2 className="mt-6 font-display text-display-md uppercase text-paper">
            RECENT WORK.
          </h2>
        </Reveal>

        <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-3 md:auto-rows-[220px] md:gap-4">
          {PIECES.map((piece, i) => (
            <Reveal
              key={piece.label}
              delay={0.04 * i}
              className={`${piece.span} ${i === 0 ? "col-span-2 md:col-span-1" : ""}`}
            >
              <ConcretePanel
                label={piece.label}
                className="h-full min-h-[180px] w-full"
                tone={i % 2 === 0 ? "dark" : "steel"}
              />
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
