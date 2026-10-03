"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { StaffShell } from "@/components/staff/StaffShell";
import { FloorBoard } from "@/components/staff/FloorBoard";
import { useShopSession } from "@/lib/staff/useShopSession";
import { shopAudio } from "@/lib/audio/shopAudio";

import {
  mergeLiveAppointment,
  type LiveAppointment,
} from "@/lib/staff/appointments";

import {
  formatSlotLabel,
  slotTime,
} from "@/lib/timeSlots";

type AppointmentStatus =
  LiveAppointment["status"];

  /**
 * Restore the exact scroll position after a full
 * 10-second browser reload.
 */
useEffect(() => {
  const saved =
    window.sessionStorage.getItem(
      BARBER_SCROLL_POSITION_KEY,
    );

  if (!saved) {
    return;
  }

  const y = Number(saved);

  if (!Number.isFinite(y)) {
    window.sessionStorage.removeItem(
      BARBER_SCROLL_POSITION_KEY,
    );
    return;
  }

  /**
   * Wait for the current page content to render,
   * then restore without animation.
   */
  const frame = window.requestAnimationFrame(() => {
    window.scrollTo({
      top: y,
      left: 0,
      behavior: "auto",
    });
  });

  return () => {
    window.cancelAnimationFrame(frame);
  };
}, []);

const PAGE_RELOAD_INTERVAL_MS = 10_000;

const AUDIO_ENABLED_KEY =
  "splitcuts_staff_audio_enabled";

const BARBER_BOOKING_IDS_KEY =
  "splitcuts_barber_booking_ids";
const BARBER_SCROLL_POSITION_KEY =
"splitcuts_barber_scroll_position";

const NEXT_STATUS: Partial<
  Record<
    AppointmentStatus,
    AppointmentStatus
  >
> = {
  booked: "checked_in",
  checked_in: "in_service",
  in_service: "completed",
};

export default function BarberSchedulePage() {
  const shop = useShopSession();

  const [
    confirmingNoShow,
    setConfirmingNoShow,
  ] = useState<string | null>(null);

  const [
    updatingId,
    setUpdatingId,
  ] = useState<string | null>(null);

  const [
    actionError,
    setActionError,
  ] = useState<string | null>(null);

  const [
    audioEnabled,
    setAudioEnabled,
  ] = useState(false);

  const [
    newBooking,
    setNewBooking,
  ] = useState<LiveAppointment | null>(
    null,
  );

  const bookingComparisonDone =
    useRef(false);

  /**
   * Restore remembered audio preference.
   *
   * Browser autoplay policy can still require
   * one user interaction after a completely
   * fresh browser/device session.
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
      .catch((error) => {
        console.warn(
          "[barber] automatic audio restore failed:",
          error,
        );

        setAudioEnabled(false);
      });
  }, []);

  /**
   * Detect bookings added since the previous
   * full-page reload.
   *
   * Important:
   * - Existing bookings on first-ever load do not alert.
   * - Previous IDs are read BEFORE current IDs are saved.
   * - Comparison only happens once per page load.
   * - Current IDs become the baseline for the next reload.
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
        BARBER_BOOKING_IDS_KEY,
      );

    let newest:
      | LiveAppointment
      | undefined;

    if (stored) {
      try {
        const parsed =
          JSON.parse(stored);

        const previousIds:
          string[] =
          Array.isArray(parsed)
            ? parsed.filter(
                (
                  value,
                ): value is string =>
                  typeof value ===
                  "string",
              )
            : [];

        const previousSet =
          new Set(previousIds);

        const newBookings =
          shop.appointments.filter(
            (appointment) =>
              !previousSet.has(
                appointment.id,
              ),
          );

        newest =
          newBookings[
            newBookings.length - 1
          ];
      } catch (error) {
        console.warn(
          "[barber] could not parse stored booking IDs:",
          error,
        );
      }
    }

    /**
     * Save AFTER comparison.
     *
     * This becomes the baseline that the next
     * 10-second reload will compare against.
     */
    window.localStorage.setItem(
      BARBER_BOOKING_IDS_KEY,
      JSON.stringify(currentIds),
    );

    if (!newest) {
      return;
    }

    setNewBooking(newest);

    if (!audioEnabled) {
      return;
    }

    /**
     * Strong notification:
     * 3 chimes followed by voice announcement.
     */
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
  }, [
    shop.loading,
    shop.branchId,
    shop.appointments,
    audioEnabled,
  ]);

  /**
   * Full browser reload every 10 seconds.
   *
   * This intentionally uses a real reload because
   * manual reload has already been confirmed to
   * retrieve new bookings correctly.
   *
   * We skip a reload while CHECK IN / START /
   * DONE / NO SHOW is being processed.
   */
  useEffect(() => {
    const reloadInterval =
      window.setInterval(() => {
        if (updatingId) {
          return;
        }

        window.location.reload();
      }, PAGE_RELOAD_INTERVAL_MS);

    return () => {
      window.clearInterval(
        reloadInterval,
      );
    };
  }, [
    updatingId,
  ]);

  async function enableAudio() {
    try {
      await shopAudio.enable();

      window.localStorage.setItem(
        AUDIO_ENABLED_KEY,
        "1",
      );

      setAudioEnabled(true);

      /**
       * Immediate test confirms that this browser
       * actually allowed sound playback.
       */
      shopAudio.testSound();
    } catch (error) {
      console.error(
        "[barber] audio enable failed:",
        error,
      );

      window.localStorage.removeItem(
        AUDIO_ENABLED_KEY,
      );

      setAudioEnabled(false);
    }
  }

  async function updateStatus(
    appointment: LiveAppointment,
    newStatus: AppointmentStatus,
  ) {
    if (
      updatingId ===
      appointment.id
    ) {
      return;
    }

    setUpdatingId(
      appointment.id,
    );

    setActionError(null);

    try {
      const {
        data,
        error,
      } =
        await shop.supabase.rpc(
          "update_appointment_status",
          {
            p_appointment_id:
              appointment.id,

            p_new_status:
              newStatus,
          },
        );

      if (error) {
        console.error(
          "update_appointment_status failed:",
          error,
        );

        setActionError(
          error.message ||
            `Could not change appointment to ${newStatus}.`,
        );

        return;
      }

      if (!data) {
        console.error(
          "update_appointment_status returned no appointment",
          {
            appointmentId:
              appointment.id,
            newStatus,
          },
        );

        setActionError(
          "The appointment was not updated. Please try again.",
        );

        return;
      }

      /**
       * Update the UI immediately.
       */
      shop.setAppointments(
        (prev) =>
          mergeLiveAppointment(
            prev,
            data,
            shop.barbers,
            shop.services,
          ),
      );

      /**
       * Then synchronize with the authoritative
       * database state.
       */
      shop.refresh();
    } catch (error) {
      console.error(
        "Unexpected appointment status update error:",
        error,
      );

      setActionError(
        error instanceof Error
          ? error.message
          : "Something went wrong while updating the appointment.",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function advance(
    appointment: LiveAppointment,
  ) {
    const next =
      NEXT_STATUS[
        appointment.status
      ];

    if (!next) {
      return;
    }

    await updateStatus(
      appointment,
      next,
    );
  }

  async function markNoShow(
    appointment: LiveAppointment,
  ) {
    /**
     * First click = confirmation.
     */
    if (
      confirmingNoShow !==
      appointment.id
    ) {
      setConfirmingNoShow(
        appointment.id,
      );

      setActionError(null);

      return;
    }

    /**
     * Second click = confirm NO SHOW.
     */
    setConfirmingNoShow(null);

    await updateStatus(
      appointment,
      "no_show",
    );
  }

  const branchName =
    shop.branches.find(
      (branch) =>
        branch.id ===
        shop.branchId,
    )?.name ??
    "Shop";

  const liveCount =
    shop.appointments.filter(
      (appointment) =>
        appointment.status ===
        "in_service",
    ).length;

  return (
    <StaffShell
      title="FLOOR"
      meta={`${branchName} · ${shop.barbers.length} chairs · ${liveCount} in service`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-4 py-3 md:px-8">
        <div className="flex items-center gap-2">
          <span
            className={
              shop.branchId
                ? "h-2 w-2 rounded-full bg-status-live"
                : "h-2 w-2 rounded-full bg-status-hold"
            }
          />

          <span className="font-sans text-[10px] font-semibold tracking-widest text-ink-400">
            {shop.loading
              ? "LOADING"
              : shop.branchId
                ? "LIVE"
                : "NO BRANCH"}
          </span>

          <span className="font-sans text-[10px] tracking-widest text-ink-500">
            · AUTO REFRESH 10S
          </span>
        </div>

        {!audioEnabled ? (
          <button
            type="button"
            onClick={() => {
              void enableAudio();
            }}
            className="hairline px-4 py-2 font-sans text-xs font-semibold tracking-widest text-paper hover:border-ink-400"
          >
            ENABLE AUDIO
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              shopAudio.testSound()
            }
            className="hairline px-4 py-2 font-sans text-xs font-semibold tracking-widest text-status-live"
          >
            AUDIO ON
          </button>
        )}
      </div>

      {newBooking && (
        <div className="border-b border-status-live/40 bg-status-live/10 px-4 py-3 md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-sans text-xs font-semibold tracking-widest text-status-live">
              NEW BOOKING
            </span>

            <span className="font-sans text-sm text-paper">
              {newBooking.customer_name ??
                "Customer"}
              {" · "}
              {newBooking.barber_name ??
                "Barber"}
              {" · "}
              {formatSlotLabel(
                slotTime(
                  newBooking.appointment_time,
                ),
              )}
            </span>
          </div>
        </div>
      )}

      <section className="px-2 py-4 md:px-6 md:py-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-2">
          <div>
            <span className="tag-number text-ink-400">
              ALL BARBERS · EVERY 30 MIN
            </span>

            <p className="mt-1 font-sans text-sm text-ink-400">
              One screen. Every chair,
              every slot. Two no-shows =
              online booking ban.
            </p>
          </div>

          {shop.error && (
            <p className="font-sans text-xs text-red-400">
              {shop.error}
            </p>
          )}
        </div>

        {actionError && (
          <div className="mx-2 mb-4 border border-red-500/40 bg-red-500/10 px-4 py-3">
            <p className="font-sans text-xs font-medium text-red-400">
              {actionError}
            </p>
          </div>
        )}

        {updatingId && (
          <div className="mx-2 mb-3">
            <span className="font-sans text-[10px] font-semibold tracking-widest text-ink-400">
              UPDATING APPOINTMENT...
            </span>
          </div>
        )}

        <div
          className={
            updatingId
              ? "pointer-events-none border border-ink-800 bg-ink-950 opacity-70"
              : "border border-ink-800 bg-ink-950"
          }
        >
          <FloorBoard
            barbers={
              shop.barbers
            }
            appointments={
              shop.appointments
            }
            hours={
              shop.hours
            }
            interactive
            confirmingNoShow={
              confirmingNoShow
            }
            onAdvance={(
              appointment,
            ) => {
              void advance(
                appointment,
              );
            }}
            onNoShow={(
              appointment,
            ) => {
              void markNoShow(
                appointment,
              );
            }}
          />
        </div>
      </section>
    </StaffShell>
  );
}