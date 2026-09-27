"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { StaffShell } from "@/components/staff/StaffShell";
import { FloorBoard } from "@/components/staff/FloorBoard";
import { useShopSession } from "@/lib/staff/useShopSession";
import { shopAudio } from "@/lib/audio/shopAudio";
import { useBranchChannel } from "@/lib/realtime/useBookingChannel";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/staff/appointments";
import { formatSlotLabel, slotTime } from "@/lib/timeSlots";

interface PendingPackageRequest {
  id: string;
  requested_at: string;
  customer_name: string | null;
  package_name: string | null;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function CashierShopModePage() {
  const shop = useShopSession();
  const clock = useClock();
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [feedId, setFeedId] = useState<string | null>(null);
  const [pendingPackages, setPendingPackages] = useState<PendingPackageRequest[]>([]);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!shop.branchId) return;
    void (async () => {
      const { data } = await shop.supabase
        .from("customer_packages")
        .select("id, requested_at, packages(name_en, branch_id), profiles:customer_id(full_name)")
        .eq("status", "pending_payment")
        .order("requested_at", { ascending: true });

      setPendingPackages(
        (data ?? [])
          .filter((r: { packages: { branch_id?: string } | { branch_id?: string }[] | null }) => {
            const pkg = Array.isArray(r.packages) ? r.packages[0] : r.packages;
            return !shop.branchId || pkg?.branch_id === shop.branchId;
          })
          .map((r: any) => ({
            id: r.id,
            requested_at: r.requested_at,
            customer_name: Array.isArray(r.profiles) ? r.profiles[0]?.full_name : r.profiles?.full_name,
            package_name: Array.isArray(r.packages) ? r.packages[0]?.name_en : r.packages?.name_en,
          })),
      );
    })();
  }, [shop.branchId, shop.supabase]);

  useBranchChannel({
    branchId: shop.branchId,
    onNotification: (notification) => {
      if (notification.type !== "new_booking") return;
      const timeMatch = notification.message.match(/at (.+)$/);
      shopAudio.playChime();
      shopAudio.announce("You", timeMatch?.[1] ?? "the scheduled time");
    },
    onNewAppointment: (appointment) => {
      setFeedId(appointment.id);
    },
  });

  async function activatePackage(id: string) {
    setActivatingId(id);
    const { error } = await shop.supabase.rpc("activate_customer_package", { p_customer_package_id: id });
    setActivatingId(null);
    if (!error) setPendingPackages((prev) => prev.filter((p) => p.id !== id));
  }

  const latest = shop.appointments.find((a) => a.id === feedId);
  const live = shop.appointments.filter((a) => !["cancelled", "no_show", "completed"].includes(a.status));
  const stats = useMemo(() => {
    const rows = shop.appointments;
    return {
      total: rows.filter((a) => a.status !== "cancelled").length,
      booked: rows.filter((a) => a.status === "booked").length,
      inChair: rows.filter((a) => a.status === "in_service" || a.status === "checked_in").length,
      done: rows.filter((a) => a.status === "completed").length,
      noShow: rows.filter((a) => a.status === "no_show").length,
      revenue: rows.filter((a) => a.status === "completed").reduce((sum, a) => sum + Number(a.total_price ?? 0), 0),
    };
  }, [shop.appointments]);

  const branchName = shop.branches.find((b) => b.id === shop.branchId)?.name ?? "All branches";

  return (
    <StaffShell
      title="CASHIER"
      meta={`${branchName} · ${clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
    >
      <div className="grid grid-cols-2 gap-px bg-ink-800 md:grid-cols-5">
        {[
          ["TODAY", stats.total],
          ["WAITING", stats.booked],
          ["IN CHAIR", stats.inChair],
          ["DONE", stats.done],
          ["REVENUE", `${stats.revenue} SAR`],
        ].map(([label, value]) => (
          <div key={label} className="bg-ink-950 px-5 py-5">
            <span className="tag-number text-ink-400">{label}</span>
            <p className="mt-2 font-display text-3xl text-paper">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
        <div className="flex items-center gap-2">
          <span className={clsx("h-2 w-2 rounded-full", shop.branchId ? "bg-status-live" : "bg-status-hold")} />
          <span className="font-sans text-[10px] font-semibold tracking-widest text-ink-400">
            {shop.loading ? "LOADING" : shop.branchId ? "LIVE" : "NO BRANCH"}
          </span>
          {shop.error && <span className="font-sans text-xs text-red-400">{shop.error}</span>}
        </div>
        {!audioEnabled ? (
          <button
            onClick={() => void shopAudio.enable().then(() => setAudioEnabled(true))}
            className="hairline px-4 py-2 font-sans text-xs font-semibold tracking-widest text-paper hover:border-ink-400"
          >
            ENABLE AUDIO
          </button>
        ) : (
          <button
            onClick={() => shopAudio.testSound()}
            className="hairline px-4 py-2 font-sans text-xs font-semibold tracking-widest text-status-live"
          >
            AUDIO ON
          </button>
        )}
      </div>

      <AnimatePresence>
        {latest && (
          <motion.div
            key={latest.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden border-y border-ink-800 bg-ink-900"
          >
            <div className="flex items-center justify-between px-4 py-3 md:px-8">
              <span className="font-sans text-xs font-semibold tracking-widest text-status-live">NEW BOOKING</span>
              <span className="font-sans text-sm text-paper">
                {latest.customer_name} · {latest.barber_name} · {formatSlotLabel(slotTime(latest.appointment_time))}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {pendingPackages.length > 0 && (
        <section className="border-b border-ink-800 px-4 py-6 md:px-8">
          <span className="tag-number text-ink-400">PACKAGE REQUESTS ({pendingPackages.length})</span>
          <div className="mt-3 divide-y divide-ink-800 border border-ink-800">
            {pendingPackages.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div>
                  <p className="font-sans text-sm text-paper">{p.customer_name ?? "Customer"}</p>
                  <p className="mt-0.5 font-sans text-xs text-ink-400">{p.package_name ?? "Package"}</p>
                </div>
                <button
                  onClick={() => void activatePackage(p.id)}
                  disabled={activatingId === p.id}
                  className="hairline px-4 py-2 font-sans text-xs font-semibold tracking-widest text-status-live hover:border-status-live disabled:opacity-40"
                >
                  {activatingId === p.id ? "ACTIVATING…" : "ACTIVATE (PAID)"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="px-4 py-6 md:px-8">
        <span className="tag-number text-ink-400">TODAY ({live.length} LIVE)</span>
        <div className="mt-3 divide-y divide-ink-800 border border-ink-800">
          {shop.appointments
            .filter((a) => a.status !== "cancelled")
            .map((a) => (
              <div key={a.id} className="grid grid-cols-[88px_1fr_auto] items-center gap-4 px-5 py-3">
                <span className="font-sans text-sm tabular-nums text-paper">
                  {formatSlotLabel(slotTime(a.appointment_time))}
                </span>
                <div>
                  <p className="font-sans text-sm text-paper">
                    {a.customer_name ?? "Customer"} · {a.service_name ?? "Service"}
                  </p>
                  <p className="mt-0.5 font-sans text-xs text-ink-400">
                    {a.barber_name ?? "barber"}
                    {a.customer_phone ? ` · ${a.customer_phone}` : ""}
                    {a.total_price != null ? ` · ${a.total_price} SAR` : ""}
                  </p>
                </div>
                <span className={clsx("font-sans text-[10px] font-semibold tracking-widest", STATUS_STYLE[a.status])}>
                  {STATUS_LABEL[a.status] ?? a.status}
                </span>
              </div>
            ))}
          {shop.appointments.length === 0 && !shop.loading && (
            <p className="px-5 py-8 font-sans text-sm text-ink-400">No appointments yet today.</p>
          )}
        </div>
      </section>

      <section className="px-4 pb-10 md:px-8">
        <span className="tag-number text-ink-400">EVERY CHAIR · 30 MIN</span>
        <div className="mt-3 border border-ink-800">
          <FloorBoard barbers={shop.barbers} appointments={shop.appointments} hours={shop.hours} />
        </div>
      </section>
    </StaffShell>
  );
}
