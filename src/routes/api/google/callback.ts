/**
 * Stage 4.5 — GET /api/google/callback: OAuth code exchange + token storage.
 */
import { createFileRoute } from "@tanstack/react-router";
import { googleCallbackHandler } from "./callback.handler";

export const Route = createFileRoute("/api/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => googleCallbackHandler(request),
    },
  },
});
