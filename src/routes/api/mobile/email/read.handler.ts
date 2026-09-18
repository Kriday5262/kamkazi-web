/**
 * GET /api/mobile/email/read?accountId=&id= — full message body for the
 * native app (sanitized HTML + text + attachment metadata, mirrors web).
 */
import { mobileAuth, mobileJson, mobileUnauthorized } from "@/server/mobile-auth.server";
import { db } from "@/db";
import { googleAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getFreshAccessToken } from "@/server/google-oauth.server";
import { readEmail } from "@/server/gmail.server";

export async function mobileEmailReadHandler(request: Request): Promise<Response> {
  const session = await mobileAuth(request);
  if (!session) return mobileUnauthorized();
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId")?.trim() ?? "";
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (!id || !accountId) return mobileJson({ ok: false, error: "Missing id or accountId" }, 400);

  const rows = await db
    .select()
    .from(googleAccounts)
    .where(and(eq(googleAccounts.id, accountId), eq(googleAccounts.userId, session.uid)))
    .limit(1);
  const acct = rows[0];
  if (!acct) return mobileJson({ ok: false, error: "Account not found" }, 404);

  try {
    const access = await getFreshAccessToken(acct);
    if (!access) return mobileJson({ ok: false, error: "Account needs reconnection in Settings" }, 409);
    const msg = await readEmail(access, id);
    return mobileJson({ ok: true, email: msg });
  } catch (e) {
    return mobileJson({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}