/** GET /api/mobile/email/read — register mobile email-read route. */
import { createFileRoute } from "@tanstack/react-router";
import { mobileEmailReadHandler } from "./read.handler";

export const Route = createFileRoute("/api/mobile/email/read")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => mobileEmailReadHandler(request),
    },
  },
});