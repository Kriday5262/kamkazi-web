import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUp,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  ListPlus,
  MessageSquarePlus,
  Mic,
  MoreHorizontal,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  RefreshCw,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { useStore } from "@/lib/store";
import { Markdown } from "@/components/markdown";
import { EmptyState, SectionLabel } from "@/components/primitives";
import { PageHeader } from "@/components/app-shell";
import { relativeStamp } from "@/lib/format";
import { TODAY, dayOffset, userName } from "@/data/seed";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SUGGESTIONS = [
  { icon: CalendarClock, text: "What do I have today?" },
  { icon: ListPlus, text: "What should I prioritise?" },
  { icon: Search, text: "Find my notes about the Japan trip" },
  { icon: StickyNote, text: "Turn my review notes into tasks" },
];

const SLASH = [
  { cmd: "/task", label: "Create a task" },
  { cmd: "/note", label: "Create a note" },
  { cmd: "/find", label: "Search notes" },
  { cmd: "/today", label: "Check schedule" },
];

export function ChatScreen({ chatId }: { chatId?: string | undefined }) {
  const {
    conversations,
    addConversation,
    sendMessage,
    resolvePendingAction,
    deleteConversation,
    renameConversation,
    togglePinConversation,
  } = useStore();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const active = conversations.find((c) => c.id === chatId) ?? null;

  const groups = useMemo(() => {
    const q = query.toLowerCase();
    const list = conversations.filter((c) => !q || c.title.toLowerCase().includes(q));
    return {
      Pinned: list.filter((c) => c.pinned),
      Recent: list.filter((c) => !c.pinned && c.updatedAt >= dayOffset(-1)),
      "Previous 7 days": list.filter(
        (c) => !c.pinned && c.updatedAt < dayOffset(-1) && c.updatedAt >= dayOffset(-7),
      ),
      Older: list.filter((c) => !c.pinned && c.updatedAt < dayOffset(-7)),
    };
  }, [conversations, query]);

  const startChat = (text?: string) => {
    const id = addConversation();
    if (text) sendMessage(id, text);
    void navigate({ to: "/chat/$chatId", params: { chatId: id } });
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    if (active) sendMessage(active.id, text);
    else startChat(text);
  };

  return (
    <div className="flex min-h-screen">
      {/* history */}
      <div
        className={cn(
          "w-full shrink-0 flex-col border-r border-border px-3 py-4 md:flex md:w-[248px]",
          active && "hidden md:flex",
          !historyOpen && "md:hidden",
        )}
      >
        <button
          type="button"
          onClick={() => setHistoryOpen(false)}
          aria-label="Collapse chat list"
          className="mb-2 hidden items-center gap-2 self-start rounded-lg px-2 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground md:flex"
        >
          <PanelLeftClose className="size-4" aria-hidden />
          Hide chats
        </button>
        <button
          type="button"
          onClick={() => startChat()}
          className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-[13.5px] font-medium shadow-[var(--shadow-panel)] transition-colors hover:border-border-strong"
        >
          <MessageSquarePlus className="size-4 text-accent-violet" aria-hidden />
          New chat
        </button>
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
          <Search className="size-3.5 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="w-full bg-transparent text-[16px] outline-none placeholder:text-muted-foreground md:text-[13px]"
          />
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto">
          {Object.entries(groups).map(([label, items]) =>
            items.length ? (
              <div key={label}>
                <SectionLabel>{label}</SectionLabel>
                <div className="flex flex-col gap-0.5">
                  {items.map((c) => (
                    <div key={c.id} className="group relative">
                      <Link
                        to="/chat/$chatId"
                        params={{ chatId: c.id }}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-2.5 py-[7px] text-[13.5px] transition-colors",
                          c.id === chatId
                            ? "bg-accent-violet/12 font-medium text-foreground"
                            : "text-foreground/80 hover:bg-surface-2/70",
                        )}
                      >
                        {c.pinned ? (
                          <Pin className="size-3 shrink-0 text-accent-amber" aria-hidden />
                        ) : null}
                        <span className="truncate">{c.title}</span>
                      </Link>
                      <button
                        type="button"
                        aria-label={`Actions for ${c.title}`}
                        onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                        className="absolute right-1 top-1.5 grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-surface focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="size-4" aria-hidden />
                      </button>
                      {menuFor === c.id ? (
                        <div className="absolute right-1 top-8 z-30 w-36 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-raised">
                          <MenuItem
                            onClick={() => {
                              const name = window.prompt("Rename chat", c.title);
                              if (name) renameConversation(c.id, name);
                              setMenuFor(null);
                            }}
                          >
                            Rename
                          </MenuItem>
                          <MenuItem
                            onClick={() => {
                              togglePinConversation(c.id);
                              setMenuFor(null);
                            }}
                          >
                            {c.pinned ? "Unpin" : "Pin"}
                          </MenuItem>
                          <MenuItem
                            danger
                            onClick={() => {
                              deleteConversation(c.id);
                              setMenuFor(null);
                              if (c.id === chatId) void navigate({ to: "/chat" });
                            }}
                          >
                            <Trash2 className="size-3.5" aria-hidden /> Delete
                          </MenuItem>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null,
          )}
          {Object.values(groups).every((g) => g.length === 0) ? (
            <p className="px-2 pt-6 text-[13px] text-muted-foreground">No chats match “{query}”.</p>
          ) : null}
        </div>
      </div>

      {/* conversation */}
      <div className={cn("flex min-w-0 flex-1 flex-col", !active && "hidden md:flex")}>
        <PageHeader
          title={active ? active.title : "AI Chat"}
          subtitle={active ? relativeStamp(active.updatedAt) : "Ask about your day"}
          actions={
            !historyOpen ? (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                aria-label="Show chat list"
                className="hidden items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground md:flex"
              >
                <PanelLeftOpen className="size-4" aria-hidden />
                Chats
              </button>
            ) : null
          }
        />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[720px] px-4 py-6 md:px-6">
            {!active ? (
              <div className="pt-6">
                <p className="text-[22px] font-semibold tracking-tight">
                  Ask me anything about your day, {userName}.
                </p>
                <p className="mt-1.5 text-[14.5px] text-muted-foreground">
                  I can read your tasks, notes and schedule, and create things for you.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map(({ icon: Icon, text }) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => startChat(text)}
                      className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-3 text-left text-[14px] shadow-[var(--shadow-panel)] transition-colors hover:border-border-strong"
                    >
                      <Icon className="size-[17px] shrink-0 text-accent-violet" aria-hidden />
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            ) : active.messages.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="size-5" aria-hidden />}
                title="New chat"
                description="Type below, or use a slash command like /task to create something."
              />
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
                            <Check className="size-4" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-medium text-primary">
                              {m.action.kind === "task" ? "Task created" : "Note created"}
                            </p>
                            <p className="truncate text-[14.5px]">{m.action.title}</p>
                            <p className="text-[12.5px] text-muted-foreground">{m.action.meta}</p>
                          </div>
                          <Link
                            to="/tasks"
                            className="ml-auto shrink-0 self-center rounded-md px-2 py-1 text-[12.5px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                          >
                            View
                          </Link>
                        </div>
                      ) : null}
                      <div className="mt-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <SmallBtn
                          label="Copy response"
                          onClick={() => {
                            void navigator.clipboard?.writeText(m.content);
                            toast("Copied to clipboard");
                          }}
                        >
                          <Copy className="size-3.5" aria-hidden /> Copy
                        </SmallBtn>
                        <SmallBtn
                          label="Regenerate response"
                          onClick={() => toast("Regenerating…")}
                        >
                          <RefreshCw className="size-3.5" aria-hidden /> Retry
                        </SmallBtn>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </div>

        {/* composer */}
        <div className="sticky bottom-[calc(60px+env(safe-area-inset-bottom))] border-t border-border md:bottom-0 bg-background/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="mx-auto w-full max-w-[720px]">
            {draft.startsWith("/") ? (
              <div className="mb-2 overflow-hidden rounded-lg border border-border bg-popover">
                {SLASH.filter((s) => s.cmd.startsWith(draft.split(" ")[0] ?? "")).map((s) => (
                  <button
                    key={s.cmd}
                    type="button"
                    onClick={() => {
                      setDraft(`${s.cmd} `);
                      inputRef.current?.focus();
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13.5px] transition-colors hover:bg-surface-2"
                  >
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">
                      {s.cmd}
                    </code>
                    <span className="text-muted-foreground">{s.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-card px-2.5 py-2 shadow-[var(--shadow-panel)] focus-within:border-border-strong">
              <button
                type="button"
                aria-label="Attach a file"
                onClick={() => toast("Attachments come with the full version")}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <Paperclip className="size-[18px]" aria-hidden />
              </button>
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
              <button
                type="button"
                aria-label="Voice input"
                onClick={() => toast("Voice input comes with the full version")}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <Mic className="size-[18px]" aria-hidden />
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim()}
                aria-label="Send message"
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-35"
              >
                <ArrowUp className="size-[18px]" aria-hidden />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[11.5px] text-muted-foreground">
              AI responses are generated · {TODAY}
            </p>
          </div>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={confirmDeleteId !== null}
        title="Delete this chat?"
        description="This permanently deletes the conversation and its messages. This can’t be undone."
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId) {
            deleteConversation(confirmDeleteId);
            if (confirmDeleteId === chatId) void navigate({ to: "/chat" });
          }
          setConfirmDeleteId(null);
        }}
      />
    </div>
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

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2",
        danger && "text-destructive hover:bg-destructive/10",
      )}
    >
      {children}
    </button>
  );
}

function SmallBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      {children}
    </button>
  );
}

export const ChatIcon = CheckCircle2;
