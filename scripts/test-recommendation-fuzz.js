"use strict";

const path = require("node:path");
const { performance } = require("node:perf_hooks");
const P = require("../prescription-engine");

const HARNESS_VERSION = "recommendation-fuzz/1.0.0";
const SEED = 0x5eedc0de;
const CREATED_AT = "2026-07-14T12:34:56.000Z";
const CASES_PER_GROUP = 128;
const ASSERTIONS_PER_CASE = 10;
const GROUP_COUNT = 8;
const EXPECTED_CASES = CASES_PER_GROUP * GROUP_COUNT;
const EXPECTED_ASSERTIONS = EXPECTED_CASES * ASSERTIONS_PER_CASE;
const MAX_RUNTIME_MS = 120_000;

const ROOT = path.resolve(__dirname, "..");
const readResearch = (name) => require(path.join(ROOT, "research_database", "exports", "json", name));
const researchData = {
  exerciseDatabase: readResearch("exercise_database.json"),
  exerciseMuscleMap: readResearch("exercise_muscle_map.json"),
  exerciseSubstitutionMap: readResearch("exercise_substitution_map.json"),
  muscleGroupRecommendations: readResearch("muscle_group_recommendations.json"),
  progressionRules: readResearch("progression_rules.json"),
  nutritionStrategies: readResearch("nutrition_strategies.json"),
  manifest: readResearch("manifest.json")
};

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const random = mulberry32(SEED);
const pick = (values) => values[Math.floor(random() * values.length)];
const shuffle = (values) => {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};
const deepClone = (value) => JSON.parse(JSON.stringify(value));
const json = (value) => JSON.stringify(value);
const unique = (values) => [...new Set(values)];

let cases = 0;
let assertions = 0;
const failures = [];
const coverageFailures = [];
const groupCounts = Object.create(null);

function capture(fn) {
  try {
    return { value: fn(), error: null };
  } catch (error) {
    return { value: null, error };
  }
}

function check(condition, invariant, context, observed) {
  assertions += 1;
  if (condition) return;
  failures.push({ invariant, context, observed });
}

function expectThrow(fn, pattern, invariant, context) {
  const result = capture(fn);
  check(
    Boolean(result.error) && pattern.test(String(result.error?.message || result.error)),
    invariant,
    context,
    result.error ? String(result.error.message || result.error) : "operation completed"
  );
}

function runCase(group, index, fn) {
  const before = assertions;
  cases += 1;
  groupCounts[group] = (groupCounts[group] || 0) + 1;
  try {
    fn();
  } catch (error) {
    failures.push({
      invariant: "harness_case_completed",
      context: { group, index },
      observed: String(error?.stack || error)
    });
  }
  const used = assertions - before;
  if (used !== ASSERTIONS_PER_CASE) {
    coverageFailures.push({ group, index, expected: ASSERTIONS_PER_CASE, actual: used });
  }
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validRange(range, options = {}) {
  if (!range || !finiteNumber(range.min) || !finiteNumber(range.max) || range.min > range.max) return false;
  if (options.positive && range.min <= 0) return false;
  if (range.target !== undefined && (!finiteNumber(range.target) || range.target < range.min || range.target > range.max)) return false;
  return true;
}

function validOptionalLoad(load) {
  if (load === undefined || load === null) return true;
  if (finiteNumber(load)) return load >= 0;
  return validRange(load) && load.min >= 0;
}

function validDose(prescription) {
  return validRange(prescription?.workingSets, { positive: true })
    && validRange(prescription?.repRange, { positive: true })
    && validRange(prescription?.targetRpe)
    && prescription.targetRpe.min >= 0
    && prescription.targetRpe.max <= 10
    && validRange(prescription?.targetRir)
    && prescription.targetRir.min >= 0
    && validRange(prescription?.restSeconds, { positive: true })
    && validRange(prescription?.frequencyPerWeek, { positive: true })
    && validOptionalLoad(prescription?.prescribedLoad);
}

function doseProjection(prescription) {
  return {
    workingSets: prescription.workingSets,
    repRange: prescription.repRange,
    targetRpe: prescription.targetRpe,
    targetRir: prescription.targetRir,
    restSeconds: prescription.restSeconds,
    frequencyPerWeek: prescription.frequencyPerWeek,
    setStructure: prescription.setStructure
  };
}

function publicEngine() {
  return P.createPrescriptionEngine({ personalData: {}, researchData });
}

const highPersonalScore = {
  comparable_session_count: 12,
  session_count: 12,
  observation_span_days: 180,
  data_confidence_score: 0.95,
  hypertrophy_support_score: 100,
  progression_score: 100,
  recovery_efficiency_score: 100,
  repeatability_score: 100,
  overall_personal_exercise_score: 100
};
const customScores = [
  {
    ...highPersonalScore,
    exercise_id: "custom_fuzz_mapped",
    research_exercise_id: "ex_dumbbell_bench_press",
    exercise_name: "Mapped Custom Cable Press",
    equipment: "cable"
  },
  {
    ...highPersonalScore,
    exercise_id: "custom_fuzz_unmapped",
    exercise_name: "Unlisted Custom Cable Press",
    equipmentRequirements: [["cable_station"]]
  },
  {
    ...highPersonalScore,
    exercise_id: "custom_fuzz_invalid",
    research_exercise_id: "ex_unknown_research",
    exercise_name: "Invalid Custom Press",
    equipment: "dumbbell"
  }
];
const customMuscles = customScores.map((row) => ({
  exercise_id: row.exercise_id,
  exercise_name: row.exercise_name,
  muscle_group: "chest",
  muscle_role: "primary",
  contribution_weight: 1,
  research_muscle_group_id: "mg_chest_sternal"
}));
function customEngine(reverse = false) {
  return P.createPrescriptionEngine({
    personalData: {
      exerciseScores: reverse ? customScores.slice().reverse() : customScores.slice(),
      exerciseMuscleScores: reverse ? customMuscles.slice().reverse() : customMuscles.slice(),
      metadata: { methodology_version: `${HARNESS_VERSION}/public-custom-catalog` }
    },
    researchData
  });
}

const engine = publicEngine();
const customEngines = [customEngine(false), customEngine(true)];
const exerciseById = new Map(researchData.exerciseDatabase.map((row) => [row.exercise_id, row]));
const positiveMappings = researchData.exerciseMuscleMap.filter((row) => (
  Number(row.fractional_set_credit) > 0 && exerciseById.has(row.exercise_id)
));
const positivePairMap = new Map();
positiveMappings.forEach((row) => {
  const family = P.muscleFamily(row.muscle_group_id);
  positivePairMap.set(`${row.exercise_id}|${family}`, { exerciseId: row.exercise_id, muscleGroupId: family });
});
const validPairs = shuffle([...positivePairMap.values()]);
const families = shuffle(unique(validPairs.map((row) => row.muscleGroupId)));
const planFamilies = shuffle(unique(researchData.muscleGroupRecommendations.map((row) => (
  P.muscleFamily(row.muscle_group || row.muscle_group_id)
))));
const canonicalGoals = ["strength", "hypertrophy", "muscular_endurance", "general_fitness"];
const canonicalExperiences = [undefined, "novice", "intermediate", "advanced"];
const nutritionPhases = [undefined, "deficit", "maintenance", "recomposition", "surplus"];
const returnStates = [undefined, null, false, true];

function profileOptions(index) {
  const trainingGoal = canonicalGoals[(index + Math.floor(random() * canonicalGoals.length)) % canonicalGoals.length];
  const experienceLevel = pick(canonicalExperiences);
  const nutritionPhase = pick(nutritionPhases);
  const returningAfterGap = pick(returnStates);
  return {
    trainingGoal,
    ...(experienceLevel === undefined ? {} : { experienceLevel }),
    ...(nutritionPhase === undefined ? {} : { nutritionPhase }),
    ...(returningAfterGap === undefined ? {} : { returningAfterGap })
  };
}

function historyRow(exerciseId, day, options = {}) {
  const reps = options.reps || [8, 8, 8];
  const load = options.load || 100;
  return {
    exercise_id: exerciseId,
    workout_date: `2026-07-${String(day).padStart(2, "0")}`,
    progression_status: options.status || "improved",
    progression_pct_vs_prior: options.progressionPercent ?? 2,
    comparison_performance_value: options.performance ?? load + day,
    best_epley_e1rm: options.performance ?? load + day,
    average_rpe: options.rpe ?? 8,
    recovery_strain_score: options.recovery ?? 30,
    max_set_rep_loss_pct: options.repLoss ?? 10,
    max_set_load_reduction_pct: options.loadReduction ?? 10,
    plateau_duration_exposures: options.plateau ?? 0,
    regression_duration_exposures: options.regression ?? 0,
    pain: options.pain ?? false,
    techniqueValid: options.techniqueValid ?? true,
    techniqueQuality: options.techniqueQuality || "valid",
    completedSetRatio: options.completedSetRatio ?? 1,
    completedSetCount: options.completedSetCount ?? reps.length,
    prescribedSetCount: options.prescribedSetCount ?? reps.length,
    set_repetitions: JSON.stringify(reps),
    set_loads: JSON.stringify(reps.map(() => load)),
    set_rpes: JSON.stringify(reps.map(() => options.rpe ?? 8)),
    ...options.identity
  };
}

function regressionHistory() {
  return [1, 4, 7, 10].map((day, index) => historyRow("ex_barbell_bench_press", day, {
    status: index < 2 ? "held" : "regressed",
    progressionPercent: index < 2 ? 0 : -3,
    performance: 110 - index * 3,
    rpe: 8 + index * 0.4,
    recovery: index < 2 ? 45 : 75,
    repLoss: index < 2 ? 10 : 35,
    regression: index < 2 ? 0 : index - 1
  }));
}

const startedAt = performance.now();

// 1. Direct prescription: public taxonomy pairs x canonical profile dimensions.
for (let index = 0; index < CASES_PER_GROUP; index += 1) {
  runCase("direct_prescription", index, () => {
    const pair = validPairs[(index + Math.floor(random() * validPairs.length)) % validPairs.length];
    const profile = profileOptions(index);
    const result = capture(() => engine.prescribeExercise({
      exerciseId: pair.exerciseId,
      muscleGroupId: pair.muscleGroupId,
      availableEquipment: ["all"],
      ...profile,
      createdAt: CREATED_AT
    }));
    const snapshot = result.value;
    const base = snapshot?.basePrescription;
    const final = snapshot?.finalPrescription;
    const context = base?.programmingContext;
    check(!result.error, "direct_supported_pair_does_not_throw", { index, pair, profile }, result.error?.message);
    check(
      snapshot?.exerciseId === pair.exerciseId && base?.exerciseId === pair.exerciseId && final?.exerciseId === pair.exerciseId
        && snapshot?.muscleGroupId === pair.muscleGroupId && base?.muscleGroupId === pair.muscleGroupId,
      "direct_identity_is_bound_to_requested_taxonomy_pair",
      { index, pair },
      { snapshot: snapshot?.exerciseId, base: base?.exerciseId, final: final?.exerciseId, muscle: snapshot?.muscleGroupId }
    );
    check(
      context?.goal?.resolvedValue === profile.trainingGoal && context?.goal?.source === "canonical_user_input",
      "canonical_goal_provenance_is_preserved",
      { index, pair, profile },
      context?.goal
    );
    const expectedExperience = profile.experienceLevel === undefined ? "novice_safe_default" : profile.experienceLevel;
    check(
      context?.experience?.resolvedValue === expectedExperience
        && (profile.experienceLevel !== undefined || context?.missingInputs?.includes("experienceLevel")),
      "experience_is_explicit_or_transparently_defaulted",
      { index, pair, profile },
      context?.experience
    );
    check(
      context?.nutritionPhase?.resolvedValue === (profile.nutritionPhase ?? null)
        && context?.nutritionPhase?.doseAdjustmentApplied === false,
      "nutrition_phase_remains_separate_and_non_preemptive",
      { index, pair, profile },
      context?.nutritionPhase
    );
    check(
      context?.returningAfterGap?.resolvedValue === (profile.returningAfterGap ?? null)
        && (profile.returningAfterGap !== true || final?.progressionAction === "establish_baseline"),
      "return_after_gap_is_separate_and_conservative",
      { index, pair, profile },
      { return: context?.returningAfterGap, action: final?.progressionAction }
    );
    check(validDose(base) && validDose(final), "direct_output_has_bounded_valid_dose", { index, pair, profile }, doseProjection(final || {}));
    check(
      final?.executionBlocked === false && finiteNumber(snapshot?.exerciseScore) && finiteNumber(snapshot?.muscleSpecificScore)
        && snapshot.personalEvidenceWeight >= 0 && snapshot.personalEvidenceWeight <= 1
        && snapshot.researchEvidenceWeight >= 0 && snapshot.researchEvidenceWeight <= 1,
      "ordinary_direct_output_is_executable_and_weights_are_bounded",
      { index, pair, profile },
      { blocked: final?.executionBlocked, exerciseScore: snapshot?.exerciseScore, muscleScore: snapshot?.muscleSpecificScore, personal: snapshot?.personalEvidenceWeight, research: snapshot?.researchEvidenceWeight }
    );
    check(
      context?.personalization?.personalEvidenceAvailable === false
        && context?.personalization?.source === "research_population_default"
        && /population|research default/i.test(final?.userExplanation || "")
        && /missing|not available|no qualifying/i.test(final?.userExplanation || ""),
      "missing_personal_evidence_is_disclosed_without_fabrication",
      { index, pair, profile },
      { personalization: context?.personalization, explanation: final?.userExplanation }
    );
    const roundTrip = capture(() => P.deserializeRecommendationSnapshot(P.serializeRecommendationSnapshot(snapshot)));
    check(
      !roundTrip.error && json(roundTrip.value) === json(snapshot)
        && snapshot?.schemaVersion === P.SNAPSHOT_SCHEMA_VERSION
        && snapshot?.recommendationVersion === P.PRESCRIPTION_SCHEMA_VERSION
        && snapshot?.engineVersion === P.ENGINE_VERSION
        && snapshot?.createdAt === CREATED_AT,
      "current_snapshot_round_trip_and_versions_are_exact",
      { index, pair, profile },
      roundTrip.error?.message || { snapshot: snapshot?.schemaVersion, prescription: snapshot?.recommendationVersion, engine: snapshot?.engineVersion, createdAt: snapshot?.createdAt }
    );
  });
}

// 2. Ranking: equipment tri-state, canonical/custom exclusion identity, and bounded pools.
for (let index = 0; index < CASES_PER_GROUP; index += 1) {
  runCase("ranking_constraints", index, () => {
    const useCustom = index % 2 === 1;
    const activeEngine = useCustom ? customEngines[index % customEngines.length] : engine;
    const family = useCustom ? "chest" : families[(index + Math.floor(random() * families.length)) % families.length];
    const all = capture(() => activeEngine.rankExercisePool(family, { availableEquipment: ["all"], maxCandidates: 5, generatedAt: CREATED_AT }));
    const omitted = capture(() => activeEngine.rankExercisePool(family, { maxCandidates: 5, generatedAt: CREATED_AT }));
    const empty = capture(() => activeEngine.rankExercisePool(family, { availableEquipment: [], maxCandidates: 5, generatedAt: CREATED_AT }));
    const allPool = all.value;
    const target = useCustom
      ? allPool?.candidates?.find((candidate) => candidate.exerciseId === "custom_fuzz_mapped")
      : allPool?.candidates?.[0];
    const researchRow = exerciseById.get(target?.researchExerciseId || target?.exerciseId);
    const aliases = String(researchRow?.exercise_aliases || "").split("|").filter(Boolean);
    const identifier = useCustom
      ? ["custom_fuzz_mapped", "ex_dumbbell_bench_press", "db bench press"][index % 3]
      : [target?.exerciseId, target?.researchExerciseId, target?.exerciseName, aliases[0]].filter(Boolean)[index % [target?.exerciseId, target?.researchExerciseId, target?.exerciseName, aliases[0]].filter(Boolean).length];
    const excluded = capture(() => activeEngine.rankExercisePool(family, {
      availableEquipment: ["all"],
      excludedExerciseIds: [identifier, identifier],
      maxCandidates: 5,
      generatedAt: CREATED_AT
    }));
    const excludedPool = excluded.value;
    const canonicalTarget = target?.researchExerciseId || target?.exerciseId;
    check(!all.error && !omitted.error && !empty.error && !excluded.error, "ranking_supported_inputs_do_not_throw", { index, useCustom, family, identifier }, [all.error, omitted.error, empty.error, excluded.error].map((error) => error?.message));
    check(allPool?.candidates?.length > 0 && allPool.candidates.length <= 5 && allPool.candidateCount === allPool.candidates.length, "ranking_pool_is_nonempty_and_bounded", { index, useCustom, family }, { count: allPool?.candidateCount, length: allPool?.candidates?.length });
    check(
      new Set(allPool?.candidates?.map((candidate) => candidate.exerciseId)).size === allPool?.candidates?.length
        && new Set(allPool?.candidates?.map((candidate) => candidate.researchExerciseId || candidate.exerciseId)).size === allPool?.candidates?.length,
      "ranking_has_no_duplicate_exercise_or_research_identity",
      { index, useCustom, family },
      allPool?.candidates?.map((candidate) => [candidate.exerciseId, candidate.researchExerciseId])
    );
    check(
      allPool?.candidates?.every((candidate) => candidate.scores?.muscleGroupId === family
        && finiteNumber(candidate.scores?.targetSetContribution)
        && candidate.scores.targetSetContribution > 0),
      "ranking_candidates_have_positive_direct_target_evidence",
      { index, useCustom, family },
      allPool?.candidates?.map((candidate) => ({ id: candidate.exerciseId, research: candidate.researchExerciseId, muscle: candidate.scores?.muscleGroupId, targetSetContribution: candidate.scores?.targetSetContribution }))
    );
    check(json(allPool?.candidates?.map((candidate) => candidate.exerciseId)) === json(omitted.value?.candidates?.map((candidate) => candidate.exerciseId)), "omitted_equipment_matches_unrestricted_all_equipment", { index, useCustom, family }, { all: allPool?.candidates?.map((candidate) => candidate.exerciseId), omitted: omitted.value?.candidates?.map((candidate) => candidate.exerciseId) });
    check(empty.value?.candidates?.length === 0 && empty.value?.availableViableExerciseCount === 0, "explicit_empty_equipment_never_recommends_equipment_dependent_work", { index, useCustom, family }, { candidates: empty.value?.candidates?.map((candidate) => candidate.exerciseId), viable: empty.value?.availableViableExerciseCount });
    check(
      Boolean(target) && !excludedPool?.candidates?.some((candidate) => (candidate.researchExerciseId || candidate.exerciseId) === canonicalTarget || candidate.exerciseId === target.exerciseId),
      "canonical_custom_and_alias_exclusion_removes_whole_identity",
      { index, useCustom, family, identifier, target: target?.exerciseId, canonicalTarget },
      excludedPool?.candidates?.map((candidate) => [candidate.exerciseId, candidate.researchExerciseId])
    );
    check(
      !excludedPool?.candidates?.some((candidate) => [target?.exerciseId, canonicalTarget].includes(candidate.preferredReplacementExerciseId)),
      "excluded_identity_cannot_reappear_as_substitution",
      { index, useCustom, family, identifier, target: target?.exerciseId, canonicalTarget },
      excludedPool?.candidates?.map((candidate) => ({ id: candidate.exerciseId, replacement: candidate.preferredReplacementExerciseId }))
    );
    check(
      excludedPool?.excludedCandidates?.some((candidate) => candidate.reasonCode === "user_exclusion" && candidate.canonicalResearchExerciseId === canonicalTarget)
        && excludedPool?.exclusionResolution?.excludedResearchExerciseIds?.includes(canonicalTarget),
      "exclusion_is_reported_with_canonical_provenance",
      { index, useCustom, family, identifier, canonicalTarget },
      { excluded: excludedPool?.excludedCandidates, resolution: excludedPool?.exclusionResolution }
    );
    check(
      excludedPool?.exclusionResolution?.requestedValues?.length === 1
        && excludedPool.exclusionResolution.requestedValues[0] === identifier
        && new Set(excludedPool.exclusionResolution.resolutions.map((row) => `${row.requestedValue}|${row.researchExerciseId}`)).size === excludedPool.exclusionResolution.resolutions.length,
      "duplicate_exclusion_input_is_canonicalized_in_provenance",
      { index, useCustom, family, identifier },
      excludedPool?.exclusionResolution
    );
  });
}

// 3. Mesocycles: scope, time, goal propagation, de-duplication, and locality.
for (let index = 0; index < CASES_PER_GROUP; index += 1) {
  runCase("mesocycle_constraints", index, () => {
    const trainingDays = 1 + index % 7;
    const goal = canonicalGoals[index % canonicalGoals.length];
    const experienceLevel = ["novice", "intermediate", "advanced"][index % 3];
    const requestedScope = index % 8 === 0
      ? undefined
      : unique([pick(planFamilies), pick(planFamilies), pick(planFamilies)]).slice(0, 1 + index % 3);
    const targetMinutes = 12 + index % 9;
    const maximumMinutes = targetMinutes + 5 + index % 11;
    const common = {
      trainingDays,
      trainingGoal: goal,
      experienceLevel,
      availableEquipment: ["all"],
      ...(requestedScope === undefined ? {} : { includedMuscleGroupIds: requestedScope }),
      createdAt: CREATED_AT
    };
    const short = capture(() => engine.createMesocycle({
      ...common,
      sessionDurationTargetMinutes: targetMinutes,
      sessionDurationMaximumMinutes: maximumMinutes
    }));
    const roomy = capture(() => engine.createMesocycle({
      ...common,
      sessionDurationTargetMinutes: 70,
      sessionDurationMaximumMinutes: 100
    }));
    const plan = short.value;
    const allPools = Object.values(plan?.pools || {});
    const selectedIds = new Set(plan?.selectedPortfolio?.map((candidate) => candidate.exerciseId));
    const scheduled = plan?.sessions?.flatMap((session) => session.exercises) || [];
    const shortIds = new Set(scheduled.map((exercise) => exercise.exerciseId));
    const roomyPortfolio = new Set(roomy.value?.selectedPortfolio?.map((candidate) => candidate.exerciseId));
    check(!short.error && !roomy.error, "mesocycle_supported_constraints_do_not_throw", { index, common, targetMinutes, maximumMinutes }, [short.error?.message, roomy.error?.message]);
    check(
      plan?.trainingDays === trainingDays && plan?.sessions?.length === trainingDays
        && plan?.constraints?.trainingDays === trainingDays
        && plan?.constraints?.sessionDurationTargetMinutes === targetMinutes
        && plan?.constraints?.sessionDurationMaximumMinutes === maximumMinutes,
      "mesocycle_schedule_and_duration_constraints_are_exact",
      { index, common, targetMinutes, maximumMinutes },
      { trainingDays: plan?.trainingDays, sessions: plan?.sessions?.length, constraints: plan?.constraints }
    );
    check(
      requestedScope === undefined
        ? plan?.includedMuscleGroupIds?.length > 0
        : json([...(plan?.includedMuscleGroupIds || [])].sort()) === json([...requestedScope].sort()),
      "mesocycle_scope_is_explicit_or_transparently_defaulted",
      { index, requestedScope },
      plan?.includedMuscleGroupIds
    );
    check(
      plan?.programmingContext?.goal?.resolvedValue === goal
        && allPools.every((pool) => pool.programmingContext?.goal?.resolvedValue === goal)
        && plan?.programSlots?.every((slot) => slot.programmingContext?.goal?.resolvedValue === goal)
        && plan?.sessions?.every((session) => session.programmingContext?.goal?.resolvedValue === goal),
      "one_goal_profile_propagates_through_the_complete_plan",
      { index, goal },
      { plan: plan?.programmingContext?.goal, pools: allPools.map((pool) => pool.programmingContext?.goal?.resolvedValue), slots: plan?.programSlots?.map((slot) => slot.programmingContext?.goal?.resolvedValue), sessions: plan?.sessions?.map((session) => session.programmingContext?.goal?.resolvedValue) }
    );
    check(
      plan?.createdAt === CREATED_AT && allPools.every((pool) => pool.generatedAt === CREATED_AT),
      "mesocycle_fixed_timestamp_propagates_to_nested_pools",
      { index },
      { plan: plan?.createdAt, pools: allPools.map((pool) => pool.generatedAt) }
    );
    check(
      plan?.sessions?.every((session) => finiteNumber(session.estimatedDurationMinutes) && session.estimatedDurationMinutes >= 0 && session.estimatedDurationMinutes <= maximumMinutes),
      "mesocycle_never_exceeds_hard_duration_maximum",
      { index, maximumMinutes },
      plan?.sessions?.map((session) => session.estimatedDurationMinutes)
    );
    check(
      new Set(plan?.programSlots?.map((slot) => slot.id)).size === plan?.programSlots?.length
        && plan?.programSlots?.every((slot) => new Set(slot.selectedExerciseIds).size === slot.selectedExerciseIds.length),
      "mesocycle_has_no_duplicate_slots_or_slot_selections",
      { index },
      plan?.programSlots?.map((slot) => ({ id: slot.id, selected: slot.selectedExerciseIds }))
    );
    check(
      plan?.sessions?.every((session) => new Set(session.exercises.map((exercise) => exercise.exerciseId)).size === session.exercises.length)
        && scheduled.every((exercise) => validRange(exercise.recommendedSetRange, { positive: true })
          && validRange(exercise.recommendedRepRange, { positive: true })
          && validRange(exercise.recommendedRestSeconds, { positive: true })),
      "scheduled_exercises_are_unique_per_session_and_have_valid_dose",
      { index },
      plan?.sessions?.map((session) => ({ id: session.id, exercises: session.exercises.map((exercise) => exercise.exerciseId) }))
    );
    check(
      scheduled.every((exercise) => selectedIds.has(exercise.exerciseId))
        && [...shortIds].every((exerciseId) => roomyPortfolio.has(exerciseId)),
      "time_constrained_schedule_is_drawn_from_the_selected_roomy_portfolio",
      { index },
      { scheduled: [...shortIds], selected: [...selectedIds], roomy: [...roomyPortfolio] }
    );
    const constraintProjection = (value) => ({
      trainingDays: value?.constraints?.trainingDays,
      split: value?.constraints?.split,
      availableEquipment: value?.constraints?.availableEquipment,
      excludedExerciseIds: value?.constraints?.excludedExerciseIds,
      goal: value?.constraints?.goal,
      experienceLevel: value?.constraints?.experienceLevel,
      nutritionPhase: value?.constraints?.nutritionPhase,
      returningAfterGap: value?.constraints?.returningAfterGap
    });
    check(
      json(constraintProjection(plan)) === json(constraintProjection(roomy.value))
        && ([...shortIds].every((exerciseId) => roomyPortfolio.has(exerciseId)))
        && (shortIds.size === roomyPortfolio.size || plan?.programReview?.warnings?.some((warning) => warning.type === "schedule_capacity")),
      "time_counterfactual_changes_capacity_without_unrelated_constraints",
      { index, common, targetMinutes, maximumMinutes },
      { shortConstraints: constraintProjection(plan), roomyConstraints: constraintProjection(roomy.value), shortIds: [...shortIds], roomyIds: [...roomyPortfolio], warnings: plan?.programReview?.warnings }
    );
  });
}

// 4. Fail-closed validation: malformed profile, scope, schedule, and equipment inputs.
const invalidDays = [0, -1, 1.5, 8, 99, "3", "three", null];
const invalidScopes = [[], [""], ["   "], {}, "", ["not_a_muscle"], [null], 7];
const invalidGoals = ["powerlifting", "weight_loss", "endurance-ish", "", 7, null];
const invalidExperiences = ["expert", "elite", "beginner-ish", "", 4, null];
const invalidNutrition = ["cut", "bulk", "diet", "", "   ", null, 7];
const invalidReturn = ["true", "false", 1, 0, {}, []];
for (let index = 0; index < CASES_PER_GROUP; index += 1) {
  runCase("fail_closed_validation", index, () => {
    const pair = validPairs[index % validPairs.length];
    expectThrow(() => engine.createMesocycle({ trainingDays: invalidDays[index % invalidDays.length], createdAt: CREATED_AT }), /trainingDays|training days/i, "invalid_training_days_fail_closed", { index, value: invalidDays[index % invalidDays.length] });
    expectThrow(() => engine.createMesocycle({ trainingDays: 2, includedMuscleGroupIds: invalidScopes[index % invalidScopes.length], createdAt: CREATED_AT }), /scope|includedMuscleGroupIds|muscle/i, "empty_or_malformed_scope_fails_closed", { index, value: invalidScopes[index % invalidScopes.length] });
    expectThrow(() => engine.prescribeExercise({ exerciseId: pair.exerciseId, muscleGroupId: pair.muscleGroupId, trainingGoal: invalidGoals[index % invalidGoals.length], createdAt: CREATED_AT }), /goal/i, "invalid_training_goal_fails_closed", { index, value: invalidGoals[index % invalidGoals.length] });
    expectThrow(() => engine.prescribeExercise({ exerciseId: pair.exerciseId, muscleGroupId: pair.muscleGroupId, goal: "strength", createdAt: CREATED_AT }), /legacy.*goal|trainingGoal/i, "unprovenanced_legacy_goal_fails_closed", { index });
    expectThrow(() => engine.prescribeExercise({ exerciseId: pair.exerciseId, muscleGroupId: pair.muscleGroupId, trainingGoal: "strength", goal: "endurance", legacyGoalSemantics: "training_goal", createdAt: CREATED_AT }), /conflicting.*goal/i, "conflicting_goal_fields_fail_closed", { index });
    expectThrow(() => engine.prescribeExercise({ exerciseId: pair.exerciseId, muscleGroupId: pair.muscleGroupId, experienceLevel: invalidExperiences[index % invalidExperiences.length], createdAt: CREATED_AT }), /experience/i, "invalid_experience_fails_closed", { index, value: invalidExperiences[index % invalidExperiences.length] });
    expectThrow(() => engine.prescribeExercise({ exerciseId: pair.exerciseId, muscleGroupId: pair.muscleGroupId, experienceLevel: "novice", experience: "advanced", legacyExperienceSemantics: "training_experience", createdAt: CREATED_AT }), /conflicting.*experience/i, "conflicting_experience_fields_fail_closed", { index });
    expectThrow(() => engine.prescribeExercise({ exerciseId: pair.exerciseId, muscleGroupId: pair.muscleGroupId, nutritionPhase: invalidNutrition[index % invalidNutrition.length], createdAt: CREATED_AT }), /nutritionPhase|nutrition phase/i, "invalid_nutrition_phase_fails_closed", { index, value: invalidNutrition[index % invalidNutrition.length] });
    expectThrow(() => engine.prescribeExercise({ exerciseId: pair.exerciseId, muscleGroupId: pair.muscleGroupId, returningAfterGap: invalidReturn[index % invalidReturn.length], createdAt: CREATED_AT }), /returningAfterGap|return.*gap/i, "invalid_return_after_gap_fails_closed", { index, value: invalidReturn[index % invalidReturn.length] });
    expectThrow(() => engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", availableEquipment: ["dumbbell"], createdAt: CREATED_AT }), /equipment|compatible/i, "unavailable_direct_equipment_fails_closed", { index });
  });
}

// 5. Workout assembly: canonical and slot de-duplication with bounded prescriptions.
for (let index = 0; index < CASES_PER_GROUP; index += 1) {
  runCase("workout_assembly", index, () => {
    const profile = profileOptions(index);
    const exercises = [
      { exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", recommendationSlotId: `press_${index}` },
      { exerciseId: "ex_barbell_bench_press", muscleGroupId: "chest", recommendationSlotId: `duplicate_press_${index}` },
      { exerciseId: "ex_dumbbell_bench_press", muscleGroupId: "chest", recommendationSlotId: `press_${index}` },
      { exerciseId: "ex_seated_cable_row", muscleGroupId: "upper_back", recommendationSlotId: `row_${index}` }
    ];
    const first = capture(() => engine.prescribeWorkout({ exercises, ...profile, createdAt: CREATED_AT }));
    const second = capture(() => engine.prescribeWorkout({ exercises: deepClone(exercises), ...profile, createdAt: CREATED_AT }));
    const workout = first.value;
    const recommendationIds = workout?.recommendations?.map((item) => item.exerciseId) || [];
    const slotIds = workout?.recommendations?.map((item) => item.recommendationSlotId).filter(Boolean) || [];
    check(!first.error && !second.error, "supported_workout_assembly_does_not_throw", { index, profile }, [first.error?.message, second.error?.message]);
    check(workout?.recommendations?.length === 2, "workout_removes_exact_duplicate_canonical_and_slot_entries", { index, profile }, recommendationIds);
    check(new Set(recommendationIds).size === recommendationIds.length, "workout_contains_no_duplicate_exercise_identity", { index, profile }, recommendationIds);
    check(new Set(slotIds).size === slotIds.length, "workout_contains_no_duplicate_recommendation_slot", { index, profile }, slotIds);
    check(workout?.deduplication?.removedCount === 2 && workout?.deduplication?.removed?.length === 2, "workout_deduplication_count_is_auditable", { index, profile }, workout?.deduplication);
    check(json(workout?.deduplication?.removed?.map((item) => item.reason)) === json(["duplicate_canonical_exercise", "duplicate_recommendation_slot"]), "workout_deduplication_reasons_are_deterministic", { index, profile }, workout?.deduplication?.removed);
    check(workout?.recommendations?.every((item) => validDose(item.finalPrescription)), "workout_recommendations_have_bounded_valid_dose", { index, profile }, workout?.recommendations?.map((item) => doseProjection(item.finalPrescription)));
    check(
      workout?.recommendations?.every((item) => item.createdAt === CREATED_AT
        && item.finalPrescription?.programmingContext?.goal?.resolvedValue === profile.trainingGoal),
      "workout_profile_and_timestamp_propagate_to_every_recommendation",
      { index, profile },
      workout?.recommendations?.map((item) => ({ createdAt: item.createdAt, goal: item.finalPrescription?.programmingContext?.goal }))
    );
    check(json(first.value) === json(second.value), "workout_assembly_is_deterministic_for_fixed_input_and_time", { index, profile }, { first: first.value?.deduplication, second: second.value?.deduplication });
    expectThrow(() => engine.prescribeExercise({ exerciseId: "ex_barbell_bench_press", muscleGroupId: "calves", createdAt: CREATED_AT }), /taxonomy|target relationship|muscle/i, "direct_taxonomy_mismatch_fails_closed", { index });
  });
}

// 6. Progression history: unrelated, duplicate, transitive, and invalid evidence.
for (let index = 0; index < CASES_PER_GROUP; index += 1) {
  runCase("progression_history", index, () => {
    const experienceLevel = index % 2 === 0 ? "novice" : "advanced";
    const required = experienceLevel === "novice" ? 2 : 3;
    const days = [3, 7, 11].slice(3 - required);
    const baseHistory = days.map((day) => historyRow("ex_barbell_bench_press", day, { identity: { exposure_id: `bench-${index}-${day}` } }));
    const options = {
      exerciseId: "ex_barbell_bench_press",
      muscleGroupId: "chest",
      trainingGoal: "strength",
      experienceLevel,
      createdAt: CREATED_AT
    };
    const baseline = capture(() => engine.prescribeExercise({ ...options, history: baseHistory }));
    const duplicatedHistory = baseHistory.flatMap((row) => [row, deepClone(row)]);
    const duplicated = capture(() => engine.prescribeExercise({ ...options, history: shuffle(duplicatedHistory) }));
    const unrelatedRows = [1, 2, 3].map((day) => historyRow("ex_back_squat", day, { pain: true, techniqueValid: false, techniqueQuality: "invalid" }));
    const unrelated = capture(() => engine.prescribeExercise({ ...options, history: [...baseHistory, ...unrelatedRows] }));
    const lastDay = days.at(-1);
    const transitiveHistory = [
      ...baseHistory.slice(0, -1),
      historyRow("ex_barbell_bench_press", lastDay, { identity: { exposure_id: `bridge-e-${index}`, workout_id: `bridge-w-${index}` } }),
      historyRow("ex_barbell_bench_press", lastDay, { identity: { workoutId: `bridge-w-${index}`, session_id: `bridge-s-${index}` } }),
      historyRow("ex_barbell_bench_press", lastDay, { identity: { sessionId: `bridge-s-${index}` } })
    ];
    const transitive = capture(() => engine.prescribeExercise({ ...options, history: transitiveHistory }));
    const invalidHistory = [...transitiveHistory, historyRow("ex_barbell_bench_press", lastDay, {
      techniqueValid: false,
      techniqueQuality: "invalid",
      identity: { exposure_id: `bridge-e-${index}` }
    })];
    const invalid = capture(() => engine.prescribeExercise({ ...options, history: invalidHistory }));
    const baseConfirmation = baseline.value?.finalPrescription?.progressionConfirmation;
    const duplicateConfirmation = duplicated.value?.finalPrescription?.progressionConfirmation;
    const unrelatedConfirmation = unrelated.value?.finalPrescription?.progressionConfirmation;
    const transitiveConfirmation = transitive.value?.finalPrescription?.progressionConfirmation;
    const invalidConfirmation = invalid.value?.finalPrescription?.progressionConfirmation;
    check(!baseline.error && !duplicated.error && !unrelated.error && !transitive.error && !invalid.error, "supported_progression_histories_do_not_throw", { index, experienceLevel }, [baseline.error, duplicated.error, unrelated.error, transitive.error, invalid.error].map((error) => error?.message));
    check(baseConfirmation?.requiredExposures === required, "experience_resolves_confirmation_exposure_count", { index, experienceLevel, required }, baseConfirmation);
    check(baseConfirmation?.observedQualifyingExposures === required && baseConfirmation?.satisfied === true, "distinct_valid_exposures_satisfy_confirmation", { index, experienceLevel, required }, baseConfirmation);
    check(baseline.value?.finalPrescription?.progressionAction !== "hold_for_confirmation", "satisfied_confirmation_does_not_force_a_confirmation_hold", { index, experienceLevel }, baseline.value?.finalPrescription?.progressionAction);
    check(
      duplicateConfirmation?.observedQualifyingExposures === required
        && new Set(duplicateConfirmation.qualifyingExposureDates).size === duplicateConfirmation.qualifyingExposureDates.length,
      "duplicate_rows_do_not_fabricate_exposures_or_dates",
      { index, experienceLevel, required },
      duplicateConfirmation
    );
    check(
      unrelated.value?.finalPrescription?.historyResolution?.matchedRowCount === baseHistory.length
        && unrelated.value?.finalPrescription?.historyResolution?.ignoredUnrelatedRowCount === unrelatedRows.length,
      "unrelated_history_is_filtered_from_selected_identity",
      { index, experienceLevel },
      unrelated.value?.finalPrescription?.historyResolution
    );
    check(
      unrelatedConfirmation?.observedQualifyingExposures === baseConfirmation?.observedQualifyingExposures
        && unrelated.value?.finalPrescription?.progressionAction === baseline.value?.finalPrescription?.progressionAction,
      "unrelated_history_cannot_change_progression",
      { index, experienceLevel },
      { baseline: baseConfirmation, unrelated: unrelatedConfirmation, baselineAction: baseline.value?.finalPrescription?.progressionAction, unrelatedAction: unrelated.value?.finalPrescription?.progressionAction }
    );
    check(transitiveConfirmation?.observedQualifyingExposures === required && transitiveConfirmation?.satisfied === true, "transitively_linked_rows_count_as_one_exposure", { index, experienceLevel, required }, transitiveConfirmation);
    check(invalidConfirmation?.observedQualifyingExposures === 0 && invalidConfirmation?.satisfied === false, "invalid_linked_row_invalidates_the_whole_trailing_exposure", { index, experienceLevel }, invalidConfirmation);
    check(
      invalid.value?.finalPrescription?.recommendationType !== "progress"
        && !/^increase_|^add_|^progress_/.test(invalid.value?.finalPrescription?.progressionAction || ""),
      "invalid_evidence_never_drives_progression",
      { index, experienceLevel },
      { action: invalid.value?.finalPrescription?.progressionAction, type: invalid.value?.finalPrescription?.recommendationType }
    );
  });
}

// 7. Safety: current illness and pain deterministically supersede progression and deloads.
for (let index = 0; index < CASES_PER_GROUP; index += 1) {
  runCase("hard_safety", index, () => {
    const pain = index % 2 === 1;
    const readiness = pain
      ? { pain: true, affectedMuscle: "Chest", sleepHours: 4, baselineSleepHours: 8, consecutiveLowReadinessDays: 3 }
      : { illness: true, sleepHours: 4, baselineSleepHours: 8, consecutiveLowReadinessDays: 3 };
    const expectedType = pain ? "substitute" : "hold";
    const expectedAction = pain ? "hold_for_pain_free_substitution" : "stop_for_illness";
    const expectedDomain = pain ? "pain" : "illness";
    const expectedScope = pain ? "exercise" : "workout";
    const result = capture(() => engine.prescribeExercise({
      exerciseId: "ex_barbell_bench_press",
      muscleGroupId: "chest",
      trainingGoal: canonicalGoals[index % canonicalGoals.length],
      experienceLevel: ["novice", "intermediate", "advanced"][index % 3],
      history: regressionHistory(),
      readiness,
      createdAt: CREATED_AT
    }));
    const snapshot = result.value;
    const final = snapshot?.finalPrescription;
    check(!result.error, "hard_safety_input_does_not_throw", { index, readiness }, result.error?.message);
    check(final?.recommendationType === expectedType, "hard_safety_controls_recommendation_type", { index, readiness, expectedType }, final?.recommendationType);
    check(final?.progressionAction === expectedAction, "hard_safety_controls_progression_action", { index, readiness, expectedAction }, final?.progressionAction);
    check(final?.executionBlocked === true, "hard_safety_blocks_execution", { index, readiness }, final?.executionBlocked);
    check(final?.safetyRestriction?.status === "blocked", "hard_safety_emits_blocking_restriction", { index, readiness }, final?.safetyRestriction);
    check(final?.safetyRestriction?.scope === expectedScope, "hard_safety_scope_is_specific_and_conservative", { index, readiness, expectedScope }, final?.safetyRestriction);
    check(
      final?.readinessAdjustment?.loadChangePercent === 0
        && final?.readinessAdjustment?.signals?.some((signal) => signal.domain === expectedDomain),
      "hard_safety_is_not_misrepresented_as_a_reduced_load_test",
      { index, readiness, expectedDomain },
      final?.readinessAdjustment
    );
    check(
      !["progress", "exercise_deload", "muscle_group_deload", "full_program_deload", "light_session"].includes(final?.recommendationType)
        && !/^increase_|^add_|^progress_/.test(final?.progressionAction || ""),
      "hard_safety_supersedes_progression_and_deload_scope",
      { index, readiness },
      { type: final?.recommendationType, action: final?.progressionAction }
    );
    const restored = capture(() => P.deserializeRecommendationSnapshot(P.serializeRecommendationSnapshot(snapshot)));
    check(
      !restored.error && restored.value?.finalPrescription?.executionBlocked === true
        && restored.value?.finalPrescription?.progressionAction === expectedAction
        && restored.value?.checksum === snapshot?.checksum,
      "hard_safety_survives_versioned_serialization",
      { index, readiness },
      restored.error?.message || { blocked: restored.value?.finalPrescription?.executionBlocked, action: restored.value?.finalPrescription?.progressionAction, checksum: restored.value?.checksum }
    );
    expectThrow(() => engine.applyManualOverride(snapshot, { load: 1 }, { createdAt: CREATED_AT }), /safety|blocked|pain|illness|load|override/i, "hard_safety_rejects_load_override", { index, readiness });
  });
}

// 8. Determinism, version pairs, nutrition locality, and custom identity failures.
for (let index = 0; index < CASES_PER_GROUP; index += 1) {
  runCase("determinism_serialization_custom", index, () => {
    const trainingGoal = canonicalGoals[index % canonicalGoals.length];
    const experienceLevel = ["novice", "intermediate", "advanced"][index % 3];
    const nutritionPhase = ["deficit", "maintenance", "recomposition", "surplus"][index % 4];
    const options = {
      exerciseId: "ex_barbell_bench_press",
      muscleGroupId: "chest",
      trainingGoal,
      experienceLevel,
      createdAt: CREATED_AT
    };
    const first = capture(() => engine.prescribeExercise({ ...options, nutritionPhase }));
    const second = capture(() => engine.prescribeExercise({ ...options, nutritionPhase }));
    const phaseFree = capture(() => engine.prescribeExercise(options));
    const snapshot = first.value;
    const serialized = capture(() => P.serializeRecommendationSnapshot(snapshot));
    const restored = capture(() => P.deserializeRecommendationSnapshot(serialized.value));
    const activeCustom = customEngines[index % customEngines.length];
    const identifier = ["custom_fuzz_mapped", "ex_dumbbell_bench_press", "db bench press"][index % 3];
    const excluded = capture(() => activeCustom.rankExercisePool("chest", {
      availableEquipment: ["cable"],
      excludedExerciseIds: [identifier],
      maxCandidates: 5,
      generatedAt: CREATED_AT
    }));
    check(!first.error && !second.error && !phaseFree.error && !serialized.error && !restored.error && !excluded.error, "determinism_and_custom_supported_inputs_do_not_throw", { index, options, nutritionPhase, identifier }, [first.error, second.error, phaseFree.error, serialized.error, restored.error, excluded.error].map((error) => error?.message));
    check(json(first.value) === json(second.value), "fixed_seed_time_and_input_produce_identical_snapshot", { index, options, nutritionPhase }, { first: first.value?.recommendationId, second: second.value?.recommendationId });
    check(first.value?.recommendationId === second.value?.recommendationId && first.value?.checksum === second.value?.checksum, "deterministic_identity_and_checksum_are_stable", { index, options, nutritionPhase }, { firstId: first.value?.recommendationId, secondId: second.value?.recommendationId, firstChecksum: first.value?.checksum, secondChecksum: second.value?.checksum });
    check(json(restored.value) === json(snapshot), "serialized_snapshot_round_trip_is_lossless", { index, options, nutritionPhase }, restored.error?.message);
    check(
      snapshot?.engineVersion === P.ENGINE_VERSION
        && snapshot?.schemaVersion === P.SNAPSHOT_SCHEMA_VERSION
        && snapshot?.recommendationVersion === P.PRESCRIPTION_SCHEMA_VERSION
        && snapshot?.basePrescription?.schemaVersion === P.PRESCRIPTION_SCHEMA_VERSION
        && snapshot?.finalPrescription?.schemaVersion === P.PRESCRIPTION_SCHEMA_VERSION,
      "material_version_pair_is_current_and_coherent",
      { index, options, nutritionPhase },
      { engine: snapshot?.engineVersion, snapshot: snapshot?.schemaVersion, recommendation: snapshot?.recommendationVersion, base: snapshot?.basePrescription?.schemaVersion, final: snapshot?.finalPrescription?.schemaVersion }
    );
    check(
      snapshot?.createdAt === CREATED_AT && snapshot?.recommendationId?.includes("20260714")
        && snapshot?.manualOverrides?.length === 0 && snapshot?.overrideLocked === false,
      "fixed_timestamp_and_unmodified_lineage_are_preserved",
      { index, options, nutritionPhase },
      { createdAt: snapshot?.createdAt, id: snapshot?.recommendationId, overrides: snapshot?.manualOverrides, locked: snapshot?.overrideLocked }
    );
    check(
      json(doseProjection(snapshot?.basePrescription || {})) === json(doseProjection(phaseFree.value?.basePrescription || {}))
        && snapshot?.basePrescription?.programmingContext?.nutritionPhase?.resolvedValue === nutritionPhase
        && snapshot?.recommendationId !== phaseFree.value?.recommendationId,
      "nutrition_context_changes_identity_but_not_unearned_dose",
      { index, options, nutritionPhase },
      { withPhase: doseProjection(snapshot?.basePrescription || {}), withoutPhase: doseProjection(phaseFree.value?.basePrescription || {}), phaseContext: snapshot?.basePrescription?.programmingContext?.nutritionPhase, withId: snapshot?.recommendationId, withoutId: phaseFree.value?.recommendationId }
    );
    check(
      !excluded.value?.candidates?.some((candidate) => candidate.exerciseId === "custom_fuzz_mapped" || candidate.researchExerciseId === "ex_dumbbell_bench_press"),
      "custom_or_canonical_alias_exclusion_removes_reconciled_identity",
      { index, identifier },
      excluded.value?.candidates?.map((candidate) => [candidate.exerciseId, candidate.researchExerciseId])
    );
    check(
      excluded.value?.exclusionResolution?.excludedExerciseIds?.includes("custom_fuzz_mapped")
        && excluded.value?.exclusionResolution?.excludedResearchExerciseIds?.includes("ex_dumbbell_bench_press")
        && !excluded.value?.candidates?.some((candidate) => ["custom_fuzz_mapped", "ex_dumbbell_bench_press"].includes(candidate.preferredReplacementExerciseId)),
      "custom_exclusion_provenance_and_substitution_are_identity_bound",
      { index, identifier },
      { resolution: excluded.value?.exclusionResolution, candidates: excluded.value?.candidates?.map((candidate) => ({ id: candidate.exerciseId, replacement: candidate.preferredReplacementExerciseId })) }
    );
    expectThrow(() => activeCustom.rankExercisePool("chest", { excludedExerciseIds: ["custom_fuzz_invalid"], generatedAt: CREATED_AT }), /invalid|identity|resolve|unknown/i, "invalid_trusted_custom_identity_fails_closed", { index });
  });
}

const runtimeMs = Math.round((performance.now() - startedAt) * 10) / 10;
if (cases !== EXPECTED_CASES || assertions !== EXPECTED_ASSERTIONS) {
  coverageFailures.push({ expectedCases: EXPECTED_CASES, actualCases: cases, expectedAssertions: EXPECTED_ASSERTIONS, actualAssertions: assertions });
}
if (runtimeMs > MAX_RUNTIME_MS) {
  failures.push({ invariant: "runtime_budget", context: { maximumMs: MAX_RUNTIME_MS }, observed: runtimeMs });
}

const firstFailureByInvariant = Object.fromEntries(failures.reduce((samples, failure) => {
  if (!samples.has(failure.invariant)) samples.set(failure.invariant, failure);
  return samples;
}, new Map()));

const report = {
  harnessVersion: HARNESS_VERSION,
  seedHex: `0x${SEED.toString(16)}`,
  fixedTimestamp: CREATED_AT,
  engineVersion: P.ENGINE_VERSION,
  snapshotSchemaVersion: P.SNAPSHOT_SCHEMA_VERSION,
  prescriptionSchemaVersion: P.PRESCRIPTION_SCHEMA_VERSION,
  publicResearchVersion: String(researchData.manifest.database_version || researchData.manifest.databaseVersion || "unknown"),
  expectedCases: EXPECTED_CASES,
  cases,
  expectedAssertions: EXPECTED_ASSERTIONS,
  assertions,
  groupCounts,
  runtimeMs,
  runtimeBudgetMs: MAX_RUNTIME_MS,
  failures: failures.length,
  failureCounts: Object.fromEntries([...failures.reduce((counts, failure) => {
    counts.set(failure.invariant, (counts.get(failure.invariant) || 0) + 1);
    return counts;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right))),
  coverageFailures: coverageFailures.length
};

console.log(JSON.stringify(report, null, 2));
if (coverageFailures.length) {
  console.error("Coverage-count contract failures:");
  console.error(JSON.stringify(coverageFailures.slice(0, 20), null, 2));
}
if (failures.length) {
  console.error("First failure for each invariant:");
  console.error(JSON.stringify(firstFailureByInvariant, null, 2));
}
if (coverageFailures.length || failures.length) process.exitCode = 1;
