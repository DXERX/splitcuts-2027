"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ActiveOffer = {
  service_id: string;
  name: string;
  offer_price: number;
};

export function useActiveOffers() {
  const [offers, setOffers] = useState<ActiveOffer[]>([]);

  useEffect(() => {
    const supabase = createClient();
    void supabase
      .from("service_offers")
      .select("service_id, name, offer_price")
      .eq("is_active", true)
      .then(({ data, error }) => {
        if (error || !data) return;
        setOffers(
          data.map((row) => ({
            service_id: row.service_id,
            name: row.name,
            offer_price: Number(row.offer_price),
          })),
        );
      });
  }, []);

  return offers;
}

export function offerFor(offers: ActiveOffer[], serviceId: string) {
  return offers.find((offer) => offer.service_id === serviceId) ?? null;
}

export function chargedPrice(menuPrice: number | null | undefined, offer: ActiveOffer | null) {
  if (offer) return offer.offer_price;
  return menuPrice ?? 0;
}
