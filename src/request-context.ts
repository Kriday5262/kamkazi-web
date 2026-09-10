/**
 * Request middleware that extracts the raw `Request` inside server functions
 * so handlers can read cookies. Applied per-server-function via `.middleware()`.
 *
 * IMPORTANT: `@/db/session` uses node:crypto and must never be imported at
 * module scope here — this module IS in the client graph (client proxies of
 * server functions reference the middleware). Session reading is done via
 * dynamic import so it only ever runs on the server.
 */
import { createMiddleware } from "@tanstack/react-start";

export const requestMiddleware = createMiddleware({ type: "request" }).server(({ next, request }) =>
  next({ context: { request } }),
);

/** Session for the current server-function request (null when unauthenticated). */
export async function sessionFromRequest(request: Request) {
  const { getSessionFromCookieHeader } = await import("@/db/session");
  return getSessionFromCookieHeader(request.headers.get("cookie"));
}

/** Throws if there is no valid session; returns the authenticated user id. */
export async function requireUid(context: { request: Request }): Promise<string> {
  const session = await sessionFromRequest(context.request);
  if (!session) throw new Error("unauthenticated");
  return session.uid;
}
