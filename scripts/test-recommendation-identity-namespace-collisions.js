"use strict";

const assert = require("node:assert/strict");
const { createPrescriptionEngine } = require("../prescription-engine");

const TAXONOMY_VERSION = "synthetic-identity-namespace-contract/1.0.0";
const AMBIGUOUS_PUBLIC_REASON = "ambiguous_public_exercise_identity";
const PERSONAL_PUBLIC_COLLISION_REASON = "personal_public_identity_collision";

function clone(value) {
  return structuredClone(value);
}

function identityKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function aliasesFor(row) {
  return String(row.exercise_aliases || "")
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizedVariants(value) {
  const trimmed = String(value).trim();
  const variants = [
    trimmed,
    trimmed.toUpperCase(),
    trimmed.toLowerCase(),
    ` \t${trimmed}\n `,
    trimmed.replace(/[\s_-]+/g, " "),
    trimmed.replace(/[\s_-]+/g, "-"),
    trimmed.replace(/[\s_-]+/g, "_")
  ];
  const uniqueVariants = [...new Set(variants)];
  uniqueVariants.forEach((variant) => {
    assert.equal(identityKey(variant), identityKey(value), `${JSON.stringify(variant)} must remain normalization-equivalent to ${JSON.stringify(value)}.`);
  });
  return uniqueVariants;
}

function exercise(exerciseId, exerciseName, exerciseAliases = "") {
  return {
    exercise_id: exerciseId,
    exercise_name: exerciseName,
    exercise_aliases: exerciseAliases,
    primary_muscles: "mg_chest_sternal"
  };
}

function relationship(exerciseId, index) {
  const targetIds = [
    "mg_chest_sternal",
    "mg_triceps",
    "mg_front_delts",
    "mg_biceps",
    "mg_lats",
    "mg_upper_back",
    "mg_quads",
    "mg_hamstrings",
    "mg_glutes",
    "mg_calves_gastroc",
    "mg_side_delts",
    "mg_rear_delts"
  ];
  const muscleGroupId = targetIds[index % targetIds.length];
  return {
    exercise_muscle_map_id: `emm_identity_namespace_${index + 1}`,
    exercise_id: exerciseId,
    muscle_group_id: muscleGroupId,
    programming_family_id: muscleGroupId.replace(/^mg_/, ""),
    relationship_type: "direct_load",
    loading_role: "dynamic",
    range_of_motion_role: "meaningful",
    fractional_set_credit: 1,
    local_fatigue_weight: 1,
    evidence_basis: "public_synthetic_contract_fixture",
    evidence_notes: "Synthetic row used only to verify identity fail-closed behavior.",
    confidence_rating: "moderate",
    review_status: "reviewed",
    taxonomy_version: TAXONOMY_VERSION,
    last_reviewed_date: "2026-07-15"
  };
}

const exerciseDatabase = [
  exercise("ex_clean_press", "Clean Canonical Press", "Clean Exported Alias"),
  exercise("ex_same_surface_control", "Same Surface Press", "same-surface-press|SAME_SURFACE_PRESS|Unique Safe Surface Alias"),

  exercise("ex_dual_id_press", "Dual ID First", "Dual ID First Alias"),
  exercise("ex_dual__id__press", "Dual ID Second", "Dual ID Second Alias"),

  exercise("ex_twin_name_first", "Twin Name Press", "Twin Name First Alias"),
  exercise("ex_twin_name_second", "Twin-Name-Press", "Twin Name Second Alias"),

  exercise("ex_twin_alias_first", "Twin Alias First", "Twin Alias Press"),
  exercise("ex_twin_alias_second", "Twin Alias Second", "Twin-Alias-Press"),

  exercise("ex_cross_id_name", "Cross ID Owner", "Cross ID Owner Alias"),
  exercise("ex_cross_name_owner", "EX CROSS ID NAME", "Cross Name Owner Alias"),

  exercise("ex_cross_id_alias", "Cross ID Alias Owner", "Cross ID Alias Owner Nickname"),
  exercise("ex_cross_alias_owner", "Cross Alias Owner", "EX-CROSS-ID-ALIAS"),

  exercise("ex_cross_name_alias_first", "Cross Name Alias", "Cross Name First Alias"),
  exercise("ex_cross_name_alias_second", "Cross Name Alias Owner", "cross-name-alias"),

  exercise("ex_public_id_surface", "Public ID Surface Owner", "Public ID Surface Alias"),
  exercise("ex_public_name_owner", "Public Name Surface", "Public Name Owner Alias"),
  exercise("ex_public_alias_owner", "Public Alias Owner", "Public Alias Surface")
];

const exerciseMuscleMap = exerciseDatabase.map((row, index) => relationship(row.exercise_id, index));
const targetByExerciseId = new Map(exerciseMuscleMap.map((row) => [row.exercise_id, row.muscle_group_id]));
const publicIdentityTargets = new Map();
exerciseDatabase.forEach((row) => {
  [row.exercise_id, row.exercise_name, ...aliasesFor(row)].forEach((value) => {
    const key = identityKey(value);
    if (!publicIdentityTargets.has(key)) publicIdentityTargets.set(key, new Set());
    publicIdentityTargets.get(key).add(row.exercise_id);
  });
});

function researchData() {
  return {
    exerciseDatabase: clone(exerciseDatabase),
    exerciseMuscleMap: clone(exerciseMuscleMap),
    exerciseSubstitutionMap: [],
    muscleGroupRecommendations: [],
    progressionRules: [],
    nutritionStrategies: [],
    manifest: { database_version: TAXONOMY_VERSION }
  };
}

function createEngine(personalRows = [], options = {}) {
  const resolvedResearchData = researchData();
  const resolvedPersonalRows = clone(personalRows);
  if (options.reversePublicCatalog) {
    resolvedResearchData.exerciseDatabase.reverse();
    resolvedResearchData.exerciseMuscleMap.reverse();
  }
  if (options.reversePersonalRows) resolvedPersonalRows.reverse();
  return createPrescriptionEngine({
    personalData: {
      exerciseScores: resolvedPersonalRows,
      metadata: { methodology_version: TAXONOMY_VERSION }
    },
    researchData: resolvedResearchData
  });
}

function identityView(result) {
  return {
    status: result?.status,
    exerciseId: result?.exerciseId,
    source: result?.source,
    reason: result?.reason
  };
}

function targetView(result) {
  return {
    status: result?.status,
    exerciseId: result?.exerciseId,
    muscleGroupId: result?.muscleGroupId,
    relationshipType: result?.relationshipType,
    taxonomyVersion: result?.taxonomyVersion,
    reason: result?.reason
  };
}

function actualContract(engine, input) {
  return {
    identity: identityView(engine.resolveExerciseIdentity(input)),
    target: targetView(engine.resolveDefaultPrescriptionTarget(input))
  };
}

function resolvedContract(exerciseId, source) {
  return {
    identity: {
      status: "resolved",
      exerciseId,
      source,
      reason: undefined
    },
    target: {
      status: "resolved",
      exerciseId,
      muscleGroupId: targetByExerciseId.get(exerciseId),
      relationshipType: "direct_load",
      taxonomyVersion: TAXONOMY_VERSION,
      reason: undefined
    }
  };
}

function ambiguousPublicContract() {
  return {
    identity: {
      status: "unresolved",
      exerciseId: undefined,
      source: undefined,
      reason: AMBIGUOUS_PUBLIC_REASON
    },
    target: {
      status: "ineligible",
      exerciseId: undefined,
      muscleGroupId: undefined,
      relationshipType: undefined,
      taxonomyVersion: undefined,
      reason: AMBIGUOUS_PUBLIC_REASON
    }
  };
}

function personalCollisionContract(personalId) {
  return {
    identity: {
      status: "unresolved",
      exerciseId: personalId,
      source: undefined,
      reason: PERSONAL_PUBLIC_COLLISION_REASON
    },
    target: {
      status: "ineligible",
      exerciseId: personalId,
      muscleGroupId: undefined,
      relationshipType: undefined,
      taxonomyVersion: undefined,
      reason: PERSONAL_PUBLIC_COLLISION_REASON
    }
  };
}

const tests = [];

function test(name, fn, category) {
  tests.push({ name, fn, category });
}

const baseEngine = createEngine();
const reversedPublicEngine = createEngine([], { reversePublicCatalog: true });

[
  ["exact canonical ID", "ex_clean_press", "canonical_research_id"],
  ["exact canonical name", "Clean Canonical Press", "canonical_research_name"],
  ["exact exported alias", "Clean Exported Alias", "research_alias"],
  ["normalized canonical ID", "  EX-CLEAN-PRESS  ", "normalized_canonical_research_id"],
  ["normalized canonical name", "CLEAN_CANONICAL_PRESS", "canonical_research_name"],
  ["normalized exported alias", "clean-exported-alias", "research_alias"]
].forEach(([label, input, source]) => {
  test(`noncolliding ${label} remains resolvable`, () => {
    assert.deepEqual(actualContract(baseEngine, input), resolvedContract("ex_clean_press", source));
  }, "noncolliding_public_resolution");
});

test("duplicate normalized name and alias surfaces owned by one canonical exercise remain resolvable", () => {
  const inputs = [
    "ex_same_surface_control",
    "Same Surface Press",
    "same-surface-press",
    "SAME_SURFACE_PRESS",
    "same_surface_press",
    "Unique Safe Surface Alias"
  ];
  const expected = inputs.map((input) => resolvedContract(
    "ex_same_surface_control",
    input === "ex_same_surface_control"
      ? "canonical_research_id"
      : identityKey(input) === identityKey("Same Surface Press")
        ? "canonical_research_name"
        : "research_alias"
  ));
  assert.deepEqual(inputs.map((input) => actualContract(baseEngine, input)), expected);
  assert.deepEqual(inputs.map((input) => actualContract(reversedPublicEngine, input)), expected);
}, "same_exercise_duplicate_surface_control");

const ambiguousPublicCases = [
  ["ID/ID exact underscore spelling", "ex_dual_id_press"],
  ["ID/ID exact repeated-underscore spelling", "ex_dual__id__press"],
  ["ID/ID case-and-hyphen spelling", "EX-DUAL-ID-PRESS"],

  ["name/name exact space spelling", "Twin Name Press"],
  ["name/name exact hyphen spelling", "Twin-Name-Press"],
  ["name/name case-and-underscore spelling", "TWIN_NAME_PRESS"],

  ["alias/alias exact space spelling", "Twin Alias Press"],
  ["alias/alias exact hyphen spelling", "Twin-Alias-Press"],
  ["alias/alias case-and-underscore spelling", "TWIN_ALIAS_PRESS"],

  ["ID/name exact ID spelling", "ex_cross_id_name"],
  ["ID/name exact name spelling", "EX CROSS ID NAME"],
  ["ID/name case-and-hyphen spelling", "EX-CROSS-ID-NAME"],

  ["ID/alias exact ID spelling", "ex_cross_id_alias"],
  ["ID/alias exact alias spelling", "EX-CROSS-ID-ALIAS"],
  ["ID/alias case-and-space spelling", "EX CROSS ID ALIAS"],

  ["name/alias exact name spelling", "Cross Name Alias"],
  ["name/alias exact alias spelling", "cross-name-alias"],
  ["name/alias case-and-underscore spelling", "CROSS_NAME_ALIAS"]
];

ambiguousPublicCases.forEach(([label, input]) => {
  test(`ambiguous public ${label} fails closed in identity and target resolvers`, () => {
    const expected = ambiguousPublicContract();
    assert.deepEqual({
      forwardPublicCatalog: actualContract(baseEngine, input),
      reversedPublicCatalog: actualContract(reversedPublicEngine, input)
    }, {
      forwardPublicCatalog: expected,
      reversedPublicCatalog: expected
    });
  }, "ambiguous_public_namespace");
});

const collisionScenarios = [
  {
    personalRow: {
      exercise_id: "EX-PUBLIC-ID-SURFACE",
      exercise_name: "Personal Valid Public-ID Collision",
      research_exercise_id: "ex_clean_press"
    },
    collision_surface: "public_id",
    crosswalk_validity: "valid",
    publicExerciseId: "ex_public_id_surface",
    publicIdentityValue: "ex_public_id_surface"
  },
  {
    personalRow: {
      exercise_id: "ex public id surface",
      exercise_name: "Personal Invalid Public-ID Collision",
      research_exercise_id: "ex_missing_research_exercise"
    },
    collision_surface: "public_id",
    crosswalk_validity: "invalid",
    publicExerciseId: "ex_public_id_surface",
    publicIdentityValue: "ex_public_id_surface"
  },
  {
    personalRow: {
      exercise_id: "public_name_surface",
      exercise_name: "Personal Valid Public-Name Collision",
      research_exercise_id: "ex_clean_press"
    },
    collision_surface: "public_name",
    crosswalk_validity: "valid",
    publicExerciseId: "ex_public_name_owner",
    publicIdentityValue: "Public Name Surface"
  },
  {
    personalRow: {
      exercise_id: "PUBLIC-NAME-SURFACE",
      exercise_name: "Personal Invalid Public-Name Collision",
      research_exercise_id: "ex_missing_research_exercise"
    },
    collision_surface: "public_name",
    crosswalk_validity: "invalid",
    publicExerciseId: "ex_public_name_owner",
    publicIdentityValue: "Public Name Surface"
  },
  {
    personalRow: {
      exercise_id: "public_alias_surface",
      exercise_name: "Personal Valid Public-Alias Collision",
      research_exercise_id: "ex_clean_press"
    },
    collision_surface: "public_alias",
    crosswalk_validity: "valid",
    publicExerciseId: "ex_public_alias_owner",
    publicIdentityValue: "Public Alias Surface"
  },
  {
    personalRow: {
      exercise_id: "PUBLIC-ALIAS-SURFACE",
      exercise_name: "Personal Invalid Public-Alias Collision",
      research_exercise_id: "ex_missing_research_exercise"
    },
    collision_surface: "public_alias",
    crosswalk_validity: "invalid",
    publicExerciseId: "ex_public_alias_owner",
    publicIdentityValue: "Public Alias Surface"
  }
];

const compatibilityPersonalRows = [
  {
    exercise_id: "custom_noncolliding_press",
    exercise_name: "My Legitimate Noncolliding Press",
    research_exercise_id: "ex_clean_press"
  },
  {
    exercise_id: "custom_invalid_noncollision",
    exercise_name: "My Invalid Noncolliding Press",
    research_exercise_id: "ex_missing_research_exercise"
  }
];
const compatibilityPersonalEngine = createEngine(compatibilityPersonalRows);

function authoritativePublicSpellings(exerciseId) {
  const row = exerciseDatabase.find((candidate) => candidate.exercise_id === exerciseId);
  assert.ok(row, `Missing public collision fixture ${exerciseId}.`);
  return [
    { value: row.exercise_id, source: "canonical_research_id" },
    { value: row.exercise_name, source: "canonical_research_name" },
    ...aliasesFor(row).map((value) => ({
      value,
      source: identityKey(value) === identityKey(row.exercise_name) ? "canonical_research_name" : "research_alias"
    }))
  ];
}

function publicSourceForInput(exerciseId, value) {
  const row = exerciseDatabase.find((candidate) => candidate.exercise_id === exerciseId);
  const trimmed = String(value).trim();
  if (trimmed === row.exercise_id) return "canonical_research_id";
  if (identityKey(trimmed) === identityKey(row.exercise_id)) return "normalized_canonical_research_id";
  if (identityKey(trimmed) === identityKey(row.exercise_name)) return "canonical_research_name";
  return "research_alias";
}

function scenarioEngines(scenario, index) {
  const controlRow = {
    exercise_id: `custom_safe_control_${index + 1}`,
    exercise_name: `Personal Safe Control ${index + 1}`,
    research_exercise_id: "ex_clean_press"
  };
  const rows = [scenario.personalRow, controlRow];
  return {
    controlRow,
    engines: [
      { label: "forward_public_forward_personal", engine: createEngine(rows) },
      { label: "reversed_public_forward_personal", engine: createEngine(rows, { reversePublicCatalog: true }) },
      { label: "forward_public_reversed_personal", engine: createEngine(rows, { reversePersonalRows: true }) },
      { label: "reversed_public_reversed_personal", engine: createEngine(rows, { reversePublicCatalog: true, reversePersonalRows: true }) }
    ]
  };
}

const isolatedCollisionFixtures = collisionScenarios.map(scenarioEngines);

test("synthetic namespace fixtures are schema-shaped, colliding, and non-vacuous", () => {
  assert.equal(new Set(exerciseDatabase.map((row) => row.exercise_id)).size, exerciseDatabase.length, "Exact public IDs must remain unique.");
  exerciseDatabase.forEach((row) => {
    assert.match(row.exercise_id, /^[a-z][a-z0-9_]*$/, `${row.exercise_id} must remain schema-shaped.`);
  });
  assert.equal(exerciseMuscleMap.length, exerciseDatabase.length, "Every synthetic public exercise needs one target row.");
  ambiguousPublicCases.forEach(([label, input]) => {
    assert.ok((publicIdentityTargets.get(identityKey(input))?.size || 0) > 1, `${label} must map to multiple public exercise IDs.`);
  });
  collisionScenarios.forEach((scenario, index) => {
    const personalId = scenario.personalRow.exercise_id;
    const publicTargets = publicIdentityTargets.get(identityKey(personalId));
    assert.deepEqual([...publicTargets], [scenario.publicExerciseId], `${personalId} must overlap exactly one public exercise, not another personal ID.`);
    assert.equal(identityKey(personalId), identityKey(scenario.publicIdentityValue), `${personalId} must overlap its intended public ${scenario.collision_surface}.`);
    assert.notEqual(personalId, scenario.publicIdentityValue, `${personalId} must remain distinguishable from the authoritative public spelling.`);
    assert.notEqual(identityKey(isolatedCollisionFixtures[index].controlRow.exercise_id), identityKey(personalId), "The isolated personal control must not collide with the reserved personal ID.");
    assert.ok(!publicIdentityTargets.has(identityKey(isolatedCollisionFixtures[index].controlRow.exercise_id)), "The isolated personal control must not collide with the public namespace.");
  });
  ["ex_clean_press", "Clean Canonical Press", "Clean Exported Alias"].forEach((value) => {
    assert.deepEqual([...publicIdentityTargets.get(identityKey(value))], ["ex_clean_press"], `${value} must remain a noncolliding control.`);
  });
  assert.deepEqual([...publicIdentityTargets.get(identityKey("Same Surface Press"))], ["ex_same_surface_control"], "Repeated surfaces owned by one canonical ID must not be classified as ambiguous.");
}, "fixture_integrity");

collisionScenarios.forEach((scenario, index) => {
  const personalId = scenario.personalRow.exercise_id;
  const fixture = isolatedCollisionFixtures[index];
  test(`${scenario.crosswalk_validity} personal ID colliding with ${scenario.collision_surface} is quarantined deterministically`, () => {
    const expected = personalCollisionContract(personalId);
    assert.deepEqual(
      Object.fromEntries(fixture.engines.map(({ label, engine }) => [label, actualContract(engine, personalId)])),
      Object.fromEntries(fixture.engines.map(({ label }) => [label, expected])),
      "Only the exact reserved personal identity must fail with the collision reason, independent of public and personal row order."
    );
  }, `personal_public_collision_${scenario.crosswalk_validity}`);

  test(`${scenario.collision_surface} authoritative public spellings remain resolvable after the ${scenario.crosswalk_validity} personal collision`, () => {
    const spellings = authoritativePublicSpellings(scenario.publicExerciseId);
    const expected = spellings.map(({ source }) => resolvedContract(scenario.publicExerciseId, source));
    fixture.engines.forEach(({ label, engine }) => {
      assert.deepEqual(spellings.map(({ value }) => actualContract(engine, value)), expected, `${label} over-broadly quarantined the authoritative public exercise.`);
    });
  }, "collision_scope_public_control");

  test(`only the exact ${scenario.crosswalk_validity} personal ID representation is reserved for the ${scenario.collision_surface} collision`, () => {
    const publicVariants = normalizedVariants(scenario.publicIdentityValue)
      .filter((value) => value.trim() !== personalId);
    assert.ok(publicVariants.length >= 3, "The normalized public-side control requires multiple non-reserved case and separator variants.");
    const expected = publicVariants.map((value) => resolvedContract(scenario.publicExerciseId, publicSourceForInput(scenario.publicExerciseId, value)));
    fixture.engines.forEach(({ label, engine }) => {
      assert.deepEqual(
        publicVariants.map((value) => actualContract(engine, value)),
        expected,
        `${label} treated a non-exact normalized public spelling as the reserved stable personal ID.`
      );
    });
  }, "collision_scope_normalized_public_control");

  test(`unrelated public and personal identities remain resolvable after the ${scenario.crosswalk_validity} ${scenario.collision_surface} collision`, () => {
    const unrelatedPublicSpellings = [
      { value: "ex_clean_press", source: "canonical_research_id" },
      { value: "Clean Canonical Press", source: "canonical_research_name" },
      { value: "Clean Exported Alias", source: "research_alias" }
    ];
    fixture.engines.forEach(({ label, engine }) => {
      assert.deepEqual(
        unrelatedPublicSpellings.map(({ value }) => actualContract(engine, value)),
        unrelatedPublicSpellings.map(({ source }) => resolvedContract("ex_clean_press", source)),
        `${label} over-broadly quarantined unrelated public identities.`
      );
      assert.deepEqual(
        actualContract(engine, fixture.controlRow.exercise_id),
        resolvedContract("ex_clean_press", "personal_explicit_crosswalk"),
        `${label} over-broadly quarantined an unrelated trusted personal identity.`
      );
    });
  }, "collision_scope_unrelated_controls");
});

test("legitimate noncolliding personal ID with a valid crosswalk still resolves", () => {
  assert.deepEqual(
    actualContract(compatibilityPersonalEngine, "custom_noncolliding_press"),
    resolvedContract("ex_clean_press", "personal_explicit_crosswalk")
  );
}, "noncolliding_personal_resolution");

test("unknown identity retains the established unknown reason", () => {
  assert.deepEqual(actualContract(compatibilityPersonalEngine, "completely_unknown_identity"), {
    identity: {
      status: "unresolved",
      exerciseId: undefined,
      source: undefined,
      reason: "unknown_exercise_identity"
    },
    target: {
      status: "ineligible",
      exerciseId: undefined,
      muscleGroupId: undefined,
      relationshipType: undefined,
      taxonomyVersion: undefined,
      reason: "unknown_exercise_identity"
    }
  });
}, "established_reason_compatibility");

test("invalid noncolliding crosswalk retains the established reconciliation reason", () => {
  assert.deepEqual(actualContract(compatibilityPersonalEngine, "custom_invalid_noncollision"), {
    identity: {
      status: "unresolved",
      exerciseId: "custom_invalid_noncollision",
      source: undefined,
      reason: "invalid_reconciled_identity"
    },
    target: {
      status: "ineligible",
      exerciseId: "custom_invalid_noncollision",
      muscleGroupId: undefined,
      relationshipType: undefined,
      taxonomyVersion: undefined,
      reason: "invalid_reconciled_identity"
    }
  });
}, "established_reason_compatibility");

const failures = [];
const passedByCategory = new Map();
const failedByCategory = new Map();
let passed = 0;

tests.forEach(({ name, fn, category }) => {
  try {
    fn();
    passed += 1;
    passedByCategory.set(category, (passedByCategory.get(category) || 0) + 1);
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, category, error });
    failedByCategory.set(category, (failedByCategory.get(category) || 0) + 1);
    console.error(`FAIL ${name}`);
    console.error(error?.stack || error);
  }
});

console.log(JSON.stringify({
  passed_cases: passed,
  failed_cases: failures.length,
  total_cases: tests.length,
  ambiguous_public_case_count: ambiguousPublicCases.length,
  personal_public_collision_case_count: collisionScenarios.length,
  collision_order_permutation_count: 4,
  passed_by_category: Object.fromEntries([...passedByCategory.entries()].sort()),
  failed_by_category: Object.fromEntries([...failedByCategory.entries()].sort()),
  expected_reason_contract: {
    ambiguous_public: AMBIGUOUS_PUBLIC_REASON,
    personal_public_collision: PERSONAL_PUBLIC_COLLISION_REASON
  }
}, null, 2));

if (failures.length) {
  console.error(`Identity-namespace collision contract is red: ${failures.length}/${tests.length} case(s) failed.`);
  process.exit(1);
}

console.log(`Identity-namespace collision contract passed (${passed}/${tests.length} cases).`);
