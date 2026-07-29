"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const views = fs.readFileSync(path.join(root, "app-views.js"), "utf8");

assert.match(views, /<details class="timer-bar"[\s\S]*<summary class="timer-summary"[^>]*aria-label=[\s\S]*class="timer-progress"[\s\S]*<\/summary>[\s\S]*class="timer-controls-panel"/, "The rest rail must remain one named native-summary tap target with its controls in the same disclosure");
assert.match(html, /\.timer-summary \{[^}]*min-height: 44px/, "The rest rail tap target must remain at least 44 CSS px");
assert.match(html, /\.timer-primary-controls button \{[^}]*min-height: 44px/, "Rest adjustment controls must remain at least 44 CSS px");
assert.match(html, /\.timer-bar strong \{[^}]*color: var\(--(?:text|rest-text)\)/, "Primary rest text must use a semantic contrast-bearing text token");
assert.match(html, /\.timer-bar span \{[^}]*color: var\(--(?:text|rest-text)\)/, "Supporting rest text must use a semantic contrast-bearing text token");
const timerRenderer = views.slice(views.indexOf("function renderTimer(setId)"), views.indexOf("function renderTimerCompleteNotice()"));
for (const action of ["toggle-timer", "clear-timer", "adjust-timer", "skip-timer"]) {
  assert.match(timerRenderer, new RegExp('<button[^>]*data-action="' + action + '"'), action + " must remain a native keyboard-reachable button");
}
assert.doesNotMatch(timerRenderer, /tabindex="-1"/, "Rest timer controls must not be removed from keyboard traversal");
assert.match(timerRenderer, /data-phase="\$\{timer\.remainingSeconds <= 10 \? "final" : "resting"\}"/, "The rail must expose the final-ten-second phase without a second indicator");
assert.match(timerRenderer, /timer-rest-copy"[\s\S]*<small>\$\{escapeHtml\(nextContext\)\}<\/small>/, "The collapsed rest strip must name the next set in the M1 progressive hierarchy");
assert.match(timerRenderer, /" · Set " \+ Number\(nextSet\.setNumber \|\| 1\)/, "The next-set context must use the visible set number instead of an internal role label");
assert.doesNotMatch(timerRenderer, /timer-heading|timer-icon/, "The compact rest strip must not restore the retired heading or clock disc");

console.log("Rest timer capability and accessibility contract passed.");
