"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { assertJsonSafe, readCsvRows } = require("./utils");

const STABLE_ID = /^[a-z][a-z0-9_]*$/;
const SCORE_FIELDS = ["progression_score", "hypertrophy_support_score", "recovery_efficiency_score", "repeatability_score", "nutrition_support_score", "data_confidence_score", "overall_personal_exercise_score"];

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function bool(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function explicitFalse(value) {
  return value === false || String(value).toLowerCase() === "false";
}

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function earliestNormalizedDate(artifacts) {
  const dates = [];
  for (const [rows, fields] of [
    [artifacts.workouts, ["workout_date", "source_date_start"]],
    [artifacts.fitbit, ["date", "source_date_start"]],
    [artifacts.nutrition, ["date", "source_date_start"]],
    [artifacts.body, ["date", "source_date_start"]]
  ]) {
    for (const row of rows) {
      for (const field of fields) if (validDate(row[field])) dates.push(row[field]);
    }
  }
  dates.sort();
  return dates[0] || null;
}

function issue(list, severity, checkId, message, details = null) {
  list.push({ severity, check_id: checkId, message, details });
}

function duplicateValues(rows, field) {
  const counts = new Map();
  rows.forEach((row) => counts.set(row[field], (counts.get(row[field]) || 0) + 1));
  return [...counts.entries()].filter(([value, count]) => value && count > 1);
}

async function loadArtifacts(dataRoot) {
  const csv = async (relativePath) => (await readCsvRows(path.join(dataRoot, relativePath))).rows;
  const json = async (relativePath) => JSON.parse(await fsp.readFile(path.join(dataRoot, relativePath), "utf8"));
  return {
    workouts: await csv("normalized/normalized_workouts.csv"),
    fitbit: await csv("normalized/normalized_fitbit.csv"),
    nutrition: await csv("normalized/normalized_nutrition.csv"),
    body: await csv("normalized/normalized_body_composition.csv"),
    aliases: await csv("normalized/exercise_aliases.csv"),
    muscleMap: await csv("normalized/exercise_muscle_map.csv"),
    links: await csv("derived/workout_recovery_links.csv"),
    sessionMetrics: await csv("derived/exercise_session_metrics.csv"),
    exerciseScores: await csv("derived/exercise_scores.csv"),
    exerciseMuscleScores: await csv("derived/exercise_muscle_scores.csv"),
    rankings: await csv("derived/muscle_group_rankings.csv"),
    weeklyMuscleVolume: await csv("derived/weekly_muscle_volume_response.csv"),
    periodComparisons: await csv("derived/period_comparisons.csv"),
    programPhases: await csv("derived/program_phases.csv"),
    sweetSpots: await json("derived/exercise_sweet_spots.json"),
    muscleGroupSweetSpots: await json("derived/muscle_group_sweet_spots.json"),
    volumeResponseSummary: await json("derived/volume_response_summary.json"),
    prescriptions: await json("derived/exercise_prescriptions.json"),
    recoveryRules: await json("derived/recovery_rules.json"),
    analysisConfig: await json("config/analysis.config.json"),
    metadata: await json("reports/analysis_metadata.json"),
    quality: await json("reports/data_quality_report.json"),
    manifest: await json("reports/output_manifest.json")
  };
}

async function validatePersonalFitnessOutputs({ repositoryRoot = process.cwd() } = {}) {
  const dataRoot = path.join(repositoryRoot, "personal_fitness_data");
  const requiredFiles = [
    "normalized/normalized_workouts.csv",
    "normalized/normalized_fitbit.csv",
    "normalized/normalized_nutrition.csv",
    "normalized/normalized_body_composition.csv",
    "normalized/exercise_aliases.csv",
    "normalized/exercise_muscle_map.csv",
    "derived/workout_recovery_links.csv",
    "derived/exercise_session_metrics.csv",
    "derived/exercise_scores.csv",
    "derived/exercise_muscle_scores.csv",
    "derived/muscle_group_rankings.csv",
    "derived/weekly_muscle_volume_response.csv",
    "derived/exercise_sweet_spots.json",
    "derived/muscle_group_sweet_spots.json",
    "derived/volume_response_summary.json",
    "derived/exercise_prescriptions.json",
    "derived/recovery_rules.json",
    "derived/period_comparisons.csv",
    "reports/data_quality_report.json",
    "reports/analysis_metadata.json",
    "reports/output_manifest.json",
    "reports/PERSONAL_HYPERTROPHY_AND_RECOVERY_REPORT.md"
  ];
  const issues = [];
  for (const relativePath of requiredFiles) {
    try {
      const stat = await fsp.stat(path.join(dataRoot, relativePath));
      if (!stat.isFile() || stat.size === 0) issue(issues, "error", "required_file_nonempty", `${relativePath} is missing or empty.`);
    } catch {
      issue(issues, "error", "required_file_exists", `${relativePath} does not exist.`);
    }
  }
  if (issues.some((item) => item.severity === "error")) return { valid: false, issues, checks_run: requiredFiles.length };
  const artifacts = await loadArtifacts(dataRoot);
  Object.entries(artifacts).filter(([, value]) => !Array.isArray(value) || value.length).forEach(([name, value]) => {
    try { assertJsonSafe(value); } catch (error) { issue(issues, "error", "json_safe", `${name}: ${error.message}`); }
  });

  const uniqueChecks = [
    [artifacts.workouts, "record_id", "workout_record_ids"],
    [artifacts.fitbit, "record_id", "fitbit_record_ids"],
    [artifacts.nutrition, "nutrition_id", "nutrition_ids"],
    [artifacts.body, "body_composition_record_id", "body_composition_ids"],
    [artifacts.aliases, "exercise_alias_id", "alias_ids"],
    [artifacts.muscleMap, "exercise_muscle_map_id", "muscle_map_ids"],
    [artifacts.links, "link_id", "recovery_link_ids"],
    [artifacts.sessionMetrics, "exercise_session_id", "exercise_session_ids"],
    [artifacts.exerciseScores, "exercise_score_id", "exercise_score_ids"],
    [artifacts.exerciseMuscleScores, "exercise_muscle_score_id", "exercise_muscle_score_ids"],
    [artifacts.rankings, "ranking_id", "ranking_ids"],
    [artifacts.weeklyMuscleVolume, "weekly_muscle_response_id", "weekly_muscle_response_ids"],
    [artifacts.muscleGroupSweetSpots, "muscle_sweet_spot_id", "muscle_sweet_spot_ids"]
  ];
  uniqueChecks.forEach(([rows, field, checkId]) => {
    const duplicates = duplicateValues(rows, field);
    if (duplicates.length) issue(issues, "error", checkId, `${duplicates.length} duplicate stable IDs found.`, duplicates.slice(0, 10));
    const invalid = rows.filter((row) => !STABLE_ID.test(row[field] || ""));
    if (invalid.length) issue(issues, "error", `${checkId}_format`, `${invalid.length} invalid stable IDs found.`, invalid.slice(0, 5).map((row) => row[field]));
  });

  const warmupViolations = artifacts.workouts.filter((row) => bool(row.is_warmup) && (bool(row.hard_set) || bool(row.is_derived_pr)));
  if (warmupViolations.length) issue(issues, "error", "warmups_excluded", `${warmupViolations.length} warm-ups counted as hard sets or PRs.`);
  if (artifacts.workouts.length && !("analysis_progression_eligible" in artifacts.workouts[0])) {
    issue(issues, "error", "progression_plausibility_schema", "normalized_workouts is missing analysis_progression_eligible.");
  }
  const plausibilityExcluded = artifacts.workouts.filter((row) => bool(row.is_working_set) && explicitFalse(row.analysis_progression_eligible));
  const excludedPrViolations = plausibilityExcluded.filter((row) => bool(row.is_derived_pr) || bool(row.is_personal_record) || bool(row.pr_eligible));
  if (excludedPrViolations.length) issue(issues, "error", "plausibility_excluded_not_pr", `${excludedPrViolations.length} plausibility-excluded working sets entered PR logic.`, excludedPrViolations.slice(0, 10).map((row) => row.record_id));
  const performanceSetIds = new Set();
  const malformedSessionArrays = [];
  for (const row of artifacts.sessionMetrics) {
    const ids = jsonArray(row.set_record_ids);
    if (ids === null) malformedSessionArrays.push(row.exercise_session_id);
    else ids.forEach((id) => performanceSetIds.add(id));
  }
  if (malformedSessionArrays.length) issue(issues, "error", "session_performance_record_ids_parse", `${malformedSessionArrays.length} session performance record-ID arrays are malformed.`, malformedSessionArrays.slice(0, 10));
  const excludedInPerformance = plausibilityExcluded.filter((row) => performanceSetIds.has(row.record_id));
  if (excludedInPerformance.length) issue(issues, "error", "plausibility_excluded_from_session_performance", `${excludedInPerformance.length} plausibility-excluded set IDs entered exercise-session performance arrays.`, excludedInPerformance.slice(0, 10).map((row) => row.record_id));
  const maximumComparableChangePct = Number(artifacts.analysisConfig.plausibility?.maximum_comparable_performance_change_pct ?? 100);
  const extremeScoredTransitions = artifacts.sessionMetrics.filter((row) => ["improved", "held", "regressed"].includes(row.progression_status) && Number.isFinite(Number(row.progression_pct_vs_prior)) && Math.abs(Number(row.progression_pct_vs_prior)) >= maximumComparableChangePct);
  if (extremeScoredTransitions.length) issue(issues, "error", "scored_progression_plausibility", `${extremeScoredTransitions.length} scored transitions meet or exceed the configured ${maximumComparableChangePct}% absolute progression plausibility limit.`, extremeScoredTransitions.slice(0, 10).map((row) => ({ exercise_session_id: row.exercise_session_id, exercise_id: row.exercise_id, date: row.workout_date, progression_pct_vs_prior: row.progression_pct_vs_prior })));
  const invalidSets = artifacts.workouts.filter((row) => {
    const durationSet = row.progression_metric === "duration" && Number(row.seconds_as_recorded) > 0;
    return bool(row.is_working_set) && ((!durationSet && !(Number(row.repetitions) > 0)) || Number(row.load) < 0);
  });
  if (invalidSets.length) issue(issues, "warning", "invalid_source_working_sets_preserved", `${invalidSets.length} source working sets have invalid load/repetitions and were preserved but excluded from hard-set/progression calculations.`, invalidSets.slice(0, 10).map((row) => ({ date: row.workout_date, exercise: row.exercise_name_recorded, source_row: row.source_row_number })));

  const aliasIds = new Set(artifacts.aliases.map((row) => row.exercise_id));
  const aliasByExercise = new Map(artifacts.aliases.map((row) => [row.exercise_id, row]));
  const mappedExerciseIds = new Set(artifacts.muscleMap.map((row) => row.exercise_id));
  const workoutExerciseIds = new Set(artifacts.workouts.map((row) => row.exercise_id));
  const missingAliases = [...workoutExerciseIds].filter((id) => !aliasIds.has(id));
  const missingMuscles = [...workoutExerciseIds].filter((id) => !mappedExerciseIds.has(id));
  if (missingAliases.length) issue(issues, "error", "all_exercises_aliased", `${missingAliases.length} exercise IDs lack aliases.`, missingAliases);
  if (missingMuscles.length) issue(issues, "error", "all_exercises_muscle_mapped", `${missingMuscles.length} exercise IDs lack muscle mappings.`, missingMuscles);
  if (artifacts.aliases.some((row) => row.primary_muscle_group === "unmapped")) issue(issues, "error", "no_unmapped_primary_muscle", "At least one alias has primary_muscle_group=unmapped.");
  const researchAliases = artifacts.aliases.filter((row) => row.research_exercise_id);
  const propagatedResearchRows = artifacts.workouts.filter((row) => row.research_exercise_id);
  if (!researchAliases.length || !propagatedResearchRows.length) issue(issues, "error", "research_crosswalk_propagation_nonzero", `Expected nonzero research crosswalk aliases and normalized workout propagation; found ${researchAliases.length} aliases and ${propagatedResearchRows.length} workout rows.`);
  const researchPropagationMismatches = artifacts.workouts.filter((row) => {
    const expected = aliasByExercise.get(row.exercise_id)?.research_exercise_id;
    return expected && row.research_exercise_id !== expected;
  });
  if (researchPropagationMismatches.length) issue(issues, "error", "research_crosswalk_propagation_match", `${researchPropagationMismatches.length} workout rows do not carry their alias research_exercise_id.`, researchPropagationMismatches.slice(0, 10).map((row) => ({ record_id: row.record_id, exercise_id: row.exercise_id, research_exercise_id: row.research_exercise_id })));

  artifacts.exerciseScores.forEach((row) => {
    SCORE_FIELDS.forEach((field) => {
      const value = Number(row[field]);
      if (!Number.isFinite(value) || value < 0 || value > 100) issue(issues, "error", "score_range", `${row.exercise_id}.${field}=${row[field]} is outside 0-100.`);
    });
    if (Number(row.session_count) < 3 && row.confidence_level !== "Insufficient personal evidence") issue(issues, "error", "small_sample_confidence", `${row.exercise_id} has ${row.session_count} sessions but confidence ${row.confidence_level}.`);
  });

  for (const [muscle, rows] of (() => {
    const groups = new Map();
    artifacts.rankings.filter((row) => row.rank !== "").forEach((row) => { if (!groups.has(row.muscle_group)) groups.set(row.muscle_group, []); groups.get(row.muscle_group).push(row); });
    return groups;
  })()) {
    const ranks = rows.map((row) => Number(row.rank)).sort((a, b) => a - b);
    const expected = ranks.map((_, index) => index + 1);
    if (JSON.stringify(ranks) !== JSON.stringify(expected)) issue(issues, "error", "contiguous_muscle_ranks", `${muscle} ranks are not contiguous.`, ranks);
  }

  const sessionIds = new Set(artifacts.workouts.map((row) => row.session_id));
  if (artifacts.links.length !== sessionIds.size) issue(issues, "error", "one_recovery_link_per_session", `Expected ${sessionIds.size} recovery links, found ${artifacts.links.length}.`);
  const scoreIds = new Set(artifacts.exerciseScores.map((row) => row.exercise_id));
  if (scoreIds.size !== workoutExerciseIds.size) issue(issues, "error", "one_score_per_exercise", `Expected scores for ${workoutExerciseIds.size} exercises, found ${scoreIds.size}.`);
  const resistanceExerciseIds = new Set(artifacts.aliases.filter((row) => row.exercise_kind !== "non_resistance").map((row) => row.exercise_id));
  const prescriptionIds = new Set(artifacts.prescriptions.map((row) => row.exercise_id));
  const missingPrescriptions = [...resistanceExerciseIds].filter((id) => !prescriptionIds.has(id));
  if (missingPrescriptions.length) issue(issues, "error", "prescriptions_for_resistance_exercises", `${missingPrescriptions.length} resistance exercises lack prescriptions.`, missingPrescriptions);

  if (!artifacts.weeklyMuscleVolume.length) issue(issues, "error", "weekly_muscle_volume_nonempty", "weekly_muscle_volume_response.csv has no rows.");
  if (!artifacts.muscleGroupSweetSpots.length) issue(issues, "error", "muscle_group_sweet_spots_nonempty", "muscle_group_sweet_spots.json has no rows.");
  if (!artifacts.volumeResponseSummary?.volume_response_summary_id || !Array.isArray(artifacts.volumeResponseSummary?.bands) || !artifacts.volumeResponseSummary.bands.length) issue(issues, "error", "volume_response_summary_complete", "volume_response_summary.json lacks an ID or populated volume bands.");

  const requiredPrescriptionFields = ["prescription_id", "exercise_id", "muscle_group_id", "role", "source_date_range", "analysis_date", "methodology_version", "sample_size", "confidence_level", "missing_data_flags", "source_references", "notes", "evidence_summary", "integration_envelope"];
  const repConfig = artifacts.analysisConfig.productive_rep_range || {};
  const configuredRpeMin = Number(artifacts.analysisConfig.plausibility?.recommended_rpe_min ?? 6);
  const configuredRpeMax = Number(artifacts.analysisConfig.plausibility?.recommended_rpe_max ?? 9);
  artifacts.prescriptions.forEach((row) => {
    requiredPrescriptionFields.forEach((field) => { if (!(field in row)) issue(issues, "error", "prescription_required_fields", `${row.exercise_id} missing ${field}.`); });
    const alias = aliasByExercise.get(row.exercise_id) || {};
    const bodyweight = ["bodyweight", "assisted_bodyweight", "band"].includes(alias.resistance_type);
    const repMin = Number(bodyweight ? repConfig.bodyweight_min ?? 5 : repConfig.external_resistance_min ?? 5);
    const repMax = Number(bodyweight ? repConfig.bodyweight_max ?? 40 : repConfig.external_resistance_max ?? 30);
    const recommendedReps = row.recommended_rep_range || {};
    const hasAnyRepBound = recommendedReps.min != null || recommendedReps.max != null;
    if (hasAnyRepBound) {
      const min = Number(recommendedReps.min);
      const max = Number(recommendedReps.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < repMin || max > repMax || min > max) issue(issues, "error", "prescription_rep_bounds", `${row.exercise_id} recommended repetitions ${recommendedReps.min}-${recommendedReps.max} are outside configured ${repMin}-${repMax}.`);
    }
    const recommendedRpe = row.recommended_rpe || {};
    const hasAnyRpeBound = recommendedRpe.min != null || recommendedRpe.max != null;
    if (hasAnyRpeBound) {
      const min = Number(recommendedRpe.min);
      const max = Number(recommendedRpe.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < configuredRpeMin || max > configuredRpeMax || min > max) issue(issues, "error", "prescription_rpe_bounds", `${row.exercise_id} recommended RPE ${recommendedRpe.min}-${recommendedRpe.max} is outside ${configuredRpeMin}-${configuredRpeMax}.`);
    }
    const envelope = row.integration_envelope;
    if (envelope && Math.abs(Number(envelope.personal_weight) + Number(envelope.research_weight) - 1) > 0.0002) issue(issues, "error", "integration_weight_sum", `${row.exercise_id} personal/research weights do not sum to 1.`);
    if (envelope && Number(envelope.research_confidence) === 0 && Number(envelope.research_weight) !== 0) issue(issues, "error", "zero_research_confidence_zero_weight", `${row.exercise_id} has research_confidence=0 but research_weight=${envelope.research_weight}.`);
  });

  if (artifacts.links.length && (!("pre_workout_recovery_marker_available_count" in artifacts.links[0]) || !("pre_workout_recovery_state" in artifacts.links[0]))) issue(issues, "error", "pre_recovery_state_schema", "workout_recovery_links lacks recovery marker availability/state fields.");
  const insufficientRecoveryMislabels = artifacts.links.filter((row) => Number(row.pre_workout_recovery_marker_available_count) < 2 && row.pre_workout_recovery_state === "within_personal_band");
  if (insufficientRecoveryMislabels.length) issue(issues, "error", "missing_recovery_not_within_band", `${insufficientRecoveryMislabels.length} sessions with insufficient pre-workout recovery coverage are labeled within_personal_band.`, insufficientRecoveryMislabels.slice(0, 10).map((row) => row.session_id));
  const recoverySufficientSessionIds = new Set(artifacts.sessionMetrics.filter((row) => Number(row.pre_workout_recovery_marker_available_count) >= 2).map((row) => row.session_id));
  const trainAsPlanned = artifacts.recoveryRules.find((rule) => rule.action === "train_as_planned");
  if (!trainAsPlanned) issue(issues, "error", "train_as_planned_rule_exists", "Missing train_as_planned recovery rule.");
  else if (Number(trainAsPlanned.historical_evidence?.eligible_observations) !== recoverySufficientSessionIds.size) issue(issues, "error", "train_as_planned_excludes_insufficient_recovery", `train_as_planned reports ${trainAsPlanned.historical_evidence?.eligible_observations} eligible observations; expected ${recoverySufficientSessionIds.size} sessions with at least two pre-workout recovery domains.`);
  artifacts.recoveryRules.forEach((rule) => {
    if (!["train_as_planned"].includes(rule.action) && Number(rule.minimum_converging_indicators) < 2) issue(issues, "error", "multi_marker_major_actions", `${rule.rule_id} permits a major action from fewer than two indicators.`);
    if (!rule.historical_evidence || !Number.isInteger(rule.historical_evidence.triggered_observations)) issue(issues, "error", "recovery_rule_evidence", `${rule.rule_id} lacks quantified historical evidence.`);
    const envelope = rule.integration_envelope;
    if (envelope && Math.abs(Number(envelope.personal_weight) + Number(envelope.research_weight) - 1) > 0.0002) issue(issues, "error", "integration_weight_sum", `${rule.rule_id} personal/research weights do not sum to 1.`);
    if (envelope && Number(envelope.research_confidence) === 0 && Number(envelope.research_weight) !== 0) issue(issues, "error", "zero_research_confidence_zero_weight", `${rule.rule_id} has research_confidence=0 but research_weight=${envelope.research_weight}.`);
  });
  const periodIds = new Set(artifacts.periodComparisons.map((row) => row.period_id));
  ["february_2025", "august_2025", "april_2026", "may_2026", "june_2026"].forEach((period) => { if (!periodIds.has(period)) issue(issues, "error", "required_periods", `Missing period comparison ${period}.`); });
  if (!artifacts.body.some((row) => row.metric_id === "skeletal_muscle_mass" && row.date === "2025-08-14")) issue(issues, "error", "inbody_smm_context", "Missing supplied 2025-08-14 skeletal muscle mass reference.");
  if (!artifacts.body.some((row) => row.metric_id === "body_fat_percentage" && row.date === "2025-10-02" && Number(row.value) === 20.5)) issue(issues, "error", "inbody_bodyfat_context", "Missing confirmed 2025-10-02 InBody body-fat reference.");
  if (!artifacts.nutrition.some((row) => row.record_type === "period_target_context" && row.period_id === "april_2026" && Number(row.calories) === 1950)) issue(issues, "error", "calorie_context_preserved", "Missing April 2026 calorie-target context.");

  const metadataRequired = ["analysis_id", "database_name", "analysis_date", "generated_at", "methodology_version", "source_date_range", "sample_size", "confidence_level", "missing_data_flags", "source_references", "notes", "table_record_counts"];
  metadataRequired.forEach((field) => { if (!(field in artifacts.metadata)) issue(issues, "error", "analysis_metadata_required", `analysis_metadata missing ${field}.`); });
  const earliestNormalized = earliestNormalizedDate(artifacts);
  const metadataStart = artifacts.metadata.source_date_range?.start_date;
  if (!validDate(metadataStart) || (earliestNormalized && metadataStart > earliestNormalized)) issue(issues, "error", "analysis_metadata_global_source_start", `analysis_metadata source start ${metadataStart || "missing"} is later than earliest normalized date ${earliestNormalized || "unknown"}.`);
  for (const output of artifacts.manifest.outputs || []) {
    const filePath = path.join(dataRoot, output.relative_path);
    const actualHash = await sha256File(filePath);
    if (actualHash !== output.checksum_sha256) issue(issues, "error", "output_checksum", `${output.relative_path} checksum mismatch.`);
  }
  const oldFolderExists = await fsp.stat(path.join(repositoryRoot, "Fitness Information")).then(() => true, () => false);
  if (oldFolderExists) issue(issues, "error", "folder_rename", "Old Fitness Information directory still exists.");
  const archivedPrior = path.join(dataRoot, "raw", "archive", "strong_workouts_partial_2026-03-02_to_2026-07-04.csv");
  if (!(await fsp.stat(archivedPrior).then((stat) => stat.isFile(), () => false))) issue(issues, "error", "prior_strong_archived", "Prior partial Strong export was not preserved in raw/archive.");

  const checksRun = 36 + artifacts.manifest.outputs.length;
  return {
    valid: !issues.some((item) => item.severity === "error"),
    checks_run: checksRun,
    error_count: issues.filter((item) => item.severity === "error").length,
    warning_count: issues.filter((item) => item.severity === "warning").length,
    issues,
    counts: {
      workout_sets: artifacts.workouts.length,
      fitbit_metrics: artifacts.fitbit.length,
      nutrition_records: artifacts.nutrition.length,
      body_composition_records: artifacts.body.length,
      exercises: artifacts.exerciseScores.length,
      muscle_rankings: artifacts.rankings.length,
      weekly_muscle_volume_rows: artifacts.weeklyMuscleVolume.length,
      muscle_group_sweet_spots: artifacts.muscleGroupSweetSpots.length,
      prescriptions: artifacts.prescriptions.length,
      recovery_rules: artifacts.recoveryRules.length
    }
  };
}

module.exports = { validatePersonalFitnessOutputs };
