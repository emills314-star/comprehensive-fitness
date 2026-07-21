"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const rootServiceWorker = fs.readFileSync("sw.js", "utf8");
const packagedServiceWorker = fs.readFileSync("www/sw.js", "utf8");
const cacheVersion = rootServiceWorker.match(/const CACHE_NAME = "([^"]+)"/u)?.[1] || "";
const cacheVersionNumber = Number(cacheVersion.match(/-v(\d+)$/u)?.[1] || 0);

assert.ok(cacheVersionNumber >= 52, "History-derived workout recommendation releases must advance the service-worker cache to v52 or newer");
assert.equal(packagedServiceWorker, rootServiceWorker, "The packaged service worker must match the root update contract");
console.log(`Service-worker update contract passed (${cacheVersion}).`);
