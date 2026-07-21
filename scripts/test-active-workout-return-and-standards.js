"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const foundation = fs.readFileSync("app-foundation.js", "utf8");
const workout = fs.readFileSync("app-workout.js", "utf8");
const views = fs.readFileSync("app-views.js", "utf8");
const interactions = fs.readFileSync("app.js", "utf8");
const imports = fs.readFileSync("app-import.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${name}`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `Missing body for ${name}`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`Unclosed ${name}`);
}

assert.match(views, /canReturnToActiveSession = historyReadOnly && hasActiveWorkout\(\)[\s\S]*data-action="return-to-active-session"/, "History opened during a workout must expose a dedicated return affordance");
assert.match(interactions, /action === "return-to-active-session"[\s\S]*activeSessionId = activeWorkoutId;[\s\S]*viewingHistorySessionId = "";[\s\S]*setActiveTab\("today", \{ force: true \}\)/, "Returning must restore the canonical active workout and clear History state");
assert.match(html, /\.return-active-session-fab \{[^}]*bottom: calc\(86px \+ env\(safe-area-inset-bottom\)\);[^}]*position: fixed;[^}]*z-index: 18;/, "The return affordance must float above navigation and safe-area insets");

assert.match(views, /function renderStandardWorkloadControls\([\s\S]*recommendationSnapshotForDisplay\(exercise\.recommendationSnapshot\)[\s\S]*prescription\.workingSets\.target[\s\S]*prescription\.repRange\.min[\s\S]*prescription\.repRange\.max/, "Standard workload fields must prefill from the displayed final prescription");
assert.match(views, /data-action="apply-standard-workload"/, "Standard workload must expose an explicit apply action");
assert.match(views, /data-standard-save-template/, "Template workouts must expose an explicit reusable-default choice");
assert.match(interactions, /apply-standard-workload[\s\S]*standardWorkload: true[\s\S]*saveTemplateStandard/, "The standard-workload action must route through the audited prescription override");
assert.match(workout, /standardWorkloadOverride: true[\s\S]*templates: templatesWithStandard\(\)/, "Applying a reusable standard must persist bounded template values with the active prescription update");
assert.match(workout, /expandedOverrideSetTypes\(prescription, override\.repRange \|\| null, override\.setCount \|\| null\)/, "Today's rebuilt role rows must use the selected standard set count and range");
assert.match(foundation, /savedRepRange[\s\S]*executableRepRange[\s\S]*repMin: savedRepRange \? executableRepRange\.min/, "Future role rows must use the saved standard range even for top/back-off structures");
assert.match(imports, /"repMin", "repMax", "standardWorkloadOverride"/, "Backup validation must preserve standard workload fields");
assert.match(imports, /adjustedSnapshot[\s\S]*prescriptionSnapshotWithTemplateStandard\(adjustedSnapshot, templateExercise, \{ template: context\.template, workoutId: context\.workoutId \}\)/, "Readiness recalculation must retain an explicit saved standard on its fresh snapshot");
assert.match(workout, /adjustTargetForRecovery\(historyTarget, recoveryAdvice, \{ recovery, exerciseName: templateExercise\.name, template, workoutId: session\.id \}\)/, "Workout identity must remain bound while readiness reapplies the standard");

const helperSource = extractFunction(foundation, "prescriptionSnapshotWithTemplateStandard");
let captured = null;
const helper = new Function("prescriptionEngine", "isoNow", `${helperSource}; return prescriptionSnapshotWithTemplateStandard;`)({
  applyManualOverride(snapshot, override, options) {
    captured = { snapshot, override, options };
    return { ...snapshot, applied: true };
  }
}, () => "2026-07-21T12:00:00.000Z");
const snapshot = { finalPrescription: { workingSets: { target: 2 }, repRange: { min: 6, target: 8, max: 10 } } };
assert.strictEqual(helper(snapshot, { sets: 4, repMin: 8, repMax: 12 }, {}), snapshot, "Evidence remains authoritative until the user explicitly saves a standard");
const applied = helper(snapshot, { sets: 3, repMin: 8, repMax: 12, standardWorkloadOverride: true }, { workoutId: "workout-1" });
assert.equal(applied.applied, true);
assert.deepEqual(captured.override, { setCount: 3, repRange: { min: 8, max: 12 } });
assert.equal(captured.options.workoutId, "workout-1");

console.log("Active-workout return and standard-workload contracts passed.");
