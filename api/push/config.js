const { isRedisConfigured } = require("../_lib/redis");
const { configuredPublicAppUrl, pushConfigured } = require("../_lib/push");
const { apiHandler, json, methodNotAllowed } = require("../_lib/response");

module.exports = apiHandler(async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const configured = isRedisConfigured() && pushConfigured();
  return json(res, 200, {
    configured,
    publicKey: configured ? process.env.VAPID_PUBLIC_KEY : "",
    scheduler: configured ? "qstash" : "unavailable",
    publicAppUrlConfigured: Boolean(configuredPublicAppUrl())
  });
});
