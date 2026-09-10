/**
 * Stage 4.5 — GET /api/google/auth → redirect to Google's OAuth consent screen.
 *
 * Query params (optional): client_id, client_secret — allow storing the OAuth
 * client in user_settings instead of env. redirect_uri is derived from the
 * request origin so localhost testing works; in prod it resolves to
 * https://app.kamkazi.com/api/google/callback.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import {
  buildAuthUrl,
  GMAIL_SCOPES,
  googleCredentials,
  makeSignedState,
} from "@/server/google-oauth.server";

interface StoredSettings {
  googleClientId?: string;
  googleClientSecret?: string;
}

function originOf(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export async function googleAuthHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) {
    return Response.redirect(new URL("/login", request.url), 302);
  }
  const origin = originOf(request);
  const redirectUri = `${origin}/api/google/callback`;
  // "Enable email" flow: ?email=1 appends the Gmail read-only scopes to the
  // consent request (Google incremental authorization — the user only consents
  // to the new Gmail scopes; calendar access is preserved).
  const wantEmail = new URL(request.url).searchParams.get("email") === "1";

  // Credentials: request params (first-time setup via UI) → user_settings → env.
  const url = new URL(request.url);
  let clientId = url.searchParams.get("client_id") ?? "";
  let clientSecret = url.searchParams.get("client_secret") ?? "";
  if (!clientId || !clientSecret) {
    const rows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, session.uid))
      .limit(1);
    const s = (rows[0]?.settings ?? {}) as StoredSettings;
    clientId = clientId || s.googleClientId || "";
    clientSecret = clientSecret || s.googleClientSecret || "";
  }
  if (!clientId || !clientSecret) {
    const env = googleCredentials();
    clientId = clientId || env?.clientId || "";
    clientSecret = clientSecret || env?.clientSecret || "";
  }
  if (!clientId || !clientSecret) {
    return new Response(
      "Google Calendar is not configured yet. Add a Google OAuth Client ID first — see Notes → 'Connecting your Google Calendar', or set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.",
      { status: 400, headers: { "content-type": "text/plain" } },
    );
  }

  // Persist the credentials so /api/google/callback can use them (Google only
  // sends back code+state — it does not echo client_id/secret).
  await db
    .insert(userSettings)
    .values({
      userId: session.uid,
      settings: { googleClientId: clientId, googleClientSecret: clientSecret },
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        settings: sql`COALESCE(${userSettings.settings}, '{}'::jsonb) || ${JSON.stringify({
          googleClientId: clientId,
          googleClientSecret: clientSecret,
        })}::jsonb`,
        updatedAtTs: new Date(),
      },
    });

  const state = makeSignedState();
  const authUrl = buildAuthUrl(redirectUri, clientId, state, wantEmail ? GMAIL_SCOPES : []);
  return new Response(null, { status: 302, headers: { location: authUrl } });
}
