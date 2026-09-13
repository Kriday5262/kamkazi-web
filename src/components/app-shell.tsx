import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarRange,
  Command,
  HardDrive,
  Moon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Mail,
  RotateCw,
  Search,
  Settings2,
  Sparkles,
  Sun,
  X,
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
    to: "/email",
    label: "Email",
    icon: Mail,
    tint: "text-accent-blue",
    bg: "bg-accent-blue/12",
  },
  {
    to: "/chat",
    label: "AI Chat",
    icon: Sparkles,
    tint: "text-accent-violet",
    bg: "bg-accent-violet/12",
  },
  {
    to: "/files",
    label: "Files",
    icon: HardDrive,
    tint: "text-accent-rose",
    bg: "bg-accent-rose/12",
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

      <main className="flex min-w-0 flex-1 flex-col pb-[calc(88px+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>

      {/* iPhone bottom tab bar: 4 tabs split around a raised centre Today button */}
      <MobileBottomNav pathname={pathname} />
    </div>
  );
}

/* ---------- Mobile bottom navigation (iPhone) ---------- */

/** The four thumb-reachable tabs, split around the centre Today button. */
const LEFT_TABS = [
  { to: "/calendar", label: "Agenda", icon: CalendarRange },
  { to: "/notes", label: "Notes", icon: NotebookPen },
] as const;

const RIGHT_TABS = [
  { to: "/email", label: "Email", icon: Mail },
  { to: "/chat", label: "AI Chat", icon: Sparkles },
] as const;

/**
 * "More" drawer entries. Add future destinations here — the drawer renders
 * whatever this list contains (Search/Settings are actions, others navigate).
 */
type MoreEntry =
  | { label: string; icon: LucideIcon; kind: "action"; action: "search" }
  | { label: string; icon: LucideIcon; kind: "link"; to: string };

const MORE_ITEMS: MoreEntry[] = [
  { label: "Search", icon: Search, kind: "action", action: "search" },
  { label: "Files", icon: HardDrive, kind: "link", to: "/files" },
  { label: "Settings", icon: Settings2, kind: "link", to: "/settings" },
];

function MobileTab({
  to,
  label,
  icon: Icon,
  pathname,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  pathname: string;
}) {
  const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
  return (
    <Link
      to={to}
      preload="intent"
      aria-current={active ? "page" : undefined}
      className="tap flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5"
    >
      <Icon
        className={cn(
          "size-[22px]",
          active ? "text-primary" : "text-muted-foreground",
        )}
        strokeWidth={active ? 2.4 : 1.9}
        aria-hidden
      />
      <span
        className={cn(
          "text-[10px] font-bold tracking-tight",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </Link>
  );
}

function MobileBottomNav({ pathname }: { pathname: string }) {
  const { setPaletteOpen } = useStore();
  const navigate = useNavigate();
  const swipe = useRef<{ y: number; fired: boolean }>({ y: 0, fired: false });
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const openMore = () => {
    setDragging(false);
    setDrag(0);
    setMoreOpen(true);
  };
  const progress = Math.min(drag / 40, 1);
  const stopHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  };

  return (
    <div className="md:hidden">
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between border-t border-border bg-card/95 px-3 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-xl"
      >
        {LEFT_TABS.map((t) => (
          <MobileTab key={t.to} {...t} pathname={pathname} />
        ))}

        <div className="relative flex flex-col items-center">
          {/* Swipe hint: grabber widens/lifts + "More" tooltip fades in with drag progress */}
          <span
            aria-hidden
            className="absolute -top-8 h-1 rounded-full bg-border"
            style={{
              width: `${24 + progress * 14}px`,
              opacity: 0.5 + progress * 0.5,
              transform: `translateY(${-progress * 6}px)`,
              transition: dragging ? "none" : "all 0.3s cubic-bezier(0.22,1,0.36,1)",
              backgroundColor: progress > 0.6 ? "var(--primary)" : undefined,
            }}
          />
          <span
            aria-hidden
            className="absolute -top-[3.6rem] rounded-full bg-foreground px-2.5 py-1 text-[10px] font-bold text-background"
            style={{
              opacity: progress,
              transform: `translateY(${(1 - progress) * 10}px) scale(${0.85 + progress * 0.15})`,
              transition: dragging ? "none" : "all 0.25s cubic-bezier(0.22,1,0.36,1)",
              pointerEvents: "none",
            }}
          >
            More
          </span>
          <button
            type="button"
            aria-label="Today — swipe up for more"
            onClick={() => {
              if (swipe.current.fired) return;
              void navigate({ to: "/" });
            }}
            onTouchStart={(e) => {
              swipe.current = { y: e.touches[0]?.clientY ?? 0, fired: false };
              setDragging(true);
              holdTimer.current = setTimeout(openMore, 500);
            }}
            onTouchMove={(e) => {
              if (swipe.current.fired) return;
              const delta = swipe.current.y - (e.touches[0]?.clientY ?? 0);
              setDrag(Math.max(0, Math.min(delta, 56)));
              if (delta > 40) {
                swipe.current.fired = true;
                stopHold();
                openMore();
              }
            }}
            onTouchEnd={() => {
              stopHold();
              setDragging(false);
              setDrag(0);
            }}
            className="tap -mt-9 flex h-16 w-16 items-center justify-center rounded-[20px] border-4 border-background gradient-primary text-primary-foreground shadow-[var(--shadow-3d)]"
            style={{
              transform: `translateY(${-drag * 0.45}px) scale(${1 + progress * 0.08})`,
              transition: dragging
                ? "none"
                : "transform 0.35s cubic-bezier(0.34,1.4,0.64,1)",
            }}
          >
            <CalendarDays
              className="size-8"
              strokeWidth={2.4}
              style={{
                transform: `scale(${1 + progress * 0.1})`,
                transition: dragging
                  ? "none"
                  : "transform 0.3s cubic-bezier(0.22,1,0.36,1)",
              }}
              aria-hidden
            />
          </button>
        </div>

        {RIGHT_TABS.map((t) => (
          <MobileTab key={t.to} {...t} pathname={pathname} />
        ))}
      </nav>

      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="animate-fade-up fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[32px] border-t border-border bg-card p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-[var(--shadow-panel)]"
            onTouchStart={(e) => {
              const startY = e.touches[0]?.clientY ?? 0;
              const onEnd = (ev: TouchEvent) => {
                if ((ev.changedTouches[0]?.clientY ?? 0) - startY > 70) setMoreOpen(false);
                window.removeEventListener("touchend", onEnd);
              };
              window.addEventListener("touchend", onEnd);
            }}
          >
            <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-border" />
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">More</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="tap grid size-8 place-items-center rounded-full hover:bg-muted"
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {MORE_ITEMS.map((item) => {
                const active =
                  item.kind === "link" && pathname.startsWith(item.to);
                const inner = (
                  <>
                    <item.icon className="size-[18px]" strokeWidth={2} aria-hidden />
                    {item.label}
                  </>
                );
                const cls = cn(
                  "tap flex min-h-[48px] items-center gap-3 rounded-2xl border p-3.5 text-sm font-semibold",
                  active
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-foreground",
                );
                if (item.kind === "link") {
                  return (
                    <Link
                      key={item.label}
                      to={item.to}
                      onClick={() => setMoreOpen(false)}
                      className={cls}
                    >
                      {inner}
                    </Link>
                  );
                }
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      if (item.action === "search") setPaletteOpen(true);
                    }}
                    className={cn(cls, "text-left")}
                  >
                    {inner}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
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
  const { setPaletteOpen, theme, toggleTheme, reloadAll } = useStore();
  const [mounted, setMounted] = useState(false);
  const [globalSyncing, setGlobalSyncing] = useState(false);
  useEffect(() => setMounted(true), []);
  const onGlobalRefresh = async () => {
    setGlobalSyncing(true);
    // (a) refresh connected calendars + (b) reload all app data — no page reload
    try {
      await fetch("/api/calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
    } catch {
      // calendar refresh is best-effort
    }
    await reloadAll();
    // let screens re-fetch their own live data (emails, weather) via the event
    window.dispatchEvent(new CustomEvent("kamkazi:reload-data"));
    setGlobalSyncing(false);
  };
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur md:px-7 md:pt-3">
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
        onClick={onGlobalRefresh}
        aria-label="Refresh everything (calendar, mail, tasks, notes)"
        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <RotateCw className={cn("size-[18px]", globalSyncing && "animate-spin")} aria-hidden />
      </button>
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
