import { Link, useNavigate } from "@tanstack/react-router";
import { CheckSquare, MoreHorizontal, NotebookPen, Pin, Plus, Search, Square, StickyNote, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { Note } from "@/data/seed";
import { plainPreview } from "@/components/markdown";
import { relativeDate, relativeStamp } from "@/lib/format";
import { deleteNotesFn } from "@/lib/auth-data";
import { EmptyState, SectionLabel } from "@/components/primitives";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { PageHeader } from "@/components/app-shell";
import { ManageEntityDialog } from "@/components/manage-entity-dialog";
import { listIcon } from "@/components/list-icons";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function NotesScreen({ activeNoteId }: { activeNoteId?: string | undefined }) {
  const { notes, notebooks, addNote, deleteNote, settings, addNotebook, updateNotebook, deleteNotebook } =
    useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  // Multi-select for bulk delete (same pattern as Tasks).
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [notebook, setNotebook] = useState<string | "all">("all");
  type NotesSort = "created" | "edited" | "title";
  const NOTES_SORT_KEY = "kamkazi-notes-sort";
  const [sort, setSort] = useState<NotesSort>("created");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(NOTES_SORT_KEY);
      if (saved === "created" || saved === "edited" || saved === "title") setSort(saved);
    } catch {
      // ignore
    }
  }, []);
  const applySort = (v: NotesSort) => {
    setSort(v);
    try {
      window.localStorage.setItem(NOTES_SORT_KEY, v);
    } catch {
      // ignore
    }
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [creatingNb, setCreatingNb] = useState(false);
  const [newNbName, setNewNbName] = useState("");

  const editingNotebook = notebooks.find((n) => n.id === editingId) ?? null;
  const editingCount = editingId ? notes.filter((n) => n.notebookId === editingId).length : 0;

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return notes
      .filter((n) => (notebook === "all" ? true : n.notebookId === notebook))
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title);
        if (sort === "edited") return b.updatedAt.localeCompare(a.updatedAt);
        return (
          (b.createdAt ?? "").localeCompare(a.createdAt ?? "") ||
          b.updatedAt.localeCompare(a.updatedAt)
        );
      });
  }, [notes, notebook, query, sort]);

  const pinned = filtered.filter((n) => n.pinned);
  const rest = filtered.filter((n) => !n.pinned);

  const createNote = () => {
    const id = addNote(notebook === "all" ? settings.defaultNotebookId : notebook);
    void navigate({ to: "/notes/$noteId", params: { noteId: id } });
  };

  return (
    <div className={cn("flex min-h-screen", activeNoteId && "hidden md:flex")}>
      <div className="hidden w-[190px] shrink-0 flex-col border-r border-border px-3 py-4 lg:flex">
        <SectionLabel>Notebooks</SectionLabel>
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => setNotebook("all")}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13.5px] transition-colors",
              notebook === "all"
                ? "bg-surface-2 font-medium"
                : "text-foreground/80 hover:bg-surface-2/70",
            )}
          >
            <NotebookPen className="size-4 text-muted-foreground" aria-hidden />
            All notes
            <span className="tnum ml-auto text-[12px] text-muted-foreground">{notes.length}</span>
          </button>
          {notebooks.map((nb) => {
            const Icon = listIcon(nb.icon);
            const count = notes.filter((n) => n.notebookId === nb.id).length;
            return (
              <div key={nb.id} className="group relative">
                <button
                  type="button"
                  onClick={() => setNotebook(nb.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13.5px] transition-colors",
                    notebook === nb.id
                      ? "bg-surface-2 font-medium"
                      : "text-foreground/80 hover:bg-surface-2/70",
                  )}
                >
                  <Icon className="size-4 text-accent-green" aria-hidden />
                  {nb.name}
                  {count ? (
                    <span className="tnum ml-auto text-[12px] text-muted-foreground group-hover:hidden">
                      {count}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  aria-label={`Edit notebook ${nb.name}`}
                  onClick={() => {
                    setEditingId(nb.id);
                    setManageOpen(true);
                  }}
                  className="absolute right-1 top-1.5 hidden size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground group-hover:grid"
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </button>
              </div>
            );
          })}
          {creatingNb ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newNbName.trim()) addNotebook(newNbName.trim(), "book-open");
                setNewNbName("");
                setCreatingNb(false);
              }}
              className="px-2.5"
            >
              <input
                autoFocus
                value={newNbName}
                onChange={(e) => setNewNbName(e.target.value)}
                onBlur={() => setCreatingNb(false)}
                placeholder="Notebook name"
                aria-label="New notebook name"
                className="w-full bg-transparent py-1 text-[13.5px] outline-none"
              />
              <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingNb(true)}
              className="mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] text-muted-foreground transition-colors hover:bg-surface-2"
            >
              <Plus className="size-4" aria-hidden />
              New notebook
            </button>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title="Notes"
          subtitle={`${filtered.length} notes`}
          actions={
            <>
              <button
                type="button"
                aria-label={selectMode ? "Cancel selection" : "Select multiple notes"}
                onClick={() => {
                  setSelectMode(!selectMode);
                  setCheckedIds(new Set());
                }}
                className={cn(
                  "grid size-8 place-items-center rounded-lg transition-colors",
                  selectMode
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <CheckSquare className="size-[18px]" aria-hidden />
              </button>
              <button
                type="button"
                onClick={createNote}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Plus className="size-4" aria-hidden />
                New note
              </button>
            </>
          }
        />
        {selectMode ? (
          <div className="flex items-center justify-between gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
            <span className="text-[13px] text-muted-foreground">{checkedIds.size} selected</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCheckedIds(new Set(filtered.map((n) => n.id)))}
                className="text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Select all
              </button>
              <button
                type="button"
                disabled={checkedIds.size === 0}
                onClick={() => setConfirmBulk(true)}
                className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-2.5 py-1 text-[12.5px] font-medium text-destructive transition-opacity disabled:opacity-40"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Delete
              </button>
            </div>
          </div>
        ) : null}
        {/* notebook switcher — iPad & mobile */}
        <div className="flex gap-2 overflow-x-auto border-b border-border px-3 py-2.5 lg:hidden">
          {[{ id: "all", name: "All notes" }, ...notebooks].map((nb) => (
            <button
              key={nb.id}
              type="button"
              onClick={() => setNotebook(nb.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[13px] shadow-[var(--shadow-panel)] transition-colors",
                notebook === nb.id
                  ? "border-transparent bg-accent-green/14 font-medium text-accent-green"
                  : "border-border text-muted-foreground",
              )}
            >
              {nb.name}
            </button>
          ))}
        </div>

        <div className="mx-auto w-full max-w-3xl flex-1 px-3 py-4 md:px-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="panel flex flex-1 items-center gap-2 px-2.5 py-2 focus-within:border-border-strong">
              <Search className="size-4 text-muted-foreground" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes"
                aria-label="Search notes"
                className="w-full bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => applySort(e.target.value as NotesSort)}
              aria-label="Sort notes"
              className="panel rounded-lg px-2 py-2 text-[13px] outline-none"
            >
              <option value="created">Date created</option>
              <option value="edited">Recently edited</option>
              <option value="title">Title</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<StickyNote className="size-5" aria-hidden />}
              title={query ? "No notes match that search" : "No notes yet"}
              description={
                query
                  ? "Try a different word, or clear the search."
                  : "Start a note and it will show up here."
              }
            />
          ) : (
            <div className="panel divide-y divide-border px-2 py-1">
              {pinned.length ? (
                <div className="pb-2">
                  <SectionLabel className="pt-1">Pinned</SectionLabel>
                  <div className="divide-y divide-border">
                    {pinned.map((n) => (
                      <NoteRow key={n.id} id={n.id} active={n.id === activeNoteId} />
                    ))}
                  </div>
                </div>
              ) : null}
              {groupNotesByDay(rest).map(([label, group]) => (
                <div key={label} className="pb-1">
                  <SectionLabel className="pt-1.5">{label}</SectionLabel>
                  <div className="divide-y divide-border">
                    {group.map((n) => (
                      <NoteRow
                        key={n.id}
                        id={n.id}
                        active={n.id === activeNoteId}
                        checkable={selectMode}
                        checked={checkedIds.has(n.id)}
                        onCheck={() =>
                          setCheckedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(n.id)) next.delete(n.id);
                            else next.add(n.id);
                            return next;
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* bulk delete confirmation */}
      <ConfirmDeleteDialog
        open={confirmBulk}
        title={`Delete ${checkedIds.size} note${checkedIds.size === 1 ? "" : "s"}?`}
        description="This permanently deletes the selected notes. This can’t be undone."
        onCancel={() => setConfirmBulk(false)}
        onConfirm={async () => {
          const ids = [...checkedIds];
          setConfirmBulk(false);
          try {
            await deleteNotesFn({ data: { ids } });
            for (const id of ids) deleteNote(id);
            toast.success(`Deleted ${ids.length} note${ids.length === 1 ? "" : "s"}`);
          } catch {
            toast.error("Could not delete the selected notes");
          }
          setSelectMode(false);
          setCheckedIds(new Set());
        }}
      />

      {/* notebook manage dialog — rename / icon / delete */}
      <ManageEntityDialog
        key={editingId ?? "none"}
        target={manageOpen ? editingNotebook : null}
        kind="notebook"
        count={editingCount}
        onClose={() => setManageOpen(false)}
        onSave={(id, name, icon) => updateNotebook(id, name, icon)}
        onDelete={(id) => {
          setEditingId(null);
          if (notebook === id) setNotebook("all");
          deleteNotebook(id);
        }}
      />
    </div>
  );
}

function NoteRow({
  id,
  active,
  checkable,
  checked,
  onCheck,
}: {
  id: string;
  active: boolean;
  checkable?: boolean;
  checked?: boolean;
  onCheck?: () => void;
}) {
  const { notes, notebooks } = useStore();
  const note = notes.find((n) => n.id === id);
  if (!note) return null;
  const nb = notebooks.find((n) => n.id === note.notebookId);
  return (
    <Link
      to="/notes/$noteId"
      params={{ noteId: note.id }}
      onClick={(e) => {
        if (checkable) {
          e.preventDefault();
          onCheck?.();
        }
      }}
      className={cn(
        "block px-2 py-3 transition-colors hover:bg-surface-2/70",
        checked || active ? "bg-surface-2" : undefined,
      )}
    >
      <div className="flex items-baseline gap-2">
        {checkable ? (
          <span className="mt-0.5 grid size-[18px] shrink-0 place-items-center text-primary self-center">
            {checked ? <CheckSquare className="size-[18px]" aria-hidden /> : <Square className="size-[18px] opacity-40" aria-hidden />}
          </span>
        ) : null}
        <p className="min-w-0 flex-1 truncate text-[14.5px] font-medium">
          {note.title || "Untitled note"}
        </p>
        {note.pinned ? (
          <Pin className="size-3.5 shrink-0 text-accent-amber" aria-label="Pinned" />
        ) : null}
        <span className="shrink-0 text-[12px] text-muted-foreground">
          {relativeStamp(note.updatedAt)}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
        {plainPreview(note.body) || "No additional text"}
      </p>
      {nb ? (
        <p className="mt-1 inline-flex rounded-md bg-accent-green/12 px-1.5 py-0.5 text-[11.5px] text-accent-green">
          {nb.name}
        </p>
      ) : null}
    </Link>
  );
}

/** Group notes by their creation day (IST) into labeled sections — newest first.
 *  Works with both full datetime stamps (YYYY-MM-DDTHH:MM:SS) and plain dates. */
function groupNotesByDay(notes: Note[]): [string, Note[]][] {
  const groups = new Map<string, Note[]>();
  for (const n of notes) {
    const day = (n.createdAt ?? "").slice(0, 10) || "Undated";
    const arr = groups.get(day);
    if (arr) arr.push(n);
    else groups.set(day, [n]);
  }
  return [...groups.entries()].map(([day, group]) => [
    day === "Undated" ? day : relativeDate(day),
    group,
  ]);
}
