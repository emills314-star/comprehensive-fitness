"use strict";

const assert = require("assert");
const path = require("path");
const {
  ENGINE_VERSION,
  MESOCYCLE_TYPES,
  STALENESS,
  createPrescriptionEngine,
  normalizeEvidenceBundle,
  loadEvidenceFromFiles,
  loadEvidenceFromUrls,
  calculateEvidenceWeight,
  assessExerciseStaleness,
  chooseSetStructure,
  determineVolumePrescription,
  determineProgressionDecision,
  assessDeloadNeed,
  evaluateReadiness,
  recommendationForSurface,
  serializeRecommendationSnapshot,
  deserializeRecommendationSnapshot,
  appendRecommendationHistory,
  recommendationHistory,
  applyManualOverride,
  reconcileRecommendation,
  evaluateManualOverrideOutcome,
  transitionMesocycle
} = require("../prescription-engine");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function exercise(id, name, movement, equipment, extra = {}) {
  return {
    exercise_id: id,
    exercise_name: name,
    exercise_aliases: extra.aliases || "",
    movement_pattern: movement,
    equipment,
    primary_muscles: extra.primary || "mg_chest_sternal",
    secondary_muscles: extra.secondary || "mg_triceps|mg_front_delts",
    muscle_subdivisions_emphasized: extra.region || "mg_chest_sternal",
    stability_demand: extra.stability || "moderate",
    local_fatigue_cost: extra.fatigue || "moderate",
    recommended_rep_range_low: extra.repLow || 6,
    recommended_rep_range_high: extra.repHigh || 12,
    acceptable_rep_range_low: 3,
    acceptable_rep_range_high: 25,
    recommended_sets_per_session_low: 2,
    recommended_sets_per_session_high: 4,
    recommended_rir_low: 1,
    recommended_rir_high: 3,
    recommended_rest_seconds_low: extra.restLow || 90,
    recommended_rest_seconds_high: extra.restHigh || 240,
    preferred_progression_model: extra.progression || "double_progression",
    primary_progression_metric: "repetitions_at_load_and_rir",
    top_set_backoff_suitability: extra.topSuitability || "appropriate",
    recommended_load_increment: "2.5% or smallest increment",
    deload_criteria: "Two confirmed regressions plus fatigue; never one noisy session.",
    substitution_triggers: "Repeated pain, technical failure, or confirmed staleness.",
    range_of_motion_criteria: "Use the largest pain-free controlled ROM.",
    confidence_rating: extra.confidence || "moderate",
    direct_exercise_evidence: Boolean(extra.direct)
  };
}

function score(id, researchId, values = {}) {
  return {
    exercise_id: id,
    exercise_name: values.name || id,
    research_exercise_id: researchId,
    progression_score: values.progression ?? 75,
    hypertrophy_support_score: values.hypertrophy ?? 75,
    recovery_efficiency_score: values.recovery ?? 75,
    repeatability_score: values.repeatability ?? 75,
    overall_personal_exercise_score: values.overall ?? 75,
    data_confidence_score: values.confidence ?? 80,
    comparable_session_count: values.comparable ?? 10,
    session_count: values.sessions ?? 12,
    observation_span_days: values.span ?? 180,
    rpe_completeness_pct: values.rpeCompleteness ?? 90,
    recovery_completeness_pct: values.recoveryCompleteness ?? 90,
    nutrition_completeness_pct: values.nutritionCompleteness ?? 50,
    maximum_plateau_exposures: values.plateau ?? 1,
    main_reason_for_score: values.reason || "Consistent progression with manageable recovery cost."
  };
}

function muscleScore(id, researchMuscle = "mg_chest_sternal", values = {}) {
  return {
    exercise_id: id,
    exercise_name: values.name || id,
    muscle_group: values.muscle || "chest",
    muscle_role: values.role || "primary",
    contribution_weight: values.contribution ?? 1,
    research_muscle_group_id: researchMuscle,
    muscle_specific_effectiveness_score: values.specificity ?? 85,
    progression_score: values.progression ?? 75,
    recovery_efficiency_score: values.recovery ?? 75
  };
}

function prescription(id, researchId, values = {}) {
  return {
    exercise_id: id,
    exercise_name: values.name || id,
    research_exercise_id: researchId,
    muscle_group_id: values.muscle || "chest",
    research_muscle_group_id: values.researchMuscle || "mg_chest_sternal",
    role: values.role || "primary_progression_lift",
    recommended_sets_per_session: values.sets || { min: 2, max: 4 },
    recommended_weekly_sets: values.weekly || { min: 6, max: 10 },
    recommended_sessions_per_week: values.frequency || { min: 1.5, max: 2.5 },
    recommended_rep_range: values.reps || { min: 6, max: 10 },
    recommended_rpe: values.rpe || { min: 7.5, max: 8.5 },
    recommended_rir: values.rir || { min: 1.5, max: 2.5 },
    recommended_rest_seconds: values.rest || { min: 120, max: 240 },
    top_set_structure: { recommended_count: values.topCount ?? 1 },
    backoff_set_structure: { recommended_count: values.backoffCount ?? 2 },
    recommended_future_range: values.future || undefined,
    observed_best_range: values.observed || { qualifying_sessions: 8 },
    highest_recoverable_range_observed: { max_sets_per_session: 4, max_weekly_hard_sets: 12 },
    confidence_level: values.confidenceLevel || "high",
    confidence_score: values.confidence ?? 85,
    sample_size: values.sessions ?? 12,
    evidence_summary: values.summary || "Personal exposure history supports this operating range.",
    deload_rule: { trigger: "Two regressions plus a fatigue or pain signal." }
  };
}

function exposure(status, performance, rpe, values = {}) {
  return {
    workout_date: values.date || `2026-0${values.month || 1}-${String(values.day || 1).padStart(2, "0")}`,
    progression_status: status,
    progression_pct_vs_prior: values.progressionPercent ?? (status === "improved" ? 2 : status === "regressed" ? -3 : 0),
    comparison_performance_value: performance,
    best_epley_e1rm: performance,
    average_rpe: rpe,
    recovery_strain_score: values.recovery ?? 30,
    max_set_rep_loss_pct: values.repLoss ?? 10,
    max_set_load_reduction_pct: values.loadReduction ?? 12,
    plateau_duration_exposures: values.plateau ?? 0,
    regression_duration_exposures: values.regression ?? 0,
    pain: Boolean(values.pain),
    set_repetitions: JSON.stringify(values.reps || [8, 8, 8]),
    set_loads: JSON.stringify(values.loads || [100, 100, 100]),
    top_set_count: values.topCount ?? 0,
    back_off_set_count: values.backoffCount ?? 0,
    straight_working_set_count: values.straightCount ?? 3,
    backoff_performance_value: values.backoffPerformance ?? performance * 0.9
  };
}

const improvingHistory = [
  exposure("baseline", 100, 8, { day: 1, topCount: 1, backoffCount: 2, straightCount: 0 }),
  exposure("improved", 103, 8, { day: 8, topCount: 1, backoffCount: 2, straightCount: 0 }),
  exposure("improved", 106, 8, { day: 15, topCount: 1, backoffCount: 2, straightCount: 0 }),
  exposure("improved", 109, 8, { day: 22, topCount: 1, backoffCount: 2, straightCount: 0 })
];

const regressionHistory = [
  exposure("held", 110, 8, { day: 1, recovery: 45, topCount: 1, backoffCount: 2, straightCount: 0 }),
  exposure("held", 110, 8.5, { day: 8, recovery: 58, topCount: 1, backoffCount: 2, straightCount: 0 }),
  exposure("regressed", 105, 9, { day: 15, recovery: 70, repLoss: 32, regression: 1, backoffPerformance: 85, topCount: 1, backoffCount: 2, straightCount: 0 }),
  exposure("regressed", 101, 9.5, { day: 22, recovery: 76, repLoss: 38, regression: 2, backoffPerformance: 75, topCount: 1, backoffCount: 2, straightCount: 0 })
];

function fixture() {
  const researchExercises = [
    exercise("ex_press", "Stable Barbell Press", "horizontal_push", "barbell_and_bench", { confidence: "moderate", stability: "high", fatigue: "high", repLow: 5, repHigh: 10 }),
    exercise("ex_machine", "Machine Chest Press", "horizontal_push", "selectorized_machine", { confidence: "very_high", stability: "low", direct: true }),
    exercise("ex_incline", "Incline Dumbbell Press", "incline_push", "dumbbells_and_incline_bench", { region: "mg_chest_clavicular", confidence: "high" }),
    exercise("ex_fly", "Cable Fly", "shoulder_horizontal_adduction", "dual_cable", { confidence: "moderate", fatigue: "low", stability: "low", repLow: 10, repHigh: 20, topSuitability: "not_recommended" }),
    exercise("ex_dip", "Chest Dip", "vertical_push", "bodyweight", { confidence: "moderate", stability: "high", fatigue: "high" }),
    exercise("ex_pushup", "Deficit Push-Up", "horizontal_push", "bodyweight", { confidence: "low", region: "mg_chest_sternal", fatigue: "low" }),
    exercise("ex_decline", "Decline Machine Press", "decline_push", "plate_loaded_machine", { confidence: "moderate", region: "mg_chest_sternal" }),
    exercise("ex_curl", "Cable Curl", "elbow_flexion", "cable", { primary: "mg_biceps", secondary: "", confidence: "moderate", fatigue: "low", repLow: 8, repHigh: 15, topSuitability: "not_recommended" })
  ];
  const maps = researchExercises.map((item, index) => ({
    exercise_muscle_map_id: `map_${index}`,
    exercise_id: item.exercise_id,
    muscle_group_id: item.exercise_id === "ex_curl" ? "mg_biceps" : item.muscle_subdivisions_emphasized,
    relationship_type: "primary",
    fractional_set_credit: 1
  }));
  return {
    personalData: {
      exerciseScores: [
        score("personal_press", "ex_press", { name: "Stable Barbell Press", progression: 96, hypertrophy: 93, recovery: 92, repeatability: 94, overall: 94, comparable: 12, sessions: 14, confidence: 94 }),
        score("two_session_press", "ex_incline", { name: "Incline Dumbbell Press", progression: 99, hypertrophy: 99, recovery: 99, comparable: 2, sessions: 2, confidence: 40, span: 8 }),
        score("blended_decline", "ex_decline", { name: "Decline Machine Press", progression: 82, hypertrophy: 80, recovery: 78, comparable: 5, sessions: 6, confidence: 70, span: 75 }),
        score("personal_curl", "ex_curl", { name: "Cable Curl", progression: 80, hypertrophy: 82, recovery: 88, comparable: 9, sessions: 10, confidence: 85 })
      ],
      exerciseMuscleScores: [
        muscleScore("personal_press", "mg_chest_sternal", { name: "Stable Barbell Press", specificity: 95, progression: 96, recovery: 92 }),
        muscleScore("two_session_press", "mg_chest_clavicular", { name: "Incline Dumbbell Press", specificity: 92 }),
        muscleScore("blended_decline", "mg_chest_sternal", { name: "Decline Machine Press", specificity: 88 }),
        muscleScore("personal_curl", "mg_biceps", { name: "Cable Curl", muscle: "biceps", specificity: 96 })
      ],
      exercisePrescriptions: [
        prescription("personal_press", "ex_press", { name: "Stable Barbell Press" }),
        prescription("two_session_press", "ex_incline", { name: "Incline Dumbbell Press", researchMuscle: "mg_chest_clavicular", reps: { min: 18, max: 25 }, sessions: 2, confidence: 40 }),
        prescription("blended_decline", "ex_decline", { name: "Decline Machine Press", reps: { min: 8, max: 15 }, sessions: 6, confidence: 70 }),
        prescription("personal_curl", "ex_curl", { name: "Cable Curl", muscle: "biceps", researchMuscle: "mg_biceps", role: "secondary_hypertrophy_lift", reps: { min: 10, max: 15 }, topCount: 0, backoffCount: 0 })
      ],
      exerciseSessionMetrics: [],
      weeklyMuscleVolumeResponse: [],
      recoveryRules: [],
      muscleGroupSweetSpots: [],
      metadata: { methodology_version: "personal-test-1.0.0" }
    },
    researchData: {
      exerciseDatabase: researchExercises,
      exerciseMuscleMap: maps,
      exerciseSubstitutionMap: [
        { exercise_id: "ex_press", substitute_exercise_id: "ex_machine", reason: "Same primary muscle with more stability." },
        { exercise_id: "ex_machine", substitute_exercise_id: "ex_incline" },
        { exercise_id: "ex_incline", substitute_exercise_id: "ex_fly" },
        { exercise_id: "ex_curl", substitute_exercise_id: "ex_curl" }
      ],
      muscleGroupRecommendations: [
        {
          muscle_group_id: "mg_chest_sternal", muscle_group: "chest", minimum_effective_weekly_sets: 6,
          typical_effective_weekly_sets_low: 8, typical_effective_weekly_sets_high: 14,
          recommended_sets_per_session_low: 2, recommended_sets_per_session_high: 5,
          recommended_frequency_low: 1, recommended_frequency_high: 3,
          recommended_rep_range_low: 5, recommended_rep_range_high: 20,
          recommended_rir_low: 1, recommended_rir_high: 4,
          recommended_rest_seconds_low: 90, recommended_rest_seconds_high: 240,
          confidence_rating: "moderate", notes: "Use pain-free pressing and adduction patterns."
        },
        {
          muscle_group_id: "mg_chest_clavicular", muscle_group: "chest", minimum_effective_weekly_sets: 4,
          typical_effective_weekly_sets_low: 6, typical_effective_weekly_sets_high: 12,
          recommended_sets_per_session_low: 2, recommended_sets_per_session_high: 4,
          recommended_frequency_low: 1, recommended_frequency_high: 3,
          recommended_rep_range_low: 6, recommended_rep_range_high: 20,
          recommended_rir_low: 1, recommended_rir_high: 4,
          recommended_rest_seconds_low: 90, recommended_rest_seconds_high: 240,
          confidence_rating: "low", notes: "Include an incline or shoulder-flexion-biased option."
        },
        {
          muscle_group_id: "mg_biceps", muscle_group: "biceps", minimum_effective_weekly_sets: 4,
          typical_effective_weekly_sets_low: 6, typical_effective_weekly_sets_high: 12,
          recommended_sets_per_session_low: 2, recommended_sets_per_session_high: 4,
          recommended_frequency_low: 1, recommended_frequency_high: 3,
          recommended_rep_range_low: 6, recommended_rep_range_high: 20,
          recommended_rir_low: 0, recommended_rir_high: 3,
          recommended_rest_seconds_low: 60, recommended_rest_seconds_high: 180,
          confidence_rating: "moderate", notes: "Use repeatable elbow-flexion work."
        }
      ],
      progressionRules: [],
      nutritionStrategies: [],
      manifest: { database_version: "research-test-1.0.0" }
    }
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("personal-data precedence beats a slightly stronger generic research rating", () => {
  const engine = createPrescriptionEngine(fixture());
  const personal = engine.scoreExercise("personal_press", "chest", { history: improvingHistory });
  const generic = engine.scoreExercise("ex_machine", "chest");
  assert(personal.personalEvidenceWeight >= 0.68);
  assert(personal.overallRecommendationStrength > generic.overallRecommendationStrength);
});

test("fewer than three comparable exposures use the research default", () => {
  const engine = createPrescriptionEngine(fixture());
  const snapshot = engine.prescribeExercise({ exerciseId: "two_session_press", muscleGroupId: "chest", history: improvingHistory.slice(0, 2), createdAt: "2026-07-11T12:00:00.000Z" });
  assert.strictEqual(snapshot.personalEvidenceWeight, 0);
  assert.strictEqual(snapshot.confidence, "research_default");
  assert(snapshot.finalPrescription.repRange.max <= 12, "sparse personal 18-25 range must not override the 6-12 exercise default");
});

test("moderate personal evidence creates a genuine blend", () => {
  const result = calculateEvidenceWeight({
    comparableExposures: 5, sessionCount: 6, observationSpanDays: 75, statedConfidence: 0.7,
    rpeCompleteness: 0.7, recoveryCompleteness: 0.75, nutritionCompleteness: 0.4,
    variationConsistency: 0.9, muscleAttributionConfidence: 0.95, confoundingPenalty: 0.05, programChangePenalty: 0
  });
  assert(result.personalEvidenceWeight > 0 && result.personalEvidenceWeight < 0.68);
  assert.strictEqual(result.researchEvidenceWeight, Number((1 - result.personalEvidenceWeight).toFixed(3)));
});

test("ranking returns a diversified five-exercise candidate pool", () => {
  const engine = createPrescriptionEngine(fixture());
  const pool = engine.rankExercisePool("chest", { histories: { personal_press: improvingHistory } });
  assert.strictEqual(pool.candidates.length, 5);
  assert(pool.candidates.some((item) => item.exerciseId === "personal_press"));
  assert(new Set(pool.candidates.map((item) => item.diversitySignature.equipment)).size >= 3);
  assert(new Set(pool.candidates.map((item) => item.diversitySignature.movement)).size >= 3);
  pool.candidates.forEach((item, index) => {
    assert.strictEqual(item.rank, index + 1);
    assert(item.reasonForMesocycle && item.preferredReplacementExerciseId);
    assert(item.scores.overallRecommendationStrength >= 0);
  });
});

test("a productive lift remains productive despite many exposures or a new block", () => {
  const longProductive = Array.from({ length: 14 }, (_, index) => exposure(index ? "improved" : "baseline", 100 + index * 2, 8, { day: index + 1 }));
  const result = assessExerciseStaleness(longProductive, { currentMesocycleExposures: 14 });
  assert.strictEqual(result.classification, STALENESS.PRODUCTIVE);
  assert.strictEqual(result.rotationRecommended, false);
});

test("repeated regression and rising fatigue creates a rotation/deload candidate", () => {
  const result = assessExerciseStaleness(regressionHistory);
  assert.strictEqual(result.classification, STALENESS.ROTATION_CANDIDATE);
  assert.strictEqual(result.deloadCandidate, true);
  assert(result.metrics.rpeTrend > 0);
});

test("primary compound may receive top set plus back-off sets", () => {
  const researchExercise = fixture().researchData.exerciseDatabase.find((item) => item.exercise_id === "ex_press");
  const result = chooseSetStructure({
    researchExercise, personalPrescription: prescription("personal_press", "ex_press"), history: improvingHistory,
    role: "primary_progression_lift", workingSets: { min: 2, target: 3, max: 4 }, repRange: { min: 6, target: 8, max: 10 }, personalEvidenceWeight: 0.8
  });
  assert.strictEqual(result.setStructure, "top_set_backoff");
  assert.strictEqual(result.topSet.enabled, true);
  assert.strictEqual(result.backoffSets.count, 2);
  assert(result.backoffSets.loadReductionPercent.target >= 8);
});

test("isolation lift receives straight sets when a peak set adds no value", () => {
  const researchExercise = fixture().researchData.exerciseDatabase.find((item) => item.exercise_id === "ex_curl");
  const result = chooseSetStructure({
    researchExercise, personalPrescription: prescription("personal_curl", "ex_curl", { topCount: 0, backoffCount: 0 }),
    history: improvingHistory.map((item) => ({ ...item, top_set_count: 0, back_off_set_count: 0, straight_working_set_count: 3 })),
    role: "secondary_hypertrophy_lift", workingSets: { min: 2, target: 3, max: 4 }, repRange: { min: 10, target: 12, max: 15 }, personalEvidenceWeight: 0.8
  });
  assert.strictEqual(result.setStructure, "straight_sets");
  assert.strictEqual(result.topSet, undefined);
});

test("conflicting personal structure summaries are surfaced, not blindly trusted", () => {
  const researchExercise = fixture().researchData.exerciseDatabase[0];
  const personal = prescription("personal_press", "ex_press", {
    topCount: 0, backoffCount: 0,
    future: { top_and_backoff_pattern: "1 top / 2 back-off / 0 straight" },
    observed: { qualifying_sessions: 6 }
  });
  const result = chooseSetStructure({ researchExercise, personalPrescription: personal, history: [], role: "primary_progression_lift", workingSets: { target: 3 }, repRange: { min: 6, target: 8, max: 10 }, personalEvidenceWeight: 0.8 });
  assert.strictEqual(result.evidenceConflict, "personal_structure_fields_disagree");
  assert(result.reasoning.includes("disagree"));
});

test("volume holds on a plateau and reduces for regression instead of auto-increasing", () => {
  const common = {
    personalRanges: { setsPerSession: { min: 3, max: 4 }, weeklySets: { min: 8, max: 12 } },
    researchDefaults: { setsPerSession: { min: 2, target: 3, max: 5 }, weeklySets: { min: 6, target: 10, max: 16 } },
    personalEvidenceWeight: 0.7, personalPrescription: {}, muscleGroupId: "chest"
  };
  const stalled = determineVolumePrescription({ ...common, staleness: { classification: STALENESS.STALLED } });
  const regressing = determineVolumePrescription({ ...common, staleness: { classification: STALENESS.REGRESSING } });
  const aboveWeeklyRange = determineVolumePrescription({ ...common, staleness: { classification: STALENESS.PRODUCTIVE }, currentWeeklySets: 18 });
  assert(stalled.reason.includes("held"));
  assert(regressing.perExercise.currentPrescribed < stalled.perExercise.currentPrescribed);
  assert.strictEqual(regressing.adjustmentType, "reduce_volume");
  assert.strictEqual(aboveWeeklyRange.adjustmentType, "reduce_volume");
  assert(aboveWeeklyRange.reason.includes("exceeds"));
});

test("progression decisions produce an exact next action", () => {
  const addRep = determineProgressionDecision({ history: [exposure("held", 100, 8, { reps: [8, 8, 7] })], repRange: { min: 6, max: 10 }, targetRpe: { min: 7, max: 9 }, setStructure: "straight_sets", staleness: { classification: STALENESS.PRODUCTIVE, deloadCandidate: false } });
  const addLoad = determineProgressionDecision({ history: [exposure("improved", 105, 8, { reps: [10, 10, 10] })], repRange: { min: 6, max: 10 }, targetRpe: { min: 7, max: 9 }, setStructure: "straight_sets", staleness: { classification: STALENESS.PRODUCTIVE, deloadCandidate: false } });
  const backoff = determineProgressionDecision({ history: [{ ...exposure("improved", 105, 8, { reps: [10, 9, 8] }), backoffReps: [9, 8] }], repRange: { min: 6, max: 10 }, targetRpe: { min: 7, max: 9 }, setStructure: "top_set_backoff", staleness: { classification: STALENESS.PRODUCTIVE, deloadCandidate: false } });
  const fixedLoad = determineProgressionDecision({ history: [exposure("improved", 100, 8, { reps: [9, 8, 8] })], repRange: { min: 6, max: 10 }, targetRpe: { min: 7, max: 9 }, progressionMethod: "fixed_load_progression", staleness: { classification: STALENESS.PRODUCTIVE, deloadCandidate: false } });
  const volume = determineProgressionDecision({ history: [exposure("improved", 100, 8, { reps: [10, 10] })], repRange: { min: 6, max: 10 }, targetRpe: { min: 7, max: 9 }, progressionMethod: "volume_progression", workingSets: { target: 2, max: 4 }, staleness: { classification: STALENESS.PRODUCTIVE, deloadCandidate: false } });
  const loadFirst = determineProgressionDecision({ history: [exposure("improved", 100, 8, { reps: [7, 7, 6] })], repRange: { min: 6, max: 10 }, targetRpe: { min: 7, max: 9 }, progressionMethod: "load_first", staleness: { classification: STALENESS.PRODUCTIVE, deloadCandidate: false } });
  const technique = determineProgressionDecision({ history: [exposure("improved", 100, 8, { reps: [8, 8, 8] })], repRange: { min: 6, max: 10 }, targetRpe: { min: 7, max: 9 }, progressionMethod: "rom_then_reps", staleness: { classification: STALENESS.PRODUCTIVE, deloadCandidate: false } });
  assert.strictEqual(addRep.action, "add_one_rep");
  assert.strictEqual(addLoad.action, "increase_load");
  assert.strictEqual(backoff.action, "progress_backoff_reps");
  assert.strictEqual(fixedLoad.progressionMethod, "fixed_load_progression");
  assert.strictEqual(volume.action, "add_one_working_set");
  assert.strictEqual(loadFirst.progressionMethod, "load_first_progression");
  assert.strictEqual(technique.progressionMethod, "technique_quality_progression");
});

test("exercise-specific deload stays scoped to one exercise", () => {
  const result = assessDeloadNeed({ exerciseHistory: regressionHistory, readiness: { hrvRatio: 1, sleepHours: 8, baselineSleepHours: 8 } });
  assert.strictEqual(result.state, "exercise_deload");
  assert.strictEqual(result.fullProgram, false);
  assert.strictEqual(result.muscleGroup, false);
});

test("multiple degraded exercises trigger a muscle-group deload", () => {
  const result = assessDeloadNeed({ exerciseHistory: regressionHistory, muscleExerciseHistories: [regressionHistory, regressionHistory], readiness: {} });
  assert.strictEqual(result.state, "muscle_group_deload");
  assert.strictEqual(result.muscleGroup, true);
});

test("widespread decline plus persistent systemic suppression triggers a full deload", () => {
  const result = assessDeloadNeed({
    exerciseHistory: regressionHistory,
    muscleExerciseHistories: [regressionHistory, regressionHistory],
    programMuscleHistories: [[regressionHistory, regressionHistory], [regressionHistory, regressionHistory], [regressionHistory, regressionHistory]],
    readiness: { hrvRatio: 0.8, sleepHours: 5, baselineSleepHours: 8, consecutiveLowReadinessDays: 3 }
  });
  assert.strictEqual(result.state, "full_program_deload");
  assert.strictEqual(result.fullProgram, true);
});

test("one poor HRV value cannot trigger a full-program deload", () => {
  const result = assessDeloadNeed({
    exerciseHistory: regressionHistory,
    programMuscleHistories: [[regressionHistory], [regressionHistory], [regressionHistory]],
    readiness: { hrvRatio: 0.75, consecutiveLowReadinessDays: 1 }
  });
  assert.notStrictEqual(result.state, "full_program_deload");
  assert.strictEqual(result.readinessEvaluation.signalCount, 1);
});

test("nutrition is one readiness domain and needs an independent signal to change today", () => {
  const nutritionOnly = evaluateReadiness({ nutritionAdequate: false, proteinAdequate: false, energyAvailabilityLow: true });
  assert.strictEqual(nutritionOnly.signalCount, 1, "Multiple nutrition concerns must remain one domain");
  const converging = evaluateReadiness({ nutritionAdequate: false, sleepHours: 5.5, baselineSleepHours: 8 });
  assert.strictEqual(converging.signalCount, 2);
  const engine = createPrescriptionEngine(fixture());
  const snapshot = engine.prescribeExercise({ exerciseId: "personal_press", muscleGroupId: "chest", history: improvingHistory, readiness: { nutritionAdequate: false, sleepHours: 5.5, baselineSleepHours: 8 }, createdAt: "2026-07-11T12:00:00.000Z" });
  assert(snapshot.finalPrescription.workingSets.target < snapshot.basePrescription.workingSets.target);
  assert.strictEqual(snapshot.finalPrescription.readinessAdjustment.temporary, true);
});

test("low readiness changes today without rewriting the base or mesocycle", () => {
  const engine = createPrescriptionEngine(fixture());
  const snapshot = engine.prescribeExercise({
    exerciseId: "personal_press", muscleGroupId: "chest", history: improvingHistory,
    readiness: { hrvRatio: 0.82, sleepHours: 5.5, baselineSleepHours: 8, previousExposureRegressed: true },
    mesocycleId: "meso_fixed", createdAt: "2026-07-11T12:00:00.000Z"
  });
  assert.strictEqual(snapshot.basePrescription.mesocycleId, "meso_fixed");
  assert.strictEqual(snapshot.finalPrescription.mesocycleId, "meso_fixed");
  assert(snapshot.finalPrescription.workingSets.target < snapshot.basePrescription.workingSets.target);
  assert.strictEqual(snapshot.finalPrescription.readinessAdjustment.temporary, true);
  assert.strictEqual(snapshot.finalPrescription.readinessAdjustment.affectsMesocycle, false);
});

test("all four mesocycle types create five-candidate pools and lifecycle states", () => {
  const engine = createPrescriptionEngine(fixture());
  Object.values(MESOCYCLE_TYPES).forEach((type) => {
    const mesocycle = engine.createMesocycle({
      type, muscleGroupIds: ["chest"], histories: { personal_press: improvingHistory },
      currentExerciseIds: ["personal_press"], specializationMuscleGroups: ["chest"], createdAt: "2026-07-11T12:00:00.000Z"
    });
    assert(mesocycle.durationWeeks >= 2 && mesocycle.durationWeeks <= 12);
    assert.strictEqual(mesocycle.pools.chest.candidates.length, 5);
    assert(mesocycle.preservedProductiveExerciseIds.includes("personal_press"), `${type} should preserve a progressing lift`);
    const active = transitionMesocycle(mesocycle, "start", { at: "2026-07-12T12:00:00.000Z" });
    const completed = transitionMesocycle(active, "complete", { at: "2026-08-20T12:00:00.000Z", outcome: { progressed: true } });
    const reviewed = transitionMesocycle(completed, "review", { at: "2026-08-21T12:00:00.000Z", review: { retain: ["personal_press"] } });
    assert.strictEqual(reviewed.status, "reviewed");
  });
});

test("coach, template, chart, and live workout share one stored recommendation", () => {
  const engine = createPrescriptionEngine(fixture());
  const snapshot = engine.prescribeExercise({ exerciseId: "personal_press", muscleGroupId: "chest", history: improvingHistory, createdAt: "2026-07-11T12:00:00.000Z" });
  const surfaces = ["coach", "template", "chart", "live_workout"].map((surface) => recommendationForSurface(snapshot, surface));
  surfaces.forEach((view) => {
    assert.strictEqual(view.recommendationId, snapshot.recommendationId);
    assert.strictEqual(view.finalPrescription, snapshot.finalPrescription);
    assert.deepStrictEqual(view.finalPrescription, surfaces[0].finalPrescription);
  });
});

test("versioned history reopens the original recommendation unchanged", () => {
  const engine = createPrescriptionEngine(fixture());
  const snapshot = engine.prescribeExercise({ exerciseId: "personal_press", muscleGroupId: "chest", history: improvingHistory, createdAt: "2026-07-11T12:00:00.000Z" });
  const serialized = serializeRecommendationSnapshot(snapshot);
  const reopened = deserializeRecommendationSnapshot(serialized);
  assert.deepStrictEqual(reopened, snapshot);
  const storage = memoryStorage();
  appendRecommendationHistory(storage, snapshot);
  const history = recommendationHistory(storage);
  assert.strictEqual(history[0].personalDataVersion, "personal-test-1.0.0");
  assert.strictEqual(history[0].researchDatabaseVersion, "research-test-1.0.0");
  assert.deepStrictEqual(history[0].basePrescription, snapshot.basePrescription);
  assert.throws(() => appendRecommendationHistory(storage, { ...snapshot, explanation: "silently changed" }), /refusing to silently rewrite/);
});

test("manual overrides are audited and locked for the workout", () => {
  const engine = createPrescriptionEngine(fixture());
  const snapshot = engine.prescribeExercise({ exerciseId: "personal_press", muscleGroupId: "chest", history: improvingHistory, createdAt: "2026-07-11T12:00:00.000Z" });
  const overridden = applyManualOverride(snapshot, {
    setCount: 4, repRange: { min: 8, max: 12 }, load: 112.5, setStructure: "straight_sets",
    deloadRecommendation: false, mesocycleId: "meso_user_choice"
  }, { workoutId: "workout_1", reason: "Good warm-ups", createdAt: "2026-07-11T12:05:00.000Z" });
  assert.strictEqual(overridden.finalPrescription.workingSets.target, 4);
  assert.strictEqual(overridden.finalPrescription.prescribedLoad.target, 112.5);
  assert.strictEqual(overridden.finalPrescription.setStructure, "straight_sets");
  assert.strictEqual(overridden.overrideLocked, true);
  assert.strictEqual(overridden.manualOverrides.length, 1);
  const recomputed = engine.prescribeExercise({ exerciseId: "personal_press", muscleGroupId: "chest", history: regressionHistory, createdAt: "2026-07-11T12:10:00.000Z" });
  assert.deepStrictEqual(reconcileRecommendation(overridden, recomputed), overridden, "same-workout override must not be undone");
  const evaluated = evaluateManualOverrideOutcome(overridden, { completed: true, progressed: true, recoveryCost: 30, pain: false }, { evaluatedAt: "2026-07-12T12:00:00.000Z" });
  assert.strictEqual(evaluated.manualOverrides[0].outcomeEvaluation.result, "override_outperformed_or_supported");
});

test("file adapters load the real private aggregates locally without embedding them", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  assert(evidence.personal.exerciseScores.length >= 100);
  assert(evidence.personal.exercisePrescriptions.length >= 100);
  assert(evidence.research.exerciseDatabase.length >= 50);
  assert.strictEqual(evidence.versions.research, "1.0.0");
});

test("URL loader tolerates unavailable protected personal sources and still loads research", async () => {
  const data = fixture().researchData;
  const fileMap = {
    "exercise_database.json": data.exerciseDatabase,
    "exercise_muscle_map.json": data.exerciseMuscleMap,
    "exercise_substitution_map.json": data.exerciseSubstitutionMap,
    "muscle_group_recommendations.json": data.muscleGroupRecommendations,
    "progression_rules.json": data.progressionRules,
    "nutrition_strategies.json": data.nutritionStrategies,
    "manifest.json": data.manifest
  };
  const mockFetch = async (url) => {
    const name = String(url).split("/").pop();
    if (String(url).includes("protected-personal")) return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    return { ok: true, status: 200, json: async () => fileMap[name], text: async () => "" };
  };
  const evidence = await loadEvidenceFromUrls({ fetch: mockFetch, researchBaseUrl: "/research", personalBaseUrl: "/protected-personal", includeSessionMetrics: true });
  assert.strictEqual(evidence.personal.exerciseScores.length, 0);
  assert.strictEqual(evidence.research.exerciseDatabase.length, data.exerciseDatabase.length);
});

(async function run() {
  let passed = 0;
  const failures = [];
  for (const item of tests) {
    try {
      await item.fn();
      passed += 1;
      console.log(`PASS ${item.name}`);
    } catch (error) {
      failures.push({ name: item.name, error });
      console.error(`FAIL ${item.name}`);
      console.error(error.stack || error.message || error);
    }
  }
  console.log(`\nPrescription engine ${ENGINE_VERSION}: ${passed}/${tests.length} tests passed.`);
  if (failures.length) process.exitCode = 1;
})();
