"use strict";

const fs = require("node:fs");
const path = require("node:path");

const APPLICATION_RUNTIME_FILES = Object.freeze([
  "app-foundation.js",
  "app-views.js",
  "app-analysis.js",
  "app-workout.js",
  "app-sync.js",
  "app-history.js",
  "app-import.js",
  "app.js"
]);

function readApplicationContractSource(root = path.resolve(__dirname, "..")) {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const runtime = APPLICATION_RUNTIME_FILES.map((file) => {
    const appPath = path.join(root, file);
    if (!fs.existsSync(appPath)) throw new Error(`Missing application runtime segment: ${appPath}`);
    return fs.readFileSync(appPath, "utf8");
  });
  return `${html}\n<script data-contract-source="application-runtime">\n${runtime.join("")}\n</script>`;
}

module.exports = { APPLICATION_RUNTIME_FILES, readApplicationContractSource };
