/**
 * Client-safe auth server functions. Kept separate from src/server/api.ts so
 * route modules can import them without pulling the DB layer into the client
 * bundle graph.
 *
 * The actual handlers live in ./auth-handlers.server.ts (server-only file —
 * it uses setCookie from @tanstack/react-start/server and node:crypto session
 * helpers, which are blocked in client-eligible modules by TanStack Start's
 * import protection).
 *
 * The session cookie is set on the actual HTTP response via setCookie —
 * returning a Set-Cookie string to the client does NOT work for HttpOnly
 * cookies (browsers drop them when applied via document.cookie).
 */
import { createServerFn } from "@tanstack/react-start";
import { requestMiddleware, sessionFromRequest } from "@/request-context";

export const getSession = createServerFn({ method: "GET" })
  .middleware([requestMiddleware])
  .handler(async ({ context }) => {
    const session = await sessionFromRequest(context.request);
    return { username: session?.username ?? null, uid: session?.uid ?? null };
  });

export const login = createServerFn({ method: "POST" })
  .middleware([requestMiddleware])
  .validator((input: { username: string; password: string }) => input)
  .handler(async (ctx) => {
    // Delegate to the server-only handler so all cookie/crypto/db imports stay
    // out of the client bundle.
    const { loginHandler } = await import("@/lib/auth-handlers.server");
    return loginHandler(ctx.data);
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { logoutHandler } = await import("@/lib/auth-handlers.server");
  return logoutHandler();
});
