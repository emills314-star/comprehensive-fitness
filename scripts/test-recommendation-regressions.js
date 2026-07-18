"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { readApplicationContractSource } = require("./read-application-contract-source");
const {
  STALENESS,
  applyManualOverride,
  assessExerciseStaleness,
  createPrescriptionEngine,
  determineProgressionDecision,
  deserializeRecommendationSnapshot,
  equipmentCompatible,
  equipmentRequirementOptions,
  evaluateReadiness,
  normalizeAvailableEquipmentInput,
  normalizeEvidenceBundle,
  rankExercisePool,
  readinessAdjustmentFor,
  recalculateHistoricalMuscleVolume,
  refreshRecommendationChecksum,
  validateSnapshot
} = require("../prescription-engine");

const ROOT = path.resolve(__dirname, "..");

function publicResearchData() {
  return {
    exerciseDatabase: require("../research_database/exports/json/exercise_database.json"),
    exerciseMuscleMap: require("../research_database/exports/json/exercise_muscle_map.json"),
    exerciseSubstitutionMap: require("../research_database/exports/json/exercise_substitution_map.json"),
    muscleGroupRecommendations: require("../research_database/exports/json/muscle_group_recommendations.json"),
    progressionRules: require("../research_database/exports/json/progression_rules.json"),
    nutritionStrategies: require("../research_database/exports/json/nutrition_strategies.json"),
    manifest: require("../research_database/exports/json/manifest.json")
  };
}

const evidence = normalizeEvidenceBundle({ personalData: {}, researchData: publicResearchData() });
const engine = createPrescriptionEngine(evidence);
const overrideAuditEngine = createPrescriptionEngine({
  personalData: {
    exerciseScores: [{
      exercise_id: "custom_override_audit_press",
      exercise_name: "Synthetic Override Audit Press",
      research_exercise_id: "ex_barbell_bench_press",
      equipment: "barbell_and_bench",
      progression_score: 92,
      hypertrophy_support_score: 90,
      recovery_efficiency_score: 90,
      repeatability_score: 94,
      overall_personal_exercise_score: 92,
      data_confidence_score: 95,
      comparable_session_count: 12,
      session_count: 14,
      observation_span_days: 180,
      rpe_completeness_pct: 100,
      recovery_completeness_pct: 100,
      nutrition_completeness_pct: 100
    }],
    exerciseMuscleScores: [{
      exercise_id: "custom_override_audit_press",
      exercise_name: "Synthetic Override Audit Press",
      muscle_group: "chest",
      research_muscle_group_id: "mg_chest_sternal",
      muscle_role: "primary",
      contribution_weight: 1,
      muscle_specific_effectiveness_score: 92,
      progression_score: 92,
      recovery_efficiency_score: 90
    }],
    exercisePrescriptions: [{
      exercise_id: "custom_override_audit_press",
      exercise_name: "Synthetic Override Audit Press",
      research_exercise_id: "ex_barbell_bench_press",
      muscle_group_id: "chest",
      research_muscle_group_id: "mg_chest_sternal",
      role: "primary_progression_lift",
      recommended_sets_per_session: { min: 4, max: 4 },
      recommended_weekly_sets: { min: 8, max: 10 },
      recommended_sessions_per_week: { min: 2, max: 2 },
      recommended_rep_range: { min: 6, max: 10 },
      recommended_rpe: { min: 7.5, max: 8.5 },
      recommended_rir: { min: 1.5, max: 2.5 },
      recommended_rest_seconds: { min: 120, max: 240 },
      top_set_structure: { recommended_count: 1 },
      backoff_set_structure: { recommended_count: 3 },
      observed_best_range: { qualifying_sessions: 12 },
      highest_recoverable_range_observed: { max_sets_per_session: 4, max_weekly_hard_sets: 10 },
      confidence_level: "high",
      confidence_score: 95,
      sample_size: 12,
      evidence_summary: "Synthetic high-confidence productive override-audit fixture."
    }],
    metadata: { methodology_version: "override-audit-fixture/1.0.0" }
  },
  researchData: publicResearchData()
});
const createdAt = "2026-07-12T12:00:00.000Z";
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function progressionHistory(overrides = {}) {
  return [{
    workout_date: "2026-07-10",
    progression_status: "held",
    comparison_performance_value: 110,
    set_repetitions: "[10,10,10]",
    set_loads: "[100,100,100]",
    set_rpes: "[8,8,8]",
    average_rpe: 8,
    completedSetRatio: 1,
    ...overrides
  }];
}

function progressionDecision(overrides = {}) {
  return determineProgressionDecision({
    history: progressionHistory(overrides),
    repRange: { min: 6, max: 10 },
    targetRpe: { min: 7, max: 9 },
    setStructure: "straight_sets",
    staleness: { classification: STALENESS.PRODUCTIVE, deloadCandidate: false }
  });
}

function assertNotProgress(decision, context) {
  assert.notEqual(
    decision.recommendationType,
    "progress",
    `${context} must block progression; received ${decision.action}/${decision.recommendationType}`
  );
}

function assertHardSafetyBlocked(snapshot, expectedReason, expectedScope) {
  const final = snapshot.finalPrescription;
  assert.equal(final.executionBlocked, true, `${expectedReason} must explicitly block execution`);
  assert.deepEqual(final.workingSets, { min: 0, target: 0, max: 0 }, `${expectedReason} must expose no executable working sets`);
  assert.equal(final.volume.perExercise.currentPrescribed, 0, `${expectedReason} must expose no executable per-exercise volume`);
  assert.equal(final.volume.perExercise.deload, 0, `${expectedReason} must not expose deload work as executable`);
  assert.deepEqual(final.volume.perMusclePerSession, { min: 0, target: 0, max: 0 }, `${expectedReason} must expose no executable session volume`);
  assert.equal(final.volume.perMusclePerWeek.currentPrescribed, 0, `${expectedReason} must expose no executable weekly volume`);
  assert.equal(final.prescribedLoad, undefined, `${expectedReason} must not expose a prescribed load`);
  assert.equal(final.topSet, undefined, `${expectedReason} must not expose a top-set target`);
  assert.equal(final.backoffSets, undefined, `${expectedReason} must not expose back-off targets`);
  assert.equal(final.safetyRestriction.schemaVersion, "hard-safety/1.0.0");
  assert.equal(final.safetyRestriction.status, "blocked");
  assert.equal(final.safetyRestriction.reason, expectedReason);
  assert.equal(final.safetyRestriction.scope, expectedScope);
  assert.ok(final.safetyRestriction.resumeCriteria, `${expectedReason} must state resume criteria`);
  assert.deepEqual(final.safetyRestriction.auditBaseTargets.workingSets, snapshot.basePrescription.workingSets, `${expectedReason} base sets must survive only as audit context`);
  assert.deepEqual(final.safetyRestriction.auditBaseTargets.repRange, snapshot.basePrescription.repRange, `${expectedReason} base reps must survive only as audit context`);
  assert.deepEqual(final.safetyRestriction.auditBaseTargets.targetRpe, snapshot.basePrescription.targetRpe, `${expectedReason} base RPE must survive only as audit context`);
}

function collectFailures(checks) {
  const failures = [];
  for (const [label, check] of checks) {
    try { check(); }
    catch (error) { failures.push(`${label}: ${error.message}`); }
  }
  if (failures.length) throw new Error(failures.join("\n"));
}

function regressionHistory(options = {}) {
  const pain = options.pain !== false;
  return [0, 1, 2, 3].map((index) => ({
    workout_date: `2026-07-${String(1 + index * 2).padStart(2, "0")}`,
    progression_status: index < 2 ? "held" : "regressed",
    progression_pct_vs_prior: index < 2 ? 0 : -3,
    comparison_performance_value: 100 - index * 4,
    best_epley_e1rm: 100 - index * 4,
    average_rpe: 8 + index * 0.5,
    recovery_strain_score: index < 2 ? 50 : 75,
    max_set_rep_loss_pct: index < 2 ? 10 : 35,
    regression_duration_exposures: index < 2 ? 0 : index - 1,
    pain: pain && index >= 2,
    set_repetitions: "[8,7,6]",
    set_loads: "[100,100,100]"
  }));
}

test("illness and pain have hard readiness precedence", () => {
  const result = evaluateReadiness({ illness: true, pain: true, affectedMuscle: "Chest" });
  assert.notEqual(result.state, "normal", `illness/pain returned ${JSON.stringify(result)}`);
  assert.ok(result.signalCount > 0, `illness/pain emitted no safety signal: ${JSON.stringify(result)}`);
  const illness = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", readiness: { illness: true }, createdAt });
  assert.equal(illness.finalPrescription.recommendationType, "hold", JSON.stringify(illness.finalPrescription.readinessAdjustment));
  assert.equal(illness.finalPrescription.progressionAction, "stop_for_illness");
  assertHardSafetyBlocked(illness, "illness", "workout");
  const pain = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: progressionHistory(), readiness: { pain: true, affectedMuscle: "Chest" }, createdAt });
  assert.equal(pain.finalPrescription.recommendationType, "substitute", JSON.stringify(pain.finalPrescription.readinessAdjustment));
  assert.equal(pain.finalPrescription.progressionAction, "hold_for_pain_free_substitution");
  assertHardSafetyBlocked(pain, "pain", "exercise");
});

test("runtime snapshot validation rejects missing, mismatched, and unknown schema versions", () => {
  const snapshot = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", createdAt });
  const missing = structuredClone(snapshot);
  delete missing.schemaVersion;
  assert.throws(() => validateSnapshot(missing), /schemaVersion/i);
  const mismatched = { ...structuredClone(snapshot), schemaVersion: "1.0.0" };
  assert.throws(() => validateSnapshot(mismatched), /version pair|requires/i, "a legacy snapshot label cannot be attached to a current prescription");
  const unsupported = { ...structuredClone(snapshot), schemaVersion: "999.0.0" };
  assert.throws(() => validateSnapshot(unsupported), /unsupported.*schemaVersion|schemaVersion.*unsupported/i, "an unknown schema must fail closed");
});

test("current illness or pain supersedes every deload scope", () => {
  const regression = regressionHistory({ pain: false });
  const programMuscleHistories = [0, 1, 2].map(() => [regression, regression]);
  const scopeCases = [
    ["exercise", {}],
    ["muscle", { muscleExerciseHistories: [regression, regression] }],
    ["full program", { programMuscleHistories }]
  ];
  const safetyCases = [
    ["illness", { illness: true, sleepHours: 4, baselineSleepHours: 8, consecutiveLowReadinessDays: 2 }, "hold", "stop_for_illness"],
    ["pain", { pain: true, affectedMuscle: "Chest", sleepHours: 4, baselineSleepHours: 8, consecutiveLowReadinessDays: 2 }, "substitute", "hold_for_pain_free_substitution"]
  ];
  collectFailures(scopeCases.flatMap(([scope, scopeOptions]) => safetyCases.map(([label, readiness, recommendationType, action]) => [
    `${scope} ${label}`,
    () => {
      const snapshot = engine.prescribeExercise({
        exerciseId: "ex_barbell_bench_press",
        muscleGroupId: "chest",
        history: regression,
        readiness,
        ...scopeOptions,
        createdAt
      });
      assert.equal(snapshot.finalPrescription.recommendationType, recommendationType, `${scope} ${label}: ${JSON.stringify(snapshot.finalPrescription.deloadStatus)}`);
      assert.equal(snapshot.finalPrescription.progressionAction, action);
      assert.equal(snapshot.finalPrescription.readinessAdjustment.loadChangePercent, 0, "hard safety must not create a reduced-load test");
      assert.ok(!["exercise_deload", "muscle_group_deload", "full_program_deload", "light_session"].includes(snapshot.finalPrescription.recommendationType));
    }
  ])));
});

test("HRV and resting heart rate count as one correlated readiness domain", () => {
  const readiness = { hrvRatio: 0.8, restingHeartRateRatio: 1.15 };
  const evaluation = evaluateReadiness(readiness);
  assert.equal(evaluation.signalCount, 1, JSON.stringify(evaluation));
  const adjustment = readinessAdjustmentFor({ workingSets: { target: 3 } }, readiness);
  assert.equal(adjustment.changed, false, JSON.stringify(adjustment));
});

test("current pain and invalid technique block progression", () => {
  collectFailures([
    ["pain", () => assertNotProgress(progressionDecision({ pain: true }), "current pain")],
    ["technique", () => assertNotProgress(progressionDecision({ techniqueValid: false, technique_quality: "invalid" }), "invalid technique")]
  ]);
});

test("missing and above-target RPE block progression", () => {
  collectFailures([
    ["missing RPE", () => assertNotProgress(progressionDecision({ set_rpes: "[]", average_rpe: null }), "missing RPE")],
    ["high RPE", () => assertNotProgress(progressionDecision({ set_rpes: "[10,10,10]", average_rpe: 10 }), "above-target RPE")]
  ]);
});

test("incomplete prescribed work blocks progression", () => {
  const decision = progressionDecision({
    set_repetitions: "[10]",
    set_loads: "[100]",
    set_rpes: "[8]",
    completedSetRatio: 1 / 3,
    completedSetCount: 1,
    prescribedSetCount: 3
  });
  assertNotProgress(decision, "one of three prescribed sets completed");
});

test("assisted-bodyweight progression reduces assistance", () => {
  const snapshot = engine.prescribeExercise({
    exerciseId: "ex_pull_up",
    muscleGroupId: "lats",
    history: [8, 9, 10].map((day) => ({
      workout_date: `2026-07-${day}`,
      progression_status: "held",
      comparison_performance_value: 100 + day,
      set_repetitions: "[12,12,12]",
      set_loads: "[100,100,100]",
      set_rpes: "[8,8,8]",
      average_rpe: 8,
      completedSetRatio: 1,
      completedSetCount: 3,
      prescribedSetCount: 3,
      techniqueValid: true,
      techniqueQuality: "valid",
      pain: false,
      backoffReps: [12, 12],
      resistanceType: "assisted_bodyweight"
    })),
    resistanceType: "assisted_bodyweight",
    equipmentIncrement: 5,
    createdAt
  });
  const load = snapshot.basePrescription.prescribedLoad;
  assert.ok(load.target < load.previous, `assistance should decrease, received ${JSON.stringify(load)}`);
  assert.equal(load.direction, "less_assistance_is_progress");
});

test("planned reductions never become the next normal load anchor", () => {
  const snapshot = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: [
      { workout_date: "2026-06-28", progression_status: "held", set_repetitions: "[8,8,8]", set_loads: "[52.5,52.5,52.5]", set_rpes: "[8,8,8]" },
      { workout_date: "2026-07-06", progression_status: "planned_reduction", prescribed_reduction: true, set_repetitions: "[8,8]", set_loads: "[45,45]", set_rpes: "[7,7]" }
    ],
    createdAt
  });
  assert.equal(snapshot.basePrescription.prescribedLoad.previous, 52.5, JSON.stringify(snapshot.basePrescription.prescribedLoad));
});

test("string booleans are normalized instead of treated as truthy", () => {
  const history = [1, 2, 3].map((day) => ({
    workout_date: `2026-07-0${day}`,
    progression_status: "held",
    comparison_performance_value: 100,
    average_rpe: 8,
    pain: "false",
    prescribed_reduction: "false",
    set_repetitions: "[8,8,8]"
  }));
  const staleness = assessExerciseStaleness(history);
  assert.equal(staleness.metrics.painFlag, false, JSON.stringify(staleness));
  const decision = determineProgressionDecision({ history: [history[0]], repRange: { min: 6, max: 10 }, targetRpe: { min: 7, max: 9 } });
  assert.notEqual(decision.action, "establish_baseline", "string 'false' incorrectly removed the exposure as a prescribed reduction");
});

test("stale history requires a return-to-training baseline", () => {
  const history = [1, 8, 15].map((day) => ({
    workout_date: `2024-01-${String(day).padStart(2, "0")}`,
    progression_status: "held",
    comparison_performance_value: 100,
    average_rpe: 8,
    set_repetitions: "[8,8,8]"
  }));
  const result = assessExerciseStaleness(history, { asOfDate: "2026-07-12", maximumReturnGapDays: 56 });
  assert.equal(result.classification, STALENESS.INSUFFICIENT, JSON.stringify(result));
});

test("manual overrides reject unknown exercises and invalid numeric bounds", () => {
  const snapshot = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", createdAt });
  const invalid = [
    ["unknown exercise", { exerciseId: "not_in_the_catalog" }],
    ["set count", { setCount: 999 }],
    ["rep range", { repRange: { min: -10, max: -1 } }],
    ["load", { load: -50 }]
  ];
  collectFailures(invalid.map(([label, override]) => [label, () => assert.throws(
    () => applyManualOverride(snapshot, override, { createdAt: "2026-07-12T12:01:00.000Z" }),
    undefined,
    `${label} override was accepted`
  )]));
});

test("manual overrides cannot disable historical-pain or rotation safety while ordinary deload remains an audited choice", () => {
  const snapshot = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: regressionHistory(),
    createdAt
  });
  assert.equal(snapshot.finalPrescription.recommendationType, "substitute", "repeated historical pain must start hard-safety restricted rather than executable as a deload");
  assert.equal(snapshot.finalPrescription.executionBlocked, true, "historical pain must block the affected original before override checks");
  collectFailures([
    ["deload lock", () => {
      assert.throws(() => applyManualOverride(snapshot, { deloadRecommendation: false }, { createdAt: "2026-07-12T12:02:00.000Z" }));
    }],
    ["rotation lock", () => {
      assert.throws(() => applyManualOverride(snapshot, { exerciseRotation: false }, { createdAt: "2026-07-12T12:03:00.000Z" }));
    }]
  ]);
  const ordinary = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: regressionHistory().map((exposure) => ({ ...exposure, pain: false })),
    createdAt
  });
  assert.equal(ordinary.finalPrescription.recommendationType, "exercise_deload", "fixture must start as a non-safety policy deload");
  const overridden = applyManualOverride(ordinary, { deloadRecommendation: false }, { createdAt: "2026-07-12T12:04:00.000Z" });
  assert.equal(overridden.finalPrescription.recommendationType, "normal", "ordinary policy deload should remain an audited user choice");
});

test("manual overrides reject checksum-stale rewrites of every painful-original identity", () => {
  const snapshot = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: progressionHistory(),
    readiness: { pain: true, affectedMuscle: "Chest" },
    createdAt
  });
  const tampered = structuredClone(snapshot);
  const forgedOriginal = "ex_dumbbell_bench_press";
  tampered.exerciseId = forgedOriginal;
  tampered.basePrescription.exerciseId = forgedOriginal;
  tampered.basePrescription.researchExerciseId = forgedOriginal;
  tampered.finalPrescription.exerciseId = forgedOriginal;
  tampered.finalPrescription.researchExerciseId = forgedOriginal;
  tampered.finalPrescription.safetyRestriction.originalExerciseId = forgedOriginal;
  tampered.finalPrescription.safetyRestriction.auditBaseTargets.exerciseId = forgedOriginal;
  tampered.finalPrescription.safetyRestriction.auditBaseTargets.researchExerciseId = forgedOriginal;

  assert.throws(() => engine.applyManualOverride(tampered, {
    exerciseId: "ex_barbell_bench_press",
    researchExerciseId: "ex_barbell_bench_press",
    painFreeConfirmed: true
  }, {
    allowedSafetySubstituteIds: ["ex_barbell_bench_press"],
    availableEquipment: ["barbell", "plates", "bench", "rack"]
  }), /checksum/i, "stale-checksum identity rewrites must fail before the real painful original can be allowlisted");

  for (const invalidChecksum of [undefined, "legacy-checksum", "00000000"]) {
    const invalid = structuredClone(snapshot);
    if (invalidChecksum === undefined) delete invalid.checksum;
    else invalid.checksum = invalidChecksum;
    assert.throws(() => engine.applyManualOverride(invalid, {
      exerciseId: "ex_dumbbell_bench_press",
      researchExerciseId: "ex_dumbbell_bench_press",
      painFreeConfirmed: true
    }, {
      allowedSafetySubstituteIds: ["ex_dumbbell_bench_press"],
      availableEquipment: ["dumbbell", "bench"]
    }), /checksum/i, `manual override accepted invalid checksum ${String(invalidChecksum)}`);
  }
});

test("checksum-valid resolved safety snapshots keep executable and original identity chains bound", () => {
  const snapshot = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: progressionHistory(),
    readiness: { pain: true, affectedMuscle: "Chest" },
    createdAt
  });
  const substituted = engine.applyManualOverride(snapshot, {
    exerciseId: "ex_dumbbell_bench_press",
    researchExerciseId: "ex_dumbbell_bench_press",
    painFreeConfirmed: true
  }, {
    allowedSafetySubstituteIds: ["ex_dumbbell_bench_press"],
    availableEquipment: ["dumbbell", "bench"],
    createdAt: "2026-07-12T12:07:00.000Z"
  });
  const tamperCases = [
    ["snapshot executable identity", (item) => { item.exerciseId = "forged_snapshot_identity"; }],
    ["base original identity", (item) => { item.basePrescription.exerciseId = "forged_base_identity"; }],
    ["base research identity", (item) => { item.basePrescription.researchExerciseId = "forged_base_research_identity"; }],
    ["restriction original identity", (item) => { item.finalPrescription.safetyRestriction.originalExerciseId = "forged_restriction_identity"; }],
    ["audit original identity", (item) => { item.finalPrescription.safetyRestriction.auditBaseTargets.exerciseId = "forged_audit_identity"; }],
    ["audit research identity", (item) => { item.finalPrescription.safetyRestriction.auditBaseTargets.researchExerciseId = "forged_audit_research_identity"; }],
    ["prior final original identity", (item) => { item.manualOverrides.at(-1).previousFinalPrescription.exerciseId = "forged_prior_identity"; }],
    ["prior final research identity", (item) => { item.manualOverrides.at(-1).previousFinalPrescription.researchExerciseId = "forged_prior_research_identity"; }],
    ["prior restriction original identity", (item) => { item.manualOverrides.at(-1).previousFinalPrescription.safetyRestriction.originalExerciseId = "forged_prior_restriction_identity"; }],
    ["prior audit original identity", (item) => { item.manualOverrides.at(-1).previousFinalPrescription.safetyRestriction.auditBaseTargets.exerciseId = "forged_prior_audit_identity"; }],
    ["prior audit research identity", (item) => { item.manualOverrides.at(-1).previousFinalPrescription.safetyRestriction.auditBaseTargets.researchExerciseId = "forged_prior_audit_research_identity"; }]
  ];
  for (const [label, mutate] of tamperCases) {
    const tampered = structuredClone(substituted);
    mutate(tampered);
    const checksumValid = refreshRecommendationChecksum(tampered);
    assert.throws(() => deserializeRecommendationSnapshot(checksumValid), /identity|bound|original|substitute/i, `${label} escaped checksum-valid internal identity binding`);
  }
});

function chainedPainFreeSubstitutions() {
  const snapshot = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: progressionHistory(),
    readiness: { pain: true, affectedMuscle: "Chest" },
    createdAt
  });
  const exerciseCatalog = publicResearchData().exerciseDatabase.filter((exercise) => [
    "ex_dumbbell_bench_press",
    "ex_machine_chest_press"
  ].includes(exercise.exercise_id));
  const first = engine.applyManualOverride(snapshot, {
    exerciseId: "ex_dumbbell_bench_press",
    researchExerciseId: "ex_dumbbell_bench_press",
    painFreeConfirmed: true
  }, {
    exerciseCatalog,
    allowedSafetySubstituteIds: ["ex_dumbbell_bench_press"],
    availableEquipment: ["dumbbell", "bench"],
    createdAt: "2026-07-12T12:08:00.000Z"
  });
  const second = engine.applyManualOverride(first, {
    exerciseId: "ex_machine_chest_press",
    researchExerciseId: "ex_machine_chest_press",
    painFreeConfirmed: true
  }, {
    exerciseCatalog,
    allowedSafetySubstituteIds: ["ex_machine_chest_press"],
    availableEquipment: ["machine"],
    createdAt: "2026-07-12T12:09:00.000Z"
  });
  assert.equal(second.manualOverrides.length, 2, "fixture must retain both pain-free substitutions");
  assert.doesNotThrow(() => deserializeRecommendationSnapshot(second), "a valid chained pain-free substitution must remain loadable");
  return { second, exerciseCatalog };
}

test("every historical safety confirmation remains bound to the prescription it produced", () => {
  const { second, exerciseCatalog } = chainedPainFreeSubstitutions();
  const tampered = structuredClone(second);
  tampered.manualOverrides[0].changes.safetyConfirmation.exerciseId = "ex_barbell_bench_press";
  tampered.manualOverrides[0].changes.safetyConfirmation.researchExerciseId = "ex_barbell_bench_press";
  const checksumValid = refreshRecommendationChecksum(tampered);

  assert.throws(
    () => deserializeRecommendationSnapshot(checksumValid),
    /identity|bound|lineage|original|substitute|transition/i,
    "an older safety confirmation must not be rewritten as the painful original even with a recomputed checksum"
  );
  assert.throws(() => engine.applyManualOverride(checksumValid, {
    exerciseId: "ex_dumbbell_bench_press",
    researchExerciseId: "ex_dumbbell_bench_press",
    painFreeConfirmed: true
  }, {
    exerciseCatalog,
    allowedSafetySubstituteIds: ["ex_dumbbell_bench_press"],
    availableEquipment: ["dumbbell", "bench"]
  }), /identity|bound|lineage|original|substitute|transition/i, "apply must validate every prior safety confirmation before adding another override");
});

test("resolved safety prescription history cannot collapse a prior substitute onto its painful original", () => {
  const { second } = chainedPainFreeSubstitutions();
  const tampered = structuredClone(second);
  const priorResolved = tampered.manualOverrides[1].previousFinalPrescription;
  priorResolved.exerciseId = "ex_barbell_bench_press";
  priorResolved.researchExerciseId = "ex_barbell_bench_press";
  priorResolved.safetyRestriction.substituteExerciseId = "ex_barbell_bench_press";
  priorResolved.safetyRestriction.substituteResearchExerciseId = "ex_barbell_bench_press";
  const checksumValid = refreshRecommendationChecksum(tampered);

  assert.throws(
    () => deserializeRecommendationSnapshot(checksumValid),
    /identity|bound|lineage|original|substitute|transition/i,
    "a prior resolved substitute must remain different from its recorded painful original"
  );
});

test("ordinary multi-override history remains valid while incomplete and duplicate lineage fails closed", () => {
  const snapshot = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: progressionHistory(),
    experienceLevel: "advanced",
    setStructurePreference: "advanced_if_supported",
    createdAt
  });
  const first = engine.applyManualOverride(snapshot, {
    setCount: Math.min(18, snapshot.finalPrescription.workingSets.target + 1)
  }, {
    overrideId: "override_ordinary_sets",
    createdAt: "2026-07-12T12:10:00.000Z",
    reason: "Use one additional working set"
  });
  const second = engine.applyManualOverride(first, {
    repRange: { min: 7, max: 9 }
  }, {
    overrideId: "override_ordinary_reps",
    createdAt: "2026-07-12T12:11:00.000Z",
    reason: "Use a narrower repetition range"
  });
  assert.doesNotThrow(() => deserializeRecommendationSnapshot(second), "ordinary chained overrides must remain valid");
  assert.equal(second.manualOverrides.length, 2);
  assert.equal(second.finalPrescription.workingSets.target, first.finalPrescription.workingSets.target);
  assert.deepEqual(second.finalPrescription.repRange, { min: 7, target: 8, max: 9 });

  const incomplete = structuredClone(second);
  delete incomplete.manualOverrides[1].previousFinalPrescription.manualOverride;
  assert.throws(
    () => deserializeRecommendationSnapshot(refreshRecommendationChecksum(incomplete)),
    /lineage|identity|bound|prior/i,
    "an override entry cannot omit its link to the preceding result"
  );

  const duplicate = structuredClone(second);
  duplicate.manualOverrides[1].overrideId = duplicate.manualOverrides[0].overrideId;
  duplicate.finalPrescription.manualOverride.overrideId = duplicate.manualOverrides[0].overrideId;
  assert.throws(
    () => deserializeRecommendationSnapshot(refreshRecommendationChecksum(duplicate)),
    /duplicate.*override/i,
    "duplicate override identities must not masquerade as an append-only chain"
  );
});

function fiveSetPrescriptionWithLaterRepOverride() {
  const qualifyingProductiveHistory = [8, 9, 10].map((day) => progressionHistory({
    workout_date: `2026-07-${day}`,
    progression_status: day === 8 ? "baseline" : "improved",
    progression_pct_vs_prior: day === 8 ? 0 : 2,
    comparison_performance_value: 100 + day,
    best_epley_e1rm: 100 + day,
    completedSetCount: 3,
    prescribedSetCount: 3,
    techniqueValid: true,
    techniqueQuality: "valid",
    pain: false,
    recovery_strain_score: 25,
    max_set_rep_loss_pct: 0,
    max_set_load_reduction_pct: 0
  })[0]);
  const snapshot = overrideAuditEngine.prescribeExercise({
    exerciseId: "custom_override_audit_press",
    muscleGroupId: "chest",
    history: qualifyingProductiveHistory,
    experienceLevel: "advanced",
    setStructurePreference: "advanced_if_supported",
    createdAt
  });
  assert.equal(snapshot.finalPrescription.workingSets.target, 4, "productive personal evidence must preserve the four-set override-audit fixture");
  const fiveSets = overrideAuditEngine.applyManualOverride(snapshot, { setCount: 5 }, {
    overrideId: "override_four_to_five_sets",
    createdAt: "2026-07-12T12:12:00.000Z",
    reason: "Use five working sets"
  });
  const laterRepOverride = overrideAuditEngine.applyManualOverride(fiveSets, { repRange: { min: 6, max: 9 } }, {
    overrideId: "override_later_rep_range",
    createdAt: "2026-07-12T12:13:00.000Z",
    reason: "Use six to nine repetitions"
  });
  assert.equal(laterRepOverride.finalPrescription.workingSets.target, 5);
  assert.doesNotThrow(() => deserializeRecommendationSnapshot(laterRepOverride));
  return laterRepOverride;
}

test("a truthful no-op declaration cannot replace an omitted four-to-five set-count transition", () => {
  const tampered = structuredClone(fiveSetPrescriptionWithLaterRepOverride());
  const setTransition = tampered.manualOverrides[0];
  const resultingPrescription = tampered.manualOverrides[1].previousFinalPrescription;
  assert.deepEqual(setTransition.changes.setCount, { from: 4, to: 5 });
  setTransition.changes = {
    repRange: {
      from: structuredClone(setTransition.previousFinalPrescription.repRange),
      to: structuredClone(resultingPrescription.repRange)
    }
  };
  assert.deepEqual(setTransition.changes.repRange.from, setTransition.changes.repRange.to, "replacement declaration must be a truthful no-op");

  assert.throws(
    () => deserializeRecommendationSnapshot(refreshRecommendationChecksum(tampered)),
    /undeclared|no.op|bijection|set count|working sets|lineage/i,
    "an omitted real 4-to-5 set-count change must not be hidden behind a truthful no-op declaration"
  );
});

test("final working-set tampering requires a declared last-entry set-count transition", () => {
  const tampered = structuredClone(fiveSetPrescriptionWithLaterRepOverride());
  assert.equal(tampered.manualOverrides.at(-1).changes.setCount, undefined, "last fixture entry must not declare a set-count change");
  tampered.finalPrescription.workingSets.target = 2;

  assert.throws(
    () => deserializeRecommendationSnapshot(refreshRecommendationChecksum(tampered)),
    /undeclared|bijection|set count|working sets|lineage/i,
    "a rechecksummed final 5-to-2 set-count rewrite must fail without a matching last-entry declaration"
  );
});

test("declared-change replay rejects undeclared identity, dose, resistance, effort, rest, structure, policy, and scope rewrites", () => {
  const valid = fiveSetPrescriptionWithLaterRepOverride();
  const tamperCases = [
    ["exercise identity", (item) => { item.finalPrescription.exerciseId = "ex_machine_chest_press"; }],
    ["research identity", (item) => { item.finalPrescription.researchExerciseId = "ex_machine_chest_press"; }],
    ["set-range boundary", (item) => { item.finalPrescription.workingSets.min = 1; }],
    ["declared repetition result", (item) => { item.finalPrescription.repRange.max = 10; }],
    ["load target", (item) => { item.finalPrescription.prescribedLoad.target += 5; }],
    ["assistance/load direction", (item) => { item.finalPrescription.prescribedLoad.direction = "less_assistance_is_progress"; }],
    ["load history", (item) => { item.finalPrescription.prescribedLoad.previous += 5; }],
    ["RPE", (item) => { item.finalPrescription.targetRpe.min += 0.5; }],
    ["RIR", (item) => { item.finalPrescription.targetRir.max += 0.5; }],
    ["rest", (item) => { item.finalPrescription.restSeconds.target += 15; }],
    ["nested set structure", (item) => { item.finalPrescription.topSet.count += 1; }],
    ["recommendation policy", (item) => { item.finalPrescription.recommendationType = "hold"; }],
    ["volume", (item) => { item.finalPrescription.volume.perExercise.currentPrescribed += 1; }],
    ["mesocycle", (item) => { item.finalPrescription.mesocycleId = "meso_forged"; }]
  ];
  for (const [label, mutate] of tamperCases) {
    const tampered = structuredClone(valid);
    mutate(tampered);
    assert.throws(
      () => deserializeRecommendationSnapshot(refreshRecommendationChecksum(tampered)),
      /bijection|undeclared|identity|derived|lineage|binding|mesocycle/i,
      `${label} escaped complete declared-change replay`
    );
  }

  const base = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: progressionHistory(), createdAt });
  const loadOverride = engine.applyManualOverride(base, { load: base.finalPrescription.prescribedLoad.target + 5 }, {
    createdAt: "2026-07-12T12:14:00.000Z"
  });
  const loadMetadataTamper = structuredClone(loadOverride);
  loadMetadataTamper.finalPrescription.prescribedLoad.direction = "less_assistance_is_progress";
  assert.throws(() => deserializeRecommendationSnapshot(refreshRecommendationChecksum(loadMetadataTamper)), /bijection|resistance|load|derived/i, "a declared load target must bind the complete resistance object");

  const structureOverride = engine.applyManualOverride(base, { setStructure: "multiple_top_sets" }, {
    createdAt: "2026-07-12T12:15:00.000Z"
  });
  const structureTamper = structuredClone(structureOverride);
  structureTamper.finalPrescription.topSet.targetRpe -= 0.5;
  assert.throws(() => deserializeRecommendationSnapshot(refreshRecommendationChecksum(structureTamper)), /bijection|structure|derived/i, "a set-structure declaration must bind its generated top/back-off targets");

  const deloadOverride = engine.applyManualOverride(base, { deloadRecommendation: "full_program_deload" }, {
    createdAt: "2026-07-12T12:16:00.000Z"
  });
  const deloadEffortTamper = structuredClone(deloadOverride);
  deloadEffortTamper.finalPrescription.targetRir.min = 2;
  assert.throws(() => deserializeRecommendationSnapshot(refreshRecommendationChecksum(deloadEffortTamper)), /bijection|effort|derived/i, "a deload declaration must bind its derived RPE/RIR and policy rules");

  const safetyResolved = chainedPainFreeSubstitutions().second;
  const safetyRestTamper = structuredClone(safetyResolved);
  safetyRestTamper.finalPrescription.restSeconds.target += 15;
  assert.throws(() => deserializeRecommendationSnapshot(refreshRecommendationChecksum(safetyRestTamper)), /bijection|safety|rest|derived/i, "a safety confirmation must bind restored rest and dose targets");
});

test("no-op and duplicate-dimension requests never become persisted declarations", () => {
  const snapshot = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: progressionHistory(), createdAt });
  assert.throws(() => engine.applyManualOverride(snapshot, {
    setCount: snapshot.finalPrescription.workingSets.target,
    repRange: structuredClone(snapshot.finalPrescription.repRange),
    load: snapshot.finalPrescription.prescribedLoad.target,
    setStructure: snapshot.finalPrescription.setStructure,
    mesocycleId: snapshot.mesocycleId
  }), /no supported manual override field/i, "an all-no-op request must not create an audit entry");
  assert.throws(() => engine.applyManualOverride(snapshot, {
    deloadRecommendation: "exercise_deload",
    exerciseRotation: "hold"
  }), /duplicate.*recommendation|bijection/i, "two declarations cannot own the same recommendation-type dimension");
  assert.throws(() => engine.applyManualOverride(snapshot, {
    setStructure: "multiple_top_sets",
    topSet: { count: 2 }
  }), /topSet|audit contract|unsupported/i, "unmodeled nested structure payloads must fail instead of bypassing the declared mapping");
  assert.throws(() => engine.applyManualOverride(snapshot, {
    setCount: 5,
    targetRpe: { min: 6, max: 7 }
  }), /unsupported.*audit contract/i, "an unsupported effort field must not be silently omitted from an otherwise valid override");
  assert.throws(() => engine.applyManualOverride(snapshot, {
    workingSets: { min: 1, target: 5, max: 6 }
  }), /only target|deterministic/i, "working-set min/max inputs must not bypass the set-count declaration");
  assert.throws(() => engine.applyManualOverride(snapshot, {
    prescribedLoad: { target: 105, direction: "less_assistance_is_progress" }
  }), /only target|direction.*bound/i, "resistance direction must remain bound rather than becoming an unaudited input");
  assert.throws(() => engine.applyManualOverride(snapshot, {
    setCount: 5,
    workingSets: { target: 5 }
  }), /duplicate set.count/i, "two aliases cannot declare the same set-count dimension");
  assert.throws(() => engine.applyManualOverride(snapshot, {
    exerciseId: "ex_dumbbell_bench_press",
    replacementExerciseId: "ex_machine_chest_press"
  }), /duplicate exercise.identity/i, "two selectors cannot declare competing exercise identities");

  const replacement = engine.applyManualOverride(snapshot, { exerciseId: "ex_dumbbell_bench_press" }, {
    allowedExerciseIds: ["ex_dumbbell_bench_press"],
    availableEquipment: ["dumbbell", "bench"],
    createdAt: "2026-07-12T12:17:00.000Z"
  });
  assert.equal(replacement.finalPrescription.exerciseId, "ex_dumbbell_bench_press");
  assert.equal(replacement.finalPrescription.researchExerciseId, "ex_dumbbell_bench_press", "canonical exercise and research identities must move together");
  assert.doesNotThrow(() => deserializeRecommendationSnapshot(replacement), "a valid ordinary catalog-backed exercise replacement must remain supported");

  assert.throws(() => engine.applyManualOverride(snapshot, { exerciseId: "custom_dumbbell_press" }, {
    allowedExerciseIds: ["custom_dumbbell_press"],
    exerciseCatalog: [{ personalExerciseId: "custom_dumbbell_press", researchExerciseId: "ex_dumbbell_bench_press", exerciseName: "Custom dumbbell press" }],
    createdAt: "2026-07-12T12:18:00.000Z"
  }), /untrusted|trusted catalog|cannot establish/i, "caller metadata alone must not establish a custom/research identity pair");

  const customReplacement = engine.applyManualOverride(snapshot, { exerciseId: "custom_unmapped_press" }, {
    allowedExerciseIds: ["custom_unmapped_press"],
    trustedExerciseCatalog: [{ personalExerciseId: "custom_unmapped_press", researchExerciseId: null, exerciseName: "Custom unmapped press", equipment: "bodyweight" }],
    availableEquipment: ["bodyweight"],
    createdAt: "2026-07-12T12:19:00.000Z"
  });
  assert.equal(customReplacement.finalPrescription.researchExerciseId, null, "an unmapped custom exercise must retain an explicit null research identity");
  assert.doesNotThrow(() => deserializeRecommendationSnapshot(customReplacement), "an unmapped custom exercise remains a valid auditable user choice");
  const customResearchTamper = structuredClone(customReplacement);
  customResearchTamper.finalPrescription.researchExerciseId = "ex_dumbbell_bench_press";
  assert.throws(() => deserializeRecommendationSnapshot(refreshRecommendationChecksum(customResearchTamper)), /bijection|research identity|undeclared/i, "a rechecksummed custom replacement cannot gain an undeclared research identity");
});

test("ordinary exercise replacement resets exercise-specific executable guidance and only retains valid session dose", () => {
  const snapshot = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: progressionHistory(), createdAt });
  assert.ok(snapshot.finalPrescription.prescribedLoad?.previous > 0, "fixture must contain exercise-specific previous-load guidance");
  const retainedFields = ["workingSets", "repRange", "targetRpe", "targetRir", "restSeconds", "frequencyPerWeek", "volume", "mesocycleId", "executionBlocked"];
  const retained = Object.fromEntries(retainedFields.map((field) => [field, structuredClone(snapshot.finalPrescription[field])]));

  const replacement = engine.applyManualOverride(snapshot, { exerciseId: "ex_dumbbell_bench_press" }, {
    allowedExerciseIds: ["ex_dumbbell_bench_press"],
    availableEquipment: ["dumbbell", "bench"],
    createdAt: "2026-07-12T12:20:00.000Z"
  });
  const final = replacement.finalPrescription;
  assert.equal(final.exerciseId, "ex_dumbbell_bench_press");
  assert.equal(final.researchExerciseId, "ex_dumbbell_bench_press");
  assert.equal(final.prescribedLoad, undefined, "a different exercise must never inherit load, prior load, increment, unit, or resistance-direction guidance");
  assert.equal(final.setStructure, "straight_sets", "exercise-specific top/back-off progression structure must reset");
  assert.equal(final.topSet, undefined);
  assert.equal(final.backoffSets, undefined);
  assert.match(final.progressionAction, /baseline|calibrat/i);
  assert.match(`${final.progressionRule} ${final.holdRule} ${final.userExplanation}`, /load reset|recalibrat|do not transfer/i, "the executable prescription must explain why the replacement load is unset");
  assert.equal(replacement.explanation, final.userExplanation, "the user-facing snapshot explanation must not retain the replaced exercise's executable guidance");
  assert.equal(final.preferredReplacementExerciseId, null, "the prior exercise's replacement ranking must not survive the replacement");
  for (const field of retainedFields) assert.deepEqual(final[field], retained[field], `${field} should remain unchanged because the exercise replacement does not require changing that session constraint`);
  assert.ok(final.workingSets.target >= 1 && final.workingSets.target <= 20);
  assert.ok(final.repRange.min >= 1 && final.repRange.max <= 100);
  assert.ok(replacement.manualOverrides.at(-1).previousFinalPrescription.prescribedLoad, "the prior exercise-specific load remains only in immutable audit history");
  assert.doesNotThrow(() => deserializeRecommendationSnapshot(replacement));

  const loadResurrection = structuredClone(replacement);
  loadResurrection.finalPrescription.prescribedLoad = structuredClone(snapshot.finalPrescription.prescribedLoad);
  assert.throws(() => deserializeRecommendationSnapshot(refreshRecommendationChecksum(loadResurrection)), /bijection|load|replacement|undeclared/i, "a rechecksummed replacement cannot resurrect the prior exercise's load guidance");
});

test("trusted mapped user exercises preserve composite identity while untrusted duplicates cannot override the mapping", () => {
  const mappedEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: [{ exercise_id: "custom_db_press", research_exercise_id: "ex_dumbbell_bench_press", exercise_name: "My dumbbell press" }],
      metadata: { methodology_version: "mapped-custom-test/1.0.0" }
    },
    researchData: publicResearchData()
  });
  const snapshot = mappedEngine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: progressionHistory(), createdAt });
  const replacement = mappedEngine.applyManualOverride(snapshot, { exerciseId: "custom_db_press" }, {
    allowedExerciseIds: ["custom_db_press"],
    availableEquipment: ["dumbbell", "bench"],
    createdAt: "2026-07-12T12:21:00.000Z"
  });
  assert.equal(replacement.finalPrescription.exerciseId, "custom_db_press");
  assert.equal(replacement.finalPrescription.researchExerciseId, "ex_dumbbell_bench_press");
  assert.equal(replacement.finalPrescription.prescribedLoad, undefined);
  assert.doesNotThrow(() => deserializeRecommendationSnapshot(replacement), "the trusted personal-to-research mapping must be audit-bound without changing schemas");
  const chainedDose = mappedEngine.applyManualOverride(replacement, {
    setCount: Math.min(18, replacement.finalPrescription.workingSets.target + 1)
  }, { createdAt: "2026-07-12T12:21:15.000Z" });
  assert.doesNotThrow(() => deserializeRecommendationSnapshot(chainedDose), "a later dose override must preserve the committed mapped-identity history chain");

  const mappingTamper = structuredClone(replacement);
  mappingTamper.finalPrescription.researchExerciseId = "ex_machine_chest_press";
  assert.throws(() => deserializeRecommendationSnapshot(refreshRecommendationChecksum(mappingTamper)), /identity|commit|bijection|lineage/i, "a rechecksummed result cannot change the trusted custom/research mapping without changing its audit commitment");

  assert.throws(() => mappedEngine.applyManualOverride(snapshot, { exerciseId: "custom_db_press" }, {
    allowedExerciseIds: ["custom_db_press"],
    exerciseCatalog: [{ personalExerciseId: "custom_db_press", researchExerciseId: "ex_machine_chest_press", exerciseName: "Spoofed duplicate" }]
  }), /conflict|duplicate|trusted|mapping/i, "caller catalog metadata cannot override a trusted internal custom mapping");
});

test("custom equipment requirements override mapped canonical equipment for ordinary and pain-safety replacement", () => {
  const customEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: [{
        exercise_id: "custom_cable_press",
        research_exercise_id: "ex_dumbbell_bench_press",
        exercise_name: "My cable press",
        equipment: "cable"
      }],
      metadata: { methodology_version: "custom-equipment-test/1.0.0" }
    },
    researchData: publicResearchData()
  });
  const ordinary = customEngine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: progressionHistory(), createdAt });
  const ordinaryOverride = { exerciseId: "custom_cable_press" };
  const ordinaryOptions = { allowedExerciseIds: ["custom_cable_press"], createdAt: "2026-07-12T12:21:30.000Z" };
  const painful = customEngine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: progressionHistory(),
    readiness: { pain: true, affectedMuscle: "chest" },
    createdAt
  });
  const safetyOverride = {
    exerciseId: "custom_cable_press",
    researchExerciseId: "ex_dumbbell_bench_press",
    painFreeConfirmed: true
  };
  const safetyOptions = { allowedSafetySubstituteIds: ["custom_cable_press"], createdAt: "2026-07-12T12:21:45.000Z" };
  collectFailures([
    ["ordinary custom rejects canonical-only equipment", () => assert.throws(() => customEngine.applyManualOverride(ordinary, ordinaryOverride, {
      ...ordinaryOptions,
      availableEquipment: ["dumbbell", "bench"]
    }), /equipment|cable|compatible/i, "custom cable requirements must not fall back to the mapped canonical dumbbell requirements")],
    ["ordinary custom accepts declared cable equipment", () => {
      const ordinaryCable = customEngine.applyManualOverride(ordinary, ordinaryOverride, {
        ...ordinaryOptions,
        availableEquipment: ["cable_station"]
      });
      assert.equal(ordinaryCable.finalPrescription.exerciseId, "custom_cable_press");
      assert.equal(ordinaryCable.finalPrescription.researchExerciseId, "ex_dumbbell_bench_press");
      assert.equal(ordinaryCable.finalPrescription.prescribedLoad, undefined);
      assert.doesNotThrow(() => deserializeRecommendationSnapshot(ordinaryCable));
    }],
    ["pain-safety custom rejects canonical-only equipment", () => assert.throws(() => customEngine.applyManualOverride(painful, safetyOverride, {
      ...safetyOptions,
      availableEquipment: ["dumbbell", "bench"]
    }), /equipment|cable|compatible/i, "pain-safety substitution must use the same custom-first equipment precedence as ordinary replacement")],
    ["pain-safety custom accepts declared cable equipment", () => {
      const safetyCable = customEngine.applyManualOverride(painful, safetyOverride, {
        ...safetyOptions,
        availableEquipment: ["cable"]
      });
      assert.equal(safetyCable.finalPrescription.exerciseId, "custom_cable_press");
      assert.equal(safetyCable.finalPrescription.safetyRestriction.status, "resolved_by_confirmed_substitute");
      assert.doesNotThrow(() => deserializeRecommendationSnapshot(safetyCable));
    }],
    ["canonical equipment remains unchanged", () => assert.throws(() => customEngine.applyManualOverride(ordinary, { exerciseId: "ex_dumbbell_bench_press" }, {
      allowedExerciseIds: ["ex_dumbbell_bench_press"],
      availableEquipment: ["cable"]
    }), /equipment/i, "canonical dumbbell bench behavior must remain unchanged by custom-source precedence")]
  ]);
});

test("custom equipment metadata normalizes aliases and arrays, falls back only when absent, and rejects malformed contradictions", () => {
  assert.deepEqual(
    equipmentRequirementOptions({ equipmentRequirements: [["cables"]], equipment_type: "cable machine" }),
    [["cable_station"]],
    "nested arrays and summary aliases must normalize to the same canonical equipment value"
  );
  assert.deepEqual(
    equipmentRequirementOptions({ requiredEquipment: ["dumbbells", "bench"] }),
    [["dumbbell", "bench"]],
    "a flat requirements array is one deterministic AND bundle"
  );
  assert.equal(equipmentCompatible({ equipment: "cables" }, ["cable_machine"]).eligible, true, "metadata and availability aliases must normalize identically");
  assert.throws(
    () => equipmentRequirementOptions({ equipment: "cable", equipmentRequirements: "dumbbell" }),
    /contradictory.*equipment/i,
    "a detailed requirement cannot contradict the declared equipment summary"
  );
  assert.throws(
    () => equipmentRequirementOptions({ equipment_requirements: "cable", equipmentRequirements: [["dumbbell"]] }),
    /contradictory.*aliases/i,
    "conflicting field aliases must fail closed"
  );
  assert.throws(
    () => equipmentRequirementOptions({ equipment: { type: "cable" } }),
    /non-empty string|string array|equipment summary/i,
    "object-shaped equipment metadata must fail closed instead of stringifying"
  );
  assert.throws(
    () => equipmentRequirementOptions({ equipmentRequirements: [] }),
    /non-empty|string array|equipment requirements/i,
    "empty requirement arrays must fail closed"
  );

  const customEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: [{
        exercise_id: "custom_array_cable_press",
        research_exercise_id: "ex_dumbbell_bench_press",
        exercise_name: "Array cable press",
        equipmentRequirements: [["cables"]],
        equipment_type: "cable machine"
      }, {
        exercise_id: "custom_fallback_press",
        research_exercise_id: "ex_dumbbell_bench_press",
        exercise_name: "Fallback press"
      }, {
        exercise_id: "custom_conflicting_press",
        research_exercise_id: "ex_dumbbell_bench_press",
        exercise_name: "Conflicting press",
        equipment: "cable",
        equipmentRequirements: "dumbbell"
      }, {
        exercise_id: "custom_malformed_press",
        research_exercise_id: "ex_dumbbell_bench_press",
        exercise_name: "Malformed press",
        equipment: { type: "cable" }
      }],
      metadata: { methodology_version: "custom-equipment-validation-test/1.0.0" }
    },
    researchData: publicResearchData()
  });
  const snapshot = customEngine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: progressionHistory(), createdAt });
  const replace = (exerciseId, availableEquipment) => customEngine.applyManualOverride(snapshot, { exerciseId }, {
    allowedExerciseIds: [exerciseId],
    availableEquipment,
    createdAt: "2026-07-12T12:21:50.000Z"
  });
  assert.equal(replace("custom_array_cable_press", ["cable"]).finalPrescription.exerciseId, "custom_array_cable_press", "normalized custom arrays remain authoritative over mapped canonical equipment");
  assert.throws(() => replace("custom_array_cable_press", ["dumbbell", "bench"]), /equipment/i, "a normalized custom array cannot leak through canonical equipment");
  assert.equal(replace("custom_fallback_press", ["dumbbell", "bench"]).finalPrescription.exerciseId, "custom_fallback_press", "mapped canonical equipment remains the fallback when custom requirements are absent");
  assert.throws(() => replace("custom_fallback_press", ["cable"]), /equipment/i, "an equipment-free custom record must not bypass its mapped canonical requirements");
  assert.throws(() => replace("custom_conflicting_press", ["cable", "dumbbell"]), /contradictory.*equipment/i, "trusted but contradictory custom metadata must fail closed");
  assert.throws(() => replace("custom_malformed_press", ["cable"]), /non-empty string|string array|equipment summary/i, "trusted but malformed custom metadata must fail closed");
});

test("available-equipment input distinguishes omission from explicit empty or malformed restrictions in ordinary and pain-safety paths", () => {
  assert.deepEqual(normalizeAvailableEquipmentInput(undefined), { provided: false, valid: true, values: [] }, "undefined records an omitted restriction explicitly");
  assert.deepEqual(normalizeAvailableEquipmentInput(null), { provided: false, valid: true, values: [] }, "null records an omitted restriction explicitly");
  assert.deepEqual(normalizeAvailableEquipmentInput(""), { provided: true, valid: false, values: [] }, "an explicit blank is provided but invalid");
  assert.deepEqual(normalizeAvailableEquipmentInput([]), { provided: true, valid: false, values: [] }, "an explicit empty array is provided but invalid");
  assert.deepEqual(normalizeAvailableEquipmentInput("@@@"), { provided: true, valid: false, values: [] }, "a symbol-only scalar is malformed rather than an empty capability");
  assert.deepEqual(normalizeAvailableEquipmentInput("cable|dumbbell"), { provided: true, valid: false, values: [] }, "available-equipment entries are atomic capabilities, not requirement expressions");
  assert.deepEqual(normalizeAvailableEquipmentInput(["no equipment"]), { provided: true, valid: true, values: ["bodyweight"] }, "no-equipment is an explicit bodyweight-only capability");
  assert.equal(equipmentCompatible({ equipment: "cable" }, undefined).eligible, true, "omitted equipment is unrestricted at the shared compatibility boundary");
  assert.equal(equipmentCompatible({ equipment: "cable" }, []).eligible, false, "an explicit empty array cannot become unrestricted at the shared compatibility boundary");
  assert.equal(equipmentCompatible({ equipment: "bodyweight" }, ["no equipment"]).eligible, true, "the no-equipment control admits bodyweight requirements only");
  const inputEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: [{
        exercise_id: "custom_input_cable_press",
        research_exercise_id: "ex_dumbbell_bench_press",
        exercise_name: "Input cable press",
        equipment: "cable"
      }, {
        exercise_id: "custom_input_bodyweight",
        research_exercise_id: "ex_side_plank",
        exercise_name: "Input bodyweight movement",
        equipment: "bodyweight"
      }],
      metadata: { methodology_version: "available-equipment-input-test/1.0.0" }
    },
    researchData: publicResearchData()
  });
  const ordinary = inputEngine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: progressionHistory(), createdAt });
  const painful = inputEngine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: progressionHistory(),
    readiness: { pain: true, affectedMuscle: "chest" },
    createdAt
  });
  const ordinaryReplace = (exerciseId, extra = {}) => inputEngine.applyManualOverride(ordinary, { exerciseId }, {
    allowedExerciseIds: [exerciseId],
    createdAt: "2026-07-12T12:21:52.000Z",
    ...extra
  });
  const safetyReplace = (exerciseId, researchExerciseId, extra = {}) => inputEngine.applyManualOverride(painful, {
    exerciseId,
    researchExerciseId,
    painFreeConfirmed: true
  }, {
    allowedSafetySubstituteIds: [exerciseId],
    createdAt: "2026-07-12T12:21:54.000Z",
    ...extra
  });

  assert.equal(ordinaryReplace("custom_input_cable_press").finalPrescription.exerciseId, "custom_input_cable_press", "an omitted equipment restriction remains intentionally unrestricted");
  assert.equal(ordinaryReplace("custom_input_cable_press", { availableEquipment: null }).finalPrescription.exerciseId, "custom_input_cable_press", "null is the explicit adapter representation of an omitted restriction");
  assert.equal(safetyReplace("custom_input_cable_press", "ex_dumbbell_bench_press").finalPrescription.exerciseId, "custom_input_cable_press", "safety replacement shares omitted-input semantics");
  assert.equal(safetyReplace("custom_input_cable_press", "ex_dumbbell_bench_press", { availableEquipment: null }).finalPrescription.exerciseId, "custom_input_cable_press", "safety replacement shares null-input semantics");

  const invalidInputs = [
    ["blank scalar", ""],
    ["whitespace scalar", "   "],
    ["empty array", []],
    ["blank array entry", [""]],
    ["whitespace array entry", ["   "]],
    ["null array entry", [null]],
    ["object", { equipment: "cable" }],
    ["number", 0],
    ["nested array", [["cable"]]]
  ];
  collectFailures(invalidInputs.flatMap(([label, availableEquipment]) => [
    [`ordinary ${label} equipment input`, () => assert.throws(
      () => ordinaryReplace("custom_input_cable_press", { availableEquipment }),
      /available equipment|equipment input|valid equipment|malformed/i,
      `ordinary replacement must reject ${label} instead of treating it as unrestricted`
    )],
    [`pain-safety ${label} equipment input`, () => assert.throws(
      () => safetyReplace("custom_input_cable_press", "ex_dumbbell_bench_press", { availableEquipment }),
      /available equipment|equipment input|valid equipment|malformed/i,
      `pain-safety replacement must reject ${label} instead of treating it as unrestricted`
    )]
  ]));

  assert.equal(ordinaryReplace("custom_input_bodyweight", { availableEquipment: ["bodyweight"] }).finalPrescription.exerciseId, "custom_input_bodyweight", "bodyweight is a valid explicit equipment capability");
  assert.equal(safetyReplace("custom_input_bodyweight", "ex_side_plank", { availableEquipment: ["bodyweight"] }).finalPrescription.exerciseId, "custom_input_bodyweight", "pain-safety accepts the same explicit bodyweight capability");
  assert.equal(ordinaryReplace("custom_input_bodyweight", { availableEquipment: ["no equipment"] }).finalPrescription.exerciseId, "custom_input_bodyweight", "the explicit no-equipment alias means bodyweight capability, not unrestricted access");
  assert.equal(safetyReplace("custom_input_bodyweight", "ex_side_plank", { availableEquipment: ["no_equipment"] }).finalPrescription.exerciseId, "custom_input_bodyweight", "pain-safety normalizes the no-equipment alias identically");
  assert.throws(() => ordinaryReplace("custom_input_cable_press", { availableEquipment: ["no_equipment"] }), /equipment/i, "no-equipment must not satisfy a cable requirement");
  assert.throws(() => safetyReplace("custom_input_cable_press", "ex_dumbbell_bench_press", { availableEquipment: ["no equipment"] }), /equipment/i, "pain-safety no-equipment must not satisfy a cable requirement");
});

test("trusted custom duplicates reconcile order-independently while conflicting or caller-owned metadata cannot influence selection", () => {
  const customId = "custom_reconciled_cable_press";
  const duplicateEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: [{ exercise_id: customId, exercise_name: "Sparse personal score" }],
      metadata: { methodology_version: "trusted-catalog-reconciliation-test/1.0.0" }
    },
    researchData: publicResearchData()
  });
  const ordinary = duplicateEngine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: progressionHistory(), createdAt });
  const painful = duplicateEngine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: progressionHistory(),
    readiness: { pain: true, affectedMuscle: "chest" },
    createdAt
  });
  const cableSummary = {
    personalExerciseId: customId,
    researchExerciseId: "ex_dumbbell_bench_press",
    exerciseName: "Trusted cable summary",
    equipment: "cables",
    movementPattern: "horizontal_push"
  };
  const cableRequirements = {
    personalExerciseId: customId,
    researchExerciseId: "ex_dumbbell_bench_press",
    exerciseName: "Trusted cable requirements",
    equipmentRequirements: [["cable_station"]],
    notes: "richer trusted metadata"
  };
  const ordinaryWith = (trustedExerciseCatalog, extra = {}) => duplicateEngine.applyManualOverride(ordinary, { exerciseId: customId }, {
    allowedExerciseIds: [customId],
    trustedExerciseCatalog,
    availableEquipment: ["cable"],
    createdAt: "2026-07-12T12:21:56.000Z",
    ...extra
  });
  const safetyWith = (trustedExerciseCatalog, extra = {}) => duplicateEngine.applyManualOverride(painful, {
    exerciseId: customId,
    researchExerciseId: "ex_dumbbell_bench_press",
    painFreeConfirmed: true
  }, {
    allowedSafetySubstituteIds: [customId],
    trustedExerciseCatalog,
    availableEquipment: ["cable"],
    createdAt: "2026-07-12T12:21:58.000Z",
    ...extra
  });
  const forward = ordinaryWith([cableSummary, cableRequirements]);
  const reverse = ordinaryWith([cableRequirements, cableSummary]);
  assert.equal(forward.finalPrescription.exerciseId, customId, "richer trusted metadata augments the sparse personal record");
  assert.equal(forward.finalPrescription.researchExerciseId, "ex_dumbbell_bench_press", "a declared trusted mapping augments an absent personal mapping");
  assert.equal(reverse.finalPrescription.exerciseId, forward.finalPrescription.exerciseId, "equivalent duplicates reconcile independently of source order");
  assert.equal(reverse.finalPrescription.researchExerciseId, forward.finalPrescription.researchExerciseId, "research identity reconciliation is order-independent");
  assert.equal(safetyWith([cableRequirements, cableSummary]).finalPrescription.safetyRestriction.status, "resolved_by_confirmed_substitute", "pain-safety uses the same reconciled trusted identity");

  const callerSpoof = [{
    personalExerciseId: customId,
    researchExerciseId: "ex_dumbbell_bench_press",
    exerciseName: "Caller dumbbell spoof",
    equipment: "dumbbell"
  }];
  assert.equal(ordinaryWith([cableSummary, cableRequirements], { exerciseCatalog: callerSpoof }).finalPrescription.exerciseId, customId, "an equivalent caller identity cannot override reconciled trusted equipment");
  assert.throws(
    () => ordinaryWith([cableSummary, cableRequirements], { exerciseCatalog: callerSpoof, availableEquipment: ["dumbbell", "bench"] }),
    /equipment/i,
    "caller-owned duplicate metadata cannot make a trusted cable exercise dumbbell-compatible"
  );

  const conflictingEquipment = {
    personalExerciseId: customId,
    researchExerciseId: "ex_dumbbell_bench_press",
    exerciseName: "Conflicting trusted dumbbell record",
    equipment: "dumbbell"
  };
  assert.throws(() => ordinaryWith([cableSummary, conflictingEquipment]), /conflicting trusted custom.*equipment|equipment.*conflict/i, "conflicting trusted requirements invalidate the custom identity");
  assert.throws(() => safetyWith([conflictingEquipment, cableRequirements]), /conflicting trusted custom.*equipment|equipment.*conflict/i, "conflicting trusted requirements invalidate the same identity in pain-safety regardless of order");

  const conflictingResearch = {
    personalExerciseId: customId,
    researchExerciseId: "ex_machine_chest_press",
    exerciseName: "Conflicting trusted research mapping",
    equipment: "cable"
  };
  assert.throws(() => ordinaryWith([cableSummary, conflictingResearch]), /conflicting trusted custom.*research|research.*conflict|mapping/i, "conflicting non-null research identities invalidate the custom identity");
  assert.throws(() => safetyWith([conflictingResearch, cableRequirements]), /conflicting trusted custom.*research|research.*conflict|mapping/i, "research conflicts reject pain-safety selection independently of source order");
});

test("trusted custom catalog reconciliation is associative and commutative across sparse, summary, and detailed records", () => {
  const permutations = (items) => items.length <= 1
    ? [items]
    : items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((tail) => [item, ...tail]));
  const customId = "custom_permuted_dumbbell_press";
  const batchEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: [{ exercise_id: customId, exercise_name: "Sparse batch personal score" }],
      metadata: { methodology_version: "trusted-catalog-batch-test/1.0.0" }
    },
    researchData: publicResearchData()
  });
  const ordinary = batchEngine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: progressionHistory(), createdAt });
  const painful = batchEngine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: progressionHistory(),
    readiness: { pain: true, affectedMuscle: "chest" },
    createdAt
  });
  const sparse = {
    personalExerciseId: customId,
    exerciseName: "Sparse trusted record",
    notes: "complementary sparse metadata"
  };
  const summary = {
    personalExerciseId: customId,
    researchExerciseId: "ex_dumbbell_bench_press",
    exerciseName: "Dumbbell summary record",
    equipment: "dumbbell",
    movementPattern: "horizontal_push"
  };
  const detailed = {
    personalExerciseId: customId,
    researchExerciseId: "ex_dumbbell_bench_press",
    exerciseName: "Dumbbell and bench detail",
    equipmentRequirements: [["dumbbells", "bench"]],
    primaryMuscle: "chest"
  };
  const summaryAlias = {
    personalExerciseId: customId,
    researchExerciseId: "ex_dumbbell_bench_press",
    exerciseName: "Duplicate normalized summary",
    equipment_type: [["dumbbells"]],
    modality: "free_weight"
  };
  const moreDetailed = {
    personalExerciseId: customId,
    researchExerciseId: "ex_dumbbell_bench_press",
    exerciseName: "Dumbbell bench and rack detail",
    requiredEquipment: [["dumbbell", "bench", "rack"]],
    secondaryMuscle: "triceps"
  };
  const equivalentDetail = {
    personalExerciseId: customId,
    researchExerciseId: "ex_dumbbell_bench_press",
    exerciseName: "Equivalent detailed record",
    equipment_requirements: "dumbbell"
  };
  const incomparableDetail = {
    personalExerciseId: customId,
    researchExerciseId: "ex_dumbbell_bench_press",
    exerciseName: "Incomparable dumbbell rack detail",
    equipmentRequirements: [["dumbbell", "rack"]]
  };
  const ordinaryWith = (trustedExerciseCatalog, availableEquipment, extra = {}) => batchEngine.applyManualOverride(ordinary, { exerciseId: customId }, {
    allowedExerciseIds: [customId],
    trustedExerciseCatalog,
    availableEquipment,
    createdAt: "2026-07-12T12:22:02.000Z",
    ...extra
  });
  const safetyWith = (trustedExerciseCatalog, availableEquipment, extra = {}) => batchEngine.applyManualOverride(painful, {
    exerciseId: customId,
    researchExerciseId: "ex_dumbbell_bench_press",
    painFreeConfirmed: true
  }, {
    allowedSafetySubstituteIds: [customId],
    trustedExerciseCatalog,
    availableEquipment,
    createdAt: "2026-07-12T12:22:04.000Z",
    ...extra
  });

  const refinementOrdinarySignatures = new Set();
  const refinementSafetySignatures = new Set();
  permutations([sparse, summary, detailed]).forEach((records, index) => {
    const ordinaryReplacement = ordinaryWith(records, ["dumbbell", "bench"]);
    const safetyReplacement = safetyWith(records, ["dumbbell", "bench"]);
    assert.equal(ordinaryReplacement.finalPrescription.researchExerciseId, "ex_dumbbell_bench_press", `permutation ${index} must adopt the sole non-null research mapping`);
    assert.equal(safetyReplacement.finalPrescription.safetyRestriction.status, "resolved_by_confirmed_substitute", `pain-safety permutation ${index} must resolve through the same batch identity`);
    assert.throws(() => ordinaryWith(records, ["dumbbell"]), /equipment/i, `permutation ${index} must retain the more-specific bench requirement`);
    assert.throws(() => safetyWith(records, ["dumbbell"]), /equipment/i, `pain-safety permutation ${index} must retain the more-specific bench requirement`);
    refinementOrdinarySignatures.add(JSON.stringify({ final: ordinaryReplacement.finalPrescription, changes: ordinaryReplacement.manualOverrides.at(-1)?.changes }));
    refinementSafetySignatures.add(JSON.stringify({ final: safetyReplacement.finalPrescription, changes: safetyReplacement.manualOverrides.at(-1)?.changes }));
  });
  assert.equal(refinementOrdinarySignatures.size, 1, "ordinary replacement output must be invariant across every sparse/summary/detail ordering");
  assert.equal(refinementSafetySignatures.size, 1, "pain-safety output must be invariant across every sparse/summary/detail ordering");

  permutations([summary, detailed, moreDetailed]).forEach((records, index) => {
    assert.equal(ordinaryWith(records, ["dumbbell", "bench", "rack"]).finalPrescription.exerciseId, customId, `multiple-detail permutation ${index} must choose the uniquely most-specific compatible declaration`);
    assert.equal(safetyWith(records, ["dumbbell", "bench", "rack"]).finalPrescription.exerciseId, customId, `pain-safety multiple-detail permutation ${index} must choose the same declaration`);
    assert.throws(() => ordinaryWith(records, ["dumbbell", "bench"]), /equipment/i, `multiple-detail permutation ${index} must retain the rack requirement`);
  });

  permutations([sparse, summary, equivalentDetail]).forEach((records, index) => {
    assert.equal(ordinaryWith(records, ["dumbbell"]).finalPrescription.exerciseId, customId, `equivalent summary/detail permutation ${index} must reconcile without conflict`);
    assert.equal(safetyWith(records, ["dumbbell"]).finalPrescription.exerciseId, customId, `pain-safety equivalent permutation ${index} must reconcile without conflict`);
  });

  permutations([sparse, summary, summaryAlias]).forEach((records, index) => {
    assert.equal(ordinaryWith(records, ["dumbbell"]).finalPrescription.exerciseId, customId, `exact normalized duplicate permutation ${index} must be discarded safely`);
    assert.equal(safetyWith(records, ["dumbbell"]).finalPrescription.exerciseId, customId, `pain-safety exact duplicate permutation ${index} must be discarded safely`);
  });

  permutations([summary, detailed, incomparableDetail]).forEach((records, index) => {
    assert.throws(() => ordinaryWith(records, ["all"]), /conflicting trusted custom.*equipment|equipment.*conflict/i, `incomparable ordinary permutation ${index} must fail closed`);
    assert.throws(() => safetyWith(records, ["all"]), /conflicting trusted custom.*equipment|equipment.*conflict/i, `incomparable pain-safety permutation ${index} must fail closed`);
  });

  const callerSpoof = [{
    personalExerciseId: customId,
    researchExerciseId: "ex_dumbbell_bench_press",
    exerciseName: "Caller barbell spoof",
    equipment: "barbell"
  }];
  const trustedBatch = [moreDetailed, sparse, summary, detailed];
  assert.equal(ordinaryWith(trustedBatch, ["dumbbell", "bench", "rack"], { exerciseCatalog: callerSpoof }).finalPrescription.exerciseId, customId, "caller metadata cannot alter a reconciled trusted batch");
  assert.throws(() => ordinaryWith(trustedBatch, ["barbell", "rack"], { exerciseCatalog: callerSpoof }), /equipment/i, "caller equipment cannot replace the batch-selected trusted requirements");
  assert.throws(() => safetyWith(trustedBatch, ["barbell", "rack"], { exerciseCatalog: callerSpoof }), /equipment/i, "caller equipment cannot influence pain-safety batch reconciliation");
});

test("positive equipment requirements apply Boolean absorption before ordinary and pain-safety catalog reconciliation", () => {
  const permutations = (items) => items.length <= 1
    ? [items]
    : items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((tail) => [item, ...tail]));
  const reviewerCases = [{
    label: "single dominated branch",
    exerciseId: "custom_absorbed_dumbbell_press",
    researchExerciseId: "ex_dumbbell_bench_press",
    redundantRequirements: "dumbbell|dumbbell+bench",
    canonicalRequirements: [["dumbbells"]],
    ordinaryEquipment: ["dumbbell"],
    safetyEquipment: ["dumbbell"],
    rejectedEquipment: ["cable"]
  }, {
    label: "duplicate-token dominance chain",
    exerciseId: "custom_absorbed_dominance_chain",
    researchExerciseId: "ex_dumbbell_bench_press",
    redundantRequirements: [["dumbbells", "dumbbell"], ["dumbbell", "bench", "bench"], ["dumbbell", "bench"], ["dumbbell", "bench", "rack"]],
    canonicalRequirements: "dumbbell",
    ordinaryEquipment: ["dumbbell"],
    safetyEquipment: ["dumbbell"],
    rejectedEquipment: ["bodyweight"]
  }, {
    label: "mixed incomparable alternatives",
    exerciseId: "custom_absorbed_mixed_press",
    researchExerciseId: "ex_dumbbell_bench_press",
    redundantRequirements: "dumbbell|dumbbells+bench|cable|cables",
    canonicalRequirements: [["cable_station"], ["dumbbell"]],
    ordinaryEquipment: ["dumbbell"],
    safetyEquipment: ["cable"],
    rejectedEquipment: ["bodyweight"]
  }, {
    label: "bodyweight no-equipment absorption",
    exerciseId: "custom_absorbed_bodyweight",
    researchExerciseId: "ex_side_plank",
    redundantRequirements: "bodyweight|bodyweight+dip_belt+plates",
    canonicalRequirements: [["bodyweight"]],
    ordinaryEquipment: ["no equipment"],
    safetyEquipment: ["no_equipment"],
    rejectedEquipment: ["dumbbell"]
  }];
  const absorptionEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: reviewerCases.map((item) => ({ exercise_id: item.exerciseId, exercise_name: `${item.label} sparse score` })),
      metadata: { methodology_version: "equipment-boolean-absorption-test/1.0.0" }
    },
    researchData: publicResearchData()
  });
  const ordinary = absorptionEngine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: progressionHistory(), createdAt });
  const painful = absorptionEngine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: progressionHistory(),
    readiness: { pain: true, affectedMuscle: "chest" },
    createdAt
  });

  reviewerCases.forEach((item) => {
    const sparse = { personalExerciseId: item.exerciseId, exerciseName: `${item.label} sparse trusted record`, notes: "complementary metadata" };
    const redundant = {
      personalExerciseId: item.exerciseId,
      researchExerciseId: item.researchExerciseId,
      exerciseName: `${item.label} redundant Boolean form`,
      equipmentRequirements: item.redundantRequirements
    };
    const canonical = {
      personalExerciseId: item.exerciseId,
      researchExerciseId: item.researchExerciseId,
      exerciseName: `${item.label} canonical Boolean form`,
      requiredEquipment: item.canonicalRequirements
    };
    const ordinarySignatures = new Set();
    const safetySignatures = new Set();
    permutations([sparse, redundant, canonical]).forEach((trustedExerciseCatalog, index) => {
      const ordinaryReplacement = absorptionEngine.applyManualOverride(ordinary, { exerciseId: item.exerciseId }, {
        allowedExerciseIds: [item.exerciseId],
        trustedExerciseCatalog,
        availableEquipment: item.ordinaryEquipment,
        createdAt: "2026-07-12T12:22:06.000Z"
      });
      const safetyReplacement = absorptionEngine.applyManualOverride(painful, {
        exerciseId: item.exerciseId,
        researchExerciseId: item.researchExerciseId,
        painFreeConfirmed: true
      }, {
        allowedSafetySubstituteIds: [item.exerciseId],
        trustedExerciseCatalog,
        availableEquipment: item.safetyEquipment,
        createdAt: "2026-07-12T12:22:08.000Z"
      });
      assert.equal(ordinaryReplacement.finalPrescription.exerciseId, item.exerciseId, `${item.label} ordinary permutation ${index} must reconcile after absorption`);
      assert.equal(safetyReplacement.finalPrescription.safetyRestriction.status, "resolved_by_confirmed_substitute", `${item.label} pain-safety permutation ${index} must reconcile after absorption`);
      assert.throws(() => absorptionEngine.applyManualOverride(ordinary, { exerciseId: item.exerciseId }, {
        allowedExerciseIds: [item.exerciseId],
        trustedExerciseCatalog,
        availableEquipment: item.rejectedEquipment
      }), /equipment/i, `${item.label} ordinary permutation ${index} must preserve non-dominated constraints`);
      assert.throws(() => absorptionEngine.applyManualOverride(painful, {
        exerciseId: item.exerciseId,
        researchExerciseId: item.researchExerciseId,
        painFreeConfirmed: true
      }, {
        allowedSafetySubstituteIds: [item.exerciseId],
        trustedExerciseCatalog,
        availableEquipment: item.rejectedEquipment
      }), /equipment/i, `${item.label} pain-safety permutation ${index} must preserve non-dominated constraints`);
      ordinarySignatures.add(JSON.stringify({ final: ordinaryReplacement.finalPrescription, changes: ordinaryReplacement.manualOverrides.at(-1)?.changes }));
      safetySignatures.add(JSON.stringify({ final: safetyReplacement.finalPrescription, changes: safetyReplacement.manualOverrides.at(-1)?.changes }));
    });
    assert.equal(ordinarySignatures.size, 1, `${item.label} ordinary output must be permutation-invariant`);
    assert.equal(safetySignatures.size, 1, `${item.label} pain-safety output must be permutation-invariant`);
  });

  assert.deepEqual(equipmentRequirementOptions({ equipmentRequirements: "dumbbell|dumbbell+bench|dumbbell+bench+rack" }), [["dumbbell"]], "a full dominance chain minimizes to its least restrictive conjunction");
  assert.deepEqual(equipmentRequirementOptions({ equipmentRequirements: "dumbbell|dumbbell+bench|cable" }), [["dumbbell"], ["cable_station"]], "absorption removes dominated branches while preserving incomparable alternatives");
  assert.deepEqual(equipmentRequirementOptions({ equipmentRequirements: "bodyweight|bodyweight+dip_belt+plates" }), [["bodyweight"]], "bodyweight absorbs its equipment-assisted superset");
  assert.throws(() => equipmentRequirementOptions({ equipmentRequirements: [[]] }), /empty|malformed|equipment/i, "Boolean minimization must not make an empty option valid");
  assert.throws(() => equipmentRequirementOptions({ equipmentRequirements: [["dumbbell", ""]] }), /empty|malformed|equipment/i, "Boolean minimization must not discard malformed blank tokens");
});

test("an ex_ prefix and allowlist cannot establish a nonexistent or caller-spoofed canonical exercise", () => {
  const snapshot = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: progressionHistory(), createdAt });
  const sameExerciseLoad = engine.applyManualOverride(snapshot, {
    exerciseId: "ex_barbell_bench_press",
    load: snapshot.finalPrescription.prescribedLoad.target + 5
  }, { createdAt: "2026-07-12T12:21:30.000Z" });
  assert.equal(sameExerciseLoad.finalPrescription.prescribedLoad.target, snapshot.finalPrescription.prescribedLoad.target + 5, "same-exercise load overrides remain valid and must not be mistaken for replacement load transfer");
  assert.equal(sameExerciseLoad.manualOverrides.at(-1).changes.exerciseId, undefined, "selecting the current exercise is not an identity transition");

  const spoofId = "ex_nonexistent_spoof_press";
  assert.throws(() => engine.applyManualOverride(snapshot, { exerciseId: spoofId }, {
    allowedExerciseIds: [spoofId]
  }), /unknown|trusted catalog|catalog.backed/i, "an allowlist is not an identity source");
  assert.throws(() => engine.applyManualOverride(snapshot, { exerciseId: spoofId, researchExerciseId: spoofId }, {
    allowedExerciseIds: [spoofId],
    exerciseCatalog: [{ exercise_id: spoofId, exercise_name: "Spoof press", equipment: "dumbbell" }]
  }), /unknown|trusted catalog|untrusted|catalog.backed/i, "caller catalog metadata and an ex_ prefix cannot forge a canonical identity");
  assert.throws(() => engine.applyManualOverride(snapshot, { exerciseId: "ex_dumbbell_bench_press" }, {
    allowedExerciseIds: ["ex_dumbbell_bench_press"],
    availableEquipment: ["barbell", "plates", "bench", "rack"]
  }), /equipment/i, "ordinary replacements must satisfy the supplied equipment constraint");
  assert.throws(() => engine.applyManualOverride(snapshot, {
    exerciseId: "ex_dumbbell_bench_press",
    load: snapshot.finalPrescription.prescribedLoad.target
  }, {
    allowedExerciseIds: ["ex_dumbbell_bench_press"],
    availableEquipment: ["dumbbell", "bench"]
  }), /cannot receive|baseline|transferred load/i, "a caller cannot reintroduce a load target in the replacement transaction");
  assert.throws(() => engine.applyManualOverride(snapshot, { exerciseId: "ex_dumbbell_bench_press" }), /allow/i, "trusted catalog membership does not replace explicit ordinary-replacement authorization");

  const structured = publicResearchData().exerciseDatabase.find((exercise) => exercise.exercise_id === "ex_dumbbell_bench_press");
  const structuredReplacement = engine.applyManualOverride(snapshot, {
    exerciseSelection: { ...structured, researchExerciseId: "ex_dumbbell_bench_press" }
  }, {
    allowedExerciseIds: ["ex_dumbbell_bench_press"],
    availableEquipment: ["dumbbell", "bench"],
    createdAt: "2026-07-12T12:22:00.000Z"
  });
  assert.equal(structuredReplacement.finalPrescription.exerciseId, "ex_dumbbell_bench_press", "structured catalog-backed ordinary replacement input remains supported");
});

test("hard-safety snapshots reject training overrides and require an explicit coherent safe substitute", () => {
  const snapshot = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: progressionHistory(),
    readiness: { pain: true, affectedMuscle: "Chest" },
    createdAt
  });
  assert.equal(snapshot.finalPrescription.recommendationType, "substitute", "fixture must be hard-safety restricted");
  assert.equal(snapshot.finalPrescription.executionBlocked, true, "fixture must start non-executable");
  const blocked = [
    ["load", { load: 40 }],
    ["set count", { setCount: 2 }],
    ["rep range", { repRange: { min: 6, max: 8 } }],
    ["set structure", { setStructure: "straight_sets" }],
    ["deload weakening", { deloadRecommendation: false }],
    ["rotation weakening", { exerciseRotation: false }],
    ["arbitrary catalog exercise", { exerciseId: "ex_dumbbell_bench_press", researchExerciseId: "ex_dumbbell_bench_press" }]
  ];
  collectFailures(blocked.map(([label, override]) => [label, () => assert.throws(
    () => engine.applyManualOverride(snapshot, override, { createdAt: "2026-07-12T12:05:00.000Z" }),
    undefined,
    `${label} changed a hard-safety snapshot`
  )]));
  assert.throws(() => engine.applyManualOverride(snapshot, {
    exerciseId: "ex_dumbbell_bench_press",
    researchExerciseId: "ex_dumbbell_bench_press"
  }, { allowedSafetySubstituteIds: "ex_dumbbell_bench_press" }), /array/i);
  assert.throws(() => engine.applyManualOverride(snapshot, {
    exerciseId: "ex_dumbbell_bench_press",
    researchExerciseId: "ex_dumbbell_bench_press"
  }, { allowedSafetySubstituteIds: ["not_in_catalog"] }), /unknown allowed safety substitute/i);
  assert.throws(() => engine.applyManualOverride(snapshot, {
    exerciseId: "ex_dumbbell_bench_press",
    researchExerciseId: "ex_barbell_bench_press",
    painFreeConfirmed: true
  }, {
    allowedSafetySubstituteIds: ["ex_dumbbell_bench_press"],
    createdAt: "2026-07-12T12:06:00.000Z"
  }), /identity|research/i, "safe substitute must keep coherent exercise/research identity");
  assert.throws(() => applyManualOverride(snapshot, {
    exerciseId: "ex_dumbbell_bench_press",
    researchExerciseId: "ex_dumbbell_bench_press",
    painFreeConfirmed: true
  }, {
    exerciseCatalog: ["ex_dumbbell_bench_press"],
    allowedSafetySubstituteIds: ["ex_dumbbell_bench_press"]
  }), /catalog object|structured catalog/i, "string catalog entries must not establish safety identity");
  assert.throws(() => applyManualOverride(snapshot, {
    exerciseId: "ex_dumbbell_bench_press",
    researchExerciseId: "ex_dumbbell_bench_press",
    painFreeConfirmed: true
  }, {
    exerciseCatalog: [{ exerciseId: "ex_dumbbell_bench_press", researchExerciseId: "ex_dumbbell_bench_press" }],
    allowedSafetySubstituteIds: ["ex_dumbbell_bench_press"]
  }), /catalog object|structured catalog/i, "an ID-only object must not masquerade as an actual catalog record");
  assert.throws(() => engine.applyManualOverride(snapshot, {
    exerciseId: "ex_dumbbell_bench_press",
    researchExerciseId: "ex_dumbbell_bench_press"
  }, {
    allowedSafetySubstituteIds: ["ex_dumbbell_bench_press"]
  }), /pain.free.*confirm/i, "pain substitutions require an explicit user confirmation");
  assert.throws(() => engine.applyManualOverride(snapshot, {
    exerciseId: "ex_dumbbell_bench_press",
    researchExerciseId: "ex_dumbbell_bench_press",
    painFreeConfirmed: true
  }, {
    allowedSafetySubstituteIds: ["ex_dumbbell_bench_press"],
    availableEquipment: ["barbell", "plates", "bench", "rack"]
  }), /equipment/i, "restricted equipment must be checked for safety substitutes");
  assert.throws(() => engine.applyManualOverride(snapshot, {
    exerciseId: "ex_barbell_bench_press",
    researchExerciseId: "ex_barbell_bench_press",
    painFreeConfirmed: true
  }, {
    allowedSafetySubstituteIds: ["ex_barbell_bench_press"],
    availableEquipment: ["barbell", "plates", "bench", "rack"]
  }), /different|original|painful/i, "the painful original exercise cannot be allowlisted as its own safe substitute");
  assert.equal(snapshot.finalPrescription.executionBlocked, true, "a rejected same-exercise override must leave the original snapshot blocked");
  assert.equal(snapshot.finalPrescription.safetyRestriction.status, "blocked", "a rejected same-exercise override must not resolve the safety restriction");
  assert.throws(() => engine.applyManualOverride(snapshot, {
    exerciseId: "custom_same_bench",
    researchExerciseId: "ex_barbell_bench_press",
    painFreeConfirmed: true
  }, {
    trustedExerciseCatalog: [{
      personalExerciseId: "custom_same_bench",
      researchExerciseId: "ex_barbell_bench_press",
      exerciseName: "Custom bench alias",
      equipment: "barbell|plates|bench|rack"
    }],
    allowedSafetySubstituteIds: ["custom_same_bench"],
    availableEquipment: ["barbell", "plates", "bench", "rack"]
  }), /different|original|painful/i, "a different catalog ID cannot disguise the same painful research exercise");
  const customSubstituted = engine.applyManualOverride(snapshot, {
    exerciseId: "custom_pain_free_press",
    researchExerciseId: "ex_dumbbell_bench_press",
    painFreeConfirmed: true
  }, {
    trustedExerciseCatalog: [{
      personalExerciseId: "custom_pain_free_press",
      researchExerciseId: "ex_dumbbell_bench_press",
      exerciseName: "Custom pain-free dumbbell press",
      equipment: "dumbbell|bench"
    }],
    allowedSafetySubstituteIds: ["custom_pain_free_press"],
    availableEquipment: ["dumbbell", "bench"],
    createdAt: "2026-07-12T12:06:30.000Z"
  });
  assert.equal(customSubstituted.finalPrescription.exerciseId, "custom_pain_free_press");
  assert.equal(customSubstituted.finalPrescription.researchExerciseId, "ex_dumbbell_bench_press", "the safety confirmation must bind both custom and research identities");
  assert.doesNotThrow(() => deserializeRecommendationSnapshot(customSubstituted), "the explicit safety audit companion keeps a composite custom/research substitute representable");
  const substituted = engine.applyManualOverride(snapshot, {
    exerciseId: "ex_dumbbell_bench_press",
    researchExerciseId: "ex_dumbbell_bench_press",
    painFreeConfirmed: true
  }, {
    allowedSafetySubstituteIds: ["ex_dumbbell_bench_press"],
    availableEquipment: ["dumbbell", "bench"],
    createdAt: "2026-07-12T12:07:00.000Z"
  });
  assert.equal(substituted.exerciseId, "ex_dumbbell_bench_press");
  assert.equal(substituted.finalPrescription.exerciseId, "ex_dumbbell_bench_press");
  assert.equal(substituted.finalPrescription.researchExerciseId, "ex_dumbbell_bench_press");
  assert.equal(substituted.finalPrescription.recommendationType, "substitute");
  assert.equal(substituted.finalPrescription.executionBlocked, false, "a confirmed pain-free substitute may become executable");
  assert.ok(substituted.finalPrescription.workingSets.target >= 1, "confirmed substitute restores bounded base set targets");
  assert.ok(substituted.finalPrescription.workingSets.min <= substituted.finalPrescription.workingSets.target);
  assert.ok(substituted.finalPrescription.workingSets.target <= substituted.finalPrescription.workingSets.max);
  assert.ok(substituted.finalPrescription.repRange.min >= 1 && substituted.finalPrescription.repRange.max <= 100);
  assert.ok(substituted.finalPrescription.targetRpe.min >= 5 && substituted.finalPrescription.targetRpe.max <= 10);
  assert.equal(substituted.finalPrescription.prescribedLoad, undefined, "confirmed safety substitutes never infer a load");
  assert.equal(substituted.finalPrescription.safetyRestriction.status, "resolved_by_confirmed_substitute");
  assert.equal(substituted.finalPrescription.safetyRestriction.painFreeConfirmed, true);
  assert.equal(substituted.finalPrescription.safetyRestriction.substituteExerciseId, "ex_dumbbell_bench_press");
  assert.equal(substituted.manualOverrides.at(-1).changes.safetyConfirmation.painFreeConfirmed, true, "confirmation must remain auditable");
  assert.doesNotThrow(() => validateSnapshot(substituted));
  const sameOriginalTamper = structuredClone(substituted);
  sameOriginalTamper.finalPrescription.safetyRestriction.originalExerciseId = "ex_dumbbell_bench_press";
  assert.throws(() => validateSnapshot(sameOriginalTamper), /different|original|painful/i, "runtime validation must reject a resolved restriction whose substitute is the recorded original");
  const sameAuditOriginalTamper = structuredClone(substituted);
  sameAuditOriginalTamper.finalPrescription.safetyRestriction.auditBaseTargets.exerciseId = "ex_dumbbell_bench_press";
  sameAuditOriginalTamper.finalPrescription.safetyRestriction.auditBaseTargets.researchExerciseId = "ex_dumbbell_bench_press";
  assert.throws(() => validateSnapshot(sameAuditOriginalTamper), /different|original|painful/i, "runtime validation must reject a resolved restriction whose substitute is the audited original");
  const executableBlockedTamper = structuredClone(snapshot);
  executableBlockedTamper.finalPrescription.workingSets.target = 1;
  assert.throws(() => validateSnapshot(executableBlockedTamper), /working sets/i, "runtime validation must reject executable work on a blocked output");
  const substituteLoadTamper = structuredClone(substituted);
  substituteLoadTamper.finalPrescription.prescribedLoad = { target: 1, reason: "spoofed" };
  assert.throws(() => validateSnapshot(substituteLoadTamper), /substitute load/i, "runtime validation must reject an inferred substitute load");

  const illness = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    readiness: { illness: true },
    createdAt
  });
  assert.throws(() => engine.applyManualOverride(illness, {
    exerciseId: "ex_dumbbell_bench_press",
    researchExerciseId: "ex_dumbbell_bench_press",
    painFreeConfirmed: true
  }, {
    allowedSafetySubstituteIds: ["ex_dumbbell_bench_press"],
    availableEquipment: ["dumbbell", "bench"]
  }), /illness/i, "illness cannot be unblocked by an exercise override");
});

test("historical volume reports relationship taxonomy provenance and fails closed for missing or mixed rows", () => {
  const source = publicResearchData();
  const deadliftRows = source.exerciseMuscleMap.filter((row) => row.exercise_id === "ex_deadlift");
  const publicRelationshipVersions = [...new Set(deadliftRows.map((row) => row.taxonomy_version).filter(Boolean))];
  assert.equal(publicRelationshipVersions.length, 1, "the public deadlift fixture must use one relationship taxonomy version");
  const logged = [{ researchExerciseId: "ex_deadlift", workingSets: 4 }];
  const publicResult = recalculateHistoricalMuscleVolume(evidence, logged);
  assert.equal(publicResult.taxonomyVersion, publicRelationshipVersions[0], "top-level provenance must reflect the relationship rows used in the calculation");

  function evidenceWithDeadliftVersions(versionForIndex) {
    return normalizeEvidenceBundle({
      personalData: {},
      researchData: {
        ...source,
        manifest: { ...source.manifest, database_version: "3.0.0" },
        exerciseMuscleMap: source.exerciseMuscleMap.map((row) => {
          if (row.exercise_id !== "ex_deadlift") return row;
          const next = { ...row };
          const version = versionForIndex(deadliftRows.findIndex((candidate) => candidate.exercise_muscle_map_id === row.exercise_muscle_map_id));
          if (version === null) delete next.taxonomy_version;
          else next.taxonomy_version = version;
          return next;
        })
      }
    });
  }

  const integrated = recalculateHistoricalMuscleVolume(evidenceWithDeadliftVersions(() => "2.1.0"), logged);
  assert.equal(integrated.taxonomyVersion, "2.1.0", "research database 3.0.0 must not overwrite relationship taxonomy 2.1.0 provenance");
  assert.equal(integrated.familyProjectionStatus, "ready");
  assert.equal(integrated.programmingFamilyVersion, "programming-family/1.0.0");
  assert.equal(integrated.ledgerVersion, "historical-family-volume/1.0.0");
  assert.ok(integrated.familyTotals.some((row) => row.programmingFamilyId === "glutes" && row.directSets === 4), "recommendation history must expose family-level dose");
  assert.deepEqual(integrated.rollbackContract, { strategy: "recalculate_from_immutable_records", persistentMigrationRequired: false, sourceRecordsMutated: false });
  const mixed = recalculateHistoricalMuscleVolume(evidenceWithDeadliftVersions((index) => index % 2 ? "2.2.0" : "2.1.0"), logged);
  assert.equal(mixed.taxonomyVersion, "mixed", "multiple relationship taxonomy versions must be reported explicitly");
  assert.equal(mixed.familyProjectionStatus, "blocked_unverifiable_provenance");
  assert.deepEqual(mixed.familyTotals, [], "mixed provenance cannot emit family dose");
  const missing = recalculateHistoricalMuscleVolume(evidenceWithDeadliftVersions(() => null), logged);
  assert.equal(missing.taxonomyVersion, "unknown", "entirely missing relationship taxonomy provenance must fail closed");
  assert.deepEqual(missing.familyTotals, [], "missing provenance cannot emit family dose");
  const partiallyMissing = recalculateHistoricalMuscleVolume(evidenceWithDeadliftVersions((index) => index === 0 ? "2.1.0" : null), logged);
  assert.equal(partiallyMissing.taxonomyVersion, "mixed", "partial relationship taxonomy provenance must fail closed as mixed");
  assert.equal(recalculateHistoricalMuscleVolume(evidence, []).taxonomyVersion, "unknown", "an empty recalculation has no relationship taxonomy provenance");
  const mappedCustom = recalculateHistoricalMuscleVolume(evidence, [{ exerciseId: "custom_arc_press", workingSets: 3, muscleRelationships: [{ muscle_group_id: "Chest", programming_family_id: "chest", relationship_type: "direct_load", fractional_set_credit: 1, relationship_source: "personal_mapping", mapping_version: "personal-muscle-mapping/1.0.0" }] }]);
  assert.equal(mappedCustom.familyProjectionStatus, "ready", "engine history must accept explicit versioned custom-muscle evidence");
  assert.equal(mappedCustom.taxonomyVersion, "not_applicable", "personal mapping must not impersonate a research taxonomy version");
  assert.equal(mappedCustom.personalMappingVersion, "personal-muscle-mapping/1.0.0");
  assert.equal(mappedCustom.familyTotals[0].weightedHypertrophySets, 3);
  const unresolvedCustom = recalculateHistoricalMuscleVolume(evidence, [{ exerciseId: "custom_unmapped", workingSets: 3, muscleRelationships: [] }]);
  assert.equal(unresolvedCustom.familyProjectionStatus, "blocked_unverifiable_provenance");
  assert.deepEqual(unresolvedCustom.familyTotals, [], "engine history must not infer custom dose from an unresolved name");
});

test("stale history is wired through scoring and snapshots by default", () => {
  assert.equal(engine.policy.maximumReturnGapDays, 56, "the return-gap default must remain visible in engine policy");
  const staleHistory = [1, 8, 15].map((day) => ({
    workout_date: `2024-01-${String(day).padStart(2, "0")}`,
    progression_status: "improved",
    progression_pct_vs_prior: 2,
    comparison_performance_value: 100 + day,
    set_repetitions: "[10,10,10]",
    set_loads: "[100,100,100]",
    set_rpes: "[8,8,8]",
    average_rpe: 8
  }));
  const scored = engine.scoreExercise("ex_barbell_bench_press", "chest", { history: staleHistory, createdAt });
  assert.equal(scored.staleness.classification, STALENESS.INSUFFICIENT, JSON.stringify(scored.staleness));
  const snapshot = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: staleHistory, createdAt });
  assert.equal(snapshot.basePrescription.staleness.classification, STALENESS.INSUFFICIENT, JSON.stringify(snapshot.basePrescription.staleness));
  assert.equal(snapshot.finalPrescription.progressionAction, "establish_baseline");
  assert.equal(snapshot.finalPrescription.recommendationType, "hold");
});

test("unavailable-muscle fallback plans expose complete zeroed volume fields", () => {
  const mesocycle = engine.createMesocycle({
    trainingDays: 4,
    includedMuscleGroupIds: ["chest"],
    availableEquipment: ["synthetic_unavailable_equipment"]
  });
  const plan = mesocycle.programReview.musclePlans.find((item) => item.muscleGroupId === "chest");
  assert.ok(plan, "equipment-blocked muscle requires a fallback plan");
  assert.equal(plan.directSets, 0);
  assert.equal(plan.secondarySets, 0);
  assert.equal(plan.indirectSets, 0);
  assert.equal(plan.incidentalSets, 0);
  assert.equal(plan.isometricExposure, 0);
  assert.equal(plan.taxonomyVersion, evidence.research.version, "fallback muscle plans must retain taxonomy provenance");
});

test("legacy target conversion is contractually required to honor executionBlocked", () => {
  const source = readApplicationContractSource(ROOT);
  const converter = source.match(/function legacyTargetFromSnapshot\([\s\S]*?\n\s*function unifiedTargetContext\(/)?.[0];
  assert.ok(converter, "legacyTargetFromSnapshot must remain discoverable for the app contract");
  assert.match(converter, /executionBlocked/, "index integration required: legacyTargetFromSnapshot must return a non-executable target whenever finalPrescription.executionBlocked is true");
});

test("recommendation IDs distinguish different readiness contexts", () => {
  const base = { exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", createdAt };
  const normal = engine.prescribeExercise(base);
  const reduced = engine.prescribeExercise({ ...base, readiness: { sleepHours: 4, baselineSleepHours: 8, nutritionAdequate: false } });
  assert.notDeepEqual(normal.finalPrescription, reduced.finalPrescription, "fixture must create different recommendation outputs");
  assert.notEqual(normal.recommendationId, reduced.recommendationId, `different outputs collided on ${normal.recommendationId}`);
});

test("ranking uses one custom-first equipment identity for eligibility, output, diversity, and substitutions", () => {
  const mappedId = "custom_ranked_cable_press";
  const unmappedId = "custom_ranked_unmapped_cable_press";
  const invalidId = "custom_ranked_invalid_press";
  const highPersonalScore = {
    comparable_session_count: 12,
    session_count: 12,
    observation_span_days: 180,
    data_confidence_score: 0.95,
    hypertrophy_support_score: 100,
    progression_score: 100,
    recovery_efficiency_score: 100,
    repeatability_score: 100
  };
  const muscleScore = (exerciseId) => ({
    exercise_id: exerciseId,
    exercise_name: exerciseId,
    muscle_group: "chest",
    muscle_role: "primary",
    contribution_weight: 1,
    research_muscle_group_id: "chest"
  });
  const customEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: [{
        ...highPersonalScore,
        exercise_id: mappedId,
        research_exercise_id: "ex_dumbbell_bench_press",
        exercise_name: "Mapped custom cable press",
        equipment: "cable"
      }, {
        ...highPersonalScore,
        exercise_id: unmappedId,
        exercise_name: "Unmapped custom cable press",
        equipmentRequirements: [["cables"]]
      }, {
        ...highPersonalScore,
        exercise_id: invalidId,
        research_exercise_id: "ex_dumbbell_bench_press",
        exercise_name: "Invalid custom press",
        equipment: "cable"
      }],
      exercisePrescriptions: [{
        exercise_id: invalidId,
        research_exercise_id: "ex_dumbbell_bench_press",
        exercise_name: "Invalid custom press",
        muscle_group_id: "chest",
        equipmentRequirements: [["dumbbell"]]
      }],
      exerciseMuscleScores: [muscleScore(mappedId), muscleScore(unmappedId), muscleScore(invalidId)],
      metadata: { methodology_version: "ranked-custom-equipment-test/1.0.0" }
    },
    researchData: publicResearchData()
  });

  const dumbbellPool = customEngine.rankExercisePool("chest", { availableEquipment: ["dumbbell", "bench", "selectorized_machine"], maxCandidates: 5 });
  assert.ok(dumbbellPool.excludedCandidates.some((item) => item.exerciseId === mappedId), "mapped custom cable equipment must override canonical dumbbell eligibility");
  assert.ok(dumbbellPool.excludedCandidates.some((item) => item.exerciseId === unmappedId), "an unmapped custom exercise must use its own declared equipment");
  assert.ok(dumbbellPool.excludedCandidates.some((item) => item.exerciseId === invalidId && /invalid|conflict/i.test(`${item.reasonCode} ${item.explanation}`)), "conflicting trusted equipment metadata must fail the ranked identity closed");
  assert.ok(!dumbbellPool.candidates.some((item) => item.exerciseId === mappedId || item.exerciseId === unmappedId || item.exerciseId === invalidId));
  const machine = dumbbellPool.candidates.find((item) => item.researchExerciseId === "ex_machine_chest_press");
  assert.ok(machine, "the substitution counterfactual requires a compatible machine chest press");
  assert.notEqual(machine.preferredReplacementExerciseId, mappedId, "substitution selection must not return a custom identity whose actual equipment is unavailable");

  const cablePool = customEngine.rankExercisePool("chest", { availableEquipment: ["cable"], maxCandidates: 5 });
  const mapped = cablePool.candidates.find((item) => item.exerciseId === mappedId);
  const unmapped = cablePool.candidates.find((item) => item.exerciseId === unmappedId);
  assert.ok(mapped, "mapped custom cable exercise must remain eligible with cable equipment");
  assert.ok(unmapped, "unmapped custom cable exercise must remain eligible with cable equipment");
  assert.deepEqual(mapped.equipmentRequirements, [["cable_station"]], "emitted requirements must describe the selected custom source");
  assert.deepEqual(mapped.diversitySignature.equipmentRequirements, [["cable_station"]], "deduplication must use the same selected custom source");
  assert.equal(mapped.diversitySignature.equipment, "cable", "the diversity family must match the emitted cable requirements");
  assert.deepEqual(unmapped.equipmentRequirements, [["cable_station"]]);
  assert.ok(!cablePool.candidates.some((item) => item.exerciseId === "ex_dumbbell_bench_press"), "a linked canonical duplicate must not be emitted beside its selected custom identity");
  const cableFly = cablePool.candidates.find((item) => item.researchExerciseId === "ex_cable_fly");
  assert.ok(cableFly, "the positive substitution counterfactual requires cable fly");
  assert.equal(cableFly.preferredReplacementExerciseId, mappedId, "substitution output must return the compatible custom identity that was actually checked");

  const canonicalDumbbell = engine.rankExercisePool("chest", { availableEquipment: ["dumbbell", "bench"], maxCandidates: 5 });
  assert.ok(canonicalDumbbell.candidates.some((item) => item.exerciseId === "ex_dumbbell_bench_press"), "canonical-only equipment behavior must remain available");
  const canonicalCable = engine.rankExercisePool("chest", { availableEquipment: ["cable"], maxCandidates: 5 });
  assert.ok(canonicalCable.excludedCandidates.some((item) => item.exerciseId === "ex_dumbbell_bench_press"), "canonical-only equipment behavior must remain restricted");

  const fallbackId = "custom_ranked_canonical_fallback_press";
  const fallbackEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: [{
        ...highPersonalScore,
        exercise_id: fallbackId,
        research_exercise_id: "ex_dumbbell_bench_press",
        exercise_name: "Custom press without equipment metadata"
      }],
      exerciseMuscleScores: [muscleScore(fallbackId)],
      metadata: { methodology_version: "ranked-canonical-fallback-test/1.0.0" }
    },
    researchData: publicResearchData()
  });
  const fallbackDumbbell = fallbackEngine.rankExercisePool("chest", { availableEquipment: ["dumbbell", "bench"], maxCandidates: 5 });
  const fallback = fallbackDumbbell.candidates.find((item) => item.exerciseId === fallbackId);
  assert.ok(fallback, "a mapped custom identity without equipment metadata must use its canonical fallback");
  const canonicalRequirements = equipmentRequirementOptions(evidence.research.exerciseById.get("ex_dumbbell_bench_press"))
    .map((option) => [...option].sort())
    .sort((left, right) => left.join("+").localeCompare(right.join("+")));
  assert.deepEqual(fallback.equipmentRequirements, canonicalRequirements);
  assert.ok(!fallbackDumbbell.candidates.some((item) => item.exerciseId === "ex_dumbbell_bench_press"), "canonical fallback must retain the selected custom output identity without a duplicate");
  const fallbackCable = fallbackEngine.rankExercisePool("chest", { availableEquipment: ["cable"], maxCandidates: 5 });
  assert.ok(fallbackCable.excludedCandidates.some((item) => item.exerciseId === fallbackId), "the canonical fallback must remain binding when unavailable");
});

test("one reconciled research identity governs nullable crosswalks, aliases, canonical suppression, resolution, and substitutions", () => {
  const ids = {
    absent: "custom_absent_alias_press",
    blank: "custom_blank_alias_press",
    nullable: "custom_null_alias_press",
    unresolved: "custom_unresolved_press",
    explicit: "custom_explicit_machine_press",
    invalid: "custom_invalid_research_press",
    camberedAlias: "custom_cambered_alias_press"
  };
  const score = (exerciseId, exerciseName, extra = {}) => ({
    exercise_id: exerciseId,
    exercise_name: exerciseName,
    equipment: "cable",
    comparable_session_count: 12,
    observation_span_days: 180,
    data_confidence_score: 0.95,
    hypertrophy_support_score: 100,
    progression_score: 100,
    recovery_efficiency_score: 100,
    repeatability_score: 100,
    ...extra
  });
  const muscleScore = (exerciseId) => ({
    exercise_id: exerciseId,
    exercise_name: exerciseId,
    muscle_group: "chest",
    muscle_role: "primary",
    contribution_weight: 1,
    research_muscle_group_id: "chest"
  });
  const identityScores = [
    score(ids.absent, "Dumbbell Bench Press"),
    score(ids.blank, "Dumbbell Bench Press", { research_exercise_id: "" }),
    score(ids.nullable, "Dumbbell Bench Press", { research_exercise_id: null }),
    score(ids.unresolved, "Unlisted Quantum Press"),
    score(ids.explicit, "Dumbbell Bench Press", { research_exercise_id: "ex_machine_chest_press", equipment: "machine" }),
    score(ids.invalid, "Dumbbell Bench Press", { research_exercise_id: "ex_unknown_research_press", equipment: "dumbbell" }),
    score(ids.camberedAlias, "Cambered Bench Press", { equipment: "barbell" })
  ];
  const identityMuscleScores = Object.values(ids).map(muscleScore);
  const identityEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: identityScores,
      exerciseMuscleScores: identityMuscleScores,
      metadata: { methodology_version: "research-identity-reconciliation-test/1.0.0" }
    },
    researchData: publicResearchData()
  });
  const identities = identityEngine.evidence.personal.reconciledIdentityByExerciseId;
  for (const exerciseId of [ids.absent, ids.blank, ids.nullable]) {
    assert.equal(identities.get(exerciseId).researchExerciseId, "ex_dumbbell_bench_press", `${exerciseId} must share the documented alias fallback`);
    assert.equal(identities.get(exerciseId).researchIdentitySource, "alias_inference");
  }
  assert.equal(identities.get(ids.absent).researchIdentityFieldPresence, "absent");
  assert.equal(identities.get(ids.blank).researchIdentityFieldPresence, "blank_or_null");
  assert.equal(identities.get(ids.nullable).researchIdentityFieldPresence, "blank_or_null");
  assert.equal(identities.get(ids.unresolved).researchExerciseId, null, "an absent crosswalk without a trusted alias remains personal-only");
  assert.equal(identities.get(ids.unresolved).researchIdentitySource, "unresolved");
  assert.equal(identities.get(ids.explicit).researchExerciseId, "ex_machine_chest_press", "an explicit valid crosswalk wins over a contradictory name alias");
  assert.equal(identities.get(ids.explicit).researchIdentitySource, "explicit_crosswalk");
  assert.equal(identities.get(ids.camberedAlias).researchExerciseId, "ex_cambered_barbell_bench_press", "declared research aliases remain eligible for fallback inference");
  assert.equal(identities.get(ids.camberedAlias).researchIdentitySource, "alias_inference");
  assert.equal(identities.get(ids.invalid).invalid, true, "an explicit unknown research ID must fail closed instead of falling back through the name");
  assert.match(identities.get(ids.invalid).invalidReason, /unknown research exercise/i);

  const selectedByResearch = identityEngine.evidence.personal.selectedPersonalIdByResearchId;
  assert.equal(selectedByResearch.get("ex_dumbbell_bench_press"), ids.absent, "equal-precedence custom aliases use stable exercise-ID order");
  const reverseOrderEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: [...identityScores].reverse(),
      exerciseMuscleScores: [...identityMuscleScores].reverse(),
      metadata: { methodology_version: "research-identity-reconciliation-order-test/1.0.0" }
    },
    researchData: publicResearchData()
  });
  assert.equal(
    reverseOrderEngine.evidence.personal.selectedPersonalIdByResearchId.get("ex_dumbbell_bench_press"),
    ids.absent,
    "canonical slot ownership must be invariant to input record order"
  );
  assert.deepEqual(
    reverseOrderEngine.rankExercisePool("chest", { availableEquipment: ["cable"], maxCandidates: 5 }).candidates
      .filter((candidate) => candidate.researchExerciseId === "ex_dumbbell_bench_press")
      .map((candidate) => candidate.exerciseId),
    [ids.absent],
    "order-independent reconciliation must flow through ranking output"
  );
  const cablePool = identityEngine.rankExercisePool("chest", { availableEquipment: ["cable"], maxCandidates: 5 });
  const dumbbellIdentitySlots = cablePool.candidates.filter((candidate) => candidate.researchExerciseId === "ex_dumbbell_bench_press");
  assert.deepEqual(dumbbellIdentitySlots.map((candidate) => candidate.exerciseId), [ids.absent], "one canonical research identity may occupy at most one ranked slot");
  assert.ok(!cablePool.candidates.some((candidate) => candidate.exerciseId === "ex_dumbbell_bench_press"), "the selected valid custom identity suppresses its canonical duplicate");
  const cableFly = cablePool.candidates.find((candidate) => candidate.researchExerciseId === "ex_cable_fly");
  assert.ok(cableFly);
  assert.equal(cableFly.preferredReplacementExerciseId, ids.absent, "substitution output must use the same selected reverse identity");
  assert.equal(identityEngine.scoreExercise("ex_dumbbell_bench_press", "chest").exerciseId, ids.absent, "canonical resolution must use the selected reverse identity");
  assert.equal(identityEngine.scoreExercise(ids.blank, "chest").researchExerciseId, "ex_dumbbell_bench_press", "direct custom resolution must retain its reconciled research identity");
  assert.equal(identityEngine.scoreExercise(ids.unresolved, "chest").researchExerciseId, null);
  assert.equal(identityEngine.scoreExercise(ids.explicit, "chest").researchExerciseId, "ex_machine_chest_press");
  assert.throws(() => identityEngine.scoreExercise(ids.invalid, "chest"), /unknown research exercise/i);

  const incompatiblePool = identityEngine.rankExercisePool("chest", { availableEquipment: ["dumbbell", "bench"], maxCandidates: 5 });
  assert.ok(incompatiblePool.excludedCandidates.some((candidate) => candidate.exerciseId === ids.absent), "the selected custom identity is evaluated against its own equipment");
  assert.ok(!incompatiblePool.candidates.some((candidate) => candidate.researchExerciseId === "ex_dumbbell_bench_press"), "custom-first identity policy intentionally does not resurrect the canonical duplicate after equipment filtering");

  const invalidOnlyEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: [score(ids.invalid, "Dumbbell Bench Press", { research_exercise_id: "ex_unknown_research_press", equipment: "dumbbell" })],
      exerciseMuscleScores: [muscleScore(ids.invalid)],
      metadata: { methodology_version: "invalid-research-identity-test/1.0.0" }
    },
    researchData: publicResearchData()
  });
  const invalidOnlyPool = invalidOnlyEngine.rankExercisePool("chest", { availableEquipment: ["dumbbell", "bench"], maxCandidates: 5 });
  assert.ok(invalidOnlyPool.excludedCandidates.some((candidate) => candidate.exerciseId === ids.invalid && /invalid|unknown/i.test(`${candidate.reasonCode} ${candidate.explanation}`)));
  assert.ok(invalidOnlyPool.candidates.some((candidate) => candidate.exerciseId === "ex_dumbbell_bench_press"), "an invalid custom identity never suppresses the valid canonical exercise");
});

test("reconciled invalid custom identities cannot re-enter overrides as genuinely unmapped exercises", () => {
  const invalidId = "custom_conflicting_alias_press";
  const unmappedId = "custom_genuinely_unmapped_press";
  const invalidIdentityEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: [{
        exercise_id: invalidId,
        exercise_name: "Dumbbell Bench Press",
        equipment: "cable"
      }, {
        exercise_id: unmappedId,
        exercise_name: "Unlisted Quantum Press",
        equipment: "cable"
      }],
      exerciseMuscleScores: [{
        exercise_id: invalidId,
        exercise_name: "Machine Chest Press",
        muscle_group: "chest",
        muscle_role: "primary",
        contribution_weight: 1,
        research_muscle_group_id: "chest"
      }, {
        exercise_id: unmappedId,
        exercise_name: "Unlisted Quantum Press",
        muscle_group: "chest",
        muscle_role: "primary",
        contribution_weight: 1,
        research_muscle_group_id: "chest"
      }],
      metadata: { methodology_version: "invalid-identity-propagation-test/1.0.0" }
    },
    researchData: publicResearchData()
  });
  const invalidIdentity = invalidIdentityEngine.evidence.personal.reconciledIdentityByExerciseId.get(invalidId);
  assert.equal(invalidIdentity.invalid, true, "contradictory trusted aliases must reconcile to one invalid identity");
  assert.match(invalidIdentity.invalidReason, /conflicting trusted custom research identities/i);
  assert.throws(
    () => invalidIdentityEngine.scoreExercise(invalidId, "chest"),
    /conflicting trusted custom research identities/i,
    "scoring must reject the reconciled invalid identity"
  );

  const ordinary = invalidIdentityEngine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: progressionHistory(),
    createdAt
  });
  assert.throws(
    () => invalidIdentityEngine.applyManualOverride(ordinary, { exerciseId: invalidId }, {
      allowedExerciseIds: [invalidId],
      availableEquipment: ["cable"],
      createdAt: "2026-07-12T12:22:10.000Z"
    }),
    /conflicting trusted custom research identities/i,
    "ordinary replacement must preserve and reject the engine's invalid identity state"
  );

  const painful = invalidIdentityEngine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: progressionHistory(),
    readiness: { pain: true, affectedMuscle: "chest" },
    createdAt
  });
  assert.throws(
    () => invalidIdentityEngine.applyManualOverride(painful, {
      exerciseId: invalidId,
      researchExerciseId: "ex_dumbbell_bench_press",
      painFreeConfirmed: true
    }, {
      allowedSafetySubstituteIds: [invalidId],
      availableEquipment: ["cable"],
      createdAt: "2026-07-12T12:22:20.000Z"
    }),
    /conflicting trusted custom research identities/i,
    "hard-safety replacement must reject the same preserved invalid identity and reason"
  );

  const unmapped = invalidIdentityEngine.applyManualOverride(ordinary, { exerciseId: unmappedId }, {
    allowedExerciseIds: [unmappedId],
    availableEquipment: ["cable"],
    createdAt: "2026-07-12T12:22:30.000Z"
  });
  assert.equal(unmapped.finalPrescription.exerciseId, unmappedId);
  assert.equal(unmapped.finalPrescription.researchExerciseId, null, "a genuinely unmapped valid custom identity remains an auditable ordinary replacement");
  assert.doesNotThrow(() => deserializeRecommendationSnapshot(unmapped));
});

test("public canonical IDs quarantine same-ID personal identity and equipment metadata", () => {
  const canonicalId = "ex_dumbbell_shrug";
  const canonicalScores = [{
    exercise_id: canonicalId,
    exercise_name: "Dumbbell Bench Press",
    equipment: "cable",
    comparable_session_count: 12,
    observation_span_days: 180,
    data_confidence_score: 0.95
  }, {
    exercise_id: canonicalId,
    exercise_name: "Machine Chest Press",
    equipment: "machine",
    comparable_session_count: 12,
    observation_span_days: 180,
    data_confidence_score: 0.95
  }];
  const canonicalMuscleScores = [{
    exercise_id: canonicalId,
    exercise_name: "Dumbbell Bench Press",
    muscle_group: "traps",
    muscle_role: "primary",
    contribution_weight: 1,
    research_muscle_group_id: "mg_traps_upper"
  }];
  const canonicalEngine = (reverse = false) => createPrescriptionEngine({
    personalData: {
      exerciseScores: reverse ? [...canonicalScores].reverse() : canonicalScores,
      exerciseMuscleScores: reverse ? [...canonicalMuscleScores].reverse() : canonicalMuscleScores,
      metadata: { methodology_version: "canonical-precedence-quarantine-test/1.0.0" }
    },
    researchData: publicResearchData()
  });
  const forward = canonicalEngine();
  const reverse = canonicalEngine(true);
  for (const candidateEngine of [forward, reverse]) {
    const identity = candidateEngine.evidence.personal.reconciledIdentityByExerciseId.get(canonicalId);
    assert.equal(identity.invalid, undefined, "a public canonical ID cannot be invalidated by same-ID personal aliases");
    assert.equal(identity.researchExerciseId, canonicalId);
    assert.equal(identity.researchIdentitySource, "canonical_id");
    assert.equal(identity.canonicalMetadataQuarantined, true);
    assert.equal(identity.source.exercise_name, "Dumbbell Shrug");
    assert.equal(identity.source.equipment, "dumbbell");

    const ranked = candidateEngine.rankExercisePool("traps", { availableEquipment: ["dumbbell"], maxCandidates: 10 });
    const canonicalCandidate = ranked.candidates.find((candidate) => candidate.exerciseId === canonicalId);
    assert.ok(canonicalCandidate, "canonical dumbbell shrug remains rankable with its public equipment");
    assert.equal(canonicalCandidate.exerciseName, "Dumbbell Shrug");
    assert.deepEqual(canonicalCandidate.equipmentRequirements, [["dumbbell"]]);
    assert.equal(candidateEngine.scoreExercise(canonicalId, "traps").researchExerciseId, canonicalId);
    const cableOnly = candidateEngine.rankExercisePool("traps", { availableEquipment: ["cable"], maxCandidates: 10 });
    assert.ok(cableOnly.excludedCandidates.some((candidate) => candidate.exerciseId === canonicalId), "personal cable metadata cannot make a canonical dumbbell exercise cable-compatible");
  }
  assert.deepEqual(
    forward.evidence.personal.reconciledIdentityByExerciseId.get(canonicalId).source,
    reverse.evidence.personal.reconciledIdentityByExerciseId.get(canonicalId).source,
    "canonical quarantine must be invariant to personal record order"
  );

  const ordinary = forward.prescribeExercise({ exerciseId: "ex_barbell_shrug", muscleGroupId: "traps", history: progressionHistory(), createdAt });
  const callerDuplicate = [{
    personalExerciseId: canonicalId,
    researchExerciseId: canonicalId,
    exerciseName: "Caller cable shrug",
    equipment: "cable"
  }];
  const ordinaryReplacement = forward.applyManualOverride(ordinary, { exerciseId: canonicalId }, {
    allowedExerciseIds: [canonicalId],
    availableEquipment: ["dumbbell"],
    exerciseCatalog: callerDuplicate,
    createdAt: "2026-07-12T12:22:40.000Z"
  });
  assert.equal(ordinaryReplacement.finalPrescription.exerciseId, canonicalId);
  assert.equal(ordinaryReplacement.finalPrescription.researchExerciseId, canonicalId);
  assert.throws(
    () => forward.applyManualOverride(ordinary, { exerciseId: canonicalId }, {
      allowedExerciseIds: [canonicalId],
      availableEquipment: ["cable"],
      exerciseCatalog: callerDuplicate
    }),
    /equipment|dumbbell|compatible/i,
    "caller or personal duplicates cannot replace canonical equipment"
  );

  const painful = forward.prescribeExercise({
    exerciseId: "ex_barbell_shrug",
    muscleGroupId: "traps",
    history: progressionHistory(),
    readiness: { pain: true, affectedMuscle: "traps" },
    createdAt
  });
  const safetyReplacement = forward.applyManualOverride(painful, {
    exerciseId: canonicalId,
    researchExerciseId: canonicalId,
    painFreeConfirmed: true
  }, {
    allowedSafetySubstituteIds: [canonicalId],
    availableEquipment: ["dumbbell"],
    exerciseCatalog: callerDuplicate,
    createdAt: "2026-07-12T12:22:50.000Z"
  });
  assert.equal(safetyReplacement.finalPrescription.safetyRestriction.status, "resolved_by_confirmed_substitute");

  const validCanonicalEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: [{ exercise_id: canonicalId, exercise_name: "Dumbbell Shrug", equipment: "cable" }],
      exerciseMuscleScores: canonicalMuscleScores,
      metadata: { methodology_version: "valid-canonical-augmentation-test/1.0.0" }
    },
    researchData: publicResearchData()
  });
  const validCanonicalIdentity = validCanonicalEngine.evidence.personal.reconciledIdentityByExerciseId.get(canonicalId);
  assert.equal(validCanonicalIdentity.source.equipment, "dumbbell", "even non-conflicting same-ID personal metadata cannot override canonical equipment");

  const invalidCustomId = "custom_conflicting_shrug_aliases";
  const validCustomId = "custom_cable_shrug";
  const distinctCustomEngine = createPrescriptionEngine({
    personalData: {
      exerciseScores: [{ exercise_id: invalidCustomId, exercise_name: "Dumbbell Bench Press", equipment: "cable" }, {
        exercise_id: validCustomId,
        exercise_name: "My Cable Shrug",
        research_exercise_id: canonicalId,
        equipment: "cable"
      }],
      exerciseMuscleScores: [{
        exercise_id: invalidCustomId,
        exercise_name: "Machine Chest Press",
        muscle_group: "traps",
        muscle_role: "primary",
        contribution_weight: 1,
        research_muscle_group_id: "mg_traps_upper"
      }, {
        exercise_id: validCustomId,
        exercise_name: "My Cable Shrug",
        muscle_group: "traps",
        muscle_role: "primary",
        contribution_weight: 1,
        research_muscle_group_id: "mg_traps_upper"
      }],
      metadata: { methodology_version: "canonical-precedence-distinct-custom-control/1.0.0" }
    },
    researchData: publicResearchData()
  });
  const distinctOrdinary = distinctCustomEngine.prescribeExercise({ exerciseId: "ex_barbell_shrug", muscleGroupId: "traps", history: progressionHistory(), createdAt });
  assert.throws(
    () => distinctCustomEngine.applyManualOverride(distinctOrdinary, { exerciseId: invalidCustomId }, { allowedExerciseIds: [invalidCustomId], availableEquipment: ["cable"] }),
    /conflicting trusted custom research identities/i,
    "canonical precedence must not make a distinct invalid custom ID valid"
  );
  const validCustomReplacement = distinctCustomEngine.applyManualOverride(distinctOrdinary, { exerciseId: validCustomId }, {
    allowedExerciseIds: [validCustomId],
    availableEquipment: ["cable"],
    createdAt: "2026-07-12T12:23:00.000Z"
  });
  assert.equal(validCustomReplacement.finalPrescription.exerciseId, validCustomId, "distinct valid customs retain custom-first equipment semantics");
  assert.equal(validCustomReplacement.finalPrescription.researchExerciseId, canonicalId);
});

test("recommendation ranking has no canonical-first equipment expressions outside its resolver", () => {
  const source = fs.readFileSync(path.join(ROOT, "prescription-engine.js"), "utf8");
  assert.doesNotMatch(source, /equipmentCompatible\(\s*candidate\.researchExercise\s*\|\|/);
  assert.doesNotMatch(source, /equipmentRequirementOptions\(\s*candidate\.researchExercise\s*\|\|/);
  const diversity = source.match(/function diversitySignature\([\s\S]*?\n\s*function diversityPenalty\(/)?.[0] || "";
  assert.match(diversity, /candidateEquipmentProfile\(candidate\)/);
  assert.doesNotMatch(diversity, /equipmentFamily\(exercise\.equipment\)|equipmentRequirementOptions\(exercise\)/);
  const mergedCandidates = source.match(/function buildMergedExerciseCandidates\([\s\S]*?\n\s*function fatigueCostScore\(/)?.[0] || "";
  const resolver = source.match(/function resolveExerciseCandidate\([\s\S]*?\n\s*function prescribedLoadFromHistory\(/)?.[0] || "";
  const substitutions = source.match(/function preferredReplacementFor\([\s\S]*?\n\s*function recommendationReasons\(/)?.[0] || "";
  assert.doesNotMatch(mergedCandidates, /firstPresent\([\s\S]{0,180}crosswalkByPersonalId/);
  assert.doesNotMatch(resolver, /crosswalkByPersonalId/);
  assert.doesNotMatch(substitutions, /personalIdsByResearchId/);
  const prescriptionEngineClass = source.match(/class PrescriptionEngine[\s\S]*?\n\s*function createPrescriptionEngine\(/)?.[0] || "";
  assert.match(prescriptionEngineClass, /trustedCustomIdentityProfiles/);
  assert.equal((prescriptionEngineClass.match(/trustedResearchCatalog:/g) || []).length, 1, "the class has one audited trusted-catalog rebuild path");
  assert.equal((prescriptionEngineClass.match(/trustedCustomIdentityProfiles:/g) || []).length, 1, "every class catalog rebuild must carry reconciled profiles directly");
  assert.doesNotMatch(prescriptionEngineClass, /const personalCatalog/);
  assert.doesNotMatch(prescriptionEngineClass, /reconciledIdentity\?\.invalid\s*\?\s*null/);
  const profileHandoff = source.match(/const addReconciledCustomIdentityProfile[\s\S]*?asArray\(options\.trustedCustomIdentityProfiles\)/)?.[0] || "";
  assert.match(profileHandoff, /if \(canonical\)/);
  assert.doesNotMatch(profileHandoff, /if \(!profile\.invalid && canonical\)/);
});

test("restricted candidate pools and substitutes are deterministic and equipment-safe", () => {
  const options = { availableEquipment: ["dumbbell"], maxCandidates: 5, generatedAt: createdAt };
  const first = rankExercisePool(evidence, "biceps", options);
  const second = rankExercisePool(evidence, "biceps", options);
  assert.deepEqual(first.candidates.map((item) => item.exerciseId), second.candidates.map((item) => item.exerciseId));
  assert.equal(new Set(first.candidates.map((item) => item.exerciseId)).size, first.candidates.length, "candidate IDs must be unique");
  const leaks = [];
  for (const candidate of first.candidates) {
    const exercise = evidence.research.exerciseById.get(candidate.researchExerciseId);
    assert.equal(equipmentCompatible(exercise, options.availableEquipment).eligible, true, `${candidate.exerciseId} violates the equipment constraint`);
    if (!candidate.preferredReplacementExerciseId) continue;
    const replacement = evidence.research.exerciseById.get(candidate.preferredReplacementExerciseId);
    if (!replacement || !equipmentCompatible(replacement, options.availableEquipment).eligible) {
      leaks.push(`${candidate.exerciseId} -> ${candidate.preferredReplacementExerciseId}`);
    }
  }
  assert.deepEqual(leaks, [], `equipment-incompatible substitutes leaked: ${leaks.join(", ")}`);
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
      console.error(String(error && error.stack || error));
    }
  }
  console.log(`\nRecommendation regression harness: ${passed}/${tests.length} cases passed.`);
  if (failures.length) {
    console.error(`${failures.length} accepted defect regression(s) remain reproducible.`);
    process.exitCode = 1;
  }
})();
