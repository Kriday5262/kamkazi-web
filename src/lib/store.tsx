/**
 * Store: same public API as the in-memory prototype, but persisted through
 * server functions into Postgres (Drizzle). All mutations are optimistic —
 * the local state updates instantly and is rolled back if the server write
 * fails.
 *
 * Initial data is loaded once by the root route (server-side via loadAll) and
 * passed in through StoreProvider so SSR and hydration agree.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  TODAY,
  events as fallbackEvents,
  notebooks as fallbackNotebooks,
  seedConversations,
  seedNotes,
  seedTasks,
  taskLists as fallbackLists,
  type Conversation,
  type Note,
  type Task,
  type TaskList,
} from "@/data/seed";
import { nextRepeatDate } from "@/lib/format";
import {
  addListFn,
  addNotebookFn,
  deleteConversationFn,
  deleteListFn,
  deleteNotebookFn,
  deleteNoteFn,
  deleteTaskFn,
  saveConversation,
  saveNote,
  saveSettingsFn,
  saveTask,
  updateListFn,
  updateNotebookFn,
} from "@/lib/auth-data";
import { confirmTool, streamChat } from "@/lib/ai-client";
import { toast } from "sonner";
import { loadAll } from "@/lib/auth-data";

type Theme = "light" | "dark" | "system";

export interface Settings {
  defaultListId: string;
  defaultNotebookId: string;
  startPage: string;
  units: "C" | "F";
  /** Locked for Stage 1: Dehradun, India (30.3165N, 78.0322E) — see STAGE1_NOTES.md. */
  weatherLocation: string;
  weatherLat: number;
  weatherLon: number;
  /** AI provider for Stage 3: "hermes" (local) | "openai" | "ollama". */
  aiProvider: "hermes" | "openai" | "ollama";
  /** Stage 3: optional model override and OpenAI key (server-side only). */
  aiModel?: string | undefined;
  aiApiKey?: string | undefined;
  dailyBriefing: boolean;
  taskReminders: boolean;
  eventAlerts: boolean;
  markdownShortcuts: boolean;
  aiPersonalisation: boolean;
  /** Daily briefing includes a short unread-inbox digest (needs Enable email). */
  emailDigest: boolean;
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn?: 0 | 1 | undefined;
  /** Note editor max width on desktop. */
  editorWidth?: "narrow" | "comfortable" | "wide" | "full" | undefined;
  /** Profile display name override. */
  displayName?: string | undefined;
}

/** Shape returned by the root route's server-side load. */
export interface InitialStoreData {
  lists: TaskList[];
  tasks: Task[];
  notes: Note[];
  notebooks: { id: string; name: string; icon: string }[];
  conversations: Conversation[];
  datedEvents: Record<string, typeof fallbackEvents>;
  settings?: Partial<Settings>;
}

interface Store {
  tasks: Task[];
  lists: TaskList[];
  notes: Note[];
  conversations: Conversation[];
  events: Record<string, typeof fallbackEvents>;
  notebooks: { id: string; name: string; icon: string }[];
  theme: Theme;
  settings: Settings;
  paletteOpen: boolean;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setPaletteOpen: (v: boolean) => void;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;

  updateSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  toggleTask: (id: string) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  addTask: (title: string, listId?: string, dueDate?: string, extra?: Partial<Task>) => string;
  deleteTask: (id: string) => void;
  addTaskAttachment: (taskId: string, file: File) => void;
  removeTaskAttachment: (taskId: string, attachmentId: string) => void;
  addList: (name: string) => void;
  updateList: (id: string, name: string, icon: string) => void;
  deleteList: (id: string) => void;
  addNotebook: (name: string, icon: string) => void;
  updateNotebook: (id: string, name: string, icon: string) => void;
  deleteNotebook: (id: string) => void;
  updateNote: (id: string, patch: Partial<Note>) => void;
  addNote: (notebookId?: string) => string;
  deleteNote: (id: string) => void;
  addConversation: () => string;
  sendMessage: (conversationId: string, text: string) => void;
  resolvePendingAction: (
    conversationId: string,
    messageId: string,
    approve: boolean,
  ) => Promise<void>;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  togglePinConversation: (id: string) => void;
}

// Keep a single context instance across hot reloads so the provider and
// consumers never end up on two different contexts during Fast Refresh.
const globalScope = globalThis as typeof globalThis & {
  __daylightStoreContext?: React.Context<Store | null>;
};
const StoreContext = globalScope.__daylightStoreContext ?? createContext<Store | null>(null);
globalScope.__daylightStoreContext = StoreContext;

const uid = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_SETTINGS: Settings = {
  defaultListId: "inbox",
  defaultNotebookId: "personal",
  startPage: "Today",
  units: "C",
  weatherLocation: "Dehradun",
  weatherLat: 30.3165,
  weatherLon: 78.0322,
  aiProvider: "hermes",
  editorWidth: "comfortable",
  weekStartsOn: 1,
  dailyBriefing: true,
  taskReminders: true,
  eventAlerts: true,
  markdownShortcuts: true,
  aiPersonalisation: true,
  emailDigest: true,
};

export function StoreProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: InitialStoreData | null;
}) {
  const [tasks, setTasks] = useState<Task[]>(initial?.tasks ?? seedTasks);
  const [lists, setLists] = useState<TaskList[]>(initial?.lists ?? fallbackLists);
  const [notes, setNotes] = useState<Note[]>(initial?.notes ?? seedNotes);
  const [conversations, setConversations] = useState<Conversation[]>(
    initial?.conversations ?? seedConversations,
  );
  const [theme, setTheme] = useState<Theme>("light");
  const themeLoaded = useRef(false);
  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    ...DEFAULT_SETTINGS,
    ...(initial?.settings ?? {}),
  });
  // "datedEvents" from the DB, keyed by UTC date. Falls back to the static
  // seed shape when nothing is loaded (e.g. a fresh component tree).
  const [events, setEvents] = useState<Record<string, typeof fallbackEvents>>(
    initial?.datedEvents ?? {},
  );
  const [notebooks, setNotebooks] = useState(initial?.notebooks ?? fallbackNotebooks);

  useEffect(() => {
    // Load persisted preference after hydration to avoid SSR/client mismatch
    if (typeof window !== "undefined" && themeLoaded.current === false) {
      themeLoaded.current = true;
      const saved = window.localStorage.getItem("kamkazi-theme");
      if (saved === "dark" || saved === "light" || saved === "system") setTheme(saved);
    }
    if (typeof window !== "undefined") window.localStorage.setItem("kamkazi-theme", theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    if (theme !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------------------------------------------------------------------------
  // Optimistic persistence helpers
  // ---------------------------------------------------------------------------

  const toggleTask = useCallback((id: string) => {
    let snapshot: Task | undefined;
    setTasks((prev) => {
      snapshot = prev.find((t) => t.id === id);
      return prev.map((t) => (t.id === id ? { ...t, done: !t.done, updatedAt: TODAY } : t));
    });
    queueMicrotask(() => {
      if (!snapshot) return;
      const nowDone = !snapshot.done;
      // Repeating task completed -> roll the SAME task forward (single save, no race).
      if (nowDone && snapshot.repeat && ["daily", "weekly", "monthly", "yearly"].includes(snapshot.repeat)) {
        let nextDue = snapshot.dueDate ?? TODAY;
        let guard = 0;
        do {
          nextDue = nextRepeatDate(nextDue, snapshot.repeat);
          guard += 1;
        } while (nextDue <= TODAY && guard < 366);
        const rolled: Task = { ...snapshot, done: false, dueDate: nextDue, updatedAt: TODAY };
        setTasks((prev) => prev.map((t) => (t.id === id ? rolled : t)));
        saveTask({ data: { task: rolled } }).catch(() => {
          if (snapshot) setTasks((prev) => prev.map((t) => (t.id === id ? snapshot! : t)));
        });
        return;
      }
      const updated = { ...snapshot, done: nowDone, updatedAt: TODAY };
      saveTask({ data: { task: updated } }).catch(() => {
        if (snapshot) setTasks((prev) => prev.map((t) => (t.id === id ? snapshot! : t)));
      });
    });
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    let snapshot: Task | undefined;
    setTasks((prev) => {
      snapshot = prev.find((t) => t.id === id);
      return prev.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: TODAY } : t));
    });
    queueMicrotask(() => {
      if (!snapshot) return;
      const updated = { ...snapshot, ...patch, updatedAt: TODAY };
      saveTask({ data: { task: updated } }).catch(() => {
        if (snapshot) setTasks((prev) => prev.map((t) => (t.id === id ? snapshot! : t)));
      });
    });
  }, []);

  const addTask = useCallback(
    (title: string, _listId = "inbox", dueDate?: string, extra?: Partial<Task>) => {
      const id = uid();
      const task: Task = {
        id,
        title,
        listId: "inbox",
        done: false,
        dueDate,
        priority: "none",
        tags: [],
        subtasks: [],
        attachments: [],
        createdAt: TODAY,
        updatedAt: TODAY,
        ...extra,
      };
      setTasks((prev) => [task, ...prev]);
      saveTask({ data: { task } }).catch(() => {
        setTasks((prev) => prev.filter((t) => t.id !== id));
      });
      return id;
    },
    [],
  );

  const deleteTask = useCallback((id: string) => {
    let snapshot: Task | undefined;
    setTasks((prev) => {
      snapshot = prev.find((t) => t.id === id);
      return prev.filter((t) => t.id !== id);
    });
    deleteTaskFn({ data: { id } }).catch(() => {
      if (snapshot) setTasks((prev) => [snapshot as Task, ...prev]);
    });
  }, []);

  /** Upload a real file for a task and merge the metadata into tasks.attachments. */
  const addTaskAttachment = useCallback(
    (taskId: string, file: File) => {
      const form = new FormData();
      form.set("file", file);
      form.set("taskId", taskId);
      void (async () => {
        try {
          const res = await fetch("/api/attachments", { method: "POST", body: form });
          if (!res.ok) throw new Error(`Upload failed (${res.status})`);
          const { attachment } = (await res.json()) as {
            attachment: Task["attachments"][number];
          };
          // Merge into the task's attachments via updateTask (single write path).
          let snapshot: Task | undefined;
          setTasks((prev) => {
            snapshot = prev.find((t) => t.id === taskId);
            return prev;
          });
          if (snapshot) updateTask(taskId, { attachments: [...snapshot.attachments, attachment] });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Upload failed");
        }
      })();
    },
    [updateTask],
  );

  /** Remove an attachment (server file + metadata). */
  const removeTaskAttachment = useCallback(
    (taskId: string, attachmentId: string) => {
      let snapshot: Task | undefined;
      let removed: Task["attachments"][number] | undefined;
      setTasks((prev) => {
        const t = prev.find((x) => x.id === taskId);
        if (!t) return prev;
        snapshot = t;
        removed = t.attachments.find((a) => a.id === attachmentId);
        return prev;
      });
      if (!snapshot) return;
      updateTask(taskId, {
        attachments: snapshot.attachments.filter((a) => a.id !== attachmentId),
      });
      if (removed?.path) {
        void fetch("/api/attachments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "delete", path: removed.path }),
        }).catch(() => undefined);
      }
    },
    [updateTask],
  );

  const addList = useCallback((name: string) => {
    const list: TaskList = { id: uid(), name, icon: "list", color: "oklch(0.6 0.1 300)" };
    setLists((prev) => [...prev, list]);
    addListFn({ data: { list } }).catch(() => {
      setLists((prev) => prev.filter((l) => l.id !== list.id));
    });
  }, []);

  const updateList = useCallback((id: string, name: string, icon: string) => {
    let snapshot: TaskList | undefined;
    setLists((prev) => {
      snapshot = prev.find((l) => l.id === id);
      return prev.map((l) => (l.id === id ? { ...l, name, icon } : l));
    });
    updateListFn({ data: { id, name, icon } }).catch(() => {
      if (snapshot) setLists((prev) => prev.map((l) => (l.id === id ? snapshot! : l)));
    });
  }, []);

  const deleteList = useCallback((id: string) => {
    let snapshot: TaskList | undefined;
    let removedTasks: Task[] = [];
    setTasks((prev) => {
      removedTasks = prev.filter((t) => t.listId === id);
      return prev.filter((t) => t.listId !== id);
    });
    setLists((prev) => {
      snapshot = prev.find((l) => l.id === id);
      return prev.filter((l) => l.id !== id);
    });
    deleteListFn({ data: { id } }).catch(() => {
      if (snapshot) setLists((prev) => [...prev, snapshot!]);
      setTasks((prev) => [...removedTasks, ...prev]);
    });
  }, []);

  const addNotebook = useCallback((name: string, icon: string) => {
    const nb = { id: uid(), name, icon };
    setNotebooks((prev) => [...prev, nb]);
    addNotebookFn({ data: nb }).catch(() => {
      setNotebooks((prev) => prev.filter((n) => n.id !== nb.id));
    });
  }, []);

  const updateNotebook = useCallback((id: string, name: string, icon: string) => {
    let snapshot: { id: string; name: string; icon: string } | undefined;
    setNotebooks((prev) => {
      snapshot = prev.find((n) => n.id === id);
      return prev.map((n) => (n.id === id ? { ...n, name, icon } : n));
    });
    updateNotebookFn({ data: { id, name, icon } }).catch(() => {
      if (snapshot) setNotebooks((prev) => prev.map((n) => (n.id === id ? snapshot! : n)));
    });
  }, []);

  const deleteNotebook = useCallback((id: string) => {
    let snapshot: { id: string; name: string; icon: string } | undefined;
    let removedNotes: Note[] = [];
    setNotes((prev) => {
      removedNotes = prev.filter((n) => n.notebookId === id);
      return prev.filter((n) => n.notebookId !== id);
    });
    setNotebooks((prev) => {
      snapshot = prev.find((n) => n.id === id);
      return prev.filter((n) => n.id !== id);
    });
    deleteNotebookFn({ data: { id } }).catch(() => {
      if (snapshot) setNotebooks((prev) => [...prev, snapshot!]);
      setNotes((prev) => [...removedNotes, ...prev]);
    });
  }, []);

  const updateNote = useCallback((id: string, patch: Partial<Note>) => {
    let snapshot: Note | undefined;
    setNotes((prev) => {
      snapshot = prev.find((n) => n.id === id);
      return prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: TODAY } : n));
    });
    queueMicrotask(() => {
      if (!snapshot) return;
      const updated = { ...snapshot, ...patch, updatedAt: TODAY };
      saveNote({ data: { note: updated } }).catch(() => {
        if (snapshot) setNotes((prev) => prev.map((n) => (n.id === id ? snapshot! : n)));
      });
    });
  }, []);

  const addNote = useCallback((notebookId = "personal") => {
    const id = uid();
    const note: Note = {
      id,
      title: "",
      body: "",
      notebookId,
      tags: [],
      pinned: false,
      updatedAt: TODAY,
    };
    setNotes((prev) => [note, ...prev]);
    saveNote({ data: { note } }).catch(() => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
    });
    return id;
  }, []);

  const deleteNote = useCallback((id: string) => {
    let snapshot: Note | undefined;
    setNotes((prev) => {
      snapshot = prev.find((n) => n.id === id);
      return prev.filter((n) => n.id !== id);
    });
    deleteNoteFn({ data: { id } }).catch(() => {
      if (snapshot) setNotes((prev) => [snapshot as Note, ...prev]);
    });
  }, []);

  const addConversation = useCallback(() => {
    const id = uid();
    const conv: Conversation = { id, title: "New chat", updatedAt: TODAY, messages: [] };
    setConversations((prev) => [conv, ...prev]);
    saveConversation({ data: { conversation: conv } }).catch(() => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
    });
    return id;
  }, []);

  const sendMessage = useCallback((conversationId: string, text: string) => {
    // Stage 3: real AI streaming via /api/chat. The user message is added
    // optimistically; the assistant reply is appended as tokens stream in.
    // Persistence happens server-side inside the stream handler, so on
    // success we do NOT re-save the whole conversation (that would fight
    // the server write); on failure we roll back to the prior snapshot.
    const userId = uid();
    const assistantId = uid();
    let snapshot: Conversation | undefined;

    const applyUser = (c: Conversation): Conversation => ({
      ...c,
      title: c.messages.length === 0 ? text.slice(0, 42) : c.title,
      updatedAt: TODAY,
      messages: [...c.messages, { id: userId, role: "user", content: text }],
    });
    const applyAssistant = (c: Conversation, content: string): Conversation => ({
      ...c,
      messages: c.messages.map((m) => (m.id === assistantId ? { ...m, content } : m)),
    });

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== conversationId) return c;
        snapshot = c;
        const withUser = applyUser(c);
        return {
          ...withUser,
          messages: [
            ...withUser.messages,
            { id: assistantId, role: "assistant" as const, content: "" },
          ],
        };
      }),
    );

    void (async () => {
      let streamed = "";
      try {
        await streamChat(text, conversationId, {
          onDelta: (d) => {
            streamed += d;
            setConversations((prev) =>
              prev.map((c) => (c.id === conversationId ? applyAssistant(c, streamed) : c)),
            );
          },
          onTool: (tool, args, needsConfirm) => {
            if (!needsConfirm) return;
            // Write tool detected — attach a pending confirmation card to the
            // assistant message so the user can Confirm/Cancel.
            setConversations((prev) =>
              prev.map((c) =>
                c.id === conversationId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantId
                          ? {
                              ...m,
                              pendingAction: {
                                tool,
                                args: args as Record<string, string | number | boolean | null>,
                              },
                            }
                          : m,
                      ),
                    }
                  : c,
              ),
            );
          },
          onError: (message) => {
            toast.error(message);
            if (!streamed) {
              // Remove the empty assistant bubble and roll back.
              setConversations((prev) =>
                prev.map((c) => (c.id === conversationId && snapshot ? { ...snapshot } : c)),
              );
            }
          },
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "AI request failed");
      }
    })();
  }, []);

  const resolvePendingAction = useCallback(
    async (conversationId: string, messageId: string, approve: boolean) => {
      let result: { ok: boolean; summary: string } | undefined;
      // Read from the ref-mirrored state (state updaters must stay pure —
      // reading via updater side effects broke under React 19).
      const conv = conversationsRef.current.find((c) => c.id === conversationId);
      const msg = conv?.messages.find((m) => m.id === messageId);
      if (!msg?.pendingAction) return;
      const tool = msg.pendingAction.tool;
      const args = msg.pendingAction.args;
      if (approve) {
        result = await confirmTool(
          tool,
          (args ?? {}) as Record<string, string | number | boolean | null>,
        );
      }
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== conversationId) return c;
          return {
            ...c,
            messages: c.messages.map((m) => {
              if (m.id !== messageId) return m;
              return {
                ...m,
                pendingAction: undefined,
                action: approve
                  ? {
                      kind: (tool === "create_note" ? "note" : "task") as "note" | "task",
                      title: String(
                        (args?.["title"] as string | undefined) ??
                          (tool === "complete_task" ? "Task completed" : "Task"),
                      ),
                      meta: result?.summary ?? (approve ? "Done" : "Cancelled"),
                    }
                  : undefined,
              };
            }),
          };
        }),
      );
      // Refresh tasks/notes from the server after a confirmed write.
      if (approve) {
        try {
          const data = (await loadAll()) as {
            tasks: Task[];
            notes: Note[];
          };
          setTasks(data.tasks);
          setNotes(data.notes);
        } catch {
          // best-effort refresh
        }
      }
    },
    [],
  );

  const renameConversation = useCallback((id: string, title: string) => {
    let snapshot: Conversation | undefined;
    setConversations((prev) => {
      snapshot = prev.find((c) => c.id === id);
      return prev.map((c) => (c.id === id ? { ...c, title } : c));
    });
    queueMicrotask(() => {
      if (!snapshot) return;
      saveConversation({ data: { conversation: { ...snapshot, title } } }).catch(() => {
        if (snapshot) setConversations((prev) => prev.map((c) => (c.id === id ? snapshot! : c)));
      });
    });
  }, []);

  const deleteConversation = useCallback((id: string) => {
    let snapshot: Conversation | undefined;
    setConversations((prev) => {
      snapshot = prev.find((c) => c.id === id);
      return prev.filter((c) => c.id !== id);
    });
    deleteConversationFn({ data: { id } }).catch(() => {
      if (snapshot) setConversations((prev) => [snapshot as Conversation, ...prev]);
    });
  }, []);

  const togglePinConversation = useCallback((id: string) => {
    let snapshot: Conversation | undefined;
    setConversations((prev) => {
      snapshot = prev.find((c) => c.id === id);
      return prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c));
    });
    queueMicrotask(() => {
      if (!snapshot) return;
      saveConversation({
        data: { conversation: { ...snapshot, pinned: !snapshot.pinned } },
      }).catch(() => {
        if (snapshot) setConversations((prev) => prev.map((c) => (c.id === id ? snapshot! : c)));
      });
    });
  }, []);

  const settingsPersist = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateSetting = useCallback(<K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSettings((s) => {
      const next = { ...s, [k]: v };
      // Debounced persistence.
      if (settingsPersist.current) clearTimeout(settingsPersist.current);
      settingsPersist.current = setTimeout(() => {
        saveSettingsFn({ data: { settings: next as unknown as Record<string, unknown> } }).catch(
          () => {
            setSettings(s);
          },
        );
      }, 400);
      return next;
    });
  }, []);

  const value = useMemo<Store>(
    () => ({
      tasks,
      lists,
      notes,
      conversations,
      events,
      notebooks,
      theme,
      settings,
      paletteOpen,
      sidebarCollapsed,
      toggleSidebar: () => setSidebarCollapsed((v) => !v),
      setPaletteOpen,
      toggleTheme: () =>
        setTheme((t) => (t === "light" ? "dark" : t === "dark" ? "system" : "light")),
      setTheme,
      updateSetting,
      toggleTask,
      updateTask,
      addTask,
      deleteTask,
      addTaskAttachment,
      removeTaskAttachment,
      addList,
      updateList,
      deleteList,
      addNotebook,
      updateNotebook,
      deleteNotebook,
      updateNote,
      addNote,
      deleteNote,
      addConversation,
      sendMessage,
      resolvePendingAction,
      renameConversation,
      deleteConversation,
      togglePinConversation,
    }),
    [
      tasks,
      lists,
      notes,
      conversations,
      events,
      notebooks,
      theme,
      settings,
      paletteOpen,
      sidebarCollapsed,
      updateSetting,
      toggleTask,
      updateTask,
      addTask,
      deleteTask,
      addList,
      updateList,
      deleteList,
      addNotebook,
      updateNotebook,
      deleteNotebook,
      updateNote,
      addNote,
      deleteNote,
      addConversation,
      sendMessage,
      resolvePendingAction,
      renameConversation,
      deleteConversation,
      togglePinConversation,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

/** Hook used by the root route to refresh data from the server on mount. */
export function useRefreshStore() {
  const refresh = useCallback(async () => {
    const data = await loadAll();
    return data;
  }, []);
  return refresh;
}

/** Scripted assistant responses for the prototype. */
function draftReply(text: string): {
  content: string;
  action?: Conversation["messages"][number]["action"];
} {
  const t = text.toLowerCase();
  if (t.startsWith("/task") || t.includes("create a task") || t.includes("add a task")) {
    const title = text.replace(/^\/task\s*/i, "").replace(/create a task to\s*/i, "") || "New task";
    return {
      content: "Added it to your Inbox.",
      action: { kind: "task", title: title.slice(0, 60), meta: "Today · Inbox" },
    };
  }
  if (t.includes("note")) {
    return {
      content:
        "I found **2 notes** that look relevant: *Acme homepage — review notes* and *Q4 roadmap thinking*. Want me to pull the open items out of either one?",
    };
  }
  if (t.includes("prioriti") || t.includes("today") || t.includes("schedule")) {
    return {
      content: `Here's how today looks:

1. **Finish homepage wireframes** — due 11:00, right before the design review
2. **Send proposal to client** — due 3:00 PM, the only external deadline
3. **Review Priya's onboarding copy** — no fixed time, good filler task

Your afternoon after 2:00 PM is open apart from weekly planning at 5:30.`,
    };
  }
  if (t.includes("free time")) {
    return {
      content: "You're clear from **2:00 PM to 5:30 PM** — the longest open stretch today.",
    };
  }
  return {
    content: `Here's what I can see from your workspace:

- **6 tasks** due in the next three days
- **3 meetings** left today, ending at 6:00 PM
- Your most recently edited note is *Japan trip — spring plan*

Ask me to plan your day, prioritise tasks, search notes, or create something.`,
  };
}
