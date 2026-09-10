import { CheckCircle2, Plus, Tag, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { TODAY, dayOffset, type Task } from "@/data/seed";
import { relativeDate, isOverdue, formatTime } from "@/lib/format";
import { TaskCheckbox, EmptyState, SectionLabel } from "@/components/primitives";
import { TaskDetail } from "@/components/task-detail";
import { PageHeader } from "@/components/app-shell";
import { cn } from "@/lib/utils";

/**
 * Distinct, sorted tag list derived from all tasks (no tag registry table —
 * tags live on tasks.tags text[]).
 */
export function allTags(tasks: Task[]): string[] {
  const set = new Set<string>();
  for (const t of tasks) for (const tag of t.tags) if (tag.trim()) set.add(tag.trim());
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Small rounded tag chip (Gmail-chip styling), shared by rows + detail. */
export function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
      <span className="truncate">{tag}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove tag ${tag}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="grid size-3.5 place-items-center rounded-sm transition-colors hover:bg-primary/20"
        >
          <X className="size-2.5" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

export function TaskRow({
  task,
  selected,
  onSelect,
  showTags = true,
}: {
  task: Task;
  selected?: boolean;
  onSelect: () => void;
  showTags?: boolean;
}) {
  const { toggleTask } = useStore();
  const overdue = isOverdue(task.dueDate) && !task.done;

  const meta = [
    task.dueDate
      ? `${relativeDate(task.dueDate)}${task.dueTime ? ` · ${formatTime(task.dueTime)}` : ""}`
      : "",
    task.subtasks.length
      ? `${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length}`
      : "",
  ].filter(Boolean);

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
      className={cn(
        "group flex w-full cursor-default items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors",
        selected ? "bg-surface-2" : "hover:bg-surface-2/70",
      )}
    >
      <TaskCheckbox
        done={task.done}
        priority={task.priority}
        onToggle={() => toggleTask(task.id)}
        label={task.title}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[14.5px] leading-snug",
            task.done && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </span>
        {meta.length ? (
          <span
            className={cn(
              "mt-0.5 block truncate text-[12.5px]",
              overdue ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {overdue ? "Overdue · " : ""}
            {meta.join(" · ")}
          </span>
        ) : null}
        {showTags && task.tags.length ? (
          <span className="mt-1 flex flex-wrap gap-1">
            {task.tags.map((tag) => (
              <TagChip key={tag} tag={tag} />
            ))}
          </span>
        ) : null}
      </span>
      {task.priority === "high" && !task.done ? (
        <span
          className="mt-1 shrink-0 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive"
          aria-label="High priority"
        >
          High
        </span>
      ) : null}
    </div>
  );
}

/** Smart views: /tasks (all), /tasks/upcoming, /tasks/today. */
export const SMART_TASK_VIEWS = ["today", "upcoming"] as const;

export function TasksScreen({ view = "all", tagFilter }: { view?: string; tagFilter?: string }) {
  const { tasks, addTask } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Active tag filters (OR-union). Seed from URL when provided.
  const [activeTags, setActiveTags] = useState<string[]>(tagFilter ? [tagFilter] : []);

  const tags = useMemo(() => allTags(tasks), [tasks]);

  const toggleTag = (tag: string) =>
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const base = useMemo(() => {
    if (view === "today") return tasks.filter((t) => t.dueDate && t.dueDate <= TODAY);
    if (view === "upcoming") return tasks.filter((t) => t.dueDate && t.dueDate > TODAY);
    return tasks;
  }, [tasks, view]);

  const visible = useMemo(
    () =>
      activeTags.length === 0
        ? base
        : base.filter((t) => t.tags.some((tag) => activeTags.includes(tag))),
    [base, activeTags],
  );

  const open = visible.filter((t) => !t.done);
  const done = visible.filter((t) => t.done);

  // Week buckets (Upcoming smart view).
  const buckets = useMemo(() => {
    if (view !== "upcoming") return null;
    const tomorrow = dayOffset(1);
    const d = new Date(`${TODAY}T00:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7; // Monday=0
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - dow + 7); // next Monday
    const endOfWeek = monday.toISOString().slice(0, 10);
    const mk = (name: string, items: Task[]) => ({ name, items });
    return [
      mk(
        "Tomorrow",
        open.filter((t) => (t.dueDate ?? "") === tomorrow),
      ),
      mk(
        "This week",
        open.filter((t) => (t.dueDate ?? "") > tomorrow && (t.dueDate ?? "") < endOfWeek),
      ),
      mk(
        "Later",
        open.filter((t) => (t.dueDate ?? "") >= endOfWeek),
      ),
    ];
  }, [open, view]);

  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  const title = view === "today" ? "Today" : view === "upcoming" ? "Upcoming" : "All tasks";
  const subtitle = `${open.length} open · ${done.length} completed${
    activeTags.length ? ` · ${activeTags.map((t) => `#${t}`).join(", ")}` : ""
  }`;

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader title={title} subtitle={subtitle} />

      <div className="mx-auto w-full max-w-2xl flex-1 px-3 py-4 md:px-6">
        {/* quick add */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            const dueDate =
              view === "today" ? TODAY : view === "upcoming" ? dayOffset(1) : undefined;
            setSelectedId(addTask(draft.trim(), undefined, dueDate));
            setDraft("");
          }}
          className="panel mb-3 flex items-center gap-3 px-3 py-2.5 focus-within:border-border-strong"
        >
          <Plus className="size-[18px] text-muted-foreground" aria-hidden />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a task"
            aria-label="Add a task"
            className="w-full bg-transparent text-[14.5px] outline-none placeholder:text-muted-foreground"
          />
        </form>

        {/* tag filter chips (OR union, with open-count per tag) */}
        {tags.length ? (
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <Tag className="size-3.5 text-muted-foreground" aria-hidden />
            {tags.map((tag) => {
              const count = tasks.filter((t) => !t.done && t.tags.includes(tag)).length;
              const active = activeTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] transition-colors",
                    active
                      ? "border-transparent bg-primary/12 font-medium text-primary"
                      : "border-border text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  {tag}
                  <span className="tnum opacity-70">{count}</span>
                </button>
              );
            })}
            {activeTags.length ? (
              <button
                type="button"
                onClick={() => setActiveTags([])}
                className="ml-1 text-[12px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}

        {open.length === 0 && done.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="size-5" aria-hidden />}
            title={activeTags.length ? "No tasks with these tags" : "Nothing here yet"}
            description={
              activeTags.length
                ? "Try removing a tag filter."
                : "Add your first task above, or ask the assistant to plan something for you."
            }
          />
        ) : (
          <>
            {buckets ? (
              buckets
                .filter((b) => b.items.length)
                .map((b) => (
                  <div key={b.name} className="mt-1 first:mt-0">
                    <SectionLabel>
                      {b.name} · {b.items.length}
                    </SectionLabel>
                    <div className="panel mb-4 space-y-0.5 px-1 py-1.5">
                      {b.items.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          selected={t.id === selectedId}
                          onSelect={() => setSelectedId(t.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))
            ) : (
              <div className="panel space-y-0.5 px-1 py-1.5">
                {open.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    selected={t.id === selectedId}
                    onSelect={() => setSelectedId(t.id)}
                  />
                ))}
              </div>
            )}
            {done.length ? (
              <div className="mt-6 opacity-60">
                <SectionLabel>Completed · {done.length}</SectionLabel>
                <div className="panel space-y-0.5 px-1 py-1.5">
                  {done.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      selected={t.id === selectedId}
                      onSelect={() => setSelectedId(t.id)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* detail panel — desktop */}
      {selected ? (
        <div className="hidden w-[350px] shrink-0 border-l border-border xl:block">
          <div className="sticky top-0 h-screen">
            <TaskDetail task={selected} onClose={() => setSelectedId(null)} />
          </div>
        </div>
      ) : null}

      {/* detail sheet — mobile & iPad */}
      {selected ? (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            type="button"
            aria-label="Close task details"
            onClick={() => setSelectedId(null)}
            className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px]"
          />
          <div className="absolute inset-x-0 bottom-0 top-16 animate-in slide-in-from-bottom-6 overflow-hidden rounded-t-2xl border-t border-border bg-surface shadow-raised duration-200">
            <TaskDetail task={selected} onClose={() => setSelectedId(null)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function countFor(tasks: Task[], tag: string): number {
  return tasks.filter((t) => !t.done && t.tags.includes(tag)).length;
}
