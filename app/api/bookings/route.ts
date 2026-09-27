// app/api/bookings/route.ts
// Example Route Handler wrapping public.create_booking(). Useful for
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
  startsAt: z.string().datetime(),
  notes: z.string().max(500).optional(),
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

  const { barberId, serviceId, startsAt, notes } = parsed.data;

  const { data, error } = await supabase.rpc("create_booking", {
    p_customer_id: user.id,
    p_barber_id: barberId,
    p_service_id: serviceId,
    p_starts_at: startsAt,
    p_notes: notes ?? null,
  });

  if (error) {
    // error.message carries the RPC's errcode P0001 label, e.g. SLOT_ALREADY_BOOKED
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ booking: data }, { status: 201 });
}
