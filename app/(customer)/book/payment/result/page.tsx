// app/(customer)/book/payment/result/page.tsx
// Where Tamara's checkout redirects the browser back to (merchant_url.success
// / failure / cancel in create-checkout/route.ts, each carrying our own
// ?ref=<merchant_reference> so this page can find the right payments row
// without depending on Tamara appending anything itself). The appointment
// was already created before Tamara was ever involved, so every branch below
// reassures the customer their booking still stands regardless of how the
// payment went.
import { createServiceRoleClient } from "@/lib/supabase/server";
import { authoriseOrder } from "@/lib/payments/tamaraClient";
import { LinkButton } from "@/components/ui/Button";

const COPY: Record<string, { headline: string; body: string }> = {
  captured: { headline: "PAID.", body: "Your payment went through — see you at your appointment." },
  authorised: { headline: "PAID.", body: "Your payment is confirmed — see you at your appointment." },
  canceled: {
    headline: "NO WORRIES.",
    body: "Payment was cancelled. Your booking still stands — pay at the shop instead.",
  },
  declined: {
    headline: "DIDN'T GO THROUGH.",
    body: "Tamara declined that payment. Your booking still stands — pay at the shop instead.",
  },
  error: {
    headline: "SOMETHING WENT WRONG.",
    body: "We couldn't confirm your payment just now. Your booking still stands either way.",
  },
  unknown: {
    headline: "BOOKING STANDS.",
    body: "We couldn't find that payment, but your appointment is still booked.",
  },
};

export default async function TamaraPaymentResultPage({
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

  // COPY.unknown is always present (it's a literal key on the object above),
  // so this fallback can never actually be undefined -- the assertion just
  // tells noUncheckedIndexedAccess that.
  const copy = (COPY[finalStatus] ?? COPY.unknown)!;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 py-20 text-center">
      <h1 className="font-display text-display-lg uppercase text-paper">{copy.headline}</h1>
      <p className="mt-4 max-w-md font-sans text-sm text-ink-300">{copy.body}</p>
      <LinkButton href="/" variant="primary" size="lg" className="mt-10">
        BACK HOME
      </LinkButton>
    </main>
  );
}
