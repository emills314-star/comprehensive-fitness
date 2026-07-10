const { authorizeInstallation } = require("../_lib/security");
const { getHash, redis, setHash } = require("../_lib/redis");
const { json, methodNotAllowed } = require("../_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const body = req.body || {};
  if (!await authorizeInstallation(req, body.installationId)) return json(res, 401, { error: "Installation authorization failed." });
  if (!body.mutationId || !body.sessionId || !body.revision || !body.payload) return json(res, 400, { error: "Invalid workout mutation." });
  const mutationKey = `cf:mutation:${body.installationId}:${body.mutationId}`;
  const inserted = await redis(["SET", mutationKey, "1", "NX", "EX", 7776000]);
  if (!inserted) return json(res, 200, { status: "duplicate", mutationId: body.mutationId });

  const workoutKey = `cf:workout:${body.installationId}:${body.sessionId}`;
  const current = await getHash(workoutKey);
  if (!current.revision || String(body.revision) >= current.revision) {
    await setHash(workoutKey, {
      installationId: body.installationId,
      sessionId: body.sessionId,
      revision: body.revision,
      payload: JSON.stringify(body.payload),
      updatedAt: new Date().toISOString()
    });
  }
  return json(res, 200, { status: "synced", mutationId: body.mutationId });
};
