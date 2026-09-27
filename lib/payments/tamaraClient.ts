// lib/payments/tamaraClient.ts
// Server-only Tamara REST client (https://docs.tamara.co). NEVER import this
// from a Client Component -- it reads the merchant Bearer token from a
// server-only env var and would leak it into the browser bundle otherwise.
//
// Required env vars (see .env.example):
//   TAMARA_API_BASE_URL   -- "https://api-sandbox.tamara.co" while testing,
//                            switch to the production base URL Tamara gives
//                            you when you go live.
//   TAMARA_API_TOKEN      -- Bearer token from your Tamara merchant dashboard.
//   TAMARA_WEBHOOK_SECRET -- a string YOU make up, registered as the
//                            "authorization" header value when you register
//                            the webhook (see registerTamaraWebhook below).
//                            Tamara echoes it back on every webhook call so
//                            we can confirm the call actually came from them.

const BASE_URL = process.env.TAMARA_API_BASE_URL ?? "https://api-sandbox.tamara.co";

interface TamaraMoney {
  amount: number;
  currency: "SAR";
}

function money(amount: number): TamaraMoney {
  return { amount: Math.round(amount * 100) / 100, currency: "SAR" };
}

// Tamara's risk_assessment dates want "dd-mm-yyyy" specifically -- not ISO
// 8601 -- so an ISO date/datetime string (what Supabase gives us for both a
// `created_at` timestamptz and an `appointment_date` date column) has to be
// reformatted before it goes out, or their API rejects the whole request
// with "Invalid date format".
function toTamaraDate(isoDate: string): string {
  const datePart = isoDate.slice(0, 10); // "2026-01-15T10:30:00.000Z" -> "2026-01-15"
  const [y, m, d] = datePart.split("-");
  return `${d}-${m}-${y}`;
}

async function tamaraFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.TAMARA_API_TOKEN;
  if (!token) {
    throw new Error(
      "TAMARA_API_TOKEN is not set -- add it to .env.local (and your hosting provider's env vars) before Tamara checkout can run.",
    );
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (json && (json.message || json.error)) || `Tamara API error (${res.status})`;
    throw new Error(message);
  }
  return json as T;
}

export interface CheckoutItem {
  referenceId: string;
  name: string;
  sku: string;
  quantity: number;
  totalAmount: number;
}

export interface RiskAssessmentInput {
  isPremiumCustomer: boolean;
  accountCreationDate: string; // ISO date
  totalOrderCount: number;
  dateFirstPaid: string | null; // ISO date, null if never paid before
  dateLastPaid: string | null; // ISO date
}

export interface CreateCheckoutInput {
  orderReferenceId: string;
  totalAmount: number;
  description: string;
  items: CheckoutItem[];
  consumer: { firstName: string; lastName: string; phoneNumber: string; email?: string };
  riskAssessment: RiskAssessmentInput;
  successUrl: string;
  failureUrl: string;
  cancelUrl: string;
  notificationUrl: string;
}

export interface CheckoutSessionResult {
  order_id: string;
  checkout_id: string;
  checkout_url: string;
  status: string;
}

export async function createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSessionResult> {
  return tamaraFetch<CheckoutSessionResult>("/checkout", {
    method: "POST",
    body: JSON.stringify({
      order_reference_id: input.orderReferenceId,
      total_amount: money(input.totalAmount),
      shipping_amount: money(0),
      tax_amount: money(0),
      description: input.description.slice(0, 256),
      country_code: "SA",
      items: input.items.map((it) => ({
        reference_id: it.referenceId,
        type: "Digital", // a service booking, not a shipped physical good
        name: it.name,
        sku: it.sku,
        quantity: it.quantity,
        total_amount: money(it.totalAmount),
      })),
      consumer: {
        first_name: input.consumer.firstName,
        last_name: input.consumer.lastName || input.consumer.firstName,
        phone_number: input.consumer.phoneNumber,
        ...(input.consumer.email ? { email: input.consumer.email } : {}),
      },
      // A haircut isn't shipped anywhere, but Tamara's schema requires a
      // shipping_address regardless -- the shop's own address satisfies it.
      shipping_address: {
        first_name: input.consumer.firstName,
        last_name: input.consumer.lastName || input.consumer.firstName,
        line1: "Split Cuts, Abhur Al Shamaliyah",
        city: "Jeddah",
        country_code: "SA",
      },
      risk_assessment: {
        is_premium_customer: input.riskAssessment.isPremiumCustomer,
        account_creation_date: toTamaraDate(input.riskAssessment.accountCreationDate),
        total_order_count: input.riskAssessment.totalOrderCount,
        ...(input.riskAssessment.dateFirstPaid
          ? { date_first_paid: toTamaraDate(input.riskAssessment.dateFirstPaid) }
          : {}),
        ...(input.riskAssessment.dateLastPaid
          ? { date_last_paid: toTamaraDate(input.riskAssessment.dateLastPaid) }
          : {}),
      },
      merchant_url: {
        success: input.successUrl,
        failure: input.failureUrl,
        cancel: input.cancelUrl,
        notification: input.notificationUrl,
      },
      payment_type: "PAY_BY_INSTALMENTS",
    }),
  });
}

export interface AuthoriseOrderResult {
  order_id: string;
  status: string;
  auto_captured: boolean;
  capture_id: string;
  authorized_amount: TamaraMoney;
}

export async function authoriseOrder(orderId: string): Promise<AuthoriseOrderResult> {
  return tamaraFetch<AuthoriseOrderResult>(`/orders/${orderId}/authorise`, { method: "POST" });
}

export interface EligibilityResult {
  is_eligible: boolean;
}

export async function checkEligibility(amount: number, phoneNumber?: string): Promise<EligibilityResult> {
  return tamaraFetch<EligibilityResult>("/pre-checkout/v1/eligibility", {
    method: "POST",
    body: JSON.stringify({
      order: { amount, currency: "SAR" },
      customer: phoneNumber ? { phone_number: phoneNumber } : {},
    }),
  });
}

/**
 * One-time setup call, not something the app runs on every request. Run this
 * yourself (a one-off script, or curl) once the site has a real public HTTPS
 * domain -- Tamara needs a reachable URL to send webhook events to, so this
 * can't be registered against localhost.
 */
export async function registerTamaraWebhook(url: string, authSecret: string) {
  return tamaraFetch("/webhooks", {
    method: "POST",
    body: JSON.stringify({
      type: "order",
      url,
      events: [
        "order_approved",
        "order_authorised",
        "order_canceled",
        "order_updated",
        "order_captured",
        "order_refunded",
      ],
      headers: { authorization: authSecret },
    }),
  });
}
