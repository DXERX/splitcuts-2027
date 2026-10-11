"use client";

import { useEffect, useState } from "react";

export type BookingFlag = {
  eligible: boolean;
  pointRecorded: boolean;
  rewardUsed: boolean;
  tamaraPaid: boolean;
  freeCut: boolean;
  sameDay: boolean;
};

export async function fetchBookingFlags(ids: string[]): Promise<Record<string, BookingFlag> | null> {
  if (!ids.length) return {};
  const response = await fetch("/api/staff/loyalty", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appointmentIds: ids }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { flags?: Record<string, BookingFlag> };
  return body.flags ?? null;
}

export function useBookingFlags(ids: string[]) {
  const [flags, setFlags] = useState<Record<string, BookingFlag>>({});
  const key = [...ids].sort().join(",");

  useEffect(() => {
    if (!key) {
      setFlags({});
      return;
    }
    let cancelled = false;
    void fetchBookingFlags(key.split(",")).then((next) => {
      if (!cancelled && next) setFlags(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return flags;
}
