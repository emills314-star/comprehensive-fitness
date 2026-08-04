"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  MAX_LEGACY_WORKOUT_CLEANUP_PAGES,
  cleanupLegacyWorkoutData,
  deleteWorkoutData
} = require("../api/_lib/installation-data");

const appSync = fs.readFileSync("app-sync.js", "utf8");
const authorizeApi = fs.readFileSync("api/sync/authorize.js", "utf8");
const consentApi = fs.readFileSync("api/sync/consent.js", "utf8");
const workoutApi = fs.readFileSync("api/sync/workout.js", "utf8");
const deleteInstallationApi = fs.readFileSync("api/install/delete.js", "utf8");
const pushRegisterApi = fs.readFileSync("api/push/register.js", "utf8");
const pushScheduleApi = fs.readFileSync("api/push/schedule.js", "utf8");
const pushCancelApi = fs.readFileSync("api/push/cancel.js", "utf8");
const pushRevokeApi = fs.readFileSync("api/push/revoke.js", "utf8");
const pushTestApi = fs.readFileSync("api/push/test.js", "utf8");

function functionSource(name) {
  const start = appSync.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.notEqual(start, -1, `Missing ${name}`);
  const bodyStart = appSync.indexOf("{", appSync.indexOf(")", start));
  let depth = 0;
  for (let index = bodyStart; index < appSync.length; index += 1) {
    if (appSync[index] === "{") depth += 1;
    else if (appSync[index] === "}") {
      depth -= 1;
      if (depth === 0) return appSync.slice(start, index + 1);
    }
  }
  throw new Error(`Could not isolate ${name}`);
}

function response() {
  return {
    headers: {},
    statusCode: 0,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; }
  };
}

async function assertDisabledEndpoints() {
  const authorizeHandler = require("../api/sync/authorize");
  const consentHandler = require("../api/sync/consent");
  const workoutHandler = require("../api/sync/workout");

  const authorizeResponse = response();
  await authorizeHandler({ method: "POST", body: {} }, authorizeResponse);
  assert.equal(authorizeResponse.statusCode, 410);
  assert.equal(authorizeResponse.body.status, "disabled");

  const consentResponse = response();
  await consentHandler({ method: "POST", body: { enabled: true } }, consentResponse);
  assert.equal(consentResponse.statusCode, 410);
  assert.equal(consentResponse.body.status, "disabled");

  const workoutResponse = response();
  await workoutHandler({
    method: "POST",
    url: "/api/sync/workout",
    headers: { "content-type": "application/json" },
    body: { installationId: "installation_123456", payload: { private: "must-not-be-read" } }
  }, workoutResponse);
  assert.equal(workoutResponse.statusCode, 410);
  assert.equal(workoutResponse.body.status, "disabled");
  assert.match(workoutResponse.body.error, /No workout mutation was accepted/i);
}

async function assertBoundedLegacyCleanup() {
  const deleted = [];
  const scans = [];
  const fakeRedis = async (command) => {
    if (command[0] === "SCAN") {
      scans.push(command);
      const cursor = String(command[1]);
      const pattern = String(command[3]);
      if (pattern === "cf:workout:install-1:*" && cursor === "0") {
        return ["17", ["cf:workout:install-1:s1", "cf:workout:other:s2"]];
      }
      if (pattern === "cf:workout:install-1:*" && cursor === "17") {
        return ["0", ["cf:workout:install-1:s3"]];
      }
      if (pattern === "cf:mutation:install-1:*" && cursor === "0") {
        return ["9", ["cf:mutation:install-1:m1"]];
      }
      if (pattern === "cf:mutation:install-1:*" && cursor === "9") {
        return ["0", ["cf:mutation:install-1:m2"]];
      }
      throw new Error(`Unexpected scan: ${command.join(" ")}`);
    }
    if (command[0] === "DEL") {
      deleted.push(...command.slice(1));
      return command.length - 1;
    }
    throw new Error(`Unexpected fake Redis command: ${command.join(" ")}`);
  };

  let state = {};
  const steps = [];
  do {
    const scanCount = scans.length;
    const result = await cleanupLegacyWorkoutData(fakeRedis, "install-1", state, { maxPages: 1, pageSize: 10 });
    assert.equal(scans.length - scanCount, 1, "Each synthetic cleanup request must stay within its one-page budget");
    steps.push(result);
    state = result.progress;
  } while (state.legacyWorkoutCleanupComplete !== "1");

  assert.equal(steps.length, 4);
  assert.equal(MAX_LEGACY_WORKOUT_CLEANUP_PAGES, 4);
  assert(deleted.includes("cf:workout:install-1:s1"));
  assert(deleted.includes("cf:workout:install-1:s3"));
  assert(deleted.includes("cf:mutation:install-1:m1"));
  assert(deleted.includes("cf:mutation:install-1:m2"));
  assert(deleted.includes("cf:workouts:install-1"));
  assert(deleted.includes("cf:mutations:install-1"));
  assert(!deleted.includes("cf:workout:other:s2"), "Legacy cleanup must remain installation-scoped");

  const legacyKeys = ["cf:workout:install-2:s1", "cf:mutation:install-2:m1"];
  const directDeletes = [];
  const directRedis = async (command) => {
    if (command[0] === "SCAN") {
      const pattern = String(command[3]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("\\*", ".*");
      return ["0", legacyKeys.filter((key) => new RegExp("^" + pattern + "$").test(key))];
    }
    if (command[0] === "DEL") {
      directDeletes.push(...command.slice(1));
      return command.length - 1;
    }
    throw new Error(`Unexpected direct cleanup command: ${command.join(" ")}`);
  };
  assert.deepEqual(await deleteWorkoutData(directRedis, "install-2"), { workoutCount: 1, mutationCount: 1 });
  assert(directDeletes.includes("cf:workouts:install-2"));
  assert(directDeletes.includes("cf:mutations:install-2"));
}

function assertClientAndPushSeparation() {
  const cleanup = functionSource("cleanupLegacyWorkoutCloudData");
  const register = functionSource("registerPushSubscription");
  const disable = functionSource("disablePushNotifications");
  const schedule = functionSource("scheduleRestPush");
  const cancel = functionSource("cancelRestPush");
  const test = functionSource("sendTestPushNotification");

  assert.doesNotMatch(appSync, /function\s+(?:queueActiveWorkoutSync|flushWorkoutSyncQueue|setCloudWorkoutSyncConsent|ensureInstallationAuthorization)\s*\(/);
  assert.doesNotMatch(appSync, /\/api\/sync\/(?:authorize|workout)/);
  assert.doesNotMatch(appSync, /cloudWorkoutSyncConsent|workoutCloudSyncConsentVersion|workoutCloudSync/);
  assert.match(cleanup, /writeIndexedValue\("sync-queue", \[\]\)/);
  assert.match(cleanup, /\/api\/sync\/consent[\s\S]*enabled:\s*false/);
  assert.doesNotMatch(cleanup, /enabled:\s*true/);
  assert.match(cleanup, /cleanup-pending[\s\S]*scheduleRetry/);
  assert.match(register, /\/api\/push\/register/);
  assert.match(disable, /\/api\/push\/revoke/);
  assert.doesNotMatch(disable, /api\/installation\/revoke|api\/sync/);
  assert.match(schedule, /\/api\/push\/schedule/);
  assert.match(cancel, /\/api\/push\/cancel/);
  assert.match(test, /\/api\/push\/test/);

  for (const source of [pushRegisterApi, pushScheduleApi, pushCancelApi, pushRevokeApi, pushTestApi]) {
    assert.doesNotMatch(source, /syncConsent|api\/sync/, "Push notification handlers must not depend on cloud-copy consent");
  }
}

function assertServerContracts() {
  assert.match(authorizeApi, /410[\s\S]*status:\s*"disabled"/);
  assert.doesNotMatch(authorizeApi, /createSecret|setHash|cf:installations/);
  assert.match(workoutApi, /410[\s\S]*No workout mutation was accepted/);
  assert.doesNotMatch(workoutApi, /redis|WORKOUT_COMMIT_SCRIPT|mutationKey|workoutKey|payload/);
  assert.match(consentApi, /body\.enabled === true[\s\S]*410/);
  assert.match(consentApi, /body\.enabled !== false[\s\S]*400/);
  assert.match(consentApi, /authorizeDeletion/);
  assert.match(consentApi, /cleanupLegacyWorkoutData/);
  assert.doesNotMatch(consentApi, /syncConsent:\s*"1"|status:\s*"enabled"/);

  assert.match(deleteInstallationApi, /installationWorkoutsKey/);
  assert.match(deleteInstallationApi, /installationMutationsKey/);
  assert.match(deleteInstallationApi, /cf:workout:\$\{installationId\}:\*/);
  assert.match(deleteInstallationApi, /cf:mutation:\$\{installationId\}:\*/);
  assert.match(deleteInstallationApi, /MAX_LEGACY_SCAN_PAGES_PER_REQUEST\s*=\s*4/);
  assert.match(deleteInstallationApi, /status:\s*"deleting"[\s\S]*secretHash:\s*installation\.secretHash/);
}

(async () => {
  assertClientAndPushSeparation();
  assertServerContracts();
  await assertDisabledEndpoints();
  await assertBoundedLegacyCleanup();
  console.log("Cloud-copy decommission tests passed (uploads disabled, cleanup bounded/resumable, deletion complete, push independent).");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
