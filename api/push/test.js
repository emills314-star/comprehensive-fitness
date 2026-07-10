const { authorizeInstallation } = require("../_lib/security");
const { configureWebPush } = require("../_lib/push");
const { json, methodNotAllowed } = require("../_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const body = req.body || {};
  const installation = await authorizeInstallation(req, body.installationId);
  if (!installation?.endpoint || installation.active !== "1") return json(res, 401, { error: "No active push subscription is registered." });
  try {
    await configureWebPush().sendNotification({
      endpoint: installation.endpoint,
      keys: { p256dh: installation.p256dh, auth: installation.auth }
    }, JSON.stringify({
      title: "Notifications ready",
      body: "Comprehensive Fitness can alert you when a rest period ends.",
      tag: "fitness-notification-test",
      url: "/?view=settings"
    }), { TTL: 60, urgency: "normal" });
    return json(res, 200, { status: "sent" });
  } catch (error) {
    return json(res, 502, { error: String(error?.message || "Test notification failed.").slice(0, 240) });
  }
};
