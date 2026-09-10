/**
 * Stage 3 — streaming chat endpoint (POST /api/chat).
 *
 * TanStack Start runs on Nitro, so a plain route handler module here is
 * scanned and mounted at /api/chat. It streams SSE-style framed events to
 * the client and persists the conversation when the stream completes.
 *
 * Event protocol (one JSON object per line, `data: {...}\n\n`):
 *   { type: "delta", content }                    — assistant token
 *   { type: "tool", tool, args, needsConfirm }    — tool call detected
 *   { type: "done", conversationId, messageId, toolResults }
 *   { type: "error", message }
 *
 * Write tools (create_task / complete_task / create_note) are NOT executed
 * here — the client shows a confirmation card and POSTs /api/tool-confirm.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages, conversations, userSettings } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import {
  type AiSettings,
  type ChatMessageIn,
  TOOL_DEFINITIONS,
  WRITE_TOOLS,
  fetchOpenMeteo,
  resolveProvider,
  streamChatCompletion,
} from "@/server/ai.server";

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

async function loadSettings(uid: string): Promise<AiSettings> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, uid)).limit(1);
  return (rows[0]?.settings ?? {}) as AiSettings;
}

async function loadHistory(conversationId: string): Promise<ChatMessageIn[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAtTs));
  return rows.map((m) => ({ role: m.role as ChatMessageIn["role"], content: m.content }));
}

const SYSTEM_PROMPT = `You are Kamkazi, the user's personal assistant inside their productivity app. Today's date is {date}. You have tools to manage tasks, notes, the calendar (list_events_day, create_event — the user's events include read-only subscribed ICS events) and check the weather (Dehradun, India by default). You also have READ-ONLY email tools — list_recent_emails, search_emails (Gmail search syntax like 'from:priya newer_than:7d'), read_email — across the user's connected Gmail accounts (tagged per account). These email tools never modify anything (no send, no archive, no mark-read). If email tools say email is not enabled, tell the user to click "Enable email" next to their Google account in Settings → Calendar. Tasks with a due date AND time trigger a push notification (and email, if enabled) a few minutes before the due time — when the user says "remind me to X at 3pm", create a task with the dueDate set to today and dueTime "15:00". Be concise, warm and practical. Tasks and notes are created immediately without confirmation (one-step). Calendar events and completing tasks still show a confirmation card — when the user asks you to create/complete something, call the matching tool as soon as intent is clear.`;

export async function chatHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) return json({ error: "unauthenticated" }, 401);
  const uid = session.uid;

  const bodyInput = (await request.json().catch(() => null)) as {
    conversationId?: string;
    message?: string;
  } | null;
  const message = bodyInput?.message?.trim();
  if (!message) return json({ error: "message required" }, 400);

  // Resolve / create the conversation.
  let conversationId = bodyInput?.conversationId ?? "";
  if (conversationId) {
    const owned = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, uid)))
      .limit(1);
    if (owned.length === 0) conversationId = "";
  }
  if (!conversationId) {
    conversationId = `c_${Math.random().toString(36).slice(2, 10)}`;
    await db.insert(conversations).values({
      id: conversationId,
      userId: uid,
      title: message.slice(0, 42) || "New chat",
    });
  } else {
    await db
      .update(conversations)
      .set({ updatedAtTs: new Date() })
      .where(eq(conversations.id, conversationId));
  }

  // Persist the user message.
  const userMsgId = `m_${Math.random().toString(36).slice(2, 10)}`;
  await db.insert(chatMessages).values({
    id: userMsgId,
    conversationId,
    role: "user",
    content: message,
  });

  const settings = await loadSettings(uid);
  const history = await loadHistory(conversationId);

  // Weather context is cheap and makes every answer better; ignore failures.
  let weatherLine = "";
  try {
    const w = await fetchOpenMeteo(settings);
    weatherLine = ` Current weather in ${w.location}: ${w.condition}, ${w.temp}°C.`;
  } catch {
    // weather is optional context
  }

  const messages: ChatMessageIn[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT.replace("{date}", new Date().toISOString().slice(0, 10)) + weatherLine,
    },
    ...history,
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (obj: unknown) => controller.enqueue(encoder.encode(sse(obj)));
      try {
        let provider;
        try {
          provider = resolveProvider(settings);
        } catch (e) {
          throw new Error(e instanceof Error ? e.message : "AI provider misconfigured");
        }

        const first = await streamChatCompletion({
          provider,
          messages,
          tools: TOOL_DEFINITIONS,
          onDelta: (d) => push({ type: "delta", content: d }),
        });

        let assistantContent = first.content;
        const executed: { tool: string; summary: string; args: Record<string, unknown> }[] = [];
        let pending = first.toolCalls;
        let guard = 0;

        while (pending.length > 0 && guard < 3) {
          guard += 1;
          const silent = pending.filter((tc) => !WRITE_TOOLS.has(tc.name));
          const needingConfirm = pending.filter((tc) => WRITE_TOOLS.has(tc.name));

          // Read-only tools: execute silently, feed results back.
          if (silent.length > 0) {
            messages.push({
              role: "assistant",
              content: assistantContent,
              tool_calls: silent.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.arguments },
              })),
            });
            for (const tc of silent) {
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(tc.arguments || "{}") as Record<string, unknown>;
              } catch {
                args = {};
              }
              const { executeTool } = await import("@/server/ai.server");
              const result = await executeTool(uid, tc.name, args);
              executed.push({ tool: tc.name, summary: result.summary, args });
              push({ type: "tool", tool: tc.name, args, needsConfirm: false });
              messages.push({ role: "tool", content: result.summary, tool_call_id: tc.id });
            }
          }

          // Write tools: surface for confirmation, do NOT execute here.
          for (const tc of needingConfirm) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.arguments || "{}") as Record<string, unknown>;
            } catch {
              args = {};
            }
            push({ type: "tool", tool: tc.name, args, needsConfirm: true });
            executed.push({ tool: tc.name, summary: "Awaiting confirmation", args });
            messages.push({
              role: "assistant",
              content: assistantContent,
              tool_calls: [
                {
                  id: tc.id,
                  type: "function" as const,
                  function: { name: tc.name, arguments: tc.arguments },
                },
              ],
            });
            messages.push({
              role: "tool",
              content: "The user must confirm this action in the UI before it runs.",
              tool_call_id: tc.id,
            });
          }

          // Follow-up turn so the assistant can react to tool output.
          const follow = await streamChatCompletion({
            provider,
            messages,
            tools: TOOL_DEFINITIONS,
            onDelta: (d) => push({ type: "delta", content: d }),
          });
          assistantContent = follow.content;
          pending = follow.toolCalls;
        }

        // Persist the assistant reply.
        const assistantMsgId = `m_${Math.random().toString(36).slice(2, 10)}`;
        await db.insert(chatMessages).values({
          id: assistantMsgId,
          conversationId,
          role: "assistant",
          content: assistantContent || "(no content)",
        });

        push({
          type: "done",
          conversationId,
          assistantMessageId: assistantMsgId,
          toolResults: executed,
        });
      } catch (e) {
        push({
          type: "error",
          message: e instanceof Error ? e.message : "AI request failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
