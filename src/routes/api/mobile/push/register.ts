/** POST /api/mobile/push/register — register mobile push-token route. */
import { createFileRoute } from "@tanstack/react-router";
import { mobilePushRegisterHandler } from "./register.handler";

export const Route = createFileRoute("/api/mobile/push/register")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => mobilePushRegisterHandler(request),
    },
  },
});