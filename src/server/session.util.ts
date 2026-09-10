/**
 * Session extraction shared by /api route handlers (server-only).
 *
 * Mirrors src/db/session.ts's HMAC cookie format but stays dependency-light
 * so it can be imported from Nitro route handlers without pulling the Drizzle
 * layer into files that don't need it.
 */
import { createHmac } from "node:crypto";

export interface SessionPayload {
  uid: string;
  username: string;
  exp: number;
}

export function sessionFromRequest(request: Request): SessionPayload | null {
  const secret = process.env["SESSION_SECRET"] ?? "dev-only-change-me";
  const cookie = request.headers.get("cookie") ?? "";
  const raw = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("kamkazi_session="));
  if (!raw) return null;
  const token = raw.slice("kamkazi_session=".length);
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (sig.length !== expected.length || sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
