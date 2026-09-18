/**
 * GET /api/mobile/tasks — native app task feed (P1 read-only start).
 * ?filter=today|open|done|all  (default: open)
 * Returns tasks with subtasks + meta (email backlinks) — mirrors web data.
 */
import { createFileRoute } from "@tanstack/react-router";
import { mobileTasksHandler } from "./tasks.handler";

export const Route = createFileRoute("/api/mobile/tasks")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => mobileTasksHandler(request),
    },
  },
});