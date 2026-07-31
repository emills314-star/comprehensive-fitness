const assert = require("node:assert/strict");
const fs = require("node:fs");
const { readApplicationContractSource } = require("./read-application-contract-source");

const html = readApplicationContractSource();
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
scripts.forEach((script) => new Function(script));

const section = (start, end) => {
  const startIndex = html.indexOf(start);
  const endIndex = html.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `Expected section ${start}`);
  return html.slice(startIndex, endIndex);
};

const inputHandler = section('root.addEventListener("input"', "async function applyWorkoutDeepLink");
const templateRenderer = section("function renderTemplates()", "function renderHistory(");
const historyRenderer = section("function renderHistory()", "function normalizeSetTypeCode(");
const setCompletion = section("function toggleSetCompletion(setId)", "function toggleSetSkipped(setId)");

assert.match(html, /performanceDebugEnabled = \["127\.0\.0\.1", "localhost"\][\s\S]*has\("perf"\)/, "Performance diagnostics must remain development-only");
assert.match(html, /window\.__CF_PERF__ = performanceEvents/, "Development profiling should expose bounded timing events");
assert.match(html, /performanceEvents\.length > 250/, "Performance diagnostics must remain bounded");

assert.match(html, /function dataEntityIndex\(\)[\s\S]*setIndexById[\s\S]*setIndicesByExercise/, "Workout edits must use ID indexes instead of repeated full-array scans");
assert.match(html, /function patchSetValue\([\s\S]*const set = setById\(setId\)/, "Set-value edits must resolve the target directly by ID");
assert.match(html, /const index = dataEntityIndex\(\)\.setIndexById\.get\(setId\)/, "Set patches must use the indexed array position");
assert.match(html, /function setsForExercise\(exerciseId\)[\s\S]*setIndicesByExercise\.get\(exerciseId\)/, "Exercise rows must read only their own indexed sets");

assert.match(html, /ACTIVE_DRAFT_KEY = "comprehensive-fitness-active-draft-v1"/, "Active workouts need a compact persistence record");
assert.match(html, /draftSaveTimer = window\.setTimeout\(persistActiveWorkoutDraft, 120\)/, "Compact draft persistence must be debounced without delaying the visible input");
assert.match(html, /requestIdleCallback\(saveData, \{ timeout: 1500 \}\)/, "Full-history persistence must move off the immediate input path");
assert.match(html, /}, 1800\);[\s\S]*function activeWorkoutDraftSnapshot/, "Full data writes must be batched after input settles");
assert.match(html, /function restoreActiveWorkoutDraft\(\)[\s\S]*snapshot\.sets[\s\S]*workoutState: "active"/, "A compact draft must restore the active workout safely");
assert.match(html, /localStorage\.setItem\(ACTIVE_DRAFT_KEY, JSON\.stringify\(snapshot\)\)/, "Immediate-close recovery needs a compact synchronous fallback");
assert.match(html, /visibilityState === "hidden" && hasActiveWorkout\(\)\) persistActiveWorkoutDraft\(\)/, "Suspending the PWA must persist the latest draft");

assert.doesNotMatch(inputHandler, /hypertrophyAnalysis|weeklyMuscleVolume|fatigueFlags|calculateWorkoutAnalysis/, "Input handlers must not run completed-history analysis");
assert.match(inputHandler, /const writeSetInput[\s\S]*patchSetValue\(target\.dataset\.setId, field, target\.value, false\)/, "Visible set input must update locally through the validated mutation boundary without a full render");
assert.match(inputHandler, /action === "set-reps"\) writeSetInput\("reps"\)/, "Visible rep input must use the local validated writer");
assert.match(inputHandler, /action === "set-weight"\) writeSetInput\("weight"\)/, "Visible load input must use the local validated writer");
assert.match(inputHandler, /action === "set-rpe"\) writeSetInput\("rpe"\)/, "Visible RPE input must use the local validated writer");
assert.match(inputHandler, /accepted === false[\s\S]*target\.value = String\(setById/, "Rejected set input must restore the persisted visible value without a full render");
assert.match(inputHandler, /inserted\.length === 1 && replacement === previousValue \+ inserted/, "Numeric replacement must only strip a proven single-character append");
assert.doesNotMatch(inputHandler, /replacement\.startsWith\(previousValue\)/, "Multi-character values such as 8.5 must not be mistaken for appended input");
assert.match(setCompletion, /patchSet\(set\.id, \{ completed: true, skipped: false \}, false\)[\s\S]*startTimer/, "Completing a set must update locally before timer work");
assert.doesNotMatch(setCompletion, /data\.sets\.map/, "Completing one set must not clone the full set history");

assert.match(html, /function invalidateCompletedAnalysis\(\)[\s\S]*previousPerformanceCache\.clear\(\)[\s\S]*submittedPerformanceIndexCache\.clear\(\)[\s\S]*exerciseProgressCache\.clear\(\)/, "Factual history and performance caches need one invalidation boundary");
assert.doesNotMatch(html, /hypertrophyScoreCache|weeklyVolumeCache|exerciseWeekCache/, "Deleted analytical caches must not remain in the application");
assert.doesNotMatch(html, /function hypertrophyAnalysis|function weeklyMuscleVolume/, "Deleted hypertrophy and weekly-volume producers must not remain in the application");
assert.doesNotMatch(html, /function fatigueFlags\(/, "Legacy numeric fatigue thresholds must not remain in the application");

assert.equal((templateRenderer.match(/id="active-workout-template-notice"/g) || []).length, 1, "Routine management may show one concise active-draft notice");
assert.match(templateRenderer, /Starting another routine will ask whether to resume, finish, or discard/, "The routine notice must explain the shared draft guard");
assert.match(templateRenderer, /data-action="resume-active-workout">Resume/, "The routine notice must provide Resume");
assert.doesNotMatch(templateRenderer, /const startDisabledAttributes = locked|disabled aria-describedby="active-workout-template-notice"/, "Other routine Start controls must remain operable so the shared Resume/Finish/Discard conflict can explain the protected draft");
assert.match(templateRenderer, /data-action="start-template"/, "Routine management must retain a Start action that delegates to the shared active-draft guard");
assert.match(templateRenderer, /const startDisabledAttributes = emptyTemplate[\s\S]*disabled aria-describedby="' \+ escapeHtml\(emptyTemplateDescriptionId\)/, "Empty-template Start buttons must be truly disabled with an accessible explanation");
assert.doesNotMatch(templateRenderer, /Submit or cancel .* before starting another template/, "Template cards must not repeat the restriction on every row");
assert.doesNotMatch(templateRenderer, /fatigueFlags\(/, "Opening Templates must not recalculate completed-history fatigue analysis");
assert.match(templateRenderer, /const advice = null;/, "Routine-list rendering must remain free of normal recommendation advice");
assert.match(templateRenderer, /const editorExpanded = expandedTemplateEditorIds\.has\(template\.id\)/, "Template editors must be expanded explicitly");
assert.match(templateRenderer, /\$\{editorExpanded \? `<div class="disclosure-body">/, "Collapsed template editors must not generate their exercise controls");
assert.doesNotMatch(historyRenderer, /Grade ['"]?\s*\+|Grade \$\{/, "Progress History must not prefix the visible grade with the word Grade");
assert.match(historyRenderer, /class="ri-copy"><b>[\s\S]*session\.title/, "Progress History session names must remain the primary row copy");
assert.match(historyRenderer, /class="ri-val" aria-label="Stored workout grade/, "Progress History grades must remain separately labelled stored facts");
assert.match(html, /\.row-item \.ri-copy b \{[^}]*font-size: var\(--fs-tiny\);[^}]*font-weight: 850;/, "Progress History session names must retain the shared strong row hierarchy");
assert.match(html, /\.grade-tone\.score-excellent \{ --grade-color: var\(--current\); \}/, "Recent History and summaries must share the grade color system");
assert.match(historyRenderer, /sessions\.length[\s\S]*Completed workouts will appear here/, "Progress History must retain a bounded empty-state render");

console.log("Performance architecture tests passed (input path, persistence, factual caches, templates, and history).");
