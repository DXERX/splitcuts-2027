import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { BookingRow } from "@/components/account/BookingRow";

type Row = {
  id: string;
  appointment_start: string;
  status: string;
  services: { name_en: string | null } | { name_en: string | null }[] | null;
  barbers:
    | { name: string | null; nickname: string | null }
    | { name: string | null; nickname: string | null }[]
    | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function BookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data } = await supabase
    .from("appointments")
    .select("id, appointment_start, status, services:services(name_en), barbers:barbers(name, nickname)")
    .eq("customer_id", user.id)
    .order("appointment_start", { ascending: false });

  const rows = (data as Row[] | null) ?? [];
  const now = Date.now();

  const upcoming = rows.filter(
    (r) =>
      ["booked", "checked_in", "in_service"].includes(r.status) &&
      new Date(r.appointment_start).getTime() >= now,
  );
  const past = rows.filter(
    (r) =>
      r.status === "completed" ||
      (["booked", "checked_in", "in_service"].includes(r.status) &&
        new Date(r.appointment_start).getTime() < now),
  );
  const cancelled = rows.filter((r) => r.status === "cancelled" || r.status === "no_show");

  const sections = [
    { label: "UPCOMING", items: upcoming },
    { label: "PAST", items: past },
    { label: "CANCELLED", items: cancelled },
  ];

  return (
    <main className="min-h-screen bg-ink pt-[var(--nav-height)] pb-24">
      <Container wide className="py-10 md:py-16">
        <SectionLabel index="—" label="BOOKING HISTORY" />
        <h1 className="mt-4 font-display text-display-md uppercase text-paper">YOUR BOOKINGS.</h1>

        {sections.map((section) => (
          <div key={section.label} className="mt-12">
            <span className="tag-number text-ink-600">
              {section.label} ({section.items.length})
            </span>
            <div className="mt-4 hairline divide-y divide-ink-800">
              {section.items.map((r) => {
                const service = one(r.services);
                const barber = one(r.barbers);
                return (
                  <BookingRow
                    key={r.id}
                    serviceName={service?.name_en ?? "Service"}
                    barberName={barber?.name || barber?.nickname || "your barber"}
                    start={r.appointment_start}
                    status={r.status}
                  />
                );
              })}
              {section.items.length === 0 && (
                <p className="px-6 py-6 font-sans text-sm text-ink-400">Nothing here yet.</p>
              )}
            </div>
          </div>
        ))}
      </Container>
    </main>
  );
}
