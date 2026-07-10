const CACHE_NAME = "comprehensive-fitness-pwa-v13";
const APP_SHELL = [
  "/",
  "/index.html",
  "/privacy.html",
  "/support.html",
  "/manifest.webmanifest",
  "/resources/icon-180.png",
  "/resources/icon-192.png",
  "/resources/icon-512.png",
  "/resources/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CANCEL_REST_TIMER" && event.data.timerId) {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.put(
        `/__canceled-rest/${encodeURIComponent(event.data.timerId)}`,
        new Response("canceled", { headers: { "Cache-Control": "no-store" } })
      ))
    );
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener("push", (event) => {
  const payload = event.data?.json() || {};
  event.waitUntil(
    caches.match(`/__canceled-rest/${encodeURIComponent(payload.timerId || "")}`).then((canceled) => {
      if (canceled) return undefined;
      return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const visible = windows.find((client) => client.visibilityState === "visible");
      if (visible) {
        visible.postMessage({ type: "REST_PUSH_RECEIVED", payload });
        return;
      }
      await self.registration.showNotification(payload.title || "Rest complete", {
        body: payload.body || "Your next set is ready.",
        tag: payload.tag || "comprehensive-fitness-rest-timer",
        renotify: true,
        silent: false,
        icon: "/resources/icon-192.png",
        badge: "/resources/icon-192.png",
        vibrate: [250, 120, 250, 120, 450],
        data: { url: payload.url || "/?workout=active", timerId: payload.timerId || "" }
      });
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/?workout=active", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) return existing.navigate(targetUrl).then((client) => client.focus());
      return self.clients.openWindow(targetUrl);
    })
  );
});
