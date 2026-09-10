/**
 * Stage 4.5 / 5.5 — /api/google/calendars handlers (multi-account).
 *
 * GET  → { accounts: [{ id, googleEmail, status, lastSynced, calendars,
 *                        selected, listError }], connected }
 * POST { action: "saveSelection", accountId, calendarIds }
 *      { action: "sync", accountId }        — force sync now
 *      { action: "disconnect", accountId }  — deletes that account's row +
 *                                             its google-sourced events only
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, calendarSources, googleAccounts } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import {
  getFreshAccessToken,
  listGoogleCalendars,
  type GoogleAccount,
} from "@/server/google-oauth.server";
import { startGoogleSyncScheduler, syncGoogleAccount } from "@/server/google-sync.server";

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface GCalOut {
  id: string;
  summary: string;
  primary?: boolean | undefined;
}

interface AcctOut {
  id: string;
  googleEmail: string;
  status: string;
  lastSynced: string | null;
  scopes: string[];
  calendars: GCalOut[];
  selected: string[];
  listError?: string | undefined;
}

async function accountPayload(acct: GoogleAccount): Promise<AcctOut> {
  let calendars: GCalOut[] = [];
  let listError: string | undefined;
  try {
    const token = await getFreshAccessToken(acct);
    if (token) {
      const cals = await listGoogleCalendars(token);
      calendars = cals.map((c) => ({ id: c.id, summary: c.summary, primary: c.primary }));
    } else {
      listError = "token unavailable";
    }
  } catch (e) {
    listError = e instanceof Error ? e.message : String(e);
  }
  return {
    id: acct.id,
    googleEmail: acct.googleEmail,
    status: acct.lastStatus,
    lastSynced: acct.lastSyncedTs?.toISOString() ?? null,
    scopes: acct.scopes,
    calendars,
    selected: acct.selectedCalendars,
    listError,
  };
}

export async function googleCalendarsHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthenticated" }, 401);
  startGoogleSyncScheduler();
  const rows = await db.select().from(googleAccounts).where(eq(googleAccounts.userId, session.uid));
  if (rows.length === 0) return json({ connected: false, accounts: [] });
  const accounts = await Promise.all(rows.map((a) => accountPayload(a)));
  return json({ connected: true, accounts });
}

export async function googleCalendarsPostHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthenticated" }, 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: "invalid body" }, 400);
  const action = String(body["action"] ?? "");
  const accountId = String(body["accountId"] ?? "");
  const rows = accountId
    ? await db
        .select()
        .from(googleAccounts)
        .where(and(eq(googleAccounts.id, accountId), eq(googleAccounts.userId, session.uid)))
        .limit(1)
    : // Back-compat: no accountId → single-account callers.
      await db.select().from(googleAccounts).where(eq(googleAccounts.userId, session.uid)).limit(1);
  const acct = rows[0] ?? null;

  if (action === "saveSelection") {
    if (!acct) return json({ error: "not connected" }, 400);
    const ids = Array.isArray(body["calendarIds"])
      ? (body["calendarIds"] as unknown[]).map(String)
      : [];
    await db
      .update(googleAccounts)
      .set({ selectedCalendars: ids.slice(0, 50), lastSyncedTs: null })
      .where(eq(googleAccounts.id, acct.id));
    void syncGoogleAccount(acct.id, true).catch(() => undefined);
    return json({ ok: true, saved: ids.length });
  }

  if (action === "sync") {
    if (!acct) return json({ error: "not connected" }, 400);
    const n = await syncGoogleAccount(acct.id, true);
    return json({ ok: n > 0, synced: n });
  }

  if (action === "disconnect") {
    if (acct) {
      // Delete ONLY this account's google-sourced events + its row.
      await db
        .delete(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, session.uid),
            isNotNull(calendarEvents.googleAccountId),
            eq(calendarEvents.googleAccountId, acct.id),
          ),
        );
      await db.delete(googleAccounts).where(eq(googleAccounts.id, acct.id));
      await db
        .delete(calendarSources)
        .where(
          and(
            eq(calendarSources.userId, session.uid),
            eq(calendarSources.sourceType, "google"),
            eq(calendarSources.accountId, acct.id),
          ),
        );
    }
    return json({ ok: true });
  }

  if (action === "disableEmail") {
    // Local opt-out only: drop the Gmail scopes from the stored list (the
    // Google-side grant stays until revoked in the Google Account console).
    if (!acct) return json({ error: "not connected" }, 400);
    await db
      .update(googleAccounts)
      .set({
        scopes: (acct.scopes ?? []).filter(
          (s) => !s.includes("gmail.readonly") && !s.includes("gmail.metadata"),
        ),
      })
      .where(eq(googleAccounts.id, acct.id));
    return json({ ok: true });
  }

  return json({ error: `unknown action: ${action}` }, 400);
}
