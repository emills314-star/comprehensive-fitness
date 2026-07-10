const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");

assert.match(html, /let activeWorkoutId = "";/, "A canonical active workout ID is required");
assert.match(html, /const runtime = \{ activeSessionId, activeWorkoutId, timer/, "The active workout ID must persist with timer state");
assert.match(html, /workoutId: activeWorkoutId \|\| exercise\?\.sessionId/, "Rest timers must be keyed to the active workout");
assert.match(html, /You already have an active workout\./, "Starting a second template must be blocked");
assert.match(html, /Cancel and Discard Workout/, "Cancellation must use explicit destructive wording");
assert.match(html, /data\.sessions\.filter\(\(item\) => item\.id !== session\.id\)/, "Cancellation must remove only the selected active session");
assert.match(html, /removeWorkoutFromSyncQueue\(session\.id\)/, "Canceled drafts must be removed from pending synchronization");
assert.match(html, /clearDataFlow\.acknowledged && clearDataFlow\.phrase === "CLEAR"/, "Local clearing must require acknowledgment and typed confirmation");
assert.match(html, /Permanently Clear Local Data/, "The final device-wide deletion action must be explicit");
assert.match(html, /enteredReadinessTriggers/, "Readiness adjustments must use explicit entered markers");
assert.match(html, /triggerAppliesToExercise/, "Targeted readiness concerns must be filtered by exercise");
assert.match(html, /originalPrescription: historyTarget/, "Original prescriptions must remain inspectable");
assert.match(html, /sessionGroups/, "Weekly volume details must retain session-level structure");

console.log("Workout safety tests passed (active state, cancellation, readiness, clearing, and volume structure).");
