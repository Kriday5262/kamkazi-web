import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  Clock,
  Cloud,
  MessageSquarePlus,
  Plus,
  RotateCw,
  Sparkles,
  StickyNote,
  Sun,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { loadAll } from "@/lib/auth-data";
import { TODAY, dayOffset, userName, weather as fallbackWeather, type Task } from "@/data/seed";
import { fetchWeather } from "@/lib/ai-client";
import { formatTime, greeting, longDate, relativeDate, isOverdueNow, isTimePast } from "@/lib/format";
import { TaskCheckbox } from "@/components/primitives";
import { TaskDetail } from "@/components/task-detail";
import { EventDetail } from "@/components/event-detail";
import { cn } from "@/lib/utils";
import { AiSummary } from "@/components/ai-summary";
import { AgendaList, buildAgenda, type AgendaLiveEvent } from "@/components/agenda-list";
import { EventEditor } from "@/components/event-editor";
import type { DatedEvent } from "@/data/seed";
import type { LiveEvent } from "@/components/calendar-screen";
import heroMorning from "@/assets/hero-morning.webp";
import heroAfternoon from "@/assets/hero-afternoon.webp";
import heroEvening from "@/assets/hero-evening.webp";
import heroNight from "@/assets/hero-night.webp";

const HEROES = {
  morning: { src: heroMorning, alt: "Calm morning scene" },
  afternoon: { src: heroAfternoon, alt: "Bright afternoon scene" },
  evening: { src: heroEvening, alt: "Warm evening scene" },
  night: { src: heroNight, alt: "Quiet night scene" },
} as const;

function timeOfDay(hour: number): keyof typeof HEROES {
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

const SYNC_INTERVAL_MIN = 15;

export function TodayScreen() {
  const { tasks, events, setPaletteOpen, addTask, addNote, addConversation, settings, chatDocked } = useStore();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  const [mounted, setMounted] = useState(false);
  const [today, setToday] = useState(TODAY);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [quickTask, setQuickTask] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [liveWeather, setLiveWeather] = useState<typeof fallbackWeather | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const captureRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    setToday(dayOffset(0));
    setLastSynced(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Live Open-Meteo weather for the header chip.
  useEffect(() => {
    let cancelled = false;
    fetchWeather()
      .then((w) => {
        if (!cancelled) setLiveWeather(w);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Live calendar events (Google + ICS) — same shape the Calendar screen uses.
  const refreshCalendar = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar");
      if (!res.ok) return;
      const data = (await res.json()) as { events?: LiveEvent[] };
      setLiveEvents(data.events ?? []);
    } catch {
      // keep prior data
    }
  }, []);

  useEffect(() => {
    void refreshCalendar();
  }, [refreshCalendar]);

  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      // (a) refresh all connected calendars (Google + ICS subscriptions)
      await fetch("/api/calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      }).catch(() => undefined);
      // (b) reload tasks/events/notes from the DB
      await refreshCalendar();
      await loadAll()
        .then((data) => {
          const d = data as { tasks?: Task[] };
          if (d.tasks) window.dispatchEvent(new CustomEvent("kamkazi:reload-data"));
        })
        .catch(() => undefined);
      // Weather chip
      fetchWeather()
        .then((w) => setLiveWeather(w))
        .catch(() => undefined);
    } finally {
      setNow(new Date());
      setToday(dayOffset(0));
      setLastSynced(new Date());
      setSyncing(false);
    }
  }, [refreshCalendar]);

  // Automatic sync every 15 minutes while the app is open.
  useEffect(() => {
    const t = setInterval(refresh, SYNC_INTERVAL_MIN * 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const syncedLabel = useMemo(() => {
    if (!lastSynced) return "";
    const mins = Math.max(0, Math.round((now.getTime() - lastSynced.getTime()) / 60_000));
    if (mins < 1) return "Updated just now";
    if (mins === 1) return "Updated 1 min ago";
    return `Updated ${mins} mins ago`;
  }, [lastSynced, now]);

  const nowMin = mounted ? now.getHours() * 60 + now.getMinutes() : -1;

  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  // Agenda: live events merged over the store's local events for TODAY.
  const todaysTasks = useMemo(
    () => tasks.filter((t) => t.dueDate === TODAY || (t.dueDate && t.dueDate < TODAY)),
    [tasks],
  );
  const todaysStoreEvents = useMemo(() => events[TODAY] ?? [], [events]);
  const agenda = useMemo(() => {
    const byId = new Map<string, AgendaLiveEvent>();
    for (const e of liveEvents) if (e.date === today) byId.set(e.id, e);
    for (const e of todaysStoreEvents)
      if (!byId.has(e.id))
        byId.set(e.id, {
          id: e.id,
          title: e.title,
          date: TODAY,
          start: e.start,
          durationMin: e.durationMin,
          allDay: e.allDay,
          location: e.location,
          calendar: e.calendar,
          readOnly: false,
        });
    return buildAgenda([...byId.values()], todaysTasks, today);
  }, [liveEvents, todaysStoreEvents, todaysTasks, today]);

  const rawAgendaEvent =
    agenda.find((i) => i.event && i.event.id === selectedEventId)?.event ?? null;
  const selectedEvent = rawAgendaEvent
    ? ({ ...rawAgendaEvent, date: today } as unknown as DatedEvent)
    : null;

  const overdue = todaysTasks.filter((t) => !t.done && t.dueDate && t.dueDate < TODAY);

  const hero = HEROES[mounted ? timeOfDay(now.getHours()) : "morning"];

  const currentWeather = liveWeather ?? fallbackWeather;

  const nextUp = mounted ? agenda.find((e) => e.min > nowMin) : undefined;

  return (
    <div className="flex min-h-screen">
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[760px] px-4 py-7 pt-[calc(env(safe-area-inset-top)+28px)] md:px-8 md:py-10">
          {/* header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-tight md:text-[36px]">
                <span suppressHydrationWarning>{greeting(now.getHours())}</span>, {userName}
              </h1>
              <p className="mt-1.5 text-[14.5px] font-medium text-muted-foreground">
                <span suppressHydrationWarning>{longDate(today)}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-muted-foreground shadow-[var(--shadow-panel)]">
              {currentWeather.condition.toLowerCase().includes("cloud") ? (
                <Cloud className="size-[18px] text-accent-teal" aria-hidden />
              ) : (
                <Sun className="size-[18px] text-accent-amber" aria-hidden />
              )}
              <span className="num text-[15px] font-bold text-foreground">
                {currentWeather.temp}°
              </span>
              <span className="text-[13px] font-medium">{currentWeather.condition}</span>
              <span className="num text-[13px]">
                H {currentWeather.high}° · L {currentWeather.low}°
              </span>
            </div>
          </div>

          {/* Next pill — what's coming up next today */}
          <div className="mt-3">
            <div
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-muted-foreground shadow-[var(--shadow-panel)]"
              suppressHydrationWarning
            >
              <Clock className="size-[18px] text-accent-blue" aria-hidden />
              <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                {nextUp
                  ? `Next: ${nextUp.event?.title ?? nextUp.task?.title} · ${
                      nextUp.event?.allDay || !nextUp.event?.start
                        ? "All day"
                        : formatTime(nextUp.event?.start ?? nextUp.task?.dueTime)
                    }`
                  : "Next: Nothing else today ✨"}
              </span>
            </div>
          </div>

          {/* pastel hero illustration */}
          <section className="animate-fade-up mt-6 overflow-hidden rounded-[var(--radius-xl)] border border-border shadow-[var(--shadow-panel)]">
            <img
              key={hero.src}
              src={hero.src}
              alt={hero.alt}
              width={1536}
              height={768}
              className="animate-fade-up h-[150px] w-full object-cover md:h-[210px]"
            />
          </section>

          {/* AI summary (cached server-side ~15 min; refresh button busts it) */}
          {settings.dailyBriefing ? (
            <AiSummary
              tasks={todaysTasks.map((t) => ({
                id: t.id,
                title: t.title,
                done: t.done,
                dueDate: t.dueDate,
                dueTime: t.dueTime,
                priority: t.priority,
              }))}
              events={agenda
                .filter((i) => i.event)
                .map((i) => ({
                  id: i.event!.id,
                  title: i.event!.title,
                  date: i.event!.date,
                  start: i.event!.start,
                  allDay: i.event!.allDay,
                  calendar: i.event!.calendar,
                }))}
              emails={[]}
            />
          ) : null}

          {/* Agenda — chronological events + tasks for today */}
          <section className="mt-7" aria-label="Today's agenda">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[16px] font-bold tracking-tight">
                <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
                Today
              </h2>
              <button
                type="button"
                onClick={() => {
                  // Open (and focus) the quick-capture input to add a task due today.
                  setCaptureOpen(true);
                  window.setTimeout(() => captureRef.current?.focus(), 50);
                }}
                className="tap text-[12.5px] font-semibold text-primary hover:underline"
              >
                + Add to this day
              </button>
            </div>
            <AgendaList
              agenda={agenda}
              overdue={tasks.filter((t) => !t.done && t.dueDate && t.dueDate < TODAY)}
              timePastIds={new Set(tasks.filter((t) => !t.done && isTimePast(t.dueDate, t.dueTime)).map((t) => t.id))}
              showNowLine
              onSelectEvent={(id) => {
                setSelectedId(null);
                setSelectedEventId(id);
              }}
              onSelectTask={(id) => setSelectedId(id)}
              emptyTitle="Nothing planned"
              emptyDescription="This day is completely free."
            />
            {/* quick-capture input for this day */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!quickTask.trim()) return;
                addTask(quickTask.trim(), undefined, TODAY);
                setQuickTask("");
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
                placeholder="Add to this day…"
                aria-label="Add a task for today"
                className="w-full bg-transparent text-[14px] font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground"
              />
            </form>
          </section>

          {/* quick capture */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link
              to="/tasks"
              className="flex min-w-[150px] flex-1 items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-[13.5px] font-semibold shadow-[var(--shadow-panel)] sm:hidden"
            >
              All tasks <ArrowRight className="size-3.5" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => {
                const id = addNote(settings.defaultNotebookId);
                void navigate({ to: "/notes/$noteId", params: { noteId: id } });
              }}
              className="tap hidden items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2.5 text-[13px] font-semibold shadow-[var(--shadow-panel)] sm:flex"
            >
              <StickyNote className="size-4 text-accent-amber" aria-hidden />
              New note
            </button>
            <button
              type="button"
              onClick={() => {
                const id = addConversation();
                void navigate({ to: "/chat/$chatId", params: { chatId: id } });
              }}
              className="tap hidden items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2.5 text-[13px] font-semibold shadow-[var(--shadow-panel)] sm:flex"
            >
              <Sparkles className="size-4 text-accent-violet" aria-hidden />
              Ask AI
            </button>
            <span className="ml-auto flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
              <span suppressHydrationWarning>{syncing ? "Refreshing…" : syncedLabel}</span>
              <button
                type="button"
                onClick={() => void refresh()}
                aria-label="Refresh calendars and tasks"
                className="tap grid size-7 place-items-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-surface-2"
              >
                <RotateCw className={cn("size-3.5", syncing && "animate-spin")} aria-hidden />
              </button>
            </span>
          </div>

          {/* overdue */}
          {overdue.length ? (
            <section className="mt-7" aria-label="Overdue">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-destructive">
                Overdue · {overdue.length}
              </p>
              <div className="space-y-0.5">
                {overdue.map((t) => (
                  <AgendaTask key={t.id} task={t} onSelect={() => setSelectedId(t.id)} overdue />
                ))}
              </div>
            </section>
          ) : null}

          <div className="h-10" />
        </div>
      </div>

      {/* detail panel — right sidebar, or centered compact modal when chat is docked */}
      {selected || selectedEvent ? (
        <>
          {!chatDocked ? (
            <div className="hidden w-[350px] shrink-0 border-l border-border xl:block">
              <div className="sticky top-0 h-screen">
                {selected ? (
                  <TaskDetail task={selected} onClose={() => setSelectedId(null)} />
                ) : selectedEvent ? (
                  <EventDetail event={selectedEvent} onClose={() => setSelectedEventId(null)} />
                ) : null}
              </div>
            </div>
          ) : null}
          <div className={chatDocked ? "fixed inset-0 z-40" : "fixed inset-0 z-40 xl:hidden"}>
            {chatDocked ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                <button
                  type="button"
                  aria-label="Close details"
                  onClick={() => {
                    setSelectedId(null);
                    setSelectedEventId(null);
                  }}
                  className="absolute inset-0 bg-foreground/25"
                />
                <div className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-raised">
                  {selected ? (
                    <TaskDetail task={selected} onClose={() => setSelectedId(null)} />
                  ) : selectedEvent ? (
                    <EventDetail event={selectedEvent} onClose={() => setSelectedEventId(null)} />
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  aria-label="Close details"
                  onClick={() => {
                    setSelectedId(null);
                    setSelectedEventId(null);
                  }}
                  className="absolute inset-0 bg-foreground/20"
                />
                <div className="absolute inset-x-0 bottom-0 top-16 animate-in slide-in-from-bottom-6 overflow-hidden rounded-t-2xl border-t border-border bg-surface shadow-raised duration-200">
                  {selected ? (
                    <TaskDetail task={selected} onClose={() => setSelectedId(null)} />
                  ) : selectedEvent ? (
                    <EventDetail event={selectedEvent} onClose={() => setSelectedEventId(null)} />
                  ) : null}
                </div>
              </>
            )}
          </div>
        </>
      ) : null}

      {/* event editor for [+ Add to this day] */}
      {editorOpen ? (
        <EventEditor
          event={null}
          initialDate={today}
          onClose={() => setEditorOpen(false)}
          onSave={async () => {
            setEditorOpen(false);
            await refreshCalendar();
          }}
        />
      ) : null}

      {/* mobile quick capture */}
      <div className="fixed bottom-[calc(70px+env(safe-area-inset-bottom))] right-4 z-30 md:hidden">
        {capturing ? (
          <div className="mb-2 flex flex-col items-end gap-2">
            <CaptureAction
              label="New note"
              icon={<StickyNote className="size-4" aria-hidden />}
              onClick={() => {
                const id = addNote(settings.defaultNotebookId);
                setCapturing(false);
                void navigate({ to: "/notes/$noteId", params: { noteId: id } });
              }}
            />
            <CaptureAction
              label="Ask AI"
              icon={<Sparkles className="size-4 text-accent-violet" aria-hidden />}
              onClick={() => {
                const id = addConversation();
                setCapturing(false);
                void navigate({ to: "/chat/$chatId", params: { chatId: id } });
              }}
            />
            <CaptureAction
              label="Search"
              icon={<MessageSquarePlus className="size-4" aria-hidden />}
              onClick={() => {
                setCapturing(false);
                setPaletteOpen(true);
              }}
            />
          </div>
        ) : null}
        <button
          type="button"
          aria-label={capturing ? "Close quick capture" : "Quick capture"}
          aria-expanded={capturing}
          onClick={() => setCapturing((v) => !v)}
          className="grid size-12 place-items-center rounded-full bg-gradient-to-br from-accent-violet to-primary text-primary-foreground shadow-raised transition-transform active:scale-95"
        >
          {capturing ? (
            <X className="size-5" aria-hidden />
          ) : (
            <Plus className="size-5" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

function CaptureAction({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-[13px] shadow-panel"
    >
      {icon}
      {label}
    </button>
  );
}

function AgendaTask({
  task,
  onSelect,
  overdue,
}: {
  task: Task;
  onSelect: () => void;
  overdue?: boolean;
}) {
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
      <span
        className={cn(
          "tnum w-[60px] shrink-0 pt-0.5 text-right text-[12.5px]",
          overdue ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {overdue ? relativeDate(task.dueDate) : ""}
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
          Task{task.dueTime ? ` · Due ${formatTime(task.dueTime)}` : ""}
          {task.priority === "high" ? " · High priority" : ""}
        </span>
      </span>
    </div>
  );
}
