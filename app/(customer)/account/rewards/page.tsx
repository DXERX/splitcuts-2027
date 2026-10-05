import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { LinkButton } from "@/components/ui/Button";
import { RewardDots } from "@/components/account/RewardDots";
import { UnlockBanner } from "@/components/account/UnlockBanner";

export default async function RewardsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: progress }, { data: availableRewards }, { data: transactions }] = await Promise.all([
    supabase.from("customer_loyalty_progress").select("*").eq("customer_id", user.id).maybeSingle(),
    supabase
      .from("rewards")
      .select("id, reward_type, status, earned_at, redeemed_at")
      .eq("customer_id", user.id)
      .order("earned_at", { ascending: false }),
    supabase
      .from("loyalty_transactions")
      .select("id, type, amount, reason, created_at")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const visitsRequired = progress?.visits_required ?? 5;
  const visitsProgress = (progress?.visits_progress ?? 0) % visitsRequired;
  const remaining = visitsRequired - visitsProgress;
  const hasUnlockedReward = (availableRewards ?? []).some((r) => r.status === "available");

  return (
    <main className="min-h-screen bg-ink pt-[var(--nav-height)] pb-24">
      <Container wide className="py-10 md:py-16">
        <SectionLabel index="—" label="SPLIT REWARDS" />
        <h1 className="mt-4 font-display text-display-md uppercase text-paper">
          {progress?.name ?? "MEMBERSHIP"}.
        </h1>

        <div className="mt-10 hairline p-6 md:p-10">
          <span className="tag-number text-ink-600">YOUR PROGRESS</span>
          <div className="mt-6">
            <RewardDots total={visitsRequired} progress={visitsProgress} />
          </div>

          <div className="mt-8">
            {hasUnlockedReward ? (
              <UnlockBanner label="FREE CUT UNLOCKED." />
            ) : remaining === 1 ? (
              <p className="font-display text-xl uppercase text-paper">
                ONE MORE CUT. NEXT ONE'S ON US.
              </p>
            ) : (
              <p className="font-sans text-sm text-ink-400">
                {remaining} more visit{remaining === 1 ? "" : "s"} until your next free cut.
              </p>
            )}
          </div>

          {hasUnlockedReward && (
            <LinkButton href="/book" variant="chrome" size="lg" className="mt-8">
              BOOK YOUR FREE CUT
            </LinkButton>
          )}
        </div>

        <div className="mt-16">
          <SectionLabel index="—" label="HISTORY" />
          <div className="mt-6 hairline divide-y divide-ink-800">
            {(transactions ?? []).map((t) => (
              <div key={t.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="font-sans text-sm text-paper">
                    {t.reason ?? (t.type === "credit" ? "Visit credited" : t.type)}
                  </p>
                  <p className="mt-0.5 font-sans text-xs text-ink-400">
                    {new Date(t.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <span className="font-sans text-sm font-semibold text-paper">
                  {t.amount > 0 ? "+" : ""}
                  {t.amount}
                </span>
              </div>
            ))}
            {(transactions ?? []).length === 0 && (
              <p className="px-6 py-6 font-sans text-sm text-ink-400">
                Your rewards history will show up here after your first visit.
              </p>
            )}
          </div>
        </div>
      </Container>
    </main>
  );
}
