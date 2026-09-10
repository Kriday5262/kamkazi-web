/**
 * AgendaList — shared chronological events + tasks list for a single day.
 * Used by both the Calendar screen's day view and the Today page's Agenda
 * section (extracted from calendar-screen.tsx's inline agenda rendering).
 */
import { CalendarDays, Trash2, Pencil } from "lucide-react";
import { useStore } from "@/lib/store";
import { EmptyState, TaskCheckbox } from "@/components/primitives";
import { TagChip } from "@/components/tasks-screen";
import type { Task } from "@/data/seed";
import { formatDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface AgendaLiveEvent {
  id: string;
  title: string;
  date: string;
  start?: string | undefined;
  durationMin?: number | undefined;
  allDay?: boolean | undefined;
  location?: string | undefined;
  calendar: string;
  colour?: string | undefined;
  readOnly?: boolean | undefined;
}

const COLOUR_HEX: Record<string, string> = {
  blue: "var(--color-accent-blue)",
  green: "var(--color-accent-green)",
  amber: "var(--color-accent-amber)",
  purple: "var(--color-accent-violet)",
  rose: "var(--color-accent-rose)",
  cyan: "var(--color-accent-teal)",
};

function eventColour(e: { calendar: string; colour?: string | undefined }): string {
  if (e.colour && COLOUR_HEX[e.colour]) return COLOUR_HEX[e.colour] ?? COLOUR_HEX["blue"]!;
  const palette = Object.keys(COLOUR_HEX);
  let h = 0;
  for (const ch of e.calendar) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return COLOUR_HEX[palette[h % palette.length] ?? "blue"] ?? COLOUR_HEX["blue"]!;
}

export interface AgendaItem {
  key: string;
  min: number;
  task?: Task;
  event?: AgendaLiveEvent;
}

export function buildAgenda(events: AgendaLiveEvent[], tasks: Task[], date: string): AgendaItem[] {
  const minutesOf = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const items: AgendaItem[] = [];
  for (const e of events.filter((e) => e.date === date))
    items.push({ key: e.id, min: e.allDay || !e.start ? -1 : minutesOf(e.start), event: e });
  for (const t of tasks.filter((t) => t.dueDate === date))
    items.push({ key: t.id, min: t.dueTime ? minutesOf(t.dueTime) : 24 * 60, task: t });
  return items.sort((a, b) => a.min - b.min);
}

export function AgendaList({
  agenda,
  onSelectEvent,
  onSelectTask,
  onEditEvent,
  onDeleteEvent,
  emptyTitle = "Nothing planned",
  emptyDescription = "This day is completely free.",
}: {
  agenda: AgendaItem[];
  onSelectEvent: (id: string) => void;
  onSelectTask: (id: string) => void;
  onEditEvent?: (event: AgendaLiveEvent) => void;
  onDeleteEvent?: (id: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (agenda.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-5" aria-hidden />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }
  return (
    <div className="panel px-2 py-2">
      {agenda.map((item) =>
        item.event ? (
          <AgendaEventRow
            key={item.key}
            event={item.event}
            onSelect={() => onSelectEvent(item.event!.id)}
            onEdit={onEditEvent}
            onDelete={onDeleteEvent}
          />
        ) : item.task ? (
          <AgendaTaskRow
            key={item.key}
            task={item.task}
            onSelect={() => onSelectTask(item.task!.id)}
          />
        ) : null,
      )}
    </div>
  );
}

function AgendaEventRow({
  event,
  onSelect,
  onEdit,
  onDelete,
}: {
  event: AgendaLiveEvent;
  onSelect: () => void;
  onEdit?: ((event: AgendaLiveEvent) => void) | undefined;
  onDelete?: ((id: string) => void) | undefined;
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
      className="group flex cursor-default gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-surface-2/60"
    >
      <span className="tnum w-[60px] shrink-0 pt-0.5 text-right text-[12.5px] text-muted-foreground">
        {event.allDay || !event.start ? "All day" : formatTime(event.start)}
      </span>
      <span
        className="mt-1 w-[3px] shrink-0 rounded-full"
        style={{ backgroundColor: eventColour(event) }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium leading-snug">
          {event.title}
          {event.readOnly ? (
            <span className="ml-2 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sub
            </span>
          ) : null}
        </span>
        <span className="block text-[12.5px] text-muted-foreground">
          {[formatDuration(event.durationMin), event.location, event.calendar]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {!event.readOnly && (onEdit || onDelete) ? (
        <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onEdit ? (
            <button
              type="button"
              aria-label={`Edit ${event.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(event);
              }}
              className="tap grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              aria-label={`Delete ${event.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(event.id);
              }}
              className="tap grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-destructive"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function AgendaTaskRow({ task, onSelect }: { task: Task; onSelect: () => void }) {
  const { toggleTask } = useStore();
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
      <span className="tnum w-[60px] shrink-0 pt-0.5 text-right text-[12.5px] text-muted-foreground">
        {task.dueTime ? formatTime(task.dueTime) : ""}
      </span>
      <TaskCheckbox
        done={task.done}
        priority={task.priority}
        onToggle={() => toggleTask(task.id)}
        label={task.title}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[14.5px] leading-snug",
            task.done && "text-muted-foreground opacity-50",
          )}
        >
          {task.title}
        </span>
        <span className="block text-[12.5px] text-muted-foreground">
          Task{task.priority === "high" ? " · High priority" : ""}
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
