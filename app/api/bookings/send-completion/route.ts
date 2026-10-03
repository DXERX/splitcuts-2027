import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const json = (body: object, status = 200) => NextResponse.json(body, { status });
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!url || !anon || !serviceKey || !resendKey || !from) return json({ error: "SERVER_NOT_CONFIGURED" }, 503);

  const jar = cookies();
  const userClient = createServerClient(url, anon, {
    cookies: {
      get(name) { return jar.get(name)?.value; },
      set() {},
      remove() {},
    },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "UNAUTHORIZED" }, 401);

  let appointmentId: unknown;
  try { appointmentId = (await req.json()).appointmentId; }
  catch { return json({ error: "INVALID_JSON" }, 400); }
  if (typeof appointmentId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(appointmentId))
    return json({ error: "INVALID_APPOINTMENT_ID" }, 400);

  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  // Only the authenticated staff member who actually recorded the DONE transition may send.
  const { data: event, error: eventError } = await db.from("booking_events")
    .select("id").eq("appointment_id", appointmentId).eq("event_type", "status_changed")
    .eq("new_status", "completed").eq("performed_by", user.id).limit(1).maybeSingle();
  if (eventError) return json({ error: "EVENT_LOOKUP_FAILED" }, 500);
  if (!event) return json({ error: "FORBIDDEN" }, 403);

  const { data: appt, error: apptError } = await db.from("appointments")
    .select("id, status, customer_id, customer_name, customer_email, branch_id, completion_email_sent_at, completion_email_claimed_at")
    .eq("id", appointmentId).single();
  if (apptError || !appt || appt.status !== "completed") return json({ error: "NOT_COMPLETED" }, 409);
  if (appt.completion_email_sent_at) return json({ sent: false, skipped: "ALREADY_SENT" });
  if (!appt.customer_email) return json({ sent: false, skipped: "NO_EMAIL" });

  // Claim expires after 10 minutes in case a server crashed during delivery.
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const claimTime = new Date().toISOString();
  let claimQuery = db.from("appointments").update({ completion_email_claimed_at: claimTime })
    .eq("id", appointmentId).is("completion_email_sent_at", null);
  claimQuery = appt.completion_email_claimed_at
    ? claimQuery.eq("completion_email_claimed_at", appt.completion_email_claimed_at)
    : claimQuery.is("completion_email_claimed_at", null);
  if (appt.completion_email_claimed_at && appt.completion_email_claimed_at > stale)
    return json({ sent: false, skipped: "IN_PROGRESS" });
  const { data: claimed, error: claimError } = await claimQuery.select("id").maybeSingle();
  if (claimError) return json({ error: "CLAIM_FAILED" }, 500);
  if (!claimed) return json({ sent: false, skipped: "IN_PROGRESS_OR_SENT" });

  try {
    let remaining: number | null = null;
    let unlocked = false;
    if (appt.customer_id) {
      const { data: programs, error: programsError } = await db.from("loyalty_programs")
        .select("id, visits_required, branch_id").eq("is_active", true);
      if (programsError) throw programsError;
      const program = (programs || []).find(p => p.branch_id === appt.branch_id) ||
        (programs || []).find(p => p.branch_id === null);
      if (program) {
        const { data: reward, error: rewardError } = await db.from("loyalty_transactions")
          .select("id").eq("customer_id", appt.customer_id).eq("loyalty_program_id", program.id)
          .eq("appointment_id", appointmentId).eq("type", "reward_earned").limit(1).maybeSingle();
        if (rewardError) throw rewardError;
        unlocked = !!reward;
        const { data: progress, error: progressError } = await db.from("customer_loyalty_progress")
          .select("visits_progress, visits_required").eq("customer_id", appt.customer_id)
          .eq("loyalty_program_id", program.id).maybeSingle();
        if (progressError) throw progressError;
        if (progress && progress.visits_required > 0) {
          const mod = ((progress.visits_progress % progress.visits_required) + progress.visits_required) % progress.visits_required;
          remaining = progress.visits_required - mod;
        }
      }
    }

    const rawName = (appt.customer_name || "").trim();
    const safeName = rawName && !/^\+?[\d\s()\-]{7,}$/.test(rawName) ? escapeHtml(rawName) : "";
    const intro = `ألف نعيمًا${safeName ? ` يا ${safeName}` : ""} 🤍 شرفتنا اليوم في Split Cuts، ونتمنى نشوفك قريب.`;
    const message = unlocked
      ? "🎉 مبروك! الحلاقة الجاية علينا. وصلت للمكافأة المجانية في Split Rewards. احجز الوقت اللي يناسبك ونشوفك في Split Cuts."
      : remaining !== null
        ? `باقي لك ${remaining} ${remaining === 1 ? "حلاقة" : "حلاقات"} حتى تفتح الحلاقة المجانية.`
        : "يسعدنا نشوفك مرة ثانية قريبًا.";
    const html = `<div dir="rtl" style="background:#101113;color:#fff;font:16px Arial,sans-serif;padding:36px;max-width:560px;margin:auto"><h1 style="letter-spacing:2px">SPLIT CUTS</h1><p>${intro}</p><p style="font-size:20px;line-height:1.8">${message}</p><a href="https://splithairstudio.com" style="display:inline-block;padding:14px 22px;background:#fff;color:#111;text-decoration:none;font-weight:bold">احجز موعدك القادم</a></div>`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [appt.customer_email], subject: unlocked ? "🎉 مبروك! الحلاقة الجاية علينا | Split Cuts" : "ألف نعيمًا 🤍 | Split Cuts", html }),
    });
    if (!response.ok) throw new Error(`RESEND_${response.status}: ${(await response.text()).slice(0, 250)}`);
    const { error: markError } = await db.from("appointments")
      .update({ completion_email_sent_at: new Date().toISOString() })
      .eq("id", appointmentId).eq("completion_email_claimed_at", claimTime);
    if (markError) throw markError;
    return json({ sent: true, rewardUnlocked: unlocked, remaining });
  } catch (err) {
    // A send can succeed even if recording success fails; don't blindly retry in that case.
    console.error("[completion-email]", err);
    return json({ error: "SEND_OR_RECORD_FAILED", note: "Check Resend logs before retrying" }, 502);
  }
}
