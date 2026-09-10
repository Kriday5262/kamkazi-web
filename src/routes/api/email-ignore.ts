/**
 * POST /api/email-ignore — app-side ignore/unignore of a Gmail message
 * (never touches Gmail). Route-level server handler; logic in
 * ./email-ignore.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { emailIgnoreHandler } from "./email-ignore.handler";

export const Route = createFileRoute("/api/email-ignore")({
  server: {
    handlers: {
      POST: async ({ request }) => emailIgnoreHandler(request),
    },
  },
});