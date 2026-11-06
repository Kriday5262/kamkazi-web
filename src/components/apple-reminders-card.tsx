/**
 * Apple Reminders sync card for Settings — connect with Apple ID +
 * app-specific password, choose lists, sync now, disconnect.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";

interface AppleState {
  connected: boolean;
  enabled: boolean;
  appleId: string | null;
  listNames: string[];
}

export function AppleRemindersCard({ onToast }: { onToast: (m: string) => void }) {
  const [state, setState] = useState<AppleState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [appleId, setAppleId] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [listNames, setListNames] = useState("Reminders, Routine");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/apple-reminders");
      if (res.ok) setState((await res.json()) as AppleState);
    } catch {
      // ignore
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (body: Record<string, unknown>, toastMsg?: string): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await fetch("/api/apple-reminders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          onToast(data.error ?? "Request failed");
          return false;
        }
        if (toastMsg) onToast(toastMsg);
        await load();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [load, onToast],
  );

  if (!loaded) return null;

  if (!state?.connected) {
    return (
      <div className="space-y-3 py-3">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Sync Apple Reminders into Kamkazi two-way. Create an app-specific password at{" "}
          <span className="font-medium">
            appleid.apple.com → Sign-In &amp; Security → App-Specific Passwords
          </span>
          , then connect here.
        </p>
        <div className="grid gap-2">
          <input
            value={appleId}
            onChange={(e) => setAppleId(e.target.value)}
            placeholder="apple ID email (e.g. you@icloud.com)"
            autoComplete="off"
            className="h-9 rounded-lg border border-border bg-surface px-3 text-[13px]"
          />
          <input
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            placeholder="app-specific password (xxxx-xxxx-xxxx-xxxx)"
            type="password"
            autoComplete="off"
            className="h-9 rounded-lg border border-border bg-surface px-3 text-[13px]"
          />
          <input
            value={listNames}
            onChange={(e) => setListNames(e.target.value)}
            placeholder="lists to sync, comma-separated (empty = all)"
            className="h-9 rounded-lg border border-border bg-surface px-3 text-[13px]"
          />
        </div>
        <button
          type="button"
          disabled={busy || !appleId.trim() || !appPassword.trim()}
          onClick={async () => {
            const names = listNames
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const ok = await post(
              { action: "connect", appleId, appPassword, listNames: names },
              "Apple Reminders connected — syncing…",
            );
            if (ok) {
              setAppPassword("");
              void post({ action: "syncNow" });
            }
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
        >
          <Link2 className="size-4" aria-hidden /> {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{state.appleId}</p>
          <p className="text-[12px] text-muted-foreground">
            Lists: {state.listNames.length ? state.listNames.join(", ") : "all"} ·{" "}
            {state.enabled ? "active (3-min sync)" : "paused"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label="Sync now"
            disabled={busy}
            onClick={() => void post({ action: "syncNow" }, "Sync complete")}
            className="grid size-8 place-items-center rounded-lg border border-border hover:bg-surface-2 disabled:opacity-50"
          >
            <RefreshCw className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={state.enabled ? "Pause sync" : "Resume sync"}
            disabled={busy}
            onClick={() => void post({ action: "setEnabled", enabled: !state.enabled })}
            className="rounded-lg border border-border px-2.5 py-1.5 text-[12px] hover:bg-surface-2 disabled:opacity-50"
          >
            {state.enabled ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            aria-label="Disconnect"
            disabled={busy}
            onClick={() => {
              if (
                confirm("Disconnect Apple Reminders sync? Existing mirrored tasks stay in Kamkazi.")
              ) {
                void post({ action: "disconnect" }, "Disconnected");
              }
            }}
            className="grid size-8 place-items-center rounded-lg border border-border hover:bg-surface-2 disabled:opacity-50"
          >
            <Unlink className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <p className="text-[11.5px] text-muted-foreground">
        Two-way: edits, completions and new tasks flow both directions every ~3 minutes. Apple tasks
        appear in Kamkazi lists named after their Reminders list.
      </p>
    </div>
  );
}

// keep toast import referenced for callers that pass sonner's toast directly
void toast;
