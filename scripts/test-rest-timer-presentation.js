"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const views = fs.readFileSync(path.join(root, "app-views.js"), "utf8");

const timerRenderer = views.slice(views.indexOf("function renderLoadedBarRestClamp("), views.indexOf("function setCompletionClock("));
const headerRenderer = views.slice(views.indexOf("function renderActiveSessionHeader("), views.indexOf("function liftHomeIsVisible("));
assert.match(timerRenderer, /class="timer-bar loaded-bar-rest-clamp"[\s\S]*class="timer-summary"[^>]*aria-label=[\s\S]*class="timer-progress"/, "The clamp owns the one named rest-status treatment");
assert.doesNotMatch(headerRenderer, /data-timer-id|data-timer-progress-label|timer-progress/, "The session header must not render a second timer projection");
assert.match(html, /\.loaded-bar-rest-actions button \{[^}]*min-width: 44px;[^}]*min-height: 44px/, "Rest adjustment controls must remain at least 44 CSS px");
assert.match(html, /\.loaded-bar-rest-clamp \.timer-rest-copy \{[^}]*color: var\(--rest-text\)/, "Primary rest text must use the contrast-bearing gold rest token");
assert.match(html, /\.loaded-bar-rest-clamp \.timer-rest-copy > span, \.loaded-bar-rest-clamp \.timer-rest-copy strong \{[^}]*color: inherit/, "Timer text shares the clamp's semantic rest ink");
for (const action of ["toggle-timer", "clear-timer", "adjust-timer", "skip-timer"]) {
  assert.match(timerRenderer, new RegExp('<button[^>]*data-action="' + action + '"'), action + " must remain a native keyboard-reachable button");
}
assert.doesNotMatch(timerRenderer, /tabindex="-1"/, "Rest timer controls must not be removed from keyboard traversal");
assert.match(timerRenderer, /activeTimer\.isOvertime \? 'overtime' : activeTimer\.remainingSeconds <= 10 \? 'final' : 'resting'/, "The clamp exposes resting, final-ten-second and overtime phases");
assert.match(timerRenderer, /aria-label="Reduce rest by 15 seconds"[\s\S]*aria-label="Add 15 seconds"[\s\S]*aria-label="More rest timer controls"/, "Adjustment buttons and the extra-controls disclosure remain explicitly named");
assert.doesNotMatch(timerRenderer, /timer-heading|timer-icon|active-rest-dock/, "The clamp must not restore a duplicate rest rail");

const { runtime, factualModel, start, activeRows } = require("./test-loaded-bar-table");
const app = runtime();
app.context.matchMedia = () => ({ matches: true });
app.context.getComputedStyle = () => ({ fontSize: "16px" });
const model = factualModel(app);
model.settings.autoStartRestTimer = true;
start(app, model);
app.context.testSetId = activeRows(app)[0].id;
app.run("toggleSetCompletion(testSetId)");
let markup = app.run("renderWorkout()");
assert.equal((markup.match(/data-timer-id=/g) || []).length, 1, "A completion renders exactly one timer in the active workout");
assert.equal((markup.match(/data-timer-progress-label/g) || []).length, 1, "The incremental countdown has one stable projection");
for (const seconds of [-15, 15]) assert.ok(markup.includes('data-seconds="' + seconds + '"'), "The clamp keeps the " + seconds + " adjustment");
assert.match(markup, /data-action="skip-timer"/, "Skip stays directly reachable");
for (const [setup, phase, text] of [
  ["timer.isOvertime=false;timer.remainingSeconds=58", "resting", "0:58"],
  ["timer.isOvertime=false;timer.remainingSeconds=9", "final", "0:09"],
  ["timer.isOvertime=true;timer.endsAt=Date.now()-3000", "overtime", "+00:03"]
]) {
  app.run(setup);
  markup = app.run("renderLoadedBarRestClamp(activeWorkoutSession())");
  assert.ok(markup.includes('data-phase="' + phase + '"'), phase + " is explicit");
  assert.ok(markup.includes(text), phase + " has a readable countdown/count-up");
}

console.log("Rest timer capability and accessibility contract passed.");
