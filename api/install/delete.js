const { authorizeDeletion, checkRateLimit, rateLimitResponse } = require("../_lib/security");
const {
  RETENTION_SECONDS,
  activeTimerKey,
  installationDeletionKeysKey,
  installationKey,
  installationMutationsKey,
  installationTimersKey,
  installationWorkoutsKey
} = require("../_lib/keys");
const { getHash, redis, setHashWithTtl } = require("../_lib/redis");
const { qstashClient } = require("../_lib/push");
const { apiHandler, json, methodNotAllowed } = require("../_lib/response");
const { validInstallationId, validateJsonRequest } = require("../_lib/validation");

const REGISTRY_PAGE_SIZE = 50;
const CLEANUP_DELETE_BATCH = 100;
const MAX_LEGACY_SCAN_PAGES_PER_REQUEST = 4;

const REVOKE_TIMER_FOR_DELETION_SCRIPT = [
  "-- installation_delete_revoke_timer_v3",
  "if redis.call('EXISTS',KEYS[1]) == 0 then return 'missing' end",
  "if redis.call('HGET',KEYS[1],'installationId') ~= ARGV[1] then return 'foreign' end",
  "redis.call('HSET',KEYS[1],'status','canceled','canceledAt',ARGV[2],'cancelReason','installation-deleted')",
  "redis.call('HDEL',KEYS[1],'deliveryAttemptToken','deliveryClaimedAt','deliveryClaimExpiresAtMs')",
  "redis.call('EXPIRE',KEYS[1],ARGV[3])",
  "return 'canceled'"
].join(";");

function normalizedPage(result) {
  return {
    cursor: String(Array.isArray(result) ? result[0] : "0"),
    keys: (Array.isArray(result?.[1]) ? result[1] : []).filter((key) => typeof key === "string" && key.length <= 512)
  };
}

async function scanCleanupPage({ command, key, cursor = "0", pattern = "" }) {
  if (command === "SSCAN") return normalizedPage(await redis(["SSCAN", key, String(cursor), "COUNT", String(REGISTRY_PAGE_SIZE)]));
  if (command === "SCAN") return normalizedPage(await redis(["SCAN", String(cursor), "MATCH", pattern, "COUNT", String(REGISTRY_PAGE_SIZE)]));
  throw new Error(`Unsupported cleanup scan command: ${command}`);
}

async function addCleanupKeys(cleanupKey, keys) {
  const unique = [...new Set(keys)];
  if (!unique.length) return;
  await redis(["SADD", cleanupKey, ...unique]);
  await redis(["EXPIRE", cleanupKey, String(RETENTION_SECONDS.installation)]);
}

async function timerOwnedKeys(installationId, keys) {
  const owned = [];
  for (const key of keys) {
    if (!key.startsWith("cf:timer:")) continue;
    const record = await getHash(key);
    if (record.installationId !== installationId) continue;
    owned.push(key);
    if (record.workoutId) owned.push(activeTimerKey(installationId, record.workoutId));
  }
  return owned;
}

async function discoverCleanupKeys(installationId, installation) {
  const cleanupKey = installationDeletionKeysKey(installationId);
  const updates = { deletePhase: "discover" };
  let discovered = 0;
  let legacyPages = 0;
  const registrySpecs = [
    { key: installationTimersKey(installationId), cursor: "deleteTimersRegistryCursor", done: "deleteTimersRegistryDone", type: "timer" },
    { key: installationWorkoutsKey(installationId), cursor: "deleteWorkoutsRegistryCursor", done: "deleteWorkoutsRegistryDone", prefix: `cf:workout:${installationId}:` },
    { key: installationMutationsKey(installationId), cursor: "deleteMutationsRegistryCursor", done: "deleteMutationsRegistryDone", prefix: `cf:mutation:${installationId}:` }
  ];
  for (const spec of registrySpecs) {
    if (installation[spec.done] === "1") { updates[spec.done] = "1"; updates[spec.cursor] = "0"; continue; }
    const page = await scanCleanupPage({ command: "SSCAN", key: spec.key, cursor: installation[spec.cursor] || "0" });
    const keys = spec.type === "timer"
      ? await timerOwnedKeys(installationId, page.keys)
      : page.keys.filter((key) => key.startsWith(spec.prefix));
    await addCleanupKeys(cleanupKey, keys);
    discovered += keys.length;
    updates[spec.cursor] = page.cursor;
    updates[spec.done] = page.cursor === "0" ? "1" : "0";
  }

  const fallbackSpecs = [
    { pattern: "cf:timer:*", cursor: "deleteLegacyTimerCursor", done: "deleteLegacyTimerDone", type: "timer" },
    { pattern: `cf:workout:${installationId}:*`, cursor: "deleteWorkoutScanCursor", done: "deleteWorkoutScanDone", prefix: `cf:workout:${installationId}:` },
    { pattern: `cf:mutation:${installationId}:*`, cursor: "deleteMutationScanCursor", done: "deleteMutationScanDone", prefix: `cf:mutation:${installationId}:` },
    { pattern: `cf:active:${installationId}:*`, cursor: "deleteActiveScanCursor", done: "deleteActiveScanDone", prefix: `cf:active:${installationId}:` }
  ];
  for (const spec of fallbackSpecs) {
    if (installation[spec.done] === "1") { updates[spec.done] = "1"; updates[spec.cursor] = "0"; continue; }
    if (legacyPages >= MAX_LEGACY_SCAN_PAGES_PER_REQUEST) break;
    const page = await scanCleanupPage({ command: "SCAN", cursor: installation[spec.cursor] || "0", pattern: spec.pattern });
    legacyPages += 1;
    const keys = spec.type === "timer"
      ? await timerOwnedKeys(installationId, page.keys)
      : page.keys.filter((key) => key.startsWith(spec.prefix));
    await addCleanupKeys(cleanupKey, keys);
    discovered += keys.length;
    updates[spec.cursor] = page.cursor;
    updates[spec.done] = page.cursor === "0" ? "1" : "0";
  }

  const allDone = [...registrySpecs, ...fallbackSpecs].every((spec) => updates[spec.done] === "1" || installation[spec.done] === "1");
  return { allDone, cleanupKey, discovered, legacyPages, updates };
}

async function deleteKeyChunks(keys) {
  for (let index = 0; index < keys.length; index += 100) {
    const chunk = keys.slice(index, index + 100);
    if (chunk.length) await redis(["DEL", ...chunk]);
  }
}

function countValue(record, field) {
  const value = Number(record[field] || 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

async function deleteCleanupBatch(installationId, cleanupKey) {
  const selected = await redis(["SRANDMEMBER", cleanupKey, String(CLEANUP_DELETE_BATCH)]);
  const candidates = Array.isArray(selected) ? selected : typeof selected === "string" && selected ? [selected] : [];
  const keysToDelete = [];
  let timers = 0;
  let workouts = 0;
  let mutations = 0;
  let schedulerCancellationFailures = 0;
  for (const key of [...new Set(candidates)]) {
    if (key.startsWith("cf:timer:")) {
      const record = await getHash(key);
      if (record.installationId !== installationId) continue;
      const revoked = String(await redis([
        "EVAL", REVOKE_TIMER_FOR_DELETION_SCRIPT, "1", key,
        installationId, new Date().toISOString(), String(RETENTION_SECONDS.timer)
      ]) || "");
      if (revoked !== "canceled") continue;
      if (record.messageId) {
        try { await qstashClient().messages.delete(record.messageId); } catch { schedulerCancellationFailures += 1; }
      }
      keysToDelete.push(key);
      if (record.workoutId) keysToDelete.push(activeTimerKey(installationId, record.workoutId));
      timers += 1;
    } else if (key.startsWith(`cf:workout:${installationId}:`)) {
      keysToDelete.push(key);
      workouts += 1;
    } else if (key.startsWith(`cf:mutation:${installationId}:`)) {
      keysToDelete.push(key);
      mutations += 1;
    } else if (key.startsWith(`cf:active:${installationId}:`)) {
      keysToDelete.push(key);
    }
  }
  await deleteKeyChunks([...new Set(keysToDelete)]);
  if (candidates.length) await redis(["SREM", cleanupKey, ...candidates]);
  const remaining = Number(await redis(["SCARD", cleanupKey]) || 0);
  return { remaining, schedulerCancellationFailures, timers, workouts, mutations };
}

module.exports = apiHandler(async function handler(req, res) {
  if (!["POST", "DELETE"].includes(req.method)) return methodNotAllowed(res, ["POST", "DELETE"]);
  const parsed = validateJsonRequest(req, 2 * 1024);
  if (!parsed.ok) return json(res, parsed.status, { error: parsed.error });
  const { installationId } = parsed.body;
  if (!validInstallationId(installationId)) return json(res, 400, { error: "A valid installation is required." });
  const installation = await authorizeDeletion(req, installationId);
  if (!installation) return json(res, 401, { error: "Installation authorization failed." });
  if (installation.status === "deleted") return json(res, 200, { status: "deleted", installationId, idempotent: true });

  const initialDelete = installation.status === "active" || (!installation.status && installation.active === "1");
  if (initialDelete) {
    const limit = await checkRateLimit("installation-delete", installationId, 3, 24 * 60 * 60);
    if (!limit.allowed) return rateLimitResponse(res, limit);
  }

  const installKey = installationKey(installationId);
  const now = new Date().toISOString();
  await setHashWithTtl(installKey, {
    status: "deleting",
    active: "0",
    secretHash: installation.secretHash,
    revokedAt: installation.revokedAt || now,
    lastDeleteAttemptAt: now,
    deletePhase: installation.deletePhase || "discover"
  }, RETENTION_SECONDS.installation);

  const totals = {
    timers: countValue(installation, "deleteTimersRemoved"),
    workouts: countValue(installation, "deleteWorkoutsRemoved"),
    mutations: countValue(installation, "deleteMutationsRemoved")
  };
  let cancellationFailures = countValue(installation, "deleteSchedulerCancellationFailures");
  const discovery = await discoverCleanupKeys(installationId, installation);
  await setHashWithTtl(installKey, { ...discovery.updates, lastDeleteAttemptAt: new Date().toISOString() }, RETENTION_SECONDS.installation);
  if (!discovery.allDone) {
    return json(res, 202, {
      status: "deleting", installationId, phase: "discover", deleted: totals,
      schedulerCancellationFailures: cancellationFailures, cleanupTruncated: true, retryable: true
    });
  }

  const batch = await deleteCleanupBatch(installationId, discovery.cleanupKey);
  totals.timers += batch.timers;
  totals.workouts += batch.workouts;
  totals.mutations += batch.mutations;
  cancellationFailures += batch.schedulerCancellationFailures;
  const progress = {
    deletePhase: batch.remaining > 0 ? "delete" : "complete",
    deleteTimersRemoved: String(totals.timers),
    deleteWorkoutsRemoved: String(totals.workouts),
    deleteMutationsRemoved: String(totals.mutations),
    deleteSchedulerCancellationFailures: String(cancellationFailures),
    lastDeleteAttemptAt: new Date().toISOString()
  };
  if (batch.remaining > 0) {
    await setHashWithTtl(installKey, progress, RETENTION_SECONDS.installation);
    return json(res, 202, {
      status: "deleting", installationId, phase: "delete", deleted: totals,
      schedulerCancellationFailures: cancellationFailures, cleanupTruncated: true, retryable: true
    });
  }

  await deleteKeyChunks([
    discovery.cleanupKey,
    installationTimersKey(installationId),
    installationWorkoutsKey(installationId),
    installationMutationsKey(installationId)
  ]);
  await redis(["SREM", "cf:installations", installationId]);
  await setHashWithTtl(installKey, {
    ...progress,
    status: "deleted",
    active: "0",
    secretHash: installation.secretHash,
    endpoint: "",
    p256dh: "",
    auth: "",
    userId: "",
    deviceId: "",
    deletedAt: new Date().toISOString()
  }, RETENTION_SECONDS.installation);
  return json(res, 200, {
    status: "deleted", installationId, deleted: totals,
    schedulerCancellationFailures: cancellationFailures, cleanupTruncated: false
  });
});

module.exports.CLEANUP_DELETE_BATCH = CLEANUP_DELETE_BATCH;
module.exports.MAX_LEGACY_SCAN_PAGES_PER_REQUEST = MAX_LEGACY_SCAN_PAGES_PER_REQUEST;
module.exports.REGISTRY_PAGE_SIZE = REGISTRY_PAGE_SIZE;
module.exports.REVOKE_TIMER_FOR_DELETION_SCRIPT = REVOKE_TIMER_FOR_DELETION_SCRIPT;
module.exports.deleteCleanupBatch = deleteCleanupBatch;
module.exports.discoverCleanupKeys = discoverCleanupKeys;
module.exports.scanCleanupPage = scanCleanupPage;
