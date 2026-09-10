/**
 * Email read logic (plain async handler, mounted by ./email-read.ts).
 *
 * GET /api/email-read?accountId=<google_account_id>&id=<gmail msg id>
 *
 * Read-only: fetches the full message body via the existing readEmail()
 * helper (format=full — Gmail does not change read state on GET; we never
 * call modify). Never marks the email as read. Email bodies are NOT stored.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { googleAccounts } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import { getFreshAccessToken, GMAIL_READONLY_SCOPE } from "@/server/google-oauth.server";
import { readEmail } from "@/server/gmail.server";

export async function emailReadHandler(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId")?.trim() ?? "";
  const msgId = url.searchParams.get("id")?.trim() ?? "";
  if (!accountId || !msgId) {
    return json({ error: "Missing accountId or id parameter" }, 400);
  }

  try {
    // Account must belong to the session user AND have the gmail scope.
    const [acct] = await db
      .select()
      .from(googleAccounts)
      .where(and(eq(googleAccounts.id, accountId), eq(googleAccounts.userId, session.uid)))
      .limit(1);

    if (!acct) return json({ error: "Email account not found" }, 404);
    if (!(acct.scopes ?? []).includes(GMAIL_READONLY_SCOPE)) {
      return json({ error: "Gmail scope not granted for this account" }, 403);
    }

    const token = await getFreshAccessToken(acct);
    if (!token) return json({ error: "Could not refresh Gmail access token" }, 401);

    const msg = await readEmail(token, msgId);
    return json({ email: msg });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read email";
    console.error("[email-read] failed:", message);
    if (message.includes("not found")) return json({ error: message }, 404);
    return json({ error: message || "Failed to read email" }, 502);
  }
}
