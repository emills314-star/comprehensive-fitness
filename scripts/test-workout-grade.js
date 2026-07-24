const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { readApplicationContractSource } = require("./read-application-contract-source");

const root = path.resolve(__dirname, "..");
const html = readApplicationContractSource(root);
const engineMatch = html.match(/\/\/ WORKOUT_GRADING_ENGINE_START([\s\S]*?)\/\/ WORKOUT_GRADING_ENGINE_END/);
assert.ok(engineMatch, "Workout grading engine markers must remain available for focused tests");

const context = vm.createContext({ console, Math, Number, String, Array, Object, Set, Map });
vm.runInContext(engineMatch[1], context);
const grade = context.workoutLetterGrade;
const score = context.scoreWorkoutGradeMetrics;

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`Unclosed ${name}`);
}

assert.equal(grade(100), "A+");
assert.equal(grade(97), "A+");
assert.equal(grade(96), "A");
assert.equal(grade(93), "A");
assert.equal(grade(92), "A-");
assert.equal(grade(90), "A-");
assert.equal(grade(89), "B+");
assert.equal(grade(87), "B+");
assert.equal(grade(86), "B");
assert.equal(grade(83), "B");
assert.equal(grade(82), "B-");
assert.equal(grade(80), "B-");
assert.equal(grade(79), "C+");
assert.equal(grade(77), "C+");
assert.equal(grade(76), "C");
assert.equal(grade(73), "C");
assert.equal(grade(72), "C-");
assert.equal(grade(70), "C-");
assert.equal(grade(69), "D");
assert.equal(grade(60), "D");
assert.equal(grade(59), "F");

function result(status = "stable", rangeCompliance = 1, progressionRatio = 0.9) {
  return { comparison: { status }, rangeCompliance, progressionRatio };
}

function metrics(overrides = {}) {
  const results = overrides.results || [result("progress", 1, 1), result("progress", 1, 1)];
  const completedSets = overrides.completedSets ?? 10;
  const plannedSets = overrides.plannedSets ?? 10;
  return {
    results,
    progressionRatio: overrides.progressionRatio ?? results.reduce((sum, item) => sum + item.progressionRatio, 0) / results.length,
    programRatio: overrides.programRatio ?? 1,
    completedSets,
    plannedSets,
    loggedRpeCount: overrides.loggedRpeCount ?? completedSets,
    rpeComplianceWeighted: overrides.rpeComplianceWeighted ?? 1,
    rpeLoggedRatio: overrides.rpeLoggedRatio ?? 1,
    completionRatio: overrides.completionRatio ?? completedSets / plannedSets,
    stabilityRatio: overrides.stabilityRatio ?? 1,
    adjustedResults: overrides.adjustedResults || [],
    intentAdherence: overrides.intentAdherence ?? 1,
    severeFatigueSignals: overrides.severeFatigueSignals ?? 0
  };
}

function assertCategoryTotal(scored) {
  assert.equal(scored.categoryScores.reduce((sum, category) => sum + category.earned, 0), scored.internalScore);
  assert.equal(scored.grade, grade(scored.internalScore));
}

const exceptional = score(metrics());
assert.equal(exceptional.grade, "A+", "Multiple meaningful improvements with perfect execution should earn A+");
assertCategoryTotal(exceptional);

const perfectWithoutPr = score(metrics({ results: [result("stable", 1, 0.85)], progressionRatio: 0.85 }));
assert.equal(perfectWithoutPr.grade, "A", "Perfect execution may earn an A without a PR");
assertCategoryTotal(perfectWithoutPr);

const goodWithLimitation = score(metrics({
  results: [result("stable", 0.85, 0.8)], progressionRatio: 0.8, programRatio: 0.85,
  rpeComplianceWeighted: 0.8, completedSets: 9, plannedSets: 10, completionRatio: 0.9,
  stabilityRatio: 0.8, intentAdherence: 0.9
}));
assert.equal(goodWithLimitation.grade, "B", "Good work with one clear limitation should land near B");
assertCategoryTotal(goodWithLimitation);

const mixedSession = score(metrics({
  results: [result("stable", 0.72, 0.72)], progressionRatio: 0.72, programRatio: 0.72,
  rpeComplianceWeighted: 0.7, completedSets: 8, plannedSets: 10, completionRatio: 0.8,
  stabilityRatio: 0.6, intentAdherence: 0.8
}));
assert.equal(mixedSession.grade, "C", "Inconsistent but productive execution should produce a C-range result");
assertCategoryTotal(mixedSession);

const failedSession = score(metrics({
  results: [result("regression", 0.2, 0.35)], progressionRatio: 0.35, programRatio: 0.3,
  rpeComplianceWeighted: 0.2, completedSets: 3, plannedSets: 10, completionRatio: 0.3,
  stabilityRatio: 0.3, intentAdherence: 0.4, severeFatigueSignals: 2
}));
assert.equal(failedSession.grade, "F", "Skipped work and excessive fatigue should produce a constructive low grade");
assertCategoryTotal(failedSession);

const readinessAdjusted = score(metrics({
  results: [result("stable", 1, 0.95)], progressionRatio: 0.95,
  adjustedResults: [{}], intentAdherence: 1
}));
assert.ok(["A+", "A", "A-"].includes(readinessAdjusted.grade), "Executing a readiness-adjusted plan should remain A-level");

const plannedDeload = score(metrics({
  results: [result("stable", 1, 0.95)], progressionRatio: 0.95,
  adjustedResults: [{ isDeload: true }], intentAdherence: 1
}));
assert.ok(["A+", "A", "A-"].includes(plannedDeload.grade), "A well-executed deload should remain A-level despite reduced loading");

const missingRpe = score(metrics({ loggedRpeCount: 0, rpeLoggedRatio: 0, rpeComplianceWeighted: 0 }));
assert.ok(missingRpe.internalScore < exceptional.internalScore, "Missing RPE must lower certainty and category points");
assert.ok(missingRpe.internalScore >= 80, "Missing RPE alone must not erase otherwise excellent execution");

const oneOutlierResults = [result("progress", 1, 1), result("progress", 1, 1), result("stable", 1, 0.9), result("regression", 1, 0.55)];
const oneOutlier = score(metrics({ results: oneOutlierResults }));
assert.ok(oneOutlier.internalScore >= 90, "One extreme exercise outlier must not destroy an otherwise strong workout");

assert.match(html, /filter\(\(set\) => isWorkingSet\(set, "score"\)\)/, "Canonical set semantics must exclude warm-ups before grading");
assert.match(html, /const workoutAnalysis = calculateWorkoutAnalysis\(completedSession, \{ prs \}\)/, "Submission must calculate structured workout analysis");
assert.match(html, /workoutAnalysis \}\s*: item/, "The submitted session must persist its workout analysis");
assert.match(html, /calculateWorkoutAnalysis\(updatedSession, \{ prs \}\)/, "Saving history edits must recalculate the grade");
assert.match(html, /workoutAnalysisForSession\(session\)/, "Saved history must render the same analysis");
assert.match(html, /highlightedExercises\.has/, "Related PR and progression labels must be grouped instead of double counted");
assert.doesNotMatch(html.match(/function renderCompletedWorkoutSummary[\s\S]*?\n      }/)[0], /internalScore\}\s*\/\s*100|internalScore\s*\+\s*['"] \/ 100/, "The overall workout result must not expose its internal numerical score");
assert.match(html, /const workoutAchievementAssets = Object\.freeze\(\{[\s\S]*personal_record:[\s\S]*e1rm_peak:[\s\S]*volume_record:[\s\S]*plan_complete:[\s\S]*target_precision:[\s\S]*smart_training:[\s\S]*progression:[\s\S]*controlled_execution:/, "The completion summary must retain the full positive-outcome badge artwork map");
assert.match(html, /<section class="workout-achievements"[\s\S]*Earned this workout[\s\S]*Achievement badges[\s\S]*workout-achievement-grid/, "Earned badges must render as a dedicated completion-summary strip");
assert.match(html, /\.workout-achievements \{[^}]*background-color: #f3f7fc;[^}]*border: 2px solid #2d6ca9;[\s\S]*\.workout-achievement strong \{[^}]*color: #123d6b;[\s\S]*\.workout-achievement span \{[^}]*color: #435a70;/, "Achievement cards must use explicit high-contrast colors instead of a fallible theme token");

const achievementData = {
  settings: { weightUnit: "lb" },
  sessions: [
    { id: "prior", date: "2026-07-20" },
    { id: "current", date: "2026-07-24", prs: [
      { exercise: "Bench Press", type: "Best estimated performance", value: "245 e1RM" },
      { exercise: "Bench Press", type: "Load record", value: "205 lb" }
    ] }
  ],
  exercises: [
    { id: "prior-exercise", sessionId: "prior", executionQualityAssessment: "controlled" },
    { id: "current-exercise", sessionId: "current", executionQualityAssessment: "controlled" }
  ],
  sets: [
    { exerciseId: "prior-exercise", completed: true, reps: 10, load: 80 },
    { exerciseId: "current-exercise", completed: true, reps: 10, load: 100 }
  ]
};
const achievementFactory = new Function(
  "data", "workoutAchievementAssets", "canonicalExerciseId", "activeHistorySessions", "sessionComesBefore",
  "isWorkingSet", "resistanceTypeFor", "resistanceLoad", "setsForExercise",
  `${extractFunction(html, "workoutSessionVolumeLoad")}
   ${extractFunction(html, "workoutAchievementBadges")}
   return workoutAchievementBadges;`
);
const achievementBadges = achievementFactory(
  achievementData,
  {
    personal_record: "pr.png", e1rm_peak: "e1rm.png", volume_record: "volume.png", plan_complete: "complete.png",
    target_precision: "precision.png", smart_training: "smart.png", progression: "progress.png", controlled_execution: "control.png"
  },
  (value) => String(value || "").toLowerCase().replace(/\W+/g, "-"),
  () => achievementData.sessions,
  (candidate, session) => candidate.date < session.date,
  () => true,
  () => "external",
  (set) => set.load,
  (exerciseId) => achievementData.sets.filter((set) => set.exerciseId === exerciseId)
);
const earnedKeys = achievementBadges(achievementData.sessions[1], {
  metrics: {
    progressedExercises: 1,
    plannedSets: 1,
    completedSets: 1,
    completionRatio: 1,
    averageRangeCompliance: 1,
    rpeLoggedRatio: 1,
    rpeCompliance: 1
  },
  readinessContext: { adjustments: 1, adherence: 1 }
}).map((badge) => badge.key);
assert.deepEqual(
  earnedKeys,
  ["e1rm_peak", "personal_record", "volume_record", "progression", "plan_complete", "target_precision", "controlled_execution", "smart_training"],
  "A benchmark workout should earn each distinct positive-outcome badge exactly once"
);

console.log("Workout grade and achievement badge tests passed (thresholds, intent, persistence, records, precision, and recovery-aware outcomes).");
