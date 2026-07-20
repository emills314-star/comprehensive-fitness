"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const rootServiceWorker = fs.readFileSync("sw.js", "utf8");
const packagedServiceWorker = fs.readFileSync("www/sw.js", "utf8");
const cacheVersion = rootServiceWorker.match(/const CACHE_NAME = "([^"]+)"/u)?.[1] || "";

assert.match(cacheVersion, /^comprehensive-fitness-pwa-v(?:4[1-9]|[5-9]\d|\d{3,})$/u, "The app update must advance the service-worker cache version");
assert.equal(packagedServiceWorker, rootServiceWorker, "The packaged service worker must match the root update contract");
console.log(`Service-worker update contract passed (${cacheVersion}).`);
