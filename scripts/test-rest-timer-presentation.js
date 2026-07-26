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
assert.match(views, /<summary class="timer-summary"[\s\S]*<button[^>]*data-action="toggle-timer"[\s\S]*<button[^>]*data-action="clear-timer"[\s\S]*<button[^>]*data-action="adjust-timer"[\s\S]*<button[^>]*data-action="skip-timer"/, "Native summary and button controls must remain reachable by keyboard");
assert.doesNotMatch(views.slice(views.indexOf("function renderTimer(setId)"), views.indexOf("function renderTimerCompleteNotice()")), /tabindex="-1"/, "Rest timer controls must not be removed from keyboard traversal");

console.log("Rest timer capability and accessibility contract passed.");
