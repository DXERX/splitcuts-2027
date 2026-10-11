"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Service } from "@/lib/staff/appointments";

type Client = SupabaseClient<Database>;
type Offer = Database["public"]["Tables"]["service_offers"]["Row"];

export function OfferPanel({
  services,
  branchId,
  supabase,
}: {
  services: Service[];
  branchId: string | null;
  supabase: Client;
}) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [offerId, setOfferId] = useState("new");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branchServices = services.filter((service) => !branchId || service.branch_id === branchId);
  const serviceOffers = offers.filter((offer) => offer.service_id === serviceId);
  const active = offers.filter((offer) => offer.is_active);

  async function load() {
    let query = supabase.from("service_offers").select("*").order("name");
    if (branchId) query = query.eq("branch_id", branchId);
    const { data, error: loadError } = await query;
    if (loadError) {
      setError(
        /schema cache|does not exist|could not find/i.test(loadError.message)
          ? "Offers are not installed yet. Run the offers SQL file (0026) in Supabase, then refresh."
          : loadError.message,
      );
      return;
    }
    setOffers(data ?? []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  function pickOffer(nextId: string) {
    setOfferId(nextId);
    const offer = serviceOffers.find((row) => row.id === nextId);
    if (offer) {
      setName(offer.name);
      setPrice(String(offer.offer_price));
    }
  }

  async function apply() {
    if (!serviceId) return;
    const amount = Number(price);
    if (!name.trim() || Number.isNaN(amount)) {
      setError("Enter an offer name and a price.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: applyError } = await supabase.rpc("apply_service_offer", {
      p_service_id: serviceId,
      p_name: name.trim(),
      p_offer_price: amount,
      p_offer_id: offerId === "new" ? null : offerId,
    });
    setBusy(false);
    if (applyError) {
      setError(applyError.message);
      return;
    }
    setName("");
    setPrice("");
    setOfferId("new");
    await load();
  }

  async function clearOffer() {
    if (!serviceId) return;
    setBusy(true);
    setError(null);
    const { error: clearError } = await supabase.rpc("clear_service_offer", { p_service_id: serviceId });
    setBusy(false);
    if (clearError) {
      setError(clearError.message);
      return;
    }
    await load();
  }

  return (
    <div>
      <span className="font-sans text-sm font-semibold text-ink-200">OFFERS</span>
      <p className="mt-1 font-sans text-xs text-ink-400">
        Pick a service and an offer. The booking price changes while that offer is on.
      </p>
      <div className="mt-3 space-y-3 border border-ink-800 p-4">
        <label className="block font-sans text-xs text-ink-200">
          SERVICE
          <select
            value={serviceId}
            onChange={(event) => {
              setServiceId(event.target.value);
              setOfferId("new");
              setName("");
              setPrice("");
            }}
            className="hairline mt-1 w-full bg-transparent px-3 py-2 font-sans text-sm text-paper outline-none"
          >
            <option value="" className="bg-ink">Choose a service</option>
            {branchServices.map((service) => (
              <option key={service.id} value={service.id} className="bg-ink">
                {service.name_en} · menu {service.price} SAR
              </option>
            ))}
          </select>
        </label>
        <label className="block font-sans text-xs text-ink-200">
          OFFER
          <select
            value={offerId}
            onChange={(event) => pickOffer(event.target.value)}
            disabled={!serviceId}
            className="hairline mt-1 w-full bg-transparent px-3 py-2 font-sans text-sm text-paper outline-none disabled:opacity-40"
          >
            <option value="new" className="bg-ink">New offer</option>
            {serviceOffers.map((offer) => (
              <option key={offer.id} value={offer.id} className="bg-ink">
                {offer.name} · {offer.offer_price} SAR{offer.is_active ? " · ON" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Offer name"
            className="hairline bg-transparent px-3 py-2 font-sans text-sm text-paper outline-none placeholder:text-ink-600"
          />
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            inputMode="decimal"
            placeholder="Offer price"
            className="hairline bg-transparent px-3 py-2 font-sans text-sm text-paper outline-none placeholder:text-ink-600"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !serviceId}
            onClick={() => void apply()}
            className="bg-paper px-4 py-2 font-sans text-xs font-semibold text-ink disabled:opacity-40"
          >
            {busy ? "SAVING…" : "UPDATE PRICE"}
          </button>
          <button
            type="button"
            disabled={busy || !serviceId}
            onClick={() => void clearOffer()}
            className="border border-ink-400 px-4 py-2 font-sans text-xs font-semibold text-paper disabled:opacity-40"
          >
            CLEAR OFFER
          </button>
        </div>
        {error && <p className="font-sans text-xs text-red-400">{error}</p>}
      </div>
      <div className="mt-3 divide-y divide-ink-800 border border-ink-800">
        {active.map((offer) => {
          const service = branchServices.find((row) => row.id === offer.service_id);
          return (
            <p key={offer.id} className="px-4 py-3 font-sans text-sm text-paper">
              {service?.name_en ?? "Service"} · {offer.name} · {offer.offer_price} SAR
              <span className="text-ink-400"> · was {service?.price ?? "—"} SAR</span>
            </p>
          );
        })}
        {active.length === 0 && <p className="px-4 py-6 text-sm text-ink-400">No offer is on.</p>}
      </div>
    </div>
  );
}
