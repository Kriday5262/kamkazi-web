/**
 * Phase 4 — Files screen: browse /media/HIKVISION/Shantanu (the user's drive).
 * Breadcrumbs + folder/file list, text file viewer/editor, image preview,
 * PDF new-tab, create/upload/rename/move/delete (delete always confirmed).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Download,
  ExternalLink,
  File as FileIcon,
  FileText,
  FolderPlus,
  Folder,
  Grid3x3,
  ImageIcon,
  Move,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { cn } from "@/lib/utils";

interface FileEntry {
  name: string;
  type: "dir" | "file";
  sizeLabel: string;
  modified: string;
  ext: string;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);
const TEXT_EXTS = new Set([
  "md", "txt", "json", "ts", "tsx", "js", "jsx", "css", "html", "yml", "yaml",
  "csv", "sh", "py", "xml", "ini", "conf", "log", "srt", "env", "toml",
]);
const PAGE_SIZE = 60;

function relOf(path: string): string {
  return path.replace(/^\/+/, "");
}
function joinRel(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}
function extOf(e: FileEntry): string {
  return e.ext;
}

export function FilesScreen() {
  const [dir, setDir] = useState("/");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<null | {
    path: string;
    name: string;
    kind: "text" | "image" | "pdf";
    content?: string;
    truncated?: boolean;
    dirty?: boolean;
  }>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/files?op=list&path=${encodeURIComponent(d)}`);
      if (res.ok) {
        const data = (await res.json()) as { entries: FileEntry[]; total: number };
        setEntries(data.entries);
        setTotal(data.total);
        setVisible(60);
      } else {
        setEntries([]);
        setTotal(0);
        toast.error("Could not read that folder");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(dir);
  }, [dir, load]);

  const crumbs = useMemo(() => {
    const parts = dir.split("/").filter(Boolean);
    const out = [{ name: "Home", path: "/" }];
    let acc = "";
    for (const p of parts) {
      acc += `/${p}`;
      out.push({ name: p, path: acc });
    }
    return out;
  }, [dir]);

  const openFile = async (path: string, name: string, ext: string) => {
    if (IMAGE_EXTS.has(ext)) {
      setViewer({ path, name, kind: "image" });
      return;
    }
    if (ext === "pdf") {
      window.open(`/api/files?op=raw&path=${encodeURIComponent(path)}`, "_blank");
      return;
    }
    if (TEXT_EXTS.has(ext)) {
      const res = await fetch(`/api/files?op=read&path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = (await res.json()) as { content: string; truncated: boolean };
        setViewer({ path, name, kind: "text", content: data.content, truncated: data.truncated });
      } else if (res.status === 413) {
        toast.error("File is larger than 200 KB — download to view");
      } else {
        toast.error("Could not open that file");
      }
      return;
    }
    // everything else: download
    window.location.href = `/api/files?op=raw&path=${encodeURIComponent(path)}`;
  };

  const doDelete = async (path: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", path }),
      });
      if (res.ok) {
        toast.success("Deleted");
        void load(dir);
      } else toast.error("Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const doRename = async (from: string, toName: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "rename", from, toName }),
      });
      if (res.ok) {
        toast.success("Renamed");
        setRenaming(null);
        void load(dir);
      } else toast.error("Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const doMkdir = async () => {
    const name = window.prompt("New folder name");
    if (!name?.trim()) return;
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mkdir", path: joinRel(dir, name.trim()) }),
    });
    if (res.ok) {
      toast.success("Folder created");
      void load(dir);
    } else toast.error("Could not create folder");
  };

  const doUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("dir", dir);
      form.append("file", file);
      const res = await fetch("/api/files", { method: "POST", body: form });
      if (!res.ok) toast.error(`Upload failed: ${file.name}`);
    }
    toast.success(`${files.length} file${files.length === 1 ? "" : "s"} uploaded`);
    void load(dir);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader title="Files" subtitle="Your personal drive" />
      <div className="mx-auto w-full max-w-[860px] px-4 py-4 md:px-6">
        {/* toolbar: breadcrumbs + actions */}
        <div className="panel mb-3 flex flex-wrap items-center gap-1.5 px-3 py-2.5">
          <nav className="flex min-w-0 flex-1 flex-wrap items-center text-[13.5px]" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.path} className="flex items-center">
                {i > 0 ? <ChevronRight className="mx-0.5 size-3.5 text-muted-foreground" aria-hidden /> : null}
                <button
                  type="button"
                  onClick={() => setDir(c.path)}
                  className={cn(
                    "max-w-[160px] truncate rounded px-1 py-0.5 transition-colors hover:bg-surface-2",
                    i === crumbs.length - 1 ? "font-semibold" : "text-muted-foreground",
                  )}
                >
                  {c.name}
                </button>
              </span>
            ))}
          </nav>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={doMkdir}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[12.5px] transition-colors hover:border-border-strong"
            >
              <FolderPlus className="size-3.5" aria-hidden /> New folder
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[12.5px] font-semibold text-primary-foreground"
            >
              <Upload className="size-3.5" aria-hidden /> Upload
            </button>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void doUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* listing */}
        <div className="panel overflow-hidden rounded-xl">
          {loading ? (
            <p className="px-4 py-8 text-center text-[13.5px] text-muted-foreground">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13.5px] text-muted-foreground">This folder is empty.</p>
          ) : (
            <ul>
              {entries.slice(0, visible).map((e) => {
                const p = joinRel(dir, e.name);
                const isImg = IMAGE_EXTS.has(extOf(e));
                const isText = TEXT_EXTS.has(extOf(e));
                return (
                  <li key={e.name} className="border-b border-border last:border-b-0">
                    <div className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-2/60">
                      <button
                        type="button"
                        onClick={() => (e.type === "dir" ? setDir(p) : void openFile(p, e.name, extOf(e)))}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        {e.type === "dir" ? (
                          <FolderIcon />
                        ) : isImg ? (
                          <img
                            src={`/api/files?op=raw&path=${encodeURIComponent(p)}`}
                            alt=""
                            loading="lazy"
                            className="size-9 shrink-0 rounded-md border border-border object-cover"
                          />
                        ) : (
                          <FileGlyph ext={extOf(e)} isText={isText} />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[14px]">{e.name}</span>
                        <span className="hidden shrink-0 text-[12px] text-muted-foreground sm:block">
                          {new Date(e.modified).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                        <span className="w-16 shrink-0 text-right text-[12px] text-muted-foreground">{e.sizeLabel}</span>
                      </button>
                      <span className="flex shrink-0 items-center gap-0.5">
                        {e.type === "file" && !isImg ? (
                          <a
                            href={`/api/files?op=raw&path=${encodeURIComponent(p)}`}
                            download
                            aria-label={`Download ${e.name}`}
                            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2"
                          >
                            <Download className="size-3.5" aria-hidden />
                          </a>
                        ) : null}
                        <IconBtn
                          label={`Rename ${e.name}`}
                          icon={<Pencil className="size-3.5" aria-hidden />}
                          onClick={() => setRenaming(p)}
                        />
                        <button
                          type="button"
                          aria-label={`Move ${e.name}`}
                          onClick={() => setMoveTarget(p)}
                          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2"
                        >
                          <Move className="size-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${e.name}`}
                          onClick={() => setConfirmDelete(p)}
                          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {visible < total ? (
            <button
              type="button"
              onClick={() => setVisible((v) => v + 100)}
              className="w-full border-t border-border py-2.5 text-[13px] text-primary"
            >
              Show more ({total - visible} more)
            </button>
          ) : null}
        </div>
        <p className="mt-2 px-1 text-[11.5px] text-muted-foreground">
          {total} item{total === 1 ? "" : "s"} in this folder
        </p>
      </div>

      {/* viewer / editor */}
      {viewer ? <FileViewer state={viewer} onClose={() => setViewer(null)} onSaved={() => void load(dir)} /> : null}

      {/* rename inline dialog */}
      {renaming ? (
        <RenameDialog
          initial={renaming.split("/").pop() ?? ""}
          onCancel={() => setRenaming(null)}
          onSubmit={(name) => void doRename(renaming, name)}
          busy={busy}
        />
      ) : null}

      {/* move dialog */}
      {moveTarget ? (
        <MoveDialog
          from={moveTarget}
          onCancel={() => setMoveTarget(null)}
          onDone={(ok) => {
            setMoveTarget(null);
            if (ok) void load(dir);
          }}
        />
      ) : null}

      <ConfirmDeleteDialog
        open={!!confirmDelete}
        title={`Delete “${confirmDelete?.split("/").pop() ?? ""}”?`}
        description="This permanently deletes it from your drive. This can’t be undone."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) void doDelete(confirmDelete);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

function IconBtn({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2"
    >
      {icon}
    </button>
  );
}

function FolderIcon() {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-amber/12 text-accent-amber">
      <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
        <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z" />
      </svg>
    </span>
  );
}

function FileGlyph({ ext, isText }: { ext: string; isText: boolean }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-[9px] font-bold uppercase text-muted-foreground">
      {isText ? <FileText className="size-4" aria-hidden /> : ext ? ext.slice(0, 4) : <FileIcon className="size-4" aria-hidden />}
    </span>
  );
}

function FileViewer({
  state,
  onClose,
  onSaved,
}: {
  state: { path: string; name: string; kind: "text" | "image" | "pdf"; content?: string; truncated?: boolean; dirty?: boolean };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(state.content ?? "");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => setText(state.content ?? ""), [state.content, state.path]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "write", path: state.path, content: text }),
      });
      if (res.ok) {
        toast.success("Saved");
        setEditing(false);
        onSaved();
      } else toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/60 p-3 backdrop-blur-sm md:p-6" role="dialog" aria-label={state.name}>
      <div className="panel mx-auto flex min-h-0 w-full max-w-[860px] flex-1 flex-col overflow-hidden rounded-xl">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <p className="min-w-0 flex-1 truncate text-[14px] font-medium">{state.name}</p>
          {state.kind === "image" ? (
            <a
              href={`/api/files?op=raw&path=${encodeURIComponent(state.path)}`}
              download
              className="rounded-lg border border-border px-2 py-1 text-[12.5px] hover:border-border-strong"
            >
              Download
            </a>
          ) : null}
          {state.kind !== "image" && state.content !== undefined ? (
            editing ? (
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-primary px-2.5 py-1 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-lg border border-border px-2 py-1 text-[12.5px] hover:border-border-strong"
              >
                Edit
              </button>
            )
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close viewer"
            className="grid size-7 place-items-center rounded-md hover:bg-surface-2"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-surface p-3">
          {state.kind === "image" ? (
            <img
              src={`/api/files?op=raw&path=${encodeURIComponent(state.path)}`}
              alt={state.name}
              className="mx-auto max-h-full max-w-full rounded-lg object-contain"
            />
          ) : state.content !== undefined && !editing ? (
            <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{text}</pre>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label={`Edit ${state.name}`}
              className="h-full min-h-[50vh] w-full resize-none rounded-lg border border-border bg-surface p-3 font-mono text-[13px] outline-none focus:border-border-strong"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RenameDialog({
  initial,
  onCancel,
  onSubmit,
  busy,
}: {
  initial: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(initial);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" role="dialog" aria-label="Rename">
      <div className="panel w-full max-w-[360px] rounded-xl p-4">
        <p className="mb-2 text-[14px] font-medium">Rename</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New name"
          autoFocus
          className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[13.5px] outline-none focus:border-border-strong"
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim() && name.trim() !== initial) onSubmit(name.trim());
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-[13px]">
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || name.trim() === initial || busy}
            onClick={() => onSubmit(name.trim())}
            className="rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}

function MoveDialog({
  from,
  onCancel,
  onDone,
}: {
  from: string;
  onCancel: () => void;
  onDone: (ok: boolean) => void;
}) {
  const [target, setTarget] = useState("/");
  const [listing, setListing] = useState<{ entries: { name: string; type: string }[] } | null>(null);

  const loadDir = useCallback(async (d: string) => {
    const res = await fetch(`/api/files?op=list&path=${encodeURIComponent(d)}`);
    if (res.ok) setListing((await res.json()) as { entries: { name: string; type: string }[] });
  }, []);

  useEffect(() => {
    void loadDir(target);
  }, [target, loadDir]);

  const go = async () => {
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "move", from, toDir: target }),
    });
    if (res.ok) toast.success("Moved");
    else toast.error("Move failed");
    onDone(res.ok);
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" role="dialog" aria-label="Move">
      <div className="panel flex max-h-[70vh] w-full max-w-[380px] flex-col rounded-xl p-4">
        <p className="mb-1 text-[14px] font-medium">Move “{from.split("/").pop()}” to…</p>
        <p className="mb-2 text-[12.5px] text-muted-foreground">{target}</p>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
          {target !== "/" ? (
            <button
              type="button"
              onClick={() => setTarget(target.split("/").slice(0, -1).join("/") || "/")}
              className="block w-full border-b border-border px-3 py-2 text-left text-[13.5px] hover:bg-surface-2"
            >
              ↑ Up one level
            </button>
          ) : null}
          {(listing?.entries ?? [])
            .filter((e) => e.type === "dir")
            .map((e) => (
              <button
                key={e.name}
                type="button"
                onClick={() => setTarget(target === "/" ? `/${e.name}` : `${target}/${e.name}`)}
                className="block w-full border-b border-border px-3 py-2 text-left text-[13.5px] hover:bg-surface-2"
              >
                {e.name}
              </button>
            ))}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-[13px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={go}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground"
          >
            <ExternalLink className="size-3.5" aria-hidden /> Move here
          </button>
        </div>
      </div>
    </div>
  );
}