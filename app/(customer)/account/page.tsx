import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatPanel } from "@/components/account/StatPanel";
import { CountdownLabel } from "@/components/account/CountdownLabel";
import { LinkButton } from "@/components/ui/Button";
import { PackageCard, type CustomerPackageInfo } from "@/components/account/PackageCard";

type AppointmentJoin = {
  id: string;
  appointment_start: string;
  status: string;
  services: { name_en: string | null } | { name_en: string | null }[] | null;
  barbers: { name: string | null; nickname: string | null } | { name: string | null; nickname: string | null }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: nextBookingRows },
    { data: completedAppointments },
    { data: rewards },
    { data: progress },
    { count: noShowCount },
    { data: packages },
    { data: myPackages },
  ] =
    await Promise.all([
      supabase.from("profiles").select("full_name, phone").eq("id", user.id).single(),
      supabase
        .from("appointments")
        .select("id, appointment_start, status, services:services(name_en), barbers:barbers(name, nickname)")
        .eq("customer_id", user.id)
        .in("status", ["booked", "checked_in", "in_service"])
        .gte("appointment_start", new Date().toISOString())
        .order("appointment_start", { ascending: true })
        .limit(1),
      supabase
        .from("appointments")
        .select("barbers:barbers(name, nickname)")
        .eq("customer_id", user.id)
        .eq("status", "completed"),
      supabase.from("rewards").select("id").eq("customer_id", user.id).eq("status", "available"),
      supabase
        .from("customer_loyalty_progress")
        .select("*")
        .eq("customer_id", user.id)
        .maybeSingle(),
      // Mirrors the count create_appointment() itself checks (migration 0010)
      // -- 1 shows a warning here, 2+ means the RPC is already refusing new
      // bookings from this account, so say so instead of a silent failure.
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", user.id)
        .eq("status", "no_show"),
      supabase
        .from("packages")
        .select("id, name_en, name_ar, price, session_count")
        .eq("is_active", true),
      supabase
        .from("customer_packages")
        .select("id, package_id, status, sessions_used, sessions_total, expires_at, created_at")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

  const nextBooking = (nextBookingRows as AppointmentJoin[] | null)?.[0] ?? null;
  const nextService = one(nextBooking?.services ?? null);
  const nextBarber = one(nextBooking?.barbers ?? null);

  const barberTally = new Map<string, number>();
  for (const row of completedAppointments ?? []) {
    const b = one((row as { barbers: AppointmentJoin["barbers"] }).barbers);
    const name = b?.name || b?.nickname;
    if (!name) continue;
    barberTally.set(name, (barberTally.get(name) ?? 0) + 1);
  }
  const favoriteBarber = [...barberTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const visitsCount = completedAppointments?.length ?? 0;
  const rewardsCount = rewards?.length ?? 0;
  const firstName = profile?.full_name?.split(" ")[0]?.toUpperCase() ?? "THERE";
  const noShows = noShowCount ?? 0;
  const isBlocked = noShows >= 2;

  // One card per active package, showing this customer's latest request for
  // it (if any) -- customer_packages was fetched newest-first, so the first
  // match per package_id is the current one.
  const myPackagesByPackageId = new Map<string, CustomerPackageInfo>();
  for (const row of myPackages ?? []) {
    if (!myPackagesByPackageId.has(row.package_id)) {
      myPackagesByPackageId.set(row.package_id, {
        id: row.id,
        status: row.status,
        sessionsUsed: row.sessions_used,
        sessionsTotal: row.sessions_total,
        expiresAt: row.expires_at,
      });
    }
  }

  return (
    <main className="min-h-screen bg-ink pt-[var(--nav-height)] pb-24">
      <Container wide className="py-10 md:py-16">
        <SectionLabel index="—" label="ACCOUNT" />
        <h1 className="mt-4 font-display text-display-md uppercase text-paper">
          WELCOME BACK, {firstName}.
        </h1>

        {noShows > 0 && (
          <div
            className={
              isBlocked
                ? "mt-6 border border-red-400 bg-red-400/10 px-5 py-4"
                : "mt-6 border border-amber-400 bg-amber-400/10 px-5 py-4"
            }
          >
            <p className={isBlocked ? "font-display text-lg uppercase text-red-400" : "font-display text-lg uppercase text-amber-400"}>
              {isBlocked ? "Online booking blocked" : "Missed appointment"}
            </p>
            <p className="mt-1 font-sans text-sm text-ink-300">
              {isBlocked
                ? "You've missed 2 appointments without cancelling, so this account can't book online right now. Call the shop to book your next visit."
                : "You missed a booked appointment without cancelling. One more no-show and this account will be blocked from booking online."}
            </p>
          </div>
        )}

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="hairline flex flex-col justify-between p-6 md:col-span-2">
            <span className="tag-number text-ink-600">NEXT BOOKING</span>
            {nextBooking ? (
              <div className="mt-6 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
                <div>
                  <p className="font-display text-2xl uppercase text-paper">
                    {nextService?.name_en ?? "Service"}
                  </p>
                  <p className="mt-1 font-sans text-sm text-ink-400">
                    with {nextBarber?.name || nextBarber?.nickname || "your barber"} ·{" "}
                    {new Date(nextBooking.appointment_start).toLocaleString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="font-display text-3xl uppercase text-paper">
                  <CountdownLabel target={nextBooking.appointment_start} />
                </span>
              </div>
            ) : (
              <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-sans text-sm text-ink-400">No upcoming bookings yet.</p>
                {isBlocked ? (
                  <span className="font-sans text-xs font-semibold tracking-widest text-red-400">
                    CALL THE SHOP TO BOOK
                  </span>
                ) : (
                  <LinkButton href="/book" variant="primary" size="md">
                    BOOK YOUR CHAIR
                  </LinkButton>
                )}
              </div>
            )}
          </div>

          <Link href="/account/rewards">
            <StatPanel
              label="REWARDS"
              value={rewardsCount > 0 ? `${rewardsCount} READY` : progress ? `${progress.visits_progress % progress.visits_required}/${progress.visits_required}` : "—"}
              sub={rewardsCount > 0 ? "TAP TO REDEEM" : "VISITS TOWARD YOUR NEXT FREE CUT"}
            />
          </Link>

          <StatPanel label="VISITS" value={String(visitsCount)} sub="COMPLETED APPOINTMENTS" />

          <StatPanel label="FAVORITE BARBER" value={favoriteBarber} sub="MOST BOOKED" />

          <Link href="/account/bookings">
            <StatPanel label="BOOKING HISTORY" value="VIEW ALL" sub="UPCOMING / PAST / CANCELLED" />
          </Link>
        </div>

        {(packages ?? []).length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {(packages ?? []).map((pkg) => (
              <PackageCard
                key={pkg.id}
                packageInfo={{
                  id: pkg.id,
                  nameEn: pkg.name_en,
                  nameAr: pkg.name_ar,
                  price: pkg.price,
                  sessionCount: pkg.session_count,
                }}
                initialExisting={myPackagesByPackageId.get(pkg.id) ?? null}
                customerPhone={profile?.phone ?? null}
                customerName={profile?.full_name ?? null}
              />
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}
