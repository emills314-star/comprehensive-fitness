const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createPrescriptionEngine } = require("../prescription-engine");

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

function exposure(day, options = {}) {
  const reps = options.reps || [8, 8, 8];
  return {
    exercise_id: options.exerciseId || "ex_barbell_bench_press",
    workout_date: `2026-07-${String(day).padStart(2, "0")}`,
    progression_status: "improved",
    progression_pct_vs_prior: 2,
    comparison_performance_value: 100 + day,
    best_epley_e1rm: 100 + day,
    average_rpe: options.rpe ?? 8,
    pain: options.pain ?? false,
    techniqueValid: options.techniqueValid ?? true,
    techniqueQuality: options.techniqueQuality || "valid",
    completedSetRatio: options.completedSetRatio ?? 1,
    completedSetCount: options.completedSetCount ?? reps.length,
    prescribedSetCount: options.prescribedSetCount ?? reps.length,
    set_repetitions: JSON.stringify(reps),
    set_loads: JSON.stringify(reps.map(() => 100)),
    set_rpes: JSON.stringify(reps.map(() => options.rpe ?? 8)),
    ...options.identity
  };
}

const engine = createPrescriptionEngine({ personalData: {}, researchData: publicResearchData() });

function confirmation(history) {
  return engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    trainingGoal: "strength",
    experienceLevel: "advanced",
    history,
    createdAt: CREATED_AT
  }).finalPrescription.progressionConfirmation;
}

test("duplicate rows with one stable exposure identity count once", () => {
  const duplicated = [0, 1, 2].map(() => exposure(12, { identity: { workout_id: "workout-12" } }));
  const result = confirmation(duplicated);
  assert.equal(result.requiredExposures, 3);
  assert.equal(result.observedQualifyingExposures, 1);
  assert.equal(result.satisfied, false);
  assert.deepEqual(result.qualifyingExposureDates, ["2026-07-12"]);
});

test("any invalid duplicate makes the whole trailing exposure nonqualifying", () => {
  const disqualifiers = [
    { label: "invalid technique", options: { techniqueValid: false, techniqueQuality: "invalid" } },
    { label: "incomplete work", options: { completedSetRatio: 2 / 3, completedSetCount: 2, prescribedSetCount: 3 } },
    { label: "effort above target", options: { rpe: 10 } },
    { label: "pain", options: { pain: true } }
  ];
  disqualifiers.forEach(({ label, options }) => {
    const history = [
      exposure(10, { identity: { exposure_id: "bench-10" } }),
      exposure(11, { identity: { exposure_id: "bench-11" } }),
      exposure(12, { ...options, identity: { exposure_id: "bench-12" } }),
      exposure(12, { identity: { exposure_id: "bench-12" } })
    ];
    const result = confirmation(history);
    assert.equal(result.observedQualifyingExposures, 0, `${label} was ignored in favor of the valid duplicate`);
    assert.equal(result.satisfied, false, `${label} incorrectly satisfied confirmation`);
    assert.deepEqual(result.qualifyingExposureDates, [], `${label} leaked an older non-trailing date`);
  });
});

test("distinct stable identities on one date remain distinct but dates remain unique", () => {
  const history = ["a", "b", "c"].map((id) => exposure(12, { identity: { session_exercise_id: `bench-${id}` } }));
  const result = confirmation(history);
  assert.equal(result.observedQualifyingExposures, 3);
  assert.equal(result.satisfied, true);
  assert.deepEqual(result.qualifyingExposureDates, ["2026-07-12"]);
  assert.equal(new Set(result.qualifyingExposureDates).size, result.qualifyingExposureDates.length);
});

test("same-exercise date fallback deduplicates while unrelated history stays filtered", () => {
  const history = [
    exposure(11),
    exposure(12),
    exposure(12),
    exposure(13, { exerciseId: "ex_barbell_back_squat", techniqueValid: false, techniqueQuality: "invalid" })
  ];
  const result = confirmation(history);
  assert.equal(result.observedQualifyingExposures, 2);
  assert.equal(result.satisfied, false);
  assert.deepEqual(result.qualifyingExposureDates, ["2026-07-11", "2026-07-12"]);
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
  }
}

console.log(`\n${tests.length - failures}/${tests.length} duplicate-exposure recommendation checks passed.`);
if (failures) process.exitCode = 1;
