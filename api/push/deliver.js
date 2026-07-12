const { RETENTION_SECONDS, activeTimerKey, installationKey, legacyTimerKey } = require("../_lib/keys");
const { getHash, redis } = require("../_lib/redis");
const { configureWebPush, configuredPublicAppUrl, qstashReceiver } = require("../_lib/push");
const { apiHandler, json, methodNotAllowed } = require("../_lib/response");
const { contentType, isPlainObject, jsonByteLength, validEntityId, validInstallationId } = require("../_lib/validation");
const { loadTimerRecord } = require("./schedule");

const DELIVERABLE_TIMER_STATES = new Set(["scheduling", "scheduled", "retrying"]);
const UPDATE_TIMER_STATE_SCRIPT = [
  "-- timer_state_v2",
  "local installationStatus=redis.call('HGET',KEYS[2],'status')",
  "local installationActive=redis.call('HGET',KEYS[2],'active')",
  "if (installationStatus and installationStatus ~= 'active') or installationActive ~= '1' then return 'revoked' end",
  "if redis.call('EXISTS',KEYS[1]) == 0 then return 'missing' end",
  "redis.call('HSET',KEYS[1],unpack(ARGV,2))",
  "redis.call('EXPIRE',KEYS[1],ARGV[1])",
  "return 'updated'"
].join(";");
const DELIVERY_SUCCESS_SCRIPT = [
  "-- timer_delivery_success_v2",
  "local installationStatus=redis.call('HGET',KEYS[2],'status')",
  "local installationActive=redis.call('HGET',KEYS[2],'active')",
  "if (installationStatus and installationStatus ~= 'active') or installationActive ~= '1' then return 'revoked' end",
  "if redis.call('EXISTS',KEYS[1]) == 0 then return 'missing' end",
  "redis.call('HSET',KEYS[1],'status','delivered','deliveredAt',ARGV[1],'deliveryError','')",
  "redis.call('EXPIRE',KEYS[1],ARGV[3])",
  "redis.call('HSET',KEYS[2],'lastSuccessfulDeliveryAt',ARGV[1])",
  "redis.call('EXPIRE',KEYS[2],ARGV[4])",
  "if redis.call('GET',KEYS[3]) == ARGV[2] then redis.call('DEL',KEYS[3]) end",
  "return 'delivered'"
].join(";");
const INVALIDATE_SUBSCRIPTION_SCRIPT = [
  "-- timer_invalid_subscription_v2",
  "local installationStatus=redis.call('HGET',KEYS[2],'status')",
  "local installationActive=redis.call('HGET',KEYS[2],'active')",
  "if (installationStatus and installationStatus ~= 'active') or installationActive ~= '1' then return 'revoked' end",
  "if redis.call('EXISTS',KEYS[1]) == 0 then return 'missing' end",
  "redis.call('HSET',KEYS[1],'status','invalid-subscription','deliveryError',ARGV[1])",
  "redis.call('EXPIRE',KEYS[1],ARGV[4])",
  "redis.call('HSET',KEYS[2],'active','0','status','inactive','invalidAt',ARGV[2])",
  "redis.call('EXPIRE',KEYS[2],ARGV[5])",
  "if redis.call('GET',KEYS[3]) == ARGV[3] then redis.call('DEL',KEYS[3]) end",
  "return 'invalid-subscription'"
].join(";");

async function updateTimerState(recordKey, installKey, fields) {
  return String(await redis([
    "EVAL", UPDATE_TIMER_STATE_SCRIPT, "2", recordKey, installKey, String(RETENTION_SECONDS.timer),
    ...Object.entries(fields).flatMap(([field, value]) => [field, String(value)])
  ]) || "");
}

module.exports = apiHandler(async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (contentType(req) !== "application/json") return json(res, 415, { error: "Content-Type must be application/json." });
  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(rawBody, "utf8") > 4 * 1024) return json(res, 413, { error: "Request body is too large." });
  let body;
  try {
    body = typeof req.body === "object" ? req.body : JSON.parse(rawBody || "{}");
  } catch {
    return json(res, 400, { error: "Invalid scheduler payload." });
  }
  if (!isPlainObject(body) || jsonByteLength(body) > 4 * 1024 || !validEntityId(body.notificationId)) {
    return json(res, 400, { error: "Invalid scheduler payload." });
  }
  const appUrl = configuredPublicAppUrl();
  if (!appUrl) return json(res, 503, { error: "Push delivery is not safely configured." });
  const signature = String(req.headers["upstash-signature"] || "");
  const valid = await qstashReceiver().verify({
    signature,
    body: rawBody,
    url: `${appUrl}/api/push/deliver`
  }).catch(() => false);
  if (!valid) return json(res, 401, { error: "Invalid scheduler signature." });

  let loaded;
  if (validInstallationId(body.installationId)) {
    loaded = await loadTimerRecord(body.installationId, body.notificationId);
  } else {
    const key = legacyTimerKey(body.notificationId);
    loaded = { key, record: await getHash(key) };
  }
  const { key: recordKey, record } = loaded;
  if (!record.notificationId || !DELIVERABLE_TIMER_STATES.has(record.status)) return json(res, 200, { status: "ignored" });
  if (!validInstallationId(record.installationId) || (body.installationId && body.installationId !== record.installationId)) {
    return json(res, 200, { status: "ignored" });
  }
  const activeKey = activeTimerKey(record.installationId, record.workoutId);
  if (await redis(["GET", activeKey]) !== record.notificationId) {
    await updateTimerState(recordKey, installationKey(record.installationId), { status: "stale", canceledAt: new Date().toISOString() });
    return json(res, 200, { status: "stale" });
  }

  const installKey = installationKey(record.installationId);
  const installation = await getHash(installKey);
  if (installation.active !== "1" || (installation.status && installation.status !== "active") || !installation.endpoint) {
    return json(res, 200, { status: "inactive" });
  }
  const detail = record.messageDetail === "private"
    ? "Your next set is ready."
    : `${record.exerciseName}${record.upcomingSetLabel ? ` - ${record.upcomingSetLabel}` : record.upcomingSetNumber ? ` - Set ${record.upcomingSetNumber}` : ""} is ready.`;
  const navigation = {
    navigationVersion: 1,
    timerId: record.clientTimerId || record.notificationId,
    notificationId: record.notificationId,
    timerVersion: Number(record.timerVersion || 1),
    workoutId: record.workoutId,
    exerciseId: record.exerciseId,
    completedSetId: record.setId,
    nextSetId: record.upcomingSetId || "",
    endsAt: Date.parse(record.scheduledCompletionAt || "") || 0
  };
  const params = new URLSearchParams({
    rest: "complete",
    workoutId: navigation.workoutId,
    exerciseId: navigation.exerciseId,
    completedSetId: navigation.completedSetId,
    nextSetId: navigation.nextSetId,
    timerId: navigation.timerId,
    notificationId: navigation.notificationId,
    timerVersion: String(navigation.timerVersion)
  });
  const payload = JSON.stringify({
    title: "Rest complete",
    body: detail,
    tag: `fitness-rest-${record.workoutId}`,
    url: `/?${params.toString()}#lift`,
    ...navigation
  });

  try {
    await configureWebPush().sendNotification({
      endpoint: installation.endpoint,
      keys: { p256dh: installation.p256dh, auth: installation.auth }
    }, payload, { TTL: 120, urgency: "high" });
    const deliveredAt = new Date().toISOString();
    const deliveryState = String(await redis([
      "EVAL", DELIVERY_SUCCESS_SCRIPT, "3", recordKey, installKey, activeKey,
      deliveredAt, record.notificationId, String(RETENTION_SECONDS.timer), String(RETENTION_SECONDS.installation)
    ]) || "");
    return json(res, 200, { status: deliveryState === "delivered" ? "delivered" : "inactive" });
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      const invalidAt = new Date().toISOString();
      const invalidState = String(await redis([
        "EVAL", INVALIDATE_SUBSCRIPTION_SCRIPT, "3", recordKey, installKey, activeKey,
        String(error.message || "Subscription expired").slice(0, 240), invalidAt, record.notificationId,
        String(RETENTION_SECONDS.timer), String(RETENTION_SECONDS.installation)
      ]) || "");
      return json(res, 200, { status: invalidState === "invalid-subscription" ? "invalid-subscription" : "inactive" });
    }
    const retryState = await updateTimerState(recordKey, installKey, {
      status: "retrying",
      deliveryError: String(error?.message || error).slice(0, 240)
    });
    if (retryState !== "updated") return json(res, 200, { status: "inactive" });
    return json(res, 500, { error: "Push delivery failed and will be retried." });
  }
});

module.exports.DELIVERABLE_TIMER_STATES = DELIVERABLE_TIMER_STATES;
module.exports.DELIVERY_SUCCESS_SCRIPT = DELIVERY_SUCCESS_SCRIPT;
module.exports.INVALIDATE_SUBSCRIPTION_SCRIPT = INVALIDATE_SUBSCRIPTION_SCRIPT;
module.exports.UPDATE_TIMER_STATE_SCRIPT = UPDATE_TIMER_STATE_SCRIPT;
