/**
 * Stage 3 — AI layer (server-only).
 *
 * OpenAI-compatible chat-completions client (plain fetch, SSE streaming) with
 * provider resolution from user settings:
 *   - "hermes"  (default): local Hermes endpoint, model glm-5.3-flash:cloud
 *   - "openai": api.openai.com, key from settings or OPENAI_API_KEY
 *   - "ollama": local Ollama /v1
 *
 * Also defines the agent tools (function calling) and their server-side
 * executors. Every executor takes the authenticated uid — the AI never
 * receives or sends a user id.
 *
 * This file is imported only from server-only modules (*.server.ts / api
 * route handlers); it must never be in the client graph.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, googleAccounts, notes, tasks } from "@/db/schema";
import { getFreshAccessToken, GMAIL_READONLY_SCOPE } from "@/server/google-oauth.server";
import {
  listRecentEmails,
  readEmail,
  searchEmails,
  type GmailMessageSummary,
} from "@/server/gmail.server";

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

export type AiProvider = "hermes" | "openai" | "ollama";

export interface AiSettings {
  aiProvider?: AiProvider;
  aiModel?: string;
  aiApiKey?: string;
  weatherLat?: number;
  weatherLon?: number;
  weatherLocation?: string;
}

export interface ResolvedProvider {
  baseUrl: string;
  model: string;
  apiKey?: string;
  provider: AiProvider;
}

export function resolveProvider(settings: AiSettings): ResolvedProvider {
  const provider: AiProvider = settings.aiProvider ?? "hermes";
  if (provider === "openai") {
    const apiKey = settings.aiApiKey || process.env["OPENAI_API_KEY"] || "";
    if (!apiKey) {
      throw new Error(
        "OpenAI provider selected but no API key is configured. Add one in Settings → AI or set OPENAI_API_KEY.",
      );
    }
    return {
      provider,
      baseUrl: "https://api.openai.com/v1",
      model: settings.aiModel || "gpt-4o-mini",
      apiKey,
    };
  }
  if (provider === "ollama") {
    return {
      provider,
      baseUrl: process.env["OLLAMA_BASE_URL"] || "http://host.docker.internal:11434/v1",
      model: settings.aiModel || "llama3.1",
    };
  }
  // hermes (default)
  return {
    provider,
    baseUrl: process.env["HERMES_BASE_URL"] || "http://192.168.29.188:11436/v1",
    model: settings.aiModel || "glm-5.3-flash:cloud",
  };
}

// ---------------------------------------------------------------------------
// Chat completions (streaming)
// ---------------------------------------------------------------------------

export interface ChatMessageIn {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** For assistant messages that requested tools. */
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  /** For role "tool". */
  tool_call_id?: string;
}

export interface ToolCallOut {
  id: string;
  name: string;
  arguments: string;
}

export interface StreamResult {
  content: string;
  toolCalls: ToolCallOut[];
}

/** Streaming delta sink — the caller decides what to do with tokens. */
export type DeltaSink = (delta: string) => void;

export async function streamChatCompletion(opts: {
  provider: ResolvedProvider;
  messages: ChatMessageIn[];
  tools?: unknown[];
  onDelta?: DeltaSink;
  timeoutMs?: number;
}): Promise<StreamResult> {
  const { provider, messages, tools, onDelta } = opts;
  const body: Record<string, unknown> = {
    model: provider.model,
    messages,
    stream: true,
  };
  if (tools && tools.length > 0) body["tools"] = tools;

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI provider error (${res.status}): ${text.slice(0, 300) || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCallAcc = new Map<number, { id: string; name: string; args: string }>();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      let parsed: {
        choices?: {
          delta?: {
            content?: string | null;
            tool_calls?: {
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }[];
          };
        }[];
      };
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        content += delta.content;
        onDelta?.(delta.content);
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const acc = toolCallAcc.get(idx) ?? { id: "", name: "", args: "" };
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name += tc.function.name;
          if (tc.function?.arguments) acc.args += tc.function.arguments;
          toolCallAcc.set(idx, acc);
        }
      }
    }
  }

  const toolCalls: ToolCallOut[] = [...toolCallAcc.values()]
    .filter((tc) => tc.name)
    .map((tc, i) => ({
      id: tc.id || `call_${Date.now()}_${i}`,
      name: tc.name,
      arguments: tc.args || "{}",
    }));
  return { content, toolCalls };
}

/** Non-streaming completion (used for briefing + post-tool follow-ups). */
export async function chatCompletion(opts: {
  provider: ResolvedProvider;
  messages: ChatMessageIn[];
  tools?: unknown[];
  timeoutMs?: number;
}): Promise<{ content: string; toolCalls: ToolCallOut[] }> {
  const { provider, messages, tools } = opts;
  const body: Record<string, unknown> = { model: provider.model, messages };
  if (tools && tools.length > 0) body["tools"] = tools;
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI provider error (${res.status}): ${text.slice(0, 300) || res.statusText}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string; tool_calls?: ToolCallOut[] } }[];
  };
  const msg = json.choices?.[0]?.message;
  return {
    content: msg?.content ?? "",
    toolCalls: msg?.tool_calls ?? [],
  };
}

// ---------------------------------------------------------------------------
// Weather (Open-Meteo)
// ---------------------------------------------------------------------------

const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Heavy rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
};

export interface WeatherNow {
  temp: number;
  apparent: number;
  condition: string;
  high: number;
  low: number;
  location: string;
}

export async function fetchOpenMeteo(settings: AiSettings): Promise<WeatherNow> {
  const lat = settings.weatherLat ?? 30.3165;
  const lon = settings.weatherLon ?? 78.0322;
  const name = settings.weatherLocation || "Dehradun";
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Open-Meteo error (${res.status})`);
  const json = (await res.json()) as {
    current?: {
      temperature_2m?: number;
      apparent_temperature?: number;
      weather_code?: number;
    };
    daily?: {
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
    };
  };
  const cur = json.current ?? {};
  return {
    temp: Math.round(cur.temperature_2m ?? 0),
    apparent: Math.round(cur.apparent_temperature ?? cur.temperature_2m ?? 0),
    condition: WEATHER_CODES[cur.weather_code ?? 0] ?? "Unknown",
    high: Math.round(json.daily?.temperature_2m_max?.[0] ?? 0),
    low: Math.round(json.daily?.temperature_2m_min?.[0] ?? 0),
    location: name,
  };
}

// ---------------------------------------------------------------------------
// Tools (function calling)
// ---------------------------------------------------------------------------

// create_task / create_note run without confirmation (low-risk, easily
// reversible); completing a task or creating a calendar event still confirm.
export const WRITE_TOOLS = new Set(["complete_task", "create_event"]);

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "list_tasks_today",
      description:
        "List the user's tasks. By default: open tasks due today or overdue. Optionally filter by tag (e.g. 'Show all tasks with the NStarX tag').",
      parameters: {
        type: "object",
        properties: {
          tag: {
            type: "string",
            description:
              "Optional tag name (case-insensitive, partial match allowed) to filter tasks by tag.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather and today's high/low for the user's location (Dehradun).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_events_day",
      description: "List the user's calendar events for a given day (IST date).",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: 'ISO date "YYYY-MM-DD" (resolve relative days using today\'s date)',
          },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_event",
      description:
        "Create a local calendar event. Confirm details with the user via the confirmation card.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          date: {
            type: "string",
            description: 'ISO date "YYYY-MM-DD" in the user\'s timezone (IST)',
          },
          startTime: {
            type: "string",
            description: '"HH:MM" 24h local (IST) start time; omit for all-day',
          },
          durationMin: { type: "number", description: "Duration in minutes; default 60" },
        },
        required: ["title", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a task. Runs immediately without confirmation.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          dueDate: {
            type: "string",
            description: 'ISO date "YYYY-MM-DD" (resolve relative days using today\'s date)',
          },
          dueTime: { type: "string", description: '"HH:MM" 24h time, optional' },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark one of the user's tasks as done, matched by title.",
      parameters: {
        type: "object",
        properties: { title: { type: "string", description: "Task title (or part of it)" } },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Create a markdown note in the user's Personal notebook.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string", description: "Markdown body" },
        },
        required: ["title"],
      },
    },
  },
  // Read-only Gmail tools (silent execution; require the user to have clicked
  // "Enable email" on the Google account in Settings → Calendar first).
  {
    type: "function",
    function: {
      name: "list_recent_emails",
      description:
        "List recent emails from the user's connected Gmail account(s). Read-only. Results are tagged with the account name.",
      parameters: {
        type: "object",
        properties: {
          account: {
            type: "string",
            description:
              "Optional: which Google account to use (email address or part of it). Omit to merge across ALL email-enabled accounts.",
          },
          max: { type: "number", description: "Max emails to return (default 10, max 50)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_emails",
      description:
        "Search the user's Gmail with Gmail search syntax (e.g. 'from:priya newer_than:7d', 'is:unread label:work'). Read-only.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Gmail search query" },
          account: {
            type: "string",
            description:
              "Optional account (email or part). Omit to search across all enabled accounts.",
          },
          max: { type: "number", description: "Max results (default 10, max 50)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_email",
      description:
        "Read one email's full body by id (from list_recent_emails / search_emails). Read-only.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Gmail message id" },
          account: { type: "string", description: "Optional account (email or part)" },
        },
        required: ["id"],
      },
    },
  },
  // Read-only file tools (Phase 4) — scoped to the drive root, never write.
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List the user's personal drive files/folders, or search all file names. Read-only. Use for things like 'find my Kamkazi hero images'.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Folder path to list (e.g. '/' or '/Work/Kamkazi'). Default '/'.",
          },
          search: {
            type: "string",
            description: "Optional: search all file names (recursive) for this text instead of listing.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a text file from the user's personal drive (.md/.txt/code, max 200 KB) by path (from list_files). Read-only.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Full file path e.g. '/Work/Kamkazi/notes.md'" },
        },
        required: ["path"],
      },
    },
  },
];

export interface ToolExecution {
  ok: boolean;
  /** Human-readable summary shown in the UI card / AI follow-up. */
  summary: string;
}

/** Read-only tools run silently; write tools only run after user confirmation. */
export async function executeTool(
  uid: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolExecution> {
  const today = new Date().toISOString().slice(0, 10);
  switch (name) {
    case "list_tasks_today": {
      const tagArg = args["tag"] ? String(args["tag"]).trim().toLowerCase() : "";
      const rows = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, uid), eq(tasks.done, false)))
        .orderBy(asc(tasks.dueDate));
      let open = rows.filter((t) => t.dueDate && t.dueDate <= today);
      if (tagArg) {
        open = open.filter((t) => t.tags.some((tag) => tag.toLowerCase().includes(tagArg)));
      }
      if (open.length === 0)
        return {
          ok: true,
          summary: tagArg
            ? `No open tasks with a “${args["tag"]}” tag due today or overdue.`
            : "No open tasks due today.",
        };
      return {
        ok: true,
        summary: open
          .slice(0, 15)
          .map((t) => `- ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ""}`)
          .join("\n"),
      };
    }
    case "get_weather": {
      const w = await fetchOpenMeteo({});
      return {
        ok: true,
        summary: `Current weather in ${w.location}: ${w.condition}, ${w.temp}°C (feels like ${w.apparent}°C). Today: high ${w.high}°, low ${w.low}°.`,
      };
    }
    case "create_task": {
      const title = String(args["title"] ?? "").trim();
      if (!title) return { ok: false, summary: "Missing task title." };
      const id = `t_${Math.random().toString(36).slice(2, 10)}`;
      const dueDate = args["dueDate"] ? String(args["dueDate"]) : null;
      await db.insert(tasks).values({
        id,
        userId: uid,
        listId: "inbox",
        title,
        done: false,
        dueDate,
        dueTime: args["dueTime"] ? String(args["dueTime"]) : null,
        priority: "none",
        tags: [],
        subtasks: [],
        attachments: [],
        createdAt: today,
        updatedAt: today,
      });
      return { ok: true, summary: `Task created: “${title}”${dueDate ? ` (due ${dueDate})` : ""}` };
    }
    case "complete_task": {
      const q = String(args["title"] ?? "")
        .trim()
        .toLowerCase();
      if (!q) return { ok: false, summary: "Missing task title." };
      const rows = await db.select().from(tasks).where(eq(tasks.userId, uid));
      const match = rows.find((t) => !t.done && t.title.toLowerCase().includes(q));
      if (!match) return { ok: false, summary: `No open task matching “${args["title"]}”.` };
      await db
        .update(tasks)
        .set({ done: true, updatedAt: today, updatedAtTs: new Date() })
        .where(and(eq(tasks.id, match.id), eq(tasks.userId, uid)));
      return { ok: true, summary: `Completed: “${match.title}”` };
    }
    case "create_note": {
      const title = String(args["title"] ?? "").trim() || "New note";
      const body = String(args["body"] ?? "");
      const id = `n_${Math.random().toString(36).slice(2, 10)}`;
      await db.insert(notes).values({
        id,
        userId: uid,
        notebookId: "personal",
        title,
        body,
        tags: [],
        pinned: false,
      });
      return { ok: true, summary: `Note created: “${title}”` };
    }
    case "list_events_day": {
      const date = String(args["date"] ?? today);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        return { ok: false, summary: "Bad date (need YYYY-MM-DD)." };
      const rows = await db
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.userId, uid), eq(calendarEvents.date, date)))
        .orderBy(asc(calendarEvents.start));
      if (rows.length === 0) return { ok: true, summary: `Nothing on the calendar for ${date}.` };
      return {
        ok: true,
        summary: rows
          .map(
            (e) =>
              `- ${e.title}${e.allDay ? " (all day)" : e.start ? ` at ${e.start}` : ""}${
                e.location ? `, ${e.location}` : ""
              }${e.durationMin ? ` (${e.durationMin} min)` : ""}`,
          )
          .join("\n"),
      };
    }
    case "create_event": {
      const title = String(args["title"] ?? "").trim();
      const date = String(args["date"] ?? "");
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date))
        return { ok: false, summary: "Missing title or bad date (need YYYY-MM-DD)." };
      const startTime = args["startTime"] ? String(args["startTime"]) : null;
      const durationMin = args["durationMin"] ? Number(args["durationMin"]) : null;
      const id = `ce_${Math.random().toString(36).slice(2, 10)}`;
      await db.insert(calendarEvents).values({
        id,
        userId: uid,
        title,
        date,
        start: startTime,
        durationMin,
        allDay: !startTime,
        location: null,
        calendar: "Personal",
        attendees: [],
      });
      return {
        ok: true,
        summary: `Event created: “${title}” on ${date}${startTime ? ` at ${startTime}` : " (all day)"}`,
      };
    }
    case "list_recent_emails":
    case "search_emails": {
      const accountArg = args["account"] ? String(args["account"]) : undefined;
      const max = args["max"] ? Number(args["max"]) : 10;
      const targets = await emailToolAccounts(uid, accountArg);
      if (targets.length === 0)
        return {
          ok: false,
          summary:
            "No email-enabled Google account. The user must click “Enable email” next to a Google account in Settings → Calendar (Google consent) first.",
        };
      const query = name === "search_emails" ? String(args["query"] ?? "").trim() : undefined;
      if (name === "search_emails" && !query)
        return { ok: false, summary: "Missing search query." };
      const all: { acctEmail: string; msgs: GmailMessageSummary[] }[] = [];
      for (const { acct, token } of targets) {
        try {
          const opts: { max?: number; query?: string } = { max };
          if (query !== undefined) opts.query = query;
          const msgs = await listRecentEmails(token, opts);
          all.push({ acctEmail: acct.googleEmail, msgs });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          all.push({ acctEmail: acct.googleEmail, msgs: [] });
          console.error(`[email tool] ${acct.googleEmail} failed: ${msg}`);
        }
      }
      const merged = all.flatMap(({ acctEmail, msgs }) =>
        msgs.map((m) => ({ acctEmail, m, ts: Date.parse(m.date) || 0 })),
      );
      merged.sort((a, b) => b.ts - a.ts);
      const top = merged.slice(0, max);
      if (top.length === 0)
        return { ok: true, summary: `No emails found${query ? ` for “${query}”` : ""}.` };
      return {
        ok: true,
        summary: top.map(({ acctEmail, m }) => fmtEmailLine(acctEmail, m)).join("\n"),
      };
    }
    case "read_email": {
      const msgId = String(args["id"] ?? "").trim();
      if (!msgId) return { ok: false, summary: "Missing email id." };
      const accountArg = args["account"] ? String(args["account"]) : undefined;
      const targets = await emailToolAccounts(uid, accountArg);
      if (targets.length === 0)
        return {
          ok: false,
          summary:
            "No email-enabled Google account. The user must click “Enable email” in Settings → Calendar first.",
        };
      for (const { acct, token } of targets) {
        try {
          const full = await readEmail(token, msgId);
          return {
            ok: true,
            summary: `From: ${full.from}\nAccount: ${acct.googleEmail}\nDate: ${full.date}\nSubject: ${full.subject}\n\n${full.body}`,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("not found")) continue; // try the next account
          return { ok: false, summary: `Could not read email: ${msg}` };
        }
      }
      return { ok: false, summary: `Email ${msgId} not found in any email-enabled account.` };
    }
    case "list_files": {
      const { listDir, walkFiles } = await import("@/server/files.server");
      const search = args["search"] ? String(args["search"]).trim() : "";
      if (search) {
        const out: { path: string; name: string; ext: string }[] = [];
        const SKIP = new Set(["immich", "movies", "tv shows", "music"]);
        const roots = SKIP.has(search.toLowerCase())
          ? ["/"]
          : ["/Work", "/Personal", "/"];
        for (const start of roots) {
          if (out.length > 0) break;
          await walkFiles(start, { depth: 8, max: 5000, out, deadline: Date.now() + 4_000, skip: SKIP });
        }
        const hits = out.filter((f) => f.name.toLowerCase().includes(search.toLowerCase())).slice(0, 20);
        if (hits.length === 0) return { ok: true, summary: `No files matching “${search}”.` };
        return { ok: true, summary: hits.map((f) => `- ${f.path}`).join("\n") };
      }
      const listing = await listDir(String(args["path"] ?? "/"));
      if (!listing) return { ok: false, summary: "Folder not found." };
      if (listing.entries.length === 0) return { ok: true, summary: "That folder is empty." };
      return {
        ok: true,
        summary: listing.entries
          .slice(0, 40)
          .map((e) => `- ${e.type === "dir" ? "[dir] " : ""}${e.name}${e.type === "file" ? ` (${e.sizeLabel})` : ""}`)
          .join("\n"),
      };
    }
    case "read_file": {
      const { isTextExt, readTextFile } = await import("@/server/files.server");
      const fp = String(args["path"] ?? "");
      const ext = fp.toLowerCase().replace(/.*\./, "");
      if (!isTextExt(ext))
        return { ok: false, summary: "Only text files (.md/.txt/code) can be read. Images and PDFs open in the Files section." };
      const res = await readTextFile(fp);
      if (!res) return { ok: false, summary: "File not found or too large (200 KB cap)." };
      return { ok: true, summary: `${fp}:\n\n${res.content}` };
    }
    default:
      return { ok: false, summary: `Unknown tool ${name}.` };
  }
}

// ---------------------------------------------------------------------------
// Gmail read-only tool helpers
// ---------------------------------------------------------------------------

async function emailToolAccounts(
  uid: string,
  accountArg?: string,
): Promise<{ acct: typeof googleAccounts.$inferSelect; token: string }[]> {
  const rows = await db.select().from(googleAccounts).where(eq(googleAccounts.userId, uid));
  const enabled = rows.filter((a) => (a.scopes ?? []).includes(GMAIL_READONLY_SCOPE));
  let targets = enabled;
  if (accountArg) {
    const q = accountArg.trim().toLowerCase();
    targets = enabled.filter(
      (a) => a.googleEmail.toLowerCase() === q || a.googleEmail.toLowerCase().includes(q),
    );
    if (targets.length === 0) targets = enabled; // unknown label → all accounts
  }
  const out: { acct: typeof googleAccounts.$inferSelect; token: string }[] = [];
  for (const acct of targets) {
    const token = await getFreshAccessToken(acct);
    if (token) out.push({ acct, token });
  }
  return out;
}

function fmtEmailLine(acctEmail: string, m: GmailMessageSummary): string {
  const dateStr = m.date
    ? new Date(m.date).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })
    : "";
  return `- [${acctEmail}] ${dateStr} · From: ${m.from || "(unknown)"} · ${m.subject || "(no subject)"}${m.unread ? " · UNREAD" : ""}${m.snippet ? `\n    ${m.snippet.slice(0, 120)}` : ""}`;
}
