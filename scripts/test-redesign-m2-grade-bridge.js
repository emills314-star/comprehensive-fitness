const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const { readApplicationContractSource } = require("./read-application-contract-source");

const root = path.resolve(__dirname, "..");
const source = readApplicationContractSource(root);
const engineMatch = source.match(/\/\/ WORKOUT_GRADING_ENGINE_START([\s\S]*?)\/\/ WORKOUT_GRADING_ENGINE_END/);
assert.ok(engineMatch, "Workout grading engine markers must remain available for focused M2 tests");

const context = vm.createContext({
  console,
  Math,
  Number,
  String,
  Array,
  Object,
  Set,
  Map,
  canonicalExerciseId(value) {
    return typeof value === "object" ? value?.canonicalId || "" : String(value || "").trim().toLowerCase();
  }
});
vm.runInContext(engineMatch[1], context);

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = engineMatch[1].indexOf(marker);
  assert.notEqual(start, -1, `Missing ${name}`);
  const bodyStart = engineMatch[1].indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < engineMatch[1].length; index += 1) {
    if (engineMatch[1][index] === "{") depth += 1;
    if (engineMatch[1][index] === "}") depth -= 1;
    if (depth === 0) return engineMatch[1].slice(start, index + 1);
  }
  assert.fail(`Unclosed ${name}`);
}

function resolvedAction({
  decisionId = "decision-1",
  category = "fatigue",
  scope = { type: "session" },
  handling = "accepted",
  contractVersion = "comprehensive-fitness-resolved-action/1.0.0",
  outcome = "action"
} = {}) {
  return {
    contractVersion,
    resolverVersion: "test-resolver/1",
    decisionId,
    evaluatedAt: "2026-07-31T12:00:00.000Z",
    outcome,
    category,
    scope,
    action: { code: "ignored-by-grade", loadPercent: 50 },
    reasonCodes: ["ignored-by-grade"],
    sourceReferences: ["ignored-by-grade"],
    handling
  };
}

const actionContext = context.canonicalGradeActionContext({
  resolvedActions: [
    resolvedAction({ decisionId: "accepted", handling: "accepted" }),
    resolvedAction({ decisionId: "modified", handling: "modified" }),
    resolvedAction({ decisionId: "ignored", handling: "ignored" }),
    resolvedAction({ decisionId: "overridden", handling: "overridden" }),
    resolvedAction({ decisionId: "pending", handling: "pending" }),
    resolvedAction({ decisionId: "wrong-contract", contractVersion: "legacy/9" }),
    resolvedAction({ decisionId: "no-action", outcome: "no_action", category: "none" })
  ]
});
assert.deepEqual(
  Array.from(actionContext.decisionIds),
  ["accepted", "modified", "ignored", "overridden", "pending"],
  "Only persisted canonical v1 action outcomes may cross the grade boundary"
);
assert.deepEqual(
  { ...actionContext.handlingCounts },
  { accepted: 1, modified: 1, ignored: 1, overridden: 1 },
  "Every explicit canonical handling state must remain attributable"
);
assert.equal(actionContext.pendingCount, 1);

const exerciseAction = resolvedAction({
  scope: { type: "exercise", exerciseVariantId: "variant-bench-heavy" },
  handling: "modified"
});
assert.equal(
  context.canonicalGradeActionAppliesToExercise(exerciseAction, {
    id: "runtime-1",
    performanceExerciseId: "variant-bench-heavy",
    canonicalId: "family-bench"
  }),
  true,
  "Exercise actions must match the exact performance identity"
);
assert.equal(
  context.canonicalGradeActionAppliesToExercise(exerciseAction, {
    id: "runtime-2",
    performanceExerciseId: "variant-bench-light",
    canonicalId: "family-bench",
    name: "Bench Press"
  }),
  false,
  "A similar display name or catalog family must not combine distinct variants"
);
assert.equal(
  context.canonicalGradeActionAppliesToExercise(
    resolvedAction({ scope: { type: "exercise", exerciseVariantId: "canonical-row-heavy" } }),
    { id: "runtime-3", canonicalId: "canonical-row-heavy" }
  ),
  true,
  "Canonical exercise identity is the migration fallback when performance identity is absent"
);

function result(status = "stable", rangeCompliance = 1, progressionRatio = 0.9) {
  return { comparison: { status }, rangeCompliance, progressionRatio, oneOffCount: 0 };
}

function gradeMetrics(overrides = {}) {
  const results = [result()];
  return {
    results,
    progressionRatio: 0.9,
    programRatio: 1,
    completedSets: 4,
    plannedSets: 4,
    loggedRpeCount: 4,
    rpeComplianceWeighted: 1,
    rpeLoggedRatio: 1,
    completionRatio: 1,
    stabilityRatio: 1,
    actionContext: context.canonicalGradeActionContext({ resolvedActions: [] }),
    ...overrides
  };
}

const ordinary = context.scoreWorkoutGradeMetrics(gradeMetrics());
const rawDetectorNoise = context.scoreWorkoutGradeMetrics(gradeMetrics({
  severeFatigueSignals: 99,
  adjustedResults: [{ isReadinessAdjusted: true, fatigueWarning: "raw detector output" }],
  intentAdherence: 0,
  readinessAdjustment: { adjusted: { rpe: 4 } },
  fatigueFlags: [{ severity: "critical" }],
  recommendationSnapshot: { finalPrescription: { targetRpe: { max: 5 } } }
}));
assert.equal(rawDetectorNoise.internalScore, ordinary.internalScore, "Raw detector and legacy recommendation fields cannot change the prospective grade");
assert.equal(rawDetectorNoise.grade, ordinary.grade);

for (const handling of ["accepted", "modified", "ignored", "overridden"]) {
  const handledContext = context.canonicalGradeActionContext({
    resolvedActions: [resolvedAction({ decisionId: handling, handling })]
  });
  const scored = context.scoreWorkoutGradeMetrics(gradeMetrics({ actionContext: handledContext }));
  assert.equal(scored.internalScore, ordinary.internalScore, `${handling} handling must not be penalized merely for differing from the initial plan`);
  assert.match(
    scored.categoryScores.find((category) => category.key === "fatigue").reason,
    new RegExp(handling),
    `${handling} handling must remain attributable in the grade rationale`
  );
}

const scoreSource = extractFunction("scoreWorkoutGradeMetrics");
assert.doesNotMatch(scoreSource, /severeFatigueSignals|adjustedResults|intentAdherence|fatigueFlags|readinessAdjustments|recommendationSnapshot/, "The prospective score must not read a detector, legacy readiness adjustment, or recommendation snapshot");
assert.doesNotMatch(extractFunction("workoutExerciseAnalysis"), /session\.readinessAdjustments|recommendationSnapshot|fatigueFlags/, "Exercise grading must not read legacy exception sources");
assert.doesNotMatch(extractFunction("canonicalGradeActionsForSession"), /action\.action|reasonCodes|sourceReferences/, "The bridge must not reinterpret action parameters or detector provenance");

const storedHistorical = {
  version: 77,
  algorithmVersion: "historical-grade/77",
  grade: "B",
  internalScore: 84,
  rationale: "Stored historical result"
};
assert.equal(
  context.workoutAnalysisForSession({ workoutAnalysis: storedHistorical }),
  storedHistorical,
  "Stored historical workout analysis and algorithm attribution must never be silently recomputed"
);
assert.match(engineMatch[1], /algorithmVersion:\s*"legacy-grade-canonical-action-bridge\/1\.0\.0"/, "Prospective bridge results must identify their algorithm revision");

console.log("Redesign M2 grade bridge tests passed (canonical actions only, explicit handling, exact variant scope, historical preservation).");
