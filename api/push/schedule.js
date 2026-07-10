const crypto = require("crypto");
const { authorizeInstallation } = require("../_lib/security");
const { getHash, redis, setHash } = require("../_lib/redis");
const { publicAppUrl, qstashClient } = require("../_lib/push");
const { json, methodNotAllowed } = require("../_lib/response");

async function cancelRecord(notificationId, reason) {
  if (!notificationId) return;
  const record = await getHash(`cf:timer:${notificationId}`);
  if (!record.notificationId || record.status !== "scheduled") return;
  if (record.messageId) await qstashClient().messages.delete(record.messageId).catch(() => undefined);
  await setHash(`cf:timer:${notificationId}`, { status: "canceled", canceledAt: new Date().toISOString(), cancelReason: reason });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const body = req.body || {};
  const installation = await authorizeInstallation(req, body.installationId);
  if (!installation) return json(res, 401, { error: "Installation authorization failed." });

  const restEndTime = Number(body.restEndTime || 0);
  if (!body.workoutId || !body.exerciseId || !body.setId || !Number.isFinite(restEndTime)) {
    return json(res, 400, { error: "Workout, exercise, set, and completion time are required." });
  }
  if (restEndTime < Date.now() + 1000 || restEndTime > Date.now() + 24 * 60 * 60 * 1000) {
    return json(res, 400, { error: "The rest completion time is outside the supported range." });
  }

  const activeKey = `cf:active:${body.installationId}:${body.workoutId}`;
  const previousId = await redis(["GET", activeKey]);
  if (previousId) await cancelRecord(previousId, "replaced");

  const notificationId = String(body.notificationId || crypto.randomUUID());
  const createdAt = new Date().toISOString();
  const response = await qstashClient().publishJSON({
    url: `${publicAppUrl(req)}/api/push/deliver`,
    body: { notificationId },
    notBefore: Math.ceil(restEndTime / 1000),
    retries: 3,
    deduplicationId: notificationId,
    label: "fitness-rest-timer"
  });

  await setHash(`cf:timer:${notificationId}`, {
    notificationId,
    installationId: body.installationId,
    userId: installation.userId || body.installationId,
    workoutId: body.workoutId,
    exerciseId: body.exerciseId,
    setId: body.setId,
    upcomingSetId: body.upcomingSetId || "",
    upcomingSetNumber: body.upcomingSetNumber || "",
    exerciseName: String(body.exerciseName || "Workout").slice(0, 120),
    messageDetail: String(body.messageDetail || "exercise-set"),
    scheduledCompletionAt: new Date(restEndTime).toISOString(),
    status: "scheduled",
    createdAt,
    canceledAt: "",
    deliveredAt: "",
    messageId: response.messageId
  });
  await redis(["SET", activeKey, notificationId, "PX", Math.max(60000, restEndTime - Date.now() + 3600000)]);
  return json(res, 200, { notificationId, messageId: response.messageId, status: "scheduled" });
};
