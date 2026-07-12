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
  equipmentCompatible,
  evaluateReadiness,
  normalizeEvidenceBundle,
  rankExercisePool,
  readinessAdjustmentFor,
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
