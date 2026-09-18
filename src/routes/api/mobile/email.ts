/**
 * GET /api/mobile/email — native app merged inbox (P2 read-only).
 * ?accountId=&pageToken=&pageSize=
 */
import { createFileRoute } from "@tanstack/react-router";
import { mobileEmailListHandler } from "./email.handler";

export const Route = createFileRoute("/api/mobile/email")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => mobileEmailListHandler(request),
    },
  },
});