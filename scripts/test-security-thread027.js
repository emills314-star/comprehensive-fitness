"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const { hashSecret } = require("../api/_lib/security");

const INSTALLATION_ID = "installation_123456";
const TOKEN = "synthetic-thread027-token";

function request(body, overrides = {}) {
  return {
    method: "POST",
    body,
    socket: { remoteAddress: "198.51.100.44" },
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
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

async function testDeliveryClaimAndCancellationRace() {
  const deliverModule = require("../api/push/deliver");
  const cancelModule = require("../api/push/cancel");
  for (const [name, script] of [
    ["claim", deliverModule.CLAIM_DELIVERY_SCRIPT],
    ["confirm", deliverModule.CONFIRM_DELIVERY_CLAIM_SCRIPT],
    ["success", deliverModule.DELIVERY_SUCCESS_SCRIPT],
    ["retry", deliverModule.RETRY_DELIVERY_SCRIPT],
    ["invalid", deliverModule.INVALIDATE_SUBSCRIPTION_SCRIPT]
  ]) {
    assert.equal(typeof script, "string", `${name} transition must be an exported atomic script`);
    assert.match(script, /deliveryAttemptToken/, `${name} transition must bind the attempt token`);
    assert.match(script, /timerVersion/, `${name} transition must bind the timer version`);
    assert.match(script, /KEYS\[3\]/, `${name} transition must bind the active timer key`);
    assert.match(script, /installationStatus|status.*active/i, `${name} transition must bind active installation state`);
  }
  assert.match(deliverModule.DELIVERY_RACE_BOUNDARY || "", /already[- ]in[- ]flight.*cannot be recalled/i);
  assert.match(cancelModule.CANCEL_TIMER_SCRIPT || "", /deliveryAttemptToken/);
  assert.match(cancelModule.CANCEL_TIMER_SCRIPT || "", /timerVersion/);
  const scheduleModule = require("../api/push/schedule");
  assert.match(scheduleModule.PREPARE_TIMER_SCRIPT || "", /existingStatus == 'delivering'/, "schedule retries must not overwrite an active delivery claim");
  assert.match(scheduleModule.FAIL_TIMER_SCRIPT || "", /currentStatus ~= 'scheduling' then return currentStatus/, "an ambiguous publish failure must not restore an active key after delivery has claimed the timer");

  const state = {
    status: "scheduled",
    notificationId: "timer-server-v3",
    clientTimerId: "timer-client",
    installationId: INSTALLATION_ID,
    workoutId: "workout-1",
    exerciseId: "exercise-1",
    setId: "set-1",
    upcomingSetId: "set-2",
    timerVersion: "3",
    exerciseName: "Synthetic press",
    scheduledCompletionAt: new Date().toISOString(),
    messageId: "message-3",
    deliveryAttemptToken: ""
  };
  const events = [];
  let cancelRateChecks = 0;
  let sendStartedResolve;
  let releaseSend;
  const sendStarted = new Promise((resolve) => { sendStartedResolve = resolve; });
  const sendBlocked = new Promise((resolve) => { releaseSend = resolve; });

  const redis = async (command) => {
    if (command[0] === "GET") return state.notificationId;
    if (command[0] !== "EVAL") throw new Error(`Unexpected Redis ${JSON.stringify(command)}`);
    const script = String(command[1]);
    if (script.includes("timer_delivery_claim_v3")) {
      events.push("claim");
      if (!new Set(["scheduling", "scheduled", "retrying"]).has(state.status)) return "claim_lost";
      state.status = "delivering";
      state.deliveryAttemptToken = String(command[8]);
      return "claimed";
    }
    if (script.includes("timer_delivery_confirm_v3")) {
      events.push("confirm");
      return state.status === "delivering" && state.deliveryAttemptToken === String(command[8]) ? "confirmed" : "claim_lost";
    }
    if (script.includes("timer_cancel_v3")) {
      events.push("cancel-state");
      if (state.status === "canceled") return "already_canceled";
      state.status = "canceled";
      state.deliveryAttemptToken = "";
      return "canceled";
    }
    if (script.includes("timer_delivery_success_v3")) {
      events.push("success-transition");
      if (state.status !== "delivering" || state.deliveryAttemptToken !== String(command[8])) return "claim_lost";
      state.status = "delivered";
      return "delivered";
    }
    if (script.includes("rate_limit_v1") || script.includes("INCR")) return [1, 3600];
    throw new Error(`Unexpected Redis script ${script.slice(0, 80)}`);
  };
  const redisMock = {
    redis,
    getHash: async () => ({
      installationId: INSTALLATION_ID, active: "1", status: "active",
      endpoint: "https://fcm.googleapis.com/fcm/send/synthetic", p256dh: "key", auth: "auth"
    })
  };
  const securityMock = {
    authorizeInstallation: async () => ({ active: "1", status: "active" }),
    checkRateLimit: async () => { cancelRateChecks += 1; return { allowed: true }; },
    rateLimitResponse: () => undefined
  };
  const pushMock = {
    configuredPublicAppUrl: () => "https://fitness.example",
    qstashReceiver: () => ({ verify: async () => true }),
    pushEndpointAllowed: () => true,
    configureWebPush: () => ({ sendNotification: async () => {
      events.push("send-started");
      sendStartedResolve();
      await sendBlocked;
      events.push("send-returned");
    } }),
    qstashClient: () => ({ messages: { delete: async () => { events.push("qstash-delete"); } } })
  };
  const scheduleMock = { loadTimerRecord: async () => ({ key: "timer-key", record: { ...state } }) };
  const deliver = loadFresh("../api/push/deliver", { "../_lib/redis": redisMock, "../_lib/push": pushMock, "./schedule": scheduleMock });
  const cancel = loadFresh("../api/push/cancel", { "../_lib/redis": redisMock, "../_lib/push": pushMock, "../_lib/security": securityMock, "./schedule": scheduleMock });

  const delivered = response();
  const deliveryPromise = deliver(request({ installationId: INSTALLATION_ID, notificationId: state.notificationId }), delivered);
  await sendStarted;
  const canceled = response();
  await cancel(request({ installationId: INSTALLATION_ID, workoutId: state.workoutId, notificationId: state.notificationId, timerVersion: 3 }), canceled);
  assert.equal(canceled.statusCode, 200);
  assert.ok(events.indexOf("cancel-state") < events.indexOf("qstash-delete"), "Redis cancellation must precede waiting on QStash deletion");
  releaseSend();
  await deliveryPromise;
  assert.equal(delivered.body.status, "inactive", "an already-in-flight send must not resurrect canceled state");
  assert.equal(state.status, "canceled");
  assert.deepEqual(events.slice(0, 3), ["claim", "confirm", "send-started"]);
  const retriedCancel = response();
  await cancel(request({ installationId: INSTALLATION_ID, workoutId: state.workoutId, notificationId: state.notificationId, timerVersion: 3 }), retriedCancel);
  assert.equal(retriedCancel.statusCode, 200);
  assert.equal(retriedCancel.body.idempotent, true);
  assert.equal(cancelRateChecks, 1, "a cleanup retry for an already-canceled timer must not consume the active-cancel quota");
}

async function testBoundedIndexedDeletionAndRetryRateLimit() {
  const deletion = require("../api/install/delete");
  assert.equal(typeof deletion.MAX_LEGACY_SCAN_PAGES_PER_REQUEST, "number");
  assert.ok(deletion.MAX_LEGACY_SCAN_PAGES_PER_REQUEST > 0 && deletion.MAX_LEGACY_SCAN_PAGES_PER_REQUEST <= 8);
  assert.match(deletion.scanCleanupPage?.toString() || "", /SSCAN|SCAN/);
  assert.doesNotMatch(deletion.scanCleanupPage?.toString() || "", /do\s*\{|while\s*\(/, "one request must never exhaust an unbounded cursor loop");
  assert.match(deletion.REVOKE_TIMER_FOR_DELETION_SCRIPT || "", /status','canceled'/, "installation cleanup must cancel timer state before external scheduler cleanup");
  assert.match(deletion.REVOKE_TIMER_FOR_DELETION_SCRIPT || "", /deliveryAttemptToken/, "installation cleanup must revoke an in-flight delivery claim");
  assert.match(deletion.deleteCleanupBatch?.toString() || "", /SRANDMEMBER/, "cleanup selection must leave unfinished keys retryable");
  assert.match(deletion.deleteCleanupBatch?.toString() || "", /SREM/, "cleanup keys may leave the index only after bounded processing");
  assert.doesNotMatch(deletion.deleteCleanupBatch?.toString() || "", /SPOP/, "destructive selection would lose unprocessed keys on timeout");

  let attempt = 0;
  let rateChecks = 0;
  const writes = [];
  const scanCommands = [];
  const setScanCommands = [];
  const redisMock = {
    getHash: async () => ({}),
    setHashWithTtl: async (_key, fields) => { writes.push(fields); return 1; },
    redis: async (command) => {
      if (command[0] === "SSCAN") { setScanCommands.push(command); return attempt === 0 ? ["17", []] : ["0", []]; }
      if (command[0] === "SCAN") { scanCommands.push(command); return attempt === 0 ? ["19", []] : ["0", []]; }
      if (command[0] === "SRANDMEMBER") return [];
      if (command[0] === "SCARD") return 0;
      if (["DEL", "SREM"].includes(command[0])) return 1;
      throw new Error(`Unexpected Redis ${JSON.stringify(command)}`);
    }
  };
  const securityMock = {
    authorizeDeletion: async () => attempt === 0
      ? { installationId: INSTALLATION_ID, secretHash: hashSecret(TOKEN), status: "active", active: "1" }
      : {
          installationId: INSTALLATION_ID, secretHash: hashSecret(TOKEN), status: "deleting", active: "0",
          deleteTimersRegistryCursor: "17", deleteWorkoutsRegistryCursor: "17", deleteMutationsRegistryCursor: "17",
          deleteLegacyTimerCursor: "19", deleteWorkoutScanCursor: "19", deleteMutationScanCursor: "19", deleteActiveScanCursor: "19"
        },
    checkRateLimit: async () => { rateChecks += 1; return { allowed: true }; },
    rateLimitResponse: () => undefined
  };
  const handler = loadFresh("../api/install/delete", {
    "../_lib/redis": redisMock,
    "../_lib/security": securityMock,
    "../_lib/push": { qstashClient: () => ({ messages: { delete: async () => undefined } }) }
  });
  const first = response();
  await handler(request({ installationId: INSTALLATION_ID }), first);
  assert.equal(first.statusCode, 202);
  assert.equal(first.body.status, "deleting");
  assert.equal(first.body.retryable, true);
  assert.ok(writes.some((fields) => Object.keys(fields).some((field) => /Cursor|Done/.test(field))), "continuation cursors must persist on the tombstone");
  assert.ok(scanCommands.length <= deletion.MAX_LEGACY_SCAN_PAGES_PER_REQUEST);
  attempt = 1;
  const second = response();
  await handler(request({ installationId: INSTALLATION_ID }), second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.status, "deleted");
  assert.equal(rateChecks, 1, "credential-authenticated continuation retries must not consume or be blocked by the initial delete quota");
  assert.ok(setScanCommands.some((command) => command[2] === "17"), "registry cleanup must resume from the persisted SSCAN cursor");
  assert.ok(scanCommands.some((command) => command[1] === "19"), "legacy fallback must resume from the persisted SCAN cursor");

  const cleanupEvents = [];
  const timerKey = `cf:timer:${INSTALLATION_ID}:timer-delete-race`;
  const deletionWithTimer = loadFresh("../api/install/delete", {
    "../_lib/redis": {
      getHash: async () => ({ installationId: INSTALLATION_ID, notificationId: "timer-delete-race", workoutId: "workout-1", timerVersion: "1", status: "delivering", deliveryAttemptToken: "attempt", messageId: "message-delete-race" }),
      setHashWithTtl: async () => 1,
      redis: async (command) => {
        if (command[0] === "SRANDMEMBER") return [timerKey];
        if (command[0] === "EVAL" && String(command[1]).includes("installation_delete_revoke_timer_v3")) { cleanupEvents.push("timer-state-revoked"); return "canceled"; }
        if (command[0] === "DEL" || command[0] === "SREM") return 1;
        if (command[0] === "SCARD") return 0;
        throw new Error(`Unexpected cleanup Redis ${JSON.stringify(command)}`);
      }
    },
    "../_lib/push": { qstashClient: () => ({ messages: { delete: async () => { cleanupEvents.push("qstash-delete"); } } }) },
    "../_lib/security": securityMock
  });
  await deletionWithTimer.deleteCleanupBatch(INSTALLATION_ID, `cf:delete:${INSTALLATION_ID}:keys`);
  assert.deepEqual(cleanupEvents, ["timer-state-revoked", "qstash-delete"], "installation deletion must revoke timer/claim state before external scheduler cleanup");
}

async function testPushEndpointOriginPolicy() {
  const push = require("../api/_lib/push");
  assert.equal(typeof push.pushEndpointAllowed, "function");
  assert.equal(push.pushEndpointAllowed("https://fcm.googleapis.com/fcm/send/synthetic"), true);
  assert.equal(push.pushEndpointAllowed("https://updates.push.services.mozilla.com/wpush/v2/synthetic"), true);
  assert.equal(push.pushEndpointAllowed("https://web.push.apple.com/QH/synthetic"), true);
  for (const endpoint of [
    "http://fcm.googleapis.com/fcm/send/synthetic",
    "https://fcm.googleapis.com.evil.example/send",
    "https://127.0.0.1/push",
    "https://[::1]/push",
    "https://localhost/push",
    "https://169.254.169.254/latest/meta-data",
    "https://evil.example/push",
    "https://user:password@fcm.googleapis.com/push"
  ]) assert.equal(push.pushEndpointAllowed(endpoint), false, `must reject blind outbound endpoint ${endpoint}`);

  const old = process.env.WEB_PUSH_ALLOWED_ORIGINS;
  process.env.WEB_PUSH_ALLOWED_ORIGINS = "https://push.example.test,https://127.0.0.1";
  assert.equal(push.pushEndpointAllowed("https://push.example.test/subscription"), true, "an explicit public exact origin may extend provider compatibility");
  assert.equal(push.pushEndpointAllowed("https://push.example.test.evil/subscription"), false);
  assert.equal(push.pushEndpointAllowed("https://127.0.0.1/subscription"), false, "configuration must not opt into literal internal destinations");
  if (old === undefined) delete process.env.WEB_PUSH_ALLOWED_ORIGINS; else process.env.WEB_PUSH_ALLOWED_ORIGINS = old;

  const register = require("../api/push/register");
  assert.equal(register.validSubscription({ endpoint: "https://evil.example/push", keys: { p256dh: "key", auth: "auth" } }), false);
  assert.equal(register.validSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/synthetic", keys: { p256dh: "key", auth: "auth" } }), true);
  assert.match(fs.readFileSync(require.resolve("../api/push/deliver"), "utf8"), /pushEndpointAllowed/, "delivery must revalidate legacy stored endpoints before egress");
  assert.match(fs.readFileSync(require.resolve("../api/push/test"), "utf8"), /pushEndpointAllowed/, "test delivery must revalidate stored endpoints before egress");

  let sends = 0;
  const legacyRecord = {
    notificationId: "legacy-malicious-timer", installationId: INSTALLATION_ID, workoutId: "workout-1",
    exerciseId: "exercise-1", setId: "set-1", timerVersion: "1", status: "scheduled",
    scheduledCompletionAt: new Date().toISOString()
  };
  const deliver = loadFresh("../api/push/deliver", {
    "../_lib/redis": {
      getHash: async () => ({ installationId: INSTALLATION_ID, active: "1", status: "active", endpoint: "https://evil.example/push", p256dh: "key", auth: "auth" }),
      redis: async (command) => {
        const script = String(command[1] || "");
        if (script.includes("timer_delivery_claim_v3")) return "claimed";
        if (script.includes("timer_invalid_subscription_v3")) return "invalid-subscription";
        throw new Error(`Unexpected Redis ${JSON.stringify(command)}`);
      }
    },
    "../_lib/push": {
      configuredPublicAppUrl: () => "https://fitness.example",
      qstashReceiver: () => ({ verify: async () => true }),
      pushEndpointAllowed: push.pushEndpointAllowed,
      configureWebPush: () => ({ sendNotification: async () => { sends += 1; } })
    },
    "./schedule": { loadTimerRecord: async () => ({ key: "legacy-malicious-key", record: legacyRecord }) }
  });
  const denied = response();
  await deliver(request({ installationId: INSTALLATION_ID, notificationId: legacyRecord.notificationId }), denied);
  assert.equal(denied.statusCode, 200);
  assert.equal(denied.body.status, "invalid-subscription");
  assert.equal(sends, 0, "a legacy arbitrary endpoint must be invalidated without outbound network access");

  const pushTest = loadFresh("../api/push/test", {
    "../_lib/security": {
      authorizeInstallation: async () => ({ installationId: INSTALLATION_ID, active: "1", status: "active", endpoint: "https://evil.example/push", p256dh: "key", auth: "auth" }),
      checkRateLimit: async () => { throw new Error("disallowed egress must fail before rate-limited send work"); },
      rateLimitResponse: () => undefined
    },
    "../_lib/push": {
      pushEndpointAllowed: push.pushEndpointAllowed,
      configureWebPush: () => ({ sendNotification: async () => { sends += 1; } })
    }
  });
  const deniedTest = response();
  await pushTest(request({ installationId: INSTALLATION_ID }), deniedTest);
  assert.equal(deniedTest.statusCode, 409);
  assert.equal(sends, 0, "test notifications must enforce the same endpoint policy");
}

const groups = {
  claim: testDeliveryClaimAndCancellationRace,
  deletion: testBoundedIndexedDeletionAndRetryRateLimit,
  egress: testPushEndpointOriginPolicy
};

async function main() {
  const requested = process.argv[2];
  if (requested && !groups[requested]) throw new Error(`Unknown test group ${requested}`);
  const selected = requested ? [[requested, groups[requested]]] : Object.entries(groups);
  for (const [name, test] of selected) {
    await test();
    console.log(`Thread 027 ${name} regression passed.`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
