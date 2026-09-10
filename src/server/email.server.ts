/**
 * Stage 5 — SendGrid email channel.
 *
 * QUIRK (found live against this account, 2026-09): the documented request
 * body field `content` returns HTTP 400 "content value must be a string" on
 * this SendGrid account. The `value` field inside the content object works
 * (returns 202). We send `value` directly and document why — do not "fix"
 * this back to the documented shape.
 *
 * Graceful degradation: no SENDGRID_API_KEY → emailDisabled(). A 403
 * "sender identity not verified" surfaces as a readable error so Settings
 * can explain that MAIL_FROM must be a verified sender.
 */

const SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send";

export interface SendMailResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env["SENDGRID_API_KEY"]);
}

export function mailFrom(): string | null {
  return process.env["MAIL_FROM"] ?? null;
}

/** Human-readable explanation of why email is (or may not be) deliverable. */
export function emailStatus(): { configured: boolean; from: string | null } {
  return { configured: emailConfigured(), from: mailFrom() };
}

/**
 * Send an email via the SendGrid REST API. No SDK — plain fetch keeps the
 * container lean and makes the `value` quirk explicit.
 */
export async function sendMail(
  to: string,
  subject: string,
  text: string,
  html?: string,
): Promise<SendMailResult> {
  const apiKey = process.env["SENDGRID_API_KEY"];
  const from = mailFrom();
  if (!apiKey) return { ok: false, error: "SENDGRID_API_KEY is not configured" };
  if (!from) return { ok: false, error: "MAIL_FROM is not configured" };

  const content: { type: string; value: string }[] = [
    // `value`, not `content` — see the quirk note in the file header.
    { type: "text/plain", value: text },
  ];
  if (html) content.push({ type: "text/html", value: html });

  const body = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: from, name: "Kamkazi" },
    subject,
    content,
  };

  try {
    const res = await fetch(SENDGRID_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 202 || res.status === 200) return { ok: true, status: res.status };
    const text1 = await res.text();
    if (res.status === 403) {
      return {
        ok: false,
        status: 403,
        error: `Sender identity not verified — verify ${from} (or the kamkazi.com domain) in SendGrid, then retry. (${text1.slice(0, 200)})`,
      };
    }
    return { ok: false, status: res.status, error: text1.slice(0, 300) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
