// app/api/webhooks/notifications/route.ts
// Target for a Supabase Database Webhook configured on INSERT into
// public.appointments (Dashboard -> Database -> Webhooks, or a migration
// using supabase_functions.http_request). This is for THIRD-PARTY
// notifications (WhatsApp/SMS/etc.) -- the in-app Shop Mode realtime feed
// is separate and already handled entirely inside the database by the
// notify_new_appointment trigger (see supabase/migrations). Forwards to the
// send-notification Edge Function so third-party API calls never touch the
// browser and never need their secrets here either.
import { NextResponse } from "next/server";

interface DatabaseWebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: { id: string } & Record<string, unknown>;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  if (secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const payload: DatabaseWebhookPayload = await request.json();

  if (payload.table !== "appointments" || payload.type !== "INSERT") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const res = await fetch(`${projectUrl}/functions/v1/send-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ appointment_id: payload.record.id }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "EDGE_FUNCTION_FAILED" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
