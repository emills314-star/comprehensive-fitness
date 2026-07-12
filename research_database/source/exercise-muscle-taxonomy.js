"use strict";

const TAXONOMY_VERSION = "2.0.0";
const TAXONOMY_REVIEW_DATE = "2026-07-12";

const TYPES = Object.freeze({
  DIRECT: "direct_load",
  FRACTIONAL: "meaningful_fractional_load",
  INCIDENTAL: "minor_incidental_load",
  ISOMETRIC: "isometric_stabilizing_load",
  UNKNOWN: "unknown_insufficient_evidence"
});

const relationship = (muscleGroupId, type, credit, options = {}) => ({
  muscle_group_id: muscleGroupId,
  relationship_type: type,
  loading_role: options.loadingRole || (type === TYPES.ISOMETRIC ? "isometric" : type === TYPES.UNKNOWN ? "unknown" : "dynamic"),
  range_of_motion_role: options.rangeOfMotionRole || (type === TYPES.ISOMETRIC ? "none_isometric" : type === TYPES.UNKNOWN ? "unknown" : "meaningful"),
  fractional_set_credit: credit,
  local_fatigue_weight: options.localFatigueWeight ?? (type === TYPES.DIRECT ? 1 : type === TYPES.FRACTIONAL ? Math.max(0.5, credit) : type === TYPES.ISOMETRIC ? 0.5 : 0),
  evidence_basis: options.evidenceBasis || "anatomy_biomechanics_and_exercise_family_inference",
  evidence_notes: options.evidenceNotes || "Set credit is an interpretable programming model, not a scientifically proven physiological constant.",
  supporting_study_ids: options.supportingStudyIds || "stu_0001|stu_0009|stu_0010|stu_0011",
  confidence_rating: options.confidence || "moderate",
  review_status: options.reviewStatus || "reviewed"
});

const D = (muscle, options) => relationship(muscle, TYPES.DIRECT, 1, options);
const F = (muscle, credit = 0.5, options) => relationship(muscle, TYPES.FRACTIONAL, credit, options);
const I = (muscle, options) => relationship(muscle, TYPES.INCIDENTAL, 0, options);
const S = (muscle, fatigue = 0.5, options = {}) => relationship(muscle, TYPES.ISOMETRIC, 0, { ...options, localFatigueWeight: fatigue });

// Overrides capture exercise-family mechanics that the legacy primary/secondary columns cannot express.
// Entries replace the generated legacy relationships for that exercise.
const REVIEWED_OVERRIDES = Object.freeze({
  ex_deadlift: [
    D("mg_glutes_max", { evidenceBasis: "deadlift_joint_moments_and_anatomy", supportingStudyIds: "stu_0041|stu_0042" }),
    F("mg_quadriceps", 0.5, { evidenceBasis: "knee_extension_joint_moment_in_conventional_deadlift", supportingStudyIds: "stu_0041|stu_0042" }),
    F("mg_hamstrings", 0.25, { evidenceBasis: "biarticular_hip_extension_with_limited_net_length_change", supportingStudyIds: "stu_0041|stu_0042", confidence: "low" }),
    F("mg_adductors", 0.25, { evidenceBasis: "adductor_magnus_hip_extension_contribution", confidence: "low" }),
    S("mg_spinal_erectors", 0.9, { evidenceBasis: "high_isometric_trunk_extension_demand", supportingStudyIds: "stu_0041" }),
    S("mg_traps_upper", 0.6, { evidenceBasis: "isometric_scapular_and_shoulder_girdle_loading", confidence: "low" }),
    S("mg_upper_back", 0.5, { evidenceBasis: "isometric_scapular_and_thoracic_stabilization", confidence: "low" }),
    S("mg_forearms", 0.8, { evidenceBasis: "isometric_grip_demand", confidence: "moderate" })
  ],
  ex_romanian_deadlift: [D("mg_hamstrings"), F("mg_glutes_max", 0.5), S("mg_spinal_erectors", 0.8), S("mg_forearms", 0.7)],
  ex_good_morning: [D("mg_hamstrings"), F("mg_glutes_max", 0.5), S("mg_spinal_erectors", 0.9)],
  ex_back_extension: [D("mg_spinal_erectors"), F("mg_glutes_max", 0.5), F("mg_hamstrings", 0.25)],
  ex_back_squat: [D("mg_quadriceps"), F("mg_glutes_max", 0.5), F("mg_adductors", 0.25), S("mg_spinal_erectors", 0.6)],
  ex_front_squat: [D("mg_quadriceps"), F("mg_glutes_max", 0.5), S("mg_spinal_erectors", 0.6)],
  ex_leg_press: [D("mg_quadriceps"), F("mg_glutes_max", 0.5), F("mg_adductors", 0.25)],
  ex_hack_squat: [D("mg_quadriceps"), F("mg_glutes_max", 0.5), F("mg_adductors", 0.25)],
  ex_bulgarian_split_squat: [D("mg_quadriceps"), F("mg_glutes_max", 0.5), F("mg_adductors", 0.25), S("mg_abductors", 0.45)],
  ex_hip_thrust: [D("mg_glutes_max"), I("mg_hamstrings", { evidenceBasis: "hamstrings_contribute_but_net_length_change_is_limited" })],
  ex_nordic_curl: [D("mg_hamstrings"), I("mg_calves_gastroc")],
  ex_pull_up: [D("mg_lats"), F("mg_biceps", 0.5), F("mg_upper_back", 0.25), S("mg_forearms", 0.5)],
  ex_chin_up: [D("mg_lats"), F("mg_biceps", 0.5), F("mg_upper_back", 0.25), S("mg_forearms", 0.5)],
  ex_lat_pulldown: [D("mg_lats"), F("mg_biceps", 0.5), F("mg_upper_back", 0.25)],
  ex_one_arm_cable_pulldown: [D("mg_lats"), F("mg_biceps", 0.25)],
  ex_chest_supported_row: [D("mg_upper_back"), F("mg_lats", 0.5), F("mg_biceps", 0.5), F("mg_rear_delts", 0.25)],
  ex_seated_cable_row: [D("mg_upper_back"), F("mg_lats", 0.5), F("mg_biceps", 0.5), F("mg_rear_delts", 0.25)],
  ex_dumbbell_row: [D("mg_lats"), F("mg_upper_back", 0.5), F("mg_biceps", 0.5), F("mg_rear_delts", 0.25), S("mg_spinal_erectors", 0.35)],
  ex_barbell_bench_press: [D("mg_chest_sternal"), F("mg_triceps", 0.5), F("mg_front_delts", 0.5)],
  ex_cambered_barbell_bench_press: [D("mg_chest_sternal"), F("mg_triceps", 0.5), F("mg_front_delts", 0.5)],
  ex_dumbbell_bench_press: [D("mg_chest_sternal"), F("mg_triceps", 0.5), F("mg_front_delts", 0.5)],
  ex_incline_dumbbell_press: [D("mg_chest_clavicular"), F("mg_chest_sternal", 0.25), F("mg_triceps", 0.5), F("mg_front_delts", 0.5)],
  ex_machine_chest_press: [D("mg_chest_sternal"), F("mg_triceps", 0.5), F("mg_front_delts", 0.5)],
  ex_incline_machine_press: [D("mg_chest_clavicular"), F("mg_chest_sternal", 0.25), F("mg_triceps", 0.5), F("mg_front_delts", 0.5)],
  ex_close_grip_bench_press: [D("mg_triceps"), F("mg_chest_sternal", 0.5), F("mg_front_delts", 0.25)],
  ex_overhead_press: [D("mg_front_delts"), F("mg_triceps", 0.5), F("mg_side_delts", 0.25), F("mg_traps_upper", 0.25), S("mg_spinal_erectors", 0.35)],
  ex_machine_shoulder_press: [D("mg_front_delts"), F("mg_triceps", 0.5), F("mg_side_delts", 0.25)],
  ex_barbell_shrug: [D("mg_traps_upper"), S("mg_forearms", 0.6)],
  ex_dumbbell_shrug: [D("mg_traps_upper"), S("mg_forearms", 0.6)],
  ex_farmers_carry: [S("mg_forearms", 1), S("mg_traps_upper", 0.8), S("mg_obliques", 0.6), S("mg_spinal_erectors", 0.5)],
  ex_hanging_leg_raise: [D("mg_abdominals"), S("mg_forearms", 0.5)],
  ex_ab_wheel: [D("mg_abdominals", { loadingRole: "mixed" }), S("mg_lats", 0.4)],
  ex_pallof_press: [S("mg_obliques", 0.8), S("mg_abdominals", 0.5)],
  ex_side_plank: [S("mg_obliques", 0.8), S("mg_abductors", 0.5)]
});

function buildExerciseMuscleTaxonomy(exercises) {
  const rows = [];
  const reviewQueue = [];
  exercises.forEach((exercise) => {
    const fallback = [
      D(exercise.primary_muscles, { evidenceBasis: "declared_target_plus_anatomy_and_movement_pattern_review" }),
      ...String(exercise.secondary_muscles || "").split("|").filter(Boolean).map((muscle) => F(muscle, 0.5, { evidenceBasis: "declared_secondary_plus_anatomy_and_movement_pattern_review", confidence: "low" }))
    ];
    const relationships = REVIEWED_OVERRIDES[exercise.exercise_id] || fallback;
    relationships.forEach((entry) => rows.push({
      exercise_muscle_map_id: `emm_${String(rows.length + 1).padStart(4, "0")}`,
      exercise_id: exercise.exercise_id,
      ...entry,
      taxonomy_version: TAXONOMY_VERSION,
      last_reviewed_date: TAXONOMY_REVIEW_DATE
    }));
    const lowConfidence = relationships.filter((entry) => ["low", "very_low"].includes(entry.confidence_rating));
    if (lowConfidence.length) reviewQueue.push({
      taxonomy_review_id: `etr_${String(reviewQueue.length + 1).padStart(4, "0")}`,
      exercise_id: exercise.exercise_id,
      review_reason: `${lowConfidence.length} low-confidence relationship${lowConfidence.length === 1 ? "" : "s"} require future exercise-specific evidence review.`,
      priority: REVIEWED_OVERRIDES[exercise.exercise_id] ? "medium" : "low",
      status: "queued",
      taxonomy_version: TAXONOMY_VERSION,
      last_reviewed_date: TAXONOMY_REVIEW_DATE
    });
  });
  return { rows, reviewQueue };
}

module.exports = { TAXONOMY_VERSION, TAXONOMY_REVIEW_DATE, TYPES, REVIEWED_OVERRIDES, buildExerciseMuscleTaxonomy };
