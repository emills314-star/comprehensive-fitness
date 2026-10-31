const fs = require("fs");
const assert = require("assert");
const { readApplicationContractSource } = require("./read-application-contract-source");

const html = readApplicationContractSource();

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
assert.match(html, /'<label class="field alert-setting-field '/, "The shared alert setting renderer owns the migrated field markup");
assert.match(html, /class="toggle ' \+ \(selected \? 'on' : ''\)[\s\S]*data-action="' \+ action[\s\S]*class="setting-state"/, "Every alert field keeps its operable toggle and explicit state label");
assert.doesNotMatch(html, /\.alert-setting-card\.selected\s*\{\s*background:\s*var\(--current\)/, "Enabled alert settings must not return to the superseded filled-card treatment");
assert.match(html, /data-action="toggle-rest-notifications"/, "Lift exposes the canonical rest-notification control");
assert.match(html, /inAppRestAlerts/, "In-app alerts are persisted in the canonical settings object");
assert.match(html, /timerCompleteNotice = data\.settings\.inAppRestAlerts !== false/, "In-app completion behavior follows the canonical setting");
assert.match(html, /Foreground completion sound confirmed/, "Sound testing produces a visible confirmed state");
const resolvedActionSource = extractFunction("renderResolvedAction");
const setRendererSource = extractFunction("renderSet");
assert.match(resolvedActionSource, /if \(!resolvedAction \|\| resolvedAction\.outcome !== "action"\) return ""/, "The exception renderer remains silent when the canonical resolver produced no action");
assert.match(resolvedActionSource, /resolvedAction\.action\?\.code[\s\S]*resolvedAction\.reasonCodes/, "Visible exception guidance must come from the canonical resolved action");
assert.doesNotMatch(resolvedActionSource, /confidence|evidence|matrix|qualification/i, "Visible exception guidance must not expose legacy confidence or evidence details");
assert.doesNotMatch(html, /function renderRolePrescriptionDetails\(/, "The deleted role-level prescription evidence renderer must not return");
assert.doesNotMatch(setRendererSource, /set-progress-disclosure|Progress when/, "Normal set rows must not expose recommendation-era progression rationale");
assert.match(setRendererSource, /class="set-tools-disclosure"/, "Secondary set controls remain available through one compact native disclosure");
assert.match(html, /class="discard-workout-button"[^>]*>\$\{replacement \? "Replace workout" : "Discard workout"\}</, "Cancellation uses explicit discard or replacement wording");
assert.match(html, /unsubmitted session will be permanently removed[\s\S]*Submitted history and routines stay intact/, "Cancellation must name permanent session loss and distinguish submitted history and routines that remain");
assert.match(html, /data-action="keep-workout"/, "The safe cancellation action remains available");
assert.doesNotMatch(html, /data-action="keep-workout" autofocus/, "The cancellation sheet must open at the warning instead of auto-scrolling to its actions");
assert.match(html, /cancelRestPush\(previousTimer, "workout-canceled"\)/, "Discarding a workout still cancels scheduled rest alerts");
assert.match(html, /data\.sessions\.filter\(\(item\) => item\.id !== session\.id\)/, "Discard removes only the active draft");

console.log("Rep-range, role progression, alert-state, and cancellation tests passed.");
