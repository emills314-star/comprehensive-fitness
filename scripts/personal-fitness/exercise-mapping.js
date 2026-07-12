"use strict";

const { slugify } = require("./utils");
const { coalesceMuscleMappingsByProgrammingFamily } = require("./config");

function compileMappingRules(document) {
  return (document?.rules || []).map((rule) => ({ ...rule, regex: new RegExp(rule.pattern, "i") }));
}

function inferExerciseMapping(recordedName, compiledRules) {
  const rule = compiledRules.find((candidate) => candidate.regex.test(recordedName));
  if (!rule) {
    return {
      alias: {
        recorded_name: recordedName,
        exercise_id: slugify(recordedName),
        canonical_name: recordedName,
        variation: "recorded_distinct_variation",
        primary_muscle_group: "unmapped",
        resistance_type: "external",
        exercise_kind: "unknown",
        progression_metric: "rpe_adjusted_e1rm",
        research_exercise_id: null,
        comparison_group: slugify(recordedName),
        equipment_identity_status: "unconfirmed",
        notes: "No explicit alias or fallback mapping rule matched."
      },
      muscles: []
    };
  }
  const exerciseId = slugify(recordedName);
  const alias = {
    recorded_name: recordedName,
    exercise_id: exerciseId,
    canonical_name: recordedName,
    variation: "recorded_distinct_variation",
    primary_muscle_group: rule.primary,
    resistance_type: rule.resistance_type,
    exercise_kind: rule.exercise_kind,
    progression_metric: rule.progression_metric,
    research_exercise_id: rule.research_exercise_id || null,
    comparison_group: rule.comparison_group || exerciseId,
    equipment_identity_status: "unconfirmed_recorded_name_only",
    notes: rule.notes || `Fallback mapping rule: ${rule.rule_id}. Variations remain distinct.`
  };
  const muscles = [
    {
      exercise_id: exerciseId,
      muscle_group: rule.primary,
      role: "primary",
      contribution_weight: 1,
      regional_function: "inferred_from_recorded_name",
      research_muscle_group_id: null,
      substitution_notes: "Rule-derived classification; review if the recorded name hides a different execution."
    },
    ...(rule.secondary || []).map((secondary) => ({
      exercise_id: exerciseId,
      muscle_group: secondary.muscle_group,
      role: "secondary",
      contribution_weight: secondary.weight,
      regional_function: "inferred_from_recorded_name",
      research_muscle_group_id: null,
      substitution_notes: "Secondary role is rule-derived and does not make this a direct substitute."
    }))
  ];
  return { alias, muscles };
}

function buildCompleteExerciseCatalog(recordedNames, explicitAliases, explicitMuscleMap, mappingRuleDocument) {
  const compiledRules = compileMappingRules(mappingRuleDocument);
  const explicitByName = new Map(explicitAliases.map((alias) => [alias.recorded_name, alias]));
  const aliases = [];
  const muscles = [];
  const mappingAudit = [];
  for (const recordedName of [...new Set(recordedNames)].sort()) {
    const explicit = explicitByName.get(recordedName);
    if (explicit) {
      aliases.push({ ...explicit, mapping_source: "explicit_config" });
      const explicitMuscles = explicitMuscleMap.filter((mapping) => mapping.exercise_id === explicit.exercise_id);
      muscles.push(...explicitMuscles.map((mapping) => ({ ...mapping, mapping_source: "explicit_config" })));
      mappingAudit.push({ recorded_name: recordedName, exercise_id: explicit.exercise_id, mapping_source: "explicit_config", primary_muscle_group: explicit.primary_muscle_group, mapped_muscle_count: explicitMuscles.length, review_required: explicitMuscles.length === 0 });
      continue;
    }
    const inferred = inferExerciseMapping(recordedName, compiledRules);
    aliases.push({ ...inferred.alias, mapping_source: "fallback_rule" });
    muscles.push(...inferred.muscles.map((mapping) => ({ ...mapping, mapping_source: "fallback_rule" })));
    mappingAudit.push({ recorded_name: recordedName, exercise_id: inferred.alias.exercise_id, mapping_source: "fallback_rule", primary_muscle_group: inferred.alias.primary_muscle_group, mapped_muscle_count: inferred.muscles.length, review_required: inferred.alias.primary_muscle_group === "unmapped" || inferred.muscles.length === 0 });
  }
  const coalescedMuscles = coalesceMuscleMappingsByProgrammingFamily(muscles);
  const mappedCounts = new Map();
  coalescedMuscles.forEach((mapping) => mappedCounts.set(mapping.exercise_id, (mappedCounts.get(mapping.exercise_id) || 0) + 1));
  mappingAudit.forEach((item) => {
    item.mapped_muscle_count = mappedCounts.get(item.exercise_id) || 0;
    item.review_required = item.primary_muscle_group === "unmapped" || item.mapped_muscle_count === 0;
  });
  return { aliases, muscles: coalescedMuscles, mappingAudit };
}

module.exports = { buildCompleteExerciseCatalog, compileMappingRules, inferExerciseMapping };
