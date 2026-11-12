"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buildGradeHarness } = require("./workout-grade-test-harness");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const foundation = read("app-foundation.js");
const analysis = read("app-analysis.js");
const history = read("app-history.js");

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing ${name}`);
  const tail = source.slice(start);
  const end = tail.search(/\n      (?:async )?function \w+\(/);
  assert.ok(end > 0, `Cannot delimit ${name}`);
  return tail.slice(0, end);
}

function fixture() {
  const sessions = [
    { id: "old", date: "2026-07-27", submitted: true, title: "Older" },
    { id: "normal", date: "2026-08-03", submitted: true, title: "Normal" },
    { id: "deload", date: "2026-08-04", submitted: true, title: "Deload", isDeload: true },
    { id: "current", date: "2026-08-05", submitted: false, title: "Current" }
  ];
  const exercises = sessions.map((session) => ({ id: `${session.id}-exercise`, sessionId: session.id, name: "Bench", performanceExerciseId: "bench", resistanceType: "external" }));
  const sets = sessions.flatMap((session) => [0, 1].map((i) => ({ id: `${session.id}-${i}`, exerciseId: `${session.id}-exercise`, completed: true, setType: "working", sequenceIndex: i, weight: { old: 90, normal: 100, deload: 500, current: 110 }[session.id], reps: 8, rpe: 8 })));
  return { sessions, exercises, sets };
}

function harness(seed = fixture()) {
  const { context, data } = buildGradeHarness(seed);
  Object.assign(data, { templates: [], skippedSessions: seed.skippedSessions || [] });
  Object.assign(context, {
    analysisRevision: 1,
    previousPerformanceCache: new Map(), exerciseProgressCache: new Map(), exerciseRecordCache: new Map(), hypertrophyScoreCache: new Map(),
    chartDetailPoint: null, chartPointActivations: new Map(), chartPointActivationSequence: 0, chartPointActivationEpoch: 0,
    todayIso: () => "2026-08-10",
    normalizePrescriptionIdentity: (value) => String(value).toLowerCase(),
    sessionCompletionDate: (session) => session.date,
    startOfWeekIso: (date) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); },
    estimatedOneRepMax: (set) => Number(set.weight || 0) * (1 + Number(set.reps || 0) / 30),
    canonicalSetSequence: (set) => Number(set.sequenceIndex || 0),
    progressionProfileForExercise: () => ({ increment: 5 }), roundToIncrement: (n, inc) => Math.round(n / inc) * inc,
    formatDate: (date) => date, formatResistance: (set) => `${set.weight} lb`, escapeHtml: (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    sessionWorkoutFacts: (session) => ({ durationMinutes: 0, exercises: data.exercises.filter((exercise) => exercise.sessionId === session.id) }),
    submittedPerformanceIndex: () => ({ sessionById: new Map(data.sessions.filter((s) => s.submitted).map((s) => [s.id, s])), exercisesByCanonical: new Map([["bench", data.exercises.filter((e) => data.sessions.some((s) => s.id === e.sessionId && s.submitted))]]), strongExercisesByExactName: new Map() }),
    dataEntityIndex: () => ({ setIndicesByExercise: new Map(data.exercises.map((e) => [e.id, data.sets.flatMap((s, i) => s.exerciseId === e.id ? [i] : [])])) })
  });
  for (const name of ["normalizeCanonicalSetType", "setTypeSemantics", "isWorkingSet", "isDeloadExposure"]) {
    vm.runInContext(functionSource(foundation, name), context);
  }
  vm.runInContext(functionSource(foundation, "getMostRecentWorkoutPerformance"), context);
  vm.runInContext(analysis, context);
  vm.runInContext(functionSource(history, "submitWorkoutPrs"), context);
  return { context, data };
}

{
  const { context: c } = harness();
  assert.equal(c.isDeloadExposure({ isDeload: true }, {}, []), true);
  assert.equal(c.isDeloadExposure({ sessionType: "deload" }, {}, []), true);
  assert.equal(c.isDeloadExposure({}, { isDeload: true }, []), true);
  assert.equal(c.isDeloadExposure({}, {}, [{ setType: "deload", completed: true }]), true);
  assert.equal(c.isDeloadExposure({}, {}, [{ setType: "working", completed: true }]), false);
}
{
  const { context: c } = harness();
  assert.equal(c.getMostRecentWorkoutPerformance("Bench", { throughDate: "2026-08-05" }).session.id, "normal", "A normal exposure remains Previous even in a week with a later deload");
  assert.equal(c.getMostRecentWorkoutPerformance("Bench", { throughDate: "2026-08-05", includeDeloads: true }).session.id, "normal");
}
{
  const { context: c, data } = harness();
  const current = data.sessions.find((s) => s.id === "current");
  assert.ok(c.submitWorkoutPrs(current).some((pr) => pr.type === "Heaviest load"), "High deload baseline cannot block a valid normal PR");
  current.isDeload = true;
  assert.equal(c.submitWorkoutPrs(current).length, 0, "Deload candidates cannot generate PRs");
  current.isDeload = false;
  const comparable = c.priorComparableWorkoutSets(current, data.exercises.find((e) => e.sessionId === "current"), "external");
  assert.ok(comparable.some((set) => set.id === "normal-0"));
  assert.ok(!comparable.some((set) => set.id === "deload-0"), "New grades compare to non-deload exposure only");
  current.workoutAnalysis = { contractVersion: "comprehensive-fitness-workout-grade/2.0.0", algorithmVersion: "actual-work-rubric/1.1.0", letter: "B", reasons: [{ code: "a", text: "First" }, { code: "b", text: "Second" }], sourceSessionId: current.id, createdAt: "2026-08-05T12:00:00Z" };
  const stored = JSON.stringify(current.workoutAnalysis);
  c.workoutAnalysisForSession(current);
  assert.equal(JSON.stringify(current.workoutAnalysis), stored, "Stored grades remain unchanged");
}
{
  const { context: c } = harness();
  const catalog = { id: "bench::resistance::external", canonicalId: "bench", name: "Bench", resistanceType: "external" };
  assert.equal(c.exerciseE1rmRecord(catalog).record.session.id, "normal");
  assert.deepEqual(Array.from(c.exerciseE1rmSeries(catalog).points, (point) => point.sessionId), ["old", "normal"]);
  const series = c.exercisePerformanceSeries("Bench", { canonicalExerciseId: "bench", resistanceType: "external" });
  assert.equal(series.points.length, 3, "Performance chart preserves deload observations");
  const deloadPoint = series.points.find((point) => point.sessionId === "deload");
  assert.equal(deloadPoint.isDeload, true);
  const html = c.renderChart("performance", "Bench", series.points, "No points");
  assert.match(html, /aria-label="[^"]*Deload/i, "Deload point must be accessible");
  assert.match(html, /chart-point[^"<]*deload/i, "Deload point must be visually distinguishable");
  assert.equal((html.match(/<polyline class="chart-line evidenced"/g) || []).length, 1, "Trend connects the two normal exposures without a line through the deload");
  const score = c.exerciseHypertrophyScore(catalog);
  assert.ok(score.included.some((week) => week.weekStart === "2026-08-03"), "A normal exposure survives a deload in the same week");
  const week = score.included.find((w) => w.weekStart === "2026-08-03");
  assert.equal(week.completedSets, 2, "Deload observations do not enter normal volume");
  assert.equal(week.volumeTotal, 1600);
}
{
  const seed = fixture();
  seed.skippedSessions = [{ id: "skip", date: "2026-08-02", routineId: "deleted", routineName: "Former routine", reason: "injury" }];
  seed.sessions[1].prs = [{ exercise: "Bench", performanceExerciseId: "bench", type: "Heaviest load", value: "100 lb", sourceSetId: "normal-0" }];
  const { context: c, data } = harness(seed);
  let html = c.renderHistory();
  assert.match(html, /Former routine/);
  assert.match(html, /Skipped\s*(?:-|–|—|·)\s*injured/i);
  assert.ok(html.indexOf("Normal") < html.indexOf("Former routine") && html.indexOf("Former routine") < html.indexOf("Older"), "Skip is merged chronologically");
  const skipRow = html.match(/<[^>]+[^>]*>[^<]*Former routine[\s\S]*?Skipped\s*(?:-|–|—|·)\s*injured[\s\S]*?<\/(?:article|div|li)>/i)?.[0];
  assert.ok(skipRow, "Skip has its own noninteractive row");
  assert.doesNotMatch(skipRow, /open-session|history-grade|New PR|show-chart-point/);
  assert.ok(!c.exercisePerformanceSeries("Bench", { canonicalExerciseId: "bench" }).points.some((point) => point.sessionId === "skip"), "Skips cannot create progress points");
  assert.match(html, /New PR/);
  const stored = JSON.stringify(data.sessions[1].prs);
  data.exercises.find((e) => e.sessionId === "normal").isDeload = true;
  html = c.renderHistory();
  assert.doesNotMatch(html, /New PR/, "Retrospective exercise mark hides its stored PR");
  assert.match(html, /Deload/);
  assert.equal(JSON.stringify(data.sessions[1].prs), stored, "Stored PR is not rewritten");
  assert.match(functionSource(analysis, "renderProgressSessions"), /renderHistory\(\)/, "Progress Sessions reuses timeline");
}
{
  const seed = fixture();
  const session = seed.sessions.find((item) => item.id === "normal");
  seed.exercises.push({ id: "same-session-deload", sessionId: session.id, name: "Row", performanceExerciseId: "row", resistanceType: "external", isDeload: true });
  seed.sets.push({ id: "row-set", exerciseId: "same-session-deload", completed: true, setType: "working", weight: 200, reps: 8, rpe: 8 });
  const { context: c, data } = harness(seed);
  assert.equal(c.isDeloadExposure(session, data.exercises.find((exercise) => exercise.id === "normal-exercise"), data.sets.filter((set) => set.exerciseId === "normal-exercise")), false, "A separate deload exercise must not contaminate normal work in the same session");
  assert.equal(c.exerciseE1rmRecord({ id: "bench", canonicalId: "bench", name: "Bench", resistanceType: "external" }).record.session.id, "normal");
  assert.ok(c.submitWorkoutPrs(data.sessions.find((item) => item.id === "current")).some((pr) => pr.type === "Heaviest load"), "A different deload exercise does not suppress the normal baseline");
  assert.match(c.renderHistory(), /Normal[\s\S]*?Deload/, "Mixed session receives a Deload tag");
}
{
  const seed = fixture();
  seed.sessions.find((session) => session.id === "deload").isDeload = false;
  seed.sets.filter((set) => set.exerciseId === "deload-exercise").forEach((set) => { set.setType = "deload"; });
  const { context: c, data } = harness(seed);
  const current = data.sessions.find((session) => session.id === "current");
  assert.equal(c.getMostRecentWorkoutPerformance("Bench", { throughDate: current.date }).session.id, "normal");
  assert.equal(c.exercisePerformanceSeries("Bench", { canonicalExerciseId: "bench" }).points.find((point) => point.sessionId === "deload").isDeload, true, "Deload-typed sets still produce a marked chart point");
  assert.ok(c.submitWorkoutPrs(current).some((pr) => pr.type === "Heaviest load"));
  assert.equal(c.exerciseE1rmRecord({ id: "bench", canonicalId: "bench", name: "Bench", resistanceType: "external" }).record.session.id, "normal");
  data.sets.filter((set) => set.exerciseId === "current-exercise").forEach((set) => { set.setType = "deload"; });
  assert.equal(c.submitWorkoutPrs(current).length, 0, "Deload-typed current sets cannot generate a PR");
  const exercise = data.exercises.find((item) => item.sessionId === "current");
  const result = c.actualWorkExerciseAnalysis(current, exercise, [], c.canonicalGradeActionContext(current));
  assert.equal(result.comparison.label, "Adapted work recorded", "New grade does not compare deload-typed current work");
}
console.log("Deload exposure semantics passed.");




