/**
 * GET /api/inbox-overview — top recent/unread emails across email-enabled
 * Google accounts. Route-level server handler (Nitro file-scan trap — see
 * ./briefing.ts for why this pattern is required); logic in
 * ./inbox-overview.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { inboxOverviewHandler } from "./inbox-overview.handler";

export const Route = createFileRoute("/api/inbox-overview")({
  server: {
    handlers: {
      GET: async ({ request }) => inboxOverviewHandler(request),
    },
  },
});
