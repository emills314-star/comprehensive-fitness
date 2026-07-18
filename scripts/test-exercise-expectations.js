const assert = require("node:assert/strict");
const fs = require("node:fs");
const { readApplicationContractSource } = require("./read-application-contract-source");

const html = readApplicationContractSource();
const identityMatch = html.match(/function analysisExerciseId\(exercise\)\s*\{[\s\S]*?\n\s*\}/);
assert.ok(identityMatch, "Stable analysis exercise identity helper was not found");
const match = html.match(/\/\/ EXERCISE_TARGET_ENGINE_START([\s\S]*?)\/\/ EXERCISE_TARGET_ENGINE_END/);
assert.ok(match, "Exercise target engine markers were not found");

const data = { settings: { weightUnit: "lb" }, templates: [], sessions: [], exercises: [], sets: [] };
const factory = new Function("data", `
  const formatLoadNumber = (value) => String(Number(value));
  const progressionProfileForExercise = (name) => /raise|curl/i.test(name) ? { lowerRep: 10, upperRep: 15, increment: 2.5, kind: "isolation" } : { lowerRep: 6, upperRep: 10, increment: 5, kind: "compound" };
  const sessionTypeForTemplate = (template) => /deload/i.test(template?.name || "") ? "deload" : /light/i.test(template?.name || "") ? "light" : /heavy/i.test(template?.name || "") ? "heavy" : "normal";
  const recommendedRestSeconds = () => 180;
  const canonicalExerciseId = (name) => String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  ${identityMatch[0]}
  const inferResistanceType = (name, exercise = {}) => exercise.resistanceType || (/pull-up/i.test(name) ? "bodyweight_plus_load" : "external");
  const isSessionSubmitted = (session) => session && session.submitted !== false;
  const activeHistorySessions = () => data.sessions.filter(isSessionSubmitted);
  const todayIso = () => "2026-01-31";
  const normalizeCanonicalSetType = (value, isWarmup = false) => {
    if (isWarmup) return "warmup";
    const key = String(value || "straight").toLowerCase().replace(/[^a-z]/g, "");
    if (key === "warmup" || key === "warmupset") return "warmup";
    if (key === "top" || key === "topset") return "top";
    if (key === "backoff" || key === "backoffset") return "backoff";
    if (key === "drop" || key === "dropset") return "drop";
    return "straight";
  };
  const setTypeSemantics = (set) => ({ type: normalizeCanonicalSetType(set?.setType, set?.isWarmup), isWarmup: normalizeCanonicalSetType(set?.setType, set?.isWarmup) === "warmup" });
  const isWorkingSet = (set) => !setTypeSemantics(set).isWarmup;
  const startOfWeekIso = (date) => date;
  const hypertrophyWindowOffset = 0;
  const canonicalSetSequence = (set) => Number(set?.sequenceIndex ?? set?.sequence ?? set?.setNumber ?? 0);
  const setsForExercise = (exerciseId) => data.sets.filter((set) => set.exerciseId === exerciseId).sort((a, b) => canonicalSetSequence(a) - canonicalSetSequence(b));
  const resistanceTypeFor = (exercise, set) => set.resistanceType || exercise.resistanceType || "external";
  ${match[1]}
  return { normalizeTargetSetType, exerciseTargetContext, currentExerciseTargetContexts, savedExerciseTargetContext, targetSetTypeForSet, setProgramExpectation, exerciseExpectationActuals };
`);
const engine = factory(data);

const heavyTemplate = {
  id: "heavy-push",
  name: "Heavy Push",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  exercises: [{
    id: "bench-heavy",
    name: "Bench Press",
    resistanceType: "external",
    increment: 5,
    progressionRule: "Add 5 lb after both back-off sets reach 10 reps.",
    setTypes: [
      { type: "top", setCount: 1, repMin: 6, repMax: 8, rpeMin: 8, rpeMax: 9, restSeconds: 180 },
      { type: "backoff", setCount: 2, repMin: 8, repMax: 10, rpeMin: 7, rpeMax: 8, restSeconds: 150, loadRule: "90% of top-set load" },
      { type: "warmup", setCount: 2, repMin: 5, repMax: 10, rpeMax: 5, restSeconds: 60, countsTowardScore: false, countsTowardVolume: false }
    ]
  }]
};
const lightTemplate = {
  id: "light-push",
  name: "Light Push",
  createdAt: "2026-01-02",
  updatedAt: "2026-01-02",
  exercises: [{ id: "bench-light", name: "Bench Press", sets: 2, reps: 12, repMin: 10, repMax: 12, rpeMin: 6, rpeMax: 7, restSeconds: 120, resistanceType: "external" }]
};
const dropTemplate = {
  id: "shoulders",
  name: "Shoulders",
  exercises: [{ id: "raise", name: "Lateral Raise", setTypes: [
    { type: "straight", setCount: 2, repMin: 10, repMax: 15, rpeMin: 7, rpeMax: 8, restSeconds: 75 },
    { type: "drop", setCount: 2, repMin: 12, repMax: 20, rpeMin: 8, rpeMax: 9, restSeconds: 45, loadReductionMin: 20, loadReductionMax: 25, countsTowardVolume: true, countsTowardScore: true }
  ] }]
};
data.templates = [heavyTemplate, lightTemplate, dropTemplate];

const heavy = engine.exerciseTargetContext(heavyTemplate, heavyTemplate.exercises[0]);
assert.equal(heavy.setTypes[0].type, "top", "Top sets must retain their own target");
assert.equal(heavy.setTypes[1].type, "backoff", "Back-off sets must remain separate");
assert.equal(heavy.setTypes[2].countsTowardScore, false, "Warm-ups must be excluded from scoring");
assert.equal(heavy.setTypes[2].countsTowardVolume, false, "Warm-ups must be excluded from hard-set volume");
assert.equal(heavy.setTypes.filter((type) => type.countsTowardScore).reduce((sum, type) => sum + type.setCount, 0), 3, "Only working sets count toward the programmed total");

const contexts = engine.currentExerciseTargetContexts("bench-press");
assert.equal(contexts.length, 2, "Heavy and light template contexts must remain separate");
assert.deepEqual(new Set(contexts.map((context) => context.sessionType)), new Set(["heavy", "light"]), "Context labels must preserve session intent");

const drop = engine.exerciseTargetContext(dropTemplate, dropTemplate.exercises[0]).setTypes.find((type) => type.type === "drop");
assert.equal(drop.setCount, 2, "Multiple drop sets must be supported");
assert.equal(drop.loadReductionMin, 20, "Drop-set load reduction must be structured data");
assert.equal(drop.restSeconds, 45, "Drop sets must retain their own rest target");

const session = { id: "s1", date: "2026-01-05", title: "Heavy Push", templateId: "heavy-push", submitted: true };
const exercise = { id: "e1", sessionId: "s1", name: "Bench Press", resistanceType: "external", restSeconds: 180, appliedTargetContext: heavy };
const sets = [
  { id: "w1", exerciseId: "e1", setNumber: -1, reps: 8, rpe: 4, completed: true, isWarmup: true, setType: "warmup" },
  { id: "t1", exerciseId: "e1", setNumber: 1, reps: 7, rpe: 8.5, completed: true, setType: "top", resistanceType: "external" },
  { id: "b1", exerciseId: "e1", setNumber: 2, reps: 9, rpe: 8, completed: true, setType: "backoff", resistanceType: "external" },
  { id: "b2", exerciseId: "e1", setNumber: 3, reps: 10, rpe: 8, completed: true, setType: "backoff", resistanceType: "external" }
];
data.sessions = [session];
data.exercises = [exercise];
data.sets = sets;

const topExpectation = engine.setProgramExpectation(session, exercise, sets[1], 0);
const backoffExpectation = engine.setProgramExpectation(session, exercise, sets[2], 1);
assert.equal(topExpectation.repMin, 6, "Scoring must use the displayed top-set range");
assert.equal(topExpectation.repMax, 8, "Scoring must use the displayed top-set range");
assert.equal(backoffExpectation.repMin, 8, "Back-off scoring must use its own rep range");
assert.equal(backoffExpectation.rpeMax, 8, "Back-off scoring must use its own RPE target");
assert.equal(engine.setProgramExpectation(session, exercise, sets[0], 0).countsTowardScore, false, "Warm-up execution must never enter compliance scoring");

const actuals = engine.exerciseExpectationActuals("bench-press", { included: [{ weekStart: "2026-01-05" }] });
assert.equal(actuals.length, 1, "One saved heavy context should produce one comparison block");
assert.equal(actuals[0].plannedSets, 3, "Warm-ups must not inflate expected working sets");
assert.equal(actuals[0].repHits, 3, "Top and back-off sets must be evaluated against their respective ranges");
assert.equal(actuals[0].rpeHits, 3, "RPE compliance must use the saved set-type bands");
assert.deepEqual(actuals[0].roles.map((role) => role.key).sort(), ["backoff", "top"], "Actual-vs-Expected must preserve separate top-set and back-off metrics");
assert.equal(actuals[0].roles.find((role) => role.key === "top").repHits, 1, "Top-set compliance must use the top-set target");
assert.equal(actuals[0].roles.find((role) => role.key === "backoff").repHits, 2, "Back-off compliance must use the back-off target");

const changedHeavy = { ...heavy, setTypes: heavy.setTypes.map((type) => type.type === "backoff" ? { ...type, repMin: 10, repMax: 12 } : type) };
data.sessions.push({ id: "s2", date: "2026-01-12", title: "Heavy Push", templateId: "heavy-push", submitted: true });
data.exercises.push({ id: "e2", sessionId: "s2", name: "Bench Press", resistanceType: "external", appliedTargetContext: changedHeavy });
data.sets.push({ id: "t2", exerciseId: "e2", setNumber: 1, reps: 7, rpe: 8, completed: true, setType: "top", resistanceType: "external" });
const changedActuals = engine.exerciseExpectationActuals("bench-press", { included: [{ weekStart: "2026-01-05" }, { weekStart: "2026-01-12" }] });
assert.equal(changedActuals.length, 2, "Historical target changes must be evaluated and displayed separately");

const importedSession = { id: "s3", date: "2026-01-19", title: "Imported", submitted: true };
const importedExercise = { id: "e3", sessionId: "s3", name: "Bench Press", source: "strong", resistanceType: "external" };
assert.equal(engine.savedExerciseTargetContext(importedSession, importedExercise), null, "Legacy imports must not receive invented historical targets");
const missing = engine.setProgramExpectation(importedSession, importedExercise, { reps: 8, rpe: 8, completed: true }, 0);
assert.equal(missing.hasRepTarget, false, "Missing rep targets must be labeled and excluded");
assert.equal(missing.hasRpeTarget, false, "Missing RPE targets must be labeled and excluded");

const weighted = engine.exerciseTargetContext({ id: "core", name: "Core" }, { id: "side-plank", name: "Side Plank Dip", sets: 3, reps: 12, targetRpe: 8, resistanceType: "bodyweight_plus_load" });
assert.equal(weighted.resistanceType, "bodyweight_plus_load", "Weighted bodyweight expectations must preserve resistance meaning");

assert.match(html, /function renderExerciseExpectations\(exerciseId, analysis\)/, "Charts must render Exercise Expectations");
assert.match(html, /renderHypertrophyScore\(analysis, \{ deferDetail: true \}\)[\s\S]*renderExerciseExpectations\(selectedExerciseId, analysis\)[\s\S]*renderHypertrophyScoreDetail/, "Expectations must appear between the score and expanded category analysis");
assert.match(html, /Targets changed during this window/, "Historical target changes must be disclosed");
assert.match(html, /No active program target|Historical targets only/, "Missing or historical-only targets must have an explicit state");
assert.match(html, /Excluded from hypertrophy score, hard-set volume, and PR calculations/, "Warm-up exclusions must be visible");

console.log("Exercise expectation tests passed (set types, contexts, history, missing targets, and scoring alignment).");
