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
