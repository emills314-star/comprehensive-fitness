const { authorizeInstallation, checkRateLimit, rateLimitResponse } = require("../_lib/security");
const { RETENTION_SECONDS, activeTimerKey, scopedTimerId } = require("../_lib/keys");
const { deleteIfValue, redis, setHashWithTtl } = require("../_lib/redis");
const { qstashClient } = require("../_lib/push");
const { apiHandler, json, methodNotAllowed } = require("../_lib/response");
const { boundedString, validEntityId, validInstallationId, validInteger, validateJsonRequest } = require("../_lib/validation");
const { loadTimerRecord } = require("./schedule");

module.exports = apiHandler(async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const parsed = validateJsonRequest(req, 4 * 1024);
  if (!parsed.ok) return json(res, parsed.status, { error: parsed.error });
  const body = parsed.body;
  if (!validInstallationId(body.installationId) || !validEntityId(body.workoutId)) {
    return json(res, 400, { error: "A valid installation and workout are required." });
  }
  if (!await authorizeInstallation(req, body.installationId)) return json(res, 401, { error: "Installation authorization failed." });
  const limit = await checkRateLimit("push-cancel", body.installationId, 360, 60 * 60);
  if (!limit.allowed) return rateLimitResponse(res, limit);

  const activeKey = activeTimerKey(body.installationId, body.workoutId);
  const requestedNotificationId = body.notificationId == null || body.notificationId === ""
    ? String(await redis(["GET", activeKey]) || "")
    : String(body.notificationId);
  if (!requestedNotificationId) return json(res, 200, { status: "not-found" });
  if (!validEntityId(requestedNotificationId)) return json(res, 400, { error: "Invalid timer identifier." });
  let loaded = await loadTimerRecord(body.installationId, requestedNotificationId);
  if (!loaded.record.notificationId && validInteger(body.timerVersion, 1, 1000000)) {
    loaded = await loadTimerRecord(body.installationId, scopedTimerId(body.installationId, `${requestedNotificationId}:${Number(body.timerVersion)}`));
  }
  const { key, record } = loaded;
  if (!record.notificationId) return json(res, 200, { status: "not-found" });
  if (record.installationId !== body.installationId || record.workoutId !== body.workoutId) {
    return json(res, 403, { error: "Timer ownership check failed." });
  }
  if (record.status === "scheduled" && record.messageId) {
    try { await qstashClient().messages.delete(record.messageId); } catch { /* Server-side cancellation state remains authoritative. */ }
  }
  await setHashWithTtl(key, {
    status: "canceled",
    canceledAt: new Date().toISOString(),
    cancelReason: boundedString(body.reason, 64, { allowEmpty: true }) || "user"
  }, RETENTION_SECONDS.timer);
  await deleteIfValue(activeKey, record.notificationId);
  return json(res, 200, { notificationId: record.notificationId, status: "canceled" });
});
