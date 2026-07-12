const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const match = html.match(/\/\/ RESISTANCE_MODEL_START([\s\S]*?)\/\/ RESISTANCE_MODEL_END/);
assert.ok(match, "Resistance model markers were not found in index.html");

const factory = new Function("exerciseKey", "data", match[1] + "; return { inferResistanceType, formatResistance, formatSetPerformance, normalizeResistanceSet, convertWeightValue, convertAppWeightUnit }; ");
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
const kilograms = model.convertAppWeightUnit(appData, "kg");
assert.equal(kilograms.settings.weightUnit, "kg");
assert.equal(kilograms.sets[0].weight, 100, "Stored set loads must convert atomically to kilograms");
assert.equal(kilograms.sets[0].targetWeight, 50, "Target loads must convert with actual loads");
assert.equal(kilograms.sets[0].weightUnit, "kg", "Converted records must retain explicit unit provenance");
assert.equal(kilograms.recommendationHistory[0].finalPrescription.prescribedLoad.target, 100, "Snapshot prescribed loads must preserve meaning across unit switches");
assert.equal(kilograms.manualOverrides[0].changes.load.to, Number((210 / 2.2046226218).toFixed(3)), "Audited load overrides must convert without losing their from/to structure");
assert.equal(kilograms.personalEvidencePackage, appData.personalEvidencePackage, "Private evidence must remain in its source units");
assert.equal(kilograms.rawImports, appData.rawImports, "Raw import records must remain immutable source evidence");
const poundsAgain = model.convertAppWeightUnit(kilograms, "lb");
assert.equal(poundsAgain.sets[0].weight, 220.5, "Pound loads must settle on the nearest supported half-pound boundary");
let switched = poundsAgain;
for (let index = 0; index < 10; index += 1) switched = model.convertAppWeightUnit(model.convertAppWeightUnit(switched, "kg"), "lb");
assert.equal(switched.sets[0].weight, 220.5, "Repeated kg/lb switching must not accumulate conversion drift");
assert.match(html, /toggle-unit"\) commit\(convertAppWeightUnit/, "Header unit control must convert app data rather than relabel it");
assert.match(html, /weight-unit"\) commit\(convertAppWeightUnit/, "Settings unit control must use the same atomic conversion boundary");

assert.doesNotMatch(html, /templateExercise\.isBodyweight[\s\S]{0,160}weight:\s*0/, "Starting a template must not silently erase added load");
assert.match(html, /createSet\(exercise\.id, 1, \{ resistanceType \}\)/, "A newly added bodyweight exercise must give its first set the inferred resistance type");
assert.match(html, /addedLoad:\s*target\.resistanceType\s*===\s*"bodyweight_plus_load"\s*\?\s*setWeight\s*:\s*target\.addedLoad/, "A template prescription must carry its resolved added-load target into each workout set");
assert.match(html, /assistanceLoad:\s*target\.resistanceType\s*===\s*"assisted_bodyweight"\s*\?\s*setWeight\s*:\s*target\.assistanceLoad/, "A template prescription must carry its resolved assistance target into each workout set");

console.log("Resistance model tests passed (weighted, assisted, bodyweight, external, and template preservation).");
