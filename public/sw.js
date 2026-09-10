/* Kamkazi service worker — Stage 5 web push. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = { title: "Kamkazi", body: "", url: "/settings" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (err) {
    payload.body = event.data ? event.data.text() : "New notification";
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Kamkazi", {
      body: payload.body,
      tag: payload.tag || "kamkazi",
      data: { url: payload.url || "/" },
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "navigate", url });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
