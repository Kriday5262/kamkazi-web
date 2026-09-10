/**
 * POST /api/email-summarize — AI summary of a single Gmail message for
 * "Add as Task" context. Route-level server handler (Nitro file-scan trap —
 * see ./briefing.ts); logic in ./email-summarize.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { emailSummarizeHandler } from "./email-summarize.handler";

export const Route = createFileRoute("/api/email-summarize")({
  server: {
    handlers: {
      POST: async ({ request }) => emailSummarizeHandler(request),
    },
  },
});
