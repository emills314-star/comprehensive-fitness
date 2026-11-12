"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const workout = fs.readFileSync("app-workout.js", "utf8");
const interactions = fs.readFileSync("app.js", "utf8");
const foundation = fs.readFileSync("app-foundation.js", "utf8");

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
    settings: { weightUnit: "lb" },
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
      { id: "set-2", exerciseId: "exercise-1", setType: "straight", completed: false, skipped: false, edited: false, weight: "", reps: "", rpe: "", targetWeight: 215, targetRepMin: 8, targetRepMax: 10, targetRpeMin: 7, targetRpeMax: 8 },
      { id: "set-3", exerciseId: "exercise-1", setType: "backoff", completed: false, skipped: false, edited: true, weight: 205, reps: 9, rpe: 7.5, loadSource: "entered", repsSource: "entered", rpeSource: "typed", targetWeight: 200, targetRepMin: 8, targetRepMax: 10, targetRpeMin: 7, targetRpeMax: 8 },
      { id: "rpe-only", exerciseId: "exercise-1", setType: "straight", completed: false, edited: true, rpeTouched: true, weight: 215, reps: 8, rpe: 9.5, loadSource: "prefill_previous", repsSource: "prefill_previous", rpeSource: "typed" },
      { id: "mixed", exerciseId: "exercise-1", setType: "straight", completed: false, edited: true, loadTouched: true, weight: 205, reps: 8, rpe: "", loadSource: "entered", repsSource: "prefill_previous" },
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
  function storedResistanceLoad(set) { return set.weight; }
  function convertWeightValue(value) { return value; }
  function sessionById(sessionId) { return data.sessions.find((session) => session.id === sessionId); }
  function coachingTargetsForSession() { return { visible: false }; }
  function guardWorkoutMutation() { return { allowed: true }; }
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
  [215, 8, 10, 7, 8, "accepted"],
  "The completed source records the explicit intent without rewriting captured targets"
);
assert.deepEqual(
  [untouched.targetWeight, untouched.targetRepMin, untouched.targetRepMax, untouched.targetRpeMin, untouched.targetRpeMax],
  [225, 7, 7, 7, 8],
  "Untouched unfinished working-set load and rep placeholders update without changing the RPE target"
);
assert.deepEqual([untouched.weight, untouched.reps, untouched.rpe], ["", "", ""], "Reconciliation changes placeholders only and never populates observations");
assert.equal(untouched.loadSource, undefined, "Unaccepted load placeholders have no observation provenance");
assert.equal(untouched.repsSource, undefined, "Unaccepted rep placeholders have no observation provenance");
assert.equal(untouched.rpeSource, undefined, "Reconciliation does not create RPE provenance");
assert.deepEqual([edited.weight, edited.reps, edited.rpe], [205, 9, 7.5], "An unfinished row already edited by the user must retain its entered values");
assert.deepEqual([edited.loadSource, edited.repsSource, edited.rpeSource], ["entered", "entered", "typed"], "Unchanged entered observations retain their independent sources");
assert.deepEqual(runtime.data.sets.filter((set) => set.id === "rpe-only").map((set) => [set.weight, set.reps, set.rpe, set.rpeSource]), [[215, 8, 9.5, "typed"]], "An RPE-only edit protects the entire edited row from reconciliation");
assert.deepEqual(runtime.data.sets.filter((set) => set.id === "mixed").map((set) => [set.weight, set.loadSource, set.reps, set.repsSource]), [[205, "entered", 8, "prefill_previous"]], "A mixed edited row keeps every observation and field source");
assert.deepEqual(
  [edited.targetWeight, edited.targetRepMin, edited.targetRepMax, edited.targetRpeMin, edited.targetRpeMax],
  [200, 8, 10, 7, 8],
  "An edited unfinished row retains its targets as well as its observations"
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

const mutationRuntime = new Function(`
  let sequence = 0;
  let localToday = "2026-11-03";
  let historyEditFlow = null;
  let activeWorkoutId = "session";
  let mutationAllowed = true;
  let timer = null;
  const completingSetIds = new Set();
  const window = { setTimeout: (callback) => callback() };
  let data = {
    settings: { weightUnit: "lb", autoStartRestTimer: false },
    sessions: [{ id: "session", coachingPrescription: { frozen: true }, workoutAnalysis: { frozen: true } }],
    exercises: [{ id: "exercise", sessionId: "session", isDeload: false }],
    sets: [
      { id: "one", exerciseId: "exercise", weight: 100, reps: 8, rpe: "", targetWeight: 100, targetReps: 8, completed: false },
      { id: "two", exerciseId: "exercise", weight: 100, reps: 8, rpe: "", loadSource: "prefill_previous", repsSource: "prefill_previous", targetWeight: 100, targetReps: 8, completed: false },
      { id: "legacy", exerciseId: "exercise", weight: 100, reps: 8, completed: false, completedAt: "2026-10-01T12:00:00Z" },
      { id: "legacy-unfinished", exerciseId: "exercise", weight: 100, reps: 8, targetWeight: 100, targetReps: 8, completed: false }
    ],
    templates: [{ id: "tue", name: "Tuesday Routine", scheduledWeekdays: ["tuesday"] }, { id: "thu", name: "Thursday Routine", scheduledWeekdays: ["thursday"] }],
    skippedSessions: []
  };
  const weekdayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  function id() { return "skip-" + (++sequence); }
  function todayIso() { return localToday; }
  function isoNow() { return localToday + "T12:00:00.000Z"; }
  function showAppToast() {}
  function setById(id) { return data.sets.find((set) => set.id === id); }
  function exerciseById(id) { return data.exercises.find((exercise) => exercise.id === id); }
  function sessionById(id) { return data.sessions.find((session) => session.id === id); }
  function dataEntityIndex() { return { setIndexById: new Map(data.sets.map((set, index) => [set.id, index])) }; }
  function isEditingHistorySession() { return Boolean(historyEditFlow); }
  function isSessionSubmitted(session) { return session?.submitted === true; }
  function invalidateCompletedAnalysis() {}
  function scheduleSave() {}
  function render() {}
  function commit(next) { data = next; }
  function acknowledgeActiveSet() {}
  function logWorkoutOverride() {}
  function patchExercise(id, patch) { data.exercises = data.exercises.map((exercise) => exercise.id === id ? { ...exercise, ...patch } : exercise); }
  function resistanceTypeFor() { return "external"; }
  function guardWorkoutMutation(action, identifiers) {
    const set = setById(identifiers.setId);
    const exercise = exerciseById(identifiers.exerciseId || set?.exerciseId);
    const session = sessionById(identifiers.sessionId || exercise?.sessionId);
    return { allowed: mutationAllowed, target: { set, exercise, session, authorizationMode: historyEditFlow ? "history_edit" : "active_workout" } };
  }
  function performanceNow() { return 0; }
  function recordPerformance() {}
  function nextIncompleteSet() { return null; }
  function completedSetReconcileState() { return null; }
  function loadedBarTargetsForSet(set) { return { weight: set.targetWeight, reps: set.targetReps }; }
  function clearLoadedBarPrompt() {}
  function applyCompletedSetVisual() {}
  function persistActiveWorkoutDraft() {}
  function renderAfterInteractionFrame() {}
  function setActiveSet() {}

  ${extractFunction(foundation, "normalizeScheduledWeekdays")}
  ${extractFunction(foundation, "localWeekdayKey")}
  ${extractFunction(foundation, "localDateIso")}
  ${extractFunction(foundation, "legacyTemplateWeekdays")}
  ${extractFunction(foundation, "scheduledTemplatesForToday")}
  ${extractFunction(workout, "patchSet")}
  ${extractFunction(workout, "patchSetValue")}
  ${extractFunction(workout, "firstSetCompletionPatch")}
  ${extractFunction(workout, "acceptedSetObservationPatch")}
  ${extractFunction(workout, "toggleSetCompletion")}
  ${extractFunction(workout, "setSessionDeload")}
  ${extractFunction(workout, "setExerciseDeload")}
  ${extractFunction(workout, "nextScheduledWorkoutOccurrence")}
  ${extractFunction(workout, "guardInjurySkipMutation")}
  ${extractFunction(workout, "recordInjurySkip")}
  ${extractFunction(workout, "undoInjurySkip")}
  return {
    model: () => data, setToday: (date) => { localToday = date; },
    setAllowed: (allowed) => { mutationAllowed = allowed; },
    setHistory: (value) => { historyEditFlow = value; },
    patchSet, patchSetValue, toggleSetCompletion, setSessionDeload, setExerciseDeload,
    nextScheduledWorkoutOccurrence, recordInjurySkip, undoInjurySkip
  };
`)();

mutationRuntime.patchSetValue("one", "weight", "105", false);
mutationRuntime.patchSetValue("one", "rpe", "8.5", false);
mutationRuntime.patchSetValue("one", "reps", "", false);
assert.deepEqual([mutationRuntime.model().sets[0].loadSource, mutationRuntime.model().sets[0].rpeSource, mutationRuntime.model().sets[0].reps], ["entered", "typed", ""], "Typed fields record independent provenance and clearing preserves a blank");
assert.equal("repsSource" in mutationRuntime.model().sets[0], false, "Clearing reps removes its source");
assert.deepEqual([mutationRuntime.model().sets[0].loadTouched, mutationRuntime.model().sets[0].repsTouched, mutationRuntime.model().sets[0].rpeTouched], [true, true, true]);
mutationRuntime.patchSetValue("one", "weight", "", false);
assert.equal(mutationRuntime.model().sets[0].weight, "");
assert.equal("loadSource" in mutationRuntime.model().sets[0], false, "Clearing load removes only its source");
mutationRuntime.patchSetValue("one", "weight", "0", false);
assert.deepEqual([mutationRuntime.model().sets[0].weight, mutationRuntime.model().sets[0].loadSource], [0, "entered"], "Typed zero load retains its entered source");
mutationRuntime.patchSetValue("one", "reps", "0", false);
assert.equal(mutationRuntime.model().sets[0].reps, 0, "A typed zero remains distinct from a blank");
mutationRuntime.patchSetValue("one", "rpe", "", false);
assert.equal("rpeSource" in mutationRuntime.model().sets[0], false, "Cleared RPE has no stored source and reads as unknown");
mutationRuntime.patchSetValue("two", "rpe", "8", false);
assert.deepEqual([mutationRuntime.model().sets[1].loadSource, mutationRuntime.model().sets[1].repsSource], ["prefill_previous", "prefill_previous"], "RPE-only entry never relabels untouched load or reps");
assert.equal(mutationRuntime.model().sets[1].loadTouched, undefined);
assert.equal(mutationRuntime.model().sets[1].repsTouched, undefined);
mutationRuntime.toggleSetCompletion("two");
assert.deepEqual([mutationRuntime.model().sets[1].completionOrder, mutationRuntime.model().sets[1].loadSource, mutationRuntime.model().sets[1].repsSource], [1, "prefill_previous", "prefill_previous"], "First completion records factual prefill provenance and order");
mutationRuntime.toggleSetCompletion("one");
assert.equal(mutationRuntime.model().sets[0].completionOrder, 2, "Completion order follows completion rather than table order");
mutationRuntime.toggleSetCompletion("two");
mutationRuntime.toggleSetCompletion("two");
mutationRuntime.patchSet("two", { completionOrder: 42, reps: 9 }, false);
assert.equal(mutationRuntime.model().sets[1].completionOrder, 1, "Reopen, re-complete and edits preserve the first completion order");
mutationRuntime.toggleSetCompletion("legacy");
assert.equal("loadSource" in mutationRuntime.model().sets[2], false, "Re-completed legacy rows keep unknown provenance");
mutationRuntime.toggleSetCompletion("legacy-unfinished");
assert.equal("loadSource" in mutationRuntime.model().sets[3], false, "Completing an unfinished legacy row never infers provenance from a matching target");
assert.equal("repsSource" in mutationRuntime.model().sets[3], false, "Matching legacy reps also remain unknown");
mutationRuntime.setHistory({ sessionId: "session" });
mutationRuntime.patchSet("legacy", { rpe: 8 }, false);
assert.equal(mutationRuntime.patchSetValue("legacy", "rpe", "8", false), true);
assert.equal(mutationRuntime.model().sets[2].rpeSource, "typed", "Explicitly retyping an unchanged legacy RPE in history records typed provenance");
mutationRuntime.patchSetValue("legacy", "weight", "100", false);
mutationRuntime.patchSetValue("legacy", "reps", "8", false);
assert.deepEqual([mutationRuntime.model().sets[2].loadSource, mutationRuntime.model().sets[2].repsSource], ["entered", "entered"], "Unchanged values explicitly typed in history become entered observations");
mutationRuntime.setHistory(null);

mutationRuntime.setAllowed(false);
assert.equal(mutationRuntime.setSessionDeload("session", true), false);
assert.equal(mutationRuntime.setExerciseDeload("exercise", true), false);
assert.equal(mutationRuntime.model().sessions[0].isDeload, undefined, "Direct session deload mutation enforces authorization");
mutationRuntime.setAllowed(true);
mutationRuntime.setSessionDeload("session", true);
mutationRuntime.setExerciseDeload("exercise", true);
assert.equal(mutationRuntime.model().sessions[0].isDeload, true);
assert.equal(mutationRuntime.model().exercises[0].isDeload, true);
assert.deepEqual(mutationRuntime.model().sessions[0].coachingPrescription, { frozen: true }, "Retrospective marks do not recompute a stored prescription");
assert.deepEqual(mutationRuntime.model().sessions[0].workoutAnalysis, { frozen: true }, "Retrospective marks do not rewrite a stored grade");

const beforeSkip = JSON.stringify({ sessions: mutationRuntime.model().sessions, exercises: mutationRuntime.model().exercises, sets: mutationRuntime.model().sets });
const skip = mutationRuntime.recordInjurySkip("tue", "2026-11-03");
assert.equal(skip.dayId, "tuesday");
assert.equal(skip.routineName, "Tuesday Routine", "A skip captures the selected routine's name");
assert.equal(mutationRuntime.recordInjurySkip("tue", "2026-11-03"), false, "Duplicate occurrences are rejected");
assert.equal(mutationRuntime.recordInjurySkip("thu", "2026-11-04"), false, "A skip cannot be recorded for another local date");
assert.equal(mutationRuntime.recordInjurySkip("missing", "2026-11-03"), false, "A skip must target an authoritative routine");
assert.equal(JSON.stringify({ sessions: mutationRuntime.model().sessions, exercises: mutationRuntime.model().exercises, sets: mutationRuntime.model().sets }), beforeSkip, "A skip creates no session, exercise, set, grade, PR or progress fact");
assert.deepEqual(mutationRuntime.nextScheduledWorkoutOccurrence(mutationRuntime.model(), new Date(2026, 10, 3)), { date: "2026-11-05", routines: [mutationRuntime.model().templates[1]] });
assert.deepEqual(mutationRuntime.nextScheduledWorkoutOccurrence(mutationRuntime.model(), new Date(2026, 10, 5)), { date: "2026-11-10", routines: [mutationRuntime.model().templates[0]] }, "Next occurrence ordering wraps through the local week");
const tiedRoutines = [{ id: "first", name: "First", scheduledWeekdays: ["thursday"] }, { id: "second", name: "Second", scheduledWeekdays: ["thursday"] }];
assert.deepEqual(mutationRuntime.nextScheduledWorkoutOccurrence({ templates: tiedRoutines }, new Date(2026, 10, 3)), { date: "2026-11-05", routines: tiedRoutines }, "Ties preserve all complete routine objects in template order");
assert.equal(mutationRuntime.nextScheduledWorkoutOccurrence({ templates: [] }, new Date(2026, 10, 3)), null, "No schedule leaves the full chooser available");
mutationRuntime.model().templates[0].name = "Renamed Routine";
mutationRuntime.model().templates = mutationRuntime.model().templates.filter((routine) => routine.id !== "tue");
assert.equal(mutationRuntime.model().skippedSessions[0].routineName, "Tuesday Routine", "A skip name remains readable after the routine is renamed and deleted");
assert.equal(mutationRuntime.undoInjurySkip(skip.id), true, "Same-day undo succeeds");
const secondSkip = mutationRuntime.recordInjurySkip("thu", "2026-11-03");
assert.equal(secondSkip.dayId, "unscheduled");
mutationRuntime.setToday("2026-11-04");
assert.equal(mutationRuntime.undoInjurySkip(secondSkip.id), false, "Next-day undo is rejected on the direct mutator path");
mutationRuntime.setHistory({ sessionId: "session" });
assert.equal(mutationRuntime.recordInjurySkip("tue", "2026-11-04"), false, "Global skips cannot enter a history-edit transaction");

const defaultRuntime = new Function(`
  let activeWorkoutId = "session";
  let data = {
    sessions: [{ id: "session" }],
    exercises: [{ id: "exercise", sessionId: "session", name: "Synthetic Press" }],
    sets: [
      { id: "changed", exerciseId: "exercise", setType: "straight", completed: false, reps: 8, repsSource: "entered", rpe: 9, rpeSource: "typed" },
      { id: "same", exerciseId: "exercise", setType: "straight", completed: false, reps: 12, repsSource: "entered", rpe: 8, rpeSource: "typed" }
    ]
  };
  function exerciseById(id) { return data.exercises.find((exercise) => exercise.id === id); }
  function sessionById(id) { return data.sessions.find((session) => session.id === id); }
  function setsForExercise(id) { return data.sets.filter((set) => set.exerciseId === id); }
  function isSessionSubmitted() { return false; }
  function readExerciseDefaultPlan(exercise, form) { return form; }
  function setTypeSemantics(set) { return { isWarmup: set.setType === "warmup" }; }
  function isWorkingSet(set) { return set.setType !== "warmup"; }
  function normalizeSetTypeCode(type) { return type || "straight"; }
  function id() { return "override"; }
  function isoNow() { return "2026-11-03T12:00:00Z"; }
  function canonicalExerciseId() { return "synthetic-press"; }
  function showAppToast() {}
  function commit(next) { data = next; }
  ${extractFunction(workout, "applyExerciseDefaultTargets")}
  applyExerciseDefaultTargets("exercise", { workingRestSeconds: 90, warmups: [], working: [
    { type: "straight", repMin: 10, repMax: 10, targetRpeMax: 8, targetRpeMin: 7, restSeconds: 90 },
    { type: "straight", repMin: 12, repMax: 12, targetRpeMax: 8, targetRpeMin: 7, restSeconds: 90 }
  ] });
  return data;
`)();
assert.equal(defaultRuntime.sets[0].targetReps, 10, "Exercise defaults replace the rep placeholder");
assert.equal(defaultRuntime.sets[0].reps, 8, "Exercise defaults preserve an existing rep observation");
assert.equal(defaultRuntime.sets[0].repsSource, "entered", "A target-only change retains entered observation provenance");
assert.equal(defaultRuntime.sets[0].repsTouched, undefined, "A target-only change does not manufacture touched-field state");
assert.equal(defaultRuntime.sets[1].repsSource, "entered", "Defaults preserve provenance when the entered value remains unchanged");
assert.deepEqual(defaultRuntime.sets.map((set) => [set.rpe, set.rpeSource]), [[9, "typed"], [8, "typed"]], "Applying exercise defaults preserves actual typed RPE");

console.log("Redesign M2 workout-writer tests passed (direct reconciliation, actual-work rows, and no legacy recommendation writes).");
