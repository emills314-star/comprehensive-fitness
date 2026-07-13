"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const { hashSecret } = require("../api/_lib/security");

const INSTALLATION_ID = "installation_123456";
const TOKEN = "synthetic-remediation-token";

function request(body, overrides = {}) {
  return {
    method: "POST",
    body,
    socket: { remoteAddress: "198.51.100.44" },
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      "x-forwarded-for": "192.0.2.77",
      "upstash-signature": "synthetic-signature",
      ...(overrides.headers || {})
    },
    ...overrides
  };
}

function response() {
  return {
    headers: {}, statusCode: 0, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; }
  };
}

function loadFresh(target, mocks = {}) {
  const resolved = require.resolve(target);
  const originalLoad = Module._load;
  delete require.cache[resolved];
  Module._load = function mockedLoad(requestName, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, requestName)) return mocks[requestName];
    return originalLoad.call(this, requestName, parent, isMain);
  };
  try { return require(resolved); } finally { Module._load = originalLoad; }
}

async function withRedisFetch(commandHandler, callback) {
  const originalFetch = global.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://synthetic-redis.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "synthetic-token";
  global.fetch = async (_url, options) => {
    const result = await commandHandler(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ result }) };
  };
  try { await callback(); } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
}

async function testDeletingAuthorizationIsRejected() {
  const security = require("../api/_lib/security");
  await withRedisFetch(async (command) => {
    if (command[0] === "HGETALL") return ["installationId", INSTALLATION_ID, "secretHash", hashSecret(TOKEN), "active", "0", "status", "deleting"];
    if (command[0] === "EXPIRE") return 1;
    throw new Error(`Unexpected command ${JSON.stringify(command)}`);
  }, async () => {
    assert.equal(await security.authorizeInstallation(request({}), INSTALLATION_ID), null, "ordinary authorization must reject a deleting tombstone");
  });
  await withRedisFetch(async (command) => {
    if (command[0] === "HGETALL") return ["installationId", INSTALLATION_ID, "secretHash", hashSecret(TOKEN), "active", "0", "status", "inactive"];
    if (command[0] === "EXPIRE") return 1;
    throw new Error(`Unexpected command ${JSON.stringify(command)}`);
  }, async () => {
    assert.ok(await security.authorizeDeletion(request({}), INSTALLATION_ID), "an expired/inactive push subscription must remain credential-deletable");
  });
}

async function testTransientPushFailureRetries() {
  let timerStatus = "scheduled";
  let attemptToken = "";
  let sendAttempts = 0;
  const timerRecord = () => ({
    notificationId: "timer-server", clientTimerId: "timer-client", installationId: INSTALLATION_ID,
    workoutId: "workout-1", exerciseId: "exercise-1", setId: "set-1", upcomingSetId: "set-2",
    timerVersion: "1", exerciseName: "Synthetic press", scheduledCompletionAt: new Date().toISOString(), status: timerStatus
  });
  const redisMock = {
    getHash: async () => ({ installationId: INSTALLATION_ID, active: "1", endpoint: "https://push.example/sub", p256dh: "key", auth: "auth" }),
    redis: async (command) => {
      if (command[0] === "EVAL" && String(command[1]).includes("timer_delivery_claim_v3")) { timerStatus = "delivering"; attemptToken = String(command[8]); return "claimed"; }
      if (command[0] === "EVAL" && String(command[1]).includes("timer_delivery_confirm_v3")) return attemptToken === String(command[8]) ? "confirmed" : "claim_lost";
      if (command[0] === "EVAL" && String(command[1]).includes("timer_delivery_retry_v3")) { timerStatus = "retrying"; attemptToken = ""; return "retrying"; }
      if (command[0] === "EVAL" && String(command[1]).includes("timer_delivery_success_v3")) { timerStatus = "delivered"; attemptToken = ""; return "delivered"; }
      throw new Error(`Unexpected Redis ${JSON.stringify(command)}`);
    },
    setHashWithTtl: async (_key, fields) => { if (fields.status) timerStatus = fields.status; return 1; },
    deleteIfValue: async () => 1
  };
  const pushMock = {
    configuredPublicAppUrl: () => "https://fitness.example",
    qstashReceiver: () => ({ verify: async () => true }),
    pushEndpointAllowed: () => true,
    configureWebPush: () => ({ sendNotification: async () => { sendAttempts += 1; if (sendAttempts === 1) throw new Error("transient"); } })
  };
  const deliver = loadFresh("../api/push/deliver", {
    "../_lib/redis": redisMock,
    "../_lib/push": pushMock,
    "./schedule": { loadTimerRecord: async () => ({ key: "timer-key", record: timerRecord() }) }
  });
  const first = response();
  await deliver(request({ installationId: INSTALLATION_ID, notificationId: "timer-server" }), first);
  assert.equal(first.statusCode, 500);
  assert.equal(timerStatus, "retrying");
  const second = response();
  await deliver(request({ installationId: INSTALLATION_ID, notificationId: "timer-server" }), second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.status, "delivered", "a signed retry must never be acknowledged as ignored");
  assert.equal(sendAttempts, 2);

  timerStatus = "scheduling";
  const scheduling = response();
  await deliver(request({ installationId: INSTALLATION_ID, notificationId: "timer-server" }), scheduling);
  assert.equal(scheduling.body.status, "delivered", "immediate delivery must find and accept a persisted scheduling record");
}

async function testSchedulePersistsBeforePublishAndRecoversFailure() {
  const events = [];
  let publishFails = false;
  const redisMock = {
    getHash: async () => ({}),
    setHashWithTtl: async () => { events.push("persist"); return 1; },
    redis: async (command) => {
      if (command[0] === "EVAL" && String(command[1]).includes("timer_prepare_v2")) { events.push("persist"); return ["prepared", ""]; }
      if (command[0] === "EVAL" && String(command[1]).includes("timer_finalize_v3")) return "scheduled";
      if (command[0] === "EVAL" && String(command[1]).includes("timer_publish_failed_v3")) return "publish_failed";
      if (command[0] === "SADD" || command[0] === "EXPIRE" || command[0] === "SET") return "";
      throw new Error(`Unexpected Redis ${JSON.stringify(command)}`);
    }
  };
  const pushMock = {
    publicAppUrl: () => "https://fitness.example",
    qstashClient: () => ({
      publishJSON: async () => { events.push("publish"); if (publishFails) throw new Error("ambiguous publish failure"); return { messageId: "message-1" }; },
      messages: { delete: async () => undefined }
    })
  };
  const securityMock = {
    authorizeInstallation: async () => ({ installationId: INSTALLATION_ID, active: "1", status: "active" }),
    checkRateLimit: async () => ({ allowed: true }),
    rateLimitResponse: () => { throw new Error("unexpected rate limit"); }
  };
  const schedule = loadFresh("../api/push/schedule", { "../_lib/redis": redisMock, "../_lib/push": pushMock, "../_lib/security": securityMock });
  const body = {
    installationId: INSTALLATION_ID, notificationId: "timer-client", workoutId: "workout-1", exerciseId: "exercise-1",
    setId: "set-1", timerVersion: 1, restEndTime: Date.now() + 60000, exerciseName: "Synthetic press"
  };
  const scheduled = response();
  await schedule(request(body), scheduled);
  assert.equal(scheduled.statusCode, 200);
  assert.ok(events.indexOf("persist") >= 0 && events.indexOf("persist") < events.indexOf("publish"), "timer record must exist before QStash publish");

  events.length = 0;
  publishFails = true;
  const failed = response();
  await schedule(request({ ...body, timerVersion: 2 }), failed);
  assert.equal(failed.statusCode, 502);
  assert.deepEqual(events.slice(0, 2), ["persist", "publish"], "publish failure must retain a deterministic recoverable scheduling record");
  assert.match(schedule.PREPARE_TIMER_SCRIPT || "", /status.*active|active.*status/i, "atomic timer preparation must reject a deleting installation");
}

async function testDurableDeletionTombstone() {
  const writes = [];
  const deletedKeys = [];
  let failCleanup = true;
  const redisMock = {
    getHash: async () => ({}),
    setHashWithTtl: async (key, fields) => { writes.push({ key, fields }); return 1; },
    redis: async (command) => {
      if (failCleanup && command[0] === "SSCAN") throw new Error("synthetic cleanup failure");
      if (command[0] === "SSCAN") return ["0", []];
      if (command[0] === "SCAN") return ["0", []];
      if (command[0] === "SRANDMEMBER") return [];
      if (command[0] === "SCARD") return 0;
      if (command[0] === "DEL") { deletedKeys.push(...command.slice(1)); return command.length - 1; }
      if (command[0] === "SREM") return 1;
      throw new Error(`Unexpected Redis ${JSON.stringify(command)}`);
    }
  };
  const securityMock = {
    authorizeDeletion: async () => ({ installationId: INSTALLATION_ID, secretHash: hashSecret(TOKEN), status: failCleanup ? "active" : "deleting", active: failCleanup ? "1" : "0" }),
    checkRateLimit: async () => ({ allowed: true }),
    rateLimitResponse: () => { throw new Error("unexpected rate limit"); }
  };
  const handler = loadFresh("../api/install/delete", {
    "../_lib/redis": redisMock,
    "../_lib/security": securityMock,
    "../_lib/push": { qstashClient: () => ({ messages: { delete: async () => undefined } }) }
  });
  const failed = response();
  await handler(request({ installationId: INSTALLATION_ID }), failed);
  assert.equal(failed.statusCode, 500);
  assert.equal(writes[0]?.fields.status, "deleting");
  assert.notEqual(writes[0]?.fields.secretHash, "", "cleanup failure must retain credential-authenticated retry state");
  assert.ok(!deletedKeys.includes(`cf:install:${INSTALLATION_ID}`), "cleanup must never delete its only revocation marker");

  failCleanup = false;
  const retried = response();
  await handler(request({ installationId: INSTALLATION_ID }), retried);
  assert.equal(retried.statusCode, 200);
  assert.equal(retried.body.status, "deleted");
  assert.equal(writes.at(-1)?.fields.status, "deleted");
  assert.ok(!deletedKeys.includes(`cf:install:${INSTALLATION_ID}`));
}

async function testWorkoutRevisionAndRevocationAtomicity() {
  const securityMock = { authorizeInstallation: async () => ({ active: "1", status: "active" }), checkRateLimit: async () => ({ allowed: true }), rateLimitResponse: () => undefined };
  const redisMock = { redis: async () => "conflict" };
  const workout = loadFresh("../api/sync/workout", { "../_lib/security": securityMock, "../_lib/redis": redisMock });
  const body = {
    installationId: INSTALLATION_ID, mutationId: "mutation-2", sessionId: "session-1", revision: "2026-07-12T12:00:00.000Z",
    payload: { session: { id: "session-1" }, exercises: [{ id: "exercise-1", sessionId: "session-1" }], sets: [{ id: "set-1", exerciseId: "exercise-1" }] }
  };
  const conflict = response();
  await workout(request(body), conflict);
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.status, "conflict");
  const nonCanonical = response();
  await workout(request({ ...body, revision: "2026-07-12T12:00:00Z" }), nonCanonical);
  assert.equal(nonCanonical.statusCode, 400, "revision must use canonical millisecond ISO form");
  assert.match(workout.WORKOUT_COMMIT_SCRIPT, /HGET.*status[\s\S]*active/, "atomic workout commit must recheck active installation status");
}

async function testCancellationMappingAndVersion() {
  const canceled = [];
  const record = {
    notificationId: "timer-server-v2", clientTimerId: "timer-client", installationId: INSTALLATION_ID,
    workoutId: "workout-1", timerVersion: "2", status: "scheduled", messageId: "message-2"
  };
  const redisMock = {
    redis: async (command) => {
      if (command[0] === "GET") return "timer-server-v2";
      if (command[0] === "EVAL" && String(command[1]).includes("timer_cancel_v3")) { canceled.push(command); return "canceled"; }
      throw new Error(`Unexpected Redis ${JSON.stringify(command)}`);
    }
  };
  const cancel = loadFresh("../api/push/cancel", {
    "../_lib/redis": redisMock,
    "../_lib/security": { authorizeInstallation: async () => ({ status: "active", active: "1" }), checkRateLimit: async () => ({ allowed: true }), rateLimitResponse: () => undefined },
    "../_lib/push": { qstashClient: () => ({ messages: { delete: async () => undefined } }) },
    "./schedule": {
      loadTimerRecord: async (_installationId, notificationId) => notificationId === "timer-server-v2"
        ? { key: "timer-key-v2", record }
        : { key: "missing", record: {} }
    }
  });
  const mapped = response();
  await cancel(request({ installationId: INSTALLATION_ID, workoutId: "workout-1", notificationId: "timer-client", reason: "user" }), mapped);
  assert.equal(mapped.statusCode, 200);
  assert.equal(mapped.body.notificationId, "timer-server-v2", "local client timer ID must resolve to the active scoped server ID");
  assert.equal(canceled.length, 1);

  const stale = response();
  await cancel(request({ installationId: INSTALLATION_ID, workoutId: "workout-1", notificationId: "timer-server-v2", timerVersion: 1 }), stale);
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.body.status, "stale");
  assert.equal(canceled.length, 1, "a stale version must not cancel the current timer");
}

async function testTrustedRateIdentityAndRegistrationOrdering() {
  const security = require("../api/_lib/security");
  const originalVercel = process.env.VERCEL;
  delete process.env.VERCEL;
  const first = security.clientFingerprint(request({}, { headers: { "x-forwarded-for": "192.0.2.1" } }));
  const second = security.clientFingerprint(request({}, { headers: { "x-forwarded-for": "203.0.113.9" } }));
  assert.equal(first, second, "unsupported deployments must ignore arbitrary forwarded IP headers");
  if (originalVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = originalVercel;

  const scopes = [];
  const register = loadFresh("../api/push/register", {
    "../_lib/redis": {
      isRedisConfigured: () => true,
      getHash: async () => ({ installationId: INSTALLATION_ID, secretHash: hashSecret(TOKEN), active: "1", status: "active" }),
      setHashWithTtl: async () => 1,
      redis: async () => 1
    },
    "../_lib/push": { pushConfigured: () => true, pushEndpointAllowed: () => true },
    "../_lib/security": {
      authorizeRegistration: async () => null,
      checkRateLimit: async (scope) => { scopes.push(scope); return { allowed: true }; },
      clientFingerprint: () => "trusted-client",
      createSecret: () => "secret",
      hashSecret,
      rateLimitResponse: () => undefined
    }
  });
  const denied = response();
  await register(request({
    installationId: INSTALLATION_ID,
    subscription: { endpoint: "https://push.example/sub", keys: { p256dh: "synthetic-p256dh", auth: "synthetic-auth" } }
  }), denied);
  assert.equal(denied.statusCode, 401);
  assert.deepEqual(scopes, ["register-client"], "unauthenticated refresh must not consume the installation-scoped quota");
  assert.match(register.REGISTER_INSTALLATION_SCRIPT, /existingStatus[\s\S]*deleting[\s\S]*deleted/, "registration commit must reject deletion tombstones atomically");
}

function testAllWriteScriptsRecheckRevocation() {
  const workout = require("../api/sync/workout");
  const schedule = require("../api/push/schedule");
  const deliver = require("../api/push/deliver");
  const cancel = require("../api/push/cancel");
  const register = require("../api/push/register");
  const scripts = [
    workout.WORKOUT_COMMIT_SCRIPT,
    schedule.PREPARE_TIMER_SCRIPT,
    schedule.FINALIZE_TIMER_SCRIPT,
    schedule.FAIL_TIMER_SCRIPT,
    schedule.REPLACE_TIMER_SCRIPT,
    deliver.CLAIM_DELIVERY_SCRIPT,
    deliver.CONFIRM_DELIVERY_CLAIM_SCRIPT,
    deliver.UPDATE_TIMER_STATE_SCRIPT,
    deliver.DELIVERY_SUCCESS_SCRIPT,
    deliver.INVALIDATE_SUBSCRIPTION_SCRIPT,
    deliver.RETRY_DELIVERY_SCRIPT,
    cancel.CANCEL_TIMER_SCRIPT,
    register.REGISTER_INSTALLATION_SCRIPT
  ];
  scripts.forEach((script, index) => {
    assert.equal(typeof script, "string", `write script ${index} must be exported for verification`);
    assert.match(script, /status|Status/, `write script ${index} must inspect installation status`);
    assert.match(script, /delet|active|revoked/, `write script ${index} must reject a revoked installation`);
  });
}

async function main() {
  await testDeletingAuthorizationIsRejected();
  await testTransientPushFailureRetries();
  await testSchedulePersistsBeforePublishAndRecoversFailure();
  await testDurableDeletionTombstone();
  await testWorkoutRevisionAndRevocationAtomicity();
  await testCancellationMappingAndVersion();
  await testTrustedRateIdentityAndRegistrationOrdering();
  testAllWriteScriptsRecheckRevocation();
  console.log("Security remediation tests passed (retry delivery, durable deletion, scheduling order, revision conflicts, and trusted rate identity).");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
