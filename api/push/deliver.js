const { RETENTION_SECONDS, activeTimerKey, installationKey, legacyTimerKey } = require("../_lib/keys");
const { deleteIfValue, getHash, redis, setHashWithTtl } = require("../_lib/redis");
const { configureWebPush, configuredPublicAppUrl, qstashReceiver } = require("../_lib/push");
const { apiHandler, json, methodNotAllowed } = require("../_lib/response");
const { contentType, isPlainObject, jsonByteLength, validEntityId, validInstallationId } = require("../_lib/validation");
const { loadTimerRecord } = require("./schedule");

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
  if (!record.notificationId || record.status !== "scheduled") return json(res, 200, { status: "ignored" });
  if (!validInstallationId(record.installationId) || (body.installationId && body.installationId !== record.installationId)) {
    return json(res, 200, { status: "ignored" });
  }
  const activeKey = activeTimerKey(record.installationId, record.workoutId);
  if (await redis(["GET", activeKey]) !== record.notificationId) {
    await setHashWithTtl(recordKey, { status: "stale", canceledAt: new Date().toISOString() }, RETENTION_SECONDS.timer);
    return json(res, 200, { status: "stale" });
  }

  const installation = await getHash(installationKey(record.installationId));
  if (installation.active !== "1" || !installation.endpoint) return json(res, 200, { status: "inactive" });
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
    await setHashWithTtl(recordKey, { status: "delivered", deliveredAt }, RETENTION_SECONDS.timer);
    await setHashWithTtl(installationKey(record.installationId), { lastSuccessfulDeliveryAt: deliveredAt }, RETENTION_SECONDS.installation);
    await deleteIfValue(activeKey, record.notificationId);
    return json(res, 200, { status: "delivered" });
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      const invalidAt = new Date().toISOString();
      await setHashWithTtl(installationKey(record.installationId), { active: "0", invalidAt }, RETENTION_SECONDS.installation);
      await setHashWithTtl(recordKey, {
        status: "invalid-subscription",
        deliveryError: String(error.message || "Subscription expired").slice(0, 240)
      }, RETENTION_SECONDS.timer);
      await deleteIfValue(activeKey, record.notificationId);
      return json(res, 200, { status: "invalid-subscription" });
    }
    await setHashWithTtl(recordKey, {
      status: "retrying",
      deliveryError: String(error?.message || error).slice(0, 240)
    }, RETENTION_SECONDS.timer);
    return json(res, 500, { error: "Push delivery failed and will be retried." });
  }
});
