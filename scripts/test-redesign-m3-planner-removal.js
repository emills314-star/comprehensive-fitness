"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const backupContract = require("../backup-contract.js");

const root = path.resolve(__dirname, "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "redesign-m0");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), "utf8"));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function withoutKeys(record, keys) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}(`, start) : -1;
  assert.notEqual(end, -1, `Missing function boundary ${nextName}`);
  return source.slice(start, end);
}

function importValidator() {
  const source = fs.readFileSync(path.join(root, "app-import.js"), "utf8");
  const start = source.indexOf("function validateImportedAppData(");
  const end = source.indexOf("async function researchOnlyBundleForImport(", start);
  assert.notEqual(start, -1, "The strict app-data import boundary must exist.");
  assert.notEqual(end, -1, "The strict app-data import boundary must remain isolated.");
  return {
    source: source.slice(start, end),
    validate: vm.runInNewContext(
      `(${source.slice(start, end).trim()})`,
      {
        BACKUP_IMPORT_LIMITS: {
          maxFileBytes: 50 * 1024 * 1024,
          maxJsonDepth: 24,
          maxObjectKeys: 1000,
          maxSessions: 100000,
          maxExercises: 100000,
          maxSets: 100000,
          maxTemplates: 100000
        },
        validateBackupJsonShape: () => true,
        TextEncoder
      },
      { filename: "app-import.js#validateImportedAppData" }
    )
  };
}

const legacy = readJson("backup-v2-mesocycle-equipment.json");
const rawLegacyEnvelope = backupContract.validateAndSanitizeBackup(legacy);

assert.deepEqual(
  plain(rawLegacyEnvelope.mesocycles),
  legacy.mesocycles,
  "The isolated compatibility reader must accept the obsolete planner payload before decoding it."
);
assert.equal(rawLegacyEnvelope.activeMesocycleId, legacy.activeMesocycleId);
assert.doesNotThrow(
  () => backupContract.validateAndSanitizeBackup({ ...legacy, activeMesocycleId: "obsolete-orphan-reference" }),
  "An obsolete active-plan reference must not block preservation of otherwise valid workout history."
);

const decoded = backupContract.decodeLegacyBackup(legacy);
assert.equal("mesocycles" in decoded, false, "Decoded app data must not recreate a mesocycle collection.");
assert.equal("activeMesocycleId" in decoded, false, "Decoded app data must not recreate active planner selection.");
assert.equal("mesocycleId" in decoded.sessions[0], false, "Session planner linkage must not survive as active state.");
assert.equal("mesocycleId" in decoded.templates[0], false, "Routine planner linkage must not survive as active state.");
assert.equal("mesocycleRevision" in decoded.templates[0], false);
assert.equal("trainingDayId" in decoded.templates[0], false);
assert.equal("mesocycleSlotId" in decoded.templates[0].exercises[0], false);
assert.equal("assignmentId" in decoded.templates[0].exercises[0], false);
for (const key of ["availableEquipment", "excludedExerciseIds", "trainingGoal", "trainingDaysPerWeek"]) {
  assert.equal(key in decoded.settings, false, `Legacy planning setting ${key} must be discarded.`);
}

assert.deepEqual(plain(decoded.exercises), legacy.exercises, "Completed exercise facts and immutable historical snapshots must survive decoding.");
assert.deepEqual(plain(decoded.sets), legacy.sets, "Recorded load, reps, RPE, role, and import provenance must survive decoding.");
assert.deepEqual(
  plain(decoded.sessions[0].workoutPrescription),
  legacy.sessions[0].workoutPrescription,
  "An embedded historical workout/routine label snapshot must remain immutable."
);
assert.equal(decoded.sessions[0].title, legacy.sessions[0].title);
assert.equal(decoded.sessions[0].notes, legacy.sessions[0].notes);
assert.equal(decoded.sessions[0].durationSeconds, legacy.sessions[0].durationSeconds);
assert.deepEqual(plain(decoded.sessions[0].exerciseQualityAnswers), legacy.sessions[0].exerciseQualityAnswers);

const expectedTemplate = withoutKeys(legacy.templates[0], ["mesocycleId", "mesocycleRevision", "trainingDayId"]);
expectedTemplate.exercises = expectedTemplate.exercises.map((exercise) => withoutKeys(exercise, ["mesocycleSlotId", "assignmentId"]));
assert.deepEqual(
  plain(decoded.templates[0]),
  expectedTemplate,
  "Routine name, notes, ordered exercises, identities, and stable targets must survive without planner coupling."
);

const secondDecode = backupContract.decodeLegacyBackup(decoded);
assert.deepEqual(plain(secondDecode), plain(decoded), "Legacy decoding must be idempotent.");

const legacyExport = backupContract.createBackupExport(legacy);
assert.equal("mesocycles" in legacyExport, false, "A new export must never write obsolete planner collections.");
assert.equal("activeMesocycleId" in legacyExport, false, "A new export must never write active planner selection.");
assert.deepEqual(
  plain(backupContract.createBackupExport(legacyExport)),
  plain(legacyExport),
  "A decoded legacy export must remain idempotent."
);

const currentFixture = readJson("backup-v3-current.json");
const currentWithObsoleteKeys = {
  ...currentFixture,
  mesocycles: legacy.mesocycles,
  activeMesocycleId: legacy.activeMesocycleId,
  sessions: currentFixture.sessions.map((session, index) => index ? session : { ...session, mesocycleId: legacy.activeMesocycleId }),
  templates: currentFixture.templates.map((template, index) => index ? template : { ...template, mesocycleId: legacy.activeMesocycleId })
};
const currentExport = backupContract.createBackupExport(currentWithObsoleteKeys);
assert.equal(currentExport.backupSchemaVersion, backupContract.BACKUP_SCHEMA_VERSION);
assert.equal("mesocycles" in currentExport, false, "Current v3 exports must omit obsolete planner collections.");
assert.equal("activeMesocycleId" in currentExport, false, "Current v3 exports must omit obsolete planner selection.");
assert.ok(currentExport.sessions.length > 0 && currentExport.templates.length > 0, "Current export must retain workout and routine facts.");

const strict = importValidator();
assert.doesNotMatch(strict.source, /allowedMesocycleFields|const mesocycles|activeMesocycleId|mesocycleSlotId|assignmentId/, "The active import validator must not recreate or validate planner state.");
assert.match(strict.source, /"durationSeconds"/, "Captured session duration must remain importable.");
assert.match(strict.source, /"exerciseQualityAnswers"/, "Historical execution-quality answers must remain importable as read-only facts.");
const { backupSchemaVersion: _decodedBackupSchemaVersion, ...decodedAppData } = decoded;
const imported = strict.validate(decodedAppData);
assert.equal("mesocycles" in imported, false);
assert.equal("activeMesocycleId" in imported, false);
assert.equal(imported.sessions[0].durationSeconds, legacy.sessions[0].durationSeconds);
assert.deepEqual(plain(imported.sessions[0].exerciseQualityAnswers), legacy.sessions[0].exerciseQualityAnswers);
assert.deepEqual(plain(imported.sessions[0].workoutPrescription), legacy.sessions[0].workoutPrescription);
assert.deepEqual(plain(strict.validate(imported)), plain(imported), "Strict decoded import must be idempotent.");

const importSource = fs.readFileSync(path.join(root, "app-import.js"), "utf8");
assert.match(
  importSource,
  /validateAndSanitizeBackup\(parsed,[\s\S]*?decodeLegacyBackup\(envelope\)[\s\S]*?validateImportedAppData\(imported,/,
  "Backup import must structurally validate, decode obsolete planning state, then cross the strict active-data boundary."
);

for (const relativePath of [
  "app-analysis.js",
  "app-foundation.js",
  "app-views.js",
  "app-workout.js",
  "app.js",
  "index.html",
  "sw.js"
]) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert.doesNotMatch(
    source,
    /mesocycle|guided[-_ ]?(?:builder|planner|plan)|activeMesocycle|currentMesocycle|trainingDaysPerWeek/i,
    `${relativePath} must not retain a normal runtime planner reference.`
  );
}

for (const removedPath of [
  "guided-mesocycle.js",
  "schemas/guided-mesocycle.v1.schema.json",
  "schemas/mesocycle-plan.v1.schema.json"
]) {
  assert.equal(fs.existsSync(path.join(root, removedPath)), false, `${removedPath} must be deleted at M3 exit.`);
}

const engineSource = fs.readFileSync(path.join(root, "prescription-engine.js"), "utf8");
assert.doesNotMatch(
  engineSource,
  /function\s+(?:createExercisePrescriptionSnapshot|createWorkoutPrescription)\b/,
  "The final compatibility engine must not retain live recommendation or workout-prescription writers."
);
assert.doesNotMatch(
  engineSource,
  /createMesocycle|refreshMesocycle|transitionMesocycle|canDeleteMesocycle|MESOCYCLE_TYPES|reasonForMesocycle|affectsMesocycle/,
  "Planner-only engine APIs and output fields must be absent."
);

console.log("Redesign M3 planner-removal tests passed (legacy decode, factual preservation, strict import, idempotency, and planner-free current export).");
