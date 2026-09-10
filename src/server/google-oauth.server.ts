/**
 * Stage 4.5 — Google Calendar OAuth 2.0 (read-only) helpers.
 *
 * GOOGLE_API_BASE / GOOGLE_TOKEN_BASE env overrides exist purely as a test
 * seam for the mocked integration test (defaults are Google's real endpoints).
 */
import { createHmac, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { googleAccounts, userSettings } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/server/crypto.server";

const API_BASE = process.env["GOOGLE_API_BASE"] ?? "https://www.googleapis.com";
/** Google REST base — shared with gmail.server.ts (env override = test seam). */
export const API_BASE_EXPORT = API_BASE;
const TOKEN_BASE = process.env["GOOGLE_TOKEN_BASE"] ?? "https://oauth2.googleapis.com";
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
/** Gmail read-only scopes for the per-account "Enable email" incremental consent. */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.metadata",
];
export const GMAIL_READONLY_SCOPE: string = "https://www.googleapis.com/auth/gmail.readonly";

/** True when the account's stored scopes include gmail.readonly. */
export function accountHasEmail(acct: GoogleAccount): boolean {
  return (acct.scopes ?? []).includes(GMAIL_READONLY_SCOPE);
}

export function googleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env["GOOGLE_CLIENT_ID"] ?? "";
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"] ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Signed state nonce (nonce + HMAC) so callbacks can't be forged. */
export function makeSignedState(): string {
  const nonce = randomBytes(12).toString("base64url");
  const secret = process.env["SESSION_SECRET"] ?? "dev-only-change-me";
  const sig = createHmac("sha256", secret).update(`gstate:${nonce}`).digest("base64url");
  return `${nonce}.${sig}`;
}

export function verifySignedState(state: string): boolean {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return false;
  const nonce = state.slice(0, dot);
  const secret = process.env["SESSION_SECRET"] ?? "dev-only-change-me";
  const expected = createHmac("sha256", secret).update(`gstate:${nonce}`).digest("base64url");
  return state.slice(dot + 1) === expected;
}

export function buildAuthUrl(
  redirectUri: string,
  clientId: string,
  state: string,
  extraScopes: string[] = [],
): string {
  const scopes = [...new Set([GOOGLE_SCOPE, ...extraScopes])].join(" ");
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  /** Space-separated granted scopes (Google returns this on exchange). */
  scope?: string;
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenSet> {
  const res = await fetch(`${TOKEN_BASE}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`token exchange failed: HTTP ${res.status}`);
  return (await res.json()) as TokenSet;
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenSet> {
  const res = await fetch(`${TOKEN_BASE}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`token refresh failed: HTTP ${res.status}`);
  return (await res.json()) as TokenSet;
}

/** Row type with decrypted tokens. */
export type GoogleAccount = typeof googleAccounts.$inferSelect;

/** OAuth client credentials: env fallback → user_settings (stored at connect time). */
export async function resolveGoogleCredentials(userId: string): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  const env = googleCredentials();
  if (env) return env;
  const rows = await db
    .select({ settings: userSettings.settings })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const s = (rows[0]?.settings ?? {}) as {
    googleClientId?: string;
    googleClientSecret?: string;
  };
  if (s.googleClientId && s.googleClientSecret) {
    return { clientId: s.googleClientId, clientSecret: s.googleClientSecret };
  }
  return null;
}

/** Get a valid access token for the account, refreshing (and persisting) if expired. */
export async function getFreshAccessToken(acct: GoogleAccount): Promise<string | null> {
  const creds = await resolveGoogleCredentials(acct.userId);
  const notExpired = acct.tokenExpiresAt && acct.tokenExpiresAt.getTime() - 60_000 > Date.now();
  if (notExpired || !creds) {
    if (!acct.accessTokenEnc) return null;
    try {
      const token = decryptSecret(acct.accessTokenEnc);
      // Expired token with creds available should refresh, so only return the
      // cached token when it's still valid (or creds are missing entirely).
      if (notExpired || !creds) return token;
      // fall through to refresh below
    } catch {
      return null;
    }
  }
  if (!acct.refreshTokenEnc) {
    await db
      .update(googleAccounts)
      .set({ lastStatus: "revoked" })
      .where(eq(googleAccounts.id, acct.id));
    return null;
  }
  try {
    const rt = decryptSecret(acct.refreshTokenEnc);
    const ts = await refreshAccessToken(rt, creds.clientId, creds.clientSecret);
    await db
      .update(googleAccounts)
      .set({
        accessTokenEnc: encryptSecret(ts.access_token),
        tokenExpiresAt: new Date(Date.now() + ts.expires_in * 1000),
        lastStatus: "ok",
      })
      .where(eq(googleAccounts.id, acct.id));
    return ts.access_token;
  } catch {
    await db
      .update(googleAccounts)
      .set({ lastStatus: "revoked" })
      .where(eq(googleAccounts.id, acct.id));
    return null;
  }
}

export async function getGoogleAccount(uid: string): Promise<GoogleAccount | null> {
  const rows = await db
    .select()
    .from(googleAccounts)
    .where(eq(googleAccounts.userId, uid))
    .limit(1);
  return rows[0] ?? null;
}

export interface GCalendar {
  id: string;
  summary: string;
  primary?: boolean | undefined;
}

export async function listGoogleCalendars(accessToken: string): Promise<GCalendar[]> {
  const res = await fetch(`${API_BASE}/calendar/v3/users/me/calendarList?maxResults=250`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(`calendarList failed: HTTP ${res.status}`);
  const data = (await res.json()) as {
    items?: { id: string; summary?: string; primary?: boolean }[];
  };
  return (data.items ?? []).map((i) => ({
    id: i.id,
    summary: i.summary ?? i.id,
    primary: i.primary === true ? true : undefined,
  }));
}

export interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export async function fetchGoogleEvents(
  accessToken: string,
  calId: string,
  calIdEnc: string,
): Promise<GEvent[]> {
  const now = new Date();
  const timeMin = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const timeMax = new Date(now.getTime() + 90 * 86_400_000).toISOString();
  const p = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
  });
  const out: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    if (pageToken) p.set("pageToken", pageToken);
    const res = await fetch(
      `${API_BASE}/calendar/v3/calendars/${encodeURIComponent(calIdEnc)}/events?${p.toString()}`,
      {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(25_000),
      },
    );
    if (res.status === 401) throw new Error("UNAUTHORIZED");
    if (!res.ok) throw new Error(`events fetch failed: HTTP ${res.status}`);
    const data = (await res.json()) as { items?: GEvent[]; nextPageToken?: string };
    out.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken && out.length < 2500);
  void calId;
  return out;
}

/** Google may include the calendar's own id; keep ids URL-safe for route use. */
export async function accountForCalendars(uid: string): Promise<GoogleAccount | null> {
  return getGoogleAccount(uid);
}

export async function ownedAccount(uid: string, accountId: string): Promise<GoogleAccount | null> {
  const rows = await db
    .select()
    .from(googleAccounts)
    .where(and(eq(googleAccounts.id, accountId), eq(googleAccounts.userId, uid)))
    .limit(1);
  return rows[0] ?? null;
}
