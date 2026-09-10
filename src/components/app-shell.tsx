import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarRange,
  Command,
  Moon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { userName } from "@/data/seed";
import { BrandMark } from "@/components/brand-glyph";

const NAV: { to: string; label: string; icon: LucideIcon; tint: string; bg: string }[] = [
  {
    to: "/",
    label: "Today",
    icon: CalendarDays,
    tint: "text-accent-amber",
    bg: "bg-accent-amber/12",
  },
  {
    to: "/calendar",
    label: "Agenda",
    icon: CalendarRange,
    tint: "text-accent-teal",
    bg: "bg-accent-teal/12",
  },

  {
    to: "/notes",
    label: "Notes",
    icon: NotebookPen,
    tint: "text-accent-green",
    bg: "bg-accent-green/12",
  },
  {
    to: "/chat",
    label: "AI Chat",
    icon: Sparkles,
    tint: "text-accent-violet",
    bg: "bg-accent-violet/12",
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings2,
    tint: "text-accent-teal",
    bg: "bg-accent-teal/12",
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { setPaletteOpen, theme, toggleTheme, tasks, sidebarCollapsed, toggleSidebar } = useStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const openCount = tasks.filter((t) => !t.done).length;

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop / iPad sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-4 transition-[width] duration-200 md:flex",
          sidebarCollapsed ? "w-[64px] items-center px-2" : "w-[236px] px-3",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2.5 pb-5",
            sidebarCollapsed ? "justify-center" : "px-2",
          )}
        >
          <BrandMark />
          {!sidebarCollapsed ? (
            <span className="font-display text-[16px] font-extrabold tracking-tight">Kamkazi</span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search and commands"
          className={cn(
            "tap mb-4 flex items-center gap-2 rounded-full border border-border bg-card text-sm font-medium text-muted-foreground shadow-[var(--shadow-panel)] transition-colors hover:text-foreground",
            sidebarCollapsed ? "size-9 justify-center p-0" : "w-full px-3 py-2",
          )}
        >
          <Search className="size-4 shrink-0" aria-hidden />
          {!sidebarCollapsed ? (
            <>
              <span className="flex-1 text-left">Search</span>
              <kbd className="flex items-center gap-0.5 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <Command className="size-2.5" aria-hidden />K
              </kbd>
            </>
          ) : null}
        </button>

        <nav className="flex w-full flex-1 flex-col gap-1" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, tint, bg }) => (
            <Link
              key={to}
              to={to}
              title={sidebarCollapsed ? label : undefined}
              className={cn(
                "tap group flex items-center gap-2.5 rounded-full text-[13.5px] font-semibold transition-colors",
                sidebarCollapsed ? "justify-center px-0 py-2" : "px-3 py-2",
                isActive(to)
                  ? cn(bg, "text-sidebar-accent-foreground")
                  : "text-sidebar-foreground hover:bg-sidebar-accent/70",
              )}
            >
              <Icon
                className={cn(
                  "size-[18px] shrink-0",
                  isActive(to) ? tint : "text-muted-foreground",
                )}
                strokeWidth={isActive(to) ? 2.4 : 1.9}
                aria-hidden
              />
              {!sidebarCollapsed ? (
                <>
                  <span className="flex-1">{label}</span>
                  {to === "/calendar" && openCount > 0 ? (
                    <span className="num rounded-full bg-primary/12 px-2 text-[12px] font-bold text-primary">
                      {openCount}
                    </span>
                  ) : null}
                </>
              ) : null}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "mt-4 flex items-center gap-2 rounded-lg py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
            sidebarCollapsed ? "justify-center px-0" : "px-2.5",
          )}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden />
          ) : (
            <PanelLeftClose className="size-4" aria-hidden />
          )}
          {!sidebarCollapsed ? "Collapse" : null}
        </button>

        <div
          className={cn(
            "mt-2 flex items-center gap-2 border-t border-sidebar-border pt-3",
            sidebarCollapsed && "flex-col gap-2",
          )}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent-teal/25 to-accent-violet/25 text-[12px] font-semibold">
            {userName.slice(0, 1)}
          </span>
          {!sidebarCollapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{userName}</p>
              <p className="truncate text-[11px] text-muted-foreground">Personal plan</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Theme: ${theme}. Click to change (light → dark → system)`}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            {!mounted ? null : theme === "dark" ? (
              <Sun className="size-4" aria-hidden />
            ) : (
              <Moon className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>

      {/* iPhone bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur-xl md:hidden"
      >
        {NAV.map(({ to, label, icon: Icon, bg, tint }) => (
          <Link
            key={to}
            to={to}
            aria-current={isActive(to) ? "page" : undefined}
            className="tap flex flex-1 flex-col items-center gap-1 py-1"
          >
            <span
              className={cn(
                "grid h-7 w-12 place-items-center rounded-full transition-colors",
                isActive(to) ? bg : "bg-transparent",
              )}
            >
              <Icon
                className={cn("size-[19px]", isActive(to) ? tint : "text-muted-foreground")}
                strokeWidth={isActive(to) ? 2.4 : 1.9}
                aria-hidden
              />
            </span>
            <span
              className={cn(
                "text-[10px] font-bold tracking-tight",
                isActive(to) ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const { setPaletteOpen, theme, toggleTheme } = useStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:px-7">
      <BrandMark className="md:hidden" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[19px] font-extrabold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="truncate text-[12.5px] font-medium text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>

      {actions}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-label="Search and commands"
        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground md:hidden"
      >
        <Search className="size-[18px]" aria-hidden />
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={`Theme: ${theme}. Click to change (light → dark → system)`}
        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground md:hidden"
      >
        {!mounted ? null : theme === "dark" ? (
          <Sun className="size-[18px]" aria-hidden />
        ) : (
          <Moon className="size-[18px]" aria-hidden />
        )}
      </button>
    </header>
  );
}
