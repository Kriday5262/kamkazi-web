/**
 * Stage 5.6 — calendar_sources registry helpers.
 *
 * One registry row per (user, sourceType, accountId, calendarId) holds the
 * human display name + colour chosen for a calendar. Google sync upserts
 * rows with the calendarList summary; ICS sync uses the subscription name.
 * Read paths join calendar_events → registry to resolve friendly labels.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarSources } from "@/db/schema";

export type CalendarSource = typeof calendarSources.$inferSelect;

/** Google-synced calendar ids of an account → registry rows (all statuses). */
export async function sourcesForAccount(uid: string, accountId: string): Promise<CalendarSource[]> {
  return db
    .select()
    .from(calendarSources)
    .where(
      and(
        eq(calendarSources.userId, uid),
        eq(calendarSources.sourceType, "google"),
        eq(calendarSources.accountId, accountId),
      ),
    );
}

export async function icsSourceFor(uid: string, subId: string): Promise<CalendarSource | null> {
  const rows = await db
    .select()
    .from(calendarSources)
    .where(
      and(
        eq(calendarSources.userId, uid),
        eq(calendarSources.sourceType, "ics"),
        eq(calendarSources.accountId, subId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Upsert (idempotent, onConflictDoNothing on the unique key). */
export async function ensureSource(row: {
  id: string;
  userId: string;
  sourceType: "google" | "ics";
  accountId: string;
  calendarId: string;
  displayName: string;
  colour?: string;
}): Promise<void> {
  await db
    .insert(calendarSources)
    .values({
      id: row.id,
      userId: row.userId,
      sourceType: row.sourceType,
      accountId: row.accountId,
      calendarId: row.calendarId,
      displayName: row.displayName,
      colour: row.colour ?? "blue",
    })
    .onConflictDoNothing();
}

/** Refresh the auto-resolved name for a source (never clobbers customName). */
export async function refreshSourceName(
  uid: string,
  sourceType: "google" | "ics",
  accountId: string,
  calendarId: string,
  displayName: string,
): Promise<void> {
  await db
    .update(calendarSources)
    .set({ displayName, updatedAtTs: new Date() })
    .where(
      and(
        eq(calendarSources.userId, uid),
        eq(calendarSources.sourceType, sourceType),
        eq(calendarSources.accountId, accountId),
        eq(calendarSources.calendarId, calendarId),
        eq(calendarSources.customName, false),
      ),
    );
}

export function sourceId(uid: string, sourceType: string, accountId: string): string {
  return `cs_${Math.random().toString(36).slice(2, 14)}`;
}
