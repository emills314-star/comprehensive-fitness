const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const match = html.match(/\/\/ RESISTANCE_MODEL_START([\s\S]*?)\/\/ RESISTANCE_MODEL_END/);
assert.ok(match, "Resistance model markers were not found in index.html");

const factory = new Function("exerciseKey", "data", match[1] + "; return { inferResistanceType, formatResistance, formatSetPerformance, normalizeResistanceSet }; ");
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

assert.doesNotMatch(html, /templateExercise\.isBodyweight[\s\S]{0,160}weight:\s*0/, "Starting a template must not silently erase added load");
assert.match(html, /createSet\(exercise\.id, 1, \{ resistanceType \}\)/, "A newly added bodyweight exercise must give its first set the inferred resistance type");
assert.match(html, /addedLoad:\s*target\.addedLoad/, "A template prescription must carry its added-load target into the workout set");
assert.match(html, /assistanceLoad:\s*target\.assistanceLoad/, "A template prescription must carry its assistance target into the workout set");

console.log("Resistance model tests passed (weighted, assisted, bodyweight, external, and template preservation).");
