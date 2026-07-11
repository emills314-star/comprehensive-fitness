"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { readCsvRows, toNumber } = require("./utils");

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
  const muscleMap = musclesResult.rows.map((row) => ({
    ...row,
    contribution_weight: toNumber(row.contribution_weight),
    research_muscle_group_id: row.research_muscle_group_id || null,
    substitution_notes: row.substitution_notes || null
  }));
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
    musclesByExercise: new Map(aliases.map((alias) => [alias.exercise_id, muscleMap.filter((mapping) => mapping.exercise_id === alias.exercise_id)]))
  };
}

module.exports = { loadPersonalFitnessConfig };
