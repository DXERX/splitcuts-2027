"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { StaffShell } from "@/components/staff/StaffShell";
import { FloorBoard } from "@/components/staff/FloorBoard";
import { useShopSession } from "@/lib/staff/useShopSession";
import { STATUS_LABEL, STATUS_STYLE, type LiveAppointment } from "@/lib/staff/appointments";
import { formatSlotLabel, slotTime } from "@/lib/timeSlots";

interface BannedRow {
  key: string;
  name: string;
  phone: string;
  count: number;
}

export default function AdminDashboardPage() {
  const shop = useShopSession();
  const [allRows, setAllRows] = useState<LiveAppointment[]>([]);
  const [weekRows, setWeekRows] = useState<LiveAppointment[]>([]);

  useEffect(() => {
    if (shop.loading) return;
    void (async () => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekStr = weekAgo.toISOString().slice(0, 10);

      let query = shop.supabase.from("appointments").select("*").order("appointment_start", { ascending: false }).limit(400);
      if (shop.branchId) query = query.eq("branch_id", shop.branchId);
      const { data } = await query;
      const rows = (data ?? []) as LiveAppointment[];
      setAllRows(rows);

      let weekQuery = shop.supabase.from("appointments").select("*").gte("appointment_date", weekStr);
      if (shop.branchId) weekQuery = weekQuery.eq("branch_id", shop.branchId);
      const { data: week } = await weekQuery;
      setWeekRows((week ?? []) as LiveAppointment[]);
    })();
  }, [shop.loading, shop.branchId, shop.supabase]);

  const today = shop.appointments;
  const completedToday = today.filter((a) => a.status === "completed");
  const noShowsToday = today.filter((a) => a.status === "no_show");
  const revenueToday = completedToday.reduce((s, a) => s + Number(a.total_price ?? 0), 0);
  const revenueWeek = weekRows
    .filter((a) => a.status === "completed")
    .reduce((s, a) => s + Number(a.total_price ?? 0), 0);

  const byBarber = shop.barbers.map((b) => {
    const rows = today.filter((a) => a.barber_id === b.id && a.status !== "cancelled");
    return {
      id: b.id,
      name: b.name || b.nickname || "Barber",
      total: rows.length,
      done: rows.filter((a) => a.status === "completed").length,
      live: rows.filter((a) => a.status === "in_service" || a.status === "checked_in").length,
      revenue: rows.filter((a) => a.status === "completed").reduce((s, a) => s + Number(a.total_price ?? 0), 0),
    };
  });

  const banned: BannedRow[] = useMemo(() => {
    const map = new Map<string, BannedRow>();
    for (const a of allRows) {
      if (a.status !== "no_show") continue;
      const key = a.customer_id || a.customer_phone || a.id;
      const current = map.get(key) ?? {
        key,
        name: a.customer_name ?? "Guest",
        phone: a.customer_phone ?? "—",
        count: 0,
      };
      current.count += 1;
      map.set(key, current);
    }
    return [...map.values()].filter((r) => r.count >= 2).sort((a, b) => b.count - a.count);
  }, [allRows]);

  const recent = allRows.slice(0, 12);
  const branchName = shop.branches.map((b) => b.name).join(" · ") || "No branch";

  return (
    <StaffShell title={shop.role === "manager" ? "BRANCH" : "OWNER"} meta={branchName}>
      <section className="grid grid-cols-2 gap-px bg-ink-800 md:grid-cols-4 xl:grid-cols-8">
        {[
          ["TODAY", today.filter((a) => a.status !== "cancelled").length],
          ["COMPLETED", completedToday.length],
          ["NO SHOWS", noShowsToday.length],
          ["BANNED", banned.length],
          ["REVENUE TODAY", `${revenueToday} SAR`],
          ["REVENUE 7D", `${revenueWeek} SAR`],
          ["CHAIRS", shop.barbers.length],
          ["WEEK BOOKINGS", weekRows.filter((a) => a.status !== "cancelled").length],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-ink-950 px-4 py-5">
            <span className="tag-number text-ink-400">{label}</span>
            <p className="mt-3 font-display text-2xl text-paper md:text-3xl">{value}</p>
          </div>
        ))}
      </section>

      {shop.error && <p className="px-6 py-3 font-sans text-sm text-red-400">{shop.error}</p>}

      <section className="grid gap-6 px-4 py-8 md:px-8 lg:grid-cols-[1fr_320px]">
        <div>
          <span className="tag-number text-ink-400">LIVE FLOOR</span>
          <div className="mt-3 border border-ink-800 bg-ink-950">
            <FloorBoard barbers={shop.barbers} appointments={shop.appointments} hours={shop.hours} />
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <span className="tag-number text-ink-400">PER BARBER TODAY</span>
            <div className="mt-3 divide-y divide-ink-800 border border-ink-800">
              {byBarber.map((b) => (
                <div key={b.id} className="px-4 py-3">
                  <p className="font-sans text-sm text-paper">{b.name}</p>
                  <p className="mt-1 font-sans text-xs text-ink-400">
                    {b.total} booked · {b.live} live · {b.done} done · {b.revenue} SAR
                  </p>
                </div>
              ))}
              {byBarber.length === 0 && <p className="px-4 py-6 text-sm text-ink-400">No barbers loaded.</p>}
            </div>
          </div>

          <div>
            <span className="tag-number text-ink-400">BANNED (2+ NO SHOWS)</span>
            <div className="mt-3 divide-y divide-ink-800 border border-ink-800">
              {banned.map((b) => (
                <div key={b.key} className="px-4 py-3">
                  <p className="font-sans text-sm text-paper">{b.name}</p>
                  <p className="mt-1 font-sans text-xs text-red-400">
                    {b.phone} · {b.count} no-shows · online booking blocked
                  </p>
                </div>
              ))}
              {banned.length === 0 && <p className="px-4 py-6 text-sm text-ink-400">Nobody banned yet.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-12 md:px-8">
        <span className="tag-number text-ink-400">RECENT ACTIVITY</span>
        <div className="mt-3 divide-y divide-ink-800 border border-ink-800">
          {recent.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="font-sans text-sm text-paper">
                  {a.customer_name ?? "Guest"} · {formatSlotLabel(slotTime(a.appointment_time))} · {a.appointment_date}
                </p>
                <p className="mt-0.5 font-sans text-xs text-ink-400">
                  {shop.barbers.find((b) => b.id === a.barber_id)?.name ?? a.barber_id.slice(0, 8)}
                  {a.total_price != null ? ` · ${a.total_price} SAR` : ""}
                  {a.customer_phone ? ` · ${a.customer_phone}` : ""}
                </p>
              </div>
              <span className={clsx("font-sans text-[10px] font-semibold tracking-widest", STATUS_STYLE[a.status])}>
                {STATUS_LABEL[a.status] ?? a.status}
              </span>
            </div>
          ))}
          {recent.length === 0 && <p className="px-5 py-8 text-sm text-ink-400">No appointments yet.</p>}
        </div>
      </section>
    </StaffShell>
  );
}
