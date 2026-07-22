"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  ENGINE_VERSION,
  createPrescriptionEngine,
  deserializeRecommendationSnapshot,
  refreshRecommendationChecksum,
  serializeRecommendationSnapshot
} = require("../prescription-engine");

const ROOT = path.resolve(__dirname, "..");
const CREATED_AT = "2026-07-14T12:34:56.000Z";
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function publicResearchData() {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "research_database", "exports", "json", name), "utf8"));
  return {
    exerciseDatabase: read("exercise_database.json"),
    exerciseMuscleMap: read("exercise_muscle_map.json"),
    exerciseSubstitutionMap: read("exercise_substitution_map.json"),
    muscleGroupRecommendations: read("muscle_group_recommendations.json"),
    progressionRules: read("progression_rules.json"),
    nutritionStrategies: read("nutrition_strategies.json"),
    manifest: read("manifest.json")
  };
}

function exposure(exerciseId, day, options = {}) {
  const reps = options.reps || [10, 10, 10];
  const loads = options.loads || reps.map(() => options.load || 100);
  const rpes = options.rpes || reps.map(() => options.rpe ?? 8);
  return {
    exercise_id: exerciseId,
    workout_date: `2026-07-${String(day).padStart(2, "0")}`,
    progression_status: options.status || (day === 1 ? "baseline" : "improved"),
    progression_pct_vs_prior: options.progressionPercent ?? (day === 1 ? 0 : 2),
    comparison_performance_value: options.performance || 100 + day,
    best_epley_e1rm: options.performance || 100 + day,
    average_rpe: options.rpe ?? 8,
    recovery_strain_score: options.recovery ?? 30,
    max_set_rep_loss_pct: options.repLoss ?? 0,
    max_set_load_reduction_pct: options.loadReduction ?? 0,
    plateau_duration_exposures: 0,
    regression_duration_exposures: 0,
    pain: options.pain ?? false,
    techniqueValid: options.techniqueValid ?? true,
    techniqueQuality: options.techniqueQuality || "valid",
    completedSetRatio: options.completedSetRatio ?? 1,
    completedSetCount: options.completedSetCount ?? reps.length,
    prescribedSetCount: options.prescribedSetCount ?? reps.length,
    set_repetitions: JSON.stringify(reps),
    set_loads: JSON.stringify(loads),
    set_rpes: JSON.stringify(rpes),
    top_set_count: options.topSetCount ?? 0,
    back_off_set_count: options.backoffSetCount ?? 0,
    straight_working_set_count: options.straightSetCount ?? reps.length,
    backoff_performance_value: options.backoffPerformance ?? 90 + day
  };
}

function highConfidenceEngine() {
  return createPrescriptionEngine({
    personalData: {
      exerciseScores: [{
        exercise_id: "custom_press",
        exercise_name: "Synthetic Productive Press",
        research_exercise_id: "ex_barbell_bench_press",
        equipment: "barbell_and_bench",
        progression_score: 92,
        hypertrophy_support_score: 90,
        recovery_efficiency_score: 88,
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
        exercise_id: "custom_press",
        exercise_name: "Synthetic Productive Press",
        muscle_group: "chest",
        research_muscle_group_id: "mg_chest_sternal",
        muscle_role: "primary",
        contribution_weight: 1,
        muscle_specific_effectiveness_score: 92,
        progression_score: 92,
        recovery_efficiency_score: 88
      }],
      exercisePrescriptions: [{
        exercise_id: "custom_press",
        exercise_name: "Synthetic Productive Press",
        research_exercise_id: "ex_barbell_bench_press",
        muscle_group_id: "chest",
        research_muscle_group_id: "mg_chest_sternal",
        role: "primary_progression_lift",
        recommended_sets_per_session: { min: 5, max: 5 },
        recommended_weekly_sets: { min: 10, max: 12 },
        recommended_sessions_per_week: { min: 2, max: 2 },
        recommended_rep_range: { min: 8, max: 12 },
        recommended_rpe: { min: 7.5, max: 8.5 },
        recommended_rir: { min: 1.5, max: 2.5 },
        recommended_rest_seconds: { min: 120, max: 240 },
        top_set_structure: { recommended_count: 0 },
        backoff_set_structure: { recommended_count: 0 },
        observed_best_range: { qualifying_sessions: 12 },
        highest_recoverable_range_observed: { max_sets_per_session: 5, max_weekly_hard_sets: 12 },
        confidence_level: "high",
        confidence_score: 95,
        sample_size: 12,
        evidence_summary: "Synthetic high-confidence productive fixture."
      }],
      metadata: { methodology_version: "profile-coherence-fixture/1.0.0" }
    },
    researchData: publicResearchData()
  });
}

const engine = createPrescriptionEngine({ personalData: {}, researchData: publicResearchData() });

function prescribeBench(options = {}) {
  return engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    createdAt: CREATED_AT,
    ...options
  });
}

function dose(prescription) {
  return {
    workingSets: prescription.workingSets,
    repRange: prescription.repRange,
    targetRpe: prescription.targetRpe,
    targetRir: prescription.targetRir,
    restSeconds: prescription.restSeconds,
    frequencyPerWeek: prescription.frequencyPerWeek,
    progressionMethod: prescription.progressionMethod,
    progressionAction: prescription.progressionAction
  };
}

test("nutritionPhase is canonical, explicit when absent, identity-bound, and dose-neutral without qualifying evidence", () => {
  const unspecified = prescribeBench({ trainingGoal: "general_fitness", experienceLevel: "novice" });
  assert.deepEqual(unspecified.basePrescription.programmingContext.nutritionPhase, {
    requestedValue: null,
    resolvedValue: null,
    source: "unspecified",
    authority: "product_policy",
    doseAdjustmentApplied: false,
    disclosure: unspecified.basePrescription.programmingContext.nutritionPhase.disclosure,
    scientificProvenance: unspecified.basePrescription.programmingContext.nutritionPhase.scientificProvenance
  });
  const phases = ["deficit", "maintenance", "recomposition", "surplus"].map((nutritionPhase) => prescribeBench({ trainingGoal: "general_fitness", experienceLevel: "novice", nutritionPhase }));
  phases.forEach((snapshot, index) => {
    const phase = ["deficit", "maintenance", "recomposition", "surplus"][index];
    assert.equal(snapshot.basePrescription.programmingContext.nutritionPhase.resolvedValue, phase);
    assert.equal(snapshot.basePrescription.programmingContext.nutritionPhase.source, "canonical_user_input");
    assert.equal(snapshot.basePrescription.programmingContext.nutritionPhase.doseAdjustmentApplied, false);
    assert.deepEqual(dose(snapshot.basePrescription), dose(unspecified.basePrescription), `${phase} changed dose without qualifying performance/recovery evidence`);
    assert.notEqual(snapshot.recommendationId, unspecified.recommendationId, `${phase} did not change identity/context`);
  });
  assert.match(phases[0].basePrescription.programmingContext.nutritionPhase.disclosure, /con_0026|stu_0020/i);
  assert.match(phases[0].basePrescription.programmingContext.nutritionPhase.disclosure, /no pre.?emptive|do not pre.?emptively|not.*volume cut/i);
  for (const nutritionPhase of ["cut", "bulk", "", "   ", null, 7]) {
    assert.throws(() => prescribeBench({ nutritionPhase }), /nutritionPhase|nutrition phase/i);
  }
});

test("returningAfterGap is separate from experience and deterministically establishes a baseline", () => {
  const history = [1, 5, 9].map((day) => exposure("ex_barbell_bench_press", day));
  const ordinary = prescribeBench({ trainingGoal: "strength", experienceLevel: "advanced", history });
  assert.notEqual(ordinary.finalPrescription.progressionAction, "establish_baseline");
  const returning = prescribeBench({ trainingGoal: "strength", experienceLevel: "advanced", returningAfterGap: true, history });
  assert.equal(returning.basePrescription.programmingContext.returningAfterGap.resolvedValue, true);
  assert.equal(returning.basePrescription.programmingContext.experience.resolvedValue, "advanced");
  assert.equal(returning.finalPrescription.progressionAction, "establish_baseline");
  assert.equal(returning.finalPrescription.recommendationType, "hold");
  assert.match(returning.finalPrescription.progressionRule, /return|baseline|gap/i);
  const explicitNull = prescribeBench({ returningAfterGap: null });
  assert.equal(explicitNull.basePrescription.programmingContext.returningAfterGap.resolvedValue, null);
  for (const returningAfterGap of ["true", 1, 0, {}, []]) {
    assert.throws(() => prescribeBench({ returningAfterGap }), /returningAfterGap|return.*gap/i);
  }
});

test("compound progression uses resolved experience confirmation counts without fabricated evidence", () => {
  const one = [exposure("ex_barbell_bench_press", 9)];
  const two = [exposure("ex_barbell_bench_press", 5), exposure("ex_barbell_bench_press", 9)];
  const three = [exposure("ex_barbell_bench_press", 1), exposure("ex_barbell_bench_press", 5), exposure("ex_barbell_bench_press", 9)];
  const noviceOne = prescribeBench({ trainingGoal: "strength", experienceLevel: "novice", history: one });
  const noviceTwo = prescribeBench({ trainingGoal: "strength", experienceLevel: "novice", history: two });
  assert.equal(noviceOne.finalPrescription.progressionConfirmation.requiredExposures, 2);
  assert.equal(noviceOne.finalPrescription.progressionConfirmation.observedQualifyingExposures, 1);
  assert.equal(noviceOne.finalPrescription.progressionConfirmation.satisfied, false);
  assert.equal(noviceOne.finalPrescription.recommendationType, "hold");
  assert.match(noviceOne.finalPrescription.progressionRule, /1.*2|observed.*required/i);
  assert.equal(noviceTwo.finalPrescription.progressionConfirmation.satisfied, true);
  assert.notEqual(noviceTwo.finalPrescription.progressionAction, "hold_for_confirmation");

  const advancedTwo = prescribeBench({ trainingGoal: "strength", experienceLevel: "advanced", history: two });
  const advancedThree = prescribeBench({ trainingGoal: "strength", experienceLevel: "advanced", history: three });
  assert.equal(advancedTwo.finalPrescription.progressionConfirmation.requiredExposures, 3);
  assert.equal(advancedTwo.finalPrescription.progressionConfirmation.observedQualifyingExposures, 2);
  assert.equal(advancedTwo.finalPrescription.progressionAction, "hold_for_confirmation");
  assert.equal(advancedThree.finalPrescription.progressionConfirmation.satisfied, true);

  const unspecifiedTwo = prescribeBench({ trainingGoal: "strength", history: two });
  assert.equal(unspecifiedTwo.finalPrescription.progressionConfirmation.requiredExposures, 3);
  assert.equal(unspecifiedTwo.finalPrescription.progressionConfirmation.observedQualifyingExposures, 2);
  assert.equal(unspecifiedTwo.finalPrescription.progressionAction, "hold_for_confirmation");
  assert.ok(unspecifiedTwo.basePrescription.programmingContext.missingInputs.includes("experienceLevel"));
});

test("only a stable low-fatigue isolation receives the one-exposure confirmation exception", () => {
  const snapshot = engine.prescribeExercise({
    exerciseId: "ex_cable_curl",
    muscleGroupId: "biceps",
    trainingGoal: "hypertrophy",
    experienceLevel: "advanced",
    history: [exposure("ex_cable_curl", 9, { reps: [15, 15, 15], loads: [40, 40, 40] })],
    createdAt: CREATED_AT
  });
  assert.equal(snapshot.finalPrescription.progressionConfirmation.requiredExposures, 1);
  assert.equal(snapshot.finalPrescription.progressionConfirmation.observedQualifyingExposures, 1);
  assert.equal(snapshot.finalPrescription.progressionConfirmation.satisfied, true);
  assert.equal(snapshot.finalPrescription.progressionConfirmation.exceptionApplied, "stable_low_fatigue_isolation");
  assert.notEqual(snapshot.finalPrescription.progressionAction, "hold_for_confirmation");
});

test("missing and explicit general fitness share dose behavior and disclose resistance-only scope", () => {
  const missing = prescribeBench({ experienceLevel: "novice" });
  const explicit = prescribeBench({ trainingGoal: "general_fitness", experienceLevel: "novice" });
  assert.deepEqual(dose(missing.basePrescription), dose(explicit.basePrescription));
  assert.equal(missing.basePrescription.programmingContext.goal.source, "population_default");
  assert.equal(explicit.basePrescription.programmingContext.goal.source, "canonical_user_input");
  assert.match(missing.basePrescription.programmingContext.goal.disclosure, /cardiorespiratory|aerobic/i);
  assert.match(explicit.basePrescription.programmingContext.goal.disclosure, /cardiorespiratory|aerobic/i);
  assert.match(explicit.basePrescription.programmingContext.goal.disclosure, /resistance.*(not|does not|cannot)|does not fully/i);
});

test("qualifying productive personal dose overrides missing-data goal set caps", () => {
  const personalEngine = highConfidenceEngine();
  const history = [1, 5, 9, 13].map((day, index) => exposure("custom_press", day, {
    status: index ? "improved" : "baseline",
    reps: [12, 12, 12, 12, 12],
    loads: [100, 100, 100, 100, 100],
    prescribedSetCount: 5,
    completedSetCount: 5,
    straightSetCount: 5
  }));
  const snapshot = personalEngine.prescribeExercise({
    exerciseId: "custom_press",
    muscleGroupId: "chest",
    trainingGoal: "general_fitness",
    experienceLevel: "advanced",
    history,
    createdAt: CREATED_AT
  });
  assert.equal(snapshot.basePrescription.staleness.classification, "productive");
  assert.ok(snapshot.basePrescription.personalEvidenceWeight >= 0.6);
  assert.ok(snapshot.basePrescription.workingSets.target >= 4, `productive personal target was overwritten: ${snapshot.basePrescription.workingSets.target}`);
  assert.match(`${snapshot.basePrescription.volume.reason} ${snapshot.finalPrescription.userExplanation}`, /personal.*(precedence|preserv|productive)|productive.*personal/i);
});

test("one resolved profile propagates through goal-specific full mesocycles", () => {
  const create = (trainingGoal) => engine.createMesocycle({
    trainingGoal,
    experienceLevel: "novice",
    trainingDays: 2,
    includedMuscleGroupIds: ["chest"],
    sessionDurationTargetMinutes: 60,
    sessionDurationMaximumMinutes: 80,
    createdAt: CREATED_AT
  });
  const plans = ["strength", "muscular_endurance", "general_fitness"].map(create);
  plans.forEach((plan, index) => {
    const goal = ["strength", "muscular_endurance", "general_fitness"][index];
    assert.equal(plan.programmingContext.goal.resolvedValue, goal);
    assert.equal(plan.programmingContext.profileVersion, "training-profile/1.1.0");
    assert.match(plan.name, new RegExp(goal.replaceAll("_", " "), "i"));
    Object.values(plan.pools).forEach((pool) => {
      assert.equal(pool.programmingContext.goal.resolvedValue, goal);
      pool.candidates.forEach((candidate) => assert.equal(candidate.programmingContext.goal.resolvedValue, goal));
    });
    plan.programSlots.forEach((slot) => assert.equal(slot.programmingContext.goal.resolvedValue, goal));
    plan.sessions.forEach((session) => {
      assert.equal(session.programmingContext.goal.resolvedValue, goal);
      assert.doesNotMatch(session.baseSessionIntent, /hypertrophy/i);
      assert.match(session.baseSessionIntent, new RegExp(goal.replaceAll("_", " "), "i"));
      assert.ok(session.estimatedDurationMinutes <= plan.constraints.sessionDurationMaximumMinutes);
    });
    assert.match(plan.programReview.explanation.join(" "), new RegExp(goal.replaceAll("_", " "), "i"));
  });
  assert.deepEqual(plans[0].constraints, plans[1].constraints);
  assert.deepEqual(plans[1].constraints, plans[2].constraints);
  const vectors = plans.map((plan) => JSON.stringify(
    Object.values(plan.pools).flatMap((pool) => pool.candidates.map((candidate) => ({
      reps: candidate.recommendedRepRange,
      rest: candidate.recommendedRestSeconds,
      progression: candidate.progressionMethod
    })))
  ));
  assert.equal(new Set(vectors).size, 3, "strength, endurance, and general mesocycles did not materially differ");
});

test("no-overlap goal policy is visible and recommends or reviews a compatible alternative", () => {
  const direct = engine.prescribeExercise({
    exerciseId: "ex_deadlift",
    muscleGroupId: "glutes",
    trainingGoal: "muscular_endurance",
    experienceLevel: "advanced",
    availableEquipment: ["all"],
    createdAt: CREATED_AT
  });
  assert.deepEqual(direct.finalPrescription.repRange, { min: 3, target: 5, max: 6 });
  assert.equal(direct.finalPrescription.goalPolicyConflict.field, "repRange");
  assert.equal(direct.finalPrescription.goalPolicyConflict.goal, "muscular_endurance");
  assert.deepEqual(direct.finalPrescription.goalPolicyConflict.preservedExerciseRange, direct.finalPrescription.repRange);
  assert.match(direct.finalPrescription.userExplanation, /conflict|outside|does not overlap/i);
  assert.ok(direct.finalPrescription.goalPolicyConflict.alternativeExerciseId, "a catalog-compatible endurance alternative was not suggested");

  const plan = engine.createMesocycle({
    trainingGoal: "muscular_endurance",
    experienceLevel: "advanced",
    trainingDays: 2,
    includedMuscleGroupIds: ["glutes"],
    availableEquipment: ["all"],
    createdAt: CREATED_AT
  });
  const pool = plan.pools.glutes;
  assert.ok(pool.candidates.some((candidate) => !candidate.goalPolicyConflict), "fixture has no compatible alternative to adjudicate");
  plan.selectedPortfolio.filter((candidate) => candidate.goalPolicyConflict).forEach((candidate) => {
    assert.ok(plan.programReview.warnings.some((warning) => warning.type === "goal_policy_conflict" && warning.exerciseIds.includes(candidate.exerciseId)));
  });
  assert.ok(!plan.selectedPortfolio[0]?.goalPolicyConflict, "a conflicting candidate outranked an available compatible alternative");
});

test("material recommendation fields carry structured, referentially valid scientific provenance", () => {
  const conclusions = JSON.parse(fs.readFileSync(path.join(ROOT, "research_database", "exports", "json", "evidence_conclusions.json"), "utf8"));
  const studies = JSON.parse(fs.readFileSync(path.join(ROOT, "research_database", "exports", "json", "research_library.json"), "utf8"));
  const conclusionById = new Map(conclusions.map((row) => [row.conclusion_id, row]));
  const studyIds = new Set(studies.map((row) => row.study_id));
  const snapshot = prescribeBench({ trainingGoal: "strength", experienceLevel: "novice", nutritionPhase: "deficit" });
  const requiredFields = ["repRange", "restSeconds", "workingSets", "selectionOrder", "progression", "confirmation"];
  const provenance = snapshot.basePrescription.scientificProvenance;
  assert.equal(provenance.schemaVersion, "recommendation-provenance/1.0.0");
  requiredFields.forEach((field) => {
    const record = provenance[field];
    assert.ok(record, `missing provenance for ${field}`);
    assert.ok(["evidence", "product_policy", "safety"].includes(record.authority));
    assert.ok(record.population);
    assert.ok(record.directness);
    assert.ok(record.evidenceStrength);
    assert.ok(record.uncertainty);
    record.conclusionIds.forEach((id) => assert.ok(conclusionById.has(id), `${field} cites unknown conclusion ${id}`));
    record.studyIds.forEach((id) => assert.ok(studyIds.has(id), `${field} cites unknown study ${id}`));
    record.conclusionIds.forEach((id) => {
      const linked = new Set(String(conclusionById.get(id).supporting_study_ids || "").split("|").filter(Boolean));
      record.studyIds.forEach((studyId) => assert.ok(linked.has(studyId), `${field} study ${studyId} is not linked to ${id}`));
    });
  });
  const nutritionProvenance = snapshot.basePrescription.programmingContext.nutritionPhase.scientificProvenance;
  assert.deepEqual(nutritionProvenance.conclusionIds, ["con_0026"]);
  assert.deepEqual(nutritionProvenance.studyIds, ["stu_0020"]);

  const general = prescribeBench({ trainingGoal: "general_fitness", experienceLevel: "novice" });
  const endurance = prescribeBench({ trainingGoal: "muscular_endurance", experienceLevel: "novice" });
  assert.equal(general.basePrescription.scientificProvenance.repRange.authority, "product_policy");
  assert.equal(general.basePrescription.scientificProvenance.repRange.evidenceStrength, "low");
  assert.equal(endurance.basePrescription.scientificProvenance.repRange.authority, "product_policy");
  assert.equal(endurance.basePrescription.scientificProvenance.repRange.evidenceStrength, "low");
});

test("material contract versions are coherent, deterministic, and retain repository-known read compatibility", () => {
  assert.equal(ENGINE_VERSION, "3.4.0");
  const options = { trainingGoal: "strength", experienceLevel: "advanced", nutritionPhase: "maintenance" };
  const first = prescribeBench(options);
  const second = prescribeBench(options);
  assert.equal(first.schemaVersion, "1.4.0");
  assert.equal(first.recommendationVersion, "2.4.0");
  assert.equal(first.basePrescription.schemaVersion, "2.4.0");
  assert.equal(first.standardGuideline.schemaVersion, "standard-guideline/1.0.0");
  assert.equal(first.basePrescription.programmingContext.profileVersion, "training-profile/1.1.0");
  assert.equal(first.recommendationId, second.recommendationId);
  assert.equal(first.checksum, second.checksum);
  assert.equal(serializeRecommendationSnapshot(first), serializeRecommendationSnapshot(second));

  const prior = JSON.parse(JSON.stringify(first));
  prior.schemaVersion = "1.2.0";
  prior.recommendationVersion = "2.2.0";
  prior.basePrescription.schemaVersion = "2.2.0";
  prior.finalPrescription.schemaVersion = "2.2.0";
  delete prior.standardGuideline;
  assert.doesNotThrow(() => deserializeRecommendationSnapshot(refreshRecommendationChecksum(prior)));

  const obsolete = JSON.parse(JSON.stringify(first));
  obsolete.schemaVersion = "1.1.0";
  obsolete.recommendationVersion = "2.1.0";
  obsolete.basePrescription.schemaVersion = "2.1.0";
  obsolete.finalPrescription.schemaVersion = "2.1.0";
  delete obsolete.standardGuideline;
  assert.doesNotThrow(() => deserializeRecommendationSnapshot(refreshRecommendationChecksum(obsolete)));

  const mismatched = JSON.parse(JSON.stringify(first));
  mismatched.schemaVersion = "1.0.0";
  assert.throws(() => deserializeRecommendationSnapshot(refreshRecommendationChecksum(mismatched)), /version pair|requires/i);

  const planA = engine.createMesocycle({ trainingGoal: "strength", trainingDays: 2, includedMuscleGroupIds: ["chest"], createdAt: CREATED_AT });
  const planB = engine.createMesocycle({ trainingGoal: "strength", trainingDays: 2, includedMuscleGroupIds: ["chest"], createdAt: CREATED_AT });
  assert.equal(planA.schemaVersion, "mesocycle/2.6.0");
  assert.equal(planA.id, planB.id);
  assert.deepEqual(planA, planB);
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
      console.error(String(error?.stack || error));
    }
  }
  console.log(`\nRecommendation profile coherence: ${passed}/${tests.length} groups passed.`);
  if (failures.length) {
    console.error(`${failures.length} accepted review blocker group(s) remain reproducible.`);
    process.exitCode = 1;
  }
})();
