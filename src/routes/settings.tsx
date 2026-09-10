import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight, LogOut } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { logout } from "@/lib/auth-client";
import { useStore, type Settings } from "@/lib/store";
import { PageHeader } from "@/components/app-shell";
import { userName } from "@/data/seed";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Kamkazi" },
      {
        name: "description",
        content:
          "Appearance, assistant behaviour, task defaults, notebooks, calendars, weather and notifications.",
      },
      { property: "og:title", content: "Settings — Kamkazi" },
      {
        property: "og:description",
        content:
          "Appearance, assistant behaviour, task defaults, notebooks, calendars, weather and notifications.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, updateSetting, theme, setTheme, notebooks } = useStore();
  const [open, setOpen] = useState<string | null>("General");

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader title="Settings" subtitle="Preferences for this workspace" />
      <div className="mx-auto w-full max-w-[680px] px-4 py-6 md:px-6">
        <div className="panel mb-6 flex items-center gap-3 px-4 py-3.5">
          <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-[15px] font-semibold">
            {userName.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">{settings.displayName?.trim() || userName}</p>
            <p className="text-[13px] text-muted-foreground">shantanu@kamkazi.com</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              // Server cleared the HttpOnly cookie on the response.
              window.location.href = "/login";
            }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[13px] transition-colors hover:border-border-strong"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>

        <Group label="General" open={open} setOpen={setOpen}>
          <Row label="Appearance" hint="System follows your device setting">
            <div className="flex items-center gap-1 rounded-lg border border-border p-1">
              {(["system", "light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={theme === t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[12.5px] font-medium capitalize transition-colors",
                    theme === t
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Start page" hint="Where the app lands after sign-in">
            <Select
              value={settings.startPage ?? "Today"}
              options={["Today", "Agenda", "Notes", "Email", "Chat"]}
              onChange={(v) => updateSetting("startPage", v)}
            />
          </Row>
          <Row label="Week starts on" hint="Applies to the Agenda week view">
            <Select
              value={(settings.weekStartsOn ?? 1) === 1 ? "Monday" : "Sunday"}
              options={["Sunday", "Monday"]}
              onChange={(v) => {
                const day = v === "Monday" ? 1 : 0;
                updateSetting("weekStartsOn", day);
                try {
                  window.localStorage.setItem("kamkazi-week-start", String(day));
                  window.dispatchEvent(new StorageEvent("storage", { key: "kamkazi-week-start" }));
                } catch {
                  // ignore
                }
              }}
            />
          </Row>
        </Group>

        <Group label="AI" open={open} setOpen={setOpen}>
          <Row
            label="Personalised responses"
            hint="Uses your tasks, notes and schedule for context"
          >
            <Toggle
              checked={settings.aiPersonalisation}
              onChange={(v) => updateSetting("aiPersonalisation", v)}
              label="Personalised responses"
            />
          </Row>
          <Row
            label="Email digest in briefing"
            hint="Adds recent unread emails to the daily briefing (needs Enable email on a Google account)"
          >
            <Toggle
              checked={settings.emailDigest}
              onChange={(v) => updateSetting("emailDigest", v)}
              label="Email digest in briefing"
            />
          </Row>
          <Row label="AI provider" hint="Hermes is the local endpoint (default)">
            <Select
              value={settings.aiProvider}
              options={["hermes", "openai", "ollama"]}
              onChange={(v) => updateSetting("aiProvider", v as Settings["aiProvider"])}
            />
          </Row>
          <Row label="Model name" hint={`Used with ${settings.aiProvider}`}>
            <input
              value={settings.aiModel ?? ""}
              onChange={(e) => updateSetting("aiModel", e.target.value)}
              placeholder={
                settings.aiProvider === "openai"
                  ? "gpt-4o-mini"
                  : settings.aiProvider === "ollama"
                    ? "llama3.1"
                    : "glm-5.3-flash:cloud"
              }
              aria-label="AI model name"
              className="w-40 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-border-strong"
            />
          </Row>
          {settings.aiProvider === "openai" ? (
            <Row label="OpenAI API key" hint="Stored server-side, never echoed back">
              <input
                type="password"
                value={settings.aiApiKey ?? ""}
                onChange={(e) => updateSetting("aiApiKey", e.target.value)}
                placeholder="sk-…"
                aria-label="OpenAI API key"
                className="w-40 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-border-strong"
              />
            </Row>
          ) : null}
          <Row label="Memory" hint="What the assistant remembers between chats">
            <button
              type="button"
              onClick={() => toast("Memory controls come with the full version")}
              className="text-[13px] text-primary"
            >
              Manage
            </button>
          </Row>
        </Group>

        <Group label="Tasks" open={open} setOpen={setOpen}>
          <Row label="Default reminder">
            <Select
              value="15 minutes before"
              options={["None", "At time", "15 minutes before", "1 hour before"]}
              onChange={() => undefined}
            />
          </Row>
          <Row label="Move completed to bottom">
            <Toggle checked onChange={() => undefined} label="Move completed to bottom" />
          </Row>
        </Group>

        <Group label="Notes" open={open} setOpen={setOpen}>
          <Row label="Default notebook">
            <Select
              value={notebooks.find((n) => n.id === settings.defaultNotebookId)?.name ?? "Personal"}
              options={notebooks.map((n) => n.name)}
              onChange={(v) =>
                updateSetting(
                  "defaultNotebookId",
                  notebooks.find((n) => n.name === v)?.id ?? "personal",
                )
              }
            />
          </Row>
          <Row
            label="Markdown shortcuts"
            hint="Shows the Bold / Heading / List toolbar in the note editor"
          >
            <Toggle
              checked={settings.markdownShortcuts}
              onChange={(v) => updateSetting("markdownShortcuts", v)}
              label="Markdown shortcuts"
            />
          </Row>
          <Row label="Editor width" hint="Note editor max width on desktop">
            <Select
              value={
                { narrow: "Narrow", comfortable: "Comfortable", wide: "Wide", full: "Full" }[
                  settings.editorWidth ?? "comfortable"
                ]
              }
              options={["Narrow", "Comfortable", "Wide", "Full"]}
              onChange={(v) =>
                updateSetting(
                  "editorWidth",
                  { Narrow: "narrow", Comfortable: "comfortable", Wide: "wide", Full: "full" }[
                    v as "Narrow"
                  ] as "narrow",
                )
              }
            />
          </Row>
        </Group>

        <Group label="Calendar" open={open} setOpen={setOpen}>
          <GoogleCalendarCard onToast={toast} />
          <Row label="Show declined events">
            <Toggle checked={false} onChange={() => undefined} label="Show declined events" />
          </Row>
        </Group>

        <Group label="Notifications" open={open} setOpen={setOpen}>
          <NotificationsCard />
        </Group>

        <Group label="Account" open={open} setOpen={setOpen}>
          <Row label="Profile name" hint="Shown in the header and sidebar">
            <input
              defaultValue={settings.displayName ?? ""}
              onBlur={(e) => updateSetting("displayName", e.target.value.trim())}
              placeholder={userName}
              aria-label="Display name"
              className="w-40 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-border-strong"
            />
          </Row>
          <Row label="Email" hint="Account identifier">
            <span className="text-[13px] text-muted-foreground">shantanu@kamkazi.com</span>
          </Row>
          <Row label="Data and privacy" hint="All notes as Markdown, zipped">
            <a
              href="/api/export-notes"
              download
              className="text-[13px] text-primary hover:underline"
            >
              Export notes (.zip)
            </a>
          </Row>
        </Group>

        <div className="h-10" />
      </div>
    </div>
  );
}

function Group({
  label,
  open,
  setOpen,
  children,
}: {
  label: string;
  open: string | null;
  setOpen: (v: string | null) => void;
  children: ReactNode;
}) {
  const expanded = open === label;
  return (
    <section className="panel mb-2 overflow-hidden rounded-xl">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen(expanded ? null : label)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-[14.5px] font-medium transition-colors hover:bg-surface-2/60"
      >
        {label}
        <ChevronRight
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
          aria-hidden
        />
      </button>
      {expanded ? <div className="border-t border-border px-4 py-1">{children}</div> : null}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[14px]">{label}</p>
        {hint ? <p className="text-[12.5px] text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={value}
      className="rounded-lg bg-surface-2 px-2 py-1.5 text-[13px] outline-none"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-surface shadow-panel transition-all",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

/** Stage 4.5 / 5.5 — Google Calendar (read-only) multi-account cards. */
interface AcctState {
  id: string;
  googleEmail: string;
  status: string;
  lastSynced: string | null;
  scopes: string[];
  calendars: { id: string; summary: string; primary?: boolean }[];
  selected: string[];
  listError?: string | undefined;
}

function GoogleCalendarCard({ onToast }: { onToast: (m: string) => void }) {
  const [accounts, setAccounts] = useState<AcctState[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [credsAlreadyStored, setCredsAlreadyStored] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/google/calendars");
      if (!res.ok) return;
      const data = (await res.json()) as {
        connected: boolean;
        accounts?: AcctState[];
        googleEmail?: string;
      };
      // Back-compat for old single-account payloads (shouldn't happen anymore).
      setAccounts(data.accounts ?? (data.googleEmail ? [] : []));
      if (data.accounts && data.accounts.length > 0) setCredsAlreadyStored(true);
      else setCredsAlreadyStored(Boolean(data.googleEmail));
    } catch {
      // ignore
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) return null;

  if (!accounts || accounts.length === 0) {
    return (
      <GoogleConnectForm
        showCreds={showCreds}
        setShowCreds={setShowCreds}
        clientId={clientId}
        setClientId={setClientId}
        clientSecret={clientSecret}
        setClientSecret={setClientSecret}
      />
    );
  }

  return (
    <>
      {accounts.map((acct) => (
        <GoogleAccountCard key={acct.id} acct={acct} onToast={onToast} onChanged={load} />
      ))}
      <div className="border-b border-border py-3 last:border-b-0">
        <button
          type="button"
          onClick={() => {
            window.location.href = "/api/google/auth";
          }}
          className="text-[13px] text-primary"
        >
          + Connect another Google account
        </button>
        {!showCreds || credsAlreadyStored ? null : (
          <div className="mt-2 flex flex-col gap-2">
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Client ID (…apps.googleusercontent.com)"
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary"
            />
            <input
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              type="password"
              placeholder="Client Secret"
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => {
                const q = new URLSearchParams({
                  client_id: clientId.trim(),
                  client_secret: clientSecret.trim(),
                });
                window.location.href = `/api/google/auth?${q.toString()}`;
              }}
              disabled={!clientId.trim() || !clientSecret.trim()}
              className="rounded-xl bg-primary py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              Save & connect with Google
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** One card per connected Google account (Stage 5.5). */
function GoogleAccountCard({
  acct,
  onToast,
  onChanged,
}: {
  acct: AcctState;
  onToast: (m: string) => void;
  onChanged: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(acct.selected);
  const [busy, setBusy] = useState(false);
  const revoked = acct.status === "revoked";

  const post = async (body: Record<string, unknown>, toastMsg: string) => {
    setBusy(true);
    await fetch("/api/google/calendars", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, accountId: acct.id }),
    });
    setBusy(false);
    if (toastMsg) onToast(toastMsg);
    onChanged();
  };

  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">Google Calendar</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {revoked
              ? "Connection needs attention — token revoked or expired"
              : `${acct.googleEmail || "Connected"} · Read-only${
                  acct.lastSynced
                    ? ` · last sync ${new Date(acct.lastSynced).toLocaleTimeString()}`
                    : ""
                }${acct.status.startsWith("error") ? ` · ${acct.status}` : ""}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {acct.scopes?.includes("https://www.googleapis.com/auth/gmail.readonly") ? (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
              Email enabled ✓
            </span>
          ) : null}
          {revoked ? (
            <button
              type="button"
              onClick={() => {
                window.location.href = "/api/google/auth";
              }}
              className="text-[13px] font-medium text-primary"
            >
              Reconnect
            </button>
          ) : null}
          <button
            type="button"
            onClick={() =>
              post({ action: "disconnect" }, "Google Calendar disconnected").then(() => undefined)
            }
            disabled={busy}
            className="text-[13px] text-destructive disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      </div>
      {!revoked && acct.calendars.length > 0 ? (
        <div className="mt-3 rounded-lg bg-surface-2/60 p-2.5">
          <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            Calendars to sync (every 15 min)
          </p>
          <div className="max-h-44 space-y-1 overflow-y-auto">
            {acct.calendars.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={picked.includes(c.id)}
                  onChange={(e) =>
                    setPicked((p) =>
                      e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id),
                    )
                  }
                  className="size-3.5 accent-[var(--color-primary)]"
                />
                <span className="truncate">{c.summary}</span>
                {c.primary ? (
                  <span className="text-[10.5px] text-muted-foreground">(primary)</span>
                ) : null}
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              post({ action: "saveSelection", calendarIds: picked }, "").then(() => undefined)
            }
            className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save selection"}
          </button>
        </div>
      ) : null}
      {!revoked && !acct.scopes?.includes("https://www.googleapis.com/auth/gmail.readonly") ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => {
              window.location.href = `/api/google/auth?email=1&account_id=${encodeURIComponent(acct.id)}`;
            }}
            disabled={busy}
            className="text-[12.5px] font-medium text-primary disabled:opacity-50"
          >
            Enable email (read-only Gmail)
          </button>
        </div>
      ) : null}
      {!revoked && acct.scopes?.includes("https://www.googleapis.com/auth/gmail.readonly") ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() =>
              post({ action: "disableEmail" }, "Email disabled for this account").then(
                () => undefined,
              )
            }
            disabled={busy}
            className="text-[12.5px] text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            Disable email
          </button>
        </div>
      ) : null}
      {!revoked ? <SourceEditors accountId={acct.id} onToast={onToast} /> : null}
    </div>
  );
}

/** Stage 5.6 — per-calendar name + colour editors, under the account card. */
function SourceEditors({
  accountId,
  onToast,
}: {
  accountId: string;
  onToast: (m: string) => void;
}) {
  const [sources, setSources] = useState<SrcState[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar");
      if (!res.ok) return;
      const data = (await res.json()) as { sources?: SrcState[] };
      setSources((data.sources ?? []).filter((s) => s.accountId === accountId));
    } catch {
      // ignore
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!sources || sources.length === 0) return null;

  const post = async (body: Record<string, unknown>) => {
    await fetch("/api/calendar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    onToast("Saved");
    void load();
  };

  return (
    <div className="mt-3 rounded-lg bg-surface-2/60 p-2.5">
      <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        Calendar names & colours
      </p>
      <div className="space-y-2.5">
        {sources.map((s) => (
          <SourceEditorRow key={s.id} src={s} post={post} />
        ))}
      </div>
    </div>
  );
}

const COLOUR_HEX: Record<string, string> = {
  blue: "var(--color-accent-blue)",
  green: "var(--color-accent-green)",
  amber: "var(--color-accent-amber)",
  purple: "var(--color-accent-violet)",
  rose: "var(--color-accent-rose)",
  cyan: "var(--color-accent-teal)",
};
const COLOUR_NAMES = Object.keys(COLOUR_HEX);

interface SrcState {
  id: string;
  sourceType: string;
  accountId: string;
  calendarId: string;
  displayName: string;
  colour: string;
  customName: boolean;
}

function SourceEditorRow({
  src,
  post,
}: {
  src: SrcState;
  post: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(src.displayName);
  useEffect(() => setName(src.displayName), [src.displayName]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: COLOUR_HEX[src.colour] ?? COLOUR_HEX["blue"] }}
          aria-hidden
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={`Display name for ${src.displayName || src.calendarId}`}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-[12.5px] outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={!name.trim() || name.trim() === src.displayName}
          onClick={() => void post({ action: "renameSource", id: src.id, displayName: name })}
          className="shrink-0 rounded-md border border-border px-2 py-1 text-[11.5px] font-medium hover:bg-surface-2 disabled:opacity-50"
        >
          Rename
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-4">
        {COLOUR_NAMES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Set colour ${c}`}
            aria-pressed={src.colour === c}
            onClick={() => void post({ action: "setSourceColour", id: src.id, colour: c })}
            className={cn(
              "size-4 rounded-full border transition-transform",
              src.colour === c ? "scale-110 ring-2 ring-ring" : "opacity-70 hover:opacity-100",
            )}
            style={{ backgroundColor: COLOUR_HEX[c] }}
          />
        ))}
      </div>
    </div>
  );
}

/** Stage 4.5 — first-connect form (client credentials + consent redirect). */
function GoogleConnectForm({
  showCreds,
  setShowCreds,
  clientId,
  setClientId,
  clientSecret,
  setClientSecret,
}: {
  showCreds: boolean;
  setShowCreds: (v: boolean) => void;
  clientId: string;
  setClientId: (v: string) => void;
  clientSecret: string;
  setClientSecret: (v: string) => void;
}) {
  return (
    <Row label="Google Calendar" hint="Read-only">
      <span className="flex flex-col items-stretch gap-2">
        {showCreds ? (
          <div className="flex w-full flex-col gap-2">
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Client ID (…apps.googleusercontent.com)"
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary"
            />
            <input
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              type="password"
              placeholder="Client Secret"
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => {
                const q = new URLSearchParams({
                  client_id: clientId.trim(),
                  client_secret: clientSecret.trim(),
                });
                window.location.href = `/api/google/auth?${q.toString()}`;
              }}
              disabled={!clientId.trim() || !clientSecret.trim()}
              className="rounded-xl bg-primary py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              Save & connect with Google
            </button>
            <button
              type="button"
              onClick={() => setShowCreds(false)}
              className="text-[12px] text-muted-foreground underline decoration-dotted underline-offset-2"
            >
              Cancel
            </button>
          </div>
        ) : (
          <span className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCreds(true)}
              className="text-[13px] text-primary"
            >
              Connect Google Calendar
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/notes";
              }}
              className="text-[12px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              How to get Google Client ID?
            </button>
          </span>
        )}
      </span>
    </Row>
  );
}

import { BellRing, Mail } from "lucide-react";

/** Stage 5 — NotificationSettings shape stored in user_settings JSON. */
interface NotificationSettings {
  notifyMinutesBefore: number;
  taskReminders: boolean;
  eventReminders: boolean;
  dailyDigest: boolean;
  digestTime: string;
  emailNotifications: boolean;
  emailTo: string | null;
}

interface PushInfo {
  vapidPublicKey: string | null;
  vapidConfigured: boolean;
  emailConfigured: boolean;
  emailFrom: string | null;
  notificationSettings: NotificationSettings;
  devices: {
    id: string;
    endpoint: string;
    userAgent: string | null;
    createdAtTs: string;
    lastUsedTs: string | null;
  }[];
}

/** "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) … Safari/605" → "Mac Safari". */
function deviceName(ua: string): string {
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Macintosh/.test(ua)
        ? "Mac"
        : /Android/.test(ua)
          ? "Android"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return `${os} · ${browser}`;
}

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as { MSStream?: unknown }).MSStream
  );
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true; // iOS home-screen app
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches
  );
}

/** Stage 5 — web push + email notification controls. */
function NotificationsCard() {
  const [info, setInfo] = useState<PushInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [permState, setPermState] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/push");
      if (res.ok) {
        const data = (await res.json()) as PushInfo;
        setInfo(data);
        if (navigator.serviceWorker) {
          const reg = await navigator.serviceWorker.ready.catch(() => null);
          const sub = reg ? await reg.pushManager.getSubscription() : null;
          setSubscribed(Boolean(sub));
        }
        if (isIOS() && !isStandalone()) setIosHint(true);
      }
    } catch {
      // ignore
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enableNotifications = useCallback(async () => {
    setBusy("enable");
    try {
      if (typeof Notification === "undefined") {
        toast.error("Notifications are not supported in this browser");
        return;
      }
      const perm = await Notification.requestPermission();
      setPermState(perm);
      if (perm !== "granted") {
        toast.error("Notification permission was not granted");
        return;
      }
      if (!info?.vapidPublicKey) {
        toast.error("Push is not configured on the server (VAPID keys missing)");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(info.vapidPublicKey),
      });
      const raw = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const res = await fetch("/api/push?action=subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...raw, userAgent: navigator.userAgent }),
      });
      if (!res.ok) {
        toast.error("Could not save the subscription");
        return;
      }
      setSubscribed(true);
      toast.success("Notifications enabled on this device");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Subscription failed");
    } finally {
      setBusy(null);
    }
  }, [info, load]);

  const unsubscribe = useCallback(async () => {
    setBusy("unsubscribe");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push?action=unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast("Notifications disabled on this device");
      void load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  const testPush = useCallback(async () => {
    setBusy("testPush");
    try {
      const res = await fetch("/api/push?action=test", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        attempts?: { ok: boolean; error?: string }[];
      };
      if (data.ok && (data.attempts?.length ?? 0) > 0) {
        toast.success(`Test push sent to ${data.attempts!.length} device(s)`);
      } else {
        toast.error(data.error ?? "No subscribed devices — enable notifications first");
      }
      void load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  const testEmail = useCallback(async () => {
    setBusy("testEmail");
    try {
      const res = await fetch("/api/push?action=test-email", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string; to?: string };
      if (data.ok) toast.success(`Test email sent to ${data.to}`);
      else toast.error(data.error ?? "Email failed");
    } finally {
      setBusy(null);
    }
  }, []);

  const patchSettings = useCallback(async (patch: Partial<NotificationSettings>) => {
    setInfo((prev) =>
      prev ? { ...prev, notificationSettings: { ...prev.notificationSettings, ...patch } } : prev,
    );
    await fetch("/api/push?action=settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  }, []);

  if (!loaded) return null;

  const ns: NotificationSettings = info?.notificationSettings ?? {
    notifyMinutesBefore: 10,
    taskReminders: true,
    eventReminders: true,
    dailyDigest: false,
    digestTime: "08:00",
    emailNotifications: false,
    emailTo: null,
  };

  const pushReady = info?.vapidConfigured;
  const canPushHere = permState === "granted" && subscribed;

  return (
    <>
      {iosHint ? (
        <div className="my-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-600 dark:text-amber-300">
          On iPhone/iPad, notifications only work in the installed app. Use the share menu
          &ldquo;Add to Home Screen&rdquo; first, then open Kamkazi from the home screen and enable
          notifications there.
        </div>
      ) : null}
      {permState === "denied" ? (
        <div className="my-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-600 dark:text-amber-300">
          Notifications are blocked for this site in your browser settings. To allow them: click the
          padlock / tune icon next to the address bar &rarr; Site settings &rarr; Notifications
          &rarr; Allow, then reload.
        </div>
      ) : null}

      <Row
        label="Push on this device"
        hint={
          canPushHere
            ? "Subscribed"
            : permState === "granted"
              ? "Permission granted — not subscribed"
              : permState === "unsupported"
                ? "Not supported here"
                : `Permission: ${permState}`
        }
      >
        <span className="flex items-center gap-2">
          {canPushHere ? (
            <button
              type="button"
              onClick={unsubscribe}
              disabled={busy === "unsubscribe"}
              className="rounded-lg border border-border px-2.5 py-1.5 text-[13px] transition-colors hover:border-border-strong disabled:opacity-50"
            >
              Disable on this device
            </button>
          ) : (
            <button
              type="button"
              onClick={enableNotifications}
              disabled={!pushReady || busy === "enable" || permState === "unsupported"}
              className="rounded-xl bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5">
                <BellRing className="size-4" aria-hidden />
                Enable notifications
              </span>
            </button>
          )}
        </span>
      </Row>

      <Row
        label="Send test push"
        hint={pushReady ? "Sends a notification to all your devices" : "Server push not configured"}
      >
        <button
          type="button"
          onClick={testPush}
          disabled={busy === "testPush"}
          className="text-[13px] text-primary disabled:opacity-50"
        >
          Send
        </button>
      </Row>

      <Row label="Remind me at" hint="Pushes fire AT the task's due time (and at event start)">
        <span className="text-[13px] text-muted-foreground">Due time only</span>
      </Row>

      <Row label="Task reminders">
        <Toggle
          checked={ns.taskReminders}
          onChange={(v) => patchSettings({ taskReminders: v })}
          label="Task reminders"
        />
      </Row>

      <Row label="Event alerts">
        <Toggle
          checked={ns.eventReminders}
          onChange={(v) => patchSettings({ eventReminders: v })}
          label="Event alerts"
        />
      </Row>

      <Row label="Daily plan digest" hint="Morning summary of tasks + next events">
        <Toggle
          checked={ns.dailyDigest}
          onChange={(v) => patchSettings({ dailyDigest: v })}
          label="Daily plan digest"
        />
      </Row>

      {ns.dailyDigest ? (
        <Row label="Digest time" hint="IST">
          <input
            type="time"
            value={ns.digestTime}
            onChange={(e) => patchSettings({ digestTime: e.target.value })}
            aria-label="Digest time (IST)"
            className="rounded-lg bg-surface-2 px-2 py-1.5 text-[13px] outline-none"
          />
        </Row>
      ) : null}

      <Row
        label="Email notifications"
        hint={
          info?.emailConfigured
            ? `From ${info.emailFrom ?? "—"} (sender must be verified in SendGrid)`
            : "Email disabled — SENDGRID_API_KEY not configured"
        }
      >
        <Toggle
          checked={ns.emailNotifications}
          onChange={(v) => patchSettings({ emailNotifications: v })}
          label="Email notifications"
        />
      </Row>

      {ns.emailNotifications ? (
        <Row label="Send email to" hint="Where reminders are emailed">
          <input
            type="email"
            defaultValue={ns.emailTo ?? ""}
            onBlur={(e) => patchSettings({ emailTo: e.target.value.trim() || null })}
            placeholder="you@example.com"
            aria-label="Email recipient for notifications"
            className="w-44 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-border-strong"
          />
        </Row>
      ) : null}

      {/* Devices — one row per push_subscriptions entry (created / last used). */}
      <div className="border-b border-border pt-3">
        <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          Devices ({info?.devices.length ?? 0})
        </p>
        {(info?.devices ?? []).length === 0 ? (
          <p className="pb-3 text-[12.5px] text-muted-foreground">
            No devices subscribed yet — enable notifications above.
          </p>
        ) : (
          <ul className="pb-3">
            {(info?.devices ?? []).map((d) => {
              const shortEp = d.endpoint.replace(/^https:\/\/([^/]+)\/.{0,10}/, "$1…");
              return (
                <li key={d.id} className="flex items-center gap-3 border-b border-border py-2 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]">
                      {d.userAgent ? deviceName(d.userAgent) : "Unknown device"}
                    </p>
                    <p className="truncate text-[11.5px] text-muted-foreground">
                      Added {new Date(d.createdAtTs).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {d.lastUsedTs ? ` · last push ${new Date(d.lastUsedTs).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : " · never pushed"}
                      {" · "}
                      {shortEp}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void fetch("/api/push?action=unsubscribe", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ endpoint: d.endpoint }),
                      }).then(() => {
                        toast("Device removed");
                        void load();
                      });
                    }}
                    className="shrink-0 text-[12.5px] text-destructive disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Row
        label="Send test email"
        hint={info?.emailConfigured ? "" : "No SendGrid API key configured"}
      >
        <button
          type="button"
          onClick={testEmail}
          disabled={!info?.emailConfigured || busy === "testEmail"}
          className="flex items-center gap-1.5 text-[13px] text-primary disabled:opacity-50"
        >
          <Mail className="size-4" aria-hidden />
          Send
        </button>
      </Row>
    </>
  );
}
