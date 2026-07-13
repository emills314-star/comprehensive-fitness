const crypto = require("node:crypto");
const { RETENTION_SECONDS, activeTimerKey, installationKey, legacyTimerKey } = require("../_lib/keys");
const { getHash, redis } = require("../_lib/redis");
const { configureWebPush, configuredPublicAppUrl, pushEndpointAllowed, qstashReceiver } = require("../_lib/push");
const { apiHandler, json, methodNotAllowed } = require("../_lib/response");
const { contentType, isPlainObject, jsonByteLength, validEntityId, validInstallationId } = require("../_lib/validation");
const { loadTimerRecord } = require("./schedule");

const DELIVERY_CLAIM_SECONDS = 90;
const DELIVERY_RACE_BOUNDARY = "An already-in-flight Web Push network request cannot be recalled; cancellation and deletion revoke its Redis claim so it cannot commit success, retry, or resurrect state.";
const DELIVERABLE_TIMER_STATES = new Set(["scheduling", "scheduled", "retrying", "delivering"]);

const CLAIM_DELIVERY_SCRIPT = [
  "-- timer_delivery_claim_v3",
  "local installationStatus=redis.call('HGET',KEYS[2],'status')",
  "local installationActive=redis.call('HGET',KEYS[2],'active')",
  "if (installationStatus and installationStatus ~= 'active') or installationActive ~= '1' then return 'revoked' end",
  "if redis.call('EXISTS',KEYS[1]) == 0 then return 'missing' end",
  "if redis.call('HGET',KEYS[1],'notificationId') ~= ARGV[1] then return 'stale' end",
  "if (redis.call('HGET',KEYS[1],'timerVersion') or '1') ~= ARGV[2] then return 'stale' end",
  "if redis.call('GET',KEYS[3]) ~= ARGV[1] then return 'stale' end",
  "local currentStatus=redis.call('HGET',KEYS[1],'status')",
  "if currentStatus == 'delivering' then",
  "local claimExpires=tonumber(redis.call('HGET',KEYS[1],'deliveryClaimExpiresAtMs') or '0')",
  "if claimExpires > tonumber(ARGV[6]) then return 'busy' end",
  "elseif currentStatus ~= 'scheduling' and currentStatus ~= 'scheduled' and currentStatus ~= 'retrying' then return currentStatus or 'missing' end",
  "redis.call('HSET',KEYS[1],'status','delivering','deliveryAttemptToken',ARGV[3],'deliveryClaimedAt',ARGV[4],'deliveryClaimExpiresAtMs',ARGV[5],'deliveryError','')",
  "redis.call('HINCRBY',KEYS[1],'deliveryAttemptNumber',1)",
  "redis.call('EXPIRE',KEYS[1],ARGV[7])",
  "return 'claimed'"
].join(";");

const CONFIRM_DELIVERY_CLAIM_SCRIPT = [
  "-- timer_delivery_confirm_v3",
  "local installationStatus=redis.call('HGET',KEYS[2],'status')",
  "local installationActive=redis.call('HGET',KEYS[2],'active')",
  "if (installationStatus and installationStatus ~= 'active') or installationActive ~= '1' then return 'revoked' end",
  "if redis.call('HGET',KEYS[1],'status') ~= 'delivering' then return 'claim_lost' end",
  "if redis.call('HGET',KEYS[1],'notificationId') ~= ARGV[1] then return 'claim_lost' end",
  "if (redis.call('HGET',KEYS[1],'timerVersion') or '1') ~= ARGV[2] then return 'claim_lost' end",
  "if redis.call('HGET',KEYS[1],'deliveryAttemptToken') ~= ARGV[3] then return 'claim_lost' end",
  "if redis.call('GET',KEYS[3]) ~= ARGV[1] then return 'claim_lost' end",
  "return 'confirmed'"
].join(";");

const DELIVERY_SUCCESS_SCRIPT = [
  "-- timer_delivery_success_v3",
  "local installationStatus=redis.call('HGET',KEYS[2],'status')",
  "local installationActive=redis.call('HGET',KEYS[2],'active')",
  "if (installationStatus and installationStatus ~= 'active') or installationActive ~= '1' then return 'revoked' end",
  "if redis.call('HGET',KEYS[1],'status') ~= 'delivering' then return 'claim_lost' end",
  "if redis.call('HGET',KEYS[1],'notificationId') ~= ARGV[1] then return 'claim_lost' end",
  "if (redis.call('HGET',KEYS[1],'timerVersion') or '1') ~= ARGV[2] then return 'claim_lost' end",
  "if redis.call('HGET',KEYS[1],'deliveryAttemptToken') ~= ARGV[3] then return 'claim_lost' end",
  "if redis.call('GET',KEYS[3]) ~= ARGV[1] then return 'claim_lost' end",
  "redis.call('HSET',KEYS[1],'status','delivered','deliveredAt',ARGV[4],'deliveryError','')",
  "redis.call('HDEL',KEYS[1],'deliveryAttemptToken','deliveryClaimedAt','deliveryClaimExpiresAtMs')",
  "redis.call('EXPIRE',KEYS[1],ARGV[5])",
  "redis.call('HSET',KEYS[2],'lastSuccessfulDeliveryAt',ARGV[4])",
  "redis.call('EXPIRE',KEYS[2],ARGV[6])",
  "if redis.call('GET',KEYS[3]) == ARGV[1] then redis.call('DEL',KEYS[3]) end",
  "return 'delivered'"
].join(";");

const RETRY_DELIVERY_SCRIPT = [
  "-- timer_delivery_retry_v3",
  "local installationStatus=redis.call('HGET',KEYS[2],'status')",
  "local installationActive=redis.call('HGET',KEYS[2],'active')",
  "if (installationStatus and installationStatus ~= 'active') or installationActive ~= '1' then return 'revoked' end",
  "if redis.call('HGET',KEYS[1],'status') ~= 'delivering' then return 'claim_lost' end",
  "if redis.call('HGET',KEYS[1],'notificationId') ~= ARGV[1] then return 'claim_lost' end",
  "if (redis.call('HGET',KEYS[1],'timerVersion') or '1') ~= ARGV[2] then return 'claim_lost' end",
  "if redis.call('HGET',KEYS[1],'deliveryAttemptToken') ~= ARGV[3] then return 'claim_lost' end",
  "if redis.call('GET',KEYS[3]) ~= ARGV[1] then return 'claim_lost' end",
  "redis.call('HSET',KEYS[1],'status','retrying','deliveryError',ARGV[4])",
  "redis.call('HDEL',KEYS[1],'deliveryAttemptToken','deliveryClaimedAt','deliveryClaimExpiresAtMs')",
  "redis.call('EXPIRE',KEYS[1],ARGV[5])",
  "return 'retrying'"
].join(";");

const INVALIDATE_SUBSCRIPTION_SCRIPT = [
  "-- timer_invalid_subscription_v3",
  "local installationStatus=redis.call('HGET',KEYS[2],'status')",
  "local installationActive=redis.call('HGET',KEYS[2],'active')",
  "if (installationStatus and installationStatus ~= 'active') or installationActive ~= '1' then return 'revoked' end",
  "if redis.call('HGET',KEYS[1],'status') ~= 'delivering' then return 'claim_lost' end",
  "if redis.call('HGET',KEYS[1],'notificationId') ~= ARGV[1] then return 'claim_lost' end",
  "if (redis.call('HGET',KEYS[1],'timerVersion') or '1') ~= ARGV[2] then return 'claim_lost' end",
  "if redis.call('HGET',KEYS[1],'deliveryAttemptToken') ~= ARGV[3] then return 'claim_lost' end",
  "if redis.call('GET',KEYS[3]) ~= ARGV[1] then return 'claim_lost' end",
  "redis.call('HSET',KEYS[1],'status','invalid-subscription','deliveryError',ARGV[4])",
  "redis.call('HDEL',KEYS[1],'deliveryAttemptToken','deliveryClaimedAt','deliveryClaimExpiresAtMs')",
  "redis.call('EXPIRE',KEYS[1],ARGV[6])",
  "redis.call('HSET',KEYS[2],'active','0','status','inactive','invalidAt',ARGV[5])",
  "redis.call('EXPIRE',KEYS[2],ARGV[7])",
  "if redis.call('GET',KEYS[3]) == ARGV[1] then redis.call('DEL',KEYS[3]) end",
  "return 'invalid-subscription'"
].join(";");

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
  const valid = await qstashReceiver().verify({ signature, body: rawBody, url: `${appUrl}/api/push/deliver` }).catch(() => false);
  if (!valid) return json(res, 401, { error: "Invalid scheduler signature." });

  let loaded;
  if (validInstallationId(body.installationId)) loaded = await loadTimerRecord(body.installationId, body.notificationId);
  else {
    const key = legacyTimerKey(body.notificationId);
    loaded = { key, record: await getHash(key) };
  }
  const { key: recordKey, record } = loaded;
  if (!record.notificationId || !DELIVERABLE_TIMER_STATES.has(record.status)) return json(res, 200, { status: "ignored" });
  if (!validInstallationId(record.installationId) || (body.installationId && body.installationId !== record.installationId)) return json(res, 200, { status: "ignored" });

  const installKey = installationKey(record.installationId);
  const activeKey = activeTimerKey(record.installationId, record.workoutId);
  const timerVersion = String(Number(record.timerVersion || 1));
  const attemptToken = crypto.randomBytes(18).toString("base64url");
  const nowMs = Date.now();
  const claimState = String(await redis([
    "EVAL", CLAIM_DELIVERY_SCRIPT, "3", recordKey, installKey, activeKey,
    record.notificationId, timerVersion, attemptToken, new Date(nowMs).toISOString(),
    String(nowMs + DELIVERY_CLAIM_SECONDS * 1000), String(nowMs), String(RETENTION_SECONDS.timer)
  ]) || "");
  if (claimState === "busy") return json(res, 503, { status: "in-flight", error: "Another delivery attempt still owns this timer." });
  if (claimState !== "claimed") return json(res, 200, { status: claimState === "stale" ? "stale" : "inactive" });

  const installation = await getHash(installKey);
  if (installation.active !== "1" || (installation.status && installation.status !== "active") || !installation.endpoint || !pushEndpointAllowed(installation.endpoint)) {
    const invalidAt = new Date().toISOString();
    const invalidState = String(await redis([
      "EVAL", INVALIDATE_SUBSCRIPTION_SCRIPT, "3", recordKey, installKey, activeKey,
      record.notificationId, timerVersion, attemptToken, "Push provider endpoint is not allowed.", invalidAt,
      String(RETENTION_SECONDS.timer), String(RETENTION_SECONDS.installation)
    ]) || "");
    return json(res, 200, { status: invalidState === "invalid-subscription" ? "invalid-subscription" : "inactive" });
  }

  const detail = record.messageDetail === "private"
    ? "Your next set is ready."
    : `${record.exerciseName}${record.upcomingSetLabel ? ` - ${record.upcomingSetLabel}` : record.upcomingSetNumber ? ` - Set ${record.upcomingSetNumber}` : ""} is ready.`;
  const navigation = {
    navigationVersion: 1,
    timerId: record.clientTimerId || record.notificationId,
    notificationId: record.notificationId,
    timerVersion: Number(timerVersion),
    workoutId: record.workoutId,
    exerciseId: record.exerciseId,
    completedSetId: record.setId,
    nextSetId: record.upcomingSetId || "",
    endsAt: Date.parse(record.scheduledCompletionAt || "") || 0
  };
  const params = new URLSearchParams({
    rest: "complete", workoutId: navigation.workoutId, exerciseId: navigation.exerciseId,
    completedSetId: navigation.completedSetId, nextSetId: navigation.nextSetId,
    timerId: navigation.timerId, notificationId: navigation.notificationId,
    timerVersion: String(navigation.timerVersion)
  });
  const payload = JSON.stringify({
    title: "Rest complete", body: detail, tag: `fitness-rest-${record.workoutId}`,
    url: `/?${params.toString()}#lift`, ...navigation
  });

  const confirmation = String(await redis([
    "EVAL", CONFIRM_DELIVERY_CLAIM_SCRIPT, "3", recordKey, installKey, activeKey,
    record.notificationId, timerVersion, attemptToken
  ]) || "");
  if (confirmation !== "confirmed") return json(res, 200, { status: "inactive" });

  // Redis revocation blocks every later state transition. The already-in-flight network boundary described above is unavoidable.
  try {
    await configureWebPush().sendNotification({
      endpoint: installation.endpoint,
      keys: { p256dh: installation.p256dh, auth: installation.auth }
    }, payload, { TTL: 120, urgency: "high" });
    const deliveredAt = new Date().toISOString();
    const deliveryState = String(await redis([
      "EVAL", DELIVERY_SUCCESS_SCRIPT, "3", recordKey, installKey, activeKey,
      record.notificationId, timerVersion, attemptToken, deliveredAt,
      String(RETENTION_SECONDS.timer), String(RETENTION_SECONDS.installation)
    ]) || "");
    return json(res, 200, { status: deliveryState === "delivered" ? "delivered" : "inactive" });
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      const invalidAt = new Date().toISOString();
      const invalidState = String(await redis([
        "EVAL", INVALIDATE_SUBSCRIPTION_SCRIPT, "3", recordKey, installKey, activeKey,
        record.notificationId, timerVersion, attemptToken,
        String(error.message || "Subscription expired").slice(0, 240), invalidAt,
        String(RETENTION_SECONDS.timer), String(RETENTION_SECONDS.installation)
      ]) || "");
      return json(res, 200, { status: invalidState === "invalid-subscription" ? "invalid-subscription" : "inactive" });
    }
    const retryState = String(await redis([
      "EVAL", RETRY_DELIVERY_SCRIPT, "3", recordKey, installKey, activeKey,
      record.notificationId, timerVersion, attemptToken, String(error?.message || error).slice(0, 240),
      String(RETENTION_SECONDS.timer)
    ]) || "");
    if (retryState !== "retrying") return json(res, 200, { status: "inactive" });
    return json(res, 500, { error: "Push delivery failed and will be retried." });
  }
});

module.exports.CLAIM_DELIVERY_SCRIPT = CLAIM_DELIVERY_SCRIPT;
module.exports.CONFIRM_DELIVERY_CLAIM_SCRIPT = CONFIRM_DELIVERY_CLAIM_SCRIPT;
module.exports.DELIVERABLE_TIMER_STATES = DELIVERABLE_TIMER_STATES;
module.exports.DELIVERY_CLAIM_SECONDS = DELIVERY_CLAIM_SECONDS;
module.exports.DELIVERY_RACE_BOUNDARY = DELIVERY_RACE_BOUNDARY;
module.exports.DELIVERY_SUCCESS_SCRIPT = DELIVERY_SUCCESS_SCRIPT;
module.exports.INVALIDATE_SUBSCRIPTION_SCRIPT = INVALIDATE_SUBSCRIPTION_SCRIPT;
module.exports.RETRY_DELIVERY_SCRIPT = RETRY_DELIVERY_SCRIPT;
module.exports.UPDATE_TIMER_STATE_SCRIPT = RETRY_DELIVERY_SCRIPT;
