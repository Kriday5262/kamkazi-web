/**
 * POST /api/today-summary — AI "at a glance" summary for the Today page.
 * Route-level server handler (Nitro file-scan trap: plain export const POST
 * isn't picked up in this project's build config — see briefing.ts).
 * Logic lives in ./today-summary.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { todaySummaryHandler } from "./today-summary.handler";

export const Route = createFileRoute("/api/today-summary")({
  server: {
    handlers: {
      POST: async ({ request }) => todaySummaryHandler(request),
    },
  },
});
