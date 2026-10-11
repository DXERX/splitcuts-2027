"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { DateQuickPicker } from "@/components/booking/DateQuickPicker";
import { BookingError } from "@/components/booking/BookingError";
import { BookingSuccess } from "@/components/book/BookingSuccess";
import { TimeSlots } from "@/components/book/TimeSlots";
import { FIRST_AVAILABLE } from "@/components/book/BarberStep";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { chargedPrice, offerFor, useActiveOffers } from "@/lib/offers";
import type { DictKey } from "@/lib/i18n/dictionaries/en";
import { categorize, SERVICE_CATEGORIES, type ServiceCategory } from "@/lib/serviceCategories";
import { isTamaraEligible, tamaraChargeTotal } from "@/lib/payments/tamaraEligibility";
import { TamaraInstallmentWidget } from "@/components/ui/TamaraInstallmentWidget";
import { isValidSaudiPhone, toE164Saudi } from "@/lib/phone";
import { isValidEmail } from "@/lib/email";
import {
  FALLBACK_HOURS,
  formatSlotLabel,
  generateSlots,
  isSlotInPast,
  slotFitsFreely,
  toHHMM,
  extendedMinutes,
  todayDateString,
  type BusinessHours,
} from "@/lib/timeSlots";
import type { Database } from "@/lib/database.types";

type Barber = Database["public"]["Tables"]["barbers"]["Row"];
type Service = Database["public"]["Tables"]["services"]["Row"];

type Stage = "service" | "barber" | "when" | "phone" | "submitting" | "success" | "error";

const BOOKING_ERROR_MESSAGES: Record<string, string> = {
  BARBER_NOT_BOOKABLE: "That barber isn't taking bookings right now.",
  SERVICE_NOT_AVAILABLE_AT_BRANCH: "That service isn't available at this branch.",
  OUTSIDE_BUSINESS_HOURS: "That time is outside our business hours.",
  START_TIME_IN_PAST: "Please choose a time in the future.",
  CUSTOMER_BLOCKED_NO_SHOW: "Online booking is unavailable for this account after two missed appointments — call the shop to book.",
  CUSTOMER_ALREADY_BOOKED: "You already have a booking at that time. Pick another slot.",
  PACKAGE_NOT_REDEEMABLE: "That package isn't active on this account.",
  PACKAGE_EXPIRED: "That package has expired.",
  PACKAGE_SESSIONS_USED_UP: "That package's cuts are already used up.",
  PACKAGE_SERVICE_MISMATCH: "That package doesn't cover this service.",
  BARBER_UNAVAILABLE: "That barber is off that day -- pick another barber or date.",
  SERVICE_REQUIRED: "Choose a service first.",
  TOO_MANY_SERVICES: "Four services is the most one sitting can hold.",
};

interface ActivePackage {
  id: string;
  serviceId: string;
  sessionsUsed: number;
  sessionsTotal: number;
}

/**
 * One continuous interactive form -- not a five-page wizard. Answered steps
 * collapse to a single checked line ("01 / HAIRCUT / 30 SAR ✓"); only the
 * current question is expanded. Sensible defaults throughout (today, first
 * available) so most people tap three or four times and they're booked.
 *
 * Service step is multi-select -- a customer can combine services in one
 * sitting (e.g. haircut + hair art). Each selected service becomes its own
 * appointment row back-to-back in time for the same barber (no schema
 * change needed for that); if a later one in the chain fails, the ones
 * already created are auto-cancelled so a combined booking never leaves a
 * half-booked slot behind.
 */
export function BookingFlow({
  barbers,
  services,
  initialServiceId,
  initialBarberId,
}: {
  barbers: Barber[];
  services: Service[];
  initialServiceId?: string | null;
  initialBarberId?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { t, locale } = useLanguage();

  const validInitialService =
    initialServiceId && services.some((s) => s.id === initialServiceId) ? initialServiceId : null;
  const validInitialBarber =
    initialBarberId && barbers.some((b) => b.id === initialBarberId) ? initialBarberId : null;

  const [serviceIds, setServiceIds] = useState<string[]>(validInitialService ? [validInitialService] : []);
  const [barberId, setBarberId] = useState(validInitialBarber ?? FIRST_AVAILABLE);
  const [date, setDate] = useState(todayDateString());
  const [time, setTime] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [hours, setHours] = useState<BusinessHours>(FALLBACK_HOURS);
  const [dayBusy, setDayBusy] = useState<Record<string, { start: string; duration: number }[]>>({});
  const [stage, setStage] = useState<Stage>(validInitialService ? "barber" : "service");
  const [errorTime, setErrorTime] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [createdAppointmentIds, setCreatedAppointmentIds] = useState<string[]>([]);
  const [activePackage, setActivePackage] = useState<ActivePackage | null>(null);
  const [usePackageRedemption, setUsePackageRedemption] = useState(false);
  const [noShowCount, setNoShowCount] = useState(0);
  const [myBusy, setMyBusy] = useState<{ start: string; duration: number }[]>([]);
  // Barbers with a staff-set day off (vacation/sick) on the selected date --
  // excluded from FIRST AVAILABLE and shown as fully unavailable if picked
  // directly. See lib/database.types.ts's hand-added barber_time_off entry.
  const [offBarberIds, setOffBarberIds] = useState<Set<string>>(new Set());
  const [emailStatus, setEmailStatus] = useState<"sent" | "missing" | "failed" | null>(null);

  useEffect(() => {
    void (async () => {
      const [{ data: userData }, { data: hoursRow }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("site_settings").select("value").eq("key", "business_hours").maybeSingle(),
      ]);

      const value = hoursRow?.value as Partial<BusinessHours> | null | undefined;
      if (value?.default_start && value?.default_end) {
        setHours({ default_start: value.default_start, default_end: value.default_end });
      }

      const user = userData?.user ?? null;
      if (user) {
        setCustomerId(user.id);
        setEmail(user.email ?? "");
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", user.id)
          .single();
        setName(profile?.full_name ?? "");
        setPhone(profile?.phone ?? "");

        const [{ count }, { data: strikes, error: strikeError }] = await Promise.all([
          supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("customer_id", user.id)
            .eq("status", "no_show"),
          supabase.rpc("my_no_show_strikes"),
        ]);
        setNoShowCount(!strikeError && strikes != null ? Number(strikes) : (count ?? 0));

        // A signed-in customer may hold an active, unexpired package (e.g.
        // the Student Package) -- if so, offer to redeem a session from it
        // instead of paying, once they've picked the matching service.
        const { data: pkgRow } = await supabase
          .from("customer_packages")
          .select("id, sessions_used, sessions_total, expires_at, packages:packages(service_id)")
          .eq("customer_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (
          pkgRow &&
          pkgRow.sessions_used < pkgRow.sessions_total &&
          (!pkgRow.expires_at || new Date(pkgRow.expires_at) > new Date())
        ) {
          const serviceId = Array.isArray(pkgRow.packages) ? pkgRow.packages[0]?.service_id : pkgRow.packages?.service_id;
          if (serviceId) {
            setActivePackage({
              id: pkgRow.id,
              serviceId,
              sessionsUsed: pkgRow.sessions_used,
              sessionsTotal: pkgRow.sessions_total,
            });
          }
        }
      }
    })();
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      const [{ data }, { data: offRows }] = await Promise.all([
        supabase
          .from("appointments")
          .select("barber_id, appointment_time, services:services(duration)")
          .eq("appointment_date", date)
          .not("status", "in", "(cancelled,no_show)"),
        supabase.from("barber_time_off").select("barber_id").eq("off_date", date),
      ]);
      setOffBarberIds(new Set((offRows ?? []).map((r) => r.barber_id)));

      type Row = {
        barber_id: string;
        appointment_time: string | null;
        services: { duration: number | null } | { duration: number | null }[] | null;
      };

      const map: Record<string, { start: string; duration: number }[]> = {};
      for (const row of (data ?? []) as Row[]) {
        const t = row.appointment_time?.slice(0, 5);
        if (!t) continue;
        const svc = Array.isArray(row.services) ? row.services[0] : row.services;
        (map[row.barber_id] ??= []).push({ start: t, duration: svc?.duration ?? 30 });
      }
      setDayBusy(map);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: mineRows } = await supabase
          .from("appointments")
          .select("appointment_time, services:services(duration)")
          .eq("appointment_date", date)
          .eq("customer_id", user.id)
          .not("status", "in", "(cancelled,no_show)");
        setMyBusy(
          (mineRows ?? []).flatMap((row: { appointment_time: string | null; services: { duration: number | null } | { duration: number | null }[] | null }) => {
            const t = row.appointment_time?.slice(0, 5);
            if (!t) return [];
            const svc = Array.isArray(row.services) ? row.services[0] : row.services;
            return [{ start: t, duration: svc?.duration ?? 30 }];
          }),
        );
      } else {
        setMyBusy([]);
      }
    })();
  }, [supabase, date]);

  const selectedServices = useMemo(
    () => serviceIds.map((id) => services.find((s) => s.id === id)).filter((s): s is Service => Boolean(s)),
    [serviceIds, services],
  );
  const servicesByCategory = useMemo(() => {
    const groups: Partial<Record<ServiceCategory, Service[]>> = {};
    for (const service of services) {
      const name = (service.name_en ?? "").trim();
      const category =
        (name === "Hair" || name === "Hair + Beard") &&
        (!service.category || service.category.toUpperCase() === "CUTS")
          ? "CUTS"
          : categorize(service);
      (groups[category] ??= []).push(service);
    }
    return groups;
  }, [services]);
  function serviceLabel(service: Service): string {
    return locale === "ar" ? service.name_ar || service.name_en || "" : service.name_en || service.name_ar || "";
  }
  const offers = useActiveOffers();
  const totalPrice = selectedServices.reduce(
    (sum, service) => sum + chargedPrice(service.price, offerFor(offers, service.id)),
    0,
  );
  const totalDuration = selectedServices.reduce((sum, s) => sum + (s.duration ?? 30), 0) || 30;
  const tamaraEligible = isTamaraEligible(totalPrice);
  const selectedBarber = barbers.find((b) => b.id === barberId) ?? null;
  // Normalized once here -- both the appointment write in submit() and the
  // summary handed to BookingSuccess (for a later Tamara payment) need to
  // agree on one phone format, or a guest's own number won't match itself.
  const normalizedPhone = phone ? toE164Saudi(phone) : "";
  const packageEligible =
    activePackage !== null && selectedServices.length === 1 && selectedServices[0]?.id === activePackage.serviceId;

  function toggleService(id: string) {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const allSlots = useMemo(() => generateSlots(hours, 30), [hours]);

  const slotStates = useMemo(() => {
    const isToday = date === todayDateString();
    return allSlots.map((t) => {
      const past = isToday && isSlotInPast(date, t, hours);
      const customerClash = !slotFitsFreely(t, totalDuration, myBusy, hours);
      const barberFree =
        barberId === FIRST_AVAILABLE
          ? barbers.some((b) => !offBarberIds.has(b.id) && slotFitsFreely(t, totalDuration, dayBusy[b.id] ?? [], hours))
          : !offBarberIds.has(barberId) && slotFitsFreely(t, totalDuration, dayBusy[barberId] ?? [], hours);
      return { time: t, available: !past && !customerClash && barberFree };
    });
  }, [allSlots, date, hours, barberId, barbers, dayBusy, totalDuration, myBusy, offBarberIds]);

  const selectedBarberOffToday = barberId !== FIRST_AVAILABLE && offBarberIds.has(barberId);

  function resolveBarberId(atTime: string): string {
    if (barberId !== FIRST_AVAILABLE) return barberId;
    const free = barbers.find(
      (b) => !offBarberIds.has(b.id) && slotFitsFreely(atTime, totalDuration, dayBusy[b.id] ?? [], hours),
    );
    return free?.id ?? barbers[0]?.id ?? "";
  }

  function explainBookingError(message: string): string {
    const code = Object.keys(BOOKING_ERROR_MESSAGES).find((key) => message.includes(key));
    return (code && BOOKING_ERROR_MESSAGES[code]) || message;
  }

  async function bookSitting(resolvedBarberId: string, bookingTime: string): Promise<string[]> {
    const trimmedName = name.trim();
    const displayName = trimmedName && !/^\+?[\d\s()-]{7,}$/.test(trimmedName) ? trimmedName : "Guest";
    const details = {
      p_customer_id: customerId,
      p_barber_id: resolvedBarberId,
      p_appointment_date: date,
      p_customer_name: displayName,
      p_customer_phone: normalizedPhone || null,
      p_customer_email: email.trim() || null,
      p_notes: selectedServices.length > 1 ? "Combined visit" : null,
      p_customer_package_id: usePackageRedemption && packageEligible ? activePackage!.id : null,
    };

    const visit = await supabase.rpc("create_visit", {
      ...details,
      p_service_ids: selectedServices.map((service) => service.id),
      p_appointment_time: `${bookingTime}:00`,
    });

    const missingVisit =
      visit.error?.code === "PGRST202" ||
      /could not find the function/i.test(visit.error?.message ?? "") ||
      /schema cache/i.test(visit.error?.message ?? "");

    if (!visit.error) {
      return (visit.data ?? []).map((row) => row.id);
    }
    if (!missingVisit) {
      throw new Error(visit.error.message);
    }

    const createdIds: string[] = [];
    let cursor = extendedMinutes(bookingTime, hours);
    try {
      for (const svc of selectedServices) {
        const slotStr = toHHMM(cursor);
        const { data, error } = await supabase.rpc("create_appointment", {
          ...details,
          p_service_id: svc.id,
          p_appointment_time: `${slotStr}:00`,
        });
        if (error) throw new Error(error.message);
        if (data?.id) createdIds.push(data.id);
        cursor += svc.duration ?? 30;
      }
    } catch (error) {
      if (createdIds.length > 0) {
        await Promise.all(
          createdIds.map((id) =>
            supabase.rpc("update_appointment_status", {
              p_appointment_id: id,
              p_new_status: "cancelled",
              p_reason: "Auto-cancelled: combined booking failed partway",
            }),
          ),
        );
      }
      throw error;
    }
    return createdIds;
  }

  async function submit(atTime?: string) {
    const bookingTime = atTime ?? time;
    setSubmitError(null);
    if (!customerId) {
      if (!phone || !isValidSaudiPhone(phone)) {
        setSubmitError(t("booking.phoneRequired"));
        return;
      }
      if (!email || !isValidEmail(email)) {
        setSubmitError(t("booking.emailRequired"));
        return;
      }
    }
    if (noShowCount >= 2) {
      setSubmitError(BOOKING_ERROR_MESSAGES.CUSTOMER_BLOCKED_NO_SHOW!);
      setStage("phone");
      return;
    }
    if (selectedServices.length === 0 || !date || !bookingTime) return;

    const resolvedBarberId = resolveBarberId(bookingTime);
    if (!resolvedBarberId) return;

    setTime(bookingTime);
    setStage("submitting");

    let createdIds: string[] = [];
    try {
      createdIds = await bookSitting(resolvedBarberId, bookingTime);
    } catch (error) {
      const message = error instanceof Error ? error.message : "BOOKING_FAILED";
      if (message.includes("SLOT_ALREADY_BOOKED")) {
        setErrorTime(bookingTime);
        setStage("error");
        return;
      }
      setSubmitError(explainBookingError(message));
      setStage(customerId ? "when" : "phone");
      return;
    }

    setBarberId(resolvedBarberId);
    setBookingId(createdIds[0] ?? crypto.randomUUID());
    setCreatedAppointmentIds(createdIds);

    const firstId = createdIds[0];
    if (!firstId) {
      setEmailStatus("failed");
      setStage("success");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch("/api/bookings/send-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: firstId }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as { sent?: boolean; skipped?: string } | null;
      if (body?.sent) setEmailStatus("sent");
      else if (body?.skipped === "NO_EMAIL_ON_FILE") setEmailStatus("missing");
      else setEmailStatus("failed");
    } catch {
      setEmailStatus("failed");
    } finally {
      window.clearTimeout(timer);
    }
    setStage("success");
  }

  if (stage === "success" && selectedServices.length > 0) {
    return (
      <BookingSuccess
        summary={{
          serviceName: selectedServices.map((service) => serviceLabel(service)).join(" + "),
          barberName: selectedBarber?.name || selectedBarber?.nickname || "Your barber",
          date,
          time,
          hours,
          bookingId: bookingId ?? "",
          appointmentIds: createdAppointmentIds,
          totalPrice,
          phone: normalizedPhone,
          name,
          email,
          emailStatus,
          durationMinutes: totalDuration,
        }}
      />
    );
  }

  const stepIndex = stage === "service" ? 0 : stage === "barber" ? 1 : stage === "when" ? 2 : 3;
  const stepLabels = customerId
    ? [t("booking.service"), t("booking.barber"), t("booking.when")]
    : [t("booking.service"), t("booking.barber"), t("booking.when"), t("booking.details")];

  return (
    <div className="mx-auto w-full max-w-2xl pb-28 md:pb-0">
      <ol className="mb-6 flex gap-2">
        {stepLabels.map((label, index) => (
          <li
            key={label}
            className={clsx(
              "min-w-0 flex-1 border-t-2 pt-2 font-sans text-[10px] font-semibold uppercase tracking-widest",
              index <= stepIndex ? "border-paper text-paper" : "border-ink-800 text-ink-600",
            )}
          >
            {String(index + 1).padStart(2, "0")} {label}
          </li>
        ))}
      </ol>
      {noShowCount >= 2 && (
        <div className="mb-6 border border-red-400 bg-red-500/10 px-5 py-4">
          <p className="font-display text-lg uppercase text-red-400">Banned from online booking</p>
          <p className="mt-1 font-sans text-sm text-ink-200">
            Two missed appointments without cancelling. Call the shop to book.
          </p>
        </div>
      )}
      {noShowCount === 1 && (
        <div className="mb-6 border border-status-hold bg-status-hold/10 px-5 py-4">
          <p className="font-display text-lg uppercase text-status-hold">One no-show on file</p>
          <p className="mt-1 font-sans text-sm text-ink-200">
            Miss one more without cancelling and this number is banned.
          </p>
        </div>
      )}
      {/* 01 -- SERVICE(S) -- multi-select */}
      {stage === "service" ? (
        <FlowStep index="01" label={t("booking.iWant")}>
          <div className="flex flex-col gap-6">
            {SERVICE_CATEGORIES.map((category) => {
              const rows = servicesByCategory[category];
              if (!rows?.length) return null;
              return (
                <div key={category}>
                  <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-widest text-ink-400">
                    {t(`category.${category}` as DictKey)}
                  </p>
                  <div className="flex flex-col gap-2">
                    {rows.map((service) => {
                      const active = serviceIds.includes(service.id);
                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => toggleService(service.id)}
                          className={clsx(
                            "flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-300 ease-editorial sm:px-6 sm:py-4",
                            active ? "bg-paper text-ink" : "hairline text-paper hover:border-ink-400",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              className={clsx(
                                "flex h-5 w-5 shrink-0 items-center justify-center border font-sans text-[10px] font-bold",
                                active ? "border-ink bg-ink text-paper" : "border-ink-600",
                              )}
                            >
                              {active ? "✓" : ""}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-display text-base uppercase sm:text-lg">
                                {serviceLabel(service)}
                              </span>
                              <span className={clsx("mt-0.5 block font-sans text-[10px] font-semibold tracking-widest", active ? "text-ink/60" : "text-ink-400")}>
                                {t("booking.min", { minutes: service.duration ?? 30 })}
                              </span>
                            </span>
                          </span>
                          <span className="shrink-0 text-right font-sans text-sm font-semibold">
                            {(() => {
                              const offer = offerFor(offers, service.id);
                              if (!offer) return `${service.price} SAR`;
                              return (
                                <>
                                  <span className="mr-2 text-xs text-ink-400 line-through">{service.price}</span>
                                  {offer.offer_price} SAR
                                  <span className="mt-0.5 block text-[10px] font-semibold tracking-widest">{offer.name}</span>
                                </>
                              );
                            })()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {selectedServices.length > 0 && (
            <div className="mt-6 space-y-3">
              {packageEligible && activePackage && (
                <label className="hairline flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={usePackageRedemption}
                    onChange={(e) => setUsePackageRedemption(e.target.checked)}
                  />
                  <span className="font-sans text-sm text-paper">
                    {t("booking.usePackage", { remaining: activePackage.sessionsTotal - activePackage.sessionsUsed })}
                  </span>
                </label>
              )}
              {tamaraEligible && !(usePackageRedemption && packageEligible) && (
                <TamaraInstallmentWidget amount={tamaraChargeTotal(totalPrice)} />
              )}
              <div className="fixed inset-x-0 z-30 flex items-center justify-between gap-3 border-t border-ink-800 bg-ink/95 px-4 py-3 backdrop-blur md:static md:mt-0 md:border-0 md:bg-transparent md:p-0" style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}>
                <span className="font-sans text-sm text-ink-200">
                  {t("booking.selected", { count: selectedServices.length })}
                  {" · "}
                  {usePackageRedemption && packageEligible ? t("booking.freePackage") : t("booking.total", { price: totalPrice })}
                </span>
                <Button variant="primary" size="lg" className="shrink-0" onClick={() => setStage("barber")}>
                  {t("booking.continue")}
                </Button>
              </div>
            </div>
          )}
        </FlowStep>
      ) : (
        selectedServices.length > 0 && (
          <StepRow
            index="01"
            label={`${selectedServices.map((service) => serviceLabel(service)).join(" + ")} / ${totalPrice} SAR`}
            onEdit={() => setStage("service")}
          />
        )
      )}

      {/* 02 -- BARBER */}
      {stage === "barber" && (
        <FlowStep index="02" label={t("booking.whosCutting")}>
          <div className="flex flex-col gap-2">
            <RadioRow
              label={t("booking.firstAvailable")}
              active={barberId === FIRST_AVAILABLE}
              onClick={() => setBarberId(FIRST_AVAILABLE)}
            />
            {barbers.map((b) => (
              <RadioRow
                key={b.id}
                label={b.name || b.nickname || "Barber"}
                active={barberId === b.id}
                onClick={() => setBarberId(b.id)}
              />
            ))}
          </div>
          <Button variant="primary" size="lg" className="mt-6 w-full sm:w-auto" onClick={() => setStage("when")}>
            {t("booking.continue")}
          </Button>
        </FlowStep>
      )}
      {stage !== "service" && stage !== "barber" && (
        <StepRow
          index="02"
          label={barberId === FIRST_AVAILABLE ? t("booking.firstAvailable") : selectedBarber?.name || selectedBarber?.nickname || "—"}
          onEdit={() => setStage("barber")}
        />
      )}

      {/* 03 -- WHEN */}
      {stage === "when" && (
        <FlowStep index="03" label={t("booking.whenQuestion")}>
          <div className="mb-6">
            <DateQuickPicker selected={date} onSelect={setDate} />
          </div>
          {selectedBarberOffToday ? (
            <p className="mb-4 font-sans text-sm text-red-400">
              {t("booking.barberOff", { name: selectedBarber?.name || selectedBarber?.nickname || "" })}
            </p>
          ) : (
            <p className="mb-4 font-sans text-sm text-ink-400">
              {t("booking.every30")}
              {" · "}
              {barberId === FIRST_AVAILABLE
                ? t("booking.firstFree")
                : t("booking.onlyBarber", { name: selectedBarber?.name || selectedBarber?.nickname || "" })}
            </p>
          )}
          <TimeSlots
            slots={slotStates}
            selected={time}
            onSelect={(slot) => {
              setTime(slot);
              if (noShowCount >= 2) return;
              if (customerId) {
                void submit(slot);
              } else {
                setStage("phone");
              }
            }}
          />
        </FlowStep>
      )}
      {(stage === "phone" || stage === "submitting" || stage === "error") && (
        <StepRow
          index="03"
          label={`${date === todayDateString() ? "TODAY" : date}, ${formatSlotLabel(time)}`}
          onEdit={() => setStage("when")}
        />
      )}

      {/* 04 -- PHONE + EMAIL (skipped entirely for signed-in customers) */}
      {stage === "phone" && (
        <FlowStep index="04" label={t("booking.yourDetails")}>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("booking.phonePlaceholder")}
            className="hairline w-full bg-transparent px-4 py-4 font-sans text-base text-paper outline-none placeholder:text-ink-600 focus:border-ink-400"
          />
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("booking.emailPlaceholder")}
            className="hairline mt-3 w-full bg-transparent px-4 py-4 font-sans text-base text-paper outline-none placeholder:text-ink-600 focus:border-ink-400"
          />
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("booking.namePlaceholder")}
            className="hairline mt-3 w-full bg-transparent px-4 py-4 font-sans text-base text-paper outline-none placeholder:text-ink-600 focus:border-ink-400"
          />
          {submitError && <p className="mt-3 font-sans text-sm text-red-400">{submitError}</p>}
          <Button variant="primary" size="lg" className="mt-6 w-full" onClick={() => void submit()}>
            {t("booking.confirm")}
          </Button>
        </FlowStep>
      )}

      {stage === "submitting" && (
        <p className="mt-6 font-sans text-sm text-ink-400">{t("booking.locking")}</p>
      )}

      {stage === "error" && errorTime && (
        <div className="mt-6">
          <BookingError
            time={errorTime}
            onDismiss={() => {
              setTime("");
              setErrorTime(null);
              setStage("when");
            }}
          />
        </div>
      )}
    </div>
  );
}

function FlowStep({ index, label, children }: { index: string; label: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="mb-6"
    >
      <span className="tag-number text-ink-600">
        {index} / {label}
      </span>
      <div className="mt-4">{children}</div>
    </motion.div>
  );
}

function StepRow({ index, label, onEdit }: { index: string; label: string; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="mb-3 flex w-full items-center justify-between border-b border-ink-800 py-3 text-left"
    >
      <span className="font-sans text-sm tracking-wide text-ink-200">
        {index} / {label.toUpperCase()}
      </span>
      <span className="font-sans text-sm text-paper">✓</span>
    </button>
  );
}

function RadioRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "hairline flex min-h-14 w-full items-center gap-3 px-4 py-4 text-left transition-colors duration-300 ease-editorial sm:px-6",
        active ? "border-paper" : "hover:border-ink-400",
      )}
    >
      <span
        className={clsx(
          "h-3 w-3 shrink-0 rounded-full border",
          active ? "border-paper bg-paper" : "border-ink-600",
        )}
      />
      <span className="font-display text-lg uppercase text-paper">{label}</span>
    </button>
  );
}
