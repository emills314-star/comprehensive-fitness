const { isRedisConfigured } = require("../_lib/redis");
const { pushConfigured } = require("../_lib/push");
const { json, methodNotAllowed } = require("../_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const configured = isRedisConfigured() && pushConfigured();
  return json(res, 200, {
    configured,
    publicKey: configured ? process.env.VAPID_PUBLIC_KEY : "",
    scheduler: configured ? "qstash" : "unavailable"
  });
};
