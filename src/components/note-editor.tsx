import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bold,
  Code,
  Eye,
  Italic,
  List,
  ListChecks,
  Pencil,
  Pin,
  Quote,
  Share2,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { Markdown } from "@/components/markdown";
import { relativeStamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

export function NoteEditor({ noteId }: { noteId: string }) {
  const { notes, notebooks, updateNote, deleteNote, settings } = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();
  const [mode, setMode] = useState<"write" | "read">("read");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const note = notes.find((n) => n.id === noteId);
  // Blank-note cleanup: if this note was brand-new and still has no title and
  // no body when the user navigates back to /notes, remove it instead of
  // leaving an empty "Untitled note" behind. The cleanup must run ONLY when
  // the noteId changes or the editor unmounts — never on every keystroke
  // (re-running on note object changes would delete the note mid-typing).
  const latestNoteRef = useRef(note);
  latestNoteRef.current = note;
  useEffect(() => {
    return () => {
      const n = latestNoteRef.current;
      if (n && !n.title.trim() && !n.body.trim()) deleteNote(n.id);
    };
  }, [noteId, deleteNote]);

  if (!note) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center">
        <div>
          <p className="text-[15px] font-medium">This note no longer exists</p>
          <Link
            to="/notes"
            className="mt-2 inline-block text-sm text-primary underline underline-offset-4"
          >
            Back to notes
          </Link>
        </div>
      </div>
    );
  }

  const nb = notebooks.find((n) => n.id === note.notebookId);

  const wrap = (before: string, after = before) => {
    const el = areaRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const next = `${value.slice(0, s)}${before}${value.slice(s, e) || "text"}${after}${value.slice(e)}`;
    updateNote(note.id, { body: next });
    requestAnimationFrame(() => el.focus());
  };

  const prefix = (mark: string) => {
    const el = areaRef.current;
    if (!el) return;
    const { selectionStart: s, value } = el;
    const lineStart = value.lastIndexOf("\n", Math.max(0, s - 1)) + 1;
    updateNote(note.id, { body: `${value.slice(0, lineStart)}${mark}${value.slice(lineStart)}` });
    requestAnimationFrame(() => el.focus());
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-1.5 border-b border-border bg-background/85 px-3 py-2.5 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur md:px-6">
        <Link
          to="/notes"
          aria-label="Back to notes"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <ArrowLeft className="size-[18px]" aria-hidden />
        </Link>
        <select
          value={note.notebookId}
          onChange={(e) => updateNote(note.id, { notebookId: e.target.value })}
          aria-label="Notebook"
          className="rounded-md bg-transparent px-1 py-1 text-[13px] text-muted-foreground outline-none hover:bg-surface-2"
        >
          {notebooks.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <span className="hidden text-[12.5px] text-muted-foreground sm:inline">
          · edited {relativeStamp(note.updatedAt)}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <IconBtn
            label={mode === "read" ? "Edit note" : "Preview note"}
            onClick={() => setMode(mode === "read" ? "write" : "read")}
            active={mode === "write"}
          >
            {mode === "read" ? (
              <Pencil className="size-[17px]" aria-hidden />
            ) : (
              <Eye className="size-[17px]" aria-hidden />
            )}
          </IconBtn>
          <IconBtn
            label={note.pinned ? "Unpin note" : "Pin note"}
            onClick={() => updateNote(note.id, { pinned: !note.pinned })}
            active={note.pinned}
          >
            <Pin className="size-[17px]" aria-hidden />
          </IconBtn>
          <IconBtn
            label="Share note"
            onClick={() =>
              toast("Sharing link copied", {
                description: "Anyone with the link can read this note.",
              })
            }
          >
            <Share2 className="size-[17px]" aria-hidden />
          </IconBtn>
          <IconBtn label="Delete note" danger onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-[17px]" aria-hidden />
          </IconBtn>
        </div>
      </header>

      {mode === "write" && settings.markdownShortcuts ? (
        <div className="sticky top-[53px] z-10 flex items-center gap-0.5 border-b border-border bg-surface/95 px-3 py-1.5 backdrop-blur md:px-6">
          <IconBtn label="Bold" onClick={() => wrap("**")}>
            <Bold className="size-4" aria-hidden />
          </IconBtn>
          <IconBtn label="Italic" onClick={() => wrap("*")}>
            <Italic className="size-4" aria-hidden />
          </IconBtn>
          <IconBtn label="Heading" onClick={() => prefix("## ")}>
            <span className="text-[13px] font-semibold">H</span>
          </IconBtn>
          <IconBtn label="Bullet list" onClick={() => prefix("- ")}>
            <List className="size-4" aria-hidden />
          </IconBtn>
          <IconBtn label="Checklist" onClick={() => prefix("- [ ] ")}>
            <ListChecks className="size-4" aria-hidden />
          </IconBtn>
          <IconBtn label="Quote" onClick={() => prefix("> ")}>
            <Quote className="size-4" aria-hidden />
          </IconBtn>
          <IconBtn label="Code" onClick={() => wrap("`")}>
            <Code className="size-4" aria-hidden />
          </IconBtn>
        </div>
      ) : null}

      <div
        className={cn(
          "mx-auto flex w-full max-w-[720px] flex-1 flex-col px-5 py-8 md:px-8 md:py-12",
          settings.editorWidth === "narrow" && "max-w-[560px]",
          settings.editorWidth === "wide" && "max-w-[960px]",
          settings.editorWidth === "full" && "max-w-none",
        )}
      >
        <input
          value={note.title}
          onChange={(e) => updateNote(note.id, { title: e.target.value })}
          placeholder="Untitled note"
          aria-label="Note title"
          className="w-full bg-transparent text-[27px] font-semibold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/60"
        />
        <input
          value={note.tags.join(", ")}
          onChange={(e) =>
            updateNote(note.id, {
              tags: e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
          placeholder="Add tags"
          aria-label="Tags"
          className="mt-2 w-full bg-transparent text-[13px] text-muted-foreground outline-none"
        />
        <div className="mt-6 flex min-h-0 flex-col md:flex-1">
          {mode === "write" ? (
            <textarea
              ref={areaRef}
              value={note.body}
              onChange={(e) => updateNote(note.id, { body: e.target.value })}
              placeholder="Start writing. Markdown shortcuts work here."
              aria-label="Note body"
              className="h-[55vh] min-h-0 w-full resize-none md:h-auto md:flex-1 bg-transparent font-mono text-[14.5px] leading-relaxed outline-none placeholder:text-muted-foreground"
            />
          ) : note.body.trim() ? (
            <Markdown source={note.body} />
          ) : (
            <button
              type="button"
              onClick={() => setMode("write")}
              className="text-[15px] text-muted-foreground underline-offset-4 hover:underline"
            >
              Empty note — start writing
            </button>
          )}
        </div>
        <p className="mt-10 text-[12px] text-muted-foreground">
          {nb?.name} · edited {relativeStamp(note.updatedAt)}
        </p>
      </div>

      <ConfirmDeleteDialog
        open={confirmDelete}
        title={"Delete “" + (note.title || "Untitled note") + "”?"}
        description="This permanently deletes the note. This can’t be undone."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteNote(note.id);
          setConfirmDelete(false);
          void navigate({ to: "/notes" });
          toast("Note deleted");
        }}
      />
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  active,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active ?? undefined}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground",
        active && "bg-surface-2 text-primary",
        danger && "hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}
