const assert = require("node:assert/strict");
const fs = require("node:fs");
const { readApplicationContractSource } = require("./read-application-contract-source");

const html = readApplicationContractSource();
const domainMatch = html.match(/\/\/ DOMAIN_INTEGRITY_ENGINE_START([\s\S]*?)\/\/ DOMAIN_INTEGRITY_ENGINE_END/);
assert.ok(domainMatch, "Domain integrity engine markers were not found");

const domainFactory = new Function(`
  const ACTIVE_HISTORY_MONTHS = 6;
  const SET_CLASSIFIER_VERSION = 2;
  const DOMAIN_MIGRATION_VERSION = 2;
  const localDateIso = (date) => date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  const todayIso = () => "2026-07-10";
  const isoNow = () => "2026-07-10T12:00:00Z";
  const canonicalExerciseId = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const id = () => "generated-id";
  const isBodyweightResistance = (type) => ["bodyweight", "bodyweight_plus_load", "assisted_bodyweight"].includes(type);
  const templateSetTypesFromHistory = () => [];
  ${domainMatch[1]}
  return { calendarMonthCutoff, sessionCompletionDate, isCompletedWorkout, activeCompletedWorkoutHistory, normalizeCanonicalSetType, setTypeSemantics, isWorkingSet, classifyImportedExerciseSets, migrateDomainData };
`);
const engine = domainFactory();

assert.equal(engine.calendarMonthCutoff("2026-07-10"), "2026-01-10");
assert.equal(engine.calendarMonthCutoff("2024-08-31"), "2024-02-29", "Leap-year month subtraction must clamp to February 29");
assert.equal(engine.calendarMonthCutoff("2023-08-31"), "2023-02-28", "Non-leap month subtraction must clamp to February 28");

const sessions = [
  { id: "inside", date: "2026-01-10", submitted: true },
  { id: "outside", date: "2026-01-09", submitted: true },
  { id: "draft", date: "2026-07-09", submitted: false, workoutState: "active" },
  { id: "canceled", date: "2026-07-08", submitted: false, canceledAt: "2026-07-08" },
  { id: "restored-inside", date: "2026-06-01", submitted: true, trashed: false },
  { id: "restored-old", date: "2025-12-01", submitted: true, trashed: false }
];
assert.deepEqual(engine.activeCompletedWorkoutHistory({ sessions }, { asOfDate: "2026-07-10" }).map((session) => session.id), ["inside", "restored-inside"]);
assert.equal(sessions.length, 6, "Retention filtering must not destroy canonical history");

const aprilSets = [
  { id: "w1", setNumber: 1, sourceSetOrder: "W", weight: 45, reps: 5 },
  { id: "w2", setNumber: 2, sourceSetOrder: "W", weight: 135, reps: 5 },
  { id: "t1", setNumber: 1, sourceSetOrder: "1", weight: 165, reps: 8 },
  { id: "b1", setNumber: 2, sourceSetOrder: "2", weight: 145, reps: 8 },
  { id: "b2", setNumber: 3, sourceSetOrder: "3", weight: 145, reps: 7 }
];
assert.deepEqual(engine.classifyImportedExerciseSets(aprilSets, "external", "strong").map((item) => item.type), ["warmup", "warmup", "top", "backoff", "backoff"], "April 7 Bench Press must classify warm-ups, top set, and back-off sets correctly");

const resetOnly = [
  { id: "a", setNumber: 1, weight: 45, reps: 5 },
  { id: "b", setNumber: 2, weight: 135, reps: 5 },
  { id: "c", setNumber: 1, weight: 165, reps: 8 },
  { id: "d", setNumber: 2, weight: 145, reps: 8 }
];
assert.deepEqual(engine.classifyImportedExerciseSets(resetOnly, "external", "strong").map((item) => item.type), ["warmup", "warmup", "top", "backoff"], "Legacy numbering resets must remain inferable");
assert.notEqual(engine.classifyImportedExerciseSets(resetOnly, "external", "strong")[3].type, "warmup", "A lighter post-working set must not become a warm-up");

const manual = [{ id: "manual", setType: "drop", manualOverride: true, classificationSource: "manual", weight: 100, reps: 12 }];
assert.equal(engine.classifyImportedExerciseSets(manual, "external", "strong")[0].type, "drop", "Manual corrections must win");
const bodyweight = engine.classifyImportedExerciseSets([{ id: "bw", reps: 10 }], "bodyweight", "strong")[0];
assert.equal(bodyweight.reviewRequired, true, "Bodyweight imports without explicit metadata must avoid barbell inference");
assert.equal(engine.isWorkingSet({ setType: "warmup" }, "pr"), false);
assert.equal(engine.isWorkingSet({ setType: "top" }, "pr"), true);

const migrationModel = {
  sessions: [{ id: "s1", source: "strong", title: "Push", date: "2026-04-07", submitted: true }],
  exercises: [{ id: "e1", sessionId: "s1", source: "strong", name: "Bench Press", resistanceType: "external" }],
  sets: aprilSets.map((set) => ({ ...set, exerciseId: "e1", completed: true })),
  templates: [],
  migrationAudit: []
};
engine.migrateDomainData(migrationModel);
const auditCount = migrationModel.migrationAudit.length;
assert.equal(migrationModel.sets[0].originalImportedValue.setOrder, "W", "Original Strong set order must remain auditable");
engine.migrateDomainData(migrationModel);
assert.equal(migrationModel.migrationAudit.length, auditCount, "Migration must be idempotent");

const coachMatch = html.match(/\/\/ COACH_RECOMMENDATION_ENGINE_START([\s\S]*?)\/\/ COACH_RECOMMENDATION_ENGINE_END/);
assert.ok(coachMatch, "Coach recommendation engine markers were not found");
const coachFactory = new Function("weeks", "base", `
  const summarizeExerciseByWeek = () => weeks;
  const recommendForExerciseWeek = () => base;
  const canonicalExerciseId = (name) => name.toLowerCase();
  const getExerciseSets = (name) => ({ exercises: [{ name, resistanceType: "external" }] });
  const resistanceTypeFor = (exercise) => exercise.resistanceType;
  const progressionProfileForExercise = () => ({ lowerRep: 6, upperRep: 12, increment: 5 });
  const roundToIncrement = (value, increment) => Math.round(value / increment) * increment;
  const nextLoadForExercise = (name, load) => load + 5;
  const todayIso = () => "2026-07-10";
  ${coachMatch[1]}
  return coachRecommendationForExercise;
`);
const deload = coachFactory([{ weekStart: "2026-07-06", failedSets: 2, averageRpe: 9.5, bestEstimatedOneRepMax: 90 }], { decision: "deload", label: "Deload", reason: "Repeated misses", action: "Reduce", evidence: [], confidence: "high" })("Bench Press");
assert.equal(deload.interventionType, "deload");
assert.equal(deload.loadAdjustment, -0.1);
assert.equal(deload.removeIntensificationTechniques, true);
const light = coachFactory([{ weekStart: "2026-07-06", failedSets: 1, averageRpe: 9.1, bestEstimatedOneRepMax: 100 }], { decision: "hold", label: "Hold", reason: "One miss", action: "Repeat", evidence: [], confidence: "medium" })("Bench Press");
assert.equal(light.interventionType, "light");
assert.equal(light.rpeTarget, 7);
const normal = coachFactory([{ weekStart: "2026-07-06", failedSets: 0, averageRpe: 8, bestEstimatedOneRepMax: 100 }], { decision: "hold", label: "Hold", reason: "Stable", action: "Repeat", evidence: [], confidence: "high" })("Bench Press");
assert.equal(normal.interventionType, "normal");
const modify = coachFactory([{ weekStart: "2026-07-06", failedSets: 0, averageRpe: 8, bestEstimatedOneRepMax: 100 }], { decision: "change", label: "Change variation", reason: "Stalled", action: "Substitute", evidence: [], confidence: "medium" })("Bench Press");
assert.equal(modify.interventionType, "stop_modify");

assert.match(html, /function completedAnalysisIndex\(\)[\s\S]*const sessions = activeHistorySessions\(\);[\s\S]*sessionById/, "Charts and scoring must use the indexed canonical active history");
assert.match(html, /qualifyingWeekIds: analysis\.qualifyingWeekIds/, "Chart points must use the selected qualifying weeks");
assert.match(html, /coachRecommendationForExercise\(templateExercise\.name/, "Template prescriptions must use the shared recommendation source");
assert.match(html, /coachRecommendationForExercise\(selectedName/, "Charts must use the shared recommendation source");
assert.match(html, /Historical snapshot through/, "Historical recommendations must be visibly separated from current guidance");
assert.match(html, /data-action="set-type-override"/, "History editing must expose manual set-type correction");
assert.match(html, /function getMostRecentWorkoutPerformance\(exerciseName, options = \{\}\)/, "All prior workout consumers must use one canonical resolver");
assert.match(html, /requestedResistanceType[\s\S]*resistanceTypeFor\(entry\.exercise, entry\.set\) === requestedResistanceType/, "Prior workout resolution must preserve resistance-type identity");
assert.match(html, /function submittedPerformanceIndex[\s\S]*isCompletedWorkout[\s\S]*strongExercisesByExactName/, "Last-time lookup must index the full submitted archive and retain an exact-name Strong fallback");
assert.match(html, /function getMostRecentWorkoutPerformance[\s\S]*submittedPerformanceIndex\(throughDate\)[\s\S]*strongExercisesByExactName\.get\(requestedExactName\)/, "Prior workout resolution must survive performance-ID drift without merging differently named Strong variations");
assert.match(html, /function createTemplatesFromStrongSessions[\s\S]*exerciseIdentityFields\(exercise\)/, "Strong-derived templates must preserve imported exercise identity fields");
assert.match(html, /function auditImportedTemplateHistory\(templates\)/, "Strong imports must audit history coverage across every generated template exercise");
assert.match(html, /source: "strong"/, "Strong-derived templates must retain import provenance");
assert.match(html, /function strongHistoryFallbackForTemplateExercise[\s\S]*performance\.session\?\.source !== "strong"[\s\S]*history_fallback/, "Unmapped Strong identities must use exact submitted history without weakening the research identity boundary");
assert.match(html, /fallbackReasons = new Set\(\["unknown_exercise_identity", "invalid_muscle_identity", "no_dynamic_direct_target"\]\)/, "Safe Strong-history fallback must cover every audited non-safety identity/target gap");

console.log("Domain integrity tests passed (retention, classification, migration, snapshots, and coaching source).");
