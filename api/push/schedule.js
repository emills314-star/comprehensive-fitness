const crypto = require("crypto");
const { authorizeInstallation, checkRateLimit, rateLimitResponse } = require("../_lib/security");
const {
  RETENTION_SECONDS,
  activeTimerKey,
  installationTimersKey,
  legacyTimerKey,
  scopedTimerId,
  timerKey
} = require("../_lib/keys");
const { getHash, redis, setHashWithTtl } = require("../_lib/redis");
const { publicAppUrl, qstashClient } = require("../_lib/push");
const { apiHandler, json, methodNotAllowed } = require("../_lib/response");
const { boundedString, validEntityId, validInstallationId, validInteger, validateJsonRequest } = require("../_lib/validation");

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
  if (!record.notificationId || record.status !== "scheduled") return;
  if (record.messageId) {
    try { await qstashClient().messages.delete(record.messageId); } catch { /* Expiry still prevents retained timer data. */ }
  }
  await setHashWithTtl(key, {
    status: "canceled",
    canceledAt: new Date().toISOString(),
    cancelReason: boundedString(reason, 64) || "replaced"
  }, RETENTION_SECONDS.timer);
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
  const createdAt = new Date().toISOString();
  const response = await qstashClient().publishJSON({
    url: `${publicAppUrl()}/api/push/deliver`,
    body: { installationId: body.installationId, notificationId },
    notBefore: Math.ceil(restEndTime / 1000),
    retries: 3,
    deduplicationId: notificationId,
    label: "fitness-rest-timer"
  });

  const recordKey = timerKey(body.installationId, notificationId);
  const messageId = boundedString(response.messageId, 256);
  if (!messageId) return json(res, 502, { error: "The scheduler returned an invalid response." });
  await setHashWithTtl(recordKey, {
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
    status: "scheduled",
    createdAt,
    canceledAt: "",
    deliveredAt: "",
    messageId
  }, RETENTION_SECONDS.timer);
  const timersKey = installationTimersKey(body.installationId);
  await redis(["SADD", timersKey, recordKey]);
  await redis(["EXPIRE", timersKey, String(RETENTION_SECONDS.timer)]);

  const activeKey = activeTimerKey(body.installationId, body.workoutId);
  const activeTtlMs = Math.max(60000, restEndTime - Date.now() + 60 * 60 * 1000);
  const previousId = await redis(["SET", activeKey, notificationId, "PX", String(activeTtlMs), "GET"]);
  if (previousId && previousId !== notificationId) await cancelRecord(body.installationId, previousId, "replaced");
  return json(res, 200, { notificationId, messageId, status: "scheduled" });
});

module.exports.cancelRecord = cancelRecord;
module.exports.loadTimerRecord = loadTimerRecord;
