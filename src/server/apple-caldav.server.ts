/**
 * Minimal Apple iCloud CalDAV client for Reminders sync — dependency-light
 * (global fetch + regex XML handling), same style as ics.server.ts.
 *
 * Auth: Apple ID + app-specific password over HTTP Basic.
 * Flow: PROPFIND caldav.icloud.com (current-user-principal) → PROPFIND
 * principal (calendar-home-set) → PROPFIND home Depth 1 (collections with
 * VTODO support = Reminders lists) → REPORT calendar-query per list (VTODOs).
 *
 * Writes: PUT text/calendar onto a VTODO href (completion/edit), DELETE href,
 * PUT a fresh VCALENDAR into a list collection (create from Kamkazi).
 */
import { createHash } from "node:crypto";

const ICAL_ORIGIN = "https://caldav.icloud.com";

export interface CalDavList {
  /** Absolute URL of the VTODO-capable collection. */
  url: string;
  name: string;
}

export interface CalDavTodo {
  /** Absolute URL of the VTODO resource (PUT/DELETE target). */
  href: string;
  etag: string;
  /** Full VCALENDAR text as returned by Apple — kept verbatim for safe re-PUT. */
  raw: string;
  uid: string;
  summary: string;
  description: string;
  /** "YYYY-MM-DD" */
  dueDate?: string | undefined;
  /** "HH:MM" */
  dueTime?: string | undefined;
  completed: boolean;
  /** Apple PRIORITY: 1/5/9 high/medium/low, 0 none. */
  priority: number;
  /** Apple's Last-Modified stamp when present. */
  lastmod?: string | undefined;
  /** True when the VTODO carries an RRULE (recurring reminder). */
  recurring: boolean;
}

export class CalDavError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

function authHeader(username: string, password: string): string {
  return "Basic " + Buffer.from(`${username}:${password}`, "utf8").toString("base64");
}

async function davRequest(
  method: string,
  url: string,
  auth: { username: string; password: string },
  headers: Record<string, string>,
  body?: string | undefined,
): Promise<{ status: number; text: string; etag: string }> {
  const init: RequestInit = {
    method,
    headers: {
      authorization: authHeader(auth.username, auth.password),
      ...headers,
    },
  };
  if (body !== undefined) init.body = body;
  const res = await fetch(url, init);
  const text = await res.text().catch(() => "");
  if (!res.ok && res.status !== 207 && res.status !== 404) {
    throw new CalDavError(`${method} ${url} → ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  return { status: res.status, text, etag: res.headers.get("etag") ?? "" };
}

/** Extract every <D:response>…</D:response> block (namespace prefix varies). */
function responseBlocks(xml: string): string[] {
  const blocks: string[] = [];
  const re = /<(?:[A-Za-z0-9]*:)?response\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9]*:)?response>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) blocks.push(m[1] ?? "");
  return blocks;
}

function firstTag(block: string, localName: string): string {
  const re = new RegExp(
    `<(?:[A-Za-z0-9]*:)?${localName}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9]*:)?${localName}>`,
    "i",
  );
  const m = re.exec(block);
  return m?.[1]?.trim() ?? "";
}

function hrefOf(block: string): string {
  const inner = firstTag(block, "href");
  if (!inner) return "";
  if (inner.startsWith("http")) return inner;
  return ICAL_ORIGIN + (inner.startsWith("/") ? inner : "/" + inner);
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#\d+;/g, (d) => String.fromCodePoint(Number(d.slice(2, -1))))
    .replace(/&amp;/g, "&");
}

/** One PROPFIND with the given body; returns parsed response blocks. */
async function propfind(
  url: string,
  auth: { username: string; password: string },
  body: string,
  depth: "0" | "1",
): Promise<string[]> {
  const r = await davRequest(
    "PROPFIND",
    url,
    auth,
    {
      Depth: depth,
      "Content-Type": "application/xml; charset=utf-8",
    },
    body,
  );
  if (r.status === 404) return [];
  return responseBlocks(r.text);
}

const PRINCIPAL_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:"><D:prop><D:current-user-principal/></D:prop></D:propfind>`;

const HOMESET_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><C:calendar-home-set/></D:prop></D:propfind>`;

const LIST_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
 <D:prop>
  <D:displayname/>
  <D:resourcetype/>
  <C:supported-calendar-component-set/>
 </D:prop>
</D:propfind>`;

/** Discover the Reminders (VTODO) collections of an iCloud account. */
export async function listReminderCalendars(
  username: string,
  password: string,
): Promise<CalDavList[]> {
  const auth = { username, password };

  // 1. principal URL (Apple also returns calendar-home-set here on some paths).
  const rootBlocks = await propfind(ICAL_ORIGIN + "/", auth, PRINCIPAL_BODY, "0");
  const root0 = rootBlocks[0] ?? "";
  // current-user-principal contains a nested <D:href> — pull it directly.
  const cupRaw = firstTag(root0, "current-user-principal");
  let principalHref = "";
  const cupHref = /<(?:[A-Za-z0-9]*:)?href\b[^>]*>([\s\S]*?)<\//.exec(cupRaw)?.[1]?.trim() ?? "";
  if (cupHref) principalHref = cupHref.startsWith("http") ? cupHref : ICAL_ORIGIN + cupHref;
  if (!principalHref) throw new CalDavError("principal discovery failed", 0);

  // 2. calendar-home-set (may already be on the root response).
  const rootHomeRaw =
    /<(?:[A-Za-z0-9]*:)?calendar-home-set[\s\S]*?<(?:[A-Za-z0-9]*:)?href\b[^>]*>([\s\S]*?)<\//
      .exec(root0)?.[1]
      ?.trim() ?? "";
  let homeHref = rootHomeRaw.startsWith("http") || rootHomeRaw.startsWith("/") ? rootHomeRaw : "";
  if (!homeHref) {
    const pBlocks = await propfind(principalHref, auth, HOMESET_BODY, "0");
    const p0 = pBlocks[0] ?? "";
    const homeRaw =
      /<(?:[A-Za-z0-9]*:)?calendar-home-set[\s\S]*?<(?:[A-Za-z0-9]*:)?href\b[^>]*>([\s\S]*?)<\//
        .exec(p0)?.[1]
        ?.trim() ?? "";
    if (homeRaw.startsWith("http") || homeRaw.startsWith("/")) homeHref = homeRaw;
  }
  if (!homeHref) throw new CalDavError("calendar-home-set discovery failed", 0);
  const homeUrl = homeHref.startsWith("http") ? homeHref : ICAL_ORIGIN + homeHref;

  // 3. collections under home; keep calendar collections that accept VTODO.
  const collBlocks = await propfind(homeUrl, auth, LIST_BODY, "1");
  const lists: CalDavList[] = [];
  for (const b of collBlocks) {
    const url = hrefOf(b);
    if (!url || url === homeUrl) continue;
    const rt = firstTag(b, "resourcetype");
    if (!/<(?:[A-Za-z0-9]*:)?calendar\b/.test(rt)) continue;
    // NOTE: Apple's component-set often advertises only VEVENT even for
    // Reminders lists — the VTODO REPORT succeeds regardless, so we do NOT
    // filter on supported-calendar-component-set here. Skip Apple internals.
    if (/\/(inbox|notification|outbox)\/?$/.test(url)) continue;
    const name =
      xmlUnescape(firstTag(b, "displayname")) ||
      decodeURIComponent(url.split("/").filter(Boolean).pop() ?? "List");
    lists.push({ url, name });
  }
  return lists;
}

// small helpers kept below their use site to stay tidy

const QUERY_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
 <D:prop><D:getetag/><D:last-modified/><C:calendar-data/></D:prop>
 <C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VTODO"/></C:comp-filter></C:filter>
</C:calendar-query>`;

/** Fetch every VTODO in a list collection. */
export async function fetchTodos(
  listUrl: string,
  auth: { username: string; password: string },
): Promise<CalDavTodo[]> {
  const r = await davRequest(
    "REPORT",
    listUrl,
    auth,
    {
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8",
    },
    QUERY_BODY,
  );
  if (r.status === 404) return [];
  const todos: CalDavTodo[] = [];
  for (const block of responseBlocks(r.text)) {
    const href = hrefOf(block);
    if (!href) continue;
    const etag = firstTag(block, "getetag").replace(/"/g, "");
    const lastmod = firstTag(block, "last-modified") || undefined;
    const dataTag = firstTag(block, "calendar-data");
    if (!dataTag) continue;
    const raw = xmlUnescape(dataTag);
    const todo = parseVtodo(raw, href, etag, lastmod);
    if (todo) todos.push(todo);
  }
  return todos;
}

/** Unfold iCal continuation lines and pull one property (first match). */
function icalProp(ical: string, name: string): string | undefined {
  const unfolded = ical.replace(/\r?\n[ \t]/g, "");
  const re = new RegExp(`^${name}[^\\r\\n]*`, "mi");
  const m = re.exec(unfolded);
  if (!m) return undefined;
  const line = m[0] ?? "";
  const colon = line.indexOf(":");
  if (colon < 0) return undefined;
  return line.slice(colon + 1).trim();
}

/** Split "YYYYMMDD[THHMMSS[Z]]" into IST date/time parts. */
function parseIcalDate(value: string): { date?: string; time?: string } {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return {};
  const [, y, mo, d, hh, mm, , z] = m as unknown as string[];
  let date = `${y}-${mo}-${d}`;
  let time: string | undefined;
  if (hh && mm) {
    time = `${hh}:${mm}`;
    if (z) {
      // UTC → IST (+5:30) for display.
      const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm)));
      dt.setUTCMinutes(dt.getUTCMinutes() + 330);
      date = dt.toISOString().slice(0, 10);
      time = dt.toISOString().slice(11, 16);
    }
  }
  const out: { date?: string; time?: string } = { date };
  if (time !== undefined) out["time"] = time;
  return out;
}

function unescapeIcalText(s: string): string {
  return s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

export function parseVtodo(
  raw: string,
  href: string,
  etag: string,
  lastmod: string | undefined,
): CalDavTodo | null {
  const begin = raw.search(/^BEGIN:VTODO\r?$/im);
  const end = raw.search(/^END:VTODO\r?$/im);
  if (begin < 0 || end < 0) return null;
  const vtodo = raw.slice(begin, end);
  const status = (icalProp(vtodo, "STATUS") ?? "").toUpperCase();
  const uid = icalProp(vtodo, "UID") ?? createHash("sha1").update(href).digest("hex");
  const dueRaw = icalProp(vtodo, "DUE");
  const dueParts = parseIcalDate(dueRaw ?? "");
  return {
    href,
    etag,
    raw,
    uid,
    summary: unescapeIcalText(icalProp(vtodo, "SUMMARY") ?? "Untitled"),
    description: unescapeIcalText(icalProp(vtodo, "DESCRIPTION") ?? ""),
    dueDate: dueParts.date,
    dueTime: dueParts.time,
    completed: status === "COMPLETED",
    priority: Number(icalProp(vtodo, "PRIORITY") ?? 0) || 0,
    lastmod,
    recurring: /(^|\r?\n)RRULE[:;]/i.test(vtodo),
  };
}

function escapeIcalText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icalNowUtc(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Build a fresh VCALENDAR for a new VTODO (Kamkazi → Apple create). */
export function buildVtodo(input: {
  uid: string;
  summary: string;
  description?: string | undefined;
  dueDate?: string | undefined;
  dueTime?: string | undefined;
  priority: number;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kamkazi//RemindersSync//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VTODO",
    `UID:${input.uid}`,
    `CREATED:${icalNowUtc()}`,
    `LAST-MODIFIED:${icalNowUtc()}`,
    `DTSTAMP:${icalNowUtc()}`,
    `SUMMARY:${escapeIcalText(input.summary || "Untitled")}`,
  ];
  if (input.description?.trim()) lines.push(`DESCRIPTION:${escapeIcalText(input.description)}`);
  if (input.dueDate) {
    if (input.dueTime) {
      const [hh, mm] = input.dueTime.split(":");
      lines.push(`DUE;TZID=Asia/Kolkata:${input.dueDate.replace(/-/g, "")}T${hh}${mm}00`);
    } else {
      lines.push(`DUE;VALUE=DATE:${input.dueDate.replace(/-/g, "")}`);
    }
  }
  if (input.priority > 0) lines.push(`PRIORITY:${input.priority}`);
  lines.push("STATUS:NEEDS-ACTION", "END:VTODO", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** Mark an existing VTODO completed in place (patch STATUS + COMPLETED lines). */
export function completeVcalendar(raw: string): string {
  const stamp = `COMPLETED:${icalNowUtc()}`;
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  let inTodo = false;
  let statusDone = false;
  let completedDone = false;
  for (const line of lines) {
    if (/^BEGIN:VTODO/i.test(line)) inTodo = true;
    else if (/^END:VTODO/i.test(line)) {
      if (inTodo && !completedDone) out.push(stamp);
      inTodo = false;
    }
    if (inTodo && /^STATUS:/i.test(line)) {
      out.push("STATUS:COMPLETED");
      statusDone = true;
      continue;
    }
    if (inTodo && /^COMPLETED:/i.test(line)) {
      out.push(stamp);
      completedDone = true;
      continue;
    }
    out.push(line);
  }
  // STATUS line may be absent — add right after BEGIN:VTODO.
  if (!statusDone) {
    const i = out.findIndex((l) => /^BEGIN:VTODO/i.test(l));
    if (i >= 0) out.splice(i + 1, 0, "STATUS:COMPLETED");
  }
  return out.join("\r\n");
}

export function todoUrl(listUrl: string, uid: string): string {
  return `${listUrl.replace(/\/+$/, "")}/${encodeURIComponent(uid)}.ics`;
}

export { davRequest };
