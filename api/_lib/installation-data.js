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

const LEGACY_WORKOUT_CLEANUP_PAGE_SIZE = 100;
const MAX_LEGACY_WORKOUT_CLEANUP_PAGES = 4;

function normalizedScanPage(result) {
  return {
    cursor: String(Array.isArray(result) ? result[0] : "0"),
    keys: (Array.isArray(result?.[1]) ? result[1] : []).map(String)
  };
}

async function deleteKeys(redisCommand, keys) {
  for (let index = 0; index < keys.length; index += 100) {
    const batch = keys.slice(index, index + 100);
    if (batch.length) await redisCommand(["DEL", ...batch]);
  }
}

async function cleanupLegacyWorkoutData(redisCommand, installationId, savedState = {}, options = {}) {
  const pageLimit = Math.max(1, Math.min(
    10,
    Number(options.maxPages || MAX_LEGACY_WORKOUT_CLEANUP_PAGES)
  ));
  const pageSize = Math.max(10, Math.min(
    500,
    Number(options.pageSize || LEGACY_WORKOUT_CLEANUP_PAGE_SIZE)
  ));
  const phases = [
    {
      name: "workouts",
      pattern: `cf:workout:${installationId}:*`,
      prefix: `cf:workout:${installationId}:`,
      cursorField: "legacyWorkoutCleanupWorkoutCursor"
    },
    {
      name: "mutations",
      pattern: `cf:mutation:${installationId}:*`,
      prefix: `cf:mutation:${installationId}:`,
      cursorField: "legacyWorkoutCleanupMutationCursor"
    }
  ];
  let phaseIndex = savedState.legacyWorkoutCleanupComplete === "1"
    ? phases.length
    : Math.max(0, phases.findIndex((phase) => phase.name === savedState.legacyWorkoutCleanupPhase));
  let pages = 0;
  let workoutCount = 0;
  let mutationCount = 0;
  const progress = {
    legacyWorkoutCleanupWorkoutCursor: String(savedState.legacyWorkoutCleanupWorkoutCursor || "0"),
    legacyWorkoutCleanupMutationCursor: String(savedState.legacyWorkoutCleanupMutationCursor || "0"),
    legacyWorkoutCleanupComplete: savedState.legacyWorkoutCleanupComplete === "1" ? "1" : "0"
  };

  while (phaseIndex < phases.length && pages < pageLimit) {
    const phase = phases[phaseIndex];
    const page = normalizedScanPage(await redisCommand([
      "SCAN",
      progress[phase.cursorField] || "0",
      "MATCH",
      phase.pattern,
      "COUNT",
      String(pageSize)
    ]));
    const ownedKeys = [...new Set(page.keys.filter((key) => key.startsWith(phase.prefix)))];
    await deleteKeys(redisCommand, ownedKeys);
    if (phase.name === "workouts") workoutCount += ownedKeys.length;
    else mutationCount += ownedKeys.length;
    pages += 1;
    progress[phase.cursorField] = page.cursor;
    if (page.cursor === "0") phaseIndex += 1;
  }

  const complete = phaseIndex >= phases.length;
  progress.legacyWorkoutCleanupPhase = complete ? "complete" : phases[phaseIndex].name;
  progress.legacyWorkoutCleanupComplete = complete ? "1" : "0";
  if (complete) {
    progress.legacyWorkoutCleanupWorkoutCursor = "0";
    progress.legacyWorkoutCleanupMutationCursor = "0";
    await deleteKeys(redisCommand, [
      `cf:workouts:${installationId}`,
      `cf:mutations:${installationId}`
    ]);
  }
  return { complete, mutationCount, pages, progress, workoutCount };
}

async function deleteWorkoutData(redisCommand, installationId) {
  const workoutCount = await deletePattern(redisCommand, `cf:workout:${installationId}:*`);
  const mutationCount = await deletePattern(redisCommand, `cf:mutation:${installationId}:*`);
  await redisCommand(["DEL", `cf:workouts:${installationId}`, `cf:mutations:${installationId}`]);
  return { workoutCount, mutationCount };
}

module.exports = {
  LEGACY_WORKOUT_CLEANUP_PAGE_SIZE,
  MAX_LEGACY_WORKOUT_CLEANUP_PAGES,
  cleanupLegacyWorkoutData,
  deletePattern,
  deleteWorkoutData,
  scanKeys
};
