"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const views = fs.readFileSync(path.join(root, "app-views.js"), "utf8");

assert.match(html, /\.set-block\.resting-set \{ border-left-color: var\(--line\) !important; border-right-color: var\(--line\) !important; \}/, "Resting state must preserve neutral set-block borders");
assert.doesNotMatch(html, /\.timer-bar \{[^}]*border-left: 4px solid var\(--rest-accent\)/, "The timer panel must not create a full-height rest accent rail");
assert.match(views, /<details class="timer-bar"[\s\S]*<summary class="timer-summary"[\s\S]*class="timer-controls-panel"/, "The compact rest rail must reveal controls only after the rail is opened");
assert.doesNotMatch(views, /<div class="timer-bar"/, "The always-expanded timer panel must not return");
assert.match(html, /\.timer-summary \{[^}]*min-height: 44px/, "The compact rest rail must remain a full touch target");
assert.match(html, /\.timer-progress \{[^}]*height: 28px/, "The compact rest treatment must keep a short progress rail");
assert.match(html, /\.timer-progress > span \{[^}]*var\(--current\)/, "The rest rail must use the app's complementary current blue");
assert.match(html, /\.timer-primary-controls button \{[^}]*min-height: 44px/, "Compact rest controls must retain the touch-target contract");
assert.match(fs.readFileSync(path.join(root, "docs/design/rest-timer-mockup.html"), "utf8"), /blue rail is the entire collapsed rest state/, "The approved mockup must document the compact collapsed-rail intent");

console.log("Rest timer presentation contract passed.");
