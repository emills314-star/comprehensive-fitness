const { deleteWorkoutData } = require("../_lib/installation-data");
const { redis, setHash } = require("../_lib/redis");
const { authorizeInstallation } = require("../_lib/security");
const { json, methodNotAllowed } = require("../_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const body = req.body || {};
  if (!await authorizeInstallation(req, body.installationId)) return json(res, 401, { error: "Installation authorization failed." });
  const enabled = body.enabled === true;
  const now = new Date().toISOString();
  let deleted = { workoutCount: 0, mutationCount: 0 };
  if (!enabled) deleted = await deleteWorkoutData(redis, body.installationId);
  await setHash(`cf:install:${body.installationId}`, {
    syncConsent: enabled ? "1" : "0",
    syncConsentUpdatedAt: now,
    syncRevokedAt: enabled ? "" : now
  });
  return json(res, 200, { status: enabled ? "enabled" : "disabled", deleted });
};
