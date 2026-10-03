"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import {
  AnimatePresence,
  motion,
} from "framer-motion";

import { StaffShell } from "@/components/staff/StaffShell";
import { FloorBoard } from "@/components/staff/FloorBoard";
import { useShopSession } from "@/lib/staff/useShopSession";
import { shopAudio } from "@/lib/audio/shopAudio";
import { useBranchChannel } from "@/lib/realtime/useBookingChannel";

import {
  STATUS_LABEL,
  STATUS_STYLE,
} from "@/lib/staff/appointments";

import {
  formatSlotLabel,
  slotTime,
} from "@/lib/timeSlots";

interface PendingPackageRequest {
  id: string;
  requested_at: string;
  customer_name: string | null;
  package_name: string | null;
}

const PAGE_RELOAD_INTERVAL_MS = 600_000;

const AUDIO_ENABLED_KEY =
  "splitcuts_staff_audio_enabled";

const CASHIER_BOOKING_IDS_KEY =
  "splitcuts_cashier_booking_ids";

const CASHIER_SCROLL_POSITION_KEY =
  "splitcuts_cashier_scroll_position";

function useClock() {
  const [now, setNow] =
    useState<Date | null>(null);

  useEffect(() => {
    const updateClock = () => {
      setNow(new Date());
    };

    updateClock();

    const id = window.setInterval(
      updateClock,
      1000,
    );

    return () => {
      window.clearInterval(id);
    };
  }, []);

  return now;
}

export default function CashierShopModePage() {
  const shop = useShopSession();
  const clock = useClock();

  const [
    audioEnabled,
    setAudioEnabled,
  ] = useState(false);

  const [
    feedId,
    setFeedId,
  ] = useState<string | null>(null);

  const [
    pendingPackages,
    setPendingPackages,
  ] = useState<PendingPackageRequest[]>([]);

  const [
    activatingId,
    setActivatingId,
  ] = useState<string | null>(null);

  const bookingComparisonDone =
    useRef(false);

  const scrollRestored =
    useRef(false);

  /**
   * Restore the cashier's exact scroll position after
   * shop data has finished loading.
   *
   * This hook MUST remain inside CashierShopModePage.
   */
  useEffect(() => {
    if (
      shop.loading ||
      scrollRestored.current
    ) {
      return;
    }

    scrollRestored.current = true;

    const saved =
      window.sessionStorage.getItem(
        CASHIER_SCROLL_POSITION_KEY,
      );

    if (!saved) {
      return;
    }

    const y = Number(saved);

    if (!Number.isFinite(y)) {
      window.sessionStorage.removeItem(
        CASHIER_SCROLL_POSITION_KEY,
      );

      return;
    }

    if (
      "scrollRestoration" in
      window.history
    ) {
      window.history.scrollRestoration =
        "manual";
    }

    let frame2 = 0;

    const frame1 =
      window.requestAnimationFrame(() => {
        frame2 =
          window.requestAnimationFrame(
            () => {
              window.scrollTo({
                top: y,
                left: 0,
                behavior: "auto",
              });

              window.sessionStorage.removeItem(
                CASHIER_SCROLL_POSITION_KEY,
              );
            },
          );
      });

    return () => {
      window.cancelAnimationFrame(
        frame1,
      );

      if (frame2) {
        window.cancelAnimationFrame(
          frame2,
        );
      }
    };
  }, [shop.loading]);

  /**
   * Remember whether this device had audio enabled.
   *
   * Browser autoplay rules may still require a user gesture
   * after a fresh browser/session launch.
   */
  useEffect(() => {
    const remembered =
      window.localStorage.getItem(
        AUDIO_ENABLED_KEY,
      ) === "1";

    if (!remembered) {
      return;
    }

    void shopAudio
      .enable()
      .then(() => {
        setAudioEnabled(true);
      })
      .catch(() => {
        setAudioEnabled(false);
      });
  }, []);

  /**
   * Detect bookings that appeared since the previous
   * full-page reload.
   *
   * The first visit only establishes the baseline and
   * never announces existing bookings as new.
   */
  useEffect(() => {
    if (
      shop.loading ||
      !shop.branchId ||
      bookingComparisonDone.current
    ) {
      return;
    }

    bookingComparisonDone.current = true;

    const currentIds =
      shop.appointments.map(
        (appointment) =>
          appointment.id,
      );

    const stored =
      window.localStorage.getItem(
        CASHIER_BOOKING_IDS_KEY,
      );

    if (stored) {
      try {
        const previousIds =
          JSON.parse(stored) as string[];

        const previousSet =
          new Set(previousIds);

        const newBookings =
          shop.appointments.filter(
            (appointment) =>
              !previousSet.has(
                appointment.id,
              ),
          );

        if (newBookings.length > 0) {
          const newest =
            newBookings[
              newBookings.length - 1
            ];

          if (!newest) {
            return;
          }

          setFeedId(newest.id);

          if (audioEnabled) {
            shopAudio.playChime();

            window.setTimeout(() => {
              shopAudio.playChime();
            }, 350);

            window.setTimeout(() => {
              shopAudio.playChime();
            }, 700);

            window.setTimeout(() => {
              shopAudio.announce(
                "New booking",
                formatSlotLabel(
                  slotTime(
                    newest.appointment_time,
                  ),
                ),
              );
            }, 1050);
          }
        }
      } catch (error) {
        console.warn(
          "[cashier] could not parse stored booking IDs:",
          error,
        );
      }
    }

    window.localStorage.setItem(
      CASHIER_BOOKING_IDS_KEY,
      JSON.stringify(currentIds),
    );
  }, [
    shop.loading,
    shop.branchId,
    shop.appointments,
    audioEnabled,
  ]);

  /**
   * Keep the saved baseline current before each reload.
   */
  useEffect(() => {
    if (
      shop.loading ||
      !shop.branchId
    ) {
      return;
    }

    const currentIds =
      shop.appointments.map(
        (appointment) =>
          appointment.id,
      );

    window.localStorage.setItem(
      CASHIER_BOOKING_IDS_KEY,
      JSON.stringify(currentIds),
    );
  }, [
    shop.loading,
    shop.branchId,
    shop.appointments,
  ]);

  /**
   * Guaranteed full browser reload every 10 seconds.
   *
   * Save scroll position immediately before reload so
   * the next page instance can restore it.
   */
  useEffect(() => {
    const reloadInterval =
      window.setInterval(() => {
        window.sessionStorage.setItem(
          CASHIER_SCROLL_POSITION_KEY,
          String(window.scrollY),
        );

        window.location.reload();
      }, PAGE_RELOAD_INTERVAL_MS);

    return () => {
      window.clearInterval(
        reloadInterval,
      );
    };
  }, []);

  /**
   * Load pending package payment requests for
   * the currently selected branch.
   */
  useEffect(() => {
    if (!shop.branchId) {
      return;
    }

    void (async () => {
      const { data } =
        await shop.supabase
          .from("customer_packages")
          .select(
            "id, requested_at, packages(name_en, branch_id), profiles:customer_id(full_name)",
          )
          .eq(
            "status",
            "pending_payment",
          )
          .order(
            "requested_at",
            { ascending: true },
          );

      setPendingPackages(
        (data ?? [])
          .filter(
            (r: {
              packages:
                | {
                    branch_id?: string;
                  }
                | {
                    branch_id?: string;
                  }[]
                | null;
            }) => {
              const pkg =
                Array.isArray(
                  r.packages,
                )
                  ? r.packages[0]
                  : r.packages;

              return (
                !shop.branchId ||
                pkg?.branch_id ===
                  shop.branchId
              );
            },
          )
          .map((r: any) => ({
            id: r.id,

            requested_at:
              r.requested_at,

            customer_name:
              Array.isArray(
                r.profiles,
              )
                ? r.profiles[0]
                    ?.full_name
                : r.profiles
                    ?.full_name,

            package_name:
              Array.isArray(
                r.packages,
              )
                ? r.packages[0]
                    ?.name_en
                : r.packages
                    ?.name_en,
          })),
      );
    })();
  }, [
    shop.branchId,
    shop.supabase,
  ]);

  /**
   * Keep Realtime as the fast path.
   *
   * The reload comparison remains the guaranteed fallback.
   */
  useBranchChannel({
    branchId: shop.branchId,

    onNotification: (
      notification,
    ) => {
      if (
        notification.type !==
        "new_booking"
      ) {
        return;
      }

      if (audioEnabled) {
        const timeMatch =
          notification.message.match(
            /at (.+)$/,
          );

        shopAudio.playChime();

        shopAudio.announce(
          "New booking",
          timeMatch?.[1] ??
            "the scheduled time",
        );
      }
    },

    onNewAppointment: (
      appointment,
    ) => {
      setFeedId(
        appointment.id,
      );
    },
  });

  async function enableAudio() {
    try {
      await shopAudio.enable();

      setAudioEnabled(true);

      window.localStorage.setItem(
        AUDIO_ENABLED_KEY,
        "1",
      );

      shopAudio.testSound();
    } catch (error) {
      console.error(
        "[cashier] audio enable failed:",
        error,
      );

      setAudioEnabled(false);
    }
  }

  async function activatePackage(
    id: string,
  ) {
    setActivatingId(id);

    const { error } =
      await shop.supabase.rpc(
        "activate_customer_package",
        {
          p_customer_package_id:
            id,
        },
      );

    setActivatingId(null);

    if (!error) {
      setPendingPackages(
        (prev) =>
          prev.filter(
            (p) => p.id !== id,
          ),
      );
    }
  }

  const latest =
    shop.appointments.find(
      (appointment) =>
        appointment.id ===
        feedId,
    );

  const live =
    shop.appointments.filter(
      (appointment) =>
        ![
          "cancelled",
          "no_show",
          "completed",
        ].includes(
          appointment.status,
        ),
    );

  const stats = useMemo(() => {
    const rows =
      shop.appointments;

    return {
      total: rows.filter(
        (appointment) =>
          appointment.status !==
          "cancelled",
      ).length,

      booked: rows.filter(
        (appointment) =>
          appointment.status ===
          "booked",
      ).length,

      inChair: rows.filter(
        (appointment) =>
          appointment.status ===
            "in_service" ||
          appointment.status ===
            "checked_in",
      ).length,

      done: rows.filter(
        (appointment) =>
          appointment.status ===
          "completed",
      ).length,

      revenue: rows
        .filter(
          (appointment) =>
            appointment.status ===
            "completed",
        )
        .reduce(
          (sum, appointment) =>
            sum +
            Number(
              appointment.total_price ??
                0,
            ),
          0,
        ),
    };
  }, [
    shop.appointments,
  ]);

  const branchName =
    shop.branches.find(
      (branch) =>
        branch.id ===
        shop.branchId,
    )?.name ??
    "All branches";

  const clockLabel =
    clock
      ? clock.toLocaleTimeString(
          [],
          {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          },
        )
      : "--:--:--";

  return (
    <StaffShell
      title="CASHIER"
      meta={`${branchName} · ${clockLabel}`}
    >
      <div className="grid grid-cols-2 gap-px bg-ink-800 md:grid-cols-5">
        {[
          [
            "TODAY",
            stats.total,
          ],
          [
            "WAITING",
            stats.booked,
          ],
          [
            "IN CHAIR",
            stats.inChair,
          ],
          [
            "DONE",
            stats.done,
          ],
          [
            "REVENUE",
            `${stats.revenue} SAR`,
          ],
        ].map(
          ([label, value]) => (
            <div
              key={label}
              className="bg-ink-950 px-5 py-5"
            >
              <span className="tag-number text-ink-400">
                {label}
              </span>

              <p className="mt-2 font-display text-3xl text-paper">
                {value}
              </p>
            </div>
          ),
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "h-2 w-2 rounded-full",
              shop.branchId
                ? "bg-status-live"
                : "bg-status-hold",
            )}
          />

          <span className="font-sans text-[10px] font-semibold tracking-widest text-ink-400">
            {shop.loading
              ? "LOADING"
              : shop.branchId
                ? "LIVE"
                : "NO BRANCH"}
          </span>

          {shop.error && (
            <span className="font-sans text-xs text-red-400">
              {shop.error}
            </span>
          )}
        </div>

        {!audioEnabled ? (
          <button
            onClick={() => {
              void enableAudio();
            }}
            className="hairline px-4 py-2 font-sans text-xs font-semibold tracking-widest text-paper hover:border-ink-400"
          >
            ENABLE AUDIO
          </button>
        ) : (
          <button
            onClick={() =>
              shopAudio.testSound()
            }
            className="hairline px-4 py-2 font-sans text-xs font-semibold tracking-widest text-status-live"
          >
            AUDIO ON
          </button>
        )}
      </div>

      <AnimatePresence>
        {latest && (
          <motion.div
            key={latest.id}
            initial={{
              height: 0,
              opacity: 0,
            }}
            animate={{
              height: "auto",
              opacity: 1,
            }}
            className="overflow-hidden border-y border-ink-800 bg-ink-900"
          >
            <div className="flex items-center justify-between px-4 py-3 md:px-8">
              <span className="font-sans text-xs font-semibold tracking-widest text-status-live">
                NEW BOOKING
              </span>

              <span className="font-sans text-sm text-paper">
                {latest.customer_name ??
                  "Customer"}
                {" · "}
                {latest.barber_name ??
                  "Barber"}
                {" · "}
                {formatSlotLabel(
                  slotTime(
                    latest.appointment_time,
                  ),
                )}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {pendingPackages.length >
        0 && (
        <section className="border-b border-ink-800 px-4 py-6 md:px-8">
          <span className="tag-number text-ink-400">
            PACKAGE REQUESTS (
            {
              pendingPackages.length
            }
            )
          </span>

          <div className="mt-3 divide-y divide-ink-800 border border-ink-800">
            {pendingPackages.map(
              (p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <div>
                    <p className="font-sans text-sm text-paper">
                      {p.customer_name ??
                        "Customer"}
                    </p>

                    <p className="mt-0.5 font-sans text-xs text-ink-400">
                      {p.package_name ??
                        "Package"}
                    </p>
                  </div>

                  <button
                    onClick={() =>
                      void activatePackage(
                        p.id,
                      )
                    }
                    disabled={
                      activatingId ===
                      p.id
                    }
                    className="hairline px-4 py-2 font-sans text-xs font-semibold tracking-widest text-status-live hover:border-status-live disabled:opacity-40"
                  >
                    {activatingId ===
                    p.id
                      ? "ACTIVATING…"
                      : "ACTIVATE (PAID)"}
                  </button>
                </div>
              ),
            )}
          </div>
        </section>
      )}

      <section className="px-4 py-6 md:px-8">
        <span className="tag-number text-ink-400">
          TODAY ({live.length} LIVE)
        </span>

        <div className="mt-3 divide-y divide-ink-800 border border-ink-800">
          {shop.appointments
            .filter(
              (appointment) =>
                appointment.status !==
                "cancelled",
            )
            .map(
              (appointment) => (
                <div
                  key={
                    appointment.id
                  }
                  className="grid grid-cols-[88px_1fr_auto] items-center gap-4 px-5 py-3"
                >
                  <span className="font-sans text-sm tabular-nums text-paper">
                    {formatSlotLabel(
                      slotTime(
                        appointment.appointment_time,
                      ),
                    )}
                  </span>

                  <div>
                    <p className="font-sans text-sm text-paper">
                      {appointment.customer_name ??
                        "Customer"}
                      {" · "}
                      {appointment.service_name ??
                        "Service"}
                    </p>

                    <p className="mt-0.5 font-sans text-xs text-ink-400">
                      {appointment.barber_name ??
                        "barber"}

                      {appointment.customer_phone
                        ? ` · ${appointment.customer_phone}`
                        : ""}

                      {appointment.total_price !=
                      null
                        ? ` · ${appointment.total_price} SAR`
                        : ""}
                    </p>
                  </div>

                  <span
                    className={clsx(
                      "font-sans text-[10px] font-semibold tracking-widest",
                      STATUS_STYLE[
                        appointment.status
                      ],
                    )}
                  >
                    {STATUS_LABEL[
                      appointment.status
                    ] ??
                      appointment.status}
                  </span>
                </div>
              ),
            )}

          {shop.appointments.length ===
            0 &&
            !shop.loading && (
              <p className="px-5 py-8 font-sans text-sm text-ink-400">
                No appointments yet
                today.
              </p>
            )}
        </div>
      </section>

      <section className="px-4 pb-10 md:px-8">
        <span className="tag-number text-ink-400">
          EVERY CHAIR · 30 MIN
        </span>

        <div className="mt-3 border border-ink-800">
          <FloorBoard
            barbers={shop.barbers}
            appointments={
              shop.appointments
            }
            hours={shop.hours}
          />
        </div>
      </section>
    </StaffShell>
  );
}