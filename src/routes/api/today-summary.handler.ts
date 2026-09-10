/**
 * Today summary — server logic (plain async handler, mounted by
 * ../api/today-summary.ts via route-level server handlers).
 *
 * POST { date, force? } → { text, ai, cached }
 *
 * Feeds today's tasks (DB), today's calendar events (calendar tables) and the
 * top inbox emails (gmail, read-only) to the configured AI provider and asks
 * for a structured short-line summary with bold keywords. NO weather.
 *
 * Cached in-memory per (uid + date + data hash) for ~15 min so page loads
 * don't re-call the model; `force: true` bypasses the cache (refresh button).
 */
import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, calendarSources, tasks, userSettings } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import { chatCompletion, resolveProvider } from "@/server/ai.server";

const CACHE_TTL_MS = 15 * 60_000;

interface CacheEntry {
  at: number;
  text: string;
  ai: boolean;
}
const cache = new Map<string, CacheEntry>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function todaySummaryHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthorized" }, 401);
  const uid = session.uid;

  const body = (await request.json().catch(() => ({}))) as {
    date?: string;
    force?: boolean;
  };
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date ?? ""))
    ? String(body.date)
    : new Date().toISOString().slice(0, 10);
  const force = body.force === true;

  // ---- gather today's data (same shapes the UI renders) ----
  const [taskRows, eventRows, sourceRows, settingsRows] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.userId, uid)).orderBy(asc(tasks.dueDate)),
    db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.userId, uid))
      .orderBy(asc(calendarEvents.date), asc(calendarEvents.start)),
    db.select().from(calendarSources).where(eq(calendarSources.userId, uid)),
    db.select().from(userSettings).where(eq(userSettings.userId, uid)).limit(1),
  ]);

  const settings = (settingsRows[0]?.settings ?? {}) as Record<string, unknown>;

  const sourceByKey = new Map(
    sourceRows.map((s) => [`${s.sourceType}|${s.accountId}|${s.calendarId}`, s]),
  );
  const labelFor = (e: (typeof eventRows)[number]): string => {
    const src = e.googleAccountId
      ? sourceByKey.get(`google|${e.googleAccountId}|${e.calendar}`)
      : e.subscriptionId
        ? sourceByKey.get(`ics|${e.subscriptionId}|${e.subscriptionId}`)
        : undefined;
    return src?.displayName.trim() || e.calendar;
  };

  const todaysTasks = taskRows.filter((t) => t.dueDate && t.dueDate <= today);
  const todaysEvents = eventRows.filter((e) => e.date === today);

  // ---- emails: reuse the inbox-overview merge (best-effort, ≤8s) ----
  const emails = await Promise.race([
    topInbox(request.headers.get("cookie") ?? ""),
    new Promise<{ from: string; subject: string; unread: boolean }[]>((r) =>
      setTimeout(() => r([]), 8_000),
    ),
  ]).catch(() => []);

  // ---- data hash for the cache key ----
  const dataSig = JSON.stringify({
    t: todaysTasks.map((t) => [t.id, t.done, t.title, t.dueDate, t.dueTime]),
    e: todaysEvents.map((e) => [e.id, e.title, e.start, e.allDay]),
    m: emails.map((m) => [m.from, m.subject, m.unread]),
  });
  const hash = createHash("sha1").update(dataSig).digest("hex").slice(0, 12);
  const key = `${uid}|${today}|${hash}`;

  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return json({ text: hit.text, ai: hit.ai, cached: true });
  }

  // ---- prompt ----
  const taskLines = todaysTasks
    .slice(0, 15)
    .map(
      (t) =>
        `- ${t.done ? "[done] " : ""}${t.title}${t.dueTime ? ` at ${t.dueTime}` : ""}${
          t.dueDate && t.dueDate < today ? " (OVERDUE)" : ""
        }${t.priority === "high" ? " (high priority)" : ""}`,
    )
    .join("\n");
  const eventLines = todaysEvents
    .slice(0, 15)
    .map((e) => `- ${e.allDay || !e.start ? "All day" : e.start} — ${e.title} (${e.calendar})`)
    .join("\n");
  const emailLines = emails
    .slice(0, 5)
    .map((m) => `- ${m.unread ? "UNREAD: " : ""}${m.subject || "(no subject)"} — from ${m.from}`)
    .join("\n");

  const prompt = `Today is ${today}. Write a very short "at a glance" summary of the user's day. Rules:
- 3 to 7 short lines, each one a bullet or a short sentence. NEVER long paragraphs.
- Use **bold** on the key words (titles, counts, times).
- Structure: one line for the schedule/events, one or two lines for tasks (mention count and the most important ones, flag overdue), one line for the inbox only if something needs attention, optionally one final short suggestion line.
- No markdown headers. No greetings like "Good morning". Do not mention weather.

Events today:
${eventLines || "(none)"}

Tasks today (or overdue):
${taskLines || "(none)"}

Top inbox emails:
${emailLines || "(none)"}`;

  try {
    const provider = resolveProvider(settings as Parameters<typeof resolveProvider>[0]);
    const { content } = await chatCompletion({
      provider,
      messages: [
        {
          role: "system",
          content:
            "You are Kamkazi's today-page summary assistant. Output short punchy lines with bold keywords, never paragraphs.",
        },
        { role: "user", content: prompt },
      ],
      timeoutMs: 30_000,
    });
    const text = content.trim();
    if (!text) throw new Error("empty summary");
    cache.set(key, { at: Date.now(), text, ai: true });
    return json({ text, ai: true, cached: false });
  } catch (err) {
    console.error("[today-summary] AI failed, static fallback:", err);
    const parts: string[] = [];
    if (todaysEvents.length)
      parts.push(
        `**${todaysEvents.length} event${todaysEvents.length === 1 ? "" : "s"}** scheduled today.`,
      );
    const open = todaysTasks.filter((t) => !t.done);
    if (open.length)
      parts.push(
        `**${open.length} open task${open.length === 1 ? "" : "s"}** due today.` +
          (open[0]?.title ? ` Top: **${open[0].title}**.` : ""),
      );
    const unread = emails.filter((m) => m.unread);
    if (unread.length)
      parts.push(
        `**${unread.length} unread email${unread.length === 1 ? "" : "s"}** in the inbox.`,
      );
    const text = parts.join(" ") || "Quiet day — nothing scheduled, no open tasks.";
    cache.set(key, { at: Date.now(), text, ai: false });
    return json({ text, ai: false, cached: false });
  }
}

/** Top recent/unread emails across email-enabled accounts (read-only). */
async function topInbox(
  cookie: string,
): Promise<{ from: string; subject: string; unread: boolean }[]> {
  const mod = await import("./inbox-overview.handler");
  // inboxOverviewHandler authenticates from cookies — reuse the caller's
  // session by forwarding the original request's cookies.
  const withCookies = new Request("http://local/api/inbox-overview", {
    headers: { cookie },
  });
  const res = await mod.inboxOverviewHandler(withCookies);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    emails?: { from: string; subject: string; unread: boolean }[];
  };
  return (data.emails ?? []).map((m) => ({
    from: m.from,
    subject: m.subject,
    unread: m.unread,
  }));
}
