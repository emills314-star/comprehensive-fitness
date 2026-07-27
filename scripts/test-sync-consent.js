const assert = require("node:assert/strict");
const fs = require("node:fs");
const { deleteWorkoutData, scanKeys } = require("../api/_lib/installation-data");
const { readApplicationContractSource } = require("./read-application-contract-source");

const html = readApplicationContractSource();
const workoutApi = fs.readFileSync("api/sync/workout.js", "utf8");
const consentApi = fs.readFileSync("api/sync/consent.js", "utf8");
const authorizeApi = fs.readFileSync("api/sync/authorize.js", "utf8");
const pushRevokeApi = fs.readFileSync("api/push/revoke.js", "utf8");
const installationRevokeApi = fs.readFileSync("api/installation/revoke.js", "utf8");
const keyContracts = fs.readFileSync("api/_lib/keys.js", "utf8");
const pushScheduleApi = fs.readFileSync("api/push/schedule.js", "utf8");
const pushDeliverApi = fs.readFileSync("api/push/deliver.js", "utf8");
const privacyPage = fs.readFileSync("privacy.html", "utf8");

assert.match(html, /workoutCloudSync: false/, "Workout cloud copy must default off");
assert.match(html, /Optional workout cloud copy/, "Settings must expose a separate explicit cloud-copy control");
assert.match(html, /active, unsubmitted workout[\s\S]*every associated exercise and set object/, "Settings must disclose that consented cloud copy can upload the full active session graph");
assert.doesNotMatch(html, /Stores submitted workout copies/, "Settings must not imply cloud uploads are limited to submitted workouts");
assert.match(html, /Cloud copy is not a backup[\s\S]*no cloud-history or restore endpoint/, "Settings must state that write-only cloud copy is not recoverable backup");
assert.match(html, /Private changes the visible notification body only[\s\S]*exercise name[\s\S]*server-side timer record/, "Settings must disclose the server-side notification fields retained in private-body mode");
assert.match(html, /function queueActiveWorkoutSync[\s\S]*?cloudWorkoutSyncConsent === true/, "Submission must not queue without canonical consent");
assert.match(html, /activeWorkoutSession\(\)[\s\S]*const payload = \{[\s\S]*session,[\s\S]*exercises,[\s\S]*sets:/, "Cloud copy must remain documented against the implementation that selects an active session and its complete exercise/set graph");
assert.match(html, /function flushWorkoutSyncQueue[\s\S]*?cloudWorkoutSyncConsent === true/, "Queued mutations must not flush without canonical consent");
assert.doesNotMatch(html.match(/async function registerPushSubscription[\s\S]*?\n      \}/)?.[0] || "", /flushWorkoutSyncQueue/, "Push registration must not activate workout upload");
assert.match(html, /function setCloudWorkoutSyncConsent[\s\S]*?clearWorkoutSyncQueue[\s\S]*?api\/sync\/consent/, "Disabling consent must stop pending uploads and revoke server consent");
assert.match(html, /commitConsent\(true, false\)[\s\S]*await writeIndexedValue\("app-data", data\)[\s\S]*render\(\)/, "Enabling consent must stay visually pending until the durable app-data write succeeds");
assert.match(html, /reconcileWorkoutSyncConsent\(\)/, "Legacy implicit uploads must be revoked on startup/online reconciliation");
assert.match(html, /permanentlyClearLocalData[\s\S]*?deleteRemoteInstallationData/, "Local clearing must delete remote installation data before discarding authorization");

assert.match(workoutApi, /installation\.syncConsent !== "1"/, "The server must enforce consent independently of the client");
assert.match(keyContracts, /workout:\s*90 \* 24 \* 60 \* 60/, "Workout copies must have a 90-day retention limit");
assert.match(workoutApi, /MAX_WORKOUT_BYTES = 256 \* 1024[\s\S]*validateJsonRequest\(req, MAX_WORKOUT_BYTES\)/, "Workout copies must have a server-enforced payload limit");
assert.match(pushScheduleApi, /exerciseName:[\s\S]*messageDetail:/, "The notification timer record must retain exercise name independently of visible-body detail");
assert.match(pushDeliverApi, /record\.messageDetail === "private"[\s\S]*Your next set is ready[\s\S]*workoutId: record\.workoutId[\s\S]*exerciseId: record\.exerciseId/, "Private detail must alter visible copy without removing navigation identifiers");
assert.match(privacyPage, /active, unsubmitted workout[\s\S]*exercise and set object/i, "The privacy policy must disclose the active full-session cloud payload");
assert.match(privacyPage, /private[\s\S]*visible notification body/i, "The privacy policy must disclose that private notification detail changes visible copy only");
assert.match(privacyPage, /exercise name[\s\S]*server-side timer fields are still transmitted/i, "The privacy policy must disclose the notification fields retained server-side");
assert.match(privacyPage, /write-only[\s\S]*no read or restore endpoint/i, "The privacy policy must state that cloud copy is not a backup");
assert.match(consentApi, /deleteWorkoutData/, "Consent revocation must delete retained and legacy workout keys");
assert.match(authorizeApi, /Cloud workout copy is not configured/, "Workout authorization must work independently of push configuration");
assert.match(authorizeApi, /cf:rate:sync-authorize:[\s\S]*attempts > 10/, "Public installation authorization must be rate limited");
assert.match(pushRevokeApi, /cancelActiveTimers/, "Push revocation must cancel active server timers");
assert.match(installationRevokeApi, /deleteWorkoutData[\s\S]*cf:install:/, "Installation revocation must delete workout data and credentials");

(async () => {
  const keys = ["cf:workout:install-1:s1", "cf:workout:install-1:s2", "cf:mutation:install-1:m1", "unrelated"];
  const deleted = [];
  const fakeRedis = async (command) => {
    if (command[0] === "SCAN") {
      const pattern = String(command[3]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("\\*", ".*");
      return ["0", keys.filter((key) => new RegExp("^" + pattern + "$").test(key))];
    }
    if (command[0] === "DEL") { deleted.push(...command.slice(1)); return command.length - 1; }
    throw new Error("Unexpected fake Redis command: " + command.join(" "));
  };
  assert.deepEqual(await scanKeys(fakeRedis, "cf:workout:install-1:*"), keys.slice(0, 2));
  const result = await deleteWorkoutData(fakeRedis, "install-1");
  assert.deepEqual(result, { workoutCount: 2, mutationCount: 1 });
  assert(deleted.includes("cf:workouts:install-1"));
  assert(!deleted.includes("unrelated"));

  const workoutModule = require("../api/sync/workout");
  assert.equal(workoutModule.MAX_WORKOUT_BYTES, 256 * 1024);
  assert.match(workoutModule.WORKOUT_COMMIT_SCRIPT, /syncConsent[\s\S]*consent_required/, "The atomic Redis commit must recheck consent before writing");
  assert.match(workoutModule.WORKOUT_COMMIT_SCRIPT, /EXPIRE[\s\S]*ARGV\[6\]/, "The atomic Redis commit must apply the workout retention TTL");
  console.log("Sync consent tests passed (default-off client, server enforcement, retention, revocation, and deletion).");
})().catch((error) => { console.error(error); process.exitCode = 1; });
