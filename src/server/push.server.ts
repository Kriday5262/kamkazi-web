/**
 * Stage 5 — Web push (VAPID) delivery layer.
 *
 * Uses the `web-push` npm package. Keys come from .env (VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY, generated once via `npm run push:generate`).
 *
 * Subscriptions live in push_subscriptions (one row per device). Endpoints
 * that answer 404/410 are pruned — the device unsubscribed or its push
 * registration expired (typical iOS behaviour after ~7 idle days).
 */
import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export function vapidConfigured(): boolean {
  return Boolean(process.env["VAPID_PUBLIC_KEY"] && process.env["VAPID_PRIVATE_KEY"]);
}

let configured = false;
function ensureVapid(): boolean {
  if (!vapidConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env["WEBPUSH_SUBJECT"] ?? "mailto:noreply@kamkazi.com",
      process.env["VAPID_PUBLIC_KEY"]!,
      process.env["VAPID_PRIVATE_KEY"]!,
    );
    configured = true;
  }
  return true;
}

/** The public key the browser needs for pushManager.subscribe(). */
export function vapidPublicKey(): string | null {
  return process.env["VAPID_PUBLIC_KEY"] ?? null;
}

export interface PushAttempt {
  endpoint: string;
  ok: boolean;
  /** 404/410 → subscription is gone and must be pruned. */
  gone?: boolean;
  error?: string;
}

/**
 * Send a push to every subscribed device of one user. Returns per-device
 * attempts; callers mark rows for pruning when `gone` is true.
 */
export async function pushToUser(userId: string, payload: PushPayload): Promise<PushAttempt[]> {
  if (!ensureVapid()) return [];
  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  const attempts: PushAttempt[] = [];
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        JSON.stringify(payload),
        { TTL: 3600 },
      );
      attempts.push({ endpoint: row.endpoint, ok: true });
      await db
        .update(pushSubscriptions)
        .set({ lastUsedTs: new Date() })
        .where(eq(pushSubscriptions.id, row.id));
    } catch (err) {
      const e = err as { statusCode?: number; message?: string };
      const gone = e.statusCode === 404 || e.statusCode === 410;
      attempts.push({
        endpoint: row.endpoint,
        ok: false,
        gone,
        error: e.message ?? String(err),
      });
      if (gone) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id));
    }
  }
  return attempts;
}

/** Delete one device subscription (user-initiated unsubscribe). */
export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}
