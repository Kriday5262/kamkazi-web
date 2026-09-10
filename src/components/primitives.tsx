import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function TaskCheckbox({
  done,
  priority = "none",
  onToggle,
  label,
}: {
  done: boolean;
  priority?: "none" | "low" | "medium" | "high";
  onToggle: () => void;
  label: string;
}) {
  const ring =
    priority === "high"
      ? "border-destructive"
      : priority === "medium"
        ? "border-warning"
        : priority === "low"
          ? "border-primary"
          : "border-border-strong";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${done ? "Mark incomplete" : "Complete"}: ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "mt-[1px] grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-all duration-150 hover:scale-110 active:scale-95",
        done ? "border-primary bg-primary" : ring,
      )}
    >
      {done ? (
        <svg viewBox="0 0 14 14" className="size-3 text-primary-foreground" aria-hidden>
          <path
            d="M2.5 7.5l3 3 6-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-4 grid size-11 place-items-center rounded-full bg-surface-2 text-muted-foreground">
        {icon}
      </div>
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <p
      className={cn(
        "px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Chip({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "danger" | "primary";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] leading-5",
        tone === "danger" && "bg-destructive/10 text-destructive",
        tone === "primary" && "bg-primary/10 text-primary",
        tone === "default" && "bg-surface-2 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}
