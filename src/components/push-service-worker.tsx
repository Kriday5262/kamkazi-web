import { useEffect } from "react";

/**
 * Stage 5 — registers /sw.js once per session. Registration is silent: the
 * actual Notification permission is only requested from the Settings page
 * on an explicit user tap (an iOS requirement).
 */
export function PushServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal (e.g. insecure context on LAN http); Settings will explain.
    });
  }, []);
  return null;
}
