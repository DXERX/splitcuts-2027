import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeRouteForRole, isStaffRole } from "@/lib/roles";
import { Hero } from "@/components/home/Hero";
import { HomeBooking } from "@/components/home/HomeBooking";
import { RewardsStrip } from "@/components/home/RewardsStrip";
import { TamaraStrip } from "@/components/home/TamaraStrip";
import { Location } from "@/components/home/Location";
import { FooterStrip } from "@/components/home/FooterStrip";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only staff (owner/manager/cashier) get bounced to their workspace.
  // Customers -- signed in or not -- see the real homepage.
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (isStaffRole(profile?.role)) {
      redirect(homeRouteForRole(profile?.role));
    }
  }

  const [{ data: barbers }, { data: services }] = await Promise.all([
    supabase
      .from("barbers")
      .select("id, name, nickname, specialty, branch_id, is_active, created_at, updated_at, image_url")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("services")
      .select("id, name_en, name_ar, duration, price, branch_id, is_active, category, created_at, updated_at")
      .eq("is_active", true)
      .order("price"),
  ]);

  return (
    <main>
      <Hero />
      <HomeBooking barbers={barbers ?? []} services={services ?? []} />
      <TamaraStrip />
      <RewardsStrip />
      <Location />
      <FooterStrip />
    </main>
  );
}
