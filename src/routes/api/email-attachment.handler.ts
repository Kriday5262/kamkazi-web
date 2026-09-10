/**
 * Attachment download (plain async handler, mounted by ./email-attachment.ts).
 *
 * Read-only: GET on the Gmail attachments endpoint (never marks anything
 * read, never modifies). The account must belong to the session user and
 * have the gmail.readonly scope.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { googleAccounts } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import { getFreshAccessToken, GMAIL_READONLY_SCOPE } from "@/server/google-oauth.server";
import { getAttachment } from "@/server/gmail.server";

export async function emailAttachmentHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId")?.trim() ?? "";
  const msgId = url.searchParams.get("id")?.trim() ?? "";
  const attId = url.searchParams.get("attId")?.trim() ?? "";
  const name = (url.searchParams.get("name") ?? "attachment").replace(/["\\\r\n]/g, "");
  const mime = url.searchParams.get("mime") ?? "application/octet-stream";
  const safeMime = /^(image\/[\w.+-]+|application\/[\w.+-]+|text\/plain|text\/csv)$/.test(mime)
    ? mime
    : "application/octet-stream";
  if (!accountId || !msgId || !attId) {
    return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
  }

  try {
    const [acct] = await db
      .select()
      .from(googleAccounts)
      .where(and(eq(googleAccounts.id, accountId), eq(googleAccounts.userId, session.uid)))
      .limit(1);
    if (!acct) return new Response(JSON.stringify({ error: "Account not found" }), { status: 404 });
    if (!(acct.scopes ?? []).includes(GMAIL_READONLY_SCOPE)) {
      return new Response(JSON.stringify({ error: "Gmail scope not granted" }), { status: 403 });
    }
    const token = await getFreshAccessToken(acct);
    if (!token) return new Response(JSON.stringify({ error: "Token refresh failed" }), { status: 401 });

    const att = await getAttachment(token, msgId, attId);
    if (!att) return new Response(JSON.stringify({ error: "Attachment not found" }), { status: 404 });

    return new Response(new Uint8Array(att.data), {
      headers: {
        "content-type": safeMime,
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[email-attachment] failed:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "Download failed" }), { status: 502 });
  }
}