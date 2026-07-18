const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  APP_SHELL,
  PUBLIC_CACHE_PATHS,
  isPublicCacheUrl,
  isSensitivePath,
  normalizedPathname,
  rememberCanceledTimer,
  responseCanBeCached,
  safeNotificationUrl,
  timerWasCanceled
} = require("../sw.js");

const origin = "https://fitness.example";
assert(Object.isFrozen(APP_SHELL));
assert.equal(APP_SHELL.length, PUBLIC_CACHE_PATHS.size, "Public cache entries must be unique");
for (const path of APP_SHELL) assert.equal(isPublicCacheUrl(origin + path, origin), true, `Allowlisted path must cache: ${path}`);

for (const path of [
  "/private-personal-data/evidence.json",
  "/PRIVATE-PERSONAL-DATA/evidence.json",
  "/private%2Dpersonal%2Ddata/evidence.json",
  "/private-personal-data%252fevidence.json",
  "/personal_fitness_data/derived/scores.csv",
  "/personal-fitness-data/report.json",
  "/api/sync/workout",
  "/backups/app.backup",
  "/exports/history.json",
  "/data/local.sqlite3",
  "/config/personal_context.json"
]) {
  assert.equal(isSensitivePath(path), true, `Sensitive path must be recognized: ${path}`);
  assert.equal(isPublicCacheUrl(origin + path, origin), false, `Sensitive path must never cache: ${path}`);
}
assert.equal(normalizedPathname("%ZZ"), "/__invalid_path__");
assert.equal(isPublicCacheUrl(`${origin}/index.html?token=secret`, origin), false, "Query-bearing assets must not enter Cache Storage");
assert.equal(isPublicCacheUrl("https://attacker.example/index.html", origin), false, "Cross-origin assets must not enter Cache Storage");
assert.equal(isPublicCacheUrl(`${origin}/unlisted.json`, origin), false, "Unlisted same-origin responses must not enter Cache Storage");

const headers = (value) => ({ get: () => value });
assert.equal(responseCanBeCached({ ok: true, type: "basic", headers: headers("public, max-age=60") }), true);
assert.equal(responseCanBeCached({ ok: true, type: "basic", headers: headers("private") }), false);
assert.equal(responseCanBeCached({ ok: true, type: "basic", headers: headers("no-store") }), false);
assert.equal(responseCanBeCached({ ok: true, type: "opaque", headers: headers("") }), false);
assert.equal(responseCanBeCached({ ok: false, type: "basic", headers: headers("") }), false);

assert.equal(safeNotificationUrl("https://attacker.example/phish", origin), `${origin}/`);
assert.equal(safeNotificationUrl("/private-personal-data/evidence.json", origin), `${origin}/`);
assert.equal(safeNotificationUrl("/?rest=complete", origin), `${origin}/?rest=complete`);

rememberCanceledTimer("timer-1", 1000);
assert.equal(timerWasCanceled("timer-1", 1001), true);
assert.equal(timerWasCanceled("timer-1", 1000 + 26 * 60 * 60 * 1000 + 1), false);

const source = fs.readFileSync("sw.js", "utf8");
assert.match(source, /if \(!isPublicCacheUrl\(url\.href, self\.location\.origin\)\) return;/);
assert.match(source, /fetch\(noStoreRequest\(event\.request\)\)/);
assert.doesNotMatch(source, /if \(response\.ok\) caches\.open/, "No generic successful response may be cached");

(async () => {
  const handlers = {};
  const cacheWrites = [];
  const fetches = [];
  global.self = {
    location: { origin },
    addEventListener(type, handler) { handlers[type] = handler; },
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: { showNotification: async () => {} },
    skipWaiting() {}
  };
  global.caches = {
    async keys() { return []; },
    async delete() { return true; },
    async match() { return undefined; },
    async open() {
      return {
        async addAll() {},
        async put(key) { cacheWrites.push(String(key)); }
      };
    }
  };
  global.fetch = async (request) => {
    fetches.push(request);
    return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
  };
  delete require.cache[require.resolve("../sw.js")];
  require("../sw.js");

  const dispatchFetch = (url) => {
    let responsePromise;
    handlers.fetch({
      request: new Request(url),
      respondWith(value) { responsePromise = Promise.resolve(value); }
    });
    return responsePromise;
  };

  await dispatchFetch(`${origin}/private-personal-data/evidence.json`);
  assert.equal(fetches.at(-1).cache, "no-store", "Sensitive requests must force a no-store network fetch");
  assert.equal(cacheWrites.length, 0, "Sensitive responses must never reach Cache Storage");

  assert.equal(dispatchFetch(`${origin}/unlisted.json`), undefined, "Unlisted GETs must bypass service-worker caching");
  await dispatchFetch(`${origin}/manifest.webmanifest`);
  assert.deepEqual(cacheWrites, ["/manifest.webmanifest"], "Only an allowlisted public asset may be written");

  delete global.self;
  delete global.caches;
  delete global.fetch;
  console.log("Service-worker public-cache privacy tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
