const { RETENTION_SECONDS, installationKey } = require("../_lib/keys");
const { getHash, isRedisConfigured, redis, setHashWithTtl } = require("../_lib/redis");
const { pushConfigured } = require("../_lib/push");
const { authorizeInstallation, checkRateLimit, clientFingerprint, createSecret, hashSecret, rateLimitResponse } = require("../_lib/security");
const { apiHandler, json, methodNotAllowed } = require("../_lib/response");
const { boundedString, validHttpsUrl, validInstallationId, validateJsonRequest } = require("../_lib/validation");

function validSubscription(subscription) {
  return subscription &&
    validHttpsUrl(subscription.endpoint) &&
    boundedString(subscription.keys?.p256dh, 512) &&
    boundedString(subscription.keys?.auth, 256);
}

module.exports = apiHandler(async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const parsed = validateJsonRequest(req, 16 * 1024);
  if (!parsed.ok) return json(res, parsed.status, { error: parsed.error });
  if (!isRedisConfigured() || !pushConfigured()) return json(res, 503, { error: "Push notifications are not configured." });
  const { installationId, deviceId, subscription } = parsed.body;
  if (!validInstallationId(installationId) || !validSubscription(subscription)) {
    return json(res, 400, { error: "A valid installation and push subscription are required." });
  }

  const clientLimit = await checkRateLimit("register-client", clientFingerprint(req), 30, 60 * 60);
  if (!clientLimit.allowed) return rateLimitResponse(res, clientLimit);
  const installationLimit = await checkRateLimit("register-installation", installationId, 10, 60 * 60);
  if (!installationLimit.allowed) return rateLimitResponse(res, installationLimit);

  const key = installationKey(installationId);
  const existing = await getHash(key);
  let secret = "";
  if (existing.secretHash) {
    const authorized = await authorizeInstallation(req, installationId);
    if (!authorized) return json(res, 401, { error: "This installation must be reauthorized." });
  } else {
    secret = createSecret();
  }

  const now = new Date().toISOString();
  await setHashWithTtl(key, {
    installationId,
    userId: installationId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    createdAt: existing.createdAt || now,
    updatedAt: now,
    lastSuccessfulDeliveryAt: existing.lastSuccessfulDeliveryAt || "",
    deviceId: boundedString(deviceId, 128, { allowEmpty: true }) || installationId,
    active: "1",
    invalidAt: "",
    secretHash: existing.secretHash || hashSecret(secret)
  }, RETENTION_SECONDS.installation);
  await redis(["SADD", "cf:installations", installationId]);
  return json(res, 200, { installationId, token: secret || undefined, status: "enabled" });
});

module.exports.validSubscription = validSubscription;
