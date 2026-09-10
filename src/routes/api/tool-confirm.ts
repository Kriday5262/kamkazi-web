/**
 * POST /api/tool-confirm — execute a confirmed write-tool (route-level server handler).
 * Logic lives in ./tool-confirm.handler.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { toolConfirmHandler } from "./tool-confirm.handler";

export const Route = createFileRoute("/api/tool-confirm")({
  server: {
    handlers: {
      POST: async ({ request }) => toolConfirmHandler(request),
    },
  },
});
