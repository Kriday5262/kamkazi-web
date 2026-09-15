/**
 * Public company pages (no auth) — required for Google OAuth verification:
 *   /company       → app homepage (public, describes Kamkazi + links)
 *   /privacy       → privacy policy
 *   /terms         → terms of use
 * These are exempt from the session guard in __root.tsx.
 */
export const PUBLIC_PATHS = ["/company", "/privacy", "/terms"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}