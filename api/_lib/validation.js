const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9_-]{12,100}$/;
const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function jsonByteLength(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function contentType(req) {
  return String(req.headers?.["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
}

function validateJsonRequest(req, maximumBytes) {
  if (contentType(req) !== "application/json") {
    return { ok: false, status: 415, error: "Content-Type must be application/json." };
  }
  if (!isPlainObject(req.body)) return { ok: false, status: 400, error: "A JSON object body is required." };
  if (jsonByteLength(req.body) > maximumBytes) return { ok: false, status: 413, error: "Request body is too large." };
  return { ok: true, body: req.body };
}

function validInstallationId(value) {
  return INSTALLATION_ID_PATTERN.test(String(value || ""));
}

function validEntityId(value) {
  return ENTITY_ID_PATTERN.test(String(value || ""));
}

function boundedString(value, maximumLength, { allowEmpty = false } = {}) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || normalized.length > maximumLength) return null;
  return normalized;
}

function safeJsonValue(value, depth = 0) {
  if (depth > 12) return false;
  if (value == null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 32768;
  if (Array.isArray(value)) return value.length <= 2000 && value.every((entry) => safeJsonValue(entry, depth + 1));
  if (!isPlainObject(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 256 && entries.every(([key, entry]) =>
    key.length <= 128 && !BLOCKED_OBJECT_KEYS.has(key) && safeJsonValue(entry, depth + 1));
}

function validHttpsUrl(value, maximumLength = 2048) {
  if (typeof value !== "string" || value.length > maximumLength) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function validInteger(value, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum;
}

module.exports = {
  boundedString,
  contentType,
  isPlainObject,
  jsonByteLength,
  safeJsonValue,
  validEntityId,
  validHttpsUrl,
  validInstallationId,
  validInteger,
  validateJsonRequest
};
