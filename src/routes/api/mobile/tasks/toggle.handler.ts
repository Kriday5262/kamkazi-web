/**
 * POST /api/mobile/tasks/toggle { id } — native app task completion.
 * Mirrors the web toggleTask: done flips in place; a repeating task spawns
 * its next occurrence on a future date (always rolled past today, IST).
 */
import { mobileAuth, mobileJson, mobileUnauthorized } from "@/server/mobile-auth.server";
import { istToday, nextRepeatDate } from "@/lib/format";

export async function mobileTaskToggleHandler(request: Request): Promise<Response> {
  const session = await mobileAuth(request);
  if (!session) return mobileUnauthorized();
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return mobileJson({ ok: false, error: "Missing task id" }, 400);

  const { db } = await import("@/db");
  const { tasks } = await import("@/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, body.id), eq(tasks.userId, session.uid)))
    .limit(1);
  const t = rows[0];
  if (!t) return mobileJson({ ok: false, error: "Task not found" }, 404);

  const now = new Date();
  const done = !t.done;
  const spawnedId = { v: null as string | null };

  if (done && t.repeat && t.repeat !== "never") {
    // Standard recurrence model: instance stays done in place; spawn next
    // occurrence on a future date (matches web behaviour + toast copy).
    const today = istToday();
    let nextDue = t.dueDate ?? today;
    for (let i = 0; i < 366; i++) {
      nextDue = nextRepeatDate(nextDue, t.repeat);
      if (nextDue > today) break;
    }
    const newId = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(tasks).values({
      id: newId,
      userId: t.userId,
      listId: t.listId,
      title: t.title,
      notes: t.notes,
      done: false,
      dueDate: nextDue,
      dueTime: t.dueTime,
      repeat: t.repeat,
      priority: t.priority,
      tags: t.tags,
      subtasks: t.subtasks,
      meta: t.meta,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdAtTs: now,
      updatedAtTs: now,
    });
    spawnedId.v = newId;
    await db
      .update(tasks)
      .set({ done: true, updatedAtTs: now })
      .where(eq(tasks.id, t.id));
    return mobileJson({ ok: true, done: true, spawnedId: newId, nextDue });
  }

  await db
    .update(tasks)
    .set({ done, updatedAtTs: now })
    .where(eq(tasks.id, t.id));
  return mobileJson({ ok: true, done });
}