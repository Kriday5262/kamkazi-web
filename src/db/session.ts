import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal HMAC-signed cookie session (Stage 1 single-user auth).
 *
 * Cookie format:  base64url(JSON payload) + "." + base64url(HMAC-SHA256)
 * Payload:        { uid: string, username: string, exp: number }
 *
 * Deliberately dependency-free; swap for iron-session/JWT + a users table in
 * the multi-user stage. The signature is verified server-side on every
 * request; the uid in the payload is the ONLY way a user id is ever resolved —
 * client code never sends one.
 */

const SESSION_COOKIE = "kamkazi_session";
export const SESSION_COOKIE_NAME = SESSION_COOKIE;
const SESSION_TTL_S = 30 * 24 * 60 * 60; // 30 days

const secret = () => process.env["SESSION_SECRET"] ?? "dev-only-change-me";

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

const sign = (payload: string) =>
  createHmac("sha256", secret()).update(payload).digest("base64url");

export interface SessionPayload {
  uid: string;
  username: string;
  exp: number;
}

export function createSessionToken(uid: string, username: string): string {
  const payload: SessionPayload = {
    uid,
    username,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token: string): string {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_S}`,
  ];
  // Vite dev serves over http; production build behind TLS should set Secure.
  if (process.env["NODE_ENV"] === "production") attrs.push("Secure");
  return attrs.join("; ");
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Read + verify the session from a raw Cookie header value. */
export function getSessionFromCookieHeader(
  cookieHeader: string | undefined | null,
): SessionPayload | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      return verifySessionToken(rest.join("="));
    }
  }
  return null;
}
