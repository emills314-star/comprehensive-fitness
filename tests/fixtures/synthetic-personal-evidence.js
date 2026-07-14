"use strict";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function syntheticPersonalEvidencePackage(options = {}) {
  const exerciseId = options.exerciseId || "custom_synthetic_prior_press";
  const exerciseName = options.exerciseName || "Synthetic Prior Press";
  const researchExerciseId = options.researchExerciseId || "ex_barbell_bench_press";
  const version = options.version || "1.0.0";
  const sourceReference = [{
    source_id: "synthetic_import_contract",
    source_path: "synthetic/import-contract.json",
    worksheet: null,
    source_record_id: exerciseId,
    source_row: 1,
    source_date: "2026-07-14",
    notes: "Synthetic aggregate fixture; no personal records."
  }];
  const shared = {
    exercise_id: exerciseId,
    exercise_name: exerciseName,
    research_exercise_id: researchExerciseId,
    source_date_range: { start_date: "2026-01-01", end_date: "2026-06-30" },
    analysis_date: "2026-07-14",
    methodology_version: version,
    sample_size: 6,
    confidence_level: "moderate",
    missing_data_flags: [],
    source_references: sourceReference,
    notes: ["Synthetic aggregate fixture; no personal records."],
    evidence_summary: "Synthetic aggregate used only to verify private-package import boundaries."
  };
  return {
    schemaVersion: "personal-evidence-package/1.0.0",
    createdAt: "2026-07-14T12:00:00.000Z",
    personalDataVersion: version,
    researchDatabaseVersion: "2.0.0",
    privacy: "private_local_only_do_not_deploy",
    personalData: {
      exercisePrescriptions: [{
        ...shared,
        prescription_id: `prescription_${exerciseId}`,
        muscle_group_id: "chest",
        research_muscle_group_id: "chest",
        role: "primary_progression_lift",
        primary_muscle_group_id: "chest",
        secondary_muscle_group_ids: ["triceps"],
        recommended_sets_per_session: { min: 2, max: 4 },
        recommended_rep_range: { min: 6, max: 10 },
        progression_rule: "Hold until a comparable synthetic exposure exists."
      }],
      exerciseScores: [{
        ...shared,
        session_count: 6,
        comparable_session_count: 6,
        overall_personal_exercise_score: 60,
        progression_score: 60,
        recovery_efficiency_score: 60
      }],
      exerciseMuscleScores: [{
        ...shared,
        muscle_group: "chest",
        research_muscle_group_id: "chest",
        contribution_weight: 1,
        muscle_specific_effectiveness_score: 60,
        comparable_sessions: 6
      }],
      exerciseSessionMetrics: [],
      weeklyMuscleVolumeResponse: [],
      recoveryRules: [],
      muscleGroupSweetSpots: [],
      metadata: {
        methodology_version: version,
        pipeline_version: version,
        analysis_date: "2026-07-14",
        privacy: "synthetic_test_fixture_only"
      }
    }
  };
}

function conflictingIdentityPersonalEvidencePackage() {
  const value = syntheticPersonalEvidencePackage({
    exerciseId: "custom_synthetic_conflicting_press",
    exerciseName: "Synthetic Conflicting Press",
    researchExerciseId: "ex_barbell_bench_press",
    version: "1.0.4"
  });
  value.personalData.exerciseMuscleScores[0].research_exercise_id = "ex_incline_dumbbell_press";
  return value;
}

function partialPersonalEvidencePackage(missingCollection) {
  const value = syntheticPersonalEvidencePackage({
    exerciseId: `custom_synthetic_partial_${missingCollection}`,
    exerciseName: "Synthetic Partial Press",
    version: "1.0.5"
  });
  delete value.personalData[missingCollection];
  return value;
}

module.exports = {
  clone,
  conflictingIdentityPersonalEvidencePackage,
  partialPersonalEvidencePackage,
  syntheticPersonalEvidencePackage
};
