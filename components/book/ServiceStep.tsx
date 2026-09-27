"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import { ConcretePanel } from "@/components/ui/ConcretePanel";
import { staggerChildren, fadeUp } from "@/lib/motion";
import type { Database } from "@/lib/database.types";

type Service = Pick<
  Database["public"]["Tables"]["services"]["Row"],
  "id" | "name_en" | "duration" | "price"
>;

export function ServiceStep({
  services,
  selectedId,
  onSelect,
}: {
  services: Service[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={staggerChildren(0.05)}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {services.map((service, i) => {
        const selected = service.id === selectedId;
        return (
          <motion.button
            key={service.id}
            type="button"
            variants={fadeUp}
            onClick={() => onSelect(service.id)}
            className={clsx(
              "group text-left transition-colors duration-400 ease-editorial",
              selected ? "bg-paper text-ink" : "hairline text-paper hover:border-ink-400",
            )}
          >
            <div className="relative">
              <ConcretePanel
                className="aspect-[4/3] w-full"
                tone={selected ? "steel" : "dark"}
              >
                <span
                  className={clsx(
                    "absolute left-4 top-4 tag-number",
                    selected ? "text-ink/70" : "text-ink-200/80",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              </ConcretePanel>
            </div>
            <div className="flex items-start justify-between gap-4 p-5">
              <div>
                <h3 className="font-display text-xl uppercase tracking-tight">
                  {service.name_en}
                </h3>
                <p
                  className={clsx(
                    "mt-1 font-sans text-xs tracking-widest",
                    selected ? "text-ink/60" : "text-ink-400",
                  )}
                >
                  {service.duration} MIN
                </p>
              </div>
              <span className="font-sans text-sm font-semibold">{service.price} SAR</span>
            </div>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
