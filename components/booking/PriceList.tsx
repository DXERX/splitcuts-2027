"use client";

import { useState } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";
import { ConcretePanel } from "@/components/ui/ConcretePanel";
import { Container } from "@/components/ui/Container";
import type { Database } from "@/lib/database.types";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Localized } from "@/components/i18n/T";

type Service = Pick<
  Database["public"]["Tables"]["services"]["Row"],
  "id" | "name_en" | "name_ar" | "duration" | "price"
>;

/**
 * The price list IS the design -- not a grid of rounded service cards. One
 * long editorial list, large type, thin hairline separators. Hovering a row
 * reveals a full-bleed background image behind it; clicking a row starts
 * booking immediately (no separate service page).
 */
export function PriceList({
  services,
  selectedId,
  onSelect,
}: {
  services: Service[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { t } = useLanguage();

  return (
    <section id="services" className="hairline-t scroll-mt-[var(--nav-height)] bg-ink py-14 md:py-20">
      <Container wide>
        <div className="mb-8 flex items-baseline justify-between">
          <span className="tag-number text-ink-600">{t("services.tag")}</span>
          <span className="hidden font-sans text-[10px] tracking-widest text-ink-600 md:inline">
            {t("services.tapToBook")}
          </span>
        </div>

        <div className="relative">
          {services.map((service, i) => {
            const isHovered = hovered === service.id;
            const isSelected = selectedId === service.id;
            return (
              <button
                key={service.id}
                type="button"
                onClick={() => onSelect(service.id)}
                onMouseEnter={() => setHovered(service.id)}
                onMouseLeave={() => setHovered(null)}
                className={clsx(
                  "group relative flex w-full items-center justify-between overflow-hidden border-b border-ink-800 py-5 text-left transition-colors duration-300 ease-editorial md:py-7",
                  isSelected && "border-paper",
                )}
              >
                {isHovered && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 -z-0 hidden md:block"
                  >
                    <ConcretePanel className="h-full w-full opacity-60" tone="steel" />
                    <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/70 to-ink/10" />
                  </motion.div>
                )}

                <div className="relative z-10 flex items-baseline gap-4 md:gap-6">
                  <span className="tag-number text-ink-600">{String(i + 1).padStart(2, "0")}</span>
                  <span
                    className={clsx(
                      "font-display text-2xl uppercase tracking-tight transition-transform duration-300 ease-editorial sm:text-3xl md:text-4xl",
                      isSelected ? "text-paper" : "text-paper",
                      isHovered && "translate-x-2",
                    )}
                  >
                    <Localized en={service.name_en} ar={service.name_ar} />
                  </span>
                  {isSelected && <span className="font-display text-xl text-paper">✓</span>}
                </div>

                <span
                  className={clsx(
                    "relative z-10 shrink-0 font-sans text-lg font-semibold tabular-nums transition-transform duration-300 ease-editorial md:text-xl",
                    isHovered && "-translate-x-2",
                  )}
                >
                  {service.price} {t("services.sar")}
                </span>
              </button>
            );
          })}

          {services.length === 0 && (
            <p className="py-10 font-sans text-sm text-ink-400">{t("services.empty")}</p>
          )}
        </div>
      </Container>
    </section>
  );
}
