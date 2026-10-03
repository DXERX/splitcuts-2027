"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBranchChannel } from "@/lib/realtime/useBookingChannel";
import {
  FALLBACK_HOURS,
  businessDateString,
  type BusinessHours,
} from "@/lib/timeSlots";
import type { AppRole } from "@/lib/roles";
import { getStaffBranchIds } from "@/lib/staffBranch";
import {
  hydrateAppointments,
  mergeLiveAppointment,
  type Barber,
  type LiveAppointment,
  type Service,
} from "@/lib/staff/appointments";
import type { Database } from "@/lib/database.types";

type Branch = Database["public"]["Tables"]["branches"]["Row"];

const BOARD_REFRESH_INTERVAL_MS = 10_000;

export function useShopSession() {
  const supabase = useMemo(() => createClient(), []);

  const [role, setRole] = useState<AppRole | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<
    Pick<Branch, "id" | "name">[]
  >([]);
  const [hours, setHours] = useState<BusinessHours>(FALLBACK_HOURS);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<LiveAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const businessDate = businessDateString(hours);

  /**
   * Loads the latest appointment board directly from Supabase.
   *
   * Realtime is still the primary instant-update mechanism.
   * This function is also used by the 10-second fallback sync.
   */
  const loadBoard = useCallback(
    async (
      resolvedBranchId: string | null,
      resolvedHours: BusinessHours,
      barberRows: Barber[],
      serviceRows: Service[],
    ) => {
      const day = businessDateString(resolvedHours);

      let query = supabase
        .from("appointments")
        .select("*")
        .eq("appointment_date", day)
        .order("appointment_time", { ascending: true });

      if (resolvedBranchId) {
        query = query.eq("branch_id", resolvedBranchId);
      }

      const { data, error: loadError } = await query;

      if (loadError) {
        setError(loadError.message);
        return;
      }

      setError(null);

      setAppointments(
        hydrateAppointments(
          (data ?? []) as LiveAppointment[],
          barberRows,
          serviceRows,
        ),
      );
    },
    [supabase],
  );

  /**
   * Initial staff/session/branch data load.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setLoading(false);
        setError("Not signed in.");
        return;
      }

      const [
        { data: profile },
        { data: hoursRow },
        { data: branchRows },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("role, branch_id")
          .eq("id", user.id)
          .single(),

        supabase
          .from("site_settings")
          .select("value")
          .eq("key", "business_hours")
          .maybeSingle(),

        supabase
          .from("branches")
          .select("id, name")
          .eq("is_active", true)
          .order("name"),
      ]);

      if (cancelled) return;

      const resolvedHours =
        hoursRow?.value &&
        typeof hoursRow.value === "object" &&
        hoursRow.value !== null &&
        "default_start" in hoursRow.value &&
        "default_end" in hoursRow.value
          ? {
              default_start: String(
                (hoursRow.value as { default_start: string }).default_start,
              ),
              default_end: String(
                (hoursRow.value as { default_end: string }).default_end,
              ),
            }
          : FALLBACK_HOURS;

      setHours(resolvedHours);
      setRole((profile?.role as AppRole | undefined) ?? null);
      setBranches(branchRows ?? []);

      /**
       * Resolve the branch this staff member is allowed to access.
       *
       * Owners may default to the first active branch because owner access
       * bypasses normal branch scoping.
       */
      const myBranchIds = await getStaffBranchIds(
        supabase,
        user.id,
      );

      if (cancelled) return;

      const resolvedBranch =
        myBranchIds[0] ??
        (profile?.role === "owner"
          ? (branchRows?.[0]?.id ?? null)
          : null);

      setBranchId(resolvedBranch);

      let barberQuery = supabase
        .from("barbers")
        .select("*")
        .eq("is_active", true)
        .order("name");

      let serviceQuery = supabase
        .from("services")
        .select("*")
        .eq("is_active", true)
        .order("name_en");

      if (resolvedBranch) {
        barberQuery = barberQuery.eq(
          "branch_id",
          resolvedBranch,
        );

        serviceQuery = serviceQuery.eq(
          "branch_id",
          resolvedBranch,
        );
      }

      const [
        { data: barberRows },
        { data: serviceRows },
      ] = await Promise.all([
        barberQuery,
        serviceQuery,
      ]);

      if (cancelled) return;

      const barbersList = (barberRows ?? []) as Barber[];
      const servicesList = (serviceRows ?? []) as Service[];

      setBarbers(barbersList);
      setServices(servicesList);

      await loadBoard(
        resolvedBranch,
        resolvedHours,
        barbersList,
        servicesList,
      );

      if (!cancelled) {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, loadBoard]);

  /**
   * Realtime appointment updates.
   *
   * When Supabase Realtime is healthy, new bookings and appointment
   * status changes should appear immediately.
   */
  useBranchChannel({
    branchId,

    onNewAppointment: (appointment) => {
      setAppointments((prev) =>
        mergeLiveAppointment(
          prev,
          appointment,
          barbers,
          services,
        ),
      );
    },

    onAppointmentUpdate: (appointment) => {
      setAppointments((prev) =>
        mergeLiveAppointment(
          prev,
          appointment,
          barbers,
          services,
        ),
      );
    },
  });

  /**
   * Manual refresh exposed to staff pages.
   */
  const refresh = useCallback(() => {
    void loadBoard(
      branchId,
      hours,
      barbers,
      services,
    );
  }, [
    loadBoard,
    branchId,
    hours,
    barbers,
    services,
  ]);

  /**
   * Fallback synchronization.
   *
   * Realtime gives us instant updates when available.
   * Every 10 seconds we also fetch the authoritative state from
   * Supabase so a missed Realtime event never leaves the cashier,
   * barber, or admin dashboard stale.
   */
  useEffect(() => {
    if (loading || !branchId) {
      return;
    }

    const syncBoard = () => {
      void loadBoard(
        branchId,
        hours,
        barbers,
        services,
      );
    };

    const intervalId = window.setInterval(
      syncBoard,
      BOARD_REFRESH_INTERVAL_MS,
    );

    /**
     * When the browser tab becomes active again, refresh immediately
     * instead of waiting for the next 10-second interval.
     */
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncBoard();
      }
    };

    /**
     * Also refresh when the staff member returns to the browser window.
     */
    const handleFocus = () => {
      syncBoard();
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    window.addEventListener(
      "focus",
      handleFocus,
    );

    return () => {
      window.clearInterval(intervalId);

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );

      window.removeEventListener(
        "focus",
        handleFocus,
      );
    };
  }, [
    loading,
    branchId,
    hours,
    barbers,
    services,
    loadBoard,
  ]);

  return {
    supabase,
    role,
    branchId,
    branches,
    hours,
    barbers,
    services,
    appointments,
    setAppointments,
    businessDate,
    loading,
    error,
    refresh,
  };
}