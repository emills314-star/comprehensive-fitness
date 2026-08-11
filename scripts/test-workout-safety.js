const assert = require("node:assert/strict");
const fs = require("node:fs");
const { readApplicationContractSource } = require("./read-application-contract-source");

const html = readApplicationContractSource();

assert.doesNotMatch(html, /const planReadinessHtml = measurePerformance\("lift:planReadiness"/, "The active logger must not append the removed recovery-adjustment section");
assert.doesNotMatch(html, /function readinessScore\(|function readinessBandStatus\(/, "The app must not retain a second readiness scoring algorithm beside the prescription engine");
assert.doesNotMatch(html, /readinessBandStatus\(/, "Recovery rendering must not call the removed legacy readiness scorer");
assert.doesNotMatch(html, /function recoveryRecommendationForSession\(/, "Unavailable readiness must not fall back to the retired legacy recommendation producer");
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
assert.match(html, /resume-active-workout[\s\S]*finish-active-workout[\s\S]*discard-active-workout/, "Starting a second template must be blocked behind Resume, Finish, or Discard");
assert.match(html, /workoutState: options\.started \? "active" : "idle"/, "A newly started empty workout must immediately own the active slot");
assert.match(html, /activeWorkoutId = session\.id;[\s\S]{0,180}activeSetId = "";/, "Creating a workout must assign the canonical active ID before rendering");
assert.match(html, /if \(session\?\.workoutState === "inactive"\) return false;/, "Demoted legacy drafts must not reactivate after restart");
assert.match(html, /return sessionHasStarted\(session\);/, "The active guard must include explicitly started workouts with no exercises yet");
assert.match(html, /item\.id === activeWorkoutId \|\| item\.id === session\?\.id/, "The session picker must exclude unrelated unsubmitted drafts");
const renderWorkoutSource = extractBraceBlock(html, "function renderWorkout(");
assert.doesNotMatch(renderWorkoutSource, /data-action="new-session"/, "The active workout must not expose a redundant new-session control");
assert.match(html, />Discard workout</, "Cancellation must use concise explicit destructive wording inside the confirmation dialog");
assert.match(html, /function sessionCanBeDiscarded\(session\)/, "Any open legacy or canonical draft must be explicitly discardable");
assert.match(html, /data-action="request-cancel-workout" data-session-id=/, "The cancel action must identify the visible draft instead of assuming it is canonical");
assert.match(html, /data\.sessions\.filter\(\(item\) => item\.id !== session\.id\)/, "Cancellation must remove only the selected active session");
assert.doesNotMatch(html, /removeWorkoutFromSyncQueue\(/, "Canceled drafts must remain local-only after cloud workout-copy decommissioning");
assert.match(html, /function patchTemplateStartDraft\([\s\S]*if \(!optionalReadinessFlow\) return;[\s\S]*optionalReadinessFlow = \{[\s\S]*draft: cleanRecovery/ , "The readiness draft writer must be scoped only to the optional readiness flow");
assert.match(html, /template-readiness-deviation"\) patchTemplateStartDraft\(\{ readinessDeviation: target\.value \}, false\)/, "The optional categorical readiness selector must not rebuild and refocus the sheet while entering a deviation");
assert.doesNotMatch(html, /step:\s*["']confirm["']|step:\s*["']review["']|review-template-readiness|start-original-workout/, "Start must not retain confirmation or prescription-review states");
const mobileFormControlCss = extractBraceBlock(html, "@media (max-width: 719px)");
assert.match(mobileFormControlCss, /input, select, textarea \{ font-size: max\(16px,\s*1rem\); \}/, "Mobile form controls must prevent iOS focus zoom without overriding larger user text");
assert.doesNotMatch(html, /function renderPrescriptionDetails\(|function renderRolePrescriptionDetails\(/, "The active logger must not retain normal recommendation/evidence renderers");
assert.match(html, /function renderResolvedAction\(/, "Rare exceptions must use the single canonical resolved-action renderer");
assert.match(html, /unsubmitted draft will be permanently removed[\s\S]*Submitted history and routines stay intact/, "Workout cancellation must name permanent draft loss and the submitted history and routines that remain");
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
assert.match(html, /if \(action === "close-completed-summary"\) returnToToday/, "Closing a completed workout must return to Today");
assert.match(html, /action === "start-template" \|\| action === "start-next-template"[\s\S]*startTemplate\([^;]*defaultRecovery\(\), "usual"\)/, "Start must open the active logger directly with usual readiness");
assert.doesNotMatch(html, /function explainReadinessAdjustmentChoice\(|Why these levers:/, "The normal flow must not retain the deleted readiness target-mutation explanation");
assert.match(html, /function renderLiftHome\(\)/, "The idle state must use the dedicated Today workout view");
assert.match(html, /Expected workout[\s\S]*data-action="start-next-template"/, "Today must lead with the expected workout and one primary Start action");
assert.doesNotMatch(html, /Overall Program Hypertrophy Score|function hypertrophyScoreTone\(|function hypertrophyAnalysis\(/, "Deleted hypertrophy score products must not remain");
assert.match(html, /\.brand-bar::before/, "The top header background must extend across the full viewport");
assert.match(html, /viewingHistorySessionId = isSessionSubmitted/, "Logged workouts must only remain visible when deliberately opened from history");
assert.doesNotMatch(html, /function weeklyMuscleVolume\(|data-action="open-dashboard-detail"|data-action="set-hypertrophy-scope"/, "Deleted volume dashboards and score scope controls must not remain");
assert.match(html, /function exercisePerformanceSeries\(/, "Progress must retain a factual exercise-performance series");
assert.match(html, /renderChart\("performance"[\s\S]*renderHistory\(\{ exercise \}\)/, "Progress must retain one performance chart followed by submitted workout history");
assert.match(html, /class="completed-summary score-|class="grade-tone score-/, "Stored workout grades must retain their existing factual tone system");
assert.match(html, /clearDataFlow\.acknowledged && clearDataFlow\.phrase === "CLEAR"/, "Local clearing must require acknowledgment and typed confirmation");
assert.match(html, /Permanently Clear Local Data/, "The final device-wide deletion action must be explicit");
assert.doesNotMatch(html, /function unifiedSnapshotForFatigueFlag\(/, "Legacy fatigue-to-prescription translation must be removed");
assert.doesNotMatch(html, /function fatigueFlags\(/, "Legacy numeric fatigue thresholds must not remain in the application");
assert.doesNotMatch(html, /function recoveryRecommendationForSession\(/, "Legacy readiness recommendation production must be removed");
assert.doesNotMatch(html, /function enteredReadinessTriggers\(/, "Legacy readiness threshold trigger production must be removed");
assert.doesNotMatch(html, /function adjustTargetForRecovery\(/, "Legacy readiness target mutation must be removed");
assert.doesNotMatch(html, /function templateReadinessPreview\(/, "Legacy readiness preview target mutation must be removed");
assert.match(html, /stableTargetSnapshot:\s*\{[\s\S]*repLow:[\s\S]*repHigh:[\s\S]*rpe:[\s\S]*restSeconds:/, "Started exercises must preserve their stable routine target facts");
assert.match(html, /previousComparableSet:\s*prefill\.previousComparableSet/, "Generated working sets must preserve factual prior-performance context");
assert.doesNotMatch(html, /data-action="auto-scroll-next"/, "Workout settings must not offer automatic next-set viewport movement");
assert.equal((html.match(/scheduleActiveSetScroll\(/g) || []).length, 2, "Set scrolling must exist only as the helper plus explicit exercise navigation");
assert.doesNotMatch(html, /autoScrollNextSet !== false/, "Set completion and rest transitions must never move the viewport automatically");
assert.equal((html.match(/autoScrollNextSet/g) || []).length, 1, "Legacy auto-scroll may appear only in the obsolete import discard allowlist");
for (const obsoleteSetting of ["colorPackage", "workoutCompletionSound", "interactionVibration", "restCompleteLockScreenNotifications"]) {
  assert.equal((html.match(new RegExp(obsoleteSetting, "g")) || []).length, 1, `${obsoleteSetting} may appear only in the obsolete import discard allowlist`);
}
assert.doesNotMatch(html, /data-action="(?:theme-mode|color-package|workout-completion-sound|interaction-vibration)"/, "Settings must not expose removed appearance or generic completion-feedback controls");
assert.doesNotMatch(html, /\[data-(?:theme|color-package)=/, "The fixed visual system must not retain theme or package selector branches");
assert.doesNotMatch(html, /function (?:playWorkoutCompletionSound|performInteractionFeedback)\(/, "Removed workout-completion and generic haptic effects must not remain callable");
assert.match(html, /renderSegmentedSetting\("weight-unit"/, "Settings must retain the weight-unit integrity control");

console.log("Workout safety tests passed (active state, cancellation, readiness, factual progress, and clearing).");
