import { useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckCircle2,
  ListTodo,
  MessageSquarePlus,
  Search,
  Settings2,
  Sparkles,
  StickyNote,
  Tag,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { events } from "@/data/seed";
import { allTags } from "@/components/tasks-screen";
import { formatTime, relativeDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { plainPreview } from "@/components/markdown";

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: typeof Search;
  run: () => void;
}

export function CommandPalette() {
  const {
    paletteOpen,
    setPaletteOpen,
    tasks,
    notes,
    conversations,
    addTask,
    addNote,
    addConversation,
  } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [paletteOpen]);

  const close = () => setPaletteOpen(false);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const commands: Item[] = [
      {
        id: "cmd-task",
        label: q ? `Create task “${query.trim()}”` : "Create task",
        group: "Commands",
        icon: CheckCircle2,
        run: () => {
          if (q) addTask(query.trim());
          void navigate({ to: "/tasks" });
          close();
        },
      },
      {
        id: "cmd-note",
        label: "Create note",
        group: "Commands",
        icon: StickyNote,
        run: () => {
          const id = addNote();
          void navigate({ to: "/notes/$noteId", params: { noteId: id } });
          close();
        },
      },
      {
        id: "cmd-chat",
        label: "Start a chat",
        group: "Commands",
        icon: MessageSquarePlus,
        run: () => {
          void navigate({ to: "/chat/$chatId", params: { chatId: "single" } });
          close();
        },
      },
      {
        id: "cmd-today",
        label: "Open Today",
        group: "Commands",
        icon: CalendarDays,
        run: () => {
          void navigate({ to: "/" });
          close();
        },
      },
      {
        id: "cmd-tasks",
        label: "Open Tasks",
        group: "Commands",
        icon: ListTodo,
        run: () => {
          void navigate({ to: "/tasks" });
          close();
        },
      },
      {
        id: "cmd-settings",
        label: "Go to Settings",
        group: "Commands",
        icon: Settings2,
        run: () => {
          void navigate({ to: "/settings" });
          close();
        },
      },
    ];

    const match = (s: string) => !q || s.toLowerCase().includes(q);

    // Tags matching the query — grouped above matching tasks so a search like
    // "NStarX" surfaces the tag filter first.
    const tagSuggestions = allTags(tasks).filter((t) => q && t.toLowerCase().includes(q));
    const tagItems = (tags: string[]): Item[] =>
      tags.slice(0, 4).map((tag) => ({
        id: `tag-${tag}`,
        label: `#${tag}`,
        hint: `${tasks.filter((t) => t.tags.includes(tag)).length} tasks`,
        group: "Tags",
        icon: Tag,
        run: () => {
          void navigate({
            to: "/tasks/$listId",
            params: { listId: encodeURIComponent(tag) },
          });
          close();
        },
      }));

    const taskItems: Item[] = tasks
      .filter((t) => match(t.title))
      .slice(0, 5)
      .map((t) => ({
        id: `task-${t.id}`,
        label: t.title,
        hint: t.dueDate ? relativeDate(t.dueDate) : "Task",
        group: "Tasks",
        icon: CheckCircle2,
        run: () => {
          void navigate({ to: "/tasks" });
          close();
        },
      }));

    const noteItems: Item[] = notes
      .filter((n) => match(n.title) || match(n.body))
      .slice(0, 5)
      .map((n) => ({
        id: `note-${n.id}`,
        label: n.title || "Untitled note",
        hint: plainPreview(n.body, 44),
        group: "Notes",
        icon: StickyNote,
        run: () => {
          void navigate({ to: "/notes/$noteId", params: { noteId: n.id } });
          close();
        },
      }));

    const eventItems: Item[] = events
      .filter((e) => match(e.title))
      .slice(0, 4)
      .map((e) => ({
        id: `event-${e.id}`,
        label: e.title,
        hint: e.allDay ? "All day" : formatTime(e.start),
        group: "Events",
        icon: CalendarDays,
        run: () => {
          void navigate({ to: "/" });
          close();
        },
      }));

    const chatItems: Item[] = conversations
      .filter((c) => match(c.title) && c.messages.length > 0)
      .slice(0, 4)
      .map((c) => ({
        id: `chat-${c.id}`,
        label: c.title,
        hint: "Conversation",
        group: "Chats",
        icon: Sparkles,
        run: () => {
          void navigate({ to: "/chat/$chatId", params: { chatId: c.id } });
          close();
        },
      }));

    return q
      ? [
          ...tagItems(tagSuggestions),
          ...taskItems,
          ...noteItems,
          ...eventItems,
          ...chatItems,
          ...commands.filter((c) => match(c.label)),
        ]
      : [...commands, ...taskItems.slice(0, 3), ...noteItems.slice(0, 3)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tasks, notes, conversations]);

  if (!paletteOpen) return null;

  const grouped = items.reduce<Record<string, Item[]>>((acc, it) => {
    (acc[it.group] ||= []).push(it);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close search"
        onClick={close}
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and commands"
        className="relative w-full max-w-[560px] animate-in fade-in zoom-in-95 overflow-hidden rounded-xl border border-border bg-popover shadow-raised duration-150"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
          <Search className="size-[18px] text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                items[cursor]?.run();
              } else if (e.key === "Escape") {
                close();
              }
            }}
            placeholder="Search tasks, notes, events and chats"
            aria-label="Search tasks, notes, events and chats"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
            esc
          </kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto py-2">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13.5px] text-muted-foreground">
              Nothing matches “{query}”.
            </p>
          ) : (
            Object.entries(grouped).map(([group, list]) => (
              <div key={group} className="mb-1">
                <p className="px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {group}
                </p>
                {list.map((it) => {
                  const index = items.indexOf(it);
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onMouseEnter={() => setCursor(index)}
                      onClick={it.run}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[14px] transition-colors",
                        index === cursor ? "bg-surface-2" : "hover:bg-surface-2/60",
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      {it.hint ? (
                        <span className="shrink-0 text-[12px] text-muted-foreground">
                          {it.hint}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
