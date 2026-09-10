import { createFileRoute, redirect } from "@tanstack/react-router";
import { CheckCircle2, Lock, User } from "lucide-react";
import { useState } from "react";
import { login } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  // The only unauthenticated route: bounce logged-in users to Today.
  beforeLoad: async () => {
    const { getSession } = await import("@/lib/auth-client");
    const session = await getSession();
    if (session.username) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [{ title: "Sign in — Kamkazi" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await login({ data: { username, password } });
      if (res.ok) {
        // The server set the HttpOnly session cookie on the response.
        window.location.href = "/";
        return;
      }
      setError(res.ok ? null : res.error);
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-panel)]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="gradient-primary grid size-11 place-items-center rounded-2xl text-primary-foreground shadow-[var(--shadow-3d)]">
            <CheckCircle2 className="size-6" aria-hidden />
          </span>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Sign in to your calm daily workspace.</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-foreground">Username</span>
            <span className="relative block">
              <User
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Your username"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
              />
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-foreground">Password</span>
            <span className="relative block">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Your password"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
              />
            </span>
          </label>

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
