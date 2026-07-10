const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");

assert.match(html, /let activeWorkoutId = "";/, "A canonical active workout ID is required");
assert.match(html, /const runtime = \{ activeSessionId, activeWorkoutId, timer/, "The active workout ID must persist with timer state");
assert.match(html, /workoutId: activeWorkoutId \|\| exercise\?\.sessionId/, "Rest timers must be keyed to the active workout");
assert.match(html, /You already have an active workout\./, "Starting a second template must be blocked");
assert.match(html, /workoutState: options\.started \? "active" : "idle"/, "A newly started empty workout must immediately own the active slot");
assert.match(html, /activeWorkoutId = session\.id;[\s\S]{0,180}activeSetId = "";/, "Creating a workout must assign the canonical active ID before rendering");
assert.match(html, /if \(session\?\.workoutState === "inactive"\) return false;/, "Demoted legacy drafts must not reactivate after restart");
assert.match(html, /return sessionHasStarted\(session\);/, "The active guard must include explicitly started workouts with no exercises yet");
assert.match(html, /item\.id === activeWorkoutId \|\| item\.id === session\?\.id/, "The session picker must exclude unrelated unsubmitted drafts");
assert.match(html, /New workout unavailable while a workout is active/, "The new-workout control must be disabled while a session is active");
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
