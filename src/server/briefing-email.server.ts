/**
 * Gmail unread digest for the daily briefing (server-only helper).
 * Never throws — returns "" when nothing is available so the briefing
 * degrades gracefully (no email-enabled accounts, fetch error, timeout).
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { googleAccounts, userSettings } from "@/db/schema";
import { getFreshAccessToken, GMAIL_READONLY_SCOPE } from "@/server/google-oauth.server";
import { listRecentEmails } from "@/server/gmail.server";

const GMAIL_TIMEOUT_MS = 10_000;

export async function unreadInboxDigest(uid: string, topN = 5): Promise<string> {
  try {
    // Setting gate: 'emailDigest' (default true).
    const srows = await db
      .select({ settings: userSettings.settings })
      .from(userSettings)
      .where(eq(userSettings.userId, uid))
      .limit(1);
    const s = (srows[0]?.settings ?? {}) as { emailDigest?: boolean };
    if (s.emailDigest === false) return "";

    const rows = await db.select().from(googleAccounts).where(eq(googleAccounts.userId, uid));
    const enabled = rows.filter((a) => (a.scopes ?? []).includes(GMAIL_READONLY_SCOPE));
    if (enabled.length === 0) return "";

    const all: { acctEmail: string; date: string; from: string; subject: string; ts: number }[] =
      [];
    for (const acct of enabled) {
      try {
        const token = await getFreshAccessToken(acct);
        if (!token) continue;
        const msgs = await listRecentEmails(token, { max: 15, query: "is:unread newer_than:7d" });
        for (const m of msgs) {
          all.push({
            acctEmail: acct.googleEmail,
            date: m.date,
            from: m.from,
            subject: m.subject || "(no subject)",
            ts: Date.parse(m.date) || 0,
          });
        }
      } catch (e) {
        // Skip this account gracefully — never break the briefing.
        console.error(
          `[briefing-email] ${acct.googleEmail} failed:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
    if (all.length === 0) return "";
    all.sort((a, b) => b.ts - a.ts);
    const lines = all
      .slice(0, topN)
      .map(
        (m) =>
          `- [${m.acctEmail}] ${m.from || "(unknown sender)"} — ${m.subject}${
            m.ts
              ? ` (${new Date(m.ts).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })})`
              : ""
          }`,
      );
    return `\n\nUnread inbox (top ${lines.length}):\n${lines.join("\n")}`;
  } catch (e) {
    console.error("[briefing-email] digest skipped:", e instanceof Error ? e.message : e);
    return "";
  }
}

export { GMAIL_TIMEOUT_MS };
