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
import {
  hydrateAppointments,
  mergeLiveAppointment,
  type Barber,
  type LiveAppointment,
  type Service,
} from "@/lib/staff/appointments";
import type { Database } from "@/lib/database.types";

type Branch = Database["public"]["Tables"]["branches"]["Row"];

export function useShopSession() {
  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState<AppRole | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<Pick<Branch, "id" | "name">[]>([]);
  const [hours, setHours] = useState<BusinessHours>(FALLBACK_HOURS);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<LiveAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const businessDate = businessDateString(hours);

  const loadBoard = useCallback(
    async (resolvedBranchId: string | null, resolvedHours: BusinessHours, barberRows: Barber[], serviceRows: Service[]) => {
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
      setAppointments(hydrateAppointments((data ?? []) as LiveAppointment[], barberRows, serviceRows));
    },
    [supabase],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        setError("Not signed in.");
        return;
      }

      const [{ data: profile }, { data: hoursRow }, { data: branchRows }] = await Promise.all([
        supabase.from("profiles").select("role, branch_id").eq("id", user.id).single(),
        supabase.from("site_settings").select("value").eq("key", "business_hours").maybeSingle(),
        supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
      ]);

      const resolvedHours =
        hoursRow?.value &&
        typeof hoursRow.value === "object" &&
        hoursRow.value !== null &&
        "default_start" in hoursRow.value &&
        "default_end" in hoursRow.value
          ? {
              default_start: String((hoursRow.value as { default_start: string }).default_start),
              default_end: String((hoursRow.value as { default_end: string }).default_end),
            }
          : FALLBACK_HOURS;

      setHours(resolvedHours);
      setRole((profile?.role as AppRole | undefined) ?? null);
      setBranches(branchRows ?? []);

      const resolvedBranch =
        profile?.branch_id ??
        branchRows?.[0]?.id ??
        null;
      setBranchId(resolvedBranch);

      let barberQuery = supabase.from("barbers").select("*").eq("is_active", true).order("name");
      let serviceQuery = supabase.from("services").select("*").eq("is_active", true).order("name_en");
      if (resolvedBranch) {
        barberQuery = barberQuery.eq("branch_id", resolvedBranch);
        serviceQuery = serviceQuery.eq("branch_id", resolvedBranch);
      }

      const [{ data: barberRows }, { data: serviceRows }] = await Promise.all([barberQuery, serviceQuery]);
      const barbersList = (barberRows ?? []) as Barber[];
      const servicesList = (serviceRows ?? []) as Service[];
      setBarbers(barbersList);
      setServices(servicesList);

      await loadBoard(resolvedBranch, resolvedHours, barbersList, servicesList);
      setLoading(false);
    })();
  }, [supabase, loadBoard]);

  useBranchChannel({
    branchId,
    onNewAppointment: (appointment) => {
      setAppointments((prev) => mergeLiveAppointment(prev, appointment, barbers, services));
    },
    onAppointmentUpdate: (appointment) => {
      setAppointments((prev) => mergeLiveAppointment(prev, appointment, barbers, services));
    },
  });

  const refresh = useCallback(() => {
    void loadBoard(branchId, hours, barbers, services);
  }, [loadBoard, branchId, hours, barbers, services]);

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
