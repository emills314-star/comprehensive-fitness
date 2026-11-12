"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const foundation = read("app-foundation.js");
const views = read("app-views.js");
const analysis = read("app-analysis.js");
const workout = read("app-workout.js");
const app = read("app.js");
const css = read("index.html");
const { runtime, scenarioModel, start, activeRows } = require("./test-loaded-bar-table");

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Expected ${name} to exist`);
  const next = source.indexOf("\n      function ", start + 1);
  return source.slice(start, next >= 0 ? next : source.length);
}

const completionEngine = new Function("data", `
  ${functionSource(foundation, "sessionCompletionDate")}
  ${functionSource(foundation, "isCompletedWorkout")}
  const isSessionSubmitted = isCompletedWorkout;
  ${functionSource(analysis, "rollingCompletedSessions")}
  return { isCompletedWorkout, rollingCompletedSessions };
`);

const sessions = Array.from({ length: 12 }, (_, index) => ({
  id: `complete-${index}`,
  date: `2026-07-${String(index + 1).padStart(2, "0")}`,
  submitted: true,
  workoutState: "completed"
}));
sessions.push(
  { id: "active", date: "2026-08-15", workoutState: "active", submitted: false },
  { id: "cancelled", date: "2026-08-14", workoutState: "cancelled", submitted: true },
  { id: "abandoned", date: "2026-08-13", workoutState: "abandoned", submitted: true }
);
const completion = completionEngine({ sessions });
assert.equal(completion.rollingCompletedSessions().length, 10, "The rolling window must stop at ten completed sessions");
assert.deepEqual(completion.rollingCompletedSessions().slice(0, 2).map((session) => session.id), ["complete-11", "complete-10"], "The boundary must use the newest completed sessions first");
assert.equal(completion.isCompletedWorkout(sessions.at(-3)), false, "Active sessions must be excluded");
assert.equal(completion.isCompletedWorkout(sessions.at(-2)), false, "Cancelled sessions must be excluded even if a stale submitted flag exists");
assert.equal(completion.isCompletedWorkout(sessions.at(-1)), false, "Abandoned sessions must be excluded even if a stale submitted flag exists");
const fewer = completionEngine({ sessions: sessions.slice(0, 4) });
assert.equal(fewer.rollingCompletedSessions().length, 4, "The selector must honestly use fewer than ten completed sessions when that is all that exists");

const scoreData = {
  sessions: sessions.slice(0, 4),
  exercises: [
    { sessionId: "complete-0", canonicalId: "press", resistanceType: "external" },
    { sessionId: "complete-1", canonicalId: "press", resistanceType: "external" },
    { sessionId: "complete-2", canonicalId: "press", resistanceType: "external" },
    { sessionId: "complete-0", canonicalId: "row", resistanceType: "external" },
    { sessionId: "complete-3", canonicalId: "curl", resistanceType: "external" }
  ]
};
const scoreRuntime = new Function("data", `
  const isSessionSubmitted = (session) => session.submitted === true && session.workoutState === "completed";
  const sessionCompletionDate = (session) => session.date;
  const canonicalExerciseId = (exercise) => exercise.canonicalId;
  const resistanceTypeFor = (exercise) => exercise.resistanceType;
  const exerciseCatalog = () => [
    { id: "press::resistance::external", canonicalId: "press", resistanceType: "external" },
    { id: "row::resistance::external", canonicalId: "row", resistanceType: "external" },
    { id: "curl::resistance::external", canonicalId: "curl", resistanceType: "external" }
  ];
  const exerciseHypertrophyScore = (exercise) => ({ score: exercise.canonicalId === "press" ? 90 : exercise.canonicalId === "row" ? 70 : null });
  ${functionSource(analysis, "rollingCompletedSessions")}
  ${functionSource(analysis, "rollingHypertrophySummary")}
  return rollingHypertrophySummary;
`)(scoreData);
const score = scoreRuntime(10);
assert.equal(score.score, 80, "Each distinct lift with a valid score must receive equal weight regardless of frequency or set count");
assert.equal(score.liftCount, 2, "Missing or invalid lift scores must be excluded rather than treated as zero");
assert.equal(score.sessionCount, 4, "The summary must report the actual completed-session count");

const previousSetMatcher = new Function(`
  const normalizeSetTypeCode = (setType, isWarmup) => isWarmup ? "warmup" : String(setType || "straight");
  const isWorkingSet = (set) => !set.isWarmup;
  ${functionSource(analysis, "previousComparableSetForRole")}
  return previousComparableSetForRole;
`)();
const priorSets = [
  { id: "prior-set-1", setType: "top", setTypeIndex: 0 },
  { id: "prior-set-2", setType: "backoff", setTypeIndex: 0 },
  { id: "prior-set-3", setType: "backoff", setTypeIndex: 1 }
];
assert.equal(previousSetMatcher(priorSets, "top", 0, 0).id, "prior-set-1", "Set 1 must compare with set 1 from the previous session");
assert.equal(previousSetMatcher(priorSets, "backoff", 1, 2).id, "prior-set-3", "Set 3 must compare with set 3 from the previous session");
assert.equal(previousSetMatcher(priorSets, "straight", 0, 1).id, "prior-set-2", "A role change must still fall back to the same ordinal set from the previous session");
assert.equal(previousSetMatcher(priorSets, "warmup", 0, 0), null, "A warm-up must never fall back to a working set when prior warm-up history is absent");

const recordRuntime = new Function("data", `
  let analysisRevision = 0;
  const exerciseRecordCache = new Map();
  const isSessionSubmitted = (session) => session.submitted === true;
  const canonicalExerciseId = (exercise) => exercise.canonicalId;
  const resistanceTypeFor = (exercise, set) => set?.resistanceType || exercise.resistanceType;
  const setsForExercise = (exerciseId) => data.sets.filter((set) => set.exerciseId === exerciseId);
  const isWorkingSet = (set) => set.setType !== "warmup";
  const resistanceLoadInUnit = (set) => Number(set.weight || 0);
  const sessionCompletionDate = (session) => session.date;
  const progressionProfileForExercise = () => ({ increment: 5 });
  const canonicalSetSequence = (set) => Number(set.sequenceIndex || 0);
  ${functionSource(foundation, "estimatedOneRepMax")}
  ${functionSource(foundation, "roundToIncrement")}
  const setTypeSemantics = (set) => ({ type: set.isWarmup ? "warmup" : (set.setType || "working") });
  ${functionSource(foundation, "isDeloadExposure")}
  ${functionSource(analysis, "exerciseE1rmRecord")}
  return exerciseE1rmRecord;
`);
const recordData = {
  sessions: [
    { id: "old", date: "2026-01-01", submitted: true, title: "Lower A" },
    { id: "new", date: "2026-02-01", submitted: true, title: "Lower B" }
  ],
  exercises: [
    { id: "exercise-old", sessionId: "old", canonicalId: "leg-press", resistanceType: "external" },
    { id: "exercise-new", sessionId: "new", canonicalId: "leg-press", resistanceType: "external" }
  ],
  sets: [
    { id: "set-old", exerciseId: "exercise-old", weight: 300, reps: 10, completed: true, setType: "top", sequenceIndex: 0 },
    { id: "set-new", exerciseId: "exercise-new", weight: 300, reps: 10, completed: true, setType: "top", sequenceIndex: 0 }
  ],
  templates: [{ exercises: [{ canonicalId: "leg-press", resistanceType: "external", increment: 5 }] }]
};
const record = recordRuntime(recordData)({ id: "leg-press::resistance::external", canonicalId: "leg-press", name: "Leg Press", resistanceType: "external" });
assert.equal(record.record.session.id, "new", "e1RM ties must resolve deterministically to the most recent session");
assert.equal(record.record.set.id, "set-new", "The record must retain the exact source set");
assert.deepEqual(record.record.nextTarget, { weight: 300, reps: 11 }, "The next target should prefer one practical repetition when it mathematically exceeds the record");
assert.equal(recordRuntime(recordData)({ canonicalId: "pull-up", resistanceType: "bodyweight" }).applicable, false, "Non-applicable resistance types must not receive a nonsensical e1RM target");

const home = functionSource(views, "renderLiftHome");
const todayChooser = functionSource(views, "renderTodayWorkoutChooser");
assert.match(home, /renderTodayWorkoutChooser\(\)/, "Today must delegate its empty state to the workout chooser");
assert.match(todayChooser, /Choose your workout/, "The empty Today state must use the approved primary prompt");
assert.match(home, /renderRollingHypertrophyCard\(rollingHypertrophySummary\(\)\)/, "Today must render the shared rolling score summary");
assert.doesNotMatch(home, /Choose another workout/, "The empty-state renderer must not contain replacement copy");
assert.doesNotMatch(todayChooser, /Choose another workout/, "The full chooser must not use replacement copy");
assert.match(functionSource(views, "renderQuickStartTemplates"), /Choose another workout/, "Replacement copy must remain scoped to secondary choices beside a planned or existing workout");

const activeHeader = functionSource(views, "renderActiveSessionHeader");
const restClamp = functionSource(views, "renderLoadedBarRestClamp");
assert.match(activeHeader, /loaded-bar-session-title[\s\S]*data-session-dock-elapsed/, "The session header retains routine and elapsed time");
assert.doesNotMatch(activeHeader, /data-timer-progress-label|active-session-timer-status/, "The session header does not duplicate the rest clamp");
assert.match(restClamp, /data-timer-progress-label/, "The rest clamp exposes a readable countdown");
assert.match(restClamp, /if \(!activeTimer\) \{\s*const starter = renderSharedRestStarter\(session\);\s*return starter \?[^;]+: '';/, "Without an active timer only the completed-set-authorized rest starter remains, inside a table row");
assert.doesNotMatch(activeHeader, /In progress|Lifting/, "The active header must not use inaccurate state copy");
assert.doesNotMatch(views, /active-rest-dock/, "The duplicate rest bar must be removed from the rendered UI");

const setRow = functionSource(views, "renderSet");
const setLogger = runtime();
start(setLogger, scenarioModel(setLogger, "shadow"));
const loggingRows = activeRows(setLogger);
setLogger.context.testExerciseId = loggingRows[0].exerciseId;
const renderTable = () => setLogger.run("renderLoadedBarTable(exerciseById(testExerciseId),renderSetContext(exerciseById(testExerciseId)))");
let tableMarkup = renderTable();
assert.match(tableMarkup, /data-set-state="future"/, "Upcoming rows retain their distinct factual state");
assert.match(tableMarkup, /185 × 10 @ 7.5[\s\S]*185 × 10 @ 8[\s\S]*185 × 9 @ 8.5[\s\S]*185 × 8 @ 9/, "Every row shows position-matched Previous load, reps, and RPE");
assert.match(tableMarkup, /data-action="open-session"[^>]*data-session-id="prior-/, "Previous retains the exact source-session link");
setLogger.context.testSetId = loggingRows[3].id;
assert.equal(setLogger.run("guardWorkoutMutation('toggle-set',{setId:testSetId},false).allowed"), true, "An upcoming row may be logged deliberately through exact-ownership authorization");
setLogger.run("toggleSetCompletion(testSetId)");
tableMarkup = renderTable();
assert.match(tableMarkup, /data-set-state="completed"[^>]*class="[^"]*completed/, "The persisted completion attaches its green row treatment");
assert.match(tableMarkup, /value="185"[^>]*data-action="set-weight"/, "Completed actuals remain editable corrections");
setLogger.run("patchSet(testSetId,{previousComparableSet:{weight:180,weightUnit:'lb',reps:8,rpe:9}},false)");
assert.match(renderTable(), /180 × 8 @ 9/, "Factual Previous remains visible when a legacy snapshot has no link metadata");
assert.match(setRow, /previous\?\.priorSessionId/, "Only proven source-session metadata becomes a history link");
assert.match(functionSource(workout, "buildWorkoutStartPlan"), /includeWarmups:\s*true[\s\S]*workoutStartRowPreviews\(templateExercise, target, previousRoleSets, data\.settings\)/, "Shared workout construction must include warm-up history in the pure row projection");
assert.match(functionSource(workout, "workoutStartRowPreviews"), /previousWarmups[\s\S]*setTypeIndex[\s\S]*previousWarmups\[warmupIndex\]/, "Warm-up rows must retain the same position-matched prior-session context");

assert.match(analysis, /renderProgressModeSwitch\('sessions'\)/, "Progress must expose Sessions mode");
assert.match(analysis, /renderProgressModeSwitch\('exercises'\)/, "Progress must expose Exercises mode");
assert.match(analysis, /function renderExerciseProgressDetail/, "Progress must expose one scoped exercise-detail renderer");
assert.doesNotMatch(functionSource(analysis, "renderExerciseProgressDetail"), /Completed workouts|Completed sessions/, "The scoped exercise-detail screen must not contain completed-session history");
assert.match(app, /open-progress-exercise[\s\S]*progressExerciseDetailId = exercise\.id/, "Exercise navigation must route with the stable catalog identifier");
assert.match(app, /open-exercise-history[\s\S]*item\.canonicalId === target\.dataset\.performanceExerciseId[\s\S]*progressExerciseDetailId = catalogExercise\.id/, "Active-workout navigation must resolve the stable exercise identity rather than display text");
assert.match(css, /\.active-session-header\.loaded-bar-session \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto auto 44px/, "The session header gives the routine flexible space alongside independently sized controls");
assert.match(css, /html\.large-text-reflow \.active-session-header\.loaded-bar-session \{[^}]*flex-wrap: wrap/, "Large text reflows the session header without overlapping controls");
assert.match(css, /history-grade\.grade-d[\s\S]*border-style:\s*dashed[\s\S]*history-grade\.grade-f[\s\S]*border-style:\s*dotted/, "Lower grade treatments must remain distinguishable without color alone");

console.log("Quiet Control rolling score, set hierarchy, prior-session matching, e1RM, routing, and Progress contracts passed.");
