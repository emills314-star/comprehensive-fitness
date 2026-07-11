"use strict";

const {
  addDays,
  clamp,
  dateRange,
  groupBy,
  mean,
  median,
  mode,
  quantile,
  round,
  sortedUnique,
  stableId
} = require("./utils");

function numericRange(values, options = {}) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { min: null, max: null, sample_size: 0 };
  const min = options.full ? Math.min(...finite) : quantile(finite, options.lowerQuantile ?? 0.25);
  const max = options.full ? Math.max(...finite) : quantile(finite, options.upperQuantile ?? 0.75);
  return { min: round(min, options.digits ?? 2), max: round(max, options.digits ?? 2), sample_size: finite.length };
}

function integerRange(values, options = {}) {
  const range = numericRange(values, options);
  return { min: Number.isFinite(range.min) ? Math.max(0, Math.floor(range.min)) : null, max: Number.isFinite(range.max) ? Math.max(0, Math.ceil(range.max)) : null, sample_size: range.sample_size };
}

function widenRepRange(range, exerciseKind, config, bounds) {
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) return { min: null, max: null };
  const minimumWidth = Number(config.minimum_recommended_rep_range_width?.[exerciseKind] ?? config.minimum_recommended_rep_range_width?.isolation ?? 5);
  const lowerBound = Number.isFinite(bounds?.min) ? bounds.min : 1;
  const upperBound = Number.isFinite(bounds?.max) ? bounds.max : Number.POSITIVE_INFINITY;
  let min = clamp(Math.floor(range.min), lowerBound, upperBound);
  let max = clamp(Math.ceil(range.max), lowerBound, upperBound);
  while (max - min < minimumWidth) {
    const priorMin = min;
    const priorMax = max;
    if (min > lowerBound) min -= 1;
    if (max - min < minimumWidth && max < upperBound) max += 1;
    if (min === priorMin && max === priorMax) break;
  }
  return { min, max };
}

function productiveRepBounds(alias, config) {
  const ranges = config.productive_rep_range || {};
  const bodyweight = ["bodyweight", "assisted_bodyweight", "band"].includes(alias.resistance_type);
  return bodyweight
    ? { min: Number(ranges.bodyweight_min ?? 5), max: Number(ranges.bodyweight_max ?? 40) }
    : { min: Number(ranges.external_resistance_min ?? 5), max: Number(ranges.external_resistance_max ?? 30) };
}

function confidenceCode(label) {
  if (label === "High confidence") return "high";
  if (label === "Moderate confidence") return "moderate";
  if (label === "Low confidence") return "low";
  return "insufficient_personal_evidence";
}

function chooseBestSessions(metrics) {
  const comparable = metrics.filter((metric) => ["improved", "held", "regressed"].includes(metric.progression_status));
  let best = comparable.filter((metric) => metric.progression_status === "improved" && (!Number.isFinite(metric.recovery_strain_score) || metric.recovery_strain_score <= 60));
  if (best.length < 2) {
    const threshold = quantile(comparable.map((metric) => metric.performance_value), 0.6);
    best = comparable.filter((metric) => metric.progression_status !== "regressed" && (!Number.isFinite(threshold) || metric.performance_value >= threshold) && (!Number.isFinite(metric.recovery_strain_score) || metric.recovery_strain_score <= 70));
  }
  if (!best.length) best = metrics.filter((metric) => metric.progression_status !== "regressed").slice(-Math.min(3, metrics.length));
  return best;
}

function buildSweetSpots({ exerciseSessionMetrics, exerciseScores, aliases, config, analysisDate, methodologyVersion }) {
  const scoreByExercise = new Map(exerciseScores.map((score) => [score.exercise_id, score]));
  const aliasByExercise = new Map(aliases.map((alias) => [alias.exercise_id, alias]));
  const results = [];
  for (const [exerciseId, metrics] of groupBy(exerciseSessionMetrics, "exercise_id")) {
    metrics.sort((left, right) => left.workout_date.localeCompare(right.workout_date));
    const score = scoreByExercise.get(exerciseId);
    const alias = aliasByExercise.get(exerciseId) || {};
    if (!score || metrics.length < 3 || alias.exercise_kind === "non_resistance") continue;
    const recentCutoff = addDays(analysisDate, -548);
    const recentMetrics = metrics.filter((metric) => metric.workout_date >= recentCutoff);
    const latestComparisonSegment = metrics.at(-1)?.comparison_segment_number;
    const latestSegmentMetrics = Number.isFinite(latestComparisonSegment)
      ? metrics.filter((metric) => metric.comparison_segment_number === latestComparisonSegment)
      : [];
    const latestSegmentBest = chooseBestSessions(latestSegmentMetrics);
    const recentBest = chooseBestSessions(recentMetrics);
    const useLatestSegment = latestSegmentMetrics.length >= 3 && latestSegmentBest.length >= 3;
    const useRecentWindow = !useLatestSegment && recentBest.length >= 3;
    const best = useLatestSegment ? latestSegmentBest : useRecentWindow ? recentBest : chooseBestSessions(metrics);
    const recommendationPopulation = useLatestSegment ? latestSegmentMetrics : useRecentWindow ? recentMetrics : metrics;
    const selectionBasis = useLatestSegment
      ? `Latest comparable load/equipment segment (${latestComparisonSegment})`
      : useRecentWindow ? "Recent 18-month productive/recoverable sessions" : "Full-history productive/recoverable sessions because comparable recent evidence was sparse";
    const bestReps = best.flatMap((metric) => metric.set_repetitions || []).filter((value) => Number.isFinite(value) && value > 0);
    const bestSeconds = best.flatMap((metric) => metric.set_seconds || []).filter((value) => Number.isFinite(value) && value > 0);
    const bestLoads = best.flatMap((metric) => metric.set_loads || []).filter(Number.isFinite);
    const bestRpes = best.flatMap((metric) => metric.set_rpes || []).filter(Number.isFinite);
    const observedSets = integerRange(best.map((metric) => metric.working_set_count));
    const observedWeeklySets = integerRange(best.map((metric) => metric.weekly_hard_sets_exercise));
    const observedDays = numericRange(best.map((metric) => metric.days_since_prior_exposure), { digits: 1 });
    const observedReps = integerRange(bestReps, { lowerQuantile: 0.1, upperQuantile: 0.9 });
    const observedDuration = integerRange(bestSeconds, { lowerQuantile: 0.1, upperQuantile: 0.9 });
    const observedLoads = numericRange(bestLoads, { lowerQuantile: 0.1, upperQuantile: 0.9, digits: 2 });
    const observedRpe = numericRange(bestRpes, { lowerQuantile: 0.2, upperQuantile: 0.8, digits: 1 });
    const observedRest = integerRange(best.map((metric) => metric.median_rest_after_seconds));
    const observedOrder = numericRange(best.map((metric) => metric.exercise_order), { digits: 1 });
    const observedCalories = numericRange(best.map((metric) => metric.rolling_7d_calories_observed), { digits: 0 });
    const contextCalories = numericRange(best.map((metric) => metric.context_daily_calorie_target), { digits: 0 });
    const observedProtein = numericRange(best.map((metric) => metric.rolling_7d_protein_g_observed), { digits: 1 });
    const observedCarbohydrate = numericRange(best.map((metric) => metric.rolling_7d_carbohydrates_g_observed), { digits: 1 });
    const observedSleep = numericRange(best.map((metric) => metric.pre_workout_sleep_minutes), { digits: 0 });
    const observedHrv = numericRange(best.map((metric) => metric.pre_workout_hrv_ms), { digits: 1 });
    const observedRhr = numericRange(best.map((metric) => metric.pre_workout_resting_hr_bpm), { digits: 1 });
    const repBounds = productiveRepBounds(alias, config);
    const boundedRepObservations = bestReps.filter((value) => value >= repBounds.min && value <= repBounds.max);
    const recommendationRepObservations = boundedRepObservations.length ? integerRange(boundedRepObservations, { lowerQuantile: 0.1, upperQuantile: 0.9 }) : {
      min: Number.isFinite(observedReps.min) ? clamp(observedReps.min, repBounds.min, repBounds.max) : null,
      max: Number.isFinite(observedReps.max) ? clamp(observedReps.max, repBounds.min, repBounds.max) : null
    };
    const recommendedRep = alias.progression_metric === "duration" ? { min: null, max: null } : widenRepRange(recommendationRepObservations, alias.exercise_kind || "isolation", config, repBounds);
    const recommendedRpeMin = Number(config.plausibility?.recommended_rpe_min ?? 6);
    const recommendedRpeMax = Number(config.plausibility?.recommended_rpe_max ?? 9);
    const boundedRpes = bestRpes.filter((value) => value >= recommendedRpeMin && value <= recommendedRpeMax);
    const rpeRecommendationPopulation = boundedRpes.length
      ? boundedRpes
      : bestRpes.map((value) => clamp(value, recommendedRpeMin, recommendedRpeMax));
    const recommendedRpe = numericRange(rpeRecommendationPopulation, { lowerQuantile: 0.2, upperQuantile: 0.8, digits: 1 });
    const recoverable = recommendationPopulation.filter((metric) => (!Number.isFinite(metric.recovery_strain_score) || metric.recovery_strain_score < 60) && metric.next_exposure_progression_status !== "regressed");
    const highestRecoverableWeekly = recoverable.length ? Math.max(...recoverable.map((metric) => metric.weekly_hard_sets_exercise).filter(Number.isFinite), 0) : null;
    const highestRecoverableSession = recoverable.length ? Math.max(...recoverable.map((metric) => metric.working_set_count).filter(Number.isFinite), 0) : null;
    const highCost = metrics.filter((metric) => metric.recovery_strain_score >= 60);
    const poor = metrics.filter((metric) => metric.progression_status === "regressed");
    const topPattern = mode(best.map((metric) => `${metric.top_set_count} top / ${metric.back_off_set_count} back-off / ${metric.straight_working_set_count} straight`));
    const range = dateRange(metrics, "workout_date");
    const observedBestRange = {
      qualifying_sessions: best.length,
      selection_start_date: recommendationPopulation[0]?.workout_date || range?.start,
      selection_basis: selectionBasis,
      sets_per_session: observedSets,
      weekly_hard_sets: observedWeeklySets,
      days_between_exposures: observedDays,
      sessions_per_week: Number.isFinite(observedDays.min) && Number.isFinite(observedDays.max) ? { min: round(7 / observedDays.max, 2), max: round(7 / observedDays.min, 2) } : { min: null, max: null },
      repetitions: observedReps,
      duration_seconds: observedDuration,
      load_as_logged: observedLoads,
      rpe: observedRpe,
      rest_seconds: observedRest,
      exercise_order: observedOrder,
      top_and_backoff_pattern: topPattern,
      observed_7d_calories: observedCalories,
      user_reported_period_target_calories: contextCalories,
      observed_7d_protein_g: observedProtein,
      observed_7d_carbohydrates_g: observedCarbohydrate,
      pre_workout_sleep_minutes: observedSleep,
      pre_workout_hrv_ms: observedHrv,
      pre_workout_resting_hr_bpm: observedRhr
    };
    const recommendedFutureRange = {
      sets_per_session: { min: observedSets.min, max: Number.isFinite(observedSets.max) && Number.isFinite(highestRecoverableSession) ? Math.min(observedSets.max, highestRecoverableSession) : observedSets.max },
      weekly_hard_sets: { min: observedWeeklySets.min, max: Number.isFinite(observedWeeklySets.max) && Number.isFinite(highestRecoverableWeekly) ? Math.min(observedWeeklySets.max, highestRecoverableWeekly) : observedWeeklySets.max },
      sessions_per_week: observedBestRange.sessions_per_week,
      rep_range: recommendedRep,
      duration_seconds: alias.progression_metric === "duration" ? { min: observedDuration.min, max: observedDuration.max } : { min: null, max: null },
      rpe: { min: recommendedRpe.min, max: recommendedRpe.max },
      rest_seconds: { min: observedRest.min, max: observedRest.max },
      workout_placement_order: { min: observedOrder.min, max: observedOrder.max },
      days_between_exposures: { min: observedDays.min, max: observedDays.max },
      top_and_backoff_pattern: topPattern,
      recommendation_basis: "Based on recent productive/recoverable sessions when available, widened to avoid an artificial single-repetition target, and clamped to configured productive-repetition and recommendation-RPE guardrails. Observed values remain separately preserved."
    };
    results.push({
      sweet_spot_id: stableId("sweet_spot", exerciseId, methodologyVersion),
      exercise_id: exerciseId,
      exercise_name: score.exercise_name,
      primary_muscle_group: score.primary_muscle_group,
      observed_best_range: observedBestRange,
      recommended_future_range: recommendedFutureRange,
      highest_recoverable_range_observed: {
        max_sets_per_session: highestRecoverableSession,
        max_weekly_hard_sets: highestRecoverableWeekly,
        qualifying_sessions: recoverable.length,
        definition: "Highest observed volume followed by recovery strain under 60/100 when available and no regression in the next exposure."
      },
      recommended_starting_volume: {
        sets_per_session: observedSets.min,
        weekly_hard_sets: observedWeeklySets.min
      },
      normal_operating_range: {
        sets_per_session: recommendedFutureRange.sets_per_session,
        weekly_hard_sets: recommendedFutureRange.weekly_hard_sets
      },
      conditions_associated_with_poor_performance: {
        regressed_sessions: poor.length,
        median_pre_workout_adverse_signals: round(median(poor.map((metric) => metric.pre_workout_adverse_signal_count)), 1),
        median_recent_volume_pct_vs_prior_6weeks: round(median(poor.map((metric) => metric.recent_volume_pct_vs_prior_6weeks)), 1),
        low_calorie_target_sessions: poor.filter((metric) => Number.isFinite(metric.context_daily_calorie_target) && metric.context_daily_calorie_target <= 1750).length
      },
      conditions_associated_with_excessive_recovery_cost: {
        high_cost_sessions: highCost.length,
        high_cost_productive_sessions: highCost.filter((metric) => metric.progression_status === "improved").length,
        high_cost_unproductive_sessions: highCost.filter((metric) => ["held", "regressed"].includes(metric.progression_status)).length,
        median_strain_score: round(median(highCost.map((metric) => metric.recovery_strain_score)), 1)
      },
      volume_or_intensity_reduction_conditions: [
        "At least two converging personal-recovery markers are adverse relative to the 28-day baseline.",
        "Two consecutive comparable exposures stall or regress, especially when RPE also rises.",
        "Weekly hard sets exceed the observed recoverable maximum or rise materially above the prior six-week average.",
        "The same-load first-set repetition decline exceeds three at comparable RPE."
      ],
      direct_evidence_status: "No exercise-attributable direct hypertrophy measurement; range is based on performance and recovery proxies.",
      source_date_range: { start_date: range.start, end_date: range.end },
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: metrics.length,
      qualifying_best_session_count: best.length,
      confidence_level: score.confidence_level,
      confidence_score: score.data_confidence_score,
      missing_data_flags: sortedUnique(String(score.missing_data_flags || "").split(";").filter(Boolean)),
      source_references: sortedUnique(String(score.source_references || "").split(";").filter(Boolean)),
      notes: ["Observed best ranges are associative and machine-specific; broad ranges are retained when precision is unsupported."]
    });
  }
  return results;
}

function roleFor(score, alias) {
  if (score.confidence_level === "Insufficient personal evidence") return "technique_or_maintenance_lift";
  if (score.progression_score < 40 && score.recovery_efficiency_score < 50) return "remove_or_deprioritize";
  if (alias.exercise_kind === "compound" && score.progression_score >= 62 && score.recovery_efficiency_score >= 52) return "primary_progression_lift";
  if (score.progression_score >= 55 && score.overall_personal_exercise_score >= 58) return "secondary_hypertrophy_lift";
  if (alias.exercise_kind === "isolation" && score.recovery_efficiency_score >= 62) return "low_fatigue_accessory";
  if (score.recovery_efficiency_score >= 70 && score.progression_score < 50) return "deload_substitute";
  return "technique_or_maintenance_lift";
}

function observedLoadIncrement(metrics) {
  const sorted = [...metrics].sort((left, right) => left.workout_date.localeCompare(right.workout_date));
  const increments = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1].first_working_load;
    const current = sorted[index].first_working_load;
    if (Number.isFinite(previous) && Number.isFinite(current) && current > previous && previous > 0 && (current - previous) / previous <= 0.5) increments.push(current - previous);
  }
  if (!increments.length) return null;
  return round(Math.min(...increments), 2);
}

function buildPrescriptions({ exerciseScores, exerciseSessionMetrics, sweetSpots, aliases, muscleMap, muscleGroupRankings, personalContext, analysisDate, methodologyVersion }) {
  const metricsByExercise = groupBy(exerciseSessionMetrics, "exercise_id");
  const sweetByExercise = new Map(sweetSpots.map((sweet) => [sweet.exercise_id, sweet]));
  const aliasByExercise = new Map(aliases.map((alias) => [alias.exercise_id, alias]));
  const musclesByExercise = groupBy(muscleMap, "exercise_id");
  const prescriptions = [];
  for (const score of exerciseScores) {
    const alias = aliasByExercise.get(score.exercise_id) || {};
    if (alias.exercise_kind === "non_resistance") continue;
    const metrics = metricsByExercise.get(score.exercise_id) || [];
    const sweet = sweetByExercise.get(score.exercise_id);
    const mappings = musclesByExercise.get(score.exercise_id) || [];
    const primaryMapping = mappings.find((mapping) => mapping.role === "primary") || mappings[0];
    const role = roleFor(score, alias);
    const repRange = sweet?.recommended_future_range?.rep_range || { min: null, max: null };
    const rpeRange = sweet?.recommended_future_range?.rpe || { min: null, max: null };
    const rirRange = { min: Number.isFinite(rpeRange.max) ? round(10 - rpeRange.max, 1) : null, max: Number.isFinite(rpeRange.min) ? round(10 - rpeRange.min, 1) : null };
    const topCounts = metrics.map((metric) => metric.top_set_count).filter(Number.isFinite);
    const backoffCounts = metrics.map((metric) => metric.back_off_set_count).filter(Number.isFinite);
    const loadIncrement = observedLoadIncrement(metrics);
    const substituteIds = muscleGroupRankings
      .filter((row) => row.muscle_group === primaryMapping?.muscle_group && row.exercise_id !== score.exercise_id && row.rank != null)
      .sort((left, right) => left.rank - right.rank)
      .slice(0, 3)
      .map((row) => row.exercise_id);
    const confidenceFraction = round(score.data_confidence_score / 100, 4);
    const futureRange = sweet?.recommended_future_range || null;
    const finalRecommendation = {
      role,
      sets_per_session: futureRange?.sets_per_session || { min: null, max: null },
      weekly_sets: futureRange?.weekly_hard_sets || { min: null, max: null },
      rep_range: repRange,
      rpe: rpeRange
    };
    prescriptions.push({
      prescription_id: stableId("prescription", score.exercise_id, primaryMapping?.muscle_group || score.primary_muscle_group, methodologyVersion),
      exercise_id: score.exercise_id,
      exercise_name: score.exercise_name,
      research_exercise_id: score.research_exercise_id || null,
      muscle_group_id: primaryMapping?.muscle_group || score.primary_muscle_group,
      research_muscle_group_id: primaryMapping?.research_muscle_group_id || null,
      role,
      primary_muscle_group_id: primaryMapping?.muscle_group || score.primary_muscle_group,
      secondary_muscle_group_ids: mappings.filter((mapping) => mapping.role !== "primary").map((mapping) => mapping.muscle_group),
      recommended_sets_per_session: futureRange?.sets_per_session || { min: null, max: null },
      recommended_weekly_sets: futureRange?.weekly_hard_sets || { min: null, max: null },
      recommended_sessions_per_week: futureRange?.sessions_per_week || { min: null, max: null },
      recommended_rep_range: repRange,
      recommended_duration_seconds: futureRange?.duration_seconds || { min: null, max: null },
      recommended_rpe: rpeRange,
      recommended_rir: rirRange,
      recommended_rest_seconds: futureRange?.rest_seconds || { min: null, max: null },
      recommended_days_between_exposures: futureRange?.days_between_exposures || { min: null, max: null },
      recommended_workout_placement: Number.isFinite(futureRange?.workout_placement_order?.min) ? `Observed productive order ${futureRange.workout_placement_order.min}-${futureRange.workout_placement_order.max}; keep placement stable while testing progression.` : "Placement evidence insufficient; keep a consistent order for comparable tracking.",
      top_set_structure: { recommended_count: topCounts.length ? Math.round(median(topCounts)) : 0, rule: "Use a top set only when the observed successful structure included one; do not relabel straight sets as top sets." },
      backoff_set_structure: { recommended_count: backoffCounts.length ? Math.round(median(backoffCounts)) : 0, load_reduction_rule: "Use the exercise's observed successful reduction and keep it within the configured 25-30% related-set cap unless equipment dictates otherwise." },
      progression_rule: alias.progression_metric === "duration"
        ? `Add controlled seconds inside ${futureRange?.duration_seconds?.min ?? "the lower"}-${futureRange?.duration_seconds?.max ?? "the upper"} second range; increase difficulty only after the upper duration is repeatable without form loss.`
        : alias.progression_metric === "repetitions"
        ? `Add repetitions inside ${repRange.min ?? "the lower"}-${repRange.max ?? "the upper"} range at stable form/RPE; add external load only after the top of the range is repeatable.`
        : `Progress load after the comparable programmed sets reach ${repRange.max ?? "the top of the observed range"} repetitions without exceeding RPE ${rpeRange.max ?? "the observed upper bound"}; judge heavier-load/fewer-rep attempts by RPE-adjusted e1RM, not repetitions alone.`,
      recommended_load_increment: loadIncrement == null ? "No stable personal increment observed; use the smallest available equipment increment and re-establish comparability." : { value: loadIncrement, unit: "lb_as_logged", basis: "smallest observed positive first-working-set increment under 50%", machine_specific: true },
      repetition_fall_response: "Hold load and review when the same-load first set loses more than three repetitions at comparable RPE. A smaller fall can be held/repeated if adjusted performance remains inside the neutral band.",
      rpe_rise_response: "Hold load when RPE rises above the recommended range; reduce load only when the rise converges with poor recovery, repeated regression, or unacceptable set-quality loss.",
      stalled_exposure_response: "After two comparable stalled or regressing exposures, review recovery/nutrition and reduce one set or deload the exercise before adding load.",
      deload_rule: { trigger: "Two comparable stalls/regressions plus at least two adverse recovery/volume/nutrition indicators, or weekly volume below 30% of the prior week as an observed deload flag.", structure: "Reduce sets approximately 40-60%, keep technique practice, avoid failure/drop work, and resume after warm-ups normalize and comparable performance stops declining." },
      nutrition_conditions: {
        observed_best_7d_calorie_range: sweet?.observed_best_range?.observed_7d_calories || null,
        user_reported_period_target_range: sweet?.observed_best_range?.user_reported_period_target_calories || null,
        protein_context_g_per_day: personalContext.nutrition_context?.reported_protein_g_per_day || null,
        carbohydrate_observed_range: sweet?.observed_best_range?.observed_7d_carbohydrates_g || null,
        limitation: "2026 calorie targets are user-reported context rather than measured intake; no food-specific causal claim is made."
      },
      recovery_conditions: {
        pre_workout_sleep_minutes: sweet?.observed_best_range?.pre_workout_sleep_minutes || null,
        pre_workout_hrv_ms: sweet?.observed_best_range?.pre_workout_hrv_ms || null,
        pre_workout_resting_hr_bpm: sweet?.observed_best_range?.pre_workout_resting_hr_bpm || null,
        decision_rule: "Train as planned with zero or one adverse marker; use the multi-marker recovery rules when two or more converge."
      },
      substitute_exercise_ids: substituteIds,
      warning_signs: [
        "Two consecutive comparable stalls or regressions.",
        "Same-load repetition decline greater than three at comparable RPE.",
        "Repeated high multi-marker recovery strain without progression.",
        "Set-to-set rep loss or related-set load reduction beyond the configured 30% review cap.",
        "Pain or discomfort if newly recorded; current Strong export does not supply usable pain notes."
      ],
      observed_best_range: sweet?.observed_best_range || null,
      recommended_future_range: futureRange,
      highest_recoverable_range_observed: sweet?.highest_recoverable_range_observed || null,
      source_date_range: { start_date: score.source_date_start, end_date: score.source_date_end },
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: score.session_count,
      confidence_level: confidenceCode(score.confidence_level),
      confidence_score: score.data_confidence_score,
      missing_data_flags: sortedUnique(String(score.missing_data_flags || "").split(";").filter(Boolean).map((value) => value.replace(/[^a-z0-9_]+/g, "_"))),
      source_references: [{ source_id: "strong_workouts_export", source_path: "raw/strong_workouts (8).csv", worksheet: null, source_record_id: null, source_row: null, source_date: null, notes: "All matching exact exercise_id rows." }],
      notes: [score.important_limitations, "Prescription is a personal-data estimate and remains provisional where confidence is low."].filter(Boolean),
      evidence_summary: score.main_reason_for_score,
      integration_envelope: {
        personal_estimate: finalRecommendation,
        personal_confidence: confidenceFraction,
        personal_sample_size: score.session_count,
        research_default: { status: "not_integrated_in_this_task" },
        research_confidence: 0,
        personal_weight: 1,
        research_weight: 0,
        final_recommendation: { ...finalRecommendation, status: "provisional_personal_layer_research_not_integrated" },
        weighting_reason: "No research estimate was integrated in this task, so the active estimate is 100% personal while personal_confidence separately expresses its uncertainty. A later blend may assign nonzero research weight.",
        last_updated: analysisDate
      }
    });
  }
  return prescriptions;
}

function sessionDecisionRows(exerciseSessionMetrics) {
  const rows = [];
  for (const [sessionId, metrics] of groupBy(exerciseSessionMetrics, "session_id")) {
    const outcomes = metrics.filter((metric) => ["improved", "held", "regressed"].includes(metric.progression_status));
    const improved = outcomes.filter((metric) => metric.progression_status === "improved").length;
    const regressed = outcomes.filter((metric) => metric.progression_status === "regressed").length;
    rows.push({
      session_id: sessionId,
      date: metrics[0].workout_date,
      adverse_markers: Math.max(...metrics.map((metric) => metric.pre_workout_adverse_signal_count || 0), 0),
      recovery_marker_domains_available: Math.max(...metrics.map((metric) => metric.pre_workout_recovery_marker_available_count || 0), 0),
      recovery_data_sufficient: metrics.some((metric) => metric.pre_workout_recovery_marker_available_count >= 2),
      sleep_minutes: metrics[0].pre_workout_sleep_minutes,
      recent_volume_high: metrics.some((metric) => metric.recent_volume_pct_vs_prior_6weeks >= 20),
      prior_day_activity_high: metrics.some((metric) => metric.prior_day_steps_pct_vs_28d >= 25 || metric.prior_day_calories_burned_pct_vs_28d >= 15),
      prior_regression: metrics.some((metric) => metric.progression_status === "regressed"),
      repeated_regression: metrics.some((metric) => metric.regression_duration_exposures >= 2),
      low_calorie_context: metrics.some((metric) => Number.isFinite(metric.context_daily_calorie_target) && metric.context_daily_calorie_target <= 1750),
      recovery_strain: mean(metrics.map((metric) => metric.recovery_strain_score)),
      outcome: improved > regressed ? "successful" : regressed > improved ? "unsuccessful" : "mixed_or_held",
      source_references: sortedUnique(metrics.flatMap((metric) => String(metric.source_references || "").split(";").filter(Boolean)))
    });
  }
  return rows;
}

function buildRecoveryRules({ exerciseSessionMetrics, analysisDate, methodologyVersion }) {
  const sessions = sessionDecisionRows(exerciseSessionMetrics);
  const range = dateRange(sessions, "date");
  const recoveryDomainSignals = [
    { id: "hrv_below_personal_baseline", metric: "hrv_pct_vs_28d", comparator: "lte", threshold: -10, unit: "%", window: 28, required: false },
    { id: "resting_hr_above_personal_baseline", metric: "resting_hr_pct_vs_28d", comparator: "gte", threshold: 5, unit: "%", window: 28, required: false },
    { id: "sleep_below_personal_band", metric: "sleep_duration_pct_vs_28d", comparator: "lte", threshold: -15, unit: "%", window: 28, required: false },
    { id: "sleeping_hr_above_personal_baseline", metric: "sleeping_hr_pct_vs_28d", comparator: "gte", threshold: 5, unit: "%", window: 28, required: false }
  ];
  const specifications = [
    { id: "train_as_planned", name: "Train as planned", action: "train_as_planned", scope: "full_session", min: 3, match: (row) => row.recovery_data_sufficient && row.adverse_markers <= 1 && !row.repeated_regression, signals: [{ id: "recovery_data_sufficient", metric: "recovery_marker_domains_available", comparator: "gte", threshold: 2, unit: "domains", window: 28, required: true }, { id: "no_more_than_one_adverse_domain", metric: "adverse_marker_count", comparator: "lte", threshold: 1, unit: "domains", window: 28, required: true }, { id: "no_repeated_regression", metric: "consecutive_regressions", comparator: "lt", threshold: 2, unit: "exposures", window: null, required: true }], logic: { all: ["recovery_data_sufficient", "no_more_than_one_adverse_domain", "no_repeated_regression"] }, params: { load_change: "planned_progression_allowed_if_warmups_normal", volume_change_pct: 0 } },
    { id: "hold_load_constant", name: "Train but hold load constant", action: "hold_load_constant", scope: "exercise", min: 2, match: (row) => row.recovery_data_sufficient && row.adverse_markers >= 2 && !row.repeated_regression, signals: [...recoveryDomainSignals, { id: "no_repeated_regression", metric: "consecutive_regressions", comparator: "lt", threshold: 2, unit: "exposures", window: null, required: true }], logic: { at_least: 2, from: recoveryDomainSignals.map((signal) => signal.id), all: ["no_repeated_regression"] }, params: { load_change: 0, keep_sets_if_warmups_normal: true } },
    { id: "reduce_one_set", name: "Train but reduce one set", action: "reduce_one_set", scope: "exercise", min: 3, match: (row) => row.recovery_data_sufficient && row.adverse_markers >= 2 && (row.prior_regression || row.recent_volume_high || row.prior_day_activity_high), signals: [...recoveryDomainSignals, { id: "previous_performance_regression", metric: "previous_performance", comparator: "eq", threshold: "regressed", unit: null, window: null, required: false }, { id: "recent_volume_high", metric: "recent_volume_pct_vs_six_weeks", comparator: "gte", threshold: 20, unit: "%", window: 42, required: false }, { id: "prior_day_activity_high", metric: "prior_day_activity_pct_vs_28d", comparator: "gte", threshold: 25, unit: "%", window: 28, required: false }], logic: { at_least: 2, from: recoveryDomainSignals.map((signal) => signal.id), any: ["previous_performance_regression", "recent_volume_high", "prior_day_activity_high"] }, params: { sets_to_remove: 1, preserve_first_quality_set: true } },
    { id: "reduce_volume_percentage", name: "Reduce total volume", action: "reduce_volume_percentage", scope: "full_session", min: 3, match: (row) => row.recovery_data_sufficient && (row.adverse_markers >= 3 || (row.adverse_markers >= 2 && row.recent_volume_high && row.prior_regression)), signals: [...recoveryDomainSignals, { id: "recent_volume_high", metric: "recent_volume_pct_vs_six_weeks", comparator: "gte", threshold: 20, unit: "%", window: 42, required: false }, { id: "performance_regression", metric: "previous_performance", comparator: "eq", threshold: "regressed", unit: null, window: null, required: false }], logic: { any: [{ at_least: 3, from: recoveryDomainSignals.map((signal) => signal.id) }, { at_least: 2, from: recoveryDomainSignals.map((signal) => signal.id), all: ["recent_volume_high", "performance_regression"] }] }, params: { volume_reduction_pct: { min: 20, max: 30 } } },
    { id: "use_lighter_session", name: "Use a lighter session", action: "use_lighter_session", scope: "full_session", min: 3, match: (row) => row.recovery_data_sufficient && row.adverse_markers >= 3 && Number.isFinite(row.sleep_minutes) && row.sleep_minutes < 360, signals: [...recoveryDomainSignals, { id: "short_sleep", metric: "sleep_duration_minutes", comparator: "lt", threshold: 360, unit: "min", window: 28, required: true }], logic: { at_least: 3, from: recoveryDomainSignals.map((signal) => signal.id), all: ["short_sleep"] }, params: { avoid_failure_and_drop_sets: true, rpe_cap: 7 } },
    { id: "substitute_lower_fatigue_movement", name: "Substitute a lower-fatigue movement", action: "substitute_lower_fatigue_movement", scope: "exercise", min: 4, match: (row) => row.recovery_data_sufficient && row.adverse_markers >= 3 && row.prior_regression, signals: [...recoveryDomainSignals, { id: "performance_regression", metric: "previous_performance", comparator: "eq", threshold: "regressed", unit: null, window: null, required: true }], logic: { at_least: 3, from: recoveryDomainSignals.map((signal) => signal.id), all: ["performance_regression"] }, params: { use_best_ranked_lower_strain_substitute: true } },
    { id: "deload_exercise", name: "Deload the exercise", action: "deload_exercise", scope: "exercise", min: 3, match: (row) => row.recovery_data_sufficient && row.repeated_regression && row.adverse_markers >= 2, signals: [...recoveryDomainSignals, { id: "repeated_regression", metric: "consecutive_regressions", comparator: "gte", threshold: 2, unit: "exposures", window: null, required: true }], logic: { at_least: 2, from: recoveryDomainSignals.map((signal) => signal.id), all: ["repeated_regression"] }, params: { set_reduction_pct: { min: 40, max: 60 }, avoid_failure_and_drop_sets: true } },
    { id: "deload_muscle_group", name: "Deload the full muscle group", action: "deload_muscle_group", scope: "muscle_group", min: 4, match: (row) => row.recovery_data_sufficient && row.repeated_regression && row.adverse_markers >= 2 && row.recent_volume_high, signals: [...recoveryDomainSignals, { id: "repeated_regression", metric: "consecutive_regressions", comparator: "gte", threshold: 2, unit: "exposures", window: null, required: true }, { id: "recent_volume_high", metric: "recent_volume_pct_vs_six_weeks", comparator: "gte", threshold: 20, unit: "%", window: 42, required: true }], logic: { at_least: 2, from: recoveryDomainSignals.map((signal) => signal.id), all: ["repeated_regression", "recent_volume_high"] }, params: { set_reduction_pct: { min: 40, max: 60 }, duration_exposures: 1 } },
    { id: "delay_training", name: "Delay training", action: "delay_training", scope: "full_session", min: 3, match: (row) => row.recovery_data_sufficient && Number.isFinite(row.sleep_minutes) && row.sleep_minutes < 300 && row.adverse_markers >= 3, signals: [...recoveryDomainSignals, { id: "severe_short_sleep", metric: "sleep_duration_minutes", comparator: "lt", threshold: 300, unit: "min", window: 28, required: true }], logic: { at_least: 3, from: recoveryDomainSignals.map((signal) => signal.id), all: ["severe_short_sleep"] }, params: { reassess_after_hours: 24, allow_technique_or_walk_only: true } }
  ];
  return specifications.map((specification) => {
    const eligibleSessions = sessions.filter((session) => session.recovery_data_sufficient);
    const matched = eligibleSessions.filter(specification.match);
    const successful = matched.filter((row) => row.outcome === "successful").length;
    const unsuccessful = matched.filter((row) => row.outcome === "unsuccessful").length;
    const sample = matched.length;
    const confidence = sample >= 20 ? "moderate" : sample >= 5 ? "low" : "insufficient_personal_evidence";
    const confidenceScore = sample >= 20 ? 60 : sample >= 5 ? 35 : 15;
    return {
      rule_id: specification.id,
      rule_name: specification.name,
      scope: specification.scope,
      exercise_id: null,
      muscle_group_id: null,
      action: specification.action,
      signals: specification.signals.map((signal) => ({ signal_id: signal.id, metric: signal.metric, comparator: signal.comparator, threshold: signal.threshold, unit: signal.unit, baseline_window_days: signal.window, lookback_days: signal.metric === "consecutive_regressions" ? 56 : null, required: signal.required !== false, notes: "Recovery-domain signals are independent domains; sleep below baseline and sleep under six hours count as one sleep domain." })),
      minimum_converging_indicators: specification.min,
      trigger_logic: specification.logic,
      action_parameters: specification.params,
      historical_evidence: {
        eligible_observations: eligibleSessions.length,
        triggered_observations: sample,
        successful_outcomes: successful,
        unsuccessful_outcomes: unsuccessful,
        success_rate: successful + unsuccessful > 0 ? round(successful / (successful + unsuccessful), 4) : null,
        effect_summary: sample ? `Among ${sample} historical sessions matching the precondition, ${successful} had more improved than regressed exercise outcomes and ${unsuccessful} had more regressed than improved outcomes. This is not a randomized test of the proposed action.` : "No historical sessions matched this full precondition."
      },
      source_date_range: { start_date: range.start, end_date: range.end },
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: sample,
      confidence_level: confidence,
      confidence_score: confidenceScore,
      missing_data_flags: ["counterfactual_action_effect", "some_recovery_or_nutrition_days"],
      source_references: [{ source_id: "personal_linked_history", source_path: "derived/exercise_session_metrics.csv", worksheet: null, source_record_id: null, source_row: null, source_date: null, notes: "Session-level linked performance and recovery conditions." }],
      notes: ["Rule evidence quantifies matching historical conditions and outcomes, not proof that the recommended adjustment caused a better result.", "HRV, resting heart rate, soreness, and fatigue are never used alone."],
      integration_envelope: {
        personal_estimate: { trigger_observations: sample, action: specification.action },
        personal_confidence: round(confidenceScore / 100, 4),
        personal_sample_size: sample,
        research_default: { status: "not_integrated_in_this_task" },
        research_confidence: 0,
        personal_weight: 1,
        research_weight: 0,
        final_recommendation: { action: specification.action, status: "provisional_personal_rule_research_not_integrated" },
        weighting_reason: "No research estimate was integrated in this task, so the active rule is 100% personal while personal_confidence separately expresses its uncertainty. A later blend may assign nonzero research weight.",
        last_updated: analysisDate
      }
    };
  });
}

module.exports = { buildPrescriptions, buildRecoveryRules, buildSweetSpots, confidenceCode };
