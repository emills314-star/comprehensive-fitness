const crypto = require("crypto");
const { getHash, isRedisConfigured, redis, setHash } = require("../_lib/redis");
const { authorizeInstallation, createSecret, hashSecret } = require("../_lib/security");
const { json, methodNotAllowed } = require("../_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!isRedisConfigured()) return json(res, 503, { error: "Cloud workout copy is not configured." });
  const { installationId, deviceId } = req.body || {};
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(String(installationId || ""))) return json(res, 400, { error: "A valid installation is required." });
  const forwarded = String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const clientHash = crypto.createHash("sha256").update(forwarded).digest("hex").slice(0, 24);
  const rateKey = `cf:rate:sync-authorize:${clientHash}`;
  const attempts = Number(await redis(["INCR", rateKey]) || 0);
  if (attempts === 1) await redis(["EXPIRE", rateKey, 3600]);
  if (attempts > 10) return json(res, 429, { error: "Too many installation authorization attempts. Try again later." });

  const key = `cf:install:${installationId}`;
  const existing = await getHash(key);
  let secret = "";
  if (existing.secretHash) {
    if (!await authorizeInstallation(req, installationId)) return json(res, 401, { error: "This installation must be reauthorized." });
  } else {
    secret = createSecret();
  }
  const now = new Date().toISOString();
  await setHash(key, {
    installationId,
    deviceId: String(deviceId || installationId),
    createdAt: existing.createdAt || now,
    updatedAt: now,
    active: existing.active || "0",
    syncConsent: existing.syncConsent || "0",
    secretHash: existing.secretHash || hashSecret(secret)
  });
  await redis(["SADD", "cf:installations", installationId]);
  return json(res, 200, { installationId, token: secret || undefined, status: "authorized" });
};
