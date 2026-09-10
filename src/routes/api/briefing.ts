/**
 * GET /api/briefing — daily AI briefing (route-level server handler).
 *
 * Implemented as a TanStack Start server-only route handler
 * (`server.handlers`) because Nitro's file-based API scanning doesn't pick up
 * plain `export const GET` functions in this project's build config — the
 * catch-all SSR handler served HTML instead. Route-level `server.handlers`
 * run inside the TanStack request pipeline.
 *
 * The logic lives in ./briefing.handler.ts (plain async fn).
 */
import { createFileRoute } from "@tanstack/react-router";
import { briefingHandler } from "./briefing.handler";

export const Route = createFileRoute("/api/briefing")({
  server: {
    handlers: {
      GET: async ({ request }) => briefingHandler(request),
    },
  },
});
