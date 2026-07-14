"use strict";

const assert = require("node:assert/strict");
const {
  createPrescriptionEngine,
  normalizeEvidenceBundle
} = require("../prescription-engine");

const CREATED_AT = "2026-07-13T12:34:56.000Z";
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

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

function engineWithCustomBenchAlias() {
  return createPrescriptionEngine({
    personalData: {
      exerciseScores: [{
        exercise_id: "custom_press",
        exercise_name: "My Competition Press",
        research_exercise_id: "ex_barbell_bench_press",
        equipment: "barbell_and_bench",
        comparable_session_count: 8,
        session_count: 8,
        observation_span_days: 120,
        data_confidence_score: 0.8
      }],
      exerciseMuscleScores: [{
        exercise_id: "custom_press",
        exercise_name: "My Competition Press",
        muscle_group: "chest",
        research_muscle_group_id: "mg_chest_sternal",
        muscle_role: "primary",
        contribution_weight: 1
      }],
      metadata: { methodology_version: "public-core-constraint-fixture/1.0.0" }
    },
    researchData: publicResearchData()
  });
}

const emptyEvidence = normalizeEvidenceBundle({ personalData: {}, researchData: publicResearchData() });
const engine = createPrescriptionEngine(emptyEvidence);

function historyRow(exerciseId, date, load, reps, rpe) {
  return {
    exercise_id: exerciseId,
    workout_date: date,
    progression_status: "held",
    comparison_performance_value: load,
    set_repetitions: JSON.stringify([reps, reps, reps]),
    set_loads: JSON.stringify([load, load, load]),
    set_rpes: JSON.stringify([rpe, rpe, rpe]),
    average_rpe: rpe,
    completedSetRatio: 1
  };
}

test("1 exclusions canonicalize custom IDs, research IDs, and research aliases across ranking and planning", () => {
  const customEngine = engineWithCustomBenchAlias();
  for (const excluded of ["custom_press", "ex_barbell_bench_press", "bench press"]) {
    const pool = customEngine.rankExercisePool("chest", {
      excludedExerciseIds: [excluded],
      availableEquipment: ["all"],
      generatedAt: CREATED_AT,
      maxCandidates: 5
    });
    assert.ok(pool.exclusionResolution.excludedResearchExerciseIds.includes("ex_barbell_bench_press"), `${excluded} did not resolve to the canonical bench identity`);
    assert.ok(!pool.candidates.some((candidate) => candidate.researchExerciseId === "ex_barbell_bench_press"), `${excluded} leaked through ranking`);
    assert.ok(!pool.candidates.some((candidate) => candidate.preferredReplacementExerciseId === "custom_press" || candidate.preferredReplacementExerciseId === "ex_barbell_bench_press"), `${excluded} leaked through substitution`);
    assert.ok(pool.excludedCandidates.some((candidate) => candidate.reasonCode === "user_exclusion" && candidate.canonicalResearchExerciseId === "ex_barbell_bench_press"), `${excluded} lacks reportable exclusion provenance`);
  }
  const plan = customEngine.createMesocycle({
    trainingDays: 2,
    includedMuscleGroupIds: ["chest"],
    excludedExerciseIds: ["bench press"],
    availableEquipment: ["all"],
    createdAt: CREATED_AT
  });
  assert.ok(!plan.selectedPortfolio.some((candidate) => candidate.researchExerciseId === "ex_barbell_bench_press"));
  assert.ok(plan.exclusionResolution.excludedResearchExerciseIds.includes("ex_barbell_bench_press"));

  const deduplicated = customEngine.rankExercisePool("chest", {
    excludedExerciseIds: [" custom_press ", "custom_press", "bench press", "ex_barbell_bench_press"],
    availableEquipment: ["all"],
    generatedAt: CREATED_AT,
    maxCandidates: 5
  }).exclusionResolution;
  assert.deepEqual(deduplicated.requestedValues, ["custom_press", "bench press", "ex_barbell_bench_press"], "exact trimmed duplicates were not removed in first-occurrence order");
  assert.deepEqual(deduplicated.resolutions.map((row) => row.resolutionType), ["trusted_custom_id", "research_alias", "canonical_research_id"], "distinct identities resolving to one canonical exercise lost provenance");
  assert.deepEqual(deduplicated.excludedResearchExerciseIds, ["ex_barbell_bench_press"]);
  assert.throws(
    () => customEngine.rankExercisePool("chest", { excludedExerciseIds: ["bench press", "bench press", null], generatedAt: CREATED_AT }),
    /non-empty string identities/i,
    "a duplicate valid identity hid a later malformed exclusion"
  );
});

test("2 explicit session target and maximum are validated and enforced as hard construction caps", () => {
  assert.throws(() => engine.createMesocycle({
    trainingDays: 1,
    includedMuscleGroupIds: ["chest"],
    sessionDurationTargetMinutes: 30,
    sessionDurationMaximumMinutes: 20,
    createdAt: CREATED_AT
  }), /duration.*target|target.*maximum/i);
  const plan = engine.createMesocycle({
    trainingDays: 1,
    includedMuscleGroupIds: ["chest", "upper_back", "quads"],
    availableEquipment: ["all"],
    sessionDurationTargetMinutes: 4,
    sessionDurationMaximumMinutes: 5,
    createdAt: CREATED_AT
  });
  assert.ok(plan.sessions.every((session) => session.estimatedDurationMinutes <= 5), JSON.stringify(plan.sessions.map((session) => session.estimatedDurationMinutes)));
  assert.equal(plan.constraints.sessionDurationTargetMinutes, 4);
  assert.equal(plan.constraints.sessionDurationMaximumMinutes, 5);
  assert.ok(plan.programReview.warnings.some((warning) => warning.type === "schedule_capacity" && /duration/i.test(warning.why)), "impossible work was not reported as a duration capacity result");
  const shortened = engine.createMesocycle({
    trainingDays: 1,
    includedMuscleGroupIds: ["chest", "upper_back", "quads"],
    availableEquipment: ["all"],
    sessionDurationTargetMinutes: 15,
    sessionDurationMaximumMinutes: 20,
    createdAt: CREATED_AT
  });
  assert.ok(shortened.sessions[0].exercises.length > 0, "coherent shortening discarded every exercise");
  assert.equal(shortened.sessions[0].exercises[0].intendedRole, "primary_progression_lift", "coherent shortening discarded priority work before lower-priority work");
  assert.ok(shortened.sessions[0].estimatedDurationMinutes <= 20);
});

test("3 omitted scope defaults while explicit empty, blank, and malformed scope fail closed", () => {
  assert.ok(engine.createMesocycle({ trainingDays: 2, createdAt: CREATED_AT }).includedMuscleGroupIds.length > 0, "omitted scope should use the documented population default");
  for (const scope of [[], [""], ["   "], {}, ""]) {
    assert.throws(
      () => engine.createMesocycle({ trainingDays: 2, includedMuscleGroupIds: scope, createdAt: CREATED_AT }),
      /scope|includedMuscleGroupIds/i,
      `explicit scope ${JSON.stringify(scope)} must fail closed`
    );
  }
  assert.throws(() => engine.createMesocycle({ trainingDays: 2, includedMuscleGroupIds: ["not_a_muscle"], createdAt: CREATED_AT }), /scope|muscle/i);
});

test("4 trainingDays is validated once as a supported integer", () => {
  for (const trainingDays of [0, -2, 1.5, 8, 100, "three", null]) {
    assert.throws(() => engine.createMesocycle({ trainingDays, createdAt: CREATED_AT }), /trainingDays|training days/i, `${JSON.stringify(trainingDays)} was silently canonicalized`);
  }
  const plan = engine.createMesocycle({ trainingDays: 3, includedMuscleGroupIds: ["chest"], createdAt: CREATED_AT });
  assert.equal(plan.trainingDays, 3);
  assert.equal(plan.constraints.trainingDays, 3);
  assert.equal(plan.sessions.length, 3);
});

test("5 explicit history is filtered to selected exercise and research identity", () => {
  const bench = historyRow("ex_barbell_bench_press", "2026-07-01", 100, 7, 9.5);
  const unrelated = [
    historyRow("ex_back_squat", "2026-07-03", 900, 12, 7),
    historyRow("ex_back_squat", "2026-07-05", 950, 12, 7),
    historyRow("ex_back_squat", "2026-07-07", 1000, 12, 7)
  ];
  const selectedOnly = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: [bench], createdAt: CREATED_AT });
  const mixed = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", history: [bench, ...unrelated], createdAt: CREATED_AT });
  assert.equal(mixed.finalPrescription.progressionAction, selectedOnly.finalPrescription.progressionAction);
  assert.deepEqual(mixed.finalPrescription.prescribedLoad, selectedOnly.finalPrescription.prescribedLoad);
  assert.equal(mixed.finalPrescription.staleness.metrics.exposureCount, selectedOnly.finalPrescription.staleness.metrics.exposureCount);
  assert.equal(mixed.basePrescription.historyResolution.matchedRowCount, 1);
  assert.equal(mixed.basePrescription.historyResolution.ignoredUnrelatedRowCount, 3);
});

test("6 direct prescription enforces explicit equipment restrictions", () => {
  assert.throws(() => engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    availableEquipment: ["dumbbell"],
    createdAt: CREATED_AT
  }), /equipment|compatible/i);
  assert.doesNotThrow(() => engine.prescribeExercise({
    exerciseId: "ex_dumbbell_bench_press",
    muscleGroupId: "chest",
    availableEquipment: ["dumbbell", "bench"],
    createdAt: CREATED_AT
  }));
});

test("7 direct prescription requires a positive taxonomy relationship to the requested target", () => {
  assert.throws(() => engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "calves",
    createdAt: CREATED_AT
  }), /taxonomy|target relationship|muscle/i);
  assert.doesNotThrow(() => engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    createdAt: CREATED_AT
  }));
});

test("8 workout assembly deterministically deduplicates canonical identities and recommendation slots", () => {
  const workout = engine.prescribeWorkout({
    createdAt: CREATED_AT,
    exercises: [
      { exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", recommendationSlotId: "press_slot" },
      { exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", recommendationSlotId: "duplicate_canonical_slot" },
      { exerciseId: "ex_dumbbell_bench_press", muscleGroupId: "chest", recommendationSlotId: "press_slot" },
      { exerciseId: "ex_seated_cable_row", muscleGroupId: "upper_back", recommendationSlotId: "row_slot" }
    ]
  });
  assert.deepEqual(workout.recommendations.map((item) => item.exerciseId), ["ex_barbell_bench_press", "ex_seated_cable_row"]);
  assert.equal(workout.deduplication.removedCount, 2);
  assert.deepEqual(workout.deduplication.removed.map((item) => item.reason), ["duplicate_canonical_exercise", "duplicate_recommendation_slot"]);
});

test("9 absent personal evidence is disclosed as a population research default with missing data", () => {
  const snapshot = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", createdAt: CREATED_AT });
  assert.equal(snapshot.basePrescription.programmingContext.personalization.personalEvidenceAvailable, false);
  assert.match(snapshot.finalPrescription.userExplanation, /population|research default/i);
  assert.match(snapshot.finalPrescription.userExplanation, /missing|not available|no comparable personal/i);
  assert.doesNotMatch(snapshot.finalPrescription.userExplanation, /personal productive range|your productive range/i);
  assert.doesNotMatch(snapshot.finalPrescription.volume.reason, /blends? the personal/i);
});

test("10 caller timestamp propagates to every persisted nested candidate pool", () => {
  const plan = engine.createMesocycle({
    trainingDays: 2,
    includedMuscleGroupIds: ["chest", "upper_back"],
    createdAt: CREATED_AT
  });
  assert.equal(plan.createdAt, CREATED_AT);
  assert.ok(Object.values(plan.pools).length > 0);
  assert.ok(Object.values(plan.pools).every((pool) => pool.generatedAt === CREATED_AT), JSON.stringify(Object.values(plan.pools).map((pool) => pool.generatedAt)));
  const ranked = engine.rankExercisePool("chest", { generatedAt: CREATED_AT });
  assert.equal(ranked.generatedAt, CREATED_AT);
});

test("11 goal is validated, persisted, explained, and directionally changes programming", () => {
  const strength = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", trainingGoal: "strength", createdAt: CREATED_AT });
  const endurance = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", trainingGoal: "muscular_endurance", createdAt: CREATED_AT });
  assert.equal(strength.basePrescription.programmingContext.goal.value, "strength");
  assert.equal(strength.basePrescription.programmingContext.profileVersion, "training-profile/1.1.0");
  assert.equal(strength.basePrescription.programmingContext.goal.authority, "product_policy");
  assert.match(strength.finalPrescription.userExplanation, /strength/i);
  assert.match(strength.finalPrescription.userExplanation, /product policy|directional/i);
  assert.ok(strength.finalPrescription.repRange.target < endurance.finalPrescription.repRange.target, "goal did not directionally change repetition targets");
  assert.ok(strength.finalPrescription.restSeconds.target > endurance.finalPrescription.restSeconds.target, "goal did not directionally change recovery time");
  const legacyAlias = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", goal: "endurance", legacyGoalSemantics: "training_goal", createdAt: CREATED_AT });
  assert.equal(legacyAlias.basePrescription.programmingContext.goal.requestedValue, "endurance");
  assert.equal(legacyAlias.basePrescription.programmingContext.goal.resolvedValue, "muscular_endurance");
  const nutritionOnly = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", nutritionPhase: "deficit", createdAt: CREATED_AT });
  assert.equal(nutritionOnly.basePrescription.programmingContext.goal.resolvedValue, "general_fitness", "nutrition phase masqueraded as a training goal");
  assert.ok(nutritionOnly.basePrescription.programmingContext.missingInputs.includes("trainingGoal"));
  const strengthAccessory = engine.prescribeExercise({ exerciseId: "ex_cable_curl", muscleGroupId: "biceps", trainingGoal: "strength", createdAt: CREATED_AT });
  const hypertrophyAccessory = engine.prescribeExercise({ exerciseId: "ex_cable_curl", muscleGroupId: "biceps", trainingGoal: "hypertrophy", createdAt: CREATED_AT });
  assert.ok(strengthAccessory.finalPrescription.repRange.min >= hypertrophyAccessory.finalPrescription.repRange.min, "strength policy incorrectly forced primary-lift lower reps onto a non-primary accessory");
  assert.ok(strengthAccessory.finalPrescription.repRange.target > 8, "strength accessory was incorrectly forced into the primary 3-8 policy range");
  for (const unsupported of ["powerlifting", "weight_loss", "", 7]) {
    assert.throws(() => engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", trainingGoal: unsupported, createdAt: CREATED_AT }), /goal/i);
  }
  assert.throws(() => engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", goal: "strength", createdAt: CREATED_AT }), /legacy.*goal|trainingGoal/i, "overloaded legacy goal lacked provenance validation");
  assert.throws(() => engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", trainingGoal: "strength", goal: "endurance", legacyGoalSemantics: "training_goal", createdAt: CREATED_AT }), /conflicting.*goal/i);
  const matchingAlias = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", trainingGoal: "strength", goal: "strength", legacyGoalSemantics: "training_goal", createdAt: CREATED_AT });
  assert.equal(matchingAlias.basePrescription.programmingContext.goal.source, "canonical_with_matching_legacy_alias");
  assert.throws(() => engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", goal: "cut", legacyGoalSemantics: "training_goal", nutritionPhase: "deficit", createdAt: CREATED_AT }), /goal/i, "nutrition phase was accepted as a training goal");
});

test("12 experience is validated, persisted, explained, and changes complexity conservatively", () => {
  const novice = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", trainingGoal: "hypertrophy", experienceLevel: "novice", createdAt: CREATED_AT });
  const advanced = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", trainingGoal: "hypertrophy", experienceLevel: "advanced", createdAt: CREATED_AT });
  assert.equal(novice.basePrescription.programmingContext.experience.value, "novice");
  assert.equal(novice.basePrescription.programmingContext.experience.authority, "product_policy");
  assert.match(novice.finalPrescription.userExplanation, /novice/i);
  assert.equal(novice.finalPrescription.setStructure, "straight_sets", "novice default should favor a simpler stable structure");
  assert.equal(advanced.finalPrescription.setStructure, novice.finalPrescription.setStructure, "advanced status alone changed structure without preference or productive history");
  assert.equal(advanced.finalPrescription.workingSets.target, novice.finalPrescription.workingSets.target, "advanced status must not automatically add dose");
  assert.deepEqual(advanced.finalPrescription.repRange, novice.finalPrescription.repRange, "advanced status alone changed repetitions");
  assert.deepEqual(advanced.finalPrescription.restSeconds, novice.finalPrescription.restSeconds, "advanced status alone changed rest");
  assert.ok(novice.basePrescription.programmingContext.experience.progressionConfirmationExposures >= 2);
  const preferredComplexity = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", trainingGoal: "hypertrophy", experienceLevel: "advanced", setStructurePreference: "advanced_if_supported", createdAt: CREATED_AT });
  assert.equal(preferredComplexity.basePrescription.programmingContext.experience.complexitySupportedBy, "explicit_preference");
  assert.equal(preferredComplexity.basePrescription.programmingContext.experience.complexStructureAllowed, true);
  assert.notEqual(preferredComplexity.finalPrescription.setStructure, advanced.finalPrescription.setStructure, "explicit complexity preference did not permit a supported advanced structure");
  const productiveHistory = [0, 1, 2, 3].map((index) => ({
    exercise_id: "custom_press",
    workout_date: `2026-06-${String(1 + index * 7).padStart(2, "0")}`,
    progression_status: index ? "improved" : "baseline",
    progression_pct_vs_prior: index ? 2 : 0,
    comparison_performance_value: 100 + index * 3,
    best_epley_e1rm: 100 + index * 3,
    average_rpe: 8,
    recovery_strain_score: 30,
    max_set_rep_loss_pct: 10,
    max_set_load_reduction_pct: 12,
    plateau_duration_exposures: 0,
    regression_duration_exposures: 0,
    pain: false,
    set_repetitions: "[8,8,8]",
    set_loads: "[100,100,100]",
    top_set_count: 1,
    back_off_set_count: 2,
    straight_working_set_count: 0,
    backoff_performance_value: 90 + index * 3
  }));
  const productive = engineWithCustomBenchAlias().prescribeExercise({ exerciseId: "custom_press", muscleGroupId: "chest", trainingGoal: "hypertrophy", experienceLevel: "advanced", history: productiveHistory, createdAt: CREATED_AT });
  assert.equal(productive.basePrescription.staleness.classification, "productive");
  assert.equal(productive.basePrescription.programmingContext.experience.complexitySupportedBy, "productive_history");
  assert.equal(productive.basePrescription.programmingContext.experience.complexStructureAllowed, true);
  const missing = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", trainingGoal: "hypertrophy", createdAt: CREATED_AT });
  assert.equal(missing.basePrescription.programmingContext.experience.resolvedValue, "novice_safe_default");
  assert.equal(missing.basePrescription.programmingContext.experience.requestedValue, null);
  assert.ok(missing.basePrescription.programmingContext.missingInputs.includes("experienceLevel"));
  assert.doesNotMatch(missing.finalPrescription.userExplanation, /you are (a )?novice/i, "missing experience was presented as a known user fact");
  for (const unsupported of ["expert", "elite", "", 4]) {
    assert.throws(() => engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", experienceLevel: unsupported, createdAt: CREATED_AT }), /experience/i);
  }
  assert.throws(() => engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", experience: "advanced", createdAt: CREATED_AT }), /legacy.*experience|experienceLevel/i);
  assert.throws(() => engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", experienceLevel: "novice", experience: "advanced", legacyExperienceSemantics: "training_experience", createdAt: CREATED_AT }), /conflicting.*experience/i);
  const legacy = engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", experience: "advanced", legacyExperienceSemantics: "training_experience", createdAt: CREATED_AT });
  assert.equal(legacy.basePrescription.programmingContext.experience.inputField, "experience");
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
  console.log(`\nRecommendation core constraints: ${passed}/${tests.length} groups passed (seed 0x5eedc0de).`);
  if (failures.length) {
    console.error(`${failures.length} stable fuzz group(s) remain reproducible.`);
    process.exitCode = 1;
  }
})();
