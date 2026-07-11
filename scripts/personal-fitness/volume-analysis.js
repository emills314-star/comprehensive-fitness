"use strict";

const {
  addDays,
  dateRange,
  groupBy,
  mean,
  median,
  mode,
  quantile,
  round,
  sortedUnique,
  stableId,
  sum
} = require("./utils");

function volumeBand(value) {
  if (value < 6) return "under_6_effective_sets";
  if (value <= 10) return "6_to_10_effective_sets";
  if (value <= 15) return "11_to_15_effective_sets";
  return "16_plus_effective_sets";
}

function dailyAverage(dailyMap, weekStart, metricId) {
  const values = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const value = dailyMap.get(addDays(weekStart, offset))?.metrics?.[metricId]?.value;
    if (Number.isFinite(value)) values.push(value);
  }
  return { value: round(mean(values), 3), days: values.length };
}

function buildWeeklyMuscleVolumeResponse({ exerciseSessionMetrics, muscleMap, dailyMap, nutritionDailyMap, analysisDate, methodologyVersion }) {
  const musclesByExercise = groupBy(muscleMap, "exercise_id");
  const builders = new Map();
  for (const metric of exerciseSessionMetrics) {
    for (const mapping of musclesByExercise.get(metric.exercise_id) || []) {
      const key = `${metric.week_start}|${mapping.muscle_group}`;
      if (!builders.has(key)) builders.set(key, { week_start: metric.week_start, muscle_group: mapping.muscle_group, metrics: [], effective_sets: 0, contributing_sets: 0 });
      const builder = builders.get(key);
      builder.metrics.push(metric);
      builder.effective_sets += metric.hard_set_count * Number(mapping.contribution_weight || 0);
      builder.contributing_sets += metric.hard_set_count;
    }
  }
  const rows = [];
  for (const builder of builders.values()) {
    const outcomes = builder.metrics.filter((metric) => ["improved", "held", "regressed"].includes(metric.progression_status));
    const improved = outcomes.filter((metric) => metric.progression_status === "improved").length;
    const regressed = outcomes.filter((metric) => metric.progression_status === "regressed").length;
    const nutrition = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const item = nutritionDailyMap.get(addDays(builder.week_start, offset));
      if (item) nutrition.push(item);
    }
    const calorieNutrition = nutrition.filter((item) => Number.isFinite(item.calories));
    const proteinNutrition = nutrition.filter((item) => Number.isFinite(item.protein_g));
    const carbohydrateNutrition = nutrition.filter((item) => Number.isFinite(item.carbohydrates_g));
    const hrv = dailyAverage(dailyMap, builder.week_start, "hrv_rmssd_ms");
    const rhr = dailyAverage(dailyMap, builder.week_start, "resting_heart_rate_bpm");
    const sleep = dailyAverage(dailyMap, builder.week_start, "sleep_duration_minutes");
    const sleepingHr = dailyAverage(dailyMap, builder.week_start, "sleeping_heart_rate_bpm");
    const effectiveSets = round(builder.effective_sets, 2);
    rows.push({
      weekly_muscle_response_id: stableId("weekly_muscle", builder.week_start, builder.muscle_group),
      week_start: builder.week_start,
      week_end: addDays(builder.week_start, 6),
      muscle_group: builder.muscle_group,
      effective_hard_sets: effectiveSets,
      contributing_hard_sets_unweighted: builder.contributing_sets,
      session_exposure_count: new Set(builder.metrics.map((metric) => metric.session_id)).size,
      exercise_count: new Set(builder.metrics.map((metric) => metric.exercise_id)).size,
      exercise_ids: sortedUnique(builder.metrics.map((metric) => metric.exercise_id)).join(";"),
      progression_observation_count: outcomes.length,
      improved_exposure_count: improved,
      held_exposure_count: outcomes.filter((metric) => metric.progression_status === "held").length,
      regressed_exposure_count: regressed,
      improvement_rate_pct: outcomes.length ? round(improved / outcomes.length * 100, 2) : null,
      regression_rate_pct: outcomes.length ? round(regressed / outcomes.length * 100, 2) : null,
      average_progression_pct: round(mean(outcomes.map((metric) => metric.progression_pct_vs_prior)), 3),
      average_recovery_strain_score: round(mean(builder.metrics.map((metric) => metric.recovery_strain_score)), 2),
      average_hrv_ms: hrv.value,
      hrv_days: hrv.days,
      average_resting_hr_bpm: rhr.value,
      resting_hr_days: rhr.days,
      average_sleeping_hr_bpm: sleepingHr.value,
      sleeping_hr_days: sleepingHr.days,
      average_sleep_minutes: sleep.value,
      sleep_days: sleep.days,
      observed_daily_calories_average: round(mean(calorieNutrition.map((item) => item.calories)), 2),
      observed_daily_protein_g_average: round(mean(proteinNutrition.map((item) => item.protein_g)), 2),
      observed_daily_carbohydrates_g_average: round(mean(carbohydrateNutrition.map((item) => item.carbohydrates_g)), 2),
      observed_nutrition_days: nutrition.length,
      observed_calorie_days: calorieNutrition.length,
      observed_protein_days: proteinNutrition.length,
      observed_carbohydrate_days: carbohydrateNutrition.length,
      context_daily_calorie_target: round(median(builder.metrics.map((metric) => metric.context_daily_calorie_target)), 0),
      volume_band: volumeBand(effectiveSets),
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      source_date_start: builder.week_start,
      source_date_end: addDays(builder.week_start, 6),
      sample_size: outcomes.length,
      confidence_level: outcomes.length >= 3 && hrv.days >= 4 ? "Moderate confidence" : "Low confidence",
      missing_data_flags: [hrv.days < 4 ? "weekly_hrv" : null, sleep.days < 4 ? "weekly_sleep" : null, calorieNutrition.length < 4 ? "weekly_calories" : null, proteinNutrition.length < 4 ? "weekly_protein" : null, carbohydrateNutrition.length < 4 ? "weekly_carbohydrates" : null].filter(Boolean).join(";"),
      source_references: "derived/exercise_session_metrics.csv;normalized/normalized_fitbit.csv;normalized/normalized_nutrition.csv",
      notes: "Secondary-muscle sets are contribution-weighted. Weekly associations do not establish that volume caused recovery or progression."
    });
  }
  rows.sort((left, right) => left.week_start.localeCompare(right.week_start) || left.muscle_group.localeCompare(right.muscle_group));
  return rows;
}

function buildVolumeResponseSummary(rows, analysisDate, methodologyVersion) {
  const bands = [];
  for (const [band, bandRows] of groupBy(rows.filter((row) => row.progression_observation_count > 0), "volume_band")) {
    bands.push({
      volume_band: band,
      muscle_week_count: bandRows.length,
      average_effective_hard_sets: round(mean(bandRows.map((row) => row.effective_hard_sets)), 2),
      average_improvement_rate_pct: round(mean(bandRows.map((row) => row.improvement_rate_pct)), 2),
      average_regression_rate_pct: round(mean(bandRows.map((row) => row.regression_rate_pct)), 2),
      average_recovery_strain_score: round(mean(bandRows.map((row) => row.average_recovery_strain_score)), 2),
      average_hrv_ms: round(mean(bandRows.map((row) => row.average_hrv_ms)), 2),
      average_sleep_minutes: round(mean(bandRows.map((row) => row.average_sleep_minutes)), 2)
    });
  }
  const aroundEight = rows.filter((row) => row.effective_hard_sets >= 6 && row.effective_hard_sets <= 10 && row.progression_observation_count > 0);
  const aboveTen = rows.filter((row) => row.effective_hard_sets > 10 && row.progression_observation_count > 0);
  const lowHrvRows = rows.filter((row) => Number.isFinite(row.average_hrv_ms) && row.average_hrv_ms >= 36 && row.average_hrv_ms <= 44);
  const uniqueLowHrvWeeks = sortedUnique(lowHrvRows.map((row) => row.week_start));
  return {
    volume_response_summary_id: stableId("volume_summary", methodologyVersion, analysisDate),
    analysis_date: analysisDate,
    methodology_version: methodologyVersion,
    source_date_range: (() => { const range = dateRange(rows, "week_start"); return { start_date: range.start, end_date: range.end }; })(),
    sample_size: rows.length,
    confidence_level: rows.length >= 100 ? "Moderate confidence" : "Low confidence",
    missing_data_flags: ["causal_attribution", "some_weekly_nutrition", "secondary_set_contribution_estimates"],
    source_references: ["derived/weekly_muscle_volume_response.csv"],
    notes: ["Volume bands are muscle-week observations and are not randomized program comparisons."],
    bands: bands.sort((left, right) => left.average_effective_hard_sets - right.average_effective_hard_sets),
    around_eight_vs_above_ten: {
      around_eight_muscle_weeks: aroundEight.length,
      around_eight_improvement_rate_pct: round(mean(aroundEight.map((row) => row.improvement_rate_pct)), 2),
      around_eight_regression_rate_pct: round(mean(aroundEight.map((row) => row.regression_rate_pct)), 2),
      around_eight_recovery_strain_score: round(mean(aroundEight.map((row) => row.average_recovery_strain_score)), 2),
      around_eight_hrv_ms: round(mean(aroundEight.map((row) => row.average_hrv_ms)), 2),
      above_ten_muscle_weeks: aboveTen.length,
      above_ten_improvement_rate_pct: round(mean(aboveTen.map((row) => row.improvement_rate_pct)), 2),
      above_ten_regression_rate_pct: round(mean(aboveTen.map((row) => row.regression_rate_pct)), 2),
      above_ten_recovery_strain_score: round(mean(aboveTen.map((row) => row.average_recovery_strain_score)), 2),
      above_ten_hrv_ms: round(mean(aboveTen.map((row) => row.average_hrv_ms)), 2)
    },
    hrv_36_to_44_weeks: {
      unique_week_count: uniqueLowHrvWeeks.length,
      week_starts: uniqueLowHrvWeeks,
      muscle_week_count: lowHrvRows.length,
      median_effective_hard_sets: round(median(lowHrvRows.map((row) => row.effective_hard_sets)), 2),
      average_improvement_rate_pct: round(mean(lowHrvRows.map((row) => row.improvement_rate_pct)), 2),
      average_regression_rate_pct: round(mean(lowHrvRows.map((row) => row.regression_rate_pct)), 2)
    }
  };
}

function buildMuscleGroupSweetSpots({ weeklyRows, muscleGroupRankings, analysisDate, methodologyVersion }) {
  const results = [];
  for (const [muscle, rows] of groupBy(weeklyRows.filter((row) => row.effective_hard_sets > 0), "muscle_group")) {
    rows.sort((left, right) => left.week_start.localeCompare(right.week_start));
    const progressionRows = rows.filter((row) => Number.isFinite(row.improvement_rate_pct));
    const medianImprovement = median(progressionRows.map((row) => row.improvement_rate_pct));
    const medianStrain = median(rows.map((row) => row.average_recovery_strain_score));
    let best = rows.filter((row) => (!Number.isFinite(medianImprovement) || row.improvement_rate_pct >= medianImprovement) && (!Number.isFinite(row.average_recovery_strain_score) || !Number.isFinite(medianStrain) || row.average_recovery_strain_score <= medianStrain) && (!Number.isFinite(row.regression_rate_pct) || row.regression_rate_pct <= 25));
    if (best.length < 3) best = rows.filter((row) => !Number.isFinite(row.regression_rate_pct) || row.regression_rate_pct <= 25).sort((left, right) => (right.improvement_rate_pct || 0) - (left.improvement_rate_pct || 0)).slice(0, Math.min(6, rows.length));
    const bestSets = best.map((row) => row.effective_hard_sets);
    const bestFrequency = best.map((row) => row.session_exposure_count);
    const recoverable = rows.filter((row) => (!Number.isFinite(row.average_recovery_strain_score) || row.average_recovery_strain_score < 60) && (!Number.isFinite(row.regression_rate_pct) || row.regression_rate_pct <= 25));
    const observed = { min: round(quantile(bestSets, 0.25), 1), max: round(quantile(bestSets, 0.75), 1) };
    const frequency = { min: Math.max(1, Math.floor(quantile(bestFrequency, 0.25) || 1)), max: Math.max(1, Math.ceil(quantile(bestFrequency, 0.75) || 1)) };
    const upper = recoverable.length ? round(Math.max(...recoverable.map((row) => row.effective_hard_sets)), 1) : null;
    const range = dateRange(rows, "week_start");
    const topExercises = muscleGroupRankings.filter((ranking) => ranking.muscle_group === muscle && ranking.rank != null).sort((left, right) => left.rank - right.rank).slice(0, 3).map((ranking) => ({ exercise_id: ranking.exercise_id, exercise_name: ranking.exercise_name, rank: ranking.rank, muscle_role: ranking.muscle_role }));
    results.push({
      muscle_sweet_spot_id: stableId("muscle_sweet_spot", muscle, methodologyVersion),
      muscle_group: muscle,
      observed_best_effective_hard_sets_per_week: observed,
      recommended_starting_effective_hard_sets_per_week: Number.isFinite(observed.min) ? Math.max(1, Math.floor(observed.min)) : null,
      recommended_normal_effective_hard_sets_per_week: { min: Number.isFinite(observed.min) ? Math.max(1, Math.floor(observed.min)) : null, max: Number.isFinite(observed.max) ? Math.ceil(observed.max) : null },
      highest_recoverable_effective_hard_sets_observed: upper,
      observed_best_session_exposures_per_week: frequency,
      observed_best_hrv_ms: { min: round(quantile(best.map((row) => row.average_hrv_ms), 0.25), 1), max: round(quantile(best.map((row) => row.average_hrv_ms), 0.75), 1) },
      observed_best_sleep_minutes: { min: round(quantile(best.map((row) => row.average_sleep_minutes), 0.25), 0), max: round(quantile(best.map((row) => row.average_sleep_minutes), 0.75), 0) },
      observed_best_recovery_strain_score: round(mean(best.map((row) => row.average_recovery_strain_score)), 2),
      observed_best_improvement_rate_pct: round(mean(best.map((row) => row.improvement_rate_pct)), 2),
      observed_best_regression_rate_pct: round(mean(best.map((row) => row.regression_rate_pct)), 2),
      top_ranked_exercises: topExercises,
      reduce_volume_conditions: ["Two or more recovery markers are adverse relative to baseline.", "Two consecutive muscle-group exercise exposures stall or regress.", "Weekly effective sets exceed the highest recoverable observed value or jump materially above the prior six-week range."],
      source_date_range: { start_date: range.start, end_date: range.end },
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: rows.length,
      qualifying_best_week_count: best.length,
      confidence_level: rows.length >= 12 ? "Moderate confidence" : rows.length >= 4 ? "Low confidence" : "Insufficient personal evidence",
      missing_data_flags: sortedUnique(rows.flatMap((row) => String(row.missing_data_flags || "").split(";").filter(Boolean))),
      source_references: ["derived/weekly_muscle_volume_response.csv", "derived/muscle_group_rankings.csv"],
      notes: ["Effective sets use configurable secondary-muscle contribution weights; this is a broad operating range, not a precise causal optimum."]
    });
  }
  results.sort((left, right) => left.muscle_group.localeCompare(right.muscle_group));
  return results;
}

module.exports = { buildMuscleGroupSweetSpots, buildVolumeResponseSummary, buildWeeklyMuscleVolumeResponse };
