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

function createEngine(personalRows = []) {
  return createPrescriptionEngine({
    personalData: {
      exerciseScores: clone(personalRows),
      metadata: { methodology_version: TAXONOMY_VERSION }
    },
    researchData: researchData()
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
    assert.deepEqual(actualContract(baseEngine, input), ambiguousPublicContract());
  }, "ambiguous_public_namespace");
});

const collisionRows = [
  {
    exercise_id: "EX-PUBLIC-ID-SURFACE",
    exercise_name: "Personal Valid Public-ID Collision",
    research_exercise_id: "ex_clean_press",
    collision_surface: "public_id",
    crosswalk_validity: "valid"
  },
  {
    exercise_id: "ex public id surface",
    exercise_name: "Personal Invalid Public-ID Collision",
    research_exercise_id: "ex_missing_research_exercise",
    collision_surface: "public_id",
    crosswalk_validity: "invalid"
  },
  {
    exercise_id: "public_name_surface",
    exercise_name: "Personal Valid Public-Name Collision",
    research_exercise_id: "ex_clean_press",
    collision_surface: "public_name",
    crosswalk_validity: "valid"
  },
  {
    exercise_id: "PUBLIC-NAME-SURFACE",
    exercise_name: "Personal Invalid Public-Name Collision",
    research_exercise_id: "ex_missing_research_exercise",
    collision_surface: "public_name",
    crosswalk_validity: "invalid"
  },
  {
    exercise_id: "public_alias_surface",
    exercise_name: "Personal Valid Public-Alias Collision",
    research_exercise_id: "ex_clean_press",
    collision_surface: "public_alias",
    crosswalk_validity: "valid"
  },
  {
    exercise_id: "PUBLIC-ALIAS-SURFACE",
    exercise_name: "Personal Invalid Public-Alias Collision",
    research_exercise_id: "ex_missing_research_exercise",
    collision_surface: "public_alias",
    crosswalk_validity: "invalid"
  }
];

const personalRows = [
  ...collisionRows,
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
const personalEngine = createEngine(personalRows);

test("synthetic namespace fixtures are schema-shaped, colliding, and non-vacuous", () => {
  assert.equal(new Set(exerciseDatabase.map((row) => row.exercise_id)).size, exerciseDatabase.length, "Exact public IDs must remain unique.");
  exerciseDatabase.forEach((row) => {
    assert.match(row.exercise_id, /^[a-z][a-z0-9_]*$/, `${row.exercise_id} must remain schema-shaped.`);
  });
  assert.equal(exerciseMuscleMap.length, exerciseDatabase.length, "Every synthetic public exercise needs one target row.");
  ambiguousPublicCases.forEach(([label, input]) => {
    assert.ok((publicIdentityTargets.get(identityKey(input))?.size || 0) > 1, `${label} must map to multiple public exercise IDs.`);
  });
  collisionRows.forEach((row) => {
    assert.ok(publicIdentityTargets.has(identityKey(row.exercise_id)), `${row.exercise_id} must overlap the public namespace.`);
  });
  ["ex_clean_press", "Clean Canonical Press", "Clean Exported Alias"].forEach((value) => {
    assert.deepEqual([...publicIdentityTargets.get(identityKey(value))], ["ex_clean_press"], `${value} must remain a noncolliding control.`);
  });
}, "fixture_integrity");

collisionRows.forEach((row) => {
  test(`${row.crosswalk_validity} personal ID colliding with ${row.collision_surface} is quarantined`, () => {
    assert.deepEqual(
      actualContract(personalEngine, row.exercise_id),
      personalCollisionContract(row.exercise_id),
      "A public-namespace collision must take precedence over valid or invalid personal crosswalk metadata."
    );
  }, `personal_public_collision_${row.crosswalk_validity}`);
});

test("legitimate noncolliding personal ID with a valid crosswalk still resolves", () => {
  assert.deepEqual(
    actualContract(personalEngine, "custom_noncolliding_press"),
    resolvedContract("ex_clean_press", "personal_explicit_crosswalk")
  );
}, "noncolliding_personal_resolution");

test("unknown identity retains the established unknown reason", () => {
  assert.deepEqual(actualContract(personalEngine, "completely_unknown_identity"), {
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
  assert.deepEqual(actualContract(personalEngine, "custom_invalid_noncollision"), {
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
  personal_public_collision_case_count: collisionRows.length,
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
