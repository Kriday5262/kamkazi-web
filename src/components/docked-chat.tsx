/**
 * DockedChat — AI Chat pinned as a right sidebar panel (desktop).
 *
 * Same thread/store as the /chat screen (one conversation, shared state), in a
 * compact always-visible column. When docked, screens hide their own right
 * detail panes (task/event/email details open as popup sheets instead — that
 * part is wired in each screen via `chatDocked` from the store).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Copy, Square, Sparkles, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function DockedChat({ onClose }: { onClose: () => void }) {
  const {
    conversations,
    sendMessage,
    resolvePendingAction,
    stopStreaming,
    addConversation,
    streamingBusy,
  } = useStore();

  // Same thread resolution as ChatScreen: newest conversation WITH messages.
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

  const lastLen = useMemo(
    () => active?.messages.reduce((n, m) => n + m.content.length, 0) ?? 0,
    [active],
  );
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastLen, active?.id]);

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
    <aside
      aria-label="AI Chat panel"
      className="sticky top-0 hidden h-screen w-[360px] shrink-0 flex-col border-l border-sidebar-border bg-sidebar xl:flex"
    >
      {/* header */}
      <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-3">
        <span className="grid size-7 place-items-center rounded-full bg-primary/12 text-primary">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold leading-tight">AI Chat</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {streamingBusy ? "Thinking…" : "Always here — ask anything"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat panel"
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4">
        {!active || active.messages.length === 0 ? (
          <div className="pt-2">
            <p className="text-[15px] font-semibold leading-snug">Ask me anything about your day.</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              I can read your tasks, notes, schedule and email — and create things for you.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {active.messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[88%] rounded-[18px] rounded-br-md bg-primary px-3.5 py-2.5 text-[13.5px] leading-relaxed text-primary-foreground">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={m.id} className="group">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Sparkles className="size-3 text-primary" aria-hidden />
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
                      onResolve={(approve) => void resolvePendingAction(active.id, m.id, approve)}
                    />
                  ) : null}
                  <button
                    type="button"
                    aria-label="Copy response"
                    onClick={() => {
                      void navigator.clipboard?.writeText(m.content);
                      toast("Copied to clipboard");
                    }}
                    className="mt-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity focus-within:opacity-100 hover:bg-surface-2 hover:text-foreground group-hover:opacity-100"
                  >
                    <Copy className="size-3" aria-hidden /> Copy
                  </button>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-end gap-1.5 rounded-xl border border-border bg-card px-2 py-1.5 shadow-[var(--shadow-panel)] focus-within:border-border-strong">
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
            placeholder="Ask the assistant…"
            aria-label="Message the assistant"
            className="max-h-28 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          {streamingBusy ? (
            <button
              type="button"
              onClick={() => stopStreaming()}
              aria-label="Stop generating"
              className="grid size-7 shrink-0 place-items-center rounded-lg border border-border text-foreground transition-colors hover:bg-surface-2"
            >
              <Square className="size-3.5" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim()}
              aria-label="Send message"
              className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-35"
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function lastAssistantId(
  messages: { id: string; role: string; content: string }[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") return messages[i]?.id;
  }
  return undefined;
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
    <div className="mt-2 rounded-xl border border-border bg-card px-3 py-2.5 shadow-[var(--shadow-panel)]">
      <p className="text-[12px] font-medium text-primary">{labels[tool] ?? tool}</p>
      <p className="mt-0.5 truncate text-[13.5px]">{String(args["title"] ?? "")}</p>
      {due ? (
        <p className="text-[12px] text-muted-foreground">
          {tool === "create_event" ? "On " : "Due "}
          {due}
          {args["startTime"] ? ` at ${String(args["startTime"])}` : ""}
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onResolve(true)}
          className="rounded-lg bg-primary px-3 py-1 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => onResolve(false)}
          className="rounded-lg border border-border px-3 py-1 text-[12.5px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}