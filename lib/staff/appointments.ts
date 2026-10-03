import type { Database } from "@/lib/database.types";

export type Appointment =
  Database["public"]["Tables"]["appointments"]["Row"];

export type Barber =
  Database["public"]["Tables"]["barbers"]["Row"];

export type Service =
  Database["public"]["Tables"]["services"]["Row"];

/**
 * Derive appointment status directly from the appointments table.
 * This keeps the type synchronized with the generated Supabase types.
 */
export type AppointmentStatus = Appointment["status"];

export interface LiveAppointment extends Appointment {
  barber_name: string | null;
  service_name: string | null;
  duration: number;
}

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: "BOOKED",
  checked_in: "CHECKED IN",
  in_service: "IN SERVICE",
  completed: "DONE",
  cancelled: "CANCELLED",
  no_show: "NO SHOW",
};

export const STATUS_STYLE: Record<AppointmentStatus, string> = {
  booked: "text-paper",
  checked_in: "text-status-hold",
  in_service: "text-status-live",
  completed: "text-ink-400",
  cancelled: "text-ink-600",
  no_show: "text-red-400",
};

export function hydrateAppointments(
  rows: Appointment[],
  barbers: Barber[],
  services: Service[],
): LiveAppointment[] {
  const barberMap = new Map(
    barbers.map((barber) => [barber.id, barber]),
  );

  const serviceMap = new Map(
    services.map((service) => [service.id, service]),
  );

  return rows.map((appointment) => {
    const barber = appointment.barber_id
      ? barberMap.get(appointment.barber_id)
      : undefined;

    const service = appointment.service_id
      ? serviceMap.get(appointment.service_id)
      : undefined;

    return {
      ...appointment,
      barber_name:
        barber?.name ||
        barber?.nickname ||
        null,
      service_name:
        service?.name_en ||
        service?.name_ar ||
        null,
      duration: service?.duration ?? 30,
    };
  });
}

export function mergeLiveAppointment(
  prev: LiveAppointment[],
  incoming: Appointment,
  barbers: Barber[],
  services: Service[],
): LiveAppointment[] {
  const hydrated = hydrateAppointments(
    [incoming],
    barbers,
    services,
  )[0];

  if (!hydrated) {
    return prev;
  }

  const exists = prev.some(
    (appointment) => appointment.id === incoming.id,
  );

  if (exists) {
    return prev.map((appointment) =>
      appointment.id === incoming.id
        ? {
            ...appointment,
            ...hydrated,
          }
        : appointment,
    );
  }

  return [...prev, hydrated].sort((a, b) =>
    (a.appointment_time ?? "").localeCompare(
      b.appointment_time ?? "",
    ),
  );
}