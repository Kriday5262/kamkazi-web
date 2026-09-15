/**
 * Timesheet day-journal — server logic.
 *
 * POST { date, force? } → { text, ai, cached }
 *
 * Builds an AI "journal" for the given IST day from: incoming/sent emails,
 * calendar events, tasks due/completed that day. Stored in
 * `timesheet_summaries` (one row per user+date) so looking back at any day is
 * a stable read — regeneration is explicit (force: true).
 *
 * Emails: subject + one-line gist only, never full bodies.
 */
import { istToday } from "@/lib/format";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, calendarSources, tasks, timesheetSummaries, userSettings } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import { chatCompletion, resolveProvider } from "@/server/ai.server";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function timesheetSummaryHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthorized" }, 401);
  const uid = session.uid;
  const body = (await request.json().catch(() => ({}))) as {
    date?: string;
    force?: boolean;
  };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date ?? ""))
    ? String(body.date)
    : istToday();
  const force = body.force === true;
  const summaryId = `${uid}|${date}`;

  if (!force) {
    const existing = await db
      .select()
      .from(timesheetSummaries)
      .where(eq(timesheetSummaries.id, summaryId))
      .limit(1);
    if (existing[0]) {
      return json({
        text: existing[0].summary,
        ai: existing[0].ai,
        cached: true,
        generatedAt: existing[0].generatedAtTs,
      });
    }
  }

  // ---- gather the day's data ----
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

  const dayTasks = taskRows.filter((t) => t.dueDate === date);
  const doneTasks = taskRows.filter(
    (t) => t.done && t.updatedAtTs && isoOf(t.updatedAtTs) === date,
  );
  const dayEvents = eventRows.filter((e) => e.date === date);
  const timesheetRows = await import("@/db/schema").then((m) =>
    db
      .select()
      .from(m.timesheetEntries)
      .where(eq(m.timesheetEntries.userId, uid))
      .orderBy(asc(m.timesheetEntries.createdAtTs)),
  );
  const dayEntries = timesheetRows.filter((r) => r.date === date);

  const emails = await Promise.race([
    dayEmails(request.headers.get("cookie") ?? "", date),
    new Promise<{ dir: string; from: string; subject: string }[]>((r) =>
      setTimeout(() => r([]), 8_000),
    ),
  ]).catch(() => []);

  // ---- prompt ----
  const fmtTask = (t: (typeof taskRows)[number], done: boolean) =>
    `- ${done ? "[completed] " : ""}${t.title}${t.dueTime ? ` at ${t.dueTime}` : ""}`;
  const taskLines = [
    ...dayTasks.filter((t) => !t.done).slice(0, 10).map((t) => fmtTask(t, false)),
    ...doneTasks.slice(0, 10).map((t) => fmtTask(t, true)),
  ].join("\n");
  const eventLines = dayEvents
    .slice(0, 15)
    .map((e) => `- ${e.allDay || !e.start ? "All day" : e.start} — ${e.title} (${labelFor(e)})`)
    .join("\n");
  const emailLines = emails
    .slice(0, 10)
    .map((m) => `- [${m.dir === "sent" ? "sent" : "received"}] ${m.subject || "(no subject)"} — ${m.from}`)
    .join("\n");
  const entryLines = dayEntries
    .map((r) => `- ${r.title} (${r.type}, ${r.area}${r.hours ? `, ${r.hours}h` : ""})`)
    .join("\n");

  const prompt = `Today is ${date}. Write a short daily journal entry ("what happened today") for the user's personal log. Rules:
- 2 to 4 short PARAGRAPHS (this is a look-back journal, unlike the Today page's bullet glance).
- Use **bold** on key words (titles, names, counts).
- Cover, each in its own sentence or two: emails received/sent (subject + one-line gist, NEVER full bodies), events held that day, tasks completed and tasks that fell due, and the user's own timesheet entries (what they worked on).
- End with a "Highlight:" sentence if anything clearly important happened (big meeting, milestone, many completions, urgent email). If nothing notable, omit the Highlight line.
- No markdown headers. No greetings.

Events on ${date}:
${eventLines || "(none)"}

Tasks due/completed on ${date}:
${taskLines || "(none)"}

Emails on ${date}:
${emailLines || "(none)"}

User's own timesheet entries:
${entryLines || "(none)"}`;

  try {
    const provider = resolveProvider(settingsRows[0]?.settings as Record<string, unknown>);
    const { content } = await chatCompletion({
      provider,
      messages: [
        {
          role: "system",
          content:
            "You are Kamkazi's daily-journal assistant. Write a warm, factual, concise end-of-day journal paragraph-set. English only. Bold key facts. Never invent events, emails, or tasks that are not in the data.",
        },
        { role: "user", content: prompt },
      ],
      timeoutMs: 45_000,
    });
    const text = content.trim();
    if (!text) throw new Error("empty summary");
    await db
      .insert(timesheetSummaries)
      .values({ id: summaryId, userId: uid, date, summary: text, ai: true })
      .onConflictDoUpdate({
        target: timesheetSummaries.id,
        set: { summary: text, ai: true, generatedAtTs: new Date() },
      });
    return json({ text, ai: true, cached: false });
  } catch (err) {
    console.error("[timesheet-summary] AI failed, static fallback:", err);
    const parts: string[] = [];
    if (dayEvents.length)
      parts.push(`**${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}** held.`);
    const doneCount = doneTasks.length;
    if (doneCount) parts.push(`**${doneCount} task${doneCount === 1 ? "" : "s"}** completed.`);
    if (dayEntries.length) parts.push(`**${dayEntries.length} timesheet entr${dayEntries.length === 1 ? "y" : "ies"}** logged.`);
    const text = parts.join(" ") || "Quiet day — nothing recorded.";
    await db
      .insert(timesheetSummaries)
      .values({ id: summaryId, userId: uid, date, summary: text, ai: false })
      .onConflictDoUpdate({
        target: timesheetSummaries.id,
        set: { summary: text, ai: false, generatedAtTs: new Date() },
      });
    return json({ text, ai: false, cached: false });
  }
}

function isoOf(d: Date): string {
  // IST calendar-day of a timestamp (app is IST-disciplined).
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  return ist.toISOString().slice(0, 10);
}

/** Received emails for a given IST day (subject only, no bodies).
 *  Gmail is read-only inbox — sent mail is not available in-app. */
async function dayEmails(
  cookie: string,
  date: string,
): Promise<{ dir: string; from: string; subject: string }[]> {
  try {
    const mod = await import("./email-list.handler");
    const withCookies = new Request(
      `http://local/api/email-list?pageSize=50`,
      { headers: { cookie } },
    );
    const res = await mod.emailListHandler(withCookies);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      emails?: { date?: string; from?: string; subject?: string }[];
    };
    // Gmail dates are RFC timestamps; bucket by the IST calendar day.
    const all = (data.emails ?? []).map((m) => ({
      dir: "received",
      from: m.from || "?",
      subject: m.subject || "(no subject)",
      date: m.date || "",
    }));
    const day = all.filter((m) => istDayOf(m.date) === date);
    return day.slice(0, 12);
  } catch {
    return [];
  }
}

function istDayOf(rfc?: string): string {
  if (!rfc) return "";
  const t = Date.parse(rfc);
  if (Number.isNaN(t)) return "";
  return new Date(t + 5.5 * 3600_000).toISOString().slice(0, 10);
}