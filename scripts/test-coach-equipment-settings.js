"use strict";

const assert = require("node:assert/strict");
const { runtime, factualModel } = require("./test-loaded-bar-table");
const backup = require("../backup-contract");
const tests = [];
const plain = (value) => JSON.parse(JSON.stringify(value));
function test(name, fn) { tests.push({ name, fn }); }
function settingsApp(show = false) {
  const app = runtime({ show });
  app.context.matchMedia = () => ({ matches: false });
  app.set(factualModel(app));
  app.run("activeTab='settings'; saveData=()=>{ this.testSaved=structuredClone(data); return true; }");
  return app;
}
function persisted(app) {
  const model = app.get();
  assert.deepEqual(plain(app.context.testSaved.settings), model.settings);
  backup.validateCoachData(model);
  app.assign("savedSettingsModel", model);
  assert.deepEqual(plain(app.run("normalizeLoadedData(savedSettingsModel).settings")), model.settings);
}

test("Coach defaults, labelled controls and the disabled activation choice render in Settings", () => {
  const app = settingsApp();
  const html = app.run("renderS4bSettings()");
  assert.match(html, /id="s4b-coach-settings"/);
  assert.match(html, /id="s4b-equipment-settings"/);
  assert.match(html, /Shadow \(learning, targets hidden\)/);
  assert.match(html, /<option value="show" disabled>Show coach targets \(experimental\)<\/option>/);
  assert.match(html, /Available after the coach is calibrated on your history\./);
  assert.match(html, /Routine increments are in/);
  assert.match(html, /Used for load steps in routines that don't say their unit\./);
  assert.match(html, /Pick equipment from an exercise's menu during a workout\./);
  for (const action of ["coach-mode", "coach-between-set-revisions", "routine-increment-unit", "equipment-bar-weight", "equipment-plate", "equipment-reset-plates"]) assert.ok(html.includes('data-action="' + action + '"'), action);
  assert.ok(html.indexOf('id="s4b-coach-settings"') < html.indexOf('settings-weight-unit'));
  assert.match(app.run("renderView()"), /id="s4b-coach-settings"/);
});

test("Mode rejects show with the closed gate, persists shadow/off, and honors an opened test gate", () => {
  const app = settingsApp();
  for (const mode of ["invalid", "show", null, 0]) assert.equal(app.run("setCoachModeSetting(" + JSON.stringify(mode) + ")"), false);
  assert.equal(app.get().settings.coachMode, "shadow");
  assert.equal(app.run("setCoachModeSetting('off')"), true); persisted(app);
  assert.equal(app.run("setCoachModeSetting('shadow')"), true); persisted(app);
  const open = settingsApp(true);
  assert.equal(open.run("setCoachModeSetting('show')"), true); persisted(open);
  assert.match(open.run("renderCoachAndEquipmentSettings()"), /<option value="show" selected>/);
});

test("Between-set changes and explicit routine units validate and persist without changing targets", () => {
  const app = settingsApp();
  const templates = app.get().templates;
  for (const value of [false, true]) {
    assert.equal(app.run("setCoachBetweenSetRevisions(" + value + ")"), true); persisted(app);
    assert.equal(app.get().settings.coachBetweenSetRevisions, value);
  }
  assert.equal(app.run("setCoachBetweenSetRevisions('false')"), false);
  for (const value of ["lb", "kg", null]) {
    assert.equal(app.run("setRoutineIncrementUnit(" + JSON.stringify(value) + ")"), true); persisted(app);
    assert.equal(app.get().settings.routineIncrementUnit, value);
  }
  for (const value of ["", "lbs", "unknown", 0]) assert.equal(app.run("setRoutineIncrementUnit(" + JSON.stringify(value) + ")"), false);
  assert.deepEqual(app.get().templates, templates);
});

test("Bar weights reject blank, non-finite and negative values; zero and decimals persist per unit", () => {
  const app = settingsApp();
  for (const source of ["''", "'   '", "'bad'", "NaN", "Infinity", "-1", "null", "true", "{}"] ) assert.equal(app.run("setEquipmentBarWeight('lb'," + source + ")"), false, source);
  assert.equal(app.run("setEquipmentBarWeight('stone','45')"), false);
  assert.equal(app.run("setEquipmentBarWeight('lb','0')"), true); persisted(app);
  assert.equal(app.get().settings.barWeight.lb, 0);
  assert.equal(app.get().settings.barWeight.kg, 20);
  assert.equal(app.run("setEquipmentBarWeight('kg','15.5')"), true); persisted(app);
  assert.deepEqual(app.get().settings.barWeight, { lb: 0, kg: 15.5 });
});

test("Every standard plate toggles independently and Reset to standard restores each unit", () => {
  const app = settingsApp();
  for (const unit of ["lb", "kg"]) {
    const standard = app.get().settings.plateInventory[unit];
    const other = unit === "lb" ? "kg" : "lb";
    const untouched = app.get().settings.plateInventory[other];
    for (const plate of standard) {
      assert.equal(app.run("toggleEquipmentPlate('" + unit + "'," + plate + ")"), true); persisted(app);
      assert.equal(app.get().settings.plateInventory[unit].includes(plate), false);
      assert.equal(app.run("toggleEquipmentPlate('" + unit + "','" + plate + "')"), true); persisted(app);
      assert.equal(app.get().settings.plateInventory[unit].includes(plate), true);
    }
    app.run("toggleEquipmentPlate('" + unit + "'," + standard[0] + ")");
    assert.equal(app.run("resetEquipmentPlates('" + unit + "')"), true); persisted(app);
    assert.deepEqual(app.get().settings.plateInventory[unit], standard);
    assert.deepEqual(app.get().settings.plateInventory[other], untouched);
  }
  for (const source of ["-1", "0", "3", "NaN", "Infinity", "'bad'"]) assert.equal(app.run("toggleEquipmentPlate('lb'," + source + ")"), false);
  assert.equal(app.run("toggleEquipmentPlate('stone',45)"), false);
  assert.equal(app.run("resetEquipmentPlates('stone')"), false);
});

test("Saved equipment corrections show exact exercise names, Change validates, and Reset removes only that key", () => {
  const app = settingsApp();
  app.run("this.correctionId=coachVariantIdentity(data.templates[0].exercises[0]); data.settings.equipmentCorrections=[{exerciseIdentity:correctionId,equipmentClass:'barbell'},{exerciseIdentity:'deleted:lift|external',equipmentClass:'generic'}]");
  const html = app.run("renderCoachAndEquipmentSettings()");
  assert.ok(html.includes(app.get().templates[0].exercises[0].name));
  assert.match(html, />Barbell<\/span>/);
  assert.match(html, />Change<\/summary>/);
  assert.match(html, /data-action="equipment-correction-reset"/);
  assert.match(html, /deleted:lift/);
  assert.equal(app.run("changeSavedEquipmentCorrection(correctionId,'plate_loaded')"), true); persisted(app);
  assert.equal(app.get().settings.equipmentCorrections[1].equipmentClass, "generic");
  assert.equal(app.run("changeSavedEquipmentCorrection(correctionId,'invalid')"), false);
  assert.equal(app.run("changeSavedEquipmentCorrection('unknown','stack')"), false);
  assert.equal(app.run("changeSavedEquipmentCorrection(correctionId,'')"), true); persisted(app);
  assert.deepEqual(app.get().settings.equipmentCorrections, [{ exerciseIdentity: "deleted:lift|external", equipmentClass: "generic" }]);
});

test("Settings mutations enforce direct guards and cannot write unrelated or invalid setting fields", () => {
  const app = settingsApp();
  const before = app.get();
  for (const block of ["activeTab='today'", "historyEditFlow={sessionId:'history'}", "historyEditStartPending=true", "importInProgress=true"]) {
    app.run("activeTab='settings'; historyEditFlow=null; historyEditStartPending=false; importInProgress=false;" + block);
    for (const mutation of ["setCoachModeSetting('off')", "setCoachBetweenSetRevisions(false)", "setRoutineIncrementUnit('kg')", "setEquipmentBarWeight('lb',35)", "toggleEquipmentPlate('lb',45)", "resetEquipmentPlates('lb')"]) assert.equal(app.run(mutation), false, block + mutation);
    assert.deepEqual(app.get(), before);
  }
  app.run("activeTab='settings';historyEditFlow=null;historyEditStartPending=false;importInProgress=false");
  for (const mutation of ["commitCoachSettingsPatch('unknown',{coachMode:'off'})", "commitCoachSettingsPatch('coach-mode',{coachMode:'show'})", "commitCoachSettingsPatch('coach-mode',{weightUnit:'invalid'})", "commitCoachSettingsPatch('coach-mode',{coachMode:'off',routineIncrementUnit:'kg'})", "commitCoachSettingsPatch('equipment-bar-weight',{barWeight:{lb:-1,kg:20}})"]) assert.equal(app.run(mutation), false, mutation);
  assert.deepEqual(app.get(), before);
});

module.exports = { settingsApp, tests };
if (require.main === module) {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { fn(); console.log("PASS " + name); }
    catch (error) { failed++; console.error("FAIL " + name + "\n" + error.stack); }
  }
  if (failed) { console.error("Coach and equipment settings tests failed: " + failed + "/" + tests.length + " groups."); process.exitCode = 1; }
  else console.log("Coach and equipment settings tests passed: " + tests.length + " groups.");
}
