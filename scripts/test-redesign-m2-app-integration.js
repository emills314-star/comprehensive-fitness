"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");
const index = read("index.html");
const foundation = read("app-foundation.js");
const views = read("app-views.js");
const analysis = read("app-analysis.js");
const workout = read("app-workout.js");
const history = read("app-history.js");
const imported = read("app-import.js");

assert.ok(
  index.indexOf('<script src="./exception-resolver.js"></script>') < index.indexOf('<script src="./app-foundation.js"></script>'),
  "The canonical resolver must load before every application adapter and renderer"
);
assert.match(foundation, /const exceptionResolverApi = window\.FitnessExceptionResolver \|\| null/);
assert.match(foundation, /function resolveWorkoutExceptions\(/);
assert.match(foundation, /function stableTargetForTemplateExercise\(/);
assert.match(foundation, /function applyResolvedActionToStableTarget\(/);
assert.match(foundation, /contractVersion:\s*"comprehensive-fitness-active-draft\/2\.0\.0"/);
assert.match(foundation, /resolvedActions:\s*Array\.isArray\(session\.resolvedActions\)/);

assert.match(workout, /session\.resolvedActions = measurePerformance\("workoutStart:exceptionResolver"[\s\S]*resolveWorkoutExceptions\(/);
assert.match(workout, /stableTargetForTemplateExercise\(templateExercise/);
assert.match(workout, /applyResolvedActionToStableTarget\(historyTarget,\s*resolvedAction\)/);
assert.doesNotMatch(workout, /\b(?:unifiedPrescriptionSnapshot|boundedCustomPrescriptionSnapshot|applyPrescriptionOverride)\s*\(/);
assert.doesNotMatch(workout, /\brecommendationHistory\s*:|\bworkoutPrescription\s*:/);

assert.match(views, /function renderResolvedAction\(/);
assert.match(views, /Array\.isArray\(session\?\.resolvedActions\)/);
assert.doesNotMatch(views, /renderRecommendationHead|renderUnifiedEvidence|renderUnifiedPrescriptionDetails|renderPrescriptionDetails/);
assert.doesNotMatch(analysis, /function renderRecommendation\(|coachRecommendationForExercise\(/);
assert.doesNotMatch(history, /unifiedPrescriptionSnapshot\(|session\.readinessAdjustments|result\.readinessAdjustment|Fatigue warning/);
assert.match(history, /renderResolvedAction\(resolvedActionForScope\(session,\s*"session"\)/);

assert.match(imported, /FitnessExceptionResolver\?\.validateResolvedAction/);
assert.match(imported, /allowedSessionFields[\s\S]*"resolvedActions"/);
assert.doesNotMatch(imported, /function fatigueFlags\(|function recoveryRecommendationForSession\(|function adjustTargetForRecovery\(|function templateReadinessPreview\(/);

assert.doesNotMatch(foundation, /function unifiedPrescriptionSnapshot\(|function recommendForExerciseWeek\(|function coachRecommendationForExercise\(|function coachTargetForTemplateExercise\(/);
assert.doesNotMatch(foundation, /function recommendForTemplate\(|function cachedTemplateAdvice\(|adjustTargetForRecovery\(/);

console.log("Redesign M2 app integration passed (single resolver authority, canonical persistence/rendering, and no legacy live writers).");
