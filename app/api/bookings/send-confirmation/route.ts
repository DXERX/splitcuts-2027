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
import { createServiceRoleClient } from "@/lib/supabase/server";
import { SHOP_LOCATION_URL, SHOP_PHONE_DISPLAY, SHOP_EMAIL } from "@/lib/shopInfo";

const bodySchema = z.object({ appointmentId: z.string().uuid() });

interface AppointmentRow {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  appointment_date: string;
  appointment_time: string;
  confirmation_email_sent_at: string | null;
  barbers: { name: string | null; nickname: string | null } | { name: string | null; nickname: string | null }[] | null;
  services: { name_en: string | null; name_ar: string | null } | { name_en: string | null; name_ar: string | null }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const ARABIC_WEEKDAY = new Intl.DateTimeFormat("ar-SA", { weekday: "long" });
const ARABIC_DAY_MONTH = new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "long" });

/** "2026-09-27" + "23:30:00" -> "الأحد ٢٧ سبتمبر، الساعة ١١:٣٠ م" */
function formatArabicDateTime(dateStr: string, timeStr: string): string {
  const [hStr, mStr] = timeStr.slice(0, 5).split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const d = new Date(`${dateStr}T00:00:00`);
  const period = h >= 12 ? "م" : "ص";
  const h12 = ((h + 11) % 12) + 1;
  const mm = String(m).padStart(2, "0");
  return `${ARABIC_WEEKDAY.format(d)} ${ARABIC_DAY_MONTH.format(d)}، الساعة ${h12}:${mm} ${period}`;
}

function confirmationEmailHtml(opts: { customerName: string; whenText: string; barberName: string; serviceName: string }) {
  const { customerName, whenText, barberName, serviceName } = opts;
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
                  لا تنسى موعدك <strong style="color:#F3EEE3;">${whenText}</strong> عند الحلاق <strong style="color:#F3EEE3;">${barberName}</strong>
                  <br />
                  <span style="font-size:13px; color:#8A7864;">${serviceName}</span>
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
  const { data } = await service
    .from("appointments")
    .select(
      "id, customer_name, customer_email, appointment_date, appointment_time, confirmation_email_sent_at, barbers:barbers(name, nickname), services:services(name_en, name_ar)",
    )
    .eq("id", parsed.data.appointmentId)
    .maybeSingle();

  const appointment = data as AppointmentRow | null;
  if (!appointment) {
    return NextResponse.json({ sent: false, skipped: "NOT_FOUND" }, { status: 200 });
  }
  if (!appointment.customer_email) {
    return NextResponse.json({ sent: false, skipped: "NO_EMAIL_ON_FILE" }, { status: 200 });
  }
  if (appointment.confirmation_email_sent_at) {
    return NextResponse.json({ sent: false, skipped: "ALREADY_SENT" }, { status: 200 });
  }

  const barber = one(appointment.barbers);
  const svc = one(appointment.services);
  const html = confirmationEmailHtml({
    customerName: appointment.customer_name ?? "",
    whenText: formatArabicDateTime(appointment.appointment_date, appointment.appointment_time),
    barberName: barber?.name || barber?.nickname || "فريق سبلت كتس",
    serviceName: svc?.name_ar || svc?.name_en || "",
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
        to: appointment.customer_email,
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
    .eq("id", appointment.id);

  return NextResponse.json({ sent: true });
}
