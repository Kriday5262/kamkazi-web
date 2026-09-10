import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import {
  CalendarDays,
  Bell,
  Flag,
  Repeat,
  Tag,
  Trash2,
  X,
  Paperclip,
  Plus,
  Download,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { relativeDate, isOverdue } from "@/lib/format";
import { type Task } from "@/data/seed";
import { TaskCheckbox } from "@/components/primitives";
import { TagChip } from "@/components/tasks-screen";
import { cn } from "@/lib/utils";

const PRIORITIES: Task["priority"][] = ["none", "low", "medium", "high"];
const PRIORITY_LABEL: Record<Task["priority"], string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const { tasks, updateTask, deleteTask, toggleTask, addTaskAttachment, removeTaskAttachment } =
    useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [tagInput, setTagInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allTaskTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) for (const tag of t.tags) if (tag.trim()) set.add(tag.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tasks]);
  const suggestions = allTaskTags.filter(
    (t) => !task.tags.includes(t) && t.toLowerCase().includes(tagInput.trim().toLowerCase()),
  );

  const commitTagInput = () => {
    const tag = tagInput.trim();
    if (tag && !task.tags.includes(tag)) updateTask(task.id, { tags: [...task.tags, tag] });
    setTagInput("");
  };

  const removeTag = (tag: string) =>
    updateTask(task.id, { tags: task.tags.filter((t) => t !== tag) });

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-[12.5px] text-muted-foreground">
          updated {relativeDate(task.updatedAt) || task.updatedAt}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Delete task"
            onClick={() => setConfirmDelete(true)}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-[17px]" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Close task details"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-[17px]" aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex items-start gap-3">
          <TaskCheckbox
            done={task.done}
            priority={task.priority}
            onToggle={() => toggleTask(task.id)}
            label={task.title}
          />
          <input
            value={task.title}
            onChange={(e) => updateTask(task.id, { title: e.target.value })}
            aria-label="Task title"
            className={cn(
              "w-full bg-transparent text-[17px] font-medium leading-snug tracking-tight outline-none",
              task.done && "text-muted-foreground line-through",
            )}
          />
        </div>

        {/* Description: plain textarea, thin border-bottom, no box background */}
        <textarea
          value={task.notes ?? ""}
          onChange={(e) => updateTask(task.id, { notes: e.target.value })}
          placeholder="Add notes"
          aria-label="Task notes"
          rows={5}
          className="mt-3 w-full resize-none border-b border-border bg-transparent px-0 py-2 text-[14px] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />

        <div className="mt-5 space-y-1">
          <Row icon={<CalendarDays className="size-4" aria-hidden />} label="Due">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={task.dueDate ?? ""}
                onChange={(e) => updateTask(task.id, { dueDate: e.target.value || undefined })}
                aria-label="Due date"
                className="tnum rounded-md bg-surface-2 px-2 py-1 text-[13px] outline-none"
              />
              {task.dueDate ? (
                <button
                  type="button"
                  onClick={() => updateTask(task.id, { dueDate: undefined })}
                  className="text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear
                </button>
              ) : null}
              {task.dueDate && isOverdue(task.dueDate) ? (
                <span className="text-[12.5px] font-medium text-destructive">Overdue</span>
              ) : null}
            </div>
          </Row>

          <Row icon={<Bell className="size-4" aria-hidden />} label="Time">
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={task.dueTime ?? ""}
                onChange={(e) => updateTask(task.id, { dueTime: e.target.value || undefined })}
                className="tnum rounded-md bg-surface-2 px-2 py-1 text-[13px] outline-none"
                aria-label="Due time"
              />

            </div>
          </Row>

          <Row icon={<Flag className="size-4" aria-hidden />} label="Priority">
            <div className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => updateTask(task.id, { priority: p })}
                  className={cn(
                    "rounded-md px-2 py-1 text-[12.5px] transition-colors",
                    task.priority === p
                      ? "bg-primary/12 font-medium text-primary"
                      : "text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </Row>

          {/* Tags — chips + input, suggestions from existing tags */}
          <Row icon={<Tag className="size-4" aria-hidden />} label="Tags">
            <div className="flex flex-wrap items-center gap-1.5">
              {task.tags.map((tag) => (
                <TagChip key={tag} tag={tag} onRemove={() => removeTag(tag)} />
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitTagInput();
                  }
                }}
                placeholder="Add tag"
                aria-label="Add tag"
                className="min-w-[90px] flex-1 bg-transparent py-1 text-[13px] outline-none placeholder:text-muted-foreground"
              />
            </div>
            {suggestions.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {suggestions.slice(0, 6).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      updateTask(task.id, { tags: [...task.tags, s] });
                      setTagInput("");
                    }}
                    className="rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            ) : null}
          </Row>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Subtasks
          </p>
          <div className="space-y-1">
            {task.subtasks.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-surface-2/70"
              >
                <TaskCheckbox
                  done={s.done}
                  onToggle={() =>
                    updateTask(task.id, {
                      subtasks: task.subtasks.map((x) =>
                        x.id === s.id ? { ...x, done: !x.done } : x,
                      ),
                    })
                  }
                  label={s.title}
                />
                <span className={cn("text-[14px]", s.done && "text-muted-foreground line-through")}>
                  {s.title}
                </span>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newSubtask.trim()) return;
              updateTask(task.id, {
                subtasks: [
                  ...task.subtasks,
                  {
                    id: Math.random().toString(36).slice(2),
                    title: newSubtask.trim(),
                    done: false,
                  },
                ],
              });
              setNewSubtask("");
            }}
            className="mt-1 flex items-center gap-2 px-1"
          >
            <Plus className="size-4 text-muted-foreground" aria-hidden />
            <input
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              placeholder="Add subtask"
              aria-label="Add subtask"
              className="w-full bg-transparent py-1 text-[14px] outline-none placeholder:text-muted-foreground"
            />
          </form>
        </div>

        <div className="mt-6 space-y-1 border-t border-border pt-4">
          <Row icon={<Repeat className="size-4" aria-hidden />} label="Repeat">
            <input
              value={task.repeat ?? ""}
              onChange={(e) => updateTask(task.id, { repeat: e.target.value || undefined })}
              placeholder="Never"
              aria-label="Repeat"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </Row>
          <Row icon={<Paperclip className="size-4" aria-hidden />} label="Files">
            <div className="space-y-1.5">
              {task.attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-[13px]">
                  {a.path ? (
                    <a
                      href={`/api/attachments?path=${encodeURIComponent(a.path)}`}
                      download
                      onClick={(e) => e.stopPropagation()}
                      className="flex min-w-0 items-center gap-1.5 text-primary hover:underline"
                    >
                      <Download className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{a.name}</span>
                    </a>
                  ) : (
                    <span className="truncate">{a.name}</span>
                  )}
                  <span className="shrink-0 text-muted-foreground">{a.size}</span>
                  <button
                    type="button"
                    aria-label={`Delete ${a.name}`}
                    onClick={() => {
                      if (window.confirm(`Delete attachment “${a.name}”? This can’t be undone.`))
                        removeTaskAttachment(task.id, a.id);
                    }}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              ))}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) addTaskAttachment(task.id, file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-primary"
              >
                <Plus className="size-3.5" aria-hidden />
                Upload file
              </button>
            </div>
          </Row>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={confirmDelete}
        title={`Delete “${task.title}”?`}
        description="This permanently deletes the task. This can’t be undone."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteTask(task.id);
          setConfirmDelete(false);
          onClose();
        }}
      />
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg px-1 py-2">
      <span className="mt-0.5 flex w-[86px] shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
        {icon}
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
