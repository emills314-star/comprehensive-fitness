"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SCHEMA_FILES = [
  "schemas/exercise-prescription.v2.schema.json",
  "schemas/mesocycle-plan.v1.schema.json",
  "schemas/recommendation-snapshot.v1.schema.json"
];
const cache = new Map();

function load(relativeOrAbsolute) {
  const absolute = path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.resolve(ROOT, relativeOrAbsolute);
  if (!cache.has(absolute)) {
    cache.set(absolute, JSON.parse(fs.readFileSync(absolute, "utf8")));
  }
  return { absolute, schema: cache.get(absolute) };
}

function pointerValue(document, fragment, context) {
  if (!fragment || fragment === "#") return document;
  assert.match(fragment, /^#\//, `${context}: only JSON Pointer fragments are supported`);
  return fragment.slice(2).split("/").reduce((value, token) => {
    const key = decodeURIComponent(token).replace(/~1/g, "/").replace(/~0/g, "~");
    assert.ok(value && Object.prototype.hasOwnProperty.call(value, key), `${context}: missing pointer token ${key}`);
    return value[key];
  }, document);
}

function resolveRef(ref, currentFile) {
  const hashIndex = ref.indexOf("#");
  const filePart = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref;
  const fragment = hashIndex >= 0 ? ref.slice(hashIndex) : "";
  assert.ok(!/^https?:/i.test(filePart), `${currentFile}: remote $ref is not auditable offline: ${ref}`);
  const targetFile = filePart ? path.resolve(path.dirname(currentFile), filePart) : currentFile;
  assert.ok(fs.existsSync(targetFile), `${currentFile}: referenced schema does not exist: ${ref}`);
  const { schema } = load(targetFile);
  return pointerValue(schema, fragment, `${currentFile} -> ${ref}`);
}

function resolveRefRecord(ref, currentFile) {
  const hashIndex = ref.indexOf("#");
  const filePart = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref;
  const fragment = hashIndex >= 0 ? ref.slice(hashIndex) : "";
  const targetFile = filePart ? path.resolve(path.dirname(currentFile), filePart) : currentFile;
  const { schema } = load(targetFile);
  return { node: pointerValue(schema, fragment, `${currentFile} -> ${ref}`), file: targetFile };
}

function typeMatches(value, expected) {
  const types = Array.isArray(expected) ? expected : [expected];
  return types.some((type) => {
    if (type === "null") return value === null;
    if (type === "array") return Array.isArray(value);
    if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
    if (type === "integer") return Number.isInteger(value);
    if (type === "number") return typeof value === "number" && Number.isFinite(value);
    return typeof value === type;
  });
}

function evaluatedPropertyNames(node, currentFile, seen = new Set()) {
  if (!node || typeof node !== "object") return new Set();
  if (node.$ref) {
    const key = `${currentFile}|${node.$ref}`;
    if (seen.has(key)) return new Set();
    seen.add(key);
    const resolved = resolveRefRecord(node.$ref, currentFile);
    return evaluatedPropertyNames(resolved.node, resolved.file, seen);
  }
  const names = new Set(Object.keys(node.properties || {}));
  (node.allOf || []).forEach((child) => evaluatedPropertyNames(child, currentFile, seen).forEach((name) => names.add(name)));
  return names;
}

function validateInstance(value, node, currentFile, instancePath = "$", errors = []) {
  if (!node || typeof node !== "object") return errors;
  if (node.$ref) {
    const resolved = resolveRefRecord(node.$ref, currentFile);
    return validateInstance(value, resolved.node, resolved.file, instancePath, errors);
  }

  if (node.const !== undefined && JSON.stringify(value) !== JSON.stringify(node.const)) errors.push(`${instancePath}: expected const ${JSON.stringify(node.const)}`);
  if (node.enum && !node.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value))) errors.push(`${instancePath}: value ${JSON.stringify(value)} is outside enum`);
  if (node.type && !typeMatches(value, node.type)) {
    errors.push(`${instancePath}: expected type ${JSON.stringify(node.type)}, received ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`);
    return errors;
  }

  (node.allOf || []).forEach((child) => validateInstance(value, child, currentFile, instancePath, errors));
  if (node.anyOf) {
    const branches = node.anyOf.map((child) => validateInstance(value, child, currentFile, instancePath, []));
    if (!branches.some((branchErrors) => branchErrors.length === 0)) errors.push(`${instancePath}: no anyOf branch matched (${branches.map((branch) => branch[0]).filter(Boolean).join("; ")})`);
  }
  if (node.oneOf) {
    const matching = node.oneOf.filter((child) => validateInstance(value, child, currentFile, instancePath, []).length === 0).length;
    if (matching !== 1) errors.push(`${instancePath}: expected exactly one oneOf branch, received ${matching}`);
  }
  if (node.if && validateInstance(value, node.if, currentFile, instancePath, []).length === 0 && node.then) validateInstance(value, node.then, currentFile, instancePath, errors);

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    (node.required || []).forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(value, field)) errors.push(`${instancePath}: missing required property ${field}`);
    });
    const properties = node.properties || {};
    Object.entries(properties).forEach(([field, child]) => {
      if (Object.prototype.hasOwnProperty.call(value, field)) validateInstance(value[field], child, currentFile, `${instancePath}.${field}`, errors);
    });
    const unknown = Object.keys(value).filter((field) => !Object.prototype.hasOwnProperty.call(properties, field));
    if (node.additionalProperties === false) unknown.forEach((field) => errors.push(`${instancePath}: additional property ${field}`));
    else if (node.additionalProperties && typeof node.additionalProperties === "object") unknown.forEach((field) => validateInstance(value[field], node.additionalProperties, currentFile, `${instancePath}.${field}`, errors));
    if (node.unevaluatedProperties === false) {
      const evaluated = evaluatedPropertyNames(node, currentFile);
      Object.keys(value).filter((field) => !evaluated.has(field)).forEach((field) => errors.push(`${instancePath}: unevaluated property ${field}`));
    }
    if (node.minProperties !== undefined && Object.keys(value).length < node.minProperties) errors.push(`${instancePath}: fewer than ${node.minProperties} properties`);
  }

  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) errors.push(`${instancePath}: fewer than ${node.minItems} items`);
    if (node.maxItems !== undefined && value.length > node.maxItems) errors.push(`${instancePath}: more than ${node.maxItems} items`);
    if (node.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) errors.push(`${instancePath}: duplicate array item`);
    if (node.items) value.forEach((entry, index) => validateInstance(entry, node.items, currentFile, `${instancePath}[${index}]`, errors));
  }
  if (typeof value === "number") {
    if (node.minimum !== undefined && value < node.minimum) errors.push(`${instancePath}: below minimum ${node.minimum}`);
    if (node.maximum !== undefined && value > node.maximum) errors.push(`${instancePath}: above maximum ${node.maximum}`);
  }
  if (typeof value === "string") {
    if (node.minLength !== undefined && value.length < node.minLength) errors.push(`${instancePath}: shorter than ${node.minLength}`);
    if (node.maxLength !== undefined && value.length > node.maxLength) errors.push(`${instancePath}: longer than ${node.maxLength}`);
    if (node.pattern && !(new RegExp(node.pattern).test(value))) errors.push(`${instancePath}: does not match ${node.pattern}`);
  }
  return errors;
}

function assertValidInstance(value, schemaNode, schemaFile, label) {
  const errors = validateInstance(value, schemaNode, path.resolve(ROOT, schemaFile));
  assert.equal(errors.length, 0, `${label} failed schema contract:\n${errors.slice(0, 20).join("\n")}`);
}

function walkSchema(node, currentFile, location = "#") {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => walkSchema(child, currentFile, `${location}/${index}`));
    return;
  }

  if (node.$ref) {
    assert.equal(typeof node.$ref, "string", `${currentFile}${location}: $ref must be a string`);
    resolveRef(node.$ref, currentFile);
  }
  if (node.required) {
    assert.ok(Array.isArray(node.required) && node.required.length > 0, `${currentFile}${location}: required must be a non-empty array`);
    assert.equal(new Set(node.required).size, node.required.length, `${currentFile}${location}: duplicate required field`);
    node.required.forEach((field) => assert.equal(typeof field, "string", `${currentFile}${location}: required entries must be strings`));
    if (node.properties) {
      node.required.forEach((field) => assert.ok(Object.prototype.hasOwnProperty.call(node.properties, field), `${currentFile}${location}: required field ${field} has no property schema`));
    }
  }
  if (node.enum) {
    assert.ok(Array.isArray(node.enum) && node.enum.length > 0, `${currentFile}${location}: enum must be non-empty`);
    assert.equal(new Set(node.enum.map(JSON.stringify)).size, node.enum.length, `${currentFile}${location}: enum values must be unique`);
  }
  if (node.properties) {
    assert.equal(typeof node.properties, "object", `${currentFile}${location}: properties must be an object`);
  }
  if (node.maxItems !== undefined && node.minItems !== undefined) {
    assert.ok(node.maxItems >= node.minItems, `${currentFile}${location}: maxItems is below minItems`);
  }
  if (node.maximum !== undefined && node.minimum !== undefined) {
    assert.ok(node.maximum >= node.minimum, `${currentFile}${location}: maximum is below minimum`);
  }

  Object.entries(node).forEach(([key, child]) => walkSchema(child, currentFile, `${location}/${key}`));
}

function propertyAt(schema, ...keys) {
  return keys.reduce((value, key) => {
    assert.ok(value && Object.prototype.hasOwnProperty.call(value, key), `Missing schema path: ${keys.join(".")}`);
    return value[key];
  }, schema);
}

function assertIncludesAll(actual, expected, label) {
  expected.forEach((value) => assert.ok(actual.includes(value), `${label} is missing ${value}`));
}

function assertExactEnum(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), `${label} drifted from the engine contract`);
}

function extractFrozenArray(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `Could not find ${name} in prescription-engine.js`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractFrozenObjectValues(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*Object\\.freeze\\(\\{([\\s\\S]*?)\\}\\);`));
  assert.ok(match, `Could not find ${name} in prescription-engine.js`);
  return [...match[1].matchAll(/:\s*"([^"]+)"/g)].map((item) => item[1]);
}

SCHEMA_FILES.forEach((file) => {
  const { absolute, schema } = load(file);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema", `${file}: wrong JSON Schema draft`);
  assert.match(schema.$id, /^https:\/\/comprehensive-fitness\.local\/schemas\//, `${file}: unexpected canonical $id`);
  walkSchema(schema, absolute);
});

const exercise = load(SCHEMA_FILES[0]).schema;
const mesocycle = load(SCHEMA_FILES[1]).schema;
const snapshot = load(SCHEMA_FILES[2]).schema;
const engineSource = fs.readFileSync(path.resolve(ROOT, "prescription-engine.js"), "utf8");

assert.equal(exercise.properties.schemaVersion.const, "2.3.0");
assertIncludesAll(exercise.required, ["programmingContext", "historyResolution", "progressionConfirmation", "scientificProvenance"], "ExercisePrescription.required");
assert.equal(exercise.$defs.programmingContext.properties.profileVersion.const, "training-profile/1.1.0");
assertIncludesAll(exercise.$defs.programmingContext.required, ["nutritionPhase", "returningAfterGap"], "programmingContext.required");
assertIncludesAll(exercise.$defs.scientificProvenance.required, ["repRange", "restSeconds", "workingSets", "selectionOrder", "progression", "confirmation"], "scientificProvenance.required");
assert.equal(exercise.additionalProperties, false);
assertIncludesAll(exercise.required, [
  "exerciseId", "muscleGroupId", "recommendationType", "role", "setStructure",
  "workingSets", "repRange", "targetRpe", "targetRir", "restSeconds",
  "frequencyPerWeek", "volume", "progressionMethod", "progressionRule", "holdRule",
  "regressionRule", "deloadRule", "personalEvidenceWeight", "researchEvidenceWeight",
  "confidence", "evidenceSummary", "userExplanation", "exerciseScore", "muscleSpecificScore",
  "staleness", "deloadStatus", "mesocycleId", "executionBlocked"
], "ExercisePrescription.required");
assert.ok(exercise.properties.safetyRestriction, "ExercisePrescription must define versioned hard-safety metadata");
assert.equal(exercise.$defs.hardSafetyRestriction.properties.schemaVersion.const, "hard-safety/1.0.0");
assertExactEnum(exercise.$defs.recommendationType.enum, extractFrozenArray(engineSource, "RECOMMENDATION_TYPES"), "recommendationType");
assertExactEnum(exercise.$defs.role.enum, extractFrozenArray(engineSource, "ROLES"), "role");
assertExactEnum(exercise.$defs.setStructure.enum, extractFrozenArray(engineSource, "SET_STRUCTURES"), "setStructure");
assertExactEnum(exercise.$defs.stalenessClassification.enum, extractFrozenObjectValues(engineSource, "STALENESS"), "stalenessClassification");
assertIncludesAll(exercise.$defs.exerciseScoreBreakdown.required, [
  "personalHypertrophySupport", "progressionQuality", "recoveryEfficiency", "repeatability",
  "muscleSpecificity", "lengthenedPositionLoading", "stability", "easeOfProgression",
  "jointTolerance", "fatigueCost", "researchSupport", "personalDataConfidence",
  "overallRecommendationStrength"
], "exerciseScore.required");
const conditionalText = JSON.stringify(exercise.allOf);
assert.match(conditionalText, /top_set_backoff/);
assert.match(conditionalText, /backoffSets/);
assert.match(conditionalText, /multiple_top_sets/);

assert(mesocycle.properties.schemaVersion.enum.includes("mesocycle/2.0.0"));
assert(mesocycle.properties.schemaVersion.enum.includes("mesocycle/2.5.0"));
assert(mesocycle.properties.schemaVersion.enum.includes("mesocycle/2.6.0"));
assert.equal(mesocycle.additionalProperties, false);
assertExactEnum(mesocycle.$defs.mesocycleType.enum, extractFrozenObjectValues(engineSource, "MESOCYCLE_TYPES"), "mesocycleType");
assertIncludesAll(mesocycle.$defs.mesocycleStatus.enum, ["draft", "planned", "active", "completed", "abandoned", "archived"]);
assert.equal(mesocycle.properties.durationWeeks.minimum, 2);
assert.equal(mesocycle.properties.durationWeeks.maximum, 12);
assert.equal(propertyAt(mesocycle, "$defs", "candidatePool", "properties", "candidates", "maxItems"), 5);
assertIncludesAll(mesocycle.required, ["programSlots", "selectedPortfolio", "sessions", "programReview", "planningStep"], "MesocyclePlan.required");
assertIncludesAll(mesocycle.$defs.candidateCore.required, [
  "rank", "rawScoreRank", "exerciseId", "intendedRole", "primaryMuscles", "secondaryMuscles",
  "recommendedSetStructure", "recommendedSetRange", "recommendedRepRange", "recommendedRestSeconds", "recommendedRpe",
  "recommendedRir", "recommendedFrequency", "programmingContext", "progressionConfirmation", "scientificProvenance", "progressionMethod", "deloadTrigger", "rotationTrigger",
  "preferredReplacementExerciseId", "reasonForMesocycle", "personalDataConfidence",
  "researchDataConfidence", "scores", "diversitySignature"
], "candidate.required");
assert.equal(mesocycle.$defs.candidate.unevaluatedProperties, false);
assert.equal(mesocycle.$defs.activeExercise.unevaluatedProperties, false);

assert.equal(snapshot.properties.schemaVersion.const, "1.3.0");
assert.equal(snapshot.additionalProperties, false);
assertIncludesAll(snapshot.required, [
  "recommendationId", "recommendationVersion", "engineVersion", "personalDataVersion",
  "researchDatabaseVersion", "mesocycleId", "exerciseScore", "muscleSpecificScore",
  "readinessAdjustment", "basePrescription", "finalPrescription", "explanation", "evidenceSummary",
  "confidence", "createdAt", "manualOverrides", "overrideLocked", "checksum"
], "RecommendationSnapshot.required");
assert.equal(snapshot.properties.checksum.pattern, "^[0-9a-f]{8}$", "RecommendationSnapshot.checksum must accept only the engine's current checksum format");
assertIncludesAll(Object.keys(snapshot.$defs.overrideChanges.properties), [
  "exerciseId", "setCount", "repRange", "load", "setStructure", "deloadRecommendation",
  "exerciseRotation", "mesocycleId", "safetyConfirmation"
], "overrideChanges.properties");
assertIncludesAll(snapshot.$defs.manualOverride.required, [
  "overrideId", "createdAt", "actor", "reason", "workoutId", "changes", "previousFinalPrescription"
], "manualOverride.required");
assert.deepEqual(snapshot.$defs.outcomeEvaluation.properties.result.enum, [
  "override_outperformed_or_supported",
  "engine_recommendation_likely_preferred",
  "inconclusive"
]);
assert.equal(snapshot.$defs.overrideChanges.minProperties, 1);

// Exercise the contracts against real engine output. The loader remains safe in
// public/CI checkouts: protected personal aggregates are optional and the
// versioned research exports provide a complete fallback candidate pool.
const engine = require("../prescription-engine");
const evidence = engine.loadEvidenceFromFiles(ROOT);
const muscleGroupId = engine.representedMuscleGroups(evidence)[0];
assert.ok(muscleGroupId, "The evidence adapters did not expose a represented muscle group");
const generatedAt = "2026-07-11T12:00:00.000Z";
const pool = engine.rankExercisePool(evidence, muscleGroupId, { generatedAt });
assert.ok(pool.candidates.length > 0, `No viable exercise candidate exists for ${muscleGroupId}`);
assertValidInstance(pool, mesocycle.$defs.candidatePool, SCHEMA_FILES[1], "Generated candidate pool");

const generatedMesocycle = engine.createMesocyclePlan(evidence, {
  type: engine.MESOCYCLE_TYPES.PRIMARY,
  muscleGroupIds: [muscleGroupId],
  trainingDays: 3,
  createdAt: generatedAt
});
assertValidInstance(generatedMesocycle, mesocycle, SCHEMA_FILES[1], "Generated mesocycle");

const generatedSnapshot = engine.createExercisePrescriptionSnapshot(evidence, {
  exerciseId: pool.candidates[0].exerciseId,
  muscleGroupId,
  mesocycle: generatedMesocycle,
  createdAt: generatedAt
});
assertValidInstance(generatedSnapshot, snapshot, SCHEMA_FILES[2], "Generated recommendation snapshot");

const blockedSnapshot = engine.createExercisePrescriptionSnapshot(evidence, {
  exerciseId: pool.candidates[0].exerciseId,
  muscleGroupId,
  mesocycle: generatedMesocycle,
  readiness: { pain: true, affectedMuscle: muscleGroupId },
  createdAt: generatedAt
});
assertValidInstance(blockedSnapshot, snapshot, SCHEMA_FILES[2], "Hard-safety recommendation snapshot");
assert.equal(blockedSnapshot.finalPrescription.executionBlocked, true);
assert.deepEqual(blockedSnapshot.finalPrescription.workingSets, { min: 0, target: 0, max: 0 });
const safeAlternative = pool.candidates.find((candidate) => candidate.exerciseId !== blockedSnapshot.exerciseId);
assert.ok(safeAlternative, "Safety schema contract requires a second catalog-backed candidate");
const safetyResearchId = safeAlternative.researchExerciseId || safeAlternative.exerciseId;
const safetyCatalogRecord = evidence.research.exerciseById.get(safetyResearchId);
assert.ok(safetyCatalogRecord, "Safety substitute must resolve to an actual research catalog record");
const substitutedSnapshot = engine.applyManualOverride(blockedSnapshot, {
  exerciseId: safeAlternative.exerciseId,
  researchExerciseId: safetyResearchId,
  painFreeConfirmed: true
}, {
  allowedSafetySubstituteIds: [safeAlternative.exerciseId],
  exerciseCatalog: [{ ...safetyCatalogRecord, exerciseId: safeAlternative.exerciseId, researchExerciseId: safetyResearchId }],
  availableEquipment: ["all"],
  createdAt: "2026-07-11T12:02:00.000Z"
});
assertValidInstance(substitutedSnapshot, snapshot, SCHEMA_FILES[2], "Confirmed pain-free substitute snapshot");
assert.equal(substitutedSnapshot.finalPrescription.executionBlocked, false);
assert.equal(substitutedSnapshot.finalPrescription.prescribedLoad, undefined);
assert.equal(substitutedSnapshot.manualOverrides.at(-1).changes.safetyConfirmation.painFreeConfirmed, true);

const overriddenSnapshot = engine.applyManualOverride(generatedSnapshot, {
  setCount: Math.max(2, generatedSnapshot.finalPrescription.workingSets.target),
  setStructure: "top_set_backoff",
  load: (generatedSnapshot.finalPrescription.prescribedLoad?.target || 1) + 1
}, {
  createdAt: "2026-07-11T12:05:00.000Z",
  workoutId: "schema_contract_workout"
});
assertValidInstance(overriddenSnapshot, snapshot, SCHEMA_FILES[2], "Overridden recommendation snapshot");
const evaluatedOverride = engine.evaluateManualOverrideOutcome(overriddenSnapshot, {
  progressed: true,
  progressionPercent: 2,
  recoveryCost: 35,
  pain: false,
  completed: true,
  adherence: 1
}, { evaluatedAt: "2026-07-12T12:00:00.000Z" });
assertValidInstance(evaluatedOverride, snapshot, SCHEMA_FILES[2], "Outcome-evaluated recommendation snapshot");

console.log(`Prescription schema contracts passed (${SCHEMA_FILES.length} schemas; engine enums and generated records synchronized).`);
