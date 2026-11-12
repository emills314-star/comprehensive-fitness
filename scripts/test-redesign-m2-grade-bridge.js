"use strict";

const assert = require("node:assert/strict");
const { buildGradeHarness: originalBuildGradeHarness, engineSource } = require("./workout-grade-test-harness");

// The focused grade harness loads history separately; load the real shared
// foundation predicate as the browser does before invoking grade functions.
function buildGradeHarness(seed) {
  const harness = originalBuildGradeHarness(seed);
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "app-foundation.js"), "utf8");
  const start = source.indexOf("function isDeloadExposure(");
  const end = source.indexOf("\n      function getMostRecentWorkoutPerformance(", start);
  require("node:assert/strict").ok(start >= 0 && end > start);
  require("node:vm").runInContext(source.slice(start, end), harness.context);
  return harness;
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
    action: { code: "must-not-be-interpreted-by-grade", loadPercent: 50 },
    reasonCodes: ["must-not-be-interpreted-by-grade"],
    sourceReferences: ["must-not-be-interpreted-by-grade"],
    handling
  };
}

function fixture(action) {
  return {
    sessions: [{
      id: "current",
      date: "2026-07-31",
      title: "Safety-adjusted workout",
      submitted: false,
      resolvedActions: action ? [action] : []
    }],
    exercises: [{
      id: "exercise-current",
      sessionId: "current",
      order: 1,
      name: "Bench Press — Heavy",
      performanceExerciseId: "bench-heavy",
      canonicalId: "bench-family",
      resistanceType: "external",
      stableTargetSnapshot: { repMin: 6, repMax: 10, targetRpe: 8 }
    }],
    sets: [{
      id: "set-current",
      exerciseId: "exercise-current",
      setType: "working",
      completed: true,
      weight: 200,
      reps: 8,
      rpe: 8,
      targetRpe: 8
    }]
  };
}

{
  const { context } = buildGradeHarness();
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
    "Only persisted canonical action outcomes may cross the grade boundary"
  );
  assert.deepEqual(
    { ...actionContext.handlingCounts },
    { accepted: 1, modified: 1, ignored: 1, overridden: 1 },
    "Every explicit canonical handling state must remain attributable"
  );
  assert.equal(actionContext.pendingCount, 1);
  assert.equal(actionContext.incoherentCount, 2, "Ignored and overridden actions must remain explicit without being treated as coherent handling");

  const exerciseAction = resolvedAction({
    scope: { type: "exercise", exerciseVariantId: "bench-heavy" },
    handling: "modified"
  });
  assert.equal(
    context.canonicalGradeActionAppliesToExercise(exerciseAction, {
      performanceExerciseId: "bench-heavy",
      canonicalId: "bench-family"
    }),
    true,
    "Exercise actions must match the exact performance identity"
  );
  assert.equal(
    context.canonicalGradeActionAppliesToExercise(exerciseAction, {
      performanceExerciseId: "bench-light",
      canonicalId: "bench-family"
    }),
    false,
    "A shared catalog family must not combine distinct variants"
  );
  const orderedContext = {
    actions: [
      resolvedAction({ decisionId: "session-accepted", scope: { type: "session" }, handling: "accepted" }),
      resolvedAction({ decisionId: "exercise-ignored", scope: { type: "exercise", exerciseVariantId: "bench-heavy" }, handling: "ignored" })
    ]
  };
  assert.equal(
    context.canonicalGradeActionForExercise(orderedContext, { performanceExerciseId: "bench-heavy" }).decisionId,
    "exercise-ignored",
    "An exact exercise action must take precedence over a broader session action regardless of stored order"
  );
}

for (const category of ["fatigue", "readiness", "deload", "pain_or_illness"]) {
  for (const handling of ["accepted", "modified", "ignored", "overridden"]) {
    const harness = buildGradeHarness(fixture(resolvedAction({ decisionId: `${category}-${handling}`, category, handling })));
    const scored = harness.context.calculateWorkoutAnalysis(harness.data.sessions[0]);
    assert.ok(["A", "B", "C", "D", "F"].includes(scored.letter));
    assert.deepEqual(
      Array.from(scored.resolvedActionDecisionIds),
      [`${category}-${handling}`],
      "The resolved action decision must remain attributable in the persisted grade"
    );
    assert.match(
      scored.reasons.map((reason) => reason.text).join(" "),
      ["accepted", "modified"].includes(handling)
        ? /handled coherently|did not compare actual work with the original plan/i
        : /ignored or overridden|evaluated as recorded/i,
      "The grade reason must distinguish coherent handling from an explicit ignore/override without interpreting detector details"
    );
  }
}

assert.doesNotMatch(
  engineSource,
  /session\.readinessAdjustments|session\.fatigueFlags|session\.recommendationSnapshot|severeFatigueSignals/,
  "The prospective grade must not read raw detector or legacy recommendation state"
);
assert.doesNotMatch(
  engineSource.match(/function canonicalGradeActionsForSession[\s\S]*?function canonicalGradeActionAppliesToExercise/)?.[0] || "",
  /action\.action|reasonCodes|sourceReferences/,
  "The canonical bridge must not reinterpret action parameters or detector provenance"
);

console.log("Redesign grade bridge passed (canonical actions only, explicit handling, exact variant scope, and no plan-deviation penalty).");
