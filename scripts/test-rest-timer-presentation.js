"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const views = fs.readFileSync(path.join(root, "app-views.js"), "utf8");

assert.match(views, /class="timer-heading"[\s\S]*class="timer-icon"/, "The active timer must own a bounded visual icon");
assert.match(html, /\.timer-icon[\s\S]*border-radius: 999px/, "The rest icon must be a bounded circular control");
assert.match(html, /\.set-block\.resting-set \{ border-left-color: var\(--line\) !important; border-right-color: var\(--line\) !important; \}/, "Resting state must preserve neutral set-block borders");
assert.doesNotMatch(html, /\.timer-bar \{[^}]*border-left: 4px solid var\(--rest-accent\)/, "The timer panel must not create a full-height rest accent rail");
assert.match(fs.readFileSync(path.join(root, "docs/design/rest-timer-mockup.html"), "utf8"), /bounded to the circular timer icon/, "The approved mockup must document the bounded-icon intent");

console.log("Rest timer presentation contract passed.");
