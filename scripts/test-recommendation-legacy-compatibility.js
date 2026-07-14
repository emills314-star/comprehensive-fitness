"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  appendRecommendationHistory,
  createPrescriptionEngine,
  deserializeRecommendationSnapshot,
  recommendationHistory,
  reconcileRecommendation,
  refreshRecommendationChecksum,
  serializeRecommendationSnapshot
} = require("../prescription-engine");

const ROOT = path.resolve(__dirname, "..");
const CREATED_AT = "2026-07-14T18:00:00.000Z";

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

const engine = createPrescriptionEngine({ personalData: {}, researchData: publicResearchData() });
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

const current = engine.prescribeExercise({
  exerciseId: "ex_barbell_bench_press",
  muscleGroupId: "chest",
  trainingGoal: "strength",
  experienceLevel: "advanced",
  createdAt: CREATED_AT
});

const PAIRS = [
  { snapshot: "1.0.0", prescription: "2.0.0", engine: "2.0.0" },
  { snapshot: "1.1.0", prescription: "2.1.0", engine: "3.1.0" },
  { snapshot: "1.2.0", prescription: "2.2.0", engine: "3.2.0" },
  { snapshot: "1.3.0", prescription: "2.3.0", engine: "3.3.0" }
];

function legacySnapshot(pair, options = {}) {
  const snapshot = structuredClone(current);
  snapshot.recommendationId = `rec_legacy_${pair.snapshot.replaceAll(".", "_")}`;
  snapshot.schemaVersion = pair.snapshot;
  snapshot.recommendationVersion = pair.prescription;
  snapshot.engineVersion = pair.engine;
  snapshot.basePrescription.schemaVersion = pair.prescription;
  snapshot.finalPrescription.schemaVersion = pair.prescription;
  if (pair.prescription === "2.0.0") {
    delete snapshot.basePrescription.executionBlocked;
    delete snapshot.finalPrescription.executionBlocked;
  }
  if (["2.0.0", "2.1.0"].includes(pair.prescription)) {
    for (const prescription of [snapshot.basePrescription, snapshot.finalPrescription]) {
      delete prescription.programmingContext;
      delete prescription.historyResolution;
    }
  }
  if (["2.0.0", "2.1.0", "2.2.0"].includes(pair.prescription)) {
    for (const prescription of [snapshot.basePrescription, snapshot.finalPrescription]) {
      delete prescription.progressionConfirmation;
      delete prescription.scientificProvenance;
      delete prescription.goalPolicyConflict;
    }
  }
  if (options.checksum === false) delete snapshot.checksum;
  else snapshot.checksum = refreshRecommendationChecksum(snapshot).checksum;
  return snapshot;
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    value: (key) => values.get(key)
  };
}

test("checksum-less v1.0/2.0 reads unchanged without fabricated current facts", () => {
  const legacyWithoutChecksum = legacySnapshot(PAIRS[0], { checksum: false });
  const legacyRead = deserializeRecommendationSnapshot(JSON.stringify(legacyWithoutChecksum));
  assert.deepEqual(legacyRead, legacyWithoutChecksum, "checksum-less v1.0/2.0 data must remain byte-meaning equivalent on read");
  assert.equal(legacyRead.schemaVersion, "1.0.0");
  assert.equal(legacyRead.basePrescription.schemaVersion, "2.0.0");
  assert.equal(legacyRead.basePrescription.programmingContext, undefined, "legacy unknown context must not be fabricated");
  assert.equal(legacyRead.basePrescription.progressionConfirmation, undefined, "legacy confirmation must remain unknown");
  assert.equal(legacyRead.basePrescription.scientificProvenance, undefined, "legacy provenance must remain unknown");
  assert.deepEqual(JSON.parse(serializeRecommendationSnapshot(legacyRead)), legacyWithoutChecksum, "serializing preserved legacy data must not synthesize a checksum or current fields");
});

test("all four repository-known version pairs read while generation remains latest-only", () => {
  for (const pair of PAIRS) {
    const historical = legacySnapshot(pair);
    assert.deepEqual(deserializeRecommendationSnapshot(historical), historical, `${pair.snapshot}/${pair.prescription} did not round-trip unchanged`);
  }
  assert.equal(current.schemaVersion, "1.3.0", "current generation must remain latest-only");
  assert.equal(current.basePrescription.schemaVersion, "2.3.0", "current prescriptions must remain latest-only");
  assert.equal(current.engineVersion, "3.3.1", "the technique-confirmation fix requires a traceable patch engine version");
});

test("a present legacy checksum is verified before compatibility handling", () => {
  const checksummedLegacy = legacySnapshot(PAIRS[0]);
  assert.deepEqual(deserializeRecommendationSnapshot(checksummedLegacy), checksummedLegacy);
  const tamperedLegacy = structuredClone(checksummedLegacy);
  tamperedLegacy.finalPrescription.workingSets.target += 1;
  assert.throws(() => deserializeRecommendationSnapshot(tamperedLegacy), /checksum|altered/i, "legacy checksum must be verified before compatibility handling");
});

test("mixed history loads and appends without rewriting legacy records or IDs", () => {
  const legacyWithoutChecksum = legacySnapshot(PAIRS[0], { checksum: false });
  const historyKey = "compatibility.history";
  const storage = memoryStorage({ [historyKey]: JSON.stringify([legacyWithoutChecksum, current]) });
  const loaded = recommendationHistory(storage, { key: historyKey });
  assert.deepEqual(loaded.map((item) => item.recommendationId), [legacyWithoutChecksum.recommendationId, current.recommendationId]);
  assert.deepEqual(loaded[0], legacyWithoutChecksum, "one legacy record must not be rewritten while loading mixed history");
  assert.deepEqual(loaded[1], current, "one legacy record must not prevent the current record from loading");

  const appendedLegacy = legacySnapshot(PAIRS[1]);
  appendRecommendationHistory(storage, appendedLegacy, { key: historyKey });
  const afterAppend = JSON.parse(storage.value(historyKey));
  assert.deepEqual(afterAppend.slice(0, 2), [legacyWithoutChecksum, current], "append must not rewrite existing history entries");
  assert.equal(afterAppend[2].recommendationId, appendedLegacy.recommendationId);
  const conflictingExisting = structuredClone(legacyWithoutChecksum);
  conflictingExisting.explanation = "Silently rewritten historical explanation";
  assert.throws(() => appendRecommendationHistory(storage, conflictingExisting, { key: historyKey }), /refusing|rewrite|exists/i);
});

test("reconciliation does not silently replace an existing historical identity", () => {
  const legacyWithoutChecksum = legacySnapshot(PAIRS[0], { checksum: false });
  const recomputedWithDifferentIdentity = structuredClone(current);
  recomputedWithDifferentIdentity.recommendationId = "rec_recomputed_different_identity";
  const reconciled = reconcileRecommendation(legacyWithoutChecksum, recomputedWithDifferentIdentity);
  assert.equal(reconciled.recommendationId, legacyWithoutChecksum.recommendationId, "reconciliation must not silently replace an existing historical identity");
  const explicit = reconcileRecommendation(legacyWithoutChecksum, recomputedWithDifferentIdentity, { allowExplicitReplace: true });
  assert.equal(explicit.recommendationId, recomputedWithDifferentIdentity.recommendationId, "an explicitly authorized replacement must remain possible");
});

function exposure(day, options = {}) {
  return {
    exercise_id: "ex_barbell_bench_press",
    workout_date: `2026-07-${String(day).padStart(2, "0")}`,
    progression_status: "improved",
    comparison_performance_value: 100 + day,
    set_repetitions: "[8,8,8]",
    set_loads: "[100,100,100]",
    set_rpes: "[8,8,8]",
    average_rpe: 8,
    completedSetRatio: 1,
    completedSetCount: 3,
    prescribedSetCount: 3,
    techniqueValid: options.techniqueValid ?? true,
    techniqueQuality: options.techniqueValid === false ? "invalid" : "valid",
    pain: false
  };
}

test("zero confirmation exposes no older qualifying dates", () => {
  const interrupted = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    trainingGoal: "strength",
    experienceLevel: "novice",
    history: [exposure(10), exposure(11), exposure(12, { techniqueValid: false })],
    createdAt: CREATED_AT
  });
  assert.equal(interrupted.basePrescription.progressionConfirmation.observedQualifyingExposures, 0);
  assert.deepEqual(interrupted.basePrescription.progressionConfirmation.qualifyingExposureDates, [], "older qualifying dates must not survive a newer invalid exposure");
});

test("confirmation dates contain only the final consecutive qualifying suffix", () => {
  const consecutiveSuffix = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    trainingGoal: "strength",
    experienceLevel: "novice",
    history: [exposure(10, { techniqueValid: false }), exposure(11), exposure(12)],
    createdAt: CREATED_AT
  });
  assert.equal(consecutiveSuffix.basePrescription.progressionConfirmation.observedQualifyingExposures, 2);
  assert.deepEqual(consecutiveSuffix.basePrescription.progressionConfirmation.qualifyingExposureDates, ["2026-07-11", "2026-07-12"]);
});

let passed = 0;
const failures = [];
for (const item of tests) {
  try {
    item.fn();
    passed += 1;
    console.log(`PASS ${item.name}`);
  } catch (error) {
    failures.push({ name: item.name, error });
    console.error(`FAIL ${item.name}\n${error.stack || error.message}`);
  }
}
console.log(`\nRecommendation legacy compatibility: ${passed}/${tests.length} groups passed.`);
if (failures.length) process.exitCode = 1;
