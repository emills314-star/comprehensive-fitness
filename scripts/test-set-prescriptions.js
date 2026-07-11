const fs = require("fs");
const assert = require("assert");

const html = fs.readFileSync("index.html", "utf8");

function extractFunction(name) {
  const marker = "function " + name + "(";
  const start = html.indexOf(marker);
  assert(start >= 0, "Missing function " + name);
  const paramsStart = html.indexOf("(", start);
  let paramsDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < html.length; index += 1) {
    if (html[index] === "(") paramsDepth += 1;
    if (html[index] === ")") paramsDepth -= 1;
    if (paramsDepth === 0) { paramsEnd = index; break; }
  }
  const bodyStart = html.indexOf("{", paramsEnd);
  let depth = 0;
  for (let index = bodyStart; index < html.length; index += 1) {
    if (html[index] === "{") depth += 1;
    if (html[index] === "}") depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error("Unclosed function " + name);
}

const runtime = new Function(`
  const data = { settings: { weightUnit: "lb" } };
  const setTypeLabels = { top: "Top set", backoff: "Back-off set", straight: "Working set", drop: "Drop set", deload: "Deload set", technique: "Technique set", warmup: "Warm-up set" };
  function exerciseKey(value) { return String(value || "").toLowerCase(); }
  function normalizeSetTypeCode(value) { return ({ working: "straight", work: "straight", "back-off": "backoff" })[String(value || "straight").toLowerCase()] || String(value || "straight").toLowerCase(); }
  function defaultProgressionRule() { return "Progress inside the programmed range."; }
  function formatLoadNumber(value) { return String(Number(value)); }
  function targetRangeText(low, high) { return Number(low) === Number(high) ? String(Number(high)) : Number(low) + "-" + Number(high); }
  ${extractFunction("progressionProfileForExercise")}
  ${extractFunction("normalizeTargetSetType")}
  ${extractFunction("setRoleDefaultsForExercise")}
  ${extractFunction("roundEquipmentLoad")}
  ${extractFunction("previousComparableSetForRole")}
  ${extractFunction("resolvedSetTypesForPrescription")}
  ${extractFunction("setPrescriptionForRole")}
  ${extractFunction("validateGeneratedSetPrescriptions")}
  return { progressionProfileForExercise, normalizeTargetSetType, setRoleDefaultsForExercise, roundEquipmentLoad, previousComparableSetForRole, resolvedSetTypesForPrescription, setPrescriptionForRole, validateGeneratedSetPrescriptions };
`)();

const legPress = runtime.progressionProfileForExercise("Leg Press");
assert.deepStrictEqual(legPress.roleRanges.top, [8, 10]);
assert.deepStrictEqual(legPress.roleRanges.backoff, [10, 15]);
assert(legPress.lowerRep > 5, "Leg Press must not inherit an unjustified five-rep lower bound");

const legExtension = runtime.progressionProfileForExercise("Leg Extension");
const extensionTop = runtime.setRoleDefaultsForExercise({ name: "Leg Extension", targetRpe: 8.5 }, "top", legExtension, "normal", 8.5, 90);
const extensionBackoff = runtime.setRoleDefaultsForExercise({ name: "Leg Extension", targetRpe: 8.5 }, "backoff", legExtension, "normal", 8.5, 90);
assert.deepStrictEqual([extensionTop.repMin, extensionTop.repMax], [10, 15]);
assert.deepStrictEqual([extensionBackoff.repMin, extensionBackoff.repMax], [12, 20]);
assert(extensionBackoff.rpeMax < extensionTop.rpeMax);
assert(extensionBackoff.loadReductionMin >= 10);

const explicit = runtime.normalizeTargetSetType({ type: "top", repMin: 7, repMax: 9, rpeMin: 8, rpeMax: 9 }, extensionTop);
assert.deepStrictEqual([explicit.repMin, explicit.repMax], [7, 9], "Explicit set targets must beat exercise defaults");

const previousSets = [
  { id: "top", setType: "top", setTypeIndex: 0, reps: 10, weight: 100, rpe: 9 },
  { id: "backoff", setType: "backoff", setTypeIndex: 0, reps: 15, weight: 90, rpe: 8 }
];
assert.strictEqual(runtime.previousComparableSetForRole(previousSets, "backoff", 0).id, "backoff");
assert.strictEqual(runtime.previousComparableSetForRole(previousSets, "drop", 0), null, "A missing role must not borrow top-set history");

const baseTarget = { sets: 2, reps: 15, repLow: 10, repHigh: 15, weight: 100, rpe: 8.5, restSeconds: 90, increment: 5, resistanceType: "external" };
const topPrescription = runtime.setPrescriptionForRole({ templateExercise: { name: "Leg Extension", increment: 5 }, target: baseTarget, setType: { ...extensionTop, type: "top" }, setTypeIndex: 0, previousSets });
const backoffPrescription = runtime.setPrescriptionForRole({ templateExercise: { name: "Leg Extension", increment: 5 }, target: baseTarget, setType: { ...extensionBackoff, type: "backoff" }, setTypeIndex: 0, previousSets });
assert.strictEqual(topPrescription.targetLoad, 100);
assert(backoffPrescription.targetLoad < topPrescription.targetLoad, "A true back-off must reduce load");
assert.strictEqual(backoffPrescription.targetLoad % 5, 0, "Back-off load must respect equipment increments");
assert.strictEqual(backoffPrescription.previousComparableSet.id, "backoff");
assert(backoffPrescription.reason.includes("productive volume"));

const duplicate = runtime.validateGeneratedSetPrescriptions([
  { setType: "top", targetLoad: 100, repMin: 10, repMax: 15, rpeMin: 8, rpeMax: 9 },
  { setType: "backoff", targetLoad: 100, repMin: 10, repMax: 15, rpeMin: 8, rpeMax: 9 }
], "external");
assert.strictEqual(duplicate[1].setType, "straight", "An identical later set is a straight working set, not a back-off");

const straight = runtime.setPrescriptionForRole({ templateExercise: { name: "Leg Press", increment: 5 }, target: { ...baseTarget, reps: 10, weight: 385 }, setType: { type: "straight", repMin: 8, repMax: 12, rpeMin: 7, rpeMax: 8 }, setTypeIndex: 1, previousSets: [{ id: "straight-two", setType: "straight", setTypeIndex: 1, reps: 9, weight: 385, rpe: 8 }] });
assert.strictEqual(straight.targetLoad, 385);
assert.strictEqual(straight.targetReps, 9, "Later straight sets keep role-specific history instead of copying Set 1");

const deloadTypes = runtime.resolvedSetTypesForPrescription({ setTypes: [{ type: "top", setCount: 1, countsTowardScore: true }, { type: "backoff", setCount: 2, countsTowardScore: true }, { type: "drop", setCount: 1, countsTowardScore: true }] }, { mode: "deload", sets: 2, rpe: 6 });
assert.deepStrictEqual(deloadTypes.map((item) => item.type), ["deload"]);
assert.strictEqual(deloadTypes[0].setCount, 2);

assert(html.includes('class="set-type-badge type-${escapeHtml(role)}"'));
assert(html.includes("escapeHtml(executionLabel.toUpperCase())"));
assert(html.includes("pointer-events: none"), "Informational set badges must not behave like buttons");
assert(!/set-type-badge[^>]+data-action/.test(html), "Set-type badges must not own edit or navigation actions");
assert(html.includes("previousComparableSetForRole(previousSets, role, set.setTypeIndex)"));
assert(html.includes("Broad exercise guidance"));
assert(html.includes("The programmed set targets above drive scoring and progression."));

console.log("Set prescription tests passed (roles, ranges, history, equipment, labels, and reduced sessions).");
