const { authorizeInstallation, checkRateLimit, rateLimitResponse } = require("../_lib/security");
const { configureWebPush, pushEndpointAllowed } = require("../_lib/push");
const { apiHandler, json, methodNotAllowed } = require("../_lib/response");
const { validInstallationId, validateJsonRequest } = require("../_lib/validation");

module.exports = apiHandler(async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const parsed = validateJsonRequest(req, 2 * 1024);
  if (!parsed.ok) return json(res, parsed.status, { error: parsed.error });
  if (!validInstallationId(parsed.body.installationId)) return json(res, 400, { error: "A valid installation is required." });
  const installation = await authorizeInstallation(req, parsed.body.installationId);
  if (!installation?.endpoint || installation.active !== "1") return json(res, 401, { error: "No active push subscription is registered." });
  if (!pushEndpointAllowed(installation.endpoint)) return json(res, 409, { error: "The stored push provider is not allowed; register notifications again." });
  const limit = await checkRateLimit("push-test", parsed.body.installationId, 5, 60 * 60);
  if (!limit.allowed) return rateLimitResponse(res, limit);
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
  } catch {
    return json(res, 502, { error: "Test notification failed." });
  }
});
