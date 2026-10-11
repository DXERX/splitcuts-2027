// app/api/bookings/send-confirmation/route.ts
// Fired (fire-and-forget) from BookingFlow.tsx right after a booking
// succeeds. Looks the appointment up server-side by id -- never trusts
// customer details the client might send -- and emails whoever is on file
// as customer_email, with the appointment time, their barber, and the shop
// location link. Uses Resend's HTTP API directly (not the SMTP relay
// configured for Supabase Auth's own OTP emails -- that's a separate,
// Dashboard-level setting for a different kind of email entirely).
//
// Deliberately best-effort: a booking is already confirmed and locked in by
// the time this runs, so nothing here should ever be able to fail a
// booking. Every branch below returns 200 with a `skipped`/`sent` flag
// rather than an error status, and the caller does not need to check the
// result.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { SHOP_LOCATION_URL, SHOP_PHONE_DISPLAY, SHOP_EMAIL } from "@/lib/shopInfo";

const bodySchema = z.object({ appointmentId: z.string().uuid() });

interface AppointmentRow {
  id: string;
  customer_id?: string | null;
  customer_name: string | null;
  customer_email: string | null;
  appointment_date: string;
  appointment_time: string;
  appointment_start?: string | null;
  confirmation_email_sent_at: string | null;
  created_at?: string | null;
  total_price?: number | null;
  visit_id?: string | null;
  barbers: { name: string | null; nickname: string | null } | { name: string | null; nickname: string | null }[] | null;
  services: { name_en: string | null; name_ar: string | null } | { name_en: string | null; name_ar: string | null }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const RIYADH_DATE = new Intl.DateTimeFormat("ar-SA", {
  timeZone: "Asia/Riyadh",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const RIYADH_TIME = new Intl.DateTimeFormat("ar-SA", {
  timeZone: "Asia/Riyadh",
  hour: "numeric",
  minute: "2-digit",
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[character] ?? character;
  });
}

/** A stored name that is actually a phone number should not be the greeting. */
function greetingName(value: string | null): string {
  const raw = (value ?? "").trim();
  if (!raw || /^guest$/i.test(raw) || /^\+?[\d\s()-]{7,}$/.test(raw)) return "";
  return escapeHtml(raw);
}

/** Uses the real Riyadh instant, so a 01:30 slot on Saturday's business day
 * reads as Sunday 1:30, not Saturday 1:30. */
function formatRiyadhWhen(startIso: string | null, dateStr: string, timeStr: string): string {
  const instant = startIso
    ? new Date(startIso)
    : new Date(`${dateStr}T${timeStr.slice(0, 5)}:00+03:00`);
  return `${RIYADH_DATE.format(instant)}، الساعة ${RIYADH_TIME.format(instant)}`;
}

function confirmationEmailHtml(opts: {
  customerName: string;
  whenText: string;
  barberName: string;
  serviceNames: string[];
}) {
  const { customerName, whenText, barberName, serviceNames } = opts;
  const services = serviceNames.map((name) => escapeHtml(name)).join(" · ");
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
  <body style="margin:0; padding:0; background-color:#0F0D0B;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0F0D0B;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px; background-color:#17130F; border:1px solid #362D24;">
            <tr>
              <td align="center" style="padding:36px 32px 0 32px;">
                <span style="font-family:Arial, Helvetica, sans-serif; font-size:22px; font-weight:800; letter-spacing:4px; color:#F3EEE3;">
                  SPLIT CUTS
                </span>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 32px 0 32px;">
                <span style="font-family:Arial, Helvetica, sans-serif; font-size:19px; font-weight:700; color:#F3EEE3;">
                  يا هلا فيك${customerName ? " " + customerName : ""}، أحلى من يحجز في سبلت كتس!
                </span>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 32px 0 32px;">
                <span style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:26px; color:#C9BEB0;">
                  لا تنسى موعدك <strong style="color:#F3EEE3;">${whenText}</strong> عند الحلاق <strong style="color:#F3EEE3;">${escapeHtml(barberName)}</strong>
                  <br />
                  <span style="font-size:13px; color:#8A7864;">${services}</span>
                </span>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 32px 8px 32px;">
                <a href="${SHOP_LOCATION_URL}" style="display:inline-block; padding:12px 28px; background-color:#C9A227; color:#0F0D0B; font-family:Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:1px; text-decoration:none;">
                  موقع المحل على الخريطة
                </a>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #362D24; padding:20px 32px; margin-top:12px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#55483A;">
                      Split Cuts &middot; Abhur, Jeddah
                    </td>
                    <td align="left" style="font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#55483A;">
                      ${SHOP_PHONE_DISPLAY} &middot; ${SHOP_EMAIL}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ sent: false, skipped: "INVALID_BODY" }, { status: 200 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!resendApiKey || !fromEmail) {
    // Not configured yet -- don't fail the booking over it, just skip quietly.
    return NextResponse.json({ sent: false, skipped: "RESEND_NOT_CONFIGURED" }, { status: 200 });
  }

  const service = createServiceRoleClient();
  const columns =
    "id, customer_id, customer_name, customer_email, appointment_date, appointment_time, appointment_start, confirmation_email_sent_at, created_at, total_price, barbers:barbers(name, nickname), services:services(name_en, name_ar)";

  const withVisit = await service
    .from("appointments")
    .select(`${columns}, visit_id`)
    .eq("id", parsed.data.appointmentId)
    .maybeSingle();

  const visitColumnReady = !withVisit.error;
  const primary = (visitColumnReady ? withVisit.data : null) as AppointmentRow | null;
  let appointment = primary;

  if (!visitColumnReady) {
    const fallback = await service.from("appointments").select(columns).eq("id", parsed.data.appointmentId).maybeSingle();
    appointment = fallback.data as AppointmentRow | null;
  }

  if (!appointment) {
    return NextResponse.json({ sent: false, skipped: "NOT_FOUND" }, { status: 200 });
  }
  if (appointment.confirmation_email_sent_at) {
    return NextResponse.json({ sent: false, skipped: "ALREADY_SENT" }, { status: 200 });
  }

  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  const createdAt = appointment.created_at ? new Date(appointment.created_at).getTime() : 0;
  const justBooked = createdAt > 0 && Date.now() - createdAt < 30 * 60 * 1000;
  let allowed = justBooked || Boolean(user && appointment.customer_id && user.id === appointment.customer_id);
  if (!allowed && user) {
    const [{ data: profile }, { data: roles }] = await Promise.all([
      service.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle(),
      service.from("staff_roles").select("id").eq("user_id", user.id).eq("is_active", true).limit(1),
    ]);
    const role = profile?.role;
    allowed = Boolean(
      (profile?.is_active && (role === "owner" || role === "manager" || role === "cashier" || role === "barber")) ||
        (roles ?? []).length > 0,
    );
  }
  if (!allowed) {
    return NextResponse.json({ sent: false, skipped: "NOT_ALLOWED" }, { status: 200 });
  }

  let email = appointment.customer_email;
  if (!email && appointment.customer_id) {
    const account = await service.auth.admin.getUserById(appointment.customer_id);
    email = account.data.user?.email ?? null;
  }
  if (!email) {
    return NextResponse.json({ sent: false, skipped: "NO_EMAIL_ON_FILE" }, { status: 200 });
  }

  let sitting = [appointment];
  if (visitColumnReady && appointment.visit_id) {
    const related = await service
      .from("appointments")
      .select(`${columns}, visit_id`)
      .eq("visit_id", appointment.visit_id)
      .order("appointment_start", { ascending: true });
    const rows = (related.data ?? []) as AppointmentRow[];
    if (rows.length > 0) sitting = rows;
  }

  const lead = sitting[0] ?? appointment;
  const barber = one(lead.barbers);
  const serviceNames = sitting.map((row) => {
    const svc = one(row.services);
    return svc?.name_ar || svc?.name_en || "خدمة";
  });
  const html = confirmationEmailHtml({
    customerName: greetingName(lead.customer_name),
    whenText: formatRiyadhWhen(lead.appointment_start ?? null, lead.appointment_date, lead.appointment_time),
    barberName: barber?.name || barber?.nickname || "فريق سبلت كتس",
    serviceNames,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: "تأكيد حجزك في سبلت كتس",
        html,
      }),
    });

    if (!res.ok) {
      console.error("Resend send-confirmation failed", res.status, await res.text().catch(() => ""));
      return NextResponse.json({ sent: false, skipped: "RESEND_ERROR" }, { status: 200 });
    }
  } catch (err) {
    console.error("Resend send-confirmation threw", err);
    return NextResponse.json({ sent: false, skipped: "RESEND_ERROR" }, { status: 200 });
  }

  await service
    .from("appointments")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .in(
      "id",
      sitting.map((row) => row.id),
    );

  return NextResponse.json({ sent: true });
}
