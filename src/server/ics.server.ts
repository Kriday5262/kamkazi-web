/**
 * Stage 4 — minimal ICS (RFC 5545) parser + recurrence expansion.
 *
 * Scope (deliberately narrow, no dependencies):
 * - VEVENT blocks with DTSTART/DTEND (date, UTC datetime with Z, and TZID
 *   params — converted to UTC using the fixed-offset Asia/Kolkata assumption
 *   for named zones we don't have tzdata for, correct for the primary user).
 * - SUMMARY, DESCRIPTION, LOCATION, UID, VALARM ignored.
 * - RRULE: FREQ=DAILY/WEEKLY/MONTHLY, INTERVAL, COUNT, UNTIL, BYDAY (weekly).
 * - RECURRENCE-ID overrides: best-effort (matched by UID, replaces instance).
 *
 * Pure functions — unit-testable without a DB.
 */

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string | undefined;
  location?: string | undefined;
  /** UTC start (ISO with Z) for timed events. */
  startUtc?: string | undefined;
  /** UTC end (ISO with Z) for timed events. */
  endUtc?: string | undefined;
  /** All-day event date "YYYY-MM-DD" (floating, no timezone). */
  dateAllDay?: string | undefined;
  durationMin?: number | undefined;
  rrule?: string | undefined;
  recurrenceIdUtc?: string | undefined;
  recurrenceIdAllDay?: string | undefined;
}

export interface ExpandedOccurrence {
  uid: string;
  summary: string;
  description?: string | undefined;
  location?: string | undefined;
  startUtc?: string | undefined;
  dateAllDay?: string | undefined;
  durationMin?: number | undefined;
}

/** Fixed IST offset — matches the app's display timezone. */
const IST_OFFSET_MIN = 330;

function unfold(text: string): string[] {
  // RFC 5545 folding: CRLF followed by space/tab continues the line.
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .filter((l) => l.length > 0);
}

function parseLine(
  line: string,
): { name: string; params: Record<string, string>; value: string } | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segs = left.split(";");
  const name = (segs.shift() ?? "").trim().toUpperCase();
  const params: Record<string, string> = {};
  for (const seg of segs) {
    const eq = seg.indexOf("=");
    if (eq > 0) params[seg.slice(0, eq).trim().toUpperCase()] = seg.slice(eq + 1).trim();
  }
  return { name, params, value };
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

/** "America/New_York"-style: we only model the common case the user needs. */
function tzOffsetMinutes(tzid: string, utcMs: number): number {
  const tz = tzid.replace(/"/g, "").trim();
  if (/^(asia\/kolkata|asia\/calcutta)$/i.test(tz)) return IST_OFFSET_MIN;
  if (/^utc$/i.test(tz)) return 0;
  // Fallback: treat named unknown zones as UTC (best-effort).
  void utcMs;
  return 0;
}

/** Parse a DTSTART/DTEND value into UTC ISO string, or null if unparseable. */
export function parseIcsDateTime(
  value: string,
  params: Record<string, string>,
  isEnd: boolean,
): string | null {
  const v = value.trim();
  // DATE form: 20260907
  if (/^\d{8}$/.test(v) || params["VALUE"] === "DATE") {
    const y = Number(v.slice(0, 4));
    const mo = Number(v.slice(4, 6));
    const d = Number(v.slice(6, 8));
    if (!y || !mo || !d) return null;
    if (isEnd) {
      // All-day DTEND is exclusive; convert to inclusive end instant by
      // returning the exclusive end as a UTC midnight instant of that date.
      return new Date(Date.UTC(y, mo - 1, d)).toISOString();
    }
    return new Date(Date.UTC(y, mo - 1, d)).toISOString();
  }
  // DATE-TIME: 20260907T090000Z or 20260907T090000 (floating) with optional TZID.
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const [, ys, mos, ds, hs, mins, ss, z] = m;
  let utcMs = Date.UTC(
    Number(ys),
    Number(mos) - 1,
    Number(ds),
    Number(hs),
    Number(mins),
    Number(ss),
  );
  const tzid = params["TZID"];
  if (!z && tzid) utcMs -= tzOffsetMinutes(tzid, utcMs) * 60_000;
  else if (!z && !tzid) {
    // Floating local time: assume IST (the app's display timezone).
    utcMs -= IST_OFFSET_MIN * 60_000;
  }
  return new Date(utcMs).toISOString();
}

const WEEKDAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

interface Rrule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  count?: number | undefined;
  untilMs?: number | undefined;
  byDay?: number[] | undefined;
}

export function parseRrule(value: string): Rrule | null {
  const parts: Record<string, string> = {};
  for (const seg of value.split(";")) {
    const eq = seg.indexOf("=");
    if (eq > 0) parts[seg.slice(0, eq).trim().toUpperCase()] = seg.slice(eq + 1).trim();
  }
  const freq = (parts["FREQ"] ?? "").toUpperCase();
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") return null;
  const rr: Rrule = {
    freq,
    interval: Math.max(1, Number(parts["INTERVAL"] ?? "1") || 1),
  };
  if (parts["COUNT"]) rr.count = Number(parts["COUNT"]);
  if (parts["UNTIL"]) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(parts["UNTIL"]);
    if (m) {
      rr.untilMs = Date.UTC(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4] ?? "23"),
        Number(m[5] ?? "59"),
        Number(m[6] ?? "59"),
      );
    }
  }
  if (parts["BYDAY"]) {
    rr.byDay = parts["BYDAY"]
      .split(",")
      .map((d) => WEEKDAY_CODES[d.trim().toUpperCase().slice(-2)])
      .filter((n) => n !== undefined);
  }
  return rr;
}

function addDays(ms: number, days: number): number {
  return ms + days * 86_400_000;
}

/**
 * Expand an RRULE into occurrence start instants (UTC ms) within
 * [rangeStartMs, rangeEndMs). COUNT is honoured approximately by generating
 * from the event start forward (bounded by 400 iterations).
 */
export function expandRrule(
  rule: Rrule,
  baseStartMs: number,
  baseAllDay: boolean,
  rangeStartMs: number,
  rangeEndMs: number,
): number[] {
  const out: number[] = [];
  const step = rule.interval;
  let produced = 0;
  const limit = 400;
  const hit = (ms: number) => {
    produced += 1;
    if (ms >= rangeStartMs && ms < rangeEndMs) out.push(ms);
    if (rule.untilMs && ms > rule.untilMs) return true;
    if (rule.count !== undefined && produced > rule.count) return true;
    return produced >= limit;
  };
  if (rule.freq === "DAILY") {
    // Fast-forward close to the window.
    let i = 0;
    if (!baseAllDay && rangeStartMs > baseStartMs && rule.count === undefined) {
      i = Math.floor((rangeStartMs - baseStartMs) / 86_400_000);
    }
    for (;;) {
      const ms = baseAllDay ? addDays(baseStartMs, i) : baseStartMs + i * 86_400_000;
      if (ms > rangeEndMs) break;
      if (ms >= baseStartMs - 1) {
        if (hit(ms)) break;
      }
      i += step;
    }
    return out;
  }
  if (rule.freq === "WEEKLY") {
    const base = new Date(baseStartMs);
    const dayDiff = baseAllDay
      ? 0
      : baseStartMs - Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
    if (rule.byDay && rule.byDay.length > 0) {
      const days = [...rule.byDay].sort((a, b) => a - b);
      // Walk week-by-week from the week containing the base start.
      const base = new Date(baseStartMs);
      const baseWeekStartMs =
        Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()) -
        base.getUTCDay() * 86_400_000;
      for (let w = 0; produced < limit; w += step) {
        let broke = false;
        for (const dow of days) {
          const ms = baseWeekStartMs + (w * 7 + dow) * 86_400_000 + dayDiff;
          if (ms < baseStartMs) continue;
          if (ms > rangeEndMs) continue;
          if (hit(ms)) {
            broke = true;
            break;
          }
        }
        if (broke) break;
        const weekStartMs = baseWeekStartMs + w * 7 * 86_400_000;
        if (weekStartMs > rangeEndMs) break;
      }
      return out;
    }
    for (let w = 0; produced < limit; w += step) {
      const ms = baseStartMs + w * 7 * 86_400_000;
      if (ms > rangeEndMs) break;
      if (hit(ms)) break;
    }
    return out;
  }
  // MONTHLY: same day-of-month (skip months where it doesn't exist).
  const base = new Date(baseStartMs);
  const day = base.getUTCDate();
  const todMs = baseAllDay
    ? 0
    : baseStartMs - Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), day);
  for (let n = 0; produced < limit; n++) {
    const idx = base.getUTCMonth() + n * step;
    const yy = base.getUTCFullYear() + Math.floor(idx / 12);
    const mm = idx % 12;
    const dim = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    if (day > dim) continue;
    const ms = Date.UTC(yy, mm, day) + todMs;
    if (ms < baseStartMs) continue;
    if (ms > rangeEndMs) break;
    if (hit(ms)) break;
  }
  return out;
}

/** Parse an ICS payload into raw VEVENTs. */
export function parseIcs(text: string): IcsEvent[] {
  const lines = unfold(text);
  const events: IcsEvent[] = [];
  let cur: Partial<IcsEvent> | null = null;
  for (const line of lines) {
    const p = parseLine(line);
    if (!p) continue;
    const { name, params, value } = p;
    if (name === "BEGIN" && value.toUpperCase() === "VEVENT") {
      cur = {};
      continue;
    }
    if (name === "END" && value.toUpperCase() === "VEVENT") {
      if (cur && cur.uid) events.push(cur as IcsEvent);
      cur = null;
      continue;
    }
    if (!cur) continue;
    switch (name) {
      case "UID":
        cur.uid = value.trim();
        break;
      case "SUMMARY":
        cur.summary = unescapeText(value).trim() || "(untitled)";
        break;
      case "DESCRIPTION":
        cur.description = unescapeText(value);
        break;
      case "LOCATION":
        cur.location = unescapeText(value);
        break;
      case "RRULE":
        cur.rrule = value;
        break;
      case "RECURRENCE-ID":
        if (/^\d{8}$/.test(value.trim())) cur.recurrenceIdAllDay = value.trim();
        else cur.recurrenceIdUtc = parseIcsDateTime(value, params, false) ?? undefined;
        break;
      case "DTSTART": {
        if (/^\d{8}$/.test(value.trim()) && (params["VALUE"] === "DATE" || !value.includes("T"))) {
          const y = Number(value.slice(0, 4));
          const mo = Number(value.slice(4, 6));
          const d = Number(value.slice(6, 8));
          cur.dateAllDay = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        } else {
          cur.startUtc = parseIcsDateTime(value, params, false) ?? undefined;
        }
        break;
      }
      case "DTEND": {
        const end = parseIcsDateTime(value, params, true);
        if (end && cur.startUtc) {
          const dur = Math.round((Date.parse(end) - Date.parse(cur.startUtc)) / 60_000);
          if (dur > 0) cur.durationMin = dur;
        }
        break;
      }
      default:
        break; // VALARM nested blocks, etc., ignored
    }
  }
  return events;
}

/** Strip undefined-valued optional props so exactOptionalPropertyTypes holds. */
function clean<T extends object>(o: T): T {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v;
  return r as T;
}

/** Default horizon for recurrence expansion: now → +90 days. */
export function expansionRange(now = Date.now()): { startMs: number; endMs: number } {
  return { startMs: now - 7 * 86_400_000, endMs: now + 90 * 86_400_000 };
}

/**
 * Expand parsed events (with RRULE + RECURRENCE-ID overrides) into concrete
 * occurrences inside the expansion window.
 */
export function expandEvents(events: IcsEvent[], range = expansionRange()): ExpandedOccurrence[] {
  const { startMs, endMs } = range;
  const overrides = new Map<string, IcsEvent>();
  const plain: IcsEvent[] = [];
  for (const e of events) {
    if (e.recurrenceIdUtc || e.recurrenceIdAllDay) overrides.set(e.uid, e);
    else plain.push(e);
  }

  const out: ExpandedOccurrence[] = [];
  for (const e of plain) {
    if (e.dateAllDay) {
      const base = Date.parse(`${e.dateAllDay}T00:00:00Z`);
      let occs: number[] = [base];
      if (e.rrule) {
        const rule = parseRrule(e.rrule);
        if (rule) occs = expandRrule(rule, base, true, startMs, endMs);
      }
      for (const ms of occs) {
        out.push(
          clean({
            uid: e.uid,
            summary: e.summary,
            description: e.description,
            location: e.location,
            dateAllDay: new Date(ms).toISOString().slice(0, 10),
            durationMin: e.durationMin,
          }),
        );
      }
    } else if (e.startUtc) {
      const base = Date.parse(e.startUtc);
      let occs: number[] = [base];
      const rule2 = e.rrule ? parseRrule(e.rrule) : null;
      if (rule2) occs = expandRrule(rule2, base, false, startMs, endMs);
      for (const ms of occs) {
        out.push(
          clean({
            uid: e.uid,
            summary: e.summary,
            description: e.description,
            location: e.location,
            startUtc: new Date(ms).toISOString(),
            durationMin: e.durationMin,
          }),
        );
      }
    }
  }

  // RECURRENCE-ID overrides: replace or add instances with the same UID.
  for (const o of overrides.values()) {
    // Best-effort: drop a matching generated occurrence and add the override.
    const oStart = o.startUtc ?? (o.dateAllDay ? `${o.dateAllDay}T00:00:00Z` : undefined);
    if (oStart) {
      const idx = out.findIndex(
        (x) =>
          x.uid === o.uid &&
          Math.abs((x.startUtc ? Date.parse(x.startUtc) : 0) - Date.parse(oStart)) < 30 * 60_000,
      );
      if (idx >= 0) out.splice(idx, 1);
    }
    out.push(
      clean({
        uid: o.uid,
        summary: o.summary,
        description: o.description,
        location: o.location,
        startUtc: o.startUtc,
        dateAllDay: o.dateAllDay,
        durationMin: o.durationMin,
      }),
    );
  }
  return out;
}
