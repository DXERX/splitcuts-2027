import { Container } from "@/components/ui/Container";
import { BrandMark } from "@/components/ui/BrandMark";

const TAGS = ["SC/26", "JEDDAH", "EST.", "CUT DIFFERENT", "ABHUR", "02PM—02AM"];

/** One slim strip, not a footer full of link columns -- small tag-like
 * details, the way a clothing hang tag or skate graphic reads. */
export function FooterStrip() {
  return (
    <footer className="hairline-t bg-ink py-8">
      <Container wide className="flex flex-wrap items-center justify-between gap-4">
        <BrandMark />
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {TAGS.map((t) => (
            <span key={t} className="font-sans text-[10px] font-semibold tracking-widest text-ink-600">
              {t}
            </span>
          ))}
        </div>
      </Container>
    </footer>
  );
}
