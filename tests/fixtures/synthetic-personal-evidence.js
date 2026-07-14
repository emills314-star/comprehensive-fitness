"use strict";

const PERSONAL_EVIDENCE_BOUNDARIES = Object.freeze({
  fileBytes: 8 * 1024 * 1024,
  jsonDepth: 32,
  objectKeys: 128,
  coreCollectionItems: 1024,
  stableIdChars: 128,
  nameChars: 256,
  textChars: 4096
});

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
        prescription_id: options.prescriptionId || `prescription_${exerciseId}`,
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

function boundedExerciseId(index) {
  return `custom_synthetic_boundary_${String(index).padStart(4, "0")}`;
}

function rowWithIdentity(row, index, collection) {
  const value = clone(row);
  const exerciseId = boundedExerciseId(index);
  value.exercise_id = exerciseId;
  value.exercise_name = `Synthetic Boundary Exercise ${index}`;
  value.source_references = (value.source_references || []).map((reference) => ({
    ...reference,
    source_record_id: exerciseId
  }));
  if (collection === "exercisePrescriptions") value.prescription_id = `prescription_boundary_${String(index).padStart(4, "0")}`;
  return value;
}

function personalEvidenceWithMatchedCoreCount(count, version = "1.2.0") {
  if (!Number.isInteger(count) || count < 1) throw new Error(`Invalid matched core fixture count: ${count}`);
  const value = syntheticPersonalEvidencePackage({ version });
  for (const collection of ["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores"]) {
    const row = value.personalData[collection][0];
    value.personalData[collection] = Array.from({ length: count }, (_, index) => rowWithIdentity(row, index, collection));
  }
  return value;
}

function jsonValueAtDepth(depth) {
  if (!Number.isInteger(depth) || depth < 1) throw new Error(`Invalid synthetic JSON depth: ${depth}`);
  let value = "synthetic-depth-leaf";
  for (let level = 0; level < depth; level += 1) value = { nested: value };
  return value;
}

function jsonDepth(value) {
  if (value === null || typeof value !== "object") return 0;
  const children = Array.isArray(value) ? value : Object.values(value);
  return 1 + (children.length ? Math.max(...children.map(jsonDepth)) : 0);
}

function maximumObjectWidth(value) {
  if (value === null || typeof value !== "object") return 0;
  const children = Array.isArray(value) ? value : Object.values(value);
  const ownWidth = Array.isArray(value) ? 0 : Object.keys(value).length;
  return Math.max(ownWidth, ...children.map(maximumObjectWidth), 0);
}

function jsonObjectAtWidth(width) {
  return Object.fromEntries(Array.from(
    { length: width },
    (_, index) => [`synthetic_key_${String(index).padStart(3, "0")}`, index]
  ));
}

function personalEvidenceAtTextLength(length) {
  const value = syntheticPersonalEvidencePackage({ version: "1.2.4" });
  value.personalData.exercisePrescriptions[0].evidence_summary = "s".repeat(length);
  return value;
}

function personalEvidenceAtNameLength(length) {
  const value = syntheticPersonalEvidencePackage({ version: "1.2.4" });
  const exerciseName = "N".repeat(length);
  for (const collection of ["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores"]) {
    value.personalData[collection][0].exercise_name = exerciseName;
  }
  return value;
}

function personalEvidenceAtStableIdLength(length) {
  const exerciseId = `a${"a".repeat(Math.max(0, length - 1))}`;
  const value = syntheticPersonalEvidencePackage({
    exerciseId,
    exerciseName: "Synthetic Stable ID Boundary Exercise",
    prescriptionId: "prescription_stable_id_boundary",
    version: "1.2.5"
  });
  return value;
}

function personalEvidenceAtScalarBoundaries() {
  const value = personalEvidenceAtStableIdLength(PERSONAL_EVIDENCE_BOUNDARIES.stableIdChars);
  for (const collection of ["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores"]) {
    value.personalData[collection][0].exercise_name = "N".repeat(PERSONAL_EVIDENCE_BOUNDARIES.nameChars);
  }
  value.personalData.exercisePrescriptions[0].evidence_summary = "s".repeat(PERSONAL_EVIDENCE_BOUNDARIES.textChars);
  return value;
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

function rowWithCustomIdentity(row, exerciseId, exerciseName) {
  const value = clone(row);
  value.exercise_id = exerciseId;
  value.exercise_name = exerciseName;
  delete value.research_exercise_id;
  value.source_references = (value.source_references || []).map((reference) => ({
    ...reference,
    source_record_id: exerciseId
  }));
  return value;
}

function threeSourcePersonalEvidencePackage(options = {}) {
  const version = options.version || "1.0.6";
  const value = syntheticPersonalEvidencePackage({ version });
  const identities = {
    score: {
      id: options.scoreId || "custom_synthetic_score_source_press",
      name: options.scoreName || "Synthetic Score Source Press"
    },
    prescription: {
      id: options.prescriptionId || "custom_synthetic_prescription_source_press",
      name: options.prescriptionName || "Synthetic Prescription Source Press"
    },
    muscle: {
      id: options.muscleId || "custom_explicit_muscle_source_press",
      name: options.muscleName || "Synthetic Muscle Source Press"
    }
  };
  value.personalData.exerciseScores = [rowWithCustomIdentity(
    value.personalData.exerciseScores[0],
    identities.score.id,
    identities.score.name
  )];
  value.personalData.exercisePrescriptions = [rowWithCustomIdentity(
    value.personalData.exercisePrescriptions[0],
    identities.prescription.id,
    identities.prescription.name
  )];
  value.personalData.exercisePrescriptions[0].prescription_id = `prescription_${identities.prescription.id}`;
  value.personalData.exerciseMuscleScores = [rowWithCustomIdentity(
    value.personalData.exerciseMuscleScores[0],
    identities.muscle.id,
    identities.muscle.name
  )];
  value.personalData.metadata.methodology_version = version;
  value.personalData.metadata.pipeline_version = version;
  return value;
}

function invalidMuscleScoreOnlyPersonalEvidencePackage(options = {}) {
  const value = threeSourcePersonalEvidencePackage({ ...options, version: options.version || "1.0.7" });
  value.personalData.exerciseMuscleScores[0].research_exercise_id = options.invalidResearchExerciseId || "ex_synthetic_unknown_research_press";
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
  PERSONAL_EVIDENCE_BOUNDARIES,
  clone,
  conflictingIdentityPersonalEvidencePackage,
  invalidMuscleScoreOnlyPersonalEvidencePackage,
  jsonDepth,
  jsonObjectAtWidth,
  jsonValueAtDepth,
  maximumObjectWidth,
  partialPersonalEvidencePackage,
  personalEvidenceAtNameLength,
  personalEvidenceAtScalarBoundaries,
  personalEvidenceAtStableIdLength,
  personalEvidenceAtTextLength,
  personalEvidenceWithMatchedCoreCount,
  syntheticPersonalEvidencePackage,
  threeSourcePersonalEvidencePackage
};
