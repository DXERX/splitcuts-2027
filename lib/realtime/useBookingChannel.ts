// lib/realtime/useBookingChannel.ts

"use client";

import { useEffect, useRef } from "react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";

type Appointment =
  Database["public"]["Tables"]["appointments"]["Row"];

type StaffNotification =
  Database["public"]["Tables"]["staff_notifications"]["Row"];

interface BranchChannelOptions {
  branchId: string | null | undefined;

  onNewAppointment?: (
    appointment: Appointment,
  ) => void;

  onAppointmentUpdate?: (
    appointment: Appointment,
  ) => void;

  onNotification?: (
    notification: StaffNotification,
  ) => void;
}

/**
 * Cashier / shop-mode / owner dashboard.
 *
 * One persistent Realtime channel per branch.
 *
 * Callback refs are deliberately used here so the channel does not need
 * to reconnect every time React renders, while Realtime events still
 * execute the latest callback/state logic.
 */
export function useBranchChannel({
  branchId,
  onNewAppointment,
  onAppointmentUpdate,
  onNotification,
}: BranchChannelOptions) {
  const supabase = useRef(createClient()).current;

  const onNewAppointmentRef =
    useRef(onNewAppointment);

  const onAppointmentUpdateRef =
    useRef(onAppointmentUpdate);

  const onNotificationRef =
    useRef(onNotification);

  /**
   * Keep callback refs synchronized with the latest render.
   */
  useEffect(() => {
    onNewAppointmentRef.current =
      onNewAppointment;
  }, [onNewAppointment]);

  useEffect(() => {
    onAppointmentUpdateRef.current =
      onAppointmentUpdate;
  }, [onAppointmentUpdate]);

  useEffect(() => {
    onNotificationRef.current =
      onNotification;
  }, [onNotification]);

  /**
   * Create the actual Supabase Realtime subscription.
   *
   * It reconnects only when the branch changes.
   */
  useEffect(() => {
    if (!branchId) {
      return;
    }

    let channel: RealtimeChannel | null = null;

    channel = supabase
      .channel(`branch:${branchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "appointments",
          filter: `branch_id=eq.${branchId}`,
        },
        (
          payload: RealtimePostgresChangesPayload<Appointment>,
        ) => {
          const appointment =
            payload.new as Appointment | undefined;

          if (!appointment?.id) {
            return;
          }

          onNewAppointmentRef.current?.(
            appointment,
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "appointments",
          filter: `branch_id=eq.${branchId}`,
        },
        (
          payload: RealtimePostgresChangesPayload<Appointment>,
        ) => {
          const appointment =
            payload.new as Appointment | undefined;

          if (!appointment?.id) {
            return;
          }

          onAppointmentUpdateRef.current?.(
            appointment,
          );
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
        (
          payload: RealtimePostgresChangesPayload<StaffNotification>,
        ) => {
          const notification =
            payload.new as StaffNotification | undefined;

          if (!notification?.id) {
            return;
          }

          onNotificationRef.current?.(
            notification,
          );
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.info(
            `[realtime] subscribed to branch ${branchId}`,
          );

          return;
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          console.error(
            `[realtime] branch ${branchId} subscription ${status}`,
          );
        }

        if (status === "CLOSED") {
          console.warn(
            `[realtime] branch ${branchId} subscription closed`,
          );
        }
      });

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [branchId, supabase]);
}

/**
 * Barber-specific subscription.
 *
 * Same strategy as the branch channel:
 * keep the WebSocket subscription stable while always invoking the
 * newest callback.
 */
export function useBarberChannel(
  barberId: string | null | undefined,
  onChange: (
    appointment: Appointment,
  ) => void,
) {
  const supabase = useRef(createClient()).current;

  const onChangeRef =
    useRef(onChange);

  useEffect(() => {
    onChangeRef.current =
      onChange;
  }, [onChange]);

  useEffect(() => {
    if (!barberId) {
      return;
    }

    let channel: RealtimeChannel | null = null;

    channel = supabase
      .channel(`barber:${barberId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `barber_id=eq.${barberId}`,
        },
        (
          payload: RealtimePostgresChangesPayload<Appointment>,
        ) => {
          const appointment = (
            payload.new ?? payload.old
          ) as Appointment | undefined;

          if (!appointment?.id) {
            return;
          }

          onChangeRef.current(
            appointment,
          );
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.info(
            `[realtime] subscribed to barber ${barberId}`,
          );

          return;
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          console.error(
            `[realtime] barber ${barberId} subscription ${status}`,
          );
        }

        if (status === "CLOSED") {
          console.warn(
            `[realtime] barber ${barberId} subscription closed`,
          );
        }
      });

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [barberId, supabase]);
}