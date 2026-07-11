"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");

const {
  addDays,
  dateOnly,
  mean,
  median,
  nullableText,
  parseFitbitShortDate,
  readCsv,
  round,
  slugify,
  stableId,
  standardDeviation,
  toNumber
} = require("./utils");

const LOCAL_WALL_MISLABELED_UTC = "local_wall_time_mislabeled_utc";
const LOCAL_WALL_NAIVE = "local_wall_time_no_offset";
const DATE_ONLY = "local_calendar_date";

async function pathExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveGoogleHealthRoot(rawRoot) {
  const resolved = path.resolve(rawRoot);
  const candidates = [
    path.join(resolved, "Takeout", "Google Health"),
    path.join(resolved, "Google Health"),
    resolved
  ];
  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, "Physical Activity_GoogleData"))) return candidate;
  }
  throw new Error(`Could not find Google Health export beneath rawRoot: ${resolved}`);
}

async function matchingFiles(directory, pattern) {
  if (!(await pathExists(directory))) return [];
  return (await fsp.readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), undefined, { numeric: true }));
}

function dayNumber(date) {
  const value = Date.parse(`${date}T12:00:00Z`);
  return Number.isFinite(value) ? Math.floor(value / 86400000) : null;
}

function sourceReference(rawRoot, filePath, rowNumber = null) {
  const relative = path.relative(rawRoot, filePath).split(path.sep).join("/");
  return Number.isFinite(rowNumber) ? `${relative}:row:${rowNumber}` : relative;
}

function dateRangeFromSet(dates) {
  const sorted = [...dates].filter(Boolean).sort();
  return { start: sorted[0] || null, end: sorted.at(-1) || null };
}

function asRoundedNumber(value, digits = 4) {
  return Number.isFinite(value) ? round(value, digits) : null;
}

function normalizeAnalysisDate(value) {
  return dateOnly(value) || new Date().toISOString().slice(0, 10);
}

function createQuality(analysisDate, methodologyVersion, rawRoot, googleHealthRoot) {
  return {
    analysis_date: analysisDate,
    methodology_version: methodologyVersion,
    raw_root: rawRoot,
    google_health_root: googleHealthRoot,
    source_file_count: 0,
    source_rows: {},
    emitted_metric_records: 0,
    emitted_missing_metric_records: 0,
    missing_values_by_metric: {},
    missing_source_files: [],
    invalid_date_rows: 0,
    invalid_numeric_rows: 0,
    sentinel_values_converted_to_missing: {
      hrv_rmssd_ms: 0,
      non_rem_heart_rate_bpm: 0,
      deep_sleep_rmssd_ms: 0,
      hrv_entropy: 0,
      spo2_baseline_pct: 0,
      spo2_stddev_pct: 0,
      sleep_revitalization_score_legacy_schema: 0
    },
    duplicate_rows: {
      sleep_log_id_boundary_repeats: 0,
      conflicting_sleep_log_ids: 0,
      sleep_score_log_ids: 0,
      activity_session_log_ids: 0,
      minute_timestamp_rows: 0
    },
    sleep: {
      unique_sessions: 0,
      main_sleep_sessions: 0,
      nap_sessions: 0,
      multiple_main_sleep_dates: 0,
      main_sleep_without_score: 0,
      score_rows_for_naps: 0,
      unmatched_sleep_score_rows: 0,
      deep_sleep_source_conflicts: 0,
      legacy_revitalization_schema_rows: 0
    },
    body_composition: {
      total_records: 0,
      representative_records: 0,
      dates_with_multiple_weight_records: 0,
      dates_with_multiple_body_fat_records: 0
    },
    activity: {
      unique_sessions: 0,
      duplicate_sessions: 0
    },
    metric_date_gaps: {},
    warnings: [
      "Fitbit CSV timestamps ending in Z preserve local wall-clock values; they must not be shifted from UTC.",
      "Zero HRV, non-REM heart-rate, deep-sleep RMSSD, invalid-night entropy, and zero SpO2 baseline/deviation values are treated as missing sentinels.",
      "Legacy sleep-score rows that store the overall score in the revitalization column are normalized to a missing revitalization subscore."
    ]
  };
}

function increment(object, key, amount = 1) {
  object[key] = (object[key] || 0) + amount;
}

function addSourceSchema(sourceSchemas, schema) {
  sourceSchemas.push({
    source_id: schema.source_id,
    source_pattern: schema.source_pattern,
    files: schema.files,
    file_count: schema.files.length,
    row_count: schema.row_count,
    date_range: schema.date_range,
    columns: schema.columns,
    units: schema.units,
    timestamp_semantics: schema.timestamp_semantics,
    missing_file: Boolean(schema.missing_file),
    notes: schema.notes || null
  });
}

function emitMetric(state, input) {
  const numericValue = Number.isFinite(input.value) ? asRoundedNumber(input.value, input.digits ?? 4) : null;
  const textValue = nullableText(input.value_text);
  const missing = Boolean(input.missing_data_flag) || (numericValue == null && textValue == null);
  const references = [...new Set((input.source_references || []).filter(Boolean))];
  const record = {
    record_id: stableId(
      "fitbit_metric",
      input.date,
      input.metric_id,
      input.record_key || "",
      references.join("|")
    ),
    date: input.date,
    metric_id: input.metric_id,
    metric_category: input.metric_category || "recovery",
    value: numericValue,
    value_text: textValue,
    unit: input.unit || null,
    source: input.source || "Fitbit",
    source_timestamp: input.source_timestamp || null,
    timestamp_semantics: input.timestamp_semantics || DATE_ONLY,
    source_file: input.source_file || null,
    source_row: Number.isFinite(input.source_row) ? input.source_row : null,
    source_references: references,
    derived: Boolean(input.derived),
    missing_data_flag: missing,
    missing_reason: missing ? (input.missing_reason || "source value unavailable") : null,
    notes: input.notes || null,
    analysis_date: state.analysisDate,
    methodology_version: state.methodologyVersion
  };
  state.records.push(record);
  state.quality.emitted_metric_records += 1;
  if (missing) {
    state.quality.emitted_missing_metric_records += 1;
    increment(state.quality.missing_values_by_metric, input.metric_id);
  }
  return record;
}

async function ingestCompactDailySource(state, definition) {
  const filePath = path.join(state.physicalActivityRoot, definition.file);
  const relative = sourceReference(state.rawRoot, filePath);
  if (!(await pathExists(filePath))) {
    state.quality.missing_source_files.push(relative);
    addSourceSchema(state.sourceSchemas, {
      source_id: definition.source_id,
      source_pattern: definition.file,
      files: [],
      row_count: 0,
      date_range: { start: null, end: null },
      columns: [],
      units: definition.units,
      timestamp_semantics: definition.timestamp_semantics,
      missing_file: true,
      notes: definition.notes
    });
    return;
  }

  const dates = new Set();
  const result = await readCsv(filePath, (row, meta) => {
    const rawTimestamp = row[definition.timestamp_column || "timestamp"];
    const date = dateOnly(rawTimestamp);
    if (!date) {
      state.quality.invalid_date_rows += 1;
      return;
    }
    dates.add(date);
    const source = nullableText(row["data source"]) || "Fitbit";
    for (const metric of definition.metrics) {
      if (metric.kind === "text") {
        emitMetric(state, {
          date,
          metric_id: metric.metric_id,
          metric_category: metric.metric_category,
          value_text: row[metric.column],
          unit: metric.unit,
          source,
          source_timestamp: rawTimestamp,
          timestamp_semantics: definition.timestamp_semantics,
          source_file: relative,
          source_row: meta.rowNumber,
          source_references: [sourceReference(state.rawRoot, filePath, meta.rowNumber)],
          record_key: `${definition.source_id}:${meta.rowNumber}`,
          missing_reason: "categorical source value unavailable",
          notes: metric.notes
        });
        continue;
      }

      const rawValue = row[metric.column];
      let value = toNumber(rawValue);
      let missingReason = value == null ? "numeric source value unavailable" : null;
      const zeroIsMissing = value === 0 && (metric.zero_is_missing
        || (typeof metric.zero_is_missing_when === "function" && metric.zero_is_missing_when(row)));
      if (zeroIsMissing) {
        value = null;
        missingReason = "Fitbit zero sentinel, not a physiologic zero";
        increment(state.quality.sentinel_values_converted_to_missing, metric.metric_id);
      }
      if (value == null && nullableText(rawValue) != null && missingReason !== "Fitbit zero sentinel, not a physiologic zero") {
        state.quality.invalid_numeric_rows += 1;
      }
      if (Number.isFinite(value) && typeof metric.transform === "function") value = metric.transform(value);
      emitMetric(state, {
        date,
        metric_id: metric.metric_id,
        metric_category: metric.metric_category,
        value,
        digits: metric.digits,
        unit: metric.unit,
        source,
        source_timestamp: rawTimestamp,
        timestamp_semantics: definition.timestamp_semantics,
        source_file: relative,
        source_row: meta.rowNumber,
        source_references: [sourceReference(state.rawRoot, filePath, meta.rowNumber)],
        record_key: `${definition.source_id}:${meta.rowNumber}`,
        missing_reason: missingReason,
        notes: metric.notes
      });
    }
  });

  state.quality.source_file_count += 1;
  state.quality.source_rows[definition.source_id] = result.rowCount;
  addSourceSchema(state.sourceSchemas, {
    source_id: definition.source_id,
    source_pattern: definition.file,
    files: [relative],
    row_count: result.rowCount,
    date_range: dateRangeFromSet(dates),
    columns: result.headers,
    units: definition.units,
    timestamp_semantics: definition.timestamp_semantics,
    notes: definition.notes
  });
}

async function ingestCompactDailySources(state) {
  const sources = [
    {
      source_id: "fitbit_daily_hrv",
      file: "daily_heart_rate_variability.csv",
      timestamp_semantics: LOCAL_WALL_MISLABELED_UTC,
      units: {
        "average heart rate variability milliseconds": "ms RMSSD",
        "non rem heart rate beats per minute": "bpm",
        entropy: "Shannon entropy",
        "deep sleep root mean square of successive differences milliseconds": "ms RMSSD"
      },
      notes: "Daily sleep-derived values; documented zero sentinels are normalized to missing.",
      metrics: [
        { column: "average heart rate variability milliseconds", metric_id: "hrv_rmssd_ms", unit: "ms", zero_is_missing: true },
        { column: "non rem heart rate beats per minute", metric_id: "non_rem_heart_rate_bpm", unit: "bpm", zero_is_missing: true },
        {
          column: "entropy",
          metric_id: "hrv_entropy",
          unit: "entropy",
          zero_is_missing_when: (row) => toNumber(row["average heart rate variability milliseconds"]) === 0
        },
        { column: "deep sleep root mean square of successive differences milliseconds", metric_id: "deep_sleep_rmssd_ms", unit: "ms", zero_is_missing: true }
      ]
    },
    {
      source_id: "fitbit_daily_resting_heart_rate",
      file: "daily_resting_heart_rate.csv",
      timestamp_semantics: LOCAL_WALL_MISLABELED_UTC,
      units: { "beats per minute": "bpm" },
      metrics: [{ column: "beats per minute", metric_id: "resting_heart_rate_bpm", unit: "bpm" }]
    },
    {
      source_id: "fitbit_daily_readiness",
      file: "daily_readiness.csv",
      timestamp_semantics: DATE_ONLY,
      units: { score: "score 1-100" },
      notes: "The exported readiness-level field is often TYPE_UNSPECIFIED; categorical fields are preserved without imputation.",
      metrics: [
        { column: "score", metric_id: "readiness_score", unit: "score", metric_category: "readiness" },
        { column: "type", metric_id: "readiness_type", kind: "text", metric_category: "readiness" },
        { column: "readiness level", metric_id: "readiness_level", kind: "text", metric_category: "readiness" },
        { column: "sleep readiness", metric_id: "sleep_readiness_level", kind: "text", metric_category: "readiness" },
        { column: "heart rate variability readiness", metric_id: "hrv_readiness_level", kind: "text", metric_category: "readiness" },
        { column: "resting heart rate readiness", metric_id: "resting_hr_readiness_level", kind: "text", metric_category: "readiness" }
      ]
    },
    {
      source_id: "fitbit_daily_respiratory_rate",
      file: "daily_respiratory_rate.csv",
      timestamp_semantics: LOCAL_WALL_MISLABELED_UTC,
      units: { "breaths per minute": "breaths/min" },
      metrics: [{ column: "breaths per minute", metric_id: "respiratory_rate_breaths_per_minute", unit: "breaths/min" }]
    },
    {
      source_id: "fitbit_daily_oxygen_saturation",
      file: "daily_oxygen_saturation.csv",
      timestamp_semantics: LOCAL_WALL_MISLABELED_UTC,
      units: {
        "average percentage": "%",
        "lower bound percentage": "%",
        "upper bound percentage": "%",
        "baseline percentage": "%",
        "standard deviation percentage": "%"
      },
      metrics: [
        { column: "average percentage", metric_id: "spo2_average_pct", unit: "%" },
        { column: "lower bound percentage", metric_id: "spo2_lower_bound_pct", unit: "%" },
        { column: "upper bound percentage", metric_id: "spo2_upper_bound_pct", unit: "%" },
        { column: "baseline percentage", metric_id: "spo2_baseline_pct", unit: "%", zero_is_missing: true },
        { column: "standard deviation percentage", metric_id: "spo2_stddev_pct", unit: "%", zero_is_missing: true }
      ]
    },
    {
      source_id: "fitbit_daily_sleep_temperature",
      file: "daily_sleep_temperature_derivations.csv",
      timestamp_semantics: LOCAL_WALL_MISLABELED_UTC,
      units: {
        "nightly temperature celsius": "degrees C",
        "baseline temperature celsius": "degrees C",
        "relative nightly stddev 30d celsius": "degrees C"
      },
      metrics: [
        { column: "nightly temperature celsius", metric_id: "sleep_skin_temperature_c", unit: "degC" },
        { column: "baseline temperature celsius", metric_id: "sleep_skin_temperature_baseline_30d_c", unit: "degC" },
        { column: "relative nightly stddev 30d celsius", metric_id: "sleep_skin_temperature_relative_stddev_30d_c", unit: "degC" }
      ]
    }
  ];
  for (const source of sources) await ingestCompactDailySource(state, source);
}

async function ingestSleep(state) {
  const sleepDirectory = path.join(state.googleHealthRoot, "Global Export Data");
  const scorePath = path.join(state.googleHealthRoot, "Sleep Score", "sleep_score.csv");
  const sleepFiles = await matchingFiles(sleepDirectory, /^sleep-\d{4}-\d{2}-\d{2}\.json$/);
  const sleepByLogId = new Map();
  const sleepSourceByLogId = new Map();
  const sleepDates = new Set();
  let rawSleepRows = 0;

  for (const filePath of sleepFiles) {
    const relative = sourceReference(state.rawRoot, filePath);
    const parsed = JSON.parse(await fsp.readFile(filePath, "utf8"));
    if (!Array.isArray(parsed)) throw new Error(`Expected an array in ${filePath}`);
    rawSleepRows += parsed.length;
    for (let index = 0; index < parsed.length; index += 1) {
      const sleep = parsed[index];
      const logId = String(sleep.logId);
      if (sleepByLogId.has(logId)) {
        state.quality.duplicate_rows.sleep_log_id_boundary_repeats += 1;
        if (JSON.stringify(sleepByLogId.get(logId)) !== JSON.stringify(sleep)) {
          state.quality.duplicate_rows.conflicting_sleep_log_ids += 1;
        }
        continue;
      }
      sleepByLogId.set(logId, sleep);
      sleepSourceByLogId.set(logId, `${relative}:json-index:${index}`);
      if (sleep.dateOfSleep) sleepDates.add(sleep.dateOfSleep);
    }
  }
  state.quality.source_file_count += sleepFiles.length;
  state.quality.source_rows.fitbit_sleep_json = rawSleepRows;

  const scoresByLogId = new Map();
  const scoreReferences = new Map();
  let scoreResult = { rowCount: 0, headers: [] };
  const scoreDates = new Set();
  if (await pathExists(scorePath)) {
    scoreResult = await readCsv(scorePath, (row, meta) => {
      const logId = nullableText(row.sleep_log_entry_id);
      if (!logId) return;
      if (scoresByLogId.has(logId)) {
        state.quality.duplicate_rows.sleep_score_log_ids += 1;
        return;
      }
      scoresByLogId.set(logId, row);
      scoreReferences.set(logId, sourceReference(state.rawRoot, scorePath, meta.rowNumber));
      const scoreDate = dateOnly(row.timestamp);
      if (scoreDate) scoreDates.add(scoreDate);
    });
    state.quality.source_file_count += 1;
    state.quality.source_rows.fitbit_sleep_score = scoreResult.rowCount;
  } else {
    state.quality.missing_source_files.push(sourceReference(state.rawRoot, scorePath));
  }

  const mainByDate = new Map();
  for (const [logId, sleep] of sleepByLogId) {
    if (!sleep.mainSleep) {
      state.quality.sleep.nap_sessions += 1;
      if (scoresByLogId.has(logId)) state.quality.sleep.score_rows_for_naps += 1;
      continue;
    }
    state.quality.sleep.main_sleep_sessions += 1;
    const date = dateOnly(sleep.dateOfSleep);
    if (!date) {
      state.quality.invalid_date_rows += 1;
      continue;
    }
    if (mainByDate.has(date)) {
      state.quality.sleep.multiple_main_sleep_dates += 1;
      const prior = mainByDate.get(date);
      if ((toNumber(sleep.minutesAsleep) || 0) <= (toNumber(prior.sleep.minutesAsleep) || 0)) continue;
    }
    mainByDate.set(date, { logId, sleep });
  }

  const emittedScoreIds = new Set();
  for (const [date, { logId, sleep }] of [...mainByDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const score = scoresByLogId.get(logId) || null;
    if (score) emittedScoreIds.add(logId);
    else state.quality.sleep.main_sleep_without_score += 1;
    const sleepReference = sleepSourceByLogId.get(logId);
    const scoreReference = score ? scoreReferences.get(logId) : null;
    const references = [sleepReference, scoreReference].filter(Boolean);
    const summary = sleep.levels?.summary || {};
    const jsonDeep = toNumber(summary.deep?.minutes);
    const scoreDeep = score ? toNumber(score.deep_sleep_in_minutes) : null;
    if (Number.isFinite(jsonDeep) && Number.isFinite(scoreDeep) && Math.abs(jsonDeep - scoreDeep) > 1) {
      state.quality.sleep.deep_sleep_source_conflicts += 1;
    }
    const deepMinutes = Number.isFinite(jsonDeep) ? jsonDeep : scoreDeep;
    const lightMinutes = toNumber(summary.light?.minutes);
    const remMinutes = toNumber(summary.rem?.minutes);
    const wakeStageMinutes = toNumber(summary.wake?.minutes) ?? toNumber(summary.awake?.minutes);
    const asleepMinutes = toNumber(sleep.minutesAsleep);
    const sourceFile = sleepReference ? sleepReference.split(":json-index:")[0] : null;
    const overallSleepScore = score ? toNumber(score.overall_score) : null;
    const compositionScore = score ? toNumber(score.composition_score) : null;
    const durationScore = score ? toNumber(score.duration_score) : null;
    const rawRevitalizationScore = score ? toNumber(score.revitalization_score) : null;
    const legacyCollapsedRevitalization = score
      && compositionScore == null
      && durationScore == null
      && Number.isFinite(rawRevitalizationScore)
      && Number.isFinite(overallSleepScore)
      && Math.abs(rawRevitalizationScore - overallSleepScore) < 0.0001;
    const revitalizationScore = legacyCollapsedRevitalization ? null : rawRevitalizationScore;
    if (legacyCollapsedRevitalization) {
      state.quality.sleep.legacy_revitalization_schema_rows += 1;
      state.quality.sentinel_values_converted_to_missing.sleep_revitalization_score_legacy_schema += 1;
    }

    const common = {
      date,
      metric_category: "sleep",
      source: score ? "Fitbit sleep export + sleep score" : "Fitbit sleep export",
      source_timestamp: nullableText(sleep.endTime),
      timestamp_semantics: LOCAL_WALL_NAIVE,
      source_file: sourceFile,
      source_references: references,
      record_key: logId
    };
    const numericMetrics = [
      ["sleep_duration_minutes", asleepMinutes, "min", null],
      ["time_in_bed_minutes", toNumber(sleep.timeInBed), "min", null],
      ["sleep_awake_minutes", toNumber(sleep.minutesAwake), "min", null],
      ["sleep_minutes_to_fall_asleep", toNumber(sleep.minutesToFallAsleep), "min", null],
      ["sleep_minutes_after_wakeup", toNumber(sleep.minutesAfterWakeup), "min", null],
      ["sleep_efficiency_pct", toNumber(sleep.efficiency), "%", null],
      ["deep_sleep_minutes", deepMinutes, "min", "Stage-specific sleep unavailable for classic sleep records"],
      ["light_sleep_minutes", lightMinutes, "min", "Stage-specific sleep unavailable for classic sleep records"],
      ["rem_sleep_minutes", remMinutes, "min", "Stage-specific sleep unavailable for classic sleep records"],
      ["wake_stage_minutes", wakeStageMinutes, "min", "Stage-specific sleep unavailable for classic sleep records"],
      ["deep_sleep_pct", Number.isFinite(deepMinutes) && asleepMinutes > 0 ? (deepMinutes / asleepMinutes) * 100 : null, "%", "Stage-specific sleep unavailable"],
      ["rem_sleep_pct", Number.isFinite(remMinutes) && asleepMinutes > 0 ? (remMinutes / asleepMinutes) * 100 : null, "%", "Stage-specific sleep unavailable"],
      ["sleep_score", overallSleepScore, "score", "No sleep score for this main sleep"],
      ["sleep_composition_score", compositionScore, "score", "Sleep-score component unavailable"],
      [
        "sleep_revitalization_score",
        revitalizationScore,
        "score",
        legacyCollapsedRevitalization
          ? "Legacy sleep-score schema stored the overall score in the revitalization column; no distinct revitalization subscore is available"
          : "Sleep-score component unavailable"
      ],
      ["sleep_duration_score", durationScore, "score", "Sleep-score component unavailable"],
      ["sleeping_heart_rate_bpm", score ? toNumber(score.resting_heart_rate) : null, "bpm", "No sleep-score heart-rate value"],
      ["sleep_restlessness_ratio", score ? toNumber(score.restlessness) : null, "ratio", "No sleep-score restlessness value"]
    ];
    for (const [metricId, value, unit, missingReason] of numericMetrics) {
      emitMetric(state, { ...common, metric_id: metricId, value, unit, derived: metricId.endsWith("_pct"), missing_reason: missingReason });
    }
    emitMetric(state, { ...common, metric_id: "sleep_type", value_text: sleep.type, unit: null });
    emitMetric(state, { ...common, metric_id: "sleep_log_type", value_text: sleep.logType, unit: null });
  }

  for (const logId of scoresByLogId.keys()) {
    if (!sleepByLogId.has(logId)) state.quality.sleep.unmatched_sleep_score_rows += 1;
  }
  state.quality.sleep.unique_sessions = sleepByLogId.size;

  addSourceSchema(state.sourceSchemas, {
    source_id: "fitbit_sleep_json",
    source_pattern: "Global Export Data/sleep-YYYY-MM-DD.json",
    files: sleepFiles.map((file) => sourceReference(state.rawRoot, file)),
    row_count: rawSleepRows,
    date_range: dateRangeFromSet(sleepDates),
    columns: [
      "logId", "dateOfSleep", "startTime", "endTime", "duration", "minutesToFallAsleep", "minutesAsleep",
      "minutesAwake", "minutesAfterWakeup", "timeInBed", "efficiency", "type", "infoCode", "logType", "levels", "mainSleep"
    ],
    units: { duration: "ms", minutesAsleep: "min", minutesAwake: "min", timeInBed: "min", efficiency: "%" },
    timestamp_semantics: LOCAL_WALL_NAIVE,
    missing_file: sleepFiles.length === 0,
    notes: "Shards overlap at boundaries. Records are deduplicated by logId; only mainSleep is normalized as nightly data."
  });
  addSourceSchema(state.sourceSchemas, {
    source_id: "fitbit_sleep_score",
    source_pattern: "Sleep Score/sleep_score.csv",
    files: (await pathExists(scorePath)) ? [sourceReference(state.rawRoot, scorePath)] : [],
    row_count: scoreResult.rowCount,
    date_range: dateRangeFromSet(scoreDates),
    columns: scoreResult.headers,
    units: { overall_score: "score", deep_sleep_in_minutes: "min", resting_heart_rate: "bpm", restlessness: "ratio" },
    timestamp_semantics: LOCAL_WALL_MISLABELED_UTC,
    missing_file: !(await pathExists(scorePath)),
    notes: "Joined to sleep JSON by sleep_log_entry_id/logId; nap scores are excluded from nightly metrics. Legacy rows with blank composition/duration and overall score repeated in revitalization are flagged as lacking a distinct revitalization subscore."
  });
}

function bodySourcePriority(source) {
  const text = String(source || "").toLowerCase();
  if (text.includes("fitindex")) return 0;
  if (text.includes("fitbit app")) return 1;
  if (text.includes("myfitnesspal")) return 2;
  return 3;
}

function markBodyRepresentatives(state) {
  const groups = new Map();
  for (const record of state.bodyCompositionRecords) {
    const key = `${record.metric_id}|${record.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  for (const [key, group] of groups) {
    const bestPriority = Math.min(...group.map((record) => bodySourcePriority(record.data_source)));
    const preferred = group.filter((record) => bodySourcePriority(record.data_source) === bestPriority);
    const center = median(preferred.map((record) => record.value));
    preferred.sort((left, right) => {
      const leftDistance = Math.abs(left.value - center);
      const rightDistance = Math.abs(right.value - center);
      return leftDistance - rightDistance || left.timestamp_raw.localeCompare(right.timestamp_raw) || left.record_id.localeCompare(right.record_id);
    });
    const representative = preferred[0];
    for (const record of group) {
      record.daily_measurement_count = group.length;
      record.is_daily_representative = record.record_id === representative.record_id;
      record.daily_representative_rule = "preferred direct source, then value nearest preferred-source daily median, then earliest timestamp";
    }
    if (group.length > 1) {
      if (key.startsWith("body_weight_kg|")) state.quality.body_composition.dates_with_multiple_weight_records += 1;
      if (key.startsWith("body_fat_pct|")) state.quality.body_composition.dates_with_multiple_body_fat_records += 1;
    }
  }
}

async function ingestBodyComposition(state) {
  const weightPath = path.join(state.physicalActivityRoot, "weight.csv");
  const bodyFatFiles = await matchingFiles(state.physicalActivityRoot, /^body_fat_\d{4}-\d{2}-\d{2}\.csv$/);
  const weightDates = new Set();
  const bodyFatDates = new Set();
  let weightResult = { rowCount: 0, headers: [] };

  if (await pathExists(weightPath)) {
    const relative = sourceReference(state.rawRoot, weightPath);
    weightResult = await readCsv(weightPath, (row, meta) => {
      const date = dateOnly(row.timestamp);
      const grams = toNumber(row["weight grams"]);
      if (!date) {
        state.quality.invalid_date_rows += 1;
        return;
      }
      if (!Number.isFinite(grams)) {
        state.quality.invalid_numeric_rows += 1;
        return;
      }
      weightDates.add(date);
      const kg = grams / 1000;
      state.bodyCompositionRecords.push({
        record_id: stableId("body_composition", "body_weight_kg", row.timestamp, grams, row["data source"], relative, meta.rowNumber),
        date,
        timestamp_raw: row.timestamp,
        timestamp_semantics: LOCAL_WALL_MISLABELED_UTC,
        metric_id: "body_weight_kg",
        value: round(kg, 4),
        unit: "kg",
        original_value: grams,
        original_unit: "g",
        weight_kg: round(kg, 4),
        weight_lb: round(kg * 2.2046226218, 3),
        body_fat_pct: null,
        data_source: nullableText(row["data source"]) || "Fitbit",
        source_file: relative,
        source_row: meta.rowNumber,
        source_references: [sourceReference(state.rawRoot, weightPath, meta.rowNumber)],
        daily_measurement_count: null,
        is_daily_representative: false,
        daily_representative_rule: null,
        missing_data_flag: false,
        analysis_date: state.analysisDate,
        methodology_version: state.methodologyVersion
      });
    });
    state.quality.source_file_count += 1;
    state.quality.source_rows.fitbit_weight = weightResult.rowCount;
  } else {
    state.quality.missing_source_files.push(sourceReference(state.rawRoot, weightPath));
  }

  let bodyFatRows = 0;
  let bodyFatHeaders = [];
  for (const filePath of bodyFatFiles) {
    const relative = sourceReference(state.rawRoot, filePath);
    const result = await readCsv(filePath, (row, meta) => {
      const date = dateOnly(row.timestamp);
      const value = toNumber(row["body fat percentage"]);
      if (!date) {
        state.quality.invalid_date_rows += 1;
        return;
      }
      if (!Number.isFinite(value)) {
        state.quality.invalid_numeric_rows += 1;
        return;
      }
      bodyFatDates.add(date);
      state.bodyCompositionRecords.push({
        record_id: stableId("body_composition", "body_fat_pct", row.timestamp, value, row["data source"], relative, meta.rowNumber),
        date,
        timestamp_raw: row.timestamp,
        timestamp_semantics: LOCAL_WALL_MISLABELED_UTC,
        metric_id: "body_fat_pct",
        value: round(value, 4),
        unit: "%",
        original_value: value,
        original_unit: "%",
        weight_kg: null,
        weight_lb: null,
        body_fat_pct: round(value, 4),
        data_source: nullableText(row["data source"]) || "Fitbit",
        source_file: relative,
        source_row: meta.rowNumber,
        source_references: [sourceReference(state.rawRoot, filePath, meta.rowNumber)],
        daily_measurement_count: null,
        is_daily_representative: false,
        daily_representative_rule: null,
        missing_data_flag: false,
        analysis_date: state.analysisDate,
        methodology_version: state.methodologyVersion
      });
    });
    bodyFatRows += result.rowCount;
    bodyFatHeaders = result.headers;
  }
  state.quality.source_file_count += bodyFatFiles.length;
  state.quality.source_rows.fitbit_body_fat = bodyFatRows;

  markBodyRepresentatives(state);
  state.quality.body_composition.total_records = state.bodyCompositionRecords.length;
  const representatives = state.bodyCompositionRecords.filter((record) => record.is_daily_representative);
  state.quality.body_composition.representative_records = representatives.length;
  for (const record of representatives) {
    emitMetric(state, {
      date: record.date,
      metric_id: record.metric_id,
      metric_category: "body_composition",
      value: record.value,
      unit: record.unit,
      source: record.data_source,
      source_timestamp: record.timestamp_raw,
      timestamp_semantics: record.timestamp_semantics,
      source_file: record.source_file,
      source_row: record.source_row,
      source_references: record.source_references,
      record_key: record.record_id,
      notes: record.daily_representative_rule
    });
    if (record.metric_id === "body_weight_kg") {
      emitMetric(state, {
        date: record.date,
        metric_id: "body_weight_lb",
        metric_category: "body_composition",
        value: record.weight_lb,
        unit: "lb",
        source: record.data_source,
        source_timestamp: record.timestamp_raw,
        timestamp_semantics: record.timestamp_semantics,
        source_file: record.source_file,
        source_row: record.source_row,
        source_references: record.source_references,
        record_key: record.record_id,
        derived: true,
        notes: "Converted from the representative kilogram record."
      });
    }
  }

  addSourceSchema(state.sourceSchemas, {
    source_id: "fitbit_weight",
    source_pattern: "Physical Activity_GoogleData/weight.csv",
    files: (await pathExists(weightPath)) ? [sourceReference(state.rawRoot, weightPath)] : [],
    row_count: weightResult.rowCount,
    date_range: dateRangeFromSet(weightDates),
    columns: weightResult.headers,
    units: { "weight grams": "g" },
    timestamp_semantics: LOCAL_WALL_MISLABELED_UTC,
    missing_file: !(await pathExists(weightPath)),
    notes: "All measurements are preserved; one deterministic representative is flagged per local date."
  });
  addSourceSchema(state.sourceSchemas, {
    source_id: "fitbit_body_fat",
    source_pattern: "Physical Activity_GoogleData/body_fat_YYYY-MM-DD.csv",
    files: bodyFatFiles.map((file) => sourceReference(state.rawRoot, file)),
    row_count: bodyFatRows,
    date_range: dateRangeFromSet(bodyFatDates),
    columns: bodyFatHeaders,
    units: { "body fat percentage": "%" },
    timestamp_semantics: LOCAL_WALL_MISLABELED_UTC,
    missing_file: bodyFatFiles.length === 0,
    notes: "Consumer-scale FITINDEX estimates, not InBody measurements; all readings are retained."
  });
}

async function aggregateMinuteSource(state, definition) {
  const files = await matchingFiles(state.physicalActivityRoot, definition.pattern);
  const aggregates = new Map();
  const dates = new Set();
  let rows = 0;
  let headers = [];
  let priorTimestamp = null;

  for (const filePath of files) {
    const relative = sourceReference(state.rawRoot, filePath);
    const result = await readCsv(filePath, (row) => {
      rows += 1;
      const rawTimestamp = row.timestamp;
      const date = dateOnly(rawTimestamp);
      if (!date) {
        state.quality.invalid_date_rows += 1;
        return;
      }
      if (rawTimestamp === priorTimestamp) state.quality.duplicate_rows.minute_timestamp_rows += 1;
      priorTimestamp = rawTimestamp;
      const value = toNumber(row[definition.value_column]);
      if (!Number.isFinite(value)) {
        state.quality.invalid_numeric_rows += 1;
        return;
      }
      dates.add(date);
      if (!aggregates.has(date)) aggregates.set(date, { total: 0, zones: new Map(), sources: new Set(), references: new Set() });
      const aggregate = aggregates.get(date);
      aggregate.total += value;
      aggregate.sources.add(nullableText(row["data source"]) || "Fitbit");
      aggregate.references.add(relative);
      if (definition.zone_column) {
        const zone = nullableText(row[definition.zone_column]);
        if (zone) aggregate.zones.set(zone, (aggregate.zones.get(zone) || 0) + value);
      }
    });
    headers = result.headers;
  }

  for (const [date, aggregate] of [...aggregates.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const source = [...aggregate.sources].sort().join(" + ");
    const references = [...aggregate.references].sort();
    emitMetric(state, {
      date,
      metric_id: definition.metric_id,
      metric_category: "activity",
      value: aggregate.total,
      digits: definition.digits,
      unit: definition.unit,
      source,
      timestamp_semantics: LOCAL_WALL_MISLABELED_UTC,
      source_file: references.length === 1 ? references[0] : null,
      source_references: references,
      record_key: `${definition.source_id}:${date}`,
      derived: true,
      notes: definition.notes
    });
    for (const [zone, value] of aggregate.zones) {
      emitMetric(state, {
        date,
        metric_id: `${definition.metric_id}_${slugify(zone)}`,
        metric_category: "activity",
        value,
        digits: definition.digits,
        unit: definition.unit,
        source,
        timestamp_semantics: LOCAL_WALL_MISLABELED_UTC,
        source_file: references.length === 1 ? references[0] : null,
        source_references: references,
        record_key: `${definition.source_id}:${date}:${zone}`,
        derived: true,
        notes: `Aggregated only for Fitbit zone ${zone}.`
      });
    }
  }

  state.quality.source_file_count += files.length;
  state.quality.source_rows[definition.source_id] = rows;
  addSourceSchema(state.sourceSchemas, {
    source_id: definition.source_id,
    source_pattern: definition.source_pattern,
    files: files.map((file) => sourceReference(state.rawRoot, file)),
    row_count: rows,
    date_range: dateRangeFromSet(dates),
    columns: headers,
    units: { [definition.value_column]: definition.unit },
    timestamp_semantics: LOCAL_WALL_MISLABELED_UTC,
    missing_file: files.length === 0,
    notes: definition.notes
  });
}

async function ingestMinuteActivity(state) {
  const sources = [
    {
      source_id: "fitbit_steps_minute",
      source_pattern: "Physical Activity_GoogleData/steps_YYYY-MM-DD.csv",
      pattern: /^steps_\d{4}-\d{2}-\d{2}\.csv$/,
      value_column: "steps",
      metric_id: "steps",
      unit: "steps",
      digits: 0,
      notes: "Daily sum of nonzero minute rows using the literal local-wall date; no UTC conversion is applied."
    },
    {
      source_id: "fitbit_calories_minute",
      source_pattern: "Physical Activity_GoogleData/calories_YYYY-MM-DD.csv",
      pattern: /^calories_\d{4}-\d{2}-\d{2}\.csv$/,
      value_column: "calories",
      metric_id: "calories_burned_kcal",
      unit: "kcal",
      digits: 2,
      notes: "Daily sum of minute energy values using the literal local-wall date; this is expenditure, not food intake."
    },
    {
      source_id: "fitbit_active_zone_minutes",
      source_pattern: "Physical Activity_GoogleData/active_zone_minutes_YYYY-MM-DD.csv",
      pattern: /^active_zone_minutes_\d{4}-\d{2}-\d{2}\.csv$/,
      value_column: "total minutes",
      zone_column: "heart rate zone",
      metric_id: "active_zone_minutes",
      unit: "Fitbit AZM",
      digits: 2,
      notes: "Daily total and per-zone sums. Same timestamps in different zones are legitimate separate rows."
    }
  ];
  for (const source of sources) await aggregateMinuteSource(state, source);
}

function normalizeActivitySession(state, session, relative, index) {
  const parsedStart = parseFitbitShortDate(session.startTime || session.originalStartTime);
  const date = parsedStart?.date || null;
  const logId = session.logId == null ? null : String(session.logId);
  const activeDurationMs = toNumber(session.activeDuration) ?? toNumber(session.duration);
  const durationMinutes = Number.isFinite(activeDurationMs) ? activeDurationMs / 60000 : null;
  const totalAzm = toNumber(session.activeZoneMinutes?.totalMinutes);
  return {
    activity_session_id: stableId("fitbit_activity", logId || `${relative}:${index}`),
    log_id: logId,
    date,
    start_local: parsedStart?.localDateTime || null,
    start_time_raw: nullableText(session.startTime),
    original_start_time_raw: nullableText(session.originalStartTime),
    timestamp_semantics: LOCAL_WALL_NAIVE,
    activity_name: nullableText(session.activityName),
    activity_type_id: session.activityTypeId == null ? null : String(session.activityTypeId),
    log_type: nullableText(session.logType),
    duration_minutes: asRoundedNumber(durationMinutes, 3),
    active_duration_minutes: asRoundedNumber(Number.isFinite(toNumber(session.activeDuration)) ? toNumber(session.activeDuration) / 60000 : null, 3),
    calories_kcal: asRoundedNumber(toNumber(session.calories), 3),
    steps: asRoundedNumber(toNumber(session.steps), 0),
    average_heart_rate_bpm: asRoundedNumber(toNumber(session.averageHeartRate), 3),
    active_zone_minutes: asRoundedNumber(totalAzm, 3),
    distance: asRoundedNumber(toNumber(session.distance), 4),
    distance_unit: nullableText(session.distanceUnit),
    has_gps: Boolean(session.hasGps),
    source: nullableText(session.source?.name || session.source) || "Fitbit",
    heart_rate_zones: Array.isArray(session.heartRateZones) ? session.heartRateZones : [],
    activity_levels: Array.isArray(session.activityLevel) ? session.activityLevel : [],
    source_file: relative,
    source_references: [`${relative}:json-index:${index}`],
    missing_data_flag: !date,
    analysis_date: state.analysisDate,
    methodology_version: state.methodologyVersion
  };
}

async function ingestActivitySessions(state) {
  const directory = path.join(state.googleHealthRoot, "Global Export Data");
  const files = await matchingFiles(directory, /^exercise-\d+\.json$/);
  const byLogId = new Map();
  const dates = new Set();
  let rows = 0;
  for (const filePath of files) {
    const relative = sourceReference(state.rawRoot, filePath);
    const parsed = JSON.parse(await fsp.readFile(filePath, "utf8"));
    if (!Array.isArray(parsed)) throw new Error(`Expected an array in ${filePath}`);
    rows += parsed.length;
    parsed.forEach((session, index) => {
      const key = session.logId == null ? `${relative}:${index}` : String(session.logId);
      if (byLogId.has(key)) {
        state.quality.duplicate_rows.activity_session_log_ids += 1;
        state.quality.activity.duplicate_sessions += 1;
        return;
      }
      const normalized = normalizeActivitySession(state, session, relative, index);
      byLogId.set(key, normalized);
      if (normalized.date) dates.add(normalized.date);
      else state.quality.invalid_date_rows += 1;
    });
  }
  state.activitySessions.push(...[...byLogId.values()].sort((a, b) => (a.start_local || "").localeCompare(b.start_local || "")));
  state.quality.activity.unique_sessions = state.activitySessions.length;
  state.quality.source_file_count += files.length;
  state.quality.source_rows.fitbit_activity_sessions = rows;

  const byDate = new Map();
  for (const session of state.activitySessions) {
    if (!session.date) continue;
    if (!byDate.has(session.date)) byDate.set(session.date, { sessions: 0, minutes: 0, calories: 0, steps: 0, azm: 0, refs: new Set(), names: new Set() });
    const day = byDate.get(session.date);
    day.sessions += 1;
    if (Number.isFinite(session.duration_minutes)) day.minutes += session.duration_minutes;
    if (Number.isFinite(session.calories_kcal)) day.calories += session.calories_kcal;
    if (Number.isFinite(session.steps)) day.steps += session.steps;
    if (Number.isFinite(session.active_zone_minutes)) day.azm += session.active_zone_minutes;
    session.source_references.forEach((reference) => day.refs.add(reference));
    if (session.activity_name) day.names.add(session.activity_name);
  }
  for (const [date, day] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const common = {
      date,
      metric_category: "activity",
      source: "Fitbit exercise sessions",
      timestamp_semantics: LOCAL_WALL_NAIVE,
      source_references: [...day.refs].sort(),
      record_key: `exercise:${date}`,
      derived: true,
      notes: `Activities: ${[...day.names].sort().join(", ")}`
    };
    emitMetric(state, { ...common, metric_id: "fitbit_exercise_session_count", value: day.sessions, unit: "sessions", digits: 0 });
    emitMetric(state, { ...common, metric_id: "fitbit_exercise_minutes", value: day.minutes, unit: "min", digits: 2 });
    emitMetric(state, { ...common, metric_id: "fitbit_exercise_calories_kcal", value: day.calories, unit: "kcal", digits: 2 });
    emitMetric(state, { ...common, metric_id: "fitbit_exercise_steps", value: day.steps, unit: "steps", digits: 0 });
    emitMetric(state, { ...common, metric_id: "fitbit_exercise_active_zone_minutes", value: day.azm, unit: "Fitbit AZM", digits: 2 });
  }

  addSourceSchema(state.sourceSchemas, {
    source_id: "fitbit_activity_sessions",
    source_pattern: "Global Export Data/exercise-{0,100,...}.json",
    files: files.map((file) => sourceReference(state.rawRoot, file)),
    row_count: rows,
    date_range: dateRangeFromSet(dates),
    columns: [
      "logId", "activityName", "activityTypeId", "activityLevel", "averageHeartRate", "calories", "duration", "activeDuration",
      "steps", "logType", "heartRateZones", "activeZoneMinutes", "startTime", "originalStartTime", "distance", "distanceUnit", "source"
    ],
    units: { duration: "ms", activeDuration: "ms", calories: "kcal", averageHeartRate: "bpm" },
    timestamp_semantics: LOCAL_WALL_NAIVE,
    missing_file: files.length === 0,
    notes: "Deduplicated by logId and aggregated to exercise minutes for prior-activity context."
  });
}

function addRollingBaselines(records, windows, minimumObservations) {
  const byMetric = new Map();
  for (const record of records) {
    for (const window of windows) {
      record[`rolling_${window}d_baseline`] = null;
      record[`rolling_${window}d_sample_size`] = 0;
      record[`rolling_${window}d_stddev`] = null;
      record[`rolling_${window}d_delta`] = null;
      record[`rolling_${window}d_pct_delta`] = null;
      record[`rolling_${window}d_z_score`] = null;
    }
    if (!byMetric.has(record.metric_id)) byMetric.set(record.metric_id, []);
    byMetric.get(record.metric_id).push(record);
  }

  for (const metricRecords of byMetric.values()) {
    metricRecords.sort((left, right) => left.date.localeCompare(right.date) || left.record_id.localeCompare(right.record_id));
    const prior = [];
    let index = 0;
    while (index < metricRecords.length) {
      const date = metricRecords[index].date;
      const currentDay = dayNumber(date);
      const sameDate = [];
      while (index < metricRecords.length && metricRecords[index].date === date) {
        sameDate.push(metricRecords[index]);
        index += 1;
      }
      for (const record of sameDate) {
        for (const window of windows) {
          const values = prior
            .filter((item) => item.day >= currentDay - window && item.day < currentDay && Number.isFinite(item.value))
            .map((item) => item.value);
          record[`rolling_${window}d_sample_size`] = values.length;
          if (values.length < minimumObservations) continue;
          const baseline = mean(values);
          const sd = standardDeviation(values);
          record[`rolling_${window}d_baseline`] = asRoundedNumber(baseline, 5);
          record[`rolling_${window}d_stddev`] = asRoundedNumber(sd, 5);
          if (!Number.isFinite(record.value) || !Number.isFinite(baseline)) continue;
          const delta = record.value - baseline;
          record[`rolling_${window}d_delta`] = asRoundedNumber(delta, 5);
          record[`rolling_${window}d_pct_delta`] = baseline !== 0 ? asRoundedNumber((delta / baseline) * 100, 5) : null;
          record[`rolling_${window}d_z_score`] = Number.isFinite(sd) && sd > 0 ? asRoundedNumber(delta / sd, 5) : null;
        }
      }
      for (const record of sameDate) {
        if (Number.isFinite(record.value)) prior.push({ day: currentDay, value: record.value });
      }
      const maximumWindow = Math.max(...windows);
      while (prior.length && prior[0].day < currentDay - maximumWindow) prior.shift();
    }
  }
}

function metricGapSummary(records) {
  const datesByMetric = new Map();
  for (const record of records) {
    if (!datesByMetric.has(record.metric_id)) datesByMetric.set(record.metric_id, new Set());
    datesByMetric.get(record.metric_id).add(record.date);
  }
  const result = {};
  for (const [metricId, dates] of datesByMetric) {
    const sorted = [...dates].sort();
    if (!sorted.length) continue;
    const start = dayNumber(sorted[0]);
    const end = dayNumber(sorted.at(-1));
    const expected = end - start + 1;
    const missingExamples = [];
    if (expected - dates.size > 0) {
      for (let day = start; day <= end && missingExamples.length < 10; day += 1) {
        const date = new Date(day * 86400000).toISOString().slice(0, 10);
        if (!dates.has(date)) missingExamples.push(date);
      }
    }
    result[metricId] = {
      start: sorted[0],
      end: sorted.at(-1),
      observed_dates: dates.size,
      gap_days: Math.max(0, expected - dates.size),
      gap_examples: missingExamples
    };
  }
  return result;
}

function buildDailyMap(records, windows) {
  const aliases = {
    hrv_rmssd_ms: "hrv_ms",
    resting_heart_rate_bpm: "resting_heart_rate_bpm",
    non_rem_heart_rate_bpm: "non_rem_heart_rate_bpm",
    sleeping_heart_rate_bpm: "sleeping_heart_rate_bpm",
    sleep_duration_minutes: "sleep_duration_minutes",
    time_in_bed_minutes: "time_in_bed_minutes",
    sleep_efficiency_pct: "sleep_efficiency_pct",
    deep_sleep_minutes: "deep_sleep_minutes",
    rem_sleep_minutes: "rem_sleep_minutes",
    sleep_score: "sleep_score",
    readiness_score: "readiness_score",
    respiratory_rate_breaths_per_minute: "respiratory_rate_breaths_per_minute",
    sleep_skin_temperature_c: "skin_temperature_c",
    spo2_average_pct: "spo2_pct",
    steps: "steps",
    calories_burned_kcal: "calories_burned_kcal",
    active_zone_minutes: "active_zone_minutes",
    fitbit_exercise_minutes: "exercise_minutes",
    body_weight_kg: "body_weight_kg",
    body_weight_lb: "body_weight_lb",
    body_fat_pct: "body_fat_pct"
  };
  const dailyMap = new Map();
  for (const record of [...records].sort((a, b) => a.date.localeCompare(b.date) || a.metric_id.localeCompare(b.metric_id))) {
    if (!dailyMap.has(record.date)) {
      dailyMap.set(record.date, {
        date: record.date,
        metrics: {},
        record_ids: [],
        source_references: [],
        prior_day: addDays(record.date, -1),
        next_day: addDays(record.date, 1)
      });
    }
    const day = dailyMap.get(record.date);
    const rolling = {};
    for (const window of windows) {
      rolling[`${window}d`] = {
        baseline: record[`rolling_${window}d_baseline`],
        sample_size: record[`rolling_${window}d_sample_size`],
        stddev: record[`rolling_${window}d_stddev`],
        delta: record[`rolling_${window}d_delta`],
        pct_delta: record[`rolling_${window}d_pct_delta`],
        z_score: record[`rolling_${window}d_z_score`]
      };
    }
    day.metrics[record.metric_id] = {
      record_id: record.record_id,
      value: record.value,
      value_text: record.value_text,
      unit: record.unit,
      missing_data_flag: record.missing_data_flag,
      rolling
    };
    day.record_ids.push(record.record_id);
    day.source_references.push(...record.source_references);
    if (aliases[record.metric_id]) day[aliases[record.metric_id]] = record.value ?? record.value_text;
  }
  for (const day of dailyMap.values()) day.source_references = [...new Set(day.source_references)].sort();
  return dailyMap;
}

async function normalizeFitbit({ rawRoot, config = {}, analysisDate = null, methodologyVersion = null }) {
  if (!rawRoot) throw new Error("normalizeFitbit requires rawRoot");
  const resolvedRawRoot = path.resolve(rawRoot);
  const googleHealthRoot = await resolveGoogleHealthRoot(resolvedRawRoot);
  const normalizedAnalysisDate = normalizeAnalysisDate(analysisDate);
  const normalizedMethodologyVersion = String(methodologyVersion || config.methodology_version || "1.0.0");
  const windows = [...new Set((config.rolling_baseline_days || [14, 28, 42]).map(Number).filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
  const minimumObservations = Number.isFinite(Number(config.rolling_baseline_min_observations))
    ? Number(config.rolling_baseline_min_observations)
    : 7;
  const state = {
    rawRoot: resolvedRawRoot,
    googleHealthRoot,
    physicalActivityRoot: path.join(googleHealthRoot, "Physical Activity_GoogleData"),
    analysisDate: normalizedAnalysisDate,
    methodologyVersion: normalizedMethodologyVersion,
    records: [],
    bodyCompositionRecords: [],
    activitySessions: [],
    sourceSchemas: [],
    quality: createQuality(normalizedAnalysisDate, normalizedMethodologyVersion, resolvedRawRoot, googleHealthRoot)
  };

  await ingestCompactDailySources(state);
  await ingestSleep(state);
  await ingestBodyComposition(state);
  await ingestMinuteActivity(state);
  await ingestActivitySessions(state);

  addRollingBaselines(state.records, windows, minimumObservations);
  state.records.sort((left, right) => left.date.localeCompare(right.date) || left.metric_id.localeCompare(right.metric_id) || left.record_id.localeCompare(right.record_id));
  state.bodyCompositionRecords.sort((left, right) => left.date.localeCompare(right.date) || left.timestamp_raw.localeCompare(right.timestamp_raw) || left.metric_id.localeCompare(right.metric_id));
  state.quality.metric_date_gaps = metricGapSummary(state.records);
  const dailyMap = buildDailyMap(state.records, windows);

  return {
    records: state.records,
    dailyMap,
    bodyCompositionRecords: state.bodyCompositionRecords,
    activitySessions: state.activitySessions,
    quality: state.quality,
    sourceSchemas: state.sourceSchemas
  };
}

module.exports = { normalizeFitbit };
