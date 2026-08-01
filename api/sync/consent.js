const { cleanupLegacyWorkoutData } = require("../_lib/installation-data");
const { redis, setHash } = require("../_lib/redis");
const { authorizeDeletion } = require("../_lib/security");
const { json, methodNotAllowed } = require("../_lib/response");
const { validInstallationId } = require("../_lib/validation");

function countValue(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const body = req.body || {};
  if (body.enabled === true) {
    return json(res, 410, {
      status: "disabled",
      error: "Workout cloud copy has been permanently disabled and cannot be enabled."
    });
  }
  if (body.enabled !== false) return json(res, 400, { error: "Only workout cloud-copy cleanup is supported." });
  if (!validInstallationId(body.installationId)) return json(res, 400, { error: "A valid installation is required." });
  const installation = await authorizeDeletion(req, body.installationId);
  if (!installation) return json(res, 401, { error: "Installation authorization failed." });
  const now = new Date().toISOString();
  const cleanup = await cleanupLegacyWorkoutData(redis, body.installationId, installation);
  const workoutCount = countValue(installation.legacyWorkoutCleanupWorkoutsRemoved) + cleanup.workoutCount;
  const mutationCount = countValue(installation.legacyWorkoutCleanupMutationsRemoved) + cleanup.mutationCount;
  await setHash(`cf:install:${body.installationId}`, {
    ...cleanup.progress,
    legacyWorkoutCleanupWorkoutsRemoved: String(workoutCount),
    legacyWorkoutCleanupMutationsRemoved: String(mutationCount),
    legacyWorkoutCleanupUpdatedAt: now,
    syncConsentUpdatedAt: now,
    syncConsent: "0",
    syncRevokedAt: installation.syncRevokedAt || now
  });
  return json(res, cleanup.complete ? 200 : 202, {
    status: cleanup.complete ? "disabled" : "cleanup-pending",
    deleted: { workoutCount, mutationCount },
    cleanupComplete: cleanup.complete,
    retryable: !cleanup.complete
  });
};
