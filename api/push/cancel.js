const { authorizeInstallation } = require("../_lib/security");
const { getHash, redis, setHash } = require("../_lib/redis");
const { qstashClient } = require("../_lib/push");
const { json, methodNotAllowed } = require("../_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const body = req.body || {};
  if (!await authorizeInstallation(req, body.installationId)) return json(res, 401, { error: "Installation authorization failed." });
  const activeKey = `cf:active:${body.installationId}:${body.workoutId}`;
  const notificationId = String(body.notificationId || await redis(["GET", activeKey]) || "");
  if (!notificationId) return json(res, 200, { status: "not-found" });
  const record = await getHash(`cf:timer:${notificationId}`);
  if (record.installationId !== body.installationId) return json(res, 403, { error: "Timer ownership check failed." });
  if (record.status === "scheduled" && record.messageId) await qstashClient().messages.delete(record.messageId).catch(() => undefined);
  await setHash(`cf:timer:${notificationId}`, { status: "canceled", canceledAt: new Date().toISOString(), cancelReason: String(body.reason || "user") });
  const active = await redis(["GET", activeKey]);
  if (active === notificationId) await redis(["DEL", activeKey]);
  return json(res, 200, { notificationId, status: "canceled" });
};
