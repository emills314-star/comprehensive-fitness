"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { readCsvRows, toNumber } = require("./utils");
const { data: researchDatabase, VERSION: researchDatabaseVersion } = require("../../research_database/source/database");

async function loadPersonalFitnessConfig(repositoryRoot) {
  const dataRoot = path.join(repositoryRoot, "personal_fitness_data");
  const configRoot = path.join(dataRoot, "config");
  const analysisConfig = JSON.parse(await fs.readFile(path.join(configRoot, "analysis.config.json"), "utf8"));
  const personalContext = JSON.parse(await fs.readFile(path.join(configRoot, "personal_context.json"), "utf8"));
  const mappingRules = JSON.parse(await fs.readFile(path.join(configRoot, "exercise_mapping_rules.json"), "utf8"));
  const aliasesResult = await readCsvRows(path.join(configRoot, "exercise_aliases.csv"));
  const musclesResult = await readCsvRows(path.join(configRoot, "exercise_muscle_map.csv"));
  const aliases = aliasesResult.rows.map((row) => ({
    ...row,
    research_exercise_id: row.research_exercise_id || null
  }));
  const legacyMuscleMap = musclesResult.rows.map((row) => ({
    ...row,
    contribution_weight: toNumber(row.contribution_weight),
    research_muscle_group_id: row.research_muscle_group_id || null,
    substitution_notes: row.substitution_notes || null
  }));
  const recommendationById = new Map(researchDatabase.muscle_group_recommendations.map((row) => [row.muscle_group_id, row]));
  const taxonomyByExercise = new Map();
  researchDatabase.exercise_muscle_map.forEach((mapping) => {
    if (!taxonomyByExercise.has(mapping.exercise_id)) taxonomyByExercise.set(mapping.exercise_id, []);
    taxonomyByExercise.get(mapping.exercise_id).push(mapping);
  });
  const mappedPersonalIds = new Set();
  const muscleMap = [];
  aliases.forEach((alias) => {
    const taxonomy = taxonomyByExercise.get(alias.research_exercise_id) || [];
    if (!taxonomy.length) return;
    mappedPersonalIds.add(alias.exercise_id);
    taxonomy.forEach((mapping) => muscleMap.push({
      exercise_muscle_map_id: `${alias.exercise_id}_${mapping.exercise_muscle_map_id}`,
      exercise_id: alias.exercise_id,
      muscle_group: recommendationById.get(mapping.muscle_group_id)?.muscle_group || mapping.muscle_group_id,
      role: mapping.relationship_type,
      contribution_weight: Number(mapping.fractional_set_credit || 0),
      local_fatigue_weight: Number(mapping.local_fatigue_weight || 0),
      loading_role: mapping.loading_role,
      research_muscle_group_id: mapping.muscle_group_id,
      taxonomy_version: mapping.taxonomy_version || researchDatabaseVersion,
      regional_function: mapping.evidence_notes,
      substitution_notes: null
    }));
  });
  legacyMuscleMap.filter((mapping) => !mappedPersonalIds.has(mapping.exercise_id)).forEach((mapping) => muscleMap.push({ ...mapping, taxonomy_version: "custom_unmapped" }));
  return {
    repositoryRoot,
    dataRoot,
    rawRoot: path.join(dataRoot, "raw"),
    normalizedRoot: path.join(dataRoot, "normalized"),
    derivedRoot: path.join(dataRoot, "derived"),
    reportsRoot: path.join(dataRoot, "reports"),
    schemasRoot: path.join(dataRoot, "schemas"),
    configRoot,
    analysisConfig,
    personalContext,
    mappingRules,
    aliases,
    aliasMap: new Map(aliases.map((alias) => [alias.recorded_name, alias])),
    muscleMap,
    taxonomyVersion: researchDatabaseVersion,
    musclesByExercise: new Map(aliases.map((alias) => [alias.exercise_id, muscleMap.filter((mapping) => mapping.exercise_id === alias.exercise_id)]))
  };
}

module.exports = { loadPersonalFitnessConfig };
