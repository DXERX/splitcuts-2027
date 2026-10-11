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
  reward_used: boolean;
  checked: boolean;
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
        reward_used: entry.reward_used === true,
        checked: true,
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

function riyadhDate(offsetDays: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  const year = Number(match?.[1] ?? "1970");
  const month = Number(match?.[2] ?? "1");
  const day = Number(match?.[3] ?? "1");
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function earnsPoint(service: { name_en: string | null; category: string | null; price: number | null } | null | undefined): boolean {
  if (!service) return false;
  const name = (service.name_en ?? "").trim();
  if (name !== "Hair" && name !== "Hair + Beard") return false;
  if (service.category === "CUTS") return true;
  return service.category == null && !(name === "Hair" && Number(service.price ?? 0) >= 90);
}

function explainError(message: string, role: string | null): string {
  if (/FORBIDDEN/i.test(message)) {
    if (role === "owner" || role === "manager") {
      return "Points are blocked for this login. Run the latest SQL file (0028) in Supabase, then refresh.";
    }
    return `Signed in as ${role ?? "customer"}. Points need the owner account.`;
  }
  if (/schema cache/i.test(message) || /could not find the function/i.test(message)) {
    return "The points report is not installed yet. Run the latest SQL file (0028) in Supabase, then refresh.";
  }
  return message;
}

export function RecentLoyalty({
  branchId,
  supabase,
  role,
  enabled,
}: {
  branchId: string | null;
  supabase: Client;
  role: string | null;
  enabled: boolean;
}) {
  const [cuts, setCuts] = useState<CutRow[]>([]);
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc("recent_loyalty_report", {
      p_branch_id: branchId,
    });
    if (!loadError && data) {
      const report = readReport(data);
      setError(null);
      setPartial(false);
      setCuts(report.cuts);
      setSignups(report.signups);
      return;
    }

    const since = riyadhDate(-14);
    let bookings = supabase
      .from("appointments")
      .select("id, appointment_date, customer_name, customer_phone, customer_id, services(name_en, category, price)")
      .eq("status", "completed")
      .gte("appointment_date", since)
      .order("appointment_date", { ascending: false })
      .limit(300);
    if (branchId) bookings = bookings.eq("branch_id", branchId);

    const { data: rows, error: rowsError } = await bookings;
    if (rowsError) {
      setError(explainError(loadError?.message ?? rowsError.message, role));
      return;
    }

    const ids = (rows ?? []).map((row) => row.id);
    const { data: ledger, error: ledgerError } = ids.length
      ? await supabase
          .from("loyalty_transactions")
          .select("appointment_id, type")
          .in("appointment_id", ids)
          .in("type", ["visit_earned", "reward_redeemed"])
      : { data: [], error: null };
    const { data: owner } = await supabase.rpc("is_owner");
    const canCheck = !ledgerError && (owner === true || (ledger?.length ?? 0) > 0 || ids.length === 0);
    const saved = new Set((ledger ?? []).filter((row) => row.type === "visit_earned").map((row) => row.appointment_id));
    const freed = new Set((ledger ?? []).filter((row) => row.type === "reward_redeemed").map((row) => row.appointment_id));

    setPartial(true);
    setCuts((rows ?? []).map((row) => {
      const service = Array.isArray(row.services) ? row.services[0] : row.services;
      return {
        id: row.id,
        appointment_date: row.appointment_date,
        customer_name: row.customer_name ?? "Guest",
        customer_phone: row.customer_phone,
        service_name: service?.name_en ?? "Service",
        eligible: earnsPoint(service),
        point_recorded: saved.has(row.id),
        reward_used: freed.has(row.id),
        checked: canCheck,
        customer_id: row.customer_id,
      };
    }));
    setSignups([]);
    setError(canCheck ? null : "Completed cuts are listed. This login cannot read who already has a point. Run SQL file 0028, then refresh.");
  }, [branchId, role, supabase]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const { data, error: fillError } = await supabase.rpc("backfill_recent_loyalty", { p_days: 14 });
      if (cancelled) return;
      if (!fillError) {
        const result = asObject(data);
        const visits = Number(result?.visits_added ?? 0);
        const rewards = Number(result?.rewards_added ?? 0);
        const linked = Number(result?.linked ?? 0);
        if (visits > 0 || rewards > 0 || linked > 0) {
          setNote(`Linked ${linked} bookings · added ${visits} points · ${rewards} rewards.`);
        }
      }
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, load, supabase]);

  async function recordMissing() {
    setBusy(true);
    setNote(null);
    const { data, error: fillError } = await supabase.rpc("backfill_recent_loyalty", { p_days: 14 });
    setBusy(false);
    if (fillError) {
      setError(explainError(fillError.message, role));
      return;
    }
    const result = asObject(data);
    setNote(
      `Linked ${Number(result?.linked ?? 0)} bookings · added ${Number(result?.visits_added ?? 0)} points · ${Number(result?.rewards_added ?? 0)} rewards.`,
    );
    await load();
  }

  const missing = cuts.filter((cut) => cut.checked && cut.eligible && !cut.point_recorded && !cut.reward_used).length;

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
        Only Hair and Hair + Beard earn a point, once a day. Five points unlock a free cut.
        That next cut uses the reward and the count goes back to 0.
        {partial
          ? ""
          : missing === 0
            ? " Every eligible done cut in this list is saved."
            : ` ${missing} eligible done cuts have no point yet.`}
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
            <span className={cut.checked && cut.eligible && !cut.point_recorded && !cut.reward_used ? "font-sans text-xs font-semibold text-red-400" : "font-sans text-xs font-semibold text-paper"}>
              {!cut.eligible
                ? "NOT A CUT POINT"
                : !cut.checked
                  ? "NOT CHECKED"
                  : cut.reward_used
                    ? "FREE CUT · RESET"
                    : cut.point_recorded
                      ? "POINT SAVED"
                      : "NO POINT"}
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
          <p className="px-4 py-6 text-sm text-ink-400">
            {partial ? "Signup list opens after SQL file 0028." : "No new signups with a booking in the last 14 days."}
          </p>
        )}
      </div>
    </section>
  );
}
