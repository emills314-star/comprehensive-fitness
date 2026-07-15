"use strict";

const assert = require("node:assert/strict");
const {
  createPrescriptionEngine
} = require("../prescription-engine");

const CREATED_AT = "2026-07-14T12:00:00.000Z";
const EXPECTED_EXERCISE_COUNT = 62;
const EXPECTED_RELATIONSHIP_COUNT = 151;
const EXPECTED_ALIAS_COUNT = 66;
const EXPECTED_DIRECT_TARGET_COUNT = 59;
const ZERO_DIRECT_EXCEPTIONS = new Map([
  ["ex_farmers_carry", "Farmer's Carry"],
  ["ex_pallof_press", "Pallof Press"],
  ["ex_side_plank", "Side Plank"]
]);
const BROAD_NON_EXERCISE_ALIASES = ["Back", "Shoulders", "Core", "Glutes"];
const REQUIRED_ADAPTER_METHODS = [
  "resolveExerciseIdentity",
  "resolveDefaultPrescriptionTarget"
];

const publicExerciseDatabase = require("../research_database/exports/json/exercise_database.json");
const publicExerciseMuscleMap = require("../research_database/exports/json/exercise_muscle_map.json");
const publicExerciseSubstitutionMap = require("../research_database/exports/json/exercise_substitution_map.json");
const publicMuscleGroupRecommendations = require("../research_database/exports/json/muscle_group_recommendations.json");
const publicProgressionRules = require("../research_database/exports/json/progression_rules.json");
const publicNutritionStrategies = require("../research_database/exports/json/nutrition_strategies.json");
const publicManifest = require("../research_database/exports/json/manifest.json");

function clone(value) {
  return structuredClone(value);
}

function publicResearchData(overrides = {}) {
  return {
    exerciseDatabase: clone(overrides.exerciseDatabase || publicExerciseDatabase),
    exerciseMuscleMap: clone(overrides.exerciseMuscleMap || publicExerciseMuscleMap),
    exerciseSubstitutionMap: clone(publicExerciseSubstitutionMap),
    muscleGroupRecommendations: clone(publicMuscleGroupRecommendations),
    progressionRules: clone(publicProgressionRules),
    nutritionStrategies: clone(publicNutritionStrategies),
    manifest: clone(publicManifest)
  };
}

function createPublicEngine(overrides = {}) {
  return createPrescriptionEngine({
    personalData: overrides.personalData || {},
    researchData: publicResearchData(overrides)
  });
}

function aliasesFor(exercise) {
  return String(exercise.exercise_aliases || "")
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);
}

function engineEquivalentIdentityKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function identitySpellingsForExercise(exercise) {
  return [
    { kind: "canonical_name", value: exercise.exercise_name },
    ...aliasesFor(exercise).map((value) => ({ kind: "exported_alias", value }))
  ];
}

function engineEquivalentVariantCases(spelling) {
  const source = String(spelling.value);
  const trimmed = source.trim();
  const variants = [
    { kind: "original", value: source },
    { kind: "case", value: trimmed.toUpperCase() },
    { kind: "surrounding_whitespace", value: ` \t${trimmed}\n ` }
  ];
  if (/[\s_-]/.test(trimmed)) {
    [
      ["separator_space", " "],
      ["separator_hyphen", "-"],
      ["separator_underscore", "_"]
    ].forEach(([kind, separator]) => {
      variants.push({ kind, value: trimmed.replace(/[\s_-]+/g, separator) });
    });
  }
  const expectedKey = engineEquivalentIdentityKey(source);
  variants.forEach((variant) => {
    assert.equal(
      engineEquivalentIdentityKey(variant.value),
      expectedKey,
      `${JSON.stringify(variant.value)} must be an engine-equivalent ${variant.kind} variant of ${JSON.stringify(source)}`
    );
  });
  return variants;
}

function positiveDynamicDirectRelationships(rows) {
  return rows.filter((row) => row.relationship_type === "direct_load"
    && ["dynamic", "mixed"].includes(row.loading_role)
    && Number(row.fractional_set_credit) > 0);
}

function targetContractView(result) {
  return {
    status: result?.status,
    exerciseId: result?.exerciseId,
    muscleGroupId: result?.muscleGroupId,
    relationshipType: result?.relationshipType,
    taxonomyVersion: result?.taxonomyVersion,
    reason: result?.reason
  };
}

function assertResolvedIdentity(result, expectedExerciseId, context) {
  assert.equal(result?.status, "resolved", `${context}: identity must resolve`);
  assert.equal(result.exerciseId, expectedExerciseId, `${context}: identity must retain the canonical exercise ID`);
  assert.ok(Object.prototype.hasOwnProperty.call(result, "source"), `${context}: identity resolution must disclose its source`);
  assert.ok(result.source, `${context}: identity resolution source must not be empty`);
}

function assertUnknownIdentity(result, context) {
  assert.equal(result?.status, "unresolved", `${context}: identity must remain unresolved`);
  assert.equal(result.reason, "unknown_exercise_identity", `${context}: identity must use the unknown fail-closed reason`);
}

function assertResolvedTarget(result, expected, context) {
  assert.equal(result?.status, "resolved", `${context}: default target must resolve`);
  assert.equal(result.exerciseId, expected.exerciseId, `${context}: target must retain the canonical exercise ID`);
  assert.equal(result.muscleGroupId, expected.muscleGroupId, `${context}: target must retain the exact canonical mg_* ID`);
  assert.equal(result.relationshipType, "direct_load", `${context}: defaults may only use direct_load relationships`);
  assert.equal(result.taxonomyVersion, expected.taxonomyVersion, `${context}: target must disclose the relationship taxonomy version`);
}

function deterministicShuffle(rows) {
  const shuffled = clone(rows);
  let state = 0x51f15e;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const target = (state >>> 0) % (index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

const exercisesById = new Map(publicExerciseDatabase.map((exercise) => [exercise.exercise_id, exercise]));
const relationshipsByExercise = new Map(publicExerciseDatabase.map((exercise) => [exercise.exercise_id, []]));
publicExerciseMuscleMap.forEach((relationship) => {
  if (!relationshipsByExercise.has(relationship.exercise_id)) relationshipsByExercise.set(relationship.exercise_id, []);
  relationshipsByExercise.get(relationship.exercise_id).push(relationship);
});
const exportedAliases = publicExerciseDatabase.flatMap((exercise) => aliasesFor(exercise).map((alias) => ({
  alias,
  exerciseId: exercise.exercise_id,
  canonicalName: exercise.exercise_name
})));
const publicIdentitySpellings = publicExerciseDatabase.flatMap((exercise) => identitySpellingsForExercise(exercise).map((spelling) => ({
  ...spelling,
  exerciseId: exercise.exercise_id
})));
const publicIdentityVariantCases = publicIdentitySpellings.flatMap((spelling) => engineEquivalentVariantCases(spelling).map((variant) => ({
  ...variant,
  sourceKind: spelling.kind,
  sourceValue: spelling.value,
  exerciseId: spelling.exerciseId
})));
const separatorApplicableSpellingCount = publicIdentitySpellings.filter(({ value }) => /[\s_-]/.test(value.trim())).length;
const expectedDirectTargets = new Map();
publicExerciseDatabase.forEach((exercise) => {
  const direct = positiveDynamicDirectRelationships(relationshipsByExercise.get(exercise.exercise_id) || []);
  if (direct.length === 1) expectedDirectTargets.set(exercise.exercise_id, direct[0]);
});

const baseEngine = createPublicEngine();
const missingAdapterMethods = REQUIRED_ADAPTER_METHODS.filter((method) => typeof baseEngine[method] !== "function");
const adapterReady = missingAdapterMethods.length === 0;
const groups = [];

function group(name, fn, options = {}) {
  groups.push({ name, fn, requiresAdapter: Boolean(options.requiresAdapter) });
}

group("fixture inventory and direct-target classification are exact and non-vacuous", () => {
  assert.equal(publicExerciseDatabase.length, EXPECTED_EXERCISE_COUNT, "research exercise inventory drifted");
  assert.equal(publicExerciseMuscleMap.length, EXPECTED_RELATIONSHIP_COUNT, "research exercise-muscle relationship inventory drifted");
  assert.equal(exercisesById.size, EXPECTED_EXERCISE_COUNT, "canonical exercise IDs must be unique");
  assert.equal(exportedAliases.length, EXPECTED_ALIAS_COUNT, "exported exercise alias count drifted");
  assert.equal(new Set(exportedAliases.map(({ alias }) => engineEquivalentIdentityKey(alias))).size, EXPECTED_ALIAS_COUNT, "aliases must remain unique under the engine's case, whitespace, and separator normalization");
  assert.equal(publicIdentitySpellings.length, EXPECTED_EXERCISE_COUNT + EXPECTED_ALIAS_COUNT, "every canonical name and exported alias must enter normalized-variant coverage");
  assert.equal(new Set(publicIdentitySpellings.map(({ value }) => engineEquivalentIdentityKey(value))).size, publicIdentitySpellings.length, "canonical names and aliases must not collide under engine-equivalent normalization");
  assert.ok(separatorApplicableSpellingCount > 0, "separator-equivalence coverage must have applicable canonical names or aliases");
  const variantKindCounts = Object.fromEntries([...new Set(publicIdentityVariantCases.map(({ kind }) => kind))].map((kind) => [kind, publicIdentityVariantCases.filter((variant) => variant.kind === kind).length]));
  assert.equal(variantKindCounts.original, publicIdentitySpellings.length, "every canonical name and alias must retain its original spelling case");
  assert.equal(variantKindCounts.case, publicIdentitySpellings.length, "every canonical name and alias must receive a case variant");
  assert.equal(variantKindCounts.surrounding_whitespace, publicIdentitySpellings.length, "every canonical name and alias must receive a surrounding-whitespace variant");
  ["separator_space", "separator_hyphen", "separator_underscore"].forEach((kind) => {
    assert.equal(variantKindCounts[kind], separatorApplicableSpellingCount, `every separator-bearing name and alias must receive a ${kind} variant`);
    assert.ok(publicIdentityVariantCases.some((variant) => variant.kind === kind && variant.value !== variant.sourceValue), `${kind} coverage must include a materially different spelling`);
  });
  assert.ok(publicIdentityVariantCases.some((variant) => variant.kind === "case" && variant.value !== variant.sourceValue), "case coverage must include a materially different spelling");
  assert.ok(publicIdentityVariantCases.some((variant) => variant.kind === "surrounding_whitespace" && variant.value !== variant.sourceValue), "whitespace coverage must include a materially different spelling");
  assert.equal(expectedDirectTargets.size, EXPECTED_DIRECT_TARGET_COUNT, "exactly 59 catalog exercises must expose one positive dynamic-capable direct target");

  const nonSingleDirect = [];
  publicExerciseDatabase.forEach((exercise) => {
    const rows = relationshipsByExercise.get(exercise.exercise_id) || [];
    assert.ok(rows.length > 0, `${exercise.exercise_id} must have at least one taxonomy relationship`);
    const direct = positiveDynamicDirectRelationships(rows);
    if (direct.length !== 1) nonSingleDirect.push([exercise.exercise_id, exercise.exercise_name, direct.length]);
    direct.forEach((relationship) => {
      assert.match(relationship.muscle_group_id, /^mg_[a-z0-9_]+$/, `${exercise.exercise_id} direct target must use an exact mg_* ID`);
      assert.equal(relationship.relationship_type, "direct_load");
      assert.ok(relationship.taxonomy_version, `${exercise.exercise_id} direct target must be versioned`);
    });
  });
  assert.deepEqual(nonSingleDirect, [...ZERO_DIRECT_EXCEPTIONS].map(([exerciseId, exerciseName]) => [exerciseId, exerciseName, 0]), "only the three named isometric exercises may lack one direct default target");

  ZERO_DIRECT_EXCEPTIONS.forEach((exerciseName, exerciseId) => {
    assert.equal(exercisesById.get(exerciseId)?.exercise_name, exerciseName, `${exerciseId} exception identity drifted`);
    const rows = relationshipsByExercise.get(exerciseId) || [];
    assert.ok(rows.length > 0, `${exerciseName} must retain explicit zero-credit relationships`);
    rows.forEach((relationship) => {
      assert.equal(relationship.relationship_type, "isometric_stabilizing_load", `${exerciseName} must not gain a dynamic hypertrophy relationship by default`);
      assert.equal(relationship.loading_role, "isometric", `${exerciseName} must retain an isometric loading role`);
      assert.equal(Number(relationship.fractional_set_credit), 0, `${exerciseName} must retain zero hypertrophy credit`);
    });
  });

  const abWheel = expectedDirectTargets.get("ex_ab_wheel");
  assert.equal(abWheel?.muscle_group_id, "mg_abdominals", "Ab Wheel Rollout must retain its direct abdominal default");
  assert.equal(abWheel?.loading_role, "mixed", "mixed dynamic/isometric loading must remain eligible for the Ab Wheel's direct target");
});

group("PrescriptionEngine exposes the canonical identity and default-target adapter API", () => {
  assert.deepEqual(
    missingAdapterMethods,
    [],
    `Missing required canonical-target adapter method(s): ${missingAdapterMethods.map((method) => `PrescriptionEngine#${method}`).join(", ")}`
  );
});

group("all canonical names and 66 aliases resolve across engine-equivalent case, whitespace, and separator variants", () => {
  publicExerciseDatabase.forEach((exercise) => {
    assertResolvedIdentity(baseEngine.resolveExerciseIdentity(exercise.exercise_id), exercise.exercise_id, exercise.exercise_id);
    identitySpellingsForExercise(exercise).forEach((spelling) => {
      engineEquivalentVariantCases(spelling).forEach((variant) => {
        assertResolvedIdentity(
          baseEngine.resolveExerciseIdentity(variant.value),
          exercise.exercise_id,
          `${exercise.exercise_id} ${spelling.kind} ${JSON.stringify(spelling.value)} ${variant.kind}`
        );
      });
    });
  });
}, { requiresAdapter: true });

group("59 dynamic-capable exercises resolve exact versioned mg_* defaults and three isometric exceptions fail closed", () => {
  expectedDirectTargets.forEach((relationship, exerciseId) => {
    const exercise = exercisesById.get(exerciseId);
    const expected = {
      exerciseId,
      muscleGroupId: relationship.muscle_group_id,
      taxonomyVersion: relationship.taxonomy_version
    };
    assertResolvedTarget(baseEngine.resolveDefaultPrescriptionTarget(exerciseId), expected, exerciseId);
    identitySpellingsForExercise(exercise).forEach((spelling) => {
      engineEquivalentVariantCases(spelling).forEach((variant) => {
        assertResolvedTarget(
          baseEngine.resolveDefaultPrescriptionTarget(variant.value),
          expected,
          `${exerciseId} ${spelling.kind} ${JSON.stringify(spelling.value)} ${variant.kind}`
        );
      });
    });
  });
  ZERO_DIRECT_EXCEPTIONS.forEach((exerciseName, exerciseId) => {
    const exercise = exercisesById.get(exerciseId);
    const aliases = aliasesFor(exercise);
    assert.ok(aliases.length > 0, `${exerciseName} must retain at least one exported alias for the alias fail-closed contract`);
    const exactInputCases = [
      { kind: "canonical_id", value: exerciseId },
      { kind: "canonical_name", value: exercise.exercise_name },
      ...aliases.map((value) => ({ kind: "exported_alias", value }))
    ];
    const normalizedVariantCases = identitySpellingsForExercise(exercise).flatMap((spelling) => engineEquivalentVariantCases(spelling)
      .filter((variant) => variant.kind !== "original")
      .map((variant) => ({
        kind: `${spelling.kind}_${variant.kind}`,
        value: variant.value
      })));
    [...exactInputCases, ...normalizedVariantCases].forEach((input) => {
      const result = baseEngine.resolveDefaultPrescriptionTarget(input.value);
      assert.equal(result?.status, "ineligible", `${exerciseName} via ${input.kind} must not receive a fabricated default target`);
      assert.equal(result.exerciseId, exerciseId, `${exerciseName} via ${input.kind} must retain its resolved canonical identity in the ineligible result`);
      assert.equal(result.reason, "no_dynamic_direct_target", `${exerciseName} via ${input.kind} must disclose why it has no default prescription target`);
    });
  });
}, { requiresAdapter: true });

group("default target resolution is invariant to exercise-muscle relationship order", () => {
  const shuffledRelationships = deterministicShuffle(publicExerciseMuscleMap);
  assert.notDeepEqual(
    shuffledRelationships.slice(0, 12).map((row) => row.exercise_muscle_map_id),
    publicExerciseMuscleMap.slice(0, 12).map((row) => row.exercise_muscle_map_id),
    "deterministic fixture shuffle must materially change relationship order"
  );
  const shuffledEngine = createPublicEngine({ exerciseMuscleMap: shuffledRelationships });
  publicExerciseDatabase.forEach((exercise) => {
    assert.deepEqual(
      targetContractView(shuffledEngine.resolveDefaultPrescriptionTarget(exercise.exercise_id)),
      targetContractView(baseEngine.resolveDefaultPrescriptionTarget(exercise.exercise_id)),
      `${exercise.exercise_id} default target changed when relationship rows were shuffled`
    );
  });
}, { requiresAdapter: true });

group("synthetic zero-direct and multi-direct catalogs fail closed with distinct reasons", () => {
  const syntheticExercises = [
    {
      exercise_id: "ex_synthetic_zero_direct",
      exercise_name: "Synthetic Fractional Only",
      exercise_aliases: "synthetic zero direct",
      primary_muscles: "mg_triceps"
    },
    {
      exercise_id: "ex_synthetic_multi_direct",
      exercise_name: "Synthetic Ambiguous Direct",
      exercise_aliases: "synthetic multi direct",
      primary_muscles: "mg_biceps|mg_triceps"
    }
  ];
  const relationshipBase = {
    loading_role: "dynamic",
    range_of_motion_role: "meaningful",
    evidence_basis: "public_synthetic_contract_fixture",
    evidence_notes: "Synthetic public test row.",
    confidence_rating: "moderate",
    review_status: "reviewed",
    taxonomy_version: "synthetic-1.0.0",
    last_reviewed_date: "2026-07-14"
  };
  const syntheticRelationships = [
    {
      ...relationshipBase,
      exercise_muscle_map_id: "emm_synthetic_zero_1",
      exercise_id: "ex_synthetic_zero_direct",
      muscle_group_id: "mg_triceps",
      programming_family_id: "triceps",
      relationship_type: "meaningful_fractional_load",
      fractional_set_credit: 0.5,
      local_fatigue_weight: 0.5
    },
    {
      ...relationshipBase,
      exercise_muscle_map_id: "emm_synthetic_multi_1",
      exercise_id: "ex_synthetic_multi_direct",
      muscle_group_id: "mg_biceps",
      programming_family_id: "biceps",
      relationship_type: "direct_load",
      fractional_set_credit: 1,
      local_fatigue_weight: 1
    },
    {
      ...relationshipBase,
      exercise_muscle_map_id: "emm_synthetic_multi_2",
      exercise_id: "ex_synthetic_multi_direct",
      muscle_group_id: "mg_triceps",
      programming_family_id: "triceps",
      relationship_type: "direct_load",
      fractional_set_credit: 1,
      local_fatigue_weight: 1
    }
  ];
  const syntheticEngine = createPublicEngine({
    exerciseDatabase: [...clone(publicExerciseDatabase), ...syntheticExercises],
    exerciseMuscleMap: [...clone(publicExerciseMuscleMap), ...syntheticRelationships]
  });

  assertResolvedIdentity(syntheticEngine.resolveExerciseIdentity("synthetic zero direct"), "ex_synthetic_zero_direct", "synthetic zero-direct alias");
  assertResolvedIdentity(syntheticEngine.resolveExerciseIdentity("synthetic multi direct"), "ex_synthetic_multi_direct", "synthetic multi-direct alias");
  const zero = syntheticEngine.resolveDefaultPrescriptionTarget("ex_synthetic_zero_direct");
  const multi = syntheticEngine.resolveDefaultPrescriptionTarget("ex_synthetic_multi_direct");
  assert.equal(zero?.status, "ineligible");
  assert.equal(zero.reason, "no_dynamic_direct_target");
  assert.equal(multi?.status, "ineligible");
  assert.equal(multi.reason, "ambiguous_dynamic_direct_target");
  assert.notEqual(zero.reason, multi.reason, "zero-direct and multi-direct ambiguity must remain distinguishable");
}, { requiresAdapter: true });

group("explicit fractional targets remain valid while unrelated explicit targets are rejected", () => {
  const benchTriceps = (relationshipsByExercise.get("ex_barbell_bench_press") || []).find((row) => row.muscle_group_id === "mg_triceps");
  assert.equal(benchTriceps?.relationship_type, "meaningful_fractional_load", "fractional-target fixture drifted");
  assert.ok(Number(benchTriceps.fractional_set_credit) > 0, "fractional-target fixture must retain positive credit");
  const fractionalSnapshot = baseEngine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "mg_triceps",
    availableEquipment: ["all"],
    createdAt: CREATED_AT
  });
  [
    ["snapshot", fractionalSnapshot],
    ["basePrescription", fractionalSnapshot.basePrescription],
    ["finalPrescription", fractionalSnapshot.finalPrescription]
  ].forEach(([layer, prescription]) => {
    assert.equal(prescription?.muscleGroupId, "mg_triceps", `${layer} must preserve the caller's exact positive fractional target`);
    assert.equal(prescription?.exerciseId, "ex_barbell_bench_press", `${layer} must preserve the selected canonical exercise identity`);
  });
  assert.equal(fractionalSnapshot.basePrescription.researchExerciseId, "ex_barbell_bench_press", "basePrescription must retain the canonical research identity");
  assert.equal(fractionalSnapshot.finalPrescription.researchExerciseId, "ex_barbell_bench_press", "finalPrescription must retain the canonical research identity");
  assert.throws(() => baseEngine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "mg_calves_gastroc",
    availableEquipment: ["all"],
    createdAt: CREATED_AT
  }), /taxonomy|target relationship|muscle/i, "an unrelated explicit target must fail closed");
});

group("broad body-region labels do not become exercise aliases or default targets", () => {
  const normalizedExportedAliases = new Set(exportedAliases.map(({ alias }) => engineEquivalentIdentityKey(alias)));
  BROAD_NON_EXERCISE_ALIASES.forEach((value) => {
    assert.ok(!normalizedExportedAliases.has(engineEquivalentIdentityKey(value)), `${value} unexpectedly became an exported exercise alias fixture`);
    assertUnknownIdentity(baseEngine.resolveExerciseIdentity(value), value);
    const target = baseEngine.resolveDefaultPrescriptionTarget(value);
    assert.equal(target?.status, "ineligible", `${value} must not become a default prescription target`);
    assert.equal(target.reason, "unknown_exercise_identity", `${value} must fail at the identity boundary`);
  });
}, { requiresAdapter: true });

group("valid crosswalks resolve canonically while invalid and unmapped custom identities fail closed", () => {
  const customEngine = createPublicEngine({
    personalData: {
      exerciseScores: [
        {
          exercise_id: "custom_valid_press",
          exercise_name: "My Valid Press",
          research_exercise_id: "ex_barbell_bench_press"
        },
        {
          exercise_id: "custom_invalid_press",
          exercise_name: "My Invalid Press",
          research_exercise_id: "ex_missing_research_exercise"
        },
        {
          exercise_id: "custom_unmapped_press",
          exercise_name: "Unlisted Quantum Press"
        }
      ],
      metadata: { methodology_version: "public-canonical-target-contract/1.0.0" }
    }
  });

  assertResolvedIdentity(customEngine.resolveExerciseIdentity("custom_valid_press"), "ex_barbell_bench_press", "valid reconciled personal crosswalk");
  assertResolvedTarget(customEngine.resolveDefaultPrescriptionTarget("custom_valid_press"), {
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "mg_chest_sternal",
    taxonomyVersion: expectedDirectTargets.get("ex_barbell_bench_press").taxonomy_version
  }, "valid reconciled personal crosswalk");

  const invalidIdentity = customEngine.resolveExerciseIdentity("custom_invalid_press");
  assert.equal(invalidIdentity?.status, "unresolved");
  assert.equal(invalidIdentity.reason, "invalid_reconciled_identity");
  const invalidTarget = customEngine.resolveDefaultPrescriptionTarget("custom_invalid_press");
  assert.equal(invalidTarget?.status, "ineligible");
  assert.equal(invalidTarget.reason, "invalid_reconciled_identity");

  const unmappedIdentity = customEngine.resolveExerciseIdentity("custom_unmapped_press");
  assertUnknownIdentity(unmappedIdentity, "unmapped custom identity");
  if (Object.prototype.hasOwnProperty.call(unmappedIdentity, "exerciseId")) {
    assert.equal(unmappedIdentity.exerciseId, "custom_unmapped_press", "an unresolved custom may disclose only its stable personal ID");
  }
  const unmappedTarget = customEngine.resolveDefaultPrescriptionTarget("custom_unmapped_press");
  assert.equal(unmappedTarget?.status, "ineligible");
  assert.equal(unmappedTarget.reason, "unknown_exercise_identity");
}, { requiresAdapter: true });

group("stored broad primary-muscle metadata cannot alter a catalog-derived default target", () => {
  const expected = targetContractView(baseEngine.resolveDefaultPrescriptionTarget("ex_barbell_bench_press"));
  assert.equal(expected.muscleGroupId, "mg_chest_sternal", "counterfactual fixture must start from the exact bench target");
  BROAD_NON_EXERCISE_ALIASES.forEach((broadPrimary) => {
    const counterfactualExercises = clone(publicExerciseDatabase).map((exercise) => exercise.exercise_id === "ex_barbell_bench_press"
      ? { ...exercise, primary_muscles: broadPrimary, primaryMuscles: broadPrimary }
      : exercise);
    const counterfactualEngine = createPublicEngine({ exerciseDatabase: counterfactualExercises });
    assert.deepEqual(
      targetContractView(counterfactualEngine.resolveDefaultPrescriptionTarget("ex_barbell_bench_press")),
      expected,
      `stored primary_muscles=${broadPrimary} changed the canonical relationship-derived target`
    );
  });
}, { requiresAdapter: true });

const failures = [];
const blocked = [];
let passed = 0;
groups.forEach(({ name, fn, requiresAdapter }) => {
  if (requiresAdapter && !adapterReady) {
    blocked.push(name);
    console.log(`BLOCKED ${name}: canonical-target adapter API is not implemented yet.`);
    return;
  }
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL ${name}`);
    console.error(error?.stack || error);
  }
});

console.log(JSON.stringify({
  passed_groups: passed,
  failed_groups: failures.length,
  blocked_groups: blocked.length,
  exercise_count: publicExerciseDatabase.length,
  relationship_count: publicExerciseMuscleMap.length,
  exported_alias_count: exportedAliases.length,
  dynamic_direct_target_count: expectedDirectTargets.size,
  zero_direct_exception_count: ZERO_DIRECT_EXCEPTIONS.size,
  identity_spelling_count: publicIdentitySpellings.length,
  normalized_variant_case_count: publicIdentityVariantCases.length,
  separator_applicable_spelling_count: separatorApplicableSpellingCount
}, null, 2));

if (failures.length || blocked.length) {
  console.error(`Canonical-target adapter contract is red: ${failures.length} failed and ${blocked.length} blocked group(s).`);
  process.exit(1);
}

console.log(`Canonical-target adapter contract passed (${passed}/${groups.length} groups).`);
