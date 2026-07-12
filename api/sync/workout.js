const { authorizeInstallation, checkRateLimit, rateLimitResponse } = require("../_lib/security");
const {
  RETENTION_SECONDS,
  installationKey,
  installationMutationsKey,
  installationWorkoutsKey,
  mutationKey,
  workoutKey
} = require("../_lib/keys");
const { redis } = require("../_lib/redis");
const { apiHandler, json, methodNotAllowed } = require("../_lib/response");
const { isPlainObject, safeJsonValue, validEntityId, validInstallationId, validateJsonRequest } = require("../_lib/validation");

const MAX_WORKOUT_BYTES = 256 * 1024;
const WORKOUT_COMMIT_SCRIPT = [
  "-- workout_commit_v2",
  "local installationStatus=redis.call('HGET',KEYS[5],'status')",
  "local installationActive=redis.call('HGET',KEYS[5],'active')",
  "if (installationStatus and installationStatus ~= 'active') or installationActive ~= '1' then return 'revoked' end",
  "if redis.call('EXISTS', KEYS[1]) == 1 then local mutationStatus=redis.call('GET',KEYS[1]); if mutationStatus == 'synced' then return 'duplicate' end; return mutationStatus or 'duplicate' end",
  "local current=redis.call('HGET',KEYS[2],'revision')",
  "local currentPayload=redis.call('HGET',KEYS[2],'payload')",
  "local status='stale'",
  "if not current or ARGV[3] > current then",
  "redis.call('HSET',KEYS[2],'installationId',ARGV[1],'sessionId',ARGV[2],'revision',ARGV[3],'payload',ARGV[4],'updatedAt',ARGV[5])",
  "redis.call('EXPIRE',KEYS[2],ARGV[6])",
  "status='synced'",
  "elseif ARGV[3] == current then",
  "if ARGV[4] == currentPayload then status='idempotent' else status='conflict' end",
  "end",
  "redis.call('SET',KEYS[1],status,'EX',ARGV[7])",
  "redis.call('SADD',KEYS[3],KEYS[2])",
  "redis.call('EXPIRE',KEYS[3],ARGV[6])",
  "redis.call('SADD',KEYS[4],KEYS[1])",
  "redis.call('EXPIRE',KEYS[4],ARGV[7])",
  "return status"
].join(";");

function validateWorkoutMutation(body) {
  if (!validInstallationId(body.installationId) || !validEntityId(body.mutationId) || !validEntityId(body.sessionId)) {
    return "Invalid workout mutation identifiers.";
  }
  if (typeof body.revision !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.revision) ||
      !Number.isFinite(Date.parse(body.revision)) || new Date(body.revision).toISOString() !== body.revision) {
    return "Invalid workout mutation revision.";
  }
  if (Date.parse(body.revision) > Date.now() + 5 * 60 * 1000) return "Workout mutation revision is in the future.";
  const payload = body.payload;
  if (!isPlainObject(payload) || !isPlainObject(payload.session) || !Array.isArray(payload.exercises) || !Array.isArray(payload.sets)) {
    return "Workout payload must contain one session plus exercise and set arrays.";
  }
  if (payload.exercises.length > 100 || payload.sets.length > 1000 || !safeJsonValue(payload)) return "Workout payload exceeds structural limits.";
  if (String(payload.session.id || "") !== body.sessionId) return "Workout payload session does not match the mutation session.";
  const exerciseIds = new Set();
  for (const exercise of payload.exercises) {
    if (!isPlainObject(exercise) || !validEntityId(exercise.id) || exerciseIds.has(exercise.id)) return "Workout payload has an invalid exercise.";
    if (exercise.sessionId && exercise.sessionId !== body.sessionId) return "Workout payload crosses session boundaries.";
    exerciseIds.add(exercise.id);
  }
  const setIds = new Set();
  for (const set of payload.sets) {
    if (!isPlainObject(set) || !validEntityId(set.id) || setIds.has(set.id) || !exerciseIds.has(set.exerciseId)) {
      return "Workout payload has an invalid set reference.";
    }
    setIds.add(set.id);
  }
  return "";
}

module.exports = apiHandler(async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const parsed = validateJsonRequest(req, MAX_WORKOUT_BYTES);
  if (!parsed.ok) return json(res, parsed.status, { error: parsed.error });
  const body = parsed.body;
  if (!validInstallationId(body.installationId) || !await authorizeInstallation(req, body.installationId)) {
    return json(res, 401, { error: "Installation authorization failed." });
  }
  const limit = await checkRateLimit("workout-sync", body.installationId, 240, 60 * 60);
  if (!limit.allowed) return rateLimitResponse(res, limit);
  const validationError = validateWorkoutMutation(body);
  if (validationError) return json(res, 400, { error: validationError });

  const normalizedRevision = new Date(body.revision).toISOString();
  const serializedPayload = JSON.stringify(body.payload);
  const status = await redis([
    "EVAL",
    WORKOUT_COMMIT_SCRIPT,
    "5",
    mutationKey(body.installationId, body.mutationId),
    workoutKey(body.installationId, body.sessionId),
    installationWorkoutsKey(body.installationId),
    installationMutationsKey(body.installationId),
    installationKey(body.installationId),
    body.installationId,
    body.sessionId,
    normalizedRevision,
    serializedPayload,
    new Date().toISOString(),
    String(RETENTION_SECONDS.workout),
    String(RETENTION_SECONDS.mutation)
  ]);
  const normalizedStatus = String(status || "synced");
  if (normalizedStatus === "conflict") return json(res, 409, { status: "conflict", mutationId: body.mutationId, error: "A different mutation already uses this workout revision." });
  if (normalizedStatus === "revoked") return json(res, 410, { status: "revoked", mutationId: body.mutationId, error: "This installation is deleting or deleted." });
  return json(res, 200, { status: normalizedStatus, mutationId: body.mutationId });
});

module.exports.MAX_WORKOUT_BYTES = MAX_WORKOUT_BYTES;
module.exports.WORKOUT_COMMIT_SCRIPT = WORKOUT_COMMIT_SCRIPT;
module.exports.validateWorkoutMutation = validateWorkoutMutation;
