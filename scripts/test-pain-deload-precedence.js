"use strict";

const assert = require("node:assert/strict");
const {
  assessExerciseStaleness,
  createPrescriptionEngine,
  determineProgressionDecision,
  normalizeEvidenceBundle
} = require("../prescription-engine");

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

const createdAt = "2026-07-12T12:00:00.000Z";
const engine = createPrescriptionEngine(normalizeEvidenceBundle({
  personalData: {},
  researchData: publicResearchData()
}));

function regressionHistory({ pain = true, reverseInput = false } = {}) {
  const history = [0, 1, 2, 3].map((index) => ({
    workout_date: `2026-07-${String(1 + index * 2).padStart(2, "0")}`,
    progression_status: index < 2 ? "held" : "regressed",
    progression_pct_vs_prior: index < 2 ? 0 : -3,
    comparison_performance_value: 100 - index * 4,
    best_epley_e1rm: 100 - index * 4,
    average_rpe: 8 + index * 0.5,
    recovery_strain_score: index < 2 ? 50 : 75,
    max_set_rep_loss_pct: index < 2 ? 10 : 35,
    regression_duration_exposures: index < 2 ? 0 : index - 1,
    pain: pain && index >= 2,
    set_repetitions: "[8,7,6]",
    set_loads: "[100,100,100]"
  }));
  return reverseInput ? history.reverse() : history;
}

function productiveHistoryWithOlderPain() {
  return [0, 1, 2, 3].map((index) => ({
    workout_date: `2026-07-${String(1 + index * 2).padStart(2, "0")}`,
    progression_status: "improved",
    progression_pct_vs_prior: index ? 2 : 0,
    comparison_performance_value: 100 + index * 3,
    best_epley_e1rm: 100 + index * 3,
    average_rpe: 8,
    recovery_strain_score: 40,
    max_set_rep_loss_pct: 10,
    pain: index === 0,
    set_repetitions: "[8,8,8]",
    set_loads: "[100,100,100]"
  }));
}

function prescribe(history, readiness) {
  return engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    history,
    ...(readiness ? { readiness } : {}),
    createdAt
  });
}

function assertBlockedPainfulOriginal(snapshot, label) {
  const final = snapshot.finalPrescription;
  assert.equal(final.recommendationType, "substitute", `${label}: the painful original must require a substitute`);
  assert.equal(final.progressionAction, "hold_for_pain_free_substitution", `${label}: pain must supersede exercise-deload progression`);
  assert.equal(final.executionBlocked, true, `${label}: the painful original must not be executable`);
  assert.equal(final.workingSets.target, 0, `${label}: the painful original must have zero working sets`);
  assert.equal(final.workingSets.min, 0, `${label}: the painful original must have zero minimum working sets`);
  assert.equal(final.workingSets.max, 0, `${label}: the painful original must have zero maximum working sets`);
  assert.equal(final.prescribedLoad, undefined, `${label}: the painful original must not retain a reduced-load target`);
  assert.equal(final.safetyRestriction?.reason, "pain", `${label}: the execution block must identify pain as its reason`);
  assert.equal(final.safetyRestriction?.scope, "exercise", `${label}: history pain must block the affected exercise`);
  assert.match(final.userExplanation, /pain.free|substitut|stop/i, `${label}: explain the conservative pain-free substitute or stop path`);
}

const painFreeHistory = regressionHistory({ pain: false });
const painFreeStaleness = assessExerciseStaleness(painFreeHistory);
assert.equal(painFreeStaleness.deloadCandidate, true, "control: repeated regressions plus fatigue should remain a deload candidate without pain");
const painFreeDecision = determineProgressionDecision({ history: painFreeHistory, staleness: painFreeStaleness });
assert.equal(painFreeDecision.action, "exercise_deload", "control: pain-free regression may choose an exercise deload");
assert.equal(painFreeDecision.recommendationType, "exercise_deload", "control: pain-free regression keeps the deload recommendation");
const painFreePrescription = prescribe(painFreeHistory);
assert.equal(painFreePrescription.finalPrescription.recommendationType, "exercise_deload", "control: pain-free regression remains executable as a deload");
assert.notEqual(painFreePrescription.finalPrescription.executionBlocked, true, "control: a pain-free deload is not a hard-safety block");
assert.ok(painFreePrescription.finalPrescription.workingSets.target > 0, "control: a pain-free deload retains bounded working sets");
console.log("PASS pain-free repeated-regression control remains an executable exercise deload");

for (const [label, history] of [
  ["chronological painful history", regressionHistory()],
  ["reverse-input painful history", regressionHistory({ reverseInput: true })]
]) {
  const staleness = assessExerciseStaleness(history);
  assert.equal(staleness.deloadCandidate, true, `${label}: fixture must preserve the competing deload candidate`);
  assert.equal(staleness.rotationRecommended, true, `${label}: fixture must preserve the rotation candidate`);
  assert.equal(staleness.metrics.painFlag, true, `${label}: fixture must expose repeated historical pain`);

  const decision = determineProgressionDecision({ history, staleness });
  assert.equal(decision.action, "hold_for_pain_free_modification", `${label}: pain must precede the deload branch`);
  assert.equal(decision.recommendationType, "hold", `${label}: the direct decision must hold rather than deload the painful movement`);
  assert.match(`${decision.instruction} ${decision.regressionRule}`, /pain.free|substitut|qualified evaluation/i, `${label}: direct decision must explain the conservative pain path`);

  assertBlockedPainfulOriginal(prescribe(history), label);
}

const latestOnlyHistory = regressionHistory({ pain: false });
latestOnlyHistory.at(-1).pain = true;
const latestOnlyStaleness = assessExerciseStaleness(latestOnlyHistory);
assert.equal(latestOnlyStaleness.metrics.painFlag, false, "latest-only fixture must not masquerade as repeated pain");
const latestOnlyDecision = determineProgressionDecision({ history: latestOnlyHistory, staleness: latestOnlyStaleness });
assert.equal(latestOnlyDecision.action, "hold_for_pain_free_modification", "pain on the latest comparable exposure must block before deload");
assert.match(latestOnlyDecision.instruction, /latest comparable exposure/i, "latest-only pain must identify the actual evidence source");
assert.doesNotMatch(latestOnlyDecision.instruction, /recorded repeatedly/i, "latest-only pain must not be described as repeated");
const latestOnlyPrescription = prescribe(latestOnlyHistory);
assertBlockedPainfulOriginal(latestOnlyPrescription, "latest-only painful history");
assert.match(latestOnlyPrescription.finalPrescription.userExplanation, /latest comparable exposure/i, "snapshot explanation must retain latest-only provenance");
assert.doesNotMatch(latestOnlyPrescription.finalPrescription.userExplanation, /recorded repeatedly/i, "snapshot explanation must not fabricate repeated pain");

const olderPainHistory = productiveHistoryWithOlderPain();
const olderPainStaleness = assessExerciseStaleness(olderPainHistory);
assert.equal(olderPainStaleness.metrics.painFlag, false, "one older painful exposure must not become a repeated-pain signal");
const olderPainDecision = determineProgressionDecision({ history: olderPainHistory, staleness: olderPainStaleness });
assert.notEqual(olderPainDecision.action, "hold_for_pain_free_modification", "resolved older pain with a pain-free latest exposure must not hard-block current work");
assert.notEqual(olderPainDecision.recommendationType, "exercise_deload", "an isolated older pain record must not fabricate a deload");
const olderPainPrescription = prescribe(olderPainHistory);
assert.notEqual(olderPainPrescription.finalPrescription.executionBlocked, true, "resolved older pain must not block the current prescription");
assert.notEqual(olderPainPrescription.finalPrescription.recommendationType, "substitute", "resolved older pain must not require a current substitute");
assert.notEqual(olderPainPrescription.finalPrescription.recommendationType, "exercise_deload", "resolved older pain must not fabricate a current deload");

const readinessPain = prescribe(painFreeHistory, { pain: true, affectedMuscle: "Chest" });
assertBlockedPainfulOriginal(readinessPain, "explicit readiness pain");

console.log("Pain-over-deload precedence contract passed: pain-free deload, repeated/reversed, latest-only, resolved-older, and explicit-readiness controls.");
