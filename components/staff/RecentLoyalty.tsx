"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

type CutRow = {
  id: string;
  appointment_date: string;
  customer_name: string;
  customer_phone: string | null;
  service_name: string;
  eligible: boolean;
  point_recorded: boolean;
  customer_id: string | null;
};

type SignupRow = {
  id: string;
  name: string;
  phone: string | null;
  bookings: number;
  points: number;
};

function asObject(value: Json | undefined): Record<string, Json | undefined> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, Json | undefined>;
}

function readReport(value: Json): { cuts: CutRow[]; signups: SignupRow[] } {
  const row = asObject(value);
  const cuts = Array.isArray(row?.cuts) ? row.cuts : [];
  const signups = Array.isArray(row?.signups) ? row.signups : [];
  return {
    cuts: cuts.flatMap((item) => {
      const entry = asObject(item);
      if (!entry || typeof entry.id !== "string") return [];
      return [{
        id: entry.id,
        appointment_date: String(entry.appointment_date ?? ""),
        customer_name: String(entry.customer_name ?? "Guest"),
        customer_phone: entry.customer_phone == null ? null : String(entry.customer_phone),
        service_name: String(entry.service_name ?? "Service"),
        eligible: entry.eligible === true,
        point_recorded: entry.point_recorded === true,
        customer_id: entry.customer_id == null ? null : String(entry.customer_id),
      }];
    }),
    signups: signups.flatMap((item) => {
      const entry = asObject(item);
      if (!entry || typeof entry.id !== "string") return [];
      return [{
        id: entry.id,
        name: String(entry.name ?? "Guest"),
        phone: entry.phone == null ? null : String(entry.phone),
        bookings: Number(entry.bookings ?? 0),
        points: Number(entry.points ?? 0),
      }];
    }),
  };
}

export function RecentLoyalty({
  branchId,
  supabase,
}: {
  branchId: string | null;
  supabase: Client;
}) {
  const [cuts, setCuts] = useState<CutRow[]>([]);
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc("recent_loyalty_report", {
      p_branch_id: branchId,
    });
    if (loadError) {
      setError(loadError.message);
      return;
    }
    const report = readReport(data);
    setError(null);
    setCuts(report.cuts);
    setSignups(report.signups);
  }, [branchId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recordMissing() {
    setBusy(true);
    setNote(null);
    const { data, error: fillError } = await supabase.rpc("backfill_recent_loyalty", { p_days: 14 });
    setBusy(false);
    if (fillError) {
      setError(fillError.message);
      return;
    }
    const result = asObject(data);
    setNote(
      `Linked ${Number(result?.linked ?? 0)} bookings · added ${Number(result?.visits_added ?? 0)} points · ${Number(result?.rewards_added ?? 0)} rewards.`,
    );
    await load();
  }

  const missing = cuts.filter((cut) => cut.eligible && !cut.point_recorded).length;

  return (
    <section className="px-4 pb-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-sans text-sm font-semibold text-ink-200">POINTS · LAST 14 DAYS</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void recordMissing()}
          className="bg-paper px-4 py-2 font-sans text-xs font-semibold text-ink disabled:opacity-40"
        >
          {busy ? "RECORDING…" : "RECORD MISSING POINTS"}
        </button>
      </div>
      <p className="mt-2 font-sans text-xs text-ink-400">
        {missing === 0
          ? "Every eligible done cut in this list has a point."
          : `${missing} eligible done cuts have no point yet.`}
      </p>
      {note && <p className="mt-2 font-sans text-xs text-paper">{note}</p>}
      {error && <p className="mt-2 font-sans text-xs text-red-400">{error}</p>}

      <div className="mt-3 divide-y divide-ink-800 border border-ink-800">
        {cuts.map((cut) => (
          <div key={cut.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-sans text-sm text-paper">
                {cut.customer_name} · {cut.service_name}
              </p>
              <p className="mt-1 font-sans text-xs text-ink-400">
                {cut.appointment_date}
                {cut.customer_phone ? ` · ${cut.customer_phone}` : ""}
                {cut.customer_id ? " · signed in" : " · no account"}
              </p>
            </div>
            <span className={cut.point_recorded ? "font-sans text-xs font-semibold text-paper" : "font-sans text-xs font-semibold text-red-400"}>
              {!cut.eligible ? "NOT A CUT POINT" : cut.point_recorded ? "POINT SAVED" : "NO POINT"}
            </span>
          </div>
        ))}
        {cuts.length === 0 && <p className="px-4 py-6 text-sm text-ink-400">No completed bookings in the last 14 days.</p>}
      </div>

      <p className="mb-2 mt-6 font-sans text-sm font-semibold text-ink-200">SIGNUPS WHO BOOKED · 14 DAYS</p>
      <div className="divide-y divide-ink-800 border border-ink-800">
        {signups.map((person) => (
          <p key={person.id} className="px-4 py-3 font-sans text-sm text-paper">
            {person.name}
            {person.phone ? ` · ${person.phone}` : ""}
            <span className="text-ink-400"> · {person.bookings} bookings · {person.points} points</span>
          </p>
        ))}
        {signups.length === 0 && (
          <p className="px-4 py-6 text-sm text-ink-400">No new signups with a booking in the last 14 days.</p>
        )}
      </div>
    </section>
  );
}
