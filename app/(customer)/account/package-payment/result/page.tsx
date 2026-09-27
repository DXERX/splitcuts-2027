// app/(customer)/account/package-payment/result/page.tsx
// Where Tamara's checkout redirects the browser back to after a University
// Student Package purchase (mirrors book/payment/result/page.tsx's shape for
// appointment payments). Once the charge reads as paid, this also flips the
// package itself from pending_payment -> active via
// activate_package_from_payment -- the same call the webhook makes, so
// whichever of the two arrives first does the activating and the other is a
// no-op.
import { createServiceRoleClient } from "@/lib/supabase/server";
import { authoriseOrder } from "@/lib/payments/tamaraClient";
import { LinkButton } from "@/components/ui/Button";

const COPY: Record<string, { headline: string; body: string }> = {
  captured: { headline: "PACKAGE ACTIVE.", body: "Your payment went through — your package is active, book anytime." },
  authorised: { headline: "PACKAGE ACTIVE.", body: "Your payment is confirmed — your package is active, book anytime." },
  canceled: {
    headline: "NO WORRIES.",
    body: "Payment was cancelled. You can pay at the shop instead to activate your package.",
  },
  declined: {
    headline: "DIDN'T GO THROUGH.",
    body: "Tamara declined that payment. You can pay at the shop instead to activate your package.",
  },
  error: {
    headline: "SOMETHING WENT WRONG.",
    body: "We couldn't confirm your payment just now. Check your account in a moment, or pay at the shop.",
  },
  unknown: {
    headline: "COULDN'T FIND THAT.",
    body: "We couldn't find that payment. Check your account for your package's current status.",
  },
};

export default async function PackageTamaraPaymentResultPage({
  searchParams,
}: {
  searchParams: { status?: string; ref?: string };
}) {
  const { status, ref } = searchParams;
  const service = createServiceRoleClient();

  const { data: payment } = ref
    ? await service.from("payments").select("*").eq("merchant_reference", ref).maybeSingle()
    : { data: null };

  let finalStatus = "unknown";

  if (payment && status === "success" && payment.provider_order_id) {
    if (payment.status === "pending" || payment.status === "approved") {
      try {
        const result = await authoriseOrder(payment.provider_order_id);
        const nextStatus = result.auto_captured ? "captured" : "authorised";
        await service.from("payments").update({ status: nextStatus }).eq("id", payment.id);
        finalStatus = nextStatus;
      } catch {
        finalStatus = "error";
      }
    } else {
      finalStatus = payment.status;
    }
  } else if (payment && status === "cancel") {
    await service.from("payments").update({ status: "canceled" }).eq("id", payment.id);
    finalStatus = "canceled";
  } else if (payment && status === "failure") {
    await service.from("payments").update({ status: "declined" }).eq("id", payment.id);
    finalStatus = "declined";
  }

  if (payment?.customer_package_id && (finalStatus === "captured" || finalStatus === "authorised")) {
    // Idempotent -- if the webhook already activated this package, this is a
    // no-op that just hands back the current (already-active) row.
    await service.rpc("activate_package_from_payment", { p_payment_id: payment.id });
  }

  const copy = (COPY[finalStatus] ?? COPY.unknown)!;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 py-20 text-center">
      <h1 className="font-display text-display-lg uppercase text-paper">{copy.headline}</h1>
      <p className="mt-4 max-w-md font-sans text-sm text-ink-300">{copy.body}</p>
      <LinkButton href="/account" variant="primary" size="lg" className="mt-10">
        BACK TO ACCOUNT
      </LinkButton>
    </main>
  );
}
