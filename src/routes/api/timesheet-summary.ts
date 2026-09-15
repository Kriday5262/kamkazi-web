/**
 * POST /api/timesheet-summary — AI day-journal for the Timesheet module.
 * Route-level server handler (plain export const POST isn't picked up in
 * this project's build config — same as today-summary.ts).
 * Logic lives in ./timesheet-summary.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timesheetSummaryHandler } from "./timesheet-summary.handler";

export const Route = createFileRoute("/api/timesheet-summary")({
  server: {
    handlers: {
      POST: async ({ request }) => timesheetSummaryHandler(request),
    },
  },
});