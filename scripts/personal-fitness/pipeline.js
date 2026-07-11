"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { loadPersonalFitnessConfig } = require("./config");
const { buildCompleteExerciseCatalog } = require("./exercise-mapping");
const { buildSourceInventory } = require("./inventory");
const { normalizeFitbit } = require("./normalize-fitbit");
const { normalizeNutrition } = require("./normalize-nutrition");
const { normalizeWorkouts } = require("./normalize-workouts");
const {
  buildExerciseSessionMetrics,
  buildPeriodComparisons,
  buildWorkoutRecoveryLinks,
  detectProgramPhases
} = require("./analysis-core");
const { buildMuscleScoresAndRankings, scoreExercises } = require("./scoring");
const { buildPrescriptions, buildRecoveryRules, buildSweetSpots } = require("./recommendations");
const { generateHumanReport } = require("./report");
const { buildMuscleGroupSweetSpots, buildVolumeResponseSummary, buildWeeklyMuscleVolumeResponse } = require("./volume-analysis");
const {
  dateRange,
  groupBy,
  readCsv,
  round,
  sortedUnique,
  stableId,
  toNumber,
  writeCsvAtomic,
  writeFileAtomic,
  writeJsonAtomic
} = require("./utils");

function sourceReference(sourceId, sourcePath, notes = null) {
  return { source_id: sourceId, source_path: sourcePath, worksheet: null, source_record_id: null, source_row: null, source_date: null, notes };
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function normalizeConfidenceLabel(label) {
  if (/^high/i.test(label || "")) return "high";
  if (/^moderate/i.test(label || "")) return "moderate";
  if (/^low/i.test(label || "")) return "low";
  return "insufficient_personal_evidence";
}

function rowsSourceRange(rows, fallback) {
  const dates = [];
  for (const row of rows || []) {
    for (const key of ["source_date_start", "source_date_end", "date", "workout_date", "start_date", "end_date", "week_start", "week_end"]) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(row?.[key] || ""))) dates.push(row[key]);
    }
    for (const key of ["start_date", "end_date", "start", "end"]) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(row?.source_date_range?.[key] || ""))) dates.push(row.source_date_range[key]);
    }
  }
  dates.sort();
  return { start: dates[0] || fallback.start, end: dates.at(-1) || fallback.end };
}

function enrichWorkoutRecords(records, analysisDate, methodologyVersion) {
  return records.map((record) => ({
    ...record,
    source_date_start: record.workout_date,
    source_date_end: record.workout_date,
    sample_size: 1,
    confidence_level: record.missing_data_flags.includes("exercise_alias_unmapped") ? "Low confidence" : Number.isFinite(record.rpe) ? "Moderate confidence" : "Low confidence",
    missing_data_flags: Array.isArray(record.missing_data_flags) ? record.missing_data_flags.join(";") : String(record.missing_data_flags || ""),
    source_references: Array.isArray(record.source_references) ? record.source_references.join(";") : String(record.source_references || ""),
    notes: record.notes || "Normalized from the active Strong export; completion is inferred from presence in the export.",
    analysis_date: analysisDate,
    methodology_version: methodologyVersion
  }));
}

function enrichFitbitRecords(records, analysisDate, methodologyVersion) {
  return records.map((record) => ({
    ...record,
    source_date_start: record.date,
    source_date_end: record.date,
    sample_size: 1,
    confidence_level: record.missing_data_flag ? "Low confidence" : "Moderate confidence",
    missing_data_flags: record.missing_data_flag ? String(record.missing_reason || "metric_missing").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") : "",
    source_references: Array.isArray(record.source_references) ? record.source_references.join(";") : String(record.source_references || ""),
    notes: record.notes || "Daily Fitbit metric; rolling baselines exclude the current date.",
    analysis_date: analysisDate,
    methodology_version: methodologyVersion
  }));
}

function enrichNutritionRecords(records, config, analysisDate, methodologyVersion) {
  return records.map((record) => {
    const period = record.period_id ? (config.periods || []).find((item) => item.period_id === record.period_id) : null;
    return {
      ...record,
      source_date_start: period?.start || record.date,
      source_date_end: period?.end || record.date,
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: Number.isFinite(record.sample_size) ? record.sample_size : 1,
      confidence_level: record.confidence_level || "Low confidence",
      missing_data_flags: Array.isArray(record.missing_data_flags) ? record.missing_data_flags.join(";") : String(record.missing_data_flags || ""),
      source_references: Array.isArray(record.source_references) ? record.source_references.join(";") : String(record.source_references || ""),
      notes: record.notes || "Nutrition source record; meal timing is not inferred when unavailable."
    };
  });
}

function enrichInventoryRecords(records, analysisDate, methodologyVersion) {
  return records.map((record) => ({
    ...record,
    source_date_start: null,
    source_date_end: null,
    analysis_date: analysisDate,
    methodology_version: methodologyVersion,
    sample_size: 1,
    confidence_level: "High confidence",
    missing_data_flags: record.sha256 ? "" : "checksum_not_computed_non_ingested_file",
    source_references: record.relative_path,
    notes: record.notes || "Preserved raw source file."
  }));
}

async function augmentBodyComposition({ fitbitRecords, rawRoot, personalContext, analysisDate, methodologyVersion }) {
  const records = fitbitRecords.map((record) => ({
    ...record,
    body_composition_record_id: record.record_id,
    measurement_method: /FITINDEX/i.test(record.data_source) ? "FITINDEX_consumer_scale" : /MyFitnessPal/i.test(record.data_source) ? "logged_weight" : "Fitbit_or_connected_source",
    source_date_start: record.date,
    source_date_end: record.date,
    sample_size: 1,
    confidence_level: "Moderate confidence",
    missing_data_flags: record.missing_data_flag ? "source_value_missing" : "",
    source_references: Array.isArray(record.source_references) ? record.source_references.join(";") : String(record.source_references || ""),
    notes: record.daily_representative_rule || "All source readings are retained; consumer-scale body-fat estimates are not InBody measurements.",
    analysis_date: analysisDate,
    methodology_version: methodologyVersion
  }));
  const heightPath = path.join(rawRoot, "Takeout", "Google Health", "Physical Activity_GoogleData", "height.csv");
  try {
    await readCsv(heightPath, (row, meta) => {
      const date = String(row.timestamp || "").slice(0, 10);
      const millimeters = toNumber(row["height millimeters"]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(millimeters)) return;
      records.push({
        record_id: stableId("body_composition", "height", row.timestamp, millimeters, meta.rowNumber),
        body_composition_record_id: stableId("body_composition", "height", row.timestamp, millimeters, meta.rowNumber),
        date,
        timestamp_raw: row.timestamp,
        timestamp_semantics: "local_wall_time_mislabeled_utc",
        metric_id: "height_cm",
        value: round(millimeters / 10, 2),
        unit: "cm",
        original_value: millimeters,
        original_unit: "mm",
        weight_kg: null,
        weight_lb: null,
        body_fat_pct: null,
        data_source: row["data source"] || "Fitbit App",
        source_file: "Takeout/Google Health/Physical Activity_GoogleData/height.csv",
        source_row: meta.rowNumber,
        daily_measurement_count: null,
        is_daily_representative: true,
        daily_representative_rule: "Profile-height history retained; repeated unchanged rows are separate dated source records.",
        missing_data_flag: false,
        measurement_method: "Fitbit_profile",
        source_date_start: date,
        source_date_end: date,
        analysis_date: analysisDate,
        methodology_version: methodologyVersion,
        sample_size: 1,
        confidence_level: "Moderate confidence",
        missing_data_flags: "",
        source_references: `Takeout/Google Health/Physical Activity_GoogleData/height.csv#row=${meta.rowNumber}`,
        notes: "File reports 167.6 cm; user context reports approximately 66.5 inches (168.91 cm). Both are preserved."
      });
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const reference of personalContext.body_composition_reference_points || []) {
    const recordId = stableId("body_composition_context", reference.date, reference.metric, reference.value, reference.measurement_method);
    records.push({
      record_id: recordId,
      body_composition_record_id: recordId,
      date: reference.date,
      timestamp_raw: null,
      timestamp_semantics: "user_provided_dated_reference",
      metric_id: reference.metric,
      value: reference.value,
      unit: reference.unit,
      original_value: reference.value,
      original_unit: reference.unit,
      weight_kg: null,
      weight_lb: null,
      body_fat_pct: reference.metric === "body_fat_percentage" ? reference.value : null,
      data_source: "user_provided_context",
      source_file: "config/personal_context.json",
      source_row: null,
      daily_measurement_count: 1,
      is_daily_representative: true,
      daily_representative_rule: "User-provided dated InBody reference retained independently from FITINDEX records.",
      missing_data_flag: false,
      measurement_method: reference.measurement_method,
      source_date_start: reference.date,
      source_date_end: reference.date,
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: 1,
      confidence_level: reference.confirmation === "user_confirmed" ? "High confidence" : "Moderate confidence",
      missing_data_flags: "raw_scan_file;scan_conditions",
      source_references: "config/personal_context.json",
      notes: "No raw InBody file is present. Hydration, glycogen, sodium, meal timing, creatine consistency, and scan conditions remain unmeasured confounders."
    });
  }
  const contextHeightId = stableId("body_composition_context", "height", personalContext.profile.height_inches_approx);
  records.push({
    record_id: contextHeightId,
    body_composition_record_id: contextHeightId,
    date: personalContext.provided_on,
    timestamp_raw: null,
    timestamp_semantics: "user_provided_approximate_profile",
    metric_id: "height_cm_approx_context",
    value: round(personalContext.profile.height_inches_approx * 2.54, 2),
    unit: "cm",
    original_value: personalContext.profile.height_inches_approx,
    original_unit: "in",
    weight_kg: null,
    weight_lb: null,
    body_fat_pct: null,
    data_source: "user_provided_context",
    source_file: "config/personal_context.json",
    source_row: null,
    daily_measurement_count: 1,
    is_daily_representative: false,
    daily_representative_rule: null,
    missing_data_flag: false,
    measurement_method: "approximate_profile",
    source_date_start: personalContext.provided_on,
    source_date_end: personalContext.provided_on,
    analysis_date: analysisDate,
    methodology_version: methodologyVersion,
    sample_size: 1,
    confidence_level: "Low confidence",
    missing_data_flags: "approximate_height",
    source_references: "config/personal_context.json",
    notes: "Approximate 66.5-inch context value differs from the Fitbit profile record of 167.6 cm; neither is overwritten."
  });
  records.sort((left, right) => String(left.date).localeCompare(String(right.date)) || String(left.metric_id).localeCompare(String(right.metric_id)));
  return records;
}

function snapshotCatalog(catalog, exerciseSessionMetrics, analysisDate, methodologyVersion) {
  const metricsByExercise = groupBy(exerciseSessionMetrics, "exercise_id");
  const aliases = catalog.aliases.map((alias) => {
    const metrics = metricsByExercise.get(alias.exercise_id) || [];
    const range = dateRange(metrics, "workout_date");
    return {
      exercise_alias_id: stableId("exercise_alias", alias.exercise_id, alias.recorded_name),
      ...alias,
      source_date_start: range.start,
      source_date_end: range.end,
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: metrics.length,
      confidence_level: alias.mapping_source === "explicit_config" ? "Moderate confidence" : "Low confidence",
      missing_data_flags: alias.mapping_source === "fallback_rule" ? "mapping_rule_review" : "",
      source_references: "raw/strong_workouts (8).csv;config/exercise_aliases.csv;config/exercise_mapping_rules.json",
      notes: alias.notes || "Distinct recorded variation; no cross-machine load comparisons."
    };
  });
  const muscles = catalog.muscles.map((mapping) => {
    const metrics = metricsByExercise.get(mapping.exercise_id) || [];
    const range = dateRange(metrics, "workout_date");
    return {
      exercise_muscle_map_id: stableId("exercise_muscle_map", mapping.exercise_id, mapping.muscle_group),
      ...mapping,
      source_date_start: range.start,
      source_date_end: range.end,
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: metrics.length,
      confidence_level: mapping.mapping_source === "explicit_config" ? "Moderate confidence" : "Low confidence",
      missing_data_flags: mapping.mapping_source === "fallback_rule" ? "mapping_rule_review" : "",
      source_references: "config/exercise_muscle_map.csv;config/exercise_mapping_rules.json",
      notes: mapping.substitution_notes || "Mechanical role is configurable and does not prove muscle-specific hypertrophy."
    };
  });
  return { aliases, muscles };
}

async function outputEntry({ dataRoot, tableName, relativePath, format, rows, stableIds, sourceRange, analysisDate, methodologyVersion, schemaPath = null, notes = [] }) {
  const absolutePath = path.join(dataRoot, relativePath);
  const outputSourceRange = rowsSourceRange(rows, sourceRange);
  return {
    output_id: stableId("output", tableName, methodologyVersion),
    table_name: tableName,
    relative_path: relativePath.replace(/\\/g, "/"),
    format,
    schema_path: schemaPath,
    row_count: rows.length,
    sample_size: rows.length,
    stable_identifier_columns: stableIds,
    columns: rows.length ? Object.keys(rows[0]).filter((key) => /^[a-z][a-z0-9_]*$/.test(key)) : stableIds,
    checksum_sha256: await sha256File(absolutePath),
    source_date_range: { start_date: outputSourceRange.start, end_date: outputSourceRange.end },
    analysis_date: analysisDate,
    methodology_version: methodologyVersion,
    confidence_level: "moderate",
    missing_data_flags: ["some_source_fields_missing"],
    source_references: [sourceReference("personal_fitness_sources", "reports/source_file_inventory.csv", "Full raw-file provenance inventory")],
    notes
  };
}

async function runPipeline({ repositoryRoot = process.cwd(), analysisDate = new Date().toISOString().slice(0, 10) } = {}) {
  const loaded = await loadPersonalFitnessConfig(repositoryRoot);
  const config = loaded.analysisConfig;
  const personalContext = loaded.personalContext;
  const methodologyVersion = config.methodology_version;
  const generatedAt = new Date().toISOString();
  await Promise.all([loaded.normalizedRoot, loaded.derivedRoot, loaded.reportsRoot].map((directory) => fsp.mkdir(directory, { recursive: true })));

  const inventory = await buildSourceInventory(loaded.rawRoot);
  const workout = await normalizeWorkouts({ rawRoot: loaded.rawRoot, config: { ...config, exercise_mapping_rules_document: loaded.mappingRules }, aliases: loaded.aliases, muscleMap: loaded.muscleMap, analysisDate, methodologyVersion });
  const recordedNames = sortedUnique(workout.records.map((record) => record.exercise_name_recorded));
  const catalog = buildCompleteExerciseCatalog(recordedNames, loaded.aliases, loaded.muscleMap, loaded.mappingRules);
  if (catalog.mappingAudit.some((item) => item.review_required)) throw new Error(`Exercise mapping incomplete: ${catalog.mappingAudit.filter((item) => item.review_required).map((item) => item.recorded_name).join(", ")}`);
  const [fitbit, nutrition] = await Promise.all([
    normalizeFitbit({ rawRoot: loaded.rawRoot, config, analysisDate, methodologyVersion }),
    normalizeNutrition({ rawRoot: loaded.rawRoot, config, personalContext, analysisDate, methodologyVersion })
  ]);

  const bodyComposition = await augmentBodyComposition({ fitbitRecords: fitbit.bodyCompositionRecords, rawRoot: loaded.rawRoot, personalContext, analysisDate, methodologyVersion });
  const workoutRecords = enrichWorkoutRecords(workout.records, analysisDate, methodologyVersion);
  const fitbitRecords = enrichFitbitRecords(fitbit.records, analysisDate, methodologyVersion);
  const nutritionRecords = enrichNutritionRecords(nutrition.records, config, analysisDate, methodologyVersion);
  const inventoryRecords = enrichInventoryRecords(inventory.rows, analysisDate, methodologyVersion);
  const recoveryLinks = buildWorkoutRecoveryLinks({ sessions: workout.sessions, dailyMap: fitbit.dailyMap, nutritionDailyMap: nutrition.dailyMap, config, personalContext, analysisDate, methodologyVersion });
  const exerciseSessionMetrics = buildExerciseSessionMetrics({ workoutRecords: workout.records, recoveryLinks, aliases: catalog.aliases, muscleMap: catalog.muscles, config, analysisDate, methodologyVersion });
  const exerciseScores = scoreExercises({ exerciseSessionMetrics, workoutRecords: workout.records, aliases: catalog.aliases, config, analysisDate, methodologyVersion });
  const muscleOutputs = buildMuscleScoresAndRankings({ exerciseScores, exerciseSessionMetrics, aliases: catalog.aliases, muscleMap: catalog.muscles, analysisDate, methodologyVersion, config });
  const weeklyMuscleVolumeResponse = buildWeeklyMuscleVolumeResponse({ exerciseSessionMetrics, muscleMap: catalog.muscles, dailyMap: fitbit.dailyMap, nutritionDailyMap: nutrition.dailyMap, analysisDate, methodologyVersion });
  const volumeResponseSummary = buildVolumeResponseSummary(weeklyMuscleVolumeResponse, analysisDate, methodologyVersion);
  const muscleGroupSweetSpots = buildMuscleGroupSweetSpots({ weeklyRows: weeklyMuscleVolumeResponse, muscleGroupRankings: muscleOutputs.muscleGroupRankings, analysisDate, methodologyVersion });
  const sweetSpots = buildSweetSpots({ exerciseSessionMetrics, exerciseScores, aliases: catalog.aliases, config, analysisDate, methodologyVersion });
  const prescriptions = buildPrescriptions({ exerciseScores, exerciseSessionMetrics, sweetSpots, aliases: catalog.aliases, muscleMap: catalog.muscles, muscleGroupRankings: muscleOutputs.muscleGroupRankings, personalContext, analysisDate, methodologyVersion });
  const recoveryRules = buildRecoveryRules({ exerciseSessionMetrics, analysisDate, methodologyVersion });
  const programPhases = detectProgramPhases({ sessions: workout.sessions, exerciseSessionMetrics, analysisDate, methodologyVersion });
  const periodComparisons = buildPeriodComparisons({ config, personalContext, dailyMap: fitbit.dailyMap, nutritionPrimaryDaily: nutrition.primaryDaily, sessions: workout.sessions, exerciseSessionMetrics, bodyCompositionRecords: bodyComposition, programPhases, analysisDate, methodologyVersion });
  const catalogSnapshot = snapshotCatalog(catalog, exerciseSessionMetrics, analysisDate, methodologyVersion);
  exerciseSessionMetrics.forEach((metric) => {
    const score = exerciseScores.find((item) => item.exercise_id === metric.exercise_id);
    metric.confidence_level = score?.confidence_level || "Insufficient personal evidence";
  });

  const allSourceSchemas = [...workout.sourceSchemas, ...fitbit.sourceSchemas, ...nutrition.sourceSchemas];
  const globalSourceDates = [
    workout.quality.source_date_range.start,
    workout.quality.source_date_range.end,
    ...fitbitRecords.flatMap((record) => [record.source_date_start, record.source_date_end]),
    ...nutritionRecords.flatMap((record) => [record.source_date_start, record.source_date_end]),
    ...bodyComposition.flatMap((record) => [record.source_date_start, record.source_date_end]),
    personalContext.provided_on
  ].filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))).sort();
  const sourceRange = {
    start: globalSourceDates[0] || workout.quality.source_date_range.start,
    end: globalSourceDates.at(-1) || workout.quality.source_date_range.end
  };
  const dataQualityReport = {
    data_quality_report_id: stableId("data_quality_report", methodologyVersion, analysisDate),
    analysis_date: analysisDate,
    methodology_version: methodologyVersion,
    source_date_range: { start_date: sourceRange.start, end_date: sourceRange.end },
    sample_size: inventory.summary.file_count,
    confidence_level: "moderate",
    missing_data_flags: ["raw_inbody_scan", "direct_longitudinal_muscle_measurements", "trustworthy_2026_calorie_log", "trustworthy_meal_timestamps", "pain_notes"],
    source_references: [sourceReference("raw_inventory", "reports/source_file_inventory.csv"), sourceReference("active_strong_export", "raw/strong_workouts (8).csv")],
    notes: ["Raw inputs are preserved; the prior partial Strong export is archived and excluded from ingestion.", "No workbook or worksheet was present."],
    raw_inventory_summary: inventory.summary,
    workout_quality: workout.quality,
    fitbit_quality: fitbit.quality,
    nutrition_quality: nutrition.quality,
    volume_response_summary: volumeResponseSummary,
    exercise_mapping_quality: {
      recorded_exercises: catalog.mappingAudit.length,
      explicit_mappings: catalog.mappingAudit.filter((item) => item.mapping_source === "explicit_config").length,
      rule_inferred_mappings: catalog.mappingAudit.filter((item) => item.mapping_source === "fallback_rule").length,
      unmapped_exercises: catalog.mappingAudit.filter((item) => item.review_required).length,
      mapping_audit: catalog.mappingAudit
    },
    source_schema_inventory: allSourceSchemas,
    known_discrepancies: [
      { topic: "body_fat_2025_10_02", values: [{ source: "FITINDEX", value_pct: 16.8 }, { source: "user_confirmed_InBody", value_pct: 20.5 }], resolution: "Preserve both; InBody is the confirmed reference and FITINDEX remains a separate consumer-scale series." },
      { topic: "height", values: [{ source: "Fitbit profile", value_cm: 167.6 }, { source: "user_context_approx", value_cm: round(personalContext.profile.height_inches_approx * 2.54, 2) }], resolution: "Preserve both; profile dated records are primary source while context is approximate." },
      { topic: "2026_calories", values: personalContext.nutrition_period_context, resolution: "Treat as user-reported targets because no measured 2026 calorie series exists." },
      { topic: "updated_strong_export", values: [{ active_rows: workout.quality.raw_row_count, active_range: workout.quality.source_date_range }, { archived_prior_path: "raw/archive/strong_workouts_partial_2026-03-02_to_2026-07-04.csv" }], resolution: "Only the active root export is analyzed." }
    ]
  };

  const csvOutputs = [
    ["normalized_workouts", "normalized/normalized_workouts.csv", workoutRecords, "record_id"],
    ["normalized_fitbit", "normalized/normalized_fitbit.csv", fitbitRecords, "record_id"],
    ["normalized_nutrition", "normalized/normalized_nutrition.csv", nutritionRecords, "nutrition_id"],
    ["normalized_body_composition", "normalized/normalized_body_composition.csv", bodyComposition, "body_composition_record_id"],
    ["exercise_aliases", "normalized/exercise_aliases.csv", catalogSnapshot.aliases, "exercise_alias_id"],
    ["exercise_muscle_map", "normalized/exercise_muscle_map.csv", catalogSnapshot.muscles, "exercise_muscle_map_id"],
    ["workout_recovery_links", "derived/workout_recovery_links.csv", recoveryLinks, "link_id"],
    ["exercise_session_metrics", "derived/exercise_session_metrics.csv", exerciseSessionMetrics, "exercise_session_id"],
    ["exercise_scores", "derived/exercise_scores.csv", exerciseScores, "exercise_score_id"],
    ["exercise_muscle_scores", "derived/exercise_muscle_scores.csv", muscleOutputs.exerciseMuscleScores, "exercise_muscle_score_id"],
    ["muscle_group_rankings", "derived/muscle_group_rankings.csv", muscleOutputs.muscleGroupRankings, "ranking_id"],
    ["period_comparisons", "derived/period_comparisons.csv", periodComparisons, "period_comparison_id"],
    ["program_phases", "derived/program_phases.csv", programPhases, "program_phase_id"],
    ["weekly_muscle_volume_response", "derived/weekly_muscle_volume_response.csv", weeklyMuscleVolumeResponse, "weekly_muscle_response_id"],
    ["source_file_inventory", "reports/source_file_inventory.csv", inventoryRecords, "source_file_id"]
  ];
  for (const [, relativePath, rows] of csvOutputs) await writeCsvAtomic(path.join(loaded.dataRoot, relativePath), rows);
  await writeJsonAtomic(path.join(loaded.derivedRoot, "exercise_sweet_spots.json"), sweetSpots);
  await writeJsonAtomic(path.join(loaded.derivedRoot, "exercise_prescriptions.json"), prescriptions);
  await writeJsonAtomic(path.join(loaded.derivedRoot, "recovery_rules.json"), recoveryRules);
  await writeJsonAtomic(path.join(loaded.derivedRoot, "period_comparisons.json"), periodComparisons);
  await writeJsonAtomic(path.join(loaded.derivedRoot, "muscle_group_sweet_spots.json"), muscleGroupSweetSpots);
  await writeJsonAtomic(path.join(loaded.derivedRoot, "volume_response_summary.json"), volumeResponseSummary);
  await writeJsonAtomic(path.join(loaded.reportsRoot, "data_quality_report.json"), dataQualityReport);
  await writeJsonAtomic(path.join(loaded.reportsRoot, "source_schema_inventory.json"), allSourceSchemas);

  const analysisId = stableId("analysis", methodologyVersion, analysisDate, sourceRange.start, sourceRange.end);
  const tableCounts = Object.fromEntries([
    ...csvOutputs.map(([name, , rows]) => [name, rows.length]),
    ["exercise_sweet_spots", sweetSpots.length],
    ["exercise_prescriptions", prescriptions.length],
    ["recovery_rules", recoveryRules.length],
    ["period_comparisons_json", periodComparisons.length],
    ["muscle_group_sweet_spots", muscleGroupSweetSpots.length],
    ["volume_response_summary", 1]
  ]);
  const analysisMetadata = {
    analysis_id: analysisId,
    database_name: "Personal hypertrophy and recovery database",
    analysis_date: analysisDate,
    generated_at: generatedAt,
    methodology_version: methodologyVersion,
    pipeline_version: methodologyVersion,
    research_database_version: "1.0.0",
    source_date_range: { start_date: sourceRange.start, end_date: sourceRange.end },
    sample_size: workoutRecords.length + fitbitRecords.length + nutrition.records.length + bodyComposition.length,
    confidence_level: "moderate",
    confidence_score: round(exerciseScores.reduce((total, score) => total + score.data_confidence_score, 0) / Math.max(1, exerciseScores.length), 2),
    missing_data_flags: ["direct_longitudinal_muscle_measurements", "observed_2026_calories", "trustworthy_meal_timestamps", "complete_rpe_history", "pain_notes"],
    source_references: [sourceReference("active_strong_export", "raw/strong_workouts (8).csv"), sourceReference("fitbit_google_health_export", "raw/Takeout/Google Health"), sourceReference("apple_health_nutrition_export", "raw/meals")],
    notes: ["Raw source files are preserved and generated outputs are atomically replaced on rerun.", "Personal estimates remain separate from research defaults; crosswalk fields are nullable.", "The updated full Strong export supplied on 2026-07-11 replaced the active partial export; the partial export remains archived."],
    analysis_scope: ["male_hypertrophy", "body_recomposition", "dieting_performance", "recovery", "progression", "sustainable_volume"],
    config_paths: ["config/analysis.config.json", "config/personal_context.json", "config/exercise_aliases.csv", "config/exercise_muscle_map.csv", "config/exercise_mapping_rules.json"],
    input_manifest_path: "reports/source_file_inventory.csv",
    output_manifest_path: "reports/output_manifest.json",
    table_record_counts: tableCounts,
    data_quality_summary: { workout: workout.quality.smoke_check, fitbit_missing_sources: fitbit.quality.missing_source_files.length, nutrition: nutrition.quality, mapped_exercises: catalog.mappingAudit.length, wholly_unmapped_exercises: 0 },
    personal_research_weighting_policy: { personal_confidence_source: "data_confidence_score_divided_by_100", personal_weight_increases_with: ["sample_size", "observation_span", "RPE_completeness", "recovery_completeness", "nutrition_completeness", "variation_consistency"], current_personal_weight: 1, current_research_weight: 0, future_research_weight_policy: "assign_nonzero_research_weight_only_when_a_research_estimate_and_confidence_are_integrated", current_research_integration_status: "schema_ready_not_blended" }
  };
  await writeJsonAtomic(path.join(loaded.reportsRoot, "analysis_metadata.json"), analysisMetadata);

  const report = generateHumanReport({
    analysisDate,
    methodologyVersion,
    inventory,
    workoutQuality: workout.quality,
    fitbitQuality: fitbit.quality,
    nutritionQuality: nutrition.quality,
    sourceSchemas: allSourceSchemas,
    exerciseScores,
    exerciseSessionMetrics,
    muscleGroupRankings: muscleOutputs.muscleGroupRankings,
    sweetSpots,
    prescriptions,
    recoveryRules,
    periodComparisons,
    programPhases,
    weeklyMuscleVolumeResponse,
    volumeResponseSummary,
    muscleGroupSweetSpots,
    bodyCompositionRecords: bodyComposition,
    personalContext
  });
  await writeFileAtomic(path.join(loaded.reportsRoot, "PERSONAL_HYPERTROPHY_AND_RECOVERY_REPORT.md"), report);

  const outputEntries = [];
  for (const [tableName, relativePath, rows, stableIdColumn] of csvOutputs) {
    outputEntries.push(await outputEntry({ dataRoot: loaded.dataRoot, tableName, relativePath, format: "csv", rows, stableIds: [stableIdColumn], sourceRange, analysisDate, methodologyVersion, notes: ["CSV fields containing arrays or objects are JSON-encoded."] }));
  }
  for (const [tableName, relativePath, rows, stableIdColumn, schemaPath] of [
    ["exercise_sweet_spots", "derived/exercise_sweet_spots.json", sweetSpots, "sweet_spot_id", null],
    ["exercise_prescriptions", "derived/exercise_prescriptions.json", prescriptions, "prescription_id", "schemas/exercise_prescriptions.schema.json"],
    ["recovery_rules", "derived/recovery_rules.json", recoveryRules, "rule_id", "schemas/recovery_rules.schema.json"],
    ["period_comparisons_json", "derived/period_comparisons.json", periodComparisons, "period_comparison_id", null],
    ["muscle_group_sweet_spots", "derived/muscle_group_sweet_spots.json", muscleGroupSweetSpots, "muscle_sweet_spot_id", null],
    ["volume_response_summary", "derived/volume_response_summary.json", [volumeResponseSummary], "volume_response_summary_id", null],
    ["data_quality_report", "reports/data_quality_report.json", [dataQualityReport], "data_quality_report_id", null],
    ["analysis_metadata", "reports/analysis_metadata.json", [analysisMetadata], "analysis_id", "schemas/analysis_metadata.schema.json"]
  ]) {
    outputEntries.push(await outputEntry({ dataRoot: loaded.dataRoot, tableName, relativePath, format: "json", rows, stableIds: [stableIdColumn], sourceRange, analysisDate, methodologyVersion, schemaPath, notes: ["Structured JSON output with explicit provenance and missingness."] }));
  }
  const outputManifest = {
    manifest_id: stableId("manifest", analysisId, methodologyVersion),
    analysis_id: analysisId,
    source_date_range: { start_date: sourceRange.start, end_date: sourceRange.end },
    analysis_date: analysisDate,
    methodology_version: methodologyVersion,
    sample_size: outputEntries.reduce((total, entry) => total + entry.row_count, 0),
    confidence_level: "moderate",
    missing_data_flags: ["some_source_fields_missing"],
    source_references: [sourceReference("raw_inventory", "reports/source_file_inventory.csv")],
    notes: ["Known outputs are overwritten atomically on rerun; rows are never appended."],
    outputs: outputEntries
  };
  await writeJsonAtomic(path.join(loaded.reportsRoot, "output_manifest.json"), outputManifest);

  return {
    loaded,
    inventory,
    workout,
    fitbit,
    nutrition,
    bodyComposition,
    catalog,
    catalogSnapshot,
    recoveryLinks,
    exerciseSessionMetrics,
    exerciseScores,
    exerciseMuscleScores: muscleOutputs.exerciseMuscleScores,
    muscleGroupRankings: muscleOutputs.muscleGroupRankings,
    sweetSpots,
    prescriptions,
    recoveryRules,
    programPhases,
    weeklyMuscleVolumeResponse,
    volumeResponseSummary,
    muscleGroupSweetSpots,
    periodComparisons,
    dataQualityReport,
    analysisMetadata,
    outputManifest,
    reportPath: path.join(loaded.reportsRoot, "PERSONAL_HYPERTROPHY_AND_RECOVERY_REPORT.md")
  };
}

module.exports = { augmentBodyComposition, runPipeline, snapshotCatalog };
