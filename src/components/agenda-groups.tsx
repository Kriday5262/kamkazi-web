import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { TODAY, dayOffset, type Task } from "@/data/seed";
import { relativeDate, formatTime, isOverdueNow } from "@/lib/format";
import { TaskCheckbox } from "@/components/primitives";
import { TagChip } from "@/components/tasks-screen";
import { AgendaList, type AgendaLiveEvent } from "@/components/agenda-list";
import { cn } from "@/lib/utils";

/**
 * "Agenda" master view — ALL open tasks + events grouped into:
 * Unplanned (no date), Overdue (past due, open), Today, Tomorrow,
 * This week (rest of the week), Later (beyond this week).
 * Empty groups are hidden; tasks and events are merged chronologically
 * inside the dated groups.
 */

type Item = { kind: "task"; task: Task } | { kind: "event"; event: AgendaLiveEvent };

interface Group {
  key: string;
  label: string;
  items: Item[];
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function minutesOf(hhmm?: string | undefined): number {
  if (!hhmm) return 24 * 60; // untimed sorts last within its date
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function itemMin(i: Item): number {
  if (i.kind === "event") return i.event.allDay || !i.event.start ? -1 : minutesOf(i.event.start);
  return minutesOf(i.task.dueTime);
}

function sortItems(items: Item[]): Item[] {
  return items.slice().sort((a, b) => {
    const da = a.kind === "event" ? a.event.date : (a.task.dueDate ?? "");
    const db = b.kind === "event" ? b.event.date : (b.task.dueDate ?? "");
    if (da !== db) return da < db ? -1 : 1;
    return itemMin(a) - itemMin(b);
  });
}

export function AgendaGroupsView({
  events,
  weekStartsOn = 1,
  onSelectTask,
  onSelectEvent,
}: {
  events: AgendaLiveEvent[];
  weekStartsOn?: 0 | 1;
  onSelectTask: (id: string) => void;
  onSelectEvent: (id: string) => void;
}) {
  const { tasks, toggleTask } = useStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo<Group[]>(() => {
    const today = TODAY;
    const tomorrow = dayOffset(1);
    // End of the current week (exclusive), respecting the week-start setting.
    const base = new Date(today + "T00:00:00");
    const back = (base.getDay() - weekStartsOn + 7) % 7;
    const weekAnchor = new Date(base);
    weekAnchor.setDate(base.getDate() - back + 7); // first day of NEXT week
    const endOfWeek = weekAnchor.toISOString().slice(0, 10);

    const open = tasks.filter((t) => !t.done);
    const evOn = (date: string): Item[] =>
      events.filter((e) => e.date === date).map((e): Item => ({ kind: "event", event: e }));
    const tkOn = (pred: (t: Task) => boolean): Item[] =>
      open.filter(pred).map((t): Item => ({ kind: "task", task: t }));

    const all: Group[] = [
      { key: "unplanned", label: "Unplanned", items: tkOn((t) => !t.dueDate) },
      {
        key: "overdue",
        label: "Overdue",
        items: tkOn((t) => !!t.dueDate && t.dueDate < today && isOverdueNow(t.dueDate, t.dueTime)),
      },
      {
        key: "today",
        label: "Today",
        items: [...evOn(today), ...tkOn((t) => t.dueDate === today)],
      },
      {
        key: "tomorrow",
        label: "Tomorrow",
        items: [...evOn(tomorrow), ...tkOn((t) => t.dueDate === tomorrow)],
      },
      {
        key: "week",
        label: "This week",
        items: [
          ...events
            .filter((e) => e.date > tomorrow && e.date < endOfWeek)
            .map((e): Item => ({ kind: "event", event: e })),
          ...tkOn((t) => !!t.dueDate && t.dueDate! > tomorrow && t.dueDate! < endOfWeek),
        ],
      },
      {
        key: "later",
        label: "Later",
        items: [
          ...events
            .filter((e) => e.date >= endOfWeek)
            .map((e): Item => ({ kind: "event", event: e })),
          ...tkOn((t) => !!t.dueDate && t.dueDate! >= endOfWeek),
        ],
      },
    ];
    // Events carry their date in the row meta; tasks in dated groups show time.
    return all.filter((g) => g.items.length > 0).map((g) => ({ ...g, items: sortItems(g.items) }));
  }, [tasks, events, weekStartsOn]);

  if (groups.length === 0) {
    return (
      <div className="panel px-3 py-4 text-[13px] text-muted-foreground">
        Nothing open — no tasks, no events.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const isCollapsed = collapsed[g.key] ?? false;
        const headerTone =
          g.key === "overdue"
            ? "text-destructive"
            : g.key === "today"
              ? "text-primary"
              : "text-foreground";
        return (
          <section key={g.key} aria-label={g.label} className="animate-fade-up">
            <button
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !isCollapsed }))}
              className="mb-1.5 flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left"
            >
              <span className={cn("text-[13px] font-bold uppercase tracking-[0.06em]", headerTone)}>
                {g.label}
              </span>
              <span className="num text-[12px] font-semibold text-muted-foreground">
                {g.items.length}
              </span>
            </button>
            {isCollapsed ? null : g.key === "unplanned" || g.key === "overdue" ? (
              <div className="panel space-y-0.5 px-1 py-1.5">
                {g.items.map((i) =>
                  i.kind === "task" ? (
                    <AgendaGroupTaskRow
                      key={"t" + i.task.id}
                      task={i.task}
                      showDate={g.key === "overdue"}
                      onToggle={() => toggleTask(i.task.id)}
                      onSelect={() => onSelectTask(i.task.id)}
                    />
                  ) : null,
                )}
              </div>
            ) : (
              <AgendaList
                agenda={g.items.map((i) =>
                  i.kind === "event"
                    ? { key: "e" + i.event.id, min: itemMin(i), event: i.event }
                    : { key: "t" + i.task.id, min: itemMin(i), task: i.task },
                )}
                onSelectEvent={onSelectEvent}
                onSelectTask={onSelectTask}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Task row for the undated groups (Unplanned / Overdue) — checkbox + meta. */
function AgendaGroupTaskRow({
  task,
  showDate,
  onToggle,
  onSelect,
}: {
  task: Task;
  showDate?: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="flex w-full cursor-default gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-surface-2/60"
    >
      <span
        className={cn(
          "tnum w-[60px] shrink-0 pt-0.5 text-right text-[12.5px]",
          showDate ? "font-semibold text-destructive" : "text-muted-foreground",
        )}
      >
        {showDate ? relativeDate(task.dueDate) : ""}
      </span>
      <TaskCheckbox
        done={task.done}
        priority={task.priority}
        onToggle={onToggle}
        label={task.title}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] leading-snug">{task.title}</span>
        <span className="block text-[12.5px] text-muted-foreground">
          {[
            task.dueTime ? formatTime(task.dueTime) : "",
            task.priority === "high" ? "High priority" : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {task.tags.length ? (
          <span className="mt-1 flex flex-wrap gap-1">
            {task.tags.map((tag) => (
              <TagChip key={tag} tag={tag} />
            ))}
          </span>
        ) : null}
      </span>
    </div>
  );
}
