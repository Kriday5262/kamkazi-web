/**
 * POST /api/mobile/tasks { title, dueDate?, dueTime?, repeat?, priority? }
 * — quick-add a task from the native app.
 */
import { mobileAuth, mobileJson, mobileUnauthorized } from "@/server/mobile-auth.server";
import { istNowStamp } from "@/lib/format";

export async function mobileTaskCreateHandler(request: Request): Promise<Response> {
  const session = await mobileAuth(request);
  if (!session) return mobileUnauthorized();
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    dueDate?: string;
    dueTime?: string;
    repeat?: string;
    priority?: string;
  };
  const title = body.title?.trim();
  if (!title) return mobileJson({ ok: false, error: "Missing title" }, 400);

  const { db } = await import("@/db");
  const { tasks } = await import("@/db/schema");
  const now = new Date();
  const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(tasks).values({
    id,
    userId: session.uid,
    listId: "inbox",
    title,
    done: false,
    dueDate: body.dueDate?.trim() || null,
    dueTime: body.dueTime?.trim() || null,
    repeat: body.repeat?.trim() || null,
    priority: body.priority?.trim() || "none",
    tags: [],
    subtasks: [],
    createdAt: istNowStamp(),
    updatedAt: istNowStamp(),
    createdAtTs: now,
    updatedAtTs: now,
  });
  return mobileJson({ ok: true, id });
}