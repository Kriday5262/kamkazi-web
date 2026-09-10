/**
 * Stage 5 — /api/push route (GET info, POST actions).
 *
 * TanStack route-level server handler (the Nitro file-scan trap in this
 * build — see api/briefing.ts). `action` picks the operation:
 * subscribe | unsubscribe | test | test-email | settings | tick.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  pushInfoHandler,
  pushSettingsHandler,
  pushSubscribeHandler,
  pushTestHandler,
  pushTickCheckHandler,
  pushTickHandler,
  pushUnsubscribeHandler,
  testEmailHandler,
} from "./push.handler";

export const Route = createFileRoute("/api/push")({
  server: {
    handlers: {
      GET: async ({ request }) => pushInfoHandler(request),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action") ?? "";
        switch (action) {
          case "subscribe":
            return pushSubscribeHandler(request);
          case "unsubscribe":
            return pushUnsubscribeHandler(request);
          case "test":
            return pushTestHandler(request);
          case "test-email":
            return testEmailHandler(request);
          case "settings":
            return pushSettingsHandler(request);
          case "tick":
            return pushTickHandler(request);
          case "tick-check":
            return pushTickCheckHandler(request);
          default:
            return new Response(JSON.stringify({ error: "unknown action" }), {
              status: 400,
              headers: { "content-type": "application/json" },
            });
        }
      },
    },
  },
});
