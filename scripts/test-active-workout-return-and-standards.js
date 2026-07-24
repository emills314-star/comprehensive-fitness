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

assert.match(views, /function renderStandardWorkloadControls\([\s\S]*recommendationSnapshotForDisplay\(exercise\.recommendationSnapshot\)[\s\S]*numericStepper\(\{ field: "sets"[\s\S]*numericStepper\(\{ field: "rep-min"[\s\S]*numericStepper\(\{ field: "rep-max"/, "Every exercise default editor must expose shared set and rep targets even when research guidance is absent");
assert.match(views, /numericStepper\(\{ field: "target-rpe-min"[\s\S]*numericStepper\(\{ field: "target-rpe-max"[\s\S]*numericStepper\(\{ field: "working-rest"/, "Shared defaults must expose an exact target RPE range beside the dose and rest targets");
assert.match(views, /numericStepper\(\{ field: "working-rest"[\s\S]*numericStepper\(\{ field: "warmup-rest"/, "Shared defaults must distinguish warm-up and working-set rest");
assert.match(views, /data-individual-set-disclosure[\s\S]*Drop sets, different reps, RPE or rest/, "The per-set targets must stay behind a nested disclosure");
assert.match(views, /data-set-default-field="type"[\s\S]*field: "rep-min"[\s\S]*field: "target-rpe-min"[\s\S]*field: "target-rpe-max"[\s\S]*field: "rest"[\s\S]*setField: true/, "The nested editor must expose independent type, rep range, RPE range, and rest targets per set");
assert.match(views, /data-numeric-stepper[\s\S]*data-action="adjust-exercise-default"[\s\S]*Decrease[\s\S]*Increase/, "Exercise defaults must use the bounded down/value/up stepper pattern");
assert.match(foundation, /guidance-benchmark-strip[\s\S]*Program benchmark[\s\S]*Informational · not an input[\s\S]*guidance-benchmark-values/, "Broad guidance must render as a clearly read-only benchmark strip");
assert.match(interactions, /action === "adjust-exercise-default"[\s\S]*data-numeric-stepper[\s\S]*dispatchEvent\(new Event\("input"/, "Stepper buttons must update the native numeric input and its existing delegated behavior");
assert.match(views, /data-action="apply-standard-workload"/, "Exercise defaults must expose an explicit apply action");
assert.match(views, /data-standard-save-template/, "Template workouts must expose an explicit reusable-default choice");
assert.match(interactions, /apply-standard-workload[\s\S]*applyExerciseDefaultTargets[\s\S]*saveTemplateStandard/, "The exercise-default action must route through the universal audited target writer");
assert.match(workout, /function applyExerciseDefaultTargets\([\s\S]*action: "exercise_default_targets"[\s\S]*setTypes: workingTypes[\s\S]*warmups: templateWarmups[\s\S]*standardWorkloadOverride: true/, "Applying reusable exercise defaults must persist exact per-set targets and an audit entry");
assert.match(workout, /targetRpeMin > targetRpeMax[\s\S]*Choose an ordered target RPE range from 1 to 10 in 0\.5 steps/, "Shared defaults must reject reversed or off-step target RPE ranges");
assert.match(workout, /rowTargetRpeMin > rowTargetRpeMax[\s\S]*needs an ordered target RPE range from 1 to 10 in 0\.5 steps/, "Individual targets must reject reversed or off-step target RPE ranges");
assert.match(workout, /completedWorking[\s\S]*incompleteWorking[\s\S]*set\.completed[\s\S]*desiredIncompletePlan/, "Applying defaults must preserve completed work and rebuild unfinished working rows only");
assert.match(html, /\.numeric-stepper \{[^}]*grid-template-columns: 44px minmax\(0, 1fr\) 44px[\s\S]*\.range-steppers \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)[\s\S]*\.individual-set-row \{[^}]*grid-template-columns:/, "Shared and individual target editors must retain readable responsive stepper grids");
assert.match(html, /\.individual-set-row \.numeric-stepper \{[^}]*grid-template-columns: 36px minmax\(52px, 1fr\) 36px;[\s\S]*\.individual-set-row \.numeric-stepper button \{[^}]*min-width: 36px;[\s\S]*\.individual-set-row \.numeric-stepper input \{[^}]*min-width: 52px;/, "Individual set targets must reserve more room for the numeric value while shrinking their arrow controls");
assert.match(html, /@media \(max-width: 360px\)[\s\S]*\.individual-set-row \.range-steppers \{ grid-template-columns: minmax\(0, 1fr\); \}/, "Very narrow screens must stack individual min/max steppers instead of clipping their values");
assert.match(html, /#f4c84c[\s\S]*content: "⌃"/, "Open sections must render a high-visibility yellow recollapse cue");
assert.match(foundation, /savedRepRange[\s\S]*executableRepRange[\s\S]*repMin: savedRepRange \? executableRepRange\.min/, "Future role rows must use the saved standard range even for top/back-off structures");
assert.match(imports, /"repMin", "repMax", "standardWorkloadOverride", "standardRoleWorkload"/, "Backup validation must preserve shared and role-specific standard workload fields");
assert.match(imports, /role workload requires an enabled standard workload override[\s\S]*at most 20 total working sets/, "Backup validation must reject orphaned or over-limit role defaults");
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
const roleSnapshot = { finalPrescription: { setStructure: "top_set_backoff", workingSets: { target: 3 }, repRange: { min: 6, target: 8, max: 12 }, topSet: { count: 1, repRange: { min: 6, max: 8 } }, backoffSets: { count: 2, repRange: { min: 9, max: 12 } } } };
helper(roleSnapshot, { standardWorkloadOverride: true, standardRoleWorkload: { setStructure: "top_set_backoff", topSet: { count: 1, repRange: { min: 5, max: 7 } }, backoffSets: { count: 3, repRange: { min: 8, max: 11 } } } }, { workoutId: "workout-roles" });
assert.deepEqual(captured.override, { topSet: { count: 1, repRange: { min: 5, max: 7 } }, backoffSets: { count: 3, repRange: { min: 8, max: 11 } } });
assert.equal(captured.options.workoutId, "workout-roles");

console.log("Active-workout return and standard-workload contracts passed.");
