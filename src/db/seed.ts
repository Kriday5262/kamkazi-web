/**
 * Idempotent seed: inserts the content of src/data/seed.ts once.
 * Skips entirely if the stage-1 user already has task lists.
 *
 * Run: npm run db:seed
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import {
  calendarEvents,
  chatMessages,
  conversations,
  notes,
  notebooks,
  taskLists,
  tasks,
  userSettings,
  users,
} from "./schema";
import {
  datedEvents,
  events,
  notebooks as seedNotebooks,
  seedConversations,
  seedNotes,
  seedTasks,
  taskLists as seedLists,
} from "../../src/data/seed";

const UID = "u_shantanu";

async function main() {
  const existingUser = await db.select().from(users).where(eq(users.id, UID));
  if (existingUser.length > 0) {
    const existingLists = await db.select().from(taskLists).where(eq(taskLists.userId, UID));
    if (existingLists.length > 0) {
      console.log("Seed skipped: user already seeded.");
      return;
    }
  } else {
    await db.insert(users).values({ id: UID, username: "Shantanu", password: "(stage1)" });
  }

  await db
    .insert(taskLists)
    .values(
      seedLists.map((l) => ({ id: l.id, userId: UID, name: l.name, icon: l.icon, color: l.color })),
    );

  await db
    .insert(notebooks)
    .values(seedNotebooks.map((n) => ({ id: n.id, userId: UID, name: n.name, icon: n.icon })));

  await db.insert(tasks).values(
    seedTasks.map((t) => ({
      id: t.id,
      userId: UID,
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
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  );

  await db.insert(notes).values(
    seedNotes.map((n) => ({
      id: n.id,
      userId: UID,
      notebookId: n.notebookId,
      title: n.title,
      body: n.body,
      tags: n.tags,
      pinned: n.pinned,
    })),
  );

  // The prototype shows both today's schedule and dated events; seed all of
  // them into calendar_events keyed by UTC date.
  const today = new Date().toISOString().slice(0, 10);
  const allEvents = [
    ...events.map((e) => ({ ...e, date: today })),
    ...datedEvents.filter((e) => !events.some((s) => s.id === e.id)),
  ];
  await db.insert(calendarEvents).values(
    allEvents.map((e) => ({
      id: e.id,
      userId: UID,
      title: e.title,
      date: e.date,
      start: e.start ?? null,
      durationMin: e.durationMin ?? null,
      allDay: e.allDay ?? false,
      location: e.location ?? null,
      calendar: e.calendar,
      attendees: [] as string[],
    })),
  );

  for (const c of seedConversations) {
    await db.insert(conversations).values({
      id: c.id,
      userId: UID,
      title: c.title,
      pinned: c.pinned ?? false,
    });
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
  }

  await db
    .insert(userSettings)
    .values({
      userId: UID,
      settings: {
        defaultListId: "inbox",
        defaultNotebookId: "personal",
        startPage: "Today",
        units: "C",
        // Weather location locked by product owner (Stage 4: Open-Meteo).
        weatherLocation: "Dehradun",
        weatherLat: 30.3165,
        weatherLon: 78.0322,
        // Stage 3 AI provider; "hermes" = local Hermes agent API on SmartHub.
        aiProvider: "hermes",
        dailyBriefing: true,
        taskReminders: true,
        eventAlerts: true,
        markdownShortcuts: true,
        aiPersonalisation: true,
      },
    })
    .onConflictDoNothing();

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
