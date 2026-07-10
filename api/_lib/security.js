const crypto = require("crypto");
const { getHash } = require("./redis");

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
  const record = await getHash(`cf:install:${installationId}`);
  const token = bearerToken(req);
  if (!record.secretHash || !token || !safeEqual(record.secretHash, hashSecret(token))) return null;
  return record;
}

module.exports = { authorizeInstallation, bearerToken, createSecret, hashSecret, safeEqual };
