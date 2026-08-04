"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const api = require("../prescription-engine");

const root = path.resolve(__dirname, "..");
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const exerciseDatabase = readJson("research_database/exports/json/exercise_database.json");
const exerciseMuscleMap = readJson("research_database/exports/json/exercise_muscle_map.json");

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function checksum(value) {
  const text = stableStringify({ ...value, checksum: undefined });
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const pairs = {
  "1.0.0": "2.0.0",
  "1.1.0": "2.1.0",
  "1.2.0": "2.2.0",
  "1.3.0": "2.3.0",
  "1.4.0": "2.4.0"
};

function historicalSnapshot(schemaVersion, withChecksum = true) {
  const prescriptionVersion = pairs[schemaVersion];
  const prescription = {
    schemaVersion: prescriptionVersion,
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "mg_chest_sternal",
    role: "primary_progression_lift",
    setStructure: "straight_sets",
    recommendationType: "normal",
    workingSets: { min: 3, target: 3, max: 3 },
    userExplanation: "Historical recommendation"
  };
  if (prescriptionVersion !== "2.0.0") prescription.executionBlocked = false;
  if (prescriptionVersion === "2.4.0") {
    Object.assign(prescription, {
      programmingContext: { profileVersion: "training-profile/1.1.0" },
      historyResolution: { source: "historical" },
      progressionConfirmation: { observedQualifyingExposures: 0 },
      scientificProvenance: { source: "historical" }
    });
  }
  const snapshot = {
    recommendationId: `historical_${schemaVersion.replaceAll(".", "_")}`,
    schemaVersion,
    recommendationVersion: prescriptionVersion,
    engineVersion: schemaVersion === "1.4.0" ? "3.4.1" : "3.0.0",
    personalDataVersion: "historical",
    researchDatabaseVersion: "historical",
    exerciseId: prescription.exerciseId,
    muscleGroupId: prescription.muscleGroupId,
    basePrescription: structuredClone(prescription),
    finalPrescription: structuredClone(prescription),
    explanation: prescription.userExplanation,
    createdAt: "2026-07-14T18:00:00.000Z",
    manualOverrides: [],
    overrideLocked: false
  };
  if (schemaVersion === "1.4.0") {
    snapshot.standardGuideline = {
      schemaVersion: "standard-guideline/1.0.0",
      source: "canonical_research_and_personal",
      workingSets: { min: 3, target: 3, max: 3 },
      repRange: { min: 5, max: 8 },
      targetRpe: { min: 7, max: 9 },
      targetRir: { min: 1, max: 3 },
      restSeconds: { min: 120, max: 300 },
      customExercise: false,
      explanation: "Historical comparison only"
    };
  }
  if (withChecksum) snapshot.checksum = checksum(snapshot);
  return snapshot;
}

assert.deepEqual(Object.keys(api).sort(), [
  "ENGINE_VERSION",
  "createPrescriptionEngine",
  "deserializeRecommendationSnapshot",
  "normalizeEvidenceBundle",
  "serializeRecommendationSnapshot"
].sort(), "Only the approved compatibility API may remain exported");

const personalData = {
  exerciseScores: [
    { exercise_id: "custom_valid_press", exercise_name: "Garage Press", research_exercise_id: "ex_barbell_bench_press", score_id: "score_valid" },
    { exercise_id: "custom_conflict", exercise_name: "Conflict Press", research_exercise_id: "ex_barbell_bench_press", score_id: "score_conflict" },
    { exercise_id: "custom_equipment_conflict", exercise_name: "Equipment Conflict", equipment: "dumbbell", score_id: "score_equipment" },
    { exercise_id: "Bench Press", exercise_name: "Collision Press", research_exercise_id: "ex_barbell_bench_press", score_id: "score_collision" }
  ],
  exercisePrescriptions: [
    { exercise_id: "custom_valid_press", exercise_name: "Garage Press", research_exercise_id: "ex_barbell_bench_press", prescription_id: "prescription_valid" },
    { exercise_id: "custom_conflict", exercise_name: "Conflict Press", research_exercise_id: "ex_overhead_press", prescription_id: "prescription_conflict" },
    { exercise_id: "custom_equipment_conflict", exercise_name: "Equipment Conflict", equipment: "barbell", prescription_id: "prescription_equipment" }
  ],
  exerciseMuscleScores: []
};
const originalInput = structuredClone({ personalData, researchData: { exerciseDatabase, exerciseMuscleMap } });
const evidence = api.normalizeEvidenceBundle({ personalData, researchData: { exerciseDatabase, exerciseMuscleMap } });
assert.deepEqual({ personalData, researchData: { exerciseDatabase, exerciseMuscleMap } }, originalInput, "Normalization must not mutate caller data");
const engine = api.createPrescriptionEngine(evidence);
assert.deepEqual(Object.keys(engine).sort(), ["evidence", "resolveExerciseIdentity"], "Engine instances expose identity only");

for (const exercise of exerciseDatabase) {
  const exerciseId = exercise.exercise_id;
  assert.equal(engine.resolveExerciseIdentity(exerciseId).exerciseId, exerciseId);
  assert.equal(engine.resolveExerciseIdentity(exercise.exercise_name).exerciseId, exerciseId);
  for (const alias of String(exercise.exercise_aliases || "").split("|").filter(Boolean)) {
    assert.equal(engine.resolveExerciseIdentity(alias).exerciseId, exerciseId);
  }
}
assert.deepEqual(engine.resolveExerciseIdentity("custom_valid_press"), {
  status: "resolved",
  exerciseId: "ex_barbell_bench_press",
  source: "personal_explicit_crosswalk"
});
assert.deepEqual(engine.resolveExerciseIdentity("custom_conflict"), {
  status: "unresolved",
  exerciseId: "custom_conflict",
  reason: "invalid_reconciled_identity"
});
assert.equal(evidence.personal.reconciledIdentityByExerciseId.get("custom_equipment_conflict").invalid, true);
assert.deepEqual(engine.resolveExerciseIdentity("Bench Press"), {
  status: "unresolved",
  exerciseId: "Bench Press",
  reason: "personal_public_identity_collision"
});
assert.equal(engine.resolveExerciseIdentity("bench-press").exerciseId, "ex_barbell_bench_press", "Only the exact colliding personal ID is reserved");
assert.deepEqual(engine.resolveExerciseIdentity("missing exercise"), {
  status: "unresolved",
  reason: "unknown_exercise_identity"
});
const ambiguousEngine = api.createPrescriptionEngine({
  researchData: {
    exerciseDatabase: [
      { exercise_id: "ex_one", exercise_name: "Shared Name", exercise_aliases: "First Alias" },
      { exercise_id: "ex_two", exercise_name: "Other Name", exercise_aliases: "Shared Name" }
    ]
  }
});
assert.deepEqual(ambiguousEngine.resolveExerciseIdentity("shared-name"), {
  status: "unresolved",
  reason: "ambiguous_public_exercise_identity"
});

for (const schemaVersion of Object.keys(pairs)) {
  const snapshot = historicalSnapshot(schemaVersion);
  const before = structuredClone(snapshot);
  assert.deepEqual(api.deserializeRecommendationSnapshot(snapshot), before);
  assert.deepEqual(JSON.parse(api.serializeRecommendationSnapshot(snapshot)), before);
  assert.deepEqual(snapshot, before, "Compatibility validation must never mutate historical snapshots");
}
const checksumlessV1 = historicalSnapshot("1.0.0", false);
assert.deepEqual(api.deserializeRecommendationSnapshot(checksumlessV1), checksumlessV1);
const legacyOverride = historicalSnapshot("1.3.0", false);
legacyOverride.manualOverrides = [{
  overrideId: "legacy_override_1",
  createdAt: "2026-07-14T18:05:00.000Z",
  actor: "user",
  reason: "Historical adjustment",
  changes: { setCount: { from: 3, to: 2 } },
  previousFinalPrescription: structuredClone(legacyOverride.finalPrescription)
}];
legacyOverride.overrideLocked = true;
legacyOverride.checksum = checksum(legacyOverride);
assert.deepEqual(api.deserializeRecommendationSnapshot(legacyOverride), legacyOverride, "Legacy override audit remains readable without a newer final marker");
const tampered = historicalSnapshot("1.3.0");
tampered.finalPrescription.workingSets.target = 4;
assert.throws(() => api.deserializeRecommendationSnapshot(tampered), /checksum|altered/i);
const unsupported = historicalSnapshot("1.3.0");
unsupported.schemaVersion = "9.0.0";
assert.throws(() => api.deserializeRecommendationSnapshot(unsupported), /unsupported/i);
const semanticallyInvalid = historicalSnapshot("1.4.0", false);
semanticallyInvalid.finalPrescription.recommendationType = "deleted_live_mode";
semanticallyInvalid.checksum = checksum(semanticallyInvalid);
assert.throws(() => api.deserializeRecommendationSnapshot(semanticallyInvalid), /recommendation type/i);

const appImportSource = fs.readFileSync(path.join(root, "app-import.js"), "utf8");
assert.doesNotMatch(appImportSource, /function\s+(?:importPersonalEvidenceFile|personalEvidenceBundleForImport|validatePersonalEvidencePackage)\b/);
assert.match(appImportSource, /allowedTopLevelFields[\s\S]*recommendationHistory[\s\S]*manualOverrides[\s\S]*personalEvidencePackage/, "Legacy top-level fields must remain accepted at the strict compatibility boundary");
assert.doesNotMatch(appImportSource, /recommendationHistory:\s*\[\]|manualOverrides:\s*\[\]|personalEvidencePackage:\s*null/, "Legacy top-level fields must not be recreated in active imported state");
assert.doesNotMatch(appImportSource, /\.resolveDefaultPrescriptionTarget\s*\(/, "Import validation must not preserve a prescription-producing engine API");

console.log(`Prescription compatibility passed (${exerciseDatabase.length} canonical identities, ${Object.keys(pairs).length} historical schema pairs).`);
