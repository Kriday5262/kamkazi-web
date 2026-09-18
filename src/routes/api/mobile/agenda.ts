/** GET /api/mobile/agenda — register mobile day-agenda route. */
import { createFileRoute } from "@tanstack/react-router";
import { mobileAgendaHandler } from "./agenda.handler";

export const Route = createFileRoute("/api/mobile/agenda")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => mobileAgendaHandler(request),
    },
  },
});