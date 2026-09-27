"use client";

import { useEffect, useState } from "react";

function format(ms: number): string {
  if (ms <= 0) return "NOW";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `IN ${days}D ${hours}H`;
  if (hours > 0) return `IN ${hours}H ${minutes}M`;
  return `IN ${minutes}M`;
}

/** Live-ticking "IN 2H 14M" style countdown to an ISO timestamp. Recomputes
 * every 30s -- this is a homepage/account accent, not a precision timer. */
export function CountdownLabel({ target }: { target: string }) {
  const [label, setLabel] = useState(() => format(new Date(target).getTime() - Date.now()));

  useEffect(() => {
    const tick = () => setLabel(format(new Date(target).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [target]);

  return <span>{label}</span>;
}
