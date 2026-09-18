/**
 * GET /api/mobile/tasks?filter=today|open|done|all — Bearer-auth task feed
 * for the native iOS app (P1 phase). Mirrors the web app's task shape.
 */
import { mobileAuth, mobileJson, mobileUnauthorized } from "@/server/mobile-auth.server";
import { istToday } from "@/lib/format";

export async function mobileTasksHandler(request: Request): Promise<Response> {
  const session = await mobileAuth(request);
  if (!session) return mobileUnauthorized();
  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") ?? "open";
  const { db } = await import("@/db");
  const { tasks } = await import("@/db/schema");
  const { desc, eq } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, session.uid))
    .orderBy(desc(tasks.createdAtTs))
    .limit(500);
  const today = istToday();
  let list = rows;
  if (filter === "today") list = rows.filter((t) => t.dueDate === today && !t.done);
  else if (filter === "open") list = rows.filter((t) => !t.done);
  else if (filter === "done") list = rows.filter((t) => t.done);
  return mobileJson({
    tasks: list.map((t) => ({
      id: t.id,
      listId: t.listId,
      title: t.title,
      notes: t.notes,
      done: t.done,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      repeat: t.repeat,
      priority: t.priority,
      tags: t.tags,
      subtasks: t.subtasks,
      hasEmail: !!(t.meta as { email?: unknown } | null)?.email,
      createdAt: t.createdAtTs,
    })),
  });
}