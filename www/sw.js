const CACHE_NAME = "comprehensive-fitness-pwa-v41";
const CACHE_PREFIX = "comprehensive-fitness-pwa-";
const APP_SHELL = Object.freeze([
  "/",
  "/index.html",
  "/app-foundation.js",
  "/app-views.js",
  "/app-analysis.js",
  "/app-workout.js",
  "/app-sync.js",
  "/app-history.js",
  "/app-import.js",
  "/app.js",
  "/privacy.html",
  "/support.html",
  "/manifest.webmanifest",
  "/programming-family-ledger.js",
  "/prescription-engine.js",
  "/guided-mesocycle.js",
  "/rest-completion-controller.js",
  "/backup-contract.js",
  "/research_database/exports/json/exercise_database.json",
  "/research_database/exports/json/exercise_muscle_map.json",
  "/research_database/exports/json/exercise_substitution_map.json",
  "/research_database/exports/json/muscle_group_recommendations.json",
  "/research_database/exports/json/progression_rules.json",
  "/research_database/exports/json/nutrition_strategies.json",
  "/research_database/exports/json/manifest.json",
  "/resources/secondary-page.css",
  "/resources/icon-180.png",
  "/resources/icon-192.png",
  "/resources/icon-512.png",
  "/resources/icon-maskable-512.png"
]);
const PUBLIC_CACHE_PATHS = new Set(APP_SHELL);
const PUBLIC_NAVIGATION_PATHS = new Set(["/", "/index.html", "/privacy.html", "/support.html"]);
const SENSITIVE_PREFIXES = Object.freeze([
  "/api/",
  "/private-personal-data/",
  "/private_personal_data/",
  "/personal_fitness_data/",
  "/personal-fitness-data/",
  "/backups/",
  "/exports/",
  "/.env"
]);
const CANCELED_TIMER_TTL_MS = 26 * 60 * 60 * 1000;
const MAX_CANCELED_TIMERS = 256;
const canceledRestTimers = new Map();

function normalizedPathname(value) {
  let pathname = String(value || "/");
  try {
    for (let depth = 0; depth < 3; depth += 1) {
      const decoded = decodeURIComponent(pathname);
      if (decoded === pathname) break;
      pathname = decoded;
    }
  } catch { return "/__invalid_path__"; }
  pathname = pathname.replace(/\\/g, "/").toLowerCase();
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function isSensitivePath(pathname) {
  const normalized = normalizedPathname(pathname);
  return SENSITIVE_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)) ||
    /\.(?:bak|backup|db|sqlite|sqlite3|env)(?:$|\/)/i.test(normalized) ||
    normalized.includes("/personal_context.json");
}

function isPublicCacheUrl(value, origin) {
  try {
    const url = new URL(value, origin);
    return url.origin === origin && !url.search && !isSensitivePath(url.pathname) && PUBLIC_CACHE_PATHS.has(url.pathname);
  } catch {
    return false;
  }
}

function responseCanBeCached(response) {
  if (!response || !response.ok || !["basic", "default"].includes(response.type)) return false;
  const policy = String(response.headers.get("Cache-Control") || "").toLowerCase();
  return !policy.includes("no-store") && !policy.includes("private");
}

function noStoreRequest(request) {
  return new Request(request, { cache: "no-store" });
}

function canceledTimerKey(timerId, timerVersion = 1) {
  const id = String(timerId || "").slice(0, 160);
  const version = Math.max(1, Math.floor(Number(timerVersion || 1)));
  return id ? `${id}::v${version}` : "";
}

function rememberCanceledTimer(timerId, now = Date.now(), timerVersion = 1) {
  const id = canceledTimerKey(timerId, timerVersion);
  if (!id) return;
  for (const [storedId, expiresAt] of canceledRestTimers) if (expiresAt <= now) canceledRestTimers.delete(storedId);
  canceledRestTimers.set(id, now + CANCELED_TIMER_TTL_MS);
  while (canceledRestTimers.size > MAX_CANCELED_TIMERS) canceledRestTimers.delete(canceledRestTimers.keys().next().value);
}

function timerWasCanceled(timerId, now = Date.now(), timerVersion = 1) {
  const id = canceledTimerKey(timerId, timerVersion);
  const expiresAt = canceledRestTimers.get(id) || 0;
  if (expiresAt <= now) {
    canceledRestTimers.delete(id);
    return false;
  }
  return true;
}

function pushPayloadWasCanceled(payload = {}, now = Date.now()) {
  const timerVersion = payload.timerVersion || 1;
  return timerWasCanceled(payload.notificationId, now, timerVersion) || timerWasCanceled(payload.timerId, now, timerVersion);
}
function safeNotificationUrl(value, origin) {
  try {
    if (String(value || "").length > 2048) return `${origin}/`;
    const target = new URL(value || "/", origin);
    if (target.origin !== origin || isSensitivePath(target.pathname)) return `${origin}/`;
    return target.href;
  } catch {
    return `${origin}/`;
  }
}

if (typeof self !== "undefined" && self.addEventListener) {
  self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
        .then(() => self.clients.claim())
    );
  });

  self.addEventListener("message", (event) => {
    if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
    if (event.data?.type === "CANCEL_REST_TIMER") rememberCanceledTimer(event.data.timerId, Date.now(), event.data.timerVersion || 1);
  });

  self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
    if (isSensitivePath(url.pathname)) {
      event.respondWith(fetch(noStoreRequest(event.request)));
      return;
    }
    if (event.request.mode === "navigate") {
      if (!PUBLIC_NAVIGATION_PATHS.has(url.pathname)) {
        event.respondWith(fetch(noStoreRequest(event.request)));
        return;
      }
      event.respondWith(
        fetch(noStoreRequest(event.request))
          .then(async (response) => {
            if (responseCanBeCached(response) && isPublicCacheUrl(url.href, self.location.origin)) {
              await caches.open(CACHE_NAME).then((cache) => cache.put(url.pathname, response.clone()));
            }
            return response;
          })
          .catch(() => caches.match(url.pathname).then((cached) => cached || (url.pathname === "/" ? caches.match("/index.html") : undefined)))
      );
      return;
    }
    if (!isPublicCacheUrl(url.href, self.location.origin)) return;
    event.respondWith(
      caches.match(url.pathname).then((cached) => {
        const network = fetch(event.request).then(async (response) => {
          if (responseCanBeCached(response)) await caches.open(CACHE_NAME).then((cache) => cache.put(url.pathname, response.clone()));
          return response;
        }).catch(() => cached);
        return cached || network;
      })
    );
  });

  self.addEventListener("push", (event) => {
    let payload = {};
    try { payload = event.data?.json() || {}; } catch { payload = {}; }
    event.waitUntil(Promise.resolve().then(async () => {
      if (pushPayloadWasCanceled(payload, Date.now())) return;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = windows.find((client) => client.visibilityState === "visible");
      if (visible) {
        visible.postMessage({ type: "REST_PUSH_RECEIVED", payload });
        return;
      }
      await self.registration.showNotification(String(payload.title || "Rest complete").slice(0, 80), {
        body: String(payload.body || "Your next set is ready.").slice(0, 240),
        tag: String(payload.tag || "comprehensive-fitness-rest-timer").slice(0, 160),
        renotify: true,
        silent: false,
        icon: "/resources/icon-192.png",
        badge: "/resources/icon-192.png",
        vibrate: [250, 120, 250, 120, 450],
        data: { ...payload, url: safeNotificationUrl(payload.url, self.location.origin) }
      });
    }));
  });

  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const payload = event.notification.data || {};
    const targetUrl = safeNotificationUrl(payload.url, self.location.origin);
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
        const existing = windows.find((client) => client.url.startsWith(self.location.origin));
        if (existing) {
          payload.url = targetUrl;
          existing.postMessage({ type: "REST_NOTIFICATION_CLICK", payload });
          return existing.focus();
        }
        return self.clients.openWindow(targetUrl);
      })
    );
  });
}

if (typeof module !== "undefined") {
  module.exports = {
    APP_SHELL,
    PUBLIC_CACHE_PATHS,
    canceledTimerKey,
    isPublicCacheUrl,
    isSensitivePath,
    normalizedPathname,
    pushPayloadWasCanceled,
    rememberCanceledTimer,
    responseCanBeCached,
    safeNotificationUrl,
    timerWasCanceled
  };
}
