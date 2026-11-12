"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { APPLICATION_RUNTIME_FILES, readApplicationContractSource } = require("./read-application-contract-source");
const { syntheticCoachBackup } = require("../tests/fixtures/synthetic-coach-backup");
const coach = require("../coach-engine");
const backup = require("../backup-contract");
const root = path.resolve(__dirname, "..");
const source = readApplicationContractSource(root);
const plain = (value) => JSON.parse(JSON.stringify(value));
let assertions = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { assertions += 1; console.log("PASS " + name); });
}

// Load the real ordered classic scripts in one lexical environment. Only boot is
// suppressed: every data, mutation, normalization and persistence function is real.
function runtime() {
  let generatedId = 0;
  let timerId = 0;
  const timers = new Map();
  const warnings = [];
  const storage = new Map();
  const indexed = new Map();
  const element = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  const context = {
    console: { ...console, warn: (message) => warnings.push(message) }, URL, URLSearchParams, TextEncoder, TextDecoder, structuredClone,
    navigator: { onLine: false },
    document: { getElementById: (id) => id === "root" ? element : null, addEventListener() {},
      querySelector: () => null, querySelectorAll: () => [], documentElement: { removeAttribute() {} } },
    location: { hostname: "synthetic.invalid", hash: "#today", search: "", href: "https://synthetic.invalid/#today" },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    setTimeout: (fn, delay) => { timers.set(++timerId,{fn,delay}); return timerId; }, clearTimeout: (id) => timers.delete(id), setInterval: () => 0, clearInterval() {}, addEventListener() {},
    requestAnimationFrame: () => 0, history: { state: null }, crypto: { randomUUID: () => "synthetic-id-" + (++generatedId) },
    performance: { now: () => 0 }
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ["prescription-engine.js", "exception-resolver.js", "coach-engine.js", "loaded-bar.js", "backup-contract.js", ...APPLICATION_RUNTIME_FILES]) {
    let text = fs.readFileSync(path.join(root, file), "utf8");
    if (file === "app.js") text = text.replace(/\n\s+boot\(\);/, "\n// Test owns startup.");
    vm.runInContext(text, context, { filename: file });
  }
  const run = (text) => vm.runInContext(text, context);
  // Persistence and DOM adapters are synthetic; production selectors and mutations
  // remain intact. No timers, browser APIs, network or user data are needed.
  context.testIndexed = indexed;
  run(`
    readIndexedRecord = async (key) => testIndexed.has(key) ? {value:structuredClone(testIndexed.get(key)),updatedAt:"2026-11-03T18:00:00Z"} : null;
    readIndexedValue = async (key) => testIndexed.has(key) ? structuredClone(testIndexed.get(key)) : null;
    writeIndexedValue = async (key,value) => { testIndexed.set(key, structuredClone(value)); return true; };
    restorePushIdentity = async () => {};
    restoreRuntime = async () => {};
    render = () => {};
    applyCompletedSetVisual = () => {};
    renderAfterInteractionFrame = () => {};
    syncReconcilePromptDom = () => {};
    completedSetReconcileState = () => null;
    showAppToast = () => {};
  `);
  const assign = (name, value) => { context.serializedInput = JSON.stringify(value); run(`this.${name} = JSON.parse(serializedInput)`); };
  return {
    context, run, storage, indexed, assign, timers, warnings,
    set(model) { assign("input",model); run("data = input; entityIndexCache = null; entityStructureRevision += 1;"); },
    get() { return plain(run("data")); },
    normalize(model) { assign("input",model); return plain(run("normalizeLoadedData(input)")); },
    import(model) { assign("input",model); run("delete input.backupSchemaVersion;"); return plain(run("validateImportedAppData(input)")); }
  };
}

function coachFacts(model) {
  model = plain(model);
  const own = (record, fields) => Object.fromEntries(fields.filter((field) => Object.hasOwn(record, field)).map((field) => [field, record[field]]));
  return {
    settings: own(model.settings, ["coachMode", "coachBetweenSetRevisions", "routineIncrementUnit", "barWeight", "plateInventory", "equipmentCorrections"]),
    sessions: model.sessions.map((session) => own(session, ["id", "isDeload", "coachingPrescription", "coachingSuspensions"])),
    sets: model.sets.map((set) => own(set, ["id", "loadSource", "repsSource", "rpeSource", "loadTouched", "repsTouched", "rpeTouched", "completionOrder", "completedAt"])),
    templates: model.templates.map((template) => ({ scheduledWeekdays: template.scheduledWeekdays,
      roles: template.exercises.map((exercise) => exercise.setTypes.map((role) => own(role,
        ["incrementUnit", "defaultLoad", "targetLoad", "defaultReps", "weight", "weightUnit", "reps", "restSeconds"]))) })),
    skippedSessions: model.skippedSessions
  };
}

function active(model) {
  model.sessions[0] = { ...model.sessions[0], submitted: false, workoutStarted: true, workoutState: "active", startedAt: "2026-11-02T18:00:00Z" };
  return model;
}

async function main() {
  const app = runtime();
  const fixture = active(syntheticCoachBackup());
  const expected = coachFacts(fixture);
  await test("all S1a fields survive real normalization, role projection, backup and strict import", () => {
    const normalized = app.normalize(fixture);
    assert.deepEqual(coachFacts(normalized), expected);
    assert.deepEqual(coachFacts(app.normalize(normalized)), expected);
    assert.deepEqual(coachFacts(backup.createBackupExport(normalized)), expected);
    assert.deepEqual(coachFacts(app.import(backup.createBackupExport(normalized))), expected);
    app.context.input = normalized.templates[0].exercises[0].setTypes[0];
    const role = plain(app.run("normalizeTargetSetType(input)"));
    for (const field of ["incrementUnit", "defaultLoad", "targetLoad", "defaultReps", "weight", "weightUnit", "reps", "restSeconds"]) {
      assert.deepEqual(role[field], fixture.templates[0].exercises[0].setTypes[0][field]);
    }
    assert.equal(role.restSeconds, 120, "Role rest must survive an exercise rest of 90");
  });
  for (const reason of ["role_changed", "evaluation_failed", "coach_off"]) {
    await test(reason + " suspensions survive normalization, both local stores, draft restore and strict import", async () => {
      const rt = runtime();
      const model = active(syntheticCoachBackup());
      const suspensions = [
        { scope: "exercise", exerciseId: "coach-exercise", reason, at: "2026-11-02T18:05:00.000Z" },
        { scope: "session", reason, at: "2026-11-02T18:06:00.000Z" }
      ];
      model.sessions[0].coachingSuspensions = suspensions;
      const normalized = rt.normalize(model);
      assert.deepEqual(normalized.sessions[0].coachingSuspensions, suspensions, "Local recovery must keep recognized suspension reasons");
      assert.deepEqual(plain(backup.quarantineCoachData(model).model.sessions[0].coachingSuspensions), suspensions);
      const exported = backup.createBackupExport(normalized);
      assert.deepEqual(rt.import(exported).sessions[0].coachingSuspensions, suspensions, "Strict import preserves the suppression boundary");
      rt.set(normalized);
      rt.run("activeWorkoutId=data.sessions[0].id; activeSessionId=activeWorkoutId;");
      const draft = plain(rt.run("activeWorkoutDraftSnapshot({incrementSequence:false})"));
      assert.deepEqual(draft.session.coachingSuspensions, suspensions);
      backup.validateCoachDraft(draft, normalized);
      const backupWithDraft = backup.createBackupExport(normalized, { activeWorkoutDraft: draft });
      assert.deepEqual(plain(backupWithDraft.activeWorkoutDraft.session.coachingSuspensions), suspensions);
      rt.indexed.set("active-workout-draft", draft);
      assert.equal(await rt.run("restoreActiveWorkoutDraft()"), true);
      assert.deepEqual(rt.get().sessions[0].coachingSuspensions, suspensions);
      for (const sourceKind of ["indexed", "fallback"]) {
        const stored = runtime();
        if (sourceKind === "indexed") stored.indexed.set("app-data", normalized);
        else { stored.assign("input", normalized); assert.equal(stored.run("writeLocalAppDataFallback(input)"), true); }
        await stored.run("loadData()");
        assert.deepEqual(stored.get().sessions[0].coachingSuspensions, suspensions, sourceKind);
        assert.equal(stored.warnings.length, 0, "Recognized suspensions are not quarantined");
      }
    });
  }
  await test("all three executable-boundary schemas document the expanded suspension reason enum", () => {
    const expectedReasons = ["deload_changed", "readiness_changed", "exception_overridden", "exercise_substituted", "row_removed", "role_changed", "evaluation_failed", "coach_off"];
    for (const file of ["redesign-app-data.v3.schema.json", "redesign-backup.v3.schema.json", "redesign-active-draft.v2.schema.json"]) {
      const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas", file), "utf8"));
      assert.deepEqual(schema.$defs.session.properties.coachingSuspensions.items.properties.reason.enum, expectedReasons, file);
    }
  });
  await test("defaults are independent and show is downgraded behind the closed activation gate", () => {
    const defaults = plain(app.run("emptyData()"));
    assert.deepEqual(coachFacts(defaults).settings, { coachMode: "shadow", coachBetweenSetRevisions: true,
      routineIncrementUnit: null, barWeight: { lb: 45, kg: 20 },
      plateInventory: { lb: [45,35,25,10,5,2.5], kg: [25,20,15,10,5,2.5,1.25] }, equipmentCorrections: [] });
    assert.equal(app.run("effectiveCoachMode({coachMode:'show'})"), "shadow");
    assert.equal(app.run("effectiveCoachMode({coachMode:'off'})"), "off");
    assert.equal(app.run("COACH_ACTIVATION_APPROVED"), false);
    app.run("const isolatedDefaults = emptyData(); isolatedDefaults.settings.plateInventory.lb.push(1); isolatedDefaults.settings.barWeight.lb=1;");
    assert.equal(app.run("emptyData().settings.barWeight.lb"), 45);
    assert.equal(app.run("emptyData().settings.plateInventory.lb.length"), 6);
  });
  await test("real compact draft and restore preserve workout facts and app-scoped settings/skips", async () => {
    const normalized = app.normalize(fixture);
    app.set(normalized);
    app.run("activeWorkoutId = data.sessions[0].id; activeSessionId=activeWorkoutId;");
    const snapshot = plain(app.run("activeWorkoutDraftSnapshot({incrementSequence:false})"));
    assert.deepEqual(snapshot.session.coachingPrescription, fixture.sessions[0].coachingPrescription);
    assert.deepEqual(snapshot.sets.map((set) => set.completionOrder), [1, undefined]);
    const exported = backup.createBackupExport(normalized, { activeWorkoutDraft: snapshot });
    assert.deepEqual(plain(exported.activeWorkoutDraft), snapshot);
    app.assign("snapshot", snapshot);
    assert.ok(app.run("validateActiveWorkoutDraftEnvelope(snapshot,data)"));
    app.indexed.set("active-workout-draft", snapshot);
    assert.equal(await app.run("restoreActiveWorkoutDraft()"), true);
    assert.deepEqual(coachFacts(app.get()), expected);
  });
  await test("IndexedDB and localStorage fallback load preserve every S1a field", async () => {
    for (const sourceKind of ["indexed", "fallback"]) {
      const rt = runtime();
      const model = app.normalize(fixture);
      if (sourceKind === "indexed") rt.indexed.set("app-data", model);
      else {
        rt.assign("input", model);
        assert.equal(rt.run("writeLocalAppDataFallback(input)"), true);
      }
      await rt.run("loadData()");
      assert.deepEqual(coachFacts(rt.get()), expected, sourceKind);
    }
  });
  await test("invalid stored coaching is quarantined without losing observations or rewriting either store", async () => {
    for (const sourceKind of ["indexed","fallback"]) {
      const rt=runtime();
      const dirty=plain(fixture);
      dirty.sessions[0].coachingPrescription.engineVersion="invalid-local-engine";
      dirty.sessions[0].coachingSuspensions.push({scope:"exercise",exerciseId:"untrusted-name",reason:"untrusted-reason",at:"bad"});
      const raw=plain(dirty);
      if (sourceKind==="indexed") rt.indexed.set("app-data",dirty);
      else { rt.assign("input",dirty); rt.run("writeLocalAppDataFallback(input)"); }
      const localBefore=rt.storage.get(rt.run("STORAGE_KEY"));
      await rt.run("loadData()");
      const loaded=rt.get();
      for (const key of ["sessions","exercises","sets"]) assert.deepEqual(loaded[key].map((row)=>row.id),raw[key].map((row)=>row.id));
      assert.deepEqual(loaded.sets.map(({weight,reps,rpe,completed})=>({weight,reps,rpe,completed})),raw.sets.map(({weight,reps,rpe,completed})=>({weight,reps,rpe,completed})));
      assert.equal(Object.hasOwn(loaded.sessions[0],"coachingPrescription"),false);
      assert.deepEqual(loaded.sessions[0].coachingSuspensions,fixture.sessions[0].coachingSuspensions);
      assert.equal(rt.run("coachRecoveryPending"),true);
      assert.ok(rt.run("coachRecoveryDiagnostics.length")>0);
      assert.ok(rt.warnings.length>0);
      assert.ok(rt.warnings.every((message)=>!message.includes("untrusted")));
      rt.run("scheduleSave(); persistBeforeSuspend();");
      assert.equal(rt.run("persistActiveWorkoutDraft()"),false);
      assert.equal(rt.storage.get(rt.run("STORAGE_KEY")),localBefore);
      if (sourceKind==="indexed") assert.deepEqual(rt.indexed.get("app-data"),raw);
      else assert.equal(rt.indexed.has("app-data"),false,"No load-time fallback promotion");
      const sentinel=rt.get();
      assert.throws(()=>rt.import(raw));
      assert.deepEqual(rt.get(),sentinel,"User import has no partial mutation");
      assert.throws(()=>backup.createBackupExport(raw));
      rt.run("patchSetValue('coach-set-2','rpe','8',false)");
      assert.equal(rt.run("coachRecoveryPending"),false,"A real input resumes ordinary saves");
      await rt.run("saveData(); Promise.resolve()");
      assert.equal(Object.hasOwn(rt.indexed.get("app-data").sessions[0],"coachingPrescription"),false);
      assert.equal(rt.indexed.get("app-data").sets.length,raw.sets.length);
    }
  });
  await test("invalid draft coaching is quarantined without resurrecting base plans or rewriting drafts", async () => {
    const rt=runtime();
    rt.set(rt.normalize(fixture));
    rt.run("activeWorkoutId=data.sessions[0].id; activeSessionId=activeWorkoutId;");
    const draft=plain(rt.run("activeWorkoutDraftSnapshot({incrementSequence:false})"));
    draft.session.coachingPrescription.contractVersion="invalid-draft-contract";
    draft.session.coachingSuspensions.push({scope:"session",reason:"bad",at:"bad"});
    draft.sets[1].reps=11;
    rt.indexed.set("active-workout-draft",draft);
    rt.storage.set(rt.run("ACTIVE_DRAFT_KEY"),JSON.stringify(draft));
    const raw=plain(draft);
    const localBefore=rt.storage.get(rt.run("ACTIVE_DRAFT_KEY"));
    assert.equal(await rt.run("restoreActiveWorkoutDraft()"),true);
    assert.equal(rt.get().sets[1].reps,11,"Entered draft observations survive");
    assert.equal(Object.hasOwn(rt.get().sessions[0],"coachingPrescription"),false,"Base plan is not merged back");
    assert.deepEqual(rt.get().sessions[0].coachingSuspensions,fixture.sessions[0].coachingSuspensions);
    assert.deepEqual(rt.indexed.get("active-workout-draft"),raw);
    assert.equal(rt.storage.get(rt.run("ACTIVE_DRAFT_KEY")),localBefore);
    rt.run("scheduleSave(); persistBeforeSuspend();");
    assert.deepEqual(rt.indexed.get("active-workout-draft"),raw);
    assert.equal(rt.storage.get(rt.run("ACTIVE_DRAFT_KEY")),localBefore);
    assert.equal(rt.run("coachRecoveryPending"),true);
    assert.throws(()=>backup.createBackupExport(fixture,{activeWorkoutDraft:raw}));
    rt.assign("snapshot",raw);
    assert.equal(rt.run("validateActiveWorkoutDraftEnvelope(snapshot,data,{ignoreSourceRevision:true,strictCoachValidation:true})"),null);
    assert.match(source,/strictCoachValidation:\s*true/,"User-initiated draft import opts into rejection");
  });
  await test("local quarantine preserves valid plans and valid suspension entries independently", () => {
    const dirty=plain(fixture);
    dirty.sessions.push({id:"other-session",date:"2026-11-01",coachingPrescription:coach.prescribeSession({
      sessionId:"other-session",evaluationId:"other-evaluation",createdAt:"2026-11-01T18:00:00Z",date:"2026-11-01",
      exercises:[{exerciseId:"other-exercise",variantIdentity:"other:external",resistanceType:"external",targetVersion:"v1",history:[],
        roles:[{role:"straight",S:1,rMin:8,rMax:12,eMin:7,eMax:9,restSeconds:90,increment:null,defaultLoad:null,defaultReps:8}]}]
    })});
    dirty.exercises.push({id:"other-exercise",sessionId:"other-session",name:"Synthetic Other"});
    dirty.sessions[0].coachingPrescription.engineVersion="bad";
    dirty.sessions[0].coachingSuspensions.push({scope:"exercise",exerciseId:"other-exercise",reason:"row_removed",at:"2026-11-03T18:00:00Z"});
    const recovered=backup.quarantineCoachData(dirty);
    assert.equal(Object.hasOwn(recovered.model.sessions[0],"coachingPrescription"),false);
    assert.deepEqual(plain(recovered.model.sessions[1].coachingPrescription),dirty.sessions[1].coachingPrescription);
    assert.deepEqual(plain(recovered.model.sessions[0].coachingSuspensions),fixture.sessions[0].coachingSuspensions);
    assert.equal(recovered.model.exercises.length,dirty.exercises.length);
    assert.equal(dirty.sessions[0].coachingPrescription.engineVersion,"bad","Recovery does not mutate its source");
  });
  await test("an actually cross-owned plan cannot poison a valid plan's deleted IDs", () => {
    const dirty=plain(fixture);
    dirty.sets=dirty.sets.slice(0,1);
    dirty.sessions.push({id:"bad-owner",date:"2026-11-01",coachingPrescription:plain(dirty.sessions[0].coachingPrescription)});
    const recovered=backup.quarantineCoachData(dirty);
    assert.deepEqual(plain(recovered.model.sessions[0].coachingPrescription),dirty.sessions[0].coachingPrescription);
    assert.equal(Object.hasOwn(recovered.model.sessions[1],"coachingPrescription"),false);
    assert.equal(recovered.model.sessions.length,2);
    assert.throws(()=>backup.createBackupExport(dirty),/another session|another exercise/);
  });
  await test("sparse native-IDB coaching arrays are diagnosed and kept out of automatic saves", async () => {
    for (const length of [1,51]) {
      const dirty=plain(fixture);
      dirty.sessions[0].coachingSuspensions=new Array(length);
      assert.throws(()=>backup.validateCoachData(dirty),/sparse|50/);
      const rt=runtime();
      rt.indexed.set("app-data",dirty);
      await rt.run("loadData()");
      assert.deepEqual(rt.get().sessions[0].coachingSuspensions,[]);
      assert.equal(rt.run("coachRecoveryPending"),true);
      assert.equal(rt.indexed.get("app-data").sessions[0].coachingSuspensions.length,length);
      assert.equal(Object.hasOwn(rt.indexed.get("app-data").sessions[0].coachingSuspensions,0),false);
      assert.ok(rt.run("coachRecoveryDiagnostics.some(entry=>entry.code==='coach_suspension')"));
    }
  });
  await test("canonical role fields preserve units, nulls, absence and rest fallback across every strict boundary", () => {
    for (const defaults of [{defaultLoad:{value:20,unit:"kg"},defaultReps:9}, {defaultLoad:null,defaultReps:null}, {}]) {
      const model=plain(fixture);
      const role=model.templates[0].exercises[0].setTypes[0];
      delete role.defaultLoad; delete role.defaultReps; delete role.incrementUnit; delete role.restSeconds;
      Object.assign(role,defaults);
      const normalized=app.normalize(model);
      const actual=normalized.templates[0].exercises[0].setTypes[0];
      assert.deepEqual(actual.defaultLoad??null,defaults.defaultLoad??null);
      assert.deepEqual(actual.defaultReps??null,defaults.defaultReps??null);
      assert.equal(Object.hasOwn(actual,"incrementUnit"),false);
      assert.equal(actual.restSeconds,90);
      assert.equal(normalized.templates[0].exercises[0].defaultLoad,100,"Legacy scalar stays scalar");
      for (const roundTrip of [backup.createBackupExport(normalized),app.import(backup.createBackupExport(normalized))]) {
        assert.deepEqual(plain(roundTrip.templates[0].exercises[0].setTypes[0]),actual);
      }
    }
    const zeroRest=plain(fixture);
    zeroRest.templates[0].exercises[0].setTypes[0].restSeconds=0;
    assert.equal(app.normalize(zeroRest).templates[0].exercises[0].setTypes[0].restSeconds,0,"Explicit role rest takes precedence even at zero");
  });
  await test("saving workout targets preserves zero-second roles and keeps exercise-rest fallback separate", () => {
    const model=app.normalize(fixture);
    model.exercises[0].restSeconds=180;
    model.sets.forEach((set) => {
      set.targetRepMin=8; set.targetRepMax=12; set.targetRpe=9;
      delete set.targetRestSeconds;
    });
    model.sets[0].targetRestSeconds=0;
    app.set(model);
    app.run("activeWorkoutId='coach-session'; activeSessionId=activeWorkoutId; updateTemplateFromExercise('coach-exercise');");
    const saved=app.get().templates[0].exercises[0];
    assert.equal(saved.restSeconds,180,"Exercise rest remains the fallback");
    assert.deepEqual(saved.setTypes.map((role) => [role.setCount,role.restSeconds]),[[1,0],[1,180]],"Zero-rest and fallback-rest rows must not merge");
    model.sets[1].targetRestSeconds=0;
    app.set(model);
    app.run("updateTemplateFromExercise('coach-exercise')");
    assert.deepEqual(app.get().templates[0].exercises[0].setTypes.map((role) => [role.setCount,role.restSeconds]),[[2,0]]);
  });
  await test("suspension helper and direct mutator enforce scope, ownership, idempotency and session state", () => {
    const model=app.normalize(fixture);
    delete model.sessions[0].coachingSuspensions;
    model.sessions.push({id:"inactive-session",date:"2026-11-01",submitted:false});
    model.exercises.push({id:"foreign-exercise",sessionId:"inactive-session",name:"Synthetic Foreign"});
    app.set(model);
    app.run("activeWorkoutId='coach-session'; activeSessionId=activeWorkoutId;");
    assert.equal(app.run("isCoachingSuspended(data.sessions[0],'coach-exercise')"),false);
    assert.equal(app.run("suspendSessionCoaching('inactive-session',{scope:'session',reason:'readiness_changed',at:'2026-11-03T18:00:00Z'})"),false);
    assert.equal(app.run("suspendSessionCoaching('coach-session',{scope:'exercise',exerciseId:'foreign-exercise',reason:'row_removed',at:'2026-11-03T18:00:00Z'})"),false);
    assert.equal(app.run("suspendSessionCoaching('coach-session',{scope:'exercise',exerciseId:'coach-exercise',reason:'deload_changed',at:'2026-11-03T18:00:00Z'})"),true);
    assert.equal(app.run("isCoachingSuspended(data.sessions[0],'coach-exercise')"),true);
    assert.equal(app.run("isCoachingSuspended(data.sessions[0],'unrelated')"),false);
    assert.equal(app.run("suspendSessionCoaching('coach-session',{scope:'exercise',exerciseId:'coach-exercise',reason:'deload_changed',at:'2026-11-03T19:00:00Z'})"),true);
    assert.equal(app.get().sessions[0].coachingSuspensions.length,1);
    assert.equal(app.get().sessions[0].coachingSuspensions[0].at,"2026-11-03T18:00:00Z");
    assert.equal(app.run("suspendSessionCoaching('coach-session',{scope:'exercise',exerciseId:'deleted-exercise',reason:'exercise_substituted',at:'2026-11-03T18:00:00Z'})"),true);
    assert.equal(app.run("suspendSessionCoaching('coach-session',{scope:'session',reason:'exception_overridden',at:'2026-11-03T18:00:00Z'})"),true);
    assert.equal(app.run("isCoachingSuspended(data.sessions[0],'unrelated')"),true);
    const count=app.get().sessions[0].coachingSuspensions.length;
    app.run("setSessionDeload('coach-session',false)");
    assert.equal(app.get().sessions[0].coachingSuspensions.length,count+1,"S1b joins the deload trigger to the same mutation");
    assert.ok(app.get().sessions[0].coachingSuspensions.some((entry)=>entry.scope==="session" && entry.reason==="deload_changed"));
    app.run("data.sessions[0].submitted=true; data.sessions[0].workoutState='completed'; historyEditFlow={sessionId:'coach-session'};");
    assert.equal(app.run("suspendSessionCoaching('coach-session',{scope:'session',reason:'readiness_changed',at:'2026-11-03T18:00:00Z'})"),false);
    app.run("historyEditFlow=null;");
  });
  await test("bounded suspensions never evict an earlier session suspension", () => {
    const model=app.normalize(fixture);
    model.sessions[0].coachingSuspensions=[{scope:"session",reason:"deload_changed",at:"2026-11-03T18:00:00Z"},
      ...Array.from({length:49},(_,index)=>({scope:"exercise",exerciseId:"deleted-"+index,reason:"row_removed",at:"2026-11-03T18:00:00Z"}))];
    app.set(model);
    app.run("activeWorkoutId='coach-session'; activeSessionId=activeWorkoutId;");
    assert.equal(app.run("suspendSessionCoaching('coach-session',{scope:'session',reason:'readiness_changed',at:'2026-11-03T18:00:00Z'})"),false);
    assert.equal(app.get().sessions[0].coachingSuspensions.length,50);
    assert.equal(app.run("isCoachingSuspended(data.sessions[0],'anything')"),true);
  });
  await test("touched flags and clearing are independent for load, reps and RPE", () => {
    app.set(app.normalize(fixture));
    app.run("activeWorkoutId='coach-session'; activeSessionId=activeWorkoutId;");
    const before=app.get().sets[1];
    app.run("patchSetValue('coach-set-2','rpe','8.5',false)");
    const edited=app.get().sets[1];
    for (const field of ["weight","reps","loadSource","repsSource","loadTouched","repsTouched"]) assert.deepEqual(edited[field],before[field],field);
    assert.equal(edited.rpeTouched,true);
    assert.equal(edited.edited,true,"Existing shared edited consumers still see the edit");
    app.run("patchSetValue('coach-set-2','rpe','   ',false)");
    assert.equal(app.get().sets[1].rpe,"");
    assert.equal(Object.hasOwn(app.get().sets[1],"rpeSource"),false);
    for (const [field,sourceField,touchedField] of [["weight","loadSource","loadTouched"],["reps","repsSource","repsTouched"],["rpe","rpeSource","rpeTouched"]]) {
      app.run(`patchSetValue('coach-set-2','${field}','',false)`);
      assert.equal(app.get().sets[1][field],"");
      assert.equal(Object.hasOwn(app.get().sets[1],sourceField),false);
      assert.equal(app.get().sets[1][touchedField],true);
      app.run(`patchSetValue('coach-set-2','${field}','0',false)`);
      assert.equal(app.get().sets[1][field],0);
      assert.equal(app.get().sets[1][sourceField],field==="rpe"?"typed":"entered");
    }
  });
  await test("RPE-only edits cannot unprotect older entered observations during reconciliation", () => {
    const model=app.normalize(fixture);
    const sourceSet=model.sets[0];
    Object.assign(sourceSet,{weight:110,reps:12,rpe:9,completed:true,targetWeight:100,targetReps:8});
    const remaining=model.sets[1];
    Object.assign(remaining,{weight:95,reps:9,edited:true,loadSource:"entered",repsSource:"entered"});
    delete remaining.loadTouched; delete remaining.repsTouched; delete remaining.rpeTouched;
    model.exercises[0].pendingReconcile={setId:sourceSet.id,fields:["load","reps"],remainingSetCount:1};
    app.set(model);
    app.run("activeWorkoutId='coach-session'; activeSessionId=activeWorkoutId; patchSetValue('coach-set-2','rpe','8',false); reconcileCompletedSet('coach-exercise',true)");
    const after=app.get().sets[1];
    assert.equal(after.weight,95);
    assert.equal(after.reps,9);
    assert.equal(after.loadSource,"entered");
    assert.equal(after.repsSource,"entered");
  });
  await test("legacy rows acquire no coach, deload, provenance or order fields on reads", () => {
    const legacy = syntheticCoachBackup();
    for (const session of legacy.sessions) for (const key of ["isDeload", "coachingPrescription", "coachingSuspensions"]) delete session[key];
    for (const set of legacy.sets) for (const key of ["loadSource", "repsSource", "rpeSource", "loadTouched", "repsTouched", "rpeTouched", "completionOrder"]) delete set[key];
    legacy.settings = { weightUnit: "lb" };
    delete legacy.skippedSessions;
    const before = plain(legacy);
    const normalized = app.normalize(legacy);
    assert.deepEqual(legacy, before, "Input observation objects remain untouched");
    for (const session of normalized.sessions) for (const key of ["isDeload", "coachingPrescription", "coachingSuspensions"]) assert.equal(Object.hasOwn(session,key), false);
    for (const set of normalized.sets) {
      for (const key of ["loadSource", "repsSource", "rpeSource", "loadTouched", "repsTouched", "rpeTouched", "completionOrder"]) assert.equal(Object.hasOwn(set,key), false);
      app.context.row = set;
      assert.equal(app.run("setFieldProvenance(row,'rpe')"), "unknown");
      assert.equal(app.run("setFieldProvenance(row,'load')"), "unknown");
      assert.equal(Object.hasOwn(set,"rpeSource"), false);
    }
  });
  await test("first completion does not invent provenance for an unfinished legacy row", () => {
    const legacy=app.normalize(fixture);
    legacy.settings.autoStartRestTimer=false;
    for (const set of legacy.sets) {
      for (const key of ["loadSource","repsSource","rpeSource","loadTouched","repsTouched","rpeTouched","completionOrder","completedAt"]) delete set[key];
      set.completed=false;
      set.targetWeight=set.weight; set.targetReps=set.reps;
    }
    app.set(legacy);
    app.run("timer=null; completingSetIds.clear(); activeWorkoutId=data.sessions[0].id; activeSessionId=activeWorkoutId; toggleSetCompletion('coach-set-1');");
    const row=app.get().sets[0];
    assert.equal(row.completed,true);
    assert.equal(row.completionOrder,1);
    for (const key of ["loadSource","repsSource","rpeSource"]) assert.equal(Object.hasOwn(row,key),false);
  });
  await test("own, deleted and virtual prescription rows pass; cross-owned rows fail", () => {
    backup.validateCoachData(fixture);
    const virtual = plain(fixture);
    delete virtual.sessions[0].coachingPrescription;
    delete virtual.sessions[0].coachingSuspensions;
    virtual.sessions[0].coachingPrescription = coach.prescribeSession({ sessionId: "coach-session", evaluationId: "virtual", createdAt: "2026-11-02T18:00:00Z", date: "2026-11-02",
      exercises: [{ exerciseId: "coach-exercise", variantIdentity: "synthetic:external", targetVersion: "v1", resistanceType: "external", history: [],
        roles: [{ role: "straight", S: 2, rMin: 8, rMax: 12, eMin: 7, eMax: 9, restSeconds: 120, increment: null, defaultLoad: null, defaultReps: 8 }],
        sets: [{ setId: "coach-set-1", role: "straight", position: 0, sequenceIndex: 0 }] }] });
    assert.ok(virtual.sessions[0].coachingPrescription.sets.some((row) => row.setId === "coach-session:coach-exercise:straight:1"));
    backup.validateCoachData(virtual);
    const ownSession = app.normalize(virtual);
    assert.ok(app.import(backup.createBackupExport(ownSession)));
    const foreign = plain(virtual);
    foreign.sessions.push({ id: "foreign-session", date: "2026-11-01" });
    foreign.exercises.push({ id: "foreign-exercise", sessionId: "foreign-session", name: "Synthetic foreign" });
    foreign.sets.push({ id: "coach-session:coach-exercise:straight:1", exerciseId: "foreign-exercise", setNumber: 1 });
    assert.throws(() => backup.validateCoachData(foreign), /another exercise or session/);
    const deleted = plain(virtual);
    deleted.sessions[0].coachingPrescription.sets[1].setId = "deleted-actual-row";
    assert.equal(coach.validatePrescription(deleted.sessions[0].coachingPrescription).ok,true);
    backup.validateCoachData(deleted);
    const virtualPrescription = (sessionId,exerciseId) => coach.prescribeSession({
      sessionId,evaluationId:"collision",createdAt:"2026-11-02T18:00:00Z",date:"2026-11-02",
      exercises:[{exerciseId,variantIdentity:"synthetic:external",targetVersion:"v1",resistanceType:"external",history:[],
        roles:[{role:"straight",S:1,rMin:8,rMax:12,eMin:7,eMax:9,restSeconds:120,increment:null,defaultLoad:null,defaultReps:8}]}]
    });
    const collision={sessions:[{id:"a:b",coachingPrescription:virtualPrescription("a:b","c")},
      {id:"a",coachingPrescription:virtualPrescription("a","b:c")}],
    exercises:[{id:"c",sessionId:"a:b"},{id:"b:c",sessionId:"a"}],sets:[],templates:[],settings:{}};
    assert.throws(()=>backup.validateCoachData(collision),/another exercise or session/,"Missing row IDs cannot cross sessions");
  });

  const malformed = [
    ["coachMode", (m) => { m.settings.coachMode = "active"; }],
    ["revision switch", (m) => { m.settings.coachBetweenSetRevisions = 1; }],
    ["increment setting", (m) => { m.settings.routineIncrementUnit = "oz"; }],
    ["bar weights", (m) => { m.settings.barWeight.lb = -1; }],
    ["plate nonpositive", (m) => { m.settings.plateInventory.lb = [0]; }],
    ["plate duplicates", (m) => { m.settings.plateInventory.lb = [5,5]; }],
    ["plate bound", (m) => { m.settings.plateInventory.lb = Array.from({length:65},(_,i)=>i+1); }],
    ["equipment shape", (m) => { m.settings.equipmentCorrections = {}; }],
    ["equipment class", (m) => { m.settings.equipmentCorrections[0].equipmentClass = "band"; }],
    ["equipment duplicate", (m) => { m.settings.equipmentCorrections.push({...m.settings.equipmentCorrections[0]}); }],
    ["role unit", (m) => { m.templates[0].exercises[0].setTypes[0].incrementUnit = "oz"; }],
    ["role shape", (m) => { m.templates[0].exercises[0].setTypes = [null]; }],
    ["role load", (m) => { m.templates[0].exercises[0].setTypes[0].defaultLoad = -1; }],
    ["role reps", (m) => { m.templates[0].exercises[0].setTypes[0].defaultReps = 1.5; }],
    ["role rest", (m) => { m.templates[0].exercises[0].setTypes[0].restSeconds = 9000; }],
    ["schedule", (m) => { m.templates[0].scheduledWeekdays = ["monday","monday"]; }],
    ["deload", (m) => { m.sessions[0].isDeload = 1; }],
    ["engine validation", (m) => { m.sessions[0].coachingPrescription.contractVersion = "wrong"; }],
    ["suspension bound", (m) => { m.sessions[0].coachingSuspensions = Array.from({length:51},(_,index)=>({scope:"exercise",exerciseId:"deleted-"+index,reason:"row_removed",at:"2026-11-03T18:00:00Z"})); }],
    ["suspension content", (m) => { m.sessions[0].coachingSuspensions = [{}]; }],
    ["suspension timestamp", (m) => { m.sessions[0].coachingSuspensions[0].at = "2026-11-03"; }],
    ["suspension session scope", (m) => { m.sessions[0].coachingSuspensions=[{scope:"session",exerciseId:"deleted",reason:"row_removed",at:"2026-11-03T18:00:00Z"}]; }],
    ["foreign exercise", (m) => { m.exercises[0].sessionId = "foreign"; }],
    ["foreign set", (m) => { m.sets[0].exerciseId = "foreign"; }],
    ["duplicate exercise owner", (m) => { m.exercises.unshift({...m.exercises[0],sessionId:"foreign"}); }],
    ["duplicate set owner", (m) => { m.sets.unshift({...m.sets[0],exerciseId:"foreign"}); }],
    ["loadSource", (m) => { m.sets[0].loadSource = "typed"; }],
    ["repsSource", (m) => { m.sets[0].repsSource = "typed"; }],
    ["rpeSource", (m) => { m.sets[0].rpeSource = "entered"; }],
    ["loadTouched", (m) => { m.sets[0].loadTouched = 1; }],
    ["repsTouched", (m) => { m.sets[0].repsTouched = "yes"; }],
    ["rpeTouched", (m) => { m.sets[0].rpeTouched = null; }],
    ["completionOrder", (m) => { m.sets[0].completionOrder = 0; }],
    ["duplicate completionOrder", (m) => { m.sets[1].completionOrder = 1; }],
    ["completedAt", (m) => { m.sets[0].completedAt = "bad"; }],
    ["skip occurrence", (m) => { m.skippedSessions.push({...m.skippedSessions[0], id:"second-skip"}); }],
    ["skip date", (m) => { m.skippedSessions[0].date = "2026-02-30"; }],
    ["skip routine name", (m) => { m.skippedSessions[0].routineName = ""; }],
    ["skip day", (m) => { m.skippedSessions[0].dayId = "monday"; }],
    ["skip reason", (m) => { m.skippedSessions[0].reason = "tired"; }],
    ["skip note", (m) => { m.skippedSessions[0].note = "x".repeat(2001); }],
    ["skip timestamp", (m) => { m.skippedSessions[0].createdAt = "bad"; }]
  ];
  for (const [name, change] of malformed) await test("strict rejection and local observation preservation for " + name, () => {
    const candidate = plain(fixture);
    change(candidate);
    const before = plain(candidate);
    app.set(app.normalize(fixture));
    const sentinel = app.get();
    const normalized=app.normalize(candidate);
    for (const collection of ["sessions","exercises","sets"]) {
      assert.deepEqual(normalized[collection].map((record)=>record.id),candidate[collection].map((record)=>record.id),"Local recovery retains every observation row");
    }
    assert.ok(app.run("storedAppDataCandidate(input,'localstorage')"), "Local copy remains an eligible candidate");
    assert.throws(() => backup.createBackupExport(candidate), undefined, "export");
    assert.throws(() => backup.validateAndSanitizeBackup(candidate), undefined, "backup validation");
    assert.throws(() => app.import(candidate), undefined, "strict import");
    assert.deepEqual(candidate, before, "Rejected input unchanged");
    assert.deepEqual(app.get(), sentinel, "No partial application mutation");
    if (["deload","engine validation","suspension bound","suspension content","suspension timestamp","suspension session scope","loadSource","repsSource","rpeSource","loadTouched","repsTouched","rpeTouched","completionOrder","duplicate completionOrder"].includes(name)) {
      app.run("activeWorkoutId=data.sessions[0].id; activeSessionId=activeWorkoutId;");
      const draft = plain(app.run("activeWorkoutDraftSnapshot({incrementSequence:false})"));
      draft.session = candidate.sessions[0]; draft.exercises = candidate.exercises; draft.sets = candidate.sets;
      app.assign("snapshot", draft);
      assert.ok(app.run("validateActiveWorkoutDraftEnvelope(snapshot,data)"), "Local draft observations remain recoverable");
      assert.equal(app.run("validateActiveWorkoutDraftEnvelope(snapshot,data,{strictCoachValidation:true})"), null, "Explicit import draft rejects atomically");
      assert.throws(() => backup.createBackupExport(sentinel, {activeWorkoutDraft:draft}), undefined, "backup draft");
    }
  });
  await test("draft restore rejects cross-session collisions and preserves the base atomically", () => {
    app.set(app.normalize(fixture));
    app.run("activeWorkoutId=data.sessions[0].id; activeSessionId=activeWorkoutId;");
    const draft = plain(app.run("activeWorkoutDraftSnapshot({incrementSequence:false})"));
    const base = app.get();
    base.sessions.push({id:"other",date:"2026-11-01"});
    base.exercises.push({id:"other-exercise",sessionId:"other",name:"Synthetic other"});
    base.sets.push({id:"collision",exerciseId:"other-exercise",setNumber:1});
    draft.sets[1].id = "collision";
    app.assign("snapshot", draft); app.assign("base", base);
    assert.equal(app.run("validateActiveWorkoutDraftEnvelope(snapshot,base)"), null);
    assert.throws(() => backup.validateCoachDraft(draft,base), /another exercise or session/);
  });
  await test("local drafts retain known immutable completion order; imports reject conflicting order", () => {
    app.set(app.normalize(fixture));
    app.run("activeWorkoutId=data.sessions[0].id; activeSessionId=activeWorkoutId;");
    const draft = plain(app.run("activeWorkoutDraftSnapshot({incrementSequence:false})"));
    for (const order of [9,undefined]) {
      const changed = plain(draft);
      if (order === undefined) delete changed.sets[0].completionOrder;
      else changed.sets[0].completionOrder = order;
      app.assign("snapshot",changed);
      assert.equal(app.run("validateActiveWorkoutDraftEnvelope(snapshot,data).sets[0].completionOrder"),1);
      assert.equal(app.run("validateActiveWorkoutDraftEnvelope(snapshot,data,{strictCoachValidation:true})"),null);
      assert.throws(() => backup.validateCoachDraft(changed,app.get()),/completionOrder/);
    }
  });
  await test("draft recovery reserves saved completion orders before quarantining collisions without losing entered values", async () => {
    for (const reverseRows of [false,true]) {
      const rt=runtime();
      const model=rt.normalize(fixture);
      model.sets[0].reps=9;
      rt.set(model);
      rt.run("activeWorkoutId='coach-session'; activeSessionId=activeWorkoutId;");
      const draft=plain(rt.run("activeWorkoutDraftSnapshot({incrementSequence:false})"));
      draft.sets[0].completionOrder=2;
      draft.sets[0].reps=17;
      draft.sets[0].repsSource="entered";
      draft.sets[0].repsTouched=true;
      draft.sets[1].completionOrder=1;
      draft.sets[1].completed=true;
      draft.sets[1].reps=17;
      draft.sets[1].repsSource="entered";
      draft.sets[1].repsTouched=true;
      if (reverseRows) draft.sets.reverse();
      const saved=rt.get();
      const rawDraft=plain(draft);
      rt.assign("damagedDraft",draft);
      assert.equal(rt.run("validateActiveWorkoutDraftEnvelope(damagedDraft,data,{strictCoachValidation:true})"),null);
      assert.throws(() => backup.createBackupExport(saved,{activeWorkoutDraft:draft}),/completionOrder/);
      assert.throws(() => rt.import({...saved,activeWorkoutDraft:draft}),undefined,"User-initiated import rejects the damaged draft");
      assert.deepEqual(rt.get(),saved,"Rejected strict validation must not partially write");
      rt.indexed.set("active-workout-draft",draft);
      assert.equal(await rt.run("restoreActiveWorkoutDraft()"),true);
      const restored=rt.get();
      assert.equal(restored.sessions.length,saved.sessions.length);
      assert.equal(restored.exercises.length,saved.exercises.length);
      assert.equal(restored.sets.length,draft.sets.length);
      const rows=new Map(restored.sets.map((set) => [set.id,set]));
      assert.equal(rows.get("coach-set-1").completionOrder,1,"Saved order is authoritative");
      assert.equal(rows.get("coach-set-1").reps,17,"The newer typed reps on the authoritative row survive");
      assert.equal(Object.hasOwn(rows.get("coach-set-2"),"completionOrder"),false,"Only conflicting order metadata is quarantined");
      for (const set of draft.sets) {
        const {completionOrder,...entered}=set;
        for (const [field,value] of Object.entries(entered)) assert.deepEqual(rows.get(set.id)[field],value,"Draft row field survives: "+field);
      }
      assert.equal(rows.get("coach-set-2").reps,17);
      const orders=restored.sets.filter((set) => set.completionOrder != null).map((set) => set.completionOrder);
      assert.equal(new Set(orders).size,orders.length);
      backup.validateCoachData(restored);
      assert.deepEqual(rt.indexed.get("active-workout-draft"),rawDraft,"Recovery leaves the stored draft untouched");
      assert.ok(rt.run("coachRecoveryDiagnostics.some(entry=>entry.code==='coach_completion_order')"));
    }
  });
  await test("deleting prescribed rows succeeds without rewriting the prescription", () => {
    for (const exerciseRemoval of [false,true]) {
      app.set(app.normalize(fixture));
      const prescription=app.get().sessions[0].coachingPrescription;
      const candidate=app.get();
      candidate.sets=[];
      if (exerciseRemoval) candidate.exercises=[];
      app.assign("removalCandidate",candidate);
      assert.notEqual(app.run("commit(removalCandidate,false)"),false);
      assert.deepEqual(app.get().sessions[0].coachingPrescription,prescription);
      backup.validateCoachData(app.get());
      assert.ok(app.import(backup.createBackupExport(app.get())));
    }
  });
  await test("substitution preserves observations and frozen ownership while remapping active and timer rows", () => {
    app.set(app.normalize(fixture));
    const previous=app.get().sets[1];
    const prescription=app.get().sessions[0].coachingPrescription;
    app.run("activeWorkoutId='coach-session'; activeSessionId=activeWorkoutId; activeSetId='coach-set-2'; pendingNextSetId='coach-set-2'; timer={setId:'coach-set-1',exerciseId:'coach-exercise',pendingNextSetId:'coach-set-2'};");
    app.run("applyExerciseSubstitution('coach-exercise','Synthetic Replacement')");
    const model=app.get();
    const replacement=model.exercises.find((exercise)=>exercise.name==="Synthetic Replacement");
    assert.ok(replacement);
    const moved=model.sets.find((set)=>set.exerciseId===replacement.id);
    assert.ok(moved);
    assert.notEqual(moved.id,previous.id);
    for (const field of ["weight","reps","rpe","loadSource","repsSource","rpeSource","loadTouched","repsTouched","rpeTouched","completionOrder"]) assert.deepEqual(moved[field],previous[field],field);
    assert.equal(app.run("activeSetId"),moved.id);
    assert.equal(app.run("pendingNextSetId"),moved.id);
    assert.equal(app.run("timer.pendingNextSetId"),moved.id);
    assert.deepEqual(model.sessions[0].coachingPrescription,prescription);
    backup.validateCoachData(model);
    assert.ok(app.import(backup.createBackupExport(model)));
    app.run("timer=null;");
  });
  await test("coaching never blocks a defaults count reduction", () => {
    app.set(app.normalize(fixture));
    app.run("activeWorkoutId=data.sessions[0].id; activeSessionId=activeWorkoutId;");
    const before=app.get();
    const values={sets:1,"rep-min":8,"rep-max":12,"target-rpe-min":7,"target-rpe-max":9,"working-rest":120,"warmup-rest":90};
    app.context.form={querySelector(selector) { const field=selector.match(/data-default-field="([^"]+)"/)?.[1]; return field?{value:String(values[field])}:null; },querySelectorAll:()=>[]};
    app.context.notices=[];
    app.run("showAppToast=(message)=>notices.push(message);");
    assert.notEqual(app.run("applyExerciseDefaultTargets('coach-exercise',form)"),false);
    assert.equal(app.get().sets.length,1);
    assert.deepEqual(app.get().sessions[0].coachingPrescription,before.sessions[0].coachingPrescription);
    backup.validateCoachData(app.get());
    assert.ok(app.context.notices.some((message)=>message.includes("targets applied")));
    app.run("showAppToast=()=>{};");
  });
  await test("injury skips are guarded occurrences without workout, grade, PR or progress facts", () => {
    const model = app.normalize(fixture);
    model.skippedSessions=[];
    app.set(model);
    app.run("activeWorkoutId=''; activeSessionId=''; historyEditFlow=null;");
    const factsBefore=app.get();
    assert.equal(app.run("recordInjurySkip('coach-routine','2001-01-01')"),false);
    assert.equal(app.run("recordInjurySkip('unknown',todayIso())"),false);
    const record = plain(app.run("recordInjurySkip('coach-routine',todayIso())"));
    assert.equal(record.reason,"injury");
    assert.equal(app.run("recordInjurySkip('coach-routine',todayIso())"),false);
    const factsAfter=app.get();
    for (const key of ["sessions","exercises","sets","templates"]) assert.deepEqual(factsAfter[key],factsBefore[key],key);
    app.context.skipId=record.id;
    assert.equal(app.run("undoInjurySkip(skipId)"),true);
    assert.deepEqual(app.get().skippedSessions,[]);
    app.run("recordInjurySkip('coach-routine',todayIso()); data.skippedSessions[0].date='2001-01-01';");
    assert.equal(app.run("undoInjurySkip(data.skippedSessions[0].id)"),false);
    app.run("historyEditFlow={sessionId:'coach-session'};");
    assert.equal(app.run("recordInjurySkip('coach-routine',todayIso())"),false,"Direct mutator guard");
    app.run("historyEditFlow=null;");
    app.assign("schedule", {templates:[{id:"later",scheduledWeekdays:["monday"]},{id:"next",scheduledWeekdays:["friday"]}]});
    assert.deepEqual(plain(app.run("nextScheduledWorkoutOccurrence(schedule,new Date(2026,10,3))")),{date:"2026-11-06",routines:[{id:"next",scheduledWeekdays:["friday"]}]});
    assert.equal(record.routineName,model.templates[0].name);
    assert.doesNotMatch(source,/has recorded injury skips and cannot be deleted/);
  });
  await test("runtime completion assigns order once; input provenance and history-aware deload preserve frozen data", () => {
    const model = app.normalize(fixture);
    model.settings.autoStartRestTimer=false;
    model.sets.forEach((set) => { set.completed=false; delete set.completionOrder; delete set.completedAt; });
    app.set(model);
    app.run("timer=null; activeWorkoutId=data.sessions[0].id; activeSessionId=activeWorkoutId; activeSetId=data.sets[1].id;");
    app.run("toggleSetCompletion('coach-set-2')");
    assert.equal(app.get().sets[1].completionOrder,1);
    app.run("completingSetIds.clear(); toggleSetCompletion('coach-set-2')");
    assert.equal(app.get().sets[1].completed,false,"Reopen executed");
    app.run("completingSetIds.clear(); toggleSetCompletion('coach-set-2')");
    assert.equal(app.get().sets[1].completed,true,"Re-completion executed");
    assert.equal(app.get().sets[1].completionOrder,1);
    app.run("patchSetValue('coach-set-2','rpe','8.5',false); patchSetValue('coach-set-2','reps','0',false); patchSetValue('coach-set-2','weight','0',false)");
    assert.equal(app.get().sets[1].rpeSource,"typed");
    assert.equal(app.get().sets[1].loadSource,"entered");
    assert.equal(app.get().sets[1].repsSource,"entered");
    app.run("patchSetValue('coach-set-2','rpe','',false); patchSet('coach-set-2',{completionOrder:99},false)");
    assert.equal(Object.hasOwn(app.get().sets[1],"rpeSource"),false);
    assert.equal(app.get().sets[1].completionOrder,1);
    const frozen = app.get().sessions[0].coachingPrescription;
    assert.equal(app.run("setSessionDeload('coach-session',false)"),true);
    assert.deepEqual(app.get().sessions[0].coachingPrescription,frozen);
    app.run("activeWorkoutId=''; activeSessionId='coach-session'; data.sessions[0].submitted=true; data.sessions[0].workoutState='completed';");
    assert.equal(app.run("setSessionDeload('coach-session',true)"),false);
    app.run("historyEditFlow={sessionId:'coach-session'};");
    assert.equal(app.run("setSessionDeload('coach-session',true)"),true);
    assert.deepEqual(app.get().sessions[0].coachingPrescription,frozen);
    assert.equal(app.run("historyEditFlow.dirty"),true);
    app.run("historyEditFlow=null;");
  });
  await test("all automatic actual-RPE writers are removed while explicit observations survive", () => {
    app.set(app.normalize(fixture));
    app.context.previous = {weight:100,reps:10,rpe:9,completed:false};
    assert.equal(app.run("createSet('coach-exercise',3,previous).rpe"), "", "createSet");
    const copied = plain(app.run("createSet('coach-exercise',3,{weight:105,reps:11,targetWeight:100,targetReps:10,loadSource:'entered',repsSource:'entered'})"));
    assert.deepEqual([copied.weight,copied.reps,copied.targetWeight,copied.targetReps],["","",100,10],"New rows preserve targets without copying actuals");
    assert.equal(copied.loadSource,undefined,"Load provenance starts only on entry or acceptance");
    assert.equal(copied.repsSource,undefined,"Rep provenance starts only on entry or acceptance");
    const snippets = (name) => {
      const start = source.search(new RegExp("function " + name + "\\("));
      assert.notEqual(start,-1);
      const tail = source.slice(start + 9);
      const end = tail.search(/\n {6}(?:async )?function /);
      return source.slice(start,start+9+(end<0?tail.length:end));
    };
    assert.match(snippets("factualSetPrefillForWorkoutStart"), /rpe:\s*""/, "routine start");
    assert.doesNotMatch(snippets("applyExerciseDefaultTargets"), /rpe:\s*target\.targetRpeMax/, "exercise defaults");
    assert.doesNotMatch(snippets("reconcileCompletedSet"), /patch\.rpe\s*=|rpe:\s*source\.rpe/, "Apply to remaining");
    assert.match(snippets("applyExerciseSubstitution"), /createSet\(/, "substitution uses blank-RPE constructor");
    assert.doesNotMatch(snippets("applyExerciseSubstitution"), /\brpe:\s*source\./, "substitution never copies target RPE into an actual");
    assert.doesNotMatch(snippets("addWarmupSet"), /rpe:\s*5/, "warm-up");
    assert.match(snippets("addSet"), /createSet\(/, "duplicate uses blank-RPE constructor");
    assert.equal(app.get().sets[0].rpe,10,"Entered actual is retained");
    app.run("activeWorkoutId=data.sessions[0].id; activeSessionId=activeWorkoutId;");
    app.run("addSet('coach-exercise',true)");
    assert.equal(app.get().sets.at(-1).rpe,"","duplicate runtime");
    assert.equal(Object.hasOwn(app.get().sets.at(-1),"completionOrder"),false);
    app.run("addWarmupSet('coach-exercise')");
    assert.equal(app.get().sets.at(-1).rpe,"","warm-up runtime");
  });
  await test("the four protected coach files retain their initial SHA256 digests", () => {
    const hashes = {
      "coach-engine.js": "4f59199a598977aa8a80831c8da33a8c68b637fefbb2914962e26749d58a052f",
      "scripts/test-coach-engine.js": "4c0a947bab70c3bfc7aa416c9c3a7adb5dc8f82b432d7e2562b765d27d86e87d",
      "scripts/coach-replay.js": "5c20bbd11b89ec9c4c8ff32d9cd5dc64a10bbc0083b88f10d36ef21fad5982cd",
      "scripts/test-coach-replay.js": "b2fe715d9a093718c22edb9901ab9a3b3e4cfbab1d5ca17b7b9b1e43aabdf09a"
    };
    for (const [file, hash] of Object.entries(hashes)) assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(root,file))).digest("hex"),hash,file);
  });
  console.log(`Coach data contract passed (${assertions} contract groups).`);
}

main().catch((error) => { console.error(error); process.exitCode=1; });
