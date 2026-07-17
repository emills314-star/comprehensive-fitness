const assert = require("node:assert/strict");
const fs = require("node:fs");
const contract = require("../backup-contract.js");

function validBackup() {
  return {
    appDataVersion: 2,
    sessions: [{ id: "session-1", title: "Legs <controlled text>" }],
    exercises: [{ id: "exercise-1", sessionId: "session-1", name: "Squat" }],
    sets: [{ id: "set-1", exerciseId: "exercise-1", reps: 5 }],
    templates: [{ id: "template-1", name: "A", exercises: [{ id: "template-exercise-1", name: "Squat" }] }],
    mesocycles: [], recommendationHistory: [], manualOverrides: [], rawImports: [], migrationAudit: [],
    activeMesocycleId: "", settings: { theme: "dark" }, ignoredTopLevelField: "removed"
  };
}

const roundTrip = contract.createBackupExport(validBackup());
assert.equal(roundTrip.backupSchemaVersion, contract.BACKUP_SCHEMA_VERSION);
assert.equal(roundTrip.sessions[0].title, "Legs <controlled text>", "User text remains data for escaped rendering");
assert.equal(roundTrip.ignoredTopLevelField, undefined, "Unknown top-level capabilities must not enter app state");
assert.equal(Object.getPrototypeOf(roundTrip), null, "Validated objects must not inherit attacker-controlled prototypes");

assert.throws(() => contract.validateAndSanitizeBackup({ ...validBackup(), backupSchemaVersion: "future/9.0.0" }), /unsupported backup schema version/);
assert.throws(() => contract.validateAndSanitizeBackup({ ...validBackup(), appDataVersion: 1 }), /appDataVersion must be 2/);
assert.throws(() => contract.validateAndSanitizeBackup({ ...validBackup(), sessions: [{ id: '\"><img src=x onerror=alert(1)>' }] }), /safe structural identifier/);
assert.throws(() => contract.validateAndSanitizeBackup({ ...validBackup(), sets: [{ id: "set-1", exerciseId: "missing" }] }), /unknown exercise/);
assert.throws(() => contract.validateAndSanitizeBackup(validBackup(), { byteLength: contract.MAX_BACKUP_BYTES + 1 }), /50 MB import limit/);

const polluted = JSON.parse('{"appDataVersion":2,"sessions":[],"exercises":[],"sets":[],"templates":[],"settings":{},"__proto__":{"polluted":true}}');
assert.throws(() => contract.validateAndSanitizeBackup(polluted), /forbidden property name/);
assert.equal({}.polluted, undefined);

const html = fs.readFileSync("index.html", "utf8");
assert.match(html, /FitnessBackupContract\.validateAndSanitizeBackup\(JSON\.parse\(text\)/, "JSON imports must cross the strict backup boundary before normalization or persistence");
assert.match(html, /FitnessBackupContract\.createBackupExport\(data\)/, "Exports must carry the current validated backup contract");

console.log("Backup contract tests passed (versioning, structural IDs, references, limits, and prototype safety).");
