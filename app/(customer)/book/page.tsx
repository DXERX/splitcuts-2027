"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Container } from "@/components/ui/Container";
import { BookingFlow } from "@/components/booking/BookingFlow";
import type { Database } from "@/lib/database.types";

type Barber = Database["public"]["Tables"]["barbers"]["Row"];
type Service = Database["public"]["Tables"]["services"]["Row"];

export default function BookPage() {
  return (
    <Suspense fallback={null}>
      <BookPageInner />
    </Suspense>
  );
}

function BookPageInner() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    void (async () => {
      const [{ data: barberRows }, { data: serviceRows }] = await Promise.all([
        supabase.from("barbers").select("*").eq("is_active", true).order("name"),
        supabase.from("services").select("*").eq("is_active", true).order("price"),
      ]);
      setBarbers(barberRows ?? []);
      setServices(serviceRows ?? []);
    })();
  }, [supabase]);

  return (
    <main className="min-h-screen bg-ink pt-[calc(var(--nav-height)+2rem)] pb-24">
      <Container className="max-w-2xl">
        <BookingFlow
          barbers={barbers}
          services={services}
          initialServiceId={searchParams.get("service")}
          initialBarberId={searchParams.get("barber")}
        />
      </Container>
    </main>
  );
}
