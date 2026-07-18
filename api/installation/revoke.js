const { deleteWorkoutData } = require("../_lib/installation-data");
const { redis } = require("../_lib/redis");
const { authorizeInstallation } = require("../_lib/security");
const { json, methodNotAllowed } = require("../_lib/response");
const { cancelActiveTimers } = require("../push/revoke");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const { installationId } = req.body || {};
  if (!await authorizeInstallation(req, installationId)) return json(res, 401, { error: "Installation authorization failed." });
  const canceledTimers = await cancelActiveTimers(installationId);
  const deleted = await deleteWorkoutData(redis, installationId);
  await redis(["DEL", `cf:install:${installationId}`]);
  await redis(["SREM", "cf:installations", installationId]);
  return json(res, 200, { status: "revoked", canceledTimers, deleted });
};
