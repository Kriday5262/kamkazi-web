/**
 * Apple Reminders ⇄ Kamkazi tasks sync engine.
 *
 * Design (mirrors calendar-sync.server.ts patterns):
 *  - Credentials live encrypted in the user_settings blob under key
 *    "appleReminders": { appleId, appPasswordEnc, listNames[], enabled }.
 *  - A timer ticks every SYNC_INTERVAL_MS per process; each tick syncs every
 *    user that has credentials stored. Idempotent: tasks keyed by their Apple
 *    UID via meta.apple.uid, so re-runs upsert rather than duplicate.
 *  - Direction:
 *      Apple → Kamkazi: create/update/complete/delete local mirror rows.
 *      Kamkazi → Apple: complete/reopen, edit title/notes/due/priority,
 *                       create new tasks in a synced list.
 *  - Two lists by name ("Reminders", "Routine"); a configured name missing on
 *    the Apple side is skipped and the rest still sync.
 *
 * Conflict rule: newest last-modified wins (Apple Last-Modified vs Kamkazi
 * updatedAtTs), with a 5s skew guard. Completion state is always reconciled
 * both ways (cheap and idempotent), regardless of timestamps.
 */
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { taskLists, tasks, userSettings } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/server/crypto.server";
import {
  buildVtodo,
  completeVcalendar,
  CalDavError,
  fetchTodos,
  listReminderCalendars,
  todoUrl,
  type CalDavTodo,
} from "@/server/apple-caldav.server";

export const SYNC_INTERVAL_MS = 3 * 60_000; // 3 minutes
export const DEFAULT_LIST_NAMES = ["Reminders", "Routine"] as const;

type TaskRow = typeof tasks.$inferSelect;
type Auth = { username: string; password: string };

/** Apple PRIORITY: 1-4 high, 5-6 medium (Apple shows 5..9 as such), else low/none. */
export function applePriorityToKamkazi(p: number): "none" | "low" | "medium" | "high" {
  if (!p) return "none";
  if (p >= 1 && p <= 4) return "high";
  if (p >= 5 && p <= 6) return "medium";
  return "low";
}

/** Kamkazi priority → Apple PRIORITY (0/1/5/9). */
export function kamkaziPriorityToApple(p: string): number {
  switch (p) {
    case "high":
      return 1;
    case "medium":
      return 5;
    case "low":
      return 9;
    default:
      return 0;
  }
}

export interface AppleRemindersConfig {
  appleId: string;
  /** Encrypted (AES-GCM base64url) app-specific password. */
  appPasswordEnc: string;
  /** Reminders list names to sync; empty = all lists. */
  listNames: string[];
  enabled: boolean;
}

export function loadAppleConfig(settings: Record<string, unknown>): AppleRemindersConfig | null {
  const raw = settings["appleReminders"];
  if (!raw || typeof raw !== "object") return null;
  const cfg = raw as Partial<AppleRemindersConfig>;
  if (!cfg.appleId || !cfg.appPasswordEnc) return null;
  return {
    appleId: cfg.appleId,
    appPasswordEnc: cfg.appPasswordEnc,
    listNames: Array.isArray(cfg.listNames)
      ? cfg.listNames.filter((n): n is string => typeof n === "string")
      : [],
    enabled: cfg.enabled !== false,
  };
}

async function settingsBlobFor(userId: string): Promise<Record<string, unknown>> {
  const rows = await db
    .select({ settings: userSettings.settings })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return (rows[0]?.settings ?? {}) as Record<string, unknown>;
}

export async function getAppleConfigForUser(userId: string): Promise<AppleRemindersConfig | null> {
  return loadAppleConfig(await settingsBlobFor(userId));
}

/** Save config; encrypts a newly supplied password, keeps the old blob otherwise. */
export async function saveAppleConfigForUser(
  userId: string,
  input: { appleId?: string; appPassword?: string; listNames?: string[]; enabled?: boolean },
): Promise<void> {
  const blob = await settingsBlobFor(userId);
  const prev = loadAppleConfig(blob);
  const next: AppleRemindersConfig = {
    appleId: input.appleId?.trim() || prev?.appleId || "",
    appPasswordEnc:
      input.appPassword && input.appPassword.trim()
        ? encryptSecret(input.appPassword.trim())
        : (prev?.appPasswordEnc ?? ""),
    listNames: input.listNames ?? prev?.listNames ?? [],
    enabled: input.enabled ?? prev?.enabled ?? true,
  };
  if (!next.appleId || !next.appPasswordEnc)
    throw new Error("Apple ID and app password are both required");
  await db
    .insert(userSettings)
    .values({ userId, settings: { ...blob, appleReminders: next }, updatedAtTs: new Date() })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { settings: { ...blob, appleReminders: next }, updatedAtTs: new Date() },
    });
}

export interface AppleSyncState {
  /** Apple list collection URL → Kamkazi taskLists.id. */
  listMap: Record<string, string>;
  /** Apple VTODO href → { uid, listId, lastmodRaw, taskId }. */
  todos: Record<
    string,
    { uid: string; listId: string; lastmodRaw?: string | undefined; taskId: string }
  >;
  lastSyncTs: string | null;
  lastError: string | null;
}

const EMPTY_STATE: AppleSyncState = { listMap: {}, todos: {}, lastSyncTs: null, lastError: null };

function loadSyncState(settings: Record<string, unknown>): AppleSyncState {
  const raw = settings["appleRemindersSyncState"];
  if (!raw || typeof raw !== "object") return { ...EMPTY_STATE, listMap: {}, todos: {} };
  const s = raw as Partial<AppleSyncState>;
  return {
    listMap: (s.listMap ?? {}) as Record<string, string>,
    todos: (s.todos ?? {}) as AppleSyncState["todos"],
    lastSyncTs: s.lastSyncTs ?? null,
    lastError: s.lastError ?? null,
  };
}

async function saveSyncState(
  userId: string,
  blob: Record<string, unknown>,
  state: AppleSyncState,
): Promise<void> {
  const settings = { ...blob, appleRemindersSyncState: state };
  await db
    .insert(userSettings)
    .values({ userId, settings, updatedAtTs: new Date() })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { settings, updatedAtTs: new Date() },
    });
}

/** Apple Last-Modified stamp → epoch ms (NaN when absent/unparseable). */
function lastmodMs(raw: string | undefined): number {
  if (!raw) return NaN;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? NaN : t;
}

/** Deterministic mirror task id for an Apple UID. */
function uidToKamkaziId(appleUid: string): string {
  return `kam_apple_${createHash("sha1").update(appleUid).digest("hex").slice(0, 24)}`;
}

/** Fetch (or create) the mirror TaskList for an Apple list name. */
async function ensureMirrorList(userId: string, appleName: string): Promise<string> {
  const rows = await db
    .select()
    .from(taskLists)
    .where(and(eq(taskLists.userId, userId), eq(taskLists.name, appleName)))
    .limit(1);
  if (rows[0]?.id) return rows[0].id;
  const id = `lst_apple_${createHash("sha1").update(`${userId}:${appleName}`).digest("hex").slice(0, 20)}`;
  await db
    .insert(taskLists)
    .values({ id, userId, name: appleName, icon: "list", color: "var(--color-primary)" })
    .onConflictDoNothing();
  return id;
}

function appleMetaOf(t: TaskRow): { uid?: string; href?: string } | undefined {
  const m = (t.meta ?? null) as { apple?: { uid?: string; href?: string } } | null;
  return m?.apple ?? undefined;
}

export interface SyncStats {
  ok: boolean;
  created: number;
  updated: number;
  completed: number;
  deleted: number;
  pushed: number;
  error?: string | undefined;
}

/** One full sync pass for one user. */
export async function syncUserReminders(userId: string): Promise<SyncStats> {
  const cfg = await getAppleConfigForUser(userId);
  if (!cfg || !cfg.enabled) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      completed: 0,
      deleted: 0,
      pushed: 0,
      error: "not-configured",
    };
  }
  const stats: SyncStats = {
    ok: true,
    created: 0,
    updated: 0,
    completed: 0,
    deleted: 0,
    pushed: 0,
  };
  const blob = await settingsBlobFor(userId);
  const state = loadSyncState(blob);
  const auth: Auth = { username: cfg.appleId, password: decryptSecret(cfg.appPasswordEnc) };

  try {
    // ── Discover lists (respect configured names when set) ─────────────
    const allLists = await listReminderCalendars(auth.username, auth.password);
    let wanted = cfg.listNames.length
      ? allLists.filter((l) => cfg.listNames.some((n) => n.toLowerCase() === l.name.toLowerCase()))
      : allLists;
    // Configured names match nothing on Apple (e.g. renamed lists) → sync ALL
    // lists rather than silently doing nothing.
    if (cfg.listNames.length > 0 && wanted.length === 0) wanted = allLists;
    // Prefer CalDAV-native ("kamkazi-*") collections: Apple's modern Reminders
    // lists share names with them but expose no content over CalDAV. When both
    // exist for a name, sync ONLY the kamkazi-* one (its data actually flows).
    wanted = wanted.filter(
      (l) =>
        l.url.includes("kamkazi-") ||
        !wanted.some((o) => o.url.includes("kamkazi-") && o.name.toLowerCase() === l.name.toLowerCase()),
    );
    for (const l of wanted) state.listMap[l.url] = await ensureMirrorList(userId, l.name);

    // Local tasks indexed by Apple uid (for pull diffing).
    const existingRows = await db.select().from(tasks).where(eq(tasks.userId, userId));
    const localByAppleUid = new Map<string, TaskRow>();
    for (const t of existingRows) {
      const m = appleMetaOf(t);
      if (m?.uid) localByAppleUid.set(m.uid, t);
    }

    // ── Pull: Apple → Kamkazi ──────────────────────────────────────────
    for (const l of wanted) {
      const listId = state.listMap[l.url] ?? (await ensureMirrorList(userId, l.name));
      const remote = await fetchTodos(l.url, auth);
      const seenUids = new Set<string>();

      for (const td of remote) {
        seenUids.add(td.uid);
        const local = localByAppleUid.get(td.uid);

        if (!local) {
          const id = uidToKamkaziId(td.uid);
          const now = new Date().toISOString();
          await db
            .insert(tasks)
            .values({
              id,
              userId,
              listId,
              title: td.summary,
              notes: td.description || null,
              done: td.completed,
              dueDate: td.dueDate ?? null,
              dueTime: td.dueTime ?? null,
              priority: applePriorityToKamkazi(td.priority),
              tags: ["apple"],
              subtasks: [],
              attachments: [],
              meta: { apple: { uid: td.uid, href: td.href } },
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing();
          state.todos[td.href] = { uid: td.uid, listId, lastmodRaw: td.lastmod, taskId: id };
          stats.created += 1;
          continue;
        }

        // Winner = newer last-modified (5s skew guard). When ONLY the done
        // flag differs and Apple's stamp is NOT newer, Kamkazi wins (a local
        // toggle is pending push; overwriting here would revert the user's
        // action before the push pass sees it).
        const rlm = lastmodMs(td.lastmod);
        const klm = local.updatedAtTs.getTime();
        const appleNewer = !Number.isNaN(rlm) && rlm >= klm - 5_000;
        const doneChanged = td.completed !== local.done;
        // Apple todos often lack LAST-MODIFIED (NaN). When the done flag
        // differs and Apple gives no timestamp, treat a recently-edited local
        // task (within one sync interval) as a pending push → Kamkazi wins.
        const localRecentlyEdited = Date.now() - klm < SYNC_INTERVAL_MS - 30_000;
        if (appleNewer || (doneChanged && Number.isNaN(rlm) && !localRecentlyEdited)) {
          await db
            .update(tasks)
            .set({
              title: td.summary,
              notes: td.description || null,
              done: td.completed,
              dueDate: td.dueDate ?? null,
              dueTime: td.dueTime ?? null,
              priority: applePriorityToKamkazi(td.priority),
              updatedAt: new Date().toISOString(),
              updatedAtTs: new Date(),
            })
            .where(and(eq(tasks.id, local.id), eq(tasks.userId, userId)));
          if (doneChanged) stats.completed += 1;
          else stats.updated += 1;
        }
        state.todos[td.href] = { uid: td.uid, listId, lastmodRaw: td.lastmod, taskId: local.id };
      }

      // Apple deletions: mirrored tasks in THIS list whose Apple task vanished.
      for (const [auid, local] of localByAppleUid) {
        if (local.listId !== listId || seenUids.has(auid)) continue;
        await db.delete(tasks).where(and(eq(tasks.id, local.id), eq(tasks.userId, userId)));
        stats.deleted += 1;
      }
    }

    // ── Push: Kamkazi → Apple ──────────────────────────────────────────
    for (const l of wanted) {
      const listId = state.listMap[l.url];
      if (!listId) continue;
      const localTasks = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.listId, listId)));

      for (const lt of localTasks) {
        const meta = appleMetaOf(lt);

        if (meta?.href) {
          const remoteNow = (await fetchTodos(l.url, auth)).find((t) => t.href === meta.href);
          if (!remoteNow) continue;
          const rlm = lastmodMs(remoteNow.lastmod);
          const appleNewer = !Number.isNaN(rlm) && rlm >= lt.updatedAtTs.getTime() - 5_000;

          if (lt.done !== remoteNow.completed) {
            // Completion state is authoritative both ways — always reconcile.
            const body = lt.done
              ? completeVcalendar(remoteNow.raw)
              : reopenVcalendar(remoteNow.raw);
            if (await davPut(meta.href, auth, body, remoteNow.etag)) {
              state.todos[meta.href] = {
                uid: meta.uid ?? remoteNow.uid,
                listId,
                lastmodRaw: new Date().toISOString(),
                taskId: lt.id,
              };
              stats.pushed += 1;
            }
            continue;
          }
          if (appleNewer) continue; // Apple is ahead; pull already handled it

          const changed =
            lt.title !== remoteNow.summary ||
            (lt.notes ?? "") !== remoteNow.description ||
            lt.dueDate !== (remoteNow.dueDate ?? null) ||
            lt.dueTime !== (remoteNow.dueTime ?? null) ||
            kamkaziPriorityToApple(lt.priority) !== remoteNow.priority;
          if (!changed) continue;
          const body = buildVtodo({
            uid: meta.uid ?? remoteNow.uid,
            summary: lt.title,
            description: lt.notes ?? undefined,
            dueDate: lt.dueDate ?? undefined,
            dueTime: lt.dueTime ?? undefined,
            priority: kamkaziPriorityToApple(lt.priority),
          });
          if (await davPut(meta.href, auth, body)) {
            state.todos[meta.href] = {
              uid: meta.uid ?? remoteNow.uid,
              listId,
              lastmodRaw: new Date().toISOString(),
              taskId: lt.id,
            };
            stats.pushed += 1;
          }
        } else {
          // Local-only task in a synced list → create on Apple.
          const uid = randomUUID();
          const body = buildVtodo({
            uid,
            summary: lt.title,
            description: lt.notes ?? undefined,
            dueDate: lt.dueDate ?? undefined,
            dueTime: lt.dueTime ?? undefined,
            priority: kamkaziPriorityToApple(lt.priority),
          });
          const url = todoUrl(l.url, uid);
          if (await davPut(url, auth, body)) {
            stats.pushed += 1;
            const nextMeta = { ...(lt.meta ?? {}), apple: { uid, href: url } };
            await db
              .update(tasks)
              .set({ meta: nextMeta, updatedAtTs: new Date() })
              .where(and(eq(tasks.id, lt.id), eq(tasks.userId, userId)));
          }
        }
      }
    }

    state.lastSyncTs = new Date().toISOString();
    state.lastError = null;
    await saveSyncState(userId, blob, state);
    return stats;
  } catch (err) {
    const message =
      err instanceof CalDavError ? `CalDAV ${err.status}: ${err.message}` : String(err);
    state.lastError = message.slice(0, 400);
    await saveSyncState(userId, blob, state).catch(() => undefined);
    return {
      ok: false,
      created: 0,
      updated: 0,
      completed: 0,
      deleted: 0,
      pushed: 0,
      error: state.lastError ?? "sync failed",
    };
  }
}

/** PUT a VCALENDAR to an href. True on success. */
async function davPut(url: string, auth: Auth, body: string, ifMatch?: string): Promise<boolean> {
  const headers: Record<string, string> = {
    authorization:
      "Basic " + Buffer.from(`${auth.username}:${auth.password}`, "utf8").toString("base64"),
    "Content-Type": "text/calendar; charset=utf-8",
  };
  if (ifMatch) headers["If-Match"] = ifMatch;
  try {
    const res = await fetch(url, { method: "PUT", headers, body });
    return res.ok || res.status === 201 || res.status === 204;
  } catch {
    return false;
  }
}

/** DELETE an Apple task (used when a synced Kamkazi task is deleted). */
export async function deleteAppleTodo(href: string, auth: Auth): Promise<boolean> {
  try {
    const res = await fetch(href, {
      method: "DELETE",
      headers: {
        authorization:
          "Basic " + Buffer.from(`${auth.username}:${auth.password}`, "utf8").toString("base64"),
      },
    });
    return res.ok || res.status === 204 || res.status === 404;
  } catch {
    return false;
  }
}

/** Flip an existing VTODO back to NEEDS-ACTION (reopen). */
export function reopenVcalendar(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  let inTodo = false;
  for (const line of lines) {
    if (/^BEGIN:VTODO/i.test(line)) inTodo = true;
    else if (/^END:VTODO/i.test(line)) inTodo = false;
    if (inTodo && (/^STATUS:/i.test(line) || /^COMPLETED:/i.test(line))) continue;
    out.push(line);
  }
  const i = out.findIndex((l) => /^BEGIN:VTODO/i.test(l));
  if (i >= 0) out.splice(i + 1, 0, "STATUS:NEEDS-ACTION");
  return out.join("\r\n");
}

/** Timer bootstrap — same shape as startSubscriptionScheduler(). */
const schedulerState = globalThis as typeof globalThis & {
  __kamkaziAppleRemindersTimer?: ReturnType<typeof setInterval> | undefined;
};

export function startAppleRemindersScheduler(): void {
  if (schedulerState.__kamkaziAppleRemindersTimer) return;
  const tick = async (): Promise<void> => {
    try {
      const rows = await db.select().from(userSettings);
      for (const row of rows) {
        const cfg = loadAppleConfig(row.settings as Record<string, unknown>);
        if (!cfg?.enabled) continue;
        try {
          await syncUserReminders(row.userId);
        } catch (err) {
          console.error("[apple-reminders] sync failed for", row.userId, err);
        }
      }
    } catch (err) {
      console.error("[apple-reminders] tick failed:", err);
    }
  };
  void tick();
  schedulerState.__kamkaziAppleRemindersTimer = setInterval(() => {
    void tick();
  }, SYNC_INTERVAL_MS);
}
