"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const foundation = fs.readFileSync("app-foundation.js", "utf8");
const views = fs.readFileSync("app-views.js", "utf8");
const interactions = fs.readFileSync("app.js", "utf8");
const workout = fs.readFileSync("app-workout.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const source = [foundation, views, interactions, workout].join("\n");

function functionSource(input, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(input);
  assert.ok(match, `Missing production function ${name}`);
  const start = match.index;
  const next = /(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
  next.lastIndex = start + match[0].length;
  const following = next.exec(input);
  return input.slice(start, following?.index || input.length);
}

const render = functionSource(views, "render");
const renderView = functionSource(views, "renderView");
const renderStart = functionSource(views, "renderTemplateStartSheet");
const renderOptionalReadiness = functionSource(views, "renderOptionalReadinessSheet");
const normalizeDestination = functionSource(foundation, "normalizedDestination");
const tabFromLocation = functionSource(foundation, "tabFromLocation");
const setActiveTab = functionSource(foundation, "setActiveTab");
const startTemplate = functionSource(workout, "startTemplate");
const discard = functionSource(source, "discardActiveWorkout");
const patchRecovery = functionSource(workout, "patchRecovery");
const directStartHandler = interactions.match(/if \(action === "start-template" \|\| action === "start-next-template"\)[^\r\n]*/)?.[0] || "";

assert.match(foundation, /const primaryTabIds = \["today", "progress"\]/, "Only Today and Progress may be persistent destinations");
assert.equal((render.match(/navButton\(/g) || []).length, 2, "The shell must render exactly two persistent navigation controls");
assert.match(render, /navButton\("today", "Today"[\s\S]*navButton\("progress", "Progress"/, "The two controls must be Today and Progress");
assert.doesNotMatch(render, /navButton\("(?:plan|more|routines|settings|dashboard|charts)"/, "Secondary and deleted routes must not appear in persistent navigation");
assert.match(render, /shellWorkoutDockVisible[\s\S]*renderSessionDock[\s\S]*<nav class="bottom-nav"/, "The active logger must replace persistent navigation with workout controls");
assert.doesNotMatch(renderView, /activeTab === "(?:plan|more)"/, "Legacy Plan and More must not remain canonical render destinations");
assert.match(renderView, /activeTab === "routines"[\s\S]*renderTemplates\(\)[\s\S]*activeTab === "settings"[\s\S]*renderSettings\(\)/, "Routines and Settings must remain contextual secondary views");

for (const [legacy, canonical] of [
  ["plan", "routines"],
  ["more", "settings"],
  ["data", "settings"],
  ["dashboard", "progress"],
  ["charts", "progress"],
  ["lift", "today"],
  ["workout", "today"]
]) {
  assert.match(normalizeDestination, new RegExp(`${legacy}[\\s\\S]*${canonical}`), `${legacy} must have a bounded compatibility redirect to ${canonical}`);
}
assert.match(tabFromLocation, /\["progress-overview", "progress-lifts", "progress-history", "dashboard", "charts"\][\s\S]*return "progress"/, "Legacy analysis locations must redirect to factual Progress");
assert.match(tabFromLocation, /\["lift", "workout"\][\s\S]*return "workout"/, "Legacy active-workout locations must redirect to the contextual logger");
assert.match(tabFromLocation, /\["plan", "routines"\][\s\S]*return "routines"/, "Legacy Plan locations must redirect to contextual routines");
assert.match(tabFromLocation, /\["more", "data", "settings"\][\s\S]*return "settings"/, "Legacy More/Data locations must redirect to Settings");
assert.match(setActiveTab, /normalizedDestination/, "All programmatic navigation must pass through the same destination normalizer");
assert.match(interactions, /action === "close-secondary-context"[\s\S]*setActiveTab\("today"/, "Secondary views must expose coherent close behavior");
assert.match(interactions, /window\.addEventListener\("popstate"[\s\S]*tabFromLocation\(\)/, "Browser Back must restore a normalized destination");

assert.match(directStartHandler, /startTemplate\([^;]*defaultRecovery\(\), "usual"\)/, "Start must dispatch directly to workout construction with usual readiness");
assert.doesNotMatch(directStartHandler, /openTemplateStart|templateStartFlow/, "The ordinary Start handler must not open or create an intermediate sheet");
assert.match(startTemplate, /if \(hasActiveWorkout\(\)\)[\s\S]*step:\s*"active-conflict"[\s\S]*return;[\s\S]*const currentSession/, "Workout construction must stop at the protected active-draft conflict before creating another session");
assert.doesNotMatch(source, /step:\s*["']confirm["']|step:\s*["']review["']|review-template-readiness|start-adjusted-workout|start-original-workout|use-usual-readiness/, "Confirmation, mandatory-readiness, and prescription-review Start states must be deleted");
assert.doesNotMatch(renderStart, /readiness|start-workout-with-readiness/i, "The active-draft conflict renderer must not double as an ordinary readiness or Start gate");
assert.match(interactions, /action === "log-template-readiness"[\s\S]{0,120}openOptionalReadiness\(target\.dataset\.templateId\)/, "Optional pre-workout readiness must remain a secondary explicit action");
assert.match(renderOptionalReadiness, /optionalReadinessFlow[\s\S]*data-action="\$\{editingWorkout \? "save-workout-readiness" : "start-workout-with-readiness"\}"/, "Optional readiness must use its own pre-workout and active-workout flow");
assert.match(interactions, /action === "start-workout-with-readiness" && optionalReadinessFlow\?\.templateId[\s\S]{0,160}startTemplate\(/, "Optional pre-workout readiness must start without a separate review step");
assert.match(interactions, /action === "log-workout-readiness"[\s\S]{0,120}openOptionalReadiness\("", activeWorkoutId\)/, "Optional readiness must remain available during the active workout");
assert.match(interactions, /action === "save-workout-readiness"[\s\S]*patchRecovery\(recovery\)/, "Saving active-workout readiness must use the canonical recovery/action refresh boundary");
assert.match(renderStart, /step === "active-conflict"/, "A requested second workout must render a conflict rather than replace the draft");
for (const action of ["resume-active-workout", "finish-active-workout", "discard-active-workout"]) {
  assert.match(renderStart, new RegExp(`data-action="${action}"`), `The active-draft conflict must offer ${action}`);
}
assert.doesNotMatch(renderStart, /start anyway|replace|discard and start/i, "The conflict must not imply that a second workout will start automatically");
assert.match(interactions, /action === "resume-active-workout"[\s\S]*activeWorkoutId/, "Resume must return to the canonical active draft");
assert.match(interactions, /action === "finish-active-workout"[\s\S]*pendingSubmitSessionId = activeWorkoutId[\s\S]*render\(\)/, "Finish must open the consequential completion confirmation for the active draft");
assert.match(interactions, /action === "discard-active-workout"[\s\S]*requestCancelWorkout/, "Discard from the conflict must delegate to destructive confirmation");
assert.match(source, /data-action="confirm-cancel-workout"/, "Discard must require an explicit final confirmation");
assert.match(discard, /data\.sessions\.filter\(\(item\) => item\.id !== session\.id\)/, "Confirmed discard must delete only the selected draft");
assert.doesNotMatch(discard, /startTemplate\(|openTemplateStart\(/, "Discard must not silently create the previously requested workout");
assert.match(patchRecovery, /resolvedActions:[\s\S]*resolveWorkoutExceptions/, "Changing readiness or safety input must atomically refresh the canonical resolved action");

assert.match(html, /\.bottom-nav\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, "The persistent navigation layout must contain two equal destinations");

console.log("Redesign M5 two-destination shell and direct Start contract passed.");
