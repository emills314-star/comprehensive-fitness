(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FitnessBackupContract = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BACKUP_SCHEMA_VERSION = "comprehensive-fitness-backup/3.0.0";
  const LEGACY_BACKUP_SCHEMA_VERSION = "comprehensive-fitness-backup/2.0.0";
  const SUPPORTED_BACKUP_SCHEMA_VERSIONS = new Set([LEGACY_BACKUP_SCHEMA_VERSION, BACKUP_SCHEMA_VERSION]);
  const SUPPORTED_APP_DATA_VERSIONS = new Set([1, 2, 3]);
  const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
  const MAX_COLLECTION_ITEMS = 100000;
  const MAX_DEPTH = 24;
  const MAX_STRING_LENGTH = 10 * 1024 * 1024;
  const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
  const TOP_LEVEL_KEYS = new Set([
    "backupSchemaVersion", "appDataVersion", "domainMigrationVersion", "sessions", "exercises", "sets",
    "templates", "mesocycles", "activeMesocycleId", "recommendationHistory", "manualOverrides",
    "personalEvidencePackage", "rawImports", "migrationAudit", "dataRevision", "settings"
  ]);
  const LEGACY_PLANNING_SESSION_KEYS = new Set(["mesocycleId"]);
  const LEGACY_PLANNING_TEMPLATE_KEYS = new Set(["mesocycleId", "mesocycleRevision", "trainingDayId"]);
  const LEGACY_PLANNING_TEMPLATE_EXERCISE_KEYS = new Set(["mesocycleSlotId", "assignmentId"]);
  const LEGACY_PLANNING_RECOMMENDATION_KEYS = new Set(["mesocycleId"]);
  const LEGACY_PLANNING_SETTINGS_KEYS = new Set([
    "trainingGoal", "trainingGoalSource", "trainingGoalDisclosure", "nutritionPhase",
    "experienceLevel", "returningAfterGap", "trainingDaysPerWeek", "availableEquipment",
    "excludedExerciseIds", "goal", "trainingStatus"
  ]);
  const SAFE_ID = /^[^\s<>"'&`=]{1,160}$/;

  function fail(message) {
    throw new Error("Backup validation failed: " + message);
  }

  function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== "[object Object]") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function cloneSafe(value, path = "backup", depth = 0) {
    if (depth > MAX_DEPTH) fail(path + " exceeds the maximum nesting depth.");
    if (value == null || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail(path + " contains a non-finite number.");
      return value;
    }
    if (typeof value === "string") {
      if (value.length > MAX_STRING_LENGTH) fail(path + " contains an oversized text value.");
      return value;
    }
    if (Array.isArray(value)) {
      if (value.length > MAX_COLLECTION_ITEMS) fail(path + " contains too many items.");
      return value.map((item, index) => cloneSafe(item, path + "[" + index + "]", depth + 1));
    }
    if (!isPlainObject(value)) fail(path + " contains an unsupported value type.");
    const output = Object.create(null);
    Object.keys(value).forEach((key) => {
      if (FORBIDDEN_KEYS.has(key)) fail(path + " contains a forbidden property name.");
      output[key] = cloneSafe(value[key], path + "." + key, depth + 1);
    });
    return output;
  }

  function requireEntityArray(backup, key) {
    if (!Array.isArray(backup[key])) fail(key + " must be an array.");
    backup[key].forEach((item, index) => {
      if (!isPlainObject(item)) fail(key + "[" + index + "] must be an object.");
    });
  }

  function validateId(value, path) {
    if (typeof value !== "string" || !SAFE_ID.test(value)) fail(path + " is not a safe structural identifier.");
    return value;
  }

  function uniqueIdSet(items, key) {
    const ids = new Set();
    items.forEach((item, index) => {
      const id = validateId(item.id, key + "[" + index + "].id");
      if (ids.has(id)) fail(key + " contains duplicate id " + id + ".");
      ids.add(id);
    });
    return ids;
  }

  function validateRelationships(backup) {
    const sessionIds = uniqueIdSet(backup.sessions, "sessions");
    const exerciseIds = uniqueIdSet(backup.exercises, "exercises");
    uniqueIdSet(backup.sets, "sets");
    uniqueIdSet(backup.templates, "templates");

    backup.exercises.forEach((exercise, index) => {
      if (exercise.sessionId != null && exercise.sessionId !== "") {
        validateId(exercise.sessionId, "exercises[" + index + "].sessionId");
        if (!sessionIds.has(exercise.sessionId)) fail("exercises[" + index + "] references an unknown session.");
      }
    });
    backup.sets.forEach((set, index) => {
      validateId(set.exerciseId, "sets[" + index + "].exerciseId");
      if (!exerciseIds.has(set.exerciseId)) fail("sets[" + index + "] references an unknown exercise.");
    });
    backup.templates.forEach((template, templateIndex) => {
      if (!Array.isArray(template.exercises)) fail("templates[" + templateIndex + "].exercises must be an array.");
      const nestedIds = new Set();
      template.exercises.forEach((exercise, exerciseIndex) => {
        const id = validateId(exercise.id, "templates[" + templateIndex + "].exercises[" + exerciseIndex + "].id");
        if (nestedIds.has(id)) fail("templates[" + templateIndex + "] contains duplicate exercise ids.");
        nestedIds.add(id);
      });
    });
  }

  function omitKeys(record, keys) {
    if (!isPlainObject(record)) return record;
    const output = Object.create(null);
    Object.keys(record).forEach((key) => {
      if (!keys.has(key)) output[key] = cloneSafe(record[key], key);
    });
    return output;
  }

  function stripLegacyPlanningState(validatedBackup) {
    const decoded = cloneSafe(validatedBackup);
    delete decoded.mesocycles;
    delete decoded.activeMesocycleId;
    decoded.sessions = decoded.sessions.map((session) => omitKeys(session, LEGACY_PLANNING_SESSION_KEYS));
    decoded.recommendationHistory = decoded.recommendationHistory.map((record) => omitKeys(record, LEGACY_PLANNING_RECOMMENDATION_KEYS));
    decoded.templates = decoded.templates.map((template) => {
      const preserved = omitKeys(template, LEGACY_PLANNING_TEMPLATE_KEYS);
      preserved.exercises = preserved.exercises.map((exercise) => omitKeys(exercise, LEGACY_PLANNING_TEMPLATE_EXERCISE_KEYS));
      return preserved;
    });
    decoded.settings = omitKeys(decoded.settings, LEGACY_PLANNING_SETTINGS_KEYS);
    return decoded;
  }

  function backupSchemaVersionFor(appDataVersion) {
    return appDataVersion >= 3 ? BACKUP_SCHEMA_VERSION : LEGACY_BACKUP_SCHEMA_VERSION;
  }

  function validateAndSanitizeBackup(input, options = {}) {
    const byteLength = Number(options.byteLength || 0);
    if (byteLength > MAX_BACKUP_BYTES) fail("file exceeds the 50 MiB import limit.");
    if (!isPlainObject(input)) fail("the root must be an object.");
    if (input.backupSchemaVersion != null && !SUPPORTED_BACKUP_SCHEMA_VERSIONS.has(input.backupSchemaVersion)) {
      fail("unsupported backup schema version.");
    }
    const appDataVersion = Number(input.appDataVersion);
    if (!SUPPORTED_APP_DATA_VERSIONS.has(appDataVersion)) {
      fail("appDataVersion must be 1, 2, or 3.");
    }
    const expectedBackupSchemaVersion = backupSchemaVersionFor(appDataVersion);
    if (input.backupSchemaVersion != null && input.backupSchemaVersion !== expectedBackupSchemaVersion) {
      fail("backup schema version is incompatible with appDataVersion.");
    }
    const selected = Object.create(null);
    Object.keys(input).forEach((key) => {
      if (FORBIDDEN_KEYS.has(key)) fail("backup contains a forbidden property name.");
      if (TOP_LEVEL_KEYS.has(key)) selected[key] = input[key];
    });
    const backup = cloneSafe(selected);
    ["sessions", "exercises", "sets", "templates"].forEach((key) => requireEntityArray(backup, key));
    ["recommendationHistory", "manualOverrides", "rawImports", "migrationAudit"].forEach((key) => {
      if (backup[key] == null) backup[key] = [];
      requireEntityArray(backup, key);
    });
    if (backup.mesocycles != null) requireEntityArray(backup, "mesocycles");
    if (!isPlainObject(backup.settings)) fail("settings must be an object.");
    backup.backupSchemaVersion = expectedBackupSchemaVersion;
    backup.appDataVersion = appDataVersion;
    validateRelationships(backup);
    return backup;
  }

  function createBackupExport(data) {
    const appDataVersion = Number(data?.appDataVersion);
    const validated = validateAndSanitizeBackup({ ...data, backupSchemaVersion: backupSchemaVersionFor(appDataVersion) });
    return stripLegacyPlanningState(validated);
  }

  function decodeLegacyBackup(input, options = {}) {
    return stripLegacyPlanningState(validateAndSanitizeBackup(input, options));
  }

  function discardObsoletePlanningState(input) {
    if (!isPlainObject(input)) fail("the planning-state input must be an object.");
    const decoded = Object.assign(Object.create(null), input);
    delete decoded.mesocycles;
    delete decoded.activeMesocycleId;
    const omitTrustedKeys = (record, keys) => {
      if (!isPlainObject(record)) return record;
      const output = Object.create(null);
      Object.keys(record).forEach((key) => {
        if (!keys.has(key)) output[key] = record[key];
      });
      return output;
    };
    if (Array.isArray(input.sessions)) {
      decoded.sessions = input.sessions.map((session) => omitTrustedKeys(session, LEGACY_PLANNING_SESSION_KEYS));
    }
    if (Array.isArray(input.recommendationHistory)) {
      decoded.recommendationHistory = input.recommendationHistory.map((record) => omitTrustedKeys(record, LEGACY_PLANNING_RECOMMENDATION_KEYS));
    }
    if (Array.isArray(input.templates)) {
      decoded.templates = input.templates.map((template) => {
        const preserved = omitTrustedKeys(template, LEGACY_PLANNING_TEMPLATE_KEYS);
        if (Array.isArray(template?.exercises)) {
          preserved.exercises = template.exercises.map((exercise) => omitTrustedKeys(exercise, LEGACY_PLANNING_TEMPLATE_EXERCISE_KEYS));
        }
        return preserved;
      });
    }
    if (isPlainObject(input.settings)) decoded.settings = omitTrustedKeys(input.settings, LEGACY_PLANNING_SETTINGS_KEYS);
    return decoded;
  }

  return {
    BACKUP_SCHEMA_VERSION,
    LEGACY_BACKUP_SCHEMA_VERSION,
    MAX_BACKUP_BYTES,
    validateAndSanitizeBackup,
    decodeLegacyBackup,
    discardObsoletePlanningState,
    createBackupExport
  };
});
