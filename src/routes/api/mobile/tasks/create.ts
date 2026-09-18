/** POST /api/mobile/tasks — register mobile quick-add route. */
import { createFileRoute } from "@tanstack/react-router";
import { mobileTaskCreateHandler } from "./create.handler";

export const Route = createFileRoute("/api/mobile/tasks/create")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => mobileTaskCreateHandler(request),
    },
  },
});