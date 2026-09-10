/**
 * Stage 4 — /api/calendar handlers.
 *
 * GET  /api/calendar          → { events, subscriptions }
 * POST /api/calendar          → actions:
 *   { action: "subscribe", url, name?, colour? }
 *   { action: "unsubscribe", id }
 *   { action: "refresh", id? }   (id omitted = refresh all due)
 *   { action: "uploadIcs", name, colour?, content }  (one-off file import)
 *   { action: "saveEvent", event }   (local create/edit)
 *   { action: "deleteEvent", id }
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, calendarSources, calendarSubscriptions } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import { ensureSource } from "@/server/calendar-sources.server";
import {
  CALENDAR_COLOURS,
  normalizeSourceUrl,
  startSubscriptionScheduler,
  syncDueSubscriptions,
  syncSubscription,
} from "@/server/calendar-sync.server";
import { parseIcs, expandEvents } from "@/server/ics.server";
import {
  startGoogleSyncScheduler,
  syncDueGoogleAccounts,
  syncGoogleAccount,
} from "@/server/google-sync.server";
import { googleAccounts } from "@/db/schema";

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function unauth(): Response {
  return json({ error: "unauthenticated" }, 401);
}

export async function calendarHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return unauth();
  const uid = session.uid;

  // Kick the scheduler (idempotent) and sync anything due opportunistically.
  startSubscriptionScheduler();
  startGoogleSyncScheduler();
  void syncDueSubscriptions(uid).catch(() => undefined);
  void syncDueGoogleAccounts().catch(() => undefined);

  const [eventRows, subRows] = await Promise.all([
    db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.userId, uid))
      .orderBy(asc(calendarEvents.date), asc(calendarEvents.start)),
    db
      .select()
      .from(calendarSubscriptions)
      .where(eq(calendarSubscriptions.userId, uid))
      .orderBy(asc(calendarSubscriptions.createdAtTs)),
  ]);

  // Stage 5.6 — registry of per-calendar display names + colours.
  const sourceRows = await db.select().from(calendarSources).where(eq(calendarSources.userId, uid));
  const sourceByKey = new Map<string, (typeof sourceRows)[number]>();
  for (const s of sourceRows) sourceByKey.set(`${s.sourceType}|${s.accountId}|${s.calendarId}`, s);

  return json({
    events: eventRows.map((e) => {
      const src = e.googleAccountId
        ? sourceByKey.get(`google|${e.googleAccountId}|${e.calendar}`)
        : e.subscriptionId
          ? sourceByKey.get(`ics|${e.subscriptionId}|${e.subscriptionId}`)
          : undefined;
      const label =
        e.googleAccountId || e.subscriptionId ? src?.displayName.trim() || e.calendar : e.calendar;
      return {
        id: e.id,
        title: e.title,
        date: e.date,
        start: e.start ?? undefined,
        startUtc: e.startUtc ?? undefined,
        durationMin: e.durationMin ?? undefined,
        allDay: e.allDay || undefined,
        location: e.location ?? undefined,
        calendar: label,
        colour: src?.colour ?? undefined,
        icsUid: e.icsUid ?? undefined,
        subscriptionId: e.subscriptionId ?? undefined,
        readOnly: !!e.subscriptionId || !!e.googleAccountId,
      };
    }),
    subscriptions: subRows.map((s) => ({
      id: s.id,
      url: s.sourceUrl,
      name: s.name,
      colour: s.colour,
      lastFetched: s.lastFetchedTs?.toISOString() ?? null,
      lastStatus: s.lastStatus,
    })),
    sources: sourceRows.map((s) => ({
      id: s.id,
      sourceType: s.sourceType,
      accountId: s.accountId,
      calendarId: s.calendarId,
      displayName: s.displayName,
      colour: s.colour,
      customName: s.customName,
    })),
  });
}

interface SaveEventIn {
  id: string;
  title: string;
  date: string;
  start?: string | null;
  durationMin?: number | null;
  allDay?: boolean;
  location?: string | null;
  calendar?: string;
}

export async function calendarPostHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return unauth();
  const uid = session.uid;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: "invalid body" }, 400);
  const action = String(body["action"] ?? "");

  switch (action) {
    // Stage 5.6 — per-calendar display name + colour editing.
    case "renameSource":
    case "setSourceColour": {
      const sid = String(body["id"] ?? "");
      const rows = await db
        .select()
        .from(calendarSources)
        .where(and(eq(calendarSources.id, sid), eq(calendarSources.userId, uid)))
        .limit(1);
      const src = rows[0];
      if (!src) return json({ error: "source not found" }, 404);
      if (action === "renameSource") {
        const name = String(body["displayName"] ?? "")
          .trim()
          .slice(0, 60);
        if (!name) return json({ error: "displayName required" }, 400);
        await db
          .update(calendarSources)
          .set({ displayName: name, customName: true, updatedAtTs: new Date() })
          .where(eq(calendarSources.id, sid));
      } else {
        const colour = String(body["colour"] ?? "");
        if (!CALENDAR_COLOURS.includes(colour as (typeof CALENDAR_COLOURS)[number]))
          return json({ error: "invalid colour" }, 400);
        await db
          .update(calendarSources)
          .set({ colour, updatedAtTs: new Date() })
          .where(eq(calendarSources.id, sid));
      }
      return json({ ok: true });
    }
    case "subscribe": {
      const url = normalizeSourceUrl(String(body["url"] ?? ""));
      if (!url) return json({ error: "Invalid calendar URL (need http(s) or webcal)" }, 400);
      const colourIdx =
        (await db.select().from(calendarSubscriptions).where(eq(calendarSubscriptions.userId, uid)))
          .length % CALENDAR_COLOURS.length;
      const id = `sub_${Math.random().toString(36).slice(2, 10)}`;
      await db.insert(calendarSubscriptions).values({
        id,
        userId: uid,
        sourceUrl: url,
        name: String(body["name"] ?? "Subscribed calendar").slice(0, 60),
        colour: String(body["colour"] ?? CALENDAR_COLOURS[colourIdx]),
      });
      await ensureSource({
        id: `cs_${Math.random().toString(36).slice(2, 14)}`,
        userId: uid,
        sourceType: "ics",
        accountId: id,
        calendarId: id,
        displayName: String(body["name"] ?? "Subscribed calendar").slice(0, 60),
        colour: String(body["colour"] ?? CALENDAR_COLOURS[colourIdx]),
      });
      const r = await syncSubscription(uid, id);
      return json({ ok: r.ok, id, error: r.error, added: r.fetched });
    }
    case "unsubscribe": {
      const id = String(body["id"] ?? "");
      await db
        .delete(calendarSubscriptions)
        .where(and(eq(calendarSubscriptions.id, id), eq(calendarSubscriptions.userId, uid)));
      await db
        .delete(calendarEvents)
        .where(and(eq(calendarEvents.subscriptionId, id), eq(calendarEvents.userId, uid)));
      await db
        .delete(calendarSources)
        .where(
          and(
            eq(calendarSources.userId, uid),
            eq(calendarSources.sourceType, "ics"),
            eq(calendarSources.accountId, id),
          ),
        );
      return json({ ok: true });
    }
    case "refresh": {
      const id = body["id"] ? String(body["id"]) : null;
      if (id) {
        const r = await syncSubscription(uid, id);
        return json(r);
      }
      // Force-refresh ICS subscriptions AND every connected Google account so
      // remote changes (new, moved and deleted events) land immediately.
      const [n, googleAccounts_] = await Promise.all([
        syncDueSubscriptions(uid, true),
        db
          .select({ id: googleAccounts.id })
          .from(googleAccounts)
          .where(eq(googleAccounts.userId, uid)),
      ]);
      let g = 0;
      for (const a of googleAccounts_) g += await syncGoogleAccount(a.id, true).catch(() => 0);
      return json({ ok: true, synced: n + g });
    }
    case "uploadIcs": {
      const content = String(body["content"] ?? "");
      const name = String(body["name"] ?? "Imported calendar").slice(0, 60);
      const id = `sub_${Math.random().toString(36).slice(2, 10)}`;
      await db.insert(calendarSubscriptions).values({
        id,
        userId: uid,
        sourceUrl: `upload://${id}`,
        name,
        colour: String(body["colour"] ?? "blue"),
        lastFetchedTs: new Date(),
        lastStatus: "uploaded",
      });
      await ensureSource({
        id: `cs_${Math.random().toString(36).slice(2, 14)}`,
        userId: uid,
        sourceType: "ics",
        accountId: id,
        calendarId: id,
        displayName: name,
        colour: String(body["colour"] ?? "blue"),
      });
      try {
        const occs = expandEvents(parseIcs(content));
        const rows = occs
          .map((o) => {
            const date = o.dateAllDay ?? (o.startUtc ? istDate(o.startUtc) : null);
            if (!date) return null;
            return {
              id: `ce_${Math.random().toString(36).slice(2, 14)}`,
              userId: uid,
              title: o.summary,
              date,
              start: o.startUtc ? istTime(o.startUtc) : null,
              durationMin: o.durationMin ?? null,
              allDay: !o.startUtc,
              location: o.location ?? null,
              calendar: name,
              attendees: [],
              icsUid: o.uid,
              subscriptionId: id,
              startUtc: o.startUtc ?? null,
              recurrenceOf: o.uid,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (rows.length > 0) await db.insert(calendarEvents).values(rows);
        return json({ ok: true, id, added: rows.length });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : "parse failed" }, 400);
      }
    }
    case "saveEvent": {
      const ev = body["event"] as SaveEventIn | undefined;
      if (!ev || !ev.title || !ev.date) return json({ error: "title and date required" }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) return json({ error: "bad date" }, 400);
      const values = {
        userId: uid,
        title: ev.title.slice(0, 200),
        date: ev.date,
        start: ev.start || null,
        durationMin: ev.durationMin ?? null,
        allDay: !!ev.allDay || !ev.start,
        location: ev.location || null,
        calendar: ev.calendar || "Personal",
        attendees: [],
        updatedAtTs: new Date(),
      };
      if (ev.id && ev.id !== "new") {
        const owned = await db
          .select({ id: calendarEvents.id })
          .from(calendarEvents)
          .where(
            and(
              eq(calendarEvents.id, ev.id),
              eq(calendarEvents.userId, uid),
              isNull(calendarEvents.subscriptionId),
            ),
          );
        if (owned.length === 0)
          return json({ error: "not found or read-only (subscribed event)" }, 404);
        await db.update(calendarEvents).set(values).where(eq(calendarEvents.id, ev.id));
        return json({ ok: true, id: ev.id });
      }
      const id = `ce_${Math.random().toString(36).slice(2, 14)}`;
      await db.insert(calendarEvents).values({ id, ...values });
      return json({ ok: true, id });
    }
    case "deleteEvent": {
      const id = String(body["id"] ?? "");
      // Subscribed (read-only) events can't be deleted locally.
      const owned = await db
        .select({ id: calendarEvents.id })
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.id, id),
            eq(calendarEvents.userId, uid),
            isNull(calendarEvents.subscriptionId),
          ),
        );
      if (owned.length === 0) return json({ error: "not found or read-only" }, 404);
      await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
      return json({ ok: true });
    }
    default:
      return json({ error: `unknown action ${action}` }, 400);
  }
}

// IST helpers mirroring calendar-sync.server (kept local to avoid a cycle).
function istDate(isoUtc: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoUtc));
}
function istTime(isoUtc: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoUtc));
}
