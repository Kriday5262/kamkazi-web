/**
 * AgendaList — shared chronological events + tasks list for a single day.
 * Used by both the Calendar screen's day view and the Today page's Agenda
 * section (extracted from calendar-screen.tsx's inline agenda rendering).
 */
import { Fragment } from "react";
import { CalendarDays, Trash2, Pencil } from "lucide-react";
import { useStore } from "@/lib/store";
import { EmptyState, TaskCheckbox } from "@/components/primitives";
import { TagChip } from "@/components/tasks-screen";
import type { Task } from "@/data/seed";
import { formatDuration, formatTime, relativeDate } from "@/lib/format";
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
  /** Minutes since midnight the event ENDS (start + duration) — for past-due fading. */
  endMin?: number | undefined;
  task?: Task;
  event?: AgendaLiveEvent;
}

export function buildAgenda(events: AgendaLiveEvent[], tasks: Task[], date: string): AgendaItem[] {
  const minutesOf = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const items: AgendaItem[] = [];
  for (const e of events.filter((e) => e.date === date)) {
    const startMin = e.allDay || !e.start ? -1 : minutesOf(e.start);
    const endMin =
      e.allDay || !e.start ? -1 : startMin + Math.max(1, e.durationMin ?? 30);
    items.push({ key: e.id, min: startMin, endMin, event: e });
  }
  for (const t of tasks.filter((t) => t.dueDate === date))
    items.push({ key: t.id, min: t.dueTime ? minutesOf(t.dueTime) : 24 * 60, task: t });
  return items.sort((a, b) => a.min - b.min);
}

export function AgendaList({
  agenda,
  overdue,
  timePastIds,
  overduePinIds,
  showNowLine,
  onSelectEvent,
  onSelectTask,
  onEditEvent,
  onDeleteEvent,
  emptyTitle = "Nothing planned",
  emptyDescription = "This day is completely free.",
}: {
  agenda: AgendaItem[];
  /** Overdue tasks rendered above the day's plan (red "Overdue" header). */
  overdue?: Task[] | undefined;
  /** Today's tasks whose time has passed -> red time in the timeline (stay in place). */
  timePastIds?: Set<string> | undefined;
  /**
   * Tasks that should float to the TOP of the day plan as overdue (red) —
   * open tasks whose due date is BEFORE the viewed date but not yet done
   * (viewing a later date than the due date). Hidden from their own slot.
   */
  overduePinIds?: Set<string> | undefined;
  /** Render a red "current time" marker row at the now position (Today only). */
  showNowLine?: boolean | undefined;
  onSelectEvent: (id: string) => void;
  onSelectTask: (id: string) => void;
  onEditEvent?: (event: AgendaLiveEvent) => void;
  onDeleteEvent?: (id: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const pinned = overduePinIds
    ? agenda
        .filter((i) => i.task && overduePinIds.has(i.task.id))
        .map((i) => i.task!)
    : [];
  const rest = overduePinIds
    ? agenda.filter((i) => !(i.task && overduePinIds.has(i.task.id)))
    : agenda;
  // Red "current time" marker position: index in `rest` of the first item at or
  // after the current time (rest.length = after everything, when nothing remains).
  const nowLineMin = showNowLine ? nowMinutes() : -1;
  const nowLineAt =
    showNowLine && nowLineMin >= 0
      ? Math.max(
          0,
          rest.findIndex((i) => i.min >= nowLineMin) === -1
            ? rest.length
            : rest.findIndex((i) => i.min >= nowLineMin),
        )
      : -1;
  if (rest.length === 0 && pinned.length === 0 && !(overdue && overdue.length > 0)) {
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
      {(overdue && overdue.length > 0) || pinned.length > 0 ? (
        <>
          <div className="px-1 pb-1 pt-1.5">
            <span className="text-[13px] font-bold tracking-tight text-destructive">Overdue</span>
            <span className="num ml-2 text-[11px] font-semibold text-destructive/70">
              {(overdue?.length ?? 0) + pinned.length}
            </span>
          </div>
          {overdue?.map((t) => (
            <AgendaTaskRow key={t.id} task={t} onSelect={() => onSelectTask(t.id)} overdue />
          ))}
          {pinned.map((t) => (
            <AgendaTaskRow key={t.id} task={t} onSelect={() => onSelectTask(t.id)} overdue />
          ))}
          <div className="mx-1 my-1.5 border-t border-border" />
        </>
      ) : null}
      {rest.map((item, idx) => (
        <Fragment key={item.key}>
          {showNowLine && nowLineMin >= 0 && nowLineAt === idx ? (
            <NowLine />
          ) : null}
          {item.event ? (
            <AgendaEventRow
              event={item.event}
              past={
                typeof item.endMin === "number" &&
                item.endMin >= 0 &&
                item.endMin <= nowMinutes()
              }
              onSelect={() => onSelectEvent(item.event!.id)}
              onEdit={onEditEvent}
              onDelete={onDeleteEvent}
            />
          ) : item.task ? (
            <AgendaTaskRow
              task={item.task}
              timePast={timePastIds?.has(item.task.id) ?? false}
              onSelect={() => onSelectTask(item.task!.id)}
            />
          ) : null}
        </Fragment>
      ))}
      {showNowLine && nowLineMin >= 0 && nowLineAt === rest.length ? <NowLine /> : null}
    </div>
  );
}

/** Current local time-of-day in minutes (device clock, matches isTimePast). */
function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/** Red "current time" marker — thin line + small time label. */
function NowLine() {
  const now = new Date();
  const h12 = now.getHours() % 12 === 0 ? 12 : now.getHours() % 12;
  const label = `${h12}:${String(now.getMinutes()).padStart(2, "0")} ${now.getHours() >= 12 ? "PM" : "AM"}`;
  return (
    <div className="relative my-1 flex items-center gap-1.5" aria-label={"Current time " + label}>
      <span className="tnum w-[96px] shrink-0 text-right text-[10.5px] font-semibold text-destructive">
        {label}
      </span>
      <span className="h-[2px] min-w-0 flex-1 rounded-full bg-destructive/80" aria-hidden />
    </div>
  );
}

/** Compact date for one-line metas: "Tue, Sep 8" (never wraps). */
function compactDate(iso?: string | undefined): string {
  if (!iso) return "No date";
  const d = new Date(`${iso}T00:00:00`);
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (iso === TODAY_COMPACT) return "Today";
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
const TODAY_COMPACT = new Date().toISOString().slice(0, 10);

function AgendaEventRow({
  event,
  onSelect,
  onEdit,
  onDelete,
  past = false,
}: {
  event: AgendaLiveEvent;
  onSelect: () => void;
  onEdit?: ((event: AgendaLiveEvent) => void) | undefined;
  onDelete?: ((id: string) => void) | undefined;
  /** Event's end time has passed -> faded like a completed task. */
  past?: boolean;
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
      className={cn(
        "group flex cursor-default gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-surface-2/60",
        past && "opacity-50",
      )}
    >
      <span className="tnum w-[96px] shrink-0 whitespace-nowrap pt-0.5 text-right text-[12px] text-muted-foreground">
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

function AgendaTaskRow({ task, onSelect, overdue = false, timePast = false }: { task: Task; onSelect: () => void; overdue?: boolean; timePast?: boolean }) {
  const { toggleTask } = useStore();
  // "Overdue" rows show the actual due date in the time slot; planned rows show
  // relative date when the row's list isn't a single day (week/month/overdue lists).
  const metaLabel = task.dueDate
    ? `${compactDate(task.dueDate)}${task.dueTime ? ` · ${formatTime(task.dueTime)}` : ""}`
    : "No date";
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
      className="flex w-full cursor-default gap-2.5 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-surface-2/60"
    >
      <span className={cn("tnum w-[96px] shrink-0 whitespace-nowrap pt-0.5 text-right text-[12px]", overdue || timePast ? "font-semibold text-destructive" : "text-muted-foreground")}>
        {task.dueTime ? formatTime(task.dueTime) : relativeDate(task.dueDate)}
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
          {metaLabel}{task.priority === "high" ? " · High priority" : ""}
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
