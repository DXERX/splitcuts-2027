import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const json = (body: object, status = 200) =>
  NextResponse.json(body, { status });

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      (
        {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        } as Record<string, string>
      )[character] ?? character,
  );

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!url || !anon || !serviceKey || !resendKey || !from) {
    return json(
      { error: "SERVER_NOT_CONFIGURED" },
      503,
    );
  }

  /*
   * Verify that the request comes from an authenticated
   * staff session.
   */
  const jar = cookies();

  const userClient = createServerClient(url, anon, {
    cookies: {
      get(name) {
        return jar.get(name)?.value;
      },
      set() {},
      remove() {},
    },
  });

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  /*
   * Validate appointment ID.
   */
  let appointmentId: unknown;

  try {
    const body = await req.json();
    appointmentId = body.appointmentId;
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  if (
    typeof appointmentId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(
      appointmentId,
    )
  ) {
    return json(
      { error: "INVALID_APPOINTMENT_ID" },
      400,
    );
  }

  /*
   * Service-role client is used only after staff
   * authentication has been verified.
   */
  const db = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  /*
   * Only the staff member who actually performed
   * the transition to completed may trigger this email.
   */
  const { data: event, error: eventError } =
    await db
      .from("booking_events")
      .select("id")
      .eq("appointment_id", appointmentId)
      .eq("event_type", "status_changed")
      .eq("new_status", "completed")
      .eq("performed_by", user.id)
      .limit(1)
      .maybeSingle();

  if (eventError) {
    console.error(
      "[completion-email] event lookup failed:",
      eventError,
    );

    return json(
      { error: "EVENT_LOOKUP_FAILED" },
      500,
    );
  }

  if (!event) {
    return json({ error: "FORBIDDEN" }, 403);
  }

  /*
   * Read the authoritative appointment.
   */
const { data: appt, error: apptError } =
  await db
    .from("appointments")
    .select(
      "id, status, customer_id, customer_name, customer_email, branch_id, completion_email_sent_at, completion_email_claimed_at",
    )
    .eq("id", appointmentId)
    .single();
  if (
    apptError ||
    !appt ||
    appt.status !== "completed"
  ) {
    return json(
      { error: "NOT_COMPLETED" },
      409,
    );
  }

  /*
   * Appointment-level idempotency.
   */
  if (appt.completion_email_sent_at) {
    return json({
      sent: false,
      skipped: "ALREADY_SENT",
    });
  }

  if (!appt.customer_email) {
    return json({
      sent: false,
      skipped: "NO_EMAIL",
    });
  }

  /*
   * Claim the email before sending it.
   *
   * A claim becomes stale after 10 minutes so a server
   * crash does not permanently lock the appointment.
   */
  const stale = new Date(
    Date.now() - 10 * 60_000,
  ).toISOString();

  const claimTime = new Date().toISOString();

  if (
    appt.completion_email_claimed_at &&
    appt.completion_email_claimed_at > stale
  ) {
    return json({
      sent: false,
      skipped: "IN_PROGRESS",
    });
  }

  let claimQuery = db
    .from("appointments")
    .update({
      completion_email_claimed_at: claimTime,
    })
    .eq("id", appointmentId)
    .is("completion_email_sent_at", null);

  if (appt.completion_email_claimed_at) {
    claimQuery = claimQuery.eq(
      "completion_email_claimed_at",
      appt.completion_email_claimed_at,
    );
  } else {
    claimQuery = claimQuery.is(
      "completion_email_claimed_at",
      null,
    );
  }

  const {
    data: claimed,
    error: claimError,
  } = await claimQuery
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error(
      "[completion-email] claim failed:",
      claimError,
    );

    return json(
      { error: "CLAIM_FAILED" },
      500,
    );
  }

  if (!claimed) {
    return json({
      sent: false,
      skipped: "IN_PROGRESS_OR_SENT",
    });
  }

  try {
    /*
     * IMPORTANT:
     *
     * Loyalty progress is mentioned in the email ONLY
     * when THIS exact appointment received visit_earned.
     *
     * Therefore:
     *
     * Hair / Hair + Beard, first eligible visit today
     *   -> visit_earned -> show progress
     *
     * Another eligible booking on the same day
     *   -> no visit_earned -> no loyalty claim in email
     *
     * Beard / Cornrows / other non-eligible services
     *   -> no visit_earned -> no loyalty claim in email
     *
     * Fifth valid loyalty visit
     *   -> reward_earned -> free-cut email
     */
    let remaining: number | null = null;
    let unlocked = false;
    let earnedVisit = false;

    if (appt.customer_id) {
      const {
        data: programs,
        error: programsError,
      } = await db
        .from("loyalty_programs")
        .select(
          "id, visits_required, branch_id",
        )
        .eq("is_active", true);

      if (programsError) {
        throw programsError;
      }

      /*
       * Prefer a branch-specific program.
       * Fall back to the global program.
       */
      const program =
        (programs ?? []).find(
          (candidate) =>
            candidate.branch_id === appt.branch_id,
        ) ??
        (programs ?? []).find(
          (candidate) =>
            candidate.branch_id === null,
        );

      if (program) {
        /*
         * Check what THIS appointment actually earned.
         *
         * This is the key fix: we do not infer that an
         * appointment earned a point merely because the
         * customer has loyalty progress.
         */
        const {
          data: appointmentTransactions,
          error: transactionError,
        } = await db
          .from("loyalty_transactions")
          .select("id, type")
          .eq(
            "customer_id",
            appt.customer_id,
          )
          .eq(
            "loyalty_program_id",
            program.id,
          )
          .eq(
            "appointment_id",
            appointmentId,
          )
          .in("type", [
            "visit_earned",
            "reward_earned",
          ]);

        if (transactionError) {
          throw transactionError;
        }

        earnedVisit = (
          appointmentTransactions ?? []
        ).some(
          (transaction) =>
            transaction.type === "visit_earned",
        );

        unlocked = (
          appointmentTransactions ?? []
        ).some(
          (transaction) =>
            transaction.type === "reward_earned",
        );

        /*
         * Only fetch/show progress when this appointment
         * genuinely earned the daily loyalty point.
         */
        if (earnedVisit) {
          const {
            data: progress,
            error: progressError,
          } = await db
            .from(
              "customer_loyalty_progress",
            )
            .select(
              "visits_progress, visits_required",
            )
            .eq(
              "customer_id",
              appt.customer_id,
            )
            .eq(
              "loyalty_program_id",
              program.id,
            )
            .maybeSingle();

          if (progressError) {
            throw progressError;
          }

          if (
            progress &&
            progress.visits_required > 0
          ) {
            const mod =
              ((
                progress.visits_progress %
                  progress.visits_required
              ) +
                progress.visits_required) %
              progress.visits_required;

            /*
             * When the fifth visit unlocks the reward,
             * the reward message takes precedence anyway.
             *
             * For normal visits this gives:
             * 1/5 -> 4 remaining
             * 2/5 -> 3 remaining
             * 3/5 -> 2 remaining
             * 4/5 -> 1 remaining
             */
            remaining =
              mod === 0
                ? 0
                : progress.visits_required -
                  mod;
          }
        }
      }
    }

    /*
     * Avoid accidentally using a phone number as
     * the customer's display name.
     */
    const rawName = (
      appt.customer_name || ""
    ).trim();

    const looksLikePhone =
      /^\+?[\d\s()-]{7,}$/.test(rawName);

    const safeName =
      rawName && !looksLikePhone
        ? escapeHtml(rawName)
        : "";

    const intro =
      `ألف نعيمًا${
        safeName ? ` يا ${safeName}` : ""
      } 🤍 شرفتنا اليوم في Split Cuts، ` +
      "ونتمنى نشوفك قريب.";

    /*
     * Email state comes from the transactions created
     * for THIS appointment.
     */
    const message = unlocked
      ? "🎉 مبروك! الحلاقة الجاية علينا. " +
        "وصلت للمكافأة المجانية في Split Rewards. " +
        "احجز الوقت اللي يناسبك ونشوفك في Split Cuts."
      : earnedVisit && remaining !== null
        ? `تم إضافة نقطة Split Rewards ✦ باقي لك ${remaining} ${
            remaining === 1
              ? "حلاقة"
              : "حلاقات"
          } حتى تفتح الحلاقة المجانية.`
        : "يسعدنا نشوفك مرة ثانية قريبًا.";

    const subject = unlocked
      ? "🎉 مبروك! الحلاقة الجاية علينا | Split Cuts"
      : earnedVisit
        ? "نقطتك انضافت ✦ | Split Rewards"
        : "ألف نعيمًا 🤍 | Split Cuts";

    const html = `
      <div
        dir="rtl"
        style="
          background:#101113;
          color:#ffffff;
          font-family:Arial,sans-serif;
          font-size:16px;
          line-height:1.8;
          padding:36px;
          max-width:560px;
          margin:auto;
        "
      >
        <h1
          style="
            margin:0 0 28px;
            letter-spacing:2px;
            font-size:26px;
          "
        >
          SPLIT CUTS
        </h1>

        <p style="margin:0 0 20px;">
          ${intro}
        </p>

        <p
          style="
            margin:0 0 28px;
            font-size:20px;
            line-height:1.8;
          "
        >
          ${message}
        </p>

        <a
          href="https://splithairstudio.com"
          style="
            display:inline-block;
            padding:14px 22px;
            background:#ffffff;
            color:#111111;
            text-decoration:none;
            font-weight:bold;
          "
        >
          احجز موعدك القادم
        </a>
      </div>
    `;

    /*
     * Send through Resend.
     */
    const response = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [appt.customer_email],
          subject,
          html,
        }),
      },
    );

    if (!response.ok) {
      const responseBody = await response.text();

      throw new Error(
        `RESEND_${response.status}: ${responseBody.slice(
          0,
          250,
        )}`,
      );
    }

    /*
     * Record successful delivery so this appointment
     * cannot intentionally send another completion email.
     */
    const { error: markError } = await db
      .from("appointments")
      .update({
        completion_email_sent_at:
          new Date().toISOString(),
      })
      .eq("id", appointmentId)
      .eq(
        "completion_email_claimed_at",
        claimTime,
      );

    if (markError) {
      throw markError;
    }

    return json({
      sent: true,
      loyaltyVisitEarned: earnedVisit,
      rewardUnlocked: unlocked,
      remaining,
    });
  } catch (err) {
    /*
     * Do not automatically release/retry the claim here.
     *
     * Resend may have successfully accepted the email
     * even if recording completion_email_sent_at failed.
     * Blind retrying could therefore duplicate an email.
     */
    console.error(
      "[completion-email]",
      err,
    );

    return json(
      {
        error: "SEND_OR_RECORD_FAILED",
        note:
          "Check Resend logs before retrying",
      },
      502,
    );
  }
}