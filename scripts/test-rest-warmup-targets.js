const assert = require("node:assert/strict");
const fs = require("node:fs");
const { readApplicationContractSource } = require("./read-application-contract-source");

const html = readApplicationContractSource();
const sw = fs.readFileSync("sw.js", "utf8");
const schedule = fs.readFileSync("api/push/schedule.js", "utf8");
const deliver = fs.readFileSync("api/push/deliver.js", "utf8");

// Keep the combined document/runtime contract syntactically valid before checking integration.
[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((match) => new Function(match[1]));

assert.match(html, /async function navigateToRestCompletion\(payload = \{\}, options = \{\}\)/, "All rest entry points need one shared navigation handler");
assert.match(html, /workout\.id !== activeWorkoutId[\s\S]*!stateMatches[\s\S]*restNavigationState\.status === "canceled"/, "Rest navigation must reject stale, canceled, and non-active workouts");
assert.match(html, /nextSetForRestPayload\(payload\)/, "Completed references must resolve the next canonical incomplete set");
assert.match(html, /REST_NOTIFICATION_CLICK/, "The open app must receive notification navigation without a reload");
assert.doesNotMatch(sw, /existing\.navigate\(/, "Notification taps must not reload an already-open PWA");
assert.match(sw, /existing\.postMessage\(\{ type: "REST_NOTIFICATION_CLICK", payload \}\)/, "The service worker must message the existing app");
assert.match(sw, /clients\.openWindow\(targetUrl\)/, "Cold notification taps must still launch the installed PWA");
assert.match(deliver, /completedSetId:[\s\S]*nextSetId:[\s\S]*timerVersion:/, "Push payloads must carry stable workout navigation identifiers");
assert.match(schedule, /timerVersion: Number\(body\.timerVersion \|\| 1\)/, "Scheduled notifications must persist a timer version");

assert.match(html, /\.set-block\.resting-set \{ border-left-color: var\(--rest-accent\) !important; border-right-color: var\(--rest-accent\) !important;/, "Resting rows must use matching gold side borders");
assert.doesNotMatch(html, /\.timer-bar\.complete/, "Completed-set green styling must not leak into the active rest timer");
assert.match(html, /\.timer-skip \{ background:[^}]*#607587/, "Skip must be visually distinct from gold timer adjustments");
assert.match(html, /data-timer-progress-label/, "The integrated progress track must include readable remaining time");

assert.match(html, /sequenceIndex: warmupIndex,[\s\S]*setTypeIndex: warmupIndex/, "Template warm-ups must receive stable canonical sequence positions");
assert.match(html, /sequenceIndex: configuredWarmups\.length \+ setNumber - 1/, "Working sets must follow every configured warm-up");
assert.match(html, /function canonicalSetSequence\(set\)/, "Display, progression, and notification navigation need one canonical set order");
assert.match(html, /return "Warm-Up " \+ \(Math\.max\(0, index\) \+ 1\) \+ " of " \+ warmups\.length/, "Warm-up progress must identify the current and total warm-up count");
assert.match(html, /const next = data\.sets\.find\(\(set\) => set\.id === completedTimer\.pendingNextSetId\) \|\| nextIncompleteSet/, "Timer completion must advance through the canonical sequence, including warm-ups");

const ordered = [
  { id: "working", sequenceIndex: 2, setType: "top" },
  { id: "warmup-2", sequenceIndex: 1, setType: "warmup" },
  { id: "warmup-1", sequenceIndex: 0, setType: "warmup" }
].sort((a, b) => Number(a.sequenceIndex) - Number(b.sequenceIndex));
assert.deepEqual(ordered.map((set) => set.id), ["warmup-1", "warmup-2", "working"], "Two warm-ups must execute before the first working set");

assert.match(html, /function resolveExerciseTargetContext\(session, exercise, options = \{\}\)/, "Expectations and scoring need one target resolver");
assert.match(html, /const context = resolveExerciseTargetContext\(session, exercise, \{ allowCurrentFallback \}\)/, "Actual-vs-Expected must consume the canonical target resolver");
assert.match(html, /group\.roles\.get\(roleKey\)/, "Actual-vs-Expected must aggregate top, straight, back-off, and drop roles separately");
assert.match(html, /Historical target unavailable[\s\S]*confidence is reduced/, "Unavailable historical targets need a precise low-confidence state");
assert.match(html, /expectedReps === 'Not configured' \? 'Excluded from score'/, "Genuinely missing targets must be excluded rather than penalized");

console.log("Rest navigation, timer presentation, warm-up ordering, and target mapping tests passed.");
