const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");

assert.match(html, /renderRecoveryPanel\(session\) \+ renderTodayPlan\(\)/, "Today's readiness must render before Today's Plan");
assert.doesNotMatch(html, /function readinessScore\(|function readinessBandStatus\(/, "The app must not retain a second readiness scoring algorithm beside the prescription engine");
assert.doesNotMatch(html, /readinessBandStatus\(/, "Recovery rendering must not call the removed legacy readiness scorer");
assert.match(html, /Readiness engine unavailable; no automatic adjustment was applied/, "Unavailable readiness logic must fail conservatively without inventing a fallback score");
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
inlineScripts.forEach((script) => new Function(script));

function extractBraceBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing source block marker: ${marker}`);
  const blockStart = source.indexOf("{", markerIndex + marker.length);
  assert.notEqual(blockStart, -1, `Missing opening brace after source block marker: ${marker}`);
  let depth = 0;
  for (let index = blockStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(blockStart + 1, index);
  }
  assert.fail(`Missing closing brace for source block marker: ${marker}`);
}

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
assert.match(html, />Discard Workout</, "Cancellation must use concise explicit destructive wording inside the confirmation dialog");
assert.match(html, /function sessionCanBeDiscarded\(session\)/, "Any open legacy or canonical draft must be explicitly discardable");
assert.match(html, /data-action="request-cancel-workout" data-session-id=/, "The cancel action must identify the visible draft instead of assuming it is canonical");
assert.match(html, /data\.sessions\.filter\(\(item\) => item\.id !== session\.id\)/, "Cancellation must remove only the selected active session");
assert.match(html, /removeWorkoutFromSyncQueue\(session\.id\)/, "Canceled drafts must be removed from pending synchronization");
assert.match(html, /template-readiness-sleep-quality"\) patchTemplateStartDraft\(\{ sleepQuality: target\.value \}, false\)/, "Readiness selectors must not rebuild and refocus the sheet while entering metrics");
assert.match(html, /if \(templateStartFlow && !data\.templates\.some/, "Invalid modal state must not leave the application inert");
const mobileFormControlCss = extractBraceBlock(html, "@media (max-width: 719px)");
assert.match(mobileFormControlCss, /input, select, textarea \{ font-size: max\(16px,\s*1rem\); \}/, "Mobile form controls must prevent iOS focus zoom without overriding larger user text");
assert.match(html, /function renderPrescriptionDetails\(exercise\)/, "Recommendation rationale must use the structured readable renderer");
assert.match(html, /class="role-progression-facts"/, "Recommendation rationale must separate role-specific confidence, range, and increment");
assert.match(html, /class="cancel-impact"/, "Workout cancellation must explain removed and preserved data visually");
assert.match(html, /async function beginHistoryEdit\(\)/, "Logged workouts must enter an explicit asynchronous edit transaction");
const beginHistoryEditStart = html.indexOf("async function beginHistoryEdit()");
const beginHistoryEditEnd = html.indexOf("function requestHistoryEditConfirmation", beginHistoryEditStart);
const beginHistoryEditSource = html.slice(beginHistoryEditStart, beginHistoryEditEnd);
const cloneStableIndex = beginHistoryEditSource.indexOf("const stableData = cloneAppData(data)");
const persistStableIndex = beginHistoryEditSource.indexOf("await persistStableAppDataSnapshot(stableData)");
const retainStableIndex = beginHistoryEditSource.indexOf("originalData: stableData");
assert.ok(cloneStableIndex >= 0 && cloneStableIndex < persistStableIndex && persistStableIndex < retainStableIndex, "History editing must clone, durably persist, and then retain the same stable snapshot for cancellation");
assert.match(html, /Save Edits/, "History editing must expose a save action");
assert.match(html, /Cancel Edits/, "History editing must expose a cancel action");
assert.match(html, /const editingHistory = isEditingHistorySession\(\);[\s\S]*?if \(!editingHistory\) acknowledgeActiveSet/, "Historical set edits must not start live-workout behavior");
assert.match(html, /if \(action === "close-completed-summary"\) returnToLiftHome/, "Closing a completed workout must return to the Lift home");
assert.match(html, /readinessReviewTitle\.textContent = "Today's Readiness Adjustments"/, "Readiness headings must render with encoding-safe apostrophes");
assert.match(html, /function explainReadinessAdjustmentChoice\(original, adjusted, triggers\)/, "Readiness rationale must explain why load, reps, sets, RPE, and rest were selected");
assert.match(html, /Why these levers:/, "Readiness explanations must separate the trigger from the adjustment mechanism");
assert.match(html, /function renderLiftHome\(\)/, "The idle Lift tab must use a dedicated program home view");
assert.match(html, /Overall Program Hypertrophy Score/, "The Lift home must lead with the overall hypertrophy score");
assert.match(html, /function hypertrophyScoreTone\(score\)/, "Hypertrophy scores must use stable range-based color coding");
assert.match(html, /\.brand-bar::before/, "The top header background must extend across the full viewport");
assert.match(html, /viewingHistorySessionId = isSessionSubmitted/, "Logged workouts must only remain visible when deliberately opened from history");
assert.match(html, /\.volume-card\.expanded \{ grid-column: 1 \/ -1;/, "Expanded weekly muscle details must span the full dashboard width");
assert.match(html, /\.volume-exercise-row > span:first-child small \{ display: none; \}/, "Weekly muscle details must omit distracting volume-load strings");
assert.match(html, /score-excellent \{ --score-color: var\(--current\); \}/, "Excellent scores must resolve into the app's established blue");
assert.match(html, /score-very-good \{ --score-color: #1f9272; \}/, "Very-good scores must bridge green and blue with a distinct teal");
assert.match(html, /score-good \{ --score-color: #86a423; \}/, "Good scores must bridge amber and teal with a yellow-green tone");
assert.match(html, /function hypertrophyLetterGrade\(score\)/, "Program and exercise scores must expose one centralized letter-grade mapping");
assert.match(html, /if \(value >= 97\) return "A\+";[\s\S]*if \(value >= 60\) return "D-";[\s\S]*return "F";/, "Letter grades must support A+ through F using stable thresholds");
assert.match(html, /class="hypertrophy-score-grade" role="img" aria-label="Letter grade \$\{escapeHtml\(hypertrophyGradeLabel/, "The large score grade must announce its letter grade accessibly");
assert.doesNotMatch(html, /hypertrophy-score-ring|conic-gradient\(var\(--score-color\)/, "Letter grades must not be enclosed in a progress ring");
assert.match(html, /hypertrophyAnalysis\(hypertrophyWindowOffset, "exercise", selectedExerciseId\)/, "Charts must calculate only the selected exercise score");
assert.doesNotMatch(html, /Score scope/, "Charts must not retain the overall-program scope selector");
assert.doesNotMatch(html, /data-action="set-hypertrophy-scope"/, "Charts must not expose a hidden overall-program scope action");
assert.match(html, /clearDataFlow\.acknowledged && clearDataFlow\.phrase === "CLEAR"/, "Local clearing must require acknowledgment and typed confirmation");
assert.match(html, /Permanently Clear Local Data/, "The final device-wide deletion action must be explicit");
assert.match(html, /enteredReadinessTriggers/, "Readiness adjustments must use explicit entered markers");
assert.match(html, /triggerAppliesToExercise/, "Targeted readiness concerns must be filtered by exercise");
assert.match(html, /originalPrescription: historyTarget/, "Original prescriptions must remain inspectable");
assert.match(html, /sessionGroups/, "Weekly volume details must retain session-level structure");

console.log("Workout safety tests passed (active state, cancellation, readiness, clearing, and volume structure).");
