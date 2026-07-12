const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync("index.html", "utf8");

function extractFunction(name) {
  const marker = "function " + name + "(";
  const start = html.indexOf(marker);
  assert(start >= 0, "Missing function " + name);
  const paramsStart = html.indexOf("(", start);
  let paramsDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < html.length; index += 1) {
    if (html[index] === "(") paramsDepth += 1;
    if (html[index] === ")") paramsDepth -= 1;
    if (paramsDepth === 0) { paramsEnd = index; break; }
  }
  const bodyStart = html.indexOf("{", paramsEnd);
  let bodyDepth = 0;
  for (let index = bodyStart; index < html.length; index += 1) {
    if (html[index] === "{") bodyDepth += 1;
    if (html[index] === "}") bodyDepth -= 1;
    if (bodyDepth === 0) return html.slice(start, index + 1);
  }
  throw new Error("Unclosed function " + name);
}

const prescriptionRuntime = new Function(`
  const data = { settings: { weightUnit: "lb" } };
  const setTypeLabels = { top: "Top set", backoff: "Back-off set", straight: "Working set", drop: "Drop set", deload: "Deload set", technique: "Technique set", warmup: "Warm-up set" };
  ${extractFunction("normalizeCanonicalSetType")}
  ${extractFunction("exerciseKey")}
  ${extractFunction("resistanceLoad")}
  ${extractFunction("formatLoadNumber")}
  ${extractFunction("roundLoadForUnit")}
  ${extractFunction("normalizeSetTypeCode")}
  ${extractFunction("targetRangeText")}
  ${extractFunction("progressionProfileForExercise")}
  ${extractFunction("resolveProgrammedRepRange")}
  ${extractFunction("normalizeTargetSetType")}
  ${extractFunction("setRoleDefaultsForExercise")}
  ${extractFunction("progressionRuleForTargetSet")}
  ${extractFunction("roundEquipmentLoad")}
  ${extractFunction("previousComparableSetForRole")}
  ${extractFunction("setPrescriptionForRole")}
  return { progressionProfileForExercise, resolveProgrammedRepRange, normalizeTargetSetType, setRoleDefaultsForExercise, progressionRuleForTargetSet, setPrescriptionForRole };
`)();

const accidentalExact = prescriptionRuntime.resolveProgrammedRepRange({ repMin: 10, repMax: 10 }, { repMin: 8, repMax: 10 });
assert.deepStrictEqual([accidentalExact.repMin, accidentalExact.repMax], [8, 10], "A prior 10 must not become 10-10");
const explicitExact = prescriptionRuntime.resolveProgrammedRepRange({ repMin: 10, repMax: 10, exactReps: true }, { repMin: 8, repMax: 10 });
assert.deepStrictEqual([explicitExact.repMin, explicitExact.repMax], [10, 10], "Exact reps require an explicit flag");
const explicitRange = prescriptionRuntime.resolveProgrammedRepRange({ repMin: 6, repMax: 8 }, { repMin: 8, repMax: 12 });
assert.deepStrictEqual([explicitRange.repMin, explicitRange.repMax], [6, 8], "Explicit set ranges take priority");
const weakStrongRange = prescriptionRuntime.resolveProgrammedRepRange({ repMin: 9, repMax: 10, rangeSource: "strong-history" }, { repMin: 8, repMax: 12 });
assert.deepStrictEqual([weakStrongRange.repMin, weakStrongRange.repMax], [8, 12], "Narrow Strong history must not override the program");
const reversedRange = prescriptionRuntime.resolveProgrammedRepRange({ repMin: 12, repMax: 8, exactReps: true }, {});
assert.deepStrictEqual([reversedRange.repMin, reversedRange.repMax], [8, 12], "Invalid bounds are normalized");

const legPressProfile = prescriptionRuntime.progressionProfileForExercise("Leg Press");
assert.deepStrictEqual(legPressProfile.roleRanges.top, [8, 10]);
assert.deepStrictEqual(legPressProfile.roleRanges.backoff, [10, 15]);
const curlProfile = prescriptionRuntime.progressionProfileForExercise("Lying Leg Curl");
assert.deepStrictEqual(curlProfile.roleRanges.top, [8, 12]);
assert.deepStrictEqual(curlProfile.roleRanges.backoff, [10, 15]);
const curlTop = prescriptionRuntime.setRoleDefaultsForExercise({ name: "Lying Leg Curl", targetRpe: 8.5, increment: 5 }, "top", curlProfile, "normal", 8.5, 90);
const curlBackoff = prescriptionRuntime.setRoleDefaultsForExercise({ name: "Lying Leg Curl", targetRpe: 8.5, increment: 2.5 }, "backoff", curlProfile, "normal", 8.5, 90);
assert(curlBackoff.rpeMax < curlTop.rpeMax, "Back-off RPE must not exceed the top set by default");
assert.match(prescriptionRuntime.progressionRuleForTargetSet({ type: "top", repMin: 8, repMax: 10, rpeMin: 8, rpeMax: 9 }), /10 reps without exceeding RPE 8-9/);

const target = { mode: "normal", sets: 2, reps: 10, repLow: 8, repHigh: 10, weight: 105, rpe: 8.5, restSeconds: 90, increment: 5, resistanceType: "external", confidence: "high" };
const top = prescriptionRuntime.setPrescriptionForRole({ templateExercise: { name: "Leg Press", increment: 5 }, target, setType: { ...curlTop, type: "top", repMin: 10, repMax: 10, exactReps: false, increment: 5, progressionRule: "" }, previousSets: [{ setType: "top", setTypeIndex: 0, reps: 10, weight: 105, rpe: 8 }] });
assert.deepStrictEqual([top.repMin, top.repMax], [8, 10], "Achieved reps select a target inside the range without collapsing it");
assert.strictEqual(top.nextLoad, 110);
assert.match(top.progressionRule, /top of the programmed range|10 reps/i);
const backoff = prescriptionRuntime.setPrescriptionForRole({ templateExercise: { name: "Lying Leg Curl", increment: 5 }, target, setType: { ...curlBackoff, type: "backoff", increment: 2.5, loadReductionMin: 10, loadReductionMax: 20 }, previousSets: [{ setType: "backoff", setTypeIndex: 0, reps: 9, weight: 90, rpe: 8 }] });
assert.strictEqual(backoff.increment, 2.5, "Back-off increments are role-specific");
assert.strictEqual(backoff.nextLoad % 2.5, 0, "Role increments respect equipment steps");
assert(backoff.repMax > backoff.repMin);

const alertsRuntime = new Function(`
  let data = { settings: {} };
  let pushIdentity = null;
  let standalone = true;
  let ios = true;
  const window = { Notification: true, PushManager: true };
  const navigator = { serviceWorker: {}, vibrate() {} };
  const Notification = { permission: "default" };
  function isStandalonePwa() { return standalone; }
  function isIosDevice() { return ios; }
  ${extractFunction("restAlertState")}
  return {
    run(settings, options = {}) {
      data.settings = settings;
      pushIdentity = options.pushIdentity || null;
      standalone = options.standalone !== false;
      ios = options.ios !== false;
      Notification.permission = options.permission || "default";
      if (options.vibrationSupported === false) delete navigator.vibrate; else navigator.vibrate = function () {};
      return restAlertState();
    }
  };
`)();

const fullyEnabled = alertsRuntime.run({ timerNotifications: true, timerSound: true, setupSoundConfirmed: true, inAppRestAlerts: true, timerVibration: true }, { permission: "granted", pushIdentity: { status: "enabled" } });
assert.strictEqual(fullyEnabled.label, "Fully enabled");
assert.strictEqual(fullyEnabled.lockScreenReady, true);
const allOff = alertsRuntime.run({ timerNotifications: false, timerSound: false, inAppRestAlerts: false, timerVibration: false }, { permission: "granted" });
assert.strictEqual(allOff.label, "Disabled");
const denied = alertsRuntime.run({ timerNotifications: true, timerSound: true, inAppRestAlerts: true, timerVibration: true }, { permission: "denied" });
assert.strictEqual(denied.label, "Permission denied");
const unsupportedVibration = alertsRuntime.run({ timerNotifications: false, timerSound: true, inAppRestAlerts: true, timerVibration: true }, { vibrationSupported: false });
assert.strictEqual(unsupportedVibration.label, "Partially enabled");
assert.strictEqual(unsupportedVibration.vibrationSupported, false);

assert.match(html, /function renderAlertSetting\(/, "Alert settings use one selected-state component");
assert.match(html, /'<label class="alert-setting-card '/, "The shared alert setting renderer owns the card markup");
assert.match(html, /\.alert-setting-card\.selected \{ background: var\(--current\)/, "Enabled alert controls use the CF blue");
assert.match(html, /data-action="toggle-rest-notifications"/, "Lift exposes the canonical rest-notification control");
assert.match(html, /inAppRestAlerts/, "In-app alerts are persisted in the canonical settings object");
assert.match(html, /timerCompleteNotice = data\.settings\.inAppRestAlerts !== false/, "In-app completion behavior follows the canonical setting");
assert.match(html, /Foreground completion sound confirmed/, "Sound testing produces a visible confirmed state");
assert.match(html, /class="role-progression-facts"/, "Role details separate confidence, target reps, and next increment");
assert.match(html, /class="set-progress-rule"/, "Set rows show a distinct progression rule");
assert.match(html, /class="discard-workout-button"[^>]*>Discard Workout</, "Cancellation uses the polished concise destructive action");
assert.match(html, /Your unsaved sets, notes, timer state, and session progress will be discarded/, "Cancellation warning explains the impact");
assert.match(html, /data-action="keep-workout"/, "The safe cancellation action remains available");
assert.doesNotMatch(html, /data-action="keep-workout" autofocus/, "The cancellation sheet must open at the warning instead of auto-scrolling to its actions");
assert.match(html, /cancelRestPush\(previousTimer, "workout-canceled"\)/, "Discarding a workout still cancels scheduled rest alerts");
assert.match(html, /data\.sessions\.filter\(\(item\) => item\.id !== session\.id\)/, "Discard removes only the active draft");

console.log("Rep-range, role progression, alert-state, and cancellation tests passed.");
