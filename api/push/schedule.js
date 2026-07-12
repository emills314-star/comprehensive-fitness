const crypto = require("crypto");
const { authorizeInstallation, checkRateLimit, rateLimitResponse } = require("../_lib/security");
const {
  RETENTION_SECONDS,
  activeTimerKey,
  installationKey,
  installationTimersKey,
  legacyTimerKey,
  scopedTimerId,
  timerKey
} = require("../_lib/keys");
const { getHash, redis } = require("../_lib/redis");
const { publicAppUrl, qstashClient } = require("../_lib/push");
const { apiHandler, json, methodNotAllowed } = require("../_lib/response");
const { boundedString, validEntityId, validInstallationId, validInteger, validateJsonRequest } = require("../_lib/validation");

const PREPARE_TIMER_SCRIPT = [
  "-- timer_prepare_v2",
  "local installationStatus=redis.call('HGET',KEYS[3],'status')",
  "local installationActive=redis.call('HGET',KEYS[3],'active')",
  "if (installationStatus and installationStatus ~= 'active') or installationActive ~= '1' then return {'revoked','',-1} end",
  "local existingStatus=redis.call('HGET',KEYS[1],'status')",
  "if existingStatus == 'delivered' or existingStatus == 'canceled' then return {existingStatus,'',-1} end",
  "redis.call('HSET',KEYS[1],unpack(ARGV,4))",
  "redis.call('EXPIRE',KEYS[1],ARGV[1])",
  "redis.call('SADD',KEYS[2],KEYS[1])",
  "redis.call('EXPIRE',KEYS[2],ARGV[1])",
  "local previous=redis.call('GET',KEYS[4])",
  "local previousTtl=redis.call('PTTL',KEYS[4])",
  "redis.call('SET',KEYS[4],ARGV[3],'PX',ARGV[2])",
  "return {'prepared',previous or '',previousTtl}"
].join(";");

const FINALIZE_TIMER_SCRIPT = [
  "-- timer_finalize_v2",
  "local installationStatus=redis.call('HGET',KEYS[2],'status')",
  "local installationActive=redis.call('HGET',KEYS[2],'active')",
  "if (installationStatus and installationStatus ~= 'active') or installationActive ~= '1' then return 'revoked' end",
  "local currentStatus=redis.call('HGET',KEYS[1],'status')",
  "if currentStatus == 'delivered' then return 'delivered' end",
  "if currentStatus ~= 'scheduling' and currentStatus ~= 'publish_failed' then return currentStatus or 'missing' end",
  "redis.call('HSET',KEYS[1],'status','scheduled','messageId',ARGV[1],'schedulingError','')",
  "redis.call('EXPIRE',KEYS[1],ARGV[2])",
  "return 'scheduled'"
].join(";");

const FAIL_TIMER_SCRIPT = [
  "-- timer_publish_failed_v2",
  "local installationStatus=redis.call('HGET',KEYS[3],'status')",
  "local installationActive=redis.call('HGET',KEYS[3],'active')",
  "if (installationStatus and installationStatus ~= 'active') or installationActive ~= '1' then return 'revoked' end",
  "if redis.call('EXISTS',KEYS[1]) == 1 and redis.call('HGET',KEYS[1],'status') == 'scheduling' then",
  "redis.call('HSET',KEYS[1],'status','publish_failed','schedulingError',ARGV[4])",
  "redis.call('EXPIRE',KEYS[1],ARGV[5])",
  "end",
  "if redis.call('GET',KEYS[2]) == ARGV[1] then",
  "if ARGV[2] ~= '' and tonumber(ARGV[3]) and tonumber(ARGV[3]) > 0 then redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3]) else redis.call('DEL',KEYS[2]) end",
  "end",
  "return 'publish_failed'"
].join(";");
const REPLACE_TIMER_SCRIPT = [
  "-- timer_replace_v2",
  "local installationStatus=redis.call('HGET',KEYS[2],'status')",
  "local installationActive=redis.call('HGET',KEYS[2],'active')",
  "if (installationStatus and installationStatus ~= 'active') or installationActive ~= '1' then return 'revoked' end",
  "if redis.call('EXISTS',KEYS[1]) == 0 then return 'missing' end",
  "redis.call('HSET',KEYS[1],'status','canceled','canceledAt',ARGV[1],'cancelReason',ARGV[2])",
  "redis.call('EXPIRE',KEYS[1],ARGV[3])",
  "return 'canceled'"
].join(";");

async function loadTimerRecord(installationId, notificationId) {
  const scopedKey = timerKey(installationId, notificationId);
  const scoped = await getHash(scopedKey);
  if (scoped.notificationId) return { key: scopedKey, record: scoped };
  const legacyKey = legacyTimerKey(notificationId);
  const legacy = await getHash(legacyKey);
  return legacy.installationId === installationId ? { key: legacyKey, record: legacy } : { key: scopedKey, record: {} };
}

async function cancelRecord(installationId, notificationId, reason) {
  if (!notificationId) return;
  const { key, record } = await loadTimerRecord(installationId, notificationId);
  if (!record.notificationId || !["scheduling", "scheduled", "retrying", "publish_failed"].includes(record.status)) return;
  if (record.messageId) {
    try { await qstashClient().messages.delete(record.messageId); } catch { /* Expiry and active-key checks remain authoritative. */ }
  }
  await redis([
    "EVAL", REPLACE_TIMER_SCRIPT, "2", key, installationKey(installationId),
    new Date().toISOString(), boundedString(reason, 64) || "replaced", String(RETENTION_SECONDS.timer)
  ]);
}

module.exports = apiHandler(async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const parsed = validateJsonRequest(req, 16 * 1024);
  if (!parsed.ok) return json(res, parsed.status, { error: parsed.error });
  const body = parsed.body;
  if (!validInstallationId(body.installationId)) return json(res, 400, { error: "A valid installation is required." });
  const installation = await authorizeInstallation(req, body.installationId);
  if (!installation) return json(res, 401, { error: "Installation authorization failed." });
  const limit = await checkRateLimit("push-schedule", body.installationId, 180, 60 * 60);
  if (!limit.allowed) return rateLimitResponse(res, limit);

  const restEndTime = Number(body.restEndTime || 0);
  const timerVersion = Number(body.timerVersion || 1);
  if (![body.workoutId, body.exerciseId, body.setId].every(validEntityId) ||
      (body.upcomingSetId && !validEntityId(body.upcomingSetId)) ||
      !validInteger(timerVersion, 1, 1000000) || !Number.isSafeInteger(restEndTime)) {
    return json(res, 400, { error: "Workout, exercise, set, timer version, and completion time are required." });
  }
  if (restEndTime < Date.now() + 1000 || restEndTime > Date.now() + 24 * 60 * 60 * 1000) {
    return json(res, 400, { error: "The rest completion time is outside the supported range." });
  }
  if (body.notificationId != null && body.notificationId !== "" && !validEntityId(body.notificationId)) {
    return json(res, 400, { error: "Invalid timer identifier." });
  }

  const requestedId = body.notificationId || crypto.randomUUID();
  const notificationId = scopedTimerId(body.installationId, `${requestedId}:${timerVersion}`);
  const recordKey = timerKey(body.installationId, notificationId);
  const timersKey = installationTimersKey(body.installationId);
  const installKey = installationKey(body.installationId);
  const activeKey = activeTimerKey(body.installationId, body.workoutId);
  const activeTtlMs = Math.max(60000, restEndTime - Date.now() + 60 * 60 * 1000);
  const createdAt = new Date().toISOString();
  const record = {
    notificationId,
    clientTimerId: requestedId,
    installationId: body.installationId,
    userId: installation.userId || body.installationId,
    workoutId: body.workoutId,
    exerciseId: body.exerciseId,
    setId: body.setId,
    upcomingSetId: body.upcomingSetId || "",
    upcomingSetNumber: validInteger(body.upcomingSetNumber, 1, 1000) ? body.upcomingSetNumber : "",
    upcomingSetLabel: boundedString(body.upcomingSetLabel, 120, { allowEmpty: true }) || "",
    timerVersion: Number(body.timerVersion || 1),
    exerciseName: boundedString(body.exerciseName, 120, { allowEmpty: true }) || "Workout",
    messageDetail: body.messageDetail === "private" ? "private" : "exercise-set",
    scheduledCompletionAt: new Date(restEndTime).toISOString(),
    status: "scheduling",
    createdAt,
    canceledAt: "",
    deliveredAt: "",
    messageId: "",
    schedulingError: ""
  };
  const prepared = await redis([
    "EVAL", PREPARE_TIMER_SCRIPT, "4", recordKey, timersKey, installKey, activeKey,
    String(RETENTION_SECONDS.timer), String(activeTtlMs), notificationId,
    ...Object.entries(record).flatMap(([field, value]) => [field, String(value)])
  ]);
  const prepareStatus = String(Array.isArray(prepared) ? prepared[0] : prepared || "");
  const previousId = String(Array.isArray(prepared) ? prepared[1] || "" : "");
  const previousTtl = Number(Array.isArray(prepared) ? prepared[2] : -1);
  if (prepareStatus === "revoked") return json(res, 410, { status: "revoked", error: "This installation is deleting or deleted." });
  if (["delivered", "canceled"].includes(prepareStatus)) return json(res, 200, { notificationId, status: prepareStatus, idempotent: true });
  if (prepareStatus !== "prepared") return json(res, 409, { status: prepareStatus || "conflict", error: "Timer scheduling state could not be prepared." });

  let response;
  try {
    response = await qstashClient().publishJSON({
      url: `${publicAppUrl()}/api/push/deliver`,
      body: { installationId: body.installationId, notificationId },
      notBefore: Math.ceil(restEndTime / 1000),
      retries: 3,
      deduplicationId: notificationId,
      label: "fitness-rest-timer"
    });
  } catch (error) {
    const failedState = await redis([
      "EVAL", FAIL_TIMER_SCRIPT, "3", recordKey, activeKey, installKey,
      notificationId, previousId, String(previousTtl), String(error?.message || error).slice(0, 240), String(RETENTION_SECONDS.timer)
    ]);
    if (failedState === "revoked") return json(res, 410, { status: "revoked", error: "This installation is deleting or deleted." });
    return json(res, 502, { status: "publish_failed", error: "Timer scheduling failed and can be retried." });
  }

  const messageId = boundedString(response.messageId, 256);
  if (!messageId) {
    const failedState = await redis([
      "EVAL", FAIL_TIMER_SCRIPT, "3", recordKey, activeKey, installKey,
      notificationId, previousId, String(previousTtl), "Scheduler returned an invalid response.", String(RETENTION_SECONDS.timer)
    ]);
    if (failedState === "revoked") return json(res, 410, { status: "revoked", error: "This installation is deleting or deleted." });
    return json(res, 502, { status: "publish_failed", error: "The scheduler returned an invalid response." });
  }
  const finalized = String(await redis([
    "EVAL", FINALIZE_TIMER_SCRIPT, "2", recordKey, installKey, messageId, String(RETENTION_SECONDS.timer)
  ]) || "");
  if (finalized === "revoked") {
    try { await qstashClient().messages.delete(messageId); } catch { /* Tombstone makes any signed delivery inactive. */ }
    return json(res, 410, { status: "revoked", error: "This installation is deleting or deleted." });
  }
  if (previousId && previousId !== notificationId) await cancelRecord(body.installationId, previousId, "replaced");
  return json(res, 200, { notificationId, messageId, status: finalized === "delivered" ? "delivered" : "scheduled" });
});

module.exports.FAIL_TIMER_SCRIPT = FAIL_TIMER_SCRIPT;
module.exports.FINALIZE_TIMER_SCRIPT = FINALIZE_TIMER_SCRIPT;
module.exports.PREPARE_TIMER_SCRIPT = PREPARE_TIMER_SCRIPT;
module.exports.REPLACE_TIMER_SCRIPT = REPLACE_TIMER_SCRIPT;
module.exports.cancelRecord = cancelRecord;
module.exports.loadTimerRecord = loadTimerRecord;
