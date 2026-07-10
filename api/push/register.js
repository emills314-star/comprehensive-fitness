const { getHash, isRedisConfigured, redis, setHash } = require("../_lib/redis");
const { pushConfigured } = require("../_lib/push");
const { authorizeInstallation, createSecret, hashSecret } = require("../_lib/security");
const { json, methodNotAllowed } = require("../_lib/response");

function validSubscription(subscription) {
  return subscription &&
    typeof subscription.endpoint === "string" &&
    subscription.endpoint.startsWith("https://") &&
    typeof subscription.keys?.p256dh === "string" &&
    typeof subscription.keys?.auth === "string";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!isRedisConfigured() || !pushConfigured()) return json(res, 503, { error: "Push notifications are not configured." });
  const { installationId, deviceId, userId, subscription } = req.body || {};
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(String(installationId || "")) || !validSubscription(subscription)) {
    return json(res, 400, { error: "A valid installation and push subscription are required." });
  }

  const key = `cf:install:${installationId}`;
  const existing = await getHash(key);
  let secret = "";
  if (existing.secretHash) {
    const authorized = await authorizeInstallation(req, installationId);
    if (!authorized) return json(res, 401, { error: "This installation must be reauthorized." });
  } else {
    secret = createSecret();
  }

  const now = new Date().toISOString();
  await setHash(key, {
    installationId,
    userId: String(userId || installationId),
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    createdAt: existing.createdAt || now,
    updatedAt: now,
    lastSuccessfulDeliveryAt: existing.lastSuccessfulDeliveryAt || "",
    deviceId: String(deviceId || installationId),
    active: "1",
    invalidAt: "",
    secretHash: existing.secretHash || hashSecret(secret)
  });
  await redis(["SADD", "cf:installations", installationId]);
  return json(res, 200, { installationId, token: secret || undefined, status: "enabled" });
};
