"use strict";

const assert = require("node:assert/strict");
const {
  STALENESS,
  applyManualOverride,
  assessExerciseStaleness,
  createPrescriptionEngine,
  determineProgressionDecision,
  equipmentCompatible,
  evaluateReadiness,
  normalizeEvidenceBundle,
  rankExercisePool
} = require("../prescription-engine");

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

function collectFailures(checks) {
  const failures = [];
  for (const [label, check] of checks) {
    try { check(); }
    catch (error) { failures.push(`${label}: ${error.message}`); }
  }
  if (failures.length) throw new Error(failures.join("\n"));
}

function regressionHistory() {
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
    pain: index >= 2,
    set_repetitions: "[8,7,6]",
    set_loads: "[100,100,100]"
  }));
}

test("illness and pain have hard readiness precedence", () => {
  const result = evaluateReadiness({ illness: true, pain: true, affectedMuscle: "Chest" });
  assert.notEqual(result.state, "normal", `illness/pain returned ${JSON.stringify(result)}`);
  assert.ok(result.signalCount > 0, `illness/pain emitted no safety signal: ${JSON.stringify(result)}`);
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
  const safetyTypes = new Set(["exercise_deload", "muscle_group_deload", "full_program_deload", "substitute", "rotate_exercise"]);
  collectFailures([
    ["deload lock", () => {
      const result = applyManualOverride(snapshot, { deloadRecommendation: false }, { createdAt: "2026-07-12T12:02:00.000Z" });
      assert.ok(safetyTypes.has(result.finalPrescription.recommendationType), `safety became ${result.finalPrescription.recommendationType}`);
    }],
    ["rotation lock", () => {
      const result = applyManualOverride(snapshot, { exerciseRotation: false }, { createdAt: "2026-07-12T12:03:00.000Z" });
      assert.ok(safetyTypes.has(result.finalPrescription.recommendationType), `safety became ${result.finalPrescription.recommendationType}`);
    }]
  ]);
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
