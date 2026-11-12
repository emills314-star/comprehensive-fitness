(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports
    ? require("./coach-engine.js") : root.ComprehensiveFitnessCoach);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FitnessBackupContract = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (coachApi) {
  "use strict";

  const BACKUP_SCHEMA_VERSION = "comprehensive-fitness-backup/3.0.0";
  const LEGACY_BACKUP_SCHEMA_VERSION = "comprehensive-fitness-backup/2.0.0";
  const SUPPORTED_BACKUP_SCHEMA_VERSIONS = new Set([LEGACY_BACKUP_SCHEMA_VERSION, BACKUP_SCHEMA_VERSION]);
  const SUPPORTED_APP_DATA_VERSIONS = new Set([1, 2, 3]);
  const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
  const MAX_COLLECTION_ITEMS = 100000;
  const MAX_DEPTH = 24;
  const MAX_STRING_LENGTH = 10 * 1024 * 1024;
  const BACKUP_JSON_INDENT = 2;
  const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
  const TOP_LEVEL_KEYS = new Set([
    "backupSchemaVersion", "appDataVersion", "domainMigrationVersion", "activeWorkoutDraft", "sessions", "exercises", "sets",
    "templates", "mesocycles", "activeMesocycleId", "recommendationHistory", "manualOverrides",
    "personalEvidencePackage", "rawImports", "migrationAudit", "dataRevision", "settings", "skippedSessions"
  ]);
  const ACTIVE_WORKOUT_DRAFT_CONTRACT_VERSION = "comprehensive-fitness-active-draft/2.0.0";
  const LEGACY_PLANNING_SESSION_KEYS = new Set(["mesocycleId"]);
  const LEGACY_PLANNING_TEMPLATE_KEYS = new Set(["mesocycleId", "mesocycleRevision", "trainingDayId"]);
  const LEGACY_PLANNING_TEMPLATE_EXERCISE_KEYS = new Set(["mesocycleSlotId", "assignmentId"]);
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
      const isRetainedRawImportText = /^backup\.rawImports\[\d+\]\.originalText$/.test(path);
      const maximumLength = isRetainedRawImportText ? MAX_BACKUP_BYTES : MAX_STRING_LENGTH;
      if (value.length > maximumLength) fail(path + " contains an oversized text value.");
      return value;
    }
    if (Array.isArray(value)) {
      if (value.length > MAX_COLLECTION_ITEMS) fail(path + " contains too many items.");
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) fail(path + " contains a sparse array.");
      }
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

  function validCoachIsoTimestamp(value) {
    if (typeof value !== "string" || value.length > 64
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      || !Number.isFinite(Date.parse(value))) return false;
    const day = new Date(value.slice(0, 10) + "T12:00:00Z");
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10);
  }

  function validateRoleCoachFields(role) {
    // Canonical coach defaults are physical, unit-explicit values. Legacy
    // exercise.defaultLoad, targetLoad and weight scalars remain separate facts.
    // Missing incrementUnit is unknown; missing defaults read as null.
    if (Object.prototype.hasOwnProperty.call(role, "incrementUnit") && !["lb", "kg"].includes(role.incrementUnit)) fail("Invalid role incrementUnit.");
    if (Object.prototype.hasOwnProperty.call(role, "defaultLoad") && role.defaultLoad !== null) {
      const load = role.defaultLoad;
      if (!isPlainObject(load) || Object.keys(load).length !== 2
        || !Object.prototype.hasOwnProperty.call(load, "value") || !Object.prototype.hasOwnProperty.call(load, "unit")
        || typeof load.value !== "number" || !Number.isFinite(load.value) || load.value < 0
        || !["lb", "kg"].includes(load.unit)) fail("Role defaultLoad must be a unit-explicit load or null.");
    }
    if (Object.prototype.hasOwnProperty.call(role, "defaultReps") && role.defaultReps !== null
      && (!Number.isSafeInteger(role.defaultReps) || role.defaultReps < 0)) fail("Role defaultReps must be an integer or null.");
    if (Object.prototype.hasOwnProperty.call(role, "restSeconds") && (!Number.isSafeInteger(role.restSeconds)
      || role.restSeconds < 0 || role.restSeconds > 3600)) fail("Invalid role restSeconds.");
  }

  function coachOwnershipIndex(model) {
    const exercises = new Map();
    const sets = new Map();
    const deletedExercises = new Map();
    const deletedSets = new Map();
    const claim = (index, id, owner) => {
      if (!index.has(id)) index.set(id, new Set());
      index.get(id).add(owner);
    };
    (model.exercises || []).forEach((exercise) => claim(exercises, exercise.id, exercise.sessionId));
    (model.sets || []).forEach((set) => claim(sets, set.id, set.exerciseId));
    (model.sessions || []).forEach((session) => {
      const prescription = session.coachingPrescription;
      if (!prescription) return;
      try {
        if (!coachApi?.validatePrescription(cloneSafe(prescription)).ok) return;
        const belongsOnly = (owners, owner) => !owners || (owners.size === 1 && owners.has(owner));
        if (prescription.exercises.some((exercise) => !belongsOnly(exercises.get(exercise.exerciseId), session.id))
          || prescription.sets.some((row) => !belongsOnly(sets.get(row.setId), row.exerciseId)
            || !belongsOnly(exercises.get(row.exerciseId), session.id))) return;
        prescription.exercises.forEach((exercise) => {
          if (!exercises.has(exercise.exerciseId)) claim(deletedExercises, exercise.exerciseId, session.id);
        });
        prescription.sets.forEach((row) => {
          if (!sets.has(row.setId)) claim(deletedSets, row.setId, JSON.stringify([session.id, row.exerciseId]));
        });
      } catch { /* Invalid plans cannot establish ownership of another plan's rows. */ }
    });
    return { exercises, sets, deletedExercises, deletedSets };
  }

  function validateCoachingPrescription(prescription, sessionId, model, ownership = coachOwnershipIndex(model)) {
    if (!coachApi?.validatePrescription || !coachApi.validatePrescription(cloneSafe(prescription)).ok) fail("Invalid coachingPrescription.");
    const belongsOnly = (owners, owner) => !owners || (owners.size === 1 && owners.has(owner));
    prescription.exercises.forEach((exercise) => {
      const owners = ownership.exercises.get(exercise.exerciseId) || ownership.deletedExercises.get(exercise.exerciseId);
      if (!belongsOnly(owners, sessionId)) fail("Coaching exercise belongs to another session.");
    });
    prescription.sets.forEach((row) => {
      if (!belongsOnly(ownership.sets.get(row.setId), row.exerciseId)
        || !belongsOnly(ownership.exercises.get(row.exerciseId), sessionId)
        || (!ownership.sets.has(row.setId) && !belongsOnly(ownership.deletedSets.get(row.setId), JSON.stringify([sessionId, row.exerciseId])))) {
        fail("Coaching set belongs to another exercise or session.");
      }
      // Missing actual rows include deletions and engine-added virtual rows.
      // Their IDs are retained verbatim; coaching cannot block factual editing.
    });
    return prescription;
  }

  function validateCoachingSuspension(value, sessionId, model, ownership = coachOwnershipIndex(model)) {
    if (!isPlainObject(value) || Object.keys(value).some((key) => !["scope", "exerciseId", "reason", "at"].includes(key))
      || !["session", "exercise"].includes(value.scope)
      || !["deload_changed", "readiness_changed", "exception_overridden", "exercise_substituted", "row_removed", "role_changed", "evaluation_failed", "coach_off"].includes(value.reason)
      || !validCoachIsoTimestamp(value.at)) fail("Invalid coaching suspension.");
    if (value.scope === "session") {
      if (Object.prototype.hasOwnProperty.call(value, "exerciseId")) fail("A session suspension cannot name an exercise.");
    } else {
      validateId(value.exerciseId, "coachingSuspensions.exerciseId");
      const owners = ownership.exercises.get(value.exerciseId) || ownership.deletedExercises.get(value.exerciseId);
      if (owners && (owners.size !== 1 || !owners.has(sessionId))) fail("Coaching suspension exercise belongs to another session.");
    }
    return value;
  }

  // Shared strict runtime trust boundary for user-initiated import and backup.
  // Optional legacy fields stay absent; this function never changes its input.
  function validateCoachData(model) {
    const own = (record, key) => Object.prototype.hasOwnProperty.call(record || {}, key);
    const object = (value) => value && Object.prototype.toString.call(value) === "[object Object]";
    const enumeration = (record, field, values, path) => {
      if (own(record, field) && !values.includes(record[field])) fail(path + "." + field + " is invalid.");
    };
    const timestamp = (value, path) => {
      if (typeof value !== "string" || value.length > 64 || !value || !Number.isFinite(Date.parse(value))) fail(path + " must be a valid timestamp.");
    };
    const localDate = (value) => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(value + "T12:00:00Z");
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    const collection = (key) => {
      if (!own(model, key)) return [];
      if (!Array.isArray(model[key]) || model[key].length > MAX_COLLECTION_ITEMS || model[key].some((item) => !object(item))) fail(key + " must be a bounded record array.");
      return model[key];
    };
    const sessions = collection("sessions");
    const exercises = collection("exercises");
    const sets = collection("sets");
    const templates = collection("templates");
    const skips = collection("skippedSessions");
    // Maps must never hide duplicate claims at load/draft boundaries.
    const sessionIds = uniqueIdSet(sessions, "sessions");
    const exerciseIds = uniqueIdSet(exercises, "exercises");
    uniqueIdSet(sets, "sets");
    uniqueIdSet(templates, "templates");
    exercises.forEach((exercise) => {
      if (exercise.sessionId != null && exercise.sessionId !== "" && !sessionIds.has(exercise.sessionId)) fail("Exercise references an unknown session.");
    });
    sets.forEach((set) => {
      if (!exerciseIds.has(set.exerciseId)) fail("Set references an unknown exercise.");
    });
    const settings = model.settings;
    if (own(model, "settings")) {
      if (!object(settings)) fail("settings must be an object.");
      for (const key of ["coachMode", "coachBetweenSetRevisions", "routineIncrementUnit", "barWeight", "plateInventory", "equipmentCorrections"]) {
        if (own(settings, key)) cloneSafe(settings[key]);
      }
      enumeration(settings, "coachMode", ["off", "shadow", "show"], "settings");
      enumeration(settings, "routineIncrementUnit", [null, "lb", "kg"], "settings");
      if (own(settings, "coachBetweenSetRevisions") && typeof settings.coachBetweenSetRevisions !== "boolean") fail("settings.coachBetweenSetRevisions must be boolean.");
      for (const field of ["barWeight", "plateInventory"]) {
        if (!own(settings, field)) continue;
        const value = settings[field];
        if (!object(value) || Object.keys(value).length !== 2 || !own(value, "lb") || !own(value, "kg")) fail("settings." + field + " must contain lb and kg only.");
        for (const unit of ["lb", "kg"]) {
          if (field === "barWeight") {
            if (typeof value[unit] !== "number" || !Number.isFinite(value[unit]) || value[unit] < 0) fail("barWeight must be finite and non-negative.");
          } else if (!Array.isArray(value[unit]) || value[unit].length > 64
            || value[unit].some((plate) => typeof plate !== "number" || !Number.isFinite(plate) || plate <= 0)
            || new Set(value[unit]).size !== value[unit].length) fail("plateInventory must contain at most 64 unique positive finite plates per unit.");
        }
      }
      if (own(settings, "equipmentCorrections")) {
        const corrections = settings.equipmentCorrections;
        if (!Array.isArray(corrections) || corrections.length > 1000) fail("equipmentCorrections must be a bounded array.");
        const seen = new Set();
        corrections.forEach((correction) => {
          if (!object(correction) || Object.keys(correction).length !== 2
            || !own(correction, "exerciseIdentity") || !own(correction, "equipmentClass")) fail("Invalid equipment correction fields.");
          validateId(correction.exerciseIdentity, "equipmentCorrections.exerciseIdentity");
          if (seen.has(correction.exerciseIdentity)) fail("Duplicate equipment correction identity.");
          seen.add(correction.exerciseIdentity);
          enumeration(correction, "equipmentClass", ["barbell", "dumbbell", "stack", "plate_loaded", "bodyweight", "generic"], "equipmentCorrections");
        });
      }
    }
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const validateDefaults = (record, path, role = false) => {
      enumeration(record, "incrementUnit", ["lb", "kg"], path);
      enumeration(record, "weightUnit", ["lb", "kg"], path);
      for (const field of ["defaultLoad", "targetLoad", "defaultReps", "weight"]) {
        if (role && ["defaultLoad", "defaultReps"].includes(field)) continue;
        if (own(record, field) && (typeof record[field] !== "number" || !Number.isFinite(record[field]) || record[field] < 0
          || (field === "defaultReps" && !Number.isSafeInteger(record[field])))) fail(path + "." + field + " is invalid.");
      }
    };
    templates.forEach((template) => {
      if (own(template, "scheduledWeekdays") && (!Array.isArray(template.scheduledWeekdays)
        || template.scheduledWeekdays.length > 7 || new Set(template.scheduledWeekdays).size !== template.scheduledWeekdays.length
        || template.scheduledWeekdays.some((day) => !weekdays.includes(day)))) fail("Invalid scheduledWeekdays.");
      if (!Array.isArray(template.exercises)) fail("Template exercises must be an array.");
      template.exercises.forEach((exercise) => {
        if (!object(exercise)) fail("Template exercise must be an object.");
        validateDefaults(exercise, "template exercise");
        if (own(exercise, "setTypes") && (!Array.isArray(exercise.setTypes) || exercise.setTypes.length > 100)) fail("Template setTypes must be a bounded array.");
        (exercise.setTypes || []).forEach((role) => {
          if (!object(role)) fail("Template role must be an object.");
          validateRoleCoachFields(role);
          validateDefaults(role, "template role", true);
          for (const field of ["weight", "reps"]) {
            if (own(role, field) && (typeof role[field] !== "number" || !Number.isFinite(role[field]) || role[field] < 0
              || (field === "reps" && !Number.isSafeInteger(role[field])))) fail("Invalid role " + field + ".");
          }
          if (own(role, "restSeconds") && (typeof role.restSeconds !== "number" || !Number.isSafeInteger(role.restSeconds)
            || role.restSeconds < 0 || role.restSeconds > 3600)) fail("Invalid role restSeconds.");
          if (own(role, "increment") && (typeof role.increment !== "number" || !Number.isFinite(role.increment) || role.increment < 0)) fail("Invalid role increment.");
        });
      });
    });
    const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const setById = new Map(sets.map((set) => [set.id, set]));
    const completionOrders = new Map();
    sets.forEach((set) => {
      for (const field of ["loadSource", "repsSource"]) enumeration(set, field, ["accepted_target", "entered", "prefill_previous"], "set");
      enumeration(set, "rpeSource", ["typed", "unknown"], "set");
      for (const field of ["loadTouched", "repsTouched", "rpeTouched"]) {
        if (own(set, field) && typeof set[field] !== "boolean") fail("Invalid set touched state.");
      }
      if (own(set, "completedAt")) timestamp(set.completedAt, "set.completedAt");
      if (own(set, "completionOrder")) {
        if (!Number.isSafeInteger(set.completionOrder) || set.completionOrder <= 0) fail("completionOrder must be a positive safe integer.");
        const sessionId = exerciseById.get(set.exerciseId)?.sessionId;
        if (!sessionId) fail("completionOrder references an unowned set.");
        if (!completionOrders.has(sessionId)) completionOrders.set(sessionId, new Set());
        if (completionOrders.get(sessionId).has(set.completionOrder)) fail("Duplicate session completionOrder.");
        completionOrders.get(sessionId).add(set.completionOrder);
      }
    });
    const ownership = coachOwnershipIndex(model);
    sessions.forEach((session) => {
      if (own(session, "isDeload") && typeof session.isDeload !== "boolean") fail("session.isDeload must be boolean.");
      if (own(session, "coachingPrescription")) validateCoachingPrescription(session.coachingPrescription, session.id, model, ownership);
      if (own(session, "coachingSuspensions")) {
        if (!Array.isArray(session.coachingSuspensions) || session.coachingSuspensions.length > 50) fail("coachingSuspensions must contain at most 50 entries.");
        cloneSafe(session.coachingSuspensions);
        const seen = new Set();
        session.coachingSuspensions.forEach((entry) => {
          validateCoachingSuspension(entry, session.id, model, ownership);
          const key = JSON.stringify([entry.scope, entry.exerciseId || "", entry.reason]);
          if (seen.has(key)) fail("Duplicate coaching suspension.");
          seen.add(key);
        });
      }
    });
    const skipIds = new Set();
    const occurrences = new Set();
    skips.forEach((skip) => {
      if (Object.keys(skip).some((key) => !["id", "date", "routineId", "routineName", "dayId", "reason", "note", "createdAt"].includes(key))) fail("Unknown injury skip field.");
      validateId(skip.id, "skippedSessions.id");
      validateId(skip.routineId, "skippedSessions.routineId");
      if (typeof skip.routineName !== "string" || !skip.routineName.trim() || skip.routineName.length > 256) fail("Injury skip requires a routineName snapshot of at most 256 characters.");
      if (!localDate(skip.date)) fail("Injury skip requires a real local date.");
      const weekday = weekdays[new Date(skip.date + "T12:00:00Z").getUTCDay()];
      // Schedule assignments may change after an occurrence. Preserve its captured
      // day key, checking a named day against the actual date, not today's schedule.
      if (skip.dayId !== "unscheduled" && skip.dayId !== weekday) fail("Injury skip dayId does not match its local date.");
      if (skip.reason !== "injury") fail("Injury skip reason must be injury.");
      if (own(skip, "note") && (typeof skip.note !== "string" || skip.note.length > 2000)) fail("Injury skip note exceeds 2000 characters.");
      timestamp(skip.createdAt, "skippedSessions.createdAt");
      const occurrence = JSON.stringify([skip.routineId, skip.date]);
      if (skipIds.has(skip.id) || occurrences.has(occurrence)) fail("Duplicate injury skip occurrence or id.");
      skipIds.add(skip.id);
      occurrences.add(occurrence);
    });
    if (model.activeWorkoutDraft != null) validateCoachDraft(model.activeWorkoutDraft, model);
    return model;
  }

  function validateCoachDraft(draft, baseData = {}) {
    const baseExercises = baseData.exercises || [];
    const baseSets = baseData.sets || [];
    const exercises = draft.exercises || [];
    const sets = draft.sets || [];
    const baseExerciseById = new Map(baseExercises.map((exercise) => [exercise.id, exercise]));
    const baseSetById = new Map(baseSets.map((set) => [set.id, set]));
    const oldIds = new Set(baseExercises.filter((exercise) => exercise.sessionId === draft.workoutId).map((exercise) => exercise.id));
    exercises.forEach((exercise) => {
      const existing = baseExerciseById.get(exercise.id);
      if (exercise.sessionId !== draft.workoutId || (existing && existing.sessionId !== draft.workoutId)) fail("Draft exercise belongs to another session.");
    });
    const ids = new Set(exercises.map((exercise) => exercise.id));
    sets.forEach((set) => {
      const existing = baseSetById.get(set.id);
      if (!ids.has(set.exerciseId) || (existing && existing.exerciseId !== set.exerciseId)) fail("Draft set belongs to another exercise or session.");
      if (existing?.completionOrder !== undefined && set.completionOrder !== existing.completionOrder) fail("Draft cannot rewrite a set's completionOrder.");
    });
    if (!draft.session || draft.session.id !== draft.workoutId) fail("Draft session does not match workoutId.");
    return validateCoachData({
      sessions: [...(baseData.sessions || []).filter((session) => session.id !== draft.workoutId), draft.session],
      exercises: [...baseExercises.filter((exercise) => !oldIds.has(exercise.id)), ...exercises],
      sets: [...baseSets.filter((set) => !oldIds.has(set.exerciseId)), ...sets]
    });
  }

  function copyLocalCoachModel(value) {
    // Local recovery must copy even malformed coach JSON (NaN, cycles, excessive
    // nesting). Strict cloneSafe is deliberately reserved for rejection paths.
    const container = (item) => Array.isArray(item) ? new Array(item.length)
      : item && Object.prototype.toString.call(item) === "[object Object]" ? Object.create(null) : null;
    const output = container(value);
    if (!output) return value;
    const seen = new Map([[value, output]]);
    const pending = [[value, output]];
    for (let index = 0; index < pending.length; index += 1) {
      const [source, target] = pending[index];
      Object.keys(source).forEach((key) => {
        const item = source[key];
        const child = container(item);
        if (!child) target[key] = item;
        else {
          if (!seen.has(item)) {
            seen.set(item, child);
            pending.push([item, child]);
          }
          target[key] = seen.get(item);
        }
      });
    }
    return output;
  }

  function quarantineCoachData(input) {
    const model = copyLocalCoachModel(input);
    const counts = new Map();
    const note = (code, count = 1) => counts.set(code, (counts.get(code) || 0) + count);
    const own = (record, key) => Object.prototype.hasOwnProperty.call(record || {}, key);
    const records = (key) => Array.isArray(model?.[key]) ? model[key].filter((record) => record && typeof record === "object") : [];
    const checkField = (record, field, validate, code) => {
      if (!own(record, field)) return;
      try { validate(record[field]); }
      catch { delete record[field]; note(code); }
    };
    const sessions = records("sessions");
    const exercises = records("exercises");
    const sets = records("sets");
    const templates = records("templates");
    const context = { sessions, exercises, sets, templates };
    if (model?.settings && typeof model.settings === "object") {
      for (const key of ["coachMode", "coachBetweenSetRevisions", "routineIncrementUnit", "barWeight", "plateInventory", "equipmentCorrections"]) {
        checkField(model.settings, key, (value) => validateCoachData({ settings: { [key]: value } }), "coach_setting");
      }
    }
    templates.forEach((template) => {
      (Array.isArray(template.exercises) ? template.exercises : []).forEach((exercise) => {
        (Array.isArray(exercise?.setTypes) ? exercise.setTypes : []).forEach((role) => {
          if (!role || typeof role !== "object") return;
          for (const field of ["incrementUnit", "defaultLoad", "defaultReps", "restSeconds"]) {
            checkField(role, field, (value) => validateRoleCoachFields({ [field]: value }), "coach_role_field");
          }
        });
      });
    });
    const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const completionOrders = new Map();
    sets.forEach((set) => {
      for (const field of ["loadSource", "repsSource", "rpeSource"]) {
        checkField(set, field, (value) => {
          if (!(field === "rpeSource" ? ["typed", "unknown"] : ["accepted_target", "entered", "prefill_previous"]).includes(value)) fail("Invalid source.");
        }, "coach_set_source");
      }
      for (const field of ["loadTouched", "repsTouched", "rpeTouched"]) {
        checkField(set, field, (value) => { if (typeof value !== "boolean") fail("Invalid touched state."); }, "coach_set_touched");
      }
      checkField(set, "completionOrder", (value) => {
        const sessionId = exerciseById.get(set.exerciseId)?.sessionId;
        if (!Number.isSafeInteger(value) || value < 1 || !sessionId) fail("Invalid order.");
        if (!completionOrders.has(sessionId)) completionOrders.set(sessionId, new Set());
        if (completionOrders.get(sessionId).has(value)) fail("Duplicate order.");
        completionOrders.get(sessionId).add(value);
      }, "coach_completion_order");
    });
    const ownership = coachOwnershipIndex(context);
    sessions.forEach((session) => {
      checkField(session, "isDeload", (value) => { if (typeof value !== "boolean") fail("Invalid deload."); }, "coach_deload");
      checkField(session, "coachingPrescription", (value) => validateCoachingPrescription(value, session.id, context, ownership), "coach_prescription");
    });
    // Rebuild claims after invalid plans are removed before checking suspensions.
    const suspensionOwnership = coachOwnershipIndex(context);
    sessions.forEach((session) => {
      if (!own(session, "coachingSuspensions")) return;
      if (!Array.isArray(session.coachingSuspensions)) {
        delete session.coachingSuspensions;
        note("coach_suspension");
        return;
      }
      const seen = new Set();
      const presentEntries = Object.keys(session.coachingSuspensions).filter((key) => /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < session.coachingSuspensions.length).length;
      if (presentEntries < session.coachingSuspensions.length) note("coach_suspension", session.coachingSuspensions.length - presentEntries);
      session.coachingSuspensions = session.coachingSuspensions.filter((entry) => {
        try {
          validateCoachingSuspension(entry, session.id, context, suspensionOwnership);
          const key = JSON.stringify([entry.scope, entry.exerciseId || "", entry.reason]);
          if (seen.has(key) || seen.size >= 50) fail("Duplicate or excessive suspension.");
          seen.add(key);
          return true;
        } catch { note("coach_suspension"); return false; }
      });
    });
    if (own(model, "skippedSessions")) {
      const seenIds = new Set();
      const occurrences = new Set();
      if (!Array.isArray(model.skippedSessions)) {
        delete model.skippedSessions;
        note("coach_injury_skip");
      } else {
        const presentEntries = Object.keys(model.skippedSessions).filter((key) => /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < model.skippedSessions.length).length;
        if (presentEntries < model.skippedSessions.length) note("coach_injury_skip", model.skippedSessions.length - presentEntries);
        model.skippedSessions = model.skippedSessions.filter((skip) => {
        try {
          validateCoachData({ skippedSessions: [skip] });
          const occurrence = JSON.stringify([skip.routineId, skip.date]);
          if (seenIds.has(skip.id) || occurrences.has(occurrence) || seenIds.size >= MAX_COLLECTION_ITEMS) fail("Duplicate skip.");
          seenIds.add(skip.id); occurrences.add(occurrence);
          return true;
        } catch { note("coach_injury_skip"); return false; }
        });
      }
    }
    return { model, diagnostics: [...counts].map(([code, count]) => ({ code, count })) };
  }

  function quarantineCoachDraft(draft, baseData = {}) {
    const copy = copyLocalCoachModel(draft);
    if (!copy?.session || !Array.isArray(copy.exercises) || !Array.isArray(copy.sets)) return { draft: copy, diagnostics: [] };
    const oldIds = new Set((baseData.exercises || []).filter((exercise) => exercise.sessionId === copy.workoutId).map((exercise) => exercise.id));
    const ids = new Set(copy.exercises.map((exercise) => exercise.id));
    const baseSetById = new Map((baseData.sets || []).map((set) => [set.id, set]));
    const reservedOrders = new Set((baseData.sets || []).filter((set) => oldIds.has(set.exerciseId)
      && Number.isSafeInteger(set.completionOrder) && set.completionOrder > 0).map((set) => set.completionOrder));
    let restoredOrders = 0;
    // Saved orders are immutable. Reserve them before duplicate sanitization so
    // draft row order cannot let another row claim an authoritative value.
    copy.sets.forEach((set) => {
      const existing = baseSetById.get(set?.id);
      const authoritative = ids.has(set?.exerciseId) && existing?.exerciseId === set?.exerciseId
        && Number.isSafeInteger(existing?.completionOrder) && existing.completionOrder > 0;
      if (authoritative && set.completionOrder !== existing.completionOrder) {
        set.completionOrder = existing.completionOrder;
        restoredOrders += 1;
      } else if (!authoritative && reservedOrders.has(set?.completionOrder)) {
        // Quarantine only conflicting metadata; retain the row and observations.
        delete set.completionOrder;
        restoredOrders += 1;
      }
    });
    const recovered = quarantineCoachData({
      sessions: [...(baseData.sessions || []).filter((session) => session.id !== copy.workoutId), copy.session],
      exercises: [...(baseData.exercises || []).filter((exercise) => !oldIds.has(exercise.id)), ...copy.exercises],
      sets: [...(baseData.sets || []).filter((set) => !oldIds.has(set.exerciseId)), ...copy.sets]
    });
    const recoveredSession = recovered.model.sessions.find((session) => session.id === copy.workoutId);
    if (restoredOrders) recovered.diagnostics.push({ code: "coach_completion_order", count: restoredOrders });
    return {
      draft: { ...copy, session: recoveredSession,
        sets: recovered.model.sets.filter((set) => ids.has(set.exerciseId)) },
      diagnostics: recovered.diagnostics
    };
  }

  function validateActiveWorkoutDraft(draft) {
    if (!isPlainObject(draft)) fail("activeWorkoutDraft must be an object.");
    if (draft.contractVersion !== ACTIVE_WORKOUT_DRAFT_CONTRACT_VERSION || Number(draft.version) !== 2) fail("activeWorkoutDraft must use the current v2 contract.");
    validateId(draft.workoutId, "activeWorkoutDraft.workoutId");
    if (!Number.isSafeInteger(draft.dataRevision) || draft.dataRevision < 0) fail("activeWorkoutDraft.dataRevision must be a non-negative integer.");
    if (draft.draftSequence != null && (!Number.isSafeInteger(draft.draftSequence) || draft.draftSequence < 0)) fail("activeWorkoutDraft.draftSequence must be a non-negative integer.");
    if (!isPlainObject(draft.session) || draft.session.id !== draft.workoutId) fail("activeWorkoutDraft.session must match workoutId.");
    if (!Array.isArray(draft.exercises) || !Array.isArray(draft.sets) || !Array.isArray(draft.resolvedActions)) fail("activeWorkoutDraft must contain exercises, sets, and resolvedActions arrays.");
    const exerciseIds = new Set();
    draft.exercises.forEach((exercise, index) => {
      if (!isPlainObject(exercise)) fail("activeWorkoutDraft.exercises[" + index + "] must be an object.");
      const exerciseId = validateId(exercise.id, "activeWorkoutDraft.exercises[" + index + "].id");
      if (exerciseIds.has(exerciseId)) fail("activeWorkoutDraft.exercises contains duplicate ids.");
      if (exercise.sessionId !== draft.workoutId) fail("activeWorkoutDraft.exercises must belong to workoutId.");
      exerciseIds.add(exerciseId);
    });
    const setIds = new Set();
    draft.sets.forEach((set, index) => {
      if (!isPlainObject(set)) fail("activeWorkoutDraft.sets[" + index + "] must be an object.");
      const setId = validateId(set.id, "activeWorkoutDraft.sets[" + index + "].id");
      if (setIds.has(setId)) fail("activeWorkoutDraft.sets contains duplicate ids.");
      validateId(set.exerciseId, "activeWorkoutDraft.sets[" + index + "].exerciseId");
      if (!exerciseIds.has(set.exerciseId)) fail("activeWorkoutDraft.sets references an unknown exercise.");
      setIds.add(setId);
    });
    if (draft.timer != null && !isPlainObject(draft.timer)) fail("activeWorkoutDraft.timer must be an object or null.");
    draft.resolvedActions.forEach((action, index) => {
      if (!isPlainObject(action)) fail("activeWorkoutDraft.resolvedActions[" + index + "] must be an object.");
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
    // These retired top-level domains are accepted only so old backups can be
    // read. They must not cross the compatibility boundary into current data
    // or be recreated by a new export.
    delete decoded.recommendationHistory;
    delete decoded.manualOverrides;
    delete decoded.personalEvidencePackage;
    decoded.sessions = decoded.sessions.map((session) => omitKeys(session, LEGACY_PLANNING_SESSION_KEYS));
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

  function serializeBackupDocument(backup) {
    return JSON.stringify(backup, null, BACKUP_JSON_INDENT);
  }

  function backupDocumentByteLength(backup) {
    return new TextEncoder().encode(serializeBackupDocument(backup)).byteLength;
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
    ["recommendationHistory", "manualOverrides"].forEach((key) => {
      if (backup[key] != null) requireEntityArray(backup, key);
    });
    ["rawImports", "migrationAudit"].forEach((key) => {
      if (backup[key] == null) backup[key] = [];
      requireEntityArray(backup, key);
    });
    if (backup.mesocycles != null) requireEntityArray(backup, "mesocycles");
    if (backup.activeWorkoutDraft != null) {
      if (appDataVersion < 3) fail("activeWorkoutDraft requires appDataVersion 3.");
      validateActiveWorkoutDraft(backup.activeWorkoutDraft);
    }
    if (!isPlainObject(backup.settings)) fail("settings must be an object.");
    backup.backupSchemaVersion = expectedBackupSchemaVersion;
    backup.appDataVersion = appDataVersion;
    validateRelationships(backup);
    validateCoachData(backup);
    return backup;
  }

  function createBackupExport(data, options = {}) {
    const appDataVersion = Number(data?.appDataVersion);
    const activeWorkoutDraft = options.activeWorkoutDraft ?? null;
    const validated = validateAndSanitizeBackup({
      ...data,
      ...(activeWorkoutDraft ? { activeWorkoutDraft } : {}),
      backupSchemaVersion: backupSchemaVersionFor(appDataVersion)
    });
    const exportable = stripLegacyPlanningState(validated);
    const byteLength = backupDocumentByteLength(exportable);
    if (byteLength > MAX_BACKUP_BYTES) fail("export exceeds the 50 MiB round-trip limit.");
    return exportable;
  }

  function serializeBackupExport(data, options = {}) {
    return serializeBackupDocument(createBackupExport(data, options));
  }

  function decodeLegacyBackup(input, options = {}) {
    return stripLegacyPlanningState(validateAndSanitizeBackup(input, options));
  }

  function discardObsoletePlanningState(input) {
    if (!isPlainObject(input)) fail("the planning-state input must be an object.");
    const decoded = Object.assign(Object.create(null), input);
    delete decoded.mesocycles;
    delete decoded.activeMesocycleId;
    delete decoded.recommendationHistory;
    delete decoded.manualOverrides;
    delete decoded.personalEvidencePackage;
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
    validateCoachData,
    validateCoachDraft,
    validateCoachingPrescription,
    validateCoachingSuspension,
    quarantineCoachData,
    quarantineCoachDraft,
    validateAndSanitizeBackup,
    decodeLegacyBackup,
    discardObsoletePlanningState,
    createBackupExport,
    serializeBackupExport
  };
});
