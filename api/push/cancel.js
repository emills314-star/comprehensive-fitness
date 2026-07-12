const { authorizeInstallation, checkRateLimit, rateLimitResponse } = require("../_lib/security");
const { RETENTION_SECONDS, activeTimerKey, installationKey, scopedTimerId } = require("../_lib/keys");
const { redis } = require("../_lib/redis");
const { qstashClient } = require("../_lib/push");
const { apiHandler, json, methodNotAllowed } = require("../_lib/response");
const { boundedString, validEntityId, validInstallationId, validInteger, validateJsonRequest } = require("../_lib/validation");
const { loadTimerRecord } = require("./schedule");

const CANCEL_TIMER_SCRIPT = [
  "-- timer_cancel_v2",
  "local installationStatus=redis.call('HGET',KEYS[2],'status')",
  "local installationActive=redis.call('HGET',KEYS[2],'active')",
  "if (installationStatus and installationStatus ~= 'active') or installationActive ~= '1' then return 'revoked' end",
  "if redis.call('EXISTS',KEYS[1]) == 0 then return 'missing' end",
  "redis.call('HSET',KEYS[1],'status','canceled','canceledAt',ARGV[1],'cancelReason',ARGV[2])",
  "redis.call('EXPIRE',KEYS[1],ARGV[4])",
  "if redis.call('GET',KEYS[3]) == ARGV[3] then redis.call('DEL',KEYS[3]) end",
  "return 'canceled'"
].join(";");

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
  if (body.timerVersion != null && !validInteger(body.timerVersion, 1, 1000000)) return json(res, 400, { error: "Invalid timer version." });
  let loaded = await loadTimerRecord(body.installationId, requestedNotificationId);
  if (!loaded.record.notificationId && validInteger(body.timerVersion, 1, 1000000)) {
    loaded = await loadTimerRecord(body.installationId, scopedTimerId(body.installationId, `${requestedNotificationId}:${Number(body.timerVersion)}`));
  }
  if (!loaded.record.notificationId) {
    const activeNotificationId = String(await redis(["GET", activeKey]) || "");
    if (activeNotificationId) {
      const activeLoaded = await loadTimerRecord(body.installationId, activeNotificationId);
      if (activeLoaded.record.clientTimerId === requestedNotificationId) loaded = activeLoaded;
    }
  }
  const { key, record } = loaded;
  if (!record.notificationId) return json(res, 200, { status: "not-found" });
  if (record.installationId !== body.installationId || record.workoutId !== body.workoutId) {
    return json(res, 403, { error: "Timer ownership check failed." });
  }
  if (body.timerVersion != null && Number(record.timerVersion || 1) !== Number(body.timerVersion)) {
    return json(res, 409, { status: "stale", error: "Timer version does not match the active scheduled timer." });
  }
  if (["scheduling", "scheduled", "retrying", "publish_failed"].includes(record.status) && record.messageId) {
    try { await qstashClient().messages.delete(record.messageId); } catch { /* Server-side cancellation state remains authoritative. */ }
  }
  const canceled = String(await redis([
    "EVAL", CANCEL_TIMER_SCRIPT, "3", key, installationKey(body.installationId), activeKey,
    new Date().toISOString(), boundedString(body.reason, 64, { allowEmpty: true }) || "user",
    record.notificationId, String(RETENTION_SECONDS.timer)
  ]) || "");
  if (canceled === "revoked") return json(res, 410, { status: "revoked", error: "This installation is deleting or deleted." });
  if (canceled === "missing") return json(res, 200, { status: "not-found" });
  return json(res, 200, { notificationId: record.notificationId, status: "canceled" });
});

module.exports.CANCEL_TIMER_SCRIPT = CANCEL_TIMER_SCRIPT;
