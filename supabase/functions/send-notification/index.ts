// supabase/functions/send-notification/index.ts
//
// Edge Function that sends outbound WhatsApp/SMS confirmations. It is meant
// to be invoked from a Postgres webhook (Database Webhooks, configured in
// the Supabase dashboard or via a migration using `supabase_functions.http_request`)
// on INSERT into public.appointments, or called directly from a server action.
//
// Third-party secrets (WhatsApp Business API token, Twilio auth token, etc.)
// live ONLY in this function's environment (`supabase secrets set ...`) and
// are never exposed to the browser.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface AppointmentNotificationPayload {
  appointment_id: string;
  channel?: "whatsapp" | "sms";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: AppointmentNotificationPayload = await req.json();

    if (!payload.appointment_id) {
      return new Response(JSON.stringify({ error: "appointment_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client: this function runs server-side only, so it is the
    // one place allowed to use the service role key.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // customer_name/phone/email are stored directly on the row (guest
    // bookings never had a customers/profiles record to join to), so no
    // join is required to reach them. barbers/services/branches are still
    // joined for the message copy.
    const { data: appointment, error } = await supabase
      .from("appointments")
      .select(
        "id, appointment_start, status, customer_name, customer_phone, customer_email, barber:barbers!inner(name), service:services!inner(name_en), branch:branches!inner(name)",
      )
      .eq("id", payload.appointment_id)
      .single();

    if (error || !appointment) {
      return new Response(JSON.stringify({ error: error?.message ?? "appointment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TODO: replace with a real WhatsApp Business API / Twilio SMS call.
    // const providerToken = Deno.env.get("WHATSAPP_TOKEN");
    // await fetch("https://graph.facebook.com/v19.0/.../messages", { ... });

    console.log("Would send appointment confirmation:", {
      to: appointment.customer_phone,
      appointment_id: appointment.id,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
