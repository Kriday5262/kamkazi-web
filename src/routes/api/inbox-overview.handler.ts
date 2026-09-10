/**
 * Inbox overview logic (plain async handler, mounted by ./inbox-overview.ts).
 *
 * GET /api/inbox-overview[?fresh=1] — top recent/unread emails across all
 * email-enabled Google accounts. Deterministic, merged + sorted by date,
 * account-tagged. Never throws: on failure returns { emails: [] }.
 * `fresh=1` bypasses the 5-min gmail TTL cache (manual refresh).
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleAccounts } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import { getFreshAccessToken, GMAIL_READONLY_SCOPE } from "@/server/google-oauth.server";
import { listRecentEmails, type GmailMessageSummary } from "@/server/gmail.server";

export interface InboxEmail extends GmailMessageSummary {
  account: string;
  /** google_accounts.id — used by /api/email-read to resolve the account. */
  accountId: string;
}

export async function inboxOverviewHandler(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthorized", emails: [] }, 401);

  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  const PER_ACCOUNT = 10;
  const TOP = 8;

  try {
    const accounts = await db
      .select()
      .from(googleAccounts)
      .where(eq(googleAccounts.userId, session.uid));
    const enabled = accounts.filter((a) => (a.scopes ?? []).includes(GMAIL_READONLY_SCOPE));

    const merged: InboxEmail[] = [];
    for (const acct of enabled) {
      try {
        const token = await getFreshAccessToken(acct);
        if (!token) continue;
        const msgs = await listRecentEmails(token, {
          max: PER_ACCOUNT,
          fresh,
        });
        for (const m of msgs) merged.push({ ...m, account: acct.googleEmail, accountId: acct.id });
      } catch (e) {
        // Per-account failures are skipped — other accounts still contribute.
        console.error(
          `[inbox-overview] ${acct.googleEmail} failed:`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    merged.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
    // Unread first would fight recency; spec says recent/unread blend — keep
    // strict recency but surface unread flag for the UI.
    return json({ emails: merged.slice(0, TOP) });
  } catch (err) {
    console.error("[inbox-overview] failed:", err);
    return json({ emails: [] });
  }
}
