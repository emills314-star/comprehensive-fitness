const { authorizeInstallation, checkRateLimit, rateLimitResponse } = require("../_lib/security");
const {
  RETENTION_SECONDS,
  activeTimerKey,
  installationKey,
  installationMutationsKey,
  installationTimersKey,
  installationWorkoutsKey
} = require("../_lib/keys");
const { getHash, redis, setHashWithTtl } = require("../_lib/redis");
const { qstashClient } = require("../_lib/push");
const { apiHandler, json, methodNotAllowed } = require("../_lib/response");
const { validInstallationId, validateJsonRequest } = require("../_lib/validation");

const MAX_REGISTERED_KEYS = 2000;

function scopedMembers(values, prefix) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value.startsWith(prefix)))]
    .slice(0, MAX_REGISTERED_KEYS);
}

async function scanKeys(pattern) {
  const keys = [];
  let cursor = "0";
  let truncated = false;
  do {
    const result = await redis(["SCAN", cursor, "MATCH", pattern, "COUNT", "200"]);
    cursor = String(Array.isArray(result) ? result[0] : "0");
    const page = Array.isArray(result?.[1]) ? result[1] : [];
    for (const key of page) {
      if (typeof key === "string" && key.length <= 512) keys.push(key);
      if (keys.length >= MAX_REGISTERED_KEYS) { truncated = cursor !== "0" || page.length > 0; break; }
    }
    if (keys.length >= MAX_REGISTERED_KEYS) break;
  } while (cursor !== "0");
  return { keys: keys.slice(0, MAX_REGISTERED_KEYS), truncated };
}

async function deleteKeyChunks(keys) {
  for (let index = 0; index < keys.length; index += 100) {
    const chunk = keys.slice(index, index + 100);
    if (chunk.length) await redis(["DEL", ...chunk]);
  }
}

module.exports = apiHandler(async function handler(req, res) {
  if (!["POST", "DELETE"].includes(req.method)) return methodNotAllowed(res, ["POST", "DELETE"]);
  const parsed = validateJsonRequest(req, 2 * 1024);
  if (!parsed.ok) return json(res, parsed.status, { error: parsed.error });
  const { installationId } = parsed.body;
  if (!validInstallationId(installationId)) return json(res, 400, { error: "A valid installation is required." });
  if (!await authorizeInstallation(req, installationId)) return json(res, 401, { error: "Installation authorization failed." });
  const limit = await checkRateLimit("installation-delete", installationId, 3, 24 * 60 * 60);
  if (!limit.allowed) return rateLimitResponse(res, limit);

  const installKey = installationKey(installationId);
  await setHashWithTtl(installKey, {
    active: "0",
    secretHash: "",
    revokedAt: new Date().toISOString()
  }, RETENTION_SECONDS.installation);

  const timerRegistry = installationTimersKey(installationId);
  const workoutRegistry = installationWorkoutsKey(installationId);
  const mutationRegistry = installationMutationsKey(installationId);
  const [rawTimers, rawWorkouts, rawMutations, scannedTimers, scannedWorkouts, scannedMutations, scannedActive] = await Promise.all([
    redis(["SMEMBERS", timerRegistry]),
    redis(["SMEMBERS", workoutRegistry]),
    redis(["SMEMBERS", mutationRegistry]),
    scanKeys("cf:timer:*"),
    scanKeys(`cf:workout:${installationId}:*`),
    scanKeys(`cf:mutation:${installationId}:*`),
    scanKeys(`cf:active:${installationId}:*`)
  ]);
  const candidateTimerKeys = [...new Set([...(Array.isArray(rawTimers) ? rawTimers : []), ...scannedTimers.keys])]
    .filter((key) => typeof key === "string" && key.startsWith("cf:timer:") && key.length <= 512)
    .slice(0, MAX_REGISTERED_KEYS);
  const workoutKeys = scopedMembers([...(Array.isArray(rawWorkouts) ? rawWorkouts : []), ...scannedWorkouts.keys], `cf:workout:${installationId}:`);
  const mutationKeys = scopedMembers([...(Array.isArray(rawMutations) ? rawMutations : []), ...scannedMutations.keys], `cf:mutation:${installationId}:`);

  let schedulerCancellationFailures = 0;
  const activeKeys = [];
  const timerKeys = [];
  for (const key of candidateTimerKeys) {
    const record = await getHash(key);
    if (record.installationId !== installationId) continue;
    timerKeys.push(key);
    if (record.workoutId) activeKeys.push(activeTimerKey(installationId, record.workoutId));
    if (record.status === "scheduled" && record.messageId) {
      let canceled = false;
      try { await qstashClient().messages.delete(record.messageId); canceled = true; } catch { canceled = false; }
      if (!canceled) schedulerCancellationFailures += 1;
    }
  }

  const allKeys = [...new Set([
    ...timerKeys,
    ...workoutKeys,
    ...mutationKeys,
    ...activeKeys,
    ...scannedActive.keys.filter((key) => key.startsWith(`cf:active:${installationId}:`)),
    timerRegistry,
    workoutRegistry,
    mutationRegistry,
    installKey
  ])];
  await deleteKeyChunks(allKeys);
  await redis(["SREM", "cf:installations", installationId]);

  const cleanupTruncated = [rawTimers, rawWorkouts, rawMutations].some((values) => Array.isArray(values) && values.length > MAX_REGISTERED_KEYS) ||
    [scannedTimers, scannedWorkouts, scannedMutations, scannedActive].some((scan) => scan.truncated) ||
    candidateTimerKeys.length >= MAX_REGISTERED_KEYS;
  return json(res, 200, {
    status: "deleted",
    installationId,
    deleted: { timers: timerKeys.length, workouts: workoutKeys.length, mutations: mutationKeys.length },
    schedulerCancellationFailures,
    cleanupTruncated
  });
});

module.exports.MAX_REGISTERED_KEYS = MAX_REGISTERED_KEYS;
module.exports.scanKeys = scanKeys;
module.exports.scopedMembers = scopedMembers;
