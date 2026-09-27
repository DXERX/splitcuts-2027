// app/api/payments/tamara/create-checkout/route.ts
// Called from the booking confirmation screen when the total is >= 100 SAR
// and the customer taps "PAY WITH TAMARA". The appointment(s) already exist
// (the slot is already reserved) -- this route only creates a Tamara
// checkout session for the already-booked total and hands back the
// checkout_url to redirect the browser to. See supabase/migrations/0009 for
// why booking is never gated on this succeeding.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { createCheckoutSession } from "@/lib/payments/tamaraClient";
import { isTamaraEligible, TAMARA_PROCESSING_FEE_SAR, tamaraChargeTotal } from "@/lib/payments/tamaraEligibility";
import { toE164Saudi } from "@/lib/phone";

// blank() turns "" into undefined before the real check runs -- the client
// always sends `phone`/`name` keys, and an empty one (unfilled name field, a
// signed-in customer with no phone on file yet) used to fail z.string().min(6)
// outright and reject the whole request as INVALID_BODY even though these
// fields are meant to be optional.
const blank = (v: unknown) => (v === "" ? undefined : v);
const bodySchema = z.object({
  appointmentIds: z.array(z.string().uuid()).min(1).max(10),
  phone: z.preprocess(blank, z.string().min(6).optional()),
  name: z.preprocess(blank, z.string().max(200).optional()),
});

interface AppointmentRow {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  service_id: string;
  services: { name_en: string | null; price: number | null } | { name_en: string | null; price: number | null }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  const { appointmentIds, phone, name } = parsed.data;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return NextResponse.json(
      { error: "SITE_URL_NOT_CONFIGURED: set NEXT_PUBLIC_SITE_URL to your real deployed domain first." },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const service = createServiceRoleClient();

  const { data, error: fetchError } = await service
    .from("appointments")
    .select("id, customer_id, customer_name, customer_phone, service_id, services:services(name_en, price)")
    .in("id", appointmentIds);

  const appointments = (data ?? []) as AppointmentRow[];
  if (fetchError || appointments.length !== appointmentIds.length) {
    return NextResponse.json({ error: "APPOINTMENTS_NOT_FOUND" }, { status: 404 });
  }

  // Compare normalized on both sides -- an appointment booked before phones
  // were consistently stored as E.164 might still have "0501234567" on file
  // while the customer now types "+966501234567" (or vice versa); without
  // this they'd never match even though it's the same number.
  const normalizedInputPhone = phone ? toE164Saudi(phone) : "";

  // Stand-in for RLS: a signed-in customer must own every appointment; a
  // guest (customer_id null) must supply the same phone every one of them
  // was booked with. Guest appointment rows have no RLS select policy at
  // all, so this check is what keeps one guest from paying for -- or
  // snooping on -- another guest's booking.
  const owns = appointments.every((a) =>
    user
      ? a.customer_id === user.id
      : Boolean(normalizedInputPhone) && a.customer_phone && toE164Saudi(a.customer_phone) === normalizedInputPhone,
  );
  if (!owns) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const totalAmount = appointments.reduce((sum, a) => sum + (one(a.services)?.price ?? 0), 0);
  if (!isTamaraEligible(totalAmount)) {
    return NextResponse.json({ error: "BELOW_TAMARA_MINIMUM" }, { status: 400 });
  }

  const first = appointments[0];
  const rawPhone = phone || first?.customer_phone || "";
  if (!rawPhone) {
    return NextResponse.json({ error: "PHONE_REQUIRED" }, { status: 400 });
  }
  const customerPhone = toE164Saudi(rawPhone);
  const fullName = (name || first?.customer_name || "Guest").trim();
  const [firstName, ...rest] = fullName.split(" ");

  // Risk assessment: real order history for a signed-in customer; a
  // conservative "no history" default for a guest (no account to look one
  // up for).
  let riskAssessment = {
    isPremiumCustomer: false,
    accountCreationDate: new Date().toISOString(),
    totalOrderCount: 0,
    dateFirstPaid: null as string | null,
    dateLastPaid: null as string | null,
  };

  if (user) {
    const [{ data: profile }, { data: completed }] = await Promise.all([
      service.from("profiles").select("created_at").eq("id", user.id).single(),
      service
        .from("appointments")
        .select("appointment_date")
        .eq("customer_id", user.id)
        .eq("status", "completed")
        .order("appointment_date", { ascending: true }),
    ]);

    const dates = (completed ?? []).map((c) => c.appointment_date).filter(Boolean) as string[];
    riskAssessment = {
      isPremiumCustomer: dates.length >= 10,
      accountCreationDate: profile?.created_at ?? riskAssessment.accountCreationDate,
      totalOrderCount: dates.length,
      dateFirstPaid: dates[0] ?? null,
      dateLastPaid: dates[dates.length - 1] ?? null,
    };
  }

  const merchantReference = crypto.randomUUID();
  // Tamara's total_amount must equal the sum of its own items -- so the 1 SAR
  // processing fee rides along as its own line item rather than just being
  // folded silently into the total.
  const chargeTotal = tamaraChargeTotal(totalAmount);

  let session;
  try {
    session = await createCheckoutSession({
      orderReferenceId: merchantReference,
      totalAmount: chargeTotal,
      description: `Split Cuts booking (${appointments.length} service${appointments.length > 1 ? "s" : ""})`,
      items: [
        ...appointments.map((a) => {
          const svc = one(a.services);
          return {
            referenceId: a.service_id,
            name: svc?.name_en ?? "Service",
            sku: a.service_id,
            quantity: 1,
            totalAmount: svc?.price ?? 0,
          };
        }),
        {
          referenceId: "tamara-processing-fee",
          name: "Tamara processing fee",
          sku: "tamara-fee",
          quantity: 1,
          totalAmount: TAMARA_PROCESSING_FEE_SAR,
        },
      ],
      consumer: { firstName: firstName || "Guest", lastName: rest.join(" "), phoneNumber: customerPhone },
      riskAssessment,
      successUrl: `${siteUrl}/book/payment/result?status=success&ref=${merchantReference}`,
      failureUrl: `${siteUrl}/book/payment/result?status=failure&ref=${merchantReference}`,
      cancelUrl: `${siteUrl}/book/payment/result?status=cancel&ref=${merchantReference}`,
      notificationUrl: `${siteUrl}/api/payments/tamara/webhook`,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const { error: insertError } = await service.from("payments").insert({
    appointment_ids: appointmentIds,
    provider: "tamara",
    merchant_reference: merchantReference,
    provider_order_id: session.order_id,
    provider_checkout_id: session.checkout_id,
    checkout_url: session.checkout_url,
    status: "pending",
    amount: chargeTotal,
    currency: "SAR",
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ checkoutUrl: session.checkout_url });
}
