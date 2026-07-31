const assert = require("node:assert/strict");
const fs = require("node:fs");
const contract = require("../backup-contract.js");
const { readApplicationContractSource } = require("./read-application-contract-source");

function validBackup() {
  return {
    appDataVersion: 2,
    sessions: [{ id: "session-1", title: "Legs <controlled text>", grade: "B+", gradeVersion: "legacy-grade/1" }],
    exercises: [{ id: "exercise-1", sessionId: "session-1", name: "Squat" }],
    sets: [{ id: "set-1", exerciseId: "exercise-1", reps: 5 }],
    templates: [{ id: "template-1", name: "A", exercises: [{ id: "template-exercise-1", name: "Squat" }] }],
    mesocycles: [], recommendationHistory: [], manualOverrides: [], rawImports: [], migrationAudit: [],
    activeMesocycleId: "", settings: { theme: "dark" }, ignoredTopLevelField: "removed"
  };
}

const roundTrip = contract.createBackupExport(validBackup());
assert.equal(roundTrip.backupSchemaVersion, contract.LEGACY_BACKUP_SCHEMA_VERSION);
assert.equal(roundTrip.sessions[0].title, "Legs <controlled text>", "User text remains data for escaped rendering");
assert.equal(roundTrip.sessions[0].grade, "B+", "Historical grade values must remain immutable source records");
assert.equal(roundTrip.sessions[0].gradeVersion, "legacy-grade/1", "Historical grade versions must remain attributable");
assert.equal(roundTrip.ignoredTopLevelField, undefined, "Unknown top-level capabilities must not enter app state");
assert.equal(Object.getPrototypeOf(roundTrip), null, "Validated objects must not inherit attacker-controlled prototypes");

assert.throws(() => contract.validateAndSanitizeBackup({ ...validBackup(), backupSchemaVersion: "future/9.0.0" }), /unsupported backup schema version/);
assert.equal(contract.validateAndSanitizeBackup({ ...validBackup(), appDataVersion: 1 }).appDataVersion, 1, "Supported legacy app data must retain its migration version");
const currentExport = contract.createBackupExport({ ...validBackup(), appDataVersion: 3 });
assert.equal(currentExport.backupSchemaVersion, contract.BACKUP_SCHEMA_VERSION, "Current v3 app data must export through the v3 backup contract");
assert.equal(contract.validateAndSanitizeBackup(currentExport).appDataVersion, 3, "Current v3 exports must remain importable");
assert.throws(() => contract.validateAndSanitizeBackup({ ...validBackup(), appDataVersion: 3, backupSchemaVersion: contract.LEGACY_BACKUP_SCHEMA_VERSION }), /incompatible with appDataVersion/);
assert.throws(() => contract.validateAndSanitizeBackup({ ...validBackup(), appDataVersion: 0 }), /appDataVersion must be 1, 2, or 3/);
assert.throws(() => contract.validateAndSanitizeBackup({ ...validBackup(), sessions: [{ id: '\"><img src=x onerror=alert(1)>' }] }), /safe structural identifier/);
assert.throws(() => contract.validateAndSanitizeBackup({ ...validBackup(), sets: [{ id: "set-1", exerciseId: "missing" }] }), /unknown exercise/);
assert.equal(contract.MAX_BACKUP_BYTES, 50 * 1024 * 1024, "The shared backup contract must retain the recoverability boundary for large legitimate histories");
assert.throws(() => contract.validateAndSanitizeBackup(validBackup(), { byteLength: contract.MAX_BACKUP_BYTES + 1 }), /50 MiB import limit/);

const polluted = JSON.parse('{"appDataVersion":2,"sessions":[],"exercises":[],"sets":[],"templates":[],"settings":{},"__proto__":{"polluted":true}}');
assert.throws(() => contract.validateAndSanitizeBackup(polluted), /forbidden property name/);
assert.equal({}.polluted, undefined);

const html = readApplicationContractSource();
assert.match(html, /FitnessBackupContract\.validateAndSanitizeBackup\(parsed,[\s\S]*?backupSchemaVersion:[\s\S]*?validateImportedAppData\(imported,/, "JSON imports must validate and remove envelope-only metadata before the strict app-data boundary");
assert.match(html, /FitnessBackupContract\.createBackupExport\(data\)/, "Exports must carry the current validated backup contract");
assert.match(html, /allowedSessionFields[\s\S]*?"grade", "gradeVersion"/, "Strict app-data import must preserve historical grade values and versions");

console.log("Backup contract tests passed (versioning, structural IDs, references, limits, and prototype safety).");
