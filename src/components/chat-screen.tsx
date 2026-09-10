/**
 * ChatScreen — Phase 3: fresh single-thread AI chat.
 *
 * The app opens ONE persistent thread (the user's most recent conversation
 * with messages; a new one is created on first send if none exists). Old
 * threads stay in the DB but are no longer listed.
 *
 * Token streaming (SSE via /api/chat), scroll-to-bottom, streaming
 * indicator, stop button, Enter-send / Shift+Enter newline, PendingActionCard
 * confirmation flow unchanged.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Copy, RefreshCw, Square, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/app-shell";
import { relativeStamp } from "@/lib/format";
import { TODAY, userName } from "@/data/seed";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SUGGESTIONS = [
  "What do I have today?",
  "What should I prioritise?",
  "Summarize my recent email from NStarX",
  "Create a task to review the proposal",
];

export function ChatScreen() {
  const {
    conversations,
    sendMessage,
    resolvePendingAction,
    stopStreaming,
    addConversation,
    streamingBusy,
  } = useStore();

  // Single thread: prefer the newest conversation that HAS messages (real
  // history); else the newest empty one; else nothing (created on first send).
  const active = useMemo(() => {
    const withMsgs = [...conversations]
      .filter((c) => c.messages.length > 0)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    if (withMsgs.length > 0) return withMsgs[0]!;
    const newest = [...conversations].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return newest[0] ?? null;
  }, [conversations]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");

  // Scroll to bottom whenever messages change or tokens stream in.
  const lastLen = useMemo(
    () => active?.messages.reduce((n, m) => n + m.content.length, 0) ?? 0,
    [active],
  );
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastLen, active?.id]);

  // If there is no conversation at all, lazily create one (empty) so the
  // composer has a target; the store persists it.
  const ensureThread = (): string => {
    if (active) return active.id;
    return addConversation();
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || streamingBusy) return;
    setDraft("");
    const id = ensureThread();
    sendMessage(id, text);
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      inputRef.current?.focus();
    });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader
        title="AI Chat"
        subtitle={active ? relativeStamp(active.updatedAt) : "Ask about your day"}
      />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-4 py-6 md:px-6">
          {!active || active.messages.length === 0 ? (
            <div className="pt-6">
              <p className="text-[22px] font-semibold tracking-tight">
                Ask me anything about your day, {userName}.
              </p>
              <p className="mt-1.5 text-[14.5px] text-muted-foreground">
                I can read your tasks, notes, schedule and email, and create things for you.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => {
                      if (streamingBusy) return;
                      const id = ensureThread();
                      sendMessage(id, text);
                      setDraft("");
                    }}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-3 text-left text-[14px] shadow-[var(--shadow-panel)] transition-colors hover:border-border-strong"
                  >
                    <Sparkles className="size-[17px] shrink-0 text-accent-violet" aria-hidden />
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {active.messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[82%] rounded-[20px] rounded-br-lg bg-primary px-4 py-3 text-[16px] leading-relaxed text-primary-foreground md:text-[14.5px]">
                      {m.content}
                    </p>
                  </div>
                ) : (
                  <div key={m.id} className="group">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <Sparkles className="size-3.5 text-primary" aria-hidden />
                      Assistant
                    </div>
                    {m.content ? <Markdown source={m.content} /> : null}
                    {streamingBusy && m.id === lastAssistantId(active.messages) && !m.content ? (
                      <StreamingDots />
                    ) : null}
                    {m.pendingAction ? (
                      <PendingActionCard
                        tool={m.pendingAction.tool}
                        args={m.pendingAction.args}
                        onResolve={(approve) =>
                          void resolvePendingAction(active.id, m.id, approve)
                        }
                      />
                    ) : null}
                    {m.action ? (
                      <div className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-[var(--shadow-panel)]">
                        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
                          <Sparkles className="size-4" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-medium text-primary">
                            {m.action.kind === "task" ? "Task created" : "Note created"}
                          </p>
                          <p className="truncate text-[14.5px]">{m.action.title}</p>
                          <p className="text-[12.5px] text-muted-foreground">{m.action.meta}</p>
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label="Copy response"
                        onClick={() => {
                          void navigator.clipboard?.writeText(m.content);
                          toast("Copied to clipboard");
                        }}
                        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                      >
                        <Copy className="size-3.5" aria-hidden /> Copy
                      </button>
                      <button
                        type="button"
                        aria-label="Retry this exchange"
                        onClick={() => toast("Regenerating is not available in this round")}
                        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                      >
                        <RefreshCw className="size-3.5" aria-hidden /> Retry
                      </button>
                    </div>
                  </div>
                ),
              )}
              {streamingBusy && streamingHasText(active.messages) ? <StreamingDots /> : null}
            </div>
          )}
        </div>
      </div>

      {/* composer */}
      <div className="sticky bottom-[calc(60px+env(safe-area-inset-bottom))] border-t border-border bg-background/90 px-4 py-3 backdrop-blur md:bottom-0 md:px-6">
        <div className="mx-auto w-full max-w-[720px]">
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-card px-2.5 py-2 shadow-[var(--shadow-panel)] focus-within:border-border-strong">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Message the assistant"
              aria-label="Message the assistant"
              className="max-h-40 flex-1 resize-none bg-transparent py-2 text-[16px] leading-relaxed outline-none placeholder:text-muted-foreground md:text-[14.5px]"
            />
            {streamingBusy ? (
              <button
                type="button"
                onClick={() => stopStreaming()}
                aria-label="Stop generating"
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-foreground transition-colors hover:bg-surface-2"
              >
                <Square className="size-[15px]" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim()}
                aria-label="Send message"
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-35"
              >
                <ArrowUp className="size-[18px]" aria-hidden />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-center text-[11.5px] text-muted-foreground">
            AI responses are generated · {TODAY}
          </p>
        </div>
      </div>
    </div>
  );
}

/** id of the trailing assistant message (the one currently streaming). */
function lastAssistantId(
  messages: { id: string; role: string; content: string }[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") return messages[i]?.id;
  }
  return undefined;
}

function streamingHasText(
  messages: { id: string; role: string; content: string }[],
): boolean {
  // The indicator shows while the trailing assistant message grows; the dots
  // component itself is suppressed while it has partial content rendered by
  // the caller (handled via lastAssistantId + !m.content). This helper keeps
  // the trailing "thinking" dots after the first tokens arrive.
  return true;
}

function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-primary/60"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

function PendingActionCard({
  tool,
  args,
  onResolve,
}: {
  tool: string;
  args: Record<string, string | number | boolean | null>;
  onResolve: (approve: boolean) => void;
}) {
  const labels: Record<string, string> = {
    create_task: "Create task",
    complete_task: "Complete task",
    create_note: "Create note",
    create_event: "Create calendar event",
  };
  const due = args["dueDate"] ? String(args["dueDate"]) : args["date"] ? String(args["date"]) : "";
  return (
    <div className="mt-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-[var(--shadow-panel)]">
      <p className="text-[12.5px] font-medium text-primary">{labels[tool] ?? tool}</p>
      <p className="mt-0.5 truncate text-[14.5px]">{String(args["title"] ?? "")}</p>
      {due ? (
        <p className="text-[12.5px] text-muted-foreground">
          {tool === "create_event" ? "On " : "Due "}
          {due}
          {args["startTime"] ? ` at ${String(args["startTime"])}` : ""}
        </p>
      ) : null}
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={() => onResolve(true)}
          className="rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => onResolve(false)}
          className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}