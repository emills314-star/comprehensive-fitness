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
const renderWorkout = functionSource(views, "renderWorkout", "workoutSessionRollup");
const renderWorkoutRollup = functionSource(views, "renderWorkoutRollup", "renderNotificationPrompt");
const renderUpdateBanner = functionSource(views, "renderUpdateBanner", "renderOfflineBanner");
const readinessMetricDelta = functionSource(views, "readinessMetricDelta", "readinessMetricField");
const renderTemplateStartSheet = functionSource(views, "renderTemplateStartSheet", "prescriptionLine");
const renderCancelWorkoutSheet = functionSource(views, "renderCancelWorkoutSheet", "closeCancelWorkout");
const renderResolvedAction = functionSource(views, "renderResolvedAction", "todayPlanPreview");
const renderTodayPlanPreview = functionSource(views, "renderTodayPlanPreview", "renderLiftHome");
const renderGuidedPriority = functionSource(views, "renderGuidedMusclePrioritySummary", "renderGuidedExerciseWorkspace");
const renderGuidedMesocycle = functionSource(views, "renderGuidedMesocycle", "renderMesocyclePlanner");
const renderHistory = functionSource(analysis, "renderHistory", "exerciseDeloadPresentation");
const chartPointComparison = functionSource(analysis, "chartPointSetComparison", "renderChartPointSetGroups");
const renderStoragePersistenceFact = functionSource(analysis, "renderStoragePersistenceFact", "renderSettings");
const renderSettings = functionSource(analysis, "renderSettings");
const renderCompletedSummary = functionSource(history, "renderCompletedWorkoutSummary");

assert.doesNotMatch(renderTemplateStartSheet, /Nothing is lost either way/, "destructive conflict copy must not promise zero loss");
assert.match(renderTemplateStartSheet, /Discarding permanently removes this draft/, "destructive conflict copy must name permanent draft loss");
assert.doesNotMatch(renderHistory, /do not affect charts, coaching, PRs, templates, or weekly volume/, "retention copy must not deny live archive consumers");
assert.match(renderHistory, /full submitted archive[\s\S]*fallback coaching evidence/, "retention copy must disclose the full archive and fallback use");
assert.match(renderUpdateBanner, /wait while an active workout remains open/, "update copy must describe the real active-workout gate");

assert.doesNotMatch(renderRoot, /shellProgress/, "the shell must not repeat workout progress owned by the workout and dock");
assert.doesNotMatch(renderWorkout, /workout-status-strip/, "the active hero must not repeat its current-focus fact");
assert.doesNotMatch(renderHistory, /History · \$\{totalSessions\}/, "History count must be owned by the roll-up");
assert.doesNotMatch(renderCancelWorkoutSheet, /<h2[^>]*>\$\{completedSets\}/, "the cancel heading must not repeat the diff-owned completed-set count");
assert.match(renderCancelWorkoutSheet, /exerciseIds\.size[\s\S]*draftSets\.length[\s\S]*completedSets/, "destructive copy must enumerate all exercise and set records being removed");
assert.doesNotMatch(renderSettings, /formatTimer\(Number\(data\.settings\.defaultRestSeconds/, "Settings must not restate default rest in a second format");
assert.match(renderCompletedSummary, /completionHeadline[\s\S]*workout-grade-mark/, "the grade mark must remain the sole visible grade value beside the evidence-backed completion headline");
assert.doesNotMatch(renderGuidedMesocycle, /<h2>' \+ result\.blockingCount/, "viability counts must be owned by the roll-up");
assert.match(renderTodayPlanPreview, /Stable target[\s\S]*Last time[\s\S]*Effort/, "Today must present the stable routine target beside factual prior performance");
assert.doesNotMatch(renderTodayPlanPreview, /confidence|evidence|recommendation/i, "the ordinary Today preview must remain silent about internal recommendation evidence");
assert.match(renderResolvedAction, /if \(!resolvedAction \|\| resolvedAction\.outcome !== "action"\) return ""/, "the exception renderer must remain silent unless the canonical resolver produced an action");
assert.match(renderResolvedAction, /resolvedAction\.action\?\.code[\s\S]*resolvedAction\.category[\s\S]*resolvedAction\.reasonCodes/, "the exception renderer must consume the canonical resolved action rather than recomputing a recommendation");
assert.doesNotMatch(renderResolvedAction, /confidence|evidence|matrix|training window|qualification/i, "the concise exception card must not expose internal confidence or evidence machinery");
assert.doesNotMatch(views, /function renderRolePrescriptionDetails\(|function renderUnifiedPrescriptionDetails\(/, "deleted prescription-evidence renderers must not return");

assert.match(renderWorkoutRollup, /rollup\.drift > 0 \? "out" : "under"/, "RPE drift below target must use under, not over");
assert.match(chartPointComparison, /actualReps < repLow\) delta = \{ tone: "under"/, "reps below target must use under");
assert.match(chartPointComparison, /actualReps > repHigh\) delta = \{ tone: "out"/, "reps above a ceiling must use out");
assert.match(chartPointComparison, /actualRpe < rpeLow\) delta = \{ tone: "under"/, "RPE below target must use under");
assert.match(readinessMetricDelta, /tone: "none"/, "raw readiness differences must remain neutral facts");
assert.doesNotMatch(readinessMetricDelta, /tone: desirable|stronglyAdverse/, "raw readiness differences must not invent a semantic judgement");
assert.doesNotMatch(renderStoragePersistenceFact, /class="ri-val d |tone:/, "storage-persistence facts must remain plain ink");
assert.match(renderGuidedPriority, /item\.overallStatus === 'needs_frequency'[\s\S]*tone: 'under'/, "frequency shortfalls must agree with their warning pill");
assert.match(renderGuidedPriority, /item\.overallStatus === 'needs_distribution'[\s\S]*tone: 'under'/, "distribution shortfalls must agree with their warning pill");

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

console.log("Design-system integrity contract passed.");
