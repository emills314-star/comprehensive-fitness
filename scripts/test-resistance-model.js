const assert = require("node:assert/strict");
const fs = require("node:fs");
const { readApplicationContractSource } = require("./read-application-contract-source");

const html = readApplicationContractSource();
const match = html.match(/\/\/ RESISTANCE_MODEL_START([\s\S]*?)\/\/ RESISTANCE_MODEL_END/);
assert.ok(match, "Resistance model markers were not found in index.html");

const factory = new Function("exerciseKey", "data", match[1] + "; return { inferResistanceType, formatResistance, formatSetPerformance, normalizeResistanceSet, convertWeightValue, resistanceLoadInUnit, setAppWeightUnitPreference }; ");
const exerciseKey = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const model = factory(exerciseKey, { settings: { weightUnit: "lb" } });

const sidePlankType = model.inferResistanceType("Side Plank Dip", { isBodyweight: true }, [{ isBodyweight: true, weight: 12.5 }]);
assert.equal(sidePlankType, "bodyweight_plus_load", "Legacy weighted Side Plank Dip must migrate to bodyweight plus load");

const weightedSet = model.normalizeResistanceSet({ reps: 15, weight: 12.5, weightUnit: "lb", rpe: 8 }, sidePlankType);
assert.equal(weightedSet.addedLoad, 12.5, "Added load must be stored separately");
assert.equal(model.formatResistance(weightedSet, { name: "Side Plank Dip", resistanceType: sidePlankType }), "BW + 12.5 lb");
assert.equal(model.formatSetPerformance(weightedSet, { name: "Side Plank Dip", resistanceType: sidePlankType }), "15 reps × BW + 12.5 lb @ RPE 8");

const assisted = model.normalizeResistanceSet({ reps: 8, weight: 40, weightUnit: "lb" }, "assisted_bodyweight");
assert.equal(assisted.assistanceLoad, 40, "Assistance load must be stored separately");
assert.equal(model.formatResistance(assisted, { name: "Assisted Pull-Up", resistanceType: "assisted_bodyweight" }), "BW - 40 lb assistance");

const bodyweight = model.normalizeResistanceSet({ reps: 12, weight: 0, weightUnit: "lb" }, "bodyweight");
assert.equal(model.formatResistance(bodyweight, { name: "Pull-Up", resistanceType: "bodyweight" }), "BW");

const external = model.normalizeResistanceSet({ reps: 10, weight: 100, weightUnit: "lb" }, "external");
assert.equal(model.formatResistance(external, { name: "Bench Press", resistanceType: "external" }), "100 lb");

const appData = {
  settings: { weightUnit: "lb" },
  sets: [{ weight: 220.4623, targetWeight: 110.2312, addedLoad: 22.0462, weightUnit: "lb", setPrescription: { nextLoad: 225 } }],
  templates: [{ exercises: [{ increment: 5, warmups: [{ weight: 45, weightUnit: "lb" }] }] }],
  recommendationHistory: [{ finalPrescription: { prescribedLoad: { target: 220.4623, previous: 200 } } }],
  manualOverrides: [{ changes: { load: { from: 200, to: 210 } } }],
  personalEvidencePackage: { exercisePrescriptions: [{ weight: 999 }] },
  rawImports: [{ weight: 888 }]
};
const kilograms = model.setAppWeightUnitPreference(appData, "kg");
assert.equal(kilograms.settings.weightUnit, "kg");
assert.deepEqual(kilograms.sets, appData.sets, "Changing the display unit must not rewrite stored workout observations");
assert.deepEqual(kilograms.recommendationHistory, appData.recommendationHistory, "Changing the display unit must not rewrite immutable historical snapshots");
assert.deepEqual(kilograms.manualOverrides, appData.manualOverrides, "Changing the display unit must not rewrite audit provenance");
assert.equal(kilograms.personalEvidencePackage, appData.personalEvidencePackage, "Private evidence must remain in its source units");
assert.equal(kilograms.rawImports, appData.rawImports, "Raw import records must remain immutable source evidence");
assert.equal(model.resistanceLoadInUnit(appData.sets[0], "external", "kg"), 100, "Display conversion must preserve the physical load without mutating its stored source value");
assert.match(html, /toggle-unit"\) commit\(setAppWeightUnitPreference/, "Header unit control must change display preference without rewriting history");
assert.match(html, /weight-unit"\) commit\(setAppWeightUnitPreference/, "Settings unit control must use the same display-only boundary");
assert.doesNotMatch(html, /function convertAppWeightUnit\(/, "Whole-model historical unit rewriting must be deleted");

assert.doesNotMatch(html, /templateExercise\.isBodyweight[\s\S]{0,160}weight:\s*0/, "Starting a template must not silently erase added load");
assert.match(html, /Array\.from\(\{ length: setCount \}[\s\S]*createSet\(exercise\.id, index \+ 1,[\s\S]*resistanceType,[\s\S]*targetRepMin: repMin[\s\S]*targetRepMax: repMax/, "A newly added bodyweight exercise must give every target-complete set the inferred resistance type");
assert.match(html, /function factualSetPrefillForWorkoutStart\([\s\S]*const resistanceType = target\.resistanceType \|\| templateExercise\.resistanceType[\s\S]*const priorLoad = previousComparableSet \? Number\(convertWeightValue\(storedResistanceLoad\(previousComparableSet, resistanceType\), previousComparableSet\.weightUnit \|\| settings\.weightUnit, settings\.weightUnit\)\)[\s\S]*const factualLoad = previousComparableSet \? priorLoad : routineLoad/, "Workout start must preserve resistance semantics and convert from the factual source unit into the explicit display unit while choosing same-role prior load before stable routine load");
assert.match(html, /addedLoad:\s*target\.resistanceType\s*===\s*"bodyweight_plus_load"\s*\?\s*prefill\.weight\s*:\s*target\.addedLoad/, "A weighted bodyweight set must store its factual prefill as added load");
assert.match(html, /assistanceLoad:\s*target\.resistanceType\s*===\s*"assisted_bodyweight"\s*\?\s*prefill\.weight\s*:\s*target\.assistanceLoad/, "An assisted bodyweight set must store its factual prefill as assistance load");

console.log("Resistance model tests passed (weighted, assisted, bodyweight, external, and template preservation).");
