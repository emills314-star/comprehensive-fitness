"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { readCsvRows, toNumber } = require("./utils");
const { data: researchDatabase, VERSION: researchDatabaseVersion } = require("../../research_database/source/database");
const {
  CANONICAL_TO_PROGRAMMING_FAMILY,
  programmingFamilyForMuscle
} = require("../../research_database/source/exercise-muscle-taxonomy");

const CANONICAL_IDS_BY_FAMILY = Object.freeze(Object.entries(CANONICAL_TO_PROGRAMMING_FAMILY).reduce((families, [canonicalId, familyId]) => {
  if (!families[familyId]) families[familyId] = [];
  families[familyId].push(canonicalId);
  return families;
}, {}));

function normalizedCustomFamily(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || null;
}

function relationshipPriority(value) {
  const role = String(value || "").trim().toLowerCase();
  if (["direct_load", "direct", "primary"].includes(role)) return 3;
  if (["meaningful_fractional_load", "fractional", "secondary"].includes(role)) return 2;
  if (["stabilization_only", "stabilizer", "isometric"].includes(role)) return 1;
  return 0;
}

function normalizeLegacyMuscleMapping(mapping) {
  const labelFamily = programmingFamilyForMuscle(mapping.programming_family_id || mapping.muscle_group);
  const canonicalFamily = programmingFamilyForMuscle(mapping.research_muscle_group_id);
  const programmingFamilyId = labelFamily || canonicalFamily || normalizedCustomFamily(mapping.muscle_group) || "unmapped";
  const familyCanonicalIds = CANONICAL_IDS_BY_FAMILY[programmingFamilyId] || [];
  const suppliedCanonicalId = Object.prototype.hasOwnProperty.call(CANONICAL_TO_PROGRAMMING_FAMILY, mapping.research_muscle_group_id)
    ? mapping.research_muscle_group_id
    : null;
  const canonicalId = suppliedCanonicalId && canonicalFamily === programmingFamilyId
    ? suppliedCanonicalId
    : familyCanonicalIds.length === 1 ? familyCanonicalIds[0] : null;
  return {
    ...mapping,
    muscle_group: programmingFamilyId,
    programming_family_id: programmingFamilyId,
    research_muscle_group_id: canonicalId,
    contribution_weight: Number(mapping.contribution_weight || 0),
    local_fatigue_weight: Number(mapping.local_fatigue_weight || 0)
  };
}

function coalesceMuscleMappingsByProgrammingFamily(mappings) {
  const families = new Map();
  mappings.map(normalizeLegacyMuscleMapping).forEach((mapping) => {
    const key = `${mapping.exercise_id || ""}|${mapping.programming_family_id}`;
    const current = families.get(key);
    const candidateRank = relationshipPriority(mapping.role);
    const currentRank = current ? relationshipPriority(current.selected.role) : -1;
    const candidateContribution = Number(mapping.contribution_weight || 0);
    const currentContribution = current ? Number(current.selected.contribution_weight || 0) : -1;
    const candidateDirect = candidateRank === 3;
    const currentDirect = currentRank === 3;
    const shouldSelect = !current
      || (candidateDirect && !currentDirect)
      || (candidateDirect === currentDirect && candidateContribution > currentContribution)
      || (candidateDirect === currentDirect && candidateContribution === currentContribution && candidateRank > currentRank);
    const state = current || { selected: mapping, localFatigueWeight: 0, canonicalIds: new Set(), sourceCount: 0 };
    if (shouldSelect) state.selected = mapping;
    state.localFatigueWeight += Number(mapping.local_fatigue_weight || 0);
    if (mapping.research_muscle_group_id) state.canonicalIds.add(mapping.research_muscle_group_id);
    state.sourceCount += 1;
    families.set(key, state);
  });
  return Array.from(families.values(), (state) => ({
    ...state.selected,
    local_fatigue_weight: Number(state.localFatigueWeight.toFixed(6)),
    source_muscle_group_ids: Array.from(state.canonicalIds).sort().join("|") || null,
    source_relationship_count: state.sourceCount
  }));
}

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
  const taxonomyByExercise = new Map();
  researchDatabase.exercise_muscle_map.forEach((mapping) => {
    if (!taxonomyByExercise.has(mapping.exercise_id)) taxonomyByExercise.set(mapping.exercise_id, []);
    taxonomyByExercise.get(mapping.exercise_id).push(mapping);
  });
  const mappedPersonalIds = new Set();
  const muscleMap = [];
  aliases.forEach((alias) => {
    const taxonomy = coalesceMuscleMappingsByProgrammingFamily((taxonomyByExercise.get(alias.research_exercise_id) || []).map((mapping) => ({
      ...mapping,
      exercise_id: alias.exercise_id,
      role: mapping.relationship_type,
      contribution_weight: Number(mapping.fractional_set_credit || 0),
      research_muscle_group_id: mapping.muscle_group_id
    })));
    if (!taxonomy.length) return;
    mappedPersonalIds.add(alias.exercise_id);
    taxonomy.forEach((mapping) => muscleMap.push({
      exercise_muscle_map_id: `${alias.exercise_id}_${mapping.exercise_muscle_map_id}`,
      exercise_id: alias.exercise_id,
      muscle_group: mapping.programming_family_id,
      programming_family_id: mapping.programming_family_id,
      role: mapping.role,
      contribution_weight: Number(mapping.contribution_weight || 0),
      local_fatigue_weight: Number(mapping.local_fatigue_weight || 0),
      loading_role: mapping.loading_role,
      research_muscle_group_id: mapping.research_muscle_group_id,
      source_muscle_group_ids: mapping.source_muscle_group_ids,
      source_relationship_count: mapping.source_relationship_count,
      taxonomy_version: mapping.taxonomy_version || researchDatabaseVersion,
      regional_function: mapping.evidence_notes,
      substitution_notes: null
    }));
  });
  coalesceMuscleMappingsByProgrammingFamily(legacyMuscleMap.filter((mapping) => !mappedPersonalIds.has(mapping.exercise_id))).forEach((mapping) => muscleMap.push({ ...mapping, taxonomy_version: "custom_unmapped" }));
  const musclesByExercise = new Map();
  muscleMap.forEach((mapping) => {
    if (!musclesByExercise.has(mapping.exercise_id)) musclesByExercise.set(mapping.exercise_id, []);
    musclesByExercise.get(mapping.exercise_id).push(mapping);
  });
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
    musclesByExercise
  };
}

module.exports = {
  coalesceMuscleMappingsByProgrammingFamily,
  loadPersonalFitnessConfig,
  normalizeLegacyMuscleMapping
};
