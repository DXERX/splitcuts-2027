"use client";

import { useState } from "react";
import { StaffShell } from "@/components/staff/StaffShell";
import { FloorBoard } from "@/components/staff/FloorBoard";
import { useShopSession } from "@/lib/staff/useShopSession";
import {
  mergeLiveAppointment,
  type LiveAppointment,
} from "@/lib/staff/appointments";

type AppointmentStatus = LiveAppointment["status"];

const NEXT_STATUS: Partial<
  Record<AppointmentStatus, AppointmentStatus>
> = {
  booked: "checked_in",
  checked_in: "in_service",
  in_service: "completed",
};

export default function BarberSchedulePage() {
  const shop = useShopSession();

  const [confirmingNoShow, setConfirmingNoShow] =
    useState<string | null>(null);

  const [updatingId, setUpdatingId] =
    useState<string | null>(null);

  const [actionError, setActionError] =
    useState<string | null>(null);

  async function updateStatus(
    appointment: LiveAppointment,
    newStatus: AppointmentStatus,
  ) {
    if (updatingId === appointment.id) {
      return;
    }

    setUpdatingId(appointment.id);
    setActionError(null);

    try {
      const { data, error } = await shop.supabase.rpc(
        "update_appointment_status",
        {
          p_appointment_id: appointment.id,
          p_new_status: newStatus,
        },
      );

      if (error) {
        console.error(
          "update_appointment_status failed:",
          error,
        );

        setActionError(
          error.message ||
            `Could not change appointment to ${newStatus}.`,
        );

        return;
      }

      if (!data) {
        console.error(
          "update_appointment_status returned no appointment",
          {
            appointmentId: appointment.id,
            newStatus,
          },
        );

        setActionError(
          "The appointment was not updated. Please try again.",
        );

        return;
      }

      /**
       * Update the board immediately.
       * We do not need to wait for Realtime or the 10-second sync.
       */
      shop.setAppointments((prev) =>
        mergeLiveAppointment(
          prev,
          data,
          shop.barbers,
          shop.services,
        ),
      );

      /**
       * Then synchronize against the authoritative DB state.
       */
      shop.refresh();
    } catch (error) {
      console.error(
        "Unexpected appointment status update error:",
        error,
      );

      setActionError(
        error instanceof Error
          ? error.message
          : "Something went wrong while updating the appointment.",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function advance(
    appointment: LiveAppointment,
  ) {
    const next = NEXT_STATUS[appointment.status];

    if (!next) {
      return;
    }

    await updateStatus(
      appointment,
      next,
    );
  }

  async function markNoShow(
    appointment: LiveAppointment,
  ) {
    /**
     * First click asks for confirmation.
     */
    if (confirmingNoShow !== appointment.id) {
      setConfirmingNoShow(appointment.id);
      setActionError(null);
      return;
    }

    /**
     * Second click confirms NO SHOW.
     */
    setConfirmingNoShow(null);

    await updateStatus(
      appointment,
      "no_show",
    );
  }

  const branchName =
    shop.branches.find(
      (branch) => branch.id === shop.branchId,
    )?.name ?? "Shop";

  const liveCount = shop.appointments.filter(
    (appointment) =>
      appointment.status === "in_service",
  ).length;

  return (
    <StaffShell
      title="FLOOR"
      meta={`${branchName} · ${shop.barbers.length} chairs · ${liveCount} in service`}
    >
      <section className="px-2 py-4 md:px-6 md:py-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-2">
          <div>
            <span className="tag-number text-ink-400">
              ALL BARBERS · EVERY 30 MIN
            </span>

            <p className="mt-1 font-sans text-sm text-ink-400">
              One screen. Every chair, every slot. Two no-shows =
              online booking ban.
            </p>
          </div>

          {shop.error && (
            <p className="font-sans text-xs text-red-400">
              {shop.error}
            </p>
          )}
        </div>

        {actionError && (
          <div className="mx-2 mb-4 border border-red-500/40 bg-red-500/10 px-4 py-3">
            <p className="font-sans text-xs font-medium text-red-400">
              {actionError}
            </p>
          </div>
        )}

        {updatingId && (
          <div className="mx-2 mb-3">
            <span className="font-sans text-[10px] font-semibold tracking-widest text-ink-400">
              UPDATING APPOINTMENT...
            </span>
          </div>
        )}

        <div
          className={
            updatingId
              ? "pointer-events-none border border-ink-800 bg-ink-950 opacity-70"
              : "border border-ink-800 bg-ink-950"
          }
        >
          <FloorBoard
            barbers={shop.barbers}
            appointments={shop.appointments}
            hours={shop.hours}
            interactive
            confirmingNoShow={confirmingNoShow}
            onAdvance={(appointment) => {
              void advance(appointment);
            }}
            onNoShow={(appointment) => {
              void markNoShow(appointment);
            }}
          />
        </div>
      </section>
    </StaffShell>
  );
}