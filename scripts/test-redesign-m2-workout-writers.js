"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const workout = fs.readFileSync("app-workout.js", "utf8");
const interactions = fs.readFileSync("app.js", "utf8");

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${name}`);
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`Unclosed ${name}`);
}

assert.doesNotMatch(workout, /function applyPrescriptionOverride\(/, "The deleted legacy override writer must not remain");
assert.doesNotMatch(workout, /\b(?:boundedCustomPrescriptionSnapshot|unifiedPrescriptionSnapshot)\s*\(/, "Workout writers must not generate normal recommendation snapshots");
assert.doesNotMatch(workout, /\bprescriptionEngine\.applyManualOverride\s*\(/, "Workout writers must not route manual edits through the old recommendation engine");
assert.doesNotMatch(workout, /\brecommendationHistory\s*:/, "Workout commits must not create or replace legacy recommendation history");
assert.doesNotMatch(workout, /\bworkoutPrescription\s*:/, "Workout commits must not create or replace a legacy workout prescription");
assert.doesNotMatch(interactions, /apply-prescription-override|applyPrescriptionOverride|data-override-field/, "Delegated actions must not retain a path to the deleted override UI");

const addExerciseSource = extractFunction(workout, "addExercise");
assert.doesNotMatch(addExerciseSource, /recommendationSnapshot|basePrescription|finalPrescription|recommendationHistory|unifiedPrescriptionSnapshot/, "A newly added exercise must be an identity-preserving actual-work row without recommendation state");
assert.match(addExerciseSource, /const identityFields = userSelectedExerciseIdentity\(name\)[\s\S]*\.\.\.identityFields/, "A custom added exercise must receive its distinct performance identity through the shared identity boundary");
assert.match(addExerciseSource, /stableTargetSnapshot:[\s\S]*setCount[\s\S]*repLow: repMin[\s\S]*repHigh: repMax[\s\S]*rpe: targetRpe[\s\S]*restSeconds/, "A newly added custom exercise must own explicit stable targets");
assert.match(addExerciseSource, /Array\.from\(\{ length: setCount \}[\s\S]*targetRepMin: repMin[\s\S]*targetRepMax: repMax[\s\S]*targetRpe[\s\S]*targetRestSeconds: restSeconds/, "A newly added exercise must be immediately loggable with target-complete working rows");

assert.doesNotMatch(workout, /function completeCustomExerciseSetup\(/, "The deleted recommendation-oriented custom-exercise setup writer must not return");

const updateTemplateSource = extractFunction(workout, "updateTemplateFromExercise");
assert.doesNotMatch(updateTemplateSource, /recommendationSnapshot|recommendationId|recommendationVersion|researchDatabaseVersion|mesocycleId/, "Saving actual targets to a routine must not copy legacy recommendation or mesocycle state");

const runtime = new Function(`
  let sequence = 0;
  let activeWorkoutId = "session-active";
  let lastToast = "";
  let data = {
    sessions: [{ id: "session-active", workoutPrescription: { legacy: true } }],
    exercises: [{
      id: "exercise-1",
      sessionId: "session-active",
      name: "Synthetic Press — Heavy",
      performanceExerciseId: "synthetic_press_heavy",
      pendingReconcile: { setId: "set-1", fields: ["load", "reps", "rpe"], remainingSetCount: 2 },
      manualOverrides: []
    }],
    sets: [
      { id: "set-1", exerciseId: "exercise-1", setType: "straight", completed: true, skipped: false, edited: true, weight: 225, reps: 7, rpe: 8.5, targetWeight: 215, targetRepMin: 8, targetRepMax: 10, targetRpeMin: 7, targetRpeMax: 8 },
      { id: "set-2", exerciseId: "exercise-1", setType: "straight", completed: false, skipped: false, edited: false, weight: 215, reps: 8, rpe: 8, targetWeight: 215, targetRepMin: 8, targetRepMax: 10, targetRpeMin: 7, targetRpeMax: 8 },
      { id: "set-3", exerciseId: "exercise-1", setType: "backoff", completed: false, skipped: false, edited: true, weight: 205, reps: 9, rpe: 7.5, targetWeight: 200, targetRepMin: 8, targetRepMax: 10, targetRpeMin: 7, targetRpeMax: 8 },
      { id: "warmup", exerciseId: "exercise-1", setType: "warmup", isWarmup: true, completed: false, skipped: false, weight: 95, reps: 5, rpe: 4, targetWeight: 95, targetRepMin: 5, targetRepMax: 5, targetRpeMin: 4, targetRpeMax: 4 }
    ],
    templates: [],
    recommendationHistory: [{ recommendationId: "legacy-history" }],
    manualOverrides: []
  };
  function id() { sequence += 1; return String(sequence); }
  function isoNow() { return "2026-07-31T12:00:00.000Z"; }
  function canonicalExerciseId(name) { return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
  function dataEntityIndex() { return { exerciseIndexById: new Map(data.exercises.map((exercise, index) => [exercise.id, index])) }; }
  function exerciseById(exerciseId) { return data.exercises.find((exercise) => exercise.id === exerciseId); }
  function setById(setId) { return data.sets.find((set) => set.id === setId); }
  function setsForExercise(exerciseId) { return data.sets.filter((set) => set.exerciseId === exerciseId); }
  function isWorkingSet(set) { return set.setType !== "warmup" && !set.isWarmup; }
  function resistanceTypeFor() { return "external"; }
  function resistanceLoad(set) { return Number(set.weight || 0); }
  function patchSet(setId, patch) { data.sets = data.sets.map((set) => set.id === setId ? { ...set, ...patch } : set); }
  function patchExercise(exerciseId, patch) { data.exercises = data.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, ...patch } : exercise); }
  function syncReconcilePromptDom() {}
  function showAppToast(message) { lastToast = message; }
  function commit(next) { data = next; }
  ${extractFunction(workout, "logWorkoutOverride")}
  ${extractFunction(workout, "reconcileCompletedSet")}
  reconcileCompletedSet("exercise-1", true);
  return { data, lastToast };
`)();

const source = runtime.data.sets.find((set) => set.id === "set-1");
const untouched = runtime.data.sets.find((set) => set.id === "set-2");
const edited = runtime.data.sets.find((set) => set.id === "set-3");
const warmup = runtime.data.sets.find((set) => set.id === "warmup");
const exercise = runtime.data.exercises[0];

assert.deepEqual(
  [source.targetWeight, source.targetRepMin, source.targetRepMax, source.targetRpeMin, source.targetRpeMax, source.deviationIntent],
  [225, 7, 7, 8.5, 8.5, "accepted"],
  "The completed source set must record the accepted factual targets"
);
assert.deepEqual(
  [untouched.targetWeight, untouched.targetRepMin, untouched.targetRepMax, untouched.targetRpeMin, untouched.targetRpeMax],
  [225, 7, 7, 8.5, 8.5],
  "All unfinished working-set targets must update directly"
);
assert.deepEqual([untouched.weight, untouched.reps, untouched.rpe], [225, 7, 8.5], "Untouched factual prefills may follow the explicit reconciliation");
assert.deepEqual([edited.weight, edited.reps, edited.rpe], [205, 9, 7.5], "An unfinished row already edited by the user must retain its entered values");
assert.deepEqual(
  [edited.targetWeight, edited.targetRepMin, edited.targetRepMax, edited.targetRpeMin, edited.targetRpeMax],
  [225, 7, 7, 8.5, 8.5],
  "An edited unfinished row must still receive the explicitly accepted targets"
);
assert.deepEqual([warmup.targetWeight, warmup.targetRepMin, warmup.targetRpeMax], [95, 5, 4], "Warm-ups must remain outside working-set reconciliation");
assert.equal(exercise.pendingReconcile, null, "The reconciliation prompt must clear after applying");
assert.equal(exercise.manualOverrides.length, 1, "The owning exercise must record one explicit override action");
assert.equal(exercise.manualOverrides[0].field, "remainingSetTargets");
assert.equal(exercise.manualOverrides[0].exerciseId, "synthetic_press_heavy");
assert.equal("recommendationId" in exercise.manualOverrides[0], false, "A new manual edit must not reference legacy recommendation identity");
assert.deepEqual(runtime.data.manualOverrides, [], "A legacy fixture ledger may remain inert, but the current writer must not append a duplicate override");
assert.doesNotMatch(extractFunction(workout, "logWorkoutOverride"), /data\.manualOverrides/, "The current writer must not target the deleted global override ledger");
assert.deepEqual(runtime.data.recommendationHistory, [{ recommendationId: "legacy-history" }], "Immutable legacy recommendation history must be preserved without a new write");
assert.deepEqual(runtime.data.sessions[0].workoutPrescription, { legacy: true }, "A legacy historical prescription must be preserved without mutation");
assert.equal(runtime.lastToast, "Remaining set targets updated from the completed set.");

console.log("Redesign M2 workout-writer tests passed (direct reconciliation, actual-work rows, and no legacy recommendation writes).");
