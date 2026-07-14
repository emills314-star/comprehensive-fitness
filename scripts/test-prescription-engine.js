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
  equipmentRequirementOptions,
  equipmentCompatible,
  candidateProgramFit,
  mechanicalRedundancyScore,
  recalculateHistoricalMuscleVolume,
  recommendationForSurface,
  serializeRecommendationSnapshot,
  deserializeRecommendationSnapshot,
  appendRecommendationHistory,
  recommendationHistory,
  applyManualOverride,
  reconcileRecommendation,
  refreshRecommendationChecksum,
  evaluateManualOverrideOutcome,
  transitionMesocycle,
  canDeleteMesocycle
} = require("../prescription-engine");

const tests = [];
const PUBLIC_CHECKOUT = process.env.CF_PUBLIC_CHECKOUT === "1";
function test(name, fn, options = {}) { tests.push({ name, fn, privateOnly: options.privateOnly === true }); }
function privateTest(name, fn) { test(name, fn, { privateOnly: true }); }

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
  assert(
    snapshot.finalPrescription.workingSets.target < snapshot.basePrescription.workingSets.target
      || snapshot.finalPrescription.targetRpe.max < snapshot.basePrescription.targetRpe.max
      || Number(snapshot.finalPrescription.prescribedLoad?.target) < Number(snapshot.basePrescription.prescribedLoad?.target),
    "converging readiness domains must produce a truthful temporary set, effort, or load reduction"
  );
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
  assert(
    snapshot.finalPrescription.workingSets.target < snapshot.basePrescription.workingSets.target
      || snapshot.finalPrescription.targetRpe.max < snapshot.basePrescription.targetRpe.max
      || Number(snapshot.finalPrescription.prescribedLoad?.target) < Number(snapshot.basePrescription.prescribedLoad?.target),
    "low readiness must produce a truthful temporary set, effort, or load reduction"
  );
  assert.strictEqual(snapshot.finalPrescription.readinessAdjustment.temporary, true);
  assert.strictEqual(snapshot.finalPrescription.readinessAdjustment.affectsMesocycle, false);
});

test("all four mesocycle types create five-candidate pools and lifecycle states", () => {
  const engine = createPrescriptionEngine(fixture());
  Object.values(MESOCYCLE_TYPES).forEach((type) => {
    const mesocycle = engine.createMesocycle({
      type, muscleGroupIds: ["chest"], histories: { personal_press: improvingHistory },
      currentExerciseIds: ["personal_press"], specializationMuscleGroups: ["chest"], maximumReturnGapDays: 365, createdAt: "2026-07-11T12:00:00.000Z"
    });
    assert(mesocycle.durationWeeks >= 2 && mesocycle.durationWeeks <= 12);
    assert.strictEqual(mesocycle.pools.chest.candidates.length, 5);
    assert.strictEqual(mesocycle.status, "draft");
    assert(mesocycle.programSlots.length >= 1);
    assert(mesocycle.selectedPortfolio.length >= 1);
    assert(mesocycle.sessions.length >= 1);
    assert(Array.isArray(mesocycle.programReview.warnings));
    assert(mesocycle.preservedProductiveExerciseIds.includes("personal_press"), `${type} should preserve a progressing lift`);
    const planned = transitionMesocycle(mesocycle, "plan", { at: "2026-07-12T11:00:00.000Z" });
    const active = transitionMesocycle(planned, "start", { at: "2026-07-12T12:00:00.000Z" });
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

test("meaning-preserving unit representation changes can refresh snapshot integrity", () => {
  const engine = createPrescriptionEngine(fixture());
  const snapshot = engine.prescribeExercise({ exerciseId: "personal_press", muscleGroupId: "chest", history: improvingHistory, createdAt: "2026-07-11T12:00:00.000Z" });
  const converted = JSON.parse(JSON.stringify(snapshot));
  if (converted.finalPrescription.prescribedLoad?.target) converted.finalPrescription.prescribedLoad.target /= 2.2046226218;
  assert.throws(() => deserializeRecommendationSnapshot(converted), /checksum/i, "Changing a stored numeric representation must invalidate the old checksum");
  const refreshed = refreshRecommendationChecksum(converted);
  assert.doesNotThrow(() => deserializeRecommendationSnapshot(refreshed));
  assert.notStrictEqual(refreshed.checksum, snapshot.checksum);
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

privateTest("file adapters load the real private aggregates locally without embedding them", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  assert(evidence.personal.exerciseScores.length >= 100);
  assert(evidence.personal.exercisePrescriptions.length >= 100);
  assert(evidence.research.exerciseDatabase.length >= 50);
  assert.strictEqual(evidence.versions.research, "2.0.0");
});

test("full-program portfolio scoring and lifecycle protections are explicit", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  const engine = createPrescriptionEngine(evidence);
  const mesocycle = engine.createMesocycle({ trainingDays: 4, includedMuscleGroupIds: ["chest", "upper_back", "quads", "hamstrings", "glutes", "abs"], currentProgramExerciseIds: ["ex_barbell_bench_press"], availableEquipment: ["all"] });
  assert(mesocycle.programSlots.every((slot) => slot.selectionRequired >= 1 && slot.selectedExerciseIds.length >= 1));
  assert(mesocycle.selectedPortfolio.every((candidate) => Number.isFinite(candidate.scores.predictedProgramEffectiveness) && Number.isFinite(candidate.scores.fullProgramFit)));
  assert(mesocycle.sessions.every((session) => session.baseSessionIntent && Number.isFinite(session.spinalLoad) && Number.isFinite(session.estimatedDurationMinutes)));
  mesocycle.programReview.warnings.forEach((warning) => {
    assert(warning.conflict && warning.why && warning.recommendation);
    assert(Array.isArray(warning.exerciseIds));
  });
  assert.strictEqual(canDeleteMesocycle(mesocycle), true);
  const planned = transitionMesocycle({ ...mesocycle, scopeConfirmed: true }, "plan");
  const active = transitionMesocycle(planned, "start");
  assert.strictEqual(canDeleteMesocycle(active), false);
  const completed = transitionMesocycle(active, "complete");
  assert.strictEqual(canDeleteMesocycle(completed), false);
});

test("mesocycle volume and frequency are balanced across coherent sessions", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  const engine = createPrescriptionEngine(evidence);
  const practicalScope = ["chest", "upper_back", "lats", "quads", "hamstrings", "glutes", "side_delts", "biceps", "triceps", "calves"];
  [3, 4, 5].forEach((trainingDays) => {
    const mesocycle = engine.createMesocycle({ trainingDays, includedMuscleGroupIds: practicalScope, availableEquipment: ["all"] });
    const chest = mesocycle.programReview.musclePlans.find((plan) => plan.muscleGroupId === "chest");
    assert(chest && chest.effectiveSets >= chest.weeklyTargetRange.min, "Chest must meet its evidence-adjusted minimum");
    mesocycle.programReview.musclePlans.forEach((plan) => assert(plan.plannedFrequency >= plan.targetFrequency, `${plan.muscleGroupId} must meet planned frequency`));
    mesocycle.selectedPortfolio.filter((exercise) => exercise.scores.highFatigueCompound).forEach((exercise) => {
      const days = mesocycle.sessions.filter((session) => session.exercises.some((item) => item.exerciseId === exercise.exerciseId)).map((session) => session.dayIndex).sort((a, b) => a - b);
      assert(!days.some((day, index) => index && day - days[index - 1] <= 1), `${exercise.exerciseName} cannot repeat on consecutive days`);
    });
    assert(mesocycle.sessions.every((session) => session.primaryPurpose), "Every session needs a coherent named purpose");
  });
});

test("four-day broad scope is constructed within hard daily limits", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  const engine = createPrescriptionEngine(evidence);
  const seed = engine.createMesocycle({ trainingDays: 4, availableEquipment: ["all"] });
  const scope = seed.availableMuscleGroupIds.filter((muscle) => !["abs", "neck"].includes(muscle));
  const mesocycle = engine.createMesocycle({ trainingDays: 4, includedMuscleGroupIds: scope, availableEquipment: ["all"] });
  mesocycle.sessions.forEach((session) => {
    const workingSets = session.exercises.reduce((total, exercise) => total + Number(exercise.plannedSets || 0), 0);
    assert(workingSets <= 18, `${session.name} exceeded 18 working sets`);
    const counts = new Map();
    session.exercises.forEach((exercise) => exercise.targetMuscleGroupIds.forEach((muscle) => counts.set(muscle, (counts.get(muscle) || 0) + 1)));
    counts.forEach((count, muscle) => assert(count <= 2, `${session.name} assigned ${count} exercises to ${muscle}`));
    assert(session.exercises.length <= 10, `${session.name} is not practical at ${session.exercises.length} exercises`);
  });
  ["chest", "upper_back", "lats", "quads", "hamstrings", "glutes"].forEach((muscle) => {
    const plan = mesocycle.programReview.musclePlans.find((item) => item.muscleGroupId === muscle);
    assert(plan && plan.directSets >= Math.min(plan.weeklyTargetRange.min, plan.weeklyTargetVolume), `${muscle} should receive direct work before supplemental muscles`);
  });
  mesocycle.programReview.musclePlans.forEach((plan) => {
    assert(Number.isFinite(plan.directSets) && Number.isFinite(plan.secondarySets) && Number.isFinite(plan.incidentalSets));
    assert.strictEqual(plan.incidentalSets, 0, "incidental stabilization must not count as hypertrophy volume");
  });
});

test("limited schedule reports capacity instead of forcing oversized sessions", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  const engine = createPrescriptionEngine(evidence);
  const mesocycle = engine.createMesocycle({ trainingDays: 1, availableEquipment: ["all"] });
  assert(mesocycle.sessions.every((session) => session.workingSetCount <= 18));
  const capacity = mesocycle.programReview.warnings.find((warning) => warning.type === "schedule_capacity");
  assert(capacity && capacity.severity === "blocking");
  assert.deepStrictEqual(capacity.resolutionOptions, ["increase_training_days", "reduce_scope", "reduce_direct_volume", "maintenance_volume", "change_objective"]);
  const regenerated = engine.refreshMesocycle(mesocycle, { autoFix: true });
  assert(regenerated.sessions.every((session) => session.workingSetCount <= 18), "regeneration must retain the hard daily cap");
});

test("secondary contribution remains fractional and cannot become hidden direct volume", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  const engine = createPrescriptionEngine(evidence);
  const mesocycle = engine.createMesocycle({ trainingDays: 4, includedMuscleGroupIds: ["chest", "triceps", "front_delts", "quads", "glutes", "adductors"], availableEquipment: ["all"] });
  mesocycle.programReview.musclePlans.forEach((plan) => {
    assert.strictEqual(plan.effectiveSets, Number((plan.directSets + plan.secondarySets).toFixed(1)));
    assert(plan.secondarySets <= mesocycle.sessions.flatMap((session) => session.exercises).reduce((total, exercise) => total + Number(exercise.plannedSets || 0), 0) * 0.35);
  });
  const adductors = mesocycle.programReview.musclePlans.find((plan) => plan.muscleGroupId === "adductors");
  assert(adductors && adductors.directSets >= 0 && adductors.secondarySets >= 0);
});

test("blocking validation prevents an under-prescribed program from being treated as confirmable", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  const engine = createPrescriptionEngine(evidence);
  const mesocycle = engine.createMesocycle({ trainingDays: 4 });
  const chestSlot = mesocycle.programSlots.find((slot) => slot.muscleGroupId === "chest");
  const sessions = mesocycle.sessions.map((session) => ({ ...session, exercises: session.exercises.filter((exercise) => !exercise.programSlotIds.includes(chestSlot.id)) }));
  const review = require("../prescription-engine").reviewFullProgram(mesocycle.selectedPortfolio, sessions, mesocycle.programSlots, engine.evidence);
  assert(review.blockingIssueCount > 0);
  assert(review.warnings.some((warning) => warning.type === "volume_below_target" && warning.severity === "blocking"));
});

test("session sustainability guardrails flag excessive exercise and working-set counts", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  const engine = createPrescriptionEngine(evidence);
  const mesocycle = engine.createMesocycle({ trainingDays: 4 });
  const overloadedExercise = { ...mesocycle.selectedPortfolio[0], plannedSets: 3 };
  const overloaded = { ...mesocycle.sessions[0], exercises: Array.from({ length: 11 }, (_, index) => ({ ...overloadedExercise, exerciseId: `${overloadedExercise.exerciseId}_${index}` })) };
  const review = require("../prescription-engine").reviewFullProgram(mesocycle.selectedPortfolio, [overloaded, ...mesocycle.sessions.slice(1)], mesocycle.programSlots, engine.evidence);
  assert(review.warnings.some((warning) => warning.type === "exercise_count" && warning.severity === "blocking"));
  assert(review.warnings.some((warning) => warning.type === "working_set_count" && warning.severity === "blocking"));
  assert.strictEqual(overloaded.exerciseCount, 11);
  assert.strictEqual(overloaded.workingSetCount, 33);
});

test("user-defined muscle scope is respected and omissions require explicit confirmation", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  const engine = createPrescriptionEngine(evidence);
  const included = ["chest", "upper_back", "quads", "hamstrings", "glutes", "abs"];
  const mesocycle = engine.createMesocycle({ trainingDays: 4, includedMuscleGroupIds: included });
  assert.deepStrictEqual(mesocycle.includedMuscleGroupIds.slice().sort(), included.slice().sort());
  assert(mesocycle.programSlots.every((slot) => included.includes(slot.muscleGroupId)));
  assert(mesocycle.omittedMuscleGroups.some((item) => item.muscleGroupId === "lats" && item.importance === "major" && item.explanation.length > 60));
  assert(mesocycle.omittedMuscleGroups.some((item) => item.importance === "smaller"));
  assert(mesocycle.omittedMuscleGroups.every((item) => item.reasonCode && item.explanation.length > 40));
  assert.strictEqual(mesocycle.scopeConfirmed, false);
  assert.throws(() => transitionMesocycle(mesocycle, "plan"), /omitted muscle groups/i);
  const confirmed = { ...mesocycle, scopeConfirmed: true };
  assert.strictEqual(transitionMesocycle(confirmed, "plan").status, "planned");
});

test("cambered bench aliases resolve through the canonical eligible library", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  const engine = createPrescriptionEngine(evidence);
  ["Camber Bar Bench Press", "Cambered Barbell Bench Press", "Cambered Bench Press"].forEach((alias) => {
    assert.strictEqual(evidence.research.exerciseIdByAlias.get(alias.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")), "ex_cambered_barbell_bench_press");
  });
  const pool = engine.rankExercisePool("chest", { maxCandidates: 5, availableEquipment: ["barbell"] });
  const visible = pool.candidates.some((candidate) => candidate.exerciseId === "ex_cambered_barbell_bench_press");
  const excluded = pool.excludedCandidates.some((candidate) => candidate.exerciseId === "ex_cambered_barbell_bench_press");
  assert(visible || excluded, "Eligible cambered bench must appear or carry an explicit exclusion reason");
});

test("equipment restrictions honor complete and alternative requirements", () => {
  const bench = { exercise_id: "ex_barbell_bench_press", equipment: "barbell_and_bench" };
  const nordic = { exercise_id: "ex_nordic_curl", equipment: "bodyweight" };
  const row = { exercise_id: "ex_chest_supported_row", equipment: "dumbbell_or_machine" };
  assert.deepStrictEqual(equipmentRequirementOptions(bench), [["barbell", "plates", "bench", "rack"]]);
  assert.strictEqual(equipmentCompatible(bench, ["barbell", "plates", "bench", "rack"]).eligible, true, "barbell, plates, bench and rack should satisfy bench press");
  assert.strictEqual(equipmentCompatible(bench, ["barbell", "rack"]).eligible, true, "the simplified barbell and rack selections supply plates, a bench, and rack capabilities");
  assert.strictEqual(equipmentCompatible(bench, ["barbell"]).eligible, false, "barbell alone must not imply a rack or bench");
  assert.strictEqual(equipmentCompatible(nordic, ["bodyweight"]).eligible, false, "Nordics require an anchor, not only floor space");
  assert.strictEqual(equipmentCompatible(nordic, ["bodyweight", "nordic_anchor"]).eligible, true);
  assert.strictEqual(equipmentCompatible(row, ["dumbbell"]).eligible, true, "an OR equipment path should be accepted");
  assert.strictEqual(equipmentCompatible(row, ["selectorized_machine"]).eligible, true, "the machine alternative should be accepted");
  assert.strictEqual(equipmentCompatible(row, ["bodyweight"]).eligible, false);
  assert.strictEqual(equipmentCompatible(bench, ["all"]).eligible, true, "All Equipment is explicit unrestricted access");
});

test("bodyweight, dumbbell, barbell-rack, commercial, and mixed-home pools never leak unavailable equipment", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  const engine = createPrescriptionEngine(evidence);
  const scenarios = [
    ["bodyweight only", ["bodyweight"]],
    ["dumbbells only", ["dumbbell"]],
    ["barbell and rack", ["barbell", "rack"]],
    ["full commercial gym", ["all"]],
    ["mixed home gym", ["bodyweight", "bands", "dumbbell", "rack"]]
  ];
  scenarios.forEach(([label, availableEquipment]) => {
    const pools = engine.buildAllCandidatePools({ availableEquipment });
    Object.values(pools).flatMap((pool) => pool.candidates).forEach((candidate) => {
      const source = evidence.research.exerciseById.get(candidate.researchExerciseId) || {};
      assert.strictEqual(equipmentCompatible(source, availableEquipment).eligible, true, `${label} leaked ${candidate.exerciseName}`);
    });
  });
  const bodyweightPlan = engine.createMesocycle({ availableEquipment: ["bodyweight"], trainingDays: 3 });
  bodyweightPlan.selectedPortfolio.forEach((candidate) => {
    const source = evidence.research.exerciseById.get(candidate.researchExerciseId) || {};
    assert.strictEqual(equipmentCompatible(source, ["bodyweight"]).eligible, true, `bodyweight plan leaked ${candidate.exerciseName}`);
  });
  assert(bodyweightPlan.programReview.warnings.some((warning) => warning.type === "equipment_blocks_muscle"), "restricted equipment must visibly block unsupported in-scope muscles rather than silently dropping them");
});

test("redundancy requires shared mechanics and primary target, not generic compound overlap", () => {
  const baseScores = { overallRecommendationStrength: 80, recoveryEfficiency: 75, easeOfProgression: 80, personalEvidenceWeight: 0.6, spinalLoad: 75, gripDemand: 75, systemicFatigue: 75, jointStress: 40 };
  const candidate = { exerciseId: "deadlift", exerciseName: "Deadlift", primaryMuscles: ["mg_spinal_erectors"], jointActions: ["hip_extension"], diversitySignature: { movement: "hinge", equipment: "barbell" }, scores: baseScores };
  const unrelated = [
    { exerciseId: "bench", exerciseName: "Bench Press", primaryMuscles: ["mg_chest_sternal"], jointActions: ["shoulder_horizontal_adduction"], diversitySignature: { movement: "horizontal_push", equipment: "barbell" }, scores: baseScores },
    { exerciseId: "chin", exerciseName: "Chin-Up", primaryMuscles: ["mg_lats"], jointActions: ["shoulder_adduction"], diversitySignature: { movement: "vertical_pull", equipment: "bodyweight" }, scores: baseScores },
    { exerciseId: "fly", exerciseName: "Cable Fly", primaryMuscles: ["mg_chest_sternal"], jointActions: ["shoulder_horizontal_adduction"], diversitySignature: { movement: "horizontal_push", equipment: "cable" }, scores: baseScores }
  ];
  const clean = candidateProgramFit(candidate, unrelated);
  assert(!clean.limitingFactors.some((reason) => /redundant/i.test(reason)), "deadlift must not be redundant with bench, chin-up, or fly");
  const hinges = ["Romanian Deadlift", "Stiff-Leg Deadlift"].map((name, index) => ({ exerciseId: `hinge_${index}`, exerciseName: name, primaryMuscles: ["mg_spinal_erectors"], jointActions: ["hip_extension"], diversitySignature: { movement: "hinge", equipment: "barbell" }, scores: baseScores }));
  assert(candidateProgramFit(candidate, hinges).limitingFactors.some((reason) => /mechanically redundant/i.test(reason)), "multiple same-target hinges should trigger redundancy review");
  assert(mechanicalRedundancyScore(candidate, hinges[0]) >= 0.72, "same-target hinges should be mechanically similar");
  assert.strictEqual(mechanicalRedundancyScore(candidate, unrelated[0]), 0, "different target muscles and mechanics are not redundant");
  const unknown = { ...hinges[0], diversitySignature: { movement: "unknown", equipment: "barbell" } };
  assert.strictEqual(mechanicalRedundancyScore(candidate, unknown), 0, "unknown movement metadata must never establish redundancy");
  const press = { exerciseId: "press", exerciseName: "Bench Press", primaryMuscles: ["mg_chest_sternal"], jointActions: ["shoulder_horizontal_adduction", "elbow_extension"], diversitySignature: { movement: "horizontal_push", equipment: "barbell", loading: "heavy", stability: "stable" }, role: "primary_progression_lift", scores: baseScores };
  const fly = { exerciseId: "fly", exerciseName: "Cable Fly", primaryMuscles: ["mg_chest_sternal"], jointActions: ["shoulder_horizontal_adduction"], diversitySignature: { movement: "horizontal_push", equipment: "cable", loading: "moderate", stability: "stable" }, role: "secondary_hypertrophy_lift", scores: baseScores };
  assert(mechanicalRedundancyScore(press, fly) < 0.72, "same-muscle exercises with different joint actions, loading, and roles should remain complementary");
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

test("generated mesocycles use each canonical exercise on only one day", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  const engine = createPrescriptionEngine(evidence);
  const plan = engine.createMesocycle({ trainingDays: 5, includedMuscleGroupIds: ["chest", "upper_back", "lats", "quads", "hamstrings", "glutes", "side_delts", "biceps", "triceps"], availableEquipment: ["all"] });
  const canonicalDays = new Map();
  plan.sessions.forEach((session) => session.exercises.forEach((exercise) => {
    const canonical = exercise.researchExerciseId || exercise.exerciseId;
    if (!canonicalDays.has(canonical)) canonicalDays.set(canonical, new Set());
    canonicalDays.get(canonical).add(session.id);
  }));
  canonicalDays.forEach((days, canonical) => assert.strictEqual(days.size, 1, `${canonical} repeated across days`));
  const regenerated = engine.refreshMesocycle(plan, { trainingDays: 5 });
  const regeneratedIds = regenerated.sessions.flatMap((session) => session.exercises.map((exercise) => exercise.researchExerciseId || exercise.exerciseId));
  assert.strictEqual(regeneratedIds.length, new Set(regeneratedIds).size, "Regeneration must preserve canonical uniqueness");
  assert.strictEqual(evidence.research.exerciseIdByAlias.get("camber bar bench press"), evidence.research.exerciseIdByAlias.get("cambered bench press"));
});

test("compound taxonomy distinguishes dynamic, fractional, incidental, and isometric loading", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  const compounds = ["ex_deadlift", "ex_romanian_deadlift", "ex_back_squat", "ex_leg_press", "ex_barbell_bench_press", "ex_incline_dumbbell_press", "ex_pull_up", "ex_lat_pulldown", "ex_chest_supported_row", "ex_overhead_press"];
  compounds.forEach((exerciseId) => assert((evidence.research.muscleMapsByExercise.get(exerciseId) || []).length > 1, `${exerciseId} needs multiple classified relationships`));
  const deadlift = evidence.research.muscleMapsByExercise.get("ex_deadlift");
  assert(deadlift.some((row) => row.muscle_group_id === "mg_glutes_max" && row.relationship_type === "direct_load" && row.fractional_set_credit === 1));
  assert(deadlift.some((row) => row.muscle_group_id === "mg_quadriceps" && row.relationship_type === "meaningful_fractional_load"));
  assert(deadlift.some((row) => row.muscle_group_id === "mg_spinal_erectors" && row.relationship_type === "isometric_stabilizing_load" && row.fractional_set_credit === 0));
  assert(deadlift.some((row) => row.muscle_group_id === "mg_forearms" && row.local_fatigue_weight > 0 && row.fractional_set_credit === 0));
});

test("weighted taxonomy volume is traceable, deterministic, and leaves logged records unchanged", () => {
  const evidence = loadEvidenceFromFiles(path.resolve(__dirname, ".."), { includeSessionMetrics: false, includeWeeklyVolume: false });
  const logged = [{ exerciseName: "Conventional Deadlift", workingSets: 4, weight: 405, reps: 5, rpe: 8, date: "2026-07-01" }];
  const before = JSON.stringify(logged);
  const first = recalculateHistoricalMuscleVolume(evidence, logged);
  const second = recalculateHistoricalMuscleVolume(evidence, logged);
  assert.strictEqual(JSON.stringify(logged), before, "Historical logged performance must remain immutable");
  assert.deepStrictEqual(first, second, "Recalculation must be deterministic");
  const relationshipTaxonomyVersions = [...new Set((evidence.research.muscleMapsByExercise.get("ex_deadlift") || []).map((row) => row.taxonomy_version).filter(Boolean))];
  assert.strictEqual(relationshipTaxonomyVersions.length, 1, "The deadlift fixture must use exactly one relationship taxonomy version");
  assert.strictEqual(first.taxonomyVersion, relationshipTaxonomyVersions[0], "Historical recalculation must report relationship taxonomy provenance rather than the overall research database version");
  const glutes = first.muscleTotals.find((row) => row.muscleGroupId === "mg_glutes_max");
  const quads = first.muscleTotals.find((row) => row.muscleGroupId === "mg_quadriceps");
  const erectors = first.muscleTotals.find((row) => row.muscleGroupId === "mg_spinal_erectors");
  assert.strictEqual(glutes.directSets, 4);
  assert.strictEqual(quads.fractionalSets, 2);
  assert.strictEqual(erectors.weightedHypertrophySets, 0);
  assert(erectors.isometricExposure > 0);
  assert.strictEqual(glutes.contributions.reduce((sum, row) => sum + row.weightedHypertrophySets, 0), glutes.weightedHypertrophySets);
});

test("straight-set load progression requires a top first set and acceptable later-set rep loss", () => {
  const decision = determineProgressionDecision({
    history: [{ workout_date: "2026-06-28", progression_status: "held", set_repetitions: "[15,13]", set_loads: "[80,80]", set_rpes: "[8,8]", average_rpe: 8 }],
    repRange: { min: 10, max: 15 }, targetRpe: { min: 8, max: 8 }, setStructure: "straight_sets", progressionMethod: "double_progression"
  });
  assert.strictEqual(decision.action, "increase_load", "15 and 13 reps are within the 20% acceptable rep-loss boundary and should progress load");
  assert.match(decision.instruction, /every comparable straight set/);
  const plannedReductionIgnored = determineProgressionDecision({
    history: [
      { workout_date: "2026-06-28", progression_status: "improved", set_repetitions: "[14]", set_loads: "[52.5]", set_rpes: "[8]" },
      { workout_date: "2026-07-06", progression_status: "planned_reduction", prescribed_reduction: true, set_repetitions: "[12]", set_loads: "[45]", set_rpes: "[7]" }
    ], repRange: { min: 6, max: 12 }, targetRpe: { min: 7, max: 8 }, setStructure: "straight_sets"
  });
  assert.notStrictEqual(plannedReductionIgnored.recommendationType, "reduce_volume", "a prescribed light exposure must not be reclassified as weakness");
});

(async function run() {
  let passed = 0;
  let skippedPrivate = 0;
  const failures = [];
  for (const item of tests) {
    if (PUBLIC_CHECKOUT && item.privateOnly) {
      skippedPrivate += 1;
      console.log(`SKIP PRIVATE ${item.name}: protected local aggregates are intentionally absent in CF_PUBLIC_CHECKOUT=1.`);
      continue;
    }
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
  const executed = tests.length - skippedPrivate;
  console.log(`\nPrescription engine ${ENGINE_VERSION}: ${passed}/${executed} executed tests passed; ${skippedPrivate} truly private test skipped; ${tests.length} total discovered.`);
  if (failures.length) process.exitCode = 1;
})();
