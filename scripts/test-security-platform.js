"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { hashSecret } = require("../api/_lib/security");
const { scopedTimerId, timerKey } = require("../api/_lib/keys");
const validation = require("../api/_lib/validation");
const workoutHandler = require("../api/sync/workout");
const deleteInstallationHandler = require("../api/install/delete");
const serviceWorker = require("../sw");
const { configuredPublicAppUrl } = require("../api/_lib/push");

const root = path.resolve(__dirname, "..");
const INSTALLATION_ID = "installation_123456";
const OTHER_INSTALLATION_ID = "installation_654321";
const TOKEN = "synthetic-public-test-token";

function request(body, overrides = {}) {
  return {
    method: "POST",
    body,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      "x-forwarded-for": "192.0.2.10",
      ...(overrides.headers || {})
    },
    ...overrides
  };
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

function redisResponse(result, { ok = true, status = 200, error = "" } = {}) {
  return Promise.resolve({
    ok,
    status,
    json: async () => error ? { error } : { result }
  });
}

async function withRedisMock(commandHandler, callback) {
  const originalFetch = global.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const commands = [];
  process.env.UPSTASH_REDIS_REST_URL = "https://synthetic-redis.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "synthetic-token";
  global.fetch = async (_url, options) => {
    const command = JSON.parse(options.body);
    commands.push(command);
    return commandHandler(command, commands);
  };
  try {
    await callback(commands);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
}

function validWorkoutBody(overrides = {}) {
  const sessionId = overrides.sessionId || "session-1";
  return {
    installationId: INSTALLATION_ID,
    mutationId: "mutation-1",
    sessionId,
    revision: "2026-07-12T12:00:00.000Z",
    payload: {
      session: { id: sessionId, name: "Synthetic session" },
      exercises: [{ id: "exercise-1", sessionId, name: "Synthetic press" }],
      sets: [{ id: "set-1", exerciseId: "exercise-1", reps: 8, weight: 100 }]
    },
    ...overrides
  };
}

function authorizationRedis(command, commitResult = "synced") {
  if (command[0] === "HGETALL" && command[1] === `cf:install:${INSTALLATION_ID}`) {
    return redisResponse(["installationId", INSTALLATION_ID, "secretHash", hashSecret(TOKEN), "active", "1", "status", "active", "syncConsent", "1"]);
  }
  if (command[0] === "EXPIRE") return redisResponse(1);
  if (command[0] === "EVAL" && String(command[1]).includes("INCR")) return redisResponse([1, 3600]);
  if (command[0] === "EVAL" && String(command[1]).includes("HSET") && String(command[1]).includes("status='synced'")) return redisResponse(commitResult);
  throw new Error(`Unexpected Redis command: ${JSON.stringify(command)}`);
}

async function testValidationAndBoundaries() {
  assert.equal(validation.validInstallationId(INSTALLATION_ID), true);
  assert.equal(validation.validInstallationId("../../other"), false);
  assert.equal(validation.validEntityId("valid-id:1"), true);
  assert.equal(validation.validEntityId("bad/id"), false);
  assert.equal(validation.safeJsonValue(JSON.parse('{"__proto__":{"polluted":true}}')), false);
  assert.equal(validation.safeJsonValue({ value: Number.POSITIVE_INFINITY }), false);
  assert.equal(validation.validHttpsUrl("https://push.example.test/subscription"), true);
  assert.equal(validation.validHttpsUrl("http://push.example.test/subscription"), false);

  const unsupported = response();
  await workoutHandler(request(validWorkoutBody(), { headers: { authorization: `Bearer ${TOKEN}`, "content-type": "text/plain" } }), unsupported);
  assert.equal(unsupported.statusCode, 415);
  assert.equal(unsupported.headers["Cache-Control"], "no-store");
  assert.equal(unsupported.headers["X-Content-Type-Options"], "nosniff");

  const oversized = response();
  const huge = validWorkoutBody();
  huge.payload.session.notes = "x".repeat(workoutHandler.MAX_WORKOUT_BYTES);
  await workoutHandler(request(huge), oversized);
  assert.equal(oversized.statusCode, 413);
}

async function testWorkoutAuthorizationAtomicityAndIdempotency() {
  await withRedisMock((command) => authorizationRedis(command), async (commands) => {
    const denied = response();
    await workoutHandler(request(validWorkoutBody(), { headers: { authorization: "Bearer wrong-token", "content-type": "application/json" } }), denied);
    assert.equal(denied.statusCode, 401);
    assert.equal(commands.some((command) => command[0] === "EVAL" && String(command[1]).includes("status='synced'")), false);
  });

  await withRedisMock((command) => authorizationRedis(command, "duplicate"), async (commands) => {
    const duplicate = response();
    await workoutHandler(request(validWorkoutBody()), duplicate);
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.body.status, "duplicate");
    const commitCommands = commands.filter((command) => command[0] === "EVAL" && String(command[1]).includes("status='synced'"));
    assert.equal(commitCommands.length, 1, "one Redis script must own payload persistence and the mutation marker");
    const script = commitCommands[0][1];
    assert.ok(script.indexOf("HSET") < script.indexOf("SET',KEYS[1]"), "payload persistence must precede the duplicate marker");
    assert.ok(script.includes("EXISTS"), "the atomic script must check idempotency before writing");
  });

  await withRedisMock((command) => {
    if (command[0] === "EVAL" && String(command[1]).includes("status='synced'")) return redisResponse(null, { ok: false, status: 500, error: "synthetic payload write failure" });
    return authorizationRedis(command);
  }, async (commands) => {
    const failed = response();
    await workoutHandler(request(validWorkoutBody()), failed);
    assert.equal(failed.statusCode, 500);
    assert.equal(failed.body.error, "The service could not complete this request.");
    assert.equal(commands.some((command) => command[0] === "SET" && String(command[1]).startsWith("cf:mutation:")), false, "a failed payload write must not be followed by a standalone duplicate marker");
  });

  await withRedisMock((command) => authorizationRedis(command), async () => {
    const hostile = validWorkoutBody();
    hostile.payload.sets[0].exerciseId = "unrelated-exercise";
    const rejected = response();
    await workoutHandler(request(hostile), rejected);
    assert.equal(rejected.statusCode, 400);
    assert.match(rejected.body.error, /set reference/);
  });
}

async function testRateLimit() {
  await withRedisMock((command) => {
    if (command[0] === "EVAL" && String(command[1]).includes("INCR")) return redisResponse([241, 123]);
    return authorizationRedis(command);
  }, async () => {
    const limited = response();
    await workoutHandler(request(validWorkoutBody()), limited);
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.headers["Retry-After"], "123");
  });
}

async function testDeletionScopeAndRevocation() {
  const ownTimerKey = `cf:timer:${INSTALLATION_ID}:t_own`;
  const otherTimerKey = `cf:timer:${OTHER_INSTALLATION_ID}:t_other`;
  const legacyTimerKey = "cf:timer:legacy-own";
  const ownWorkoutKey = `cf:workout:${INSTALLATION_ID}:session-1`;
  const otherWorkoutKey = `cf:workout:${OTHER_INSTALLATION_ID}:session-2`;
  const ownMutationKey = `cf:mutation:${INSTALLATION_ID}:mutation-1`;
  const cleanupKeys = new Set();
  await withRedisMock((command) => {
    if (command[0] === "HGETALL" && command[1] === `cf:install:${INSTALLATION_ID}`) {
      return redisResponse(["installationId", INSTALLATION_ID, "secretHash", hashSecret(TOKEN), "active", "1"]);
    }
    if (command[0] === "HGETALL" && command[1] === ownTimerKey) {
      return redisResponse(["installationId", INSTALLATION_ID, "notificationId", "t_own", "workoutId", "workout-1", "status", "delivered"]);
    }
    if (command[0] === "HGETALL" && command[1] === legacyTimerKey) {
      return redisResponse(["installationId", INSTALLATION_ID, "notificationId", "legacy-own", "workoutId", "workout-legacy", "status", "delivered"]);
    }
    if (command[0] === "HGETALL" && command[1] === otherTimerKey) {
      return redisResponse(["installationId", OTHER_INSTALLATION_ID, "notificationId", "t_other", "workoutId", "workout-other", "status", "delivered"]);
    }
    if (command[0] === "EXPIRE") return redisResponse(1);
    if (command[0] === "EVAL" && String(command[1]).includes("INCR")) return redisResponse([1, 86400]);
    if (command[0] === "EVAL" && String(command[1]).includes("installation_delete_revoke_timer_v3")) return redisResponse("canceled");
    if (command[0] === "EVAL" && String(command[1]).includes("HSET") && !String(command[1]).includes("status='synced'")) return redisResponse(1);
    if (command[0] === "SSCAN" && command[1] === `cf:timers:${INSTALLATION_ID}`) return redisResponse(["0", [ownTimerKey, otherTimerKey]]);
    if (command[0] === "SSCAN" && command[1] === `cf:workouts:${INSTALLATION_ID}`) return redisResponse(["0", [ownWorkoutKey, otherWorkoutKey]]);
    if (command[0] === "SSCAN" && command[1] === `cf:mutations:${INSTALLATION_ID}`) return redisResponse(["0", [ownMutationKey]]);
    if (command[0] === "SCAN" && command[3] === "cf:timer:*") return redisResponse(["0", [ownTimerKey, legacyTimerKey, otherTimerKey]]);
    if (command[0] === "SCAN" && command[3] === `cf:workout:${INSTALLATION_ID}:*`) return redisResponse(["0", [ownWorkoutKey, otherWorkoutKey]]);
    if (command[0] === "SCAN" && command[3] === `cf:mutation:${INSTALLATION_ID}:*`) return redisResponse(["0", [ownMutationKey]]);
    if (command[0] === "SCAN" && command[3] === `cf:active:${INSTALLATION_ID}:*`) return redisResponse(["0", []]);
    if (command[0] === "SADD" && command[1] === `cf:delete:${INSTALLATION_ID}:keys`) {
      command.slice(2).forEach((key) => cleanupKeys.add(key));
      return redisResponse(command.length - 2);
    }
    if (command[0] === "SRANDMEMBER" && command[1] === `cf:delete:${INSTALLATION_ID}:keys`) {
      const values = [...cleanupKeys];
      return redisResponse(values);
    }
    if (command[0] === "SREM" && command[1] === `cf:delete:${INSTALLATION_ID}:keys`) {
      command.slice(2).forEach((key) => cleanupKeys.delete(key));
      return redisResponse(command.length - 2);
    }
    if (command[0] === "SCARD") return redisResponse(cleanupKeys.size);
    if (command[0] === "DEL" || command[0] === "SREM") return redisResponse(command.length - 1);
    throw new Error(`Unexpected Redis command: ${JSON.stringify(command)}`);
  }, async (commands) => {
    const deleted = response();
    await deleteInstallationHandler(request({ installationId: INSTALLATION_ID }), deleted);
    assert.equal(deleted.statusCode, 200);
    assert.equal(deleted.body.status, "deleted");
    assert.deepEqual(deleted.body.deleted, { timers: 2, workouts: 1, mutations: 1 });
    const revocation = commands.find((command) => command[0] === "EVAL" && String(command).includes("revokedAt"));
    assert.ok(revocation, "authorization must be revoked before cleanup");
    const deletedKeys = commands.filter((command) => command[0] === "DEL").flatMap((command) => command.slice(1));
    assert.ok(deletedKeys.includes(ownTimerKey));
    assert.ok(deletedKeys.includes(legacyTimerKey));
    assert.ok(deletedKeys.includes(ownWorkoutKey));
    assert.ok(!deletedKeys.includes(otherTimerKey));
    assert.ok(!deletedKeys.includes(otherWorkoutKey));
  });
}

function testTimerScopingAndPublicUrl() {
  const first = scopedTimerId(INSTALLATION_ID, "timer-1:1");
  const repeat = scopedTimerId(INSTALLATION_ID, "timer-1:1");
  const other = scopedTimerId(OTHER_INSTALLATION_ID, "timer-1:1");
  assert.equal(first, repeat);
  assert.notEqual(first, other);
  assert.notEqual(timerKey(INSTALLATION_ID, first), timerKey(OTHER_INSTALLATION_ID, first));

  const originalUrl = process.env.PUBLIC_APP_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.PUBLIC_APP_URL = "https://fitness.example.test";
  assert.equal(configuredPublicAppUrl(), "https://fitness.example.test");
  process.env.PUBLIC_APP_URL = "http://fitness.example.test";
  assert.equal(configuredPublicAppUrl(), "");
  process.env.PUBLIC_APP_URL = "https://user:secret@fitness.example.test";
  assert.equal(configuredPublicAppUrl(), "");
  process.env.PUBLIC_APP_URL = "https://fitness.example.test/untrusted/path";
  assert.equal(configuredPublicAppUrl(), "");
  if (originalUrl === undefined) delete process.env.PUBLIC_APP_URL; else process.env.PUBLIC_APP_URL = originalUrl;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
}

function testServiceWorkerPrivacy() {
  const origin = "https://fitness.example.test";
  assert.equal(serviceWorker.isSensitivePath("/api/sync/workout"), true);
  assert.equal(serviceWorker.isSensitivePath("/%70rivate-personal-data/workout.json"), true);
  assert.equal(serviceWorker.isSensitivePath("/personal_fitness_data/raw/data.json"), true);
  assert.equal(serviceWorker.isSensitivePath("/backup.sqlite"), true);
  assert.equal(serviceWorker.isPublicCacheUrl(`${origin}/index.html`, origin), true);
  assert.equal(serviceWorker.isPublicCacheUrl(`${origin}/index.html?private=1`, origin), false);
  assert.equal(serviceWorker.isPublicCacheUrl("https://other.example/index.html", origin), false);
  assert.equal(serviceWorker.APP_SHELL.some((entry) => serviceWorker.isSensitivePath(entry)), false);
  assert.equal(serviceWorker.safeNotificationUrl("https://evil.example/phish", origin), `${origin}/`);
  assert.equal(serviceWorker.safeNotificationUrl("/private-personal-data/a.json", origin), `${origin}/`);
  assert.equal(serviceWorker.safeNotificationUrl("/?rest=complete#lift", origin), `${origin}/?rest=complete#lift`);
  assert.equal(serviceWorker.responseCanBeCached({ ok: true, type: "basic", headers: { get: () => "private, max-age=60" } }), false);
  assert.equal(serviceWorker.responseCanBeCached({ ok: true, type: "basic", headers: { get: () => "public, max-age=60" } }), true);
  serviceWorker.rememberCanceledTimer("timer-1", 1000);
  assert.equal(serviceWorker.timerWasCanceled("timer-1", 1001), true);
  assert.equal(serviceWorker.timerWasCanceled("timer-1", 1000 + 27 * 60 * 60 * 1000), false);
}

function testPackagingAndNativeGuards() {
  const sync = fs.readFileSync(path.join(root, "scripts", "sync-web.ps1"), "utf8");
  const verify = fs.readFileSync(path.join(root, "scripts", "verify-pwa.ps1"), "utf8");
  const manifest = fs.readFileSync(path.join(root, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
  const filePaths = fs.readFileSync(path.join(root, "android", "app", "src", "main", "res", "xml", "file_paths.xml"), "utf8");
  const extraction = fs.readFileSync(path.join(root, "android", "app", "src", "main", "res", "xml", "data_extraction_rules.xml"), "utf8");
  assert.match(sync, /private-personal-data/);
  assert.match(sync, /StartsWith\(\$resolvedPublicRoot[\s\S]+Remove-Item -LiteralPath \$resolvedCandidate -Recurse -Force/);
  assert.ok(sync.indexOf("Remove-Item") < sync.indexOf("Copy-Item"), "private payload pruning must precede public copying");
  assert.doesNotMatch(sync, /personal_fitness_data\\derived|Included private aggregate/);
  for (const required of ["programming-family-ledger.js", "guided-mesocycle.js", "secondary-page.css", "nutrition_strategies.json", "icon-1024.png"]) {
    assert.ok(sync.includes(required), `sync list must include ${required}`);
    assert.ok(verify.includes(required), `parity list must include ${required}`);
  }
  assert.match(verify, /Get-FileHash/);
  assert.match(verify, /Sensitive files found in public\/native payload/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  assert.doesNotMatch(filePaths, /external-path|path="\."/);
  assert.match(filePaths, /path="share\/"/);
  assert.match(extraction, /<exclude domain="database" path="\."/);
}

async function main() {
  await testValidationAndBoundaries();
  await testWorkoutAuthorizationAtomicityAndIdempotency();
  await testRateLimit();
  await testDeletionScopeAndRevocation();
  testTimerScopingAndPublicUrl();
  testServiceWorkerPrivacy();
  testPackagingAndNativeGuards();
  console.log("Security/platform tests passed (schemas, auth, quotas, atomic sync, deletion, cache privacy, and native packaging)." );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
