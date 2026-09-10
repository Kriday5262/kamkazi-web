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
  ListTree,
} from "lucide-react";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { relativeDate, isOverdue } from "@/lib/format";
import { dayOffset, TODAY, type Task } from "@/data/seed";
import { TaskCheckbox } from "@/components/primitives";
import { cn } from "@/lib/utils";

const PRIORITIES: Task["priority"][] = ["none", "low", "medium", "high"];
const PRIORITY_LABEL: Record<Task["priority"], string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const { lists, updateTask, deleteTask, toggleTask } = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(task.reminder || task.repeat || task.tags.length || task.attachments.length),
  );
  const [newSubtask, setNewSubtask] = useState("");

  const list = lists.find((l) => l.id === task.listId);

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-[12.5px] text-muted-foreground">
          {list?.name} · updated {relativeDate(task.updatedAt) || task.updatedAt}
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

        <textarea
          value={task.notes ?? ""}
          onChange={(e) => updateTask(task.id, { notes: e.target.value })}
          placeholder="Add notes"
          aria-label="Task notes"
          rows={3}
          className="mt-3 w-full resize-none rounded-lg bg-surface-2/60 px-3 py-2.5 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground focus:bg-surface-2"
        />

        <div className="mt-5 space-y-1">
          <Row icon={<CalendarDays className="size-4" aria-hidden />} label="Due">
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "Today", value: TODAY },
                { label: "Tomorrow", value: dayOffset(1) },
                { label: "Next week", value: dayOffset(7) },
                { label: "None", value: undefined },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => updateTask(task.id, { dueDate: o.value })}
                  className={cn(
                    "rounded-md px-2 py-1 text-[12.5px] transition-colors",
                    task.dueDate === o.value || (!task.dueDate && !o.value)
                      ? "bg-primary/12 font-medium text-primary"
                      : "text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Row>

          {task.dueDate ? (
            <Row icon={<Bell className="size-4" aria-hidden />} label="Time">
              <input
                type="time"
                value={task.dueTime ?? ""}
                onChange={(e) => updateTask(task.id, { dueTime: e.target.value || undefined })}
                className="tnum rounded-md bg-surface-2 px-2 py-1 text-[13px] outline-none"
                aria-label="Due time"
              />
              {isOverdue(task.dueDate) ? (
                <span className="ml-2 text-[12.5px] font-medium text-destructive">Overdue</span>
              ) : null}
            </Row>
          ) : null}

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

          <Row icon={<ListTree className="size-4" aria-hidden />} label="List">
            <select
              value={task.listId}
              onChange={(e) => updateTask(task.id, { listId: e.target.value })}
              aria-label="List"
              className="rounded-md bg-surface-2 px-2 py-1 text-[13px] outline-none"
            >
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
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

        {showAdvanced ? (
          <div className="mt-6 space-y-1 border-t border-border pt-4">
            <Row icon={<Bell className="size-4" aria-hidden />} label="Reminder">
              <input
                value={task.reminder ?? ""}
                onChange={(e) => updateTask(task.id, { reminder: e.target.value || undefined })}
                placeholder="None"
                aria-label="Reminder"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
            </Row>
            <Row icon={<Repeat className="size-4" aria-hidden />} label="Repeat">
              <input
                value={task.repeat ?? ""}
                onChange={(e) => updateTask(task.id, { repeat: e.target.value || undefined })}
                placeholder="Never"
                aria-label="Repeat"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
            </Row>
            <Row icon={<Tag className="size-4" aria-hidden />} label="Tags">
              <input
                value={task.tags.join(", ")}
                onChange={(e) =>
                  updateTask(task.id, {
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Add tags"
                aria-label="Tags"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
            </Row>
            <Row icon={<Paperclip className="size-4" aria-hidden />} label="Files">
              {task.attachments.length ? (
                <div className="space-y-1">
                  {task.attachments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-[13px]">
                      <span>{a.name}</span>
                      <span className="text-muted-foreground">{a.size}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-[13px] text-muted-foreground">No attachments</span>
              )}
            </Row>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAdvanced(true)}
            className="mt-6 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Reminder, repeat, tags and files
          </button>
        )}
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
