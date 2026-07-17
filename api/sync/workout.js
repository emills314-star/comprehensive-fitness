const { authorizeInstallation } = require("../_lib/security");
const { getHash, redis, setHash } = require("../_lib/redis");
const { json, methodNotAllowed } = require("../_lib/response");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const body = req.body || {};
  const installation = await authorizeInstallation(req, body.installationId);
  if (!installation) return json(res, 401, { error: "Installation authorization failed." });
  if (installation.syncConsent !== "1") return json(res, 403, { error: "Workout cloud copy is not enabled for this installation." });
  if (!body.mutationId || !body.sessionId || !body.revision || !body.payload) return json(res, 400, { error: "Invalid workout mutation." });
  const serializedPayload = JSON.stringify(body.payload);
  if (Buffer.byteLength(serializedPayload, "utf8") > 262144) return json(res, 413, { error: "Workout mutation exceeds the 256 KB limit." });
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
      payload: serializedPayload,
      updatedAt: new Date().toISOString()
    });
    await redis(["EXPIRE", workoutKey, 7776000]);
    await redis(["SADD", `cf:workouts:${body.installationId}`, workoutKey]);
    await redis(["EXPIRE", `cf:workouts:${body.installationId}`, 7776000]);
  }
  return json(res, 200, { status: "synced", mutationId: body.mutationId });
};
