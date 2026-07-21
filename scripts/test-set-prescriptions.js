const fs = require("fs");
const assert = require("assert");
const { readApplicationContractSource } = require("./read-application-contract-source");

const html = readApplicationContractSource();

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
  function isWorkingSet(set) { return normalizeSetTypeCode(set?.setType, set?.isWarmup) !== "warmup"; }
  function defaultProgressionRule() { return "Progress inside the programmed range."; }
  function formatLoadNumber(value) { return String(Number(value)); }
  function roundLoadForUnit(value, unit, increment) { const step = unit === "lb" ? Math.max(0.5, Number(increment || 0.5)) : Math.max(0.001, Number(increment || 0.001)); return Math.round(Number(value || 0) / step) * step; }
  function resistanceLoad(value) { return Number(value?.weight || value?.targetWeight || 0); }
  function targetRangeText(low, high) { return Number(low) === Number(high) ? String(Number(high)) : Number(low) + "-" + Number(high); }
  ${extractFunction("progressionProfileForExercise")}
  ${extractFunction("resolveProgrammedRepRange")}
  ${extractFunction("normalizeTargetSetType")}
  ${extractFunction("setRoleDefaultsForExercise")}
  ${extractFunction("roundEquipmentLoad")}
  ${extractFunction("previousComparableSetForRole")}
  ${extractFunction("resolvedSetTypesForPrescription")}
  ${extractFunction("setPrescriptionForRole")}
  ${extractFunction("validateGeneratedSetPrescriptions")}
  ${extractFunction("isUsableWorkoutPrescriptionSnapshot")}
  return { progressionProfileForExercise, resolveProgrammedRepRange, normalizeTargetSetType, setRoleDefaultsForExercise, roundEquipmentLoad, previousComparableSetForRole, resolvedSetTypesForPrescription, setPrescriptionForRole, validateGeneratedSetPrescriptions, isUsableWorkoutPrescriptionSnapshot };
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
assert.strictEqual(runtime.previousComparableSetForRole(previousSets, "drop", 0, 0).id, "top", "A missing imported role must fall back to the same ordered working-set position");
assert.strictEqual(runtime.previousComparableSetForRole(previousSets, "drop", 0, 1).id, "backoff", "Ordered fallback must preserve the current working-set position");

const baseTarget = { sets: 2, reps: 15, repLow: 10, repHigh: 15, weight: 100, rpe: 8.5, restSeconds: 90, increment: 5, resistanceType: "external" };
const topPrescription = runtime.setPrescriptionForRole({ templateExercise: { name: "Leg Extension", increment: 5 }, target: baseTarget, setType: { ...extensionTop, type: "top" }, setTypeIndex: 0, previousSets });
const backoffPrescription = runtime.setPrescriptionForRole({ templateExercise: { name: "Leg Extension", increment: 5 }, target: baseTarget, setType: { ...extensionBackoff, type: "backoff" }, setTypeIndex: 0, previousSets: [{ id: "backoff-low", setType: "backoff", setTypeIndex: 0, reps: 9, weight: 90, rpe: 8 }] });
assert.strictEqual(topPrescription.targetLoad, 100);
assert(backoffPrescription.targetLoad < topPrescription.targetLoad, "A true back-off must reduce load");
assert.strictEqual(backoffPrescription.targetLoad % 5, 0, "Back-off load must respect equipment increments");
assert.strictEqual(backoffPrescription.previousComparableSet.id, "backoff-low");
assert(backoffPrescription.reason.includes("productive volume"));
assert.strictEqual(backoffPrescription.progressionReady, false, "A back-off below its rep gate must not authorize the next load");
assert.strictEqual(backoffPrescription.targetLoad, 90, "An unqualified back-off must repeat the prior comparable load");
assert.strictEqual(backoffPrescription.targetReps, 9, "An unqualified back-off must not ask for more reps than prior performance");
assert.strictEqual(backoffPrescription.nextLoad, backoffPrescription.targetLoad, "An unqualified back-off must hold its current load");
const qualifiedBackoff = runtime.setPrescriptionForRole({
  templateExercise: { name: "Leg Extension", increment: 5 },
  target: baseTarget,
  setType: { ...extensionBackoff, type: "backoff", setCount: 2 },
  setTypeIndex: 0,
  previousSets: [
    { id: "backoff-1", setType: "backoff", setTypeIndex: 0, reps: 20, weight: 90, rpe: 8 },
    { id: "backoff-2", setType: "backoff", setTypeIndex: 1, reps: 20, weight: 90, rpe: 8 }
  ]
});
assert.strictEqual(qualifiedBackoff.progressionReady, true, "Every programmed back-off must qualify before load increases");
assert.strictEqual(qualifiedBackoff.nextLoad, qualifiedBackoff.candidateNextLoad);

const duplicate = runtime.validateGeneratedSetPrescriptions([
  { setType: "top", targetLoad: 100, repMin: 10, repMax: 15, rpeMin: 8, rpeMax: 9 },
  { setType: "backoff", targetLoad: 100, repMin: 10, repMax: 15, rpeMin: 8, rpeMax: 9 }
], "external");
assert.strictEqual(duplicate[1].setType, "straight", "An identical later set is a straight working set, not a back-off");
const noBaseline = runtime.validateGeneratedSetPrescriptions([
  { setType: "top", targetLoad: 0, repMin: 8, repMax: 12, rpeMin: 8, rpeMax: 9 },
  { setType: "backoff", targetLoad: 0, repMin: 10, repMax: 15, rpeMin: 7, rpeMax: 8 }
], "external");
assert.strictEqual(noBaseline[1].validationWarning, undefined, "A missing load baseline must not create a false back-off warning");

const straight = runtime.setPrescriptionForRole({ templateExercise: { name: "Leg Press", increment: 5 }, target: { ...baseTarget, reps: 10, weight: 385 }, setType: { type: "straight", repMin: 8, repMax: 12, rpeMin: 7, rpeMax: 8 }, setTypeIndex: 1, previousSets: [{ id: "straight-two", setType: "straight", setTypeIndex: 1, reps: 9, weight: 385, rpe: 8 }] });
assert.strictEqual(straight.targetLoad, 385);
assert.strictEqual(straight.targetReps, 9, "Later straight sets keep role-specific history instead of copying Set 1");

const unifiedLightTarget = { ...baseTarget, mode: "light", reps: 6, repLow: 6, repHigh: 10, weight: 160, rpe: 7, finalPrescription: { setStructure: "top_set_backoff" } };
const unifiedTop = runtime.setPrescriptionForRole({ templateExercise: { name: "Bench Press", increment: 5 }, target: unifiedLightTarget, setType: { type: "top", repMin: 6, repMax: 10, rpeMin: 6, rpeMax: 7 }, previousSets: [{ id: "prior-top", setType: "top", setTypeIndex: 0, reps: 4, weight: 175, rpe: 7 }] });
assert.strictEqual(unifiedTop.targetLoad, 160, "The immutable final prescription load must beat an older comparable load");
assert.strictEqual(unifiedTop.targetReps, 6, "The immutable final prescription rep target must beat an older comparable rep count");
assert.strictEqual(unifiedTop.progressionReady, false, "Using today's prescribed target must not falsely authorize the next increment");

const unifiedLightTypes = runtime.resolvedSetTypesForPrescription({ setTypes: [{ type: "top", setCount: 1, countsTowardScore: true }, { type: "backoff", setCount: 1, countsTowardScore: true }] }, unifiedLightTarget);
assert.deepStrictEqual(unifiedLightTypes.map((item) => item.type), ["top", "backoff"], "A unified top/back-off prescription must not be relabeled as straight work during a light session");

const deloadTypes = runtime.resolvedSetTypesForPrescription({ setTypes: [{ type: "top", setCount: 1, countsTowardScore: true }, { type: "backoff", setCount: 2, countsTowardScore: true }, { type: "drop", setCount: 1, countsTowardScore: true }] }, { mode: "deload", sets: 2, rpe: 6 });
assert.deepStrictEqual(deloadTypes.map((item) => item.type), ["deload"]);
assert.strictEqual(deloadTypes[0].setCount, 2);

const importedFallbackTypes = runtime.resolvedSetTypesForPrescription({ setTypes: [] }, { mode: "maintenance", sets: 0, rpe: 8 }, { name: "Cable Crossover", sets: 4, setTypes: [{ type: "straight", setCount: 4, repMin: 12, repMax: 20, countsTowardScore: true, countsTowardVolume: true }] });
assert.strictEqual(importedFallbackTypes.reduce((sum, item) => sum + item.setCount, 0), 4, "An empty engine context must retain the imported template set count");
const customFallbackTypes = runtime.resolvedSetTypesForPrescription({ setTypes: [] }, { mode: "maintenance", sets: 0, rpe: 8 }, { name: "Tricep Pushdown - Dongles", sets: 2, setTypes: [] });
assert.deepStrictEqual(customFallbackTypes.map((item) => [item.type, item.setCount]), [["straight", 2]], "A custom exercise without research roles must still create its saved working sets");
assert.strictEqual(runtime.isUsableWorkoutPrescriptionSnapshot({ finalPrescription: { workingSets: { target: 0 }, repRange: { min: 10, max: 15 } } }), false);
assert.strictEqual(runtime.isUsableWorkoutPrescriptionSnapshot({ finalPrescription: { workingSets: { target: 3 }, repRange: { min: 10, max: 15 } } }), true);

assert(html.includes('class="set-type-badge type-${escapeHtml(role)}"'));
assert(html.includes("escapeHtml(executionLabel.toUpperCase())"));
assert(html.includes("pointer-events: none"), "Informational set badges must not behave like buttons");
assert(!/set-type-badge[^>]+data-action/.test(html), "Set-type badges must not own edit or navigation actions");
assert(html.includes("previousComparableSetForRole(previousSets, role, set.setTypeIndex, workingSetIndex)"));
assert(html.includes("getMostRecentWorkoutPerformance"), "All prior-set consumers must share one workout-level resolver");
assert(html.includes('class="set-field set-previous set-previous-link"'), "Comparable history must use one compact linked Previous column beside the current fields");
assert(html.includes('previousSummaryText'), "The Previous column must combine load, reps, and RPE without losing resistance semantics");
assert(html.includes('data-session-id="\' + escapeHtml(previous.priorSessionId)'), "The Previous link must preserve the exact source session ID");
assert(html.includes("Broad exercise guidance"));
assert(html.includes("These values come from the same saved prescription shown above."));
assert(html.includes("exercise.recommendationSnapshot || unifiedPrescriptionSnapshot(exercise)"), "Broad guidance must reuse the unified prescription instead of hard-coded sets or reps");

console.log("Set prescription tests passed (roles, ranges, history, equipment, labels, and reduced sessions).");
