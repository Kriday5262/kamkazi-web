/**
 * GET /api/mobile/email?accountId=&pageToken= — Bearer-auth merged inbox for
 * the native app. Reuses the web email-list handler logic by delegating with
 * a synthesized session cookie is not possible (cookie auth differs), so we
 * proxy: validate Bearer, then call emailListHandler with the app's own
 * session minted server-side.
 */
import { mobileAuth, mobileJson, mobileUnauthorized } from "@/server/mobile-auth.server";
import { db } from "@/db";
import { googleAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getFreshAccessToken, GMAIL_READONLY_SCOPE } from "@/server/google-oauth.server";
import { listEmailsPage } from "@/server/gmail.server";

export async function mobileEmailListHandler(request: Request): Promise<Response> {
  const session = await mobileAuth(request);
  if (!session) return mobileUnauthorized();
  const url = new URL(request.url);
  const accountFilter = url.searchParams.get("accountId")?.trim() ?? "";
  const pageToken = url.searchParams.get("pageToken")?.trim() ?? "";
  const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? "25"), 5), 50);

  try {
    const accounts = await db.select().from(googleAccounts).where(eq(googleAccounts.userId, session.uid));
    const enabled = accounts.filter((a) => (a.scopes ?? []).includes(GMAIL_READONLY_SCOPE));
    const accountList = enabled.map((a) => ({ id: a.id, email: a.googleEmail }));
    const chosen = accountFilter ? enabled.filter((a) => a.id === accountFilter) : enabled;

    interface Merged {
      id: string;
      threadId: string;
      subject: string;
      from: string;
      date: string;
      snippet: string;
      unread: boolean;
      account: string;
      accountId: string;
    }
    const merged: Merged[] = [];
    const cursor: Record<string, string> = pageToken
      ? (JSON.parse(Buffer.from(pageToken, "base64url").toString("utf8")) as Record<string, string>)
      : {};

    for (const acct of chosen) {
      try {
        const access = await getFreshAccessToken(acct);
        if (!access) continue;
        const page = await listEmailsPage(access, { max: pageSize, pageToken: cursor[acct.id] ?? "" });
        for (const m of page.messages) {
          merged.push({
            id: m.id,
            threadId: m.threadId,
            subject: m.subject,
            from: m.from,
            date: m.date,
            snippet: m.snippet,
            unread: m.unread,
            account: acct.googleEmail,
            accountId: acct.id,
          });
        }
        if (page.nextPageToken) cursor[acct.id] = page.nextPageToken;
        else delete cursor[acct.id];
      } catch {
        // per-account failure tolerated (e.g. revoked) — skip
      }
    }
    merged.sort((a, b) => (a.date < b.date ? 1 : -1));
    const remaining = Object.keys(cursor);
    const nextToken = remaining.length ? Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url") : null;
    return mobileJson({ emails: merged.slice(0, pageSize), accounts: accountList, nextToken });
  } catch (e) {
    return mobileJson({ emails: [], accounts: [], nextToken: null, error: String(e) }, 500);
  }
}