/**
 * GET /api/mobile/agenda?date=YYYY-MM-DD — native app day agenda:
 * tasks due on the date (+ overdue, date-strict, Today only) and calendar
 * events on the date, merged. IST day convention as the rest of the app.
 */
import { mobileAuth, mobileJson, mobileUnauthorized } from "@/server/mobile-auth.server";
import { istToday } from "@/lib/format";

export async function mobileAgendaHandler(request: Request): Promise<Response> {
  const session = await mobileAuth(request);
  if (!session) return mobileUnauthorized();
  const url = new URL(request.url);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") ?? "")
    ? url.searchParams.get("date")!
    : istToday();
  const today = istToday();

  const { db } = await import("@/db");
  const { tasks, calendarEvents } = await import("@/db/schema");
  const { and, eq, lte } = await import("drizzle-orm");

  const taskRows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, session.uid))
    .limit(1000);

  const eventRows = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.userId, session.uid), eq(calendarEvents.date, date)));

  // Overdue section: only when viewing Today, only date-strict (matches web).
  const overdue =
    date === today
      ? taskRows.filter((t) => !t.done && t.dueDate && t.dueDate < today)
      : [];
  overdue.sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));

  const dayTasks = taskRows.filter((t) => t.dueDate === date);
  const shape = (t: (typeof taskRows)[number]) => ({
    id: t.id,
    title: t.title,
    done: t.done,
    dueDate: t.dueDate,
    dueTime: t.dueTime,
    repeat: t.repeat,
    priority: t.priority,
    tags: t.tags,
  });

  const events = eventRows
    .map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      start: e.start,
      allDay: e.allDay,
      location: e.location,
      calendar: e.calendar,
    }))
    .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));

  return mobileJson({
    date,
    today,
    overdue: overdue.map(shape),
    tasks: dayTasks.map(shape),
    events,
  });
}