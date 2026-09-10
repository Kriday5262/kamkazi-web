import { TODAY, dayOffset } from "@/data/seed";

export function parseTime(t?: string | undefined) {
  if (!t) return null;
  const parts = t.split(":");
  return { h: Number(parts[0]), m: Number(parts[1] ?? 0) };
}

export function formatTime(t?: string | undefined) {
  const p = parseTime(t);
  if (!p) return "";
  const suffix = p.h >= 12 ? "PM" : "AM";
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${h12}:${String(p.m).padStart(2, "0")} ${suffix}`;
}

export function minutesOf(t?: string | undefined) {
  const p = parseTime(t);
  return p ? p.h * 60 + p.m : 0;
}

export function formatDuration(min?: number | undefined) {
  if (!min) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function longDate(iso: string) {
  const d = parseISO(iso);
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Today", "Tomorrow", "Yesterday", "Mon, Sep 14" */
export function relativeDate(iso?: string | undefined) {
  if (!iso) return "";
  if (iso === TODAY) return "Today";
  if (iso === dayOffset(1)) return "Tomorrow";
  if (iso === dayOffset(-1)) return "Yesterday";
  const d = new Date(`${iso}T00:00:00`);
  return `${DAYS[d.getDay()]!.slice(0, 3)}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function isOverdue(iso?: string | undefined) {
  return !!iso && iso < TODAY;
}

export function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function relativeStamp(iso: string) {
  if (iso === TODAY) return "Today";
  if (iso === dayOffset(-1)) return "Yesterday";
  const d = new Date(`${iso}T00:00:00`);
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days < 7) return `${days} days ago`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Simple recurrence: next due date for daily/weekly/monthly/yearly repeats.
 * Falls back to today+interval when the task has no due date.
 */
export function nextRepeatDate(dueDate: string | undefined, repeat: string): string {
  const base = dueDate ? new Date(dueDate + "T00:00:00") : new Date();
  if (Number.isNaN(base.getTime())) base.setTime(Date.now());
  switch (repeat) {
    case "daily":
      base.setDate(base.getDate() + 1);
      break;
    case "weekly":
      base.setDate(base.getDate() + 7);
      break;
    case "monthly":
      base.setMonth(base.getMonth() + 1);
      break;
    case "yearly":
      base.setFullYear(base.getFullYear() + 1);
      break;
    default:
      base.setDate(base.getDate() + 1);
  }
  return base.toISOString().slice(0, 10);
}

/**
 * Overdue including time: due date before today, OR due today with a due
 * time earlier than the current time (IST-independent — uses device clock).
 */
export function isOverdueNow(iso?: string | undefined, time?: string | undefined) {
  if (!iso) return false;
  if (iso < TODAY) return true;
  if (iso > TODAY || !time) return false;
  const [h = 0, m = 0] = time.split(":").map(Number);
  const now = new Date();
  return h * 60 + (m || 0) <= now.getHours() * 60 + now.getMinutes();
}

/** Due today with the time already passed (used for red-time styling in the timeline). */
export function isTimePast(iso?: string | undefined, time?: string | undefined) {
  if (!iso || iso !== TODAY || !time) return false;
  const [h = 0, m = 0] = time.split(":").map(Number);
  const now = new Date();
  return h * 60 + (m || 0) <= now.getHours() * 60 + now.getMinutes();
}
