/**
 * Stage 5 — Reminder engine.
 *
 * In-memory scheduler, same pattern as calendar-sync: a 60-second tick that
 * scans for due reminders and dispatches them through web push (all of the
 * user's subscribed devices) and email (if enabled in settings).
 *
 * Idempotency: every send is keyed in `reminder_state` — a restarted
 * process re-reads the table and never double-sends.
 *
 * What it sends:
 *  - Task due-time reminders: notifyMinutesBefore (default 10) before a
 *    task's dueTime, for tasks due today in Asia/Kolkata.
 *  - Calendar event reminders: same lead time before an event's startUtc.
 *  - Daily plan digest: at the configured IST time (default 08:00), a
 *    summary of today's tasks + next events (push + email).
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, reminderState, tasks } from "@/db/schema";
import { pushToUser } from "@/server/push.server";
import { emailConfigured, sendMail } from "@/server/email.server";

export const TICK_INTERVAL_MS = 60_000;
/** IST = UTC+5:30, no DST — fixed offset is correct year-round. */
const IST_OFFSET_MIN = 330;

const schedulerState = globalThis as typeof globalThis & {
  __kamkaziReminderTimer?: ReturnType<typeof setInterval> | undefined;
};

export interface NotificationSettings {
  /** Minutes before a due time to fire the reminder. */
  notifyMinutesBefore: number;
  taskReminders: boolean;
  eventReminders: boolean;
  /** Daily "Today's plan" digest. */
  dailyDigest: boolean;
  /** IST "HH:MM" for the digest. */
  digestTime: string;
  emailNotifications: boolean;
  emailTo: string | null;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notifyMinutesBefore: 10,
  taskReminders: true,
  eventReminders: true,
  dailyDigest: false,
  digestTime: "08:00",
  emailNotifications: false,
  emailTo: null,
};

/** Load notification settings for a user, merged over defaults. */
export async function loadNotificationSettings(
  userId: string,
): Promise<{ settings: NotificationSettings; raw: Record<string, unknown> }> {
  const { userSettings } = await import("@/db/schema");
  const srows = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  const raw = (srows[0]?.settings ?? {}) as Record<string, unknown>;
  const ns = (raw["notificationSettings"] ?? {}) as Partial<NotificationSettings>;
  return { settings: { ...DEFAULT_NOTIFICATION_SETTINGS, ...ns }, raw };
}

/** Persist notification settings inside user_settings JSON. */
export async function saveNotificationSettings(
  userId: string,
  patch: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const { settings } = await loadNotificationSettings(userId);
  const next = { ...settings, ...patch };
  const { userSettings } = await import("@/db/schema");
  const merged = { notificationSettings: next } as Record<string, unknown>;
  await db
    .insert(userSettings)
    .values({
      userId,
      settings: merged as unknown as Record<string, unknown>,
      updatedAtTs: new Date(),
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { settings: merged as unknown as Record<string, unknown>, updatedAtTs: new Date() },
    });
  return next;
}

/** Current date ("YYYY-MM-DD") and "HH:MM" in IST. */
export function istNow(): { date: string; time: string; minutesOfDay: number; utc: Date } {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60_000);
  const date = ist.toISOString().slice(0, 10);
  const time = ist.toISOString().slice(11, 16);
  const minutesOfDay = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return { date, time, minutesOfDay, utc: now };
}

async function alreadySent(userId: string, key: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(reminderState)
    .where(and(eq(reminderState.userId, userId), eq(reminderState.key, key)));
  return rows.length > 0;
}

async function markSent(userId: string, key: string, kind: string): Promise<void> {
  await db
    .insert(reminderState)
    .values({ id: `${userId}:${key}`, userId, key, kind, sentTs: new Date() })
    .onConflictDoNothing();
}

/** Deliver one reminder to all channels; returns a short status line for logs. */
async function deliver(
  userId: string,
  key: string,
  kind: string,
  payload: { title: string; body: string; url?: string },
  emailTo: string | null,
): Promise<string> {
  await markSent(userId, key, kind);
  const attempts = await pushToUser(userId, { ...payload, tag: key });
  let line = `push:${attempts.filter((a) => a.ok).length}ok/${attempts.length}`;
  const pruned = attempts.filter((a) => a.gone).length;
  if (pruned) line += ` pruned:${pruned}`;
  if (emailTo && emailConfigured()) {
    const r = await sendMail(emailTo, payload.title, `${payload.body}\n\n— Kamkazi`, undefined);
    line += ` email:${r.ok ? "sent" : `fail(${r.status ?? "?"})`}`;
  }
  console.log(`[reminders] ${kind} ${key} → ${line}`);
  return line;
}

export interface TickResult {
  at: string;
  taskReminders: number;
  eventReminders: number;
  digests: number;
  details: string[];
}

/** One scheduler pass. Also exported for the dev-only /api/push/tick endpoint. */
export async function runReminderTick(force = false): Promise<TickResult> {
  const result: TickResult = {
    at: new Date().toISOString(),
    taskReminders: 0,
    eventReminders: 0,
    digests: 0,
    details: [],
  };
  const { date: istDate, minutesOfDay, utc } = istNow();

  // ---- Task due-time reminders ----
  const taskRows = await db.select().from(tasks).where(eq(tasks.dueDate, istDate));
  const userIds = new Set<string>([...taskRows.map((t) => t.userId)]);
  // Events may belong to users with no tasks today.
  const evRows = await db.select().from(calendarEvents).where(eq(calendarEvents.date, istDate));
  for (const e of evRows) userIds.add(e.userId);

  for (const uid of userIds) {
    const { settings } = await loadNotificationSettings(uid);
    const lead = settings.notifyMinutesBefore;
    const emailTo = settings.emailNotifications ? (settings.emailTo ?? null) : null;

    if (settings.taskReminders) {
      for (const t of taskRows.filter((r) => r.userId === uid && !r.done && r.dueTime)) {
        const tparts = t.dueTime!.split(":");
        const hh = Number(tparts[0] ?? 0);
        const mm = Number(tparts[1] ?? 0);
        const dueMin = hh * 60 + mm;
        const delta = dueMin - minutesOfDay; // minutes until due
        const inWindow = delta <= lead && delta >= 0;
        const overdue = delta < 0 && delta >= -lead; // catch late ticks
        if (!(inWindow || overdue)) continue;
        const key = `task:${t.id}:${istDate}`;
        if (!force && (await alreadySent(uid, key))) continue;
        if (force && (await alreadySent(uid, key))) {
          // force (dev tick) re-sends but keeps the idempotency marker.
          const attempts = await pushToUser(uid, {
            title: `Due soon: ${t.title}`,
            body: `Due at ${t.dueTime} today.`,
            url: "/tasks",
          });
          result.details.push(`forced task:${t.id} → ${attempts.length} devices`);
          continue;
        }
        const line = await deliver(
          uid,
          key,
          "task-due",
          {
            title: `Due soon: ${t.title}`,
            body: `Due at ${t.dueTime} today.`,
            url: "/tasks",
          },
          emailTo,
        );
        result.taskReminders += 1;
        result.details.push(`task:${t.id} ${line}`);
      }
    }

    if (settings.eventReminders) {
      for (const e of evRows.filter((r) => r.userId === uid && r.startUtc && !r.allDay)) {
        const start = new Date(e.startUtc!).getTime();
        const deltaMin = (start - utc.getTime()) / 60_000;
        if (deltaMin > lead || deltaMin < -lead) continue;
        const key = `event:${e.id}:${e.startUtc}`;
        if (!force && (await alreadySent(uid, key))) continue;
        if (force && (await alreadySent(uid, key))) {
          const attempts = await pushToUser(uid, {
            title: `Starting soon: ${e.title}`,
            body: `Starts at ${e.start ?? ""} today.`.trim(),
            url: "/calendar",
          });
          result.details.push(`forced event:${e.id} → ${attempts.length} devices`);
          continue;
        }
        const line = await deliver(
          uid,
          key,
          "event-start",
          {
            title: `Starting soon: ${e.title}`,
            body: `Starts at ${e.start ?? ""} today.`.trim(),
            url: "/calendar",
          },
          emailTo,
        );
        result.eventReminders += 1;
        result.details.push(`event:${e.id} ${line}`);
      }
    }

    if (settings.dailyDigest) {
      const dparts = settings.digestTime.split(":");
      const dh = Number(dparts[0] ?? 0);
      const dm = Number(dparts[1] ?? 0);
      const digestMinute = dh * 60 + dm;
      // Fire within the digest minute ± 2 (tolerance for the 60s tick).
      if (Math.abs(minutesOfDay - digestMinute) <= 2) {
        const key = `digest:${uid}:${istDate}`;
        if (!force && (await alreadySent(uid, key))) continue;
        if (force && (await alreadySent(uid, key))) continue;
        const today = taskRows.filter((r) => r.userId === uid && !r.done);
        const nextEvents = evRows
          .filter((r) => r.userId === uid && !r.allDay && r.start)
          .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""))
          .slice(0, 5);
        const lines = [
          `You have ${today.length} task${today.length === 1 ? "" : "s"} due today.`,
          ...today.slice(0, 5).map((t) => `  • ${t.title}${t.dueTime ? ` (${t.dueTime})` : ""}`),
          nextEvents.length
            ? `Coming up: ${nextEvents.map((e) => `${e.title} @ ${e.start}`).join("; ")}`
            : "",
        ].filter(Boolean);
        const body = lines.join("\n");
        const line = await deliver(
          uid,
          key,
          "daily-digest",
          {
            title: "Today's plan",
            body,
            url: "/",
          },
          emailTo,
        );
        result.digests += 1;
        result.details.push(`digest ${line}`);
      }
    }
  }
  return result;
}

/** Idempotent in-process 60s scheduler. */
export function startReminderScheduler(): void {
  if (schedulerState.__kamkaziReminderTimer) return;
  schedulerState.__kamkaziReminderTimer = setInterval(() => {
    runReminderTick().catch((err) => console.error("[reminders] tick failed:", err));
  }, TICK_INTERVAL_MS);
  schedulerState.__kamkaziReminderTimer.unref?.();
}
