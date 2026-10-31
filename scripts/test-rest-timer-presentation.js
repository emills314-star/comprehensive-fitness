"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const views = fs.readFileSync(path.join(root, "app-views.js"), "utf8");

assert.match(views, /function renderActiveSessionHeader[\s\S]*class="active-session-timer-status"[\s\S]*class="timer-summary"[^>]*aria-label=[\s\S]*class="timer-progress"/, "The header must own the one named rest-status treatment");
assert.match(html, /\.active-session-timer-controls button \{[^}]*min-height: 44px/, "Rest adjustment controls must remain at least 44 CSS px");
assert.match(html, /\.active-session-timer-status \[data-timer-progress-label\] \{[^}]*color: var\(--text\)/, "Primary rest text must use a semantic contrast-bearing text token");
assert.match(html, /\.active-session-timer-status \.timer-rest-copy > span \{[^}]*color: var\(--current\)/, "Supporting rest text must use the established blue semantic token");
const timerRenderer = views.slice(views.indexOf("function renderActiveSessionHeader("), views.indexOf("function renderSharedRestStarter("));
for (const action of ["toggle-timer", "clear-timer", "adjust-timer", "skip-timer"]) {
  assert.match(timerRenderer, new RegExp('<button[^>]*data-action="' + action + '"'), action + " must remain a native keyboard-reachable button");
}
assert.doesNotMatch(timerRenderer, /tabindex="-1"/, "Rest timer controls must not be removed from keyboard traversal");
assert.match(timerRenderer, /activeTimer\.isOvertime \? 'overtime' : activeTimer\.remainingSeconds <= 10 \? 'final' : 'resting'/, "The header timer must expose resting, final-ten-second, and overtime phases without a second indicator");
assert.match(timerRenderer, /active-session-timer-controls" aria-label="Rest timer controls"/, "The expanded header controls must remain explicitly named");
assert.doesNotMatch(timerRenderer, /timer-heading|timer-icon|active-rest-dock/, "The compact header timer must not restore a duplicate rest rail");

console.log("Rest timer capability and accessibility contract passed.");
