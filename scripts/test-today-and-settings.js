"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { runtime, factualModel, scenarioModel, activeRows } = require("./test-loaded-bar-table");
const { tests: settingsTests } = require("./test-coach-equipment-settings");
const tests = [...settingsTests];
const plain = (value) => JSON.parse(JSON.stringify(value));
function test(name, fn) { tests.push({ name, fn }); }
function todayApp({ show = false, mode = "shadow", scenario = false } = {}) {
  const app = runtime({ show });
  app.context.matchMedia = () => ({ matches: false });
  const model = scenario ? scenarioModel(app, mode) : factualModel(app, mode);
  model.templates[0].name = "Upper A";
  model.templates[0].scheduledWeekdays = ["saturday"];
  model.templates[0].exercises[0].name = "Bench (Barbell)";
  model.templates.push({ ...plain(model.templates[0]), id: "lower", name: "Lower A", scheduledWeekdays: ["sunday"] });
  app.set(model);
  app.run("activeTab='today'; activeSessionId=''; todayWorkoutChoice=null; todayPreview=null; todayWorseThanUsual=null");
  return app;
}
function rowsProjection(rows) {
  return plain(rows).map(({ setNumber, setType, sequenceIndex, weightUnit, targetWeight, targetReps, targetRestSeconds, weight, reps, rpe }) =>
    ({ setNumber, setType, sequenceIndex, weightUnit, targetWeight, targetReps, targetRestSeconds, weight, reps, rpe }));
}
function preview(app) { return app.run("plannedWorkoutPreview(data.templates[0])"); }
function html(app) { return app.run("renderLiftHome()"); }
async function click(app, dataset) {
  const target = { dataset, closest: () => null, classList: { contains: () => false } };
  await app.events.get("click")({ target: { closest: () => target }, preventDefault() {} });
}

test("pure row preview has explicit inputs, preserves input values and equals Start in shadow/off", () => {
  for (const mode of ["shadow", "off"]) {
    const app = todayApp({ mode });
    app.run("data.templates[0].exercises[0].warmups=[{id:'warmup',weight:45,reps:12}]");
    const before = app.get();
    const plan = preview(app);
    assert.deepEqual(app.get(), before);
    assert.equal(plan.channel.visible, false);
    app.run("startTemplate(data.templates[0].id)");
    const actual = app.get().sets.filter((row) => app.get().exercises.some((exercise) => exercise.sessionId === app.run("activeWorkoutId") && exercise.id === row.exerciseId));
    assert.deepEqual(rowsProjection(plan.sets), rowsProjection(actual), mode);
    const snapshot = plain(app.run("data.templates[0].exercises[0]"));
    app.assign("pureExercise", snapshot);
    app.assign("pureTarget", { resistanceType: "external", weightUnit: "kg", sets: 4 });
    app.assign("purePrevious", [{ setType: "straight", setTypeIndex: 0, reps: 10, weight: 185, weightUnit: "lb" }]);
    const pure = app.run("JSON.stringify(workoutStartRowPreviews(pureExercise,pureTarget,purePrevious,{weightUnit:'kg',defaultRestSeconds:90}))");
    app.run("data.settings.weightUnit='kg'");
    assert.equal(app.run("JSON.stringify(workoutStartRowPreviews(pureExercise,pureTarget,purePrevious,{weightUnit:'kg',defaultRestSeconds:90}))"), pure);
    assert.deepEqual(plain(app.context.pureExercise), snapshot);
  }
});

test("hidden channels never evaluate or expose coaching on Today, equipment or preview", () => {
  for (const show of [false, true]) for (const mode of ["shadow", "off", "show"]) {
    if (show && mode === "show") continue;
    const app = todayApp({ show, mode, scenario: true });
    app.run("data.templates[0].exercises[0].setTypes[0].defaultLoad={value:135,unit:'lb'};data.sets.forEach(row=>row.weight=135); prescribeSessionCoaching=()=>{throw Error('hidden preview evaluated coach')}");
    const text = html(app);
    assert.match(text, /135 lb/);
    assert.doesNotMatch(text, /185 lb|loaded-bar-collar-tag|No increases, and one set fewer/);
    assert.match(text, /Saved with this workout\./);
    app.run("openPlannedWorkoutPreview(data.templates[0].id)");
    const detailed = html(app);
    assert.doesNotMatch(detailed, /loaded-bar-collar-tag|data-action="(?:set-|toggle-set|record-injury)/);
    assert.match(detailed, /Targets are computed when you press Start\./);
  }
});

test("gate-open preview calls adapter and resolver but stores nothing and never owns active IDs", () => {
  const app = todayApp({ show: true, mode: "show", scenario: true });
  const before = app.get();
  app.run("commit=()=>{throw Error('preview committed')}; saveData=()=>{throw Error('preview saved')}; scheduleSave=()=>{throw Error('preview scheduled')}");
  const result = preview(app);
  assert.equal(result.channel.visible, true);
  assert.ok(result.session.coachingPrescription);
  assert.deepEqual(app.get(), before);
  assert.equal(app.run("activeWorkoutId"), "");
  assert.equal(app.run("activeSessionId"), "");
  assert.equal(app.storage.size, 0);
  assert.equal(app.indexed.size, 0);
});

test("gate-open preview and real start have equal resolver targets and row counts", () => {
  const app = todayApp({ show: true, mode: "show", scenario: true });
  const result = preview(app);
  const targets = result.exercises.map((exercise) => result.sets.filter((row) => row.exerciseId === exercise.id).map((row) => {
    app.assign("previewRow", row); app.assign("previewExercise", exercise); app.assign("previewChannel", result.channel);
    return plain(app.run("loadedBarTargetsForSet(previewRow,previewExercise,previewChannel)"));
  }));
  app.run("startTemplate(data.templates[0].id)");
  const actual = activeRows(app).map((row) => { app.context.rowId = row.id; return plain(app.run("loadedBarTargetsForSet(setById(rowId),exerciseById(setById(rowId).exerciseId))")); });
  assert.deepEqual(plain(targets[0].map(({ weight, reps }) => ({ weight, reps }))), actual.map(({ weight, reps }) => ({ weight, reps })));
});

test("preview preserves the actual replaceable session's start chronology without duplicating ownership", () => {
  const app = todayApp({ show: true, mode: "show", scenario: true });
  app.run("data.sessions.push({id:'idle',date:todayIso(),createdAt:'2026-10-31T01:00:00.000Z',title:'Idle',workoutState:'idle',submitted:false});activeSessionId='idle';entityIndexCache=null;entityStructureRevision+=1");
  const before = app.get();
  const result = preview(app);
  assert.equal(result.session.id, "idle");
  assert.equal(result.session.createdAt, "2026-10-31T01:00:00.000Z");
  assert.equal(result.channel.visible, true);
  assert.deepEqual(app.get(), before);
  app.run("startTemplate(data.templates[0].id)");
  assert.equal(app.run("activeWorkoutSession().createdAt"), result.session.createdAt);
  assert.equal(app.run("data.sessions.filter(session=>session.id==='idle').length"), 1);
});

test("failed gate-open preview records only a diagnostic and preserves pending saves and recovery state", () => {
  for (const recoveryPending of [false, true]) for (const invalidOutput of [false, true]) {
    const app = todayApp({ show: true, mode: "show" });
    const before = app.get();
    app.context.initialRecoveryPending = recoveryPending;
    app.context.invalidPreviewOutput = invalidOutput;
    app.run(`
      coachRecoveryPending=initialRecoveryPending;
      saveTimer=101; draftSaveTimer=102; idleSaveHandle=103;
      this.previewCancelledSaves=0; this.previewClearedTimers=[]; this.previewCancelledIdle=[];
      cancelPendingDataSave=()=>{this.previewCancelledSaves++;saveTimer=0;idleSaveHandle=0};
      window.clearTimeout=(handle)=>this.previewClearedTimers.push(handle);
      window.cancelIdleCallback=(handle)=>this.previewCancelledIdle.push(handle);
      window.ComprehensiveFitnessCoach={...window.ComprehensiveFitnessCoach,prescribeSession:()=>{
        if(invalidPreviewOutput)return {};
        throw Error('synthetic failure with private input');
      }};
      commit=()=>{throw Error('preview committed')};
      saveData=()=>{throw Error('preview saved')};
      scheduleSave=()=>{throw Error('preview scheduled')};
    `);
    const result = preview(app);
    assert.equal(result.channel.visible, false);
    assert.equal(result.session.coachingPrescription, undefined);
    assert.deepEqual(app.get(), before);
    assert.equal(app.storage.size, 0);
    assert.equal(app.indexed.size, 0);
    assert.equal(app.run("coachRecoveryPending"), recoveryPending);
    assert.deepEqual(plain(app.run("[saveTimer,draftSaveTimer,idleSaveHandle]")), [101, 102, 103]);
    assert.equal(app.context.previewCancelledSaves, 0);
    assert.deepEqual(plain(app.context.previewClearedTimers), []);
    assert.deepEqual(plain(app.context.previewCancelledIdle), []);
    assert.deepEqual(plain(app.run("coachRecoveryDiagnostics")), [
      { boundary: "coach_preview", code: "coach_evaluation_failed", count: 1 }
    ]);
    assert.doesNotMatch(JSON.stringify(app.warnings), /synthetic failure|private input/);
  }
});

test("preview diagnostics remain bounded while a real Start still invokes recovery on failure", () => {
  const app = todayApp({ show: true, mode: "show" });
  app.run("window.ComprehensiveFitnessCoach={...window.ComprehensiveFitnessCoach,prescribeSession:()=>{throw Error('synthetic failure')}}");
  for (let index = 0; index < 103; index++) preview(app);
  assert.equal(app.run("coachRecoveryDiagnostics.length"), 100);
  assert.equal(app.run("coachRecoveryPending"), false);
  app.run("this.startCancelledSaves=0;cancelPendingDataSave=()=>{this.startCancelledSaves++;this.startRecoveryWasPending=coachRecoveryPending};startTemplate(data.templates[0].id)");
  assert.equal(app.context.startRecoveryWasPending, true);
  // The ordinary factual Start commit subsequently releases recovery as before.
  assert.equal(app.run("coachRecoveryPending"), false);
  assert.equal(app.context.startCancelledSaves, 1);
  assert.equal(app.run("coachRecoveryDiagnostics.at(-1).boundary"), "coach_start");
  assert.equal(app.run("activeWorkoutSession().coachingPrescription"), undefined);
  assert.ok(app.run("hasActiveWorkout()"));
});

test("Worse than usual is date/routine scoped, saved at actual Start and cleared afterward", async () => {
  for (const mode of ["shadow", "off"]) {
    const app = todayApp({ mode });
    assert.equal(app.run("setTodayWorseThanUsual(data.templates[0].id,true)"), true);
    assert.match(html(app), /role="switch"[^>]*data-action="today-worse-than-usual"[^>]*checked/);
    await click(app, { action: "start-template", templateId: app.get().templates[0].id });
    assert.equal(app.run("activeWorkoutSession().recovery.readinessDeviation"), "meaningfully_poor");
    assert.equal(app.run("todayWorseThanUsual"), null);
  }
  const app = todayApp();
  app.run("setTodayWorseThanUsual(data.templates[0].id,true); startTemplate('lower')");
  assert.notEqual(app.run("activeWorkoutSession().recovery.readinessDeviation"), "meaningfully_poor");
});

test("readiness sheet starts with the Today switch and explicit subsequent usual selection wins", () => {
  const app = todayApp();
  app.run("setTodayWorseThanUsual(data.templates[0].id,true);openOptionalReadiness(data.templates[0].id)");
  assert.equal(app.run("optionalReadinessFlow.draft.readinessDeviation"), "meaningfully_poor");
  app.run("patchTemplateStartDraft({readinessDeviation:'usual'},false);startTemplate(optionalReadinessFlow.templateId,optionalReadinessFlow.draft,'daily')");
  assert.equal(app.run("activeWorkoutSession().recovery.readinessDeviation"), "usual");
});

test("delegated injury skip records one today occurrence, Undo and next routines without a workout", async () => {
  const app = todayApp();
  const routineId = app.get().templates[0].id;
  const initialSessions = app.get().sessions;
  await click(app, { action: "record-injury-skip", routineId, date: "2026-10-31" });
  assert.equal(app.get().skippedSessions.length, 1);
  assert.deepEqual(app.get().sessions, initialSessions);
  assert.equal(app.run("activeWorkoutId"), "");
  assert.match(html(app), /Upper A skipped · injured/);
  assert.match(html(app), /data-action="undo-injury-skip"/);
  assert.match(html(app), /Next: Lower A · Sun/);
  assert.match(html(app), /Choose another workout/);
  await click(app, { action: "record-injury-skip", routineId, date: "2026-10-31" });
  assert.equal(app.get().skippedSessions.length, 1);
  await click(app, { action: "undo-injury-skip", skipId: app.get().skippedSessions[0].id });
  assert.equal(app.get().skippedSessions.length, 0);
  assert.match(html(app), /s4b-planned/);
});

test("future and stale skips are rejected directly and through delegated controls", async () => {
  const app = todayApp();
  const routineId = app.get().templates[0].id;
  assert.equal(app.run("recordInjurySkip(data.templates[0].id,'2026-11-01')"), false);
  await click(app, { action: "record-injury-skip", routineId, date: "2026-11-01" });
  assert.equal(app.get().skippedSessions.length, 0);
  app.run("recordInjurySkip(data.templates[0].id,todayIso());todayIso=()=> '2026-11-01'");
  assert.equal(app.run("undoInjurySkip(data.skippedSessions[0].id)"), false);
  assert.doesNotMatch(html(app), /data-action="undo-injury-skip"/);
});

test("skipping a selected routine advances past today's different scheduled routine, including reload and Undo", async () => {
  const app=todayApp();
  assert.equal(app.run("chooseTodayWorkout('lower')"),true);
  await click(app,{action:"record-injury-skip",routineId:"lower",date:"2026-10-31"});
  let text=html(app);
  assert.match(text,/Lower A skipped · injured/); assert.match(text,/data-action="undo-injury-skip"/);
  assert.match(text,/Next: Lower A · Sun/); assert.doesNotMatch(text,/class="s4b-planned"|id="s4b-routine-title"/);
  assert.equal(app.run("todayWorkoutChoice"),null);
  const persisted=app.get(); app.set(persisted); app.run("todayWorkoutChoice=null;todayPreview=null");
  text=html(app); assert.match(text,/Next: Lower A · Sun/); assert.doesNotMatch(text,/class="s4b-planned"/);
  await click(app,{action:"undo-injury-skip",skipId:app.get().skippedSessions[0].id});
  assert.match(html(app),/id="s4b-routine-title">Lower A/); assert.doesNotMatch(html(app),/Next: Lower A/);
});

test("next occurrence ties retain template order and future preview never offers injury skip", () => {
  const app = todayApp();
  app.run("data.templates.push({...data.templates[1],id:'lower-two',name:'Lower B'});recordInjurySkip(data.templates[0].id,todayIso())");
  const text = html(app);
  assert.ok(text.indexOf("Next: Lower A") < text.indexOf("Next: Lower B"));
  assert.equal(app.run("openPlannedWorkoutPreview('lower','2026-11-01')"), true);
  assert.doesNotMatch(html(app), /data-action="record-injury-skip"|<input/);
  assert.match(html(app), /role="columnheader">RPE/);
  assert.match(html(app), /aria-label="RPE left empty"><\/span>/);
  assert.equal(app.run("openPlannedWorkoutPreview('lower','2026-11-02')"), false);
});

test("zero or several scheduled routines retain a direct chooser and picked-today skip", () => {
  for (const schedule of [[], ["saturday"]]) {
    const app = todayApp();
    app.assign("schedule", schedule);
    app.run("data.templates[0].scheduledWeekdays=schedule;data.templates[1].scheduledWeekdays=schedule");
    assert.match(html(app), /Choose your workout/);
    assert.match(html(app), /data-action="start-template"/);
    assert.match(html(app), /data-action="plan-today-workout"/);
    assert.equal(app.run("chooseTodayWorkout('lower')"), true);
    assert.match(html(app), /data-action="record-injury-skip" data-routine-id="lower"/);
    assert.ok(app.run("recordInjurySkip('lower',todayIso())"));
  }
});

test("pre-start illness stays, pain is absent, active readiness retains both", () => {
  const app = todayApp();
  app.run("openOptionalReadiness(data.templates[0].id)");
  const pre = app.run("renderOptionalReadinessSheet()");
  assert.match(pre, /Current illness|template-readiness-illness/);
  assert.doesNotMatch(pre, /Pain or injury|template-readiness-pain|Better than usual/);
  app.run("optionalReadinessFlow=null;startTemplate(data.templates[0].id);openOptionalReadiness('',activeWorkoutId)");
  const active = app.run("renderOptionalReadinessSheet()");
  for (const expected of ["Current illness", "Pain or injury", "template-readiness-illness", "template-readiness-pain"]) assert.ok(active.includes(expected));
});

test("Last night stays empty and does not borrow manual recovery or invent observations", () => {
  const app = todayApp();
  assert.equal(app.run("renderTodayLastNight()"), "");
  assert.doesNotMatch(html(app), /Last night|HRV|resting HR|sleep/i);
  assert.equal(Object.hasOwn(app.get(), "wearableObservations"), false);
});

test("direct Start preserves logged draft conflict, while preview Start uses that same handler", async () => {
  const app = todayApp();
  app.run("startTemplate(data.templates[0].id);data.sets.find(row=>row.exerciseId===data.exercises.at(-1).id).edited=true");
  const activeId = app.run("activeWorkoutId");
  await click(app, { action: "start-template", templateId: "lower" });
  assert.equal(app.run("activeWorkoutId"), activeId);
  assert.equal(app.run("templateStartFlow.step"), "active-conflict");
  assert.equal(app.run("templateStartFlow.templateId"), "lower");
});

test("CSS remains a single scoped block immediately after S3 with keyboard focus and token colors", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(source, /\/\* S3 loaded-bar: end \*\/\s*\/\* S4b today and settings: start \*\//);
  assert.equal(source.split("/* S4b today and settings: start */").length, 2);
  const block = source.split("/* S4b today and settings: start */")[1].split("/* S4b today and settings: end */")[0];
  assert.match(block, /:focus-visible/);
  assert.match(block, /min-height: 44px/);
  assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  const redRules = block.split("}").filter((rule) => rule.includes("var(--red)"));
  assert.equal(redRules.length, 1);
  assert.match(redRules[0], /\.s4b-injury-skip/);
});

if (require.main === module) (async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log("PASS " + name); }
    catch (error) { failed++; console.error("FAIL " + name + "\n" + error.stack); }
  }
  if (failed) { console.error("Today and settings tests failed: " + failed + "/" + tests.length + " groups."); process.exitCode = 1; }
  else console.log("Today and settings tests passed: " + tests.length + " groups.");
})();
