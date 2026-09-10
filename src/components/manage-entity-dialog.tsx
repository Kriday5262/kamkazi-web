import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ICON_CHOICES, listIcon } from "@/components/list-icons";
import { cn } from "@/lib/utils";

/** Curated icon picker — small round buttons, selected one ringed. */
export function IconPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (key: string) => void;
  className?: string | undefined;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} role="radiogroup" aria-label="Icon">
      {ICON_CHOICES.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={label}
          title={label}
          onClick={() => onChange(key)}
          className={cn(
            "grid size-8 place-items-center rounded-lg border transition-colors",
            value === key
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}

export interface ManageTarget {
  id: string;
  name: string;
  icon: string;
}

/**
 * Rename + icon-picker + delete-with-confirmation dialog for a task list or
 * notebook. `kind` only shapes the copy ("list" vs "notebook").
 */
export function ManageEntityDialog({
  target,
  kind,
  count,
  onClose,
  onSave,
  onDelete,
}: {
  target: ManageTarget | null;
  kind: "list" | "notebook";
  count: number;
  onClose: () => void;
  onSave: (id: string, name: string, icon: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(target?.name ?? "");
  const [icon, setIcon] = useState(target?.icon ?? "list");
  const [confirming, setConfirming] = useState(false);
  if (!target) return null;

  const Icon = listIcon(icon);
  const label = kind === "list" ? "list" : "notebook";
  const dirty = name.trim() !== target.name || icon !== target.icon;

  return confirming ? (
    <AlertDialog open onOpenChange={(v) => !v && setConfirming(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{target.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the {label} and the {count}{" "}
            {kind === "list" ? "task(s)" : "note(s)"} in it. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirming(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => {
              onDelete(target.id);
              setConfirming(false);
              onClose();
            }}
          >
            Delete {kind === "list" ? "list" : "notebook"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${label}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-3d)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
          <p className="text-[15px] font-semibold">Edit {label}</p>
        </div>
        <label
          className="mb-1 block text-[12px] font-medium text-muted-foreground"
          htmlFor="entity-name"
        >
          Name
        </label>
        <input
          id="entity-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-primary"
          maxLength={60}
        />
        <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">Icon</label>
        <IconPicker value={icon} onChange={setIcon} className="mb-5" />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            Delete…
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!name.trim() || !dirty}
              onClick={() => {
                onSave(target.id, name.trim(), icon);
                onClose();
              }}
              className="rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
