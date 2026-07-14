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

function readResearch(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "research_database", "exports", "json", name), "utf8"));
}

const researchData = {
  exerciseDatabase: readResearch("exercise_database.json"),
  exerciseMuscleMap: readResearch("exercise_muscle_map.json"),
  exerciseSubstitutionMap: readResearch("exercise_substitution_map.json"),
  muscleGroupRecommendations: readResearch("muscle_group_recommendations.json"),
  progressionRules: readResearch("progression_rules.json"),
  nutritionStrategies: readResearch("nutrition_strategies.json"),
  manifest: readResearch("manifest.json")
};
const engine = createPrescriptionEngine({ personalData: {}, researchData });

function exposure(day, identity = {}, options = {}) {
  const reps = [8, 8, 8];
  return {
    exercise_id: "ex_barbell_bench_press",
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
    ...identity
  };
}

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

test("overlapping snake and camel identifiers join one exposure", () => {
  const result = confirmation([
    exposure(12, { exposure_id: "E1", workout_id: "W1" }),
    exposure(12, { workoutId: "W1" })
  ]);
  assert.equal(result.observedQualifyingExposures, 1);
  assert.equal(result.satisfied, false);
  assert.deepEqual(result.qualifyingExposureDates, ["2026-07-12"]);
});

test("multi-hop exposure, workout, and session identifiers form one component", () => {
  const result = confirmation([
    exposure(12, { exposureId: "E1", workout_id: "W1" }),
    exposure(12, { workoutId: "W1", session_id: "S1" }),
    exposure(12, { sessionId: "S1" })
  ]);
  assert.equal(result.observedQualifyingExposures, 1);
  assert.deepEqual(result.qualifyingExposureDates, ["2026-07-12"]);
});

test("one unidentified same-date row joins the sole stable component", () => {
  const result = confirmation([
    exposure(12, { exercise_exposure_id: "E1" }),
    exposure(12)
  ]);
  assert.equal(result.observedQualifyingExposures, 1);
  assert.deepEqual(result.qualifyingExposureDates, ["2026-07-12"]);
});

test("two verified stable identities on one date remain two exposures", () => {
  const result = confirmation([
    exposure(12, { exposure_id: "E1" }),
    exposure(12, { exposureId: "E2" })
  ]);
  assert.equal(result.observedQualifyingExposures, 2);
  assert.deepEqual(result.qualifyingExposureDates, ["2026-07-12"]);
});

test("an unidentified row ambiguous between stable components breaks the trailing streak", () => {
  const result = confirmation([
    exposure(12),
    exposure(12, { exposure_id: "E1" }),
    exposure(12, { exposureId: "E2" })
  ]);
  assert.equal(result.observedQualifyingExposures, 0);
  assert.equal(result.satisfied, false);
  assert.deepEqual(result.qualifyingExposureDates, []);
});

test("an invalid row invalidates its whole transitively connected exposure", () => {
  const result = confirmation([
    exposure(12, { exposure_id: "E1", workout_id: "W1" }, { techniqueValid: false, techniqueQuality: "invalid" }),
    exposure(12, { workoutId: "W1" })
  ]);
  assert.equal(result.observedQualifyingExposures, 0);
  assert.deepEqual(result.qualifyingExposureDates, []);
});

test("the exact hypertrophy band is limited product policy while its broad-load citation stays high-strength", () => {
  const snapshot = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    trainingGoal: "hypertrophy",
    experienceLevel: "novice",
    createdAt: CREATED_AT
  });
  const source = snapshot.basePrescription.scientificProvenance.repRange;
  assert.equal(source.authority, "product_policy");
  assert.equal(source.directness, "product_policy_translation");
  assert.ok(["low", "very_low"].includes(source.evidenceStrength), `exact product range was labeled ${source.evidenceStrength}`);
  assert.match(source.uncertainty, /high.{0,40}(broad|5.?30)|(broad|5.?30).{0,40}high/i);
  assert.match(source.uncertainty, /6.?15.*product.?policy|product.?policy.*6.?15/i);

  assert.deepEqual(source.conclusionIds, ["con_0001"]);
  assert.deepEqual(source.studyIds, ["stu_0004", "stu_0039"]);
  const conclusion = readResearch("evidence_conclusions.json").find((row) => row.conclusion_id === "con_0001");
  assert.ok(conclusion, "hypertrophy provenance cites a missing conclusion");
  assert.equal(conclusion.evidence_strength, "high");
  const linkedStudies = new Set(String(conclusion.supporting_study_ids || "").split("|").filter(Boolean));
  source.studyIds.forEach((studyId) => assert.ok(linkedStudies.has(studyId), `${studyId} is not linked to con_0001`));
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

console.log(`\n${tests.length - failures}/${tests.length} transitive-exposure and science-label checks passed.`);
if (failures) process.exitCode = 1;
