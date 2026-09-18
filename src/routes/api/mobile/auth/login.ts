/**
 * POST /api/mobile/auth/login — native app login (P1).
 * Body: { username, password, deviceName? } → { token, username }.
 * Logic in ./login.handler.ts (kept out of route tree for tree-shaking).
 */
import { createFileRoute } from "@tanstack/react-router";
import { mobileLoginHandler } from "./login.handler";

export const Route = createFileRoute("/api/mobile/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => mobileLoginHandler(request),
    },
  },
});