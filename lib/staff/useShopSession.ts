"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export function useShopSession() {
  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState<AppRole | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<Pick<Branch, "id" | "name">[]>([]);
  const [hours, setHours] = useState<BusinessHours>(FALLBACK_HOURS);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<LiveAppointment[]>([]);
  const [offBarberIds, setOffBarberIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const businessDate = businessDateString(hours);

  // The day the board is currently showing -- defaults to "today" (the
  // shop's business date, which can roll over mid-evening for overnight
  // hours) but staff can step it backward/forward or jump to any date. Once
  // they've touched it deliberately we stop re-syncing it to "today" out
  // from under them while business_hours is still loading.
  const [viewDate, setViewDateState] = useState(businessDate);
  const userPickedDateRef = useRef(false);
  const viewDateRef = useRef(viewDate);
  const loadedDayRef = useRef<string | null>(null);
  useEffect(() => {
    viewDateRef.current = viewDate;
  }, [viewDate]);

  const loadBoard = useCallback(
    async (resolvedBranchId: string | null, day: string, barberRows: Barber[], serviceRows: Service[]) => {
      let query = supabase
        .from("appointments")
        .select("*")
        .eq("appointment_date", day)
        .order("appointment_time", { ascending: true });

      if (resolvedBranchId) {
        query = query.eq("branch_id", resolvedBranchId);
      }

      const [{ data, error: loadError }, offResult] =
        barberRows.length > 0
          ? await Promise.all([
              query,
              supabase
                .from("barber_time_off")
                .select("barber_id")
                .eq("off_date", day)
                .in(
                  "barber_id",
                  barberRows.map((b) => b.id),
                ),
            ])
          : [await query, { data: [] as { barber_id: string }[] }];

      if (loadError) {
        setError(loadError.message);
        return;
      }
      setError(null);
      loadedDayRef.current = day;
      setAppointments(hydrateAppointments((data ?? []) as LiveAppointment[], barberRows, serviceRows));
      setOffBarberIds(new Set((offResult.data ?? []).map((r) => r.barber_id)));
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

      // staff_roles (or profiles.branch_id for owner/manager/cashier) is
      // what RLS itself checks (is_branch_staff(), migration 0004) -- only
      // ever resolve to a branch this user is actually entitled to. An
      // owner bypasses branch scoping entirely (is_owner()), so for them
      // alone it's fine to default to the first active branch purely as
      // this board's starting view.
      const myBranchIds = await getStaffBranchIds(supabase, user.id);
      const resolvedBranch =
        myBranchIds[0] ?? (profile?.role === "owner" ? (branchRows?.[0]?.id ?? null) : null);
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

      const resolvedBusinessDate = businessDateString(resolvedHours);
      const day = userPickedDateRef.current ? viewDateRef.current : resolvedBusinessDate;
      if (!userPickedDateRef.current) {
        setViewDateState(resolvedBusinessDate);
      }

      await loadBoard(resolvedBranch, day, barbersList, servicesList);
      setLoading(false);
    })();
  }, [supabase, loadBoard]);

  // Re-fetch whenever the staff member steps to a different day. Skipped on
  // the very first run (the init effect above already loads the starting
  // day) and whenever the day is already the one just loaded, so switching
  // "today" -> "today" via the date picker's own default doesn't double-fetch.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (loadedDayRef.current === viewDate) return;
    void (async () => {
      setBoardLoading(true);
      await loadBoard(branchId, viewDate, barbers, services);
      setBoardLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  // Realtime pushes come in regardless of which day is on screen -- only
  // fold them into the board when they belong to the day actually being
  // viewed, so flipping back to yesterday doesn't get silently overwritten
  // by a new booking landing on today. viewDateRef (not the viewDate
  // closure) is what makes this correct even though useBranchChannel only
  // resubscribes when branchId changes.
  useBranchChannel({
    branchId,
    onNewAppointment: (appointment) => {
      if (appointment.appointment_date !== viewDateRef.current) return;
      setAppointments((prev) => mergeLiveAppointment(prev, appointment, barbers, services));
    },
    onAppointmentUpdate: (appointment) => {
      if (appointment.appointment_date !== viewDateRef.current) return;
      setAppointments((prev) => mergeLiveAppointment(prev, appointment, barbers, services));
    },
  });

  const setViewDate = useCallback((date: string) => {
    userPickedDateRef.current = true;
    setViewDateState(date);
  }, []);

  const refresh = useCallback(() => {
    void loadBoard(branchId, viewDate, barbers, services);
  }, [loadBoard, branchId, viewDate, barbers, services]);

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
    offBarberIds,
    businessDate,
    viewDate,
    setViewDate,
    isViewingToday: viewDate === businessDate,
    loading,
    boardLoading,
    error,
    refresh,
  };
}
