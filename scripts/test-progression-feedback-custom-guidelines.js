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

assert.match(views, /Recommendation setup incomplete/);
assert.match(views, /customGuidanceIncomplete[\s\S]*customGuidanceIncomplete \? "" : renderExerciseGuidance\(exercise\)/, "incomplete custom exercises must not show fabricated broad guidance");
assert.match(views, /Primary muscle group[\s\S]*Resistance mode[\s\S]*Exercise style[\s\S]*Progression metric[\s\S]*Smallest available increment/);
assert.match(views, /Exercise defaults[\s\S]*Research[\s\S]*Saved[\s\S]*Working sets[\s\S]*Rep range[\s\S]*Working rest[\s\S]*Warm-up rest/);
for (const label of ["Within standard", "Below standard", "Above standard"]) assert.match(views, new RegExp(label));
assert.match(views, /function renderStandardWorkloadControls[\s\S]*snapshot\?\.standardGuideline \|\| snapshot\?\.basePrescription[\s\S]*No exercise-specific range/, "every active exercise must render defaults while preserving optional versioned research context");
assert.match(views, /Individual set targets[\s\S]*Drop sets, different reps or different rest/, "the defaults editor must include the nested individual-set disclosure");
assert.match(views, /data-set-default-field="type"[\s\S]*data-set-default-field="rep-min"[\s\S]*data-set-default-field="rest"/, "the nested editor must expose per-set type, rep, and rest controls");
assert.doesNotMatch(views, /data-standard-save-template checked/, "future-template saving must be unchecked by default");
assert.match(workout, /function applyExerciseDefaultTargets[\s\S]*completedWorking[\s\S]*incompleteWorking[\s\S]*targetRestSeconds[\s\S]*User-saved exercise defaults/);
assert.match(workout, /templateSetTypesFromHistory\(workSets, exercise\.restSeconds\)/, "template updates must preserve individual set targets");
assert.match(workout, /user_custom_[\s\S]*user_declared_custom/);
assert.match(foundation, /exposure_id: `app:\$\{session\.id\}:\$\{exercise\.id\}`/);
const unifiedSnapshotSource = foundation.match(/function unifiedPrescriptionSnapshot[\s\S]*?function recommendationLabel/)[0];
assert.match(unifiedSnapshotSource, /customProfile\?\.status === "complete" && exercise\.identitySource === "user_declared_custom"[\s\S]*boundedCustomPrescriptionSnapshot\(exercise, customProfile, options\)/, "fresh custom previews must regenerate through the bounded custom engine path");
assert.doesNotMatch(foundation.match(/function unifiedTargetContext[\s\S]*?function cancelPendingDataSave/)[0], /customProfile|boundedCustomPrescriptionSnapshot|engineFailure/, "custom regeneration belongs only to snapshot creation, not target projection");
assert.doesNotMatch(foundation.match(/function appPrescriptionHistory[\s\S]*?function prescriptionHistoryForExercise/)[0], /summarizeExerciseByWeek/);
assert.match(history, /Did execution stay controlled\?/);
assert.match(history, /Base next exposure/);
assert.match(imports, /customExerciseProfile/);
assert.match(imports, /executionQualityAssessment/);

console.log("Progression feedback, custom guidance, exact-exposure, and editable-guideline contracts passed.");
