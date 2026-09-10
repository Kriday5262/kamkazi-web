import { X } from "lucide-react";
import { useState } from "react";

/** Shape posted to POST /api/calendar { action: "saveEvent" }. */
export interface EventEditorInput {
  id: string;
  title: string;
  date: string;
  start?: string | null;
  durationMin?: number | null;
  allDay?: boolean;
  location?: string | null;
  calendar?: string | undefined;
}

const CALENDAR_BUCKETS = ["Personal", "Work"];

/** Modal editor for local (non-subscribed) calendar events. */
export function EventEditor({
  event,
  initialDate,
  onClose,
  onSave,
}: {
  event: {
    id: string;
    title: string;
    start?: string | undefined;
    durationMin?: number | undefined;
    allDay?: boolean | undefined;
    location?: string | undefined;
  } | null;
  initialDate: string;
  onClose: () => void;
  onSave: (ev: EventEditorInput) => void | Promise<void>;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(initialDate);
  const [allDay, setAllDay] = useState(!event?.start && (event?.allDay ?? false));
  const [start, setStart] = useState(event?.start ?? "10:00");
  const [duration, setDuration] = useState(String(event?.durationMin ?? 60));
  const [location, setLocation] = useState(event?.location ?? "");
  const [bucket, setBucket] = useState(CALENDAR_BUCKETS[0]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || !date) return;
    setSaving(true);
    await onSave({
      id: event?.id ?? "new",
      title: title.trim(),
      date,
      allDay,
      start: allDay ? null : start,
      durationMin: allDay ? null : Number(duration) || 30,
      location: location.trim() || null,
      calendar: bucket,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close editor"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/25"
      />
      <div className="relative w-full max-w-md rounded-t-2xl border border-border bg-surface p-5 shadow-raised sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold tracking-tight">
            {event ? "Edit event" : "New event"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[12px] font-semibold text-muted-foreground">Title</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Dentist appointment"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-muted-foreground">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-muted-foreground">Location</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Optional"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-[13px] font-medium">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day
          </label>
          {!allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[12px] font-semibold text-muted-foreground">Start (IST)</span>
                <input
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold text-muted-foreground">
                  Duration (min)
                </span>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            </div>
          ) : null}
          <div>
            <span className="text-[12px] font-semibold text-muted-foreground">Calendar</span>
            <div className="mt-1 flex gap-2">
              {CALENDAR_BUCKETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBucket(b)}
                  aria-pressed={bucket === b}
                  className={
                    "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold " +
                    (bucket === b
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground hover:bg-surface-2")
                  }
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !title.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
