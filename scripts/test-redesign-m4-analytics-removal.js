"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const runtime = ["app-foundation.js", "app-views.js", "app-analysis.js", "app-workout.js", "app.js"]
  .map(read)
  .join("\n");
const views = read("app-views.js");
const analysis = read("app-analysis.js");
const workout = read("app-workout.js");
const resolver = read("exception-resolver.js");
const index = read("index.html");
const serviceWorker = read("sw.js");
const sync = read("scripts/sync-web.ps1");
const verifier = read("scripts/verify-pwa.ps1");

assert.doesNotMatch(runtime, /\b(todayPlanPreview|renderTodayPlanPreview|weeklyMuscleVolume|renderProgressOverview|renderDashboardDetail|renderVolumeDetails|hypertrophyAnalysis|renderHypertrophyScore|progressView|setProgressView|dashboardWeekStart|dashboardDetail|hypertrophyWindowOffset)\b/, "Removed analytical surfaces and state must not remain in the current runtime");
assert.doesNotMatch(workout, /\b(originalPrescription|programTargetContext|appliedTargetContext|prescriptionConfidence)\b/, "New workouts must not write the deleted prescription/context/confidence model");
assert.match(workout, /stableTargetForTemplateExercise/, "Routine targets must remain stable when a workout starts");
assert.match(runtime, /function previousComparableSetForRole/, "Factual role-aware prior performance must remain available for set prefills");
assert.match(workout, /resolvedActionId/, "The canonical exception result must remain attached to the workout");

const today = views.match(/function renderLiftHome\(\)[\s\S]*?(?=\n\s*function )/)?.[0] || "";
assert.ok(today, "Today renderer must remain inspectable");
assert.match(today, /Start workout|start-next-template|start-template/, "Today must retain a direct workout start action");
assert.doesNotMatch(today, /hypertrophy|weekly volume|dashboard|research status|confidence|evidence/i, "Today must remain quiet during normal progression");

const progress = views.match(/function renderProgress\(\)[\s\S]*?(?=\n\s*function )/)?.[0] || "";
assert.ok(progress, "Progress renderer must remain inspectable");
assert.match(progress, /renderLiftProgress\(\)/, "Progress must retain the unified factual exercise view");
assert.doesNotMatch(progress, /progressView|overview|dashboard|weekly volume|hypertrophy/i, "Progress must not retain an analytics switcher or deleted routes");

assert.match(analysis, /chartKey:\s*"performance"/, "The retained chart must use one factual performance key");
assert.match(analysis, /function renderChartPointDetail/, "Chart points must expose their source facts");
assert.match(analysis, /point\.date/, "Chart detail must retain the workout date");
for (const fact of [/formatResistance\(best, exercise\)/, /best\?\.reps/, /best\?\.rpe/, /setTypeSemantics\(best\)/]) {
  assert.match(analysis, fact, "Chart detail must retain load, reps, RPE, and set-role facts");
}
assert.match(analysis, /Named variants and resistance types remain separate/, "Progress must disclose that variants and resistance types remain separate");
assert.doesNotMatch(analysis, /\b(hypertrophyAnalysis|calculateHypertrophyScore|buildHypertrophyWeekAggregates|renderExerciseExpectations|renderHypertrophyScore)\b/, "Deleted score and qualification engines must be absent");

assert.doesNotMatch(resolver, /weeklyMuscleVolume|fractionalSet|hypertrophyScore|volumeExposure/, "The approved exception resolver must not depend on deleted analytical exposure inputs");
assert.equal(fs.existsSync(path.join(root, "programming-family-ledger.js")), false, "The obsolete family-volume ledger must be deleted");
for (const [name, source] of [["index", index], ["service worker", serviceWorker], ["sync", sync], ["verifier", verifier]]) {
  assert.doesNotMatch(source, /programming-family-ledger/, `${name} must not package the deleted ledger`);
}

console.log("M4 analytics-removal and factual-progress contract passed.");
