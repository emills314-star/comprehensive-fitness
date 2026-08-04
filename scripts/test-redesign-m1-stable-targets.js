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
  function resistanceLoad(value) { return Number(value?.weight || value?.targetWeight || 0); }
  function roundToIncrement(value, increment) { return Math.max(increment, Math.round(value / increment) * increment); }
  function targetRangeText(low, high) { return Number(low) === Number(high) ? String(Number(high)) : Number(low) + "-" + Number(high); }
  ${extractFunction("progressionProfileForExercise")}
  ${extractFunction("resolveProgrammedRepRange")}
  ${extractFunction("normalizeTargetSetType")}
  ${extractFunction("normalizeStableTemplateExercise")}
  ${extractFunction("previousComparableSetForRole")}
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

const prior = [
  { id: "prior-top", setType: "top", setTypeIndex: 0, reps: 8, weight: 100, rpe: 8 },
  { id: "prior-backoff", setType: "backoff", setTypeIndex: 0, reps: 11, weight: 90, rpe: 7.5 }
];
assert.equal(runtime.previousComparableSetForRole(prior, "backoff", 0).id, "prior-backoff");
assert.equal(runtime.previousComparableSetForRole(prior, "drop", 0), null);
assert.equal(runtime.exerciseMatches("Synthetic Press — Heavy", "Synthetic Press — Light"), false, "Named variants must retain separate identity and history");

const normal = runtime.factualSetPrefillForWorkoutStart(
  { name: "Synthetic Press — Heavy", reps: 6, targetRpe: 8.5, restSeconds: 180, increment: 5 },
  { resistanceType: "external" },
  { type: "top", setCount: 1, repMin: 5, repMax: 7, rpeMin: 7.5, rpeMax: 8.5, restSeconds: 180 },
  0,
  0,
  prior
);
assert.deepEqual([normal.weight, normal.reps, normal.rpe, normal.previousComparableSet.id], [100, 8, 8, "prior-top"], "Stable role rows must prefill only from the factual same-role set");

const routineDefault = runtime.factualSetPrefillForWorkoutStart(
  { name: "Synthetic Press — Light", reps: 10, targetRpe: 7, restSeconds: 90, increment: 5 },
  { resistanceType: "external" },
  { type: "straight", setCount: 3, repMin: 8, repMax: 12, rpeMin: 6, rpeMax: 7, restSeconds: 90 },
  0,
  0,
  []
);
assert.deepEqual([routineDefault.weight, routineDefault.reps, routineDefault.rpe], [0, 10, 7], "Routine defaults may prefill reps and RPE while absent load defaults remain blank");

const exception = runtime.factualSetPrefillForWorkoutStart(
  { name: "Synthetic Press — Heavy", reps: 6, targetRpe: 8.5, restSeconds: 180, increment: 5 },
  { adjusted: true, loadReductionPercent: 20, rpe: 6.5, resistanceType: "external" },
  { type: "top", setCount: 1, repMin: 5, repMax: 7, rpeMin: 7.5, rpeMax: 8.5, restSeconds: 180, increment: 5 },
  0,
  0,
  prior
);
assert.deepEqual([exception.weight, exception.reps, exception.rpe], [80, 8, 6.5], "A temporary exception may lower load and effort without rewriting factual reps");

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
