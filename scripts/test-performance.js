const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
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
const recentHistoryRenderer = section("function recentHistoryCardModel(", "function renderRecoveryPanel(");
const recentHistoryModelSource = section("function recentHistoryCardModel(", "if (performanceDebugEnabled) window.__CF_TEST__");
const setCompletion = section("function toggleSetCompletion(setId)", "function toggleSetSkipped(setId)");

const recentHistoryCardModel = new Function(
  "sessionCompletionDate",
  "performanceDebugEnabled",
  "recentHistoryDataIssueIds",
  "WORKOUT_GRADE_THRESHOLDS",
  "workoutGradeScoreTone",
  "formatDate",
  recentHistoryModelSource + "; return recentHistoryCardModel;"
)(
  (session) => String(session?.completedAt || session?.submittedAt || session?.date || "").slice(0, 10),
  false,
  new Set(),
  [{ minimum: 97, grade: "A+" }, { minimum: 87, grade: "B+" }, { minimum: 0, grade: "F" }],
  (score) => score >= 90 ? "score-excellent" : score >= 80 ? "score-very-good" : "score-critical",
  (date) => date === "2026-07-10" ? "July 10" : "Date unavailable"
);

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
assert.match(inputHandler, /patchSetValue\(target\.dataset\.setId, "reps", target\.value, false\)/, "Visible rep input must update locally without a full render");
assert.match(inputHandler, /patchSetValue\(target\.dataset\.setId, "weight", target\.value, false\)/, "Visible load input must update locally without a full render");
assert.match(inputHandler, /patchSetValue\(target\.dataset\.setId, "rpe", target\.value, false\)/, "Visible RPE input must update locally without a full render");
assert.match(inputHandler, /inserted\.length === 1 && replacement === previousValue \+ inserted/, "Numeric replacement must only strip a proven single-character append");
assert.doesNotMatch(inputHandler, /replacement\.startsWith\(previousValue\)/, "Multi-character values such as 8.5 must not be mistaken for appended input");
assert.match(setCompletion, /patchSet\(set\.id, \{ completed: true, skipped: false \}, false\)[\s\S]*startTimer/, "Completing a set must update locally before timer work");
assert.doesNotMatch(setCompletion, /data\.sets\.map/, "Completing one set must not clone the full set history");

assert.match(html, /function invalidateCompletedAnalysis\(\)[\s\S]*exerciseWeekCache\.clear\(\)[\s\S]*weeklyVolumeCache\.clear\(\)/, "Completed-history caches need one invalidation boundary");
assert.match(html, /function hypertrophyAnalysis[\s\S]*hypertrophyScoreCache\.has\(key\)[\s\S]*hypertrophyScoreCache\.set\(key, result\)/, "Hypertrophy analyses must be keyed and reusable");
assert.match(html, /function weeklyMuscleVolume[\s\S]*weeklyVolumeCache\.has\(cacheKey\)/, "Weekly volume must not be recomputed during every dashboard render");
assert.match(html, /function fatigueFlags[\s\S]*fatigueFlagCache\.has\(cacheKey\)/, "Fatigue flags must not be recomputed during every dashboard render");
assert.match(html, /function renderActiveWorkoutAdvice\(\)[\s\S]*exercise\.prescription[\s\S]*does not recalculate the full training history/, "Active workout advice must use the prescription saved at workout start");

assert.equal((templateRenderer.match(/id="active-workout-template-notice"/g) || []).length, 1, "Templates should show one active-workout notice");
assert.match(templateRenderer, /Return to Active Workout/, "The compact notice must resume the canonical workout");
assert.match(templateRenderer, /locked \? 'disabled aria-describedby="active-workout-template-notice"/, "Other template Start buttons must be truly disabled");
assert.doesNotMatch(templateRenderer, /Submit or cancel .* before starting another template/, "Template cards must not repeat the restriction on every row");
assert.match(templateRenderer, /running \? null : cachedTemplateAdvice/, "Locked template cards must not recalculate coaching history");

assert.match(recentHistoryRenderer, /class="recent-history-card"/, "Recent History needs a structured mobile card");
assert.match(recentHistoryRenderer, /session\?\.workoutAnalysis\?\.version === 1/, "Recent History must reuse stored workout grades");
assert.doesNotMatch(recentHistoryRenderer, /workoutAnalysisForSession/, "Recent History must not recalculate grades while rendering rows");
assert.doesNotMatch(recentHistoryRenderer, /["']Grade\s/, "Recent History must display only the letter grade");
assert.match(recentHistoryRenderer, /workoutName[\s\S]*completedDate[\s\S]*workoutGrade/, "Recent History must model title, date, and grade as separate fields");
assert.match(recentHistoryRenderer, /class="recent-history-title"[\s\S]*class="recent-history-meta"/, "The full-width title must render before the metadata row");
assert.match(recentHistoryRenderer, /class="recent-history-date"[\s\S]*dateMarkup \+ '<span class="recent-history-grade/, "Date and grade must render as separate metadata values");
assert.match(recentHistoryRenderer, /aria-label="' \+ escapeHtml\(accessibleLabel\)/, "The entire card must expose an accessible workout, date, and grade label");
assert.match(recentHistoryRenderer, /Date unavailable/, "Missing dates need a controlled fallback");
assert.match(recentHistoryRenderer, /&mdash;/, "Missing grades need a neutral fixed-area placeholder");
assert.match(html, /\.recent-history-title \{[^}]*overflow-wrap: anywhere;[^}]*white-space: normal;/, "Long workout names must wrap without touching metadata");
assert.match(html, /\.recent-history-card \{[^}]*grid-template-columns: minmax\(0, 1fr\);/, "Workout titles need a dedicated full-width card row");
assert.match(html, /\.recent-history-meta \{[^}]*grid-template-columns: minmax\(0, 1fr\) 44px;/, "Date and grade need separate metadata tracks");
assert.match(html, /\.recent-history-grade \{[^}]*width: 44px;[^}]*white-space: nowrap;/, "Plus and minus grades must stay in a fixed non-wrapping area");
assert.doesNotMatch(html, /\.recent-history-row\s*\{|\.recent-history-copy\s*\{/, "Conflicting legacy Recent History row styles must be removed");
assert.match(html, /\.grade-tone\.score-excellent \{ --grade-color: var\(--current\); \}/, "Recent History and summaries must share the grade color system");
assert.match(html, /Friday Neck Day[\s\S]*Tuesday \\u2014 Heavy Push \+ Calves \+ Light Quads[\s\S]*Monday Neck Day/, "The mobile fixture must retain the previously failing workout names");

const missingHistoryRecord = recentHistoryCardModel({ id: "missing" });
assert.equal(missingHistoryRecord.workoutName, "Workout", "Missing workout names need a controlled fallback");
assert.equal(missingHistoryRecord.completedDateLabel, "Date unavailable", "Missing dates need a controlled fallback");
assert.equal(missingHistoryRecord.workoutGrade, "", "Missing grades must remain semantically empty");
assert.equal(missingHistoryRecord.gradeTone, "score-unavailable", "Missing grades need the neutral centralized tone");

const gradeWithoutStoredScore = recentHistoryCardModel({ id: "grade", title: "Friday Neck Day", date: "2026-07-10", workoutAnalysis: { version: 1, grade: "B+", internalScore: null } });
assert.equal(gradeWithoutStoredScore.completedDateLabel, "July 10", "Valid dates must retain the shared display format");
assert.equal(gradeWithoutStoredScore.workoutGrade, "B+", "A valid stored letter grade must remain intact");
assert.equal(gradeWithoutStoredScore.gradeTone, "score-very-good", "Letter-grade fallback styling must use the centralized score mapping");

console.log("Performance architecture tests passed (input path, persistence, caches, templates, and Recent History).");
