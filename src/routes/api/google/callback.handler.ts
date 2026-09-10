/**
 * Stage 4.5 — GET /api/google/callback: exchange the OAuth code for tokens,
 * store them (refresh token AES-256-GCM encrypted), then redirect to
 * /calendar?google=connected. Handles consent-denied / error params
 * gracefully with a friendly message.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleAccounts, userSettings } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import { encryptSecret } from "@/server/crypto.server";
import {
  exchangeCode,
  GMAIL_READONLY_SCOPE,
  googleCredentials,
  listGoogleCalendars,
  makeSignedState,
  verifySignedState,
} from "@/server/google-oauth.server";
import { startGoogleSyncScheduler } from "@/server/google-sync.server";

function originOf(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export async function googleCallbackHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = originOf(request);
  const back = (qs: string) => Response.redirect(`${origin}/calendar?${qs}`, 302);

  const error = url.searchParams.get("error");
  if (error) {
    const msg =
      error === "access_denied"
        ? "Google consent was denied. You can try again anytime from Settings → Calendar."
        : `Google sign-in failed: ${error}`;
    return back(`google=error&message=${encodeURIComponent(msg)}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const session = sessionFromRequest(request);
  if (!session) return Response.redirect(`${origin}/login`, 302);
  if (!code) {
    return back(
      "google=error&message=" +
        encodeURIComponent("Missing authorization code — please start the connection again."),
    );
  }
  if (!verifySignedState(state)) {
    return back(
      "google=error&message=" +
        encodeURIComponent("Invalid state — please start the connection again."),
    );
  }

  const clientId = url.searchParams.get("client_id") ?? "";
  const clientSecret = url.searchParams.get("client_secret") ?? "";
  // Google does not echo client credentials on the callback — fall back to the
  // ones persisted at /api/google/auth time (or env), in the same priority order.
  let effClientId = clientId;
  let effClientSecret = clientSecret;
  if (!effClientId || !effClientSecret) {
    const rows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, session.uid))
      .limit(1);
    const s = (rows[0]?.settings ?? {}) as { googleClientId?: string; googleClientSecret?: string };
    effClientId = effClientId || s.googleClientId || "";
    effClientSecret = effClientSecret || s.googleClientSecret || "";
  }
  if (!effClientId || !effClientSecret) {
    const env = googleCredentials();
    effClientId = effClientId || env?.clientId || "";
    effClientSecret = effClientSecret || env?.clientSecret || "";
  }
  if (!effClientId || !effClientSecret) {
    return back(
      "google=error&message=" +
        encodeURIComponent(
          "Google client credentials missing — re-enter them in Settings → Calendar.",
        ),
    );
  }

  try {
    const redirectUri = `${origin}/api/google/callback`;
    const tokens = await exchangeCode(code, redirectUri, effClientId, effClientSecret);

    // Discover the account email + calendars.
    let email = "";
    let calIds: string[] = [];
    try {
      const cals = await listGoogleCalendars(tokens.access_token);
      calIds = cals.map((c) => c.id).slice(0, 25);
      const primary = cals.find((c) => c.primary);
      email = primary?.summary ?? "";
    } catch {
      // calendar list discovery is best-effort; sync can still work
    }

    const allAccounts = await db
      .select()
      .from(googleAccounts)
      .where(eq(googleAccounts.userId, session.uid));
    // Stage 5.5 — multi-account: dedupe by google EMAIL. Reconnecting the same
    // Google account refreshes its tokens in place; a different email is a NEW
    // connected account row.
    const existing = email ? allAccounts.filter((a) => a.googleEmail === email) : [];
    // Incremental authorization: Google may grant only the newly-requested
    // scopes on a re-consent, so merge what it returned this time with what
    // the account already has (never lose calendar access).
    const granted = (tokens.scope ?? "").split(/\s+/).filter(Boolean);
    const prevScopes = existing[0]?.scopes ?? [];
    const mergedScopes = [...new Set([...prevScopes, ...granted])];
    if (
      granted.length > 0 &&
      !granted.includes("https://www.googleapis.com/auth/calendar.readonly")
    ) {
      // tokens.scope omitted the calendar scope (standard connect flow always
      // grants it; an incremental Gmail consent may omit it) — keep it anyway.
      mergedScopes.push("https://www.googleapis.com/auth/calendar.readonly");
    }
    if (mergedScopes.length === 0) {
      mergedScopes.push("https://www.googleapis.com/auth/calendar.readonly");
      if (url.searchParams.get("email") === "1" || prevScopes.includes(GMAIL_READONLY_SCOPE)) {
        mergedScopes.push(GMAIL_READONLY_SCOPE);
      }
    }
    const values = {
      googleEmail: email,
      accessTokenEnc: encryptSecret(tokens.access_token),
      refreshTokenEnc: tokens.refresh_token
        ? encryptSecret(tokens.refresh_token)
        : (existing[0]?.refreshTokenEnc ?? null),
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: mergedScopes,
      lastStatus: "connected",
      lastSyncedTs: null,
    };
    let acctId: string;
    if (existing[0]) {
      acctId = existing[0].id;
      await db.update(googleAccounts).set(values).where(eq(googleAccounts.id, acctId));
      if (existing[0].selectedCalendars.length === 0) {
        await db
          .update(googleAccounts)
          .set({
            selectedCalendars: calIds.filter((c) => c.endsWith("@gmail.com") || c.includes("@")),
          })
          .where(eq(googleAccounts.id, acctId));
      }
    } else {
      acctId = `ga_${Math.random().toString(36).slice(2, 12)}`;
      await db.insert(googleAccounts).values({
        id: acctId,
        userId: session.uid,
        selectedCalendars: calIds.filter((c) => c.endsWith("@gmail.com") || c.includes("@")),
        connectedAt: new Date(),
        ...values,
      });
    }

    // Persist the client id/secret in user_settings so future flows don't need
    // query params (only if the user passed them in the URL).
    if (url.searchParams.get("client_id")) {
      const srow = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, session.uid))
        .limit(1);
      const merged = {
        ...((srow[0]?.settings ?? {}) as Record<string, unknown>),
        googleClientId: clientId,
        googleClientSecret: clientSecret,
      };
      if (srow[0]) {
        await db
          .update(userSettings)
          .set({ settings: merged, updatedAtTs: new Date() })
          .where(eq(userSettings.userId, session.uid));
      } else {
        await db.insert(userSettings).values({ userId: session.uid, settings: merged });
      }
    }

    void makeSignedState(); // nonce is stateless (HMAC) — nothing to persist
    startGoogleSyncScheduler();
    await db
      .update(googleAccounts)
      .set({ lastStatus: "pending first sync" })
      .where(eq(googleAccounts.id, acctId));
    return back("google=connected");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return back("google=error&message=" + encodeURIComponent(msg.slice(0, 200)));
  }
}
