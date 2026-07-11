"use strict";

const {
  addDays,
  clamp,
  coefficientOfVariation,
  dateRange,
  daysBetween,
  groupBy,
  linearSlope,
  mean,
  median,
  mondayOfWeek,
  quantile,
  round,
  sortedUnique,
  stableId,
  sum
} = require("./utils");

const RECOVERY_METRICS = [
  "hrv_rmssd_ms",
  "resting_heart_rate_bpm",
  "sleeping_heart_rate_bpm",
  "sleep_duration_minutes",
  "sleep_score",
  "readiness_score",
  "deep_sleep_minutes",
  "rem_sleep_minutes",
  "sleep_efficiency_pct",
  "respiratory_rate_breaths_per_minute",
  "sleep_skin_temperature_c",
  "spo2_average_pct",
  "steps",
  "active_zone_minutes",
  "fitbit_exercise_minutes",
  "calories_burned_kcal",
  "body_weight_lb",
  "body_fat_pct"
];

const FULL_DAY_ACTIVITY_METRICS = [
  "steps",
  "active_zone_minutes",
  "fitbit_exercise_minutes",
  "calories_burned_kcal"
];

function dateInRange(date, start, end) {
  return Boolean(date && (!start || date >= start) && (!end || date <= end));
}

function metricDetail(dailyMap, date, metricId, window = 28) {
  const record = dailyMap.get(date)?.metrics?.[metricId];
  const rolling = record?.rolling?.[`${window}d`] || {};
  return {
    value: Number.isFinite(record?.value) ? record.value : null,
    baseline: Number.isFinite(rolling.baseline) ? rolling.baseline : null,
    delta: Number.isFinite(rolling.delta) ? rolling.delta : null,
    pct_delta: Number.isFinite(rolling.pct_delta) ? rolling.pct_delta : null,
    z_score: Number.isFinite(rolling.z_score) ? rolling.z_score : null,
    sample_size: Number.isFinite(rolling.sample_size) ? rolling.sample_size : null,
    missing: !Number.isFinite(record?.value)
  };
}

function periodForDate(date, config) {
  return (config.periods || []).find((period) => dateInRange(date, period.start, period.end)) || null;
}

function nutritionContextForDate(date, config, personalContext) {
  const period = periodForDate(date, config);
  const context = period ? (personalContext.nutrition_period_context || []).find((item) => item.period_id === period.period_id) : null;
  return context ? { ...context, period_start: period.start, period_end: period.end } : null;
}

function sevenDayWeightTrend(dailyMap, date) {
  const values = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const value = dailyMap.get(addDays(date, offset))?.metrics?.body_weight_lb?.value;
    if (Number.isFinite(value)) values.push({ x: offset + 6, value });
  }
  if (values.length < 4) return { slope_lb_per_week: null, observed_days: values.length };
  const slope = linearSlope(values.map((item) => item.value));
  return { slope_lb_per_week: Number.isFinite(slope) ? round(slope * 7, 3) : null, observed_days: values.length };
}

function adverseSignalsForDate(dailyMap, date, config) {
  const thresholds = config.recovery_adverse_thresholds || {};
  const hrv = metricDetail(dailyMap, date, "hrv_rmssd_ms");
  const rhr = metricDetail(dailyMap, date, "resting_heart_rate_bpm");
  const sleep = metricDetail(dailyMap, date, "sleep_duration_minutes");
  const sleepingHr = metricDetail(dailyMap, date, "sleeping_heart_rate_bpm");
  const signals = [];
  const signalDomains = [];
  const availableDomains = [];
  if (Number.isFinite(hrv.pct_delta)) availableDomains.push("hrv");
  if (Number.isFinite(rhr.pct_delta)) availableDomains.push("resting_heart_rate");
  if (Number.isFinite(sleep.pct_delta) || Number.isFinite(sleep.value)) availableDomains.push("sleep_duration");
  if (Number.isFinite(sleepingHr.pct_delta)) availableDomains.push("sleeping_heart_rate");
  if (Number.isFinite(hrv.pct_delta) && hrv.pct_delta <= Number(thresholds.hrv_pct_below_28d ?? -10)) {
    signals.push("hrv_below_28d_baseline");
    signalDomains.push("hrv");
  }
  if (Number.isFinite(rhr.pct_delta) && rhr.pct_delta >= Number(thresholds.resting_hr_pct_above_28d ?? 5)) {
    signals.push("resting_hr_above_28d_baseline");
    signalDomains.push("resting_heart_rate");
  }
  const sleepBelowBaseline = Number.isFinite(sleep.pct_delta) && sleep.pct_delta <= Number(thresholds.sleep_pct_below_28d ?? -15);
  const sleepUnderSixHours = Number.isFinite(sleep.value) && sleep.value < Number(thresholds.short_sleep_minutes ?? 360);
  if (sleepBelowBaseline || sleepUnderSixHours) {
    signals.push(sleepBelowBaseline && sleepUnderSixHours
      ? "sleep_below_28d_baseline_and_under_six_hours"
      : sleepBelowBaseline ? "sleep_below_28d_baseline" : "sleep_under_six_hours");
    signalDomains.push("sleep_duration");
  }
  if (Number.isFinite(sleepingHr.pct_delta) && sleepingHr.pct_delta >= Number(thresholds.sleeping_hr_pct_above_28d ?? 5)) {
    signals.push("sleeping_hr_above_28d_baseline");
    signalDomains.push("sleeping_heart_rate");
  }
  return {
    signals: [...new Set(signals)],
    signal_domains: [...new Set(signalDomains)],
    available_domains: [...new Set(availableDomains)],
    hrv,
    rhr,
    sleep,
    sleepingHr
  };
}

function flattenTimepoint(output, prefix, dailyMap, date) {
  output[`${prefix}_date`] = date;
  for (const metricId of RECOVERY_METRICS.filter((metricId) => !FULL_DAY_ACTIVITY_METRICS.includes(metricId))) {
    const detail = metricDetail(dailyMap, date, metricId, 28);
    output[`${prefix}_${metricId}`] = detail.value;
    if (["hrv_rmssd_ms", "resting_heart_rate_bpm", "sleeping_heart_rate_bpm", "sleep_duration_minutes", "sleep_score", "readiness_score"].includes(metricId)) {
      output[`${prefix}_${metricId}_baseline_28d`] = detail.baseline;
      output[`${prefix}_${metricId}_delta_28d`] = detail.delta;
      output[`${prefix}_${metricId}_pct_delta_28d`] = detail.pct_delta;
      output[`${prefix}_${metricId}_z_28d`] = detail.z_score;
    }
  }
}

function flattenFullDayActivity(output, prefix, dailyMap, date) {
  output[`${prefix}_date`] = date;
  for (const metricId of FULL_DAY_ACTIVITY_METRICS) {
    const detail = metricDetail(dailyMap, date, metricId, 28);
    output[`${prefix}_${metricId}`] = detail.value;
    output[`${prefix}_${metricId}_baseline_28d`] = detail.baseline;
    output[`${prefix}_${metricId}_pct_delta_28d`] = detail.pct_delta;
  }
}

function buildWorkoutRecoveryLinks({ sessions, dailyMap, nutritionDailyMap, config, personalContext, analysisDate, methodologyVersion }) {
  const sessionDates = new Set(sessions.map((session) => session.workout_date));
  const links = [];
  for (const session of sessions) {
    const date = session.workout_date;
    const followingDate = addDays(date, 1);
    const link = {
      link_id: stableId("recovery_link", session.session_id),
      session_id: session.session_id,
      workout_date: date,
      workout_local_datetime: session.workout_local_datetime,
      workout_name_recorded: session.workout_name_recorded,
      resolution_note: "Daily resolution: following-night and approximately-24-hour recovery fields both use the next wake-date record. Activity totals are labeled full-day; prior-day totals are used as the pre-workout activity context.",
      consecutive_training_days: 1,
      pre_workout_adverse_signal_count: 0,
      pre_workout_adverse_signals: "",
      pre_workout_adverse_signal_domains: "",
      pre_workout_recovery_marker_available_count: 0,
      pre_workout_recovery_marker_available_domains: "",
      pre_workout_recovery_state: "insufficient_data",
      daily_calories_observed: null,
      daily_protein_g_observed: null,
      daily_carbohydrates_g_observed: null,
      calories_before_training: null,
      protein_before_training_g: null,
      carbohydrates_before_training_g: null,
      time_since_last_meal_minutes: null,
      calories_after_training: null,
      protein_after_training_g: null,
      carbohydrates_after_training_g: null,
      nutrition_timing_status: "unavailable",
      rolling_7d_calories_observed: null,
      rolling_7d_protein_g_observed: null,
      rolling_7d_carbohydrates_g_observed: null,
      context_daily_calorie_target: null,
      context_daily_protein_min_g: personalContext.nutrition_context?.reported_protein_g_per_day?.min ?? null,
      context_daily_protein_max_g: personalContext.nutrition_context?.reported_protein_g_per_day?.max ?? null,
      energy_balance_label: "unknown",
      body_weight_trend_lb_per_week_7d: null,
      body_weight_trend_observed_days: 0,
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      source_date_start: date,
      source_date_end: date,
      sample_size: 1,
      confidence_level: "moderate",
      missing_data_flags: "",
      source_references: sortedUnique(session.source_references || []).join(";"),
      notes: "Nutrition values are linked only when a dated source record exists; user-reported targets remain context."
    };
    for (let offset = 1; offset <= 6; offset += 1) {
      if (sessionDates.has(addDays(date, -offset))) link.consecutive_training_days += 1;
      else break;
    }
    flattenTimepoint(link, "pre_workout_morning", dailyMap, date);
    flattenTimepoint(link, "following_night_next_morning", dailyMap, followingDate);
    flattenTimepoint(link, "plus_24h", dailyMap, followingDate);
    flattenTimepoint(link, "plus_48h", dailyMap, addDays(date, 2));
    flattenTimepoint(link, "plus_72h", dailyMap, addDays(date, 3));
    flattenFullDayActivity(link, "prior_day_full_day", dailyMap, addDays(date, -1));
    flattenFullDayActivity(link, "workout_date_full_day", dailyMap, date);
    flattenFullDayActivity(link, "plus_24h_full_day", dailyMap, followingDate);
    flattenFullDayActivity(link, "plus_48h_full_day", dailyMap, addDays(date, 2));
    flattenFullDayActivity(link, "plus_72h_full_day", dailyMap, addDays(date, 3));
    const adverse = adverseSignalsForDate(dailyMap, date, config);
    link.pre_workout_adverse_signal_count = adverse.signal_domains.length;
    link.pre_workout_adverse_signals = adverse.signals.join(";");
    link.pre_workout_adverse_signal_domains = adverse.signal_domains.join(";");
    link.pre_workout_recovery_marker_available_count = adverse.available_domains.length;
    link.pre_workout_recovery_marker_available_domains = adverse.available_domains.join(";");
    link.pre_workout_recovery_state = adverse.available_domains.length < 2
      ? "insufficient_data"
      : adverse.signal_domains.length <= 1 ? "within_personal_band"
        : adverse.signal_domains.length === 2 ? "caution" : "materially_below_personal_band";
    const nutrition = nutritionDailyMap.get(date);
    if (nutrition) {
      link.daily_calories_observed = nutrition.calories;
      link.daily_protein_g_observed = nutrition.protein_g;
      link.daily_carbohydrates_g_observed = nutrition.carbohydrates_g;
      link.rolling_7d_calories_observed = nutrition.rolling_7d_calories;
      link.rolling_7d_protein_g_observed = nutrition.rolling_7d_protein_g;
      link.rolling_7d_carbohydrates_g_observed = nutrition.rolling_7d_carbohydrates_g;
      link.nutrition_timing_status = "daily_total_only_no_trustworthy_meal_time";
      link.source_references = sortedUnique([...link.source_references.split(";").filter(Boolean), ...String(nutrition.source_references || "").split(";").filter(Boolean)]).join(";");
    }
    const context = nutritionContextForDate(date, config, personalContext);
    if (context) {
      link.context_daily_calorie_target = context.daily_calorie_target;
      const maintenance = personalContext.nutrition_context?.earlier_maintenance_calorie_estimate;
      link.energy_balance_label = maintenance && context.daily_calorie_target < maintenance.min ? "user_reported_planned_deficit" : "user_reported_target_unknown_balance";
    }
    const weightTrend = sevenDayWeightTrend(dailyMap, date);
    link.body_weight_trend_lb_per_week_7d = weightTrend.slope_lb_per_week;
    link.body_weight_trend_observed_days = weightTrend.observed_days;
    const missing = [];
    if (!Number.isFinite(link.pre_workout_morning_hrv_rmssd_ms)) missing.push("pre_hrv");
    if (!Number.isFinite(link.pre_workout_morning_resting_heart_rate_bpm)) missing.push("pre_resting_hr");
    if (!Number.isFinite(link.pre_workout_morning_sleep_duration_minutes)) missing.push("pre_sleep");
    if (!Number.isFinite(link.following_night_next_morning_hrv_rmssd_ms)) missing.push("post_hrv");
    if (link.pre_workout_recovery_marker_available_count < 2) missing.push("insufficient_pre_workout_recovery_domains");
    if (!Number.isFinite(link.daily_calories_observed)) missing.push("observed_workout_day_calories");
    if (link.nutrition_timing_status === "unavailable") missing.push("nutrition_timing");
    link.missing_data_flags = missing.join(";");
    const corePresent = 4 - missing.filter((item) => ["pre_hrv", "pre_resting_hr", "pre_sleep", "post_hrv"].includes(item)).length;
    link.confidence_level = corePresent >= 3 ? "moderate" : corePresent >= 1 ? "low" : "insufficient personal evidence";
    links.push(link);
  }
  return links;
}

function workingPerformance(record, progressionMetric) {
  if (progressionMetric === "duration") return Number.isFinite(record.seconds_as_recorded) ? record.seconds_as_recorded : null;
  if (progressionMetric === "repetitions") return Number.isFinite(record.repetitions) ? record.repetitions : null;
  return record.rpe_adjusted_e1rm ?? record.epley_e1rm ?? null;
}

function sessionRecoveryStrain(link, config) {
  if (!link) return { score: null, marker_count: 0, components: {} };
  const scale = config.recovery_cost_full_scale || {};
  const components = {};
  const hrvPct = link.following_night_next_morning_hrv_rmssd_ms_pct_delta_28d;
  const rhrPct = link.following_night_next_morning_resting_heart_rate_bpm_pct_delta_28d;
  const sleepPct = link.following_night_next_morning_sleep_duration_minutes_pct_delta_28d;
  const sleepingHrPct = link.following_night_next_morning_sleeping_heart_rate_bpm_pct_delta_28d;
  if (Number.isFinite(hrvPct)) components.hrv_suppression = clamp((-hrvPct / Number(scale.hrv_suppression_pct || 15)) * 100, 0, 100);
  if (Number.isFinite(rhrPct)) components.resting_hr_elevation = clamp((rhrPct / Number(scale.resting_hr_elevation_pct || 8)) * 100, 0, 100);
  if (Number.isFinite(sleepPct)) components.sleep_loss = clamp((-sleepPct / Number(scale.sleep_loss_pct || 20)) * 100, 0, 100);
  if (Number.isFinite(sleepingHrPct)) components.sleeping_hr_elevation = clamp((sleepingHrPct / Number(scale.sleeping_hr_elevation_pct || 8)) * 100, 0, 100);
  const values = Object.values(components);
  return { score: values.length >= 2 ? round(mean(values), 2) : null, marker_count: values.length, components };
}

function buildExerciseSessionMetrics({ workoutRecords, recoveryLinks, aliases, muscleMap, config, analysisDate, methodologyVersion }) {
  const aliasById = new Map(aliases.map((alias) => [alias.exercise_id, alias]));
  const musclesByExercise = groupBy(muscleMap, "exercise_id");
  const linksBySession = new Map(recoveryLinks.map((link) => [link.session_id, link]));
  const working = workoutRecords.filter((record) => record.is_working_set && record.workout_date);
  const groups = groupBy(working, (record) => `${record.session_id}|${record.exercise_id}`);
  const metrics = [];
  for (const records of groups.values()) {
    records.sort((left, right) => left.set_sequence_in_exercise - right.set_sequence_in_exercise);
    const first = records[0];
    const alias = aliasById.get(first.exercise_id) || {};
    const progressionMetric = alias.progression_metric || "rpe_adjusted_e1rm";
    // Preserve every logged working set for volume/accounting, but keep values that
    // failed the explicit plausibility screen out of PR, progression, and sweet-spot
    // calculations. A suspect row remains traceable instead of being silently fixed.
    const performanceRecords = records.filter((record) => record.analysis_progression_eligible !== false);
    const performances = performanceRecords.map((record) => workingPerformance(record, progressionMetric)).filter(Number.isFinite);
    const unadjustedPerformances = progressionMetric === "duration"
      ? performanceRecords.map((record) => record.seconds_as_recorded).filter(Number.isFinite)
      : progressionMetric === "repetitions"
        ? performanceRecords.map((record) => record.repetitions).filter(Number.isFinite)
      : performanceRecords.map((record) => record.epley_e1rm).filter(Number.isFinite);
    const adjustedPerformances = progressionMetric === "duration"
      ? performanceRecords.map((record) => record.seconds_as_recorded).filter(Number.isFinite)
      : progressionMetric === "repetitions"
        ? performanceRecords.map((record) => record.repetitions).filter(Number.isFinite)
      : performanceRecords.map((record) => record.rpe_adjusted_e1rm).filter(Number.isFinite);
    const topRecords = records.filter((record) => record.set_type === "top_set");
    const backoffRecords = records.filter((record) => record.set_type === "back_off_set");
    const performanceTopRecords = performanceRecords.filter((record) => record.set_type === "top_set");
    const performanceBackoffRecords = performanceRecords.filter((record) => record.set_type === "back_off_set");
    const firstWorking = performanceRecords[0] || null;
    const topPerformanceValues = (performanceTopRecords.length ? performanceTopRecords : firstWorking ? [firstWorking] : []).map((record) => workingPerformance(record, progressionMetric)).filter(Number.isFinite);
    const backoffPerformanceValues = performanceBackoffRecords.map((record) => workingPerformance(record, progressionMetric)).filter(Number.isFinite);
    const roleValue = (record, adjusted) => progressionMetric === "duration" ? record.seconds_as_recorded : progressionMetric === "repetitions" ? record.repetitions : adjusted ? record.rpe_adjusted_e1rm : record.epley_e1rm;
    const topUnadjustedValues = (performanceTopRecords.length ? performanceTopRecords : firstWorking ? [firstWorking] : []).map((record) => roleValue(record, false)).filter(Number.isFinite);
    const topAdjustedValues = (performanceTopRecords.length ? performanceTopRecords : firstWorking ? [firstWorking] : []).map((record) => roleValue(record, true)).filter(Number.isFinite);
    const backoffUnadjustedValues = performanceBackoffRecords.map((record) => roleValue(record, false)).filter(Number.isFinite);
    const backoffAdjustedValues = performanceBackoffRecords.map((record) => roleValue(record, true)).filter(Number.isFinite);
    const link = linksBySession.get(first.session_id);
    const recoveryStrain = sessionRecoveryStrain(link, config);
    metrics.push({
      exercise_session_id: stableId("exercise_session", first.session_id, first.exercise_id),
      session_id: first.session_id,
      workout_date: first.workout_date,
      workout_local_datetime: first.workout_local_datetime,
      workout_name_recorded: first.workout_name_recorded,
      session_duration_minutes: first.session_duration_minutes,
      exercise_id: first.exercise_id,
      exercise_name: first.canonical_exercise_name,
      exercise_name_recorded: first.exercise_name_recorded,
      exercise_variation: first.exercise_variation,
      primary_muscle_group: first.primary_muscle_group,
      secondary_muscle_groups: first.secondary_muscle_groups,
      resistance_type: first.resistance_type,
      exercise_kind: first.exercise_kind,
      exercise_mapping_source: first.exercise_mapping_source,
      research_exercise_id: first.research_exercise_id,
      exercise_order: first.exercise_order,
      working_set_count: records.length,
      progression_eligible_set_count: performanceRecords.length,
      progression_plausibility_excluded_set_count: records.length - performanceRecords.length,
      progression_plausibility_flags: sortedUnique(records.flatMap((record) => record.progression_plausibility_flags || [])).join(";"),
      hard_set_count: records.filter((record) => record.hard_set).length,
      hard_set_assumed_count: records.filter((record) => record.hard_set_assumed).length,
      warmup_set_count: workoutRecords.filter((record) => record.session_id === first.session_id && record.exercise_id === first.exercise_id && record.is_warmup).length,
      top_set_count: topRecords.length,
      back_off_set_count: backoffRecords.length,
      straight_working_set_count: records.filter((record) => record.set_type === "straight_working_set").length,
      drop_set_count: records.filter((record) => record.set_type === "drop_set").length,
      failure_set_count: records.filter((record) => record.set_type === "failure").length,
      total_repetitions: round(sum(records.map((record) => record.repetitions)), 2),
      load_volume: round(sum(records.map((record) => Number.isFinite(record.load) && Number.isFinite(record.repetitions) ? record.load * record.repetitions : null)), 2),
      best_epley_e1rm: round(Math.max(...performanceRecords.map((record) => record.epley_e1rm).filter(Number.isFinite), Number.NEGATIVE_INFINITY), 3),
      best_rpe_adjusted_e1rm: round(Math.max(...performanceRecords.map((record) => record.rpe_adjusted_e1rm).filter(Number.isFinite), Number.NEGATIVE_INFINITY), 3),
      performance_metric_type: progressionMetric,
      performance_value: performances.length ? round(Math.max(...performances), 3) : null,
      performance_value_unadjusted: unadjustedPerformances.length ? round(Math.max(...unadjustedPerformances), 3) : null,
      performance_value_rpe_adjusted: adjustedPerformances.length ? round(Math.max(...adjustedPerformances), 3) : null,
      comparison_performance_value: null,
      comparison_performance_basis: null,
      top_set_performance_value: topPerformanceValues.length ? round(Math.max(...topPerformanceValues), 3) : null,
      backoff_performance_value: backoffPerformanceValues.length ? round(mean(backoffPerformanceValues), 3) : null,
      top_set_performance_unadjusted: topUnadjustedValues.length ? round(Math.max(...topUnadjustedValues), 3) : null,
      top_set_performance_rpe_adjusted: topAdjustedValues.length ? round(Math.max(...topAdjustedValues), 3) : null,
      backoff_performance_unadjusted: backoffUnadjustedValues.length ? round(mean(backoffUnadjustedValues), 3) : null,
      backoff_performance_rpe_adjusted: backoffAdjustedValues.length ? round(mean(backoffAdjustedValues), 3) : null,
      first_working_load: firstWorking?.load ?? null,
      first_working_repetitions: firstWorking?.repetitions ?? null,
      first_working_rpe: firstWorking?.rpe ?? null,
      max_load: records.some((record) => Number.isFinite(record.load)) ? Math.max(...records.map((record) => record.load).filter(Number.isFinite)) : null,
      min_load: records.some((record) => Number.isFinite(record.load)) ? Math.min(...records.map((record) => record.load).filter(Number.isFinite)) : null,
      max_repetitions: records.some((record) => Number.isFinite(record.repetitions)) ? Math.max(...records.map((record) => record.repetitions).filter(Number.isFinite)) : null,
      min_repetitions: records.some((record) => Number.isFinite(record.repetitions)) ? Math.min(...records.map((record) => record.repetitions).filter(Number.isFinite)) : null,
      average_rpe: round(mean(records.map((record) => record.rpe)), 2),
      average_rir: round(mean(records.map((record) => record.rir)), 2),
      median_rest_after_seconds: round(median(records.map((record) => record.rest_after_seconds)), 1),
      max_set_rep_loss_pct: round(Math.max(...records.map((record) => record.rep_loss_pct_from_previous).filter(Number.isFinite), 0), 2),
      max_set_load_reduction_pct: round(Math.max(...records.map((record) => record.load_reduction_pct_from_previous).filter(Number.isFinite), 0), 2),
      set_quality_review_count: records.filter((record) => record.set_quality_review_flag).length,
      set_repetitions: performanceRecords.map((record) => record.repetitions),
      set_loads: performanceRecords.map((record) => record.load),
      set_rpes: performanceRecords.map((record) => record.rpe),
      set_seconds: performanceRecords.map((record) => record.seconds_as_recorded),
      set_types: performanceRecords.map((record) => record.set_type),
      set_record_ids: performanceRecords.map((record) => record.record_id),
      excluded_progression_set_record_ids: records.filter((record) => record.analysis_progression_eligible === false).map((record) => record.record_id),
      weekly_hard_sets_exercise: null,
      weekly_effective_hard_sets_primary_muscle: null,
      recent_volume_pct_vs_prior_6weeks: null,
      days_since_prior_exposure: null,
      prior_exercise_session_id: null,
      comparison_segment_number: 1,
      comparison_regime_change_flag: false,
      progression_pct_vs_prior: null,
      progression_status: "baseline",
      progression_reason: "First recorded exposure for this exact exercise variation.",
      top_set_progression_pct: null,
      backoff_progression_pct: null,
      rolling_4week_performance_baseline: null,
      rolling_6week_performance_baseline: null,
      progression_pct_vs_4week_baseline: null,
      progression_pct_vs_6week_baseline: null,
      plateau_duration_exposures: 0,
      regression_duration_exposures: 0,
      is_deload_week: false,
      weekly_volume_ratio_vs_prior_week: null,
      pre_workout_adverse_signal_count: link?.pre_workout_adverse_signal_count ?? 0,
      pre_workout_adverse_signals: link?.pre_workout_adverse_signals || "",
      pre_workout_adverse_signal_domains: link?.pre_workout_adverse_signal_domains || "",
      pre_workout_recovery_marker_available_count: link?.pre_workout_recovery_marker_available_count ?? 0,
      pre_workout_recovery_state: link?.pre_workout_recovery_state || "insufficient_data",
      pre_workout_hrv_ms: link?.pre_workout_morning_hrv_rmssd_ms ?? null,
      pre_workout_hrv_pct_vs_28d: link?.pre_workout_morning_hrv_rmssd_ms_pct_delta_28d ?? null,
      pre_workout_resting_hr_bpm: link?.pre_workout_morning_resting_heart_rate_bpm ?? null,
      pre_workout_resting_hr_pct_vs_28d: link?.pre_workout_morning_resting_heart_rate_bpm_pct_delta_28d ?? null,
      pre_workout_sleep_minutes: link?.pre_workout_morning_sleep_duration_minutes ?? null,
      pre_workout_sleep_pct_vs_28d: link?.pre_workout_morning_sleep_duration_minutes_pct_delta_28d ?? null,
      prior_day_steps: link?.prior_day_full_day_steps ?? null,
      prior_day_steps_pct_vs_28d: link?.prior_day_full_day_steps_pct_delta_28d ?? null,
      prior_day_active_zone_minutes: link?.prior_day_full_day_active_zone_minutes ?? null,
      prior_day_active_zone_minutes_pct_vs_28d: link?.prior_day_full_day_active_zone_minutes_pct_delta_28d ?? null,
      prior_day_fitbit_exercise_minutes: link?.prior_day_full_day_fitbit_exercise_minutes ?? null,
      prior_day_calories_burned_kcal: link?.prior_day_full_day_calories_burned_kcal ?? null,
      prior_day_calories_burned_pct_vs_28d: link?.prior_day_full_day_calories_burned_kcal_pct_delta_28d ?? null,
      recovery_strain_score: recoveryStrain.score,
      recovery_strain_marker_count: recoveryStrain.marker_count,
      recovery_strain_components: recoveryStrain.components,
      next_exposure_progression_status: null,
      accumulated_fatigue_marker_count: null,
      accumulated_fatigue_state: null,
      observed_daily_calories: link?.daily_calories_observed ?? null,
      observed_daily_protein_g: link?.daily_protein_g_observed ?? null,
      observed_daily_carbohydrates_g: link?.daily_carbohydrates_g_observed ?? null,
      rolling_7d_calories_observed: link?.rolling_7d_calories_observed ?? null,
      rolling_7d_protein_g_observed: link?.rolling_7d_protein_g_observed ?? null,
      rolling_7d_carbohydrates_g_observed: link?.rolling_7d_carbohydrates_g_observed ?? null,
      context_daily_calorie_target: link?.context_daily_calorie_target ?? null,
      body_weight_trend_lb_per_week_7d: link?.body_weight_trend_lb_per_week_7d ?? null,
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      source_date_start: first.workout_date,
      source_date_end: first.workout_date,
      sample_size: records.length,
      confidence_level: "pending_exercise_score",
      missing_data_flags: [!Number.isFinite(mean(records.map((record) => record.rpe))) ? "rpe" : null, !Number.isFinite(recoveryStrain.score) ? "post_workout_recovery" : null, !Number.isFinite(link?.daily_calories_observed) ? "observed_nutrition" : null].filter(Boolean).join(";"),
      source_references: sortedUnique(records.flatMap((record) => record.source_references || [])).join(";"),
      notes: "Performance comparisons remain within the exact exercise_id; shared-session recovery cannot prove exercise-specific causation."
    });
  }

  metrics.forEach((metric) => {
    if (metric.best_epley_e1rm === null || metric.best_epley_e1rm === Number.NEGATIVE_INFINITY) metric.best_epley_e1rm = null;
    if (metric.best_rpe_adjusted_e1rm === null || metric.best_rpe_adjusted_e1rm === Number.NEGATIVE_INFINITY) metric.best_rpe_adjusted_e1rm = null;
  });

  const maxGap = Number(config.progression?.max_comparable_gap_days ?? 56);
  const regimeRatioThreshold = Number(config.plausibility?.between_session_regime_change_ratio ?? 1.75);
  const regimeMinimumLoadDifference = Number(config.plausibility?.between_session_regime_change_min_absolute_load ?? 10);
  const maximumComparableChangePct = Number(config.plausibility?.maximum_comparable_performance_change_pct ?? 100);
  for (const exerciseMetrics of groupBy(metrics, "exercise_id").values()) {
    exerciseMetrics.sort((left, right) => left.workout_local_datetime.localeCompare(right.workout_local_datetime));
    let prior = null;
    let plateau = 0;
    let regression = 0;
    let comparisonSegment = 1;
    exerciseMetrics.forEach((metric, index) => {
      metric.comparison_segment_number = comparisonSegment;
      let resetReason = null;
      if (prior) {
        const gap = daysBetween(prior.workout_date, metric.workout_date);
        metric.days_since_prior_exposure = gap;
        metric.prior_exercise_session_id = prior.exercise_session_id;
        if (gap > maxGap) {
          resetReason = `Gap of ${gap} days exceeded the ${maxGap}-day comparable-exposure limit.`;
        } else if (
          metric.resistance_type === "external"
          && Number.isFinite(metric.first_working_load)
          && Number.isFinite(prior.first_working_load)
          && metric.first_working_load > 0
          && prior.first_working_load > 0
        ) {
          const highLoad = Math.max(metric.first_working_load, prior.first_working_load);
          const lowLoad = Math.min(metric.first_working_load, prior.first_working_load);
          const ratio = highLoad / lowLoad;
          const absoluteDifference = highLoad - lowLoad;
          if (ratio >= regimeRatioThreshold && absoluteDifference >= regimeMinimumLoadDifference) {
            metric.comparison_regime_change_flag = true;
            resetReason = `First-working load changed ${round(ratio, 2)}x (${round(absoluteDifference, 2)} logged-load units), exceeding the equipment/regime comparability guard.`;
          }
        }
        if (resetReason) {
          comparisonSegment += 1;
          metric.comparison_segment_number = comparisonSegment;
        }
      }
      const priorWindow4 = exerciseMetrics.slice(0, index).filter((item) => item.comparison_segment_number === metric.comparison_segment_number && daysBetween(item.workout_date, metric.workout_date) <= 28 && Number.isFinite(item.performance_value_unadjusted));
      const priorWindow6 = exerciseMetrics.slice(0, index).filter((item) => item.comparison_segment_number === metric.comparison_segment_number && daysBetween(item.workout_date, metric.workout_date) <= 42 && Number.isFinite(item.performance_value_unadjusted));
      metric.rolling_4week_performance_baseline = round(mean(priorWindow4.map((item) => item.performance_value_unadjusted)), 3);
      metric.rolling_6week_performance_baseline = round(mean(priorWindow6.map((item) => item.performance_value_unadjusted)), 3);
      if (Number.isFinite(metric.performance_value_unadjusted) && Number.isFinite(metric.rolling_4week_performance_baseline) && metric.rolling_4week_performance_baseline > 0) metric.progression_pct_vs_4week_baseline = round(((metric.performance_value_unadjusted / metric.rolling_4week_performance_baseline) - 1) * 100, 3);
      if (Number.isFinite(metric.performance_value_unadjusted) && Number.isFinite(metric.rolling_6week_performance_baseline) && metric.rolling_6week_performance_baseline > 0) metric.progression_pct_vs_6week_baseline = round(((metric.performance_value_unadjusted / metric.rolling_6week_performance_baseline) - 1) * 100, 3);
      if (!Number.isFinite(metric.performance_value_unadjusted)) {
        metric.progression_status = "not_comparable";
        metric.progression_reason = metric.progression_plausibility_excluded_set_count > 0
          ? "No progression-eligible set remained after the plausibility screen; raw rows are preserved and excluded from scoring."
          : "A comparable performance metric could not be calculated.";
        if (prior) prior.next_exposure_progression_status = metric.progression_status;
        return;
      }
      if (!prior) {
        prior = metric;
        return;
      }
      if (resetReason) {
        metric.progression_status = metric.comparison_regime_change_flag ? "regime_change_baseline" : "reentry_baseline";
        metric.progression_reason = resetReason;
        plateau = 0;
        regression = 0;
        prior.next_exposure_progression_status = metric.progression_status;
        prior = metric;
        return;
      }
      const bothAdjusted = Number.isFinite(metric.performance_value_rpe_adjusted) && Number.isFinite(prior.performance_value_rpe_adjusted);
      const currentComparisonValue = bothAdjusted ? metric.performance_value_rpe_adjusted : metric.performance_value_unadjusted;
      const priorComparisonValue = bothAdjusted ? prior.performance_value_rpe_adjusted : prior.performance_value_unadjusted;
      metric.comparison_performance_value = currentComparisonValue;
      metric.comparison_performance_basis = bothAdjusted ? "rpe_adjusted_both_sessions" : "unadjusted_because_rpe_missing_in_one_or_both_sessions";
      if (Number.isFinite(currentComparisonValue) && Number.isFinite(priorComparisonValue) && priorComparisonValue > 0) metric.progression_pct_vs_prior = round(((currentComparisonValue / priorComparisonValue) - 1) * 100, 3);
      if (Number.isFinite(metric.progression_pct_vs_prior) && Math.abs(metric.progression_pct_vs_prior) >= maximumComparableChangePct) {
        metric.progression_status = "plausibility_reset_baseline";
        metric.progression_reason = `Absolute performance change of ${Math.abs(metric.progression_pct_vs_prior)}% met the ${maximumComparableChangePct}% plausibility-reset threshold; the raw values were preserved but not scored.`;
        metric.progression_pct_vs_prior = null;
        metric.comparison_performance_value = null;
        metric.comparison_performance_basis = "excluded_by_between_session_performance_plausibility_guard";
        metric.top_set_progression_pct = null;
        metric.backoff_progression_pct = null;
        metric.comparison_regime_change_flag = true;
        comparisonSegment += 1;
        metric.comparison_segment_number = comparisonSegment;
        metric.rolling_4week_performance_baseline = null;
        metric.rolling_6week_performance_baseline = null;
        metric.progression_pct_vs_4week_baseline = null;
        metric.progression_pct_vs_6week_baseline = null;
        plateau = 0;
        regression = 0;
        prior.next_exposure_progression_status = metric.progression_status;
        prior = metric;
        return;
      }
      const bothTopAdjusted = Number.isFinite(metric.top_set_performance_rpe_adjusted) && Number.isFinite(prior.top_set_performance_rpe_adjusted);
      const currentTopValue = bothTopAdjusted ? metric.top_set_performance_rpe_adjusted : metric.top_set_performance_unadjusted;
      const priorTopValue = bothTopAdjusted ? prior.top_set_performance_rpe_adjusted : prior.top_set_performance_unadjusted;
      if (Number.isFinite(currentTopValue) && Number.isFinite(priorTopValue) && priorTopValue > 0) metric.top_set_progression_pct = round(((currentTopValue / priorTopValue) - 1) * 100, 3);
      const bothBackoffAdjusted = Number.isFinite(metric.backoff_performance_rpe_adjusted) && Number.isFinite(prior.backoff_performance_rpe_adjusted);
      const currentBackoffValue = bothBackoffAdjusted ? metric.backoff_performance_rpe_adjusted : metric.backoff_performance_unadjusted;
      const priorBackoffValue = bothBackoffAdjusted ? prior.backoff_performance_rpe_adjusted : prior.backoff_performance_unadjusted;
      if (Number.isFinite(currentBackoffValue) && Number.isFinite(priorBackoffValue) && priorBackoffValue > 0) metric.backoff_progression_pct = round(((currentBackoffValue / priorBackoffValue) - 1) * 100, 3);
      const improvedThreshold = Number(config.progression?.improved_threshold_pct ?? 1);
      const regressedThreshold = Number(config.progression?.regressed_threshold_pct ?? -1.5);
      const sameLoad = Number.isFinite(metric.first_working_load) && Number.isFinite(prior.first_working_load) && prior.first_working_load > 0 && Math.abs(metric.first_working_load - prior.first_working_load) / prior.first_working_load <= 0.01;
      const comparableRpe = !Number.isFinite(metric.first_working_rpe) || !Number.isFinite(prior.first_working_rpe) || Math.abs(metric.first_working_rpe - prior.first_working_rpe) <= 1;
      const repDecline = Number.isFinite(metric.first_working_repetitions) && Number.isFinite(prior.first_working_repetitions) ? prior.first_working_repetitions - metric.first_working_repetitions : null;
      if (Number.isFinite(repDecline) && sameLoad && comparableRpe && repDecline > Number(config.progression?.same_load_rep_decline_review ?? 3)) {
        metric.progression_status = "regressed";
        metric.progression_reason = `Same-load first-set repetitions fell by ${repDecline}, exceeding the configured review threshold.`;
      } else if (Number.isFinite(metric.progression_pct_vs_prior) && metric.progression_pct_vs_prior >= improvedThreshold) {
        metric.progression_status = "improved";
        metric.progression_reason = `Performance metric improved ${metric.progression_pct_vs_prior}% after load, repetitions, and available RPE adjustment.`;
      } else if (Number.isFinite(metric.progression_pct_vs_prior) && metric.progression_pct_vs_prior <= regressedThreshold) {
        metric.progression_status = "regressed";
        metric.progression_reason = `Performance metric declined ${Math.abs(metric.progression_pct_vs_prior)}%, beyond the configured regression threshold.`;
      } else if (Number.isFinite(metric.progression_pct_vs_prior)) {
        metric.progression_status = "held";
        const heavierFewer = Number.isFinite(metric.first_working_load) && Number.isFinite(prior.first_working_load) && metric.first_working_load > prior.first_working_load && metric.first_working_repetitions < prior.first_working_repetitions;
        metric.progression_reason = heavierFewer
          ? `Heavier load with fewer repetitions produced a ${metric.progression_pct_vs_prior}% adjusted change, inside the neutral/held band.`
          : `Adjusted performance change of ${metric.progression_pct_vs_prior}% remained inside the neutral/held band.`;
      } else {
        metric.progression_status = "not_comparable";
        metric.progression_reason = "A comparable performance metric could not be calculated.";
      }
      plateau = metric.progression_status === "held" ? plateau + 1 : 0;
      regression = metric.progression_status === "regressed" ? regression + 1 : 0;
      metric.plateau_duration_exposures = plateau;
      metric.regression_duration_exposures = regression;
      prior.next_exposure_progression_status = metric.progression_status;
      prior = metric;
    });
  }

  const weeklyExercise = new Map();
  metrics.forEach((metric) => {
    const week = mondayOfWeek(metric.workout_date);
    const key = `${week}|${metric.exercise_id}`;
    weeklyExercise.set(key, (weeklyExercise.get(key) || 0) + metric.hard_set_count);
  });
  const weeklyMuscle = new Map();
  metrics.forEach((metric) => {
    const week = mondayOfWeek(metric.workout_date);
    for (const mapping of musclesByExercise.get(metric.exercise_id) || []) {
      const key = `${week}|${mapping.muscle_group}`;
      weeklyMuscle.set(key, (weeklyMuscle.get(key) || 0) + (metric.hard_set_count * Number(mapping.contribution_weight || 0)));
    }
  });
  metrics.forEach((metric) => {
    const week = mondayOfWeek(metric.workout_date);
    metric.week_start = week;
    metric.weekly_hard_sets_exercise = round(weeklyExercise.get(`${week}|${metric.exercise_id}`) || 0, 2);
    metric.weekly_effective_hard_sets_primary_muscle = round(weeklyMuscle.get(`${week}|${metric.primary_muscle_group}`) || 0, 2);
    const priorWeekSets = weeklyExercise.get(`${addDays(week, -7)}|${metric.exercise_id}`);
    if (Number.isFinite(priorWeekSets) && priorWeekSets > 0) {
      metric.weekly_volume_ratio_vs_prior_week = round(metric.weekly_hard_sets_exercise / priorWeekSets, 3);
      metric.is_deload_week = metric.weekly_volume_ratio_vs_prior_week < Number(config.deload?.weekly_volume_ratio_threshold ?? 0.3);
    }
    const priorWeeks = [];
    for (let offset = 1; offset <= 6; offset += 1) {
      const value = weeklyExercise.get(`${addDays(week, -7 * offset)}|${metric.exercise_id}`);
      if (Number.isFinite(value)) priorWeeks.push(value);
    }
    const priorAverage = mean(priorWeeks);
    if (Number.isFinite(priorAverage) && priorAverage > 0) metric.recent_volume_pct_vs_prior_6weeks = round(((metric.weekly_hard_sets_exercise / priorAverage) - 1) * 100, 2);
    const fatigueSignals = metric.pre_workout_adverse_signal_count;
    const volumeHigh = Number.isFinite(metric.recent_volume_pct_vs_prior_6weeks) && metric.recent_volume_pct_vs_prior_6weeks >= Number(config.recovery_adverse_thresholds?.recent_volume_pct_above_42d ?? 20);
    const priorRegression = metric.progression_status === "regressed" || metric.regression_duration_exposures > 0;
    metric.accumulated_fatigue_marker_count = fatigueSignals + (volumeHigh ? 1 : 0) + (priorRegression ? 1 : 0);
    metric.accumulated_fatigue_state = metric.accumulated_fatigue_marker_count >= 3 ? "high" : metric.accumulated_fatigue_marker_count === 2 ? "elevated" : "low_or_unconfirmed";
  });

  metrics.sort((left, right) => left.workout_local_datetime.localeCompare(right.workout_local_datetime) || left.exercise_order - right.exercise_order);
  return metrics;
}

function jaccard(leftValues, rightValues) {
  const left = new Set(leftValues);
  const right = new Set(rightValues);
  const union = new Set([...left, ...right]);
  if (!union.size) return 1;
  const intersection = [...left].filter((value) => right.has(value)).length;
  return intersection / union.size;
}

function detectProgramPhases({ sessions, exerciseSessionMetrics, analysisDate, methodologyVersion }) {
  const sessionsByWeek = groupBy(sessions, (session) => mondayOfWeek(session.workout_date));
  const weeks = [...sessionsByWeek.entries()].map(([week, weekSessions]) => {
    const metrics = exerciseSessionMetrics.filter((metric) => metric.week_start === week);
    return {
      week,
      sessions: weekSessions,
      workout_names: sortedUnique(weekSessions.map((session) => session.workout_name_recorded)),
      exercises: sortedUnique(metrics.map((metric) => metric.exercise_id)),
      hard_sets: sum(metrics.map((metric) => metric.hard_set_count)) || 0
    };
  }).sort((left, right) => left.week.localeCompare(right.week));
  const phases = [];
  let current = null;
  for (const week of weeks) {
    const gap = current ? daysBetween(current.last_week, week.week) : null;
    const exerciseSimilarity = current ? jaccard(current.reference_exercises, week.exercises) : 1;
    const nameSimilarity = current ? jaccard(current.reference_workout_names, week.workout_names) : 1;
    const boundary = !current || gap > 21 || (exerciseSimilarity < 0.45 && nameSimilarity < 0.4);
    if (boundary) {
      current = {
        phase_id: `phase_${String(phases.length + 1).padStart(2, "0")}`,
        start_date: week.week,
        end_date: addDays(week.week, 6),
        last_week: week.week,
        reference_exercises: week.exercises,
        reference_workout_names: week.workout_names,
        weeks: [week]
      };
      phases.push(current);
    } else {
      current.weeks.push(week);
      current.last_week = week.week;
      current.end_date = addDays(week.week, 6);
      current.reference_exercises = sortedUnique(current.weeks.flatMap((item) => item.exercises));
      current.reference_workout_names = sortedUnique(current.weeks.flatMap((item) => item.workout_names));
    }
  }
  return phases.map((phase) => {
    const phaseSessions = phase.weeks.flatMap((week) => week.sessions);
    return {
      program_phase_id: phase.phase_id,
      start_date: phase.start_date,
      end_date: phase.end_date,
      calendar_weeks_observed: phase.weeks.length,
      session_count: phaseSessions.length,
      dominant_workout_names: sortedUnique(phaseSessions.map((session) => session.workout_name_recorded)).join(";"),
      exercise_count: new Set(phase.weeks.flatMap((week) => week.exercises)).size,
      exercises: sortedUnique(phase.weeks.flatMap((week) => week.exercises)).join(";"),
      average_hard_sets_per_observed_week: round(mean(phase.weeks.map((week) => week.hard_sets)), 2),
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: phaseSessions.length,
      confidence_level: phase.weeks.length >= 4 ? "moderate" : "low",
      missing_data_flags: "phase_boundaries_inferred",
      source_references: "normalized_workouts.csv",
      notes: "Phase boundary inferred from workout-name/exercise-set similarity or a gap greater than 21 days; not a causal label."
    };
  });
}

function averageDailyMetric(dailyMap, start, end, metricId) {
  const values = [...dailyMap.values()].filter((day) => dateInRange(day.date, start, end)).map((day) => day.metrics?.[metricId]?.value).filter(Number.isFinite);
  return { average: round(mean(values), 3), sample_size: values.length };
}

function periodWeightChange(dailyMap, start, end) {
  const values = [...dailyMap.values()]
    .filter((day) => dateInRange(day.date, start, end) && Number.isFinite(day.metrics?.body_weight_lb?.value))
    .map((day) => ({ date: day.date, value: day.metrics.body_weight_lb.value }))
    .sort((left, right) => left.date.localeCompare(right.date));
  if (!values.length) return { start: null, end: null, change: null, endpoint_start: null, endpoint_end: null, endpoint_change: null, edge_sample_size: 0, sample_size: 0 };
  const edgeSampleSize = Math.min(7, Math.max(1, Math.floor(values.length / 2)));
  const smoothedStart = mean(values.slice(0, edgeSampleSize).map((item) => item.value));
  const smoothedEnd = mean(values.slice(-edgeSampleSize).map((item) => item.value));
  return {
    start: round(smoothedStart, 3),
    end: round(smoothedEnd, 3),
    change: round(smoothedEnd - smoothedStart, 3),
    endpoint_start: values[0].value,
    endpoint_end: values.at(-1).value,
    endpoint_change: round(values.at(-1).value - values[0].value, 3),
    edge_sample_size: edgeSampleSize,
    sample_size: values.length
  };
}

function buildPeriodComparisons({ config, personalContext, dailyMap, nutritionPrimaryDaily, sessions, exerciseSessionMetrics, bodyCompositionRecords, programPhases, analysisDate, methodologyVersion }) {
  const rows = [];
  for (const period of config.periods || []) {
    const periodSessions = sessions.filter((session) => dateInRange(session.workout_date, period.start, period.end));
    const periodMetrics = exerciseSessionMetrics.filter((metric) => dateInRange(metric.workout_date, period.start, period.end));
    const nutrition = nutritionPrimaryDaily.filter((record) => dateInRange(record.date, period.start, period.end));
    const calorieNutrition = nutrition.filter((record) => Number.isFinite(record.calories));
    const proteinNutrition = nutrition.filter((record) => Number.isFinite(record.protein_g));
    const carbohydrateNutrition = nutrition.filter((record) => Number.isFinite(record.carbohydrates_g));
    const fatNutrition = nutrition.filter((record) => Number.isFinite(record.fat_g));
    const calorieContext = (personalContext.nutrition_period_context || []).find((item) => item.period_id === period.period_id);
    const weight = periodWeightChange(dailyMap, period.start, period.end);
    const hrv = averageDailyMetric(dailyMap, period.start, period.end, "hrv_rmssd_ms");
    const rhr = averageDailyMetric(dailyMap, period.start, period.end, "resting_heart_rate_bpm");
    const sleep = averageDailyMetric(dailyMap, period.start, period.end, "sleep_duration_minutes");
    const sleepingHr = averageDailyMetric(dailyMap, period.start, period.end, "sleeping_heart_rate_bpm");
    const readiness = averageDailyMetric(dailyMap, period.start, period.end, "readiness_score");
    const bodyFat = averageDailyMetric(dailyMap, period.start, period.end, "body_fat_pct");
    const outcomes = periodMetrics.filter((metric) => ["improved", "held", "regressed"].includes(metric.progression_status));
    const weeks = new Set(periodMetrics.map((metric) => metric.week_start));
    const improvements = outcomes.filter((metric) => metric.progression_status === "improved");
    const regressions = outcomes.filter((metric) => metric.progression_status === "regressed");
    const strongest = [...improvements].sort((left, right) => (right.progression_pct_vs_prior || 0) - (left.progression_pct_vs_prior || 0)).slice(0, 5);
    const weakest = [...regressions].sort((left, right) => (left.progression_pct_vs_prior || 0) - (right.progression_pct_vs_prior || 0)).slice(0, 5);
    const directReferences = (personalContext.body_composition_reference_points || []).filter((reference) => dateInRange(reference.date, period.start, period.end));
    const sourceRefs = sortedUnique([
      ...periodSessions.flatMap((session) => session.source_references || []),
      ...nutrition.flatMap((record) => String(record.source_references || "").split(";").filter(Boolean)),
      ...bodyCompositionRecords.filter((record) => dateInRange(record.date, period.start, period.end)).flatMap((record) => record.source_references || [])
    ]);
    rows.push({
      period_comparison_id: stableId("period", period.period_id),
      period_id: period.period_id,
      label: period.label,
      start_date: period.start,
      end_date: period.end,
      observed_daily_calories_average: round(mean(calorieNutrition.map((record) => record.calories)), 2),
      observed_daily_protein_g_average: round(mean(proteinNutrition.map((record) => record.protein_g)), 2),
      observed_daily_carbohydrates_g_average: round(mean(carbohydrateNutrition.map((record) => record.carbohydrates_g)), 2),
      observed_daily_fat_g_average: round(mean(fatNutrition.map((record) => record.fat_g)), 2),
      observed_nutrition_days: nutrition.length,
      observed_calorie_days: calorieNutrition.length,
      observed_protein_days: proteinNutrition.length,
      observed_carbohydrate_days: carbohydrateNutrition.length,
      observed_fat_days: fatNutrition.length,
      user_reported_calorie_target: calorieContext?.daily_calorie_target ?? null,
      calorie_target_evidence_type: calorieContext?.evidence_type ?? null,
      body_weight_start_lb: weight.start,
      body_weight_end_lb: weight.end,
      body_weight_change_lb: weight.change,
      body_weight_change_method: `mean_of_first_and_last_${weight.edge_sample_size}_observed_days`,
      body_weight_endpoint_start_lb: weight.endpoint_start,
      body_weight_endpoint_end_lb: weight.endpoint_end,
      body_weight_endpoint_change_lb: weight.endpoint_change,
      body_weight_measurement_days: weight.sample_size,
      average_hrv_ms: hrv.average,
      hrv_days: hrv.sample_size,
      average_resting_hr_bpm: rhr.average,
      resting_hr_days: rhr.sample_size,
      average_sleeping_hr_bpm: sleepingHr.average,
      sleeping_hr_days: sleepingHr.sample_size,
      average_sleep_minutes: sleep.average,
      sleep_days: sleep.sample_size,
      average_readiness_score: readiness.average,
      readiness_days: readiness.sample_size,
      average_fitindex_body_fat_pct: bodyFat.average,
      fitindex_body_fat_days: bodyFat.sample_size,
      workout_session_count: periodSessions.length,
      exercise_session_count: periodMetrics.length,
      observed_training_weeks: weeks.size,
      average_hard_sets_per_observed_week: weeks.size ? round(sum(periodMetrics.map((metric) => metric.hard_set_count)) / weeks.size, 2) : null,
      improved_exposure_count: improvements.length,
      held_exposure_count: outcomes.filter((metric) => metric.progression_status === "held").length,
      regressed_exposure_count: regressions.length,
      improvement_rate_pct: outcomes.length ? round(improvements.length / outcomes.length * 100, 2) : null,
      regression_rate_pct: outcomes.length ? round(regressions.length / outcomes.length * 100, 2) : null,
      deload_exposure_count: periodMetrics.filter((metric) => metric.is_deload_week).length,
      average_progression_pct: round(mean(outcomes.map((metric) => metric.progression_pct_vs_prior)), 3),
      average_recovery_strain_score: round(mean(periodMetrics.map((metric) => metric.recovery_strain_score)), 2),
      strongest_progression_examples: strongest.map((metric) => ({ date: metric.workout_date, exercise_id: metric.exercise_id, exercise_name: metric.exercise_name, change_pct: metric.progression_pct_vs_prior, first_set: `${metric.first_working_load} x ${metric.first_working_repetitions}`, rpe: metric.first_working_rpe })),
      regression_examples: weakest.map((metric) => ({ date: metric.workout_date, exercise_id: metric.exercise_id, exercise_name: metric.exercise_name, change_pct: metric.progression_pct_vs_prior, first_set: `${metric.first_working_load} x ${metric.first_working_repetitions}`, rpe: metric.first_working_rpe })),
      direct_body_composition_references: directReferences,
      overlapping_program_phase_ids: programPhases.filter((phase) => phase.start_date <= period.end && phase.end_date >= period.start).map((phase) => phase.program_phase_id),
      analysis_date: analysisDate,
      methodology_version: methodologyVersion,
      sample_size: periodMetrics.length,
      confidence_level: periodMetrics.length >= 20 && hrv.sample_size >= 20 ? "moderate" : periodMetrics.length >= 3 ? "low" : "insufficient personal evidence",
      missing_data_flags: [calorieNutrition.length === 0 ? "observed_calories" : null, proteinNutrition.length === 0 ? "observed_protein" : null, carbohydrateNutrition.length === 0 ? "observed_carbohydrates" : null, periodSessions.length === 0 ? "set_level_workouts" : null, directReferences.length === 0 ? "direct_body_composition" : null].filter(Boolean).join(";"),
      source_references: sourceRefs.join(";"),
      notes: calorieContext ? "User-reported calorie target is context, not measured intake. FITINDEX body fat is not InBody and is kept separate." : "No user-reported calorie target was supplied for this period. FITINDEX body fat is not InBody."
    });
  }
  return rows;
}

module.exports = {
  RECOVERY_METRICS,
  adverseSignalsForDate,
  buildExerciseSessionMetrics,
  buildPeriodComparisons,
  buildWorkoutRecoveryLinks,
  dateInRange,
  detectProgramPhases,
  metricDetail,
  nutritionContextForDate,
  sessionRecoveryStrain
};
