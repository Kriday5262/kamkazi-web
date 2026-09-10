/**
 * Stage 4.5 — GET /api/google/auth → redirect to Google OAuth consent.
 */
import { createFileRoute } from "@tanstack/react-router";
import { googleAuthHandler } from "./auth.handler";

export const Route = createFileRoute("/api/google/auth")({
  server: {
    handlers: {
      GET: async ({ request }) => googleAuthHandler(request),
    },
  },
});
