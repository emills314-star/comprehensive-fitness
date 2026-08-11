"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const foundation = fs.readFileSync("app-foundation.js", "utf8");
const sync = fs.readFileSync("app-sync.js", "utf8");
const workout = fs.readFileSync("app-workout.js", "utf8");
const views = fs.readFileSync("app-views.js", "utf8");
const analysis = fs.readFileSync("app-analysis.js", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

for (const source of [foundation, sync, workout, views, analysis, app]) new Function(source);

assert.match(sync, /if \(slot\) slot\.innerHTML = renderTimer\(setId\)/, "Replacing rest must replace an obsolete timer element instead of retaining its prior ID");
assert.match(sync, /window\.clearInterval\(timerInterval\);\s*timerInterval = 0;\s*timerInterval = window\.setInterval/, "Each running timer owns exactly one interval");
assert.match(workout, /completingSetIds\.has\(setId\)/, "Rapid duplicate completion must be idempotently rejected");
assert.match(workout, /persistActiveWorkoutDraft\(\)/, "The completed set and replacement timer must be persisted together in the active draft");
assert.match(views, /class="active-rest-dock"[\s\S]*renderTimer\(timer\.setId\)/, "The shared timer must render in the pinned shell slot");
assert.match(views, /data-action="set-rest-seconds"/, "An incomplete active set must expose its own rest duration");
assert.match(views, /meaningfully_poor", "Worse than usual"[\s\S]*usual", "About usual"[\s\S]*unusually_good", "Better than usual"/, "Readiness display order must be low to high without changing semantic values");
assert.match(foundation, /function scheduledTemplatesForToday[\s\S]*hasCanonicalSchedule[\s\S]*legacyTemplateWeekdays/, "Today must prefer canonical weekday metadata and narrowly fall back to legacy weekday tokens");
assert.match(foundation, /return scheduled\.length === 1 \? scheduled\[0\] : null/, "Today must not choose when zero or multiple routines match");
assert.doesNotMatch(foundation, /model\.settings\.expectedTemplateId = model\.templates\[0\]/, "Normalization must never assign the first unrelated routine");
assert.match(analysis, /data-action="template-scheduled-weekday"/, "Routine editing must expose multi-day schedule metadata");
assert.match(views, /data-action="open-exercise-history"[\s\S]*data-performance-exercise-id/, "Exercise history navigation must carry stable exercise identity");
assert.match(app, /event\.stopPropagation\(\)[\s\S]*exerciseHistoryReturnState/, "History links must not trigger parent actions and must preserve return context");
assert.match(html, /\.active-rest-dock \{[^}]*position: sticky[^}]*safe-area-inset/, "The compact timer must remain pinned below the safe-area-aware header");
assert.match(html, /\.session-dock-overflow \.session-overflow-menu \{[^}]*max-height:[^}]*overflow-y: auto[^}]*z-index: 24/, "The mobile overflow menu must remain in viewport above the dock");

console.log("Active-session timer, per-set rest, Today schedule, readiness, and history contracts passed.");
