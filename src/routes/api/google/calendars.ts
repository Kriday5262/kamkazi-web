/**
 * Stage 4.5 — GET/POST /api/google/calendars — Google connection status,
 * calendar picker and disconnect. Logic in ./calendars.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { googleCalendarsHandler, googleCalendarsPostHandler } from "./calendars.handler";

export const Route = createFileRoute("/api/google/calendars")({
  server: {
    handlers: {
      GET: async ({ request }) => googleCalendarsHandler(request),
      POST: async ({ request }) => googleCalendarsPostHandler(request),
    },
  },
});
