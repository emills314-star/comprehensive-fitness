"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");

const {
  clamp,
  cleanText,
  dateRange,
  median,
  nullableText,
  parseDurationMinutes,
  parseStrongDate,
  readCsv,
  round,
  slugify,
  stableId,
  toNumber
} = require("./utils");
const { compileMappingRules, inferExerciseMapping } = require("./exercise-mapping");

const SOURCE_ID = "strong_workouts_export";
const EXPECTED_FILE_NAME = "strong_workouts (8).csv";
const REQUIRED_HEADERS = [
  "Date",
  "Workout Name",
  "Duration",
  "Exercise Name",
  "Set Order",
  "Weight",
  "Reps",
  "Distance",
  "Seconds",
  "RPE"
];
const OPTIONAL_HEADERS = ["Notes", "Workout Notes"];
const EXPECTED_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

function collectionRows(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.rows)) return collection.rows;
  if (collection instanceof Map) {
    return [...collection.entries()].flatMap(([key, value]) => {
      if (Array.isArray(value)) return value;
      if (value && typeof value === "object") return [{ recorded_name: key, ...value }];
      return [];
    });
  }
  if (collection.byRecordedName instanceof Map) return collectionRows(collection.byRecordedName);
  if (collection.byExerciseId instanceof Map) return collectionRows(collection.byExerciseId);
  if (typeof collection === "object") {
    return Object.entries(collection).flatMap(([key, value]) => {
      if (Array.isArray(value)) return value;
      if (value && typeof value === "object") return [{ recorded_name: key, ...value }];
      return [];
    });
  }
  return [];
}

function buildAliasLookup(aliases) {
  const lookup = new Map();
  collectionRows(aliases).forEach((alias) => {
    const recordedName = cleanText(alias.recorded_name || alias.recordedName || alias["Exercise Name"]);
    if (recordedName) lookup.set(recordedName.toLocaleLowerCase("en-US"), alias);
  });
  return lookup;
}

function buildMuscleLookup(muscleMap) {
  const lookup = new Map();
  collectionRows(muscleMap).forEach((mapping) => {
    const exerciseId = cleanText(mapping.exercise_id || mapping.exerciseId);
    const muscleGroup = cleanText(mapping.muscle_group || mapping.muscleGroup);
    if (!exerciseId || !muscleGroup) return;
    if (!lookup.has(exerciseId)) lookup.set(exerciseId, []);
    lookup.get(exerciseId).push(normalizeMuscleMapping(mapping));
  });
  lookup.forEach((values) => values.sort((left, right) => {
    if (left.role === "primary" && right.role !== "primary") return -1;
    if (right.role === "primary" && left.role !== "primary") return 1;
    return (right.contribution_weight || 0) - (left.contribution_weight || 0)
      || left.muscle_group.localeCompare(right.muscle_group);
  }));
  return lookup;
}

function normalizeMuscleMapping(mapping) {
  return {
    muscle_group: cleanText(mapping.muscle_group || mapping.muscleGroup),
    role: cleanText(mapping.role) || "secondary",
    contribution_weight: toNumber(mapping.contribution_weight ?? mapping.contributionWeight),
    regional_function: nullableText(mapping.regional_function ?? mapping.regionalFunction),
    research_muscle_group_id: nullableText(mapping.research_muscle_group_id ?? mapping.researchMuscleGroupId),
    substitution_notes: nullableText(mapping.substitution_notes ?? mapping.substitutionNotes)
  };
}

async function loadCompiledMappingRules(rawRoot, config) {
  const configured = config.exercise_mapping_rules_document
    || config.exercise_mapping_rules
    || config.mapping_rules;
  if (configured) {
    const document = Array.isArray(configured) ? { rules: configured } : configured;
    return compileMappingRules(document);
  }
  const rulesPath = path.resolve(rawRoot, "..", "config", "exercise_mapping_rules.json");
  try {
    const document = JSON.parse(await fsp.readFile(rulesPath, "utf8"));
    return compileMappingRules(document);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw new Error(`Unable to load exercise mapping rules from ${rulesPath}: ${error.message}`);
  }
}

function distinctFallbackId(recordedName) {
  const nameDigest = stableId("name", recordedName).slice(-8);
  return `unmapped_${slugify(recordedName) || "exercise"}_${nameDigest}`;
}

function aliasFor(recordedName, aliasLookup, compiledRules) {
  const alias = aliasLookup.get(recordedName.toLocaleLowerCase("en-US"));
  if (alias) return { alias, mapped: true, source: "explicit_alias", inferredMuscles: [] };
  const inferred = inferExerciseMapping(recordedName, compiledRules);
  if (inferred.muscles.length || cleanText(inferred.alias.primary_muscle_group) !== "unmapped") {
    return {
      alias: inferred.alias,
      mapped: false,
      source: "inferred_mapping_rule",
      inferredMuscles: inferred.muscles.map(normalizeMuscleMapping)
    };
  }
  const fallbackId = distinctFallbackId(recordedName);
  return {
    mapped: false,
    source: "unmapped_fallback",
    inferredMuscles: [],
    alias: {
      recorded_name: recordedName,
      exercise_id: fallbackId,
      canonical_name: recordedName,
      variation: "unmapped",
      primary_muscle_group: "unmapped",
      resistance_type: "unknown",
      exercise_kind: "unknown",
      progression_metric: "rpe_adjusted_e1rm",
      comparison_group: fallbackId,
      equipment_identity_status: "unmapped"
    }
  };
}

async function findStrongFile(rawRoot) {
  const expected = path.join(rawRoot, EXPECTED_FILE_NAME);
  try {
    await fsp.access(expected);
    return expected;
  } catch {
    const candidates = (await fsp.readdir(rawRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^strong_workouts.*\.csv$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
    if (!candidates.length) throw new Error(`Strong workout export not found below ${rawRoot}`);
    return path.join(rawRoot, candidates[0]);
  }
}

function setOrderKind(value) {
  const text = cleanText(value);
  if (/^rest timer$/i.test(text)) return "rest_timer";
  if (/^w$/i.test(text)) return "warmup";
  if (/^f$/i.test(text)) return "failure";
  if (/^d$/i.test(text)) return "drop_set";
  if (/^\d+$/.test(text)) return "numeric_working";
  return "other";
}

function parseWorkoutDate(value) {
  const legacy = parseStrongDate(value);
  if (legacy) return { ...legacy, format: "legacy_mdy" };
  const match = cleanText(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const date = `${year}-${month}-${day}`;
  const time = `${hour}:${minute}:${second}`;
  return { date, time, localDateTime: `${date}T${time}`, format: "iso_local" };
}

function isValidRpe(value) {
  return Number.isFinite(value) && value >= 0 && value <= 10;
}

function epley(load, reps) {
  return Number.isFinite(load) && load > 0 && Number.isFinite(reps) && reps > 0
    ? round(load * (1 + (reps / 30)), 3)
    : null;
}

function adjustedEpley(load, reps, rir) {
  return Number.isFinite(rir) ? epley(load, reps + rir) : null;
}

function classifyHardSet(record, config) {
  if (!record.is_working_set || record.set_type === "warmup") {
    return { hard: false, assumed: false, reason: "not_a_working_set" };
  }
  const validRepetitionWork = Number.isFinite(record.repetitions) && record.repetitions > 0;
  const validDurationWork = record.progression_metric === "duration" && Number.isFinite(record.seconds_as_recorded) && record.seconds_as_recorded > 0;
  if (!validRepetitionWork && !validDurationWork) {
    return { hard: false, assumed: false, reason: "invalid_repetitions" };
  }
  const threshold = Number(config.hard_set_min_rpe ?? 6);
  if (record.set_type === "failure") {
    return { hard: true, assumed: !isValidRpe(record.rpe), reason: "failure_set" };
  }
  if (isValidRpe(record.rpe)) {
    return record.rpe >= threshold
      ? { hard: true, assumed: false, reason: `rpe_at_or_above_${threshold}` }
      : { hard: false, assumed: false, reason: `rpe_below_${threshold}` };
  }
  if (config.assume_logged_working_set_hard_when_rpe_missing !== false) {
    return { hard: true, assumed: true, reason: "working_set_rpe_missing_config_assumption" };
  }
  return { hard: false, assumed: false, reason: "rpe_missing" };
}

function classifySetTypes(records, meaningfulReductionPct) {
  const working = records.filter((record) => record.is_working_set);
  const numeric = working.filter((record) => record.source_set_order_kind === "numeric_working");
  const finiteLoads = working.map((record) => record.load).filter(Number.isFinite);
  const maximumLoad = finiteLoads.length ? Math.max(...finiteLoads) : null;
  const thresholdRatio = Math.max(0, Number(meaningfulReductionPct) || 0) / 100;
  const firstWorking = working[0] || null;
  const firstNumeric = numeric[0] || null;
  const nextWorking = firstWorking ? working[working.indexOf(firstWorking) + 1] : null;
  const firstQualifiesAsTop = firstNumeric === firstWorking
    && Number.isFinite(firstWorking?.load)
    && firstWorking.load > 0
    && Number.isFinite(nextWorking?.load)
    && nextWorking.load <= firstWorking.load * (1 - thresholdRatio);

  records.forEach((record) => {
    if (record.source_set_order_kind === "warmup") {
      record.set_type = "warmup";
    } else if (record.source_set_order_kind === "failure") {
      record.set_type = "failure";
    } else if (record.source_set_order_kind === "drop_set") {
      record.set_type = "drop_set";
    } else if (record.source_set_order_kind === "numeric_working") {
      if (record === firstNumeric && firstQualifiesAsTop) {
        record.set_type = "top_set";
      } else if (record !== firstWorking
        && Number.isFinite(maximumLoad)
        && maximumLoad > 0
        && Number.isFinite(record.load)
        && record.load <= maximumLoad * (1 - thresholdRatio)) {
        record.set_type = "back_off_set";
      } else {
        record.set_type = "straight_working_set";
      }
    } else {
      record.set_type = "other";
    }
    record.session_exercise_max_working_load = maximumLoad;
  });
}

function attachSetLossMetrics(records, config) {
  const repThreshold = Number(config.progression?.acceptable_set_rep_loss_pct ?? 30);
  const loadThreshold = Number(config.progression?.acceptable_load_reduction_pct ?? 30);
  const comparableLoadThreshold = Number(config.progression?.meaningful_load_reduction_for_backoff_pct ?? 2);
  let previous = null;
  records.forEach((record) => {
    record.previous_working_record_id = null;
    record.rep_loss_from_previous = null;
    record.rep_loss_pct_from_previous = null;
    record.load_reduction_from_previous = null;
    record.load_reduction_pct_from_previous = null;
    record.comparable_load_to_previous = null;
    record.rep_loss_exceeds_threshold = false;
    record.rep_loss_review_flag = false;
    record.load_reduction_exceeds_threshold = false;
    record.set_quality_review_flag = false;
    if (!record.is_working_set) return;
    if (previous) {
      record.previous_working_record_id = previous.record_id;
      if (Number.isFinite(previous.repetitions) && previous.repetitions > 0 && Number.isFinite(record.repetitions)) {
        record.rep_loss_from_previous = round(Math.max(0, previous.repetitions - record.repetitions), 3);
        record.rep_loss_pct_from_previous = round((record.rep_loss_from_previous / previous.repetitions) * 100, 3);
        record.rep_loss_exceeds_threshold = record.rep_loss_pct_from_previous > repThreshold;
      }
      if (Number.isFinite(previous.load) && previous.load > 0 && Number.isFinite(record.load)) {
        record.load_reduction_from_previous = round(Math.max(0, previous.load - record.load), 3);
        record.load_reduction_pct_from_previous = round((record.load_reduction_from_previous / previous.load) * 100, 3);
        const loadChangePct = Math.abs(record.load - previous.load) / previous.load * 100;
        record.comparable_load_to_previous = loadChangePct < comparableLoadThreshold;
        record.load_reduction_exceeds_threshold = record.load_reduction_pct_from_previous > loadThreshold;
      }
      record.rep_loss_review_flag = record.rep_loss_exceeds_threshold && record.comparable_load_to_previous === true;
      record.set_quality_review_flag = record.rep_loss_review_flag || record.load_reduction_exceeds_threshold;
    }
    previous = record;
  });
}

function flagProgressionPlausibility(records, config) {
  const maximumRepetitions = Number(config.plausibility?.maximum_progression_repetitions ?? 50);
  const loadRatio = Number(config.plausibility?.within_session_load_outlier_ratio ?? 3);
  records.forEach((record) => {
    record.analysis_progression_eligible = Boolean(record.is_working_set);
    record.progression_plausibility_flags = [];
    record.progression_exclusion_reason = null;
    if (!record.is_working_set) {
      record.analysis_progression_eligible = false;
      record.progression_exclusion_reason = "not_a_working_set";
      return;
    }
    const durationValid = record.progression_metric === "duration" && Number.isFinite(record.seconds_as_recorded) && record.seconds_as_recorded > 0;
    const repetitionValid = Number.isFinite(record.repetitions) && record.repetitions > 0;
    if (!durationValid && !repetitionValid) record.progression_plausibility_flags.push("invalid_progression_metric_value");
    if (record.progression_metric !== "duration" && Number.isFinite(record.repetitions) && record.repetitions > maximumRepetitions) record.progression_plausibility_flags.push("repetitions_above_progression_plausibility_limit");
  });
  const externalLoads = records
    .filter((record) => record.is_working_set && record.resistance_type === "external" && Number.isFinite(record.load) && record.load > 0)
    .map((record) => record.load);
  const centerLoad = median(externalLoads);
  if (externalLoads.length >= 3 && Number.isFinite(centerLoad) && centerLoad > 0) {
    records.forEach((record) => {
      if (record.is_working_set && record.resistance_type === "external" && Number.isFinite(record.load) && record.load > centerLoad * loadRatio) {
        record.progression_plausibility_flags.push("within_session_load_high_outlier");
      }
    });
  }
  records.forEach((record) => {
    if (record.progression_plausibility_flags.length) {
      record.analysis_progression_eligible = false;
      record.progression_exclusion_reason = record.progression_plausibility_flags.join(";");
      if (!record.missing_data_flags.includes("progression_plausibility_review")) record.missing_data_flags.push("progression_plausibility_review");
    }
  });
}

function initializePrFields(record) {
  record.pr_eligible = false;
  record.pr_metric = null;
  record.pr_metric_fallback = false;
  record.pr_metric_value = null;
  record.previous_pr_metric_value = null;
  record.is_derived_pr = false;
  record.is_personal_record = false;
  record.is_load_pr = false;
  record.is_epley_e1rm_pr = false;
  record.is_rpe_adjusted_e1rm_pr = false;
  record.is_repetition_pr_at_load = false;
  record.personal_record_status = record.set_type === "warmup" ? "not_eligible_warmup" : "not_eligible";
}

function derivePersonalRecords(records) {
  const stateByExercise = new Map();
  const ordered = [...records].sort((left, right) => left.workout_local_datetime.localeCompare(right.workout_local_datetime)
    || left.source_row_number - right.source_row_number);

  ordered.forEach((record) => {
    initializePrFields(record);
    const validRepetitionWork = Number.isFinite(record.repetitions) && record.repetitions > 0;
    const validDurationWork = record.progression_metric === "duration" && Number.isFinite(record.seconds_as_recorded) && record.seconds_as_recorded > 0;
    if (!record.is_working_set || record.set_type === "warmup" || record.analysis_progression_eligible === false || (!validRepetitionWork && !validDurationWork)) return;
    if (!stateByExercise.has(record.exercise_id)) {
      stateByExercise.set(record.exercise_id, {
        primaryMax: null,
        loadMax: null,
        epleyMax: null,
        adjustedMax: null,
        repsByLoad: new Map()
      });
    }
    const state = stateByExercise.get(record.exercise_id);
    let metricName;
    let metricValue;
    if (record.progression_metric === "duration") {
      metricName = "duration_seconds";
      metricValue = record.seconds_as_recorded;
    } else if (record.progression_metric === "repetitions") {
      metricName = "repetitions";
      metricValue = record.repetitions;
    } else if (Number.isFinite(record.rpe_adjusted_e1rm)) {
      metricName = "rpe_adjusted_e1rm";
      metricValue = record.rpe_adjusted_e1rm;
    } else {
      metricName = "epley_e1rm";
      metricValue = record.epley_e1rm;
      record.pr_metric_fallback = true;
    }
    record.pr_metric = metricName;
    record.pr_metric_value = Number.isFinite(metricValue) ? metricValue : null;
    record.previous_pr_metric_value = state.primaryMax;
    record.pr_eligible = Number.isFinite(metricValue);

    if (record.pr_eligible) {
      if (state.primaryMax == null) {
        record.personal_record_status = "baseline_established";
      } else if (metricValue > state.primaryMax + 1e-9) {
        record.is_derived_pr = true;
        record.is_personal_record = true;
        record.personal_record_status = "derived_pr";
      } else {
        record.personal_record_status = "not_pr";
      }
      state.primaryMax = state.primaryMax == null ? metricValue : Math.max(state.primaryMax, metricValue);
    } else {
      record.personal_record_status = "not_eligible_missing_metric";
    }

    if (Number.isFinite(record.load) && record.load > 0) {
      record.is_load_pr = state.loadMax != null && record.load > state.loadMax + 1e-9;
      state.loadMax = state.loadMax == null ? record.load : Math.max(state.loadMax, record.load);
      const loadKey = String(record.load);
      const previousReps = state.repsByLoad.get(loadKey);
      record.is_repetition_pr_at_load = previousReps != null && record.repetitions > previousReps;
      state.repsByLoad.set(loadKey, previousReps == null ? record.repetitions : Math.max(previousReps, record.repetitions));
    }
    if (Number.isFinite(record.epley_e1rm)) {
      record.is_epley_e1rm_pr = state.epleyMax != null && record.epley_e1rm > state.epleyMax + 1e-9;
      state.epleyMax = state.epleyMax == null ? record.epley_e1rm : Math.max(state.epleyMax, record.epley_e1rm);
    }
    if (Number.isFinite(record.rpe_adjusted_e1rm)) {
      record.is_rpe_adjusted_e1rm_pr = state.adjustedMax != null && record.rpe_adjusted_e1rm > state.adjustedMax + 1e-9;
      state.adjustedMax = state.adjustedMax == null
        ? record.rpe_adjusted_e1rm
        : Math.max(state.adjustedMax, record.rpe_adjusted_e1rm);
    }
  });
}

function countBy(records, key) {
  return Object.fromEntries([...records.reduce((counts, record) => {
    const value = String(typeof key === "function" ? key(record) : record[key]);
    counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }, new Map()).entries()].sort((left, right) => left[0].localeCompare(right[0])));
}

function buildSmokeCheck(rawRowCount, records, sessions, restTimerRows) {
  const recordIds = new Set(records.map((record) => record.record_id));
  const checks = [
    { check: "source_rows_accounted_for", passed: rawRowCount === records.length + restTimerRows },
    { check: "rest_timers_excluded_from_records", passed: records.every((record) => record.source_set_order_kind !== "rest_timer") },
    { check: "record_ids_unique", passed: recordIds.size === records.length },
    { check: "all_records_have_session_and_exercise_ids", passed: records.every((record) => record.session_id && record.exercise_id) },
    { check: "warmups_never_hard", passed: records.filter((record) => record.set_type === "warmup").every((record) => !record.hard_set) },
    { check: "warmups_never_pr", passed: records.filter((record) => record.set_type === "warmup").every((record) => !record.is_derived_pr) },
    { check: "sessions_present", passed: sessions.length > 0 },
    { check: "records_present", passed: records.length > 0 }
  ];
  return { passed: checks.every((check) => check.passed), checks };
}

async function normalizeWorkouts({
  rawRoot,
  config = {},
  aliases = [],
  muscleMap = [],
  analysisDate = null,
  methodologyVersion = null
}) {
  if (!rawRoot) throw new Error("normalizeWorkouts requires rawRoot");
  const sourcePath = await findStrongFile(rawRoot);
  const sourceFile = path.basename(sourcePath);
  const aliasLookup = buildAliasLookup(aliases);
  const muscleLookup = buildMuscleLookup(muscleMap);
  const compiledMappingRules = await loadCompiledMappingRules(rawRoot, config);
  const records = [];
  const sessionBuilders = new Map();
  const unmappedNames = new Set();
  const inferredNames = new Set();
  const invalidDateRows = [];
  const invalidLoadRows = [];
  const invalidRepRows = [];
  const invalidRpeRows = [];
  let restTimerRows = 0;
  let attachedRestTimers = 0;
  let orphanRestTimers = 0;
  let invalidRestTimers = 0;
  let multipleRestTimersForSet = 0;
  let lastSetRecord = null;

  const schema = await readCsv(sourcePath, (row, meta) => {
    const rawTimestamp = cleanText(row.Date);
    const parsedDate = parseWorkoutDate(rawTimestamp);
    const workoutName = cleanText(row["Workout Name"]);
    const exerciseName = cleanText(row["Exercise Name"]);
    const kind = setOrderKind(row["Set Order"]);
    const sessionId = stableId("session", SOURCE_ID, rawTimestamp, workoutName);

    if (!sessionBuilders.has(sessionId)) {
      sessionBuilders.set(sessionId, {
        session_id: sessionId,
        source_id: SOURCE_ID,
        source_file: sourceFile,
        source_timestamp_raw: rawTimestamp,
        workout_date: parsedDate?.date || null,
        workout_time_local: parsedDate?.time || null,
        workout_local_datetime: parsedDate?.localDateTime || null,
        timezone: config.timezone || null,
        timezone_status: "local_time_without_offset",
        workout_name_recorded: workoutName,
        duration_raw: cleanText(row.Duration),
        session_duration_minutes: parseDurationMinutes(row.Duration),
        workout_notes: nullableText(row["Workout Notes"]),
        completion_status: "completed_inferred",
        completed: true,
        submitted: true,
        completion_inference: "presence_in_strong_export",
        source_first_row_number: meta.rowNumber,
        source_last_row_number: meta.rowNumber,
        raw_row_count: 0,
        rest_timer_row_count: 0,
        exerciseOrder: new Map(),
        records: []
      });
    }
    const session = sessionBuilders.get(sessionId);
    session.source_last_row_number = meta.rowNumber;
    session.raw_row_count += 1;

    if (!parsedDate) invalidDateRows.push(meta.rowNumber);
    if (kind === "rest_timer") {
      restTimerRows += 1;
      session.rest_timer_row_count += 1;
      const seconds = toNumber(row.Seconds);
      if (!Number.isFinite(seconds) || seconds < 0) invalidRestTimers += 1;
      if (lastSetRecord && lastSetRecord.session_id === sessionId) {
        if (lastSetRecord.rest_after_seconds != null) multipleRestTimersForSet += 1;
        lastSetRecord.rest_after_seconds = Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
        lastSetRecord.rest_timer_source_row_numbers.push(meta.rowNumber);
        lastSetRecord.rest_timer_exercise_name_matches = lastSetRecord.exercise_name_recorded === exerciseName;
        attachedRestTimers += 1;
      } else {
        orphanRestTimers += 1;
      }
      return;
    }

    if (!session.exerciseOrder.has(exerciseName)) session.exerciseOrder.set(exerciseName, session.exerciseOrder.size + 1);
    const { alias, mapped, source: mappingSource, inferredMuscles } = aliasFor(exerciseName, aliasLookup, compiledMappingRules);
    if (mappingSource === "unmapped_fallback") unmappedNames.add(exerciseName);
    if (mappingSource === "inferred_mapping_rule") inferredNames.add(exerciseName);
    const exerciseId = cleanText(alias.exercise_id || alias.exerciseId) || `unmapped_${slugify(exerciseName)}`;
    const mappings = muscleLookup.get(exerciseId) || inferredMuscles;
    const primaryMuscle = cleanText(alias.primary_muscle_group || alias.primaryMuscleGroup)
      || mappings.find((mapping) => mapping.role === "primary")?.muscle_group
      || "unmapped";
    const load = toNumber(row.Weight);
    const repetitions = toNumber(row.Reps);
    const secondsAsRecorded = toNumber(row.Seconds);
    const rpeRaw = toNumber(row.RPE);
    const rpe = isValidRpe(rpeRaw) ? rpeRaw : null;
    const rir = isValidRpe(rpe) ? round(clamp(10 - rpe, 0, 10), 2) : null;
    if (!Number.isFinite(load) || load < 0) invalidLoadRows.push(meta.rowNumber);
    const durationSetWithTime = cleanText(alias.progression_metric || alias.progressionMetric) === "duration" && Number.isFinite(secondsAsRecorded) && secondsAsRecorded > 0;
    if ((!Number.isFinite(repetitions) || repetitions <= 0 || !Number.isInteger(repetitions)) && !durationSetWithTime) invalidRepRows.push(meta.rowNumber);
    if (rpeRaw != null && !isValidRpe(rpeRaw)) invalidRpeRows.push(meta.rowNumber);
    const isWorkingSet = kind === "numeric_working" || kind === "failure" || kind === "drop_set";
    const externalResistance = cleanText(alias.resistance_type || alias.resistanceType) === "external";
    const epleyEstimate = externalResistance ? epley(load, repetitions) : null;
    const adjustedEstimate = externalResistance ? adjustedEpley(load, repetitions, rir) : null;
    const record = {
      record_id: stableId("workout_set", SOURCE_ID, sourceFile, meta.rowNumber),
      session_id: sessionId,
      source_id: SOURCE_ID,
      source_file: sourceFile,
      source_row_number: meta.rowNumber,
      source_physical_line: meta.physicalLine,
      source_timestamp_raw: rawTimestamp,
      workout_date: parsedDate?.date || null,
      workout_time_local: parsedDate?.time || null,
      workout_local_datetime: parsedDate?.localDateTime || null,
      timezone: config.timezone || null,
      timezone_status: "local_time_without_offset",
      workout_name_recorded: workoutName,
      duration_raw: cleanText(row.Duration),
      session_duration_minutes: parseDurationMinutes(row.Duration),
      exercise_name_recorded: exerciseName,
      exercise_id: exerciseId,
      canonical_exercise_name: cleanText(alias.canonical_name || alias.canonicalName) || exerciseName,
      exercise_variation: cleanText(alias.variation) || "unspecified",
      exercise_alias_mapped: mapped,
      exercise_mapping_source: mappingSource,
      exercise_mapping_inferred: mappingSource === "inferred_mapping_rule",
      exercise_mapping_unmapped: mappingSource === "unmapped_fallback",
      primary_muscle_group: primaryMuscle,
      secondary_muscle_groups: mappings.filter((mapping) => mapping.role !== "primary").map((mapping) => mapping.muscle_group),
      muscle_groups: mappings,
      resistance_type: cleanText(alias.resistance_type || alias.resistanceType) || "unknown",
      exercise_kind: cleanText(alias.exercise_kind || alias.exerciseKind) || "unknown",
      progression_metric: cleanText(alias.progression_metric || alias.progressionMetric) || "rpe_adjusted_e1rm",
      research_exercise_id: nullableText(alias.research_exercise_id || alias.researchExerciseId),
      comparison_group: cleanText(alias.comparison_group || alias.comparisonGroup) || exerciseId,
      equipment_identity_status: nullableText(alias.equipment_identity_status || alias.equipmentIdentityStatus),
      exercise_order: session.exerciseOrder.get(exerciseName),
      set_sequence_in_exercise: null,
      session_set_sequence: session.records.length + 1,
      source_set_order: cleanText(row["Set Order"]),
      source_set_order_kind: kind,
      set_number: kind === "numeric_working" ? Number(cleanText(row["Set Order"])) : null,
      working_set_number: null,
      set_type: kind === "warmup"
        ? "warmup"
        : kind === "failure"
          ? "failure"
          : kind === "drop_set"
            ? "drop_set"
            : "unclassified",
      is_warmup: kind === "warmup",
      is_working_set: isWorkingSet,
      is_failure_set: kind === "failure",
      is_drop_set: kind === "drop_set",
      load,
      load_unit: "lb_inferred_from_strong_context",
      load_as_recorded: cleanText(row.Weight),
      repetitions,
      rpe,
      rpe_as_recorded: nullableText(row.RPE),
      rir,
      rir_source: rir == null ? null : "derived_as_10_minus_rpe",
      distance_as_recorded: toNumber(row.Distance),
      seconds_as_recorded: secondsAsRecorded,
      rest_after_seconds: null,
      rest_timer_source_row_numbers: [],
      rest_timer_exercise_name_matches: null,
      epley_e1rm: epleyEstimate,
      rpe_adjusted_e1rm: adjustedEstimate,
      e1rm_applicable: externalResistance,
      e1rm_formula: externalResistance ? "epley_load_x_(1_plus_reps_div_30)" : null,
      rpe_adjustment_formula: externalResistance ? "epley_using_reps_plus_rir" : null,
      notes: nullableText(row.Notes),
      workout_notes: nullableText(row["Workout Notes"]),
      completion_status: "completed_inferred",
      completed: true,
      submitted: true,
      completion_inference: "presence_in_strong_export",
      hard_set: false,
      hard_set_assumed: false,
      hard_set_reason: null,
      hard_set_min_rpe: Number(config.hard_set_min_rpe ?? 6),
      analysis_date: analysisDate,
      methodology_version: methodologyVersion || config.methodology_version || null,
      missing_data_flags: [],
      source_references: [`${sourceFile}#row=${meta.rowNumber}`]
    };
    if (!parsedDate) record.missing_data_flags.push("invalid_workout_timestamp");
    if (mappingSource === "inferred_mapping_rule") record.missing_data_flags.push("exercise_mapping_inferred_review_required");
    if (mappingSource === "unmapped_fallback") record.missing_data_flags.push("exercise_mapping_unmapped");
    if (!Number.isFinite(load) || load < 0) record.missing_data_flags.push("invalid_load");
    if ((!Number.isFinite(repetitions) || repetitions <= 0 || !Number.isInteger(repetitions)) && !durationSetWithTime) record.missing_data_flags.push("invalid_repetitions");
    if (isWorkingSet && rpe == null) record.missing_data_flags.push("rpe_missing");
    session.records.push(record);
    records.push(record);
    lastSetRecord = record;
  });

  const meaningfulReduction = Number(config.progression?.meaningful_load_reduction_for_backoff_pct ?? 2);
  sessionBuilders.forEach((session) => {
    const byExercise = new Map();
    session.records.forEach((record) => {
      if (!byExercise.has(record.exercise_id)) byExercise.set(record.exercise_id, []);
      byExercise.get(record.exercise_id).push(record);
    });
    byExercise.forEach((exerciseRecords) => {
      let setSequence = 0;
      let workingSetNumber = 0;
      exerciseRecords.forEach((record) => {
        setSequence += 1;
        record.set_sequence_in_exercise = setSequence;
        if (record.is_working_set) {
          workingSetNumber += 1;
          record.working_set_number = workingSetNumber;
        }
      });
      classifySetTypes(exerciseRecords, meaningfulReduction);
      attachSetLossMetrics(exerciseRecords, config);
      flagProgressionPlausibility(exerciseRecords, config);
      exerciseRecords.forEach((record) => {
        const hard = classifyHardSet(record, config);
        record.hard_set = hard.hard;
        record.hard_set_assumed = hard.assumed;
        record.hard_set_reason = hard.reason;
      });
    });
  });

  derivePersonalRecords(records);

  const sessions = [...sessionBuilders.values()]
    .map((session) => ({
      session_id: session.session_id,
      source_id: session.source_id,
      source_file: session.source_file,
      source_timestamp_raw: session.source_timestamp_raw,
      workout_date: session.workout_date,
      workout_time_local: session.workout_time_local,
      workout_local_datetime: session.workout_local_datetime,
      timezone: session.timezone,
      timezone_status: session.timezone_status,
      workout_name_recorded: session.workout_name_recorded,
      duration_raw: session.duration_raw,
      session_duration_minutes: session.session_duration_minutes,
      workout_notes: session.workout_notes,
      completion_status: session.completion_status,
      completed: session.completed,
      submitted: session.submitted,
      completion_inference: session.completion_inference,
      source_first_row_number: session.source_first_row_number,
      source_last_row_number: session.source_last_row_number,
      source_raw_row_count: session.raw_row_count,
      rest_timer_row_count: session.rest_timer_row_count,
      set_record_count: session.records.length,
      warmup_set_count: session.records.filter((record) => record.set_type === "warmup").length,
      working_set_count: session.records.filter((record) => record.is_working_set).length,
      hard_set_count: session.records.filter((record) => record.hard_set).length,
      failure_set_count: session.records.filter((record) => record.set_type === "failure").length,
      drop_set_count: session.records.filter((record) => record.set_type === "drop_set").length,
      exercise_count: new Set(session.records.map((record) => record.exercise_id)).size,
      exercise_order: [...session.exerciseOrder.entries()].map(([recorded_name, order]) => ({ recorded_name, order })),
      analysis_date: analysisDate,
      methodology_version: methodologyVersion || config.methodology_version || null,
      source_references: [`${sourceFile}#rows=${session.source_first_row_number}-${session.source_last_row_number}`]
    }))
    .sort((left, right) => (left.workout_local_datetime || "").localeCompare(right.workout_local_datetime || ""));

  const range = dateRange(records, "workout_date");
  const sourceSchemas = [{
    source_id: SOURCE_ID,
    source_file: sourceFile,
    source_path_relative_to_raw_root: sourceFile,
    format: "csv",
    columns: schema.headers,
    expected_columns: EXPECTED_HEADERS,
    missing_required_columns: REQUIRED_HEADERS.filter((header) => !schema.headers.includes(header)),
    missing_optional_columns: OPTIONAL_HEADERS.filter((header) => !schema.headers.includes(header)),
    missing_expected_columns: EXPECTED_HEADERS.filter((header) => !schema.headers.includes(header)),
    unexpected_columns: schema.headers.filter((header) => !EXPECTED_HEADERS.includes(header)),
    data_types: {
      Date: "local datetime string: ISO YYYY-MM-DD HH:mm:ss or legacy M/D/YYYY H:mm; no offset",
      "Workout Name": "string",
      Duration: "duration string such as 44m or 1h 4m",
      "Exercise Name": "string",
      "Set Order": "mixed enum/string: W, F, D, Rest Timer, or positive integer",
      Weight: "decimal number; pounds inferred, equipment identity not guaranteed",
      Reps: "integer",
      Distance: "decimal number",
      Seconds: "decimal seconds; meaningful on Rest Timer rows",
      Notes: "nullable string",
      "Workout Notes": "nullable string",
      RPE: "nullable decimal 0-10"
    },
    units: {
      Weight: "lb inferred from Strong/user context; machine loads remain equipment-specific",
      Reps: "count",
      Distance: "Strong export unit not declared",
      Seconds: "seconds",
      RPE: "0-10 scale"
    },
    timestamp_semantics: "Date is treated as the workout/session start timestamp in local time; no UTC offset is present.",
    raw_row_count: schema.rowCount,
    normalized_set_record_count: records.length,
    excluded_rest_timer_row_count: restTimerRows,
    source_date_range: range
  }];

  const smokeCheck = buildSmokeCheck(schema.rowCount, records, sessions, restTimerRows);
  const quality = {
    source_id: SOURCE_ID,
    source_file: sourceFile,
    analysis_date: analysisDate,
    methodology_version: methodologyVersion || config.methodology_version || null,
    source_date_range: range,
    raw_row_count: schema.rowCount,
    normalized_set_record_count: records.length,
    session_count: sessions.length,
    unique_recorded_exercise_count: new Set(records.map((record) => record.exercise_name_recorded)).size,
    unique_exercise_id_count: new Set(records.map((record) => record.exercise_id)).size,
    rest_timer_row_count: restTimerRows,
    attached_rest_timer_count: attachedRestTimers,
    orphan_rest_timer_count: orphanRestTimers,
    invalid_rest_timer_count: invalidRestTimers,
    multiple_rest_timers_for_one_set_count: multipleRestTimersForSet,
    set_type_counts: countBy(records, "set_type"),
    hard_set_count: records.filter((record) => record.hard_set).length,
    assumed_hard_set_count: records.filter((record) => record.hard_set_assumed).length,
    derived_pr_count: records.filter((record) => record.is_derived_pr).length,
    progression_plausibility_excluded_set_count: records.filter((record) => record.analysis_progression_eligible === false && record.is_working_set).length,
    progression_plausibility_flag_counts: countBy(records.filter((record) => record.progression_plausibility_flags?.length), (record) => record.progression_plausibility_flags.join(";")),
    invalid_date_count: invalidDateRows.length,
    invalid_date_source_rows: invalidDateRows,
    invalid_load_count: invalidLoadRows.length,
    invalid_load_source_rows: invalidLoadRows,
    invalid_repetition_count: invalidRepRows.length,
    invalid_repetition_source_rows: invalidRepRows,
    invalid_rpe_count: invalidRpeRows.length,
    invalid_rpe_source_rows: invalidRpeRows,
    working_set_count: records.filter((record) => record.is_working_set).length,
    working_set_rpe_present_count: records.filter((record) => record.is_working_set && record.rpe != null).length,
    working_set_rpe_missing_count: records.filter((record) => record.is_working_set && record.rpe == null).length,
    unmapped_exercise_count: unmappedNames.size,
    unmapped_exercise_names: [...unmappedNames].sort((left, right) => left.localeCompare(right)),
    inferred_exercise_count: inferredNames.size,
    inferred_exercise_names: [...inferredNames].sort((left, right) => left.localeCompare(right)),
    compiled_mapping_rule_count: compiledMappingRules.length,
    source_schema_matches_expected: sourceSchemas[0].missing_required_columns.length === 0,
    optional_source_columns_missing: sourceSchemas[0].missing_optional_columns,
    source_schema: sourceSchemas[0],
    smoke_check: smokeCheck,
    notes: [
      "Rest Timer rows are excluded as set records and attached to the immediately preceding set in the same session.",
      "Warm-up rows are never hard sets or personal records.",
      "Strong F and D codes remain explicit failure and drop-set records rather than being merged into numeric set classifications.",
      "Explicit alias rows are authoritative. Rule-derived mappings are labeled inferred and retained as distinct recorded-name variations; unmatched names remain clearly unmapped.",
      "Derived personal records compare only identical exercise_id values; first observations establish baselines. External-resistance records use RPE-adjusted e1RM when available and conservatively fall back to unadjusted Epley e1RM when RPE is absent.",
      "Strong does not export an explicit completion/submission field, so presence in the export is used as a documented inference.",
      "The source has no declared load unit; pounds are inferred, while machine identity remains unresolved where mappings say so."
    ]
  };

  return { records, sessions, quality, sourceSchemas };
}

module.exports = {
  normalizeWorkouts,
  __test: { adjustedEpley, classifyHardSet, classifySetTypes, epley, parseWorkoutDate, setOrderKind }
};
