/**
 * Stage 4 — GET/POST /api/calendar — list events/subscriptions, subscribe,
 * refresh, upload ICS, and local event CRUD. Logic in ./calendar.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { calendarHandler, calendarPostHandler } from "./calendar.handler";

export const Route = createFileRoute("/api/calendar")({
  server: {
    handlers: {
      GET: async ({ request }) => calendarHandler(request),
      POST: async ({ request }) => calendarPostHandler(request),
    },
  },
});
