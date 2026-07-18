const { scanKeys } = require("../_lib/installation-data");
const { getHash, redis, setHash } = require("../_lib/redis");
const { qstashClient } = require("../_lib/push");
const { authorizeInstallation } = require("../_lib/security");
const { json, methodNotAllowed } = require("../_lib/response");

async function cancelActiveTimers(installationId) {
  const activeKeys = await scanKeys(redis, `cf:active:${installationId}:*`);
  let canceled = 0;
  for (const activeKey of activeKeys) {
    const notificationId = String(await redis(["GET", activeKey]) || "");
    if (notificationId) {
      const record = await getHash(`cf:timer:${notificationId}`);
      if (record.status === "scheduled" && record.messageId) await qstashClient().messages.delete(record.messageId).catch(() => undefined);
      await setHash(`cf:timer:${notificationId}`, { status: "canceled", canceledAt: new Date().toISOString(), cancelReason: "push-revoked" });
      canceled += 1;
    }
    await redis(["DEL", activeKey]);
  }
  return canceled;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const { installationId } = req.body || {};
  if (!await authorizeInstallation(req, installationId)) return json(res, 401, { error: "Installation authorization failed." });
  const canceledTimers = await cancelActiveTimers(installationId);
  await setHash(`cf:install:${installationId}`, {
    active: "0", endpoint: "", p256dh: "", auth: "", pushRevokedAt: new Date().toISOString()
  });
  return json(res, 200, { status: "revoked", canceledTimers });
};

module.exports.cancelActiveTimers = cancelActiveTimers;
