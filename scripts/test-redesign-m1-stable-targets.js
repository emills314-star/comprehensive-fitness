"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { readApplicationContractSource } = require("./read-application-contract-source");

const root = path.resolve(__dirname, "..");
const source = readApplicationContractSource();
const foundation = fs.readFileSync(path.join(root, "app-foundation.js"), "utf8");
const analysis = fs.readFileSync(path.join(root, "app-analysis.js"), "utf8");
const workout = fs.readFileSync(path.join(root, "app-workout.js"), "utf8");
const interactions = fs.readFileSync(path.join(root, "app.js"), "utf8");
const views = fs.readFileSync(path.join(root, "app-views.js"), "utf8");
const imports = fs.readFileSync(path.join(root, "app-import.js"), "utf8");
const backupContract = fs.readFileSync(path.join(root, "backup-contract.js"), "utf8");
const fixture = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "redesign-m1", "stable-target-migration.json"), "utf8"));

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${name}`);
  const paramsStart = source.indexOf("(", start);
  let paramsDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    if (source[index] === "(") paramsDepth += 1;
    if (source[index] === ")") paramsDepth -= 1;
    if (paramsDepth === 0) {
      paramsEnd = index;
      break;
    }
  }
  const bodyStart = source.indexOf("{", paramsEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`Unclosed ${name}`);
}

const runtime = new Function(`
  const data = { settings: { weightUnit: "lb" } };
  const setTypeLabels = { top: "Top set", backoff: "Back-off set", straight: "Working set", drop: "Drop set", deload: "Deload set", technique: "Technique set", warmup: "Warm-up set" };
  function normalizeSetTypeCode(value) { return ({ working: "straight", work: "straight", "back-off": "backoff" })[String(value || "straight").toLowerCase()] || String(value || "straight").toLowerCase(); }
  function normalizePrescriptionIdentity(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function exerciseKey(value) { return String(value || "").toLowerCase(); }
  function recommendedRestSeconds() { return 90; }
  function formatLoadNumber(value) { return String(Number(value)); }
  function roundLoadForUnit(value, unit, increment) { const step = Math.max(0.5, Number(increment || 0.5)); return Math.round(Number(value || 0) / step) * step; }
  function roundToIncrement(value, increment) { return Math.max(increment, Math.round(value / increment) * increment); }
  function targetRangeText(low, high) { return Number(low) === Number(high) ? String(Number(high)) : Number(low) + "-" + Number(high); }
  ${extractFunction("progressionProfileForExercise")}
  ${extractFunction("resolveProgrammedRepRange")}
  ${extractFunction("normalizeTargetSetType")}
  ${extractFunction("normalizeStableTemplateExercise")}
  ${extractFunction("previousComparableSetForRole")}
  ${extractFunction("convertWeightValue")}
  ${extractFunction("storedResistanceLoad")}
  ${extractFunction("factualSetPrefillForWorkoutStart")}
  ${extractFunction("workoutMutationSafetyDecision")}
  ${extractFunction("exerciseMatches")}
  return { normalizeStableTemplateExercise, previousComparableSetForRole, factualSetPrefillForWorkoutStart, workoutMutationSafetyDecision, exerciseMatches };
`)();

const unitRuntime = new Function("data", `
  ${extractFunction("roundLoadForUnit")}
  ${extractFunction("storedResistanceLoad")}
  ${extractFunction("convertWeightValue")}
  ${extractFunction("resistanceLoad")}
  ${extractFunction("setAppWeightUnitPreference")}
  return { roundLoadForUnit, resistanceLoad, setAppWeightUnitPreference };
`)({ settings: { weightUnit: "kg" } });
const storedPounds = { weight: 220, targetWeight: 220, weightUnit: "lb" };
assert.equal(unitRuntime.roundLoadForUnit(unitRuntime.resistanceLoad(storedPounds, "external"), storedPounds.weightUnit), 99.79, "An active load must display in the preference unit derived from its own stored unit");
const storedModel = { settings: { weightUnit: "lb" }, sets: [storedPounds], recommendationHistory: [{ checksum: "immutable" }] };
const displayOnlySwitch = unitRuntime.setAppWeightUnitPreference(storedModel, "kg");
assert.equal(displayOnlySwitch.settings.weightUnit, "kg");
assert.equal(displayOnlySwitch.sets, storedModel.sets, "Changing the display preference must not rewrite stored set history");
assert.equal(displayOnlySwitch.recommendationHistory, storedModel.recommendationHistory, "Changing the display preference must not rewrite historical checksums");

const [legacyHeavy, legacyLight] = fixture.templates[0].exercises;
const stableHeavy = runtime.normalizeStableTemplateExercise(legacyHeavy);
assert.equal(stableHeavy.sets, 3);
assert.deepEqual([stableHeavy.repMin, stableHeavy.repMax, stableHeavy.targetRpe, stableHeavy.restSeconds], [5, 7, 8.5, 180]);
assert.deepEqual(stableHeavy.setTypes.map((type) => [type.type, type.setCount, type.repMin, type.repMax]), [["straight", 3, 5, 7]]);
assert.equal("standardWorkloadOverride" in stableHeavy, false, "The old ownership flag must be discarded after migration");

const stableLight = runtime.normalizeStableTemplateExercise(legacyLight);
assert.deepEqual(stableLight.setTypes.map((type) => [type.type, type.setCount, type.repMin, type.repMax]), [
  ["top", 1, 8, 10],
  ["backoff", 2, 10, 12]
]);
assert.equal("standardRoleWorkload" in stableLight, false, "Legacy role storage must migrate into the active set-type target");

const explicitRoles = runtime.normalizeStableTemplateExercise({
  id: "explicit-role-targets", name: "Synthetic Press", sets: 2, reps: 8, targetRpe: 8, restSeconds: 180,
  setTypes: [
    { type: "top", setCount: 1, repMin: 6, repMax: 8, restSeconds: 210, increment: 2.5, incrementUnit: "kg", defaultLoad: { value: 60, unit: "kg" }, defaultReps: 7 },
    { type: "backoff", setCount: 1, repMin: 8, repMax: 12, restSeconds: 75, increment: 5, incrementUnit: "lb", targetLoad: 110, defaultReps: 10 }
  ]
});
assert.deepEqual(explicitRoles.setTypes.map((role) => [role.restSeconds, role.incrementUnit, role.defaultLoad ?? role.targetLoad, role.defaultReps]),
  [[210, "kg", { value: 60, unit: "kg" }, 7], [75, "lb", 110, 10]], "Role projection and template normalization preserve explicit rest, increment units and factual defaults");
const nullRole = runtime.normalizeStableTemplateExercise({ id: "null-role", name: "Synthetic Press", sets: 1, reps: 8, restSeconds: 90,
  setTypes: [{ type: "straight", setCount: 1, repMin: 8, repMax: 12, defaultLoad: null, defaultReps: null }] }).setTypes[0];
assert.equal(nullRole.defaultLoad, null);
assert.equal(nullRole.defaultReps, null);
assert.equal("incrementUnit" in nullRole, false, "Missing role increment units remain unknown");

const routineRuntime = new Function(`
  let appliedPatch;
  let activeSetNotice = "";
  const setTypeLabels = {};
  const data = {
    sessions: [{ id: "session", templateId: "routine" }],
    exercises: [{ id: "exercise", sessionId: "session", name: "Synthetic Press", performanceExerciseId: "synthetic_press", restSeconds: 180 }],
    templates: [{ id: "routine", exercises: [{ id: "template-exercise", name: "Synthetic Press", performanceExerciseId: "synthetic_press", setTypes: [
      { id: "top-role", type: "top", increment: 2.5, incrementUnit: "kg", defaultLoad: { value: 60, unit: "kg" }, defaultReps: 7, weight: 60, weightUnit: "kg", reps: 7 },
      { id: "backoff-role", type: "backoff", increment: 5, incrementUnit: "lb", targetLoad: 100, defaultReps: 10 },
      { id: "straight-a", type: "straight", incrementUnit: "lb", defaultLoad: { value: 90, unit: "lb" } },
      { id: "straight-b", type: "straight", incrementUnit: "kg", defaultLoad: { value: 40, unit: "kg" } }
    ] }] }],
    sets: [
      { id: "top", exerciseId: "exercise", sourceTemplateSetId: "top-role", setType: "top", targetReps: 7, targetRpe: 8, targetRestSeconds: 210, sequenceIndex: 0 },
      { id: "backoff", exerciseId: "exercise", setType: "backoff", targetReps: 10, targetRpe: 8, targetRestSeconds: 75, sequenceIndex: 1 },
      { id: "drop", exerciseId: "exercise", setType: "drop", targetReps: 10, targetRpe: 8, targetRestSeconds: 45, sequenceIndex: 2 },
      { id: "ambiguous", exerciseId: "exercise", setType: "straight", targetReps: 10, targetRpe: 8, targetRestSeconds: 90, sequenceIndex: 3 }
    ]
  };
  function activeSession() { return data.sessions[0]; }
  function normalizeSetTypeCode(type) { return type || "straight"; }
  function canonicalExerciseId(exercise) { return exercise.performanceExerciseId; }
  function exerciseMatches(left, right) { return left === right; }
  function exerciseIdentityFields(exercise) { return { performanceExerciseId: exercise.performanceExerciseId }; }
  function showAppToast() {}
  function isWorkingSet(set) { return set.setType !== "warmup"; }
  function setTypeSemantics(set) { return { isWarmup: set.setType === "warmup" }; }
  function patchTemplateExercise(templateId, exerciseId, patch) { appliedPatch = patch; }
  ${extractFunction("resolveProgrammedRepRange")}
  ${extractFunction("normalizeTargetSetType")}
  ${extractFunction("templateSetTypesFromHistory")}
  ${extractFunction("updateTemplateFromExercise")}
  updateTemplateFromExercise("exercise");
  return appliedPatch;
`)();
const [savedTop, savedBackoff, savedDrop, savedAmbiguous] = routineRuntime.setTypes;
assert.deepEqual([savedTop.increment, savedTop.incrementUnit, savedTop.defaultLoad, savedTop.defaultReps, savedTop.weight, savedTop.weightUnit, savedTop.reps],
  [2.5, "kg", { value: 60, unit: "kg" }, 7, 60, "kg", 7], "Saving session targets preserves explicit metadata on the uniquely identified routine role");
assert.deepEqual([savedBackoff.increment, savedBackoff.incrementUnit, savedBackoff.targetLoad, savedBackoff.defaultReps], [5, "lb", 100, 10],
  "A unique same-type role preserves its explicit metadata when no source role ID exists");
assert.deepEqual([savedTop.restSeconds, savedBackoff.restSeconds, savedDrop.restSeconds], [210, 75, 45], "Saving targets preserves per-set role rest");
for (const role of [savedDrop, savedAmbiguous]) {
  assert.equal("incrementUnit" in role, false, "Unmatched or ambiguous roles never acquire an inferred increment unit");
  assert.equal("defaultLoad" in role, false, "Unmatched or ambiguous roles never borrow explicit defaults");
}

const prior = [
  { id: "prior-top", setType: "top", setTypeIndex: 0, reps: 8, weight: 100, rpe: 8 },
  { id: "prior-backoff", setType: "backoff", setTypeIndex: 0, reps: 11, weight: 90, rpe: 7.5 }
];
assert.equal(runtime.previousComparableSetForRole(prior, "backoff", 0).id, "prior-backoff");
assert.equal(runtime.previousComparableSetForRole(prior, "drop", 0, 0).id, "prior-top", "A changed role must still compare the same ordinal working set");
assert.equal(runtime.exerciseMatches("Synthetic Press — Heavy", "Synthetic Press — Light"), false, "Named variants must retain separate identity and history");

const normal = runtime.factualSetPrefillForWorkoutStart(
  { name: "Synthetic Press — Heavy", reps: 6, targetRpe: 8.5, restSeconds: 180, increment: 5 },
  { resistanceType: "external" },
  { type: "top", setCount: 1, repMin: 5, repMax: 7, rpeMin: 7.5, rpeMax: 8.5, restSeconds: 180 },
  0,
  0,
  prior
);
assert.deepEqual([normal.weight, normal.reps, normal.rpe, normal.previousComparableSet.id], [100, 8, "", "prior-top"], "Stable role rows retain factual load/reps while actual RPE starts empty");

const routineDefault = runtime.factualSetPrefillForWorkoutStart(
  { name: "Synthetic Press — Light", reps: 10, targetRpe: 7, restSeconds: 90, increment: 5 },
  { resistanceType: "external" },
  { type: "straight", setCount: 3, repMin: 8, repMax: 12, rpeMin: 6, rpeMax: 7, restSeconds: 90 },
  0,
  0,
  []
);
assert.deepEqual([routineDefault.weight, routineDefault.reps, routineDefault.rpe], ["", 10, ""], "Routine defaults seed rep placeholders while actual RPE and absent load defaults remain blank");

const canonicalDefault = runtime.factualSetPrefillForWorkoutStart(
  { name: "Synthetic Press", reps: 10, defaultLoad: 50 },
  { resistanceType: "external" },
  { type: "straight", defaultLoad: { value: 20, unit: "kg" }, defaultReps: 9, repMin: 8, repMax: 12 }, 0, 0, []
);
assert.equal(canonicalDefault.weight, 44, "A canonical kilogram default is explicitly converted to the app's pound display unit");
assert.equal(canonicalDefault.reps, 9);
const nullableDefault = runtime.factualSetPrefillForWorkoutStart(
  { name: "Synthetic Press", reps: 10, defaultLoad: 50 }, { resistanceType: "external" },
  { type: "straight", defaultLoad: null, defaultReps: null, repMin: 8, repMax: 12 }, 0, 0, []
);
assert.deepEqual([nullableDefault.weight, nullableDefault.reps], [50, 10], "Null role defaults retain existing legacy exercise default behavior");

const exception = runtime.factualSetPrefillForWorkoutStart(
  { name: "Synthetic Press — Heavy", reps: 6, targetRpe: 8.5, restSeconds: 180, increment: 5 },
  { adjusted: true, loadReductionPercent: 20, rpe: 6.5, resistanceType: "external" },
  { type: "top", setCount: 1, repMin: 5, repMax: 7, rpeMin: 7.5, rpeMax: 8.5, restSeconds: 180, increment: 5 },
  0,
  0,
  prior
);
assert.deepEqual([exception.weight, exception.reps, exception.rpe], [80, 8, ""], "A temporary exception may lower target load without inventing actual RPE or rewriting factual reps");

const equipmentSnapshot = {
  executionBlocked: true,
  finalPrescription: { executionBlocked: true, reason: "unavailable_equipment" },
  recommendationSnapshot: { finalPrescription: { executionBlocked: true, reason: "unavailable_equipment" } }
};
assert.equal(runtime.workoutMutationSafetyDecision("add-set", { exercise: equipmentSnapshot, recovery: {} }).allowed, true, "Legacy equipment state must not block logging");
assert.equal(runtime.workoutMutationSafetyDecision("add-set", { exercise: {}, recovery: { illness: true } }).allowed, true, "M2 must record pain or illness without blocking actual-work logging");

assert.match(foundation, /appDataVersion:\s*3/);
assert.doesNotMatch(analysis, /setPrescriptionForRole|resolvedSetTypesForPrescription|finalPrescription/, "Active target generation must not retain the superseded prescription fallback");
assert.doesNotMatch(workout, /data\.manualOverrides/, "Current workout writers must keep override provenance on the exercise instead of a global ledger");
assert.match(foundation, /discardObsoletePlanningState/, "Loaded legacy settings must cross the isolated discard boundary");
assert.doesNotMatch(interactions, /settings:\s*\{[^}]*availableEquipment/);
assert.doesNotMatch(views, /data-action="toggle-mesocycle-equipment"|aria-label="Available Equipment"/);
assert.doesNotMatch(imports, /allowedSettingsFields[\s\S]*"availableEquipment"/, "Active app-data import must not recreate the legacy equipment setting");
assert.match(backupContract, /LEGACY_PLANNING_SETTINGS_KEYS[\s\S]*"availableEquipment"[\s\S]*decodeLegacyBackup/, "The isolated legacy decoder must accept and discard the obsolete equipment setting");
assert.match(imports, /\[1, 2, 3\]/, "The active v3 data contract must be importable");

const fixtureText = JSON.stringify(fixture);
assert.doesNotMatch(fixtureText, /Erik Mills|personal_fitness_data|private-personal-data|@(?:gmail|outlook|icloud)\./i);

console.log("Redesign M1 stable-target tests passed (migration, factual prefill, role/variant integrity, and equipment decoupling).");
