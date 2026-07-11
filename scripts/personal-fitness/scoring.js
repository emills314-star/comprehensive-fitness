"use strict";

const {
  clamp,
  coefficientOfVariation,
  dateRange,
  daysBetween,
  groupBy,
  mean,
  median,
  quantile,
  round,
  sortedUnique,
  stableId,
  standardDeviation,
  weightedAverage
} = require("./utils");

function scorePctChanges(values, scale = 5) {
  const center = median(values.filter(Number.isFinite));
  return Number.isFinite(center) ? clamp(50 + (center * scale), 0, 100) : 50;
}

function sampleSizeScore(count) {
  if (count < 3) return 10;
  if (count <= 5) return 35;
  if (count <= 11) return 60;
  return clamp(85 + ((count - 12) / 24 * 15), 85, 100);
}

function confidenceLabel(score, exposureCount, spanDays, config) {
  const thresholds = config.confidence || {};
  if (exposureCount <= Number(thresholds.insufficient_exposures_max ?? 2)) return "Insufficient personal evidence";
  if (score >= Number(thresholds.high_score_min ?? 75)
    && exposureCount >= Number(thresholds.potential_high_exposures_min ?? 12)
    && spanDays >= Number(thresholds.meaningful_span_days ?? 56)) return "High confidence";
  if (score >= Number(thresholds.moderate_score_min ?? 50) && exposureCount >= Number(thresholds.moderate_exposures_min ?? 6)) return "Moderate confidence";
  if (score >= Number(thresholds.low_score_min ?? 25)) return "Low confidence";
  return "Insufficient personal evidence";
}

function outcomeRateScore(outcomes) {
  if (!outcomes.length) return 50;
  const improved = outcomes.filter((outcome) => outcome === "improved").length / outcomes.length;
  const regressed = outcomes.filter((outcome) => outcome === "regressed").length / outcomes.length;
  return clamp(50 + (50 * (improved - regressed)), 0, 100);
}

function nutritionAssociationScore(metrics) {
  const measured = metrics.filter((metric) => Number.isFinite(metric.rolling_7d_calories_observed) && ["improved", "held", "regressed"].includes(metric.progression_status));
  const improved = measured.filter((metric) => metric.progression_status === "improved");
  const regressed = measured.filter((metric) => metric.progression_status === "regressed");
  let score = 50;
  const associations = [];
  if (improved.length >= 2 && regressed.length >= 2) {
    const calorieDifference = median(improved.map((metric) => metric.rolling_7d_calories_observed)) - median(regressed.map((metric) => metric.rolling_7d_calories_observed));
    const proteinDifference = median(improved.map((metric) => metric.rolling_7d_protein_g_observed)) - median(regressed.map((metric) => metric.rolling_7d_protein_g_observed));
    const carbohydrateDifference = median(improved.map((metric) => metric.rolling_7d_carbohydrates_g_observed)) - median(regressed.map((metric) => metric.rolling_7d_carbohydrates_g_observed));
    if (Number.isFinite(calorieDifference)) {
      score += clamp(calorieDifference / 20, -20, 20);
      associations.push(`Improved exposures had a ${round(calorieDifference, 1)} kcal seven-day-average difference versus regressed exposures.`);
    }
    if (Number.isFinite(proteinDifference)) {
      score += clamp(proteinDifference / 5, -8, 8);
      associations.push(`Protein difference was ${round(proteinDifference, 1)} g/day.`);
    }
    if (Number.isFinite(carbohydrateDifference)) {
      score += clamp(carbohydrateDifference / 10, -10, 10);
      associations.push(`Carbohydrate difference was ${round(carbohydrateDifference, 1)} g/day.`);
    }
  }
  const context = metrics.filter((metric) => Number.isFinite(metric.context_daily_calorie_target) && ["improved", "held", "regressed"].includes(metric.progression_status));
  const highTarget = context.filter((metric) => metric.context_daily_calorie_target >= 1900);
  const lowTarget = context.filter((metric) => metric.context_daily_calorie_target <= 1800);
  if (highTarget.length >= 2 && lowTarget.length >= 2) {
    const highOutcome = outcomeRateScore(highTarget.map((metric) => metric.progression_status));
    const lowOutcome = outcomeRateScore(lowTarget.map((metric) => metric.progression_status));
    score += clamp((highOutcome - lowOutcome) * 0.2, -10, 10);
    associations.push(`User-reported higher-target versus lower-target outcome-score difference: ${round(highOutcome - lowOutcome, 1)} points.`);
  }
  return {
    score: round(clamp(score, 0, 100), 2),
    measured_session_count: measured.length,
    context_session_count: context.length,
    evidence_summary: associations.length ? associations.join(" ") : "Insufficient within-exercise nutrition coverage for a stable association; neutral score used.",
    evidence_level: measured.length >= 6 ? "measured_daily_totals" : context.length >= 4 ? "period_target_context" : "insufficient"
  };
}

function scoreExercises({ exerciseSessionMetrics, workoutRecords, aliases, config, analysisDate, methodologyVersion }) {
  const aliasById = new Map(aliases.map((alias) => [alias.exercise_id, alias]));
  const recordsByExercise = groupBy(workoutRecords.filter((record) => record.is_working_set), "exercise_id");
  const scoreRows = [];
  for (const [exerciseId, metrics] of groupBy(exerciseSessionMetrics, "exercise_id")) {
    metrics.sort((left, right) => left.workout_date.localeCompare(right.workout_date));
    const alias = aliasById.get(exerciseId) || {};
    const records = recordsByExercise.get(exerciseId) || [];
    const progressionRecords = records.filter((record) => record.analysis_progression_eligible !== false);
    const comparable = metrics.filter((metric) => ["improved", "held", "regressed"].includes(metric.progression_status));
    const outcomes = comparable.map((metric) => metric.progression_status);
    const improvedCount = outcomes.filter((outcome) => outcome === "improved").length;
    const heldCount = outcomes.filter((outcome) => outcome === "held").length;
    const regressedCount = outcomes.filter((outcome) => outcome === "regressed").length;
    const outcomeComponent = outcomeRateScore(outcomes);
    const changeComponent = scorePctChanges(comparable.map((metric) => metric.progression_pct_vs_prior), 5);
    const topComponent = scorePctChanges(comparable.map((metric) => metric.top_set_progression_pct), 5);
    const backoffComponent = scorePctChanges(comparable.map((metric) => metric.backoff_progression_pct), 5);
    const maxPlateau = Math.max(...metrics.map((metric) => metric.plateau_duration_exposures || 0), 0);
    const regressionRate = comparable.length ? regressedCount / comparable.length : 0;
    const stallAvoidance = clamp(100 - (regressionRate * 60) - Math.min(30, maxPlateau * 5), 0, 100);
    const progressionWeights = config.score_weights?.progression || {};
    const progressionScore = round(weightedAverage([
      { value: outcomeComponent, weight: progressionWeights.outcome_rate ?? 0.25 },
      { value: changeComponent, weight: progressionWeights.total_performance_change ?? 0.25 },
      { value: topComponent, weight: progressionWeights.top_set ?? 0.2 },
      { value: backoffComponent, weight: progressionWeights.backoff_set ?? 0.15 },
      { value: stallAvoidance, weight: progressionWeights.stall_avoidance ?? 0.15 }
    ]), 2);

    const repConfig = config.productive_rep_range || {};
    const bodyweightResistance = ["bodyweight", "assisted_bodyweight", "band"].includes(alias.resistance_type);
    const lowerRep = bodyweightResistance ? Number(repConfig.bodyweight_min ?? 5) : Number(repConfig.external_resistance_min ?? 5);
    const upperRep = bodyweightResistance ? Number(repConfig.bodyweight_max ?? 40) : Number(repConfig.external_resistance_max ?? 30);
    const repEligible = progressionRecords.filter((record) => Number.isFinite(record.repetitions));
    const productiveRepScore = alias.progression_metric === "duration" ? 50 : repEligible.length ? round(repEligible.filter((record) => record.repetitions >= lowerRep && record.repetitions <= upperRep).length / repEligible.length * 100, 2) : 50;
    const setQualityScore = metrics.length ? round(clamp(100 - (metrics.reduce((total, metric) => total + metric.set_quality_review_count, 0) / Math.max(1, records.length) * 100), 0, 100), 2) : 50;
    const gaps = metrics.map((metric) => metric.days_since_prior_exposure).filter((gap) => Number.isFinite(gap) && gap <= Number(config.progression?.max_comparable_gap_days ?? 56));
    const gapCv = coefficientOfVariation(gaps);
    const frequencyRepeatability = Number.isFinite(gapCv) ? clamp(100 - (gapCv * 100), 0, 100) : 50;
    const hypertrophyWeights = config.score_weights?.hypertrophy_support || {};
    let hypertrophySupportScore = weightedAverage([
      { value: progressionScore, weight: hypertrophyWeights.progression ?? 0.45 },
      { value: productiveRepScore, weight: hypertrophyWeights.productive_rep_range ?? 0.2 },
      { value: setQualityScore, weight: hypertrophyWeights.set_quality ?? 0.15 },
      { value: frequencyRepeatability, weight: hypertrophyWeights.frequency_repeatability ?? 0.1 },
      { value: null, weight: hypertrophyWeights.direct_evidence ?? 0.1 }
    ]);
    if (alias.exercise_kind === "non_resistance") hypertrophySupportScore = 0;
    hypertrophySupportScore = round(hypertrophySupportScore, 2);

    const strainValues = metrics.map((metric) => metric.recovery_strain_score).filter(Number.isFinite);
    const averageStrain = mean(strainValues);
    const recoveryTolerance = Number.isFinite(averageStrain) ? clamp(100 - averageStrain, 0, 100) : 50;
    const recoveryWeights = config.score_weights?.recovery_efficiency || {};
    const recoveryEfficiencyScore = round(weightedAverage([
      { value: progressionScore, weight: recoveryWeights.progression_benefit ?? 0.55 },
      { value: recoveryTolerance, weight: recoveryWeights.recovery_tolerance ?? 0.45 }
    ]), 2);

    const progressionSd = standardDeviation(comparable.map((metric) => metric.progression_pct_vs_prior));
    const performanceVarianceScore = Number.isFinite(progressionSd) ? clamp(100 - (progressionSd * 5), 0, 100) : 50;
    const setCountCv = coefficientOfVariation(metrics.map((metric) => metric.working_set_count));
    const setConsistencyScore = Number.isFinite(setCountCv) ? clamp(100 - (setCountCv * 100), 0, 100) : 50;
    const rpeCompleteness = records.length ? records.filter((record) => Number.isFinite(record.rpe)).length / records.length : 0;
    const repeatabilityWeights = config.score_weights?.repeatability || {};
    const repeatabilityScore = round(weightedAverage([
      { value: performanceVarianceScore, weight: repeatabilityWeights.performance_variance ?? 0.35 },
      { value: setConsistencyScore, weight: repeatabilityWeights.set_consistency ?? 0.2 },
      { value: rpeCompleteness * 100, weight: repeatabilityWeights.rpe_completion ?? 0.15 },
      { value: frequencyRepeatability, weight: repeatabilityWeights.retention ?? 0.2 },
      { value: null, weight: repeatabilityWeights.pain_free_notes ?? 0.1 }
    ]), 2);

    const nutrition = nutritionAssociationScore(metrics);
    const range = dateRange(metrics, "workout_date");
    const spanDays = range.start && range.end ? daysBetween(range.start, range.end) : 0;
    const recoveryCompleteness = metrics.length ? metrics.filter((metric) => Number.isFinite(metric.recovery_strain_score)).length / metrics.length : 0;
    const nutritionCompleteness = metrics.length ? metrics.filter((metric) => Number.isFinite(metric.observed_daily_calories)).length / metrics.length : 0;
    const mappingConsistency = alias.mapping_source === "fallback_rule" ? 80 : 100;
    const confidenceWeights = config.score_weights?.confidence || {};
    const dataConfidenceScore = round(weightedAverage([
      { value: sampleSizeScore(metrics.length), weight: confidenceWeights.sample_size ?? 0.4 },
      { value: clamp(spanDays / 84 * 100, 0, 100), weight: confidenceWeights.observation_span ?? 0.15 },
      { value: rpeCompleteness * 100, weight: confidenceWeights.rpe_completeness ?? 0.15 },
      { value: recoveryCompleteness * 100, weight: confidenceWeights.recovery_completeness ?? 0.15 },
      { value: nutritionCompleteness * 100, weight: confidenceWeights.nutrition_completeness ?? 0.05 },
      { value: mappingConsistency, weight: confidenceWeights.variation_consistency ?? 0.1 }
    ]), 2);
    const confidence = confidenceLabel(dataConfidenceScore, metrics.length, spanDays, config);
    const overallWeights = config.score_weights?.overall || {};
    const rawOverall = round(weightedAverage([
      { value: progressionScore, weight: overallWeights.progression_score ?? 0.3 },
      { value: hypertrophySupportScore, weight: overallWeights.hypertrophy_support_score ?? 0.25 },
      { value: recoveryEfficiencyScore, weight: overallWeights.recovery_efficiency_score ?? 0.2 },
      { value: repeatabilityScore, weight: overallWeights.repeatability_score ?? 0.15 },
      { value: nutrition.score, weight: overallWeights.nutrition_support_score ?? 0.1 }
    ]), 2);
    const adjustment = config.score_weights?.confidence_adjustment || {};
    const priorScore = Number(adjustment.prior_score ?? 50);
    const shrunk = priorScore + ((rawOverall - priorScore) * dataConfidenceScore / 100);
    const overallPersonalScore = round((shrunk * Number(adjustment.shrunk_performance_weight ?? 0.8)) + (dataConfidenceScore * Number(adjustment.confidence_weight ?? 0.2)), 2);
    const highFatigueProductiveCount = metrics.filter((metric) => metric.recovery_strain_score >= 60 && metric.progression_status === "improved").length;
    const highFatigueUnproductiveCount = metrics.filter((metric) => metric.recovery_strain_score >= 60 && ["held", "regressed"].includes(metric.progression_status)).length;
    const limitationList = [
      "No exercise-attributable direct muscle-size measurement exists during the set-level history.",
      recoveryCompleteness < 0.5 ? "Post-workout recovery coverage is incomplete." : "Recovery attribution is shared by every exercise in the session.",
      nutritionCompleteness < 0.5 ? "Observed workout-day calorie coverage is incomplete." : "Daily nutrition totals do not establish meal timing or causation.",
      alias.mapping_source === "fallback_rule" ? "Muscle mapping was inferred from the recorded exercise name and should be reviewed." : null,
      alias.equipment_identity_status?.includes("unconfirmed") ? "Machine/equipment identity is unconfirmed; loads are comparable only within this recorded variation." : null
    ].filter(Boolean);
    const reasonParts = [
      `${improvedCount}/${Math.max(1, comparable.length)} comparable transitions improved and ${regressedCount}/${Math.max(1, comparable.length)} regressed.`,
      Number.isFinite(averageStrain) ? `Mean multi-marker following-day strain was ${round(averageStrain, 1)}/100.` : "Following-day strain coverage was insufficient.",
      `Confidence-adjusted overall score ${overallPersonalScore}/100 from ${metrics.length} exposures.`
    ];
    scoreRows.push({
      exercise_score_id: stableId("exercise_score", exerciseId, methodologyVersion),
      exercise_id: exerciseId,
      exercise_name: metrics[0].exercise_name,
      exercise_name_recorded: metrics[0].exercise_name_recorded,
      exercise_variation: metrics[0].exercise_variation,
      primary_muscle_group: metrics[0].primary_muscle_group,
      resistance_type: metrics[0].resistance_type,
      exercise_kind: metrics[0].exercise_kind,
      research_exercise_id: metrics[0].research_exercise_id,
      progression_score: progressionScore,
      hypertrophy_support_score: hypertrophySupportScore,
      recovery_efficiency_score: recoveryEfficiencyScore,
      repeatability_score: repeatabilityScore,
      nutrition_support_score: nutrition.score,
      data_confidence_score: dataConfidenceScore,
      raw_overall_personal_exercise_score: rawOverall,
      overall_personal_exercise_score: overallPersonalScore,
      confidence_level: confidence,
      session_count: metrics.length,
      comparable_session_count: comparable.length,
      working_set_count: records.length,
      hard_set_count: records.filter((record) => record.hard_set).length,
      source_date_start: range.start,
      source_date_end: range.end,
      observation_span_days: spanDays,
      improved_transition_count: improvedCount,
      held_transition_count: heldCount,
      regressed_transition_count: regressedCount,
      improvement_rate_pct: comparable.length ? round(improvedCount / comparable.length * 100, 2) : null,
      regression_rate_pct: comparable.length ? round(regressedCount / comparable.length * 100, 2) : null,
      median_progression_pct: round(median(comparable.map((metric) => metric.progression_pct_vs_prior)), 3),
      maximum_plateau_exposures: maxPlateau,
      maximum_regression_streak: Math.max(...metrics.map((metric) => metric.regression_duration_exposures || 0), 0),
      average_recovery_strain_score: round(averageStrain, 2),
      recovery_observation_count: strainValues.length,
      high_fatigue_productive_count: highFatigueProductiveCount,
      high_fatigue_unproductive_count: highFatigueUnproductiveCount,
      productive_rep_range_pct: productiveRepScore,
      rpe_completeness_pct: round(rpeCompleteness * 100, 2),
      recovery_completeness_pct: round(recoveryCompleteness * 100, 2),
      nutrition_completeness_pct: round(nutritionCompleteness * 100, 2),
      direct_evidence_grade: "none_attributable",
      evidence_basis: "performance_proxy_and_productive_training_indicators",
      classification_flags: [progressionScore >= 65 && recoveryEfficiencyScore < 50 ? "strong_progression_high_recovery_cost" : null, recoveryEfficiencyScore >= 65 && progressionScore < 50 ? "good_recovery_weak_progression" : null, highFatigueProductiveCount > 0 ? "high_fatigue_productive_examples" : null, highFatigueUnproductiveCount > 0 ? "high_fatigue_unproductive_examples" : null, alias.exercise_kind === "non_resistance" ? "non_resistance_excluded_from_hypertrophy_ranking" : null].filter(Boolean).join(";"),
      nutrition_evidence_level: nutrition.evidence_level,
      nutrition_evidence_summary: nutrition.evidence_summary,
      main_reason_for_score: reasonParts.join(" "),
      important_limitations: limitationList.join(" "),
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: metrics.length,
      missing_data_flags: [recoveryCompleteness < 1 ? "recovery" : null, nutritionCompleteness < 1 ? "nutrition" : null, "direct_hypertrophy_measurement", rpeCompleteness < 1 ? "rpe" : null].filter(Boolean).join(";"),
      source_references: sortedUnique(metrics.flatMap((metric) => String(metric.source_references || "").split(";").filter(Boolean))).join(";"),
      notes: "Scores are associative personal estimates, not proof of exercise-caused hypertrophy. Confidence adjustment shrinks sparse results toward a 50-point prior and also rewards data support."
    });
  }
  scoreRows.sort((left, right) => right.overall_personal_exercise_score - left.overall_personal_exercise_score || right.data_confidence_score - left.data_confidence_score);
  return scoreRows;
}

function buildMuscleScoresAndRankings({ exerciseScores, exerciseSessionMetrics, aliases, muscleMap, analysisDate, methodologyVersion, config }) {
  const scoreByExercise = new Map(exerciseScores.map((score) => [score.exercise_id, score]));
  const metricsByExercise = groupBy(exerciseSessionMetrics, "exercise_id");
  const aliasByExercise = new Map(aliases.map((alias) => [alias.exercise_id, alias]));
  const rows = [];
  for (const mapping of muscleMap) {
    const score = scoreByExercise.get(mapping.exercise_id);
    if (!score) continue;
    const metrics = metricsByExercise.get(mapping.exercise_id) || [];
    const alias = aliasByExercise.get(mapping.exercise_id) || {};
    const mechanicalContributionScore = clamp(50 + (50 * Number(mapping.contribution_weight || 0)), 0, 100);
    const weights = config.score_weights?.muscle_specific || {};
    const muscleEffectiveness = round(weightedAverage([
      { value: score.overall_personal_exercise_score, weight: weights.overall_personal_exercise_score ?? 0.55 },
      { value: mechanicalContributionScore, weight: weights.mechanical_contribution_score ?? 0.45 }
    ]), 2);
    const setCounts = metrics.map((metric) => metric.working_set_count);
    const repetitions = metrics.flatMap((metric) => metric.set_repetitions || []).filter(Number.isFinite);
    const loads = metrics.flatMap((metric) => metric.set_loads || []).filter(Number.isFinite);
    const rpes = metrics.flatMap((metric) => metric.set_rpes || []).filter(Number.isFinite);
    const days = metrics.map((metric) => metric.days_since_prior_exposure).filter((value) => Number.isFinite(value) && value <= 56);
    rows.push({
      exercise_muscle_score_id: stableId("exercise_muscle_score", mapping.exercise_id, mapping.muscle_group, methodologyVersion),
      exercise_id: mapping.exercise_id,
      exercise_name: score.exercise_name,
      exercise_variation: score.exercise_variation,
      muscle_group: mapping.muscle_group,
      muscle_role: mapping.role,
      regional_function: mapping.regional_function,
      contribution_weight: mapping.contribution_weight,
      research_muscle_group_id: mapping.research_muscle_group_id,
      overall_score: score.overall_personal_exercise_score,
      muscle_specific_effectiveness_score: muscleEffectiveness,
      mechanical_contribution_score: round(mechanicalContributionScore, 2),
      progression_score: score.progression_score,
      recovery_efficiency_score: score.recovery_efficiency_score,
      confidence_level: score.confidence_level,
      comparable_sessions: score.comparable_session_count,
      session_count: score.session_count,
      source_date_start: score.source_date_start,
      source_date_end: score.source_date_end,
      typical_sets_per_session: round(median(setCounts), 1),
      typical_rep_range_min: round(quantile(repetitions, 0.25), 1),
      typical_rep_range_max: round(quantile(repetitions, 0.75), 1),
      typical_load_range_min: round(quantile(loads, 0.25), 1),
      typical_load_range_max: round(quantile(loads, 0.75), 1),
      typical_rpe_min: round(quantile(rpes, 0.25), 1),
      typical_rpe_max: round(quantile(rpes, 0.75), 1),
      typical_weekly_frequency: days.length ? round(7 / median(days), 2) : null,
      typical_exercise_order: round(median(metrics.map((metric) => metric.exercise_order)), 1),
      average_recovery_response: score.average_recovery_strain_score,
      muscle_specific_rank: null,
      ranking_category: null,
      redundancy_flag: false,
      regional_substitution_warning: mapping.substitution_notes,
      main_reason_for_ranking: `${mapping.role} contribution (${mapping.contribution_weight}) combined with personal overall score ${score.overall_personal_exercise_score} and progression score ${score.progression_score}.`,
      important_limitations: score.important_limitations,
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: score.session_count,
      missing_data_flags: score.missing_data_flags,
      source_references: score.source_references,
      notes: mapping.substitution_notes || "Muscle-specific score combines observed exercise response with an explicit mechanical-contribution prior."
    });
  }

  const rankingRows = [];
  for (const [muscleGroup, groupRows] of groupBy(rows, "muscle_group")) {
    const eligible = groupRows.filter((row) => row.confidence_level !== "Insufficient personal evidence" && aliasByExercise.get(row.exercise_id)?.exercise_kind !== "non_resistance");
    eligible.sort((left, right) => right.muscle_specific_effectiveness_score - left.muscle_specific_effectiveness_score || right.comparable_sessions - left.comparable_sessions);
    const comparisonBest = new Map();
    eligible.forEach((row, index) => {
      row.muscle_specific_rank = index + 1;
      row.ranking_category = index === 0 ? "best_ranked" : index === 1 ? "second_ranked" : index === 2 ? "third_ranked" : "remaining_ranked";
      const group = aliasByExercise.get(row.exercise_id)?.comparison_group || row.exercise_id;
      if (!comparisonBest.has(group)) comparisonBest.set(group, row.exercise_id);
      else if (comparisonBest.get(group) !== row.exercise_id) row.redundancy_flag = true;
    });
    groupRows.filter((row) => !eligible.includes(row)).forEach((row) => { row.ranking_category = "insufficient_evidence"; });
    for (const row of [...eligible, ...groupRows.filter((item) => !eligible.includes(item))]) {
      const score = scoreByExercise.get(row.exercise_id);
      const flags = [
        score.progression_score >= 65 && score.recovery_efficiency_score < 50 ? "strong_progression_high_recovery_cost" : null,
        score.recovery_efficiency_score >= 65 && score.progression_score < 50 ? "good_recovery_weak_progression" : null,
        row.redundancy_flag ? "potentially_redundant_same_family" : null,
        row.ranking_category === "insufficient_evidence" ? "insufficient_evidence" : null
      ].filter(Boolean);
      rankingRows.push({
        ranking_id: stableId("muscle_rank", muscleGroup, row.exercise_id, methodologyVersion),
        muscle_group: muscleGroup,
        rank: row.muscle_specific_rank,
        ranking_category: row.ranking_category,
        exercise_id: row.exercise_id,
        exercise_name: row.exercise_name,
        exercise_variation: row.exercise_variation,
        muscle_role: row.muscle_role,
        regional_function: row.regional_function,
        overall_score: row.overall_score,
        muscle_specific_effectiveness_score: row.muscle_specific_effectiveness_score,
        progression_score: row.progression_score,
        recovery_efficiency_score: row.recovery_efficiency_score,
        confidence_level: row.confidence_level,
        comparable_sessions: row.comparable_sessions,
        session_count: row.session_count,
        source_date_start: row.source_date_start,
        source_date_end: row.source_date_end,
        typical_sets_per_session: row.typical_sets_per_session,
        typical_rep_range_min: row.typical_rep_range_min,
        typical_rep_range_max: row.typical_rep_range_max,
        typical_load_range_min: row.typical_load_range_min,
        typical_load_range_max: row.typical_load_range_max,
        typical_rpe_min: row.typical_rpe_min,
        typical_rpe_max: row.typical_rpe_max,
        typical_weekly_frequency: row.typical_weekly_frequency,
        typical_exercise_order: row.typical_exercise_order,
        average_recovery_response: row.average_recovery_response,
        category_flags: flags.join(";"),
        main_reason_for_ranking: row.main_reason_for_ranking,
        important_limitations: row.important_limitations,
        regional_substitution_warning: row.regional_substitution_warning,
        analysis_date: analysisDate,
        methodology_version: methodologyVersion,
        sample_size: row.sample_size,
        missing_data_flags: row.missing_data_flags,
        source_references: row.source_references,
        notes: row.notes
      });
    }
  }
  rankingRows.sort((left, right) => left.muscle_group.localeCompare(right.muscle_group) || (left.rank ?? 9999) - (right.rank ?? 9999) || right.muscle_specific_effectiveness_score - left.muscle_specific_effectiveness_score);
  return { exerciseMuscleScores: rows, muscleGroupRankings: rankingRows };
}

module.exports = { buildMuscleScoresAndRankings, confidenceLabel, scoreExercises };
