/**
 * GET /api/export-notes — route-level server handler; logic in
 * ./export-notes.handler.ts (Nitro file-scan trap — see ./briefing.ts).
 */
import { createFileRoute } from "@tanstack/react-router";
import { exportNotesHandler } from "./export-notes.handler";

export const Route = createFileRoute("/api/export-notes")({
  server: {
    handlers: {
      GET: async ({ request }) => exportNotesHandler(request),
    },
  },
});
