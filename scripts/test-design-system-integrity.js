"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const views = fs.readFileSync(path.join(root, "app-views.js"), "utf8");
const analysis = fs.readFileSync(path.join(root, "app-analysis.js"), "utf8");
const history = fs.readFileSync(path.join(root, "app-history.js"), "utf8");
const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || "";

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = nextName ? source.indexOf(`function ${nextName}(`, start + 1) : source.length;
  assert.ok(start >= 0 && end > start, `${name} must remain independently inspectable`);
  return source.slice(start, end);
}

const renderRoot = functionSource(views, "render", "resizeExerciseNameFields");
const renderWorkout = functionSource(views, "renderWorkout", "resolvedActionForScope");
const renderUpdateBanner = functionSource(views, "renderUpdateBanner", "renderOfflineBanner");
const renderOptionalReadinessSheet = functionSource(views, "renderOptionalReadinessSheet", "requestCancelWorkout");
const renderTemplateStartSheet = functionSource(views, "renderTemplateStartSheet", "requestCancelWorkout");
const renderCancelWorkoutSheet = functionSource(views, "renderCancelWorkoutSheet", "closeCancelWorkout");
const renderResolvedAction = functionSource(views, "renderResolvedAction", "renderLiftHome");
const renderLiftHome = functionSource(views, "renderLiftHome", "workoutProgress");
const renderHistory = functionSource(analysis, "renderHistory", "normalizeSetTypeCode");
const renderChartPointDetail = functionSource(analysis, "renderChartPointDetail", "renderLiftProgress");
const renderStoragePersistenceFact = functionSource(analysis, "renderStoragePersistenceFact", "renderSettings");
const renderSettings = functionSource(analysis, "renderSettings");
const renderCompletedSummary = functionSource(history, "renderCompletedWorkoutSummary");

assert.doesNotMatch(renderTemplateStartSheet, /Nothing is lost either way/, "destructive conflict copy must not promise zero loss");
assert.match(renderTemplateStartSheet, /data-action="discard-active-workout"/, "the active-draft conflict must offer an explicit Discard action");
assert.match(renderCancelWorkoutSheet, /permanently remove|permanently removed/i, "the destructive confirmation must name permanent draft loss");
assert.doesNotMatch(renderTemplateStartSheet, /step === ["'](?:confirm|review)["']|review-template-readiness|start-original-workout/, "the start sheet must not retain confirmation or prescription-review states");
assert.match(renderHistory, /isSessionSubmitted\(session\)[\s\S]*sessionCompletionDate[\s\S]*Every submitted workout remains available/, "Progress must retain the full submitted archive in chronological order");
assert.match(renderUpdateBanner, /wait while an active workout remains open/, "update copy must describe the real active-workout gate");

assert.doesNotMatch(renderRoot, /shellProgress/, "the shell must not repeat workout progress owned by the workout and dock");
assert.doesNotMatch(renderWorkout, /workout-status-strip/, "the active hero must not repeat its current-focus fact");
assert.doesNotMatch(renderHistory, /History · \$\{totalSessions\}/, "History count must be owned by the roll-up");
assert.doesNotMatch(renderCancelWorkoutSheet, /<h2[^>]*>\$\{completedSets\}/, "the cancel heading must not repeat the diff-owned completed-set count");
assert.match(renderCancelWorkoutSheet, /completedSets[\s\S]*unsubmitted draft will be permanently removed[\s\S]*Submitted history and routines stay intact/, "destructive copy must concisely distinguish draft loss from preserved records");
assert.doesNotMatch(renderSettings, /formatTimer\(Number\(data\.settings\.defaultRestSeconds/, "Settings must not restate default rest in a second format");
assert.match(renderCompletedSummary, /workout-grade-hero[\s\S]*workout-grade-mark/, "the grade mark must remain the sole visible grade value in the completion hero");
assert.match(renderCompletedSummary, /Why this grade[\s\S]*reasons\.slice\(0, 3\)/, "the completion hero must pair the grade with at most three plain reasons");
assert.doesNotMatch(renderCompletedSummary, /confidence|categoryScores|internalScore|summary-diff-result|achievement/i, "the concise completion must not expose grade internals, plan adherence, or achievements");
assert.match(renderLiftHome, /Expected workout[\s\S]*data-action="start-next-template"/, "Today must present the expected workout and one primary Start action");
assert.doesNotMatch(renderLiftHome, /Stable target|Last time|weekly volume|hypertrophy|confidence|evidence/i, "Today must not restore the deleted analysis preview");
assert.match(renderResolvedAction, /if \(!resolvedAction \|\| resolvedAction\.outcome !== "action"\) return ""/, "the exception renderer must remain silent unless the canonical resolver produced an action");
assert.match(renderResolvedAction, /resolvedAction\.action\?\.code[\s\S]*resolvedAction\.category[\s\S]*resolvedAction\.reasonCodes/, "the exception renderer must consume the canonical resolved action rather than recomputing a recommendation");
assert.doesNotMatch(renderResolvedAction, /confidence|evidence|matrix|training window|qualification/i, "the concise exception card must not expose internal confidence or evidence machinery");
assert.doesNotMatch(views, /function renderRolePrescriptionDetails\(|function renderUnifiedPrescriptionDetails\(/, "deleted prescription-evidence renderers must not return");
assert.doesNotMatch(views, /\b(?:setPrescription|finalPrescription|exercise\.prescription)\b|Review prescription/, "views must not render legacy prescription fallbacks or warning copy");
assert.doesNotMatch(history, /\b(?:setPrescription|finalPrescription|exercise\.prescription)\b/, "completion grading must use stable targets and set facts, not legacy prescriptions");

assert.match(renderChartPointDetail, /Selected session[\s\S]*chart-point-rollup[\s\S]*load[\s\S]*reps[\s\S]*RPE[\s\S]*role[\s\S]*Recorded sets/, "A selected factual chart point must expose date, load, reps, RPE, role, and source sets");
assert.doesNotMatch(views, /function readinessMetricDelta\(|function readinessMetricField\(/, "the categorical readiness flow must not retain numeric delta scoring");
assert.match(renderOptionalReadinessSheet, /Not entered[\s\S]*Usual[\s\S]*Unusually good[\s\S]*Meaningfully poor/, "readiness must remain a brief categorical deviation input");
assert.doesNotMatch(renderStoragePersistenceFact, /class="ri-val d |tone:/, "storage-persistence facts must remain plain ink");

const subFloorRem = [...style.matchAll(/font-size:\s*(0?\.\d+)rem/g)]
  .filter((match) => Number(match[1]) < 0.75)
  .map((match) => match[0]);
const subFloorPx = [...style.matchAll(/font-size:\s*([0-9.]+)px/g)]
  .filter((match) => Number(match[1]) < 12)
  .map((match) => match[0]);
assert.deepEqual(subFloorRem, [], "literal rem font sizes must respect the 12px floor");
assert.deepEqual(subFloorPx, [], "literal pixel font sizes must respect the 12px floor");
assert.match(style, /\.set-previous small[^}]*font-size: var\(--fs-data\)/, "--fs-data must remain confined to dense active-set data");
assert.match(style, /\.set-logged \.lbl[^}]*font-size: var\(--fs-data\)/, "the logged set grid may use the reserved data step");

const directHexDeclarations = style.split(/\r?\n/).filter((line) => {
  const declarations = (line.includes("{") ? line.slice(line.indexOf("{") + 1) : line).split(";");
  return declarations.some((declaration) => {
    const match = declaration.match(/^\s*([-\w]+)\s*:\s*([^{}]*)$/);
    return Boolean(match && !match[1].startsWith("--") && /#[0-9a-f]{3,8}\b/i.test(match[2]));
  });
});
assert.deepEqual(directHexDeclarations, [], "component declarations must consume color tokens instead of raw hex values");
assert.doesNotMatch(style, /workout-session-board|session-board-module|session-exercise-rail|session-exercise-index|session-exercise-state|support-drawer/, "replaced Workout Board chrome must not remain in production CSS");
assert.doesNotMatch(style, /hypertrophy-score|volume-table|volume-exercise-row|progress-switcher/, "deleted score, weekly-volume, and persistent Progress-subview styles must not remain");
assert.doesNotMatch(style, /(?:claim-card\[data-conf|confidence-unavailable|prescription-(?:brief|claim|base|override|change-list)|readiness-review-sheet|readiness-comparison|volume-card|history-by-exercise|history-exercise|chart-set-diff|exercise-history-diff|plan-card|plan-list|chart-metric-row|fatigue-explanation)/, "orphan confidence, prescription, readiness-comparison, planner, and analytics styles must not remain");

console.log("Design-system integrity contract passed.");
