"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { runtime, factualModel, scenarioModel, start, activeRows } = require("./test-loaded-bar-table");
const scenario = require("../coach-concepts/loaded-bar-v1.scenario.json");
const bar = require("../loaded-bar");
const tests = [];
const plain = (value) => JSON.parse(JSON.stringify(value));
function test(name, fn) { tests.push({ name, fn }); }

function screenApp({ show = false, mode = "shadow", scenarioInput = false, resistance = "external", count = 1 } = {}) {
  const app = runtime({ show });
  app.context.matchMedia = () => ({ matches: false });
  app.context.getComputedStyle = () => ({ fontSize: "16px" });
  app.context.CSS = { escape: (value) => value };
  app.context.requestAnimationFrame = (callback) => { callback(); return 0; };
  const model = scenarioInput ? scenarioModel(app, mode) : factualModel(app, mode, resistance);
  model.templates[0].exercises[0].name = "Bench (Barbell)";
  for (let index = 1; index < count; index += 1) {
    model.templates[0].exercises.push({ ...plain(model.templates[0].exercises[0]), id: "routine-extra-" + index,
      performanceExerciseId: "custom:extra-" + index, name: "Lift " + index + " (Dumbbell)", order: index });
  }
  start(app, model);
  app.run("activeTab='workout'; ensureActiveSet()");
  app.context.exerciseId = activeRows(app)[0].exerciseId;
  return app;
}
function focus(app) { return app.run("renderLoadedBarFocus(exerciseById(exerciseId),activeWorkoutSession())"); }
function screen(app) { return app.run("renderWorkout()"); }
function equipment(app) { return plain(app.run("loadedBarEquipmentForSet(exerciseById(exerciseId),setById(activeSetId))")); }
function complete(app, position, fact = {}) {
  const row = activeRows(app).filter((set) => set.exerciseId === app.context.exerciseId)[position];
  app.context.rowId = row.id;
  app.assign("fact", { weight: fact.load ?? 185, reps: fact.reps ?? 9, rpe: fact.rpe ?? 8,
    loadSource: "entered", repsSource: "entered", rpeSource: "typed" });
  app.run("patchSet(rowId,fact,false); completingSetIds.clear(); toggleSetCompletion(rowId); ensureActiveSet()");
}
function revised(load = false) {
  const app = screenApp({ show: true, mode: "show", scenarioInput: true });
  complete(app, 0, scenario.factsLogged[0]); complete(app, 1, scenario.factsLogged[1]);
  if (load) complete(app, 2, scenario.factsLogged[2]);
  return app;
}

test("equipment corrections precede Strong suffix and runtime research catalog, with exact variant keys", () => {
  const app = screenApp();
  assert.equal(equipment(app).derivedClass, "barbell");
  assert.equal(app.run("setExerciseEquipmentCorrection(exerciseId,'stack')"), true);
  assert.equal(equipment(app).derivedClass, "stack");
  assert.equal(app.get().settings.equipmentCorrections[0].exerciseIdentity, app.run("coachVariantIdentity(exerciseById(exerciseId))"));
  app.run("setExerciseEquipmentCorrection(exerciseId,''); exerciseById(exerciseId).name='Catalog lift'; exerciseById(exerciseId).researchExerciseId='catalog-bench'; prescriptionEngine={evidence:{research:{exerciseDatabase:[{exercise_id:'catalog-bench',exercise_name:'Catalog lift',equipment:'dumbbell pair'}]}}}");
  assert.equal(equipment(app).derivedClass, "dumbbell");
  app.run("exerciseById(exerciseId).name='Catalog lift (Machine)'");
  assert.equal(equipment(app).derivedClass, "stack");
  app.run("exerciseById(exerciseId).researchExerciseId='unknown'; exerciseById(exerciseId).name='Unknown lift'");
  assert.equal(equipment(app).derivedClass, "generic");
});

test("equipment and table share only visible targets; shadow and the closed gate use local targets", () => {
  for (const show of [true, false]) for (const mode of ["show", "shadow", "off"]) {
    const app = screenApp({ show, mode, scenarioInput: true });
    app.run("setById(activeSetId).targetWeight=135");
    const visible = show && mode === "show";
    assert.equal(equipment(app).target, visible ? 185 : 135);
    assert.equal(equipment(app).load.loaded, visible ? 185 : 135);
    assert.match(focus(app), new RegExp('placeholder="' + (visible ? 185 : 135) + '"'));
  }
});

test("bar settings use the row unit and inexact loading never edits its target", () => {
  const app = screenApp();
  app.run("setById(activeSetId).weightUnit='kg'; setById(activeSetId).targetWeight=81; data.settings.barWeight.kg=20; data.settings.plateInventory.kg=[20,10,5]");
  const result = equipment(app); assert.equal(result.unit, "kg"); assert.equal(result.target, 81);
  assert.deepEqual(result.load.perSide, [20, 10]); assert.equal(result.load.loaded, 80);
  assert.match(focus(app), /can&#39;t load 81 exactly/);
  assert.equal(app.run("setById(activeSetId).targetWeight"), 81);
});

test("Automatic describes derivation without the correction and the picker clears back to it", () => {
  const app = screenApp();
  app.run("setExerciseEquipmentCorrection(exerciseId,'dumbbell');openLoadedBarExerciseSheet(exerciseId)");
  assert.match(app.run("renderLoadedBarSetSheet()"), /Automatic \(barbell\)/);
  assert.equal(equipment(app).derivedClass, 'dumbbell');
  app.run("setExerciseEquipmentCorrection(exerciseId,'')");
  assert.equal(equipment(app).derivedClass, 'barbell');
});

test("visible load revisions draw the swap sentence, rounds, and only new plates with halos", () => {
  const app = revised(true); const html = focus(app);
  assert.match(html, /Swap each 25 for 10 \+ 10 \+ 2.5/);
  assert.match(html, /loaded-bar-plate-change coach-change/);
  assert.match(html, /loaded-bar-round p25/);
  assert.equal((html.match(/class="pl p10 new"/g) || []).length, 2);
  assert.match(html, /class="pl p2 new"/);
  assert.doesNotMatch(html, /class="pl p45 new"/);
  assert.equal(equipment(app).target, 180);
});

test("a reps-only revision leaves the bar and plates unchanged", () => {
  const app = revised(); const html = focus(app);
  assert.equal(equipment(app).target, 185);
  assert.doesNotMatch(html, /loaded-bar-plate-change|pl-halo|class="pl [^"]* new/);
  assert.match(html, /loaded-bar-was/);
  assert.equal((html.match(/<i class="(?:filled)?">/g) || []).length, 8);
});

test("ordinary target load changes get the same plate instructions without coach styling", () => {
  const app = screenApp(); complete(app, 0);
  app.run("setById(activeSetId).targetWeight=180");
  const html = focus(app); assert.match(html, /Swap each 25 for 10 \+ 10 \+ 2.5/);
  assert.match(html, /class="loaded-bar-plate-change"/); assert.doesNotMatch(html, /coach-change|loaded-bar-collar-tag/);
});

test("collar tag requires a visible exercise reason, including revision-off handling", () => {
  const app = revised(); assert.match(focus(app), /loaded-bar-collar-tag/); assert.match(focus(app), /class="col flag"/);
  app.run("data.settings.coachBetweenSetRevisions=false");
  assert.doesNotMatch(focus(app), /loaded-bar-collar-tag|class="col flag"|loaded-bar-was|coach-change/);
  assert.equal(equipment(app).target, 185, 'Turning revisions off retains visible start targets');
  app.run("data.settings.coachBetweenSetRevisions=true;data.settings.coachMode='shadow'");
  assert.doesNotMatch(focus(app), /loaded-bar-collar-tag|class="col flag"/);
});

test("suppressed Show channels have no equipment target; shadow/off retain local targets and Previous", () => {
  for (const mode of ["show", "shadow", "off"]) for (const condition of ["factual", "failure", "session", "exercise"]) {
    const app = revised(true);
    app.run("setById(activeSetId).targetWeight=135");
    if (condition === "factual") app.run("activeWorkoutSession().coachingPrescription.exercises[0].codes.push('factual_only')");
    if (condition === "failure") app.run("activeWorkoutSession().coachingPrescription=null");
    if (condition === "session") app.run("setSessionDeload(activeWorkoutId,true)");
    if (condition === "exercise") app.run("setExerciseDeload(exerciseId,true)");
    app.assign("testMode",mode); app.run("data.settings.coachMode=testMode");
    const html = focus(app); assert.equal(equipment(app).target, mode === "show" ? null : 135);
    if (mode === "show") {
      assert.equal(equipment(app).equipmentClass,"generic"); assert.equal(equipment(app).load,null);
      assert.match(html,/Weight block, no target/);
      assert.doesNotMatch(html,/loaded-bar-total|loaded-bar-per-side|placeholder=|loaded-bar-rpe-hint/);
    } else assert.match(html,/placeholder="135"/);
    assert.match(html, /data-action="open-session"/);
    assert.doesNotMatch(html, /loaded-bar-collar-tag|coach-change|loaded-bar-was|undo-coach-revision|class="col flag"/);
  }
});

test("decorative equipment and pips stay bounded while extreme observations remain editable through safe rendering", () => {
  const app = screenApp(); const first=activeRows(app)[0]; app.context.extremeSetId=first.id;
  assert.equal(app.run("patchSetValue(extremeSetId,'weight',1e12,false)"),true);
  assert.equal(app.run("patchSetValue(extremeSetId,'reps',1e6,false)"),true);
  app.run("setById(extremeSetId).targetWeight=1e12;setById(extremeSetId).targetReps=1e6");
  let html=app.run("renderViewSafely()");
  assert.equal(app.run("viewRenderError"),null);
  assert.match(html,/class="eq-block"/); assert.match(html,/too heavy to draw/); assert.match(html,/class="loaded-bar-equipment undrawable-load"/);
  assert.doesNotMatch(html,/class="loaded-bar-pips"|loaded-bar-per-side/);
  assert.match(html,/value="1000000000000"[^>]*data-action="set-weight"/);
  assert.match(html,/value="1000000"[^>]*data-action="set-reps"/);
  app.run("completingSetIds.clear();toggleSetCompletion(extremeSetId)");
  html=app.run("renderViewSafely()"); assert.equal(app.run("viewRenderError"),null);
  assert.match(html,/value="1000000000000"[^>]*data-action="set-weight"/);
  assert.match(html,/value="1000000"[^>]*data-action="set-reps"/);
  assert.equal(app.run("setById(extremeSetId).completed"),true);
  assert.equal(app.run("setById(extremeSetId).weight"),1e12); assert.equal(app.run("setById(extremeSetId).reps"),1e6);
  assert.doesNotMatch(html,/loaded-bar-plate-change/,'An undrawable prior actual cannot supply a plate-swap instruction');
  assert.equal(app.run("renderLoadedBarRepPips(setById(extremeSetId),31)"),"");
  assert.equal(app.run("renderLoadedBarRepPips(setById(extremeSetId),1e6)"),"");
  assert.equal((app.run("renderLoadedBarRepPips(setById(extremeSetId),30)").match(/<i /g)||[]).length,30);
  assert.equal(app.run("patchSetValue(extremeSetId,'weight',177.5,false)"),true);
  assert.equal(app.run("patchSetValue(extremeSetId,'reps',7,false)"),true);
  html=app.run("renderViewSafely()"); assert.equal(app.run("viewRenderError"),null);
  assert.match(html,/value="177.5"[^>]*data-action="set-weight"/);
  assert.equal(app.run("setById(extremeSetId).reps"),7);
});

test("absent targets show a numberless generic block; duration and distance show no plates", () => {
  const app = screenApp(); app.run("setById(activeSetId).targetWeight=''");
  assert.match(focus(app), /Weight block, no target/); assert.doesNotMatch(focus(app), /loaded-bar-total|class="pl |loaded-bar-per-side/);
  for (const resistance of ["duration", "distance"]) {
    const other = screenApp({ resistance }); const html = focus(other);
    assert.match(html, /Weight block, no target/); assert.doesNotMatch(html, /loaded-bar-total|class="pl |loaded-bar-pips|loaded-bar-per-side/);
    assert.match(html, /Previous/); assert.match(html, new RegExp('data-action="set-' + (resistance === 'duration' ? 'duration' : 'distance') + '"'));
  }
});

test("rest clamp projects once between completed and active rows with existing hooks and native actions", () => {
  const app = screenApp(); app.run("data.settings.autoStartRestTimer=true"); complete(app, 0);
  const html = screen(app); const header = app.run("renderActiveSessionHeader(activeWorkoutSession())");
  assert.equal((html.match(/data-timer-id=/g) || []).length, 1); assert.doesNotMatch(header, /data-timer-id=/);
  assert.ok(html.indexOf('id="set-' + activeRows(app)[0].id) < html.indexOf('data-timer-id='));
  assert.ok(html.indexOf('data-timer-id=') < html.indexOf('id="set-' + activeRows(app)[1].id));
  for (const action of ["adjust-timer", "skip-timer", "toggle-timer", "clear-timer"]) assert.match(html, new RegExp('<button[^>]*data-action="' + action + '"'));
  for (const hook of ['data-timer-progress-label', 'class="timer-progress"', 'class="timer-summary"', 'class="timer-rest-copy"', 'data-seconds="-15"', 'data-seconds="15"', '>Skip</button>', 'of 2:30']) assert.ok(html.includes(hook), hook);
  app.run("timer.isOvertime=true;timer.endsAt=Date.now()-12000"); assert.match(screen(app), /data-phase="overtime"/); assert.match(screen(app), /\+00:12/);
  app.run("timer.isOvertime=false;timer.remainingSeconds=8"); assert.match(screen(app), /data-phase="final"/);
  app.run("timer.isPaused=true"); assert.match(screen(app), /data-paused="true"/); assert.match(screen(app), />Resume</);
});

test("adjust and pause synchronize a changed timer ID, duration, phase and buttons without duplicating DOM", () => {
  const app = screenApp(); app.run("data.settings.autoStartRestTimer=true"); complete(app, 0);
  const labels = new Map(); const buttons = [{ disabled: false }, { disabled: false }];
  const pause = { disabled: false, innerHTML: '', closest: () => true, setAttribute() {} };
  const projection = { dataset: {}, toggleAttribute() {}, querySelector(selector) {
    if (selector.includes('toggle-timer')) return pause;
    if (!labels.has(selector)) labels.set(selector, { textContent: '', setAttribute() {}, style: { setProperty() {} } });
    return labels.get(selector);
  }, querySelectorAll: () => buttons };
  app.context.timerProjection = projection;
  app.run("root.querySelector=(selector)=>selector.includes('loaded-bar-rest-clamp')?timerProjection:null;document.querySelector=(selector)=>selector.includes(timer.id)?timerProjection:null");
  const id = app.run("timer.id"); app.run("adjustTimer(15)");
  assert.notEqual(app.run("timer.id"), id); assert.equal(projection.dataset.timerId, app.run("timer.id"));
  assert.equal(labels.get('[data-timer-duration]').textContent, 'of 2:45');
  app.run("toggleTimer()"); assert.equal(pause.innerHTML, 'Resume'); assert.equal(buttons[0].disabled, true);
  app.run("toggleTimer()"); assert.equal(pause.innerHTML, 'Pause'); assert.equal(buttons[0].disabled, false);
});

test("duration rest projects one five-column row and the final-set timer still remains visible", () => {
  const app = screenApp({ resistance: 'duration' });
  app.run("data.settings.autoStartRestTimer=true");
  complete(app, 0);
  assert.match(screen(app), /loaded-bar-rest-clamp[^]*?aria-colspan="5"/);
  for (let index = 1; index < 4; index += 1) complete(app, index);
  assert.equal((screen(app).match(/data-timer-id=/g) || []).length, 1);
  assert.ok(screen(app).indexOf('id="set-' + activeRows(app)[3].id) < screen(app).indexOf('data-timer-id='));
});

test("Up next preserves routine order, moves done lifts last, and delegated focus opens one exercise", async () => {
  const app = screenApp({ count: 6 }); const exercises = plain(app.run("activeExercises()"));
  app.context.doneId = exercises[2].id;
  app.run("data.sets.filter(set=>set.exerciseId===doneId).forEach(set=>{set.completed=true;set.weight=185;set.reps=9})");
  const html = screen(app); const next = html.slice(html.indexOf('class="loaded-bar-up-next"'));
  assert.ok(next.indexOf(exercises[1].name) < next.indexOf(exercises[3].name));
  assert.ok(next.indexOf(exercises[5].name) < next.indexOf(exercises[2].name));
  assert.match(next, /Then 1 more lifts/); assert.match(next, /loaded-bar-done-mark/); assert.match(next, /9 · 9 · 9 · 9 reps/);
  assert.match(next, /class="eqa"/); assert.equal((html.match(/role="table"/g) || []).length, 1);
  const target = { dataset: { action: 'focus-workout-exercise', exerciseId: exercises[1].id }, tagName: 'BUTTON', classList: { contains: () => false } };
  await app.events.get('click')({ target: { closest: () => target }, preventDefault() {} });
  assert.equal(app.run("workoutFocusExerciseId"), exercises[1].id);
  assert.match(screen(app), new RegExp('id="exercise-' + exercises[1].id));
  assert.equal((screen(app).match(/role="table"/g) || []).length, 1);
});

test("session header preserves every session action and exposes guarded deload state and Finish", () => {
  const app = screenApp(); const html = app.run("renderActiveSessionHeader(activeWorkoutSession())");
  for (const action of ["session-deload", "request-submit-workout", "session-menu", "close-workout-context", "log-workout-readiness", "save-template", "request-cancel-workout", "toggle-workout-pause"]) assert.ok(html.includes('data-action="' + action + '"'), action);
  assert.match(html, /data-session-id=/); assert.match(html, /data-session-dock-elapsed/);
  assert.doesNotMatch(screen(app), /Current focus/);
  app.run("setSessionDeload(activeWorkoutId,true)");
  assert.match(app.run("renderActiveSessionHeader(activeWorkoutSession())"), /data-session-id="[^"]+" checked/);
  assert.ok(app.get().sessions.at(-1).coachingSuspensions.some((entry) => entry.scope === 'session'));
});

test("exercise menu keeps all old controls, equipment choices, deload and set tools reachable", () => {
  const app = screenApp(); assert.equal(app.run("openLoadedBarExerciseSheet(exerciseId)"), true);
  const html = app.run("renderLoadedBarSetSheet()");
  for (const action of ["exercise-deload", "exercise-equipment", "move-exercise", "delete-exercise", "add-set", "add-warmup-set", "duplicate-set", "exercise-resistance-type", "exercise-substitute-name", "apply-exercise-substitution", "apply-standard-workload", "exercise-notes", "update-template-exercise", "exercise-primary-muscle", "exercise-secondary-muscle", "set-type-sheet", "close-set-sheet"]) assert.ok(html.includes('data-action="' + action + '"'), action);
  for (const value of bar.EQUIPMENT_CLASSES) assert.ok(html.includes('value="' + value + '"'), value);
  assert.match(html, /value=""/); assert.match(html, /<details class="exercise-details" open>/);
  assert.match(html, /role="dialog" aria-modal="true"/);
});

test("exercise-sheet management names retain escaped exercise context and the shared disclosure cue", () => {
  const app = screenApp();
  app.run("exerciseById(exerciseId).name='Public & <Synthetic> Bench';openLoadedBarExerciseSheet(exerciseId)");
  const html = app.run("renderLoadedBarSetSheet()");
  for (const label of ["Move Public &amp; &lt;Synthetic&gt; Bench up", "Move Public &amp; &lt;Synthetic&gt; Bench down", "Remove exercise Public &amp; &lt;Synthetic&gt; Bench"]) {
    assert.ok(html.includes('aria-label="' + label + '"'), label);
  }
  assert.match(html, /class="loaded-bar-exercise-more compact-disclosure"/);
});

test("equipment mutator is bounded, validated, directly guarded and settings-only", () => {
  const app = screenApp(); const before = app.get();
  assert.equal(app.run("setExerciseEquipmentCorrection('missing','barbell')"), false);
  assert.equal(app.run("setExerciseEquipmentCorrection(exerciseId,'invalid')"), false);
  assert.equal(app.run("guardWorkoutMutation('exercise-equipment',{},false).allowed"), false);
  assert.equal(app.run("setExerciseEquipmentCorrection(exerciseId,'plate_loaded')"), true);
  assert.deepEqual(app.get().sets, before.sets); assert.deepEqual(app.get().templates, before.templates);
  assert.deepEqual(app.get().sessions, before.sessions);
  app.run("data.settings.equipmentCorrections=Array.from({length:1000},(_,index)=>({exerciseIdentity:'custom:'+index+'|external',equipmentClass:'generic'}))");
  assert.equal(app.run("setExerciseEquipmentCorrection(exerciseId,'stack')"), false);
  app.run("data.settings.equipmentCorrections.pop()"); assert.equal(app.run("setExerciseEquipmentCorrection(exerciseId,'stack')"), true);
  assert.equal(app.get().settings.equipmentCorrections.length, 1000);
  assert.equal(app.run("setExerciseEquipmentCorrection(exerciseId,'')"), true);
  assert.equal(app.get().settings.equipmentCorrections.length, 999);
  app.run("activeWorkoutSession().submitted=true;activeWorkoutSession().workoutState='completed'");
  assert.equal(app.run("setExerciseEquipmentCorrection(exerciseId,'barbell')"), false);
  app.run("historyEditFlow={sessionId:activeWorkoutId}");
  assert.equal(app.run("setExerciseEquipmentCorrection(exerciseId,'barbell')"), false);
});

test("rep pips are aria-hidden visual output and fill only as reps are typed", () => {
  const app = screenApp(); assert.match(focus(app), /data-rep-pips="[^"]+" aria-hidden="true"/);
  assert.equal((focus(app).match(/<i class="">/g) || []).length, 9);
  const pips = Array.from({ length: 9 }, () => ({ filled: false, classList: { toggle(_class, filled) { this.owner.filled = filled; } } }));
  for (const pip of pips) pip.classList.owner = pip;
  app.context.testPips = { querySelectorAll: () => pips };
  app.run("root.querySelector=()=>testPips;syncLoadedBarRepPips(activeSetId,'4')");
  assert.equal(pips.filter((pip) => pip.filled).length, 4);
  app.run("syncLoadedBarRepPips(activeSetId,'')"); assert.equal(pips.some((pip) => pip.filled), false);
  assert.match(focus(app), /data-action="set-reps"/);
});

test("bounds slot is empty, hidden and inert; definitions appear once in the page renderer", () => {
  const app = screenApp({ count: 4 }); const html = screen(app);
  assert.equal((html.match(/<div class="coach-bounds-slot" data-coach-bounds-slot hidden><\/div>/g) || []).length, 1);
  const views = fs.readFileSync(path.join(__dirname, '..', 'app-views.js'), 'utf8');
  assert.equal((views.match(/\.renderDefs\(\)/g) || []).length, 1);
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.doesNotMatch(appSource, /coach-bounds-slot/);
  assert.ok(html.indexOf('loaded-bar-up-next') < html.indexOf('Install on iPhone'));
  assert.doesNotMatch(views.slice(views.indexOf('function render()'), views.indexOf('function resizeExerciseNameFields')), /renderSessionDock\(/);
});

test("submitted and history-edit pages retain full exercise tables and Previous outside the active layout", () => {
  const app = screenApp({ show: true, mode: 'show', scenarioInput: true, count: 3 });
  app.run("activeWorkoutSession().submitted=true;activeWorkoutSession().workoutState='completed'");
  let html = screen(app);
  assert.doesNotMatch(html, /loaded-bar-workout|loaded-bar-focus|loaded-bar-up-next|data-timer-id=/);
  assert.equal((html.match(/role="table"/g) || []).length, 3);
  assert.match(html, /data-action="open-session"/);
  app.run("historyEditFlow={sessionId:activeWorkoutId}"); html = screen(app);
  assert.equal((html.match(/role="table"/g) || []).length, 3);
  assert.match(html, /data-action="set-reps"/); assert.match(html, /data-action="request-save-history-edits"/);
  assert.doesNotMatch(html, /loaded-bar-focus|loaded-bar-up-next/);
});

test("CSS separates placeholders, fits padded phone columns, keeps 44px controls, reflow and reduced motion", () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const css = html.slice(html.indexOf('/* S3 loaded-bar: start */'), html.indexOf('/* S3 loaded-bar: end */'));
  assert.match(css, /input::placeholder\s*\{[^}]*var\(--muted\)[^}]*font-weight: 400/);
  assert.match(css, /loaded-bar-rpe-hint[^}]*white-space: nowrap/);
  assert.match(css, /loaded-bar-row[^}]*padding: 0 var\(--sp-2\)/);
  assert.match(css, /loaded-bar-cell input[^}]*min-width: 0/);
  assert.match(css, /loaded-bar-rest-actions button[^}]*min-width: 44px; min-height: 44px/);
  assert.match(css, /html.large-text-reflow/); assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.doesNotMatch(css, /https?:\/\//);
  assert.match(css,/loaded-bar-equipment\.undrawable-load \.loaded-bar-total\s*\{[^}]*position: static;[^}]*max-width: 100%;[^}]*overflow-wrap: anywhere/);
});

(async () => {
  let failures = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log('PASS ' + name); }
    catch (error) { failures += 1; console.error('FAIL ' + name + '\n' + error.stack); }
  }
  if (failures) { console.error('Loaded Bar screen tests failed: ' + failures + '/' + tests.length + ' groups.'); process.exitCode = 1; }
  else console.log('Loaded Bar screen tests passed: ' + tests.length + ' groups.');
})();
