// lib/realtime/useBookingChannel.ts
// Realtime subscriptions, filtered per the spec: a cashier terminal listens
// to its branch only; a barber-schedule view listens to one barber's
// appointments only. Never subscribe to the whole `appointments` /
// `staff_notifications` tables unfiltered.
"use client";

import { useEffect, useRef } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";

type Appointment = Database["public"]["Tables"]["appointments"]["Row"];
type StaffNotification = Database["public"]["Tables"]["staff_notifications"]["Row"];

interface BranchChannelOptions {
  branchId: string | null | undefined;
  onNewAppointment?: (appointment: Appointment) => void;
  onAppointmentUpdate?: (appointment: Appointment) => void;
  onNotification?: (notification: StaffNotification) => void;
}

/** Cashier / shop-mode / owner-dashboard subscription: everything for one branch. */
export function useBranchChannel({
  branchId,
  onNewAppointment,
  onAppointmentUpdate,
  onNotification,
}: BranchChannelOptions) {
  const supabase = useRef(createClient()).current;

  useEffect(() => {
    if (!branchId) return;

    const channel = supabase
      .channel(`branch:${branchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "appointments", filter: `branch_id=eq.${branchId}` },
        (payload: RealtimePostgresChangesPayload<Appointment>) => {
          if (payload.new) onNewAppointment?.(payload.new as Appointment);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "appointments", filter: `branch_id=eq.${branchId}` },
        (payload: RealtimePostgresChangesPayload<Appointment>) => {
          if (payload.new) onAppointmentUpdate?.(payload.new as Appointment);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "staff_notifications",
          filter: `branch_id=eq.${branchId}`,
        },
        (payload: RealtimePostgresChangesPayload<StaffNotification>) => {
          if (payload.new) onNotification?.(payload.new as StaffNotification);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);
}

/** Barber-schedule subscription: only appointments assigned to one barber. */
export function useBarberChannel(
  barberId: string | null | undefined,
  onChange: (appointment: Appointment) => void,
) {
  const supabase = useRef(createClient()).current;

  useEffect(() => {
    if (!barberId) return;

    const channel = supabase
      .channel(`barber:${barberId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `barber_id=eq.${barberId}`,
        },
        (payload: RealtimePostgresChangesPayload<Appointment>) => {
          const row = (payload.new ?? payload.old) as Appointment | undefined;
          if (row) onChange(row);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barberId]);
}
