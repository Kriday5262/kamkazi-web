/**
 * Paged merged inbox (plain async handler, mounted by ./email-list.ts).
 *
 * GET /api/email-list[?fresh=1][&accountId=..][&pageToken=..]
 * → { emails: InboxEmail[], accounts: {id,label}[], nextToken: string|null }
 *
 * Each account contributes up to pageSize messages per request; when several
 * accounts have more pages we persist their per-account tokens inside one
 * opaque cursor. Read-only: gmail list + metadata GETs only.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleAccounts } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import { getFreshAccessToken, GMAIL_READONLY_SCOPE } from "@/server/google-oauth.server";
import { listEmailsPage, type GmailMessageSummary } from "@/server/gmail.server";

export interface InboxEmail extends GmailMessageSummary {
  account: string;
  /** google_accounts.id — used by /api/email-read to resolve the account. */
  accountId: string;
}

interface PageCursor {
  [accountId: string]: string; // gmail nextPageToken
}

export async function emailListHandler(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthorized", emails: [] }, 401);

  const url = new URL(request.url);
  const fresh = url.searchParams.get("fresh") === "1";
  const accountFilter = url.searchParams.get("accountId")?.trim() ?? "";
  const pageToken = url.searchParams.get("pageToken")?.trim() ?? "";
  const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? "25"), 5), 50);

  try {
    const accounts = await db
      .select()
      .from(googleAccounts)
      .where(eq(googleAccounts.userId, session.uid));
    let enabled = accounts.filter((a) => (a.scopes ?? []).includes(GMAIL_READONLY_SCOPE));
    if (accountFilter) enabled = enabled.filter((a) => a.id === accountFilter);

    const accountList = accounts
      .filter((a) => (a.scopes ?? []).includes(GMAIL_READONLY_SCOPE))
      .map((a) => ({ id: a.id, email: a.googleEmail }));

    // Decode the merged cursor: { <accountId>: <gmail token> }.
    let cursor: Record<string, string> = {};
    if (pageToken) {
      try {
        cursor = JSON.parse(Buffer.from(pageToken, "base64url").toString("utf8")) as Record<
          string,
          string
        >;
      } catch {
        cursor = {};
      }
    }

    const merged: InboxEmail[] = [];
    const nextCursor: Record<string, string> = {};

    await Promise.all(
      enabled.map(async (acct) => {
        try {
          const token = await getFreshAccessToken(acct);
          if (!token) return;
          const tok = cursor[acct.id] ?? "";
          const page = await listEmailsPage(token, {
            max: pageSize,
            fresh,
            // Inbox only — archive/all-mail stays out of the app's email view.
            query: "in:inbox",
            ...(tok ? { pageToken: tok } : {}),
          });
          for (const m of page.messages)
            merged.push({ ...m, account: acct.googleEmail, accountId: acct.id });
          if (page.nextPageToken) nextCursor[acct.id] = page.nextPageToken;
        } catch (e) {
          console.error(
            `[email-list] ${acct.googleEmail} failed:`,
            e instanceof Error ? e.message : e,
          );
        }
      }),
    );

    merged.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
    const nextToken =
      Object.keys(nextCursor).length > 0
        ? Buffer.from(JSON.stringify(nextCursor)).toString("base64url")
        : null;
    return json({
      emails: merged,
      accounts: accounts
        .filter((a) => (a.scopes ?? []).includes(GMAIL_READONLY_SCOPE))
        .map((a) => ({ id: a.id, email: a.googleEmail })),
      nextToken,
    });
  } catch (err) {
    console.error("[email-list] failed:", err);
    return json({ emails: [], accounts: [], nextToken: null });
  }
}