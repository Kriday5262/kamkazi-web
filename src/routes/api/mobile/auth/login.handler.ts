/** Handler for POST /api/mobile/auth/login — native app credential check + token issue. */
import { mobileJson } from "@/server/mobile-auth.server";

export async function mobileLoginHandler(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
    deviceName?: string;
  };
  const expectedUser = process.env["KAMKAZI_USERNAME"] ?? "Shantanu";
  const expectedPass = process.env["KAMKAZI_PASSWORD"] ?? "SmartHome@2012";
  if (!body.username || !body.password || body.username !== expectedUser || body.password !== expectedPass) {
    return mobileJson({ ok: false, error: "Incorrect username or password" }, 401);
  }
  const { db } = await import("@/db");
  const { users, apiTokens } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { newApiToken } = await import("@/server/mobile-auth.server");
  const uid = "u_shantanu";
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, uid)).limit(1);
  if (existing.length === 0) {
    await db.insert(users).values({ id: uid, username: expectedUser, password: "(stage1)" });
  }
  const { raw, id } = newApiToken();
  await db.insert(apiTokens).values({ id, userId: uid, deviceName: String(body.deviceName ?? "iPhone") });
  return mobileJson({ ok: true, token: raw, username: expectedUser });
}