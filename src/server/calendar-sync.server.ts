/**
 * Stage 4 — ICS subscription sync service.
 *
 * One-way, read-only: fetch a remote .ics (webcal:// → https://), parse it,
 * expand recurrences over the next 90 days, and upsert into calendar_events
 * keyed by (userId, sourceUrl, icsUid + occurrence start) so repeated syncs
 * never duplicate. Local (user-created) events are never touched.
 *
 * Also owns the in-memory 15-minute auto-refresh scheduler (per-subscription
 * lastFetchedTs; runs inside the server process).
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, calendarSubscriptions } from "@/db/schema";
import { parseIcs, expandEvents } from "@/server/ics.server";

export const SUB_REFRESH_INTERVAL_MS = 15 * 60_000;
/** Don't hammer a failing source more often than this. */
const FAILURE_BACKOFF_MS = 5 * 60_000;

/** One ICS source = one calendar bucket; colour from a small default palette. */
export const CALENDAR_COLOURS = ["blue", "green", "amber", "purple", "rose", "cyan"] as const;

const syncState = globalThis as typeof globalThis & {
  __kamkaziSubTimer?: ReturnType<typeof setInterval> | undefined;
};

/** Convert webcal:// to https:// and validate. */
export function normalizeSourceUrl(raw: string): string | null {
  let url = raw.trim();
  if (/^webcal:\/\//i.test(url)) url = `https://${url.slice("webcal://".length)}`;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchIcs(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { accept: "text/calendar, text/plain, */*" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR") && !text.includes("BEGIN:VEVENT")) {
    throw new Error("Response does not look like an ICS calendar");
  }
  return text;
}

/** IST wall-clock date "YYYY-MM-DD" for a UTC instant (the app's display tz). */
export function istDateOf(isoUtc: string): string {
  const d = new Date(isoUtc);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "HH:MM" in IST for a UTC instant. */
export function istTimeOf(isoUtc: string): string {
  const d = new Date(isoUtc);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

/**
 * Sync one subscription: fetch, expand, upsert. Returns counts.
 * Upsert key: ics_uid + occurrence startUtc (or all-day date) + sourceUrl.
 */
export async function syncSubscription(
  uid: string,
  subId: string,
): Promise<{ ok: boolean; fetched: number; error?: string }> {
  const rows = await db
    .select()
    .from(calendarSubscriptions)
    .where(and(eq(calendarSubscriptions.id, subId), eq(calendarSubscriptions.userId, uid)))
    .limit(1);
  const sub = rows[0];
  if (!sub) return { ok: false, fetched: 0, error: "subscription not found" };

  try {
    const text = await fetchIcs(sub.sourceUrl);
    const events = parseIcs(text);
    const occs = expandEvents(events);

    // Replace this source's generated instances within the window: simplest
    // correct approach is delete-by-source then insert (small volumes), but
    // UID idempotency also holds because we upsert by stable ids.
    const existing = await db
      .select({
        id: calendarEvents.id,
        icsUid: calendarEvents.icsUid,
        startUtc: calendarEvents.startUtc,
        date: calendarEvents.date,
      })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.userId, uid), eq(calendarEvents.subscriptionId, subId)));

    const existingKeys = new Set(existing.map((e) => `${e.icsUid ?? ""}|${e.startUtc ?? e.date}`));
    const incomingKeys = new Set<string>();
    const toInsert: (typeof calendarEvents.$inferInsert)[] = [];

    for (const o of occs) {
      const startUtc = o.startUtc ?? null;
      const date = o.dateAllDay ?? (startUtc ? istDateOf(startUtc) : null);
      if (!date) continue;
      const key = `${o.uid}|${startUtc ?? o.dateAllDay ?? ""}`;
      incomingKeys.add(key);
      if (existingKeys.has(key)) continue;
      toInsert.push({
        id: `ce_${Math.random().toString(36).slice(2, 14)}`,
        userId: uid,
        title: o.summary,
        date,
        start: startUtc ? istTimeOf(startUtc) : null,
        durationMin: o.durationMin ?? null,
        allDay: !startUtc,
        location: o.location ?? null,
        calendar: sub.name,
        attendees: [],
        icsUid: o.uid,
        subscriptionId: subId,
        startUtc,
        recurrenceOf: o.uid,
      });
    }

    // Remove instances of this source that disappeared from the feed
    // (or fell out of the expansion window).
    const stale = existing.filter(
      (e) => !incomingKeys.has(`${e.icsUid ?? ""}|${e.startUtc ?? e.date}`),
    );
    for (const s of stale) {
      await db
        .delete(calendarEvents)
        .where(and(eq(calendarEvents.id, s.id), eq(calendarEvents.userId, uid)));
    }

    if (toInsert.length > 0) await db.insert(calendarEvents).values(toInsert);

    await db
      .update(calendarSubscriptions)
      .set({ lastFetchedTs: new Date(), lastStatus: `ok (${toInsert.length} new)` })
      .where(eq(calendarSubscriptions.id, subId));
    return { ok: true, fetched: toInsert.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(calendarSubscriptions)
      .set({ lastFetchedTs: new Date(), lastStatus: `error: ${msg.slice(0, 120)}` })
      .where(eq(calendarSubscriptions.id, subId));
    return { ok: false, fetched: 0, error: msg };
  }
}

/** Sync all of a user's subscriptions that are due (or force all). */
export async function syncDueSubscriptions(uid: string, force = false): Promise<number> {
  const rows = await db
    .select()
    .from(calendarSubscriptions)
    .where(eq(calendarSubscriptions.userId, uid));
  let n = 0;
  for (const sub of rows) {
    const last = sub.lastFetchedTs?.getTime() ?? 0;
    const due = force || Date.now() - last >= SUB_REFRESH_INTERVAL_MS - FAILURE_BACKOFF_MS;
    if (!due) continue;
    const r = await syncSubscription(uid, sub.id);
    if (r.ok) n += 1;
  }
  return n;
}

/** Start the in-process 15-minute scheduler (idempotent). */
export function startSubscriptionScheduler(): void {
  if (syncState.__kamkaziSubTimer) return;
  syncState.__kamkaziSubTimer = setInterval(() => {
    syncAllUsersSubscriptions().catch(() => undefined);
  }, SUB_REFRESH_INTERVAL_MS);
  // Don't hold the process open.
  syncState.__kamkaziSubTimer.unref?.();
}

async function syncAllUsersSubscriptions(): Promise<void> {
  const rows = await db.select().from(calendarSubscriptions);
  for (const sub of rows) {
    const last = sub.lastFetchedTs?.getTime() ?? 0;
    if (Date.now() - last < SUB_REFRESH_INTERVAL_MS) continue;
    await syncSubscription(sub.userId, sub.id).catch(() => undefined);
  }
}
