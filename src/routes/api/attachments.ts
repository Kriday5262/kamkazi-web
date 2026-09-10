/**
 * POST/GET /api/attachments — real attachment upload/download (route-level
 * server handler). Logic lives in ./attachments.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { attachmentsHandler } from "./attachments.handler";

export const Route = createFileRoute("/api/attachments")({
  server: {
    handlers: {
      GET: async ({ request }) => attachmentsHandler(request),
      POST: async ({ request }) => attachmentsHandler(request),
    },
  },
});
