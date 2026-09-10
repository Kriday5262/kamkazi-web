import { CalendarDays, Clock, MapPin, X, Users, Tag } from "lucide-react";
import type { DatedEvent } from "@/data/seed";
import { formatDuration, formatTime, longDate, minutesOf } from "@/lib/format";

function endTime(start: string, durationMin: number) {
  const total = minutesOf(start) + durationMin;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return formatTime(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
}

export function EventDetail({
  event,
  onClose,
  onDelete,
  onEdit,
}: {
  event: DatedEvent;
  onClose: () => void;
  onDelete?: (() => void) | undefined;
  onEdit?: (() => void) | undefined;
}) {
  const accent =
    event.calendar === "Work" ? "var(--color-accent-blue)" : "var(--color-accent-green)";

  const when = event.allDay
    ? "All day"
    : event.start
      ? `${formatTime(event.start)}${event.durationMin ? ` – ${endTime(event.start, event.durationMin)}` : ""}`
      : "Time not set";

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-[12.5px] text-muted-foreground">
          {onDelete || onEdit ? "Event · local" : "Event · read only"}
        </span>
        {onDelete || onEdit ? (
          <span className="flex items-center gap-1">
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md px-2 py-1 text-[12px] font-semibold text-primary hover:bg-surface-2"
              >
                Edit
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md px-2 py-1 text-[12px] font-semibold text-destructive hover:bg-destructive/10"
              >
                Delete
              </button>
            ) : null}
          </span>
        ) : null}
        <button
          type="button"
          aria-label="Close event details"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-[17px]" aria-hidden />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-1.5 h-9 w-[4px] shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
            aria-hidden
          />
          <h2 className="text-[19px] font-bold leading-snug tracking-tight">{event.title}</h2>
        </div>

        <div className="mt-5 space-y-1">
          <Row icon={<CalendarDays className="size-4" aria-hidden />} label="Date">
            {longDate(event.date)}
          </Row>
          <Row icon={<Clock className="size-4" aria-hidden />} label="Time">
            <span className="tnum">{when}</span>
            {event.durationMin ? (
              <span className="ml-2 text-muted-foreground">
                {formatDuration(event.durationMin)}
              </span>
            ) : null}
          </Row>
          <Row icon={<MapPin className="size-4" aria-hidden />} label="Location">
            {event.location ?? <span className="text-muted-foreground">No location</span>}
          </Row>
          <Row icon={<Tag className="size-4" aria-hidden />} label="Calendar">
            <span className="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-[12.5px] font-medium">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: accent }}
                aria-hidden
              />
              {event.calendar}
            </span>
          </Row>
          <Row icon={<Users className="size-4" aria-hidden />} label="Attendees">
            <span className="text-muted-foreground">Not shared with this view</span>
          </Row>
        </div>

        {onDelete || onEdit ? null : (
          <p className="mt-6 rounded-[var(--radius-md)] bg-surface-2/60 px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
            Read-only subscription — changes in the source calendar will sync in; edits here are
            local.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg px-1 py-2">
      <span className="mt-0.5 flex w-[86px] shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
        {icon}
        {label}
      </span>
      <div className="min-w-0 flex-1 text-[14px]">{children}</div>
    </div>
  );
}
