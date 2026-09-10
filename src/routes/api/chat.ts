/**
 * POST /api/chat — streaming SSE chat (route-level server handler).
 * Logic lives in ./chat.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { chatHandler } from "./chat.handler";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => chatHandler(request),
    },
  },
});
