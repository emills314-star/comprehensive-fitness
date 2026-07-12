"use strict";

const assert = require("node:assert/strict");
const {
  coalesceMuscleMappingsByProgrammingFamily,
  normalizeLegacyMuscleMapping
} = require("./personal-fitness/config");

const correctedTrap = normalizeLegacyMuscleMapping({
  exercise_id: "legacy_shrug",
  muscle_group: "traps",
  research_muscle_group_id: "mg_upper_back",
  role: "primary",
  contribution_weight: 1
});
assert.equal(correctedTrap.programming_family_id, "traps");
assert.equal(correctedTrap.research_muscle_group_id, "mg_traps_upper", "An old traps-to-upper-back crosswalk must resolve to the canonical upper-traps ID");

const ambiguousCalf = normalizeLegacyMuscleMapping({
  exercise_id: "legacy_calf",
  muscle_group: "calves",
  role: "primary",
  contribution_weight: 1
});
assert.equal(ambiguousCalf.programming_family_id, "calves");
assert.equal(ambiguousCalf.research_muscle_group_id, null, "A broad legacy calf label must not fabricate one anatomical subdivision");

const coalesced = coalesceMuscleMappingsByProgrammingFamily([
  {
    exercise_muscle_map_id: "fractional",
    exercise_id: "incline_press",
    muscle_group: "chest",
    research_muscle_group_id: "mg_chest_sternal",
    role: "meaningful_fractional_load",
    contribution_weight: 0.25,
    local_fatigue_weight: 0.25
  },
  {
    exercise_muscle_map_id: "direct",
    exercise_id: "incline_press",
    muscle_group: "chest",
    research_muscle_group_id: "mg_chest_clavicular",
    role: "direct_load",
    contribution_weight: 1,
    local_fatigue_weight: 1
  },
  {
    exercise_muscle_map_id: "triceps",
    exercise_id: "incline_press",
    muscle_group: "triceps",
    research_muscle_group_id: "mg_triceps",
    role: "meaningful_fractional_load",
    contribution_weight: 0.5,
    local_fatigue_weight: 0.5
  }
]);
assert.equal(coalesced.length, 2, "The adapter must emit at most one row per exercise/programming family");
const chest = coalesced.find((row) => row.programming_family_id === "chest");
assert.equal(chest.exercise_muscle_map_id, "direct", "Direct loading must win over subdivision-level fractional loading");
assert.equal(chest.contribution_weight, 1);
assert.equal(chest.local_fatigue_weight, 1.25, "Local fatigue must remain additive after hypertrophy-credit coalescing");
assert.equal(chest.source_relationship_count, 2);
assert.equal(chest.source_muscle_group_ids, "mg_chest_clavicular|mg_chest_sternal");

const highestFraction = coalesceMuscleMappingsByProgrammingFamily([
  { exercise_id: "row", muscle_group: "upper_back", role: "secondary", contribution_weight: 0.25, local_fatigue_weight: 0.25 },
  { exercise_id: "row", muscle_group: "upper_back", role: "secondary", contribution_weight: 0.5, local_fatigue_weight: 0.5 }
]);
assert.equal(highestFraction.length, 1);
assert.equal(highestFraction[0].contribution_weight, 0.5, "The highest non-direct contribution must win");
assert.equal(highestFraction[0].local_fatigue_weight, 0.75);

console.log(JSON.stringify({ passed: true, synthetic_rows: 8, coalesced_families: coalesced.length }, null, 2));
