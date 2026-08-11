"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildGradeHarness, historySource, root } = require("./workout-grade-test-harness");
const { readApplicationContractSource } = require("./read-application-contract-source");

const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas", "redesign-workout-grade.v2.schema.json"), "utf8"));
const analysis = fs.readFileSync(path.join(root, "app-analysis.js"), "utf8");
const foundation = fs.readFileSync(path.join(root, "app-foundation.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const workout = fs.readFileSync(path.join(root, "app-workout.js"), "utf8");
const runtime = readApplicationContractSource(root);

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = nextName ? source.indexOf(`function ${nextName}(`, start + 1) : source.length;
  assert.ok(start >= 0 && end > start, `${name} must remain independently inspectable`);
  return source.slice(start, end);
}

assert.deepEqual(
  schema.required,
  ["contractVersion", "algorithmVersion", "letter", "reasons", "sourceSessionId", "createdAt"],
  "The prospective grade contract must have one exact required-field source of truth"
);
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.contractVersion.const, "comprehensive-fitness-workout-grade/2.0.0");
assert.deepEqual(schema.properties.letter.enum, ["A", "B", "C", "D", "F"]);
assert.equal(schema.properties.reasons.minItems, 2);
assert.equal(schema.properties.reasons.maxItems, 3);
assert.deepEqual(schema.properties.reasons.items.required, ["code", "text"]);
assert.equal(schema.properties.reasons.items.additionalProperties, false);

{
  const currentGrade = {
    contractVersion: "comprehensive-fitness-workout-grade/2.0.0",
    algorithmVersion: "actual-work-rubric/1.0.0",
    letter: "B",
    reasons: [
      { code: "actual_work", text: "Two valid working sets were recorded." },
      { code: "logging_validity", text: "One RPE was missing." }
    ],
    sourceSessionId: "current-history",
    resolvedActionDecisionIds: [],
    createdAt: "2026-07-31T12:00:00.000Z"
  };
  const fixture = {
    sessions: [{
      id: "current-history",
      date: "2026-07-31",
      submitted: true,
      submittedAt: "2026-07-31T12:00:00.000Z",
      workoutAnalysis: structuredClone(currentGrade)
    }],
    exercises: [],
    sets: []
  };
  const original = JSON.stringify(fixture.sessions[0].workoutAnalysis);
  const { context, data } = buildGradeHarness(fixture);
  const projection = context.workoutAnalysisForSession(data.sessions[0]);
  assert.deepEqual(
    {
      ...projection,
      gradeReasons: Array.from(projection.gradeReasons)
    },
    {
      grade: "B",
      gradeVersion: "actual-work-rubric/1.0.0",
      gradeReasons: ["Two valid working sets were recorded.", "One RPE was missing."],
      currentContract: true
    }
  );
  assert.equal(JSON.stringify(data.sessions[0].workoutAnalysis), original, "Current submitted grades must remain immutable source observations");
}

{
  const fixture = {
    sessions: [
      { id: "prior", date: "2026-07-01", submitted: true, submittedAt: "2026-07-01T12:00:00.000Z" },
      { id: "current", date: "2026-07-31", submitted: false, createdAt: "2026-07-31T12:00:00.000Z" }
    ],
    exercises: [
      { id: "prior-exercise", sessionId: "prior", name: "Bench Press — Heavy", performanceExerciseId: "bench-heavy", resistanceType: "external" },
      { id: "current-exercise", sessionId: "current", name: "Bench Press — Heavy", performanceExerciseId: "bench-heavy", resistanceType: "external" }
    ],
    sets: [
      { id: "prior-top", exerciseId: "prior-exercise", setType: "working", completed: true, weight: 225, reps: 6, rpe: 8 },
      { id: "prior-backoff", exerciseId: "prior-exercise", setType: "backoff", completed: true, weight: 185, reps: 10, rpe: 8 },
      { id: "prior-warmup", exerciseId: "prior-exercise", setType: "warmup", isWarmup: true, completed: true, weight: 135, reps: 10, rpe: 5 }
    ]
  };
  const { context, data } = buildGradeHarness(fixture);
  const currentExercise = data.exercises.find((exercise) => exercise.id === "current-exercise");
  const comparable = context.priorComparableWorkoutSets(
    data.sessions.find((session) => session.id === "current"),
    currentExercise,
    "external",
    { setType: "backoff" }
  );
  assert.deepEqual(
    Array.from(comparable, (item) => item.id),
    ["prior-backoff"],
    "Comparable progress facts must match the exact exercise variant, resistance type, and set role"
  );
}

const completion = functionSource(historySource, "renderCompletedWorkoutSummary");
assert.match(completion, /workout-grade-mark/);
assert.match(completion, /reasons\.slice\(0, 3\)/);
assert.match(completion, /currentHighlights\.slice\(0, 3\)/);
assert.match(completion, /renderResolvedAction\(resolvedActionForScope\(session, "session"\)/, "Completion may show only the canonical still-relevant session exception");
assert.match(completion, /close-completed-summary[\s\S]*open-completion-progress/, "Completion must provide Done and contextual Progress actions");
assert.match(completion, /progressExercise[\s\S]*setsForExercise\(exercise\.id\)[\s\S]*data-resistance-type/, "Completion Progress must retain exercise and resistance context even when no highlight exists");
assert.match(completion, /gradeHeadingTag = options\.history \? "h2" : "h1"/, "The primary completion state must retain one level-one heading");
assert.doesNotMatch(completion, /categoryScores|internalScore|confidence|plan|adherence|achievement|hypertrophy|volume/i, "Completion must remain concise and free of deleted analytics");

const history = functionSource(analysis, "renderHistory", "normalizeSetTypeCode");
assert.match(history, /filter\(\(session\) => isSessionSubmitted\(session\)\)[\s\S]*sessionCompletionDate\(right\)\.localeCompare\(sessionCompletionDate\(left\)\)/, "Workout history must be chronological and submitted-only");
assert.match(history, /Every submitted workout remains available in chronological order/, "Progress must state the full-history contract");
assert.match(history, /storedWorkoutGradeProjection\(session\)/, "History must decode stored grades rather than recalculate them");

const templateCard = functionSource(analysis, "renderTemplateCard", "renderHistory");
for (const approvedAction of ["template-exercise-sets", "template-exercise-rep-min", "template-exercise-rep-max", "template-exercise-rpe", "template-exercise-rest", "move-template-exercise", "duplicate-template", "delete-template-exercise"]) {
  assert.match(templateCard, new RegExp(approvedAction), `Routine management must expose ${approvedAction}`);
}
assert.doesNotMatch(templateCard, /template-exercise-(?:reps|increment|resistance)|add-template-warmup|remove-template-warmup/, "Routine management must not expose increment, warm-up, resistance, or ambiguous single-rep editors");

const duplicateRoutine = functionSource(workout, "duplicateTemplate", "moveTemplateExercise");
assert.match(duplicateRoutine, /id:\s*id\(\)[\s\S]*exercises:[\s\S]*id:\s*id\(\)[\s\S]*warmups:[\s\S]*id:\s*id\(\)[\s\S]*setTypes:[\s\S]*id:\s*id\(\)/, "Routine duplication must allocate independent IDs at every persisted routine level");
assert.doesNotMatch(duplicateRoutine, /sessions:|data\.sessions|data\.exercises|data\.sets/, "Routine duplication must not clone workout or history records");

const reorderRoutine = functionSource(workout, "moveTemplateExercise", "assertTemplateExerciseNumericDomain");
assert.match(reorderRoutine, /exercises\.splice\(sourceIndex,\s*1\)[\s\S]*exercises\.splice\(destinationIndex,\s*0,\s*moved\)/, "Routine reorder must move the stored exercise object in the ordered exercise array");

const templateRename = functionSource(workout, "patchTemplateExerciseName", "patchSet");
assert.doesNotMatch(templateRename, /recommendedRestSeconds|restSeconds/, "Renaming a routine variant must not silently rewrite its stored rest target");

const series = functionSource(analysis, "exercisePerformanceSeries", "resetChartPointActivations");
assert.match(series, /normalizeSetTypeCode\(newestRepresentativeSet\.setType[\s\S]*normalizeSetTypeCode\(set\.setType, set\.isWarmup\) === comparisonRole/, "The performance trend must use one explicit comparable set role");
assert.match(series, /canonicalExerciseId\(exercise\) === canonicalId[\s\S]*resistanceTypeFor\(exercise\) === resistanceType/, "The performance trend must keep named variants and resistance types separate");
assert.match(series, /source: String\(best\.set\.source \|\| exercise\.source \|\| session\.source \|\| "Source not recorded"\)/, "The visible chart source must come from the selected source observation without fabricating missing provenance");

const pointDetail = functionSource(analysis, "renderChartPointDetail", "renderLiftProgress");
for (const requiredFact of ["Selected session", "load", "reps", "RPE", "role", "Exercise note", "Session note", "Source", "Recorded sets"]) {
  assert.match(pointDetail, new RegExp(requiredFact, "i"), `Inspectable chart points must expose ${requiredFact}`);
}
assert.match(pointDetail, /originalImportedLoadFact\(best\)/, "Chart detail must request original imported load provenance for the selected source observation");
const importedLoad = functionSource(analysis, "originalImportedLoadFact", "chartPointSessionGroups");
assert.match(importedLoad, /originalImportedValue[\s\S]*weightUnit[\s\S]*Imported:/, "Original imported load and unit must remain explicit rather than being inferred from the converted display value");

const progressWindow = functionSource(analysis, "recentProgressWindowStart", "chartPointSessionGroups");
assert.match(progressWindow, /monthIndex\s*=\s*latestYear\s*\*\s*12\s*\+\s*latestMonth\s*-\s*6/, "The default contextual chart range must be six calendar months anchored to the latest matching point");
assert.match(progressWindow, /windowName === "all"[\s\S]*points\.filter\(\(point\) => point\.date >= cutoff\)/, "All-history and recent chart windows must share one ephemeral filter");

const liftProgress = functionSource(analysis, "renderLiftProgress", "restAlertState");
assert.match(liftProgress, /progressPointsForDateWindow\(progress\.points\)[\s\S]*renderChart\("performance", progress\.title, visiblePoints[\s\S]*renderHistory\(\{ exercise \}\)/, "The date range must filter only the chart while chronological workout history stays complete");

const catalog = functionSource(foundation, "exerciseCatalog", "selectedExerciseRecord");
assert.match(catalog, /data\.sessions\.filter\(\(session\) => isSessionSubmitted\(session\)\)/, "Exercise search must derive from every submitted workout");
assert.match(catalog, /canonicalId \+ "::resistance::" \+ resistanceType/, "The catalog must expose a separate selectable series for each variant and resistance type");
assert.doesNotMatch(catalog, /six|month|activeHistorySessions|historyCutoff/i, "Older exercise variants must not disappear behind a recent calculation window");
assert.match(app, /action === "open-completion-progress"[\s\S]*selectedExerciseId[\s\S]*setActiveTab\("progress"\)/, "Completion Progress must route contextually to the highlighted exercise");

const prSource = functionSource(historySource, "submitWorkoutPrs", "workoutSubmissionIsAccepted");
assert.match(prSource, /const roleFor[\s\S]*priorForRole/, "PR comparisons must share the exact set role");
assert.match(prSource, /samePerformanceExercise\(priorExercise, exercise\)[\s\S]*resistanceTypeFor\(priorExercise, set\) === resistanceType/, "PR comparisons must share exact variant identity and resistance type");
assert.match(prSource, /comparableWeightSets\.length[\s\S]*previousMaxWeight/, "A first observation must establish a baseline rather than manufacture a PR");

assert.doesNotMatch(runtime, /workoutAchievement|workout-achievement|achievement badge|Earned this workout/i, "Achievement badges must be absent from the M7 runtime and stylesheet");
assert.doesNotMatch(runtime, /scoreWorkoutGradeMetrics|grade confidence|categoryScores|workout-confidence|PR summary page/i, "The old grade/PR analytics surfaces must be absent");

console.log("M7 grade and Progress contract passed (schema, immutable history, role-aware facts, concise completion, and full-history Progress).");
