// app/api/appointments/route.ts
// Route Handler wrapping public.create_appointment().
// Guest bookings are supported, so customer_id may intentionally be null.

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

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_BODY",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const {
    barberId,
    serviceId,
    appointmentDate,
    appointmentTime,
    customerName,
    customerPhone,
    customerEmail,
    notes,
  } = parsed.data;

  /*
   * Guest bookings are intentionally supported.
   *
   * The live database accepts NULL customer_id for guest appointments.
   * Supabase's generated RPC type currently exposes p_customer_id as string,
   * so we narrow the type assertion to this argument only rather than
   * weakening the entire RPC call with `any`.
   */
  const customerId = (user?.id ?? null) as unknown as string;

  const { data, error } = await supabase.rpc("create_appointment", {
    p_customer_id: customerId,
    p_barber_id: barberId,
    p_service_id: serviceId,
    p_appointment_date: appointmentDate,
    p_appointment_time: appointmentTime,
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_customer_email: customerEmail,
    p_notes: notes,
  });

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      appointment: data,
    },
    { status: 201 },
  );
}