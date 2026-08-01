"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { readApplicationContractSource } = require("./read-application-contract-source");

const root = path.resolve(__dirname, "..");
const source = readApplicationContractSource(root);
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const importer = fs.readFileSync(path.join(root, "app-import.js"), "utf8");
const obsoleteSettings = [
  "colorPackage",
  "workoutCompletionSound",
  "interactionVibration",
  "restCompleteLockScreenNotifications",
  "autoScrollNextSet"
];

for (const setting of obsoleteSettings) {
  assert.equal((source.match(new RegExp(setting, "g")) || []).length, 1, `${setting} must remain only at the obsolete import boundary`);
  assert.match(importer, new RegExp(`obsoleteSettingsFields[^\\n]+${setting}`), `${setting} must remain accepted for legacy backup decoding`);
}

assert.doesNotMatch(source, /data-action="(?:toggle-theme|theme-mode|color-package|workout-completion-sound|interaction-vibration|auto-scroll-next)"/, "Removed Settings controls must not render");
assert.doesNotMatch(source, /function (?:playWorkoutCompletionSound|performInteractionFeedback)\(/, "Removed completion and generic haptic effects must not remain callable");
assert.doesNotMatch(index, /\[data-(?:theme|color-package)=/, "Fixed styling must not retain theme or package selector branches");
assert.doesNotMatch(index, /\.theme-toggle|\.color-package-picks/, "Dead appearance-only selectors must be removed");
assert.match(index, /<meta name="theme-color" content="#f4f6f8" \/>/, "The static application theme color must remain stable");
assert.match(index, /--bg:\s*#fff;/, "The fixed light canvas must be the base semantic styling");
assert.match(index, /--action:\s*#176fd1;/, "The fixed Signal Garden action color must be the base semantic styling");
assert.match(index, /--success:\s*#168a54;/, "The fixed Signal Garden success color must be the base semantic styling");
assert.match(source, /renderSegmentedSetting\("weight-unit"/, "Weight-unit conversion must remain available");
assert.match(source, /renderAlertSetting\("timer-notifications"/, "Timer-notification behavior must remain available");
assert.match(source, /renderAlertSetting\("timer-vibration"/, "Timer vibration must remain available");
assert.match(source, /data-action="rest-complete-sound"/, "Rest-complete sound selection must remain available");
assert.match(source, /data-action="export-data"/, "Data export must remain available");
assert.match(source, /data-action="import-data"/, "Data import must remain available");
assert.match(source, /data-action="clear-data"/, "Local clearing must remain available");
assert.match(source, /data-action="delete-remote-installation"/, "Remote installation deletion must remain available");

console.log("Settings minimization tests passed.");
