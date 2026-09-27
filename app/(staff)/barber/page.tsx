"use client";

import { useState } from "react";
import { StaffShell } from "@/components/staff/StaffShell";
import { FloorBoard } from "@/components/staff/FloorBoard";
import { useShopSession } from "@/lib/staff/useShopSession";
import { mergeLiveAppointment, type LiveAppointment } from "@/lib/staff/appointments";

export default function BarberSchedulePage() {
  const shop = useShopSession();
  const [confirmingNoShow, setConfirmingNoShow] = useState<string | null>(null);

  async function advance(appointment: LiveAppointment) {
    const next =
      appointment.status === "booked"
        ? "checked_in"
        : appointment.status === "checked_in"
          ? "in_service"
          : appointment.status === "in_service"
            ? "completed"
            : null;
    if (!next) return;
    const { data } = await shop.supabase.rpc("update_appointment_status", {
      p_appointment_id: appointment.id,
      p_new_status: next,
    });
    if (data) {
      shop.setAppointments((prev) => mergeLiveAppointment(prev, data, shop.barbers, shop.services));
    }
  }

  async function markNoShow(appointment: LiveAppointment) {
    if (confirmingNoShow !== appointment.id) {
      setConfirmingNoShow(appointment.id);
      return;
    }
    setConfirmingNoShow(null);
    const { data } = await shop.supabase.rpc("update_appointment_status", {
      p_appointment_id: appointment.id,
      p_new_status: "no_show",
    });
    if (data) {
      shop.setAppointments((prev) => mergeLiveAppointment(prev, data, shop.barbers, shop.services));
    }
  }

  const branchName = shop.branches.find((b) => b.id === shop.branchId)?.name ?? "Shop";
  const liveCount = shop.appointments.filter((a) => a.status === "in_service").length;

  return (
    <StaffShell title="FLOOR" meta={`${branchName} · ${shop.barbers.length} chairs · ${liveCount} in service`}>
      <section className="px-2 py-4 md:px-6 md:py-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-2">
          <div>
            <span className="tag-number text-ink-400">ALL BARBERS · EVERY 30 MIN</span>
            <p className="mt-1 font-sans text-sm text-ink-400">
              One screen. Every chair, every slot. Two no-shows = online booking ban.
            </p>
          </div>
          {shop.error && <p className="font-sans text-xs text-red-400">{shop.error}</p>}
        </div>
        <div className="border border-ink-800 bg-ink-950">
          <FloorBoard
            barbers={shop.barbers}
            appointments={shop.appointments}
            hours={shop.hours}
            interactive
            confirmingNoShow={confirmingNoShow}
            onAdvance={(a) => void advance(a)}
            onNoShow={(a) => void markNoShow(a)}
          />
        </div>
      </section>
    </StaffShell>
  );
}
