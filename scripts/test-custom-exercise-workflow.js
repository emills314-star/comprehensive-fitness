"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const backupContract = require("../backup-contract.js");

const root = path.resolve(__dirname, "..");
const source = ["app-foundation.js", "app-import.js", "app-analysis.js", "app-workout.js", "app-views.js", "app.js", "index.html"]
  .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
  .join("\n");
const foundationSource = fs.readFileSync(path.join(root, "app-foundation.js"), "utf8");
const workoutSource = fs.readFileSync(path.join(root, "app-workout.js"), "utf8");

function functionSource(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} in runtime source.`);
  const bodyStart = text.indexOf("{", text.indexOf(")", start));
  let depth = 0;
  for (let index = bodyStart; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

assert.match(source, /customExercises:\s*\[\]/, "Fresh app data must own a persistent custom exercise catalog.");
assert.match(source, /`user:\$\{id\(\)\}`/, "New custom exercises must receive stable user: namespaced IDs.");
assert.match(source, /customExerciseNameCollision/, "Creation and editing must reject exact normalized name collisions.");
assert.match(source, /PERSONAL_MAPPING_VERSION/, "Custom muscle relationships must retain versioned user-authored provenance.");
assert.match(source, /Research effectiveness, citations, and pain-safe substitutions are never invented/, "Custom exercise UI must disclose the canonical-evidence boundary.");
assert.match(source, /data-action="template-exercise-catalog"/, "Template setup must select built-in and user-defined catalog records.");
assert.match(source, /function updateTemplateSetRepTarget/, "Template setup must own per-set rep-target updates.");
assert.match(source, /targetRepMin:\s*prescription\.repMin[\s\S]*targetRepMax:\s*prescription\.repMax/, "Per-set min/max targets must propagate into active workout sets.");
assert.match(source, /user_template_set_target/, "User-authored per-set ranges must retain explicit provenance.");
assert.match(source, /Edit Logged Workout/, "Read-only history must make the protected edit transaction discoverable.");
assert.ok((source.match(/Why This Recommendation/g) || []).length >= 8, "Actionable recommendation surfaces must share the collapsed explanation heading.");
assert.match(source, /function renderRecoveryPanel[\s\S]*?<summary>Why This Recommendation<\/summary>/, "Recovery readiness must offer a collapsed exact-heading explanation.");
assert.match(source, /function renderQuickStartTemplates[\s\S]*?<summary>Why This Recommendation<\/summary>/, "Quick-template recommendations must offer a collapsed exact-heading explanation.");

const historyFixture = {
  sessions: [
    { id: "session-old", date: "2026-07-01", submitted: true },
    { id: "session-new", date: "2026-07-08", submitted: true }
  ],
  exercises: [
    { id: "exercise-old", sessionId: "session-old", customExerciseId: "user:garage-press", name: "Garage Arc Press", order: 0 },
    { id: "exercise-new", sessionId: "session-new", customExerciseId: "user:garage-press", name: "Renamed Arc Press", order: 0 }
  ],
  sets: [
    { id: "set-old", exerciseId: "exercise-old", completed: true, reps: 8, weight: 40, setNumber: 1 },
    { id: "set-new", exerciseId: "exercise-new", completed: true, reps: 10, weight: 45, setNumber: 1 }
  ]
};
const historyRuntime = new Function("fixture", `
  const data = fixture;
  let analysisRevision = 1;
  let completedAnalysisIndexCache = null;
  const exerciseScopeCache = new Map();
  const previousPerformanceCache = new Map();
  function canonicalExerciseId(name) { return "canonical:" + String(name || "").trim().toLowerCase().replace(/\\s+/g, "-"); }
  function activeHistorySessions() { return data.sessions; }
  function todayIso() { return "2026-07-18"; }
  function startOfWeekIso(value) { return value; }
  function isWorkingSet() { return true; }
  ${functionSource(foundationSource, "analysisExerciseId")}
  ${functionSource(foundationSource, "completedAnalysisIndex")}
  ${functionSource(foundationSource, "getExerciseSets")}
  ${functionSource(foundationSource, "getMostRecentWorkoutSets")}
  return { completedAnalysisIndex, getExerciseSets, getMostRecentWorkoutSets };
`)(historyFixture);
const groupedHistory = historyRuntime.completedAnalysisIndex();
assert.equal(groupedHistory.exercisesByCanonical.get("user:garage-press").length, 2, "Renaming a custom exercise must keep one stable history group.");
assert.equal(groupedHistory.setsByCanonical.get("user:garage-press").length, 2, "All completed sets must remain attached to the stable custom ID.");
assert.deepEqual(historyRuntime.getMostRecentWorkoutSets("Renamed Arc Press", { customExerciseId: "user:garage-press" }).map((set) => set.id), ["set-new"], "Prior-performance lookup must continue across a custom exercise rename.");

let patchedExercise = null;
const perSetRuntime = new Function("fixture", `
  const data = fixture;
  function patchTemplateExercise(templateId, exerciseId, patch) { patchedExercise = patch; }
  let patchedExercise = null;
  ${functionSource(workoutSource, "editableTemplateSetTypes")}
  ${functionSource(workoutSource, "updateTemplateSetRepTarget")}
  updateTemplateSetRepTarget("template", "custom", 1, { repMin: 6, repMax: 9 });
  return patchedExercise;
`)({ templates: [{ id: "template", exercises: [{ id: "custom", customExerciseId: "user:garage-press", name: "Renamed Arc Press", sets: 2, reps: 8, repMin: 8, repMax: 8 }] }] });
patchedExercise = perSetRuntime;
assert.deepEqual(patchedExercise.setTypes.map(({ repMin, repMax }) => [repMin, repMax]), [[8, 8], [6, 9]], "A user-authored rep range must update only its selected set.");
assert.equal(patchedExercise.setTypes[1].rangeSource, "user_template_set_target", "Per-set targets must retain user-authored provenance.");

const collisionRuntime = new Function("fixture", `
  const data = fixture;
  function normalizePrescriptionIdentity(name) { return String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function resolvePrescriptionExerciseIdentity({ name }) { return normalizePrescriptionIdentity(name) === "bench press" ? { status: "resolved", custom: false } : { status: "unresolved" }; }
  ${functionSource(foundationSource, "customExerciseNameCollision")}
  return customExerciseNameCollision;
`)({ customExercises: [{ id: "user:garage-press", name: "Garage Arc Press", archivedAt: "2026-07-10T00:00:00.000Z" }] });
assert.match(collisionRuntime("garage-arc press"), /already used/, "Archived custom names must still collide so references cannot fork silently.");
assert.match(collisionRuntime("Bench Press"), /built-in exercise taxonomy/, "Built-in taxonomy names must be rejected for custom creation.");

const backup = backupContract.createBackupExport({
  appDataVersion: 2,
  sessions: [],
  exercises: [],
  sets: [],
  templates: [{ id: "template:test", name: "Garage day", exercises: [{ id: "template-exercise:test", customExerciseId: "user:test-press", name: "Renamed Garage Arc Press", sets: 1, reps: 8 }] }],
  customExercises: [{ id: "user:test-press", name: "Renamed Garage Arc Press", primaryMuscle: "Chest", secondaryMuscle: "Triceps", resistanceType: "external", equipment: ["dumbbell"], archivedAt: "2026-07-18T13:00:00.000Z", createdAt: "2026-07-18T12:00:00.000Z", updatedAt: "2026-07-18T13:00:00.000Z", provenance: "user_defined" }],
  mesocycles: [],
  activeMesocycleId: "",
  recommendationHistory: [],
  manualOverrides: [],
  personalEvidencePackage: null,
  rawImports: [],
  migrationAudit: [],
  dataRevision: 0,
  settings: {}
});
assert.equal(backup.customExercises[0].id, "user:test-press", "Backup exports must retain custom exercise identity and metadata.");
assert.equal(backup.customExercises[0].archivedAt, "2026-07-18T13:00:00.000Z", "Backup exports must retain archive state.");
assert.equal(backup.templates[0].exercises[0].customExerciseId, "user:test-press", "Backup exports must retain template references to archived or renamed custom exercises.");

console.log("Custom exercise, per-set target, explanation, and editable-history contracts passed.");
