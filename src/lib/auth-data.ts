/**
 * Client-safe data server functions (loadAll). Kept outside src/server/** so
 * the import-protection plugin allows route modules to import the RPC proxies
 * without bundling the DB layer into the client.
 *
 * `loadAll` runs on the server only (it is a createServerFn RPC); the client
 * just gets the serialized result.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  calendarEvents,
  chatMessages,
  conversations,
  notes,
  notebooks,
  taskLists,
  tasks,
  userSettings,
} from "@/db/schema";
import { requireUid, requestMiddleware, sessionFromRequest } from "@/request-context";
import { getAppleConfigForUser } from "@/server/apple-reminders-sync.server";
import { decryptSecret } from "@/server/crypto.server";
import { calendarSources, timesheetEntries, timesheetSummaries } from "@/db/schema";
import type {
  CalendarEvent,
  ChatMessage,
  Conversation,
  Note,
  Priority,
  Task,
  TaskList,
} from "@/data/seed";

export const getSession = createServerFn({ method: "GET" })
  .middleware([requestMiddleware])
  .handler(async ({ context }) => {
    const session = await sessionFromRequest(context.request);
    return { username: session?.username ?? null, uid: session?.uid ?? null };
  });

export const loadAll = createServerFn({ method: "GET" })
  .middleware([requestMiddleware])
  .handler(async ({ context }) => {
    const uid = await requireUid(context);

    const srow = await db.select().from(userSettings).where(eq(userSettings.userId, uid));

    const [listRows, taskRows, notebookRows, noteRows, eventRows, convRows] = await Promise.all([
      db
        .select()
        .from(taskLists)
        .where(eq(taskLists.userId, uid))
        .orderBy(asc(taskLists.createdAt)),
      db.select().from(tasks).where(eq(tasks.userId, uid)).orderBy(asc(tasks.createdAtTs)),
      db
        .select()
        .from(notebooks)
        .where(eq(notebooks.userId, uid))
        .orderBy(asc(notebooks.createdAt)),
      db.select().from(notes).where(eq(notes.userId, uid)).orderBy(asc(notes.createdAtTs)),
      db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.userId, uid))
        .orderBy(asc(calendarEvents.date)),
      db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, uid))
        .orderBy(asc(conversations.createdAtTs)),
    ]);

    const msgRows = await Promise.all(
      convRows.map((c) =>
        db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.conversationId, c.id))
          .orderBy(asc(chatMessages.createdAtTs)),
      ),
    );

    // Stage 5.6 — resolve friendly calendar names + colours from the registry.
    const sourceRows = await db
      .select()
      .from(calendarSources)
      .where(eq(calendarSources.userId, uid));
    const sourceByKey = new Map(
      sourceRows.map((s) => [`${s.sourceType}|${s.accountId}|${s.calendarId}`, s]),
    );
    const labelFor = (e: (typeof eventRows)[number]): string => {
      const src = e.googleAccountId
        ? sourceByKey.get(`google|${e.googleAccountId}|${e.calendar}`)
        : e.subscriptionId
          ? sourceByKey.get(`ics|${e.subscriptionId}|${e.subscriptionId}`)
          : undefined;
      return src?.displayName.trim() || e.calendar;
    };

    const conversationsOut: Conversation[] = convRows.map((c, i) => {
      const msgs = msgRows[i] ?? [];
      return {
        id: c.id,
        title: c.title,
        pinned: c.pinned || undefined,
        updatedAt: isoDateOf(c.updatedAtTs),
        messages: msgs.map((m): ChatMessage => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          action: m.action ? { ...m.action, kind: m.action.kind as "task" | "note" } : undefined,
        })),
      };
    });

    const datedEvents: Record<string, CalendarEvent[]> = {};
    for (const e of eventRows) {
      const ev: CalendarEvent = {
        id: e.id,
        title: e.title,
        start: e.start ?? undefined,
        durationMin: e.durationMin ?? undefined,
        allDay: e.allDay || undefined,
        location: e.location ?? undefined,
        calendar: labelFor(e) as "Work" | "Personal",
      };
      (datedEvents[e.date] ??= []).push(ev);
    }

    return {
      lists: listRows.map((l): TaskList => ({
        id: l.id,
        name: l.name,
        icon: l.icon,
        color: l.color,
      })),
      tasks: taskRows.map(mapTask),
      notebooks: notebookRows.map((n) => ({ id: n.id, name: n.name, icon: n.icon })),
      notes: noteRows.map(mapNote),
      datedEvents,
      conversations: conversationsOut,
      settings: ((srow[0]?.settings ?? {}) as Record<string, string | number | boolean>) ?? {},
    };
  });

export type LoadAllResult = Awaited<ReturnType<typeof loadAll>>;

function isoDateOf(d: Date): string {
  // Canonical calendar day is IST (+05:30) — keep in sync with format.ts istToday.
  const ist = new Date(d.getTime() + 330 * 60_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
}

function mapTask(t: typeof tasks.$inferSelect): Task {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes ?? undefined,
    listId: t.listId,
    done: t.done,
    dueDate: t.dueDate ?? undefined,
    dueTime: t.dueTime ?? undefined,
    reminder: t.reminder ?? undefined,
    repeat: t.repeat ?? undefined,
    priority: t.priority as Priority,
    tags: t.tags,
    subtasks: t.subtasks,
    attachments: t.attachments,
    meta: (t.meta as Task["meta"]) ?? undefined,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function isoDateTimeOf(d: Date): string {
  // Full ISO datetime (IST canonical day, kept sortable lexicographically).
  const ist = new Date(d.getTime() + 330 * 60_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(
    ist.getUTCDate(),
  ).padStart(2, "0")}T${String(ist.getUTCHours()).padStart(2, "0")}:${String(
    ist.getUTCMinutes(),
  ).padStart(2, "0")}:${String(ist.getUTCSeconds()).padStart(2, "0")}`;
}

function mapNote(n: typeof notes.$inferSelect): Note {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    notebookId: n.notebookId,
    tags: n.tags,
    pinned: n.pinned,
    updatedAt: isoDateOf(n.updatedAtTs),
    createdAt: isoDateTimeOf(n.createdAtTs),
  };
}
// ---------------------------------------------------------------------------
// Writes (each re-verifies ownership via userId)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

export const saveTask = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { task: Task; nextTask?: Task | undefined }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    const write = async (t: Task) => {
      const values = {
        userId: uid,
        listId: t.listId,
        title: t.title,
        notes: t.notes ?? null,
        done: t.done,
        dueDate: t.dueDate ?? null,
        dueTime: t.dueTime ?? null,
        reminder: t.reminder ?? null,
        repeat: t.repeat ?? null,
        priority: t.priority,
        tags: t.tags,
        subtasks: t.subtasks,
        attachments: t.attachments,
        meta: t.meta ?? null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        updatedAtTs: new Date(),
      };
      const existing = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, t.id), eq(tasks.userId, uid)));
      if (existing.length === 0) {
        await db.insert(tasks).values({ id: t.id, ...values });
      } else {
        await db
          .update(tasks)
          .set(values)
          .where(and(eq(tasks.id, t.id), eq(tasks.userId, uid)));
      }
    };
    await write(data.task);
    // Optional companion row written in the SAME request (e.g. the next
    // occurrence of a repeating task) — guarantees single-call semantics.
    if (data.nextTask) await write(data.nextTask);
    return { ok: true };
  });

export const deleteTaskFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    // Apple-synced task? Also cancel it on Apple (delete → Apple cancel).
    const row = (
      await db.select().from(tasks).where(and(eq(tasks.id, data.id), eq(tasks.userId, uid))).limit(1)
    )[0];
    await db.delete(tasks).where(and(eq(tasks.id, data.id), eq(tasks.userId, uid)));
    if (row) {
      const m = (row.meta ?? null) as { apple?: { uid?: string; href?: string } } | null;
      if (m?.apple?.href) {
        try {
          const cfg = await getAppleConfigForUser(uid);
          if (cfg) {
            const { deleteAppleTodo } = await import("@/server/apple-reminders-sync.server");
            await deleteAppleTodo(m.apple.href, {
              username: cfg.appleId,
              password: decryptSecret(cfg.appPasswordEnc),
            });
          }
        } catch {
          // Apple deletion is best-effort; the pull pass reconciles the rest.
        }
      }
    }
    return { ok: true };
  });

export const deleteTasksFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { ids: string[] }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    if (!data.ids.length) return { ok: true, deleted: 0 };
    await db.delete(tasks).where(and(inArray(tasks.id, data.ids), eq(tasks.userId, uid)));
    return { ok: true, deleted: data.ids.length };
  });

export const deleteNotesFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { ids: string[] }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    if (!data.ids.length) return { ok: true, deleted: 0 };
    await db.delete(notes).where(and(inArray(notes.id, data.ids), eq(notes.userId, uid)));
    return { ok: true, deleted: data.ids.length };
  });

export const addListFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { list: TaskList }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    await db.insert(taskLists).values({
      id: data.list.id,
      userId: uid,
      name: data.list.name,
      icon: data.list.icon,
      color: data.list.color,
    });
    return { ok: true };
  });

export const updateListFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { id: string; name: string; icon: string }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    const name = data.name.trim().slice(0, 60);
    if (!name) return { ok: false, error: "name required" };
    await db
      .update(taskLists)
      .set({ name, icon: data.icon })
      .where(and(eq(taskLists.id, data.id), eq(taskLists.userId, uid)));
    return { ok: true };
  });

export const deleteListFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    // Destructive: removes the list and every task in it.
    await db.delete(tasks).where(and(eq(tasks.listId, data.id), eq(tasks.userId, uid)));
    await db.delete(taskLists).where(and(eq(taskLists.id, data.id), eq(taskLists.userId, uid)));
    return { ok: true };
  });

export const updateNotebookFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { id: string; name: string; icon: string }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    const name = data.name.trim().slice(0, 60);
    if (!name) return { ok: false, error: "name required" };
    await db
      .update(notebooks)
      .set({ name, icon: data.icon })
      .where(and(eq(notebooks.id, data.id), eq(notebooks.userId, uid)));
    return { ok: true };
  });

export const addNotebookFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { id: string; name: string; icon: string }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    await db.insert(notebooks).values({
      id: data.id,
      userId: uid,
      name: data.name.trim().slice(0, 60),
      icon: data.icon,
    });
    return { ok: true };
  });

export const deleteNotebookFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    // Destructive: removes the notebook and every note in it.
    await db.delete(notes).where(and(eq(notes.notebookId, data.id), eq(notes.userId, uid)));
    await db.delete(notebooks).where(and(eq(notebooks.id, data.id), eq(notebooks.userId, uid)));
    return { ok: true };
  });

export const saveNote = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { note: Note }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    const n = data.note;
    const values = {
      userId: uid,
      notebookId: n.notebookId,
      title: n.title,
      body: n.body,
      tags: n.tags,
      pinned: n.pinned,
      updatedAtTs: new Date(),
    };
    const existing = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, n.id), eq(notes.userId, uid)));
    if (existing.length === 0) {
      await db.insert(notes).values({ id: n.id, ...values });
    } else {
      await db
        .update(notes)
        .set(values)
        .where(and(eq(notes.id, n.id), eq(notes.userId, uid)));
    }
    return { ok: true };
  });

export const deleteNoteFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    await db.delete(notes).where(and(eq(notes.id, data.id), eq(notes.userId, uid)));
    return { ok: true };
  });

export const saveConversation = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { conversation: Conversation }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    const c = data.conversation;
    const owned = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, c.id), eq(conversations.userId, uid)));
    const values = {
      userId: uid,
      title: c.title,
      pinned: c.pinned ?? false,
      updatedAtTs: new Date(),
    };
    if (owned.length === 0) {
      await db.insert(conversations).values({ id: c.id, ...values });
    } else {
      await db.update(conversations).set(values).where(eq(conversations.id, c.id));
    }
    await db.delete(chatMessages).where(eq(chatMessages.conversationId, c.id));
    if (c.messages.length > 0) {
      await db.insert(chatMessages).values(
        c.messages.map((m) => ({
          id: m.id,
          conversationId: c.id,
          role: m.role,
          content: m.content,
          action: m.action ?? null,
        })),
      );
    }
    return { ok: true };
  });

export const deleteConversationFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    await db
      .delete(conversations)
      .where(and(eq(conversations.id, data.id), eq(conversations.userId, uid)));
    return { ok: true };
  });

export const saveSettingsFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { settings: Record<string, unknown> }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    // Merge with the existing blob: server-only keys (googleClientId/
    // googleClientSecret) are never sent by the client and must survive saves.
    const existing = await db
      .select({ settings: userSettings.settings })
      .from(userSettings)
      .where(eq(userSettings.userId, uid))
      .limit(1);
    const merged = {
      ...((existing[0]?.settings ?? {}) as Record<string, unknown>),
      ...data.settings,
    };
    await db
      .insert(userSettings)
      .values({ userId: uid, settings: merged, updatedAtTs: new Date() })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { settings: merged, updatedAtTs: new Date() },
      });
    return { ok: true };
  });

// ------------------------- Timesheet module ---------------------------------

export interface TimesheetEntry {
  id: string;
  date: string; // IST "YYYY-MM-DD"
  title: string;
  type: string;
  area: string;
  hours?: string | undefined;
  note?: string | undefined;
  createdAt: string;
}

export const loadTimesheet = createServerFn({ method: "GET" })
  .middleware([requestMiddleware])
  .handler(async ({ context }) => {
    const uid = await requireUid(context);
    const rows = await db
      .select()
      .from(timesheetEntries)
      .where(eq(timesheetEntries.userId, uid))
      .orderBy(asc(timesheetEntries.date), asc(timesheetEntries.createdAtTs));
    return {
      entries: rows.map((r): TimesheetEntry => ({
        id: r.id,
        date: r.date,
        title: r.title,
        type: r.type,
        area: r.area,
        hours: r.hours ?? undefined,
        note: r.note ?? undefined,
        createdAt: r.createdAtTs.toISOString(),
      })),
    };
  });

export const saveTimesheetFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator(
    (input: {
      entry: {
        id: string;
        date: string;
        title: string;
        type: string;
        area: string;
        hours?: string;
        note?: string;
      };
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    const t = data.entry;
    const values = {
      userId: uid,
      date: t.date,
      title: t.title,
      type: t.type,
      area: t.area,
      hours: t.hours || null,
      note: t.note || null,
      updatedAtTs: new Date(),
    };
    const existing = await db
      .select({ id: timesheetEntries.id })
      .from(timesheetEntries)
      .where(and(eq(timesheetEntries.id, t.id), eq(timesheetEntries.userId, uid)));
    if (existing.length === 0) {
      await db.insert(timesheetEntries).values({ id: t.id, ...values });
    } else {
      await db.update(timesheetEntries).set(values).where(eq(timesheetEntries.id, t.id));
    }
    return { ok: true };
  });

export const deleteTimesheetFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    await db
      .delete(timesheetEntries)
      .where(and(eq(timesheetEntries.id, data.id), eq(timesheetEntries.userId, uid)));
    return { ok: true };
  });

export const clearTimesheetSummaryFn = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { date: string }) => input)
  .handler(async ({ data, context }) => {
    const uid = await requireUid(context);
    await db
      .delete(timesheetSummaries)
      .where(and(eq(timesheetSummaries.date, data.date), eq(timesheetSummaries.userId, uid)));
    return { ok: true };
  });
