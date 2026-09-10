/**
 * Server-only auth handlers. The `.server.ts` extension marks this file as
 * server-only for TanStack Start's import protection, so `setCookie` and the
 * node:crypto session helpers are safe to import at module scope here.
 *
 * These are PLAIN async functions, not createServerFn. In the production
 * (node-server) build, calling a nested createServerFn from inside another
 * server function fails with "Server function info not found ..." because
 * nested fn registration isn't emitted for prod; the client-facing server
 * functions in ./auth-client.ts import and call these directly.
 */
import { setCookie } from "@tanstack/react-start/server";

export type LoginInput = { username: string; password: string };

export async function loginHandler(data: LoginInput) {
  const { db } = await import("@/db");
  const { users } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { createSessionToken, SESSION_COOKIE_NAME } = await import("@/db/session");

  const expectedUser = process.env["KAMKAZI_USERNAME"] ?? "Shantanu";
  const expectedPass = process.env["KAMKAZI_PASSWORD"] ?? "SmartHome@2012";

  // Case-sensitive comparison.
  if (data.username !== expectedUser || data.password !== expectedPass) {
    return { ok: false as const, error: "Incorrect username or password" };
  }

  // Ensure the DB user row exists so every write can scope by uid.
  const uid = "u_shantanu";
  const existing = await db.select().from(users).where(eq(users.id, uid));
  if (existing.length === 0) {
    await db.insert(users).values({ id: uid, username: expectedUser, password: "(stage1)" });
  }

  setCookie(SESSION_COOKIE_NAME, createSessionToken(uid, expectedUser), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    secure: process.env["NODE_ENV"] === "production",
  });
  return { ok: true as const };
}

export async function logoutHandler() {
  const { SESSION_COOKIE_NAME } = await import("@/db/session");
  setCookie(SESSION_COOKIE_NAME, "", { path: "/", httpOnly: true, maxAge: 0 });
  return { ok: true as const };
}
