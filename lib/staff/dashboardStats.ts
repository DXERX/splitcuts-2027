import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppointmentStatus, Database, Json } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export interface BannedRow {
  key: string;
  name: string;
  phone: string;
  count: number;
}

export interface RecentAppointment {
  id: string;
  status: AppointmentStatus;
  total_price: number | null;
  appointment_date: string;
  appointment_time: string;
  customer_name: string | null;
  customer_phone: string | null;
  barber_id: string;
}

export interface BranchDashboard {
  revenue7d: number;
  weekBookings: number;
  banned: BannedRow[];
  recent: RecentAppointment[];
}

const STATUSES: AppointmentStatus[] = [
  "booked",
  "checked_in",
  "in_service",
  "completed",
  "cancelled",
  "no_show",
];

function isStatus(value: unknown): value is AppointmentStatus {
  return typeof value === "string" && (STATUSES as string[]).includes(value);
}

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? "";
  return (
    error.code === "PGRST202" ||
    /could not find the function/i.test(message) ||
    /schema cache/i.test(message)
  );
}

function readDashboard(value: Json): BranchDashboard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, Json | undefined>;
  const banned = Array.isArray(row.banned) ? row.banned : [];
  const recent = Array.isArray(row.recent) ? row.recent : [];

  return {
    revenue7d: Number(row.revenue_7d ?? 0),
    weekBookings: Number(row.week_bookings ?? 0),
    banned: banned.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const entry = item as Record<string, Json | undefined>;
      return [
        {
          key: String(entry.key ?? ""),
          name: String(entry.name ?? "Guest"),
          phone: String(entry.phone ?? "—"),
          count: Number(entry.count ?? 0),
        },
      ];
    }),
    recent: recent.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const entry = item as Record<string, Json | undefined>;
      if (typeof entry.id !== "string" || !isStatus(entry.status) || typeof entry.barber_id !== "string") {
        return [];
      }
      return [
        {
          id: entry.id,
          status: entry.status,
          total_price: entry.total_price == null ? null : Number(entry.total_price),
          appointment_date: String(entry.appointment_date ?? ""),
          appointment_time: String(entry.appointment_time ?? ""),
          customer_name: entry.customer_name == null ? null : String(entry.customer_name),
          customer_phone: entry.customer_phone == null ? null : String(entry.customer_phone),
          barber_id: entry.barber_id,
        },
      ];
    }),
  };
}

async function loadFromTables(
  supabase: Client,
  branchId: string | null,
  from: string,
  to: string,
  status: AppointmentStatus | "all",
): Promise<BranchDashboard> {
  let weekQuery = supabase
    .from("appointments")
    .select("status, total_price")
    .gte("appointment_date", from)
    .lte("appointment_date", to)
    .limit(10000);
  let noShowQuery = supabase
    .from("appointments")
    .select("id, customer_id, customer_name, customer_phone, created_at")
    .eq("status", "no_show")
    .limit(10000);
  let recentQuery = supabase
    .from("appointments")
    .select("id, status, total_price, appointment_date, appointment_time, customer_name, customer_phone, barber_id")
    .order("appointment_start", { ascending: false })
    .limit(12);

  if (branchId) {
    weekQuery = weekQuery.eq("branch_id", branchId);
    noShowQuery = noShowQuery.eq("branch_id", branchId);
    recentQuery = recentQuery.eq("branch_id", branchId);
  }
  if (status !== "all") recentQuery = recentQuery.eq("status", status);

  const [weekRes, noShowRes, recentRes, pardonRes] = await Promise.all([
    weekQuery,
    noShowQuery,
    recentQuery,
    supabase.from("booking_pardons").select("phone, customer_id, created_at"),
  ]);
  const error = weekRes.error ?? noShowRes.error ?? recentRes.error;
  if (error) throw new Error(error.message);

  const weekRows = weekRes.data ?? [];
  const pardons = pardonRes.error ? [] : (pardonRes.data ?? []);
  const bannedMap = new Map<string, BannedRow>();
  for (const row of noShowRes.data ?? []) {
    const pardoned = pardons.some(
      (pardon) =>
        pardon.created_at >= row.created_at &&
        ((pardon.phone && pardon.phone === row.customer_phone) ||
          (pardon.customer_id && pardon.customer_id === row.customer_id)),
    );
    if (pardoned) continue;
    const key = row.customer_id || row.customer_phone || row.id;
    const current = bannedMap.get(key) ?? {
      key,
      name: row.customer_name ?? "Guest",
      phone: row.customer_phone ?? "—",
      count: 0,
    };
    current.count += 1;
    bannedMap.set(key, current);
  }

  return {
    revenue7d: weekRows
      .filter((row) => row.status === "completed")
      .reduce((sum, row) => sum + Number(row.total_price ?? 0), 0),
    weekBookings: weekRows.filter((row) => row.status !== "cancelled").length,
    banned: [...bannedMap.values()].filter((row) => row.count >= 2).sort((a, b) => b.count - a.count),
    recent: (recentRes.data ?? []).flatMap((row) => {
      if (!isStatus(row.status)) return [];
      return [
        {
          id: row.id,
          status: row.status,
          total_price: row.total_price,
          appointment_date: row.appointment_date,
          appointment_time: row.appointment_time,
          customer_name: row.customer_name,
          customer_phone: row.customer_phone,
          barber_id: row.barber_id,
        },
      ];
    }),
  };
}

export async function loadBranchDashboard(
  supabase: Client,
  args: {
    branchId: string | null;
    from: string;
    to: string;
    status: AppointmentStatus | "all";
  },
): Promise<{ data: BranchDashboard | null; error: string | null }> {
  const { data, error } = await supabase.rpc("branch_dashboard_stats", {
    p_branch_id: args.branchId,
    p_from: args.from,
    p_to: args.to,
    p_status: args.status === "all" ? null : args.status,
  });

  if (!error) {
    const parsed = readDashboard(data);
    if (!parsed) return { data: null, error: "Dashboard stats came back empty." };
    return { data: parsed, error: null };
  }

  if (!isMissingFunction(error)) {
    return { data: null, error: error.message };
  }

  try {
    return { data: await loadFromTables(supabase, args.branchId, args.from, args.to, args.status), error: null };
  } catch (fallbackError) {
    return {
      data: null,
      error: fallbackError instanceof Error ? fallbackError.message : "Could not load dashboard stats.",
    };
  }
}
