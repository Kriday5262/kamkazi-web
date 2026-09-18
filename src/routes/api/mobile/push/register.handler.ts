/**
 * POST /api/mobile/push/register { deviceToken, platform, kinds? }
 * — store an APNs device token for the signed-in user.
 * Tokens go in a new push_tokens table (JSONB per-row for kinds prefs).
 */
import { mobileAuth, mobileJson, mobileUnauthorized } from "@/server/mobile-auth.server";

export async function mobilePushRegisterHandler(request: Request): Promise<Response> {
  const session = await mobileAuth(request);
  if (!session) return mobileUnauthorized();
  const body = (await request.json().catch(() => ({}))) as {
    deviceToken?: string;
    platform?: string;
    kinds?: Record<string, boolean>;
  };
  const token = body.deviceToken?.trim();
  if (!token || token.length < 16) return mobileJson({ ok: false, error: "Invalid device token" }, 400);

  const { db } = await import("@/db");
  const { pushTokens } = await import("@/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const id = `pt_${token.slice(0, 32)}`;
  const existing = await db.select({ id: pushTokens.id }).from(pushTokens).where(eq(pushTokens.id, id)).limit(1);
  const values = {
    id,
    userId: session.uid,
    deviceToken: token,
    platform: body.platform ?? "ios",
    kinds: body.kinds ?? { email: true, tasks: true, events: true },
    updatedAtTs: new Date(),
  };
  if (existing.length > 0) {
    await db.update(pushTokens).set(values).where(eq(pushTokens.id, id));
  } else {
    await db.insert(pushTokens).values(values);
  }
  return mobileJson({ ok: true });
}