"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { StaffShell } from "@/components/staff/StaffShell";
import { StaffDatePicker } from "@/components/staff/StaffDatePicker";
import { StatusFilterChips } from "@/components/staff/StatusFilterChips";
import { TodayOffPanel } from "@/components/staff/TimeOffPanel";
import { useShopSession } from "@/lib/staff/useShopSession";
import { useBranchChannel } from "@/lib/realtime/useBookingChannel";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/staff/appointments";
import { OfferPanel } from "@/components/staff/OfferPanel";
import { RecentLoyalty } from "@/components/staff/RecentLoyalty";
import { loadBranchDashboard, type BannedRow, type RecentAppointment } from "@/lib/staff/dashboardStats";
import type { AppointmentStatus } from "@/lib/database.types";
import { formatSlotLabel, shiftDate, slotTime } from "@/lib/timeSlots";
import { useBookingFlags } from "@/lib/staff/useBookingFlags";

const RECENT_STATUSES: AppointmentStatus[] = [
  "booked",
  "checked_in",
  "in_service",
  "completed",
  "cancelled",
  "no_show",
];

export default function AdminDashboardPage() {
  const shop = useShopSession();
  const [revenueWeek, setRevenueWeek] = useState(0);
  const [weekBookings, setWeekBookings] = useState(0);
  const [banned, setBanned] = useState<BannedRow[]>([]);
  const [recent, setRecent] = useState<RecentAppointment[]>([]);
  const flags = useBookingFlags(recent.map((row) => row.id));
  const [recentStatus, setRecentStatus] = useState<AppointmentStatus | "all">("all");
  const [statsError, setStatsError] = useState<string | null>(null);
  const [unbanPhone, setUnbanPhone] = useState("");
  const [unbanBusy, setUnbanBusy] = useState<string | null>(null);
  const [unbanError, setUnbanError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const statsRequest = useRef(0);

  const loadStats = useCallback(async () => {
    if (shop.loading) return;
    const requestId = ++statsRequest.current;
    const end = shop.businessDate;
    const start = shiftDate(end, -6);
    setStatsLoading(true);
    const result = await loadBranchDashboard(shop.supabase, {
      branchId: shop.branchId,
      from: start,
      to: end,
      status: recentStatus,
    });
    if (requestId !== statsRequest.current) return;
    setStatsLoading(false);
    if (result.error || !result.data) {
      setStatsError(result.error ?? "Could not load dashboard stats.");
      return;
    }
    setStatsError(null);
    setRevenueWeek(result.data.revenue7d);
    setWeekBookings(result.data.weekBookings);
    setBanned(result.data.banned);
    setRecent(result.data.recent);
  }, [shop.loading, shop.businessDate, shop.branchId, shop.supabase, recentStatus]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const loadStatsRef = useRef(loadStats);
  useEffect(() => {
    loadStatsRef.current = loadStats;
  }, [loadStats]);

  const refreshTimer = useRef<number | null>(null);
  const scheduleStatsRefresh = useCallback(() => {
    if (refreshTimer.current != null) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      void loadStatsRef.current();
    }, 400);
  }, []);

  useEffect(() => {
    return () => {
      if (refreshTimer.current != null) window.clearTimeout(refreshTimer.current);
    };
  }, []);

  // Today's board already updates through useShopSession. This subscription
  // only refreshes the 7-day totals, the ban list, and recent activity.
  useBranchChannel({
    branchId: shop.branchId,
    onNewAppointment: () => scheduleStatsRefresh(),
    onAppointmentUpdate: () => scheduleStatsRefresh(),
  });

  const today = shop.appointments;
  const completedToday = today.filter((a) => a.status === "completed");
  const noShowsToday = today.filter((a) => a.status === "no_show");
  const revenueToday = completedToday.reduce((s, a) => s + Number(a.total_price ?? 0), 0);

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

  const branchName = shop.branches.map((b) => b.name).join(" · ") || "No branch";

  async function unban(phone: string | null, customerId: string | null, busyKey: string) {
    setUnbanBusy(busyKey);
    setUnbanError(null);
    const { error } = await shop.supabase.rpc("clear_phone_ban", {
      p_phone: phone,
      p_customer_id: customerId,
    });
    setUnbanBusy(null);
    if (error) {
      setUnbanError(error.message);
      return;
    }
    setUnbanPhone("");
    void loadStats();
  }

  return (
    <StaffShell title="OWNER" meta={branchName}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-8">
        <StaffDatePicker value={shop.viewDate} today={shop.businessDate} onChange={shop.setViewDate} />
        <Link href="/cashier" className="bg-paper px-5 py-3 font-sans text-sm font-semibold text-ink">
          OPEN FLOOR
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-px bg-ink-800 md:grid-cols-4">
        {[
          [shop.isViewingToday ? "TODAY" : shop.viewDate, today.filter((a) => a.status !== "cancelled").length],
          ["DONE", completedToday.length],
          ["NO SHOWS", noShowsToday.length],
          ["BANNED", banned.length],
          [shop.isViewingToday ? "REVENUE TODAY" : "REVENUE (DAY)", `${revenueToday} SAR`],
          ["REVENUE 7D", `${revenueWeek} SAR`],
          ["CHAIRS", shop.barbers.length],
          ["WEEK BOOKINGS", weekBookings],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-ink-950 px-4 py-5">
            <span className="tag-number text-ink-400">{label}</span>
            <p className="mt-3 font-display text-2xl text-paper md:text-3xl">{value}</p>
          </div>
        ))}
      </section>

      {(shop.error || statsError) && (
        <p className="px-6 py-3 font-sans text-sm text-red-400">{shop.error || statsError}</p>
      )}

      <section className="grid gap-6 px-4 py-8 md:px-8 lg:grid-cols-2">
        <div className="space-y-6">
          <div>
            <span className="font-sans text-sm font-semibold text-ink-200">
              PER BARBER · {shop.isViewingToday ? "TODAY" : shop.viewDate}
            </span>
            <div className="mt-3 divide-y divide-ink-800 border border-ink-800">
              {byBarber.map((b) => (
                <div key={b.id} className="px-4 py-3">
                  <p className="font-sans text-sm text-paper">{b.name}</p>
                  <p className="mt-1 font-sans text-xs text-ink-400">
                    {b.total} booked · {b.live} in chair · {b.done} done · {b.revenue} SAR
                  </p>
                </div>
              ))}
              {byBarber.length === 0 && <p className="px-4 py-6 text-sm text-ink-400">No barbers.</p>}
            </div>
          </div>

          <div>
            <span className="font-sans text-sm font-semibold text-ink-200">BANNED FROM ONLINE BOOKING</span>
            <div className="mt-3 divide-y divide-ink-800 border border-ink-800">
              {banned.map((b) => {
                const customerId = /^[0-9a-f-]{36}$/i.test(b.key) ? b.key : null;
                const phone = b.phone !== "—" ? b.phone : null;
                return (
                  <div key={b.key} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-sans text-sm text-paper">{b.name}</p>
                      <p className="mt-1 font-sans text-xs text-red-400">
                        {b.phone} · {b.count} no-shows · online booking blocked
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={unbanBusy === b.key || (!phone && !customerId)}
                      onClick={() => void unban(phone, customerId, b.key)}
                      className="shrink-0 border border-paper px-3 py-2 font-sans text-xs font-semibold text-paper disabled:opacity-40"
                    >
                      {unbanBusy === b.key ? "UNBANNING…" : "UNBAN"}
                    </button>
                  </div>
                );
              })}
              {banned.length === 0 && <p className="px-4 py-6 text-sm text-ink-400">Nobody banned.</p>}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void unban(unbanPhone.trim(), null, "manual");
              }}
            >
              <input
                value={unbanPhone}
                onChange={(event) => setUnbanPhone(event.target.value)}
                placeholder="Phone to unban"
                className="hairline min-w-0 flex-1 bg-transparent px-3 py-2 font-sans text-sm text-paper outline-none placeholder:text-ink-600"
              />
              <button
                type="submit"
                disabled={unbanBusy === "manual" || !unbanPhone.trim()}
                className="bg-paper px-4 py-2 font-sans text-xs font-semibold text-ink disabled:opacity-40"
              >
                {unbanBusy === "manual" ? "…" : "UNBAN"}
              </button>
            </form>
            {unbanError && <p className="mt-2 font-sans text-xs text-red-400">{unbanError}</p>}
          </div>

          <OfferPanel services={shop.services} branchId={shop.branchId} supabase={shop.supabase} />

          <TodayOffPanel
            barbers={shop.barbers}
            supabase={shop.supabase}
            businessDate={shop.businessDate}
            onChange={shop.refresh}
          />
        </div>
      </section>

      <RecentLoyalty
        branchId={shop.branchId}
        supabase={shop.supabase}
        role={shop.role}
        enabled={!shop.loading}
      />

      <section className="px-4 pb-12 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-sans text-sm font-semibold text-ink-200">RECENT BOOKINGS</span>
          <StatusFilterChips value={recentStatus} onChange={setRecentStatus} statuses={RECENT_STATUSES} />
        </div>
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
                  {flags[a.id]?.tamaraPaid ? " · PAID TAMARA" : ""}
                  {flags[a.id]?.freeCut ? " · FREE CUT" : ""}
                </p>
              </div>
              <span className={clsx("font-sans text-[10px] font-semibold tracking-widest", STATUS_STYLE[a.status])}>
                {STATUS_LABEL[a.status] ?? a.status}
              </span>
            </div>
          ))}
          {recent.length === 0 && (
            <p className="px-5 py-8 text-sm text-ink-400">
              {recentStatus === "all" ? "No appointments." : "Nothing with that status."}
            </p>
          )}
        </div>
      </section>
    </StaffShell>
  );
}
