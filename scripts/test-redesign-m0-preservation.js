const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const backupContract = require("../backup-contract.js");

const root = path.resolve(__dirname, "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "redesign-m0");
const schemaFiles = [
  "redesign-app-data.v3.schema.json",
  "redesign-backup.v3.schema.json",
  "redesign-active-draft.v2.schema.json",
  "redesign-resolved-action.v1.schema.json",
  "redesign-workout-grade.v2.schema.json"
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function withoutKeys(record, keys) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

function preservationProjection(backup) {
  return canonical({
    sessions: backup.sessions.map((session) => withoutKeys(session, ["mesocycleId"])),
    exercises: backup.exercises,
    sets: backup.sets,
    templates: backup.templates.map((template) => {
      const preserved = withoutKeys(template, ["mesocycleId", "mesocycleRevision", "trainingDayId"]);
      preserved.exercises = preserved.exercises.map((exercise) => withoutKeys(exercise, ["mesocycleSlotId", "assignmentId"]));
      return preserved;
    })
  });
}

const versions = new Set();
schemaFiles.forEach((name) => {
  const schema = readJson(path.join(root, "schemas", name));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok(schema["x-contract-version"], `${name} must declare a contract version`);
  assert.equal(versions.has(schema["x-contract-version"]), false, `${name} must have a unique contract version`);
  versions.add(schema["x-contract-version"]);
});

const legacyV1 = readJson(path.join(fixtureRoot, "backup-v1-legacy.json"));
const legacyV2 = readJson(path.join(fixtureRoot, "backup-v2-mesocycle-equipment.json"));
const currentV3 = readJson(path.join(fixtureRoot, "backup-v3-current.json"));

[legacyV1, legacyV2, currentV3].forEach((fixture) => {
  const before = preservationProjection(fixture);
  const first = backupContract.validateAndSanitizeBackup(fixture);
  const exported = backupContract.createBackupExport(first);
  const second = backupContract.validateAndSanitizeBackup(exported);
  assert.deepEqual(preservationProjection(second), before, `appDataVersion ${fixture.appDataVersion} must preserve source observations`);
  assert.deepEqual(canonical(second), canonical(exported), `appDataVersion ${fixture.appDataVersion} round-trip must be idempotent`);
});

assert.equal(
  backupContract.createBackupExport(currentV3).backupSchemaVersion,
  backupContract.BACKUP_SCHEMA_VERSION,
  "Current app data must export through the executable v3 backup contract"
);
assert.equal(
  backupContract.createBackupExport(currentV3).sessions[0].gradeVersion,
  "actual-work-grade/2.0.0",
  "Current versioned grades must survive export"
);
assert.deepEqual(
  canonical(backupContract.createBackupExport(currentV3).sessions[0].resolvedActions),
  canonical(currentV3.sessions[0].resolvedActions),
  "Canonical resolved actions and explicit user handling must survive backup round-trip"
);

const legacyV1RoundTrip = backupContract.createBackupExport(legacyV1);
assert.deepEqual(
  canonical(legacyV1RoundTrip.exercises[0].recommendationSnapshot),
  canonical(legacyV1.exercises[0].recommendationSnapshot),
  "Historical recommendation snapshots must survive compatibility round-trip"
);
assert.equal(legacyV1RoundTrip.exercises[0].executionQualityAssessment, "controlled");

const legacyV2RoundTrip = backupContract.createBackupExport(legacyV2);
assert.equal("mesocycles" in legacyV2RoundTrip, false, "New exports must not recreate obsolete planner collections");
assert.equal("activeMesocycleId" in legacyV2RoundTrip, false, "New exports must not recreate active planner selection");
assert.equal("availableEquipment" in legacyV2RoundTrip.settings, false, "New exports must not recreate the legacy equipment blocker");
assert.equal(legacyV2RoundTrip.sessions[0].grade, "B+");
assert.equal(legacyV2RoundTrip.sessions[0].gradeVersion, "legacy-grade/1");
assert.deepEqual(canonical(legacyV2RoundTrip.sets[0].originalImportedValue), canonical(legacyV2.sets[0].originalImportedValue));
assert.deepEqual(canonical(legacyV2RoundTrip.sessions[0].workoutPrescription), canonical(legacyV2.sessions[0].workoutPrescription), "Historical workout/routine snapshots must survive planner-state removal");

const draft = readJson(path.join(fixtureRoot, "active-draft-recovery.json"));
const draftClone = JSON.parse(JSON.stringify(draft));
assert.deepEqual(draftClone, draft, "Active-draft fixture must be JSON-safe and lossless");
assert.equal(draftClone.sets.find((set) => !set.completed).rpe, "7.5", "Incomplete decimal RPE must survive draft serialization");
assert.equal(draftClone.session.activeExerciseId, "synthetic-active-exercise-2");
assert.deepEqual(draftClone.exercises.map((exercise) => exercise.order), [0, 1]);
assert.equal(draftClone.timer.state, "running");
assert.equal(draftClone.resolvedActions[0].handling, "overridden", "Active draft recovery must preserve canonical action handling");

const roles = readJson(path.join(fixtureRoot, "set-role-ambiguity.json"));
assert.equal(roles.sets.find((set) => set.id === "synthetic-role-ambiguous").reviewRequired, true);
assert.equal(roles.sets.find((set) => set.id === "synthetic-role-recorded").classificationSource, "recorded");
roles.sets.forEach((set) => assert.ok(set.originalImportedValue, "Every imported role fixture must preserve the original value"));

const fixtureText = fs.readdirSync(fixtureRoot)
  .filter((name) => name.endsWith(".json"))
  .map((name) => fs.readFileSync(path.join(fixtureRoot, name), "utf8"))
  .join("\n");
assert.doesNotMatch(fixtureText, /Erik Mills|personal_fitness_data|private-personal-data|@(?:gmail|outlook|icloud)\./i, "Committed M0 fixtures must remain synthetic and privacy-safe");

console.log("Redesign M0 preservation tests passed (versioned targets, legacy round-trip, historical fields, active draft, role provenance, and privacy-safe fixtures).");
