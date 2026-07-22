(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FitnessBackupContract = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BACKUP_SCHEMA_VERSION = "comprehensive-fitness-backup/2.0.0";
  const SUPPORTED_APP_DATA_VERSIONS = new Set([1, 2]);
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
    if (backup.mesocycles.length) uniqueIdSet(backup.mesocycles, "mesocycles");

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
    if (backup.activeMesocycleId) {
      validateId(backup.activeMesocycleId, "activeMesocycleId");
      if (!backup.mesocycles.some((item) => item.id === backup.activeMesocycleId)) fail("activeMesocycleId references an unknown mesocycle.");
    }
  }

  function validateAndSanitizeBackup(input, options = {}) {
    const byteLength = Number(options.byteLength || 0);
    if (byteLength > MAX_BACKUP_BYTES) fail("file exceeds the 50 MiB import limit.");
    if (!isPlainObject(input)) fail("the root must be an object.");
    if (input.backupSchemaVersion != null && input.backupSchemaVersion !== BACKUP_SCHEMA_VERSION) {
      fail("unsupported backup schema version.");
    }
    const appDataVersion = Number(input.appDataVersion);
    if (!SUPPORTED_APP_DATA_VERSIONS.has(appDataVersion)) {
      fail("appDataVersion must be 1 or 2.");
    }
    const selected = Object.create(null);
    Object.keys(input).forEach((key) => {
      if (FORBIDDEN_KEYS.has(key)) fail("backup contains a forbidden property name.");
      if (TOP_LEVEL_KEYS.has(key)) selected[key] = input[key];
    });
    const backup = cloneSafe(selected);
    ["sessions", "exercises", "sets", "templates"].forEach((key) => requireEntityArray(backup, key));
    ["mesocycles", "recommendationHistory", "manualOverrides", "rawImports", "migrationAudit"].forEach((key) => {
      if (backup[key] == null) backup[key] = [];
      requireEntityArray(backup, key);
    });
    if (!isPlainObject(backup.settings)) fail("settings must be an object.");
    backup.backupSchemaVersion = BACKUP_SCHEMA_VERSION;
    backup.appDataVersion = appDataVersion;
    validateRelationships(backup);
    return backup;
  }

  function createBackupExport(data) {
    return validateAndSanitizeBackup({ ...data, backupSchemaVersion: BACKUP_SCHEMA_VERSION });
  }

  return { BACKUP_SCHEMA_VERSION, MAX_BACKUP_BYTES, validateAndSanitizeBackup, createBackupExport };
});
