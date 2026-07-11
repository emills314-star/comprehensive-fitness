"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const engineApi = require("../prescription-engine");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

// Compile the single-file application before checking integration contracts.
[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((match) => new Function(match[1]));

assert.match(html, /<script src="\.\/prescription-engine\.js"><\/script>/, "The browser must load the unified engine before the app");
assert.match(html, /async function initializePrescriptionEvidence\(\)/, "App startup must load personal and research evidence");
assert.match(html, /await initializePrescriptionEvidence\(\)/, "Boot must wait for the evidence layer before rendering");
assert.match(html, /function unifiedPrescriptionSnapshot\(/, "All surfaces need one snapshot factory");
assert.match(html, /coachRecommendationForExercise[\s\S]*unifiedPrescriptionSnapshot/, "Chart/coach recommendations must use the unified snapshot");
assert.match(html, /coachTargetForTemplateExercise[\s\S]*unifiedPrescriptionSnapshot/, "Template targets must use the unified snapshot");
assert.match(html, /recommendationSnapshot: target\.recommendationSnapshot/, "Workout exercises must persist the exact generated snapshot");
assert.match(html, /session\.workoutPrescription = \{/, "Workout start must persist a versioned workout prescription");
assert.match(html, /recommendationHistory:/, "App data must preserve immutable recommendation history");
assert.match(html, /manualOverrides:/, "App data must retain manual override events");
assert.match(html, /applyPrescriptionOverride\(/, "Live workouts must support explicit prescription overrides");
assert.match(html, /evaluateWorkoutOverrideOutcomes\(/, "Completed workouts must evaluate override outcomes");
assert.match(html, /renderMesocyclePlanner\(/, "Plan must expose the mesocycle lifecycle");
assert.match(html, /Program Slot[\s\S]*Top Exercise Candidates/, "Planner must present program slots and ranked candidate alternatives");
assert.match(html, /Select for this role/, "Planner candidates must expose an explicit selection control");
assert.doesNotMatch(html, />Active-program subset</, "Misleading Active Program Subset UI term must be removed");
assert.doesNotMatch(html, />Preview prescription block</, "Misleading Prescription Block action must be removed");
assert.match(html, /Predicted Program Effectiveness[\s\S]*Confidence[\s\S]*Evidence/, "Effectiveness must be primary and distinct from confidence/evidence");
assert.match(html, /full-program review/i, "Planner must expose full-program interaction review");
assert.match(html, /Base Session Intent[\s\S]*Today’s readiness may modify/, "Templates must distinguish stable intent from readiness changes");
assert.match(html, /analysis-period-menu[\s\S]*select-chart-period/, "Charts period selection must use the custom control surface");
assert.doesNotMatch(html, /<select data-action="hypertrophy-window"/, "Charts must not retain the browser-default period dropdown");
assert.match(html, /primary_progression[\s\S]*alternative_exercise[\s\S]*lower_fatigue_resensitization[\s\S]*specialization/, "All four mesocycle types must be available");
assert.match(html, /renderMesocycleCandidate[\s\S]*Deload trigger:[\s\S]*Rotation trigger:[\s\S]*Preferred replacement:/, "Candidate cards must explain progression, deload, rotation and replacement");
assert.match(html, /Base prescription[\s\S]*Today only/, "Live UI must keep base and readiness-adjusted prescriptions distinct");
assert.match(html, /data-action="template-readiness-nutrition"[\s\S]*data-action="template-readiness-protein"/, "Workout readiness must collect current nutrition and protein context");
assert.match(html, /nutritionAdequate:[\s\S]*proteinAdequate:[\s\S]*energyAvailabilityLow:/, "Current nutrition must reach the unified readiness evaluation");
assert.match(html, /private personal evidence package/, "Hosted devices need a privacy-safe local evidence import");

assert.match(html, /RestCompletionController/, "The app must use the deterministic rest-completion controller");
assert.match(html, /restCompletionController\.complete\(completedTimer/, "Timer completion must route through the single-receipt controller");
assert.match(html, /restCompleteAutoDismissMs: 5000/, "Rest overlay must default to exactly five seconds");
assert.match(html, /data-action="return-to-rest-workout"/, "Rest overlay must include Return to Workout");
assert.match(html, /data-action="preview-rest-complete-sound"/, "Settings must preview the selected rest sound");

const evidence = engineApi.loadEvidenceFromFiles(root);
const engine = engineApi.createPrescriptionEngine(evidence);
const pools = engine.buildAllCandidatePools();
const represented = Object.keys(pools);
assert(represented.length >= 20, "The real databases should expose all represented muscle groups");
represented.forEach((muscle) => {
  const pool = pools[muscle];
  assert(pool.candidates.length <= 5, `${muscle} candidate pool must cap at five`);
  if (pool.availableViableExerciseCount >= 5) assert.equal(pool.candidates.length, 5, `${muscle} should expose five candidates when five are viable`);
});

const personal = evidence.personal.exerciseScores.find((item) => Number(item.comparable_session_count || 0) >= 5 && evidence.personal.historyFor(item.exercise_id).length >= 3);
assert(personal, "Real personal evidence needs at least one prescribable exercise");
const muscleRecord = evidence.personal.muscleScoresFor(personal.exercise_id)[0];
const muscle = muscleRecord?.muscle_group || evidence.personal.prescriptionsFor(personal.exercise_id)[0]?.muscle_group_id;
assert(muscle, "Personal exercise needs a represented muscle group");
const snapshot = engine.prescribeExercise({ exerciseId: personal.exercise_id, muscleGroupId: muscle, createdAt: "2026-07-11T12:00:00.000Z" });
const surfaces = ["coach", "template", "chart", "workout_start", "live_workout", "deload", "mesocycle"].map((surface) => engine.forSurface(snapshot, surface));
surfaces.forEach((surface) => {
  assert.equal(surface.recommendationId, snapshot.recommendationId);
  assert.deepEqual(surface.basePrescription, snapshot.basePrescription);
  assert.deepEqual(surface.finalPrescription, snapshot.finalPrescription);
});

for (const type of Object.values(engineApi.MESOCYCLE_TYPES)) {
  const mesocycle = engine.createMesocycle({ type, trainingDays: 4, specializationMuscleGroups: type === engineApi.MESOCYCLE_TYPES.SPECIALIZATION ? [muscle] : [] });
  assert.equal(mesocycle.type, type);
  assert.equal(mesocycle.status, "draft");
  assert(Object.keys(mesocycle.pools).length === represented.length);
  assert(mesocycle.programSlots.length === represented.length);
  assert(mesocycle.sessions.length === 4);
  assert(mesocycle.selectedPortfolio.length > 0);
}

const overridden = engine.applyManualOverride(snapshot, { setCount: snapshot.finalPrescription.workingSets.target + 1, setStructure: "straight_sets" }, { workoutId: "integration-workout", reason: "Integration override" });
assert.equal(overridden.overrideLocked, true);
assert.equal(engine.reconcileRecommendation(overridden, snapshot).checksum, overridden.checksum, "An intentional workout override must not be undone in the same workout");

console.log(`Prescription app integration passed (${represented.length} real muscle pools; all app surfaces share ${snapshot.recommendationId}).`);
