const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const contract = require("../backup-contract.js");
const { syntheticCoachBackup } = require("../tests/fixtures/synthetic-coach-backup.js");
const { readApplicationContractSource } = require("./read-application-contract-source");

function validBackup() {
  return {
    appDataVersion: 2,
    sessions: [{ id: "session-1", title: "Legs <controlled text>", grade: "B+", gradeVersion: "legacy-grade/1" }],
    exercises: [{ id: "exercise-1", sessionId: "session-1", name: "Squat" }],
    sets: [{ id: "set-1", exerciseId: "exercise-1", reps: 5 }],
    templates: [{ id: "template-1", name: "A", exercises: [{ id: "template-exercise-1", name: "Squat" }] }],
    mesocycles: [], recommendationHistory: [], manualOverrides: [], personalEvidencePackage: { legacy: true }, rawImports: [], migrationAudit: [],
    activeMesocycleId: "", settings: { theme: "dark" }, ignoredTopLevelField: "removed"
  };
}

function validActiveWorkoutDraft() {
  return {
    contractVersion: "comprehensive-fitness-active-draft/2.0.0",
    version: 2,
    workoutId: "draft-session-1",
    savedAt: "2026-08-01T12:00:00.000Z",
    dataRevision: 4,
    draftSequence: 2,
    session: { id: "draft-session-1" },
    exercises: [{ id: "draft-exercise-1", sessionId: "draft-session-1", name: "Synthetic Squat", order: 0 }],
    sets: [{ id: "draft-set-1", exerciseId: "draft-exercise-1", setNumber: 1, reps: 5, weight: 100, rpe: 8 }],
    timer: null,
    resolvedActions: []
  };
}

function minimalCurrentData(overrides = {}) {
  return {
    appDataVersion: 3,
    domainMigrationVersion: 4,
    sessions: [],
    exercises: [],
    sets: [],
    templates: [],
    rawImports: [],
    migrationAudit: [],
    dataRevision: 1,
    settings: {},
    ...overrides
  };
}

const roundTrip = contract.createBackupExport(validBackup());
assert.equal(roundTrip.backupSchemaVersion, contract.LEGACY_BACKUP_SCHEMA_VERSION);
assert.equal(roundTrip.sessions[0].title, "Legs <controlled text>", "User text remains data for escaped rendering");
assert.equal(roundTrip.sessions[0].grade, "B+", "Historical grade values must remain immutable source records");
assert.equal(roundTrip.sessions[0].gradeVersion, "legacy-grade/1", "Historical grade versions must remain attributable");
assert.equal(roundTrip.ignoredTopLevelField, undefined, "Unknown top-level capabilities must not enter app state");
assert.equal(Object.getPrototypeOf(roundTrip), null, "Validated objects must not inherit attacker-controlled prototypes");
assert.equal(Object.hasOwn(roundTrip, "recommendationHistory"), false, "Exports must not recreate the deleted top-level recommendation history domain");
assert.equal(Object.hasOwn(roundTrip, "manualOverrides"), false, "Exports must not recreate the deleted top-level manual override domain");
assert.equal(Object.hasOwn(roundTrip, "personalEvidencePackage"), false, "Exports must not recreate the deleted top-level personal evidence domain");

const decodedLegacyDomains = contract.decodeLegacyBackup(validBackup());
assert.equal(Object.hasOwn(decodedLegacyDomains, "recommendationHistory"), false, "Legacy recommendation history must be accepted then discarded at the compatibility boundary");
assert.equal(Object.hasOwn(decodedLegacyDomains, "manualOverrides"), false, "Legacy top-level overrides must be accepted then discarded at the compatibility boundary");
assert.equal(Object.hasOwn(decodedLegacyDomains, "personalEvidencePackage"), false, "Legacy personal evidence must be accepted then discarded at the compatibility boundary");

assert.throws(() => contract.validateAndSanitizeBackup({ ...validBackup(), backupSchemaVersion: "future/9.0.0" }), /unsupported backup schema version/);
assert.equal(contract.validateAndSanitizeBackup({ ...validBackup(), appDataVersion: 1 }).appDataVersion, 1, "Supported legacy app data must retain its migration version");
const currentExport = contract.createBackupExport({ ...validBackup(), appDataVersion: 3 });
assert.equal(currentExport.backupSchemaVersion, contract.BACKUP_SCHEMA_VERSION, "Current v3 app data must export through the v3 backup contract");
assert.equal(contract.validateAndSanitizeBackup(currentExport).appDataVersion, 3, "Current v3 exports must remain importable");
assert.equal(Object.hasOwn(contract.validateAndSanitizeBackup({ ...currentExport }), "recommendationHistory"), false, "Current v3 validation must not default a deleted recommendation history array");
assert.equal(Object.hasOwn(contract.validateAndSanitizeBackup({ ...currentExport }), "manualOverrides"), false, "Current v3 validation must not default a deleted manual override array");
assert.equal(Object.hasOwn(contract.validateAndSanitizeBackup({ ...currentExport }), "personalEvidencePackage"), false, "Current v3 validation must not default a deleted personal evidence domain");
const minimalCurrentExport = contract.createBackupExport(minimalCurrentData());
assert.equal(Object.hasOwn(minimalCurrentExport, "recommendationHistory"), false, "A minimal current export must not recreate recommendationHistory");
assert.equal(Object.hasOwn(minimalCurrentExport, "manualOverrides"), false, "A minimal current export must not recreate manualOverrides");
const currentExportWithDraft = contract.createBackupExport({ ...validBackup(), appDataVersion: 3 }, { activeWorkoutDraft: validActiveWorkoutDraft() });
assert.deepEqual(JSON.parse(JSON.stringify(currentExportWithDraft.activeWorkoutDraft)), validActiveWorkoutDraft(), "A complete current export must preserve a supplied validated active workout draft");
assert.throws(() => contract.createBackupExport({ ...validBackup(), appDataVersion: 3 }, { activeWorkoutDraft: { ...validActiveWorkoutDraft(), version: 3 } }), /activeWorkoutDraft must use the current v2 contract|comprehensive-fitness-active-draft\/2\.0\.0 envelope/, "Exports must reject an unknown active workout draft version");
assert.throws(() => contract.createBackupExport({ ...validBackup(), appDataVersion: 3 }, { activeWorkoutDraft: { ...validActiveWorkoutDraft(), sets: [{ id: "draft-set-1", exerciseId: "missing" }] } }), /unknown exercise/, "Active workout draft sets must retain valid exercise ownership");
assert.throws(() => contract.validateAndSanitizeBackup({ ...validBackup(), appDataVersion: 3, backupSchemaVersion: contract.LEGACY_BACKUP_SCHEMA_VERSION }), /incompatible with appDataVersion/);
assert.throws(() => contract.validateAndSanitizeBackup({ ...validBackup(), appDataVersion: 0 }), /appDataVersion must be 1, 2, or 3/);
assert.throws(() => contract.validateAndSanitizeBackup({ ...validBackup(), sessions: [{ id: '\"><img src=x onerror=alert(1)>' }] }), /safe structural identifier/);
assert.throws(() => contract.validateAndSanitizeBackup({ ...validBackup(), sets: [{ id: "set-1", exerciseId: "missing" }] }), /unknown exercise/);
assert.equal(contract.MAX_BACKUP_BYTES, 50 * 1024 * 1024, "The shared backup contract must retain the recoverability boundary for large legitimate histories");
assert.throws(() => contract.validateAndSanitizeBackup(validBackup(), { byteLength: contract.MAX_BACKUP_BYTES + 1 }), /50 MiB import limit/);

const serializedCurrentExport = contract.serializeBackupExport(minimalCurrentData());
assert.equal(serializedCurrentExport, JSON.stringify(contract.createBackupExport(minimalCurrentData()), null, 2), "The contract serializer must produce the exact indented representation used by downloads");
assert.equal(
  contract.validateAndSanitizeBackup(JSON.parse(serializedCurrentExport), { byteLength: Buffer.byteLength(serializedCurrentExport, "utf8") }).appDataVersion,
  3,
  "The exact downloaded representation must remain importable under the same byte cap"
);

{
  const retainedLegacyText = "r".repeat((10 * 1024 * 1024) + 1);
  const retainedLegacyArchive = minimalCurrentData({
    rawImports: [{
      id: "retained-strong-source",
      source: "strong",
      importVersion: "strong-csv-import/1.0.0",
      importedAt: "2026-07-01T12:00:00.000Z",
      originalText: retainedLegacyText,
      weightUnit: "lb",
      sessionExternalIds: []
    }]
  });
  const retainedText = contract.serializeBackupExport(retainedLegacyArchive);
  const retainedBytes = Buffer.byteLength(retainedText, "utf8");
  assert.ok(retainedBytes < contract.MAX_BACKUP_BYTES, "The retained legacy archive fixture must stay below the total backup cap");
  const retainedRoundTrip = contract.decodeLegacyBackup(JSON.parse(retainedText), { byteLength: retainedBytes });
  assert.equal(retainedRoundTrip.rawImports[0].originalText.length, retainedLegacyText.length, "Already-retained Strong source text above 10 MiB must remain exportable and importable");
}

{
  const compactBoundaryBase = contract.createBackupExport(minimalCurrentData({
    rawImports: [{
      id: "compact-boundary-source",
      source: "strong",
      originalText: "",
      sessionExternalIds: []
    }]
  }));
  const compactBaseBytes = Buffer.byteLength(JSON.stringify(compactBoundaryBase), "utf8");
  const compactOnlyCandidate = JSON.parse(JSON.stringify(compactBoundaryBase));
  compactOnlyCandidate.rawImports[0].originalText = "x".repeat(contract.MAX_BACKUP_BYTES - compactBaseBytes);
  assert.equal(Buffer.byteLength(JSON.stringify(compactOnlyCandidate), "utf8"), contract.MAX_BACKUP_BYTES, "Boundary fixture must fit the obsolete compact representation exactly");
  assert.ok(Buffer.byteLength(JSON.stringify(compactOnlyCandidate, null, 2), "utf8") > contract.MAX_BACKUP_BYTES, "Boundary fixture must exceed the cap in the actual indented download representation");
  assert.throws(() => contract.createBackupExport(compactOnlyCandidate), /50 MiB round-trip limit/, "Exportability must be measured from the exact downloaded representation");
}

const polluted = JSON.parse('{"appDataVersion":2,"sessions":[],"exercises":[],"sets":[],"templates":[],"settings":{},"__proto__":{"polluted":true}}');
assert.throws(() => contract.validateAndSanitizeBackup(polluted), /forbidden property name/);
assert.equal({}.polluted, undefined);

const html = readApplicationContractSource();
assert.match(html, /FitnessBackupContract\.validateAndSanitizeBackup\(parsed,[\s\S]*?backupSchemaVersion:[\s\S]*?validateImportedAppData\(imported,/, "JSON imports must validate and remove envelope-only metadata before the strict app-data boundary");
assert.match(html, /activeWorkoutDraftSnapshot\(\{ incrementSequence: false \}\)[\s\S]*?FitnessBackupContract\.serializeBackupExport\(data, \{ activeWorkoutDraft \}\)/, "Complete exports must serialize the validated current active-draft snapshot through the backup contract");
assert.match(html, /function activeWorkoutDraftSnapshot\(options = \{\}\)[\s\S]*?options\.incrementSequence === false \? activeDraftSequence : \+\+activeDraftSequence/, "Export snapshots must not increment the live active-draft sequence");
assert.match(html, /function validateActiveWorkoutDraftEnvelope\([\s\S]*?ignoreSourceRevision[\s\S]*?function restoreActiveWorkoutDraft\(/, "Active-draft validation must be a side-effect-free helper shared by preview and ordinary restore");
assert.match(html, /function writeIndexedValuesAtomically\([\s\S]*?transaction\(DB_STORE, "readwrite"\)[\s\S]*?normalizedEntries\.forEach/, "App data and an optional active draft must share one IndexedDB transaction");
assert.match(html, /function validateStrongImportCandidate\([\s\S]*?validateImportedAppData\(candidate, BACKUP_IMPORT_LIMITS\)[\s\S]*?assertCandidateHasRecoverableExport\(validated\)/, "Strong candidates must pass the same strict app-data validation and recoverable-export boundary as backups");
assert.match(html, /function prepareStrongCsvImport\([\s\S]*?sourceBytes > BACKUP_IMPORT_LIMITS\.maxRawImportBytes[\s\S]*?maximum size is 10 MiB/, "Every new Strong ingestion path must enforce the separate 10 MiB source cap");
assert.match(html, /allowedSessionFields[\s\S]*?"grade", "gradeVersion"/, "Strict app-data import must preserve historical grade values and versions");

function applicationFunctionSource(name) {
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(html);
  assert.ok(declaration, `Missing application function ${name}`);
  const start = declaration.index;
  const bodyStart = start + declaration[0].lastIndexOf("{");
  let depth = 0;
  for (let index = bodyStart; index < html.length; index += 1) {
    if (html[index] === "{") depth += 1;
    else if (html[index] === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated application function ${name}`);
}

function evaluateApplicationFunction(name, context = {}) {
  return vm.runInNewContext(`(${applicationFunctionSource(name)})`, context, { filename: `application-contract#${name}` });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const importLimits = Object.freeze({
  maxFileBytes: 50 * 1024 * 1024,
  maxRawImportBytes: 10 * 1024 * 1024,
  maxJsonDepth: 24,
  maxObjectKeys: 256,
  maxSessions: 100000,
  maxExercises: 100000,
  maxSets: 100000,
  maxTemplates: 100000
});

function strictImportValidator() {
  const validateBackupJsonShape = evaluateApplicationFunction("validateBackupJsonShape", {
    BACKUP_IMPORT_LIMITS: importLimits
  });
  return evaluateApplicationFunction("validateImportedAppData", {
    BACKUP_IMPORT_LIMITS: importLimits,
    validateBackupJsonShape,
    TextEncoder,
    window: { FitnessExceptionResolver: null, FitnessBackupContract: contract },
    WORKOUT_DURATION_SEMANTICS_VERSION: "test-duration/1"
  });
}

for (const reason of ["role_changed", "evaluation_failed", "coach_off"]) {
  const source = syntheticCoachBackup();
  source.sessions[0].coachingSuspensions = [
    { scope: "exercise", exerciseId: "coach-exercise", reason, at: "2026-11-02T18:05:00.000Z" },
    { scope: "session", reason, at: "2026-11-02T18:06:00.000Z" }
  ];
  const before = JSON.stringify(source);
  const draft = {
    ...validActiveWorkoutDraft(), workoutId: "coach-session", dataRevision: source.dataRevision,
    session: source.sessions[0], exercises: source.exercises, sets: source.sets
  };
  const serialized = contract.serializeBackupExport(source, { activeWorkoutDraft: draft });
  const decoded = contract.decodeLegacyBackup(JSON.parse(serialized));
  const { backupSchemaVersion, activeWorkoutDraft, ...appData } = plain(decoded);
  const imported = strictImportValidator()(appData);
  assert.deepEqual(plain(decoded.sessions[0].coachingSuspensions), source.sessions[0].coachingSuspensions, reason + " survives backup serialization");
  assert.deepEqual(plain(imported.sessions[0].coachingSuspensions), source.sessions[0].coachingSuspensions, reason + " survives strict import");
  assert.deepEqual(plain(activeWorkoutDraft.session.coachingSuspensions), source.sessions[0].coachingSuspensions, reason + " survives the exported active draft");
  contract.validateCoachDraft(activeWorkoutDraft, imported);
  assert.equal(JSON.stringify(source), before, reason + " round trips must not mutate source observations");
}

{
  const source = syntheticCoachBackup();
  const before = JSON.stringify(source);
  const exported = contract.createBackupExport(source);
  const decoded = contract.decodeLegacyBackup(JSON.parse(contract.serializeBackupExport(source)));
  const { backupSchemaVersion, ...appData } = plain(decoded);
  const imported = strictImportValidator()(appData);
  for (const collection of ["sessions", "exercises", "sets", "templates", "skippedSessions", "settings"]) {
    assert.deepEqual(plain(decoded[collection]), source[collection], `${collection} coach facts must survive validated backup serialization`);
    assert.deepEqual(plain(imported[collection]), source[collection], `${collection} coach facts must survive strict import`);
  }
  assert.equal(JSON.stringify(source), before, "Export and strict import must leave the source candidate unchanged");
  assert.equal(exported.sessions.length, source.sessions.length, "Injury skips must remain outside the workout collection");
  const malformedCases = [
    ["coach mode", (value) => { value.settings.coachMode = "live"; }],
    ["revision flag", (value) => { value.settings.coachBetweenSetRevisions = "true"; }],
    ["bar weight", (value) => { value.settings.barWeight.lb = -1; }],
    ["duplicate plates", (value) => { value.settings.plateInventory.lb = [45, 45]; }],
    ["equipment identity", (value) => { value.settings.equipmentCorrections.push({ ...value.settings.equipmentCorrections[0] }); }],
    ["increment fallback unit", (value) => { value.settings.routineIncrementUnit = "lbs"; }],
    ["role increment unit", (value) => { value.templates[0].exercises[0].setTypes[0].incrementUnit = "lbs"; }],
    ["role default load", (value) => { value.templates[0].exercises[0].setTypes[0].defaultLoad = 100; }],
    ["role default load unit", (value) => { value.templates[0].exercises[0].setTypes[0].defaultLoad.unit = "lbs"; }],
    ["role default reps", (value) => { value.templates[0].exercises[0].setTypes[0].defaultReps = 10.5; }],
    ["session deload", (value) => { value.sessions[0].isDeload = 1; }],
    ["prescription version", (value) => { value.sessions[0].coachingPrescription.engineVersion = "future"; }],
    ["suspension bound", (value) => { value.sessions[0].coachingSuspensions = Array(51).fill(value.sessions[0].coachingSuspensions[0]); }],
    ["suspension scope", (value) => { value.sessions[0].coachingSuspensions[0].scope = "routine"; }],
    ["suspension reason", (value) => { value.sessions[0].coachingSuspensions[0].reason = "rebase"; }],
    ["suspension timestamp", (value) => { value.sessions[0].coachingSuspensions[0].at = "invalid"; }],
    ["session suspension exercise id", (value) => { value.sessions[0].coachingSuspensions[0].exerciseId = "coach-exercise"; }],
    ["exercise suspension missing id", (value) => { delete value.sessions[0].coachingSuspensions[1].exerciseId; }],
    ["suspension exercise ownership", (value) => { value.sessions.push({ id: "other-session" }); value.exercises.push({ id: "other-exercise", sessionId: "other-session" }); value.sessions[0].coachingSuspensions[1].exerciseId = "other-exercise"; }],
    ["load source", (value) => { value.sets[0].loadSource = "automatic"; }],
    ["reps source", (value) => { value.sets[0].repsSource = "automatic"; }],
    ["RPE source", (value) => { value.sets[0].rpeSource = "prefilled"; }],
    ["load touched", (value) => { value.sets[0].loadTouched = "true"; }],
    ["reps touched", (value) => { value.sets[0].repsTouched = 1; }],
    ["RPE touched", (value) => { value.sets[0].rpeTouched = null; }],
    ["completion order", (value) => { value.sets[0].completionOrder = 0; }],
    ["completed timestamp", (value) => { value.sets[0].completedAt = "invalid"; }],
    ["schedule", (value) => { value.templates[0].scheduledWeekdays = ["tuesday", "tuesday"]; }],
    ["skip occurrence", (value) => { value.skippedSessions.push({ ...value.skippedSessions[0], id: "second-skip" }); }],
    ["skip routine name", (value) => { delete value.skippedSessions[0].routineName; }],
    ["blank skip routine name", (value) => { value.skippedSessions[0].routineName = "  "; }],
    ["skip day ownership", (value) => { value.skippedSessions[0].dayId = "friday"; }],
    ["prescription exercise ownership", (value) => { value.exercises[0].sessionId = "other-session"; value.sessions.push({ id: "other-session" }); }],
    ["prescription set ownership", (value) => { value.exercises.push({ id: "other-exercise", sessionId: "coach-session" }); value.sets[0].exerciseId = "other-exercise"; }]
  ];
  const validateImport = strictImportValidator();
  for (const [label, corrupt] of malformedCases) {
    const invalid = plain(source);
    corrupt(invalid);
    const unchanged = JSON.stringify(invalid);
    assert.throws(() => contract.createBackupExport(invalid), undefined, `Backup export must reject malformed ${label}`);
    assert.throws(() => contract.validateAndSanitizeBackup(invalid), undefined, `Backup validation must reject malformed ${label}`);
    assert.throws(() => validateImport(invalid), undefined, `Strict import must reject malformed ${label}`);
    assert.equal(JSON.stringify(invalid), unchanged, `${label} rejection must leave all candidate records untouched`);
  }
  const deletedRows = plain(source);
  deletedRows.exercises = [];
  deletedRows.sets = [];
  const { backupSchemaVersion: deletedRowsSchemaVersion, ...deletedRowsData } = plain(contract.createBackupExport(deletedRows));
  const deletedRowsImport = validateImport(deletedRowsData);
  assert.deepEqual(plain(deletedRowsImport.sessions[0].coachingPrescription), source.sessions[0].coachingPrescription, "Deleted exercise/set ids must not invalidate an archived prescription");
  assert.deepEqual(plain(deletedRowsImport.sessions[0].coachingSuspensions), source.sessions[0].coachingSuspensions, "An exercise suspension may retain a deleted exercise id");
  const deletedRoutine = plain(source);
  deletedRoutine.templates = [];
  delete deletedRoutine.sessions[0].templateId;
  const deletedRoutineExport = contract.createBackupExport(deletedRoutine);
  const { backupSchemaVersion: deletedRoutineSchemaVersion, ...deletedRoutineData } = plain(deletedRoutineExport);
  assert.deepEqual(plain(validateImport(deletedRoutineData).skippedSessions), source.skippedSessions, "Injury skip names must survive routine deletion independently of live templates");
  const nullableDefaults = plain(source);
  nullableDefaults.templates[0].exercises[0].setTypes[0].defaultLoad = null;
  nullableDefaults.templates[0].exercises[0].setTypes[0].defaultReps = null;
  const nullableExport = contract.createBackupExport(nullableDefaults);
  const { backupSchemaVersion: nullableSchemaVersion, ...nullableData } = plain(nullableExport);
  const nullableImport = validateImport(nullableData);
  assert.equal(nullableImport.templates[0].exercises[0].setTypes[0].defaultLoad, null, "Null canonical role load remains null");
  assert.equal(nullableImport.templates[0].exercises[0].setTypes[0].defaultReps, null, "Null canonical role reps remain null");
  assert.equal(nullableImport.templates[0].exercises[0].defaultLoad, 100, "Legacy exercise default load scalars are preserved without inferred units");
}

function strongCsvRow({ exerciseName = "Synthetic Squat", weight = "100", reps = "5", rpe = "8" } = {}) {
  return [
    "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE,Workout Notes,Notes",
    `2026-07-01,Synthetic Workout,,${exerciseName},1,${weight},${reps},,,${rpe},,`
  ].join("\n");
}

function prepareStrongHarness() {
  const validateImportedAppData = strictImportValidator();
  const validateStrongImportCandidate = evaluateApplicationFunction("validateStrongImportCandidate", {
    validateImportedAppData,
    BACKUP_IMPORT_LIMITS: importLimits,
    assertCandidateHasRecoverableExport: (candidate) => {
      contract.createBackupExport(plain(candidate));
      return true;
    }
  });
  const parseCsv = evaluateApplicationFunction("parseCsv");
  const numberFrom = evaluateApplicationFunction("numberFrom");
  const isStrongWorkSet = evaluateApplicationFunction("isStrongWorkSet", { numberFrom });
  return evaluateApplicationFunction("prepareStrongCsvImport", {
    data: minimalCurrentData(),
    BACKUP_IMPORT_LIMITS: importLimits,
    TextEncoder,
    normalizeStrongImportWeightUnit: (value) => {
      if (!["lb", "kg"].includes(value)) throw new Error("Choose a source unit.");
      return value;
    },
    retainedStrongImportWeightUnit: () => "",
    parseCsv,
    isStrongWorkSet,
    numberFrom,
    parseStrongDate: () => ({ date: "2026-07-01", createdAt: "2026-07-01T12:00:00.000Z" }),
    inferResistanceType: () => "external",
    exerciseIdentityFields: () => ({}),
    recommendedRestSeconds: () => 120,
    isBodyweightResistance: () => false,
    isBodyweightExerciseName: () => false,
    classifyImportedExerciseSets: (sets) => sets.map((set) => ({
      set,
      type: "straight",
      source: "strong-explicit",
      confidence: 1,
      reviewRequired: false
    })),
    setTypeSemantics: (set) => ({ type: set.setType || "straight", isWarmup: false, countsTowardProgression: true }),
    SET_CLASSIFIER_VERSION: 1,
    STRONG_IMPORT_CONTRACT_VERSION: "strong-csv-import/1.0.0",
    createTemplatesFromStrongSessions: () => [],
    nextMonotonicImportRevision: () => 2,
    validateStrongImportCandidate,
    isoNow: () => "2026-07-01T12:00:00.000Z"
  });
}

async function verifyStrongCandidateValidation() {
  const prepareStrongCsvImport = prepareStrongHarness();
  const valid = prepareStrongCsvImport(strongCsvRow(), "lb", "valid.csv");
  assert.equal(valid.candidate.sets[0].weight, 100, "A valid Strong candidate must survive strict validation");
  assert.equal(valid.candidate.sets[0].rpe, 8, "A supplied Strong RPE must remain the actual supplied value");
  assert.equal(valid.candidate.sets[0].rpeSource, "typed", "Finite supplied Strong RPE is a typed observation");
  for (const rpe of ["", " ", "unknown", "NaN", "Infinity"]) {
    const missing = prepareStrongCsvImport(strongCsvRow({ rpe }), "lb", "missing-rpe.csv").candidate.sets[0];
    assert.equal(missing.rpe, "", "Missing or malformed Strong RPE must remain blank");
    assert.equal(missing.rpeSource, "unknown", "Missing or malformed Strong RPE is unknown");
  }
  const zeroRpe = prepareStrongCsvImport(strongCsvRow({ rpe: "0" }), "lb", "zero-rpe.csv").candidate.sets[0];
  assert.equal(zeroRpe.rpe, 0, "An explicit numeric Strong zero must stay distinct from blank");
  assert.equal(zeroRpe.rpeSource, "typed");
  assert.equal(valid.candidate.rawImports[0].originalText, strongCsvRow(), "Strict validation must retain Strong source provenance");
  assert.throws(
    () => prepareStrongCsvImport(strongCsvRow({ weight: "-5" }), "lb", "negative-weight.csv"),
    /Set 1 weight must be between 0/i,
    "A negative Strong weight must fail before preview"
  );
  assert.throws(
    () => prepareStrongCsvImport(strongCsvRow({ rpe: "11" }), "lb", "out-of-range-rpe.csv"),
    /Set 1 rpe must be between 0 and 10/i,
    "An out-of-range Strong RPE must fail before preview"
  );
  assert.throws(
    () => prepareStrongCsvImport(strongCsvRow({ exerciseName: "e".repeat(257) }), "lb", "overlong-name.csv"),
    /Exercise 1 name exceeds the 256-character limit/i,
    "Overlong Strong-controlled text must fail before preview"
  );
  assert.throws(
    () => prepareStrongCsvImport("x".repeat(importLimits.maxRawImportBytes + 1), "lb", "oversized.csv"),
    /maximum size is 10 MiB/i,
    "Direct Strong ingestion must not bypass the 10 MiB source cap"
  );
}

function replacementOperation() {
  return {
    kind: "backup",
    fileName: "replacement.json",
    baseDataRevision: 7,
    candidate: minimalCurrentData({ dataRevision: 8 }),
    activeWorkoutDraft: { workoutId: "imported-workout" },
    replaceActiveWorkoutDraft: true,
    preparedEvidence: { exerciseDatabase: [], identityEngine: {} },
    noChanges: false,
    completionMessage: "Import complete."
  };
}

function importRollbackHarness(mode) {
  const rollbackData = minimalCurrentData({
    dataRevision: 7,
    sessions: [{ id: "original-session" }]
  });
  const rollbackDraft = { workoutId: "original-workout", marker: "indexed-original" };
  const rollbackDraftLocal = JSON.stringify({ workoutId: "original-workout", marker: "local-original" });
  const indexed = new Map([
    ["app-data", plain(rollbackData)],
    ["active-workout-draft", plain(rollbackDraft)]
  ]);
  const local = new Map([["active-draft-key", rollbackDraftLocal]]);
  const events = { atomicWrites: 0, scheduledTimers: [], renders: 0 };
  const originalTimer = {
    id: "timer-original",
    version: 4,
    isActive: true,
    isPaused: false,
    isOvertime: false,
    endsAt: Date.now() + 600000
  };
  const context = {
    importInProgress: false,
    pendingImport: replacementOperation(),
    appDataPersistenceConflict: null,
    data: plain(rollbackData),
    importStatus: { state: "preview", message: "" },
    settingsMessage: "",
    render: () => { events.renders += 1; },
    cancelPendingDataSave: () => undefined,
    window: { clearTimeout: () => undefined, clearInterval: () => undefined },
    draftSaveTimer: 1,
    cloneImportSnapshot: (value) => plain(value),
    prescriptionEngine: { id: "original-engine" },
    activeSessionId: "original-session",
    activeWorkoutId: "original-workout",
    timer: originalTimer,
    activeDraftSequence: 9,
    readIndexedValue: async (key) => plain(indexed.get(key) ?? null),
    localStorage: {
      getItem: (key) => local.get(key) ?? null,
      setItem: (key, value) => { local.set(key, value); },
      removeItem: (key) => { local.delete(key); }
    },
    ACTIVE_DRAFT_KEY: "active-draft-key",
    cancelRestPush: async () => mode !== "cancel-failure",
    writeIndexedValuesAtomically: async (entries) => {
      events.atomicWrites += 1;
      if (mode === "write-failure") throw new Error("Synthetic atomic write failure.");
      entries.forEach((entry) => indexed.set(entry.key, plain(entry.value)));
    },
    timerInterval: 1,
    releaseTimerWakeLock: () => undefined,
    templateNumericDrafts: new Map(),
    installExerciseIdentityCompatibility: () => mode !== "post-write-failure",
    sessionHasStarted: () => false,
    isSessionSubmitted: () => false,
    restoreActiveWorkoutDraft: async () => true,
    entityStructureRevision: 0,
    entityIndexCache: {},
    invalidateCompletedAnalysis: () => undefined,
    STORAGE_KEY: "app-data-fallback",
    strongImportAuditMessage: () => "",
    auditImportedTemplateHistory: () => ({}),
    saveRuntime: () => true,
    scheduleRestPush: async (timer) => { events.scheduledTimers.push(plain(timer)); return true; }
  };
  return { context, events, indexed, local, rollbackData, rollbackDraft, rollbackDraftLocal, originalTimer };
}

async function verifyFailedReplacementRollback() {
  const applyPendingImportSource = applicationFunctionSource("applyPendingImport");
  assert.match(
    applyPendingImportSource,
    /let indexedRollbackConfirmed[\s\S]*?let localDraftRollbackConfirmed[\s\S]*?localStorage\.setItem\(ACTIVE_DRAFT_KEY, rollbackDraftLocal\)/,
    "IndexedDB and local active-draft rollback must be attempted independently"
  );
  for (const mode of ["cancel-failure", "write-failure", "post-write-failure"]) {
    const harness = importRollbackHarness(mode);
    const applyPendingImport = vm.runInNewContext(`(${applyPendingImportSource})`, harness.context, { filename: `application-contract#applyPendingImport-${mode}` });
    assert.equal(await applyPendingImport(), false, `${mode} must reject the replacement`);
    assert.deepEqual(plain(harness.indexed.get("app-data")), harness.rollbackData, `${mode} must preserve the IndexedDB app-data layer`);
    assert.deepEqual(plain(harness.indexed.get("active-workout-draft")), harness.rollbackDraft, `${mode} must preserve the IndexedDB active-draft layer`);
    assert.equal(harness.local.get("active-draft-key"), harness.rollbackDraftLocal, `${mode} must restore the exact localStorage active-draft layer`);
    assert.deepEqual(plain(harness.context.timer), harness.originalTimer, `${mode} must restore the in-memory timer`);
    const expectedReschedules = mode === "cancel-failure" ? 0 : 1;
    assert.equal(harness.events.scheduledTimers.length, expectedReschedules, `${mode} must reschedule only a timer whose cancellation was confirmed`);
    if (expectedReschedules) {
      assert.equal(harness.events.scheduledTimers[0].id, harness.originalTimer.id, `${mode} must reschedule the original timer identity`);
      assert.equal(harness.events.scheduledTimers[0].version, harness.originalTimer.version, `${mode} must reschedule the exact original timer version`);
    }
  }
}

async function verifyInterruptedReplacementRecovery() {
  const importedSession = { id: "imported-workout", workoutStarted: true, workoutState: "active", submitted: false, durationSemanticsVersion: "test-duration/1" };
  const importedExercise = { id: "imported-exercise", sessionId: importedSession.id };
  const importedSet = { id: "imported-set", exerciseId: importedExercise.id };
  const importedData = minimalCurrentData({
    dataRevision: 8,
    sessions: [importedSession],
    exercises: [importedExercise],
    sets: [importedSet]
  });
  const importedDraft = {
    workoutId: importedSession.id,
    savedAt: "2026-07-01T12:00:00.000Z",
    dataRevision: 8,
    draftSequence: 3,
    session: importedSession,
    exercises: [importedExercise],
    sets: [importedSet],
    resolvedActions: [],
    timer: { id: "imported-timer", version: 2 }
  };

  // This is the intentional crash boundary in applyPendingImport: both durable
  // values commit together before localStorage and runtime/timer finalization.
  const durableAfterAtomicReplacement = new Map([
    ["app-data", plain(importedData)],
    ["active-workout-draft", plain(importedDraft)]
  ]);
  assert.match(
    applicationFunctionSource("applyPendingImport"),
    /writeIndexedValuesAtomically\(writes\)[\s\S]*?durableReplacementWritten = true[\s\S]*?localStorage\.setItem\(ACTIVE_DRAFT_KEY/,
    "The atomic IndexedDB replacement must precede local fallback/runtime finalization"
  );

  for (const localFallback of [null, JSON.stringify({ workoutId: "stale-workout", savedAt: "2099-01-01T00:00:00.000Z" })]) {
    const events = { saves: 0 };
    const context = {
      data: plain(durableAfterAtomicReplacement.get("app-data")),
      readIndexedValue: async (key) => plain(durableAfterAtomicReplacement.get(key) ?? null),
      localStorage: { getItem: () => localFallback },
      ACTIVE_DRAFT_KEY: "active-draft-key",
      validateActiveWorkoutDraftEnvelope: (snapshot) => {
        if (snapshot?.workoutId !== importedDraft.workoutId) return null;
        return {
          snapshot,
          savedAt: Date.parse(snapshot.savedAt),
          sourceRevision: snapshot.dataRevision,
          draftSequence: snapshot.draftSequence,
          legacy: false,
          session: plain(snapshot.session),
          exercises: plain(snapshot.exercises),
          sets: plain(snapshot.sets),
          timer: plain(snapshot.timer)
        };
      },
      exceptionResolverApi: { validateResolvedAction: () => ({ valid: true }) },
      WORKOUT_DURATION_SEMANTICS_VERSION: "test-duration/1",
      startWorkoutDuration: (session) => session,
      timer: null,
      activeWorkoutId: "",
      activeSessionId: "",
      activeDraftSequence: 0,
      entityStructureRevision: 0,
      entityIndexCache: {},
      scheduleSave: () => { events.saves += 1; },
      persistActiveWorkoutDraft: () => undefined
    };
    const restoreActiveWorkoutDraft = evaluateApplicationFunction("restoreActiveWorkoutDraft", context);
    assert.equal(await restoreActiveWorkoutDraft(), true, "Reload must recover the durable imported draft after an interrupted finalization");
    assert.equal(context.data.sessions.filter((session) => session.id === importedSession.id).length, 1, "Interrupted recovery must not duplicate the imported session");
    assert.equal(context.data.exercises.filter((exercise) => exercise.id === importedExercise.id).length, 1, "Interrupted recovery must not duplicate the imported exercise");
    assert.equal(context.data.sets.filter((set) => set.id === importedSet.id).length, 1, "Interrupted recovery must not duplicate or lose the imported set");
    assert.equal(context.activeWorkoutId, importedSession.id, "Interrupted recovery must restore the imported active workout");
    assert.equal(context.timer.id, importedDraft.timer.id, "Interrupted recovery must restore the durable timer context");
    assert.equal(events.saves, 1, "Interrupted recovery must reconcile the restored draft through one normal save");
  }
}

Promise.resolve()
  .then(verifyStrongCandidateValidation)
  .then(verifyFailedReplacementRollback)
  .then(verifyInterruptedReplacementRecovery)
  .then(() => {
    console.log("Backup contract tests passed (exact serialization, retained archives, strict Strong candidates, atomic rollback/recovery, versioning, references, and prototype safety).");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
