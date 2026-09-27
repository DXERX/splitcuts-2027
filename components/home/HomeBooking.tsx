"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { PriceList } from "@/components/booking/PriceList";
import { BookingFlow } from "@/components/booking/BookingFlow";
import type { Database } from "@/lib/database.types";

type Barber = Database["public"]["Tables"]["barbers"]["Row"];
type Service = Database["public"]["Tables"]["services"]["Row"];

/**
 * The price list IS the booking entry point -- tapping a row opens the form
 * right there, in place, instead of navigating to a separate service page.
 */
export function HomeBooking({ barbers, services }: { barbers: Barber[]; services: Service[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function handleSelect(id: string) {
    setSelectedId(id);
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <>
      <PriceList services={services} selectedId={selectedId} onSelect={handleSelect} />

      <AnimatePresence>
        {selectedId && (
          <motion.section
            ref={panelRef}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="hairline-t overflow-hidden bg-ink-950 scroll-mt-[calc(var(--nav-height)+1rem)]"
          >
            <Container wide className="py-14 md:py-20">
              <BookingFlow
                key={selectedId}
                barbers={barbers}
                services={services}
                initialServiceId={selectedId}
              />
            </Container>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
