import clsx from "clsx";

const STATUS_LABEL: Record<string, string> = {
  booked: "BOOKED",
  checked_in: "CHECKED IN",
  in_service: "IN SERVICE",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
  no_show: "NO SHOW",
};

export function BookingRow({
  serviceName,
  barberName,
  start,
  status,
}: {
  serviceName: string;
  barberName: string;
  start: string;
  status: string;
}) {
  const dimmed = status === "cancelled" || status === "no_show";
  return (
    <div className="flex flex-col gap-2 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className={clsx("font-display text-lg uppercase tracking-tight", dimmed ? "text-ink-400" : "text-paper")}>
          {serviceName}
        </p>
        <p className="mt-0.5 font-sans text-xs tracking-widest text-ink-400">
          with {barberName} ·{" "}
          {new Date(start).toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>
      <span
        className={clsx(
          "font-sans text-[10px] font-semibold tracking-widest",
          status === "completed" && "text-status-live",
          status === "cancelled" || status === "no_show" ? "text-ink-600" : "",
          status === "booked" || status === "checked_in" || status === "in_service"
            ? "text-paper"
            : "",
        )}
      >
        {STATUS_LABEL[status] ?? status.toUpperCase()}
      </span>
    </div>
  );
}
