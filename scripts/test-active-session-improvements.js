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

assert.match(sync, /startTimer[\s\S]*measurePerformance\("timer:renderHeader", render\)/, "Replacing rest must rerender the header from the new timer state instead of retaining an obsolete timer ID");
assert.match(sync, /window\.clearInterval\(timerInterval\);\s*timerInterval = 0;\s*timerInterval = window\.setInterval/, "Each running timer owns exactly one interval");
assert.match(workout, /completingSetIds\.has\(setId\)/, "Rapid duplicate completion must be idempotently rejected");
assert.match(workout, /persistActiveWorkoutDraft\(\)/, "The completed set and replacement timer must be persisted together in the active draft");
const sessionHeader = views.slice(views.indexOf("function renderActiveSessionHeader("), views.indexOf("function liftHomeIsVisible("));
const restClamp = views.slice(views.indexOf("function renderLoadedBarRestClamp("), views.indexOf("function setCompletionClock("));
assert.match(restClamp, /timer-bar loaded-bar-rest-clamp[\s\S]*data-timer-progress-label/, "The shared timer renders through the logging-row clamp");
assert.doesNotMatch(sessionHeader, /data-timer-id|data-timer-progress-label/, "The pinned session header must not duplicate the clamp timer");
assert.match(views, /data-action="set-rest-seconds"/, "An incomplete active set must expose its own rest duration");
assert.match(views, /meaningfully_poor", "Worse than usual"[\s\S]*usual", "About usual"/, "Offered readiness display order must remain low to usual without changing semantic values");
assert.doesNotMatch(views, /unusually_good", "Better than usual"/, "Coach v1 does not offer a better-than-usual control");
assert.match(foundation, /function scheduledTemplatesForToday[\s\S]*hasCanonicalSchedule[\s\S]*legacyTemplateWeekdays/, "Today must prefer canonical weekday metadata and narrowly fall back to legacy weekday tokens");
assert.match(foundation, /return scheduled\.length === 1 \? scheduled\[0\] : null/, "Today must not choose when zero or multiple routines match");
assert.doesNotMatch(foundation, /model\.settings\.expectedTemplateId = model\.templates\[0\]/, "Normalization must never assign the first unrelated routine");
assert.match(analysis, /data-action="template-scheduled-weekday"/, "Routine editing must expose multi-day schedule metadata");
assert.match(views, /data-action="open-exercise-history"[\s\S]*data-performance-exercise-id/, "Exercise history navigation must carry stable exercise identity");
assert.match(app, /event\.stopPropagation\(\)[\s\S]*exerciseHistoryReturnState/, "History links must not trigger parent actions and must preserve return context");
assert.match(html, /\.brand-bar\.active-session-bar \{[^}]*safe-area-inset/, "The compact timer header must remain safe-area aware");
assert.doesNotMatch(html, /\.active-rest-dock/, "The duplicate rest dock must be absent");
assert.match(views, /active-session-menu[\s\S]*data-action="session-menu"[\s\S]*data-action="request-cancel-workout"/, "The workout menu and guarded cancellation must remain in the pinned session header");
assert.doesNotMatch(views.slice(views.indexOf("function renderSessionDock"), views.indexOf("function renderActiveSessionHeader")), /session-overflow|session-menu/, "The session dock must not duplicate the pinned header menu");
assert.match(html, /\.app-toast \{ pointer-events: none; \}/, "Toast status content must not block pinned session controls");
assert.match(html, /\.app-toast button \{[^}]*pointer-events: auto;/, "An explicit toast action must remain directly interactive");

console.log("Active-session timer, per-set rest, Today schedule, readiness, and history contracts passed.");
