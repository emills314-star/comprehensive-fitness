const crypto = require("crypto");
const { RETENTION_SECONDS, installationKey } = require("./keys");
const { expireKey, getHash, redis } = require("./redis");

function createSecret() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashSecret(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest("hex");
}

function bearerToken(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function authorizeInstallation(req, installationId) {
  if (!installationId) return null;
  const key = installationKey(installationId);
  const record = await getHash(key);
  const token = bearerToken(req);
  if (!record.secretHash || !token || !safeEqual(record.secretHash, hashSecret(token))) return null;
  if (installationStatus(record) !== "active") return null;
  await expireKey(key, RETENTION_SECONDS.installation);
  return record;
}

async function authorizeDeletion(req, installationId) {
  if (!installationId) return null;
  const key = installationKey(installationId);
  const record = await getHash(key);
  const token = bearerToken(req);
  if (!record.secretHash || !token || !safeEqual(record.secretHash, hashSecret(token))) return null;
  if (!["active", "inactive", "deleting", "deleted"].includes(installationStatus(record))) return null;
  await expireKey(key, RETENTION_SECONDS.installation);
  return record;
}

async function authorizeRegistration(req, installationId) {
  if (!installationId) return null;
  const key = installationKey(installationId);
  const record = await getHash(key);
  const token = bearerToken(req);
  if (!record.secretHash || !token || !safeEqual(record.secretHash, hashSecret(token))) return null;
  if (!["active", "inactive"].includes(installationStatus(record))) return null;
  await expireKey(key, RETENTION_SECONDS.installation);
  return record;
}

function installationStatus(record) {
  const explicit = String(record?.status || "").toLowerCase();
  if (["active", "deleting", "deleted", "inactive"].includes(explicit)) return explicit;
  return record?.active === "1" ? "active" : "inactive";
}

function clientFingerprint(req) {
  const trustVercelProxy = process.env.VERCEL === "1";
  const forwarded = trustVercelProxy ? String(req.headers?.["x-forwarded-for"] || "").split(",", 1)[0].trim() : "";
  const address = forwarded || String(req.socket?.remoteAddress || "unknown");
  return hashSecret(address).slice(0, 24);
}

async function checkRateLimit(scope, subject, limit, windowSeconds) {
  const key = `cf:rate:${scope}:${hashSecret(subject).slice(0, 32)}`;
  const script = "local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return {count,redis.call('TTL',KEYS[1])}";
  const result = await redis(["EVAL", script, "1", key, String(windowSeconds)]);
  const count = Number(Array.isArray(result) ? result[0] : result);
  const retryAfter = Math.max(1, Number(Array.isArray(result) ? result[1] : windowSeconds) || windowSeconds);
  return { allowed: count <= limit, count, limit, retryAfter };
}

function rateLimitResponse(res, result) {
  res.setHeader("Retry-After", String(result.retryAfter));
  const { json } = require("./response");
  return json(res, 429, { error: "Request rate limit exceeded.", retryAfter: result.retryAfter });
}

module.exports = {
  authorizeInstallation,
  authorizeDeletion,
  authorizeRegistration,
  bearerToken,
  checkRateLimit,
  clientFingerprint,
  createSecret,
  hashSecret,
  installationStatus,
  rateLimitResponse,
  safeEqual
};
