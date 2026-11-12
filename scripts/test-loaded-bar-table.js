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
  const events = new Map();
  const element = { addEventListener(name, handler) { events.set(name, handler); }, querySelector() { return null; }, querySelectorAll() { return context.testFocusable || []; } };
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
    primeTimerAlerts = () => {};
    requestTimerWakeLock = () => {};
    releaseTimerWakeLock = () => {};
    scheduleRestPush = () => {};
    cancelRestPush = () => {};
    saveRuntime = () => {};
  `);
  const assign = (name, value) => { context.serializedInput = JSON.stringify(value); run(`this.${name}=JSON.parse(serializedInput)`); };
  return { context, run, assign, indexed, storage, warnings, events,
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


function row(app, id) { return plain(app.run("setById(" + JSON.stringify(id) + ")")); }
function table(app, exerciseId = activeRows(app)[0].exerciseId) {
  app.context.tableExerciseId = exerciseId;
  return app.run("renderLoadedBarTable(exerciseById(tableExerciseId),renderSetContext(exerciseById(tableExerciseId)))");
}
function blankRow(actual, label) {
  for (const field of ["weight", "reps", "rpe", "addedLoad", "assistanceLoad", "durationSeconds", "distance"]) {
    assert.equal(actual[field], "", label + ": blank " + field);
  }
  assert.equal(actual.loadSource, undefined, label + ": no inferred load provenance");
  assert.equal(actual.repsSource, undefined, label + ": no inferred reps provenance");
  assert.equal(actual.rpeSource, undefined, label + ": no inferred RPE provenance");
}
function factualModel(app, mode = "shadow", resistanceType = "external") {
  const template = routine({resistanceType});
  template.exercises[0].setTypes[0].defaultLoad = {value:185,unit:"lb"};
  template.exercises[0].setTypes[0].defaultReps = 9;
  return base(app, template, mode);
}
function accept(app, id) {
  app.context.testSetId = id;
  app.run("completingSetIds.clear();toggleSetCompletion(testSetId)");
}
function enter(app, id, field, value) {
  app.context.testSetId = id; app.assign("testValue", value); app.context.testField = field;
  return app.run("patchSetValue(testSetId,testField,testValue,false)");
}
function revisedApp() {
  const app = runtime({show:true}); start(app, scenarioModel(app));
  const rows = activeRows(app);
  complete(app, rows[0].id, scenario.factsLogged[0]);
  complete(app, rows[1].id, scenario.factsLogged[1]);
  return {app, rows:activeRows(app)};
}

test("routine, added, duplicate and warm-up rows start blank with original targets intact", () => {
  const app = runtime(); const model = factualModel(app); model.templates[0].exercises[0].warmups = [{id:"warmup-template",weight:95,reps:5}];
  start(app, model);
  let rows = activeRows(app); rows.forEach((set) => blankRow(set, "routine"));
  assert.equal(rows.find((set) => !set.isWarmup).targetWeight,185);
  assert.equal(rows.find((set) => set.isWarmup).targetWeight,95);
  assert.equal(rows.find((set) => set.isWarmup).targetReps,5);
  app.context.testExerciseId = rows[0].exerciseId;
  enter(app,rows.at(-1).id,"weight",195); enter(app,rows.at(-1).id,"reps",10); enter(app,rows.at(-1).id,"rpe",8.5);
  app.run("addSet(testExerciseId,true)");
  let copied = activeRows(app).at(-1); blankRow(copied,"duplicate");
  assert.equal(copied.targetWeight,185); assert.equal(copied.targetReps,9);
  app.run("addSet(testExerciseId,false)");
  blankRow(activeRows(app).at(-1),"add");
  assert.equal(activeRows(app).at(-1).targetWeight,185); assert.equal(activeRows(app).at(-1).targetReps,9);
  app.run("addWarmupSet(testExerciseId)");
  rows = activeRows(app).filter((set) => set.isWarmup);
  blankRow(rows.at(-1),"warm-up");
  assert.equal(rows.at(-1).targetWeight,95); assert.equal(rows.at(-1).targetReps,5);
});

test("substitution creates blank replacement rows even after every original row was completed", () => {
  const app=runtime(); start(app,factualModel(app));
  const rows=activeRows(app);
  for(const set of rows) { enter(app,set.id,"weight",185); enter(app,set.id,"reps",9); enter(app,set.id,"rpe",8); accept(app,set.id); }
  app.context.testExerciseId=rows[0].exerciseId;
  app.run("applyExerciseSubstitution(testExerciseId,'Synthetic Replacement')");
  const replacement=activeRows(app).filter((set)=>set.exerciseId!==rows[0].exerciseId);
  assert.equal(replacement.length,1); blankRow(replacement[0],"substitution");
  assert.equal(replacement[0].targetWeight,185); assert.equal(replacement[0].targetReps,9);
});

test("shadow acceptance records factual target provenance; actual RPE remains blank", () => {
  const app=runtime(); start(app,factualModel(app)); const first=activeRows(app)[0];
  assert.equal(app.run("coachingTargetsForSession(activeWorkoutSession()).visible"),false);
  accept(app,first.id);
  const completed=row(app,first.id);
  assert.deepEqual([completed.weight,completed.reps,completed.loadSource,completed.repsSource],[185,9,"prefill_previous","prefill_previous"]);
  assert.equal(completed.completed,true); assert.equal(completed.rpe,""); assert.equal(completed.rpeSource,undefined);
});

test("visible coaching acceptance requires test-only open gate, preserves typed and mixed field provenance", () => {
  const closed=runtime(); start(closed,scenarioModel(closed,"show")); const closedRow=activeRows(closed)[0]; accept(closed,closedRow.id);
  assert.equal(row(closed,closedRow.id).loadSource,"prefill_previous");
  const app=runtime({show:true}); start(app,scenarioModel(app)); const rows=activeRows(app);
  assert.equal(app.run("coachingTargetsForSession(activeWorkoutSession()).visible"),true);
  accept(app,rows[0].id);
  assert.deepEqual([row(app,rows[0].id).loadSource,row(app,rows[0].id).repsSource],["accepted_target","accepted_target"]);
  enter(app,rows[1].id,"weight",187.5); accept(app,rows[1].id);
  assert.deepEqual([row(app,rows[1].id).weight,row(app,rows[1].id).loadSource,row(app,rows[1].id).repsSource],[187.5,"entered","accepted_target"]);
  enter(app,rows[2].id,"weight",185); enter(app,rows[2].id,"reps",8); enter(app,rows[2].id,"rpe",8.5); accept(app,rows[2].id);
  assert.deepEqual([row(app,rows[2].id).loadSource,row(app,rows[2].id).repsSource,row(app,rows[2].id).rpeSource],["entered","entered","typed"]);
  enter(app,rows[3].id,"reps",8); accept(app,rows[3].id);
  assert.deepEqual([row(app,rows[3].id).loadSource,row(app,rows[3].id).repsSource],["accepted_target","entered"]);
  assert.equal(row(app,rows[0].id).rpe,""); assert.equal(row(app,rows[1].id).rpe,"");
});

test("clearing remains blank, typed zero survives acceptance, and RPE is not a required actual", () => {
  const app=runtime(); start(app,factualModel(app)); const first=activeRows(app)[0];
  for(const field of ["weight","reps","rpe"]) {enter(app,first.id,field,0); assert.equal(row(app,first.id)[field],0); enter(app,first.id,field,""); assert.equal(row(app,first.id)[field],""); }
  enter(app,first.id,"weight",0); enter(app,first.id,"reps",0); accept(app,first.id);
  assert.deepEqual([row(app,first.id).weight,row(app,first.id).reps,row(app,first.id).completed,row(app,first.id).rpe],[0,0,true,""]);
  assert.deepEqual([row(app,first.id).loadSource,row(app,first.id).repsSource],["entered","entered"]);
});

test("assistance keeps factual load provenance while a visible coach target supplies only reps", () => {
  const app=runtime({show:true}); const model=factualModel(app,"show","assisted_bodyweight");
  model.templates[0].exercises[0].setTypes[0].defaultLoad=null;
  model.templates[0].exercises[0].defaultLoad=185;
  start(app,model); const first=activeRows(app)[0];
  assert.equal(app.run("coachingTargetsForSession(activeWorkoutSession()).visible"),true);
  accept(app,first.id);
  assert.deepEqual([row(app,first.id).loadSource,row(app,first.id).repsSource],["prefill_previous","accepted_target"]);
});

test("missing reps/load target refuses completion with a focused inline prompt instead of zero", () => {
  for(const missing of ["reps","weight"]) {
    const app=runtime(); start(app,factualModel(app)); const first=activeRows(app)[0]; app.context.testSetId=first.id;
    app.run(missing==="reps"?"patchSet(testSetId,{targetReps:'',targetRepMin:0,targetRepMax:0},false)":"patchSet(testSetId,{targetWeight:''},false)");
    let focused = false;
    app.context.testFocusable = [{dataset:{setId:first.id},focus(){focused=true;}}];
    accept(app,first.id);
    assert.equal(row(app,first.id).completed,false); assert.equal(row(app,first.id)[missing],"");
    assert.equal(focused,true,"the empty field receives focus");
    app.context.testFocusable = [];
    assert.match(table(app),missing==="reps"?/Enter reps/:/Enter load/);
    const other=activeRows(app)[1]; accept(app,other.id); assert.equal(row(app,other.id).completed,true,"missing value never blocks another row");
  }
});

test("inline validation clears after entry and after a successful completion", () => {
  const app=runtime();start(app,factualModel(app));const first=activeRows(app)[0];app.context.testSetId=first.id;
  app.run("patchSet(testSetId,{targetWeight:''},false)");accept(app,first.id);
  assert.match(table(app),/Enter load/);
  enter(app,first.id,"weight",185);assert.doesNotMatch(table(app),/Enter load|aria-invalid="true"/);
  app.run("patchSet(testSetId,{targetReps:'',targetRepMin:0,targetRepMax:0},false)");accept(app,first.id);
  assert.match(table(app),/Enter reps/);
  // Completion clears a pending prompt even when facts arrive through another mutation path.
  app.run("patchSet(testSetId,{reps:9},false)");accept(app,first.id);
  assert.equal(row(app,first.id).completed,true);assert.doesNotMatch(table(app),/Enter reps|aria-invalid="true"/);
});

test("duplicate classified rows begin without observation or attempted-work state", () => {
  const app=runtime();start(app,factualModel(app));const last=activeRows(app).at(-1);
  app.context.testSetId=last.id;app.context.testExerciseId=last.exerciseId;
  app.run("setManualType(testSetId,'drop');addSet(testExerciseId,true)");
  const duplicate=activeRows(app).at(-1);blankRow(duplicate,"classified duplicate");
  assert.equal(duplicate.manualOverride,false);assert.equal(duplicate.completed,false);assert.equal(duplicate.edited,false);
  app.context.testSetId=duplicate.id;assert.equal(app.run("actualWorkSetWasAttempted(setById(testSetId))"),false);
});

test("insert warm-up above a supplied row preserves canonical ordering and exact ownership", () => {
  const app=runtime();start(app,factualModel(app));const rows=activeRows(app);
  app.context.testExerciseId=rows[0].exerciseId;app.context.testBeforeSetId=rows[2].id;
  app.run("addWarmupSet(testExerciseId,testBeforeSetId)");
  const ordered=plain(app.run("setsForExercise(testExerciseId)"));
  const beforeIndex=ordered.findIndex(set=>set.id===rows[2].id);
  assert.equal(ordered[beforeIndex-1].isWarmup,true);blankRow(ordered[beforeIndex-1],"inserted warm-up");
  assert.equal(ordered[beforeIndex-1].sequenceIndex,rows[2].sequenceIndex);
  assert.deepEqual(ordered.filter(set=>!set.isWarmup).map(set=>set.id),rows.map(set=>set.id));
  const before=activeRows(app);app.run("addWarmupSet(testExerciseId,'missing-row')");assert.deepEqual(activeRows(app),before);
});

test("duration and distance have blank actuals, no load column and require their own metric when no target exists", () => {
  for(const [type,field,label] of [["duration","durationSeconds","duration"],["distance","distance","distance"]]) {
    const app=runtime(); start(app,factualModel(app,"shadow",type)); const first=activeRows(app)[0];
    blankRow(first,type); const html=table(app); assert.doesNotMatch(html,/data-action="set-weight"/); assert.match(html,type==="duration"?/SEC/:/>M</);
    accept(app,first.id); assert.equal(row(app,first.id)[field],first.targetReps); assert.equal(row(app,first.id).rpe,"");
    const second=activeRows(app)[1]; app.context.testSetId=second.id; app.run("patchSet(testSetId,{targetReps:'',targetRepMin:0,targetRepMax:0},false)");
    accept(app,second.id); assert.equal(row(app,second.id).completed,false); assert.match(table(app),new RegExp("Enter "+label));
  }
});

test("an unplanned no-default row never manufactures a zero target from an absent target", () => {
  const app=runtime(); start(app,factualModel(app)); const first=activeRows(app)[0];
  app.context.testExerciseId=first.exerciseId;
  app.run("this.noDefaultRow=createSet(testExerciseId,5,{});commit({...data,sets:[...data.sets,noDefaultRow]},false,{deferPersistence:true})");
  const added=plain(app.run("noDefaultRow"));
  enter(app,added.id,"weight",185); accept(app,added.id);
  assert.equal(row(app,added.id).completed,false);
  assert.equal(row(app,added.id).reps,""); assert.match(table(app),/Enter reps/);
});

test("bodyweight load headers distinguish BW, added and assistance while blank canonical loads survive normalization and draft recovery", async () => {
  for(const [type,field,header] of [["bodyweight_plus_load","addedLoad","+LB"],["assisted_bodyweight","assistanceLoad","−LB"]]) {
    const app=runtime(); start(app,factualModel(app,"shadow",type)); const first=activeRows(app)[0];
    enter(app,first.id,"weight",25); enter(app,first.id,"weight","");
    assert.equal(row(app,first.id)[field],"");
    assert.ok(table(app).includes(header));
    app.context.testSetId=first.id;
    assert.equal(app.run("normalizeResistanceSet(setById(testSetId),'"+type+"')."+field),"");
    const snapshot=plain(app.run("activeWorkoutDraftSnapshot({incrementSequence:false})"));
    const restored=runtime(); restored.set(app.get()); restored.indexed.set("active-workout-draft",snapshot);
    assert.equal(await restored.run("restoreActiveWorkoutDraft()"),true);
    assert.equal(row(restored,first.id)[field],"");
    enter(restored,first.id,"weight",0); accept(restored,first.id);
    assert.equal(row(restored,first.id)[field],0); assert.equal(row(restored,first.id).loadSource,"entered");
    accept(restored,first.id); enter(restored,first.id,"weight",""); enter(restored,first.id,"reps",9);
    restored.context.testSetId=first.id; restored.run("patchSet(testSetId,{targetWeight:''},false)");
    accept(restored,first.id);
    assert.equal(row(restored,first.id)[field],"","completion never coerces a cleared canonical load to zero");
    assert.equal(row(restored,first.id).completed,type==="assisted_bodyweight","only optional assistance can remain absent on completion");
    const second=activeRows(restored)[1]; accept(restored,second.id);
    assert.equal(row(restored,second.id)[field],185); assert.equal(row(restored,second.id).rpe,"");
  }
  const app=runtime(); start(app,factualModel(app,"shadow","bodyweight"));
  assert.match(table(app),/>BW</); assert.doesNotMatch(table(app),/data-action="set-weight"/);
});

test("pending blank actuals remain outside completed progress and actual-work grading", () => {
  const app=runtime();start(app,factualModel(app));
  assert.equal(app.run("workoutProgress().completed"),0);
  for(const set of activeRows(app)) {
    app.context.testSetId=set.id;
    assert.equal(app.run("actualWorkSetWasAttempted(setById(testSetId))"),false);
    assert.equal(app.run("actualWorkSetIsValid(setById(testSetId),exerciseById(setById(testSetId).exerciseId))"),false);
  }
});

test("Apply to remaining changes only untouched targets, never actuals, completed rows, edited rows or RPE", () => {
  const app=runtime(); start(app,factualModel(app)); const rows=activeRows(app); app.context.testExerciseId=rows[0].exerciseId;
  enter(app,rows[0].id,"weight",180); enter(app,rows[0].id,"reps",7); enter(app,rows[0].id,"rpe",10); accept(app,rows[0].id);
  enter(app,rows[2].id,"rpe",8);
  enter(app,rows[3].id,"reps",8); accept(app,rows[3].id);
  app.run("patchExercise(testExerciseId,{pendingReconcile:{setId:'"+rows[0].id+"',fields:['load','reps','rpe'],remainingSetCount:2}},false)");
  const before=activeRows(app); assert.match(app.run("renderReconcilePrompt(exerciseById(testExerciseId))"),/Apply to remaining/);
  app.run("reconcileCompletedSet(testExerciseId,true)");
  const after=activeRows(app); assert.deepEqual([after[1].targetWeight,after[1].targetReps],[180,7]); blankRow(after[1],"reconcile");
  for(const index of [0,2,3]) {
    assert.deepEqual([after[index].weight,after[index].reps,after[index].rpe],[before[index].weight,before[index].reps,before[index].rpe]);
    assert.deepEqual([after[index].targetWeight,after[index].targetReps,after[index].targetRpe],[before[index].targetWeight,before[index].targetReps,before[index].targetRpe]);
  }
  assert.equal(after[1].targetRpe,before[1].targetRpe); assert.equal(after[1].rpe,"");
  app.context.testSetId=after[1].id;
  assert.equal(app.run("actualWorkSetWasAttempted(setById(testSetId))"),false,"a target-only override does not become attempted work in grading");
});

test("visible channel hides and refuses reconcile, including stale delegated apply attempts", () => {
  const app=runtime({show:true}); start(app,scenarioModel(app)); const rows=activeRows(app); app.context.testExerciseId=rows[0].exerciseId;
  app.run("patchExercise(testExerciseId,{pendingReconcile:{setId:'"+rows[0].id+"',fields:['load','reps'],remainingSetCount:3}},false)");
  const before=activeRows(app);
  assert.equal(app.run("renderReconcilePrompt(exerciseById(testExerciseId))"),"");
  app.run("reconcileCompletedSet(testExerciseId,true)"); assert.deepEqual(activeRows(app),before);
});

test("rest starts after the final set with that row's rest target, unless owner disabled auto-rest", () => {
  for(const enabled of [true,false]) for(const seconds of [0,7,150]) {
    const app=runtime(); const model=factualModel(app); model.templates[0].exercises[0].sets=1; model.templates[0].exercises[0].setTypes[0].setCount=1;
    model.settings.autoStartRestTimer=enabled; start(app,model); const first=activeRows(app)[0];
    app.context.testSetId=first.id; app.context.testRest=seconds;
    app.run("patchSet(testSetId,{targetRestSeconds:testRest},false)");
    accept(app,first.id);
    assert.equal(row(app,first.id).completed,true);
    if(enabled) {assert.equal(app.run("timer.setId"),first.id);assert.equal(app.run("timer.durationSeconds"),seconds);assert.equal(app.run("timer.pendingNextSetId"),"");}
    else assert.equal(app.run("timer"),null);
  }
});

test("set-type sheet routes correction through audit and Undo and preserves all existing actions", () => {
  const app=runtime(); start(app,factualModel(app)); const first=activeRows(app)[0]; app.context.testSetId=first.id;
  assert.equal(app.run("chooseLoadedBarSetType(testSetId,'drop')"),true);
  assert.equal(row(app,first.id).setType,"drop"); assert.equal(row(app,first.id).classificationSource,"manual"); assert.ok(row(app,first.id).classificationUndo);
  assert.ok(app.get().exercises.find(exercise=>exercise.id===first.exerciseId).manualOverrides.some(entry=>entry.field==="setStructure"));
  app.run("openLoadedBarSetSheet(testSetId,'type')");
  let html=table(app)+app.run("renderLoadedBarSetSheet()"); for(const action of ["set-type-sheet","toggle-skip-set","delete-set","add-warmup-set","set-rest-seconds","undo-set-type-override"]) assert.ok(html.includes('data-action="'+action+'"'),action);
  app.run("undoManualSetType(testSetId)"); assert.equal(row(app,first.id).setType,"straight");
  app.run("openLoadedBarSetSheet(testSetId,'type')");
  // Sheet controls and pad values remain real native buttons/number entry.
  html=app.run("renderLoadedBarSetSheet()");
  for(const label of ["Warm-up","Working","Drop","Failure","This was a deload"]) assert.ok(html.includes(label),label);
  assert.ok(html.includes('data-action="choose-set-type"'));
});

test("RPE pad records only explicit half-step selections and Clear; native entry remains possible", () => {
  const app=runtime(); start(app,factualModel(app)); const first=activeRows(app)[0]; app.context.testSetId=first.id;
  app.run("openLoadedBarSetSheet(testSetId,'rpe')"); const html=app.run("renderLoadedBarSetSheet()");
  for(let value=6;value<=10;value+=0.5) assert.ok(html.includes('data-value="'+value+'"'),"RPE "+value);
  assert.ok(html.includes("Clear")); assert.ok(table(app).includes('step="0.5"')); assert.doesNotMatch(table(app),/data-action="set-rpe"[^>]*placeholder="[^"]+"/);
  assert.equal(app.run("chooseLoadedBarRpe(testSetId,'8.5')"),true); assert.equal(row(app,first.id).rpe,8.5); assert.equal(row(app,first.id).rpeSource,"typed");
  app.run("chooseLoadedBarRpe(testSetId,'')"); assert.equal(row(app,first.id).rpe,""); assert.equal(row(app,first.id).rpeSource,undefined);
});

test("revised rows show prior targets, marker and guarded Undo only through visible channel", () => {
  const {app,rows}=revisedApp(); app.context.testSetId=rows[2].id;
  assert.equal(app.run("coachingTargetsForSession(activeWorkoutSession()).exercises[0].sets[2].target.reps"),8);
  let html=table(app); assert.match(html,/loaded-bar-was/); assert.match(html,/data-action="undo-coach-revision"/); assert.match(html,/<del[^>]*>9<\/del>/);
  assert.equal(app.run("guardWorkoutMutation('undo-coach-revision',{setId:testSetId},false).allowed"),true);
  assert.equal(app.run("undoSessionCoachRevision(activeWorkoutId,testSetId)"),true);
  assert.equal(app.run("activeWorkoutSession().coachingPrescription.sets[2].target.reps"),9);
  assert.doesNotMatch(app.run("renderSet(setById(testSetId),exerciseById(setById(testSetId).exerciseId),renderSetContext(exerciseById(setById(testSetId).exerciseId)))"),/data-action="undo-coach-revision"/,"A restored, locked target does not offer another Undo");
  app.run("data.settings.coachMode='shadow'"); html=table(app); assert.doesNotMatch(html,/loaded-bar-was|undo-coach-revision/);
  app.run("data.settings.coachMode='show';setExerciseDeload(exerciseById(setById(testSetId).exerciseId).id,true)");
  assert.equal(app.run("undoSessionCoachRevision(activeWorkoutId,testSetId)"),false); assert.doesNotMatch(table(app),/undo-coach-revision/);
});

test("a load revision shows its previous load beside the new placeholder without changing actual observations", () => {
  const {app,rows}=revisedApp(); complete(app,rows[2].id,scenario.factsLogged[2]);
  assert.equal(app.run("coachingTargetsForSession(activeWorkoutSession()).exercises[0].sets[3].target.load"),180);
  const html=table(app);
  assert.match(html,/<del[^>]*>185<\/del>/); assert.match(html,/placeholder="180"/);
  assert.equal(row(app,rows[3].id).weight,""); assert.equal(row(app,rows[3].id).rpe,"");
});

test("new table actions authorize exact ownership and reject stale submitted controls", () => {
  const app=runtime();start(app,factualModel(app));const first=activeRows(app)[0];app.context.testSetId=first.id;
  for(const action of ["set-type-sheet","choose-set-type","rpe-pad","choose-set-rpe","undo-coach-revision"]) {
    app.context.testAction=action;
    const result=plain(app.run("guardWorkoutMutation(testAction,{setId:testSetId},false)"));
    assert.equal(result.allowed,true); assert.equal(result.target.authorizationMode,"active_workout",action+" must be registered");
    assert.equal(app.run("guardWorkoutMutation(testAction,{setId:'stale-missing-set'},false).allowed"),false);
  }
  app.run("activeWorkoutSession().submitted=true;activeWorkoutSession().workoutState='completed'");
  assert.equal(app.run("openLoadedBarSetSheet(testSetId,'type')"),false);
  assert.equal(app.run("chooseLoadedBarSetType(testSetId,'drop')"),false);
  assert.equal(app.run("chooseLoadedBarRpe(testSetId,'8.5')"),false);
  assert.equal(row(app,first.id).rpe,"");assert.equal(row(app,first.id).setType,"straight");
});

test("submitted view is text-only, history edit restores inputs and revision actions remain locked", () => {
  const {app,rows}=revisedApp(); app.context.testSetId=rows[2].id;
  app.run("activeWorkoutSession().submitted=true;activeWorkoutSession().workoutState='completed'");
  let html=table(app); assert.doesNotMatch(html,/<input|<select|undo-coach-revision|data-action="toggle-set"/);
  assert.equal(app.run("historyMutationIsLocked('undo-coach-revision')"),true);
  assert.equal(app.run("guardWorkoutMutation('undo-coach-revision',{setId:testSetId},false).allowed"),false);
  assert.equal(app.run("undoSessionCoachRevision(activeWorkoutId,testSetId)"),false);
  app.run("historyEditFlow={sessionId:activeWorkoutId}");
  assert.match(table(app),/data-action="set-reps"/); assert.equal(app.run("undoSessionCoachRevision(activeWorkoutId,testSetId)"),false);
});

test("suppressed Show rows retain Previous and typed logging, while shadow/off retain local placeholders", () => {
  for(const mode of ["show","shadow","off"]) for(const fail of ["factual","failure","session","exercise"]) {
    const app=runtime({show:true}); const model=scenarioModel(app);
    if(fail==="factual") model.templates[0].exercises[0].setTypes[0].reviewRequired=true;
    start(app,model); const rows=activeRows(app);
    if(fail==="failure") app.run("activeWorkoutSession().coachingPrescription=null");
    if(fail==="session") app.run("setSessionDeload(activeWorkoutId,true)");
    if(fail==="exercise") { app.context.testExerciseId=rows[0].exerciseId; app.run("setExerciseDeload(testExerciseId,true)"); }
    app.assign("testMode",mode); app.run("data.settings.coachMode=testMode");
    const html=table(app); assert.match(html,/Previous/i); assert.match(html,/185/); assert.match(html,/data-action="open-session"/); assert.doesNotMatch(html,/undo-coach-revision|loaded-bar-was/);
    if(mode!=="show") {
      assert.match(html,/placeholder="185"/);
      accept(app,rows[0].id); assert.equal(row(app,rows[0].id).completed,true); assert.equal(row(app,rows[0].id).loadSource,"prefill_previous");
    } else {
      assert.doesNotMatch(html,/placeholder=|loaded-bar-rpe-hint/);
      accept(app,rows[0].id);
      assert.equal(row(app,rows[0].id).completed,false);
      assert.equal(row(app,rows[0].id).weight,""); assert.equal(row(app,rows[0].id).reps,"");
      assert.equal(app.run("loadedBarPrompts.get(testSetId).field"),"weight");
      enter(app,rows[0].id,"weight",185); accept(app,rows[0].id);
      assert.equal(row(app,rows[0].id).completed,false);
      assert.equal(app.run("loadedBarPrompts.get(testSetId).field"),"reps");
      enter(app,rows[0].id,"reps",9); enter(app,rows[0].id,"rpe",7.5); accept(app,rows[0].id);
      const logged=row(app,rows[0].id);
      assert.equal(logged.completed,true); assert.equal(logged.weight,185); assert.equal(logged.reps,9); assert.equal(logged.rpe,7.5);
      assert.equal(logged.loadSource,"entered"); assert.equal(logged.repsSource,"entered"); assert.equal(logged.rpeSource,"typed");
    }
  }
});

test("completed warm-ups collapse together and can expand without removing working rows", () => {
  const app=runtime(); const model=factualModel(app); model.templates[0].exercises[0].warmups=[45,95,135,165].map((weight,index)=>({id:"warmup-"+index,weight,reps:5}));
  start(app,model); const warmups=activeRows(app).filter(set=>set.isWarmup);
  assert.equal(warmups.length,4); assert.doesNotMatch(table(app),/4 warm-ups/);
  for(const set of warmups) accept(app,set.id);
  let html=table(app); assert.match(html,/4 warm-ups/); assert.match(html,/45.*95.*135.*165/); assert.match(html,/toggle-warmups/);
  // Expansion is delegated and changes presentation state only.
  const before=activeRows(app); app.context.testExerciseId=warmups[0].exerciseId;
  app.run("toggleLoadedBarWarmups(testExerciseId)"); html=table(app);
  for(const set of warmups) assert.ok(html.includes('id="set-'+set.id+'"'));
  assert.deepEqual(activeRows(app),before);
});

test("optional row label and skip are channel-only; exercise-level Deload tag reuses S4a styling", () => {
  const {app,rows}=revisedApp();
  // A real hard missed set causes the engine to mark the final row optional.
  complete(app,rows[2].id,{load:185,reps:4,rpe:10});
  const projected=plain(app.run("coachingTargetsForSession(activeWorkoutSession())"));
  assert.equal(projected.exercises[0].sets[3].optional,true);
  assert.match(table(app),/optional/);
  app.context.testSetId=rows[3].id; app.run("toggleSetSkipped(testSetId)");
  assert.equal(row(app,rows[3].id).skipped,true);
  app.run("toggleSetSkipped(testSetId)"); accept(app,rows[3].id);
  assert.equal(row(app,rows[3].id).completed,true);
  app.run("data.settings.coachMode='shadow'"); assert.doesNotMatch(table(app),/>optional</);
  const firstExercise=activeRows(app)[0].exerciseId;
  app.context.testExerciseId=firstExercise;
  app.run("setExerciseDeload(testExerciseId,true)");
  assert.match(app.run("renderExercise(exerciseById(testExerciseId))"),/class="s4a-deload-tag"[^>]*>Deload/);
  assert.ok(projected.visible);
});

test("mixed row units stay visible and editing preserves the labelled physical unit", () => {
  const app=runtime(); start(app,factualModel(app)); const rows=activeRows(app);
  app.context.testSetId=rows[1].id;
  app.run("patchSet(testSetId,{weightUnit:'kg',targetWeight:84},false)");
  assert.match(table(app),/class="loaded-bar-unit">KG</);
  enter(app,rows[1].id,"weight",83.5); accept(app,rows[1].id);
  assert.deepEqual([row(app,rows[1].id).weight,row(app,rows[1].id).weightUnit],[83.5,"kg"]);
});

module.exports = { runtime, routine, base, addPrior, scenarioModel, start, activeRows, factualModel };

if (require.main === module) (async () => {
  let failures=0;
  for(const {name,fn} of tests) {
    try {await fn();console.log("PASS "+name);} catch(error) {
      failures++;console.error("FAIL "+name);console.error(error.message.slice(0,450));
      console.error(String(error.stack).split("\n").find(line=>line.includes(__filename)) || "");
    }
  }
  if(failures) {console.error("Loaded Bar table tests failed: "+failures+"/"+tests.length+" groups.");process.exitCode=1;}
  else console.log("Loaded Bar table tests passed: "+tests.length+" groups.");
})();

