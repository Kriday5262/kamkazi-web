/** Handler for GET /api/mobile/tasks — Bearer-auth task feed. */
import { mobileAuth, mobileJson, mobileUnauthorized } from "@/server/mobile-auth.server";

export async function mobileTasksHandler(request: Request): Promise<Response> {
  const session = await mobileAuth(request);
  if (!session) return mobileUnauthorized();
  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") ?? "open";
  const { db } = await import("@/db");
  const { tasks } = await import("@/db/schema");
  const { eq, desc } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, session.uid))
    .orderBy(desc(tasks.createdAtTs));
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
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
      hasEmail: !!t.meta?.email,
      createdAt: t.createdAtTs,
    })),
  });
}