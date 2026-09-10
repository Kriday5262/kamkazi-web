/**
 * POST /api/email-ignore { key: "<accountId>|<messageId>", ignored: true|false }
 *
 * App-side hide: the ignore list lives in user_settings.settings["emailIgnored"]
 * as { "<accountId>|<messageId>": true }. Gmail is never touched. Merges the
 * settings blob (same rule as saveSettingsFn — never overwrite server-only keys).
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";

export async function emailIgnoreHandler(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthorized" }, 401);

  let payload: { key?: string; ignored?: boolean };
  try {
    payload = (await request.json()) as { key?: string; ignored?: boolean };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const key = payload.key?.trim() ?? "";
  if (!key || !key.includes("|")) return json({ error: "Missing or malformed key" }, 400);
  const ignored = payload.ignored !== false;

  try {
    const [row] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, session.uid))
      .limit(1);
    const settings = { ...((row?.settings ?? {}) as Record<string, unknown>) };
    const list = { ...((settings["emailIgnored"] ?? {}) as Record<string, boolean>) };
    if (ignored) list[key] = true;
    else delete list[key];
    settings["emailIgnored"] = list;

    if (row) {
      await db
        .update(userSettings)
        .set({ settings, updatedAtTs: new Date() })
        .where(eq(userSettings.userId, session.uid));
    } else {
      await db.insert(userSettings).values({ userId: session.uid, settings });
    }
    return json({ ok: true, ignored });
  } catch (err) {
    console.error("[email-ignore] failed:", err instanceof Error ? err.message : err);
    return json({ error: "Failed to update ignore list" }, 500);
  }
}