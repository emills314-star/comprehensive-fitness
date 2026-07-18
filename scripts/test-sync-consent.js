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

assert.match(html, /workoutCloudSync: false/, "Workout cloud copy must default off");
assert.match(html, /Optional workout cloud copy/, "Settings must expose a separate explicit cloud-copy control");
assert.match(html, /Enabling rest notifications never uploads workouts/, "The disclosure must state notification independence");
assert.match(html, /function queueActiveWorkoutSync[\s\S]*?cloudWorkoutSyncConsent === true/, "Submission must not queue without canonical consent");
assert.match(html, /function flushWorkoutSyncQueue[\s\S]*?cloudWorkoutSyncConsent === true/, "Queued mutations must not flush without canonical consent");
assert.doesNotMatch(html.match(/async function registerPushSubscription[\s\S]*?\n      \}/)?.[0] || "", /flushWorkoutSyncQueue/, "Push registration must not activate workout upload");
assert.match(html, /function setCloudWorkoutSyncConsent[\s\S]*?clearWorkoutSyncQueue[\s\S]*?api\/sync\/consent/, "Disabling consent must stop pending uploads and revoke server consent");
assert.match(html, /reconcileWorkoutSyncConsent\(\)/, "Legacy implicit uploads must be revoked on startup/online reconciliation");
assert.match(html, /permanentlyClearLocalData[\s\S]*?deleteRemoteInstallationData/, "Local clearing must delete remote installation data before discarding authorization");

assert.match(workoutApi, /installation\.syncConsent !== "1"/, "The server must enforce consent independently of the client");
assert.match(keyContracts, /workout:\s*90 \* 24 \* 60 \* 60/, "Workout copies must have a 90-day retention limit");
assert.match(workoutApi, /MAX_WORKOUT_BYTES = 256 \* 1024[\s\S]*validateJsonRequest\(req, MAX_WORKOUT_BYTES\)/, "Workout copies must have a server-enforced payload limit");
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
