"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const views = fs.readFileSync("app-views.js", "utf8");
const worker = fs.readFileSync("sw.js", "utf8");
const safeRender = views.slice(views.indexOf("function renderViewSafely()"), views.indexOf("function renderProgress()"));
const updateBanner = views.slice(views.indexOf("function renderUpdateBanner()"), views.indexOf("function navButton("));

assert.match(safeRender, /catch \(firstError\)[\s\S]*entityIndexCache\s*=\s*null;[\s\S]*invalidateCompletedAnalysis\(\);[\s\S]*const html = renderView\(\);/, "Today and Progress must rebuild derived indexes and retry once");
assert.match(safeRender, /catch \(error\)[\s\S]*viewRenderError\s*=\s*\{ destination: activeTab/, "A failed recovery must remain inside the bounded destination error surface");
assert.match(safeRender, /updateAvailable[\s\S]*data-action="apply-update"/, "A failed destination must expose an available app update");
assert.doesNotMatch(safeRender, /saveData|commit\(|persistStableAppDataSnapshot/, "Render recovery must not mutate or persist workout data");
assert.match(updateBanner, /renderRecovery[\s\S]*workoutActive[\s\S]*Update now/, "A render failure must allow a persistence-gated update during an open workout");
assert.match(worker, /caches\.match\(url\.pathname\)\.then\(\(cached\) => cached \|\| fetch\(noStoreRequest\(event\.request\)\)/, "Navigations must retain one coherent cached app-shell version");
assert.match(worker, /if \(cached\) return cached;[\s\S]*return fetch\(event\.request\)/, "Cached runtime assets must not be overwritten piecemeal");

console.log("Destination render and coherent app-shell recovery contract passed.");
