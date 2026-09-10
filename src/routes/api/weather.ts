/**
 * GET /api/weather — real weather (route-level server handler).
 * Logic lives in ./weather.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { weatherHandler } from "./weather.handler";

export const Route = createFileRoute("/api/weather")({
  server: {
    handlers: {
      GET: async ({ request }) => weatherHandler(request),
    },
  },
});
