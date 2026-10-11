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

  const [{ data: progressRows }, { data: availableRewards }, { data: transactions }] = await Promise.all([
    supabase.from("customer_loyalty_progress").select("*").eq("customer_id", user.id),
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

  const progress = [...(progressRows ?? [])].sort((a, b) => {
    const byVisits = (b.visits_progress ?? 0) - (a.visits_progress ?? 0);
    if (byVisits !== 0) return byVisits;
    if (a.branch_id == null && b.branch_id != null) return -1;
    if (b.branch_id == null && a.branch_id != null) return 1;
    return 0;
  })[0];

  const visitsRequired = progress?.visits_required ?? 5;
  const rawProgress = progress?.visits_progress ?? 0;
  const cycleProgress = visitsRequired > 0 ? rawProgress % visitsRequired : 0;
  const hasUnlockedReward = (availableRewards ?? []).some((r) => r.status === "available");
  const visitsProgress =
    cycleProgress === 0 && rawProgress > 0 && hasUnlockedReward ? visitsRequired : cycleProgress;
  const remaining =
    cycleProgress === 0 && rawProgress > 0 && hasUnlockedReward ? 0 : visitsRequired - cycleProgress;

  return (
    <main className="min-h-screen bg-ink pt-[var(--nav-height)] pb-24">
      <Container wide className="py-10 md:py-16">
        <SectionLabel index="—" label="تتبع القصات" />
        <h1 className="mt-4 font-display text-display-md text-paper">قصاتك</h1>
        <p className="mt-3 max-w-xl font-sans text-base text-ink-200">
          كل قصة شعر أو شعر مع لحية في يوم مختلف تحسب نقطة. خمس نقاط والسادسة علينا.
        </p>

        <div className="mt-10 hairline p-6 md:p-10">
          <p className="font-display text-5xl text-paper sm:text-6xl">
            {visitsProgress}
            <span className="text-ink-400"> / {visitsRequired}</span>
          </p>
          <div className="mt-6">
            <RewardDots total={visitsRequired} progress={visitsProgress} />
          </div>

          <div className="mt-8">
            {hasUnlockedReward ? (
              <UnlockBanner label="قصتك الجاية مجانًا." />
            ) : remaining === 1 ? (
              <p className="font-display text-2xl text-paper">باقي قصة واحدة والجاية علينا.</p>
            ) : (
              <p className="font-sans text-lg text-ink-200">باقي {remaining} قصات وتفتح القصة المجانية.</p>
            )}
          </div>

          {hasUnlockedReward && (
            <LinkButton href="/book" variant="chrome" size="lg" className="mt-8">
              احجز القصة المجانية
            </LinkButton>
          )}
        </div>

        <div className="mt-16">
          <SectionLabel index="—" label="سجل القصات" />
          <div className="mt-6 hairline divide-y divide-ink-800">
            {(transactions ?? []).map((t) => (
              <div key={t.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="font-sans text-sm text-paper">
                    {t.reason ?? (t.type === "credit" ? "Visit credited" : t.type)}
                  </p>
                  <p className="mt-0.5 font-sans text-xs text-ink-400">
                    {new Date(t.created_at).toLocaleDateString("ar-SA", {
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
                بعد أول قصة تخلص في المحل، بتظهر هنا.
              </p>
            )}
          </div>
        </div>
      </Container>
    </main>
  );
}
