// app/api/appointments/route.ts
// Example Route Handler wrapping public.create_appointment(). Useful for
// server-to-server callers (a future public API, a partner integration)
// that shouldn't talk to Supabase directly. Browser clients can call the
// RPC straight from lib/supabase/client.ts — this route adds no extra
// security since the RPC itself already enforces everything through RLS.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  barberId: z.string().uuid(),
  serviceId: z.string().uuid(),
  appointmentDate: z.string(), // "YYYY-MM-DD"
  appointmentTime: z.string(), // "HH:MM" or "HH:MM:SS", local branch time
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(50).optional(),
  customerEmail: z.string().email().optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY", details: parsed.error.flatten() }, { status: 400 });
  }

  const { barberId, serviceId, appointmentDate, appointmentTime, customerName, customerPhone, customerEmail, notes } =
    parsed.data;

  // user may be null -- guest bookings are a normal, supported path (the
  // live appointments table already has 154 guest rows with customer_id null).
  const { data, error } = await supabase.rpc("create_appointment", {
    p_customer_id: user?.id ?? null,
    p_barber_id: barberId,
    p_service_id: serviceId,
    p_appointment_date: appointmentDate,
    p_appointment_time: appointmentTime,
    p_customer_name: customerName ?? null,
    p_customer_phone: customerPhone ?? null,
    p_customer_email: customerEmail ?? null,
    p_notes: notes ?? null,
  });

  if (error) {
    // error.message carries the RPC's errcode P0001 label, e.g. SLOT_ALREADY_BOOKED
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ appointment: data }, { status: 201 });
}
