/**
 * EmailScreen — Phase 3 Email section.
 *
 * Desktop (md+): two-pane inbox — left list (account filter chips, "Load
 * more", ignore + Add-as-Task per row), right reading pane. Mobile: stacked
 * list, tap opens the detail in a Sheet.
 *
 * Read-only end to end: Gmail is never modified. Ignore = app-side hide
 * (user_settings["emailIgnored"], reversible, NO confirmation). "Add as
 * Task" is user-click only; creates a task with AI summary description +
 * 'Gmail' tag, in-button undo (session-only).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Mail, RotateCw, Undo2, X } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { EmailDetail } from "@/components/email-detail";
import { EmptyState } from "@/components/primitives";
import { useStore } from "@/lib/store";
import { loadAll } from "@/lib/auth-data";
import { cn } from "@/lib/utils";
import type { InboxEmail } from "@/routes/api/inbox-overview.handler";

interface EmailListResponse {
  emails: InboxEmail[];
  accounts: { id: string; email: string }[];
  nextToken: string | null;
}

interface EmailBody {
  id: string;
  from: string;
  subject: string;
  date: string;
  account: string;
  unread: boolean;
  body: string;
  html?: string;
  attachments?: { filename: string; mimeType: string; size: number }[];
}

async function fetchEmailList(
  accountId: string,
  nextToken: string | null,
  fresh: boolean,
): Promise<EmailListResponse> {
  const p = new URLSearchParams({ pageSize: "25" });
  if (accountId) p.set("accountId", accountId);
  if (nextToken) p.set("pageToken", nextToken);
  if (fresh) p.set("fresh", "1");
  const res = await fetch(`/api/email-list?${p.toString()}`);
  if (!res.ok) throw new Error("Could not load the inbox");
  return (await res.json()) as EmailListResponse;
}

function timeAgo(date: string): string {
  const t = Date.parse(date);
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 60) return `${mins || 1}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function senderName(from: string): string {
  const m = /^"?([^"<]+)"?\s*<[^>]+>$/.exec(from.trim());
  return (m?.[1] ?? from).trim();
}

/** In-button undo state for Add-as-Task — session-only, per message id. */
interface TaskAddedState {
  key: string;
  taskId: string;
  undoing: boolean;
}

export function EmailScreen() {
  const { addTask, deleteTask, settings } = useStore();
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [ignoredList, setIgnoredList] = useState<Record<string, boolean>>(() => {
    const s = (settings as unknown as Record<string, unknown>)["emailIgnored"];
    return s && typeof s === "object" ? { ...(s as Record<string, boolean>) } : {};
  });
  const [showIgnored, setShowIgnored] = useState(false);
  const [selected, setSelected] = useState<InboxEmail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [summarizingKey, setSummarizingKey] = useState<string | null>(null);
  const [addedTasks, setAddedTasks] = useState<Record<string, { taskId: string }>>({});

  // Ignore-list mirror ref: async handlers read the latest list safely.
  const ignoredRef = useRef(ignoredList);
  useEffect(() => {
    ignoredRef.current = ignoredList;
  }, [ignoredList]);

  const q = useQuery({
    queryKey: ["email-list", accountFilter],
    queryFn: () => fetchEmailList(accountFilter, null, false),
    staleTime: 2 * 60_000,
  });

  // "Load more" appends the next page per account via the merged cursor.
  const [pages, setPages] = useState<InboxEmail[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (q.data) {
      setPages(q.data.emails);
      setNextToken(q.data.nextToken);
    }
  }, [q.data]);

  // Deep link: /email?msg=<accountId>|<gmailId> opens that email in the detail
  // pane once its page has loaded (used by task→email backlinks).
  const openMsgKey = new URLSearchParams(window.location.search).get("msg") ?? undefined;
  useEffect(() => {
    if (!openMsgKey || pages.length === 0) return;
    const [accId, msgId] = openMsgKey.split("|");
    if (!accId || !msgId) return;
    const found = pages.find((e) => e.accountId === accId && e.id === msgId);
    if (found) {
      setSelected(found);
      setDetailOpen(true);
    }
  }, [openMsgKey, pages]);

  // Global refresh (header button) — re-fetch the inbox list live.
  useEffect(() => {
    const onReload = () => void q.refetch();
    window.addEventListener("kamkazi:reload-data", onReload);
    return () => window.removeEventListener("kamkazi:reload-data", onReload);
  }, [q]);

  const loadMore = useCallback(async () => {
    if (!nextToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await fetchEmailList(accountFilter, nextToken, false);
      setPages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...more.emails.filter((e) => !seen.has(e.id))];
      });
      setNextToken(more.nextToken);
    } catch {
      // keep current page
    } finally {
      setLoadingMore(false);
    }
  }, [nextToken, loadingMore, accountFilter]);

  const refresh = useCallback(() => {
    void q.refetch();
  }, [q]);

  const setIgnore = useCallback(async (email: InboxEmail, ignored: boolean) => {
    const key = `${email.accountId}|${email.id}`;
    // Optimistic flip, no confirmation (reversible by design).
    setIgnoredList((prev) => {
      const next = { ...prev };
      if (ignored) next[key] = true;
      else delete next[key];
      return next;
    });
    if (ignored) {
      setSelected(null);
      setDetailOpen(false);
    }
    try {
      await fetch("/api/email-ignore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, ignored }),
      });
    } catch {
      // revert on failure
      setIgnoredList((prev) => {
        const next = { ...prev };
        if (ignored) delete next[key];
        else next[key] = true;
        return next;
      });
    }
  }, []);

  const visible = useMemo(
    () =>
      pages.filter((e) => {
        const ig = ignoredRef.current[`${e.accountId}|${e.id}`];
        return showIgnored ? true : !ig;
      }),
    [pages, showIgnored, ignoredList],
  );
  const ignoredCount = useMemo(
    () => pages.filter((e) => ignoredRef.current[`${e.accountId}|${e.id}`]).length,
    [pages, ignoredList],
  );

  const addEmailAsTask = useCallback(
    async (email: InboxEmail) => {
      const key = `${email.accountId}|${email.id}`;
      if (addedTasks[key] || summarizingKey === key) return;
      setSummarizingKey(key);
      let description = email.snippet;
      try {
        const res = await fetch("/api/email-summarize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accountId: email.accountId, id: email.id }),
        });
        if (res.ok) {
          const data = (await res.json()) as { summary?: string };
          if (data.summary) description = data.summary;
        }
      } catch {
        // snippet fallback
      }
      setSummarizingKey(null);
      const taskId = addTask(`Email: ${email.subject || "(no subject)"}`, undefined, undefined, {
        notes: description,
        tags: ["Gmail"],
        meta: {
          email: {
            accountId: email.accountId,
            id: email.id,
            subject: email.subject || "(no subject)",
            from: email.from,
            date: email.date,
          },
        },
      });
      setAddedTasks((prev) => ({ ...prev, [key]: { taskId } }));
    },
    [addTask, addedTasks, summarizingKey],
  );

  const undoEmailTask = useCallback(
    (email: InboxEmail) => {
      const key = `${email.accountId}|${email.id}`;
      const added = addedTasks[key];
      if (!added) return;
      deleteTask(added.taskId);
      setAddedTasks((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      // Keep the row data fresh in the store after the delete settles.
      void loadAll()
        .then((data) => {
          const d = data as { tasks?: unknown };
          if (d.tasks) window.dispatchEvent(new CustomEvent("kamkazi:reload-data"));
        })
        .catch(() => undefined);
    },
    [addedTasks, deleteTask],
  );

  const accounts = q.data?.accounts ?? [];

  return (
    <div className="flex min-h-screen">
      <div className="min-w-0 flex-1">
        <PageHeader
          title="Email"
          subtitle="Read-only inbox across your connected Gmail accounts"
        />

        {/* account filter + show ignored */}
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4 md:px-7">
          <button
            type="button"
            onClick={() => {
              setAccountFilter("");
              setPages([]);
              setSelected(null);
            }}
            className={cn(
              "tap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              accountFilter === ""
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            All
          </button>
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setAccountFilter(a.id);
                setPages([]);
                setSelected(null);
              }}
              className={cn(
                "tap max-w-[180px] truncate rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                accountFilter === a.id
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {a.email}
            </button>
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <input
              type="checkbox"
              checked={showIgnored}
              onChange={(e) => setShowIgnored(e.target.checked)}
              className="accent-primary"
            />
            Show ignored{ignoredCount > 0 ? ` (${ignoredCount})` : ""}
          </label>
        </div>

        {/* two-pane on md+ */}
        <div className="flex items-stretch">
          {/* left: list */}
          <div
            className={cn(
              "min-w-0 flex-1 px-4 pb-24 pt-3 md:px-7",
              selected && "hidden md:block",
            )}
          >
            {q.isPending ? (
              <div className="space-y-2 pt-2">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-xl border border-border bg-card/60"
                  />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="pt-10">
                <EmptyState
                  icon={<Inbox className="size-5" aria-hidden />}
                  title={showIgnored ? "Nothing here" : "Inbox zero"}
                  description={
                    showIgnored
                      ? "No emails match this filter."
                      : "No recent emails. Ignored ones are hidden — use “Show ignored” above."
                  }
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                {visible.map((e) => (
                  <EmailRow
                    key={`${e.accountId}|${e.id}`}
                    email={e}
                    ignored={Boolean(ignoredList[`${e.accountId}|${e.id}`])}
                    taskAdded={Boolean(addedTasks[`${e.accountId}|${e.id}`])}
                    summarizing={summarizingKey === `${e.accountId}|${e.id}`}
                    selected={selected?.id === e.id && selected?.accountId === e.accountId}
                    onOpen={() => {
                      setSelected(e);
                      setDetailOpen(true);
                    }}
                    onIgnore={() => void setIgnore(e, true)}
                    onRestore={() => void setIgnore(e, false)}
                    onAddTask={() => void addEmailAsTask(e)}
                    onUndo={() => undoEmailTask(e)}
                  />
                ))}
                {nextToken ? (
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => void loadMore()}
                      disabled={loadingMore}
                      className="tap rounded-full border border-border bg-card px-4 py-2 text-[12.5px] font-semibold text-muted-foreground shadow-[var(--shadow-panel)] transition-colors hover:text-foreground disabled:opacity-50"
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* right: detail pane (desktop) */}
          {selected ? (
            <div className="hidden w-[420px] shrink-0 border-l border-border lg:block">
              <div className="sticky top-0 h-screen">
                <EmailDetail
                  email={selected}
                  accountId={selected.accountId}
                  open
                  onOpenChange={(o) => {
                    if (!o) setSelected(null);
                  }}
                  onAddAsTask={(e) => void addEmailAsTask(e)}
                  taskAdded={Boolean(addedTasks[`${selected.accountId}|${selected.id}`])}
                  taskSummarizing={summarizingKey === `${selected.accountId}|${selected.id}` ? true : undefined}
                  inlineActions={
                    <>
                      {addedTasks[`${selected.accountId}|${selected.id}`] ? (
                        <button
                          type="button"
                          onClick={() => undoEmailTask(selected)}
                          className="tap w-full rounded-full border border-accent-green/40 bg-accent-green/15 px-2.5 py-1.5 text-[12.5px] font-semibold text-accent-green transition-colors hover:bg-accent-green/25"
                        >
                          ✓ Added · <Undo2 className="inline size-3.5" aria-hidden /> Undo
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(null);
                        }}
                        className="tap w-full rounded-full border border-border px-2.5 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground lg:hidden"
                      >
                        <X className="mr-1 inline size-3.5" aria-hidden /> Close
                      </button>
                    </>
                  }
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* mobile detail sheet */}
      <EmailDetail
        email={selected}
        accountId={selected?.accountId ?? null}
        open={detailOpen && !!selected}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) setSelected(null);
        }}
        onAddAsTask={(e) => void addEmailAsTask(e)}
        taskAdded={Boolean(selected && addedTasks[`${selected.accountId}|${selected.id}`])}
        taskSummarizing={
          Boolean(selected) && summarizingKey === `${selected!.accountId}|${selected!.id}`
            ? true
            : undefined
        }
        mobileOnly
      />
    </div>
  );
}

function EmailRow({
  email,
  ignored,
  taskAdded,
  summarizing,
  selected,
  onOpen,
  onIgnore,
  onRestore,
  onAddTask,
  onUndo,
}: {
  email: InboxEmail;
  ignored: boolean;
  taskAdded: boolean;
  summarizing: boolean;
  selected: boolean;
  onOpen: () => void;
  onIgnore: () => void;
  onRestore: () => void;
  onAddTask: () => void;
  onUndo: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group relative flex cursor-default items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card shadow-[var(--shadow-panel)] hover:border-border-strong",
        ignored && "opacity-50",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 truncate text-[13.5px] font-semibold">
            {senderName(email.from) || "(unknown)"}
          </span>
          <span className="ml-auto shrink-0 text-[11.5px] text-muted-foreground" suppressHydrationWarning>
            {timeAgo(email.date)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[13.5px]">{email.subject || "(no subject)"}</p>
        <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">{email.snippet}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {email.account}
          </span>
          {ignored ? (
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Ignored
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
        {ignored ? (
          <button
            type="button"
            aria-label="Restore email"
            onClick={(ev) => {
              ev.stopPropagation();
              onRestore();
            }}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Undo2 className="size-3.5" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Ignore email (hides it in the app)"
            onClick={(ev) => {
              ev.stopPropagation();
              onIgnore();
            }}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
        {taskAdded ? (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onUndo();
            }}
            className="whitespace-nowrap rounded-full border border-accent-green/40 bg-accent-green/15 px-2 py-1 text-[10.5px] font-semibold text-accent-green"
          >
            ✓ Added · Undo
          </button>
        ) : (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onAddTask();
            }}
            className="whitespace-nowrap rounded-full border border-primary/40 bg-primary/10 px-2 py-1 text-[10.5px] font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            {summarizing ? "Summarizing…" : "+ Task"}
          </button>
        )}
      </div>
    </div>
  );
}

// Silence the unused-Mail import if tree-shaken in edits; keep import list tidy.
void Mail;