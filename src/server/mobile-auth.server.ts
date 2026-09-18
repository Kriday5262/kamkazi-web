/**
 * Mobile API auth (native-iOS P1).
 *
 - Login: POST /api/mobile/auth/login { username, password, deviceName? }
 *   → { token } — raw token returned once; only its SHA-256 is stored (api_tokens).
 * - Authenticated calls: `Authorization: Bearer <token>`.
 * - Reuse: same env credentials + user row as the web login handler.
 */
import { createHash } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function newApiToken(): { raw: string; id: string } {
  const raw =
    "kmk_" + Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  return { raw, id: sha256Hex(raw) };
}

export type MobileSession = { uid: string; username: string; tokenId: string };

/** Validate a Bearer token against api_tokens. */
export async function mobileAuth(request: Request): Promise<MobileSession | null> {
  const header = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m?.[1]) return null;
  const tokenId = sha256Hex(m[1].trim());
  try {
    const { db } = await import("@/db");
    const { apiTokens, users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({ userId: apiTokens.userId, username: users.username })
      .from(apiTokens)
      .innerJoin(users, eq(users.id, apiTokens.userId))
      .where(eq(apiTokens.id, tokenId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    void db.update(apiTokens).set({ lastUsedTs: new Date() }).where(eq(apiTokens.id, tokenId));
    return { uid: row.userId, username: row.username, tokenId };
  } catch {
    return null;
  }
}

export function mobileJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function mobileUnauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}