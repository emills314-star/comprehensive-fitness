const REDIS_URL = () => String(process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const REDIS_TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || "";

function isRedisConfigured() {
  return Boolean(REDIS_URL() && REDIS_TOKEN());
}

async function redis(command) {
  if (!isRedisConfigured()) throw new Error("Redis is not configured.");
  const response = await fetch(REDIS_URL(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error || `Redis request failed (${response.status}).`);
  return payload.result;
}

function arrayToHash(value) {
  if (!Array.isArray(value)) return value && typeof value === "object" ? value : {};
  const result = {};
  for (let index = 0; index < value.length; index += 2) result[value[index]] = value[index + 1];
  return result;
}

async function getHash(key) {
  return arrayToHash(await redis(["HGETALL", key]));
}

async function setHash(key, fields) {
  const args = ["HSET", key];
  Object.entries(fields).forEach(([field, value]) => {
    args.push(field, value == null ? "" : String(value));
  });
  return redis(args);
}

module.exports = { getHash, isRedisConfigured, redis, setHash };
