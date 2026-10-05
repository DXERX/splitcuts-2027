"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/Button";
import { todayDateString } from "@/lib/timeSlots";
import type { Database } from "@/lib/database.types";

type BarberOption = { id: string; name: string | null; nickname: string | null };

interface TimeOffEntry {
  id: string;
  barber_id: string;
  off_date: string;
  reason: string | null;
}

/**
 * Lets branch staff mark a barber off for a day (vacation, sick, etc.) so
 * the booking RPCs stop offering that barber's chair. Barbers don't sign in
 * themselves (see lib/roles.ts), so this is always a staff action taken on
 * their behalf -- there is no barber-facing equivalent of this panel.
 */
export function TimeOffPanel({
  barbers,
  supabase,
  onChange,
}: {
  barbers: BarberOption[];
  supabase: SupabaseClient<Database>;
  /** Fires after a day off is added or removed, so a caller showing the
   * same barber/date on a floor board (useShopSession's offBarberIds) can
   * re-fetch and reflect it immediately instead of waiting for the next
   * natural reload. */
  onChange?: () => void;
}) {
  const [entries, setEntries] = useState<TimeOffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [barberId, setBarberId] = useState("");
  const [offDate, setOffDate] = useState(todayDateString());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (barbers.length === 0) {
      setEntries([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("barber_time_off")
      .select("id, barber_id, off_date, reason")
      .in(
        "barber_id",
        barbers.map((b) => b.id),
      )
      .gte("off_date", todayDateString())
      .order("off_date", { ascending: true });
    setEntries(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barbers.map((b) => b.id).join(",")]);

  function barberLabel(id: string): string {
    const b = barbers.find((x) => x.id === id);
    return b?.name || b?.nickname || "Barber";
  }

  async function addEntry() {
    if (!barberId || !offDate) return;
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase
      .from("barber_time_off")
      .insert({ barber_id: barberId, off_date: offDate, reason: reason.trim() || null });
    setSaving(false);
    if (insertError) {
      setError(insertError.code === "23505" ? "Already marked off that day." : insertError.message);
      return;
    }
    setReason("");
    await load();
    onChange?.();
  }

  async function removeEntry(id: string) {
    setRemovingId(id);
    await supabase.from("barber_time_off").delete().eq("id", id);
    setRemovingId(null);
    await load();
    onChange?.();
  }

  return (
    <div>
      <span className="tag-number text-ink-400">TIME OFF</span>
      <div className="mt-3 border border-ink-800 bg-ink-950 p-4">
        <div className="flex flex-col gap-2">
          <select
            value={barberId}
            onChange={(e) => setBarberId(e.target.value)}
            className="hairline bg-transparent px-3 py-2 font-sans text-sm text-paper outline-none"
          >
            <option value="" className="bg-ink">
              Pick a barber…
            </option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id} className="bg-ink">
                {b.name || b.nickname || "Barber"}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={offDate}
            min={todayDateString()}
            onChange={(e) => setOffDate(e.target.value)}
            className="hairline bg-transparent px-3 py-2 font-sans text-sm text-paper outline-none [color-scheme:dark]"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional) -- vacation, sick…"
            className="hairline bg-transparent px-3 py-2 font-sans text-sm text-paper outline-none placeholder:text-ink-600"
          />
          {error && <p className="font-sans text-xs text-red-400">{error}</p>}
          <Button variant="primary" size="md" disabled={saving || !barberId} onClick={() => void addEntry()}>
            {saving ? "SAVING…" : "MARK OFF"}
          </Button>
        </div>
      </div>

      <div className="mt-3 divide-y divide-ink-800 border border-ink-800">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-sans text-sm text-paper">
                {barberLabel(e.barber_id)} · {e.off_date}
              </p>
              {e.reason && <p className="mt-0.5 font-sans text-xs text-ink-400">{e.reason}</p>}
            </div>
            <button
              type="button"
              onClick={() => void removeEntry(e.id)}
              disabled={removingId === e.id}
              className="font-sans text-xs font-semibold tracking-widest text-red-400/80 hover:text-red-400 disabled:opacity-40"
            >
              {removingId === e.id ? "…" : "REMOVE"}
            </button>
          </div>
        ))}
        {!loading && entries.length === 0 && (
          <p className="px-4 py-6 font-sans text-sm text-ink-400">No time off scheduled.</p>
        )}
      </div>
    </div>
  );
}
