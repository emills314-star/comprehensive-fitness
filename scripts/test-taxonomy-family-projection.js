"use strict";

const assert = require("node:assert/strict");
const taxonomy = require("../research_database/source/exercise-muscle-taxonomy");
const database = require("../research_database/source/database");
const guided = require("../guided-mesocycle");

const canonicalIds = Object.keys(taxonomy.CANONICAL_TO_PROGRAMMING_FAMILY).sort();
const databaseIds = database.data.muscle_group_recommendations.map((row) => row.muscle_group_id).sort();
assert.equal(canonicalIds.length, 23, "The persistent canonical taxonomy must retain all 23 IDs");
assert.deepEqual(databaseIds, canonicalIds, "Every database muscle must have exactly one canonical projection");
assert.equal(new Set(Object.values(taxonomy.CANONICAL_TO_PROGRAMMING_FAMILY)).size, 20, "The 23 anatomical IDs should project to 20 programming families");

canonicalIds.forEach((canonicalId) => {
  const family = taxonomy.programmingFamilyForMuscle(canonicalId);
  assert.ok(family, `${canonicalId} must project to a programming family`);
  assert.equal(guided.programmingFamilyId(canonicalId), family, `${canonicalId} must project identically in the guided builder`);
});
[
  ["mg_traps_upper", "traps"], ["traps_upper", "traps"], ["traps", "traps"],
  ["mg_calves_gastroc", "calves"], ["calves_soleus", "calves"], ["calves", "calves"],
  ["mg_chest_clavicular", "chest"], ["quadriceps", "quads"], ["abdominals", "abs"]
].forEach(([value, expected]) => {
  assert.equal(taxonomy.programmingFamilyForMuscle(value), expected, `${value} must normalize to ${expected}`);
  assert.equal(guided.programmingFamilyId(value), expected, `${value} must normalize to ${expected} in the guided builder`);
});

const exercises = new Map(database.data.exercise_database.map((row) => [row.exercise_id, row]));
database.data.muscle_group_recommendations.forEach((row) => String(row.effective_exercises || "").split(database.DELIMITER).filter(Boolean).forEach((exerciseId) => {
  assert.ok(exercises.has(exerciseId), `${row.muscle_group_id} references missing effective exercise ${exerciseId}`);
}));
const woodchop = exercises.get("ex_cable_woodchop");
assert.ok(woodchop, "Cable woodchop must exist as the dynamic oblique candidate");
assert.equal(woodchop.movement_pattern, "trunk_rotation");
const woodchopRelationship = database.data.exercise_muscle_map.find((row) => row.exercise_id === "ex_cable_woodchop" && row.muscle_group_id === "mg_obliques");
assert.equal(woodchopRelationship?.relationship_type, "direct_load");
assert.equal(woodchopRelationship?.programming_family_id, "obliques");

const draft = guided.createDraft({
  trainingDays: 2,
  includedMuscleGroupIds: ["mg_calves_gastroc", "mg_calves_soleus"],
  musclePriorities: { mg_calves_gastroc: "normal", mg_calves_soleus: "specialization" }
});
draft.guidedDays[0].assignments.push(
  { id: "a1", exerciseId: "synthetic-calf-combined", name: "Synthetic calf combined", workingSets: 4 },
  { id: "a2", exerciseId: "synthetic-chest", name: "Synthetic chest", workingSets: 3 },
  { id: "a3", exerciseId: "synthetic-traps", name: "Synthetic traps", workingSets: 2 }
);
draft.guidedDays[1].assignments.push(
  { id: "a4", exerciseId: "synthetic-soleus", name: "Synthetic soleus", workingSets: 3 },
  { id: "a5", exerciseId: "synthetic-core", name: "Synthetic core", workingSets: 3 }
);
const relationships = {
  "synthetic-calf-combined": [
    { muscle_group_id: "mg_calves_gastroc", relationship_type: "direct_load", fractional_set_credit: 1, local_fatigue_weight: 1 },
    { muscle_group_id: "mg_calves_soleus", relationship_type: "meaningful_fractional_load", fractional_set_credit: 0.5, local_fatigue_weight: 0.5 }
  ],
  "synthetic-soleus": [{ muscle_group_id: "mg_calves_soleus", relationship_type: "direct_load", fractional_set_credit: 1, local_fatigue_weight: 1 }],
  "synthetic-chest": [
    { muscle_group_id: "mg_chest_sternal", relationship_type: "direct_load", fractional_set_credit: 1, local_fatigue_weight: 1 },
    { muscle_group_id: "mg_chest_clavicular", relationship_type: "meaningful_fractional_load", fractional_set_credit: 0.25, local_fatigue_weight: 0.25 }
  ],
  "synthetic-traps": [{ muscle_group_id: "mg_traps_upper", relationship_type: "direct_load", fractional_set_credit: 1, local_fatigue_weight: 1 }],
  "synthetic-core": [
    { muscle_group_id: "mg_abdominals", relationship_type: "direct_load", fractional_set_credit: 1, local_fatigue_weight: 1 },
    { muscle_group_id: "mg_abdominals", relationship_type: "isometric_stabilizing_load", fractional_set_credit: 0, local_fatigue_weight: 0.4 }
  ]
};
const ledger = guided.volumeLedger(draft, (assignment) => relationships[assignment.exerciseId]);
assert.equal(ledger.ledgerVersion, "volume-ledger/1.1.0");
assert.equal(ledger.programmingFamilyVersion, "programming-family/1.0.0");

const calves = ledger.muscleTotals.find((row) => row.muscleGroupId === "calves");
assert.deepEqual({ direct: calves.directSets, fractional: calves.fractionalSets, weighted: calves.weightedSets, fatigue: calves.localFatigueExposure }, { direct: 7, fractional: 0, weighted: 7, fatigue: 9 }, "Direct work must win within a family while local fatigue remains additive");
assert.equal(calves.exposureDayIds.length, 2, "Calf subdivisions must satisfy one family-level frequency target");
const chest = ledger.muscleTotals.find((row) => row.muscleGroupId === "chest");
assert.deepEqual({ direct: chest.directSets, fractional: chest.fractionalSets, weighted: chest.weightedSets }, { direct: 3, fractional: 0, weighted: 3 }, "Chest subdivisions must not double count one exercise");
assert.equal(ledger.muscleTotals.find((row) => row.muscleGroupId === "traps")?.weightedSets, 2, "Canonical upper traps must satisfy the traps programming family");
const core = ledger.muscleTotals.find((row) => row.muscleGroupId === "abs");
assert.deepEqual({ weighted: core.weightedSets, isometric: core.isometricExposure, fatigue: core.localFatigueExposure }, { weighted: 3, isometric: 3, fatigue: 4.2 }, "Isometric fatigue must remain separate from hypertrophy credit");

const statuses = guided.muscleTargetStatuses(draft, ledger, () => ({ min: 6, target: 8, max: 10 }));
assert.equal(statuses.length, 1, "Two calf subdivisions must yield one family status");
assert.equal(statuses[0].muscleGroupId, "calves");
assert.deepEqual(statuses[0].sourceMuscleGroupIds, ["mg_calves_gastroc", "mg_calves_soleus"]);
assert.equal(statuses[0].priority, "specialization");
assert.equal(statuses[0].frequencyStatus, "satisfied");
assert.equal(statuses[0].overallStatus, "within");

console.log(JSON.stringify({
  passed: true,
  canonical_muscle_ids: canonicalIds.length,
  programming_families: new Set(Object.values(taxonomy.CANONICAL_TO_PROGRAMMING_FAMILY)).size,
  exercise_count: exercises.size,
  relationship_count: database.data.exercise_muscle_map.length
}, null, 2));
