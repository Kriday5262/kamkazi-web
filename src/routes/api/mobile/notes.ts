/** GET/POST /api/mobile/notes — register mobile notes route. */
import { createFileRoute } from "@tanstack/react-router";
import { mobileNotesHandler } from "./notes.handler";

export const Route = createFileRoute("/api/mobile/notes")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => mobileNotesHandler(request),
      POST: async ({ request }: { request: Request }) => mobileNotesHandler(request),
    },
  },
});