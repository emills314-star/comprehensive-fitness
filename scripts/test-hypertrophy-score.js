const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const match = html.match(/\/\/ HYPERTROPHY_SCORE_ENGINE_START([\s\S]*?)\/\/ HYPERTROPHY_SCORE_ENGINE_END/);
assert.ok(match, "Hypertrophy score engine markers were not found in index.html");
const engine = new Function(match[1] + "; return { selectHypertrophyWeeks, calculateHypertrophyScore }; ")();
const { selectHypertrophyWeeks, calculateHypertrophyScore } = engine;

function week(index, overrides = {}) {
  const date = new Date("2026-01-05T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + index * 7);
  return {
    weekStart: date.toISOString().slice(0, 10),
    qualifies: true,
    isDeload: false,
    submittedSessions: 3,
    plannedSets: 20,
    completedSets: 19,
    skippedSets: 0,
    missedSets: 1,
    repRangeTracked: 19,
    repRangeHits: 17,
    rpeLogged: 18,
    rpeOnTarget: 16,
    volumeTargetsTracked: 4,
    volumeTargetsHit: 3,
    volumeChangeRatio: 0.08,
    comparableComparisons: 5,
    progressionWins: 3,
    regressions: 0,
    fatigueHigh: 0,
    fatigueModerate: 0,
    exerciseChangeRate: 0.1,
    ...overrides
  };
}

function score(weeks) {
  return calculateHypertrophyScore({ included: weeks, skippedDeloadWeeks: [], incompleteWeeks: [], requestedWeeks: 6, provisional: weeks.length < 6 });
}

const progressive = score(Array.from({ length: 6 }, (_, index) => week(index, { progressionWins: 5 })));
const stable = score(Array.from({ length: 6 }, (_, index) => week(index, { progressionWins: 0, regressions: 0 })));
assert.ok(progressive.score > stable.score, "Six progressive weeks should outscore stable weeks");
assert.ok(stable.score >= 70, "Stable, well-executed training should still receive a good score");

const eightWeeks = [
  week(7), week(6, { isDeload: true, qualifies: false, completedSets: 4, regressions: 8, fatigueHigh: 8 }),
  week(5), week(4), week(3, { isDeload: true, qualifies: false, completedSets: 4, regressions: 8, fatigueHigh: 8 }),
  week(2), week(1), week(0)
];
const deloadSelection = selectHypertrophyWeeks(eightWeeks, 0, 6);
assert.equal(deloadSelection.included.length, 6, "Selection should continue backward until six non-deload weeks are found");
assert.equal(deloadSelection.skippedDeloadWeeks.length, 2, "Two explicit deload weeks should be listed as skipped");
const deloadScore = calculateHypertrophyScore(deloadSelection);
assert.equal(deloadScore.score, score(deloadSelection.included).score, "Deload metrics must not affect the score");

const provisional = score([week(0), week(1)]);
assert.equal(provisional.confidence, "low", "Fewer than six weeks should be lower confidence");
assert.ok(provisional.score > 0, "Sparse but usable history should receive a provisional score");

const outlierWeeks = Array.from({ length: 6 }, (_, index) => week(index));
const baselineOutlierScore = score(outlierWeeks).score;
outlierWeeks[5] = week(5, { completedSets: 5, repRangeHits: 1, rpeOnTarget: 1, volumeTargetsHit: 0, progressionWins: 0, regressions: 5, fatigueHigh: 3 });
assert.ok(baselineOutlierScore - score(outlierWeeks).score < 25, "One extreme workout must not destroy a six-week score");

const rpeOvershoot = score(Array.from({ length: 6 }, (_, index) => week(index, { rpeOnTarget: 0, fatigueModerate: 2 })));
assert.ok(rpeOvershoot.score < stable.score, "Repeated RPE overshooting should reduce the score");

const improvingReps = score(Array.from({ length: 6 }, (_, index) => week(index, { progressionWins: 4 })));
const improvingLoad = score(Array.from({ length: 6 }, (_, index) => week(index, { progressionWins: 4, repRangeHits: 18 })));
const lowerRpe = score(Array.from({ length: 6 }, (_, index) => week(index, { progressionWins: 4, rpeOnTarget: 18 })));
assert.ok(improvingReps.score > stable.score, "Improving reps at the same load should count as progression");
assert.ok(improvingLoad.score >= improvingReps.score, "Load progression within range should receive full progression credit");
assert.ok(lowerRpe.score >= improvingReps.score, "Maintaining performance at lower RPE should count as progression");

const regressions = score(Array.from({ length: 6 }, (_, index) => week(index, { progressionWins: 0, regressions: 4, fatigueModerate: 2 })));
assert.ok(regressions.score < stable.score - 5, "Repeated regressions should materially reduce the score");

const highFatigue = score(Array.from({ length: 6 }, (_, index) => week(index, { fatigueHigh: 2 })));
const moderateFatigue = score(Array.from({ length: 6 }, (_, index) => week(index, { fatigueModerate: 2 })));
const noFatigue = score(Array.from({ length: 6 }, (_, index) => week(index)));
assert.ok(highFatigue.score < moderateFatigue.score, "High fatigue flags should cost more than moderate flags");
assert.ok(moderateFatigue.score < noFatigue.score, "Moderate fatigue flags should have a smaller but visible effect");

const missingRpe = score(Array.from({ length: 6 }, (_, index) => week(index, { rpeLogged: 0, rpeOnTarget: 0 })));
assert.notEqual(missingRpe.confidence, "high", "Missing RPE data must lower confidence");

const substitutions = score(Array.from({ length: 6 }, (_, index) => week(index, { exerciseChangeRate: 0.75, comparableComparisons: 2 })));
assert.notEqual(substitutions.confidence, "high", "Frequent exercise substitutions must lower confidence");

const incomplete = score(Array.from({ length: 6 }, (_, index) => week(index, { plannedSets: 20, completedSets: 10, skippedSets: 5, missedSets: 5 })));
assert.ok(incomplete.score < stable.score, "Incomplete workouts should reduce consistency");

const editedBad = Array.from({ length: 6 }, (_, index) => week(index));
editedBad[5] = week(5, { repRangeHits: 2, rpeOnTarget: 2, regressions: 4 });
const beforeEdit = score(editedBad).score;
editedBad[5] = week(5, { repRangeHits: 18, rpeOnTarget: 17, progressionWins: 4 });
assert.ok(score(editedBad).score > beforeEdit, "Editing corrected workout data should update the score");
assert.ok(score(editedBad.slice(0, 5)).score !== score(editedBad).score, "Deleting a workout week should recalculate the score");

const deloadThenNormal = selectHypertrophyWeeks([week(7), week(6, { isDeload: true, qualifies: false, regressions: 9 }), week(5), week(4), week(3), week(2), week(1)], 0, 6);
assert.equal(deloadThenNormal.included.some((item) => item.isDeload), false, "Normal training after a deload must compare only across non-deload weeks");

const incompleteSelection = selectHypertrophyWeeks([week(2), week(1, { qualifies: false, completedSets: 1 }), week(0)], 0, 6);
assert.equal(incompleteSelection.included.length, 2, "Incomplete weeks must not count as full qualifying weeks");
assert.equal(incompleteSelection.incompleteWeeks.length, 1, "Incomplete submitted weeks should be disclosed");

const empty = calculateHypertrophyScore({ included: [], skippedDeloadWeeks: [], incompleteWeeks: [], requestedWeeks: 6, provisional: true });
assert.equal(empty.score, null, "No usable data must not produce a fake zero");

const perfectExecution = score(Array.from({ length: 6 }, (_, index) => week(index, {
  completedSets: 20,
  missedSets: 0,
  repRangeTracked: 20,
  repRangeHits: 20,
  rpeLogged: 20,
  rpeOnTarget: 20,
  volumeTargetsHit: 4,
  progressionWins: 5
})));
assert.equal(perfectExecution.categories.find((category) => category.key === "execution").points, 20, "Perfect rep execution should earn 20/20");
assert.equal(perfectExecution.categories.find((category) => category.key === "rpe").points, 15, "Perfect RPE execution should earn 15/15");
assert.equal(perfectExecution.improvements.some((item) => item.key === "execution"), false, "A 20/20 rep category cannot be rendered as a weakness");
assert.equal(perfectExecution.improvements.some((item) => item.key === "rpe"), false, "A 15/15 RPE category cannot be rendered as a weakness");
assert.ok(perfectExecution.improvements.length <= 1, "Near-perfect training must not manufacture several generic criticisms");

assert.equal(rpeOvershoot.improvements.some((item) => item.key === "rpe"), true, "Repeated RPE overshooting should produce an evidence-backed RPE improvement");
assert.equal(incomplete.improvements.some((item) => item.key === "consistency"), true, "Low completion should produce an evidence-backed consistency improvement");

const straightArmPulldown = score(Array.from({ length: 6 }, (_, index) => week(index, {
  completedSets: 12,
  plannedSets: 12,
  repRangeTracked: 12,
  repRangeHits: 12,
  rpeLogged: 12,
  rpeOnTarget: 12,
  volumeTargetsTracked: 2,
  volumeTargetsHit: 2,
  progressionWins: 4,
  regressions: 0
})));
assert.equal(straightArmPulldown.improvements.some((item) => item.key === "execution"), false, "Straight-Arm Pulldown with 100% rep-range compliance must not receive a rep-range criticism");
assert.equal(straightArmPulldown.improvements.some((item) => item.key === "rpe"), false, "Straight-Arm Pulldown with 100% RPE compliance must not receive an RPE criticism");

console.log("Hypertrophy score tests passed (23 scenarios).");
