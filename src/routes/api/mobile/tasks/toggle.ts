/** POST /api/mobile/tasks/toggle — register mobile task-toggle route. */
import { createFileRoute } from "@tanstack/react-router";
import { mobileTaskToggleHandler } from "./toggle.handler";

export const Route = createFileRoute("/api/mobile/tasks/toggle")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => mobileTaskToggleHandler(request),
    },
  },
});