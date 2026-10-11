"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { StaffShell } from "@/components/staff/StaffShell";
import { TodayOffPanel } from "@/components/staff/TimeOffPanel";
import { useShopSession } from "@/lib/staff/useShopSession";
import { mergeLiveAppointment, type LiveAppointment } from "@/lib/staff/appointments";
import { extendedMinutes, formatSlotLabel, slotTime } from "@/lib/timeSlots";
import type { AppointmentStatus } from "@/lib/database.types";

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: "BOOKED",
  checked_in: "ARRIVED",
  in_service: "IN CHAIR",
  completed: "DONE",
  cancelled: "CANCELLED",
  no_show: "NO SHOW",
};

const NEXT_LABEL: Partial<Record<AppointmentStatus, string>> = {
  booked: "ARRIVED",
  checked_in: "START",
  in_service: "DONE",
};

const NEXT_STATUS: Partial<Record<AppointmentStatus, AppointmentStatus>> = {
  booked: "checked_in",
  checked_in: "in_service",
  in_service: "completed",
};

function sortByTime(rows: LiveAppointment[], hours: { default_start: string; default_end: string }) {
  return [...rows].sort(
    (a, b) =>
      extendedMinutes(slotTime(a.appointment_time), hours) - extendedMinutes(slotTime(b.appointment_time), hours),
  );
}

export function ShopTablet() {
  const shop = useShopSession();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmNoShow, setConfirmNoShow] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [packages, setPackages] = useState<{ id: string; name: string; customer: string }[]>([]);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!shop.branchId) return;
    void (async () => {
      const { data } = await shop.supabase
        .from("customer_packages")
        .select("id, customer_id, packages(name_ar, name_en, branch_id)")
        .eq("status", "pending_payment")
        .order("requested_at", { ascending: true });
      const rows = (data ?? []).filter((row) => {
        const pkg = Array.isArray(row.packages) ? row.packages[0] : row.packages;
        return !pkg?.branch_id || pkg.branch_id === shop.branchId;
      });
      const ids = [...new Set(rows.map((row) => row.customer_id))];
      const { data: people } = ids.length
        ? await shop.supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] as { id: string; full_name: string | null }[] };
      const names = new Map((people ?? []).map((person) => [person.id, person.full_name]));
      setPackages(
        rows.map((row) => {
          const pkg = Array.isArray(row.packages) ? row.packages[0] : row.packages;
          return {
            id: row.id,
            name: pkg?.name_en || pkg?.name_ar || "Package",
            customer: names.get(row.customer_id) || "Customer",
          };
        }),
      );
    })();
  }, [shop.branchId, shop.supabase, shop.lastSyncedAt]);

  const visible = shop.appointments.filter((row) => row.status !== "cancelled");
  const waiting = visible.filter((row) => row.status === "booked" || row.status === "checked_in").length;
  const inChair = visible.filter((row) => row.status === "in_service").length;
  const done = visible.filter((row) => row.status === "completed").length;

  const columns = shop.barbers.map((barber) => ({
    barber,
    off: shop.offBarberIds.has(barber.id),
    rows: sortByTime(
      visible.filter((row) => row.barber_id === barber.id && row.status !== "completed"),
      shop.hours,
    ),
    done: sortByTime(
      visible.filter((row) => row.barber_id === barber.id && row.status === "completed"),
      shop.hours,
    ),
  }));

  async function setStatus(appointment: LiveAppointment, next: AppointmentStatus) {
    setBusyId(appointment.id);
    setActionError(null);
    const { data, error } = await shop.supabase.rpc("update_appointment_status", {
      p_appointment_id: appointment.id,
      p_new_status: next,
    });
    setBusyId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    if (data) {
      shop.setAppointments((prev) => mergeLiveAppointment(prev, data, shop.barbers, shop.services));
    }
  }

  const synced = shop.lastSyncedAt
    ? shop.lastSyncedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <StaffShell title="FLOOR" meta={shop.branches.find((b) => b.id === shop.branchId)?.name ?? "Split Cuts"}>
      <div className="sticky top-[57px] z-20 border-b border-ink-800 bg-ink px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={clsx("h-2.5 w-2.5 rounded-full", shop.error ? "bg-red-400" : "bg-status-live")} />
            <p className="font-sans text-sm text-paper">
              {shop.loading ? "Loading today's bookings…" : `Live · last update ${synced}`}
            </p>
          </div>
          <p className="font-sans text-sm text-ink-200">
            {waiting} waiting · {inChair} in chair · {done} done
          </p>
        </div>
        {actionError && <p className="mt-2 font-sans text-sm text-red-400">{actionError}</p>}
        {shop.error && <p className="mt-2 font-sans text-sm text-red-400">{shop.error}</p>}
      </div>

      {packages.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-ink-800 px-4 py-3">
          {packages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              disabled={activatingId === pkg.id}
              onClick={() => {
                setActivatingId(pkg.id);
                void shop.supabase.rpc("activate_customer_package", { p_customer_package_id: pkg.id }).then(({ error }) => {
                  setActivatingId(null);
                  if (!error) setPackages((prev) => prev.filter((row) => row.id !== pkg.id));
                  else setActionError(error.message);
                });
              }}
              className="shrink-0 border border-status-hold px-4 py-3 text-left font-sans text-sm text-paper"
            >
              <span className="block font-semibold">{pkg.customer}</span>
              <span className="mt-1 block text-ink-200">{activatingId === pkg.id ? "Activating…" : `Activate: ${pkg.name}`}</span>
            </button>
          ))}
        </div>
      )}

      <div className="px-4 pt-4">
        <TodayOffPanel
          barbers={shop.barbers}
          supabase={shop.supabase}
          businessDate={shop.businessDate}
          onChange={shop.refresh}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {columns.map(({ barber, off, rows, done: finished }) => (
          <section key={barber.id} className="flex min-h-[280px] flex-col border border-ink-800 bg-ink-950">
            <header className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
              <h2 className="font-display text-xl text-paper">{barber.name || barber.nickname || "Barber"}</h2>
              {off && <span className="font-sans text-xs font-semibold text-red-400">OFF</span>}
            </header>
            <div className="flex flex-1 flex-col gap-2 p-3">
              {rows.length === 0 && (
                <p className="px-1 py-6 font-sans text-sm text-ink-400">No upcoming bookings.</p>
              )}
              {rows.map((row) => {
                const next = NEXT_STATUS[row.status];
                return (
                  <article
                    key={row.id}
                    className={clsx(
                      "border px-3 py-3",
                      row.status === "in_service" && "border-status-live bg-status-live/10",
                      row.status === "checked_in" && "border-status-hold bg-status-hold/10",
                      row.status === "booked" && "border-ink-800",
                      row.status === "no_show" && "border-red-400/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-sans text-lg font-semibold text-paper">
                          {formatSlotLabel(slotTime(row.appointment_time))}
                        </p>
                        <p className="mt-1 truncate font-sans text-base text-paper">{row.customer_name || "Guest"}</p>
                        <p className="mt-0.5 truncate font-sans text-sm text-ink-200">
                          {row.service_name || "Service"}
                          {row.customer_phone ? ` · ${row.customer_phone}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 font-sans text-xs font-semibold text-ink-200">
                        {STATUS_LABEL[row.status]}
                      </span>
                    </div>
                    {shop.isViewingToday && next && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void setStatus(row, next)}
                          className="min-h-12 bg-paper font-sans text-sm font-semibold text-ink disabled:opacity-40"
                        >
                          {NEXT_LABEL[row.status]}
                        </button>
                        {row.status === "booked" && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => {
                              if (confirmNoShow !== row.id) {
                                setConfirmNoShow(row.id);
                                return;
                              }
                              setConfirmNoShow(null);
                              void setStatus(row, "no_show");
                            }}
                            className="min-h-12 border border-red-400 font-sans text-sm font-semibold text-red-400"
                          >
                            {confirmNoShow === row.id ? "CONFIRM NO SHOW" : "NO SHOW"}
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
              {finished.length > 0 && (
                <p className="px-1 pt-2 font-sans text-xs text-ink-400">{finished.length} done today</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </StaffShell>
  );
}
