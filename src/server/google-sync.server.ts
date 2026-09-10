/**
 * Stage 4.5 — Google Calendar → calendar_events sync.
 *
 * For every connected google_account, fetch events (singleEvents=true so
 * Google expands recurrence) for the primary + selected calendars and
 * upsert into calendar_events keyed by googleEventId
 * ("<calendarId>|<eventId>"). Cancelled events are deleted; anything that
 * fell out of the 30d..90d window is pruned. Local and ICS events are
 * never touched.
 */
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, googleAccounts } from "@/db/schema";
import { istDateOf, istTimeOf } from "@/server/calendar-sync.server";
import { ensureSource, refreshSourceName } from "@/server/calendar-sources.server";
import {
  fetchGoogleEvents,
  getFreshAccessToken,
  listGoogleCalendars,
  type GEvent,
  type GoogleAccount,
} from "@/server/google-oauth.server";

export const GOOGLE_SYNC_INTERVAL_MS = 15 * 60_000;

const syncState = globalThis as typeof globalThis & {
  __kamkaziGoogleTimer?: ReturnType<typeof setInterval> | undefined;
};

interface MappedEvent {
  startUtc: string | null;
  dateAllDay: string | null;
  durationMin: number | null;
}

/** RFC3339 dateTime → { startUtc, durationMin } or all-day date string. */
export function mapGoogleEvent(ev: GEvent): MappedEvent | null {
  const s = ev.start;
  if (!s) return null;
  if (s.date) return { startUtc: null, dateAllDay: s.date, durationMin: null };
  if (!s.dateTime) return null;
  const start = new Date(s.dateTime);
  if (Number.isNaN(start.getTime())) return null;
  const startUtc = start.toISOString();
  let durationMin: number | null = null;
  const e = ev.end?.dateTime;
  if (e) {
    const end = new Date(e);
    if (!Number.isNaN(end.getTime())) {
      durationMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
    }
  }
  return { startUtc, dateAllDay: null, durationMin };
}

async function syncCalendar(
  acct: GoogleAccount,
  accessToken: string,
  calId: string,
): Promise<number> {
  const events = await fetchGoogleEvents(accessToken, calId, calId);
  const existing = await db
    .select({
      id: calendarEvents.id,
      googleEventId: calendarEvents.googleEventId,
      startUtc: calendarEvents.startUtc,
      date: calendarEvents.date,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, acct.userId),
        eq(calendarEvents.googleAccountId, acct.id),
        like(calendarEvents.googleEventId, `${calId}|%`),
      ),
    );
  const existingKeys = new Map(existing.map((e) => [e.googleEventId ?? "", e]));

  const incomingKeys = new Set<string>();
  let upserts = 0;
  for (const ev of events) {
    if (ev.status === "cancelled") continue; // deleted below via prune
    const m = mapGoogleEvent(ev);
    if (!m) continue;
    const date = m.dateAllDay ?? (m.startUtc ? istDateOf(m.startUtc) : null);
    if (!date) continue;
    const key = `${calId}|${ev.id}`;
    incomingKeys.add(key);
    const prev = existingKeys.get(key);
    const changed = !prev || prev.startUtc !== m.startUtc || prev.date !== date;
    if (!changed) continue;
    const row = {
      id: prev?.id ?? `ce_g_${Math.random().toString(36).slice(2, 14)}`,
      userId: acct.userId,
      title: ev.summary ?? "(untitled)",
      date,
      start: m.startUtc ? istTimeOf(m.startUtc) : null,
      durationMin: m.durationMin,
      allDay: !m.startUtc,
      location: ev.location ?? null,
      calendar: calId,
      attendees: [],
      googleAccountId: acct.id,
      googleEventId: key,
      startUtc: m.startUtc,
      recurrenceOf: null,
    };
    if (prev) {
      await db.update(calendarEvents).set(row).where(eq(calendarEvents.id, prev.id));
    } else {
      await db.insert(calendarEvents).values(row);
    }
    upserts += 1;
  }

  // Prune: cancelled or out-of-window events for this calendar.
  for (const [key, row] of existingKeys) {
    if (!incomingKeys.has(key)) {
      await db.delete(calendarEvents).where(eq(calendarEvents.id, row.id));
      upserts += 1;
    }
  }
  return upserts;
}

/** Sync all selected calendars for one account. Returns synced calendar count. */
export async function syncGoogleAccount(acctId: string, force = false): Promise<number> {
  const rows = await db.select().from(googleAccounts).where(eq(googleAccounts.id, acctId)).limit(1);
  const acct = rows[0];
  if (!acct) return 0;
  const last = acct.lastSyncedTs?.getTime() ?? 0;
  if (!force && Date.now() - last < GOOGLE_SYNC_INTERVAL_MS - 60_000) return 0;
  try {
    const token = await getFreshAccessToken(acct);
    if (!token) return 0;
    const calIds = acct.selectedCalendars.length > 0 ? acct.selectedCalendars : [];

    // Stage 5.6 — resolve friendly calendar names from calendarList and keep
    // the calendar_sources registry up to date (display name + colour).
    try {
      const cals = await listGoogleCalendars(token);
      for (const c of cals) {
        if (!calIds.includes(c.id)) continue;
        await ensureSource({
          id: `cs_${Math.random().toString(36).slice(2, 14)}`,
          userId: acct.userId,
          sourceType: "google",
          accountId: acct.id,
          calendarId: c.id,
          displayName: c.summary,
        });
        await refreshSourceName(acct.userId, "google", acct.id, c.id, c.summary);
      }
      // Names of calendars no longer selected are left alone (harmless).
    } catch {
      // calendarList is best-effort; events still sync with id-based labels.
    }

    let n = 0;
    for (const calId of calIds) {
      await syncCalendar(acct, token, calId);
      n += 1;
    }
    await db
      .update(googleAccounts)
      .set({ lastSyncedTs: new Date(), lastStatus: `ok (${n} calendars)` })
      .where(eq(googleAccounts.id, acct.id));
    return n;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(googleAccounts)
      .set({ lastStatus: `error: ${msg.slice(0, 120)}` })
      .where(eq(googleAccounts.id, acct.id));
    return 0;
  }
}

/** Sync every connected account that is due (used by the shared scheduler). */
export async function syncDueGoogleAccounts(): Promise<number> {
  const rows = await db.select().from(googleAccounts);
  let n = 0;
  for (const acct of rows) {
    n += await syncGoogleAccount(acct.id).catch(() => 0);
  }
  return n;
}

/** Start the in-process 15-minute Google sync scheduler (idempotent). */
export function startGoogleSyncScheduler(): void {
  if (syncState.__kamkaziGoogleTimer) return;
  syncState.__kamkaziGoogleTimer = setInterval(() => {
    syncDueGoogleAccounts().catch(() => undefined);
  }, GOOGLE_SYNC_INTERVAL_MS);
  syncState.__kamkaziGoogleTimer.unref?.();
}
