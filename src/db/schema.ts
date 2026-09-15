/**
 * Drizzle schema for Kamkazi (Stage 1).
 *
 * Conventions:
 * - All timestamps are `timestamptz` (stored UTC) — the app is UTC-disciplined.
 * - Every user-owned table is scoped by `user_id` from day one. Even though
 *   auth is currently a single hardcoded user, multi-user later becomes a
 *   schema-level fact and never requires a migration of business tables.
 * - The server always resolves the user from the signed session cookie; the
 *   client never sends a user identifier.
 *
 * Tags: stored as Postgres `text[]` arrays rather than a join table. The app
 * treats tags as free-form, user-typed labels (no per-tag metadata, no tag
 * relationships), and the prototype only ever needs "all tags" / "filter by
 * tag". A join table would add three queries and rows per write for zero
 * capability we use today; it can be introduced if tag-level features land.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskLists = pgTable("task_lists", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("list"),
  color: text("color").notNull().default("var(--color-muted-foreground)"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Subtasks and attachments are small, always loaded with the task, and only
 *  ever mutated as a whole — jsonb keeps them simple and correct. */
export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listId: text("list_id").notNull(),
    title: text("title").notNull(),
    notes: text("notes"),
    done: boolean("done").notNull().default(false),
    /** ISO date "YYYY-MM-DD" (no timezone semantics). */
    dueDate: text("due_date"),
    /** "HH:MM" */
    dueTime: text("due_time"),
    reminder: text("reminder"),
    repeat: text("repeat"),
    priority: text("priority").notNull().default("none"),
    tags: text("tags").array().notNull().default([]),
    subtasks: jsonb("subtasks")
      .$type<{ id: string; title: string; done: boolean }[]>()
      .notNull()
      .default([]),
    attachments: jsonb("attachments")
      .$type<
        {
          id: string;
          name: string;
          size: string;
          type?: string | undefined;
          path?: string | undefined;
        }[]
      >()
      .notNull()
      .default([]),
    /** Optional deep-link metadata (e.g. source email). */
    meta: jsonb("meta")
      .$type<{ email?: { accountId: string; id: string; subject: string; from: string; date: string } } | undefined>()
      .default(undefined),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    createdAtTs: timestamp("created_at_ts", { withTimezone: true }).notNull().defaultNow(),
    updatedAtTs: timestamp("updated_at_ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_user_list_idx").on(t.userId, t.listId)],
);

export const notebooks = pgTable("notebooks", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("book-open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notebookId: text("notebook_id").notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    tags: text("tags").array().notNull().default([]),
    pinned: boolean("pinned").notNull().default(false),
    createdAtTs: timestamp("created_at_ts", { withTimezone: true }).notNull().defaultNow(),
    updatedAtTs: timestamp("updated_at_ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notes_user_notebook_idx").on(t.userId, t.notebookId)],
);

/** The prototype's calendar events are day/timed entries, so we keep the
 *  prototype's shape: a UTC date string plus optional start/duration. */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** ICS UID when the event came from a subscription (idempotent sync). */
    icsUid: text("ics_uid"),
    /** Owning subscription, null for locally-created events. */
    subscriptionId: text("subscription_id"),
    /** UTC start instant (ISO) for timed events; date stays the bucket key. */
    startUtc: text("start_utc"),
    /** Recurring source event this instance belongs to (ICS UID). */
    recurrenceOf: text("recurrence_of"),
    /** Owning Google account, null for non-Google events (Stage 4.5). */
    googleAccountId: text("google_account_id"),
    /** "<calendarId>|<googleEventId>" — idempotent upsert key per account. */
    googleEventId: text("google_event_id"),
    title: text("title").notNull(),
    /** UTC date "YYYY-MM-DD". */
    date: text("date").notNull(),
    /** "HH:MM" or null for all-day. */
    start: text("start"),
    durationMin: integer("duration_min"),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    /** Calendar bucket name (e.g. "Work" / "Personal"); colour is derived in UI. */
    calendar: text("calendar").notNull().default("Work"),
    attendees: text("attendees").array().notNull().default([]),
    createdAtTs: timestamp("created_at_ts", { withTimezone: true }).notNull().defaultNow(),
    updatedAtTs: timestamp("updated_at_ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("calendar_events_user_date_idx").on(t.userId, t.date)],
);

/** Stage 4.5 — Google Calendar OAuth (read-only) connections. One per user. */
export const googleAccounts = pgTable(
  "google_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    googleEmail: text("google_email").notNull().default(""),
    /** AES-256-GCM encrypted (see src/server/crypto.server.ts). */
    accessTokenEnc: text("access_token_enc").notNull().default(""),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes: text("scopes").array().notNull().default([]),
    /** Google calendar ids the user chose to sync (JSON array). */
    selectedCalendars: jsonb("selected_calendars").$type<string[]>().notNull().default([]),
    /** "ok" | "revoked" | "error: …" — drives the Reconnect prompt. */
    lastStatus: text("last_status").notNull().default("pending"),
    lastSyncedTs: timestamp("last_synced_ts", { withTimezone: true }),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("google_accounts_user_idx").on(t.userId)],
);

/** Stage 4 — ICS subscriptions (one-way read-only calendar feeds). */
export const calendarSubscriptions = pgTable(
  "calendar_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    name: text("name").notNull().default("Subscribed calendar"),
    colour: text("colour").notNull().default("blue"),
    lastFetchedTs: timestamp("last_fetched_ts", { withTimezone: true }),
    lastStatus: text("last_status").notNull().default("pending"),
    createdAtTs: timestamp("created_at_ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("calendar_subs_user_idx").on(t.userId)],
);

/** Stage 5.6 — per-calendar display name + colour registry (Google + ICS sources). */
export const calendarSources = pgTable(
  "calendar_sources",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "google" | "ics". */
    sourceType: text("source_type").notNull(),
    /** google_accounts.id or calendar_subscriptions.id. */
    accountId: text("account_id").notNull(),
    /** Google calendarId; for ICS the subscription id. */
    calendarId: text("calendar_id").notNull(),
    displayName: text("display_name").notNull().default(""),
    colour: text("colour").notNull().default("blue"),
    /** true when the user renamed it manually — sync won't overwrite. */
    customName: boolean("custom_name").notNull().default(false),
    createdAtTs: timestamp("created_at_ts", { withTimezone: true }).notNull().defaultNow(),
    updatedAtTs: timestamp("updated_at_ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("calendar_sources_user_idx").on(t.userId),
    uniqueIndex("calendar_sources_key_idx").on(t.userId, t.sourceType, t.accountId, t.calendarId),
  ],
);

/** Stage 4 — in-memory-free marker for the subscription refresh scheduler. */
export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    pinned: boolean("pinned").notNull().default(false),
    createdAtTs: timestamp("created_at_ts", { withTimezone: true }).notNull().defaultNow(),
    updatedAtTs: timestamp("updated_at_ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversations_user_idx").on(t.userId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** Assistant action card payload, if any. */
    action: jsonb("action").$type<{ kind: string; title: string; meta: string } | null>(),
    createdAtTs: timestamp("created_at_ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_conversation_idx").on(t.conversationId)],
);

/** Stage 5 — per-device web-push subscriptions (VAPID). */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Push service endpoint URL — unique per device. */
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAtTs: timestamp("created_at_ts", { withTimezone: true }).notNull().defaultNow(),
    lastUsedTs: timestamp("last_used_ts", { withTimezone: true }),
  },
  (t) => [index("push_subs_user_idx").on(t.userId)],
);

/** Stage 5 — idempotency markers so a restarted process never double-sends. */
export const reminderState = pgTable("reminder_state", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Stable key: e.g. "task:<id>" | "event:<id>:<startUtc>" | "digest:<date>". */
  key: text("key").notNull(),
  kind: text("kind").notNull(),
  sentTs: timestamp("sent_ts", { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  updatedAtTs: timestamp("updated_at_ts", { withTimezone: true }).notNull().defaultNow(),
});

// Re-export the base table module so drizzle-kit picks everything up from here.
export { primaryKey };

/** Timesheet module — manual daily work log entries. */
export const timesheetEntries = pgTable(
  "timesheet_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** IST calendar day "YYYY-MM-DD" this entry belongs to. */
    date: text("date").notNull(),
    title: text("title").notNull(),
    /** Work type bucket: Case Study | White Paper | Approach Note | Presentation | Video Production | Web Development | App Development | UI/UX Design | Admin Tasks | Other */
    type: text("type").notNull(),
    /** Work area: NStarX | Syneroid | Kamkazi | Personal */
    area: text("area").notNull(),
    /** Optional hours spent (0.5 granularity). */
    hours: text("hours"),
    note: text("note"),
    createdAtTs: timestamp("created_at_ts", { withTimezone: true }).notNull().defaultNow(),
    updatedAtTs: timestamp("updated_at_ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("timesheet_entries_user_date_idx").on(t.userId, t.date)],
);

/** AI day-journal snapshots (one per day, regenerated on demand). */
export const timesheetSummaries = pgTable(
  "timesheet_summaries",
  {
    /** "<userId>|<date>" */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    summary: text("summary").notNull(),
    ai: boolean("ai").notNull().default(true),
    generatedAtTs: timestamp("generated_at_ts", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("timesheet_summaries_user_date_idx").on(t.userId, t.date)],
);
