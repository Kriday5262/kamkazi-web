/**
 * Stage 3 client helpers — talk to the /api/* AI endpoints.
 *
 * These are plain fetches (not createServerFn) because the endpoints stream
 * SSE-style framed events, which server functions don't support.
 */

export interface ChatStreamEvents {
  onDelta?: (content: string) => void;
  onTool?: (
    tool: string,
    args: Record<string, string | number | boolean | null>,
    needsConfirm: boolean,
  ) => void;
  onDone?: (info: {
    conversationId: string;
    assistantMessageId: string;
    toolResults: { tool: string; summary: string }[];
  }) => void;
  onError?: (message: string) => void;
  /** AbortSignal so the UI can stop generation mid-stream. */
  signal?: AbortSignal;
}

/** POST /api/chat and consume the event stream. Returns conversationId. */
export async function streamChat(
  message: string,
  conversationId: string | undefined,
  events: ChatStreamEvents,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, conversationId }),
    ...(events.signal ? { signal: events.signal } : {}),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    events.onError?.(`Chat request failed (${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 2);
      if (!frame.startsWith("data:")) continue;
      let evt: {
        type: string;
        content?: string;
        tool?: string;
        args?: Record<string, unknown>;
        needsConfirm?: boolean;
        conversationId?: string;
        assistantMessageId?: string;
        toolResults?: { tool: string; summary: string }[];
        message?: string;
      };
      try {
        evt = JSON.parse(frame.slice(5).trim());
      } catch {
        continue;
      }
      if (evt.type === "delta") events.onDelta?.(evt.content ?? "");
      else if (evt.type === "tool")
        events.onTool?.(
          evt.tool ?? "",
          (evt.args ?? {}) as Record<string, string | number | boolean | null>,
          evt.needsConfirm === true,
        );
      else if (evt.type === "done")
        events.onDone?.({
          conversationId: evt.conversationId ?? "",
          assistantMessageId: evt.assistantMessageId ?? "",
          toolResults: evt.toolResults ?? [],
        });
      else if (evt.type === "error") events.onError?.(evt.message ?? "AI error");
    }
  }
}

export interface ToolConfirmResult {
  ok: boolean;
  summary: string;
}

export async function confirmTool(
  tool: string,
  args: Record<string, string | number | boolean | null>,
): Promise<ToolConfirmResult> {
  const res = await fetch("/api/tool-confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool, args }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, summary: `Failed (${res.status})${text ? `: ${text.slice(0, 150)}` : ""}` };
  }
  return (await res.json()) as ToolConfirmResult;
}

export interface BriefingResponse {
  text: string;
  generatedAt: string;
  cached: boolean;
  ai: boolean;
}

export async function fetchBriefing(): Promise<BriefingResponse> {
  const res = await fetch("/api/briefing");
  if (!res.ok) throw new Error(`Briefing failed (${res.status})`);
  return (await res.json()) as BriefingResponse;
}

export interface WeatherResponse {
  temp: number;
  condition: string;
  high: number;
  low: number;
  location: string;
}

export async function fetchWeather(): Promise<WeatherResponse> {
  const res = await fetch("/api/weather");
  if (!res.ok) throw new Error(`Weather failed (${res.status})`);
  return (await res.json()) as WeatherResponse;
}
