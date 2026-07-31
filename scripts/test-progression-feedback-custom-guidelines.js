"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const api = require("../prescription-engine");

const ROOT = path.resolve(__dirname, "..");
const evidence = api.loadEvidenceFromFiles(ROOT);
const customId = "user_custom_contract_press";
const baseRaw = evidence.personal.raw || {};
const withoutCustom = (rows) => (Array.isArray(rows) ? rows : []).filter((row) => String(row.exercise_id || row.exerciseId || "") !== customId);
const personalData = {
  exercisePrescriptions: [...withoutCustom(baseRaw.exercisePrescriptions || baseRaw.exercise_prescriptions), {
    exercise_id: customId,
    exercise_name: "Contract Press",
    muscle_group_id: "chest",
    role: "primary_hypertrophy",
    recommended_increment: 2.5,
    evidence_summary: "Declared custom profile"
  }],
  exerciseScores: [...withoutCustom(baseRaw.exerciseScores || baseRaw.exercise_scores), {
    exercise_id: customId,
    exercise_name: "Contract Press",
    overall_personal_exercise_score: 50,
    progression_score: 50,
    recovery_efficiency_score: 50,
    repeatability_score: 50,
    confidence_rating: "low"
  }],
  exerciseMuscleScores: [...withoutCustom(baseRaw.exerciseMuscleScores || baseRaw.exercise_muscle_scores), {
    exercise_id: customId,
    exercise_name: "Contract Press",
    muscle_group: "chest",
    muscle_role: "primary",
    contribution_weight: 1,
    muscle_specific_effectiveness_score: 70
  }],
  exerciseSessionMetrics: withoutCustom(baseRaw.exerciseSessionMetrics || baseRaw.exercise_session_metrics),
  weeklyMuscleVolumeResponse: baseRaw.weeklyMuscleVolumeResponse || baseRaw.weekly_muscle_volume_response || [],
  recoveryRules: baseRaw.recoveryRules || baseRaw.recovery_rules || [],
  muscleGroupSweetSpots: baseRaw.muscleGroupSweetSpots || baseRaw.muscle_group_sweet_spots || [],
  metadata: { ...(baseRaw.metadata || {}), methodology_version: "contract+custom-profile/1.0.0" }
};
const engine = api.createPrescriptionEngine({ personalData, research: evidence.research, personalDataVersion: "contract+custom-profile/1.0.0", researchDatabaseVersion: evidence.versions.research });
const createdAt = "2026-07-21T12:00:00.000Z";
const base = engine.prescribeExercise({ exerciseId: customId, muscleGroupId: "chest", trainingGoal: "hypertrophy", experienceLevel: "advanced", createdAt });

assert.equal(base.schemaVersion, "1.4.0");
assert.equal(base.recommendationVersion, "2.4.0");
assert.equal(base.standardGuideline.schemaVersion, "standard-guideline/1.0.0");
assert.equal(base.standardGuideline.source, "bounded_custom_profile");
assert.equal(base.standardGuideline.customExercise, true);
assert.match(base.standardGuideline.explanation, /does not make canonical ranking, biomechanics, substitution, or equivalence claims/i);

const rpe = (base.finalPrescription.targetRpe.min + base.finalPrescription.targetRpe.max) / 2;
const prescribed = base.finalPrescription.workingSets.target;
const extraReps = base.standardGuideline.repRange.max + 2;
const exposure = (date, quality = "controlled", pain = false) => ({
  exposure_id: `app:${date}:${quality}`,
  workout_id: `workout-${date}`,
  session_id: `workout-${date}`,
  exercise_id: customId,
  workout_date: date,
  progression_status: "improved",
  comparison_performance_value: 100,
  best_epley_e1rm: 100,
  set_repetitions: JSON.stringify(Array(prescribed).fill(extraReps)),
  set_loads: JSON.stringify(Array(prescribed).fill(75)),
  set_rpes: JSON.stringify(Array(prescribed).fill(rpe)),
  average_rpe: rpe,
  completed_set_count: prescribed,
  prescribed_set_count: prescribed,
  completed_set_ratio: 1,
  technique_valid: quality === "controlled" ? true : quality === "breakdown" ? false : null,
  technique_quality: quality,
  pain
});

const controlled = engine.prescribeExercise({
  exerciseId: customId,
  muscleGroupId: "chest",
  trainingGoal: "hypertrophy",
  experienceLevel: "advanced",
  history: [exposure("2026-07-07"), exposure("2026-07-14"), exposure("2026-07-21")],
  createdAt: "2026-07-22T12:00:00.000Z"
});
assert.equal(controlled.basePrescription.progressionConfirmation.satisfied, true, "controlled extra-rep exposures must remain eligible progression evidence");
assert.deepEqual(controlled.standardGuideline.repRange, base.standardGuideline.repRange, "actual extra reps must not rewrite the versioned research standard");

const unassessed = engine.prescribeExercise({
  exerciseId: customId,
  muscleGroupId: "chest",
  trainingGoal: "hypertrophy",
  experienceLevel: "advanced",
  history: [exposure("2026-07-07", "not_assessed"), exposure("2026-07-14"), exposure("2026-07-21")],
  createdAt: "2026-07-22T12:00:00.000Z"
});
assert.equal(unassessed.basePrescription.progressionConfirmation.satisfied, false, "unassessed execution must not confirm progression");

const breakdown = engine.prescribeExercise({
  exerciseId: customId,
  muscleGroupId: "chest",
  trainingGoal: "hypertrophy",
  experienceLevel: "advanced",
  history: [exposure("2026-07-07"), exposure("2026-07-14"), exposure("2026-07-21", "breakdown")],
  createdAt: "2026-07-22T12:00:00.000Z"
});
assert.equal(breakdown.basePrescription.progressionConfirmation.satisfied, false, "execution breakdown must retain progression-blocking precedence");

const views = fs.readFileSync(path.join(ROOT, "app-views.js"), "utf8");
const workout = fs.readFileSync(path.join(ROOT, "app-workout.js"), "utf8");
const foundation = fs.readFileSync(path.join(ROOT, "app-foundation.js"), "utf8");
const history = fs.readFileSync(path.join(ROOT, "app-history.js"), "utf8");
const imports = fs.readFileSync(path.join(ROOT, "app-import.js"), "utf8");
const resolver = fs.readFileSync(path.join(ROOT, "exception-resolver.js"), "utf8");

const stableTargetSource = foundation.match(/function stableTargetForTemplateExercise[\s\S]*?\n\s*function sessionTypeForTemplate/)?.[0] || "";
assert.match(stableTargetSource, /decision: "stable_target"[\s\S]*mode: "stable-target"/, "the app must derive ordinary workout targets from the saved exercise variant");
assert.match(stableTargetSource, /adjusted: false[\s\S]*stableTarget: true/, "ordinary targets must remain stable until a canonical exception is applied");

const exceptionBoundarySource = foundation.match(/function resolveWorkoutExceptions[\s\S]*?\n\s*function resolvedActionForVariant/)?.[0] || "";
assert.match(exceptionBoundarySource, /exceptionResolverApi\.resolveExceptionCandidates/, "the app must use the canonical exception resolver");
assert.match(exceptionBoundarySource, /priorDecisions: Array\.isArray\(session\.resolvedActions\)/, "persisted canonical decisions must be supplied for handling and supersession");
assert.match(exceptionBoundarySource, /explicitSafetyObservation/, "explicit pain or illness must cross the canonical safety boundary");

assert.match(workout, /session\.resolvedActions = measurePerformance\("workoutStart:exceptionResolver"/, "workout start must persist the canonical resolver result");
assert.match(workout, /stableTargetForTemplateExercise\(templateExercise[\s\S]*resolvedActionForVariant\(session\.resolvedActions, exerciseVariantId\)[\s\S]*applyResolvedActionToStableTarget\(historyTarget, resolvedAction\)/, "only a resolved action may temporarily adapt a stable workout target");
assert.match(workout, /stableTargetSnapshot:[\s\S]*resolvedActionId:/, "a started exercise must retain stable facts and the canonical advisory action identity");
assert.doesNotMatch(workout, /stableTargetSnapshot:[\s\S]{0,600}executionBlocked/, "current workout construction must not write a hidden logging blocker");
assert.match(foundation, /recorded_safety_action_is_advisory/, "recorded pain or illness must remain advisory while logging stays available");
assert.match(views, /function renderResolvedAction[\s\S]*resolvedAction\.outcome !== "action"\) return ""/, "ordinary sessions must remain visually quiet");
assert.match(views, /renderResolvedAction\(resolvedActionForScope\(session, "session"\)/, "the workout surface must render only its persisted canonical session action");
assert.match(views, /renderResolvedAction\(resolvedActionForScope\(owningSession, "exercise", exercise\)/, "exercise surfaces must render only the matching persisted canonical action");
assert.match(views, /data-action="set-rpe"/, "canonical actions must not remove the normal RPE logging control");
assert.match(history, /Array\.isArray\(session\?\.resolvedActions\)/, "grading must consume persisted canonical actions");
assert.match(imports, /assertResolvedAction[\s\S]*record\.resolvedActions/, "imports must validate persisted canonical actions");
assert.match(resolver, /function validateResolvedAction/, "the canonical action boundary must expose runtime validation");

for (const legacyName of [
  "unifiedPrescriptionSnapshot",
  "legacyTargetFromSnapshot",
  "boundedCustomPrescriptionSnapshot",
  "renderRecommendation"
]) {
  assert.doesNotMatch(`${foundation}\n${workout}\n${views}`, new RegExp(`function ${legacyName}\\b`), `${legacyName} must not remain as an application target or rendering path`);
}
assert.match(imports, /customExerciseProfile/);
assert.match(imports, /executionQualityAssessment/);

console.log("Progression evidence and canonical resolved-action application contracts passed.");
