/**
 * Email summarize logic (plain async handler, mounted by ./email-summarize.ts).
 *
 * POST /api/email-summarize { accountId, id }
 * → { summary: string } — 1-2 short AI sentences about what the email implies
 * for the recipient (deadlines/asks included when present). Read-only: uses
 * readEmail() (format=full GET — never changes read state). Falls back to the
 * message snippet when the AI call fails or times out (8s cap).
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { googleAccounts, userSettings } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import { getFreshAccessToken, GMAIL_READONLY_SCOPE } from "@/server/google-oauth.server";
import { readEmail } from "@/server/gmail.server";
import { chatCompletion, resolveProvider, type AiSettings } from "@/server/ai.server";

export async function emailSummarizeHandler(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthorized" }, 401);

  let payload: { accountId?: string; id?: string };
  try {
    payload = (await request.json()) as { accountId?: string; id?: string };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const accountId = payload.accountId?.trim() ?? "";
  const msgId = payload.id?.trim() ?? "";
  if (!accountId || !msgId) return json({ error: "Missing accountId or id" }, 400);

  try {
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

    const msg = await readEmail(token, msgId); // read-only, never marks as read
    const body = (msg.body || msg.snippet || "").slice(0, 3000);
    const fallback = msg.snippet || "(no content)";

    const [settingsRow] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, session.uid))
      .limit(1);
    const settings = (settingsRow?.settings ?? {}) as AiSettings;

    try {
      const provider = resolveProvider(settings);
      const { content } = await chatCompletion({
        provider,
        timeoutMs: 8_000,
        messages: [
          {
            role: "system",
            content:
              "You summarize emails for a personal productivity app. Reply with the summary only — no preamble, no quotes, max 250 characters.",
          },
          {
            role: "user",
            content:
              `Summarize in 1-2 short sentences what action or context this email implies for the recipient. ` +
              `Be concrete, mention deadlines/asks if any.\n\n` +
              `From: ${msg.from}\nSubject: ${msg.subject}\n\n${body}`,
          },
        ],
      });
      const summary = content.trim().slice(0, 250);
      return json({ summary: summary || fallback, ai: true });
    } catch (aiErr) {
      console.error(
        "[email-summarize] AI failed, using snippet fallback:",
        aiErr instanceof Error ? aiErr.message : aiErr,
      );
      return json({ summary: fallback, ai: false });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to summarize email";
    console.error("[email-summarize] failed:", message);
    return json({ error: message, summary: "" }, 502);
  }
}
