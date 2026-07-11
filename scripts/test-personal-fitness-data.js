"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { loadPersonalFitnessConfig } = require("./personal-fitness/config");
const { buildCompleteExerciseCatalog } = require("./personal-fitness/exercise-mapping");
const { normalizeWorkouts, __test: workoutTest } = require("./personal-fitness/normalize-workouts");
const { confidenceLabel } = require("./personal-fitness/scoring");
const { validatePersonalFitnessOutputs } = require("./personal-fitness/validator");
const { assertJsonSafe, parseCsvLine, parseStrongDate, readCsv, readCsvRows } = require("./personal-fitness/utils");

const repositoryRoot = path.resolve(__dirname, "..");

function csvJsonArray(value) {
  if (!value) return [];
  const parsed = JSON.parse(value);
  assert(Array.isArray(parsed), "CSV JSON field must contain an array");
  return parsed;
}

async function main() {
  assert.deepEqual(parseCsvLine('a,"b,c","d""e"'), ["a", "b,c", 'd"e'], "CSV parser must preserve quoted commas and escaped quotes");
  assert.deepEqual(parseStrongDate("2026-07-07 13:49:19"), { date: "2026-07-07", time: "13:49:19", localDateTime: "2026-07-07T13:49:19" }, "ISO Strong timestamp must parse");
  assert.deepEqual(parseStrongDate("3/2/2026 14:43"), { date: "2026-03-02", time: "14:43:00", localDateTime: "2026-03-02T14:43:00" }, "Legacy Strong timestamp must parse");
  assert.equal(workoutTest.setOrderKind("W"), "warmup");
  assert.equal(workoutTest.setOrderKind("D"), "drop_set");
  assert.equal(workoutTest.setOrderKind("F"), "failure");

  const setFixture = [
    { source_set_order_kind: "warmup", is_working_set: false, load: 45 },
    { source_set_order_kind: "numeric_working", is_working_set: true, load: 190 },
    { source_set_order_kind: "numeric_working", is_working_set: true, load: 170 },
    { source_set_order_kind: "numeric_working", is_working_set: true, load: 170 }
  ];
  workoutTest.classifySetTypes(setFixture, 2);
  assert.deepEqual(setFixture.map((record) => record.set_type), ["warmup", "top_set", "back_off_set", "back_off_set"], "Warm-up/top/back-off classification must remain distinct");
  const warmupHard = workoutTest.classifyHardSet({ is_working_set: false, set_type: "warmup", repetitions: 5, progression_metric: "rpe_adjusted_e1rm" }, { hard_set_min_rpe: 6 });
  assert.equal(warmupHard.hard, false, "Warm-ups must never be hard sets");
  const durationHard = workoutTest.classifyHardSet({ is_working_set: true, set_type: "straight_working_set", repetitions: 0, seconds_as_recorded: 60, progression_metric: "duration", rpe: null }, { hard_set_min_rpe: 6, assume_logged_working_set_hard_when_rpe_missing: true });
  assert.equal(durationHard.hard, true, "Valid duration work must not be rejected for zero repetitions");

  const e1rm80x8 = workoutTest.epley(80, 8);
  const e1rm825x7 = workoutTest.epley(82.5, 7);
  const change = ((e1rm825x7 / e1rm80x8) - 1) * 100;
  assert(change > 0 && change < 1, "80x8 to 82.5x7 should be positive but remain inside the held band");
  assert.equal(confidenceLabel(99, 2, 365, { confidence: { insufficient_exposures_max: 2 } }), "Insufficient personal evidence", "Tiny samples cannot receive high confidence");

  const loaded = await loadPersonalFitnessConfig(repositoryRoot);
  const recordedNames = new Set();
  await readCsv(path.join(loaded.rawRoot, "strong_workouts (8).csv"), (row) => recordedNames.add(row["Exercise Name"]));
  const catalog = buildCompleteExerciseCatalog([...recordedNames], loaded.aliases, loaded.muscleMap, loaded.mappingRules);
  assert.equal(recordedNames.size, 149, "Updated Strong source should expose 149 distinct exercise names");
  assert.equal(catalog.aliases.length, recordedNames.size, "Every recorded exercise needs one alias");
  assert.equal(catalog.mappingAudit.filter((item) => item.review_required).length, 0, "Every recorded resistance exercise must have a muscle mapping");

  const catalogAliasByRecordedName = new Map(catalog.aliases.map((alias) => [alias.recorded_name, alias]));
  [
    ["Seated Palms Down Wrist Curl", "forearms"],
    ["Seated Palms Up Wrist Curl (Dumbbell)", "forearms"],
    ["Prone Wrist Curl (Cable)", "forearms"],
    ["Kneeling Leg Curl", "hamstrings"],
    ["Neck Curls (Heavy Side)", "lateral_neck_musculature"],
    ["Triceps Dip (Assisted)", "triceps"],
    ["Bicep Curl (Barbell)", "biceps"]
  ].forEach(([recordedName, expectedPrimary]) => {
    assert.equal(catalogAliasByRecordedName.get(recordedName)?.primary_muscle_group, expectedPrimary, `${recordedName} must map to ${expectedPrimary} before broad curl/dip rules`);
  });
  assert.equal(catalogAliasByRecordedName.get("Triceps Dip (Assisted)")?.resistance_type, "assisted_bodyweight", "Assisted triceps dips must preserve assisted-bodyweight semantics");

  let normalizedPreview = await normalizeWorkouts({
    rawRoot: loaded.rawRoot,
    config: { ...loaded.analysisConfig, exercise_mapping_rules_document: loaded.mappingRules },
    aliases: loaded.aliases,
    muscleMap: loaded.muscleMap,
    analysisDate: "2026-07-11",
    methodologyVersion: loaded.analysisConfig.methodology_version
  });
  const normalizedResearchIds = new Map(normalizedPreview.records.map((record) => [record.exercise_id, record.research_exercise_id]));
  loaded.aliases.filter((alias) => alias.research_exercise_id).forEach((alias) => {
    assert.equal(normalizedResearchIds.get(alias.exercise_id), alias.research_exercise_id, `${alias.recorded_name} must propagate research_exercise_id into normalized workout rows`);
  });
  let plausibilityExcludedPreview = normalizedPreview.records.filter((record) => record.is_working_set && record.analysis_progression_eligible === false);
  const plausibilityExcludedIds = plausibilityExcludedPreview.map((record) => record.record_id);
  assert(plausibilityExcludedPreview.length > 0, "Known Strong plausibility anomalies must be flagged without deleting their raw rows");
  plausibilityExcludedPreview.forEach((record) => {
    assert.equal(record.is_derived_pr, false, `${record.record_id} is plausibility-excluded and must not become a derived PR`);
    assert.equal(record.pr_eligible, false, `${record.record_id} is plausibility-excluded and must not enter PR comparison`);
  });
  plausibilityExcludedPreview = null;
  normalizedPreview = null;

  let activeStrong = await readCsvRows(path.join(loaded.rawRoot, "strong_workouts (8).csv"));
  assert.equal(activeStrong.rowCount, 15449, "Active updated Strong export row count must remain stable");
  assert.equal(activeStrong.rows[0].Date, "2021-08-19 20:06:29");
  assert.equal(activeStrong.rows.at(-1).Date, "2026-07-07 13:49:19");
  assert(fs.existsSync(path.join(loaded.rawRoot, "archive", "strong_workouts_partial_2026-03-02_to_2026-07-04.csv")), "Prior partial Strong export must remain archived");
  activeStrong = null;

  let scores = await readCsvRows(path.join(loaded.derivedRoot, "exercise_scores.csv"));
  scores.rows.forEach((row) => {
    ["progression_score", "hypertrophy_support_score", "recovery_efficiency_score", "repeatability_score", "nutrition_support_score", "data_confidence_score", "overall_personal_exercise_score"].forEach((field) => {
      assert(Number(row[field]) >= 0 && Number(row[field]) <= 100, `${row.exercise_id}.${field} must be 0-100`);
    });
    if (Number(row.session_count) < 3) assert.equal(row.confidence_level, "Insufficient personal evidence");
  });
  scores = null;

  for (const relativePath of ["derived/weekly_muscle_volume_response.csv", "derived/muscle_group_sweet_spots.json", "derived/volume_response_summary.json"]) {
    const stat = await fsp.stat(path.join(loaded.dataRoot, relativePath));
    assert(stat.isFile() && stat.size > 0, `${relativePath} must exist and be nonempty`);
  }
  let sessionMetrics = (await readCsvRows(path.join(loaded.derivedRoot, "exercise_session_metrics.csv"))).rows;
  const scoredExtreme = sessionMetrics.filter((row) => ["improved", "held", "regressed"].includes(row.progression_status) && row.progression_pct_vs_prior !== "" && Math.abs(Number(row.progression_pct_vs_prior)) >= 100);
  assert.equal(scoredExtreme.length, 0, "No >=100% progression transition may remain in a scored outcome state");
  const performanceSetIds = new Set(sessionMetrics.flatMap((row) => csvJsonArray(row.set_record_ids)));
  const excludedIdsInPerformance = plausibilityExcludedIds.filter((recordId) => performanceSetIds.has(recordId));
  assert.equal(excludedIdsInPerformance.length, 0, "Plausibility-excluded normalized sets must not enter session performance arrays");

  let prescriptions = JSON.parse(await fsp.readFile(path.join(loaded.derivedRoot, "exercise_prescriptions.json"), "utf8"));
  const aliasByExercise = new Map(catalog.aliases.map((alias) => [alias.exercise_id, alias]));
  const productiveRanges = loaded.analysisConfig.productive_rep_range;
  prescriptions.forEach((prescription) => {
    const alias = aliasByExercise.get(prescription.exercise_id) || {};
    const bodyweight = ["bodyweight", "assisted_bodyweight", "band"].includes(alias.resistance_type);
    const repMin = Number(bodyweight ? productiveRanges.bodyweight_min : productiveRanges.external_resistance_min);
    const repMax = Number(bodyweight ? productiveRanges.bodyweight_max : productiveRanges.external_resistance_max);
    if (prescription.recommended_rep_range?.min != null || prescription.recommended_rep_range?.max != null) {
      assert(Number(prescription.recommended_rep_range.min) >= repMin && Number(prescription.recommended_rep_range.max) <= repMax, `${prescription.exercise_id} recommended reps must stay inside ${repMin}-${repMax}`);
    }
    if (prescription.recommended_rpe?.min != null || prescription.recommended_rpe?.max != null) {
      assert(Number(prescription.recommended_rpe.min) >= 6 && Number(prescription.recommended_rpe.max) <= 9, `${prescription.exercise_id} recommended RPE must stay inside 6-9`);
    }
    if (Number(prescription.integration_envelope?.research_confidence) === 0) assert.equal(Number(prescription.integration_envelope.research_weight), 0, `${prescription.exercise_id} cannot reserve weight for absent research evidence`);
  });

  let recoveryLinks = (await readCsvRows(path.join(loaded.derivedRoot, "workout_recovery_links.csv"))).rows;
  assert.equal(recoveryLinks.filter((row) => Number(row.pre_workout_recovery_marker_available_count) < 2 && row.pre_workout_recovery_state === "within_personal_band").length, 0, "Insufficient pre-workout recovery data cannot be labeled within_personal_band");
  let recoveryRules = JSON.parse(await fsp.readFile(path.join(loaded.derivedRoot, "recovery_rules.json"), "utf8"));
  const recoveryEligibleSessions = new Set(sessionMetrics.filter((row) => Number(row.pre_workout_recovery_marker_available_count) >= 2).map((row) => row.session_id));
  const trainAsPlanned = recoveryRules.find((rule) => rule.action === "train_as_planned");
  assert(trainAsPlanned, "train_as_planned recovery rule must exist");
  assert.equal(Number(trainAsPlanned.historical_evidence.eligible_observations), recoveryEligibleSessions.size, "train_as_planned eligibility must exclude sessions with insufficient pre-recovery data");
  recoveryRules.forEach((rule) => {
    if (Number(rule.integration_envelope?.research_confidence) === 0) assert.equal(Number(rule.integration_envelope.research_weight), 0, `${rule.rule_id} cannot reserve weight for absent research evidence`);
  });
  sessionMetrics = null;
  prescriptions = null;
  recoveryLinks = null;
  recoveryRules = null;

  for (const schemaName of ["analysis_metadata.schema.json", "exercise_prescriptions.schema.json", "recovery_rules.schema.json", "tabular_output_manifest.schema.json", "data_dictionary.json"]) {
    const document = JSON.parse(await fsp.readFile(path.join(loaded.schemasRoot, schemaName), "utf8"));
    assertJsonSafe(document);
  }
  const validation = await validatePersonalFitnessOutputs({ repositoryRoot });
  assert.equal(validation.valid, true, JSON.stringify(validation.issues, null, 2));
  assert.equal(validation.error_count, 0);
  process.stdout.write(`Personal fitness tests passed (${validation.checks_run} artifact checks; ${validation.warning_count} preserved-source warning).\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
