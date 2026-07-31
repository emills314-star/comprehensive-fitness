"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const engineApi = require("../prescription-engine");
const { readApplicationContractSource } = require("./read-application-contract-source");

const root = path.resolve(__dirname, "..");
const publicCheckout = process.env.CF_PUBLIC_CHECKOUT === "1";
const html = readApplicationContractSource(root);
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const foundation = fs.readFileSync(path.join(root, "app-foundation.js"), "utf8");
const workout = fs.readFileSync(path.join(root, "app-workout.js"), "utf8");
const views = fs.readFileSync(path.join(root, "app-views.js"), "utf8");
const analysis = fs.readFileSync(path.join(root, "app-analysis.js"), "utf8");
const imports = fs.readFileSync(path.join(root, "app-import.js"), "utf8");
const privacy = fs.readFileSync(path.join(root, "privacy.html"), "utf8");
const support = fs.readFileSync(path.join(root, "support.html"), "utf8");
const secondaryPageCss = fs.readFileSync(path.join(root, "resources", "secondary-page.css"), "utf8");

// Compile the application contract view before checking integration contracts.
[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((match) => new Function(match[1]));

assert.match(indexHtml, /<script src="\.\/prescription-engine\.js"><\/script>[\s\S]*<script src="\.\/exception-resolver\.js"><\/script>[\s\S]*<script src="\.\/app-foundation\.js"><\/script>/, "The browser must load the canonical exception resolver before application runtime consumers");
assert.doesNotMatch(indexHtml, /guided-mesocycle\.js/, "The deleted guided-planner runtime must not be loaded");
assert.doesNotMatch(foundation + workout + views + analysis, /familyProjectionStatus|familyTotals|weeklyMuscleVolume/, "Deleted weekly/fractional-volume analytics must not remain in current application state, workout, or rendering paths");
assert.match(imports, /weeklyMuscleVolumeResponse/, "Strict import compatibility must continue to recognize legacy evidence fields without rendering or recomputing them");
const startTemplateSource = workout.slice(workout.indexOf("function startTemplate("), workout.indexOf("function addSet(", workout.indexOf("function startTemplate(")));
assert.match(foundation, /const exceptionResolverApi = window\.FitnessExceptionResolver \|\| null/, "Application runtime must own one explicit canonical resolver dependency");
assert.match(foundation, /function stableTargetForTemplateExercise\(/, "Stable variant targets must have a dedicated construction boundary");
assert.match(startTemplateSource, /stableTargetForTemplateExercise\(templateExercise,/, "Workout start must use the stable variant target rather than a normal recommendation");
assert.match(startTemplateSource, /session\.resolvedActions = [\s\S]{0,160}resolveWorkoutExceptions\(/, "Workout start must persist canonical resolved actions");
assert.match(startTemplateSource, /applyResolvedActionToStableTarget\(historyTarget, resolvedAction\)/, "Only a resolved action may prospectively reduce a stable target");
assert.match(startTemplateSource, /stableTargetSnapshot:[\s\S]*resolvedActionId:/, "Workout exercises must persist stable facts and the canonical decision identity");
assert.match(startTemplateSource, /delete session\.workoutPrescription/, "Current workout start must discard a replaceable legacy draft prescription");
assert.doesNotMatch(startTemplateSource, /coachTargetForTemplateExercise|unifiedPrescriptionSnapshot|recommendationSnapshot:\s*target|recommendationHistory|applyManualOverride/, "The current start path must not generate recommendation snapshots, duplicate history, or engine manual overrides");
assert.match(imports, /"resolvedActions"/, "Strict import must preserve canonical resolved actions");
assert.match(foundation, /resolvedActions:\s*Array\.isArray\(session\.resolvedActions\)/, "The active draft must preserve the action visible during logging");
assert.match(views, /function renderResolvedAction\(/, "Visible exception copy must derive from one structural renderer");
assert.doesNotMatch(views, /renderRecommendationHead|renderUnifiedPrescriptionDetails|renderPrescriptionDetails|renderUnifiedEvidence/, "Today and active-workout surfaces must not retain normal recommendation, confidence, or evidence renderers");
assert.doesNotMatch(analysis, /function renderRecommendation\(|renderRecommendationHead|renderUnifiedEvidence/, "Progress must not become a second recommendation source");
assert.doesNotMatch(html, /function applyPrescriptionOverride\(/, "The deleted frontend engine-override adapter must not remain reachable");
assert.match(html, /manualOverrides:/, "App data must retain manual override events");
assert.match(html, /Base Session Intent[\s\S]*Today’s readiness may modify/, "Templates must distinguish stable intent from readiness changes");
assert.match(analysis, /chartKey:\s*"performance"/, "Progress must retain one factual primary performance chart");
assert.match(analysis, /load<\/span>[\s\S]*reps<\/span>[\s\S]*RPE<\/span>[\s\S]*role<\/span>/, "The factual chart detail must retain load, reps, RPE, and set role");
assert.doesNotMatch(html, /select-chart-period|hypertrophy-window/, "Progress must not retain deleted analytical period controls");
assert.doesNotMatch(views, /function renderUnifiedPrescriptionDetails\(|function renderPrescriptionDetails\(|function renderRecommendationHead\(/, "The normal interface must not retain a hidden legacy recommendation detail stack");
assert.doesNotMatch(analysis, /Research confidence|Unified prescription evidence|recommendation snapshots/, "Visible analysis/settings surfaces must not expose recommendation confidence, evidence status, or snapshot counts");
assert.match(html, /field: "nutritionStatus", label: "Nutrition today", action: "template-readiness-nutrition"[\s\S]*field: "proteinStatus", label: "Protein target", action: "template-readiness-protein"/, "The shared segmented readiness renderer must collect current nutrition and protein context in distinct fields");
assert.match(html, /if \(action === "template-readiness-nutrition"\) patchTemplateStartDraft\(\{ nutritionStatus: target\.value \}, false\);[\s\S]*if \(action === "template-readiness-protein"\) patchTemplateStartDraft\(\{ proteinStatus: target\.value \}, false\);/, "Nutrition and protein readiness choices must remain independently delegated into the draft");
assert.match(foundation, /function explicitSafetyCandidate\([\s\S]*category:\s*"pain_or_illness"[\s\S]*explicitSafetyInput:\s*true/, "Only explicit recorded safety input is currently approved to create a runtime exception candidate");
assert.match(html, /private personal evidence package/, "Hosted devices need a privacy-safe local evidence import");
assert.match(html, /id="support-guidance"/, "Settings support section needs a stable return anchor");
for (const [name, page, label] of [["privacy", privacy, "Close Privacy Policy"], ["support", support, "Close Support"]]) {
  assert.match(page, /secondary-page\.css/, `${name} must use the shared secondary-page header styles`);
  assert.match(page, new RegExp(`aria-label="${label}"`), `${name} must expose an accessible close label`);
  assert.match(page, /index\.html\?view=settings#support-guidance/, `${name} must return deterministically to Settings`);
}
assert.match(secondaryPageCss, /position:\s*sticky/, "shared secondary-page header must remain available while scrolling");

assert.match(html, /RestCompletionController/, "The app must use the deterministic rest-completion controller");
assert.match(html, /restCompletionController\.complete\(completedTimer/, "Timer completion must route through the single-receipt controller");
assert.match(html, /restCompleteAutoDismissMs: 5000/, "Rest overlay must default to exactly five seconds");
assert.match(html, /data-action="return-to-rest-workout"/, "Rest overlay must include Return to Workout");
assert.match(html, /data-action="preview-rest-complete-sound"/, "Settings must preview the selected rest sound");

assert.doesNotMatch(views, /Prescription detail|Research confidence|Why\? \/ Evidence|Why This Recommendation/, "Normal surfaces must not expose the deleted recommendation/evidence vocabulary");
assert.match(html, /roundLoadForUnit/, "all displayed and edited loads must use the shared precision boundary");

const evidence = engineApi.loadEvidenceFromFiles(root);
const engine = engineApi.createPrescriptionEngine(evidence);
const pools = engine.buildAllCandidatePools();
const latPool = engine.rankExercisePool("lats", { availableEquipment: ["all"] });
assert(!latPool.candidates.some((candidate) => /ab wheel/i.test(candidate.exerciseName)), "isometric zero-credit Ab Wheel involvement must not make it a lat candidate");
assert(latPool.candidates.some((candidate) => /pulldown|pull-up|chin/i.test(candidate.exerciseName)), "the lat pool must retain direct dynamic candidates");
latPool.candidates.forEach((candidate) => assert(Number.isFinite(candidate.scores.targetMuscleEffectiveness), "each candidate must expose target-muscle effectiveness separately"));
const represented = Object.keys(pools);
assert(represented.length >= 20, "The real databases should expose all represented muscle groups");
represented.forEach((muscle) => {
  const pool = pools[muscle];
  assert(pool.candidates.length <= 5, `${muscle} candidate pool must cap at five`);
  if (pool.availableViableExerciseCount >= 5) assert.equal(pool.candidates.length, 5, `${muscle} should expose five candidates when five are viable`);
});

const personal = evidence.personal.exerciseScores.find((item) => Number(item.comparable_session_count || 0) >= 5 && evidence.personal.historyFor(item.exercise_id).length >= 3);
let privateAssertionsSkipped = publicCheckout ? 1 : 0;
let exerciseId;
let muscle;
const prescriptionCandidates = [];
if (!publicCheckout) {
  assert(personal, "Real personal evidence needs at least one candidate for the isolated engine boundary");
  const muscleRecord = evidence.personal.muscleScoresFor(personal.exercise_id)[0];
  const personalMuscle = muscleRecord?.muscle_group || evidence.personal.prescriptionsFor(personal.exercise_id)[0]?.muscle_group_id;
  if (personalMuscle) prescriptionCandidates.push({ exerciseId: personal.exercise_id, muscle: personalMuscle, private: true });
}
for (const muscleId of represented) {
  for (const candidate of pools[muscleId]?.candidates || []) {
    prescriptionCandidates.push({ exerciseId: candidate.exerciseId, muscle: muscleId, private: false });
  }
}
let snapshot = null;
for (const candidate of prescriptionCandidates) {
  try {
    snapshot = engine.prescribeExercise({ exerciseId: candidate.exerciseId, muscleGroupId: candidate.muscle, availableEquipment: ["all"], createdAt: "2026-07-11T12:00:00.000Z" });
    exerciseId = candidate.exerciseId;
    muscle = candidate.muscle;
    if (!candidate.private) privateAssertionsSkipped = 1;
    break;
  } catch {
    // A legacy engine candidate can remain non-executable; current logging does not consume this path.
  }
}
assert(snapshot && muscle && exerciseId, "The isolated legacy engine boundary needs one deterministic executable synthetic/public candidate");
const surfaces = ["coach", "template", "chart", "workout_start", "live_workout", "deload"].map((surface) => engine.forSurface(snapshot, surface));
surfaces.forEach((surface) => {
  assert.equal(surface.recommendationId, snapshot.recommendationId);
  assert.deepEqual(surface.basePrescription, snapshot.basePrescription);
  assert.deepEqual(surface.finalPrescription, snapshot.finalPrescription);
});

const overridden = engine.applyManualOverride(snapshot, { setCount: snapshot.finalPrescription.workingSets.target + 1, setStructure: "straight_sets" }, { workoutId: "integration-workout", reason: "Integration override" });
assert.equal(overridden.overrideLocked, true);
assert.equal(engine.reconcileRecommendation(overridden, snapshot).checksum, overridden.checksum, "An intentional workout override must not be undone in the same workout");

console.log(`Prescription app integration passed (canonical resolved-action frontend; ${represented.length} public muscle pools retained as isolated engine evidence; ${privateAssertionsSkipped} truly private fixture assertion skipped).`);
