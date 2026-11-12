"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const { APPLICATION_RUNTIME_FILES } = require("./read-application-contract-source");
const coach = require("../coach-engine");
const backup = require("../backup-contract");
const scenario = require("../coach-concepts/loaded-bar-v1.scenario.json");
const root = path.resolve(__dirname, "..");
const plain = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Real ordered sources and real selectors/mutations, with only browser, clock,
// persistence and rendering effects replaced. The production gate stays false.
function runtime({ show = false } = {}) {
  let serial = 0;
  const warnings = [];
  const indexed = new Map();
  const storage = new Map();
  const element = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  const context = {
    console: { ...console, warn: (message) => warnings.push(message) }, URL, URLSearchParams, TextEncoder, TextDecoder, structuredClone,
    navigator: { onLine: false },
    document: { getElementById: (key) => key === "root" ? element : null, addEventListener() {},
      querySelector: () => null, querySelectorAll: () => [], documentElement: { removeAttribute() {} } },
    location: { hostname: "synthetic.invalid", hash: "#today", search: "", href: "https://synthetic.invalid/#today" },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    setTimeout: () => ++serial, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, addEventListener() {},
    requestAnimationFrame: () => 0, history: { state: null, replaceState() {}, pushState() {} },
    crypto: { randomUUID: () => "synthetic-id-" + (++serial) }, performance: { now: () => 0 }
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ["prescription-engine.js", "exception-resolver.js", "coach-engine.js", "loaded-bar.js", "backup-contract.js", ...APPLICATION_RUNTIME_FILES]) {
    let source = fs.readFileSync(path.join(root, file), "utf8");
    if (file === "app.js") source = source.replace(/\n\s+boot\(\);/, "\n// Test owns startup.");
    if (show && file === "app-coach.js") source = source.replace("const COACH_ACTIVATION_APPROVED = false;", "const COACH_ACTIVATION_APPROVED = true;");
    vm.runInContext(source, context, { filename: file });
  }
  const run = (source) => vm.runInContext(source, context);
  context.testIndexed = indexed;
  run(`
    isoNow = () => "2026-10-31T10:00:00.000Z";
    todayIso = () => "2026-10-31";
    readIndexedRecord = async (key) => testIndexed.has(key) ? {value:structuredClone(testIndexed.get(key)),updatedAt:isoNow()} : null;
    readIndexedValue = async (key) => testIndexed.has(key) ? structuredClone(testIndexed.get(key)) : null;
    writeIndexedValue = async (key,value) => { testIndexed.set(key,structuredClone(value)); return true; };
    render = () => {};
    showAppToast = () => {};
    saveData = () => {};
    scheduleSave = () => {};
    applyCompletedSetVisual = () => {};
    renderAfterInteractionFrame = () => {};
    syncReconcilePromptDom = () => {};
    completedSetReconcileState = () => null;
    restorePushIdentity = async () => {};
    restoreRuntime = async () => {};
  `);
  const assign = (name, value) => { context.serializedInput = JSON.stringify(value); run(`this.${name}=JSON.parse(serializedInput)`); };
  return { context, run, assign, indexed, storage, warnings,
    set(model, activeId = "") {
      assign("input", model);
      context.testActiveId = activeId;
      run("data=input; activeWorkoutId=testActiveId; activeSessionId=testActiveId; entityIndexCache=null; entityStructureRevision+=1; historyEditFlow=null; completingSetIds.clear();");
    },
    get() { return plain(run("data")); },
    prescription() { return plain(run("activeWorkoutSession()?.coachingPrescription")); }
  };
}

function routine(overrides = {}) {
  return { id: "routine", name: "Synthetic Upper", exercises: [{
    id: "routine-bench", name: "Synthetic Bench", performanceExerciseId: "custom:bench", identitySource: "user_declared_custom",
    resistanceType: "external", sets: 4, reps: 9, repMin: 8, repMax: 10, targetRpe: 9, restSeconds: 90, increment: 5, warmups: [],
    setTypes: [{ id: "bench-role", type: "straight", setCount: 4, repMin: 8, repMax: 10,
      rpeMin: 7, rpeMax: 9, restSeconds: 150, increment: 5, incrementUnit: "lb", defaultLoad: null, defaultReps: null }],
    ...overrides
  }] };
}

function base(app, template = routine(), mode = "shadow") {
  const model = plain(app.run("emptyData()"));
  model.templates = [template];
  model.settings = { ...model.settings, coachMode: mode, autoStartRestTimer: false };
  return model;
}

function frozen(app, exercise) {
  app.assign("inputExercise", exercise);
  return plain(app.run("buildCoachStableTargets(inputExercise,data.settings)"));
}

// Each synthetic prior session has a real engine-validated proof, not a fake
// targetVersion assigned to an import. Actual observations are separate rows.
function addPrior(app, model, date, results, changes = {}) {
  const templateExercise = model.templates[0].exercises[0];
  const stable = frozen(app, templateExercise);
  const sessionId = "prior-" + date + "-" + model.sessions.length;
  const exerciseId = sessionId + "-bench";
  const exercise = { ...plain(templateExercise), id: exerciseId, sessionId, order: 0, ...changes.exercise };
  const rows = results.map((result, index) => ({
    id: exerciseId + "-set-" + index, exerciseId, setNumber: index + 1, sequenceIndex: index, setTypeIndex: index,
    setType: "straight", resistanceType: exercise.resistanceType, weight: result.load ?? 185, weightUnit: result.unit || "lb",
    reps: result.reps ?? 9, rpe: result.rpe ?? 9, rpeSource: result.rpeSource || "typed",
    targetReps: result.targetReps ?? 9, completed: true, skipped: false, ...result
  }));
  app.assign("priorExercise", exercise);
  const variantIdentity = app.run("coachVariantIdentity(priorExercise)");
  const prescription = coach.prescribeSession({ sessionId, evaluationId: "proof-" + sessionId,
    createdAt: date + "T08:00:00.000Z", date, exercises: [{ exerciseId, variantIdentity,
      ...stable, sets: rows.map((row, position) => ({ setId: row.id, role: "straight", position, sequenceIndex: position })), history: [] }] });
  const session = { id: sessionId, date, createdAt: date + "T08:00:00.000Z", submittedAt: date + "T09:00:00.000Z",
    completedAt: date + "T09:00:00.000Z", submitted: true, workoutState: "completed", coachingPrescription: plain(prescription), ...changes.session };
  model.sessions.push(session);
  model.exercises.push(exercise);
  model.sets.push(...rows);
  return { session, exercise, rows };
}

function scenarioModel(app, mode = "show") {
  const model = base(app, routine(), mode);
  for (const exposure of scenario.bench.history) addPrior(app, model, exposure.date, exposure.sets.map((set) => ({
    load: set.load, unit: set.unit, reps: set.reps, rpe: set.rpe, rpeSource: set.rpeSource, targetReps: set.targetReps ?? null
  })));
  return model;
}

function start(app, model, recovery = {}) {
  app.set(model);
  app.assign("testRecovery", recovery);
  app.run("startTemplate('routine',cleanRecovery(testRecovery))");
  assert.ok(app.run("hasActiveWorkout()"), "Logging starts");
  return app.get();
}

function activeRows(app) {
  return plain(app.run("data.sets.filter(row=>exerciseById(row.exerciseId)?.sessionId===activeWorkoutId)"));
}

function setActual(app, rowId, patch) {
  app.assign("actualPatch", patch);
  app.context.testSetId = rowId;
  app.run("patchSet(testSetId,actualPatch,false)");
}

function complete(app, rowId, values) {
  setActual(app, rowId, { weight: values.load, weightUnit: values.unit || "lb", reps: values.reps, rpe: values.rpe,
    loadSource: "accepted_target", repsSource: "entered", rpeSource: "typed" });
  app.run("completingSetIds.clear(); toggleSetCompletion(testSetId)");
}

function projection(app) { return plain(app.run("coachingTargetsForSession(activeWorkoutSession())")); }

test("stable roles freeze all signature fields, explicit units/defaults and canonical ordering", () => {
  const app = runtime();
  app.set(base(app));
  const template = routine().exercises[0];
  const result = frozen(app, template);
  assert.deepEqual(result.roles, [scenario.bench.role]);
  const reversed = Object.fromEntries(Object.entries(template).reverse());
  reversed.setTypes = reversed.setTypes.map((role) => Object.fromEntries(Object.entries(role).reverse()));
  assert.equal(frozen(app, reversed).targetVersion, result.targetVersion);
  const changes = { type: "top", setCount: 3, repMin: 7, repMax: 11, rpeMin: 6, rpeMax: 10,
    restSeconds: 0, increment: 2.5, incrementUnit: "kg", defaultLoad: { value: 82.5, unit: "kg" }, defaultReps: 10 };
  for (const [field, value] of Object.entries(changes)) {
    const changed = plain(template); changed.setTypes[0][field] = value;
    assert.notEqual(frozen(app, changed).targetVersion, result.targetVersion, field);
  }
  for (const resistanceType of ["external", "bodyweight_plus_load", "bodyweight", "assisted_bodyweight", "duration", "distance"]) {
    const mapped = frozen(app, { ...template, resistanceType });
    assert.equal(mapped.resistanceType, resistanceType);
    if (resistanceType !== "external") assert.notEqual(mapped.targetVersion, result.targetVersion);
  }
  for (const resistanceType of ["band", "machine?", "", null]) assert.equal(frozen(app, { ...template, resistanceType }), null);
  const noUnit = plain(template); delete noUnit.setTypes[0].incrementUnit;
  assert.equal(frozen(app, noUnit).roles[0].increment, null);
  app.run("data.settings.routineIncrementUnit='kg'");
  assert.deepEqual(frozen(app, noUnit).roles[0].increment, { value: 5, unit: "kg" });
  assert.deepEqual(frozen(app, template).roles[0].increment, { value: 5, unit: "lb" });
  delete noUnit.setTypes[0].restSeconds;
  assert.equal(frozen(app, noUnit).roles[0].restSeconds, 90);
  const multi = { ...template, setTypes: ["straight", "top", "back-off", "drop", "failure", "amrap", "technique", "deload", "mystery"].map((type) =>
    ({ ...template.setTypes[0], type, setCount: 1 })) };
  assert.deepEqual(frozen(app, multi).roles.map((role) => role.role), ["top", "backoff", "straight", "drop", "failure", "amrap", "technique", "deload"]);
  assert.deepEqual(frozen(app, { ...multi, setTypes: [...multi.setTypes].reverse() }).targetVersion, frozen(app, multi).targetVersion);
  const ambiguous = { ...template, setTypes: [{ ...template.setTypes[0], reviewRequired: true }] };
  assert.equal(frozen(app, ambiguous), null);
  const homogeneous = { ...template, setTypes: [template.setTypes[0], template.setTypes[0]] };
  assert.equal(frozen(app, homogeneous).roles[0].S, 8);
  homogeneous.setTypes = [template.setTypes[0], { ...template.setTypes[0], repMin: 7 }];
  assert.equal(frozen(app, homogeneous), null);
});

test("history proves exact identity/version and completion-before-start, orders chronology and preserves raw units and holes", () => {
  const app = runtime(); const model = base(app); app.set(model);
  const recent = addPrior(app, model, "2026-10-20", [{ load: 82.73, unit: "kg", reps: 9 }, { skipped: true }, { completed: false }, { load: 182.39, reps: 8 }]);
  const old = addPrior(app, model, "2026-10-01", Array(4).fill({ load: 180, reps: 9 }));
  // A removed historical row still owns its original role position in the proof.
  model.sets = model.sets.filter((row) => row.id !== recent.rows[2].id);
  const unproven = addPrior(app, model, "2026-10-21", Array(4).fill({})); delete unproven.session.coachingPrescription; unproven.session.source = "strong";
  const otherVersion = addPrior(app, model, "2026-10-22", Array(4).fill({})); otherVersion.session.coachingPrescription.stableTargets[0].targetVersion = "another-version";
  const otherResistance = addPrior(app, model, "2026-10-23", Array(4).fill({}), { exercise: { resistanceType: "bodyweight_plus_load" } });
  const familyOnly = addPrior(app, model, "2026-10-24", Array(4).fill({}), { exercise: { name: "Different Synthetic Variant", performanceExerciseId: "custom:other", researchExerciseId: "shared-family" } });
  old.exercise.researchExerciseId = familyOnly.exercise.researchExerciseId;
  addPrior(app, model, "2026-10-25", Array(4).fill({}), { session: { completedAt: "2026-10-31T12:00:00Z" } });
  addPrior(app, model, "2026-10-25", Array(4).fill({}), { session: { submittedAt: "2026-10-31T12:00:00Z" } });
  addPrior(app, model, "2026-10-26", Array(4).fill({}), { session: { submitted: false, workoutState: "active" } });
  addPrior(app, model, "2026-10-27", Array(4).fill({}), { session: { completedAt: undefined, submittedAt: undefined } });
  app.set(model); app.assign("currentExercise", { ...routine().exercises[0], id: "current", sessionId: "today" });
  app.assign("stable", frozen(app, routine().exercises[0]));
  const collected = plain(app.run("collectCoachHistory(data,currentExercise,stable,'2026-10-31T10:00:00Z')"));
  assert.deepEqual(collected.history.map((entry) => entry.exposureId), [old, recent].map(({ session, exercise }) => session.id + ":" + exercise.id));
  assert.deepEqual(collected.history[1].sets.map((row) => row.position), [0, 1, 3]);
  assert.equal(collected.history[1].sets[1].skipped, true);
  assert.deepEqual(collected.history[1].sets.map(({ load, unit }) => ({ load, unit })), [{ load: 82.73, unit: "kg" }, { load: 185, unit: "lb" }, { load: 182.39, unit: "lb" }]);
  assert.ok(!collected.history.some((entry) => entry.exposureId.includes(otherResistance.session.id)));
});

test("carried episode/experiment state comes from newest compatible unsuspended predecessor", () => {
  const app = runtime(); const model = base(app); app.set(model);
  const older = addPrior(app, model, "2026-10-01", Array(4).fill({}));
  const correct = addPrior(app, model, "2026-10-10", Array(4).fill({}));
  correct.session.coachingPrescription.exercises[0].deteriorationEpisode.stableExposures = 1;
  correct.session.coachingPrescription.exercises[0].addedSetExperiment[0].endedReason = "completed";
  const suspended = addPrior(app, model, "2026-10-20", Array(4).fill({}));
  suspended.session.coachingSuspensions = [{ scope: "exercise", exerciseId: suspended.exercise.id, reason: "deload_changed", at: "2026-10-20T08:30:00Z" }];
  const mismatch = addPrior(app, model, "2026-10-25", Array(4).fill({})); mismatch.session.coachingPrescription.stableTargets[0].targetVersion = "wrong";
  app.set(model); app.assign("testExercise", { ...routine().exercises[0], sessionId: "current" }); app.assign("stable", frozen(app, routine().exercises[0]));
  const state = plain(app.run("collectCoachHistory(data,testExercise,stable,'2026-10-31T10:00:00Z').state"));
  const expected = correct.session.coachingPrescription.exercises[0];
  assert.deepEqual(state, { deteriorationEpisode: expected.deteriorationEpisode, addedSetExperiment: expected.addedSetExperiment });
  assert.notDeepEqual(state.deteriorationEpisode, older.session.coachingPrescription.exercises[0].deteriorationEpisode);
});

test("historical extras cannot consume a durable planned position, and legacy RPE stays unknown", () => {
  const app = runtime(); const model = base(app); app.set(model);
  const prior = addPrior(app, model, "2026-10-20", Array(4).fill({ load: 182.39 }));
  delete prior.rows[0].rpeSource;
  model.sets.push({ ...prior.rows[0], id: "unplanned-extra", sequenceIndex: -1, rpeSource: "typed" });
  app.set(model); app.assign("testExercise", { ...routine().exercises[0], sessionId: "current" }); app.assign("stable", frozen(app, routine().exercises[0]));
  const history = plain(app.run("collectCoachHistory(data,testExercise,stable,'2026-10-31T10:00:00Z').history"));
  assert.deepEqual(history[0].sets.map((row) => row.position), [4, 0, 1, 2, 3]);
  assert.equal(history[0].sets[1].rpeSource, "unknown");
  assert.equal(new Set(history[0].sets.map((row) => row.position)).size, 5);
});

test("explicit defaults seed in their stored unit, unsupported and ambiguous groups stay factual", () => {
  const app = runtime({ show: true });
  const template = routine(); template.exercises[0].setTypes[0].defaultLoad = { value: 82.73, unit: "kg" }; template.exercises[0].setTypes[0].defaultReps = 10;
  start(app, base(app, template, "show"));
  assert.deepEqual(app.prescription().sets[0].anchor, { load: 82.73, unit: "kg", reps: 10 });
  for (const roles of [
    [{ ...template.exercises[0].setTypes[0], type: "unknown" }],
    [{ ...template.exercises[0].setTypes[0], reviewRequired: true }],
    [template.exercises[0].setTypes[0], { ...template.exercises[0].setTypes[0], repMin: 7 }]
  ]) {
    const factual = runtime({ show: true }); const model = base(factual, routine({ setTypes: roles }), "show");
    start(factual, model); assert.equal(factual.prescription().exercises.length, 0); assert.equal(projection(factual).visible, false);
  }
  const existing = app.prescription();
  const model = app.get(); model.exercises.push({ id: "free-exercise", name: "Unplanned Synthetic", sessionId: app.run("activeWorkoutId"), resistanceType: "external" });
  model.sets.push({ id: "free-row", exerciseId: "free-exercise", setType: "straight", completed: true, weight: 100, weightUnit: "lb", reps: 9 });
  app.assign("unplannedModel", model); app.run("commit(unplannedModel,false)");
  assert.deepEqual(app.prescription(), existing, "Exercises added after start never receive a new prescription");
});

test("deload exposure flags include current and legacy session marks, exercise and deload-typed work; holds keep an off-grid physical load", () => {
  const app = runtime(); const model = base(app); app.set(model);
  addPrior(app, model, "2026-10-01", Array(4).fill({ load: 182.39, reps: 9 }));
  addPrior(app, model, "2026-10-10", Array(4).fill({ load: 300 }), { session: { isDeload: true } });
  addPrior(app, model, "2026-10-20", Array(4).fill({ load: 400 }), { exercise: { isDeload: true } });
  addPrior(app, model, "2026-10-25", Array(4).fill({ load: 500, setType: "deload" }));
  addPrior(app, model, "2026-10-27", Array(4).fill({ load: 600 }), { session: { sessionType: "deload" } });
  start(app, model);
  const prescribed = app.prescription(); assert.ok(coach.validatePrescription(prescribed).ok);
  assert.equal(prescribed.sets[0].target.load, 182.39);
  app.assign("testExercise", app.get().exercises.find((exercise) => exercise.sessionId === app.run("activeWorkoutId")));
  app.assign("stable", frozen(app, routine().exercises[0]));
  const history = plain(app.run("collectCoachHistory(data,testExercise,stable,'2026-10-31T10:00:00Z').history"));
  assert.deepEqual(history.map((entry) => entry.isDeload), [false, true, true, true, true]);
  assert.deepEqual(history.map((entry) => entry.sessionIsDeload), [false, true, false, false, true]);
  assert.equal(prescribed.exercises[0].comparisonExposureIds.length, 1);
});

test("history uses the shared exposure predicate and warm-up-only deload labels do not mark an exposure", () => {
  const app = runtime(); const model = base(app); app.set(model);
  addPrior(app, model, "2026-10-20", [
    { load: 95, setType: "deload", isWarmup: true },
    { load: 185, setType: "straight" }
  ]);
  app.set(model); app.assign("testExercise", { ...routine().exercises[0], sessionId: "current" });
  app.assign("stable", frozen(app, routine().exercises[0]));
  const collect = () => plain(app.run("collectCoachHistory(data,testExercise,stable,'2026-10-31T10:00:00Z').history"));
  assert.equal(collect()[0].isDeload, false);
  assert.equal(collect()[0].sessionIsDeload, false);
  assert.equal(collect()[0].sets[0].isWarmup, true);
  app.run("this.predicateCalls=[];this.sharedDeloadPredicate=isDeloadExposure;isDeloadExposure=(session,exercise,sets=[])=>{predicateCalls.push({sessionId:session.id,exerciseId:exercise?.id??null,setCount:sets.length});return sharedDeloadPredicate(session,exercise,sets)}");
  collect();
  assert.deepEqual(plain(app.context.predicateCalls), [
    { sessionId: model.sessions[0].id, exerciseId: model.exercises[0].id, setCount: 2 },
    { sessionId: model.sessions[0].id, exerciseId: null, setCount: 0 }
  ]);
});

test("readiness reductions combine with injury/layoff and start deload; history is collected only at start", () => {
  for (const [date, skip, deload, expected] of [
    ["2026-10-20", "2026-10-25", false, "injury_reentry"], ["2026-09-01", null, false, "layoff_reentry"],
    ["2026-10-20", null, true, "deload_marked"], ["2026-10-20", null, false, "readiness_hold"]
  ]) {
    const app = runtime(); const model = base(app); app.set(model);
    addPrior(app, model, date, Array(4).fill({ load: 182.39, reps: 9 }));
    if (skip) model.skippedSessions.push({ id: "injury", routineId: "routine", routineName: "Synthetic Upper", dayId: "unscheduled", date: skip, reason: "injury", createdAt: skip + "T08:00:00Z" });
    if (deload) {
      model.sessions.unshift({ id: "idle", date: "2026-10-31", createdAt: "2026-10-31T10:00:00Z", isDeload: true, submitted: false });
      app.set(model, "idle");
      app.run("activeWorkoutId='';activeSessionId='idle'");
    }
    start(app, model, { readinessDeviation: "meaningfully_poor" });
    const prescription = app.prescription();
    assert.ok(prescription.exercises[0].codes.includes(expected), `${expected}: ${prescription.exercises[0].codes.join(', ')}`);
    assert.ok(prescription.exercises[0].codes.includes("remove_set"));
    assert.equal(prescription.sets.length, 3);
    assert.equal(prescription.sets[0].anchor.load, 182.39);
    app.run("collectCoachHistory=()=>{throw new Error('history read after start')}");
    complete(app, activeRows(app)[0].id, { load: 182.39, reps: 8, rpe: 10 });
    assert.equal(app.warnings.length, 0);
    assert.ok(coach.validatePrescription(app.prescription()).ok);
  }
});

test("shadow start matches off row-for-row, off computes nothing, closed show stays shadow, failure leaves logging usable", () => {
  const variants = [];
  for (const mode of ["off", "shadow", "show"]) {
    const app = runtime(); const model = base(app, routine({ warmups: [{ id: "wu", weight: 95, reps: 5 }] }), mode);
    start(app, model); variants.push({ app, rows: activeRows(app) });
    assert.equal(Boolean(app.prescription()), mode !== "off");
    if (mode !== "off") assert.ok(coach.validatePrescription(app.prescription()).ok);
    assert.equal(projection(app).visible, false);
  }
  assert.deepEqual(variants[0].rows, variants[1].rows);
  assert.deepEqual(variants[0].rows, variants[2].rows);
  const app = runtime(); const model = base(app);
  app.run("window.ComprehensiveFitnessCoach={...window.ComprehensiveFitnessCoach,prescribeSession(){throw new Error('synthetic failure')}}");
  start(app, model); assert.equal(app.prescription(), undefined); assert.ok(app.warnings.length);
  assert.ok(app.run("coachRecoveryDiagnostics.some(record=>record.boundary==='coach_start')"));
  complete(app, activeRows(app)[0].id, { load: 185, reps: 8, rpe: 9 });
  assert.equal(activeRows(app)[0].completed, true);
});

test("invalid engine output or replay failure never blocks factual mutations or persists an invalid plan", () => {
  const invalid = runtime(); const model = base(invalid);
  invalid.run("window.ComprehensiveFitnessCoach={...window.ComprehensiveFitnessCoach,prescribeSession(){return {invalid:true}}}");
  start(invalid, model); assert.equal(invalid.prescription(), undefined); assert.ok(invalid.warnings.length);
  const app = runtime(); start(app, scenarioModel(app, "shadow")); const before = app.prescription(); const row = activeRows(app)[0];
  app.run("window.ComprehensiveFitnessCoach={...window.ComprehensiveFitnessCoach,reviseAfterSet(){throw new Error('failure')}}");
  complete(app, row.id, scenario.factsLogged[0]);
  assert.equal(activeRows(app)[0].completed, true); assert.deepEqual(app.prescription(), before);
  assert.ok(app.run("coachRecoveryDiagnostics.some(record=>record.boundary==='coach_replay')"));
});

test("optimized ownership validation retains live cross-owners and archived claims on virtual IDs", () => {
  const app = runtime(); const model = base(app); app.set(model);
  for (const date of ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"]) addPrior(app, model, date, Array(4).fill({ reps: 9, rpe: 9 }));
  start(app, model); const prescription = app.prescription();
  app.run("this.checkPlan=(model)=>validateSessionCoachingPrescription(activeWorkoutSession(),activeWorkoutSession().coachingPrescription,model).ok");
  assert.equal(app.run("checkPlan(data)"), true);
  app.run("this.collision={...data,exercises:[...data.exercises,{id:'foreign',sessionId:'foreign-session'}],sets:[...data.sets,{id:activeWorkoutSession().coachingPrescription.sets[0].setId,exerciseId:'foreign'}]}");
  assert.equal(app.run("checkPlan(collision)"), false);
  const archived = coach.prescribeSession({ sessionId: "deleted-session", evaluationId: "deleted-evaluation", createdAt: "2026-09-01T08:00:00Z", date: "2026-09-01",
    exercises: [{ exerciseId: "deleted-exercise", variantIdentity: "custom:deleted|external", resistanceType: "external", targetVersion: "deleted-version",
      roles: [scenario.bench.role], history: [], sets: [0, 1, 2, 3].map((position) => ({
        setId: position === 0 ? prescription.sets.at(-1).setId : "deleted-row-" + position, role: "straight", position, sequenceIndex: position
      })) }] });
  app.assign("archived", archived);
  app.run("collision={...data,sessions:[...data.sessions,{id:'deleted-session',coachingPrescription:archived}]}");
  assert.equal(app.run("checkPlan(collision)"), false, "An unrelated session can still claim a candidate virtual ID");
});

test("real Loaded Bar bench scenario reproduces all engine targets and reason text via adapter and gated channel", () => {
  const app = runtime({ show: true }); start(app, scenarioModel(app));
  let prescription = app.prescription();
  assert.deepEqual(prescription.sets.map((row) => row.target), scenario.startTargets.bench.sets.map((row) => row.target));
  assert.equal(prescription.exercises[0].reasonText, scenario.startTargets.bench.reasonText);
  assert.equal(projection(app).exercises[0].reasonText, scenario.startTargets.bench.reasonText,
    "The stored prior seed plan has different anchors, so its verified change has a start reason");
  const rows = activeRows(app);
  for (let index = 0; index < 4; index += 1) {
    complete(app, rows[index].id, scenario.factsLogged[index]);
    prescription = app.prescription(); const expected = scenario["afterSet" + (index + 1)];
    assert.deepEqual(prescription.sets.map((row) => row.target), expected.sets.map((row) => row.target));
    assert.equal(prescription.exercises[0].reasonText, expected.reasonText);
    assert.ok(coach.validatePrescription(prescription).ok);
    if (index === 1 || index === 2) assert.equal(projection(app).exercises[0].reasonText, expected.reasonText);
  }
  assert.deepEqual(prescription.exercises[0].revisionReplay.facts.map((fact) => fact.completionOrder), [1, 2, 3, 4]);
  assert.deepEqual(prescription.exercises[0].revisionReplay.facts.map((fact) => fact.prescribedTarget), scenario.factsLogged.map((fact) => fact.prescribedTarget));
  const ids = prescription.sets.flatMap((row) => row.revisions.map((revision) => revision.revisionId));
  assert.equal(new Set(ids).size, ids.length);
});

test("completion is idempotent, reopen/recomplete and skip/unskip replay, first edit/clearing freezes while RPE alone does not", () => {
  const app = runtime({ show: true }); start(app, scenarioModel(app)); const rows = activeRows(app);
  complete(app, rows[0].id, scenario.factsLogged[0]);
  const once = app.prescription();
  app.run("toggleSetCompletion(testSetId)"); assert.deepEqual(app.prescription(), once, "In-flight duplicate tap");
  setActual(app, rows[0].id, { completed: true }); assert.deepEqual(app.prescription(), once, "Identical facts");
  app.run("completingSetIds.clear();toggleSetCompletion(testSetId)");
  assert.equal(activeRows(app)[0].completed, false);
  app.run("completingSetIds.clear();toggleSetCompletion(testSetId)");
  assert.equal(app.prescription().exercises[0].revisionReplay.facts[0].completionOrder, 1);
  complete(app, rows[1].id, scenario.factsLogged[1]);
  app.context.testSetId = rows[2].id;
  app.run("toggleSetSkipped(testSetId)");
  let fact = app.prescription().exercises[0].revisionReplay.facts[2];
  assert.equal(fact.skipped, true); assert.equal(fact.prescribedTarget.reps, 8);
  app.run("toggleSetSkipped(testSetId)"); assert.equal(app.prescription().exercises[0].revisionReplay.facts[2].skipped, false);
  app.run("patchSetValue(testSetId,'rpe','9',false)");
  assert.equal(app.prescription().exercises[0].revisionReplay.facts[2].edited, false);
  app.run("patchSetValue(testSetId,'reps','9',false)");
  fact = app.prescription().exercises[0].revisionReplay.facts[2];
  assert.equal(fact.edited, true); assert.equal(fact.editedTarget.reps, 8);
  app.run("patchSetValue(testSetId,'reps','',false)");
  fact = app.prescription().exercises[0].revisionReplay.facts[2];
  assert.equal(fact.reps, null); assert.equal(fact.edited, true); assert.equal(fact.editedTarget.reps, 8);
  assert.equal(activeRows(app)[2].reps, ""); assert.equal(activeRows(app)[2].repsSource, undefined);
  app.run("patchSetValue(testSetId,'weight','0',false)"); assert.equal(app.prescription().exercises[0].revisionReplay.facts[2].load, 0);
  app.run("patchSetValue(testSetId,'weight','',false);patchSetValue(testSetId,'rpe','',false)");
  fact = app.prescription().exercises[0].revisionReplay.facts[2]; assert.equal(fact.load, null); assert.equal(fact.rpe, null); assert.equal(fact.rpeSource, "unknown");
  app.run("setManualType(testSetId,'drop')"); assert.equal(activeRows(app)[2].setType, "drop");
  assert.ok(coach.validatePrescription(app.prescription()).ok);
  assert.equal(app.warnings.length, 0);
});

test("load and reps first edits capture current target independently; incompatible set-type correction suspends", () => {
  for (const field of ["weight", "reps"]) {
    const app = runtime({ show: true }); start(app, scenarioModel(app)); const rows = activeRows(app);
    complete(app, rows[0].id, scenario.factsLogged[0]); complete(app, rows[1].id, scenario.factsLogged[1]);
    app.context.testSetId = rows[2].id;
    app.run(`patchSetValue(testSetId,'${field}','${field === "weight" ? 185 : 8}',true)`);
    const prescription = app.prescription(); const fact = prescription.exercises[0].revisionReplay.facts[2];
    assert.equal(fact.edited, true); assert.deepEqual(fact.editedTarget, { load: 185, unit: "lb", reps: 8 });
    app.run("this.replayCalls=0;const realRevise=window.ComprehensiveFitnessCoach.reviseAfterSet;window.ComprehensiveFitnessCoach={...window.ComprehensiveFitnessCoach,reviseAfterSet(...args){replayCalls++;return realRevise(...args)}}");
    app.run("setManualType(testSetId,'top')");
    assert.equal(app.context.replayCalls, 0, "An entirely suspended exercise never replays incompatible evidence");
    assert.deepEqual(app.prescription(), prescription, "The original prescribed-role audit is frozen");
    assert.equal(app.run("activeWorkoutSession().coachingSuspensions?.[0]?.reason"), "role_changed");
  }
});

test("draft reload then continue preserves captured targets, order, revision identity and result", async () => {
  const app = runtime({ show: true }); start(app, scenarioModel(app)); const rows = activeRows(app);
  complete(app, rows[0].id, scenario.factsLogged[0]); complete(app, rows[1].id, scenario.factsLogged[1]);
  const snapshot = plain(app.run("activeWorkoutDraftSnapshot({incrementSequence:false})"));
  const model = app.get();
  const restored = runtime({ show: true }); restored.set(model);
  restored.indexed.set("active-workout-draft", snapshot);
  assert.equal(await restored.run("restoreActiveWorkoutDraft()"), true);
  complete(app, rows[2].id, scenario.factsLogged[2]); complete(restored, rows[2].id, scenario.factsLogged[2]);
  assert.deepEqual(restored.prescription(), app.prescription());
  assert.ok(backup.validateCoachData(restored.get()));
});

test("Undo restores and locks; submitted and suspended scopes refuse it", () => {
  const app = runtime({ show: true }); start(app, scenarioModel(app)); const rows = activeRows(app);
  complete(app, rows[0].id, scenario.factsLogged[0]); complete(app, rows[1].id, scenario.factsLogged[1]);
  app.context.testSetId = rows[2].id;
  assert.equal(app.run("undoSessionCoachRevision(activeWorkoutId,testSetId)"), true);
  assert.equal(app.prescription().sets[2].target.reps, 9);
  assert.equal(projection(app).exercises[0].sets[2].revision.locked, true);
  setActual(app, rows[1].id, { reps: 5 }); assert.equal(app.prescription().sets[2].target.reps, 9);
  app.run("setExerciseDeload(exerciseById(setById(testSetId).exerciseId).id,true)");
  assert.equal(app.run("undoSessionCoachRevision(activeWorkoutId,testSetId)"), false);
  app.run("data.sessions.find(session=>session.id===activeWorkoutId).submitted=true;data.sessions.find(session=>session.id===activeWorkoutId).workoutState='completed'");
  assert.equal(app.run("undoSessionCoachRevision(activeWorkoutId,testSetId)"), false);
});

test("every R2 suspension trigger records the right scope/reason in the factual commit and permanently freezes that scope", () => {
  const cases = [
    ["setSessionDeload(activeWorkoutId,true)", "session", "deload_changed"],
    ["setExerciseDeload(testExerciseId,true)", "exercise", "deload_changed"],
    ["patchRecovery({readinessDeviation:'meaningfully_poor'},false)", "session", "readiness_changed"],
    ["handleResolvedActionChoice(activeWorkoutSession().resolvedActions[0].decisionId,'continue')", "session", "exception_overridden"],
    ["applyExerciseSubstitution(testExerciseId,'Synthetic Replacement')", "exercise", "exercise_substituted"],
    ["commit({...data,sets:data.sets.filter(row=>row.id!==testSetId)},false,{deferPersistence:true})", "exercise", "row_removed"]
  ];
  for (const [mutation, scope, reason] of cases) {
    const app = runtime({ show: true }); const model = scenarioModel(app);
    start(app, model, reason === "exception_overridden" ? { pain: true } : {});
    const rows = activeRows(app); app.context.testSetId = rows[3].id; app.context.testExerciseId = rows[0].exerciseId;
    const before = app.prescription();
    app.run(mutation);
    const session = app.get().sessions.find((item) => item.id === app.run("activeWorkoutId"));
    const entry = session.coachingSuspensions.find((item) => item.reason === reason);
    assert.ok(entry, mutation); assert.equal(entry.scope, scope); assert.equal(entry.exerciseId, scope === "exercise" ? rows[0].exerciseId : undefined);
    assert.deepEqual(app.prescription(), before, mutation + " freezes immediately");
    assert.equal(projection(app).visible, false);
    setActual(app, rows[0].id, { rpe: 10, rpeSource: "typed", completed: true, completionOrder: 1 });
    assert.deepEqual(app.prescription(), before, mutation + " remains frozen");
    assert.ok(backup.validateCoachData(app.get()));
  }
});

test("substitution after recorded work or all work completed suspends the original exercise", () => {
  for (const completedCount of [1, 4]) {
    const app = runtime({ show: true }); start(app, scenarioModel(app)); const rows = activeRows(app);
    for (let index = 0; index < completedCount; index += 1) complete(app, rows[index].id, scenario.factsLogged[index]);
    app.context.testExerciseId = rows[0].exerciseId;
    const before = app.prescription(); app.run("applyExerciseSubstitution(testExerciseId,'Synthetic Replacement')");
    assert.ok(app.get().sessions.find((item) => item.id === app.run("activeWorkoutId")).coachingSuspensions.some((entry) => entry.reason === "exercise_substituted" && entry.exerciseId === rows[0].exerciseId));
    assert.deepEqual(app.prescription(), before);
    assert.equal(projection(app).visible, false);
  }
});

test("opposite deload toggles stay suspended and every working-row or whole-exercise deletion records row_removed", () => {
  const app = runtime({ show: true }); start(app, scenarioModel(app)); const rows = activeRows(app); app.context.testExerciseId = rows[0].exerciseId;
  app.run("setExerciseDeload(testExerciseId,true);setExerciseDeload(testExerciseId,false)");
  assert.equal(app.get().sessions.find((item) => item.id === app.run("activeWorkoutId")).coachingSuspensions.length, 1);
  assert.equal(projection(app).visible, false);
  const factual = runtime({ show: true }); start(factual, scenarioModel(factual)); const factualRows = activeRows(factual); factual.context.testExerciseId = factualRows[0].exerciseId;
  factual.run("commit({...data,sets:[...data.sets,{id:'drop-extra',exerciseId:testExerciseId,setType:'drop',weight:100,reps:8}]},false);commit({...data,sets:data.sets.filter(row=>row.id!=='drop-extra')},false)");
  assert.equal(factual.run("activeWorkoutSession().coachingSuspensions?.[0]?.reason"), "row_removed");
  assert.equal(projection(factual).visible, false);
  factual.run("commit({...data,exercises:data.exercises.filter(exercise=>exercise.id!==testExerciseId),sets:data.sets.filter(row=>row.exerciseId!==testExerciseId)},false)");
  assert.equal(factual.run("activeWorkoutSession().coachingSuspensions[0].reason"), "row_removed"); assert.equal(projection(factual).visible, false);
});

test("suspension capacity falls back to session scope without resuming any scope", () => {
  const app = runtime({ show: true }); start(app, scenarioModel(app));
  app.run("data.sessions.find(session=>session.id===activeWorkoutId).coachingSuspensions=Array.from({length:50},(_,index)=>({scope:'exercise',exerciseId:'deleted-'+index,reason:'row_removed',at:isoNow()}))");
  app.run("patchRecovery({readinessDeviation:'meaningfully_poor'},false)");
  const entries = plain(app.run("activeWorkoutSession().coachingSuspensions"));
  assert.equal(entries.length, 50); assert.equal(entries.at(-1).scope, "session"); assert.equal(entries.at(-1).reason, "readiness_changed");
  assert.equal(projection(app).visible, false); assert.ok(backup.validateCoachData(app.get()));
});

test("exercise suspension passes stored facts verbatim and freezes only its scope, even when revision setting changes", () => {
  const app = runtime({ show: true }); const model = scenarioModel(app);
  const other = plain(model.templates[0].exercises[0]); other.id = "other-template"; other.name = "Synthetic Row"; other.performanceExerciseId = "custom:row";
  model.templates[0].exercises.push(other); start(app, model);
  const exercises = app.get().exercises.filter((exercise) => exercise.sessionId === app.run("activeWorkoutId"));
  const rows = activeRows(app); const firstRows = rows.filter((row) => row.exerciseId === exercises[0].id); const secondRows = rows.filter((row) => row.exerciseId === exercises[1].id);
  complete(app, firstRows[0].id, scenario.factsLogged[0]);
  app.context.testExerciseId = exercises[0].id; app.run("setExerciseDeload(testExerciseId,true)");
  const frozenExercise = app.prescription().exercises[0]; const frozenSets = app.prescription().sets.filter((row) => row.exerciseId === exercises[0].id);
  app.run("this.seenFacts=null;const captureRevise=window.ComprehensiveFitnessCoach.reviseAfterSet;window.ComprehensiveFitnessCoach={...window.ComprehensiveFitnessCoach,reviseAfterSet(p,s,h){seenFacts=s.sets;return captureRevise(p,s,h)}};commit({...data,settings:{...data.settings,coachBetweenSetRevisions:false}},false)");
  setActual(app, secondRows[0].id, { completed: true, reps: 6, rpe: 10, rpeSource: "typed", completionOrder: 2 });
  assert.deepEqual(app.prescription().exercises[0], frozenExercise);
  assert.deepEqual(app.prescription().sets.filter((row) => row.exerciseId === exercises[0].id), frozenSets);
  assert.deepEqual(plain(app.context.seenFacts).filter((fact) => firstRows.some((row) => row.id === fact.setId)), frozenExercise.revisionReplay.facts);
  assert.equal(projection(app).exercises.length, 1); assert.equal(projection(app).exercises[0].exerciseId, exercises[1].id);
});

test("show materializes only added/removed working rows once; shadow leaves virtual rows and factual roles untouched", () => {
  for (const mode of ["shadow", "show"]) {
    const app = runtime({ show: true }); const model = base(app, routine({ warmups: [{ id: "wu", weight: 95, reps: 5 }] }), mode); app.set(model);
    for (const date of ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"]) addPrior(app, model, date, Array(4).fill({ reps: 9, rpe: 9 }));
    start(app, model);
    assert.ok(app.prescription().exercises[0].codes.includes("add_set"));
    assert.equal(activeRows(app).length, mode === "show" ? 6 : 5);
    assert.equal(activeRows(app).filter((row) => row.isWarmup).length, 1);
    const actual = activeRows(app); app.run("commit({...data},false)"); assert.deepEqual(activeRows(app), actual);
    if (mode === "shadow") {
      app.assign("channelContext", { prescription: app.prescription(), effectiveMode: "show", actualSetIds: actual.map((row) => row.id) });
      const projected = plain(app.run("exceptionResolverApi.resolvePrescriptionChannel(channelContext,window.ComprehensiveFitnessCoach.validatePrescription)"));
      assert.equal(projected.exercises[0].sets.at(-1).virtual, true);
    } else {
      assert.equal(projection(app).exercises[0].sets.at(-1).virtual, false);
      const working = activeRows(app).filter((row) => !row.isWarmup);
      assert.equal(new Set(app.prescription().sets.map((row) => row.sequenceIndex)).size, 5, "Warm-up offset cannot collide with added-row ordering");
      complete(app, working[3].id, { load: 185, reps: 9, rpe: 10 });
      assert.equal(app.prescription().sets.at(-1).target.reps, 8, "The final ordinary row can revise the added row");
    }
  }
  const app = runtime({ show: true }); const model = base(app, routine({ warmups: [{ id: "wu", weight: 95, reps: 5 }] }), "show");
  start(app, model, { readinessDeviation: "meaningfully_poor" }); assert.equal(activeRows(app).length, 4); assert.equal(activeRows(app).filter((row) => row.isWarmup).length, 1);
});

test("channel fails closed for invalid, unresolved and factual-only data; revision-off exposes anchors only", () => {
  const app = runtime({ show: true }); start(app, scenarioModel(app)); const rows = activeRows(app);
  complete(app, rows[0].id, scenario.factsLogged[0]); complete(app, rows[1].id, scenario.factsLogged[1]);
  app.run("commit({...data,settings:{...data.settings,coachBetweenSetRevisions:false}},false)");
  let channel = projection(app); assert.deepEqual(channel.exercises[0].sets.map((row) => row.target), app.prescription().sets.map((row) => row.anchor));
  assert.ok(channel.exercises[0].sets.every((row) => row.revision === null && !row.optional));
  assert.equal(channel.exercises[0].reasonText, app.prescription().exercises[0].sessionStart.reasonText, "Only the verified start reason survives revision-off");
  app.run("patchRecovery({pain:true})"); assert.equal(projection(app).visible, false);
  app.run("handleResolvedActionChoice(activeWorkoutSession().resolvedActions[0].decisionId,'continue')"); assert.equal(projection(app).visible, false, "Continue suspends stale guidance");
  const factual = runtime({ show: true }); start(factual, base(factual, routine({ resistanceType: "duration" }), "show")); assert.equal(projection(factual).visible, false);
  const noUnit = routine(); delete noUnit.exercises[0].setTypes[0].incrementUnit;
  const noArithmetic = runtime({ show: true }); start(noArithmetic, base(noArithmetic, noUnit, "show")); assert.equal(projection(noArithmetic).visible, false);
  app.run("data.sessions.find(session=>session.id===activeWorkoutId).coachingPrescription={invalid:true}"); channel = projection(app); assert.deepEqual(channel, { visible: false, reason: "invalid_prescription" });
});

test("mode transitions never backfill; submitted prescriptions never recompute during history edits or saves", () => {
  const off = runtime(); start(off, base(off, routine(), "off"));
  off.run("commit({...data,settings:{...data.settings,coachMode:'shadow'}},false)");
  complete(off, activeRows(off)[0].id, scenario.factsLogged[0]); assert.equal(off.prescription(), undefined);
  const app = runtime(); start(app, scenarioModel(app, "shadow")); const rows = activeRows(app);
  complete(app, rows[0].id, scenario.factsLogged[0]); const before = app.prescription();
  app.run("commit({...data,settings:{...data.settings,coachMode:'off'}},false)");
  complete(app, rows[1].id, scenario.factsLogged[1]); assert.deepEqual(app.prescription(), before);
  app.run("data.sessions.find(session=>session.id===activeWorkoutId).submitted=true;data.sessions.find(session=>session.id===activeWorkoutId).workoutState='completed';historyEditFlow={sessionId:activeWorkoutId};window.ComprehensiveFitnessCoach={...window.ComprehensiveFitnessCoach,reviseAfterSet(){throw new Error('submitted replay')},prescribeSession(){throw new Error('submitted prescribe')}}");
  app.context.testSetId = rows[0].id; app.run("patchSetValue(testSetId,'reps','8',false);patchRecovery({readinessDeviation:'meaningfully_poor'},false);setSessionDeload(activeWorkoutId,true);commit({...data},false)");
  assert.deepEqual(plain(app.run("data.sessions.find(session=>session.id===activeWorkoutId).coachingPrescription")), before); assert.equal(app.warnings.length, 0);
  app.run("this.savedPrescription=null;submitWorkoutPrs=()=>[];returnToToday=()=>{};saveHistoryEdits();savedPrescription=data.sessions.find(session=>session.id===activeWorkoutId).coachingPrescription");
  assert.deepEqual(plain(app.context.savedPrescription), before, "History save preserves submitted prescription");
});

test("off then shadow freezes the active prescription through work, edits, reload and direct settings commits", async () => {
  for (const settingsPath of ["settings", "commit"]) {
    const app = runtime(); start(app, scenarioModel(app, "shadow"));
    const rows = activeRows(app);
    const sessionId = app.run("activeWorkoutId");
    complete(app, rows[0].id, scenario.factsLogged[0]);
    const beforeOff = app.prescription();
    const changeMode = (mode) => {
      app.context.nextMode = mode;
      if (settingsPath === "settings") {
        app.run("activeTab='settings'");
        assert.equal(app.run("setCoachModeSetting(nextMode)"), true);
      } else app.run("commit({...data,settings:{...data.settings,coachMode:nextMode}},false)");
      app.run("activeTab='workout'");
    };
    app.run("this.modeReplayCalls=0;window.ComprehensiveFitnessCoach={...window.ComprehensiveFitnessCoach,reviseAfterSet(){modeReplayCalls++;throw Error('disabled session replayed')}}");
    changeMode("off");
    const suspension = plain(app.run("activeWorkoutSession().coachingSuspensions"));
    assert.deepEqual(suspension, [{ scope: "session", reason: "coach_off", at: "2026-10-31T10:00:00.000Z" }], settingsPath);
    complete(app, rows[1].id, scenario.factsLogged[1]);
    changeMode("shadow");
    app.context.testSetId = rows[2].id;
    assert.equal(app.run("patchSetValue(testSetId,'reps','6',false)"), true);
    assert.equal(activeRows(app)[1].completed, true, "Work logged while off remains actual work");
    assert.equal(activeRows(app)[2].reps, 6, "Typing after returning to shadow remains usable");
    assert.deepEqual(app.prescription(), beforeOff, "Neither B nor C enters the captured prescription");
    assert.equal(app.context.modeReplayCalls, 0, "No disabled-session replay is attempted");
    assert.equal(app.warnings.length, 0);

    const reloaded = runtime();
    reloaded.context.frozenSessionId = sessionId;
    reloaded.indexed.set("app-data", app.get());
    reloaded.indexed.set("active-workout-draft", plain(app.run("activeWorkoutDraftSnapshot({incrementSequence:false})")));
    await reloaded.run("loadData()");
    assert.equal(reloaded.get().dataRevision, app.get().dataRevision + 1, "Boot restores the saved active draft once");
    assert.equal(reloaded.run("activeWorkoutId"), sessionId);
    assert.deepEqual(reloaded.prescription(), beforeOff, "Reload keeps the prescription frozen");
    assert.deepEqual(plain(reloaded.run("activeWorkoutSession().coachingSuspensions")), suspension);
    reloaded.context.testSetId = rows[2].id;
    assert.equal(reloaded.run("patchSetValue(testSetId,'reps','7',false)"), true);
    assert.deepEqual(reloaded.prescription(), beforeOff, "Reload cannot resume replay");
    assert.equal(activeRows(reloaded)[1].completed, true);
    assert.equal(activeRows(reloaded)[2].reps, 7);

    reloaded.run("historyEditFlow={sessionId:activeWorkoutId};commit({...data,settings:{...data.settings,coachMode:'off'}},false)");
    assert.deepEqual(reloaded.prescription(), beforeOff, "History editing cannot mutate the stored prescription");
    reloaded.run("historyEditFlow=null;data.sessions.find(session=>session.id===activeWorkoutId).submitted=true;data.sessions.find(session=>session.id===activeWorkoutId).workoutState='completed';commit({...data,settings:{...data.settings,coachMode:'shadow'}},false);commit({...data,settings:{...data.settings,coachMode:'off'}},false)");
    assert.deepEqual(plain(reloaded.run("data.sessions.find(session=>session.id===frozenSessionId).coachingPrescription")), beforeOff, "Submitted prescriptions remain immutable");
    assert.deepEqual(plain(reloaded.run("data.sessions.find(session=>session.id===frozenSessionId).coachingSuspensions")), suspension, "Submitted sessions gain no mode-change audit");
    let freshId = 0;
    reloaded.context.crypto.randomUUID = () => "next-" + settingsPath + "-" + (++freshId);
    reloaded.run("activeWorkoutId='';activeSessionId='';commit({...data,settings:{...data.settings,coachMode:'shadow'}},false);isoNow=()=> '2026-11-01T10:00:00.000Z';todayIso=()=> '2026-11-01';startTemplate('routine')");
    assert.notEqual(reloaded.run("activeWorkoutId"), sessionId);
    assert.ok(reloaded.prescription(), "The next Start computes a new shadow prescription");
    assert.equal(reloaded.run("isCoachingSuspended(activeWorkoutSession())"), false);
  }
});

test("one reduction per deterioration episode carries across consecutive adapter starts", () => {
  const app = runtime(); let model = base(app); app.set(model);
  for (const [date, reps] of [["2026-10-01", 14], ["2026-10-08", 12], ["2026-10-15", 10]]) addPrior(app, model, date, Array(4).fill({ reps, load: 185, rpe: 9 }));
  start(app, model); assert.ok(app.prescription().exercises[0].codes.includes("deteriorating_hold")); assert.equal(app.prescription().exercises[0].deteriorationEpisode.reduced, false);
  function finishAndAdvance(date, reps, load) {
    model = app.get(); const current = model.sessions.find((session) => session.id === app.run("activeWorkoutId"));
    current.submitted = true; current.workoutState = "completed"; current.completedAt = current.date + "T11:00:00Z";
    const exerciseIds = new Set(model.exercises.filter((exercise) => exercise.sessionId === current.id).map((exercise) => exercise.id));
    model.sets.forEach((row) => { if (exerciseIds.has(row.exerciseId)) Object.assign(row, { completed: true, reps, weight: load, rpe: 10, rpeSource: "typed" }); });
    app.set(model); app.run(`isoNow=()=> '${date}T10:00:00.000Z';todayIso=()=> '${date}'`); app.run("startTemplate('routine')");
  }
  finishAndAdvance("2026-11-03", 8, 185);
  assert.ok(app.prescription().exercises[0].codes.includes("reduce_load")); assert.equal(app.prescription().sets[0].target.load, 180);
  assert.equal(app.prescription().exercises[0].deteriorationEpisode.reduced, true);
  finishAndAdvance("2026-11-06", 8, 180);
  assert.equal(app.prescription().exercises[0].deteriorationEpisode.reduced, true);
  assert.ok(!app.prescription().exercises[0].codes.includes("reduce_load")); assert.equal(app.prescription().sets[0].target.load, 180);
});

test("review regression: role corrections suspend before a warm-up result can raise a working target", () => {
  for (const type of ["warmup", "drop", "deload", "unknown", "backoff"]) {
    const app = runtime({ show: true }); start(app, scenarioModel(app)); const rows = activeRows(app);
    const before = app.prescription(); app.context.testSetId = rows[0].id;
    app.run(`setManualType(testSetId,'${type}')`);
    const suspension = plain(app.run("activeWorkoutSession().coachingSuspensions"));
    assert.ok(suspension?.some((entry) => entry.scope === "exercise" && entry.exerciseId === rows[0].exerciseId && entry.reason === "role_changed"), type);
    complete(app, rows[0].id, { load: 185, reps: 12, rpe: 8 });
    assert.equal(activeRows(app)[0].completed, true);
    assert.deepEqual(app.prescription(), before, type + " cannot contribute working evidence");
    assert.deepEqual(app.prescription().sets[1].target, { load: 185, reps: 10, unit: "lb" });
    assert.equal(projection(app).visible, false);
    app.run("setManualType(testSetId,'straight')");
    assert.deepEqual(app.prescription(), before, "Correcting back never resumes coaching");
  }
  const app = runtime({ show: true }); start(app, scenarioModel(app)); app.context.testSetId = activeRows(app)[0].id;
  // An older restored draft may predate role-change suspension support.
  app.run("setById(testSetId).setType='warmup';setById(testSetId).isWarmup=true;setManualType(testSetId,'straight')");
  assert.equal(app.run("activeWorkoutSession().coachingSuspensions?.[0]?.reason"), "role_changed", "Correction into the prescribed role also suspends");
});

test("review regression: replay failure saves a hard correction, retains audit and atomically hides stale increases", () => {
  for (const failure of ["throw", "invalid"]) {
    const app = runtime({ show: true }); start(app, scenarioModel(app)); const rows = activeRows(app);
    complete(app, rows[0].id, { load: 185, reps: 12, rpe: 8 });
    assert.equal(projection(app).exercises[0].sets[1].target.load, 190);
    const audit = app.prescription(); const revision = app.get().dataRevision;
    app.run(failure === "throw"
      ? "window.ComprehensiveFitnessCoach={...window.ComprehensiveFitnessCoach,reviseAfterSet(){throw new Error('synthetic failure')}}"
      : "window.ComprehensiveFitnessCoach={...window.ComprehensiveFitnessCoach,reviseAfterSet(){return {invalid:true}}}");
    setActual(app, rows[0].id, { reps: 6, rpe: 10 });
    assert.equal(activeRows(app)[0].reps, 6); assert.equal(activeRows(app)[0].rpe, 10);
    assert.equal(app.get().dataRevision, revision + 1, "Facts and failure suspension share one commit");
    assert.deepEqual(app.prescription(), audit, "Previous prescription remains audit data");
    assert.equal(projection(app).visible, false, "An increased target is never left visible after failure");
    assert.ok(app.run("activeWorkoutSession().coachingSuspensions?.some(entry=>entry.scope==='exercise'&&entry.reason==='evaluation_failed')"));
    assert.ok(backup.validateCoachData(app.get()));
  }
  const app = runtime({ show: true }); const model = scenarioModel(app);
  const other = plain(model.templates[0].exercises[0]); other.id = "other"; other.name = "Synthetic Other"; other.performanceExerciseId = "custom:other";
  model.templates[0].exercises.push(other); start(app, model);
  app.run("window.ComprehensiveFitnessCoach={...window.ComprehensiveFitnessCoach,reviseAfterSet(){throw new Error('global failure')}};commit({...data,settings:{...data.settings,coachBetweenSetRevisions:false}},false)");
  assert.ok(app.run("activeWorkoutSession().coachingSuspensions?.some(entry=>entry.scope==='session'&&entry.reason==='evaluation_failed')"), "A setting-wide failure suspends the session");
  assert.equal(projection(app).visible, false);
  const scoped = runtime({ show: true }); start(scoped, model); const scopedRows = activeRows(scoped);
  const firstExerciseId = scopedRows[0].exerciseId;
  complete(scoped, scopedRows[0].id, { load: 185, reps: 12, rpe: 8 });
  scoped.run("window.ComprehensiveFitnessCoach={...window.ComprehensiveFitnessCoach,reviseAfterSet(){throw new Error('single exercise failure')}}");
  setActual(scoped, scopedRows[0].id, { reps: 6, rpe: 10 });
  const remaining = projection(scoped);
  assert.equal(remaining.visible, true);
  assert.equal(remaining.exercises.length, 1);
  assert.notEqual(remaining.exercises[0].exerciseId, firstExerciseId, "A local correction failure leaves the other exercise available");
});

test("review regression: revision settings reconcile displayed and captured targets before edit, completion or skip", () => {
  for (const reenable of [false, true]) for (const event of ["edit", "complete", "skip"]) {
    const app = runtime({ show: true }); start(app, scenarioModel(app)); const rows = activeRows(app);
    complete(app, rows[0].id, scenario.factsLogged[0]); complete(app, rows[1].id, scenario.factsLogged[1]);
    assert.equal(app.prescription().sets[2].target.reps, 8);
    app.run("commit({...data,settings:{...data.settings,coachBetweenSetRevisions:false}},false)");
    assert.equal(app.prescription().sets[2].target.reps, 9, "Disabling reconciles the stored untouched target immediately");
    if (reenable) app.run("commit({...data,settings:{...data.settings,coachBetweenSetRevisions:true}},false)");
    const expected = { load: 185, reps: reenable ? 8 : 9, unit: "lb" };
    assert.deepEqual(app.prescription().sets[2].target, expected);
    assert.deepEqual(projection(app).exercises[0].sets[2].target, expected);
    app.context.testSetId = rows[2].id;
    if (event === "edit") app.run("patchSetValue(testSetId,'weight','185',false)");
    if (event === "complete") complete(app, rows[2].id, { load: 185, reps: 7, rpe: 10 });
    if (event === "skip") app.run("toggleSetSkipped(testSetId)");
    const fact = app.prescription().exercises[0].revisionReplay.facts.find((entry) => entry.setId === rows[2].id);
    assert.deepEqual(event === "edit" ? fact.editedTarget : fact.prescribedTarget, expected, `${event} after ${reenable ? 're-enabling' : 'disabling'}`);
    assert.ok(coach.validatePrescription(app.prescription()).ok);
  }
});

test("review regression: an ambiguous group leaves its entire role factual in shadow and gated show", () => {
  for (const mode of ["shadow", "show"]) for (const extraRole of [false, true]) {
    const app = runtime({ show: true }); const template = routine(); const role = template.exercises[0].setTypes[0];
    template.exercises[0].setTypes = [{ ...role, id: "review-group", setCount: 2, reviewRequired: true },
      { ...role, id: "known-group", setCount: 2 }];
    if (extraRole) template.exercises[0].setTypes.push({ ...role, id: "top-group", type: "top", setCount: 1 });
    start(app, base(app, template, mode));
    assert.equal(activeRows(app).length, extraRole ? 5 : 4, mode + " preserves every factual straight row");
    assert.equal(app.prescription().sets.filter((row) => row.role === "straight").length, 0, "No group can borrow another group's positions");
    assert.equal(app.prescription().stableTargets.flatMap((entry) => entry.roles).some((entry) => entry.role === "straight"), false);
    if (mode === "show") {
      const visible = projection(app);
      assert.equal(visible.visible, extraRole);
      if (extraRole) assert.deepEqual(visible.exercises[0].sets.map((row) => row.role), ["top"]);
    }
  }
});

test("review regression: legacy sessionType deload exposures never progress a proven 185 lb ceiling result", () => {
  const app = runtime({ show: true }); const template = routine();
  template.exercises[0].setTypes[0].defaultLoad = { value: 185, unit: "lb" };
  template.exercises[0].setTypes[0].defaultReps = 10;
  const model = base(app, template, "show"); app.set(model);
  for (const date of ["2026-10-10", "2026-10-20"]) addPrior(app, model, date, Array(4).fill({ load: 185, reps: 10, rpe: 8 }), { session: { sessionType: "deload" } });
  start(app, model); const prescription = app.prescription();
  assert.ok(!prescription.exercises[0].codes.includes("add_load"));
  assert.deepEqual(prescription.exercises[0].comparisonExposureIds, []);
  assert.deepEqual(prescription.sets.map((row) => row.target.load), [185, 185, 185, 185]);
  app.assign("currentExercise", app.get().exercises.find((exercise) => exercise.sessionId === app.run("activeWorkoutId")));
  app.assign("stable", frozen(app, template.exercises[0]));
  const history = plain(app.run("collectCoachHistory(data,currentExercise,stable,activeWorkoutSession().createdAt).history"));
  assert.ok(history.every((entry) => entry.isDeload && entry.sessionIsDeload));
});

test("review regression: deleting a deload working row suspends and freezes its mixed-role exercise", () => {
  const app = runtime({ show: true }); const template = routine(); const role = template.exercises[0].setTypes[0];
  template.exercises[0].setTypes = [{ ...role, setCount: 3 }, { ...role, id: "deload", type: "deload", setCount: 1 }];
  start(app, base(app, template, "show")); const audit = app.prescription();
  const deload = activeRows(app).find((row) => row.setType === "deload"); assert.ok(deload);
  assert.equal(projection(app).visible, true); app.context.testSetId = deload.id;
  app.run("commit({...data,sets:data.sets.filter(row=>row.id!==testSetId)},false)");
  assert.equal(app.run("activeWorkoutSession().coachingSuspensions?.[0]?.reason"), "row_removed");
  assert.deepEqual(app.prescription(), audit); assert.equal(projection(app).visible, false);
});

test("review regression: a verified three-to-two working-set change exposes the engine readiness reason", () => {
  const app = runtime({ show: true }); const template = routine();
  template.exercises[0].sets = 3; template.exercises[0].setTypes[0].setCount = 3;
  template.exercises[0].setTypes[0].defaultLoad = { value: 185, unit: "lb" }; template.exercises[0].setTypes[0].defaultReps = 9;
  const model = base(app, template, "show"); app.set(model); addPrior(app, model, "2026-10-20", Array(3).fill({ load: 185, reps: 9, rpe: 9 }));
  start(app, model, { readinessDeviation: "meaningfully_poor" });
  assert.equal(app.prescription().exercises[0].plannedSetCount, 2);
  assert.equal(activeRows(app).length, 2);
  assert.equal(projection(app).exercises[0].reasonText, app.prescription().exercises[0].sessionStart.reasonText);
  const reloaded = runtime({ show: true }); reloaded.set(app.get(), app.run("activeWorkoutId"));
  assert.equal(projection(reloaded).exercises[0].reasonText, projection(app).exercises[0].reasonText, "Stored prior prescriptions also prove the reason after reload");
});

test("review regression: predecessor comparison cannot leak a suspended exercise from another selected plan", () => {
  const app = runtime({ show: true }); const template = routine();
  template.exercises[0].sets = 3; template.exercises[0].setTypes[0].setCount = 3;
  template.exercises[0].setTypes[0].defaultLoad = { value: 185, unit: "lb" }; template.exercises[0].setTypes[0].defaultReps = 9;
  const other = { ...plain(template.exercises[0]), id: "template-row", name: "Synthetic Row", performanceExerciseId: "custom:row" };
  const model = base(app, template, "show"); app.set(model);
  addPrior(app, model, "2026-10-10", Array(3).fill({ load: 185, reps: 9, rpe: 9 }));
  const latest = addPrior(app, model, "2026-10-20", Array(3).fill({ load: 185, reps: 9, rpe: 9 }));
  const otherId = "prior-row";
  const otherRows = latest.rows.map((row, index) => ({ ...row, id: "prior-row-" + index, exerciseId: otherId }));
  model.exercises.push({ ...other, id: otherId, sessionId: latest.session.id }); model.sets.push(...otherRows);
  const stable = frozen(app, template.exercises[0]);
  latest.session.coachingPrescription = plain(coach.prescribeSession({ sessionId: latest.session.id, evaluationId: "prior-pair",
    date: latest.session.date, createdAt: latest.session.createdAt, readiness: "meaningfully_poor",
    exercises: [[latest.exercise.id, "custom:bench|external", latest.rows], [otherId, "custom:row|external", otherRows]].map(([exerciseId, variantIdentity, rows]) => ({
      exerciseId, variantIdentity, ...stable, history: [], sets: rows.map((row, position) => ({ setId: row.id, role: "straight", position, sequenceIndex: position }))
    })) }));
  latest.session.coachingSuspensions = [{ scope: "exercise", exerciseId: latest.exercise.id, reason: "role_changed", at: "2026-10-20T08:30:00Z" }];
  model.templates[0].exercises.push(other); start(app, model, { readinessDeviation: "meaningfully_poor" });
  const channel = projection(app);
  assert.equal(channel.exercises[0].reasonText, app.prescription().exercises[0].sessionStart.reasonText,
    "Bench compares with its older unsuspended three-set plan, not the suspended two-set plan selected for Row");
  assert.equal(channel.exercises[1].reasonText, null, "Row compares with its own most recent equal two-set plan");
});

// Eligibility flags must survive normalization and strict import before the
// adapter freezes targets; a raw-template-only assertion cannot prove that.
test("review integration gate: normalization preserves ambiguous role flags before workout start", () => {
  for (const flag of ["reviewRequired", "ambiguous"]) {
    const app = runtime({ show: true }); const template = routine(); const role = template.exercises[0].setTypes[0];
    template.exercises[0].setTypes = [{ ...role, id: "ambiguous-group", setCount: 2, [flag]: true }, { ...role, id: "known-group", setCount: 2 }];
    app.assign("loadedModel", base(app, template, "show"));
    const loaded = plain(app.run("normalizeLoadedData(loadedModel)"));
    start(app, loaded);
    assert.equal(activeRows(app).length, 4);
    assert.equal(app.prescription().sets.filter((row) => row.role === "straight").length, 0,
      `${flag} must survive normalizeTargetSetType so the whole role remains factual`);
    assert.equal(projection(app).visible, false);
  }
});

test("review integration gate: strict import round-trips explicit ambiguous role booleans", () => {
  for (const flag of ["reviewRequired", "ambiguous"]) {
    const app = runtime({ show: true }); const template = routine(); const role = template.exercises[0].setTypes[0];
    template.exercises[0].setTypes = [{ ...role, id: "ambiguous-group", setCount: 2, [flag]: true }, { ...role, id: "known-group", setCount: 2 }];
    app.assign("importedModel", base(app, template, "show"));
    let imported;
    assert.doesNotThrow(() => { imported = plain(app.run("validateImportedAppData(importedModel)")); }, `${flag} is a boolean role fact`);
    assert.equal(imported.templates[0].exercises[0].setTypes[0][flag], true);
    start(app, imported); assert.equal(app.prescription().sets.length, 0); assert.equal(projection(app).visible, false);
  }
});

test("start with 150 synthetic proven sessions completes under 200 ms", () => {
  const app = runtime(); const model = base(app); app.set(model);
  for (let index = 0; index < 150; index += 1) {
    const date = new Date(Date.UTC(2026, 4, 1 + index)).toISOString().slice(0, 10);
    addPrior(app, model, date, Array(4).fill({ load: 185, reps: 9, rpe: 9 }));
  }
  app.set(model);
  app.context.benchmarkNow = () => performance.now();
  app.run(`this.coachTimings={};
    for(const name of ['buildCoachSessionInput','validateSessionCoachingPrescription','getMostRecentWorkoutSets','stableTargetForTemplateExercise','postMutationSessionCoaching']) {
      const original=eval(name); this[name]=(...args)=>{const start=benchmarkNow();try{return original(...args)}finally{coachTimings[name]=(coachTimings[name]||0)+benchmarkNow()-start}};
    }
  `);
  const started = performance.now(); app.run("startTemplate('routine')"); const elapsed = performance.now() - started;
  assert.ok(app.prescription()); assert.equal(app.prescription().exercises[0].comparisonExposureIds.length, 150);
  assert.ok(elapsed < 200, `150-session start took ${elapsed.toFixed(1)} ms (${JSON.stringify(app.context.coachTimings)})`);
  console.log(`150-session start: ${elapsed.toFixed(1)} ms`);
});

async function main() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log("PASS " + name); }
    catch (error) { failures += 1; console.error("FAIL " + name); console.error(error.stack); }
  }
  console.log(`${tests.length - failures}/${tests.length} coach adapter groups passed.`);
  if (failures) process.exitCode = 1;
}
main();
