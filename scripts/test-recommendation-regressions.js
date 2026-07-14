"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

test("runtime snapshot validation rejects missing and unknown schema versions", () => {
  const snapshot = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", createdAt });
  const missing = structuredClone(snapshot);
  delete missing.schemaVersion;
  assert.throws(() => validateSnapshot(missing), /schemaVersion/i);
  ["1.0.0", "999.0.0"].forEach((schemaVersion) => {
    const unsupported = { ...structuredClone(snapshot), schemaVersion };
    assert.throws(() => validateSnapshot(unsupported), /unsupported.*schemaVersion|schemaVersion.*unsupported/i, `${schemaVersion} must fail closed`);
  });
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
    history: [{
      workout_date: "2026-07-10",
      progression_status: "held",
      set_repetitions: "[12,12,12]",
      set_loads: "[100,100,100]",
      set_rpes: "[8,8,8]",
      backoffReps: [12, 12],
      resistanceType: "assisted_bodyweight"
    }],
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

test("manual overrides cannot disable hard deload or rotation safety", () => {
  const snapshot = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: regressionHistory(),
    createdAt
  });
  assert.equal(snapshot.finalPrescription.recommendationType, "exercise_deload", "fixture must start safety-restricted");
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
  const snapshot = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history: progressionHistory(),
    createdAt
  });
  assert.equal(snapshot.finalPrescription.workingSets.target, 4, "fixture must begin with four working sets");
  const fiveSets = engine.applyManualOverride(snapshot, { setCount: 5 }, {
    overrideId: "override_four_to_five_sets",
    createdAt: "2026-07-12T12:12:00.000Z",
    reason: "Use five working sets"
  });
  const laterRepOverride = engine.applyManualOverride(fiveSets, { repRange: { min: 6, max: 9 } }, {
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
  const mixed = recalculateHistoricalMuscleVolume(evidenceWithDeadliftVersions((index) => index % 2 ? "2.2.0" : "2.1.0"), logged);
  assert.equal(mixed.taxonomyVersion, "mixed", "multiple relationship taxonomy versions must be reported explicitly");
  const missing = recalculateHistoricalMuscleVolume(evidenceWithDeadliftVersions(() => null), logged);
  assert.equal(missing.taxonomyVersion, "unknown", "entirely missing relationship taxonomy provenance must fail closed");
  const partiallyMissing = recalculateHistoricalMuscleVolume(evidenceWithDeadliftVersions((index) => index === 0 ? "2.1.0" : null), logged);
  assert.equal(partiallyMissing.taxonomyVersion, "mixed", "partial relationship taxonomy provenance must fail closed as mixed");
  assert.equal(recalculateHistoricalMuscleVolume(evidence, []).taxonomyVersion, "unknown", "an empty recalculation has no relationship taxonomy provenance");
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
  const source = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
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
