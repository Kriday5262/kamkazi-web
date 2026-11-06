/**
 * Apple Reminders sync — API handlers for /api/apple/reminders.
 *
 * GET   → { connected, enabled, appleId?, listNames, lists?: [{url,name}], lastSyncTs, lastError }
 * POST  → actions:
 *   { action: "connect", appleId, appPassword, listNames? }  (stores encrypted creds)
 *   { action: "disconnect" }                                  (removes creds + stops sync)
 *   { action: "setEnabled", enabled }                          (pause/resume)
 *   { action: "syncNow" }                                     (immediate sync pass)
 *   { action: "setLists", listNames }                          (choose lists)
 */
import { sessionFromRequest } from "@/server/session.util";
import { decryptSecret } from "@/server/crypto.server";
import { listReminderCalendars } from "@/server/apple-caldav.server";
import {
  getAppleConfigForUser,
  saveAppleConfigForUser,
  syncUserReminders,
} from "@/server/apple-reminders-sync.server";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function appleRemindersHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthenticated" }, 401);
  const uid = session.uid;

  const cfg = await getAppleConfigForUser(uid);
  const connected = Boolean(cfg);
  return json({
    connected,
    enabled: cfg?.enabled ?? false,
    appleId: cfg?.appleId ?? null,
    listNames: cfg?.listNames ?? [],
    lastError: null,
  });
}

export async function appleRemindersPostHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthenticated" }, 401);
  const uid = session.uid;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const action = String(body["action"] ?? "");

  try {
    if (action === "connect") {
      const appleId = String(body["appleId"] ?? "").trim();
      const appPassword = String(body["appPassword"] ?? "").trim();
      if (!appleId || !appPassword)
        return json({ error: "Apple ID and app password are both required" }, 400);
      const listNames = Array.isArray(body["listNames"])
        ? (body["listNames"] as unknown[]).map(String)
        : undefined;

      // Validate credentials BEFORE storing: discover lists (throws on 401).
      const auth = { username: appleId, password: appPassword };
      const lists = await listReminderCalendars(appleId, appPassword);

      await saveAppleConfigForUser(uid, {
        appleId,
        appPassword,
        listNames: listNames ?? ["Reminders", "Routine"],
      });
      return json({ ok: true, lists: lists.map((l) => ({ name: l.name, url: l.url })) });
    }

    if (action === "disconnect") {
      const rows = await db
        .select({ settings: userSettings.settings })
        .from(userSettings)
        .where(eq(userSettings.userId, uid))
        .limit(1);
      const blob = (rows[0]?.settings ?? {}) as Record<string, unknown>;
      const next = { ...blob };
      delete next["appleReminders"];
      delete next["appleRemindersSyncState"];
      await db
        .insert(userSettings)
        .values({ userId: uid, settings: next, updatedAtTs: new Date() })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: { settings: next, updatedAtTs: new Date() },
        });
      return json({ ok: true });
    }

    if (action === "setEnabled") {
      const enabled = Boolean(body["enabled"]);
      await saveAppleConfigForUser(uid, { enabled });
      return json({ ok: true, enabled });
    }

    if (action === "setLists") {
      const listNames = Array.isArray(body["listNames"])
        ? (body["listNames"] as unknown[]).map(String)
        : [];
      await saveAppleConfigForUser(uid, { listNames });
      return json({ ok: true, listNames });
    }

    if (action === "syncNow") {
      const stats = await syncUserReminders(uid);
      return json(stats, stats.ok ? 200 : 400);
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 400);
  }
}

// decryptSecret is imported for completeness of the module surface; unused here.
void decryptSecret;
