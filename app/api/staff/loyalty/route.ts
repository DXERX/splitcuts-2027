import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isValidEmail } from "@/lib/email";
import { isValidSaudiPhone, toE164Saudi } from "@/lib/phone";

export const runtime = "nodejs";

type Db = SupabaseClient<Database>;

type ServiceBits = {
  name_en: string | null;
  category: string | null;
  price: number | null;
};

const PAID = ["approved", "authorised", "captured"];
const OPEN = new Set(["booked", "checked_in", "in_service"]);

const json = (body: object, status = 200) => NextResponse.json(body, { status });

function last9(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^966/, "").replace(/^0+/, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

function monthStart(): string {
  return `${riyadhDate(0).slice(0, 7)}-01`;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function earnsPoint(service: ServiceBits | null): boolean {
  if (!service) return false;
  const name = (service.name_en ?? "").trim();
  if (name !== "Hair" && name !== "Hair + Beard") return false;
  if (service.category === "CUTS") return true;
  return service.category == null && !(name === "Hair" && Number(service.price ?? 0) >= 90);
}

async function requireStaff(): Promise<{ db: Db } | { error: NextResponse }> {
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { error: json({ error: "UNAUTHORIZED" }, 401) };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: json({ error: "SERVER_NOT_CONFIGURED" }, 503) };

  const db = createServiceRoleClient();
  const [{ data: profile }, { data: roles }] = await Promise.all([
    db.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle(),
    db.from("staff_roles").select("id").eq("user_id", user.id).eq("is_active", true).limit(1),
  ]);
  const role = profile?.role;
  const staff =
    (profile?.is_active &&
      (role === "owner" || role === "manager" || role === "cashier" || role === "barber")) ||
    (roles ?? []).length > 0;
  if (!staff) return { error: json({ error: "FORBIDDEN" }, 403) };
  return { db };
}

function riyadhDate(offsetDays: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  const year = Number(match?.[1] ?? "1970");
  const month = Number(match?.[2] ?? "1");
  const day = Number(match?.[3] ?? "1");
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function accountIndexes(db: Db): Promise<{ byPhone: Map<string, string[]>; byEmail: Map<string, string> }> {
  const byPhone = new Map<string, string[]>();
  const byEmail = new Map<string, string>();
  const addPhone = (phone: string | null | undefined, id: string) => {
    const tail = last9(phone);
    if (!tail) return;
    const current = byPhone.get(tail) ?? [];
    if (!current.includes(id)) current.push(id);
    byPhone.set(tail, current);
  };

  for (let from = 0; from < 5000; from += 1000) {
    const { data } = await db.from("profiles").select("id, phone").not("phone", "is", null).range(from, from + 999);
    for (const profile of data ?? []) addPhone(profile.phone, profile.id);
    if (!data || data.length < 1000) break;
  }

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) break;
    for (const user of data.users) {
      addPhone(user.phone, user.id);
      const email = user.email?.trim().toLowerCase();
      if (email && !byEmail.has(email)) byEmail.set(email, user.id);
    }
    if (data.users.length < 200) break;
  }

  return { byPhone, byEmail };
}

async function ensureCustomer(db: Db, email: string, phone: string | null, name: string | null): Promise<string | null> {
  if (!isValidEmail(email)) return null;
  const e164 = phone && isValidSaudiPhone(phone) ? toE164Saudi(phone) : undefined;
  const withPhone = await db.auth.admin.createUser({
    email,
    phone: e164,
    email_confirm: true,
    phone_confirm: Boolean(e164),
    user_metadata: { full_name: name ?? undefined },
  });
  const createdId = withPhone.data.user?.id ?? null;
  const emailOnly = createdId
    ? null
    : await db.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: name ?? undefined },
      });
  const newId = createdId ?? emailOnly?.data.user?.id ?? null;
  if (newId) {
    await db.from("profiles").update({
      ...(name ? { full_name: name } : {}),
      ...(e164 ? { phone: e164 } : {}),
    }).eq("id", newId);
    return newId;
  }

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) break;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function recordMissingPoints(db: Db) {
  const since = monthStart();
  const { data: program } = await db
    .from("loyalty_programs")
    .select("id, visits_required, reward_type")
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!program) return { linked: 0, visits: 0, rewards: 0 };

  const { data: appointments } = await db
    .from("appointments")
    .select("id, customer_id, customer_name, customer_phone, customer_email, appointment_date, appointment_start, branch_id, created_at, services(name_en, category, price)")
    .eq("status", "completed")
    .gte("appointment_date", since);
  const { byPhone, byEmail } = await accountIndexes(db);

  let linked = 0;
  const rows = appointments ?? [];
  for (const row of rows) {
    if (row.customer_id) continue;
    const matches = byPhone.get(last9(row.customer_phone) ?? "");
    const phoneMatch = matches?.length === 1 ? matches[0] : null;
    const emailKey = row.customer_email?.trim().toLowerCase() ?? "";
    let match = phoneMatch ?? (emailKey ? byEmail.get(emailKey) ?? null : null);
    if (!match && emailKey) {
      match = await ensureCustomer(db, emailKey, row.customer_phone, row.customer_name);
      if (match) byEmail.set(emailKey, match);
    }
    if (!match) continue;
    const { error } = await db.from("appointments").update({ customer_id: match }).eq("id", row.id).is("customer_id", null);
    if (!error) {
      row.customer_id = match;
      linked += 1;
    }
  }

  const eligible = rows.filter((row) => row.customer_id && earnsPoint(one(row.services as ServiceBits | ServiceBits[] | null)));
  const customerIds = [...new Set(eligible.map((row) => row.customer_id as string))];
  const { data: existing } = customerIds.length
    ? await db
        .from("loyalty_transactions")
        .select("customer_id, type, appointments(appointment_date)")
        .in("customer_id", customerIds)
        .in("type", ["visit_earned", "reward_redeemed"])
    : { data: [] as { customer_id: string; appointments: { appointment_date: string } | { appointment_date: string }[] | null }[] };

  const taken = new Set<string>();
  for (const row of existing ?? []) {
    const date = one(row.appointments)?.appointment_date;
    if (date) taken.add(`${row.customer_id}|${date}`);
  }

  const picked = new Map<string, (typeof eligible)[number]>();
  for (const row of [...eligible].sort((a, b) => a.appointment_date.localeCompare(b.appointment_date) || (a.created_at ?? "").localeCompare(b.created_at ?? ""))) {
    const key = `${row.customer_id}|${row.appointment_date}`;
    if (taken.has(key) || picked.has(key)) continue;
    picked.set(key, row);
  }

  let visits = 0;
  for (const row of picked.values()) {
    const { error } = await db.from("loyalty_transactions").insert({
      customer_id: row.customer_id as string,
      loyalty_program_id: program.id,
      appointment_id: row.id,
      type: "visit_earned",
      amount: 1,
      reason: "Completed eligible Split Rewards visit",
    });
    if (!error) visits += 1;
  }

  const { data: history } = customerIds.length
    ? await db
        .from("loyalty_transactions")
        .select("customer_id, appointment_id, created_at, appointments(appointment_date, appointment_start, branch_id)")
        .eq("type", "visit_earned")
        .in("customer_id", customerIds)
    : { data: [] };
  const { data: already } = customerIds.length
    ? await db.from("rewards").select("customer_id, metadata").in("customer_id", customerIds)
    : { data: [] };
  const rewarded = new Set(
    (already ?? []).map((row) => `${row.customer_id}|${(row.metadata as { triggered_by_appointment_id?: string } | null)?.triggered_by_appointment_id ?? ""}`),
  );

  const grouped = new Map<string, NonNullable<typeof history>>();
  for (const row of history ?? []) {
    grouped.set(row.customer_id, [...(grouped.get(row.customer_id) ?? []), row]);
  }
  let rewards = 0;
  const required = program.visits_required;
  for (const [customerId, list] of grouped) {
    const ordered = [...list].sort((a, b) => {
      const aDate = one(a.appointments)?.appointment_date ?? "";
      const bDate = one(b.appointments)?.appointment_date ?? "";
      return aDate.localeCompare(bDate) || (a.created_at ?? "").localeCompare(b.created_at ?? "");
    });
    for (let index = 0; index < ordered.length; index += 1) {
      const row = ordered[index];
      const visitNumber = index + 1;
      if (!row || required <= 0 || visitNumber % required !== 0 || !row.appointment_id) continue;
      if (rewarded.has(`${customerId}|${row.appointment_id}`)) continue;
      rewarded.add(`${customerId}|${row.appointment_id}`);
      const { error } = await db.from("rewards").insert({
        customer_id: customerId,
        loyalty_program_id: program.id,
        branch_id: one(row.appointments)?.branch_id ?? null,
        reward_type: program.reward_type,
        status: "available",
        metadata: { triggered_by_appointment_id: row.appointment_id, backfill: true },
      });
      if (error) continue;
      rewards += 1;
      await db.from("loyalty_transactions").insert({
        customer_id: customerId,
        loyalty_program_id: program.id,
        appointment_id: row.appointment_id,
        type: "reward_earned",
        amount: 0,
        reason: "Free cut unlocked",
      });
    }
  }

  return { linked, visits, rewards };
}

export async function POST(request: NextRequest) {
  const gate = await requireStaff();
  if ("error" in gate) return gate.error;

  const body = (await request.json().catch(() => null)) as { appointmentIds?: unknown; recordMissing?: boolean } | null;
  if (body?.recordMissing === true) return json(await recordMissingPoints(gate.db));
  const ids = Array.isArray(body?.appointmentIds)
    ? body.appointmentIds.filter((id): id is string => typeof id === "string").slice(0, 200)
    : [];
  if (!ids.length) return json({ flags: {} });

  const db = gate.db;
  const [appointmentsResult, ledgerResult, paymentsResult, rewardsResult] = await Promise.all([
    db
      .from("appointments")
      .select("id, customer_id, customer_phone, status, appointment_date, services(name_en, category, price)")
      .in("id", ids),
    db
      .from("loyalty_transactions")
      .select("appointment_id, type")
      .in("appointment_id", ids)
      .in("type", ["visit_earned", "reward_redeemed"]),
    db
      .from("payments")
      .select("appointment_ids, status")
      .overlaps("appointment_ids", ids)
      .in("status", PAID),
    db.from("rewards").select("customer_id, profiles(phone)").eq("status", "available").limit(500),
  ]);
  if (appointmentsResult.error) return json({ error: "LOOKUP_FAILED" }, 500);
  const appointments = appointmentsResult.data;
  const ledger = ledgerResult.data;
  const payments = paymentsResult.data;
  const rewards = rewardsResult.data;

  const saved = new Set(
    (ledger ?? []).filter((row) => row.type === "visit_earned" && row.appointment_id).map((row) => row.appointment_id as string),
  );
  const freed = new Set(
    (ledger ?? []).filter((row) => row.type === "reward_redeemed" && row.appointment_id).map((row) => row.appointment_id as string),
  );
  const paid = new Set<string>();
  for (const payment of payments ?? []) {
    if (!PAID.includes(payment.status)) continue;
    for (const id of payment.appointment_ids) {
      if (ids.includes(id)) paid.add(id);
    }
  }
  const rewardCustomers = new Set<string>();
  const rewardPhones = new Set<string>();
  for (const reward of rewards ?? []) {
    rewardCustomers.add(reward.customer_id);
    const tail = last9(one(reward.profiles)?.phone);
    if (tail) rewardPhones.add(tail);
  }

  const pointCustomers = [...new Set((appointments ?? []).map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
  const { data: dayLedger } = pointCustomers.length
    ? await db
        .from("loyalty_transactions")
        .select("customer_id, appointments(appointment_date)")
        .eq("type", "visit_earned")
        .in("customer_id", pointCustomers)
    : { data: [] as { customer_id: string; appointments: { appointment_date: string } | { appointment_date: string }[] | null }[] };
  const countedDays = new Set<string>();
  for (const row of dayLedger ?? []) {
    const date = one(row.appointments)?.appointment_date;
    if (date) countedDays.add(`${row.customer_id}|${date}`);
  }

  const flags: Record<string, {
    eligible: boolean;
    pointRecorded: boolean;
    rewardUsed: boolean;
    tamaraPaid: boolean;
    freeCut: boolean;
    sameDay: boolean;
  }> = {};

  for (const row of appointments ?? []) {
    const service = one(row.services as ServiceBits | ServiceBits[] | null);
    const eligible = earnsPoint(service);
    const rewardUsed = freed.has(row.id);
    const pointRecorded = saved.has(row.id);
    const tail = last9(row.customer_phone);
    const owed =
      (row.customer_id != null && rewardCustomers.has(row.customer_id)) ||
      (tail != null && rewardPhones.has(tail));
    flags[row.id] = {
      eligible,
      pointRecorded,
      rewardUsed,
      tamaraPaid: paid.has(row.id),
      freeCut: eligible && (rewardUsed || (OPEN.has(row.status) && owed)),
      sameDay: eligible && !pointRecorded && !rewardUsed && row.customer_id != null && countedDays.has(`${row.customer_id}|${row.appointment_date}`),
    };
  }

  return json({ flags });
}

export async function GET(request: NextRequest) {
  const gate = await requireStaff();
  if ("error" in gate) return gate.error;

  const digits = last9(request.nextUrl.searchParams.get("phone"));
  if (!digits) return json({ error: "PHONE_REQUIRED" }, 400);

  const db = gate.db;
  await recordMissingPoints(db);
  const [{ data: profiles }, { data: program }] = await Promise.all([
    db.from("profiles").select("id, full_name, phone, role").ilike("phone", `%${digits}`).limit(8),
    db.from("loyalty_programs").select("visits_required").eq("is_active", true).order("created_at").limit(1).maybeSingle(),
  ]);
  let customers = (profiles ?? []).filter((profile) => profile.role === "customer");
  if (!customers.length) {
    const { data: linkedRows } = await db
      .from("appointments")
      .select("customer_id")
      .ilike("customer_phone", `%${digits}`)
      .not("customer_id", "is", null)
      .limit(20);
    const linkedIds = [...new Set((linkedRows ?? []).map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
    if (linkedIds.length) {
      const { data: linkedProfiles } = await db.from("profiles").select("id, full_name, phone, role").in("id", linkedIds);
      customers = linkedProfiles ?? [];
    }
  }
  const required = program?.visits_required ?? 5;
  const ids = customers.map((profile) => profile.id);

  const [{ data: ledger }, { data: rewards }, { data: byPhone }, { data: byAccount }] = await Promise.all([
    ids.length
      ? db.from("loyalty_transactions").select("customer_id, amount").in("customer_id", ids).eq("type", "visit_earned")
      : Promise.resolve({ data: [] as { customer_id: string; amount: number }[] }),
    ids.length
      ? db.from("rewards").select("customer_id").in("customer_id", ids).eq("status", "available")
      : Promise.resolve({ data: [] as { customer_id: string }[] }),
    db
      .from("appointments")
      .select("id, appointment_date, customer_name, customer_phone, customer_id, status, services(name_en, category, price)")
      .eq("status", "completed")
      .ilike("customer_phone", `%${digits}`)
      .order("appointment_date", { ascending: false })
      .limit(20),
    ids.length
      ? db
          .from("appointments")
          .select("id, appointment_date, customer_name, customer_phone, customer_id, status, services(name_en, category, price)")
          .eq("status", "completed")
          .in("customer_id", ids)
          .order("appointment_date", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const pointsByCustomer = new Map<string, number>();
  for (const row of ledger ?? []) {
    pointsByCustomer.set(row.customer_id, (pointsByCustomer.get(row.customer_id) ?? 0) + Number(row.amount ?? 0));
  }
  const rewardByCustomer = new Set((rewards ?? []).map((row) => row.customer_id));

  type Cut = {
    id: string;
    appointment_date: string;
    customer_name: string | null;
    customer_id: string | null;
    services: ServiceBits | ServiceBits[] | null;
  };
  const cuts = new Map<string, Cut>();
  for (const row of [...(byPhone ?? []), ...(byAccount ?? [])] as Cut[]) cuts.set(row.id, row);
  const cutIds = [...cuts.keys()];
  const { data: cutLedger } = cutIds.length
    ? await db
        .from("loyalty_transactions")
        .select("appointment_id, type")
        .in("appointment_id", cutIds)
        .eq("type", "visit_earned")
    : { data: [] as { appointment_id: string | null }[] };
  const saved = new Set((cutLedger ?? []).map((row) => row.appointment_id));

  const listed = [...cuts.values()]
    .sort((a, b) => b.appointment_date.localeCompare(a.appointment_date))
    .slice(0, 12)
    .map((row) => {
      const service = one(row.services);
      return {
        date: row.appointment_date,
        service: service?.name_en ?? "Service",
        eligible: earnsPoint(service),
        pointRecorded: saved.has(row.id),
        customerId: row.customer_id,
        name: row.customer_name,
      };
    });

  if (!customers.length) {
    return json({
      customers: [
        {
          id: null,
          name: listed[0]?.name ?? "Guest",
          phone: digits,
          hasAccount: false,
          points: 0,
          required,
          cycle: 0,
          freeCutReady: false,
          cuts: listed,
        },
      ],
    });
  }

  return json({
    customers: customers.map((profile) => {
      const points = pointsByCustomer.get(profile.id) ?? 0;
      const freeCutReady = rewardByCustomer.has(profile.id);
      const remainder = required > 0 ? points % required : points;
      const cycle = freeCutReady && remainder === 0 && points > 0 ? required : remainder;
      return {
        id: profile.id,
        name: profile.full_name ?? "Guest",
        phone: profile.phone,
        hasAccount: true,
        points,
        required,
        cycle,
        freeCutReady,
        cuts: customers.length === 1 ? listed : listed.filter((cut) => cut.customerId === profile.id),
      };
    }),
  });
}
