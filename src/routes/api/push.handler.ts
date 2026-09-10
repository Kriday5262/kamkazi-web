/**
 * Stage 5 — push API handlers (subscription lifecycle, VAPID key, test sends,
 * dev tick). Each function takes the raw Request and reads its own session.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import {
  pushToUser,
  removeSubscription,
  vapidConfigured,
  vapidPublicKey,
} from "@/server/push.server";
import { emailConfigured, mailFrom, sendMail } from "@/server/email.server";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  loadNotificationSettings,
  runReminderTick,
  saveNotificationSettings,
  type NotificationSettings,
} from "@/server/reminders.server";
import { startReminderScheduler } from "@/server/reminders.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function unauth(): Response {
  return json({ error: "unauthorized" }, 401);
}

/** GET /api/push — VAPID public key + current notification settings + devices. */
export async function pushInfoHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return unauth();
  // Kick the scheduler idempotently on any authenticated push API hit.
  startReminderScheduler();
  const { settings } = await loadNotificationSettings(session.uid);
  const devices = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      userAgent: pushSubscriptions.userAgent,
      createdAtTs: pushSubscriptions.createdAtTs,
      lastUsedTs: pushSubscriptions.lastUsedTs,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, session.uid));
  return json({
    vapidPublicKey: vapidPublicKey(),
    vapidConfigured: vapidConfigured(),
    emailConfigured: emailConfigured(),
    emailFrom: mailFrom(),
    notificationSettings: settings,
    devices,
  });
}

/** POST /api/push/subscribe — store a per-device subscription. */
export async function pushSubscribeHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return unauth();
  const body = (await request.json()) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
  };
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return json({ error: "endpoint and keys.p256dh/keys.auth are required" }, 400);
  }
  const id = `ps_${crypto.randomUUID()}`;
  await db
    .insert(pushSubscriptions)
    .values({
      id,
      userId: session.uid,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: body.userAgent ?? request.headers.get("user-agent") ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: session.uid, p256dh: body.keys.p256dh, auth: body.keys.auth },
    });
  return json({ ok: true, id });
}

/** POST /api/push/unsubscribe — remove one device by endpoint. */
export async function pushUnsubscribeHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return unauth();
  const { endpoint } = (await request.json()) as { endpoint?: string };
  if (!endpoint) return json({ error: "endpoint required" }, 400);
  await removeSubscription(session.uid, endpoint);
  return json({ ok: true });
}

/** POST /api/push/test — send a test push to all devices. */
export async function pushTestHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return unauth();
  if (!vapidConfigured()) {
    return json(
      { ok: false, error: "VAPID keys not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)" },
      400,
    );
  }
  const attempts = await pushToUser(session.uid, {
    title: "Kamkazi test push",
    body: "Push notifications are working.",
    url: "/settings",
    tag: "test",
  });
  return json({ ok: true, attempts });
}

/** POST /api/push/test-email — SendGrid test mail. */
export async function testEmailHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return unauth();
  const { settings } = await loadNotificationSettings(session.uid);
  const body = (await request.json().catch(() => ({}))) as { to?: string };
  const to = body.to ?? settings.emailTo ?? mailFrom();
  if (!to)
    return json({ ok: false, error: "No recipient: set an email in notification settings" }, 400);
  const r = await sendMail(
    to,
    "Kamkazi test email",
    "Email notifications are working.\n\n— Kamkazi",
  );
  return json(
    { ok: r.ok, status: r.status, error: r.error, to },
    { 202: 200 }[r.status ?? 0] ?? (r.ok ? 200 : 502),
  );
}

/** POST /api/push/settings — update notification settings. */
export async function pushSettingsHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return unauth();
  const patch = (await request.json()) as Partial<NotificationSettings>;
  const next = await saveNotificationSettings(session.uid, patch);
  return json({ ok: true, notificationSettings: next });
}

/** POST /api/push/tick — dev-only manual scheduler pass (auth required). */
export async function pushTickHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return unauth();
  const result = await runReminderTick(true);
  return json({ ok: true, result });
}

/** POST /api/push/tick-check — verify idempotency without force (no re-send). */
export async function pushTickCheckHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return unauth();
  const result = await runReminderTick(false);
  return json({ ok: true, result });
}

export { DEFAULT_NOTIFICATION_SETTINGS };

/** GET /api/push/vapid-key. */
export async function vapidKeyHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return unauth();
  return json({ publicKey: vapidPublicKey(), configured: vapidConfigured() });
}

// keep drizzle import used for type narrowing in future filters
void and;
