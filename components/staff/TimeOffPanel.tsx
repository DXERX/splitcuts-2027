"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/Button";
import type { Database } from "@/lib/database.types";

type BarberOption = { id: string; name: string | null; nickname: string | null };

/**
 * The shop runs on one shared tablet/account at the counter -- there's no
 * per-barber login (see lib/roles.ts), so this is a one-tap staff action,
 * not a scheduling form: pick the barber, press TODAY OFF, their chair
 * closes for the rest of today. No date field (it's always "today" on this
 * device) and no reason field -- staff who need those can still write
 * directly to barber_time_off from Supabase if a real vacation needs to be
 * scheduled ahead of time. Tap UNDO to reverse a mis-tap.
 */
export function TodayOffPanel({
  barbers,
  supabase,
  businessDate,
  onChange,
}: {
  barbers: BarberOption[];
  supabase: SupabaseClient<Database>;
  /** The shop's current business date (useShopSession's businessDate) --
   * always "today" regardless of whichever day the dashboard happens to be
   * browsing, since marking someone off is always a today action. */
  businessDate: string;
  /** Fires after a day off is added or undone, so a caller showing the same
   * day on a floor board (useShopSession's offBarberIds) can re-fetch and
   * reflect it immediately. */
  onChange?: () => void;
}) {
  const [offIds, setOffIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [barberId, setBarberId] = useState("");
  const [saving, setSaving] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (barbers.length === 0) {
      setOffIds(new Set());
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("barber_time_off")
      .select("barber_id")
      .eq("off_date", businessDate)
      .in(
        "barber_id",
        barbers.map((b) => b.id),
      );
    setOffIds(new Set((data ?? []).map((r) => r.barber_id)));
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barbers.map((b) => b.id).join(","), businessDate]);

  async function markTodayOff() {
    if (!barberId) return;
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase
      .from("barber_time_off")
      .insert({ barber_id: barberId, off_date: businessDate });
    setSaving(false);
    if (insertError && insertError.code !== "23505") {
      setError(insertError.message);
      return;
    }
    setBarberId("");
    await load();
    onChange?.();
  }

  async function undo(id: string) {
    setUndoingId(id);
    await supabase.from("barber_time_off").delete().eq("barber_id", id).eq("off_date", businessDate);
    setUndoingId(null);
    await load();
    onChange?.();
  }

  const available = barbers.filter((b) => !offIds.has(b.id));
  const off = barbers.filter((b) => offIds.has(b.id));

  return (
    <div>
      <span className="tag-number text-ink-400">TODAY OFF</span>
      <div className="mt-3 flex flex-col gap-2 border border-ink-800 bg-ink-950 p-4 sm:flex-row sm:items-center">
        <select
          value={barberId}
          onChange={(e) => setBarberId(e.target.value)}
          className="hairline flex-1 bg-transparent px-3 py-2 font-sans text-sm text-paper outline-none"
        >
          <option value="" className="bg-ink">
            Pick a barber…
          </option>
          {available.map((b) => (
            <option key={b.id} value={b.id} className="bg-ink">
              {b.name || b.nickname || "Barber"}
            </option>
          ))}
        </select>
        <Button variant="primary" size="md" disabled={saving || !barberId} onClick={() => void markTodayOff()}>
          {saving ? "CLOSING…" : "TODAY OFF"}
        </Button>
      </div>
      {error && <p className="mt-2 font-sans text-xs text-red-400">{error}</p>}

      {!loading && off.length > 0 && (
        <div className="mt-3 divide-y divide-ink-800 border border-ink-800">
          {off.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="font-sans text-sm text-paper">
                {b.name || b.nickname || "Barber"} <span className="text-red-400">· OFF TODAY</span>
              </p>
              <button
                type="button"
                onClick={() => void undo(b.id)}
                disabled={undoingId === b.id}
                className="font-sans text-xs font-semibold tracking-widest text-ink-400 hover:text-paper disabled:opacity-40"
              >
                {undoingId === b.id ? "…" : "UNDO"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
