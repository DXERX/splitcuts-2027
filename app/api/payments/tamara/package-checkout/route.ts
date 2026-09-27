// app/api/payments/tamara/package-checkout/route.ts
// Same shape as create-checkout/route.ts, but for a University Student
// Package purchase instead of an appointment. The customer_packages row
// already exists in 'pending_payment' (created by request_package) -- this
// route only stands up a Tamara checkout session for it and stamps a
// payments row tying the two together via customer_package_id. Packages are
// always tied to a signed-in account (no guest path, unlike appointments),
// so this always requires a session.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { createCheckoutSession } from "@/lib/payments/tamaraClient";
import { isTamaraEligible, TAMARA_PROCESSING_FEE_SAR, tamaraChargeTotal } from "@/lib/payments/tamaraEligibility";
import { toE164Saudi } from "@/lib/phone";

const blank = (v: unknown) => (v === "" ? undefined : v);
const bodySchema = z.object({
  customerPackageId: z.string().uuid(),
  phone: z.preprocess(blank, z.string().min(6).optional()),
  name: z.preprocess(blank, z.string().max(200).optional()),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  const { customerPackageId, phone, name } = parsed.data;

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
  if (!user) {
    return NextResponse.json({ error: "LOGIN_REQUIRED" }, { status: 401 });
  }

  const service = createServiceRoleClient();

  const { data: customerPackage, error: fetchError } = await service
    .from("customer_packages")
    .select("id, customer_id, status, package_id, packages:packages(name_en, price)")
    .eq("id", customerPackageId)
    .maybeSingle();

  if (fetchError || !customerPackage) {
    return NextResponse.json({ error: "PACKAGE_REQUEST_NOT_FOUND" }, { status: 404 });
  }
  if (customerPackage.customer_id !== user.id) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (customerPackage.status !== "pending_payment") {
    return NextResponse.json({ error: "PACKAGE_NOT_PENDING" }, { status: 400 });
  }

  const pkg = Array.isArray(customerPackage.packages) ? customerPackage.packages[0] : customerPackage.packages;
  const price = pkg?.price ?? 0;
  if (!isTamaraEligible(price)) {
    return NextResponse.json({ error: "BELOW_TAMARA_MINIMUM" }, { status: 400 });
  }

  const { data: profile } = await service.from("profiles").select("full_name, phone, created_at").eq("id", user.id).single();

  const rawPhone = phone || profile?.phone || "";
  if (!rawPhone) {
    return NextResponse.json({ error: "PHONE_REQUIRED" }, { status: 400 });
  }
  const customerPhone = toE164Saudi(rawPhone);
  const fullName = (name || profile?.full_name || "Guest").trim();
  const [firstName, ...rest] = fullName.split(" ");

  const { data: completed } = await service
    .from("appointments")
    .select("appointment_date")
    .eq("customer_id", user.id)
    .eq("status", "completed")
    .order("appointment_date", { ascending: true });
  const dates = (completed ?? []).map((c) => c.appointment_date).filter(Boolean) as string[];
  const riskAssessment = {
    isPremiumCustomer: dates.length >= 10,
    accountCreationDate: profile?.created_at ?? new Date().toISOString(),
    totalOrderCount: dates.length,
    dateFirstPaid: dates[0] ?? null,
    dateLastPaid: dates[dates.length - 1] ?? null,
  };

  const merchantReference = crypto.randomUUID();
  const chargeTotal = tamaraChargeTotal(price);

  let session;
  try {
    session = await createCheckoutSession({
      orderReferenceId: merchantReference,
      totalAmount: chargeTotal,
      description: `Split Cuts package: ${pkg?.name_en ?? "Package"}`,
      items: [
        {
          referenceId: customerPackage.package_id,
          name: pkg?.name_en ?? "Package",
          sku: customerPackage.package_id,
          quantity: 1,
          totalAmount: price,
        },
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
      successUrl: `${siteUrl}/account/package-payment/result?status=success&ref=${merchantReference}`,
      failureUrl: `${siteUrl}/account/package-payment/result?status=failure&ref=${merchantReference}`,
      cancelUrl: `${siteUrl}/account/package-payment/result?status=cancel&ref=${merchantReference}`,
      notificationUrl: `${siteUrl}/api/payments/tamara/webhook`,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const { error: insertError } = await service.from("payments").insert({
    appointment_ids: [],
    customer_package_id: customerPackageId,
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
