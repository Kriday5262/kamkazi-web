import { ChevronLeft, ChevronRight, CalendarDays, RefreshCw, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { TODAY, dayOffset, type Task } from "@/data/seed";
import { EmptyState } from "@/components/primitives";
import { AgendaList, buildAgenda, type AgendaLiveEvent } from "@/components/agenda-list";
import { AgendaGroupsView } from "@/components/agenda-groups";
import { TaskDetail } from "@/components/task-detail";
import { EventDetail } from "@/components/event-detail";
import type { DatedEvent } from "@/data/seed";
import { EventEditor } from "@/components/event-editor";
import { longDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
/** Index into WEEKDAYS where the week starts (0 = Sunday, 1 = Monday). */
const WEEK_STARTS_ON_KEY = "kamkazi-week-start";
function weekStartDay(): 0 | 1 {
  try {
    return window.localStorage.getItem(WEEK_STARTS_ON_KEY) === "1" ? 1 : 0;
  } catch {
    return 0;
  }
}
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Stage 4 — live calendar shape served by GET /api/calendar. */
export interface LiveEvent {
  id: string;
  title: string;
  date: string;
  start?: string | undefined;
  durationMin?: number | undefined;
  allDay?: boolean | undefined;
  location?: string | undefined;
  calendar: string;
  colour?: string | undefined;
  icsUid?: string | undefined;
  subscriptionId?: string | undefined;
  readOnly?: boolean | undefined;
}

export interface Subscription {
  id: string;
  url: string;
  name: string;
  colour: string;
  lastFetched: string | null;
  lastStatus: string;
}

/** Stage 5.6 — per-calendar registry entry served by GET /api/calendar. */
export interface CalendarSourceState {
  id: string;
  sourceType: string;
  accountId: string;
  calendarId: string;
  displayName: string;
  colour: string;
  customName: boolean;
}

const COLOUR_CLASS: Record<string, string> = {
  blue: "bg-accent-blue",
  green: "bg-accent-green",
  amber: "bg-accent-amber",
  purple: "bg-accent-violet",
  rose: "bg-accent-rose",
  cyan: "bg-accent-teal",
};

const COLOUR_HEX: Record<string, string> = {
  blue: "var(--color-accent-blue)",
  green: "var(--color-accent-green)",
  amber: "var(--color-accent-amber)",
  purple: "var(--color-accent-violet)",
  rose: "var(--color-accent-rose)",
  cyan: "var(--color-accent-teal)",
};

export const CALENDAR_COLOUR_NAMES = Object.keys(COLOUR_HEX);

/** Stage 5.6 — colour of an event: explicit registry colour wins, else hash. */
function eventColour(e: { calendar: string; colour?: string | undefined }): string {
  if (e.colour && COLOUR_HEX[e.colour]) return COLOUR_HEX[e.colour] ?? "var(--color-accent-blue)";
  return COLOUR_HEX[subColour(e.calendar)] ?? "var(--color-accent-blue)";
}
function subColour(name: string): string {
  const palette = Object.keys(COLOUR_HEX);
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return palette[h % palette.length] ?? "blue";
}

type ViewMode = "month" | "week" | "day" | "agenda";

export function CalendarScreen() {
  const { tasks, addTask, settings } = useStore();
  const [selectedTaskId, setSelectedTaskIdState] = useState<string | null>(null);
  const [quickTask, setQuickTask] = useState("");
  const [captureOpen, setCaptureOpen] = useState(false);
  const captureRef = useRef<HTMLInputElement>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [today, setToday] = useState(TODAY);
  const todayParts = today.split("-").map(Number) as [number, number, number];
  const [cursor, setCursor] = useState({ year: todayParts[0], month: todayParts[1] - 1 });
  const [selected, setSelected] = useState(TODAY);
  const [view, setView] = useState<ViewMode>("day");

  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [sources, setSources] = useState<CalendarSourceState[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorFor, setEditorFor] = useState<LiveEvent | "new" | null>(null);
  const [editorDate, setEditorDate] = useState(TODAY);
  const [syncing, setSyncing] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  interface ApiResult {
    ok?: boolean;
    error?: string;
    added?: number;
    synced?: number;
  }
  const showToast = useCallback((m: string) => {
    setToastMsg(m);
    window.setTimeout(() => setToastMsg(null), 4000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar");
      if (!res.ok) return;
      const data = (await res.json()) as {
        events: LiveEvent[];
        subscriptions: Subscription[];
        sources?: CalendarSourceState[];
      };
      setLiveEvents(data.events);
      setSources(data.sources ?? []);
    } catch {
      // keep prior data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const actual = dayOffset(0);
    if (actual !== TODAY) {
      const parts = actual.split("-").map(Number) as [number, number, number];
      setToday(actual);
      setCursor({ year: parts[0], month: parts[1] - 1 });
      setSelected(actual);
    }
    setEditorDate(actual);
  }, []);

  // Initial load + 15-min auto-refresh of the live calendar data.
  useEffect(() => {
    void refresh();
    pollRef.current = setInterval(() => void refresh(), 15 * 60_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const post = useCallback(
    async (body: Record<string, unknown>): Promise<ApiResult | null> => {
      try {
        const res = await fetch("/api/calendar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return (await res.json()) as Record<string, unknown>;
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Request failed");
        return null;
      }
    },
    [showToast],
  );

  const manualRefresh = useCallback(async () => {
    setSyncing(true);
    await post({ action: "refresh" });
    await refresh();
    setSyncing(false);
    showToast("Calendars refreshed.");
  }, [post, refresh, showToast]);

  const saveEvent = useCallback(
    async (ev: {
      id: string;
      title: string;
      date: string;
      start?: string | null;
      durationMin?: number | null;
      allDay?: boolean;
      location?: string | null;
      calendar?: string | undefined;
    }) => {
      const r = await post({ action: "saveEvent", event: ev });
      if (r && r.ok) {
        void refresh();
        return true;
      }
      if (r) showToast(String(r.error ?? "Save failed"));
      return false;
    },
    [post, refresh, showToast],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      const r = await post({ action: "deleteEvent", id });
      if (r && (r as { error?: string }).error) {
        showToast(String((r as { error?: string }).error));
        return;
      }
      void refresh();
    },
    [post, refresh, showToast],
  );

  // Merge live events with the store's local events (dedupe by id).
  const allEvents = useMemo(() => {
    const byId = new Map<string, LiveEvent>();
    for (const e of liveEvents) byId.set(e.id, e);
    return [...byId.values()];
  }, [liveEvents]);

  // Day-merging for month/week views is done against the selected window.
  const [weekStart, setWeekStart] = useState<0 | 1>(0);
  useEffect(() => setWeekStart(weekStartDay()), []);
  // Re-read when the settings screen changes the preference.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === WEEK_STARTS_ON_KEY) setWeekStart(weekStartDay());
    };
    window.addEventListener("storage", onStorage);
    const id = window.setInterval(() => setWeekStart(weekStartDay()), 1000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(id);
    };
  }, []);
  const days = useMemo(() => {
    if (view === "week") {
      const sel = new Date(`${selected}T00:00:00Z`);
      const start = new Date(sel);
      const back = (sel.getUTCDay() - weekStart + 7) % 7;
      start.setUTCDate(sel.getUTCDate() - back);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });
    }
    const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
    const lead = (first.getUTCDay() - weekStart + 7) % 7;
    const count = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= count; d++) cells.push(iso(cursor.year, cursor.month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor, view, selected, weekStart]);

  const dayEvents = useCallback(
    (date: string) => allEvents.filter((e) => e.date === date),
    [allEvents],
  );
  const dayTasks = useCallback((date: string) => tasks.filter((t) => t.dueDate === date), [tasks]);

  const selectedTasks = dayTasks(selected);
  const selectedEvents = dayEvents(selected);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const selectedEvent = allEvents.find((e) => e.id === selectedEventId) ?? null;

  const agenda = useMemo(
    () => buildAgenda(selectedEvents as AgendaLiveEvent[], selectedTasks, selected),
    [selectedEvents, selectedTasks, selected],
  );

  const shift = (n: number) => {
    if (view === "day") {
      const d = new Date(`${selected}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      const s = d.toISOString().slice(0, 10);
      setSelected(s);
      setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
      return;
    }
    if (view === "week") {
      const d = new Date(`${selected}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n * 7);
      const s = d.toISOString().slice(0, 10);
      setSelected(s);
      setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
      return;
    }
    setCursor((c) => {
      const m = c.month + n;
      return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="min-h-screen" />;

  const periodLabel =
    view === "month"
      ? `${MONTHS[cursor.month]} ${cursor.year}`
      : view === "week"
        ? `Week of ${MONTHS[new Date(`${days[0] ?? selected}T00:00:00Z`).getUTCMonth()]} ${Number((days[0] ?? selected).slice(8))}`
        : longDate(selected);

  return (
    <div className="flex min-h-screen">
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1100px] px-4 py-7 md:px-8 md:py-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-[24px] font-extrabold leading-tight tracking-tight md:text-[30px]">
                {view === "month" ? (
                  <>
                    {MONTHS[cursor.month]}{" "}
                    <span className="num text-muted-foreground">{cursor.year}</span>
                  </>
                ) : (
                  periodLabel
                )}
              </h1>
              <p className="mt-1 truncate text-[13px] font-medium text-muted-foreground">
                {view === "day" ? "Agenda — events + tasks" : view === "agenda" ? "Everything — unplanned, overdue & upcoming" : longDate(selected)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-[var(--shadow-panel)]">
                {(["agenda", "day", "week", "month"] as ViewMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setView(m)}
                    aria-pressed={view === m}
                    className={cn(
                      "tap rounded-full px-3 py-1.5 text-[12.5px] font-semibold capitalize transition-colors",
                      view === m
                        ? "gradient-primary text-primary-foreground"
                        : "hover:bg-surface-2",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  // Open (and focus) the quick-capture input to add a task due selected day.
                  setCaptureOpen(true);
                  window.setTimeout(() => captureRef.current?.focus(), 50);
                }}
                className="tap flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] font-semibold shadow-[var(--shadow-panel)]"
              >
                <Plus className="size-4" aria-hidden /> Task
              </button>
              <button
                type="button"
                onClick={() => {
                  setCursor({ year: todayParts[0], month: todayParts[1] - 1 });
                  setSelected(today);
                }}
                className="tap rounded-full border border-border bg-card px-3.5 py-2 text-[13px] font-semibold shadow-[var(--shadow-panel)]"
              >
                Today
              </button>
              <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-[var(--shadow-panel)]">
                <button
                  type="button"
                  aria-label="Previous"
                  onClick={() => shift(-1)}
                  className="tap grid size-8 place-items-center rounded-full hover:bg-surface-2"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  onClick={() => shift(1)}
                  className="tap grid size-8 place-items-center rounded-full hover:bg-surface-2"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
              <button
                type="button"
                onClick={manualRefresh}
                aria-label="Refresh calendars now (Google + subscriptions)"
                title="Refresh calendars now"
                className="tap grid size-9 place-items-center rounded-full border border-border bg-card shadow-[var(--shadow-panel)] text-muted-foreground transition-colors hover:text-foreground"
              >
                <RefreshCw className={cn("size-4", syncing && "animate-spin")} aria-hidden />
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-8">
            <div className="flex flex-col gap-4">
              {/* day view: this-week mini strip (fills the desktop left column) */}
              {view === "day" ? (
                <section className="panel animate-fade-up p-2.5" aria-label="This week">
                  <div className="grid grid-cols-7 pb-1">
                    {WEEKDAYS.map((_, i) => WEEKDAYS[(i + weekStart) % 7]).map((d, i) => (
                      <span
                        key={i}
                        className="text-center text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {(function weekDates() {
                      const base = new Date(today + "T00:00:00");
                      const dow = base.getDay();
                      const daysToMonday = (dow + 6) % 7;
                      const monday = new Date(base);
                      monday.setDate(monday.getDate() - daysToMonday);
                      return Array.from({ length: 7 }, (_, i) => {
                        const d = new Date(monday);
                        d.setDate(d.getDate() + i);
                        const date = d.toISOString().slice(0, 10);
                        const isSel = date === selected;
                        const isT = date === today;
                        const n = Number(date.slice(8));
                        const evs = dayEvents(date);
                        const tks = dayTasks(date);
                        const dots = [...new Set(evs.map((e) => subColour(e.calendar))), tks.length ? "task" : null].filter(Boolean) as string[];
                        return (
                          <button
                            key={date}
                            type="button"
                            onClick={() => setSelected(date)}
                            aria-pressed={isSel}
                            aria-label={longDate(date)}
                            className="tap flex flex-col items-center gap-0.5 rounded-[12px] py-1 transition-colors hover:bg-surface-2/70"
                          >
                            <span
                              className={cn(
                                "num grid size-8 place-items-center rounded-full text-[13px] font-semibold",
                                isSel
                                  ? "gradient-primary text-primary-foreground shadow-[var(--shadow-3d)]"
                                  : isT
                                    ? "text-primary"
                                    : "text-foreground",
                              )}
                            >
                              {n}
                            </span>
                            <span className="flex h-1.5 items-center gap-[3px]">
                              {dots.map((c, j) => (
                                <span
                                  key={j}
                                  className={cn(
                                    "size-1 rounded-full",
                                    c === "task" ? "bg-accent-amber" : COLOUR_CLASS[c],
                                  )}
                                  aria-hidden
                                />
                              ))}
                            </span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                </section>
              ) : null}
              {/* calendar grid (month) / week strip (day: this-week mini strip) */}
              {view !== "day" && view !== "agenda" ? (
                <section className="panel animate-fade-up p-2.5" aria-label="Calendar grid">
                  <div className="grid grid-cols-7 pb-1">
                    {WEEKDAYS.map((_, i) => WEEKDAYS[(i + weekStart) % 7]).map((d, i) => (
                      <span
                        key={i}
                        className="text-center text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {days.map((date, i) => {
                      if (!date) return <span key={`e${i}`} />;
                      const dayNum = Number(date.slice(8));
                      const isToday = date === today;
                      const isSelected = date === selected;
                      const evs = dayEvents(date);
                      const tks = dayTasks(date);
                      const dots = [
                        ...new Set(evs.map((e) => subColour(e.calendar))),
                        tks.length ? "task" : null,
                      ].filter(Boolean) as string[];

                      return (
                        <button
                          key={date}
                          type="button"
                          onClick={() => setSelected(date)}
                          onDoubleClick={() => {
                            setEditorFor("new");
                            setEditorDate(date);
                          }}
                          aria-pressed={isSelected}
                          aria-label={longDate(date)}
                          className="tap flex flex-col items-center gap-0.5 rounded-[12px] py-1 transition-colors hover:bg-surface-2/70"
                        >
                          <span
                            className={cn(
                              "num grid size-8 place-items-center rounded-full text-[13px] font-semibold",
                              isSelected
                                ? "gradient-primary text-primary-foreground shadow-[var(--shadow-3d)]"
                                : isToday
                                  ? "text-primary"
                                  : "text-foreground",
                            )}
                          >
                            {dayNum}
                          </span>
                          <span className="flex h-1.5 items-center gap-[3px]">
                            {dots.map((c, j) => (
                              <span
                                key={j}
                                className={cn(
                                  "size-1 rounded-full",
                                  c === "task" ? "bg-accent-amber" : COLOUR_CLASS[c],
                                )}
                                aria-hidden
                              />
                            ))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </div>

            {/* agenda / day plan / master agenda view */}
            {view === "agenda" ? (
              <section className="min-w-0" aria-label="Master agenda — all tasks and events grouped">
                {loading ? (
                  <div className="panel px-3 py-4 text-[13px] text-muted-foreground">Loading…</div>
                ) : (
                  <AgendaGroupsView
                    events={liveEvents.map((e) => ({
                      id: e.id,
                      title: e.title,
                      date: e.date,
                      start: e.start,
                      allDay: e.allDay,
                      calendar: e.calendar,
                      colour: e.colour,
                    }))}
                  />
                )}
              </section>
            ) : (
            <section className="min-w-0" aria-label="Agenda for selected day">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[16px] font-bold tracking-tight">
                  {selected === today ? "Today" : longDate(selected)}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditorFor("new");
                    setEditorDate(selected);
                  }}
                  className="tap text-[12.5px] font-semibold text-primary hover:underline"
                >
                  + Add to this day
                </button>
              </div>
              {loading ? (
                <div className="panel px-3 py-4 text-[13px] text-muted-foreground">
                  Loading calendar…
                </div>
              ) : agenda.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays className="size-5" aria-hidden />}
                  title="Nothing planned"
                  description="This day is completely free."
                />
              ) : (
                <AgendaList
                  agenda={agenda}
                  onSelectEvent={(id) => setSelectedEventId(id)}
                  onSelectTask={(id) => setSelectedTaskIdState(id)}
                  onEditEvent={(ev) => setEditorFor(ev)}
                  onDeleteEvent={(id) => void deleteEvent(id)}
                />
              )}
              {/* quick-capture input for the selected day (Today-style) */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!quickTask.trim()) return;
                  addTask(quickTask.trim(), undefined, selected);
                  setQuickTask("");
                  showToast("Task added to " + longDate(selected));
                  captureRef.current?.focus();
                }}
                className={cn(
                  "mt-2 flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2.5 shadow-[var(--shadow-panel)] focus-within:border-primary/40",
                  !captureOpen && "hidden",
                )}
              >
                <Plus className="size-[17px] text-primary" strokeWidth={2.4} aria-hidden />
                <input
                  ref={captureRef}
                  value={quickTask}
                  onChange={(e) => setQuickTask(e.target.value)}
                  placeholder={"Add to " + longDate(selected) + "…"}
                  aria-label={"Add a task for " + longDate(selected)}
                  className="w-full bg-transparent text-[14px] font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground"
                />
              </form>
            </section>
            )}
          </div>

          <div className="h-10" />
        </div>
      </div>

      {toastMsg ? (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium shadow-raised">
          {toastMsg}
        </div>
      ) : null}

      {editorFor ? (
        <EventEditor
          event={editorFor === "new" ? null : editorFor}
          initialDate={editorFor === "new" ? editorDate : (editorFor as LiveEvent).date}
          onClose={() => setEditorFor(null)}
          onSave={async (ev) => {
            const ok = await saveEvent(ev);
            if (ok) setEditorFor(null);
          }}
        />
      ) : null}

      {selectedTask || selectedEvent ? (
        <>
          <div className="hidden w-[350px] shrink-0 border-l border-border xl:block">
            <div className="sticky top-0 h-screen">
              {selectedTask ? (
                <TaskDetail task={selectedTask} onClose={() => setSelectedTaskIdState(null)} />
              ) : selectedEvent ? (
                <EventDetail
                  event={selectedEvent as unknown as DatedEvent}
                  onClose={() => setSelectedEventId(null)}
                  onDelete={
                    selectedEvent.readOnly ? undefined : () => void deleteEvent(selectedEvent.id)
                  }
                  onEdit={
                    selectedEvent.readOnly
                      ? undefined
                      : () => {
                          setEditorFor(selectedEvent);
                          setSelectedEventId(null);
                        }
                  }
                />
              ) : null}
            </div>
          </div>
          <div className="fixed inset-0 z-40 xl:hidden">
            <button
              type="button"
              aria-label="Close details"
              onClick={() => setSelectedEventId(null)}
              className="absolute inset-0 bg-foreground/20"
            />
            <div className="absolute inset-x-0 bottom-0 top-16 overflow-hidden rounded-t-2xl border-t border-border bg-surface shadow-raised">
              {selectedTask ? (
                <TaskDetail task={selectedTask} onClose={() => setSelectedTaskIdState(null)} />
              ) : selectedEvent ? (
                <EventDetail
                  event={selectedEvent as unknown as DatedEvent}
                  onClose={() => setSelectedEventId(null)}
                  onDelete={
                    selectedEvent.readOnly ? undefined : () => void deleteEvent(selectedEvent.id)
                  }
                  onEdit={
                    selectedEvent.readOnly
                      ? undefined
                      : () => {
                          setEditorFor(selectedEvent);
                          setSelectedEventId(null);
                        }
                  }
                />
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
