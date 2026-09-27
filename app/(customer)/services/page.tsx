import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Reveal } from "@/components/ui/Reveal";
import { ConcretePanel } from "@/components/ui/ConcretePanel";
import { LinkButton } from "@/components/ui/Button";
import { groupByCategory, SERVICE_CATEGORIES } from "@/lib/serviceCategories";
import { T, Localized, CategoryLabel } from "@/components/i18n/T";

export const metadata = { title: "Services — Split Cuts" };

export default async function ServicesPage() {
  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name_en, name_ar, duration, price, is_active, category")
    .eq("is_active", true)
    .order("price");

  const grouped = groupByCategory(services ?? []);
  const categories = SERVICE_CATEGORIES.filter((c) => (grouped[c]?.length ?? 0) > 0);

  return (
    <main className="min-h-screen bg-ink pt-[var(--nav-height)]">
      <section className="hairline-b py-16 md:py-24">
        <Container wide>
          <SectionLabel index="—" label={<T k="servicesPage.tag" />} />
          <h1 className="mt-6 font-display text-display-lg uppercase text-paper">
            <T k="servicesPage.headline" />
          </h1>
          <p className="mt-4 max-w-lg font-sans text-ink-200">
            <T k="servicesPage.subtext" />
          </p>
        </Container>
      </section>

      {categories.map((category, i) => {
        const items = grouped[category] ?? [];
        const featureFirst = i % 2 === 0;
        return (
          <section key={category} className="hairline-b py-16 md:py-24">
            <Container wide>
              <Reveal>
                <SectionLabel
                  index={String(i + 1).padStart(2, "0")}
                  label={<CategoryLabel category={category} />}
                />
              </Reveal>

              <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
                {items.map((service, j) => {
                  const isFeature = j === 0;
                  const order = featureFirst ? "" : j === 0 ? "md:order-last" : "";
                  return (
                    <Reveal
                      key={service.id}
                      delay={0.04 * j}
                      className={`${isFeature ? "md:col-span-2" : ""} ${order}`}
                    >
                      <div className="group hairline flex flex-col overflow-hidden md:h-full md:flex-row">
                        <ConcretePanel
                          className={isFeature ? "aspect-[16/9] w-full md:w-1/2" : "aspect-[4/3] w-full"}
                          tone={j % 2 === 0 ? "dark" : "steel"}
                        />
                        <div className="flex flex-1 flex-col justify-between p-6">
                          <div>
                            <span className="tag-number text-ink-600">
                              {String(j + 1).padStart(2, "0")}
                            </span>
                            <h3 className="mt-2 font-display text-2xl uppercase tracking-tight text-paper">
                              <Localized en={service.name_en} ar={service.name_ar} />
                            </h3>
                            <p className="mt-1 font-sans text-xs tracking-widest text-ink-400">
                              {service.duration} <T k="servicesPage.min" />
                            </p>
                          </div>
                          <div className="mt-6 flex items-center justify-between">
                            <span className="font-sans text-lg font-semibold text-paper">
                              {service.price} <T k="services.sar" />
                            </span>
                            <LinkButton href={`/book?service=${service.id}`} variant="secondary" size="md">
                              <T k="servicesPage.book" />
                            </LinkButton>
                          </div>
                        </div>
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            </Container>
          </section>
        );
      })}

      {categories.length === 0 && (
        <Container wide className="py-24 text-center">
          <p className="font-sans text-ink-400">
            <T k="servicesPage.empty" />
          </p>
        </Container>
      )}

      <section className="py-16 text-center md:py-24">
        <Container wide>
          <LinkButton href="/book" variant="primary" size="lg">
            <T k="servicesPage.cta" />
          </LinkButton>
        </Container>
      </section>
    </main>
  );
}
