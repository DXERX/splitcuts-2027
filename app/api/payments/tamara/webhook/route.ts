// app/api/payments/tamara/webhook/route.ts
// Registered once (see registerTamaraWebhook in lib/payments/tamaraClient.ts)
// as the "notification" URL Tamara calls with async order status changes.
// Never trust this call's origin -- Tamara echoes back whatever string we
// registered as the "authorization" header (TAMARA_WEBHOOK_SECRET), so that
// header is the only thing that proves a call actually came from Tamara.
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

const STATUS_BY_EVENT: Record<string, string> = {
  order_approved: "approved",
  order_authorised: "authorised",
  order_captured: "captured",
  order_canceled: "canceled",
  order_refunded: "refunded",
};

interface TamaraWebhookPayload {
  order_id?: string;
  order_reference_id?: string;
  event_type?: string;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.TAMARA_WEBHOOK_SECRET || authHeader !== process.env.TAMARA_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as TamaraWebhookPayload | null;
  if (!payload?.order_id || !payload.event_type) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const newStatus = STATUS_BY_EVENT[payload.event_type];
  if (!newStatus) {
    // An event type we don't specifically track -- acknowledge it so Tamara
    // doesn't keep retrying, just don't change anything.
    return NextResponse.json({ ok: true, skipped: true });
  }

  const service = createServiceRoleClient();
  const { data: updated } = await service
    .from("payments")
    .update({ status: newStatus })
    .eq("provider_order_id", payload.order_id)
    .select("id, customer_package_id")
    .maybeSingle();

  // A package payment (customer_package_id set) that just went to a paid
  // status activates the package itself -- idempotent, so if the browser
  // redirect on payment/result already did this, this is a no-op.
  if (updated?.customer_package_id && (newStatus === "captured" || newStatus === "authorised")) {
    await service.rpc("activate_package_from_payment", { p_payment_id: updated.id });
  }

  return NextResponse.json({ ok: true });
}
