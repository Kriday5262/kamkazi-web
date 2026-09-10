import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { TODAY, dayOffset, type Task } from "@/data/seed";
import { longDate } from "@/lib/format";
import { TaskCheckbox } from "@/components/primitives";
import { TaskDetail } from "@/components/task-detail";
import { TagChip } from "@/components/tasks-screen";
import { AgendaList, type AgendaLiveEvent } from "@/components/agenda-list";

/**
 * "Agenda" master view — ALL tasks + events grouped into:
 * Unplanned (no date), Overdue (past, not done), Today, Tomorrow,
 * This week (rest of current week), Later (beyond this week).
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

export function AgendaGroupsView({ events }: { events: AgendaLiveEvent[] }) {
  const { tasks } = useStore();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  const groups = useMemo<Group[]>(() => {
    const today = TODAY;
    const dow = new Date(today + "T00:00:00").getDay(); // 0=Sun
    const daysToSunday = dow === 0 ? 0 : 7 - dow;
    const endOfWeek = addDays(today, daysToSunday);

    const open = tasks.filter((x) => !x.done);
    const evOn = (date: string) => events.filter((e) => e.date === date).map((e): Item => ({ kind: "event", event: e }));
    const tkOn = (pred: (x: Task) => boolean) => open.filter(pred).map((x): Item => ({ kind: "task", task: x }));
    const evRange = (from: string, to: string) =>
      events.filter((e) => e.date > from && e.date <= to).map((e): Item => ({ kind: "event", event: e }));
    const tkRange = (from: string, to: string) =>
      open.filter((x) => x.dueDate && x.dueDate > from && x.dueDate <= to).map((x): Item => ({ kind: "task", task: x }));

    return [
      { key: "unplanned", label: "Unplanned", items: tkOn((x) => !x.dueDate) },
      {
        key: "overdue",
        label: "Overdue",
        items: tkOn((x) => !!x.dueDate && x.dueDate < today).sort((a, b) =>
          (a.kind === "task" ? a.task.dueDate ?? "" : "") < (b.kind === "task" ? b.task.dueDate ?? "" : "") ? -1 : 1,
        ),
      },
      { key: "today", label: "Today", items: [...evOn(today), ...tkOn((x) => x.dueDate === today)] },
      { key: "tomorrow", label: "Tomorrow", items: [...evOn(dayOffset(1)), ...tkOn((x) => x.dueDate === dayOffset(1))] },
      { key: "week", label: "This week", items: [...evRange(dayOffset(1), endOfWeek), ...tkRange(dayOffset(1), endOfWeek)] },
      { key: "later", label: "Later", items: [...evRange(endOfWeek, "9999-12-31"), ...tkRange(endOfWeek, "9999-12-31")] },
    ];
  }, [tasks, events]);

  return (
    <>
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[14px] font-bold tracking-tight">
                {g.key === "overdue" ? (
                  <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive">{g.label}</span>
                ) : (
                  g.label
                )}
                <span className="num text-[12px] font-semibold text-muted-foreground">{g.items.length}</span>
              </h3>
            </div>
            {g.items.length === 0 ? (
              <p className="px-1 text-[12.5px] text-muted-foreground">Nothing here.</p>
            ) : g.key === "unplanned" || g.key === "overdue" ? (
              <ul className="space-y-1">
                {g.items.map((i) =>
                  i.kind === "task" ? <TaskRowLite key={i.task.id} task={i.task} onSelect={() => setSelectedTaskId(i.task.id)} /> : null,
                )}
              </ul>
            ) : (
              <AgendaList
                agenda={g.items
                  .slice()
                  .sort((a, b) => {
                    const da = a.kind === "event" ? a.event.date : a.task.dueDate ?? "9999-12-31";
                    const db = b.kind === "event" ? b.event.date : b.task.dueDate ?? "9999-12-31";
                    return da < db ? -1 : da > db ? 1 : 0;
                  })
                  .map((i) =>
                    i.kind === "event"
                      ? { key: "e" + i.event.id, min: 0, event: i.event }
                      : { key: "t" + i.task.id, min: 0, task: i.task },
                  )}
                onSelectEvent={() => {
                  /* event detail handled on the calendar views */
                }}
                onSelectTask={(id) => setSelectedTaskId(id)}
                onEditEvent={() => {}}
                onDeleteEvent={() => {}}
              />
            )}
          </section>
        ))}
      </div>
      {selectedTask ? <TaskDetail task={selectedTask} onClose={() => setSelectedTaskId(null)} /> : null}
    </>
  );
}

/** Minimal task row for grouped lists (checkbox + title + date + tags). */
function TaskRowLite({ task, onSelect }: { task: Task; onSelect: () => void }) {
  const { toggleTask } = useStore();
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2"
      >
        <TaskCheckbox
          done={task.done}
          label={`Mark ${task.title} ${task.done ? "not done" : "done"}`}
          onToggle={() => toggleTask(task.id)}
        />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{task.title}</span>
        {task.dueDate ? <span className="tnum shrink-0 text-[11.5px] text-muted-foreground">{longDate(task.dueDate)}</span> : null}
        {task.tags.slice(0, 2).map((tg) => (
          <TagChip key={tg} tag={tg} />
        ))}
      </button>
    </li>
  );
}