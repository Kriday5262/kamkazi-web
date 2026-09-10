/**
 * GET /api/email-read — read-only full body of a single Gmail message.
 * Route-level server handler (Nitro file-scan trap — see ./briefing.ts for
 * why this pattern is required); logic in ./email-read.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { emailReadHandler } from "./email-read.handler";

export const Route = createFileRoute("/api/email-read")({
  server: {
    handlers: {
      GET: async ({ request }) => emailReadHandler(request),
    },
  },
});
