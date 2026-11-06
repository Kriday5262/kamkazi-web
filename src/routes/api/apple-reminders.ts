/**
 * GET/POST /api/apple/reminders — Apple Reminders sync management.
 * Logic in ./apple-reminders.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { appleRemindersHandler, appleRemindersPostHandler } from "./apple-reminders.handler";

export const Route = createFileRoute("/api/apple-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => appleRemindersHandler(request),
      POST: async ({ request }) => appleRemindersPostHandler(request),
    },
  },
});
