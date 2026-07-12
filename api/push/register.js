const { RETENTION_SECONDS, installationKey } = require("../_lib/keys");
const { getHash, isRedisConfigured, redis } = require("../_lib/redis");
const { pushConfigured } = require("../_lib/push");
const { authorizeRegistration, checkRateLimit, clientFingerprint, createSecret, hashSecret, rateLimitResponse } = require("../_lib/security");
const { apiHandler, json, methodNotAllowed } = require("../_lib/response");
const { boundedString, validHttpsUrl, validInstallationId, validateJsonRequest } = require("../_lib/validation");

function validSubscription(subscription) {
  return subscription &&
    validHttpsUrl(subscription.endpoint) &&
    boundedString(subscription.keys?.p256dh, 512) &&
    boundedString(subscription.keys?.auth, 256);
}

const REGISTER_INSTALLATION_SCRIPT = [
  "-- register_installation_v2",
  "local existingStatus=redis.call('HGET',KEYS[1],'status')",
  "local existingSecret=redis.call('HGET',KEYS[1],'secretHash')",
  "if existingStatus == 'deleting' or existingStatus == 'deleted' then return 'revoked' end",
  "if existingSecret and (ARGV[1] == '' or existingSecret ~= ARGV[1]) then return 'conflict' end",
  "redis.call('HSET',KEYS[1],unpack(ARGV,4))",
  "redis.call('EXPIRE',KEYS[1],ARGV[2])",
  "redis.call('SADD',KEYS[2],ARGV[3])",
  "return 'registered'"
].join(";");

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

  const key = installationKey(installationId);
  const existing = await getHash(key);
  let secret = "";
  if (existing.secretHash) {
    const authorized = await authorizeRegistration(req, installationId);
    if (!authorized) return json(res, 401, { error: "This installation must be reauthorized." });
  } else {
    secret = createSecret();
  }
  const installationLimit = await checkRateLimit("register-installation", installationId, 10, 60 * 60);
  if (!installationLimit.allowed) return rateLimitResponse(res, installationLimit);

  const now = new Date().toISOString();
  const fields = {
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
    status: "active",
    invalidAt: "",
    secretHash: existing.secretHash || hashSecret(secret)
  };
  const registered = String(await redis([
    "EVAL", REGISTER_INSTALLATION_SCRIPT, "2", key, "cf:installations",
    existing.secretHash || "", String(RETENTION_SECONDS.installation), installationId,
    ...Object.entries(fields).flatMap(([field, value]) => [field, String(value)])
  ]) || "");
  if (registered === "revoked") return json(res, 410, { error: "This installation was deleted and cannot be reactivated." });
  if (registered !== "registered") return json(res, 409, { error: "Installation registration changed concurrently; retry with current authorization." });
  return json(res, 200, { installationId, token: secret || undefined, status: "enabled" });
});

module.exports.validSubscription = validSubscription;
module.exports.REGISTER_INSTALLATION_SCRIPT = REGISTER_INSTALLATION_SCRIPT;
