-- Generated schema for male resistance-training evidence database v2.0.0
-- Pipe-delimited list fields have normalized mapping-table equivalents where relationships are frequently queried.

CREATE TABLE executive_summary (
  summary_id TEXT PRIMARY KEY,
  topic TEXT,
  applicable_male_population TEXT,
  practical_recommendation TEXT,
  evidence_strength TEXT,
  confidence_rating TEXT,
  important_exception_or_limitation TEXT,
  supporting_study_ids TEXT,
  last_reviewed_date DATE
);

CREATE TABLE research_library (
  study_id TEXT PRIMARY KEY,
  full_citation TEXT,
  publication_year INTEGER,
  authors TEXT,
  study_title TEXT,
  journal TEXT,
  doi TEXT,
  permanent_url TEXT,
  study_type TEXT,
  research_topic TEXT,
  male_only_sample BOOLEAN,
  mixed_sex_sample BOOLEAN,
  male_results_reported_separately BOOLEAN,
  male_sample_size INTEGER,
  total_sample_size INTEGER,
  participant_training_status TEXT,
  participant_age_mean REAL,
  participant_age_range TEXT,
  natural_or_enhanced TEXT,
  study_duration_weeks INTEGER,
  intervention TEXT,
  comparator TEXT,
  training_protocol TEXT,
  nutrition_conditions TEXT,
  outcome_measures TEXT,
  main_result TEXT,
  effect_size TEXT,
  statistical_significance TEXT,
  practical_significance TEXT,
  study_limitations TEXT,
  risk_of_bias TEXT,
  male_applicability TEXT,
  evidence_tier TEXT,
  confidence_rating TEXT,
  replication_status TEXT,
  conflicting_evidence TEXT,
  reviewer_notes TEXT,
  date_added DATE,
  last_reviewed_date DATE
);

CREATE TABLE evidence_conclusions (
  conclusion_id TEXT PRIMARY KEY,
  topic TEXT,
  research_question TEXT,
  male_population TEXT,
  training_status TEXT,
  nutrition_context TEXT,
  conclusion TEXT,
  recommended_lower_bound REAL,
  recommended_upper_bound REAL,
  recommended_unit TEXT,
  practical_range_text TEXT,
  supporting_study_ids TEXT,
  conflicting_study_ids TEXT,
  direct_or_indirect_evidence TEXT,
  evidence_strength TEXT,
  confidence_rating TEXT,
  key_limitations TEXT,
  application_rule TEXT,
  exceptions TEXT,
  last_reviewed_date DATE
);

CREATE TABLE muscle_group_recommendations (
  muscle_group_id TEXT PRIMARY KEY,
  muscle_group TEXT,
  muscle_subdivision TEXT,
  anatomical_function TEXT,
  effective_exercises TEXT,
  minimum_effective_weekly_sets INTEGER,
  typical_effective_weekly_sets_low INTEGER,
  typical_effective_weekly_sets_high INTEGER,
  higher_volume_range_low INTEGER,
  higher_volume_range_high INTEGER,
  likely_diminishing_returns_threshold INTEGER,
  recommended_sets_per_session_low INTEGER,
  recommended_sets_per_session_high INTEGER,
  recommended_frequency_low INTEGER,
  recommended_frequency_high INTEGER,
  recommended_rep_range_low INTEGER,
  recommended_rep_range_high INTEGER,
  recommended_rir_low INTEGER,
  recommended_rir_high INTEGER,
  recommended_rest_seconds_low INTEGER,
  recommended_rest_seconds_high INTEGER,
  lengthened_position_considerations TEXT,
  indirect_set_contribution TEXT,
  recovery_considerations TEXT,
  cutting_adjustment TEXT,
  recomp_adjustment TEXT,
  maintenance_adjustment TEXT,
  bulking_adjustment TEXT,
  maintenance_volume_estimate INTEGER,
  training_status TEXT,
  evidence_strength TEXT,
  confidence_rating TEXT,
  supporting_study_ids TEXT,
  notes TEXT
);

CREATE TABLE exercise_database (
  exercise_id TEXT PRIMARY KEY,
  exercise_name TEXT,
  exercise_aliases TEXT,
  movement_pattern TEXT,
  equipment TEXT,
  primary_muscles TEXT,
  secondary_muscles TEXT,
  stabilizing_muscles TEXT,
  muscle_subdivisions_emphasized TEXT,
  stability_demand TEXT,
  skill_requirement TEXT,
  systemic_fatigue_cost TEXT,
  local_fatigue_cost TEXT,
  joint_stress_considerations TEXT,
  recommended_rep_range_low INTEGER,
  recommended_rep_range_high INTEGER,
  acceptable_rep_range_low INTEGER,
  acceptable_rep_range_high INTEGER,
  recommended_sets_per_session_low INTEGER,
  recommended_sets_per_session_high INTEGER,
  weekly_set_contribution TEXT,
  recommended_rir_low INTEGER,
  recommended_rir_high INTEGER,
  recommended_rest_seconds_low INTEGER,
  recommended_rest_seconds_high INTEGER,
  preferred_progression_model TEXT,
  load_increase_criteria TEXT,
  rep_increase_criteria TEXT,
  set_increase_criteria TEXT,
  regression_criteria TEXT,
  deload_criteria TEXT,
  technique_quality_criteria TEXT,
  range_of_motion_criteria TEXT,
  primary_progression_metric TEXT,
  secondary_progression_metrics TEXT,
  normal_performance_variability TEXT,
  stall_definition TEXT,
  substitution_triggers TEXT,
  suggested_substitutions TEXT,
  top_set_backoff_suitability TEXT,
  recommended_load_increment TEXT,
  recommended_evaluation_window_sessions INTEGER,
  cutting_adjustment TEXT,
  bulking_adjustment TEXT,
  direct_exercise_evidence BOOLEAN,
  evidence_quality TEXT,
  confidence_rating TEXT,
  supporting_study_ids TEXT,
  notes TEXT
);

CREATE TABLE progression_rules (
  rule_id TEXT PRIMARY KEY,
  rule_name TEXT,
  rule_category TEXT,
  applicable_exercise_types TEXT,
  applicable_exercise_ids TEXT,
  applicable_muscle_groups TEXT,
  applicable_training_levels TEXT,
  applicable_nutrition_phases TEXT,
  required_inputs TEXT,
  condition_logic TEXT,
  threshold_value_1 REAL,
  threshold_unit_1 TEXT,
  threshold_value_2 REAL,
  threshold_unit_2 TEXT,
  minimum_sessions_required INTEGER,
  recommended_action TEXT,
  load_adjustment_percent REAL,
  rep_adjustment INTEGER,
  set_adjustment INTEGER,
  rir_adjustment REAL,
  rest_adjustment_seconds INTEGER,
  exceptions TEXT,
  supporting_study_ids TEXT,
  direct_or_inferred_rule TEXT,
  evidence_strength TEXT,
  confidence_rating TEXT,
  notes TEXT
);

CREATE TABLE nutrition_strategies (
  strategy_id TEXT PRIMARY KEY,
  strategy_category TEXT,
  male_population TEXT,
  training_status TEXT,
  starting_body_fat_context TEXT,
  nutrition_phase TEXT,
  calorie_adjustment_type TEXT,
  recommended_calorie_adjustment_low REAL,
  recommended_calorie_adjustment_high REAL,
  calorie_adjustment_unit TEXT,
  target_weight_change_rate_low REAL,
  target_weight_change_rate_high REAL,
  weight_change_rate_unit TEXT,
  protein_g_per_kg_low REAL,
  protein_g_per_kg_high REAL,
  fat_g_per_kg_low REAL,
  fat_g_per_kg_high REAL,
  carbohydrate_guidance TEXT,
  training_volume_adjustment TEXT,
  training_intensity_adjustment TEXT,
  cardio_guidance TEXT,
  recovery_guidance TEXT,
  expected_outcome TEXT,
  monitoring_metrics TEXT,
  adjustment_triggers TEXT,
  recommended_duration TEXT,
  contraindications_or_exceptions TEXT,
  evidence_strength TEXT,
  confidence_rating TEXT,
  supporting_study_ids TEXT,
  notes TEXT
);

CREATE TABLE evidence_gaps (
  evidence_gap_id TEXT PRIMARY KEY,
  topic TEXT,
  research_question TEXT,
  male_population TEXT,
  current_best_interpretation TEXT,
  reason_for_uncertainty TEXT,
  conflicting_positions TEXT,
  supporting_study_ids TEXT,
  conflicting_study_ids TEXT,
  practical_default TEXT,
  risk_of_wrong_application TEXT,
  research_priority TEXT,
  last_reviewed_date DATE
);

CREATE TABLE definitions_data_dictionary (
  field_name TEXT,
  display_name TEXT,
  definition TEXT,
  data_type TEXT,
  allowed_values TEXT,
  unit TEXT,
  nullable BOOLEAN,
  example_value TEXT,
  validation_rule TEXT,
  used_in_tabs TEXT
);

CREATE TABLE change_log (
  change_id TEXT PRIMARY KEY,
  change_date DATE,
  database_version TEXT,
  affected_tab TEXT,
  affected_record_ids TEXT,
  change_type TEXT,
  previous_value TEXT,
  new_value TEXT,
  reason_for_change TEXT,
  supporting_study_ids TEXT,
  reviewer_notes TEXT
);

CREATE TABLE exercise_muscle_map (
  exercise_muscle_map_id TEXT PRIMARY KEY,
  exercise_id TEXT,
  muscle_group_id TEXT,
  relationship_type TEXT,
  loading_role TEXT,
  range_of_motion_role TEXT,
  fractional_set_credit REAL,
  local_fatigue_weight REAL,
  evidence_basis TEXT,
  evidence_notes TEXT,
  supporting_study_ids TEXT,
  confidence_rating TEXT,
  review_status TEXT,
  taxonomy_version TEXT,
  last_reviewed_date DATE
);

CREATE TABLE exercise_taxonomy_review_queue (
  taxonomy_review_id TEXT PRIMARY KEY,
  exercise_id TEXT,
  review_reason TEXT,
  priority TEXT,
  status TEXT,
  taxonomy_version TEXT,
  last_reviewed_date DATE
);

CREATE TABLE exercise_substitution_map (
  exercise_substitution_map_id TEXT PRIMARY KEY,
  exercise_id TEXT,
  substitute_exercise_id TEXT,
  substitution_similarity TEXT,
  reason TEXT,
  confidence_rating TEXT
);

CREATE TABLE study_conclusion_map (
  study_conclusion_map_id TEXT PRIMARY KEY,
  study_id TEXT,
  conclusion_id TEXT,
  relationship_type TEXT
);

CREATE TABLE study_exercise_map (
  study_exercise_map_id TEXT PRIMARY KEY,
  study_id TEXT,
  exercise_id TEXT,
  relationship_type TEXT
);

CREATE TABLE study_muscle_group_map (
  study_muscle_group_map_id TEXT PRIMARY KEY,
  study_id TEXT,
  muscle_group_id TEXT,
  relationship_type TEXT
);

CREATE TABLE rule_exercise_map (
  rule_exercise_map_id TEXT PRIMARY KEY,
  rule_id TEXT,
  exercise_id TEXT
);

CREATE TABLE rule_muscle_group_map (
  rule_muscle_group_map_id TEXT PRIMARY KEY,
  rule_id TEXT,
  muscle_group_id TEXT
);

CREATE TABLE exercise_progression_metric_map (
  exercise_progression_metric_map_id TEXT PRIMARY KEY,
  exercise_id TEXT,
  metric TEXT,
  priority_rank INTEGER,
  use_case TEXT,
  confidence_rating TEXT
);

-- Add these foreign keys in engines that support ALTER TABLE ADD CONSTRAINT:
-- ALTER TABLE exercise_muscle_map ADD FOREIGN KEY (exercise_id) REFERENCES exercise_database(exercise_id);
-- ALTER TABLE exercise_muscle_map ADD FOREIGN KEY (muscle_group_id) REFERENCES muscle_group_recommendations(muscle_group_id);
-- ALTER TABLE exercise_taxonomy_review_queue ADD FOREIGN KEY (exercise_id) REFERENCES exercise_database(exercise_id);
-- ALTER TABLE exercise_substitution_map ADD FOREIGN KEY (exercise_id) REFERENCES exercise_database(exercise_id);
-- ALTER TABLE exercise_substitution_map ADD FOREIGN KEY (substitute_exercise_id) REFERENCES exercise_database(exercise_id);
-- ALTER TABLE study_conclusion_map ADD FOREIGN KEY (study_id) REFERENCES research_library(study_id);
-- ALTER TABLE study_conclusion_map ADD FOREIGN KEY (conclusion_id) REFERENCES evidence_conclusions(conclusion_id);
-- ALTER TABLE study_exercise_map ADD FOREIGN KEY (study_id) REFERENCES research_library(study_id);
-- ALTER TABLE study_exercise_map ADD FOREIGN KEY (exercise_id) REFERENCES exercise_database(exercise_id);
-- ALTER TABLE study_muscle_group_map ADD FOREIGN KEY (study_id) REFERENCES research_library(study_id);
-- ALTER TABLE study_muscle_group_map ADD FOREIGN KEY (muscle_group_id) REFERENCES muscle_group_recommendations(muscle_group_id);
-- ALTER TABLE rule_exercise_map ADD FOREIGN KEY (rule_id) REFERENCES progression_rules(rule_id);
-- ALTER TABLE rule_exercise_map ADD FOREIGN KEY (exercise_id) REFERENCES exercise_database(exercise_id);
-- ALTER TABLE rule_muscle_group_map ADD FOREIGN KEY (rule_id) REFERENCES progression_rules(rule_id);
-- ALTER TABLE rule_muscle_group_map ADD FOREIGN KEY (muscle_group_id) REFERENCES muscle_group_recommendations(muscle_group_id);
-- ALTER TABLE exercise_progression_metric_map ADD FOREIGN KEY (exercise_id) REFERENCES exercise_database(exercise_id);
