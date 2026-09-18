/**
 * Journal — the daily work log.
 *
 * Layout mirrors the Agenda (calendar-screen) month view: header with
 * month + nav, left pane (mini calendar + AI day-journal card + monthly
 * stats), right pane (selected day's entries + [+ Add to this day]).
 *
 * Two data sources:
 * - AI Summary: one cached paragraph-set per day (timesheet_summaries),
 *   regenerated explicitly (Regenerate button / force).
 * - Manual entries: user-added rows (timesheet_entries), full CRUD with
 *   confirmation on delete.
 */
import { ChevronLeft, ChevronRight, Clock, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import {
  deleteTimesheetFn,
  loadTimesheet,
  saveTimesheetFn,
  type TimesheetEntry,
} from "@/lib/auth-data";
import { istToday, longDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { EmptyState } from "@/components/primitives";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export const TIMESHEET_TYPES = [
  "Case Study",
  "White Paper",
  "Approach Note",
  "Presentation",
  "Video Production",
  "Web Development",
  "App Development",
  "UI/UX Design",
  "Admin Tasks",
  "Other",
] as const;

export const TIMESHEET_AREAS = ["NStarX", "Syneroid", "Kamkazi", "Personal"] as const;

const AREA_DOT: Record<string, string> = {
  NStarX: "bg-accent-violet",
  Syneroid: "bg-accent-blue",
  Kamkazi: "bg-accent-green",
  Personal: "bg-accent-amber",
};

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

interface SummaryState {
  text: string;
  ai: boolean;
  cached: boolean;
  loading: boolean;
}

export function JournalScreen() {
  const today = istToday();
  const todayParts = today.split("-").map(Number) as [number, number, number];
  const [cursor, setCursor] = useState({ year: todayParts[0], month: todayParts[1] - 1 });
  const [selected, setSelected] = useState(today);
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsBy, setStatsBy] = useState<"type" | "area">("type");
  const [areaFilter, setAreaFilter] = useState<string>("");

  // entry editor modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TimesheetEntry | null>(null);
  const [form, setForm] = useState({ title: "", type: "Case Study", area: "NStarX", hours: "", note: "" });
  const [saving, setSaving] = useState(false);

  // delete confirm
  const [deleteFor, setDeleteFor] = useState<TimesheetEntry | null>(null);

  // AI summary
  const [summary, setSummary] = useState<SummaryState>({ text: "", ai: true, cached: false, loading: false });
  const [summaryTick, setSummaryTick] = useState(0);

  const load = useMemo(
    () =>
      async () => {
        try {
          const res = await loadTimesheet();
          setEntries(res.entries);
        } finally {
          setLoading(false);
        }
      },
    [],
  );
  useState(() => {
    void load();
  });

  // (Re)fetch the AI summary whenever the selected day changes or a regen is asked.
  const summaryEligible = selected < today; // retrospective only: yesterday and before
  useMemo(() => {
    if (!summaryEligible) {
      setSummary({ text: "", ai: false, cached: false, loading: false });
      return;
    }
    let dead = false;
    setSummary((s) => ({ ...s, loading: true }));
    (async () => {
      try {
        const res = await fetch("/api/timesheet-summary", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ date: selected }),
        });
        const data = (await res.json()) as { text?: string; ai?: boolean; cached?: boolean };
        if (!dead) setSummary({ text: data.text ?? "", ai: data.ai ?? true, cached: !!data.cached, loading: false });
      } catch {
        if (!dead) setSummary({ text: "", ai: false, cached: false, loading: false });
      }
    })();
    return () => {
      dead = true;
    };
  }, [selected, summaryTick, summaryEligible]);

  const regenerate = async () => {
    if (!summaryEligible) return;
    setSummary((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/timesheet-summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: selected, force: true }),
      });
      const data = (await res.json()) as { text?: string; ai?: boolean };
      setSummary({ text: data.text ?? "", ai: data.ai ?? true, cached: false, loading: false });
    } catch {
      setSummary((s) => ({ ...s, loading: false }));
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", type: "Case Study", area: "NStarX", hours: "", note: "" });
    setEditorOpen(true);
  };
  const openEdit = (e: TimesheetEntry) => {
    setEditing(e);
    setForm({ title: e.title, type: e.type, area: e.area, hours: e.hours ?? "", note: e.note ?? "" });
    setEditorOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const id = editing?.id ?? `tse_${crypto.randomUUID().slice(0, 12)}`;
    try {
      await saveTimesheetFn({
        data: {
          entry: {
            id,
            date: selected,
            title: form.title.trim(),
            type: form.type,
            area: form.area,
            hours: form.hours.trim(),
            note: form.note.trim(),
          },
        },
      });
      setEditorOpen(false);
      await load();
      // day content changed → refresh summary signal (does not force AI)
      setSummaryTick((t) => t + 1);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteFor) return;
    await deleteTimesheetFn({ data: { id: deleteFor.id } });
    setDeleteFor(null);
    await load();
  };

  // ---- month helpers ----
  const shift = (dir: number) => {
    setCursor((c) => {
      const m = c.year * 12 + c.month + dir;
      return { year: Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  };
  const firstDow = new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<string | null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => iso(cursor.year, cursor.month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}`;
  const filteredEntries = areaFilter ? entries.filter((e) => e.area === areaFilter) : entries;
  const monthEntries = filteredEntries.filter((e) => e.date.startsWith(monthPrefix));
  const byKey = useMemo(() => {
    const m = new Map<string, { count: number; hours: number }>();
    for (const e of monthEntries) {
      const k = statsBy === "type" ? e.type : e.area;
      const cur = m.get(k) ?? { count: 0, hours: 0 };
      cur.count += 1;
      cur.hours += Number(e.hours) || 0;
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [monthEntries, statsBy]);
  const entryDates = new Set(filteredEntries.map((e) => e.date));
  const dayEntries = filteredEntries.filter((e) => e.date === selected);
  const hoursOf = (list: TimesheetEntry[]) =>
    list.reduce((a, e) => a + (Number(e.hours) || 0), 0);

  return (
    <div className="flex min-h-screen">
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1100px] px-4 py-7 pt-[calc(env(safe-area-inset-top)+28px)] md:px-8 md:py-10">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-[24px] font-extrabold leading-tight tracking-tight md:text-[30px]">
                {MONTHS[cursor.month]}{" "}
                <span className="num text-muted-foreground">{cursor.year}</span>
              </h1>
              <p className="mt-1 truncate text-[13px] font-medium text-muted-foreground">
                Journal — daily log of work
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                  aria-label="Previous month"
                  onClick={() => shift(-1)}
                  className="tap grid size-8 place-items-center rounded-full hover:bg-surface-2"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => shift(1)}
                  className="tap grid size-8 place-items-center rounded-full hover:bg-surface-2"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                aria-label="Refresh journal"
                title="Refresh"
                className="tap grid size-9 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-[var(--shadow-panel)] transition-colors hover:text-foreground"
              >
                <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
              </button>
            </div>
          </div>

          {/* Area filter chips (like email account filters) */}
          <div className="flex flex-wrap items-center gap-2 pb-5 pt-1">
            <button
              type="button"
              onClick={() => setAreaFilter("")}
              aria-pressed={areaFilter === ""}
              className={cn(
                "tap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                areaFilter === ""
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              All
            </button>
            {TIMESHEET_AREAS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAreaFilter(areaFilter === a ? "" : a)}
                aria-pressed={areaFilter === a}
                className={cn(
                  "tap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                  areaFilter === a
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn("mr-1.5 inline-block size-2 rounded-full align-middle", AREA_DOT[a] ?? "bg-accent-rose")} aria-hidden />
                {a}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-8">
            {/* Left pane */}
            <div className="flex flex-col gap-4">
              {/* Mini calendar */}
              <section className="panel animate-fade-up p-2.5" aria-label="Month calendar">
                <div className="grid grid-cols-7 pb-1">
                  {WEEKDAYS.map((d, i) => (
                    <span
                      key={i}
                      className="text-center text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                    >
                      {d}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {cells.map((date, i) => {
                    if (!date) return <span key={`e${i}`} />;
                    const dayNum = Number(date.slice(8));
                    const isToday = date === today;
                    const isSelected = date === selected;
                    const has = entryDates.has(date);
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => setSelected(date)}
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
                        <span className="flex h-1.5 items-center">
                          {has ? <span className="size-1 rounded-full bg-accent-green" aria-hidden /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* AI day journal — retrospective only (yesterday and before) */}
            {summaryEligible ? (
              <section className="panel animate-fade-up p-4" aria-label="AI day summary">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[13.5px] font-bold tracking-tight">AI Day Log</h2>
                  <button
                    type="button"
                    onClick={() => void regenerate()}
                    disabled={summary.loading}
                    className="tap text-[12px] font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    {summary.loading ? "…" : "Regenerate"}
                  </button>
                </div>
                {summary.text ? (
                  <div className="text-[13px] leading-relaxed text-foreground/90">
                    <Markdown source={summary.text} />
                  </div>
                ) : summary.loading ? (
                  <p className="text-[13px] text-muted-foreground">Writing the journal…</p>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    No summary for this day yet — tap Regenerate.
                  </p>
                )}
                {!summary.loading && summary.text ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {summary.ai ? "AI-generated" : "Offline snapshot"} · could be imperfect
                  </p>
                ) : null}
              </section>
            ) : null}

              {/* Monthly stats */}
              <section className="panel animate-fade-up p-4" aria-label="Monthly stats">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[13.5px] font-bold tracking-tight">This Month</h2>
                  <div className="flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5">
                    {(["type", "area"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setStatsBy(k)}
                        aria-pressed={statsBy === k}
                        className={cn(
                          "tap rounded-full px-2.5 py-1 text-[11.5px] font-semibold capitalize transition-colors",
                          statsBy === k ? "gradient-primary text-primary-foreground" : "hover:bg-surface-2",
                        )}
                      >
                        {statsBy === k ? (k === "type" ? "By Type" : "By Area") : k === "type" ? "Type" : "Area"}
                      </button>
                    ))}
                  </div>
                </div>
                {byKey.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No entries logged this month.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {byKey.map(([k, v]) => (
                      <li key={k} className="flex items-center gap-2 text-[13px]">
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            statsBy === "area" ? AREA_DOT[k] ?? "bg-accent-rose" : "bg-accent-violet",
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{k}</span>
                        <span className="num text-muted-foreground">
                          {v.count}
                          {v.hours > 0 ? ` · ${v.hours % 1 === 0 ? v.hours : v.hours.toFixed(1)}h` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {/* Right pane: selected day */}
            <section className="min-w-0" aria-label="Journal entries for selected day">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[16px] font-bold tracking-tight">
                  {selected === today ? "Today" : longDate(selected)}
                  {dayEntries.length > 0 && hoursOf(dayEntries) > 0 ? (
                    <span className="num ml-2 text-[12.5px] font-semibold text-muted-foreground">
                      {hoursOf(dayEntries) % 1 === 0 ? hoursOf(dayEntries) : hoursOf(dayEntries).toFixed(1)}h logged
                    </span>
                  ) : null}
                </h2>
                <button
                  type="button"
                  onClick={openNew}
                  className="tap text-[12.5px] font-semibold text-primary hover:underline"
                >
                  + Add to this day
                </button>
              </div>

              {loading ? (
                <div className="panel px-3 py-4 text-[13px] text-muted-foreground">Loading entries…</div>
              ) : dayEntries.length === 0 ? (
                <EmptyState
                  icon={<Plus className="size-5" aria-hidden />}
                  title="No entries"
                  description="Nothing logged for this day yet."
                />
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {dayEntries.map((e) => (
                    <li
                      key={e.id}
                      className="panel animate-fade-up flex items-start gap-3 p-3.5"
                    >
                      <span
                        className={cn("mt-1.5 size-2 shrink-0 rounded-full", AREA_DOT[e.area] ?? "bg-accent-rose")}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[14px] font-semibold leading-snug">{e.title}</span>
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                            {e.type}
                          </span>
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                            {e.area}
                          </span>
                          {e.hours ? (
                            <span className="num flex items-center gap-0.5 text-[11.5px] font-semibold text-accent-teal">
                              <Clock className="size-3" aria-hidden /> {e.hours}h
                            </span>
                          ) : null}
                        </div>
                        {e.note ? (
                          <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted-foreground">
                            {e.note}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(e)}
                          aria-label={`Edit ${e.title}`}
                          className="tap grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                        >
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteFor(e)}
                          aria-label={`Delete ${e.title}`}
                          className="tap grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-destructive"
                        >
                          <Pencil className="hidden" aria-hidden />
                          <Plus className="hidden" aria-hidden />
                          <span className="sr-only">Delete</span>
                          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* Entry editor modal (compact, single-modal pattern) */}
      {editorOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close editor"
            onClick={() => setEditorOpen(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
          />
          <div className="animate-fade-up relative w-full max-w-[520px] rounded-t-xl border border-border bg-card p-4 shadow-[var(--shadow-3d)] sm:mx-4 sm:rounded-xl sm:p-5">
            <h3 className="mb-3 text-[15.5px] font-bold tracking-tight">
              {editing ? "Edit entry" : "New timesheet entry"}
            </h3>
            <div className="flex flex-col gap-3">
              <input
                autoFocus
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="What did you work on?"
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-primary/40"
              />
              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted-foreground">
                  Type
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-[13.5px] font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {TIMESHEET_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted-foreground">
                  Area
                  <select
                    value={form.area}
                    onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-[13.5px] font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {TIMESHEET_AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted-foreground">
                Hours (optional)
                <input
                  value={form.hours}
                  onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                  inputMode="decimal"
                  placeholder="e.g. 2.5"
                  className="num w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Note (optional)"
                rows={3}
                className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="tap rounded-full border border-border px-4 py-2 text-[13px] font-semibold hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!form.title.trim() || saving}
                className="tap gradient-primary rounded-full px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-[var(--shadow-3d)] disabled:opacity-50"
              >
                {saving ? "Saving…" : editing ? "Save" : "Add entry"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={!!deleteFor}
        title="Delete this timesheet entry?"
        description={deleteFor ? `“${deleteFor.title}” will be permanently removed.` : ""}
        onCancel={() => setDeleteFor(null)}
        onConfirm={() => {
          void remove();
        }}
      />
    </div>
  );
}