"use strict";

const assert = require("node:assert/strict");
const { buildGradeHarness, engineSource, historySource } = require("./workout-grade-test-harness");
const { readApplicationContractSource } = require("./read-application-contract-source");

function set(id, exerciseId, overrides = {}) {
  return {
    id,
    exerciseId,
    setType: "working",
    completed: true,
    skipped: false,
    weight: 200,
    reps: 8,
    rpe: 8,
    targetRpe: 8,
    ...overrides
  };
}

function seedCurrentWorkout(overrides = {}) {
  return {
    sessions: [{ id: "current", date: "2026-07-31", submitted: false, title: "Adapted workout" }],
    exercises: [{
      id: "exercise-current",
      sessionId: "current",
      order: 1,
      name: "Barbell Bench Press — Heavy",
      performanceExerciseId: "bench-heavy",
      resistanceType: "external",
      stableTargetSnapshot: { repMin: 6, repMax: 10, targetRpe: 8 }
    }],
    sets: [
      set("set-1", "exercise-current"),
      set("set-2", "exercise-current", { weight: 190, reps: 9, rpe: 8.5, setType: "backoff" })
    ],
    ...overrides
  };
}

{
  const { context } = buildGradeHarness();
  assert.equal(context.workoutLetterGrade(100), "A");
  assert.equal(context.workoutLetterGrade(90), "A");
  assert.equal(context.workoutLetterGrade(89), "B");
  assert.equal(context.workoutLetterGrade(80), "B");
  assert.equal(context.workoutLetterGrade(79), "C");
  assert.equal(context.workoutLetterGrade(70), "C");
  assert.equal(context.workoutLetterGrade(69), "D");
  assert.equal(context.workoutLetterGrade(60), "D");
  assert.equal(context.workoutLetterGrade(59), "F");
  assert.doesNotMatch(
    engineSource,
    /["'][A-D][+-]["']/,
    "The prospective grade must use only the approved A–F scale"
  );
}

{
  const { context, data } = buildGradeHarness(seedCurrentWorkout());
  const session = data.sessions[0];
  const baseline = context.calculateWorkoutAnalysis(session);
  assert.equal(baseline.contractVersion, "comprehensive-fitness-workout-grade/2.0.0");
  assert.equal(baseline.algorithmVersion, "actual-work-rubric/1.0.0");
  assert.equal(baseline.letter, "A");
  assert.equal(baseline.sourceSessionId, session.id);
  assert.ok(baseline.reasons.length >= 2 && baseline.reasons.length <= 3);

  session.basePrescription = {
    exercises: Array.from({ length: 12 }, (_, index) => ({ order: 12 - index, plannedSets: 20 }))
  };
  session.recommendationSnapshot = { exactLoad: 999, exactReps: 1 };
  session.readinessAdjustments = [{ targetSets: 1, targetLoad: 20 }];
  data.exercises[0].order = 99;
  data.exercises[0].substitutedFrom = "A different planned exercise";
  data.exercises[0].name = "Long Custom Press Variant — Travel Substitute";
  data.exercises[0].performanceExerciseId = "custom-travel-press";
  data.exercises[0].plannedSetCount = 20;
  data.sets.forEach((item) => {
    item.plannedOrder = 99;
    item.originalTargetWeight = 999;
    item.originalTargetReps = 1;
  });
  const adapted = context.calculateWorkoutAnalysis(session);
  assert.equal(adapted.letter, baseline.letter, "Original plan, reorder, substitution, and planned set-count metadata cannot change the actual-work grade");
  assert.deepEqual(
    Array.from(adapted.reasons, (reason) => ({ ...reason })),
    Array.from(baseline.reasons, (reason) => ({ ...reason })),
    "Plan divergence cannot leak into the prospective grade reasons"
  );

  data.sets.push(
    set("warmup", "exercise-current", { setType: "warmup", isWarmup: true, weight: 500, reps: 0, rpe: 99 }),
    set("skipped", "exercise-current", { skipped: true, weight: 500, reps: 0, rpe: 99 })
  );
  const protectedRoles = context.calculateWorkoutAnalysis(session);
  assert.equal(protectedRoles.letter, baseline.letter, "Warm-ups and skipped sets must not become grade-qualifying work");
  assert.deepEqual(
    Array.from(protectedRoles.reasons, (reason) => ({ ...reason })),
    Array.from(baseline.reasons, (reason) => ({ ...reason })),
    "Warm-ups and skipped sets must not alter grade evidence"
  );
}

{
  const fixture = seedCurrentWorkout();
  fixture.sets.forEach((item) => { item.rpe = null; });
  const { context, data } = buildGradeHarness(fixture);
  const missingRpe = context.calculateWorkoutAnalysis(data.sessions[0]);
  assert.ok(["A", "B", "C", "D"].includes(missingRpe.letter), "Missing RPE must remain unknown evidence rather than invalidating otherwise completed work");
  assert.match(
    missingRpe.reasons.map((reason) => reason.text).join(" "),
    /0 of 2 completed working sets include RPE/,
    "The grade must explain missing RPE factually"
  );
}

{
  const exceptionFixture = seedCurrentWorkout({
    sessions: [
      { id: "prior", date: "2026-07-01", submitted: true, submittedAt: "2026-07-01T12:00:00.000Z", title: "Prior benchmark" },
      {
        id: "current",
        date: "2026-07-31",
        submitted: false,
        title: "Pain override comparison",
        resolvedActions: [{
          contractVersion: "comprehensive-fitness-resolved-action/1.0.0",
          decisionId: "pain-action",
          outcome: "action",
          category: "pain_or_illness",
          handling: "accepted",
          scope: { type: "session" }
        }]
      }
    ],
    exercises: [
      { id: "prior-exercise", sessionId: "prior", name: "Barbell Bench Press — Heavy", performanceExerciseId: "bench-heavy", resistanceType: "external" },
      {
        id: "exercise-current",
        sessionId: "current",
        name: "Barbell Bench Press — Heavy",
        performanceExerciseId: "bench-heavy",
        resistanceType: "external",
        stableTargetSnapshot: { repMin: 6, repMax: 10, targetRpe: 8 }
      }
    ],
    sets: [
      set("prior-set", "prior-exercise", { weight: 250, reps: 8, rpe: 8 }),
      set("current-set", "exercise-current", { weight: 200, reps: 8, rpe: 10 })
    ]
  });
  const coherentHarness = buildGradeHarness(exceptionFixture);
  const accepted = coherentHarness.context.calculateWorkoutAnalysis(coherentHarness.data.sessions[1]);

  exceptionFixture.sessions[1].resolvedActions[0].handling = "ignored";
  const ignoredHarness = buildGradeHarness(exceptionFixture);
  const ignored = ignoredHarness.context.calculateWorkoutAnalysis(ignoredHarness.data.sessions[1]);

  assert.notEqual(
    ignored.letter,
    accepted.letter,
    "Ignoring a pain action must not receive the same effort/regression accommodation as coherently accepting it"
  );
  assert.match(
    ignored.reasons.map((reason) => reason.text).join(" "),
    /ignored or overridden/,
    "The grade reasons must describe an ignored or overridden exception without calling it coherent handling"
  );
}

{
  const { context } = buildGradeHarness({ settings: { weightUnit: "lb" } });
  const samePhysicalLoad = context.compareWorkoutPerformance(
    { weight: 220.5, weightUnit: "lb", reps: 8, rpe: 8 },
    { weight: 100, weightUnit: "kg", reps: 8, rpe: 8 },
    "external",
    1
  );
  assert.equal(
    samePhysicalLoad.status,
    "stable",
    "Mixed-unit source observations must be normalized before grade comparison"
  );

  const unsupportedEstimate = context.compareWorkoutPerformance(
    { weight: 100, weightUnit: "lb", reps: 50, rpe: 10 },
    { weight: 150, weightUnit: "lb", reps: 5, rpe: 8 },
    "external",
    1
  );
  assert.equal(
    unsupportedEstimate.status,
    "baseline",
    "High-repetition work must not create an unbounded estimated-performance progression claim"
  );
  assert.match(unsupportedEstimate.change, /no derived comparison was applied/i);
}

{
  const fixture = seedCurrentWorkout();
  fixture.sessions[0].submitted = true;
  fixture.sessions[0].workoutAnalysis = {
    version: 77,
    algorithmVersion: "legacy-grade/77",
    grade: "B+",
    internalScore: 84,
    rationale: "Stored historical result"
  };
  const before = JSON.stringify(fixture.sessions[0]);
  const { context, data } = buildGradeHarness(fixture);
  const projection = context.workoutAnalysisForSession(data.sessions[0]);
  assert.deepEqual(
    { ...projection, gradeReasons: Array.from(projection.gradeReasons) },
    {
      grade: "B+",
      gradeVersion: "legacy-grade/77",
      gradeReasons: ["Stored historical result"],
      currentContract: false
    },
    "Legacy plus/minus grades and versions must remain readable without applying the new algorithm"
  );
  assert.equal(JSON.stringify(data.sessions[0]), before, "Reading a historical grade must not mutate its submitted source record");
}

const application = readApplicationContractSource();
assert.match(
  historySource,
  /const workoutAnalysis = calculateWorkoutAnalysis\(completedSession, \{ prs \}\)/,
  "Submission must calculate one prospective actual-work grade"
);
assert.match(
  historySource,
  /workoutAnalysis\s*\}\s*:\s*item/,
  "Submission must persist the versioned grade with the submitted workout"
);
assert.doesNotMatch(
  application,
  /calculateWorkoutAnalysis\(updatedSession/,
  "Editing historical source facts must not silently regrade a submitted workout"
);
assert.doesNotMatch(
  application,
  /workoutAchievement|workout-achievement|achievement badge|Earned this workout/i,
  "Deleted achievement badges and celebration UI must not survive the concise completion"
);
assert.doesNotMatch(
  engineSource,
  /scoreWorkoutGradeMetrics|programRatio|completionRatio|plannedSets|intentAdherence|rangeCompliance|targetRepMatches/,
  "The old prescription-adherence grade algorithm and planned-set penalties must be gone"
);

console.log("Workout grade contract passed (A–F actual-work grading, adaptation invariance, role protection, missing data, and immutable history).");
