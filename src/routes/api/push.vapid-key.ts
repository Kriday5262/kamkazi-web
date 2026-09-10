/**
 * Stage 5 — /api/push/vapid-key: public VAPID key for the client.
 * Logic lives in ./push.handler.ts per the route-handler convention.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/push/vapid-key")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Delegate via dynamic import so the route file stays client-eligible.
        const { vapidKeyHandler } = await import("./push.handler");
        return vapidKeyHandler(request);
      },
    },
  },
});
