/**
 * GET /api/email-list?fresh=1&accountId=<id>&pageToken=<token>&pageSize=25
 * — paged inbox across all email-enabled Google accounts (Phase 3 Email
 * section). Merged + sorted by date desc; per-account pageTokens are bundled
 * into one opaque cursor (base64 JSON) so "Load more" merges every account.
 * Route-level server handler; logic in ./email-list.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { emailListHandler } from "./email-list.handler";

export const Route = createFileRoute("/api/email-list")({
  server: {
    handlers: {
      GET: async ({ request }) => emailListHandler(request),
    },
  },
});