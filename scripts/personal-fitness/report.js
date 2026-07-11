"use strict";

const { formatNumber, groupBy, mean, round, sortedUnique } = require("./utils");

function cell(value) {
  if (value == null || value === "") return "—";
  const text = Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)
  ].join("\n");
}

function pct(value) {
  return Number.isFinite(value) ? `${formatNumber(value, 1)}%` : "—";
}

function rangeText(range, suffix = "") {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return "—";
  return `${formatNumber(range.min, 1)}–${formatNumber(range.max, 1)}${suffix}`;
}

function progressionExamples(metrics, status, count = 12) {
  const filtered = metrics.filter((metric) => metric.progression_status === status && Number.isFinite(metric.progression_pct_vs_prior));
  return filtered.sort((left, right) => status === "improved" ? right.progression_pct_vs_prior - left.progression_pct_vs_prior : left.progression_pct_vs_prior - right.progression_pct_vs_prior).slice(0, count);
}

function compareAprilMayJune(periods) {
  const april = periods.find((period) => period.period_id === "april_2026");
  const may = periods.find((period) => period.period_id === "may_2026");
  const june = periods.find((period) => period.period_id === "june_2026");
  if (!april || !may || !june) return "The requested April–June comparison could not be constructed.";
  const laterImprovement = mean([may.improvement_rate_pct, june.improvement_rate_pct]);
  const laterRegression = mean([may.regression_rate_pct, june.regression_rate_pct]);
  const evidence = [];
  if (Number.isFinite(april.improvement_rate_pct) && Number.isFinite(laterImprovement)) evidence.push(`improvement rate ${formatNumber(april.improvement_rate_pct, 1)}% in April versus ${formatNumber(laterImprovement, 1)}% averaged across May/June`);
  if (Number.isFinite(april.regression_rate_pct) && Number.isFinite(laterRegression)) evidence.push(`regression rate ${formatNumber(april.regression_rate_pct, 1)}% versus ${formatNumber(laterRegression, 1)}%`);
  if (Number.isFinite(april.average_hrv_ms)) evidence.push(`mean HRV ${formatNumber(april.average_hrv_ms, 1)} ms (May ${formatNumber(may.average_hrv_ms, 1)}, June ${formatNumber(june.average_hrv_ms, 1)})`);
  if (Number.isFinite(april.average_sleep_minutes)) evidence.push(`mean sleep ${formatNumber(april.average_sleep_minutes / 60, 2)} h (May ${formatNumber(may.average_sleep_minutes / 60, 2)}, June ${formatNumber(june.average_sleep_minutes / 60, 2)})`);
  const supports = Number.isFinite(april.improvement_rate_pct) && Number.isFinite(laterImprovement) && april.improvement_rate_pct > laterImprovement + 5 && (!Number.isFinite(laterRegression) || april.regression_rate_pct <= laterRegression);
  const contradicts = Number.isFinite(april.improvement_rate_pct) && Number.isFinite(laterImprovement) && april.improvement_rate_pct + 5 < laterImprovement;
  const verdict = supports ? "The set-level history supports April as the stronger progression period" : contradicts ? "The set-level history contradicts the claim that April was stronger" : "The evidence is mixed and does not establish April as clearly superior";
  return `${verdict}: ${evidence.join("; ")}. The 1,950/1,750 kcal figures are user-reported targets, not measured intake, so this is an association rather than a calorie-causation finding.`;
}

function compareVolumeBands(summary) {
  const comparison = summary?.around_eight_vs_above_ten;
  if (!comparison || !comparison.around_eight_muscle_weeks || !comparison.above_ten_muscle_weeks) {
    return "The approximately-eight-versus-higher-volume hypothesis could not be tested with enough linked muscle-week observations.";
  }
  const favorableProgression = Number.isFinite(comparison.around_eight_improvement_rate_pct)
    && Number.isFinite(comparison.above_ten_improvement_rate_pct)
    && comparison.around_eight_improvement_rate_pct >= comparison.above_ten_improvement_rate_pct;
  const favorableRegression = Number.isFinite(comparison.around_eight_regression_rate_pct)
    && Number.isFinite(comparison.above_ten_regression_rate_pct)
    && comparison.around_eight_regression_rate_pct <= comparison.above_ten_regression_rate_pct;
  const favorableRecovery = Number.isFinite(comparison.around_eight_recovery_strain_score)
    && Number.isFinite(comparison.above_ten_recovery_strain_score)
    && comparison.around_eight_recovery_strain_score <= comparison.above_ten_recovery_strain_score;
  const favorableCount = [favorableProgression, favorableRegression, favorableRecovery].filter(Boolean).length;
  const verdict = favorableCount === 3
    ? "The personal muscle-week data support the lower-volume observation across progression, regression, and linked recovery strain"
    : favorableCount === 0
      ? "The personal muscle-week data do not support the lower-volume observation on the three prespecified comparisons"
      : "The personal muscle-week data provide mixed support for the lower-volume observation";
  const lowHrv = summary.hrv_36_to_44_weeks || {};
  return `${verdict}. The 6–10 effective-set band contains ${comparison.around_eight_muscle_weeks} muscle-weeks (improvement ${formatNumber(comparison.around_eight_improvement_rate_pct, 1)}%, regression ${formatNumber(comparison.around_eight_regression_rate_pct, 1)}%, strain ${formatNumber(comparison.around_eight_recovery_strain_score, 1)}, HRV ${formatNumber(comparison.around_eight_hrv_ms, 1)} ms); >10 contains ${comparison.above_ten_muscle_weeks} (improvement ${formatNumber(comparison.above_ten_improvement_rate_pct, 1)}%, regression ${formatNumber(comparison.above_ten_regression_rate_pct, 1)}%, strain ${formatNumber(comparison.above_ten_recovery_strain_score, 1)}, HRV ${formatNumber(comparison.above_ten_hrv_ms, 1)} ms). HRV 36–44 ms occurred in ${lowHrv.unique_week_count || 0} unique weeks; their median muscle volume was ${formatNumber(lowHrv.median_effective_hard_sets, 1)} effective sets. These are non-randomized, cross-muscle associations, not proof that volume caused the outcome.`;
}

function generateHumanReport(data) {
  const {
    analysisDate,
    methodologyVersion,
    inventory,
    workoutQuality,
    fitbitQuality,
    nutritionQuality,
    sourceSchemas,
    exerciseScores,
    exerciseSessionMetrics,
    muscleGroupRankings,
    sweetSpots,
    prescriptions,
    recoveryRules,
    periodComparisons,
    programPhases,
    weeklyMuscleVolumeResponse,
    volumeResponseSummary,
    muscleGroupSweetSpots,
    bodyCompositionRecords,
    personalContext
  } = data;
  const topExercises = exerciseScores.filter((score) => score.confidence_level !== "Insufficient personal evidence" && score.exercise_kind !== "non_resistance").slice(0, 12);
  const insufficient = exerciseScores.filter((score) => score.confidence_level === "Insufficient personal evidence");
  const improved = progressionExamples(exerciseSessionMetrics, "improved", 15);
  const regressed = progressionExamples(exerciseSessionMetrics, "regressed", 15);
  const highFatigueProductive = exerciseSessionMetrics.filter((metric) => metric.recovery_strain_score >= 60 && metric.progression_status === "improved").sort((left, right) => right.recovery_strain_score - left.recovery_strain_score).slice(0, 15);
  const highFatigueUnproductive = exerciseSessionMetrics.filter((metric) => metric.recovery_strain_score >= 60 && ["held", "regressed"].includes(metric.progression_status)).sort((left, right) => right.recovery_strain_score - left.recovery_strain_score).slice(0, 15);
  const fitindexOct = bodyCompositionRecords.filter((record) => record.date === "2025-10-02" && record.metric_id === "body_fat_pct").map((record) => record.value);
  const fitindexAug = bodyCompositionRecords.filter((record) => record.date === "2025-08-14" && record.metric_id === "body_fat_pct").map((record) => record.value);
  const insufficientRecoverySessionCount = new Set(exerciseSessionMetrics.filter((metric) => metric.pre_workout_recovery_state === "insufficient_data").map((metric) => metric.session_id)).size;
  const lines = [];
  lines.push(`# Personal Hypertrophy and Recovery Analysis`);
  lines.push(``);
  lines.push(`Analysis date: **${analysisDate}**  `);
  lines.push(`Methodology version: **${methodologyVersion}**  `);
  lines.push(`Evidence window: **${workoutQuality.source_date_range.start} through ${workoutQuality.source_date_range.end}**`);
  lines.push(``);
  lines.push(`## 1. Executive summary`);
  lines.push(``);
  lines.push(`The active Strong export contains ${workoutQuality.session_count} completed session records, ${workoutQuality.normalized_set_record_count} set records, and ${workoutQuality.unique_recorded_exercise_count} distinct recorded exercise names. Warm-ups are excluded from hard-set volume and PR logic. The exercise conclusions below are primarily performance-proxy conclusions: there is no repeated, exercise-attributable muscle-size measurement spanning the set-level history.`);
  lines.push(``);
  lines.push(`Highest confidence-adjusted personal exercise scores:`);
  lines.push(``);
  lines.push(table(["Exercise", "Overall", "Progression", "Recovery efficiency", "Sessions", "Confidence", "Main reason"], topExercises.map((score) => [score.exercise_name, score.overall_personal_exercise_score, score.progression_score, score.recovery_efficiency_score, score.session_count, score.confidence_level, score.main_reason_for_score])));
  lines.push(``);
  lines.push(compareAprilMayJune(periodComparisons));
  lines.push(``);
  lines.push(`The supplied 80 lb × 8 to 82.5 lb × 7 incline-dumbbell example illustrates the implemented rule: Epley e1RM moves from 101.3 to 101.8 lb (+0.4%). At comparable RPE that is classified as held/neutral with a positive heavier-load exposure, not a regression and not a clearly meaningful improvement under the 1% threshold.`);
  lines.push(``);
  lines.push(`## 2. Source-file inventory`);
  lines.push(``);
  lines.push(`Raw files preserved: **${inventory.summary.file_count.toLocaleString()}** files, **${inventory.summary.total_bytes.toLocaleString()} bytes**. No XLS/XLSX/ODS/Numbers workbook was present, so workbook and worksheet inventories are empty. The previous partial Strong export is preserved under the raw archive; only the root active Strong file is ingested.`);
  lines.push(``);
  lines.push(table(["Dataset", "File/pattern", "Rows", "Date range", "Timestamp semantics"], sourceSchemas.filter((schema) => schema.row_count || schema.raw_row_count).map((schema) => [schema.source_id || schema.dataset, schema.source_file || schema.source_pattern || schema.file, schema.row_count ?? schema.raw_row_count, schema.date_range ? `${schema.date_range.start || "?"}–${schema.date_range.end || "?"}` : schema.source_date_range ? `${schema.source_date_range.start || "?"}–${schema.source_date_range.end || "?"}` : "—", schema.timestamp_semantics || "—"]).slice(0, 40)));
  lines.push(``);
  lines.push(`## 3. Data-quality findings`);
  lines.push(``);
  lines.push(`- Strong has no declared load unit. Pounds are inferred from context, while machine loads remain equipment-specific.`);
  lines.push(`- The updated Strong file has ${workoutQuality.working_set_rpe_missing_count} working sets without RPE and ${workoutQuality.working_set_rpe_present_count} with RPE.`);
  lines.push(`- ${workoutQuality.progression_plausibility_excluded_set_count || 0} working sets were preserved but excluded from PR/progression/sweet-spot calculations because they failed configured repetition, metric, or within-session load plausibility checks. Between-session equipment/regime jumps establish a new baseline rather than a scored gain or loss.`);
  lines.push(`- ${workoutQuality.unmapped_exercise_count} exercise names remain wholly unmapped; rule-derived mappings are explicitly labeled for later review.`);
  lines.push(`- Fitbit HRV zero sentinels were converted to missing rather than treated as physiologic zero. Sleep shard-boundary duplicates were deduplicated by logId.`);
  lines.push(`- ${insufficientRecoverySessionCount} workout sessions lack at least two independently available pre-workout recovery domains. They are labeled insufficient data and are not counted as “train as planned” evidence. Short sleep versus baseline and sleep under six hours count as one sleep domain, not two markers.`);
  lines.push(`- Detailed observed calories/macros end in September 2025. Sparse 2026 Fitbit nutrition data do not provide a usable calorie/carbohydrate/fat series, and meal timestamps are not trustworthy consumption times.`);
  lines.push(`- Strong has no pain field in the updated export. Pain-free repeatability cannot be inferred from silence.`);
  lines.push(`- FITINDEX body fat on 2025-10-02 (${fitindexOct.length ? fitindexOct.map((value) => `${formatNumber(value, 1)}%`).join(", ") : "no record"}) conflicts with the confirmed InBody 20.5%. On 2025-08-14 FITINDEX recorded ${fitindexAug.length ? fitindexAug.map((value) => `${formatNumber(value, 1)}%`).join(", ") : "no record"}; the supplied InBody point on that date is skeletal muscle mass 68.6 lb, not a directly comparable body-fat measurement.`);
  lines.push(``);
  lines.push(`## 4. Methodology`);
  lines.push(``);
  lines.push(`Working sets are Strong numeric, failure, or drop sets. W rows are warm-ups and never count toward hard-set volume or PRs. Numeric sets are top sets only when the first working set is followed by a load reduction of at least 2%; later lower-load sets are back-offs. Otherwise they are straight working sets. F and D retain their explicit failure/drop identities.`);
  lines.push(``);
  lines.push(`External-load progression uses the best RPE-adjusted Epley estimate only when both compared sessions have RPE-supported values; otherwise both sides use unadjusted Epley. Bodyweight/band movements use repetitions. Exposures more than 56 days apart, first-working-load regime jumps of at least 1.75× and 10 logged units, or absolute one-exposure performance changes of at least 40% establish a new baseline instead of a scored gain/regression. Improvement requires +1%; regression is below -1.5%, with an additional review trigger for a same-load decline greater than three repetitions at comparable RPE.`);
  lines.push(``);
  lines.push(`Recovery strain combines following-night/next-morning HRV suppression, resting-heart-rate elevation, sleep loss, and sleeping-heart-rate elevation relative to the preceding 28-day personal baseline. At least two available markers are required. Because exercises share sessions, recovery attribution is session-confounded.`);
  lines.push(``);
  lines.push(`## 5. Known assumptions and guardrails`);
  lines.push(``);
  lines.push(`- Dated source records override schedule summaries when they conflict; both are retained as provenance.`);
  lines.push(`- Logged working sets with missing RPE count as hard sets by configurable assumption and are flagged as assumed.`);
  lines.push(`- Machine loads are compared only inside the exact recorded exercise_id, and abrupt within-exercise load-regime changes reset comparability. Variants such as heavy/standard leg extension, seated/lying leg curl, and attachments remain separate.`);
  lines.push(`- Soreness, HRV suppression, calories burned, and fatigue are not evidence of hypertrophy by themselves.`);
  lines.push(`- User-reported calorie targets and routine meal times are context, not fabricated daily records.`);
  lines.push(`- InBody/FITINDEX values are never treated as interchangeable; hydration, glycogen, sodium, meal timing, and creatine consistency remain plausible scan confounders.`);
  lines.push(``);
  lines.push(`## 6. Scoring formula`);
  lines.push(``);
  lines.push(`Progression score = 25% outcome rate + 25% median adjusted performance change + 20% top-set change + 15% back-off change + 15% stall avoidance, with unavailable components reweighted. Hypertrophy support = 45% progression + 20% productive rep range + 15% set quality + 10% frequency repeatability; direct evidence is omitted and the remaining weights are normalized because no attributable direct measure exists. Recovery efficiency = 55% progression benefit + 45% recovery tolerance. Overall raw = 30% progression + 25% hypertrophy support + 20% recovery efficiency + 15% repeatability + 10% nutrition support.`);
  lines.push(``);
  lines.push(`The overall result is confidence-adjusted: the raw score is shrunk toward 50 in proportion to data-confidence, then combined 80% shrunk score / 20% confidence score. Thus a tiny sample cannot silently outrank a well-supported exercise. Confidence considers exposure count, observation span, RPE coverage, recovery coverage, nutrition coverage, and mapping consistency.`);
  lines.push(``);
  lines.push(`## 7. Overall personal findings`);
  lines.push(``);
  lines.push(table(["Exercise", "Overall", "Hypertrophy support", "Repeatability", "Nutrition support", "Confidence", "Flags"], topExercises.map((score) => [score.exercise_name, score.overall_personal_exercise_score, score.hypertrophy_support_score, score.repeatability_score, score.nutrition_support_score, score.confidence_level, score.classification_flags])));
  lines.push(``);
  lines.push(`## 8. Program phases detected`);
  lines.push(``);
  lines.push(table(["Phase", "Dates", "Weeks", "Sessions", "Avg hard sets/week", "Dominant workout names"], programPhases.map((phase) => [phase.program_phase_id, `${phase.start_date}–${phase.end_date}`, phase.calendar_weeks_observed, phase.session_count, phase.average_hard_sets_per_observed_week, phase.dominant_workout_names])));
  lines.push(``);
  lines.push(`Phase boundaries are descriptive: they reflect exercise/workout-name similarity or gaps, not proof that a program caused the subsequent outcome.`);
  lines.push(``);
  lines.push(`## 9. Period comparisons`);
  lines.push(``);
  lines.push(table(["Period", "Calorie target/context", "Observed kcal days/avg", "HRV", "RHR", "Sleep h", "Hard sets/week", "Improve", "Regress", "Smoothed weight change"], periodComparisons.map((period) => [period.label, period.user_reported_calorie_target, `${period.observed_calorie_days}/${formatNumber(period.observed_daily_calories_average, 0)}`, period.average_hrv_ms, period.average_resting_hr_bpm, Number.isFinite(period.average_sleep_minutes) ? round(period.average_sleep_minutes / 60, 2) : null, period.average_hard_sets_per_observed_week, pct(period.improvement_rate_pct), pct(period.regression_rate_pct), Number.isFinite(period.body_weight_change_lb) ? `${formatNumber(period.body_weight_change_lb, 1)} lb` : null])));
  lines.push(``);
  lines.push(`Weight change uses the mean of up to the first and last seven observed weights in each period; raw single-endpoint change is retained separately in period_comparisons.json. February and August 2025 can now be evaluated with set-level data. Their row-level strongest and weakest examples are in period_comparisons.json; calorie rows are observed only where the nutrition export has a dated primary daily record.`);
  lines.push(``);
  lines.push(`## 10. Muscle-group rankings`);
  lines.push(``);
  for (const [muscle, rows] of groupBy(muscleGroupRankings, "muscle_group")) {
    lines.push(`### ${muscle.replace(/_/g, " ")}`);
    lines.push(``);
    lines.push(table(["Rank", "Exercise", "Role", "Regional function", "Muscle score", "Progression", "Recovery", "Sessions", "Confidence", "Flags"], rows.slice(0, 12).map((row) => [row.rank, row.exercise_name, row.muscle_role, row.regional_function, row.muscle_specific_effectiveness_score, row.progression_score, row.recovery_efficiency_score, row.session_count, row.confidence_level, row.category_flags])));
    lines.push(``);
  }
  lines.push(`## 11. Exercise-by-exercise grades`);
  lines.push(``);
  lines.push(table(["Exercise", "Primary muscle", "Overall", "Progression", "Hypertrophy support", "Recovery", "Repeatability", "Nutrition", "Confidence", "Sessions", "Date range"], exerciseScores.map((score) => [score.exercise_name, score.primary_muscle_group, score.overall_personal_exercise_score, score.progression_score, score.hypertrophy_support_score, score.recovery_efficiency_score, score.repeatability_score, score.nutrition_support_score, score.confidence_level, score.session_count, `${score.source_date_start}–${score.source_date_end}`])));
  lines.push(``);
  lines.push(`## 12. Personal sweet spots`);
  lines.push(``);
  lines.push(table(["Exercise", "Best-session n", "Sets/session", "Weekly sets", "Rep range", "RPE", "Days between", "Highest recoverable weekly sets", "Confidence"], sweetSpots.map((sweet) => [sweet.exercise_name, sweet.qualifying_best_session_count, rangeText(sweet.recommended_future_range.sets_per_session), rangeText(sweet.recommended_future_range.weekly_hard_sets), rangeText(sweet.recommended_future_range.rep_range), rangeText(sweet.recommended_future_range.rpe), rangeText(sweet.recommended_future_range.days_between_exposures), sweet.highest_recoverable_range_observed.max_weekly_hard_sets, sweet.confidence_level])));
  lines.push(``);
  lines.push(`### Muscle-group weekly-volume sweet spots`);
  lines.push(``);
  lines.push(table(["Muscle group", "Observed best effective sets/week", "Recommended normal range", "Best exposures/week", "Highest recoverable observed", "Best-week n", "Confidence"], (muscleGroupSweetSpots || []).map((sweet) => [sweet.muscle_group, rangeText(sweet.observed_best_effective_hard_sets_per_week), rangeText(sweet.recommended_normal_effective_hard_sets_per_week), rangeText(sweet.observed_best_session_exposures_per_week), sweet.highest_recoverable_effective_hard_sets_observed, sweet.qualifying_best_week_count, sweet.confidence_level])));
  lines.push(``);
  lines.push(compareVolumeBands(volumeResponseSummary));
  lines.push(``);
  lines.push(table(["Volume band", "Muscle-weeks", "Avg effective sets", "Improve", "Regress", "Recovery strain", "HRV", "Sleep h"], (volumeResponseSummary?.bands || []).map((band) => [band.volume_band, band.muscle_week_count, band.average_effective_hard_sets, pct(band.average_improvement_rate_pct), pct(band.average_regression_rate_pct), band.average_recovery_strain_score, band.average_hrv_ms, Number.isFinite(band.average_sleep_minutes) ? round(band.average_sleep_minutes / 60, 2) : null])));
  lines.push(``);
  lines.push(`## 13. Recommended training prescriptions`);
  lines.push(``);
  lines.push(table(["Exercise", "Role", "Sets/session", "Weekly sets", "Frequency", "Reps", "RPE", "Rest", "Confidence"], prescriptions.map((prescription) => [prescription.exercise_name, prescription.role, rangeText(prescription.recommended_sets_per_session), rangeText(prescription.recommended_weekly_sets), rangeText(prescription.recommended_sessions_per_week, "×/wk"), rangeText(prescription.recommended_rep_range), rangeText(prescription.recommended_rpe), rangeText(prescription.recommended_rest_seconds, "s"), prescription.confidence_level])));
  lines.push(``);
  lines.push(`Each JSON prescription includes progression, repetition-fall, RPE-rise, two-stall, deload, nutrition, recovery, substitute, and warning-sign rules. Low-confidence prescriptions are provisional and deliberately conservative.`);
  lines.push(``);
  lines.push(`## 14. Recovery decision rules`);
  lines.push(``);
  lines.push(table(["Action", "Min converging indicators", "Historical matches", "Successful", "Unsuccessful", "Confidence", "Effect summary"], recoveryRules.map((rule) => [rule.action, rule.minimum_converging_indicators, rule.historical_evidence.triggered_observations, rule.historical_evidence.successful_outcomes, rule.historical_evidence.unsuccessful_outcomes, rule.confidence_level, rule.historical_evidence.effect_summary])));
  lines.push(``);
  lines.push(`No major change is triggered by one biomarker. Major reductions require repeated performance problems and/or multiple recovery, volume, sleep, or nutrition indicators.`);
  lines.push(``);
  lines.push(`## 15. Nutrition and calorie findings`);
  lines.push(``);
  lines.push(`Detailed energy/protein/carbohydrate/fat records cover 2023 through 2025-09-24 and overlap substantial historical Strong training, but not the April–June 2026 cut. The 2026 Fitbit nutrition log is sparse and lacks usable total calories, carbohydrates, and total fat. Therefore the 1,950 kcal April target and 1,750 kcal May/June targets cannot be verified as actual intake. Exercise nutrition-support scores use measured historical daily totals where available and clearly labeled period-target context otherwise.`);
  lines.push(``);
  lines.push(compareAprilMayJune(periodComparisons));
  lines.push(``);
  lines.push(`Common foods and routine timing supplied in context may guide future data collection, but this analysis does not claim any specific food caused hypertrophy.`);
  lines.push(``);
  lines.push(`## 16. Strong progression examples`);
  lines.push(``);
  lines.push(table(["Date", "Exercise", "First working set", "RPE", "Adjusted change", "Recovery strain", "Reason"], improved.map((metric) => [metric.workout_date, metric.exercise_name, `${metric.first_working_load} × ${metric.first_working_repetitions}`, metric.first_working_rpe, pct(metric.progression_pct_vs_prior), metric.recovery_strain_score, metric.progression_reason])));
  lines.push(``);
  lines.push(`## 17. Apparent stalls or regressions`);
  lines.push(``);
  lines.push(table(["Date", "Exercise", "First working set", "RPE", "Adjusted change", "Streak", "Recovery strain", "Reason"], regressed.map((metric) => [metric.workout_date, metric.exercise_name, `${metric.first_working_load} × ${metric.first_working_repetitions}`, metric.first_working_rpe, pct(metric.progression_pct_vs_prior), metric.regression_duration_exposures, metric.recovery_strain_score, metric.progression_reason])));
  lines.push(``);
  lines.push(`## 18. High-fatigue but productive exercises/sessions`);
  lines.push(``);
  lines.push(highFatigueProductive.length ? table(["Date", "Exercise", "Progression", "Strain", "Pre markers", "Weekly sets"], highFatigueProductive.map((metric) => [metric.workout_date, metric.exercise_name, pct(metric.progression_pct_vs_prior), metric.recovery_strain_score, metric.pre_workout_adverse_signal_count, metric.weekly_hard_sets_exercise])) : `No session met both the ≥60 strain and improved-performance definitions with sufficient biometrics.`);
  lines.push(``);
  lines.push(`## 19. High-fatigue and unproductive exercises/sessions`);
  lines.push(``);
  lines.push(highFatigueUnproductive.length ? table(["Date", "Exercise", "Outcome", "Progression", "Strain", "Pre markers", "Weekly sets"], highFatigueUnproductive.map((metric) => [metric.workout_date, metric.exercise_name, metric.progression_status, pct(metric.progression_pct_vs_prior), metric.recovery_strain_score, metric.pre_workout_adverse_signal_count, metric.weekly_hard_sets_exercise])) : `No session met the ≥60 strain plus held/regressed definition with sufficient biometrics.`);
  lines.push(``);
  lines.push(`## 20. Exercises with insufficient evidence`);
  lines.push(``);
  lines.push(insufficient.length ? table(["Exercise", "Sessions", "Date range", "Overall score", "Limitation"], insufficient.map((score) => [score.exercise_name, score.session_count, `${score.source_date_start}–${score.source_date_end}`, score.overall_personal_exercise_score, score.important_limitations])) : `None.`);
  lines.push(``);
  lines.push(`## 21. Limitations`);
  lines.push(``);
  lines.push(`- There is one supplied skeletal-muscle-mass point and one confirmed InBody body-fat point, but no repeated same-condition direct measure spanning individual exercise blocks.`);
  lines.push(`- Exercise selection, program changes, detraining/re-entry, calorie phase, sleep, exercise order, and co-trained movements remain confounders.`);
  lines.push(`- RPE is absent from much of the older Strong history. Missing RPE lowers confidence; it is never fabricated.`);
  lines.push(`- Fitbit dates often use local wall time mislabeled with Z. The pipeline preserves raw timestamps and uses the verified literal local date rather than shifting them as UTC.`);
  lines.push(`- Recovery cost is linked at daily/session resolution and cannot isolate one movement from other work in the same session.`);
  lines.push(`- Rule-inferred muscle mappings are transparent and editable; ambiguous names such as machine paths should be corrected when equipment details are known.`);
  lines.push(``);
  lines.push(`## 22. Additional data to collect`);
  lines.push(``);
  lines.push(`1. Preserve exact equipment/machine identifiers, seat settings, grips, incline angles, and whether dumbbell loads are per hand.`);
  lines.push(`2. Log RPE or RIR for every working set and trustworthy rest intervals.`);
  lines.push(`3. Log pain/discomfort, illness, unusual soreness, creatine consistency, hydration, sodium, glycogen/carbohydrate context, and scan conditions.`);
  lines.push(`4. Export dated 2026 calories/macros with actual meal timestamps or a clear timestamp-confidence field.`);
  lines.push(`5. Repeat circumference and body-composition measurements under standardized conditions; include multiple points per program phase.`);
  lines.push(`6. Record explicit planned versus completed sets and the reason for unplanned reductions.`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`This report separates observed records, proxy evidence, user-provided context, and recommendations. It is a personal decision-support layer, not a causal hypertrophy study or medical diagnosis.`);
  return `${lines.join("\n")}\n`;
}

module.exports = { generateHumanReport };
