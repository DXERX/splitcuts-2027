// app/api/bookings/route.ts
// Server-side entry point for creating an appointment through the same RPC
// used by the booking flow. Times are branch-local, matching the live schema.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  barberId: z.string().uuid(),
  serviceId: z.string().uuid(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointmentTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/),
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(50).optional(),
  customerEmail: z.string().email().optional(),
  notes: z.string().max(500).optional(),
  customerPackageId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY", details: parsed.error.flatten() }, { status: 400 });
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
    customerPackageId,
  } = parsed.data;

  const { data, error } = await supabase.rpc("create_appointment", {
    p_customer_id: user.id,
    p_barber_id: barberId,
    p_service_id: serviceId,
    p_appointment_date: appointmentDate,
    p_appointment_time: appointmentTime,
    p_customer_name: customerName ?? null,
    p_customer_phone: customerPhone ?? null,
    p_customer_email: customerEmail ?? null,
    p_notes: notes ?? null,
    p_customer_package_id: customerPackageId ?? null,
  });

  if (error) {
    // The RPC returns validation failures such as SLOT_ALREADY_BOOKED.
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ appointment: data }, { status: 201 });
}
