/**
 * Briefing logic (plain async handler, no route registration here).
 * Mounted by ./briefing.ts as a TanStack Start server-only route handler.
 *
 * AI-generated daily briefing (today's tasks + weather + one focus
 * suggestion), generated at most once per hour (in-memory per-user cache).
 * Falls back to a static summary built from the DB if the AI call fails.
 */
import { istToday } from "@/lib/format";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, userSettings } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import { unreadInboxDigest } from "@/server/briefing-email.server";
import {
  type AiSettings,
  type WeatherNow,
  chatCompletion,
  fetchOpenMeteo,
  resolveProvider,
} from "@/server/ai.server";

export interface Briefing {
  text: string;
  generatedAt: string;
  cached: boolean;
  ai: boolean;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
// Per-user cache survives module reloads within the same server process.
const cache = new Map<string, { at: number; briefing: Briefing }>();

async function loadAiSettings(uid: string): Promise<AiSettings> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, uid));
  return (rows[0]?.settings ?? {}) as AiSettings;
}

async function staticBriefing(uid: string, weather: WeatherNow | null): Promise<Briefing> {
  const today = istToday();
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, uid), eq(tasks.done, false)))
    .orderBy(asc(tasks.dueDate));
  const todays = rows.filter((t) => !t.dueDate || t.dueDate <= today);
  const lines = [
    `You have ${todays.length} open task${todays.length === 1 ? "" : "s"} today.`,
    ...todays.slice(0, 5).map((t) => `- ${t.title}${t.dueDate === today ? " (due today)" : ""}`),
    weather ? `Weather in ${weather.location}: ${weather.condition}, ${weather.temp}°C.` : "",
  ].filter(Boolean);
  return {
    text: lines.join("\n"),
    generatedAt: new Date().toISOString(),
    cached: false,
    ai: false,
  };
}

export async function briefingHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const uid = session.uid;

  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    const body: Briefing = { ...hit.briefing, cached: true };
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const settings = await loadAiSettings(uid);
    const provider = resolveProvider(settings);

    const [taskRows, weather] = await Promise.all([
      db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, uid), eq(tasks.done, false)))
        .orderBy(asc(tasks.dueDate)),
      fetchOpenMeteo(settings).catch(() => null),
    ]);

    const today = istToday();
    const todays = taskRows.filter((t) => !t.dueDate || t.dueDate <= today);
    const taskLines = todays
      .slice(0, 15)
      .map((t) => `- ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ""}`)
      .join("\n");

    const weatherLine = weather
      ? `Current weather in ${weather.location}: ${weather.condition}, ${weather.temp}°C (feels ${weather.apparent}°C), high ${weather.high}°C, low ${weather.low}°C.`
      : "Weather unavailable.";

    // Optional unread-inbox digest — only when an account has email enabled
    // AND the emailDigest setting is on. Hard 10s timeout; failure → "".
    const emailDigest = await Promise.race([
      unreadInboxDigest(uid, 5),
      new Promise<string>((resolve) => setTimeout(() => resolve(""), 10_000)),
    ]);

    const prompt = `Write a short morning briefing (max 5 sentences, warm and practical). Cover: how many tasks are due today and the 2-3 most important ones; the weather; one suggested focus for the day. Do not use markdown headers.

Tasks due today or overdue:
${taskLines || "(none)"}

${weatherLine}${emailDigest ? `\n\n${emailDigest}\nMention at most the 2-3 most interesting unread emails, very briefly.` : ""}`;

    const { content } = await chatCompletion({
      provider,
      messages: [
        {
          role: "system",
          content:
            "You are Kamkazi's daily briefing assistant. Be concise, specific, and encouraging. Plain text only.",
        },
        { role: "user", content: prompt },
      ],
      timeoutMs: 30_000,
    });

    const briefing: Briefing = {
      text: content.trim() || (await staticBriefing(uid, weather)).text,
      generatedAt: new Date().toISOString(),
      cached: false,
      ai: true,
    };
    cache.set(uid, { at: Date.now(), briefing });
    return new Response(JSON.stringify(briefing), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("[briefing] AI failed, using static fallback:", err);
    const fallback = await staticBriefing(uid, null);
    return new Response(JSON.stringify(fallback), {
      headers: { "content-type": "application/json" },
    });
  }
}
