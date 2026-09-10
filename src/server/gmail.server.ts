/**
 * Read-only Gmail integration (server-only).
 *
 * All calls are on-demand with the account's fresh access token — nothing is
 * stored wholesale in the DB. Only list/search results are cached briefly in
 * memory (5 min TTL). Requires the gmail.readonly scope (Enable email flow).
 *
 * GOOGLE_API_BASE env override is the same test seam as google-oauth.server.
 */
import {
  API_BASE_EXPORT as API_BASE,
  GMAIL_READONLY_SCOPE,
  type GoogleAccount,
} from "./google-oauth.server";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: GmailMessageSummary[] }>();

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  labelIds: string[];
}

interface Header {
  name?: string;
  value?: string;
}

interface GmailListResp {
  messages?: { id: string; threadId: string }[];
  resultSizeEstimate?: number;
}

interface GmailMetaResp {
  id: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: { headers?: Header[] };
}

function headerValue(headers: Header[], name: string): string {
  const h = headers.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

/** Fetch metadata for message ids — in parallel (Gmail's legacy /batch
 * endpoint 404s on www.googleapis.com for Gmail, so per-message GETs it is). */
async function getMetadataBatch(token: string, ids: string[]): Promise<GmailMessageSummary[]> {
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await fetch(
          `${API_BASE}/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata`,
          {
            headers: { authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15_000),
          },
        );
        if (!res.ok) return null;
        const meta = (await res.json()) as GmailMetaResp;
        if (!meta.id) return null;
        const headers = meta.payload?.headers ?? [];
        return {
          id: meta.id,
          threadId: meta.threadId ?? meta.id,
          from: headerValue(headers, "From"),
          subject: headerValue(headers, "Subject"),
          date: headerValue(headers, "Date") || (meta.internalDate ?? ""),
          snippet: (meta.snippet ?? "").slice(0, 200),
          unread: (meta.labelIds ?? []).includes("UNREAD"),
          labelIds: meta.labelIds ?? [],
        } satisfies GmailMessageSummary;
      } catch {
        return null; // skip failures per-message
      }
    }),
  );
  return results.filter((x): x is GmailMessageSummary => x !== null);
}

export async function listRecentEmails(
  token: string,
  opts: { max?: number; query?: string; fresh?: boolean } = {},
): Promise<GmailMessageSummary[]> {
  const max = Math.min(Math.max(opts.max ?? 10, 1), 50);
  const key = `list:${token.slice(-12)}:${opts.query ?? ""}:${max}`;
  const hit = cache.get(key);
  // fresh=true (manual refresh) skips the cache read but still re-populates it.
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const p = new URLSearchParams({ maxResults: String(max) });
  if (opts.query) p.set("q", opts.query);
  const res = await fetch(`${API_BASE}/gmail/v1/users/me/messages?${p.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (res.status === 403) throw new Error("Gmail scope not granted (enable email first)");
  if (!res.ok) throw new Error(`gmail list failed: HTTP ${res.status}`);
  const data = (await res.json()) as GmailListResp;
  const ids = (data.messages ?? []).map((m) => m.id);
  const results = await getMetadataBatch(token, ids);
  cache.set(key, { at: Date.now(), value: results });
  return results;
}

export async function searchEmails(
  token: string,
  query: string,
  opts: { max?: number } = {},
): Promise<GmailMessageSummary[]> {
  const o: { max?: number; query?: string } = { query };
  if (opts.max !== undefined) o.max = opts.max;
  return listRecentEmails(token, o);
}

// ---------------------------------------------------------------------------
// read_email — full message body (format=full)
// ---------------------------------------------------------------------------

interface GmailFullPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailFullPart[];
}

interface GmailFullResp {
  id: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: {
    headers?: Header[];
    mimeType?: string;
    body?: { data?: string };
    parts?: GmailFullPart[];
  };
}

function b64urlDecode(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findBodyParts(payload: GmailFullResp["payload"]): {
  text: string | null;
  html: string | null;
} {
  if (!payload) return { text: null, html: null };
  // Walk the whole MIME tree collecting the first text/plain and text/html parts.
  const stack: GmailFullPart[] = [payload as GmailFullPart];
  let text: string | null = null;
  let html: string | null = null;
  while (stack.length > 0) {
    const part = stack.shift()!;
    if (part.mimeType === "text/plain" && part.body?.data && text === null) {
      text = b64urlDecode(part.body.data);
    }
    if (part.mimeType === "text/html" && part.body?.data && html === null) {
      html = b64urlDecode(part.body.data);
    }
    if (part.parts) stack.push(...part.parts);
  }
  return { text, html };
}

// ---------------------------------------------------------------------------
// Follow-up chain trimming: cut quoted earlier messages, keep the latest one.
// ---------------------------------------------------------------------------

/** Marker regexes for the *start* of a quoted reply (checked per line). */
const QUOTE_LINE_MARKERS: RegExp[] = [
  /^On .{0,320} wrote:\s*$/, // On <date> ... <email> wrote:
  /^\s*From:\s.+$/i, // From: ... (Outlook-style header block)
  /^\s*Sent:\s/i,
  /^-{3,}\s*Original Message\s*-{3,}$/i, // -----Original Message-----
  /^-{3,}\s*Forwarded message\s*-{3,}$/i,
  /^_{5,}.*$/, // ______________ divider
  /^\s*\d{4}[-.]\d{1,2}[-.]\d{1,2} .*<[^>]+>\s*writes?:\s*$/,
];

/** First index (line) at which a quoted reply begins, or -1. */
function firstQuoteLine(text: string): number {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // Quote headers often soft-wrap across two lines ("On Tue ... Foo <\nfoo@x> wrote:")
    // so test the line and the line joined with the next one.
    const candidates = [lines[i] ?? "", `${lines[i] ?? ""} ${(lines[i + 1] ?? "").trim()}`];
    for (const candidate of candidates) {
      for (const re of QUOTE_LINE_MARKERS) {
        if (!re.test(candidate.trim())) continue;
        // "From:"/"Sent:" can legitimately start a message the user drafted
        // near the top; only treat them as quote markers when followed soon
        // by To:/Subject:/Date: (i.e. a real forwarded header block).
        if (/^(From|Sent):/i.test(candidate.trim())) {
          const next = lines.slice(i + 1, i + 6).join("\n");
          if (!/(^|\n)\s*(To|Subject|Date):/i.test(next)) continue;
        }
        return i;
      }
    }
  }
  return -1;
}

/** Trim a plain-text body to just the latest message (plus small head). */
function trimQuotedText(text: string): string {
  const i = firstQuoteLine(text);
  return (i === -1 ? text : text.slice(0, i)).trim();
}

/**
 * Trim an HTML body to the latest message. Strategy: if a marker string
 * appears inside the *text* of a top-level block (div/p), cut the HTML from
 * that block's opening tag onward; also cut at gmail_quote / quoted-classed
 * wrappers. Everything after the cut is dropped.
 */
function trimQuotedHtml(html: string): string {
  // 1) Gmail/others wrap the quoted thread in a dedicated container.
  const wrapper =
    /<(div|blockquote)[^>]*class="[^"]*(gmail_quote|gmail_attr|moz-cite-prefix|yahoo_quoted)[^"]*"/i.exec(
      html,
    );
  let cut = wrapper ? wrapper.index : -1;
  if (cut === -1) {
    // 2) Scan block elements' text for quote markers.
    const blockRe = /<(div|p)[^>]*>([\s\S]*?)<\/(div|p)>/gi;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(html)) !== null) {
      const inner = (m[2] ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&");
      for (const rawLine of inner.split(/<br\s*\/?>|\n/)) {
        const cands = [
          rawLine.trim(),
          `${rawLine.trim()} ${inner.split(/<br\s*\/?>|\n/)[0] ?? ""}`.slice(0, 400),
        ];
        for (const line of cands) {
          for (const re of QUOTE_LINE_MARKERS) {
            if (!re.test(line)) continue;
            if (/^(From|Sent):/i.test(line)) {
              // only a marker if a To/Subject/Date line follows closely
              const rest = html.slice(m.index, m.index + 1500);
              if (!/(To|Subject|Date)\s*:/i.test(rest)) continue;
            }
            cut = m.index;
            break;
          }
          if (cut !== -1) break;
        }
        if (cut !== -1) break;
      }
      if (cut !== -1) break;
    }
  }
  if (cut === -1) return html;
  const trimmed = html.slice(0, cut).trimEnd();
  // Safety: never cut away (nearly) the whole message — the head must keep
  // some visible text content.
  const headText = trimmed.replace(/<[^>]+>/g, "").trim();
  if (headText.length < 40) return html;
  return trimmed;
}

// ---------------------------------------------------------------------------
// Server-side allowlist HTML sanitizer for untrusted email bodies.
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "div",
  "span",
  "table",
  "tbody",
  "thead",
  "tfoot",
  "tr",
  "td",
  "th",
  "caption",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "a",
  "img",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "code",
  "font",
  "center",
  "hr",
  "small",
  "sub",
  "sup",
]);

/** attributes allowed per tag (lowercased); global attrs merged in below */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href"]),
  img: new Set(["src", "alt", "width", "height"]),
  font: new Set(["color", "size", "face"]),
  td: new Set(["colspan", "rowspan", "width"]),
  th: new Set(["colspan", "rowspan", "width"]),
};

const GLOBAL_ATTRS = new Set(["dir", "lang"]);

function safeUrl(raw: string): string | null {
  const url = raw.trim().replace(/[\s\0]/g, "");

  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    if (!/^(https?|mailto):/i.test(url)) return null;
  } else if (/^(\/\/|#|\.\.?\/)/.test(url) || !url.includes(":")) {
    // relative, anchor, protocol-less
  } else {
    return null;
  }
  return url;
}

function sanitizeAttrs(tag: string, attrs: string): string {
  const out: string[] = [];
  const allowed = ALLOWED_ATTRS[tag] ?? new Set<string>();
  const attrRe = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(attrs)) !== null) {
    const name = (m[1] ?? "").toLowerCase();
    const value = (m[3] ?? m[4] ?? m[5] ?? "").replace(/"/g, "&quot;");
    if (!GLOBAL_ATTRS.has(name) && !allowed.has(name)) continue;
    if (name === "href" || name === "src") {
      const safe = safeUrl(value);
      if (safe === null) continue;
      out.push(`${name}="${safe}"`);
      continue;
    }
    // never allow anything that could smuggle script
    if (/on|style|javascript/i.test(name)) continue;
    out.push(`${name}="${value}"`);
  }
  if (tag === "a") out.push('target="_blank" rel="noopener noreferrer nofollow"');
  return out.length ? " " + out.join(" ") : "";
}

function escapeText(s: string): string {
  // Escape only < and > — leaving & intact avoids double-escaping existing
  // entities (&amp;, &nbsp;, …). A bare & in text is harmless.
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Strict allowlist sanitizer. Parses the HTML with a tokenizer, keeps only
 * allowed tags/attrs, drops <script>/<style> content entirely, and escapes
 * everything else so no residual markup can execute.
 */
export function sanitizeEmailHtml(input: string): string {
  let html = input.replace(/[\0\u2028]/g, "");
  // Drop doctype / xml prolog / processing instructions.
  html = html.replace(/<!\s*DOCTYPE[^>]*>/gi, "").replace(/<\?[\s\S]*?\?>/g, "");
  // Drop script/style/noscript/head blocks with their content.
  html = html.replace(
    /<(script|style|noscript|head|title|iframe|object|embed|svg|form|link|meta)[^>]*>[\s\S]*?<\/\1>/gi,
    "",
  );
  // Drop stray self-closing/dangerous tags anywhere.
  html = html.replace(
    /<\/?\s*(script|style|iframe|object|embed|svg|form|input|button|select|textarea|link|meta|base)[^>]*>/gi,
    "",
  );
  html = html.replace(/<!--(?!\[)[\s\S]*?-->/g, "");

  let out = "";
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out += escapeText(html.slice(last, m.index));
    const rawTag = (m[1] ?? "").toLowerCase();
    const isClose = m[0].startsWith("</");
    const attrs = m[2] ?? "";
    if (ALLOWED_TAGS.has(rawTag)) {
      if (isClose) {
        out += `</${rawTag}>`;
      } else {
        const selfClosed = /\/\s*>$/.test(m[0]);
        out += `<${rawTag}${sanitizeAttrs(rawTag, attrs)}${selfClosed && (rawTag === "img" || rawTag === "br" || rawTag === "hr") ? " /" : ""}>`;
      }
    }
    last = re.lastIndex;
  }
  out += escapeText(html.slice(last));
  return out;
}

export async function readEmail(
  token: string,
  msgId: string,
): Promise<GmailMessageSummary & { body: string; html?: string }> {
  const res = await fetch(
    `${API_BASE}/gmail/v1/users/me/messages/${encodeURIComponent(msgId)}?format=full`,
    { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) },
  );
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (res.status === 404) throw new Error(`Email ${msgId} not found`);
  if (res.status === 403) throw new Error("Gmail scope not granted (enable email first)");
  if (!res.ok) throw new Error(`gmail get failed: HTTP ${res.status}`);
  const data = (await res.json()) as GmailFullResp;
  const headers = data.payload?.headers ?? [];
  const parts = findBodyParts(data.payload);

  // Rich path: trim the quoted follow-up chain, sanitize, cap.
  let html: string | undefined;
  if (parts.html) {
    const trimmed = trimQuotedHtml(parts.html);
    const sanitized = sanitizeEmailHtml(trimmed);
    if (sanitized.trim()) {
      html = sanitized.slice(0, 20_000);
    }
  }

  // Plain fallback: prefer text/plain (trimmed); else strip the (trimmed) html.
  let body: string | null = parts.text ? trimQuotedText(parts.text) : null;
  if (!body || !body.trim()) {
    body = html
      ? parts.html
        ? stripHtml(trimQuotedHtml(parts.html))
        : null
      : parts.html
        ? stripHtml(trimQuotedHtml(parts.html))
        : null;
  }
  if (!body && html) {
    body = stripHtml(html);
  }
  body = (body ?? data.snippet ?? "").trim();

  return {
    id: data.id,
    threadId: data.threadId ?? data.id,
    from: headerValue(headers, "From"),
    subject: headerValue(headers, "Subject"),
    date: headerValue(headers, "Date") || (data.internalDate ?? ""),
    snippet: (data.snippet ?? "").slice(0, 200),
    unread: (data.labelIds ?? []).includes("UNREAD"),
    labelIds: data.labelIds ?? [],
    body: body.slice(0, 4000),
    ...(html !== undefined ? { html } : {}),
  };
}

// ---------------------------------------------------------------------------
// Account-scoped helpers used by the AI tools + briefing
// ---------------------------------------------------------------------------

/** Resolve target accounts by email/label for a user (per-account isolation). */
export async function resolveEmailAccounts(
  uid: string,
  accounts: GoogleAccount[],
  accountArg?: string,
): Promise<GoogleAccount[]> {
  const emailEnabled = accounts.filter((a) => (a.scopes ?? []).includes(GMAIL_READONLY_SCOPE));
  if (emailEnabled.length === 0) return [];
  if (accountArg) {
    const q = accountArg.trim().toLowerCase();
    const match = emailEnabled.filter(
      (a) => a.googleEmail.toLowerCase() === q || a.googleEmail.toLowerCase().includes(q),
    );
    return match;
  }
  return emailEnabled;
}
