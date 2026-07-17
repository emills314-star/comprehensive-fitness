async function scanKeys(redisCommand, pattern) {
  const keys = [];
  let cursor = "0";
  do {
    const result = await redisCommand(["SCAN", cursor, "MATCH", pattern, "COUNT", 200]);
    cursor = String(Array.isArray(result) ? result[0] : "0");
    const page = Array.isArray(result?.[1]) ? result[1] : [];
    keys.push(...page.map(String));
  } while (cursor !== "0");
  return keys;
}

async function deletePattern(redisCommand, pattern) {
  const keys = await scanKeys(redisCommand, pattern);
  for (let index = 0; index < keys.length; index += 100) {
    const batch = keys.slice(index, index + 100);
    if (batch.length) await redisCommand(["DEL", ...batch]);
  }
  return keys.length;
}

async function deleteWorkoutData(redisCommand, installationId) {
  const workoutCount = await deletePattern(redisCommand, `cf:workout:${installationId}:*`);
  const mutationCount = await deletePattern(redisCommand, `cf:mutation:${installationId}:*`);
  await redisCommand(["DEL", `cf:workouts:${installationId}`]);
  return { workoutCount, mutationCount };
}

module.exports = { deletePattern, deleteWorkoutData, scanKeys };
