"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { readApplicationContractSource } = require("./read-application-contract-source");

const TEST_ROOT = path.resolve(__dirname, "..");
const APP_ROOT = process.env.APP_CONTRACT_ROOT
  ? path.resolve(process.env.APP_CONTRACT_ROOT)
  : TEST_ROOT;
const html = readApplicationContractSource(APP_ROOT);
const publicExercises = require(path.join(APP_ROOT, "research_database", "exports", "json", "exercise_database.json"));
const prescriptionApi = require(path.join(APP_ROOT, "prescription-engine.js"));
const exceptionApi = require(path.join(APP_ROOT, "exception-resolver.js"));
const backupContract = require(path.join(APP_ROOT, "backup-contract.js"));
const {
  BACKUP_BOUNDARIES,
  buildEntityCollectionCase,
  entityCollectionCases,
  jsonShapeCases,
  legacyState
} = require(path.join(TEST_ROOT, "tests", "fixtures", "synthetic-app-backups.js"));

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function functionSource(name) {
  const declarations = [];
  const pattern = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = pattern.exec(html))) declarations.push({ name: match[1], index: match.index });
  const index = declarations.findIndex((declaration) => declaration.name === name);
  assert.notEqual(index, -1, `Missing function ${name}`);
  const start = declarations[index].index;
  const end = declarations[index + 1]?.index || html.length;
  return html.slice(start, end);
}

function evaluateFunction(name, context = {}) {
  return vm.runInNewContext(`(${functionSource(name).trim()})`, context, { filename: `index.html#${name}` });
}

function firstFunctionName(candidates) {
  const name = candidates.find((candidate) => new RegExp(`(?:async\\s+)?function\\s+${candidate}\\s*\\(`).test(html));
  assert.ok(name, `Missing required production function; expected one of ${candidates.join(", ")}`);
  return name;
}

function plain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function collectAssertions(assertions) {
  const failures = [];
  for (const [label, assertion] of assertions) {
    try {
      assertion();
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
}

function assertContains(source, pattern, message) {
  assert.match(source, pattern, message);
}

function normalizeIdentity(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function publicResearchData() {
  const read = (name) => require(path.join(APP_ROOT, "research_database", "exports", "json", `${name}.json`));
  return {
    exerciseDatabase: publicExercises,
    exerciseMuscleMap: read("exercise_muscle_map"),
    exerciseSubstitutionMap: read("exercise_substitution_map"),
    muscleGroupRecommendations: read("muscle_group_recommendations"),
    progressionRules: read("progression_rules"),
    nutritionStrategies: read("nutrition_strategies"),
    manifest: read("manifest")
  };
}

test("safety substitution catalog identity uses an exact unambiguous public record", () => {
  const resolve = evaluateFunction("exactResearchCatalogIdentity", {
    normalizePrescriptionIdentity: (value) => String(value || "").toLowerCase().replace(/^ex_/, "").replace(/[^a-z0-9]+/g, " ").trim()
  });
  const catalog = [
    { exercise_id: "ex_barbell_bench_press", exercise_name: "Barbell Bench Press" },
    { exercise_id: "ex_cambered_barbell_bench_press", exercise_name: "Cambered Barbell Bench Press" }
  ];
  assert.equal(resolve("Cambered Barbell Bench Press", catalog), "ex_cambered_barbell_bench_press", "Exact catalog names must not collapse through broader aliases");
  assert.equal(resolve("camber bar bench press", catalog), null, "Aliases must not resolve a safety-locked UI choice");
  assert.equal(resolve("Barbell Bench Press", [...catalog, { exercise_id: "ex_duplicate", exercise_name: "barbell-bench press" }]), null, "Duplicate normalized catalog names must fail closed");
  const contextSource = functionSource("safetySubstituteContext");
  assert.doesNotMatch(contextSource, /equipmentCompatible|availableEquipment|configuredEquipment/, "Equipment metadata must not filter or block pain-free substitute logging");
  assert.doesNotMatch(contextSource, /rankExercisePool/, "Safety substitution eligibility must not discard evidence-linked alternatives merely because they fall outside a presentation ranking limit");
});

function deriveEngineSafetySubstitute(engine, blockedSnapshot, muscleGroupId, availableEquipment) {
  const originalExerciseId = blockedSnapshot.finalPrescription?.safetyRestriction?.originalExerciseId
    || blockedSnapshot.finalPrescription?.exerciseId
    || blockedSnapshot.exerciseId;
  const substitutionRows = engine.evidence.research.substitutionsByExercise.get(originalExerciseId) || [];
  const mappedIds = new Set(substitutionRows.map((item) => item.substitute_exercise_id || item.substituteExerciseId).filter(Boolean));
  assert.ok(mappedIds.size, `Public substitution evidence has no alternatives for ${originalExerciseId}`);
  const ranked = engine.rankExercisePool(muscleGroupId, { availableEquipment });
  const rankedById = new Map(ranked.candidates.map((candidate) => [candidate.exerciseId, candidate]));
  const preferred = blockedSnapshot.finalPrescription?.preferredReplacementExerciseId || null;
  if (preferred) assert.ok(mappedIds.has(preferred), `Engine preferred replacement ${preferred} is absent from its public substitution evidence`);
  const eligibleIds = [...mappedIds].filter((exerciseId) => (
    engine.evidence.research.exerciseById.has(exerciseId)
      && (availableEquipment.includes("all") || rankedById.has(exerciseId))
  ));
  assert.ok(eligibleIds.length, `No engine-confirmed, catalog-backed substitute satisfies the supplied equipment constraint for ${originalExerciseId}`);
  const candidateId = preferred && eligibleIds.includes(preferred)
    ? preferred
    : eligibleIds.find((exerciseId) => rankedById.has(exerciseId));
  assert.ok(candidateId, `Engine supplied neither a usable preferred replacement nor a ranked public substitute for ${originalExerciseId}`);
  const catalogRecord = engine.evidence.research.exerciseById.get(candidateId);
  const candidate = rankedById.get(candidateId) || {
    exerciseId: candidateId,
    researchExerciseId: candidateId,
    exerciseName: catalogRecord.exercise_name
  };
  assert.ok(mappedIds.has(candidate.exerciseId), "Selected safety substitute must come from the public substitution map");
  assert.ok(preferred === candidate.exerciseId || rankedById.has(candidate.exerciseId), "Selected safety substitute must be confirmed by the blocked engine output or its ranked pool");
  assert.ok(catalogRecord, "Engine-confirmed safety substitute must retain a public catalog record");
  return {
    originalExerciseId,
    candidate,
    catalogRecord,
    allowedSafetySubstituteIds: eligibleIds
  };
}

test("explicit safety adapter preserves recorded inputs without inventing detector evidence", () => {
  const source = functionSource("explicitSafetyCandidate");
  collectAssertions([
    ["explicit input only", () => assertContains(source, /if \(!recovery\.illness && !recovery\.pain\) return null/, "No recorded pain or illness must produce no safety candidate")],
    ["reason separation", () => assertContains(source, /recovery\.illness \? "explicit_illness" : "explicit_pain_or_injury"/, "Illness and pain must retain distinct recorded reason codes")],
    ["recorded provenance", () => assertContains(source, /provenance:\s*"recorded"/, "The safety candidate must identify direct user provenance")],
    ["note is not fatigue", () => assert.doesNotMatch(source, /fatigue|outsideBandNote|consecutiveLowReadinessDays|energyAvailabilityLow/, "A free-text note must not fabricate fatigue, persistence, or energy-availability evidence")],
    ["no normal target", () => assert.doesNotMatch(source, /\b(?:sets|reps|repRange|targetRpe|weight|load)\s*:/, "The safety adapter must not create a normal prescription")]
  ]);
});

test("explicit safety candidates are structural, deterministic, and do not erase loggable targets", () => {
  const candidateFor = evaluateFunction("explicitSafetyCandidate", {
    exceptionResolverApi: exceptionApi,
    cleanRecovery: (value) => ({ illness: false, pain: false, ...value }),
    isoNow: () => "2026-07-14T12:00:00.000Z",
    passedExceptionQualification: () => Object.fromEntries(exceptionApi.QUALIFICATION_FIELDS.map((field) => [field, true]))
  });
  assert.equal(candidateFor({ id: "session" }, {}), null, "No explicit safety input must remain silent");
  const illness = plain(candidateFor({ id: "session" }, { illness: true }));
  const pain = plain(candidateFor({ id: "session" }, { pain: true, affectedMuscle: "chest" }));
  for (const [candidate, reason] of [[illness, "explicit_illness"], [pain, "explicit_pain_or_injury"]]) {
    assert.equal(candidate.category, "pain_or_illness");
    assert.deepEqual(candidate.scope, { type: "session" });
    assert.equal(candidate.action.code, "stop_or_skip_work");
    assert.deepEqual(candidate.reasonCodes, [reason]);
    assert.equal(candidate.evidence[0].provenance, "recorded");
    for (const field of ["sets", "reps", "repRange", "targetRpe", "weight", "load"]) {
      assert.equal(candidate.action.parameters[field], undefined, `Safety candidate must not erase or replace loggable ${field}`);
    }
  }
});

test("workout mutation authorization stays fail-closed without treating safety actions as logging blocks", () => {
  const policyName = firstFunctionName([
    "workoutMutationSafetyDecision",
    "workoutSafetyMutationDecision",
    "workoutMutationSafetyPolicy"
  ]);
  const decide = evaluateFunction(policyName);
  const executableActions = [
    "add-exercise", "add-set", "add-warmup-set", "duplicate-set",
    "toggle-set", "toggle-skip-set", "start-timer"
  ];
  const decision = (action, recovery, exercise = null, exerciseMuscles = [], taxonomyResolved = true, authorization = { authorized: true, authorizationMode: "active_workout" }) => plain(decide(action, {
    authorization,
    recovery,
    exercise,
    exerciseMuscles,
    taxonomyResolved
  }));

  for (const action of executableActions) {
    assert.equal(decision(action, { illness: true, pain: false, affectedMuscle: "" })?.allowed, true, `Recorded illness must not prevent ${action}`);
    assert.equal(decision(action, { illness: false, pain: true, affectedMuscle: "" })?.allowed, true, `Recorded pain must not prevent ${action}`);
  }

  const chestPain = { illness: false, pain: true, affectedMuscle: "Chest" };
  assert.equal(
    decision("add-set", chestPain, { id: "bench", name: "Barbell Bench Press" }, ["Chest", "Triceps"], true)?.allowed,
    true,
    "A resolved safety action must still permit recording actual work for the named exercise"
  );
  const unauthorized = decision(
    "add-set",
    chestPain,
    { id: "bench", name: "Barbell Bench Press" },
    ["Chest"],
    true,
    { authorized: false, reason: "unauthorized_workout_target", message: "Synthetic authorization failure" }
  );
  assert.equal(unauthorized?.allowed, false, "A real authorization/data-integrity failure must remain fail-closed");
  assert.equal(unauthorized?.reason, "unauthorized_workout_target");
});

test("Lift render and mutation dispatch paths share authorization without disabling safety-action logging", () => {
  const guardPattern = /workoutMutationSafetyDecision|workoutSafetyMutationDecision|workoutMutationSafetyPolicy|assertWorkoutMutationAllowed|guardWorkoutMutation/;
  const renderSources = [functionSource("renderWorkout"), functionSource("renderExercise"), functionSource("renderSet")].join("\n");
  const namedMutators = ["addExercise", "addSet", "toggleSetCompletion", "toggleSetSkipped", "startTimer"];
  const clickStart = html.indexOf('root.addEventListener("click"');
  assert.notEqual(clickStart, -1, "Missing delegated Lift click handler");
  const clickEnd = html.indexOf('root.addEventListener("change"', clickStart);
  const clickHandler = html.slice(clickStart, clickEnd > clickStart ? clickEnd : clickStart + 40000);
  collectAssertions([
    ["authorization controls", () => assertContains(renderSources, guardPattern, "Lift controls must share the authorization policy used by mutations")],
    ["delegated event guard", () => assertContains(clickHandler, guardPattern, "Forged click events must be authorized before reaching Add Exercise/Set/Warm-up/Duplicate/toggle/timer handlers")],
    ...namedMutators.map((name) => [name, () => assertContains(functionSource(name), guardPattern, `${name} must independently enforce target authorization`)]),
    ["no safety disable copy", () => assert.doesNotMatch(renderSources, /blocked by the current workout safety restriction|data-safety-reason/, "A resolved safety action must not disable normal logging controls")],
    ["all mutation actions remain covered", () => executableMutationActions().forEach((action) => assertContains(clickHandler, new RegExp(`(?:action\\s*===\\s*["']${action}["']|["']${action}["'])`), `Missing ${action} mutation path`))]
  ]);
});

function executableMutationActions() {
  return ["add-exercise", "add-set", "add-warmup-set", "duplicate-set", "toggle-set", "toggle-skip-set", "start-timer"];
}

test("confirmed pain-free substitute stays distinct, catalog-backed, and auditable without equipment blocking", () => {
  const engine = prescriptionApi.createPrescriptionEngine({ researchData: publicResearchData() });
  const originalId = "ex_barbell_bench_press";
  const availableEquipment = ["all"];
  const blocked = engine.prescribeExercise({
    exerciseId: originalId,
    muscleGroupId: "chest",
    readiness: { pain: true, affectedMuscle: "chest" },
    availableEquipment,
    trainingGoal: "hypertrophy",
    experienceLevel: "intermediate",
    nutritionPhase: "maintenance",
    createdAt: "2026-07-14T12:00:00.000Z"
  });
  assert.equal(blocked.finalPrescription?.executionBlocked, true, "The real engine fixture must begin with a non-executable pain restriction");
  assert.equal(blocked.finalPrescription?.safetyRestriction?.status, "blocked", "The real engine fixture must expose a typed blocked safety restriction");
  const derived = deriveEngineSafetySubstitute(engine, blocked, "chest", availableEquipment);
  const substituteId = derived.candidate.exerciseId;
  const substituteResearchId = derived.candidate.researchExerciseId || substituteId;
  if (blocked.finalPrescription.preferredReplacementExerciseId) {
    assert.equal(substituteId, blocked.finalPrescription.preferredReplacementExerciseId, "The test must exercise the engine's preferred safe replacement when one is emitted");
  }
  assert.ok(derived.allowedSafetySubstituteIds.includes(substituteId), "The selected substitute must belong to the engine-derived eligible substitution set");
  const options = {
    allowedSafetySubstituteIds: derived.allowedSafetySubstituteIds,
    exerciseCatalog: [derived.catalogRecord],
    createdAt: "2026-07-14T12:05:00.000Z"
  };
  const substitute = { exerciseId: substituteId, researchExerciseId: substituteResearchId, reason: "Synthetic pain-free alternative" };

  assert.throws(
    () => engine.applyManualOverride(blocked, substitute, options),
    /pain-free confirmation|painFreeConfirmed/i,
    "A substitute without explicit painFreeConfirmed=true must remain blocked"
  );
  assert.throws(
    () => engine.applyManualOverride(blocked, { ...substitute, exerciseId: originalId, researchExerciseId: originalId, painFreeConfirmed: true }, options),
    /allowed|different exercise|painful original/i,
    "The painful original cannot be re-labelled as its own safe alternative"
  );
  const resolved = engine.applyManualOverride(blocked, { ...substitute, painFreeConfirmed: true }, options);
  assert.equal(blocked.finalPrescription.executionBlocked, true, "Resolving an alternative must not mutate the original blocked snapshot");
  assert.equal(blocked.finalPrescription.exerciseId, originalId, "The original blocked identity must remain unchanged");
  assert.equal(resolved.finalPrescription.executionBlocked, false, "Only the validated substitute may become executable");
  assert.equal(resolved.finalPrescription.exerciseId, substituteId);
  assert.equal(resolved.finalPrescription.safetyRestriction.originalExerciseId, originalId);
  assert.equal(resolved.finalPrescription.safetyRestriction.painFreeConfirmed, true);
  assert.equal(resolved.manualOverrides.at(-1)?.previousFinalPrescription?.executionBlocked, true, "Override lineage must retain the prior non-executable prescription");
  assert.equal(resolved.manualOverrides.at(-1)?.previousFinalPrescription?.exerciseId, originalId, "Override lineage must retain the painful original identity");

  const foundation = fs.readFileSync(path.join(APP_ROOT, "app-foundation.js"), "utf8");
  const workout = fs.readFileSync(path.join(APP_ROOT, "app-workout.js"), "utf8");
  const startTemplate = workout.slice(workout.indexOf("function startTemplate("), workout.indexOf("function addSet(", workout.indexOf("function startTemplate(")));
  collectAssertions([
    ["legacy frontend override removed", () => assert.doesNotMatch(html, /function applyPrescriptionOverride\(/, "The frontend must not recreate the deleted engine manual-override path")],
    ["explicit safety candidate", () => assertContains(foundation, /function explicitSafetyCandidate\([\s\S]*explicitSafetyInput:\s*true/, "Recorded pain or illness must enter the canonical resolver as an explicit safety candidate")],
    ["canonical handling audit", () => assertContains(foundation, /function resolveWorkoutExceptions\([\s\S]*applyDecisionHandling\(decision, handling\)/, "The user's decision after a safety action must remain auditable on the resolved action")],
    ["logging remains available", () => {
      assertContains(startTemplate, /session\.resolvedActions = [\s\S]{0,160}resolveWorkoutExceptions\(/, "A safety action must be persisted before constructing the logger");
      assertContains(startTemplate, /exercises\.push\(exercise\)/, "A safety action must not prevent creation of the actual exercise row");
      assertContains(startTemplate, /sets\.push\(createSet\(/, "A safety action must not prevent creation of actual-work set rows");
    }],
    ["equipment restrictions removed", () => assert.doesNotMatch(startTemplate, /availableEquipment|equipmentCompatible|configuredEquipment/, "The current logger must not restore deleted equipment blocking")],
    ["canonical action identity", () => assertContains(startTemplate, /resolvedActionId:\s*resolvedAction\?\.decisionId/, "The active exercise must retain the canonical safety-decision identity")]
  ]);
});

test("legacy engine hard-constraint outputs cannot re-enter current workout construction", () => {
  const engine = prescriptionApi.createPrescriptionEngine({ researchData: publicResearchData() });
  const baseRequest = {
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "chest",
    availableEquipment: ["all"],
    trainingGoal: "hypertrophy",
    experienceLevel: "intermediate",
    nutritionPhase: "maintenance",
    createdAt: "2026-07-14T12:00:00.000Z"
  };
  assert.throws(
    () => engine.prescribeExercise({ ...baseRequest, excludedExerciseIds: [baseRequest.exerciseId] }),
    /excluded/i,
    "The isolated legacy engine boundary must retain its typed exclusion behavior for historical compatibility"
  );
  const start = functionSource("startTemplate");
  assert.doesNotMatch(start, /prescribeExercise|unifiedPrescriptionSnapshot|coachTargetForTemplateExercise|legacyTargetFromSnapshot/, "Current workout construction must not consume legacy engine prescriptions or their fallback path");
  assert.match(start, /stableTargetForTemplateExercise\(/, "Current workout construction must use the stable variant target");
  assert.match(start, /resolveWorkoutExceptions\(/, "Current workout construction must obtain visible exceptions only from the canonical resolver");
});

test("invalid reconciled custom exercise identity fails closed without an executable research identity", () => {
  const invalidId = "custom_conflicting_press";
  const evidence = prescriptionApi.normalizeEvidenceBundle({
    researchData: publicResearchData(),
    personalData: {
      exerciseScores: [{
        exercise_id: invalidId,
        exercise_name: "Conflicting Garage Press",
        research_exercise_id: "ex_barbell_bench_press"
      }],
      exercisePrescriptions: [{
        exercise_id: invalidId,
        exercise_name: "Conflicting Garage Press",
        research_exercise_id: "ex_incline_dumbbell_press",
        muscle_group_id: "chest"
      }],
      exerciseMuscleScores: [{
        exercise_id: invalidId,
        exercise_name: "Conflicting Garage Press",
        research_exercise_id: "ex_barbell_bench_press",
        muscle_group: "chest"
      }]
    }
  });
  const reconciled = evidence.personal.reconciledIdentityByExerciseId?.get(invalidId);
  assert.equal(reconciled?.invalid, true, "The fixture must be invalidated by the real evidence reconciler");
  assert.equal(reconciled?.researchExerciseId, null, "A real reconciled conflict must not retain either contradictory research ID");
  const realEngine = prescriptionApi.createPrescriptionEngine(evidence);
  const context = {
    prescriptionEngine: realEngine,
    prescriptionIdentityCacheEngine: null,
    prescriptionIdentityCacheResolver: null,
    prescriptionIdentityResolutionCache: new Map(),
    normalizePrescriptionIdentity: normalizeIdentity
  };
  context.personalExerciseRecordForName = evaluateFunction("personalExerciseRecordForName", context);
  context.resolvePrescriptionExerciseIdentity = evaluateFunction("resolvePrescriptionExerciseIdentity", context);
  const resolveProfile = evaluateFunction("resolveExerciseIdentityProfile", context);
  const resolved = plain(resolveProfile("Conflicting Garage Press"));
  assert.equal(resolved.status, "unresolved", "An invalid reconciled identity must fail closed instead of re-entering the custom exercise path");
  assert.equal(resolved.researchExerciseId, null, "Invalid reconciliation must never retain a contradictory research ID");
  assert.equal(resolved.performanceExerciseId, invalidId, "Failing closed must preserve the historical performance namespace for audit without making it executable");
  assert.equal(resolved.reason, "invalid_reconciled_identity");
});

test("stable template targets remain authoritative while canonical actions are prospective", () => {
  const start = functionSource("startTemplate");
  const resistanceFallbacks = start.match(/resistanceType\s*:\s*target\.resistanceType\s*\|\|\s*templateResistanceType/g) || [];
  collectAssertions([
    ["stable target", () => assertContains(start, /stableTargetForTemplateExercise\(templateExercise,/, "The routine variant must provide the normal set/rep/RPE/rest target")],
    ["canonical action", () => assertContains(start, /resolvedActionForVariant\(session\.resolvedActions, exerciseVariantId\)[\s\S]*applyResolvedActionToStableTarget\(historyTarget, resolvedAction\)/, "Only a canonical resolved action may prospectively adjust the stable target")],
    ["stable snapshot", () => assertContains(start, /stableTargetSnapshot:[\s\S]*resolvedActionId:/, "The active exercise must preserve the unmodified target facts and applied decision identity")],
    ["no normal engine target", () => assert.doesNotMatch(start, /prescribeExercise|unifiedPrescriptionSnapshot|coachTargetForTemplateExercise/, "The normal start path must not ask a recommendation engine to create a second prescription")],
    ["equipment constraint removed", () => assert.doesNotMatch(start, /\bavailableEquipment\b|equipmentCompatible|configuredEquipment/, "The normal workout path must not receive deleted equipment constraints")],
    ["exercise/set resistance fallback", () => assert.ok(resistanceFallbacks.length >= 2, `Started exercises and generated sets must retain template resistance when an engine target omits it; found ${resistanceFallbacks.length} guarded assignment(s)`)]
  ]);
});

test("template start resolves one resistance type for the exercise, warm-ups, and every working set", () => {
  let committed = null;
  let nextId = 0;
  const context = {
    data: {
      templates: [{
        id: "template-1",
        name: "Synthetic template",
        exercises: [{
          id: "template-exercise-1", name: "Synthetic press", resistanceType: "cable",
          primaryMuscle: "Chest", secondaryMuscle: "Triceps", restSeconds: 90,
          warmups: [{ id: "warmup-1", reps: 10, weight: 10 }]
        }]
      }],
      sessions: [], exercises: [], sets: [], mesocycles: [], settings: { weightUnit: "lb" }
    },
    defaultRecovery: () => ({}),
    hasActiveWorkout: () => false,
    activeSession: () => null,
    todayIso: () => "2026-07-14",
    isSessionSubmitted: () => false,
    cleanRecovery: (value) => value,
    createSession: () => ({ id: "session-1", date: "2026-07-14", title: "Synthetic template" }),
    measurePerformance: (_label, operation) => operation(),
    resolveWorkoutExceptions: () => [],
    inferResistanceType: () => "cable",
    stableTargetForTemplateExercise: () => ({
      sets: 2, reps: 8, repLow: 6, repHigh: 10, weight: 40, weightUnit: "lb", rpe: 8,
      restSeconds: 90, mode: "stable-target", confidence: "medium", reason: "Synthetic target",
      adjusted: false, triggerLabels: [], recommendationSnapshot: null
    }),
    isBodyweightResistance: () => false,
    recommendedRestSeconds: () => 90,
    resolvedActionForVariant: () => null,
    applyResolvedActionToStableTarget: (target) => ({ ...target, resistanceType: undefined }),
    normalizeStableTemplateExercise: (exercise) => ({
      ...exercise,
      sets: 2,
      reps: 8,
      repMin: 6,
      repMax: 10,
      targetRpe: 8,
      restSeconds: 90,
      setTypes: [{ id: "straight-1", type: "straight", setCount: 2, repMin: 6, repMax: 10, rpeMin: 7, rpeMax: 8, restSeconds: 90, countsTowardScore: true, countsTowardVolume: true }]
    }),
    canonicalExerciseId: () => "synthetic_press",
    unifiedTargetContext: () => null,
    exerciseTargetContext: () => ({ setTypes: [] }),
    resolvedSetTypesForPrescription: () => [{
      id: "straight-1", type: "straight", setCount: 2, repMin: 6, repMax: 10,
      rpeMin: 7, rpeMax: 8, restSeconds: 90, countsTowardScore: true, countsTowardVolume: true
    }],
    id: () => `generated-${++nextId}`,
    getMostRecentWorkoutSets: () => [],
    setPrescriptionForRole: ({ setType, setTypeIndex, sequenceIndex }) => ({
      setType: "straight", setTypeIndex, sequenceIndex, targetReps: 8, targetLoad: 40,
      repMin: 6, repMax: 10, rpeMin: 7, rpeMax: 8, restSeconds: setType.restSeconds,
      reason: "Synthetic role", previousComparableSet: null
    }),
    validateGeneratedSetPrescriptions: (items) => items,
    normalizeSetTypeCode: (value) => value || "straight",
    setTypeLabels: { straight: "Working set" },
    createSet: (exerciseId, setNumber, source) => ({ id: `set-${setNumber}-${nextId}`, exerciseId, setNumber, ...source }),
    currentMesocycle: () => null,
    prescriptionApi: { PRESCRIPTION_SCHEMA_VERSION: "exercise-prescription/2.0.0" },
    prescriptionEvidenceStatus: { personalVersion: "synthetic", researchVersion: "synthetic" },
    isoNow: () => "2026-07-14T12:00:00.000Z",
    setActiveTab: () => {},
    canonicalSetSequence: (set) => Number(set.sequenceIndex || 0),
    commit: (model) => { committed = plain(model); },
    activeSessionId: "",
    activeWorkoutId: "",
    viewingHistorySessionId: "",
    templateStartFlow: null,
    activeSetId: "",
    activeSetAcknowledged: false,
    activeSetNotice: ""
  };
  const startTemplate = evaluateFunction("startTemplate", context);
  startTemplate("template-1", {}, "usual");
  const exercise = committed?.exercises?.find((item) => item.sessionId === "session-1");
  const generatedSets = committed?.sets?.filter((item) => item.exerciseId === exercise?.id) || [];
  assert.equal(exercise?.resistanceType, "cable", "The started exercise must fall back to the resolved template resistance type");
  assert.equal(generatedSets.length, 3, "The synthetic template should generate one warm-up and two working sets");
  generatedSets.forEach((set) => assert.equal(set.resistanceType, "cable", `Generated set ${set.id} lost the resolved resistance type`));
});

test("canonical resolver invocation forwards only structural candidates and prior decisions", () => {
  const resolver = functionSource("resolveWorkoutExceptions");
  const safetyCandidate = functionSource("explicitSafetyCandidate");
  collectAssertions([
    ["candidate list", () => assertContains(resolver, /candidates:\s*safetyCandidate \? \[safetyCandidate\] : \[\]/, "The resolver boundary must receive normalized candidates, not screen copy")],
    ["prior decisions", () => assertContains(resolver, /priorDecisions:\s*Array\.isArray\(session\.resolvedActions\)/, "Reevaluation must preserve the prior canonical decision chain")],
    ["explicit observation", () => assertContains(resolver, /explicitSafetyObservation:\s*safetyCandidate \?/, "The deterministic safety fallback must stay inside the canonical resolver boundary")],
    ["auditable handling", () => assertContains(resolver, /applyDecisionHandling\(decision, handling\)/, "Explicit user handling must be persisted structurally")],
    ["no program-profile inputs", () => assert.doesNotMatch(`${resolver}\n${safetyCandidate}`, /trainingGoal|nutritionPhase|experienceLevel|availableEquipment|plannedWorkingSets|sessionDurationMinutes|includedMuscleGroupIds|excludedExerciseIds/, "The canonical safety path must not recreate the deleted program-prescription request")],
    ["no exact normal target", () => assert.doesNotMatch(`${resolver}\n${safetyCandidate}`, /\b(?:sets|reps|repRange|targetRpe|weight|load)\s*:/, "The canonical safety path must not create exact normal targets")]
  ]);
});

test("settings use separate canonical training, nutrition, and experience fields with legacy migration", () => {
  const defaultsStart = html.indexOf("const defaultSettings");
  assert.notEqual(defaultsStart, -1, "Missing defaultSettings");
  const defaults = html.slice(defaultsStart, defaultsStart + 3500);
  const normalize = functionSource("normalizeLoadedData");
  const resolver = functionSource("resolveWorkoutExceptions");
  collectAssertions([
    ["canonical defaults", () => {
      assertContains(defaults, /trainingGoal\s*:/, "Settings need a canonical trainingGoal");
      assertContains(defaults, /nutritionPhase\s*:/, "Settings need a separate nutritionPhase");
      assertContains(defaults, /experienceLevel\s*:/, "Settings need a canonical experienceLevel");
    }],
    ["canonical persistence", () => {
      assertContains(normalize, /trainingGoal\s*:/, "Loaded settings must preserve trainingGoal");
      assertContains(normalize, /nutritionPhase\s*:/, "Loaded settings must preserve nutritionPhase");
      assertContains(normalize, /experienceLevel\s*:/, "Loaded settings must preserve experienceLevel");
    }],
    ["legacy migration", () => {
      assertContains(normalize, /(?:migrate|legacy)[\s\S]{0,900}(?:storedSettings\.)?goal/i, "Legacy overloaded goal values need an explicit migration");
      assertContains(normalize, /(?:migrate|legacy)[\s\S]{0,900}(?:storedSettings\.)?trainingStatus/i, "Legacy trainingStatus needs an explicit experience migration");
    }],
    ["exception resolver stays independent", () => {
      assert.doesNotMatch(resolver, /trainingGoal|nutritionPhase|experienceLevel/, "Stored planning preferences must not become hidden inputs to the canonical exception resolver");
    }]
  ]);
});

test("legacy cut settings migrate at runtime without inheriting the hypertrophy default", () => {
  const normalizeLoadedData = evaluateFunction("normalizeLoadedData", {
    defaultSettings: {
      weightUnit: "lb",
      goal: "hypertrophy",
      trainingStatus: "intermediate",
      trainingGoal: "hypertrophy",
      nutritionPhase: "maintenance",
      experienceLevel: "intermediate",
      readinessBaseline: {}
    },
    cleanReadinessBaseline: (value) => value || {},
    cleanRecovery: (value) => value || {},
    isBodyweightExerciseName: () => false,
    inferResistanceType: (_name, source) => source?.resistanceType || "external",
    isBodyweightResistance: () => false,
    normalizeResistanceSet: (set, resistanceType) => ({ ...set, resistanceType }),
    resistanceTypeValues: ["external", "bodyweight", "cable"],
    normalizeTargetSetType: (value) => value,
    normalizeStableTemplateExercise: (value) => value,
    isoNow: () => "2026-07-14T12:00:00.000Z",
    migrateDomainData: (model) => model
  });
  const migrated = plain(normalizeLoadedData(legacyState()));
  collectAssertions([
    ["training goal", () => assert.equal(migrated.settings.trainingGoal, "general_fitness", "Legacy goal=cut must resolve to a neutral training goal")],
    ["nutrition phase", () => assert.equal(migrated.settings.nutritionPhase, "deficit", "Legacy goal=cut must preserve the nutrition meaning")],
    ["experience", () => assert.equal(migrated.settings.experienceLevel, "novice", "Legacy trainingStatus must migrate to experienceLevel")],
    ["no inherited hypertrophy", () => assert.notEqual(migrated.settings.trainingGoal, "hypertrophy", "A missing legacy training goal must not inherit the new hypertrophy default")],
    ["legacy goal removed", () => assert.equal(migrated.settings.goal, undefined, "The overloaded legacy goal must stop being authoritative")],
    ["legacy status removed", () => assert.equal(migrated.settings.trainingStatus, undefined, "The legacy training status must stop being authoritative")]
  ]);
});

test("canonical exercise and taxonomy resolution are registry-first and exhaustive", () => {
  const evidence = prescriptionApi.normalizeEvidenceBundle({ researchData: publicResearchData() });
  const unresolved = [];
  for (const exercise of publicExercises) {
    const names = [exercise.exercise_name, ...String(exercise.exercise_aliases || "").split("|").filter(Boolean)];
    for (const name of names) {
      const resolved = evidence.research.exerciseIdByAlias.get(normalizeIdentity(name));
      if (resolved !== exercise.exercise_id) unresolved.push(`${name} -> ${resolved || "unresolved"}; expected ${exercise.exercise_id}`);
    }
  }
  assert.deepEqual(unresolved, [], `Public canonical names/aliases failed resolution:\n${unresolved.join("\n")}`);

  const canonical = functionSource("canonicalExerciseId");
  const muscles = functionSource("musclesForExercise");
  collectAssertions([
    ["no regex-only canonical fallback", () => assert.doesNotMatch(canonical, /return\s+researchId\s*\|\|\s*normalized/, "Known public exercises must resolve through a canonical registry instead of becoming regex-normalized pseudo IDs")],
    ["canonical identity gates analytics", () => assertContains(muscles, /canonicalExerciseId\s*\(/, "Analytics must identify canonical exercises before considering a custom-exercise regex fallback")],
    ["regex fallback is custom-only", () => assertContains(muscles, /(?:custom|uncatalogued|unmapped)[\s\S]{0,240}automaticMusclesForName|automaticMusclesForName[\s\S]{0,240}(?:custom|uncatalogued|unmapped)/i, "Regex muscle inference must be explicitly limited to custom or unmapped exercises")]
  ]);
});

test("frontend identity resolution prefers the public alias registry and namespaces uncatalogued exercises", () => {
  const evidence = prescriptionApi.normalizeEvidenceBundle({
    researchData: publicResearchData(),
    personalData: {
      exerciseScores: [
        { exercise_id: "custom_spoofed_bench", exercise_name: "Bench Press" },
        { exercise_id: "custom_my_press", exercise_name: "My Garage Press" }
      ]
    }
  });
  const context = {
    prescriptionEngine: prescriptionApi.createPrescriptionEngine(evidence),
    prescriptionIdentityCacheEngine: null,
    prescriptionIdentityCacheResolver: null,
    prescriptionIdentityResolutionCache: new Map()
  };
  context.normalizePrescriptionIdentity = evaluateFunction("normalizePrescriptionIdentity", context);
  context.personalExerciseRecordForName = evaluateFunction("personalExerciseRecordForName", context);
  context.resolvePrescriptionExerciseIdentity = evaluateFunction("resolvePrescriptionExerciseIdentity", context);
  context.resolveExerciseIdentityProfile = evaluateFunction("resolveExerciseIdentityProfile", context);
  const bench = plain(context.resolveExerciseIdentityProfile("Bench Press"));
  const custom = plain(context.resolveExerciseIdentityProfile("My Garage Press"));
  assert.equal(bench.researchExerciseId, "ex_barbell_bench_press", "A custom name collision must not shadow the public registry");
  assert.notEqual(bench.performanceExerciseId, "custom_spoofed_bench", "The spoofed personal record must not own the public alias performance namespace");
  assert.equal(custom.performanceExerciseId, "custom_my_press", "A trusted custom identity must remain in its custom namespace");
  assert.equal(custom.researchExerciseId, null);

  const canonicalId = evaluateFunction("canonicalExerciseId", context);
  assert.equal(canonicalId("Barbell Bench Press"), "ex_barbell_bench_press");
  assert.match(canonicalId("Uncatalogued Garage Press"), /^custom(?::|_)/, "An uncatalogued name must not become an unnamespaced pseudo-canonical ID");
});

test("exact personal variations retain performance history identity while sharing research taxonomy", () => {
  const personalData = {
    exerciseScores: [
      { exercise_id: "double_pulley_lat_pulldown", exercise_name: "Lat Pulldown Double Pulley", research_exercise_id: "ex_lat_pulldown" },
      { exercise_id: "chest_assisted_row", exercise_name: "Chest Assisted Row" },
      { exercise_id: "custom_spoofed_bench", exercise_name: "Bench Press" }
    ],
    exercisePrescriptions: [
      { exercise_id: "double_pulley_lat_pulldown", exercise_name: "Lat Pulldown Double Pulley", research_exercise_id: "ex_lat_pulldown", muscle_group_id: "mg_latissimus_dorsi" },
      { exercise_id: "chest_assisted_row", exercise_name: "Chest Assisted Row", muscle_group_id: "mg_upper_back" },
      { exercise_id: "custom_spoofed_bench", exercise_name: "Bench Press", muscle_group_id: "mg_pectoralis_major_sternal" }
    ],
    exerciseMuscleScores: [
      { exercise_id: "double_pulley_lat_pulldown", exercise_name: "Lat Pulldown Double Pulley", research_exercise_id: "ex_lat_pulldown", muscle_group_id: "mg_latissimus_dorsi" },
      { exercise_id: "chest_assisted_row", exercise_name: "Chest Assisted Row", muscle_group_id: "mg_upper_back" },
      { exercise_id: "custom_spoofed_bench", exercise_name: "Bench Press", muscle_group_id: "mg_pectoralis_major_sternal" }
    ]
  };
  const evidence = prescriptionApi.normalizeEvidenceBundle({ researchData: publicResearchData(), personalData });
  const context = {
    prescriptionEngine: prescriptionApi.createPrescriptionEngine(evidence),
    prescriptionIdentityCacheEngine: null,
    prescriptionIdentityCacheResolver: null,
    prescriptionIdentityResolutionCache: new Map()
  };
  context.normalizePrescriptionIdentity = evaluateFunction("normalizePrescriptionIdentity", context);
  context.personalExerciseRecordForName = evaluateFunction("personalExerciseRecordForName", context);
  context.resolvePrescriptionExerciseIdentity = evaluateFunction("resolvePrescriptionExerciseIdentity", context);
  context.resolveExerciseIdentityProfile = evaluateFunction("resolveExerciseIdentityProfile", context);
  const canonicalExerciseId = evaluateFunction("canonicalExerciseId", context);

  const doublePulley = plain(context.resolveExerciseIdentityProfile("Lat Pulldown Double Pulley"));
  const chestRow = plain(context.resolveExerciseIdentityProfile("Chest Assisted Row"));
  assert.equal(doublePulley.performanceExerciseId, "double_pulley_lat_pulldown");
  assert.equal(doublePulley.researchExerciseId, "ex_lat_pulldown");
  assert.equal(doublePulley.executable, true);
  assert.equal(chestRow.performanceExerciseId, "chest_assisted_row");
  assert.equal(chestRow.researchExerciseId, null);
  assert.equal(chestRow.executable, true, "A reconciled legacy personal ID must not be rejected only because it lacks a custom_ prefix");
  assert.equal(canonicalExerciseId("Lat Pulldown Double Pulley"), "double_pulley_lat_pulldown");
  assert.equal(canonicalExerciseId("Lat Pulldown"), "ex_lat_pulldown");
  assert.equal(canonicalExerciseId("Bench Press"), "alias_bench_press", "A personal name collision must not shadow an authoritative public alias or its exact performance-history namespace");
  assert.notEqual(canonicalExerciseId("Lat Pulldown Double Pulley"), canonicalExerciseId("Lat Pulldown"), "Different machine variations must not share load history");
});

test("backup import is bounded, allowlisted, and hostile-field safe", () => {
  const importSource = functionSource("importDataFile");
  const validatorMatch = html.match(/(?:function\s+(?:validate|sanitize|parse)(?:Backup|Imported|AppData)\w*\s*\([^)]*\)\s*\{|const\s+(?:validate|sanitize|parse)(?:Backup|Imported|AppData)\w*\s*=)/i);
  const validator = validatorMatch ? html.slice(validatorMatch.index, validatorMatch.index + 8000) : "";
  collectAssertions([
    ["file-size limit", () => assertContains(importSource, /file\.size[\s\S]{0,160}(?:MAX|LIMIT|\d{5,})|(?:MAX|LIMIT|\d{5,})[\s\S]{0,160}file\.size/, "Backup import must reject oversized files before reading them")],
    ["strict validator", () => assert.ok(validatorMatch, "Backup JSON must pass a dedicated strict validator before normalization")],
    ["validator is called", () => assertContains(importSource, /(?:validate|sanitize|parse)(?:Backup|Imported|AppData)\w*\s*\(\s*imported/i, "Import must call the strict backup validator")],
    ["no wholesale object spread", () => assert.doesNotMatch(importSource, /normalizeLoadedData\s*\(\s*\{[\s\S]{0,120}\.\.\.imported/, "Untrusted backup fields must not be spread wholesale into application state")],
    ["ID validation", () => assertContains(validator, /(?:ID_PATTERN|VALID_ID|validateId|safeId|invalid id)/i, "Session, exercise, set, and template IDs require a strict validation rule")],
    ["field allowlists", () => assertContains(validator, /(?:allowed|allowlist|permitted)[A-Za-z]*(?:Fields|Keys)|(?:Fields|Keys)[A-Za-z]*(?:allowed|allowlist|permitted)/i, "Imported entity fields must be allowlisted")],
    ["executable/prototype fields rejected", () => assertContains(validator, /__proto__|prototype|constructor|\^on|startsWith\(["']on/i, "Executable on* attributes and prototype-pollution fields must be rejected")],
    ["bounded collections", () => assertContains(validator, /MAX_(?:SESSIONS|EXERCISES|SETS|TEMPLATES)|(?:sessions|exercises|sets|templates)\.length[\s\S]{0,100}(?:MAX|LIMIT)/i, "Backup entity counts require explicit bounds")],
    ["duplicate rejection", () => assertContains(validator, /duplicate|seenIds|\.has\s*\([^)]*\.id/i, "Duplicate entity IDs must be rejected")],
    ["referential integrity", () => assertContains(validator, /orphan|sessionIds|exerciseIds|reference/i, "Orphaned exercise, set, and active-plan references must be rejected")],
    ["versioned legacy migration", () => assertContains(validator, /appDataVersion[\s\S]{0,500}(?:legacy|migrat|version)/i, "Supported legacy backups need an explicit versioned migration path")]
  ]);
});

test("backup revision metadata is bounded and rebased while template numbers share one finite domain", () => {
  const limits = {
    maxJsonDepth: BACKUP_BOUNDARIES.jsonDepth,
    maxObjectKeys: BACKUP_BOUNDARIES.objectKeys,
    maxSessions: BACKUP_BOUNDARIES.sessions,
    maxExercises: BACKUP_BOUNDARIES.exercises,
    maxSets: BACKUP_BOUNDARIES.sets,
    maxTemplates: BACKUP_BOUNDARIES.templates,
    maxFileBytes: BACKUP_BOUNDARIES.fileBytes
  };
  const validate = evaluateFunction("validateImportedAppData", {
    BACKUP_IMPORT_LIMITS: limits,
    validateBackupJsonShape: () => true,
    TextEncoder
  });
  const backup = (overrides = {}) => ({
    appDataVersion: 2,
    sessions: [],
    exercises: [],
    sets: [],
    templates: [],
    settings: {},
    ...overrides
  });

  for (const revision of [undefined, 0, Number.MAX_SAFE_INTEGER]) {
    const candidate = backup(revision === undefined ? {} : { dataRevision: revision });
    assert.equal(validate(candidate, limits).dataRevision, 0, "Imported ordering metadata must never become local ordering authority");
  }
  for (const revision of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "7"]) {
    assert.throws(() => validate(backup({ dataRevision: revision }), limits), /dataRevision|safe integer/i);
  }

  const templateExercise = {
    id: "template-exercise-1",
    name: "Barbell Bench Press",
    sets: 3,
    reps: 8,
    targetRpe: 8,
    increment: 2.5,
    restSeconds: 120
  };
  const withTemplateValue = (field, value) => backup({
    templates: [{ id: "template-1", name: "Upper", exercises: [{ ...templateExercise, [field]: value }] }]
  });
  const invalidTemplateValues = [
    ["sets", ""],
    ["sets", -1],
    ["sets", 1.5],
    ["reps", "NaN"],
    ["targetRpe", "Infinity"],
    ["increment", Number.MAX_VALUE],
    ["restSeconds", 16]
  ];
  invalidTemplateValues.forEach(([field, value]) => {
    assert.throws(() => validate(withTemplateValue(field, value), limits), /Template .* between|increment/i, `${field}=${String(value)} must be rejected at import`);
  });
  const canonical = validate(withTemplateValue("sets", "4"), limits);
  assert.equal(canonical.templates[0].exercises[0].sets, 4, "A valid numeric backup value must be canonicalized to a number");

  const validSet = { id: "set-1", exerciseId: "exercise-1", setNumber: 1, sequenceIndex: 0, reps: 8, weight: 100, rpe: 8 };
  const withSetValue = (field, value) => backup({
    sessions: [{ id: "session-1" }],
    exercises: [{ id: "exercise-1", sessionId: "session-1" }],
    sets: [{ ...validSet, [field]: value }]
  });
  for (const [field, value] of [["reps", -1], ["reps", 1.5], ["weight", -0.5], ["rpe", 10.5], ["rpe", 7.25], ["durationSeconds", 1.5], ["targetRestSeconds", 3601], ["classificationConfidence", 1.1], ["classifierVersion", 0]]) {
    assert.throws(() => validate(withSetValue(field, value), limits), new RegExp(`Set 1 ${field}|between`, "i"), `${field}=${value} must be rejected at import`);
  }
  assert.throws(() => validate(backup({
    sessions: [{ id: "session-1" }],
    exercises: [{ id: "exercise-1", sessionId: "session-1" }],
    sets: [{ ...validSet, targetRepMin: 12, targetRepMax: 8 }]
  }), limits), /target rep minimum/i);

  const withBaselineValue = (field, value) => backup({ settings: { readinessBaseline: { [field]: value } } });
  for (const [field, value] of [["sleepHours", 14.25], ["sleepHours", 7.6], ["sleepQuality", 0], ["sleepQuality", 2.5], ["hrv", -1], ["restingHr", 60.5], ["soreness", 6], ["band", 2], ["band", 8.5]]) {
    assert.throws(() => validate(withBaselineValue(field, value), limits), new RegExp(`readinessBaseline ${field}|between`, "i"), `readinessBaseline.${field}=${value} must be rejected at import`);
  }
  assert.doesNotThrow(() => validate(backup({ settings: { readinessBaseline: { sleepHours: "7.5", sleepQuality: "4", hrv: "", restingHr: 60, soreness: 2, band: 8 } } }), limits));
  const strongRawImport = { id: "strong-source-1", source: "strong", importedAt: "2026-07-21T12:00:00.000Z", originalText: "synthetic Strong CSV", weightUnit: "lb", sessionExternalIds: [] };
  assert.equal(validate(backup({ rawImports: [strongRawImport] }), limits).rawImports[0].weightUnit, "lb", "Strong raw-source unit provenance must survive backup validation");
  assert.throws(() => validate(backup({ rawImports: [{ ...strongRawImport, weightUnit: "stone" }] }), limits), /weightUnit must be lb or kg/i, "Unknown Strong source units must fail backup validation");

  const numericFields = {
    "template-exercise-sets": { field: "sets", min: 1, max: 100, step: 1, integer: true, label: "sets" },
    "template-exercise-reps": { field: "reps", min: 1, max: 1000, step: 1, integer: true, label: "reps" },
    "template-exercise-rpe": { field: "targetRpe", min: 5, max: 10, step: 0.5, integer: false, label: "RPE" },
    "template-exercise-increment": { field: "increment", min: 0.5, max: 10000, step: 0.5, integer: false, label: "increment" },
    "template-exercise-rest": { field: "restSeconds", min: 15, max: 3600, step: 15, integer: true, label: "rest" }
  };
  const valueIsValid = evaluateFunction("templateNumericValueIsValid");
  assert.equal(valueIsValid("", numericFields["template-exercise-sets"]), false);
  assert.equal(valueIsValid("-1", numericFields["template-exercise-sets"]), false);
  assert.equal(valueIsValid("1.5", numericFields["template-exercise-sets"]), false);
  assert.equal(valueIsValid("NaN", numericFields["template-exercise-reps"]), false);
  assert.equal(valueIsValid("Infinity", numericFields["template-exercise-rpe"]), false);
  assert.equal(valueIsValid(String(Number.MAX_VALUE), numericFields["template-exercise-increment"]), false);
  const assertNumericDomain = evaluateFunction("assertTemplateExerciseNumericDomain", { templateNumericFields: numericFields });
  assert.throws(() => assertNumericDomain({ sets: 1.5 }), /Template sets/);
  assert.throws(() => assertNumericDomain({ restSeconds: 16 }), /Template rest/);
  assert.doesNotThrow(() => assertNumericDomain({ sets: 4, reps: 12, targetRpe: 8.5, increment: 2.5, restSeconds: 150 }));

  const nextFrom = (dataRevision) => evaluateFunction("nextMonotonicImportRevision", { data: { dataRevision } })();
  assert.equal(nextFrom(0), 1);
  assert.equal(nextFrom(41), 42);
  assert.throws(() => nextFrom(Number.MAX_SAFE_INTEGER), /exhausted|invalid/i);
  assert.throws(() => nextFrom(-1), /exhausted|invalid/i);

  const clearDrafts = functionSource("clearTemplateNumericDrafts");
  const renderNumericInput = functionSource("renderTemplateNumericInput");
  collectAssertions([
    ["native required number semantics", () => assertContains(renderNumericInput, /<input\s+type="number"\s+required\s+min=/, "Every shared template numeric input must expose required alongside min/max/step")],
    ["template deletion clears drafts", () => assertContains(html, /confirm-delete-template[\s\S]*?clearTemplateNumericDrafts\s*\(\s*templateId\s*\)/, "Deleting a template must remove its pending numeric drafts")],
    ["exercise deletion clears drafts", () => assertContains(html, /delete-template-exercise[\s\S]*?clearTemplateNumericDrafts\s*\(\s*target\.dataset\.templateId\s*,\s*target\.dataset\.templateExerciseId\s*\)/, "Deleting a template exercise must remove its pending numeric drafts")],
    ["draft helper deletes matched keys", () => assertContains(clearDrafts, /templateNumericDrafts\.delete\s*\(\s*key\s*\)/, "Draft cleanup must delete every matched key")]
  ]);
});

test("active and template recommendation snapshots require schema, checksum, identity, and direct-target validity", () => {
  const engine = prescriptionApi.createPrescriptionEngine({ researchData: publicResearchData() });
  const validateExecutableRecommendationSnapshot = evaluateFunction("validateExecutableRecommendationSnapshot", { prescriptionApi });
  const validateSnapshot = evaluateFunction("validateImportedExecutableRecommendationSnapshot", {
    validateExecutableRecommendationSnapshot
  });
  const valid = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "mg_chest_sternal",
    availableEquipment: ["all"],
    history: [],
    createdAt: "2026-07-15T00:00:00.000Z"
  });
  assert.doesNotThrow(() => validateSnapshot(valid, engine, "Valid active recommendation"));

  const staleChecksum = structuredClone(valid);
  staleChecksum.confidence = staleChecksum.confidence === "high" ? "moderate" : "high";
  assert.throws(() => validateSnapshot(staleChecksum, engine, "Stale checksum"), /checksum/i);

  const unknownSchema = prescriptionApi.refreshRecommendationChecksum({ ...structuredClone(valid), schemaVersion: "snapshot/99.0.0" });
  assert.throws(() => validateSnapshot(unknownSchema, engine, "Unknown schema"), /schema/i);

  const unknownIdentity = structuredClone(valid);
  unknownIdentity.exerciseId = "ex_unknown_imported_identity";
  if (unknownIdentity.basePrescription) unknownIdentity.basePrescription.exerciseId = unknownIdentity.exerciseId;
  if (unknownIdentity.finalPrescription) unknownIdentity.finalPrescription.exerciseId = unknownIdentity.exerciseId;
  assert.throws(
    () => validateSnapshot(prescriptionApi.refreshRecommendationChecksum(unknownIdentity), engine, "Unknown identity"),
    /identity|unknown/i
  );

  const mismatchedTarget = prescriptionApi.refreshRecommendationChecksum({
    ...structuredClone(valid),
    muscleGroupId: "mg_quadriceps_rectus_femoris"
  });
  assert.throws(() => validateSnapshot(mismatchedTarget, engine, "Identity-target mismatch"), /taxonomy|target|direct|muscle/i);

  assert.throws(
    () => validateSnapshot(valid, engine, "Host mismatch", { name: "Seated Cable Row", canonicalExerciseId: "ex_seated_cable_row" }),
    /host exercise identity/i
  );

  let prescribeCalls = 0;
  const originalPrescribe = engine.prescribeExercise.bind(engine);
  engine.prescribeExercise = (...args) => { prescribeCalls += 1; return originalPrescribe(...args); };
  assert.doesNotThrow(() => validateSnapshot(valid, engine, "No fresh prescription"));
  assert.equal(prescribeCalls, 0, "Snapshot integrity/identity validation must not invoke fresh prescription logic");

  const blocked = engine.prescribeExercise({
    exerciseId: "ex_barbell_bench_press",
    muscleGroupId: "mg_chest_sternal",
    readiness: { pain: true, affectedMuscle: "chest" },
    availableEquipment: ["all"],
    history: [],
    createdAt: "2026-07-15T00:00:00.000Z"
  });
  assert.equal(blocked.finalPrescription.executionBlocked, true, "The hard-rejection fixture must be non-executable");
  assert.doesNotThrow(() => validateSnapshot(blocked, engine, "Valid hard rejection"), "A valid non-executable safety snapshot remains safe to import");

  const calls = [];
  const validateCollection = evaluateFunction("validateImportedExecutableRecommendationSnapshots", {
    validateImportedExecutableRecommendationSnapshot: (snapshot, _engine, label, hostExercise) => calls.push({ snapshot, label, hostExercise })
  });
  const historicalSnapshot = { exact: "historical bytes" };
  const historicalBefore = JSON.stringify(historicalSnapshot);
  validateCollection({
    sessions: [
      { id: "active", submitted: false, workoutPrescription: { recommendations: [{ kind: "active-workout" }] } },
      { id: "historical", submitted: true, workoutPrescription: { recommendations: [{ kind: "historical-workout" }] } }
    ],
    exercises: [
      { id: "active-exercise", sessionId: "active", recommendationSnapshot: { kind: "active-exercise" } },
      { id: "historical-exercise", sessionId: "historical", recommendationSnapshot: historicalSnapshot }
    ],
    templates: [{ id: "template", exercises: [{ id: "template-exercise", recommendationSnapshot: { kind: "template" } }] }]
  }, engine);
  assert.deepEqual(calls.map((item) => item.snapshot.kind), ["active-exercise", "active-workout", "template"]);
  assert.deepEqual(calls.filter((item) => item.hostExercise).map((item) => item.hostExercise.id), ["active-exercise", "template-exercise"], "Active/template exercise snapshots must remain bound to their host exercise");
  assert.equal(JSON.stringify(historicalSnapshot), historicalBefore, "Submitted historical snapshot bytes must remain untouched and unvalidated");
});

test("Strong CSV import requires explicit source-unit provenance and preserves it", () => {
  const importStrongSource = functionSource("importStrongCsv");
  const importFileSource = functionSource("importDataFile");
  collectAssertions([
    ["explicit source unit", () => assertContains(importStrongSource, /normalizeStrongImportWeightUnit\s*\(\s*sourceWeightUnit\s*\)/, "Strong import must validate an explicit source unit")],
    ["per-set provenance", () => assertContains(importStrongSource, /weightUnit\s*,/, "Strong sets must store the selected source unit")],
    ["raw-source provenance", () => assertContains(importStrongSource, /originalText:\s*text[\s\S]{0,160}weightUnit/, "Retained Strong source metadata must store the selected unit")],
    ["deterministic duplicate", () => assertContains(importStrongSource, /retainedRawImport[\s\S]{0,900}No data was changed/, "An exact duplicate Strong source must be a deterministic no-op")],
    ["file wiring", () => assertContains(importFileSource, /importStrongCsv\s*\(\s*text\s*,\s*strongImportWeightUnit\s*\)/, "The file importer must pass the explicit Strong unit choice")],
    ["visible choice", () => assertContains(html, /data-action="strong-import-weight-unit"[\s\S]{0,500}Pounds \(lb\)[\s\S]{0,500}Kilograms \(kg\)/, "Settings must expose the Strong source-unit choice")]
  ]);
});

test("visible exception presentation consumes only the canonical resolved-action contract", () => {
  const analysis = fs.readFileSync(path.join(APP_ROOT, "app-analysis.js"), "utf8");
  const views = fs.readFileSync(path.join(APP_ROOT, "app-views.js"), "utf8");
  assert.match(views, /function renderResolvedAction\(/, "Visible exception copy must have one structural resolved-action renderer");
  assert.match(views, /Array\.isArray\(session\?\.resolvedActions\)/, "Visible exception selection must read the persisted canonical actions");
  assert.doesNotMatch(views, /renderRecommendationHead|renderUnifiedEvidence|renderUnifiedPrescriptionDetails|renderPrescriptionDetails/, "Today and the active workout must not retain legacy recommendation/confidence/evidence renderers");
  assert.doesNotMatch(analysis, /function renderRecommendation\(|renderRecommendationHead|renderUnifiedEvidence/, "Progress must not retain a second recommendation renderer");
  assert.doesNotMatch(views, /fatigueFlags\(|recoveryRecommendationForSession\(|unifiedPrescriptionSnapshot\(/, "Visible surfaces must not call detector or legacy prescription sources directly");
  assert.doesNotMatch(analysis, /fatigueFlags\(|recoveryRecommendationForSession\(|coachRecommendationForExercise\(/, "Analysis surfaces must remain detached from detector outputs and normal coaching");
});

test("conflict-mode and rejected executable imports perform zero writes while accepted imports rebase once", async () => {
  const makeContext = ({ conflict = false, snapshotError = null } = {}) => {
    const events = { writes: [], removals: [], renders: 0, snapshotChecks: 0, evidenceInstalls: 0, invalidations: 0, runtimeSaves: 0 };
    const engineSentinel = { id: "engine-sentinel" };
    const cacheSentinel = { id: "cache-sentinel" };
    const context = {
      importInProgress: false,
      importAttempt: 0,
      importStatus: { state: "idle", message: "" },
      settingsMessage: "",
      render: () => { events.renders += 1; },
      appDataPersistenceConflict: conflict ? { message: "Synthetic divergent copies" } : null,
      BACKUP_IMPORT_LIMITS: { maxFileBytes: BACKUP_BOUNDARIES.fileBytes },
      Error,
      TextEncoder,
      window: {
        FitnessBackupContract: {
          validateAndSanitizeBackup: (value) => value,
          decodeLegacyBackup: (value) => value
        }
      },
      validateImportedAppData: () => ({ appDataVersion: 2, sessions: [], exercises: [], sets: [], templates: [], settings: {}, personalEvidencePackage: null, dataRevision: 0 }),
      researchOnlyBundleForImport: () => ({ bundle: { personal: {} }, engine: { id: "prepared-engine" } }),
      normalizeLoadedData: (value) => structuredClone(value),
      nextMonotonicImportRevision: () => 42,
      validateImportedExecutableRecommendationSnapshots: () => {
        events.snapshotChecks += 1;
        if (snapshotError) throw new Error(snapshotError);
      },
      writeIndexedValue: async (key, value) => { events.writes.push({ key, value: structuredClone(value) }); },
      localStorage: { removeItem: (key) => events.removals.push(key) },
      STORAGE_KEY: "comprehensive-fitness-data",
      data: { dataRevision: 41, sessions: [{ id: "runtime-session-sentinel" }], evidenceSentinel: "unchanged" },
      templateNumericDrafts: new Map(),
      prescriptionEngine: engineSentinel,
      prescriptionEvidenceStatus: { state: "ready", personalVersion: "evidence-sentinel" },
      prescriptionSnapshotCache: new Map([["sentinel", cacheSentinel]]),
      installPreparedEvidence: () => { events.evidenceInstalls += 1; context.prescriptionEngine = { id: "installed-engine" }; return 0; },
      entityStructureRevision: 7,
      entityIndexCache: { id: "entity-cache-sentinel" },
      invalidateCompletedAnalysis: () => { events.invalidations += 1; },
      activeSessionId: "runtime-session-sentinel",
      activeWorkoutId: "runtime-workout-sentinel",
      sessionHasStarted: () => false,
      isSessionSubmitted: () => false,
      saveRuntime: () => { events.runtimeSaves += 1; },
      importStrongCsv: () => { throw new Error("CSV path was not expected"); },
      isoNow: () => "2026-07-15T00:00:00.000Z"
    };
    return { context, events, run: evaluateFunction("importDataFile", context) };
  };
  const file = { name: "backup.json", size: 2, text: async () => "{}" };

  const conflict = makeContext({ conflict: true });
  await conflict.run(file);
  assert.equal(conflict.events.writes.length, 0, "Conflict-mode import must not write either store");
  assert.match(conflict.context.settingsMessage, /selected copy|alternate is excluded|Clear All/i);

  const invalid = makeContext({ snapshotError: "Synthetic invalid executable snapshot" });
  const invalidBefore = {
    data: invalid.context.data,
    bytes: JSON.stringify(invalid.context.data),
    engine: invalid.context.prescriptionEngine,
    evidenceStatus: invalid.context.prescriptionEvidenceStatus,
    cacheValue: invalid.context.prescriptionSnapshotCache.get("sentinel"),
    entityStructureRevision: invalid.context.entityStructureRevision,
    entityIndexCache: invalid.context.entityIndexCache,
    activeSessionId: invalid.context.activeSessionId,
    activeWorkoutId: invalid.context.activeWorkoutId
  };
  await invalid.run(file);
  assert.equal(invalid.events.snapshotChecks, 1);
  assert.equal(invalid.events.writes.length, 0, "An invalid active/template snapshot must reject atomically before IndexedDB write");
  assert.equal(invalid.events.removals.length, 0, "Rejected snapshot import must leave the durable fallback untouched");
  assert.equal(invalid.events.evidenceInstalls, 0, "Rejected snapshot import must not replace the active evidence engine");
  assert.equal(invalid.events.invalidations, 0, "Rejected snapshot import must not invalidate accepted-state caches");
  assert.equal(invalid.events.runtimeSaves, 0, "Rejected snapshot import must not persist altered runtime state");
  assert.strictEqual(invalid.context.data, invalidBefore.data);
  assert.equal(JSON.stringify(invalid.context.data), invalidBefore.bytes);
  assert.strictEqual(invalid.context.prescriptionEngine, invalidBefore.engine);
  assert.strictEqual(invalid.context.prescriptionEvidenceStatus, invalidBefore.evidenceStatus);
  assert.strictEqual(invalid.context.prescriptionSnapshotCache.get("sentinel"), invalidBefore.cacheValue);
  assert.equal(invalid.context.entityStructureRevision, invalidBefore.entityStructureRevision);
  assert.strictEqual(invalid.context.entityIndexCache, invalidBefore.entityIndexCache);
  assert.equal(invalid.context.activeSessionId, invalidBefore.activeSessionId);
  assert.equal(invalid.context.activeWorkoutId, invalidBefore.activeWorkoutId);
  assert.match(invalid.context.settingsMessage, /invalid executable snapshot/i);

  const accepted = makeContext();
  await accepted.run(file);
  assert.equal(accepted.events.snapshotChecks, 1);
  assert.equal(accepted.events.writes.length, 1, "A validated backup must perform one IndexedDB app-data write");
  assert.equal(accepted.events.writes[0].value.dataRevision, 42, "Imported revision metadata must be replaced by the next local monotonic revision");
  assert.equal(accepted.context.data.dataRevision, 42);
  assert.deepEqual(accepted.events.removals, ["comprehensive-fitness-data"], "The shadowing fallback must be removed only after the accepted IndexedDB write");

  const importSource = functionSource("importDataFile");
  const exportSource = functionSource("exportData");
  collectAssertions([
    ["conflict gate precedes file read", () => assert.ok(importSource.indexOf("appDataPersistenceConflict") < importSource.indexOf("file.text()"), "Conflict import must fail before consuming untrusted bytes")],
    ["snapshot validation precedes write", () => assert.ok(importSource.indexOf("validateImportedExecutableRecommendationSnapshots") < importSource.indexOf('writeIndexedValue("app-data"'), "Executable snapshots must validate before persistence")],
    ["fallback cleanup follows write", () => assert.ok(importSource.indexOf('writeIndexedValue("app-data"') < importSource.indexOf("localStorage.removeItem"), "Fallback cleanup must follow the successful IndexedDB write")],
    ["export identifies selected copy", () => assertContains(exportSource, /selected app-data copy only[\s\S]*?alternate[\s\S]*?not included/i, "Conflict export must disclose both selected scope and excluded alternate")]
  ]);
});

test("workout submission acceptance is shared by routing feedback and the reentrant idempotency boundary", () => {
  const session = { id: "session-1", date: "2026-07-15", submitted: false, workoutPrescription: null };
  const context = {
    data: { sessions: [session], exercises: [], recommendationHistory: [], manualOverrides: [], dataRevision: 1 },
    workoutSubmissionsInProgress: new Set(),
    timer: null,
    timerCompleteNotice: null,
    restNavigationState: null,
    isoNow: () => "2026-07-15T00:00:00.000Z",
    submitWorkoutPrs: null,
    calculateWorkoutAnalysis: () => ({ grade: "B" }),
    evaluateWorkoutOverrideOutcomes: () => ({ exercises: [], recommendationHistory: [], manualOverrides: [], evaluatedByRecommendation: new Map() }),
    pendingSubmitSessionId: "session-1",
    completedSummarySessionId: "",
    activeWorkoutId: "session-1",
    clearActiveWorkoutDraft: () => { context.draftClears += 1; },
    commit: (nextData) => { context.commits += 1; context.data = { ...nextData, dataRevision: context.data.dataRevision + 1 }; },
    playWorkoutCompletionSound: () => { context.sounds += 1; },
    performInteractionFeedback: () => { context.feedback += 1; },
    cancelTimer: () => {},
    commits: 0,
    sounds: 0,
    feedback: 0,
    draftClears: 0,
    reentrantAttempts: 0
  };
  const workoutSubmissionIsAccepted = evaluateFunction("workoutSubmissionIsAccepted", context);
  context.workoutSubmissionIsAccepted = workoutSubmissionIsAccepted;
  assert.equal(workoutSubmissionIsAccepted("session-1"), true);
  context.workoutSubmissionsInProgress.add("session-1");
  assert.equal(workoutSubmissionIsAccepted("session-1"), false, "An in-progress session must not be accepted twice");
  context.workoutSubmissionsInProgress.delete("session-1");
  assert.equal(workoutSubmissionIsAccepted("missing-session"), false, "A missing session must not be accepted");
  const submit = evaluateFunction("submitWorkout", context);
  context.submitWorkoutPrs = () => {
    context.reentrantAttempts += 1;
    submit("session-1");
    return [];
  };
  submit("session-1");
  submit("session-1");
  assert.equal(context.reentrantAttempts, 1, "The calculation path must run once");
  assert.equal(context.commits, 1, "Reentrant and repeated submissions must create one logical completion");
  assert.equal(context.sounds, 1, "Completion effects must run once");
  assert.equal(context.draftClears, 1, "The active draft must clear once");
  assert.equal(context.data.sessions[0].submitted, true);
  assert.equal(workoutSubmissionIsAccepted("session-1"), false, "A submitted session must not be accepted again");
  assert.equal(context.workoutSubmissionsInProgress.size, 0, "The reentrancy lock must release after completion");
  collectAssertions([
    ["submit uses shared predicate", () => assertContains(functionSource("submitWorkout"), /if\s*\(\s*!workoutSubmissionIsAccepted\s*\(\s*sessionId\s*\)\s*\)\s*return/, "submitWorkout must use the shared acceptance predicate")],
    ["router suppresses rejected feedback", () => assertContains(html, /interactionAccepted\s*=\s*action\s*!==\s*["']confirm-submit-workout["']\s*\|\|\s*workoutSubmissionIsAccepted\s*\(\s*activeSessionId\s*\)[\s\S]{0,160}if\s*\(\s*interactionAccepted\s*\)\s*performInteractionFeedback/, "The router must gate generic submit feedback through the same predicate")],
    ["router still calls submit", () => assertContains(html, /if\s*\(\s*action\s*===\s*["']confirm-submit-workout["']\s*\)\s*submitWorkout\s*\(\s*activeSessionId\s*\)/, "A rejected duplicate route must still invoke submitWorkout for the idempotent entry contract")]
  ]);
});

test("dedicated JSON shape validation accepts exact depth and width boundaries and rejects overflow", () => {
  assert.match(
    html,
    /(?:async\s+)?function\s+validateBackupJsonShape\s*\(/,
    "Missing dedicated validateBackupJsonShape production helper for executable depth/width checks"
  );
  const validateBackupJsonShape = evaluateFunction("validateBackupJsonShape", {
    BACKUP_IMPORT_LIMITS: {
      maxJsonDepth: BACKUP_BOUNDARIES.jsonDepth,
      maxObjectKeys: BACKUP_BOUNDARIES.objectKeys
    }
  });
  const options = {
    maxDepth: BACKUP_BOUNDARIES.jsonDepth,
    maxObjectKeys: BACKUP_BOUNDARIES.objectKeys
  };
  for (const shapeCase of jsonShapeCases()) {
    let result;
    let error = null;
    try {
      result = validateBackupJsonShape(shapeCase.value, options);
    } catch (caught) {
      error = caught;
    }
    const rejected = Boolean(error) || result === false || result?.valid === false;
    if (shapeCase.expected === "accepted") {
      assert.equal(rejected, false, `${shapeCase.name} was rejected: ${error?.message || JSON.stringify(result)}`);
    } else {
      assert.equal(rejected, true, `${shapeCase.name} must be rejected by the executable shape validator`);
      if (error) assert.match(String(error.message || error), /depth|key|width|shape|limit/i, `${shapeCase.name} needs an actionable structural-limit error`);
    }
  }
});

test("strict backup validation accepts every exact entity boundary and rejects boundary plus one", () => {
  assert.match(
    html,
    /(?:async\s+)?function\s+validateImportedAppData\s*\(/,
    "Missing dedicated validateImportedAppData production helper for executable entity-count checks"
  );
  const limits = {
    maxFileBytes: BACKUP_BOUNDARIES.fileBytes,
    maxJsonDepth: BACKUP_BOUNDARIES.jsonDepth,
    maxObjectKeys: BACKUP_BOUNDARIES.objectKeys,
    maxSessions: BACKUP_BOUNDARIES.sessions,
    maxExercises: BACKUP_BOUNDARIES.exercises,
    maxSets: BACKUP_BOUNDARIES.sets,
    maxTemplates: BACKUP_BOUNDARIES.templates
  };
  const validateImportedAppData = evaluateFunction("validateImportedAppData", {
    BACKUP_IMPORT_LIMITS: limits,
    validateBackupJsonShape: () => true
  });
  for (const descriptor of entityCollectionCases()) {
    const fixture = backupContract.discardObsoletePlanningState(buildEntityCollectionCase(descriptor));
    let result;
    let error = null;
    try {
      result = validateImportedAppData(fixture, limits);
    } catch (caught) {
      error = caught;
    }
    const rejected = Boolean(error) || result === false || result?.valid === false;
    if (descriptor.expected === "accepted") {
      assert.equal(rejected, false, `${descriptor.name} was rejected: ${error?.message || JSON.stringify(result)}`);
    } else {
      assert.equal(rejected, true, `${descriptor.name} must be rejected by the executable import validator`);
      if (error) assert.match(String(error.message || error), /session|exercise|set|template|count|limit/i, `${descriptor.name} needs an actionable entity-limit error`);
    }
  }
});

test("synthetic entity boundary fixtures are exact, relationally valid, and below the file limit", () => {
  for (const descriptor of entityCollectionCases()) {
    const fixture = buildEntityCollectionCase(descriptor);
    assert.equal(fixture[descriptor.collection].length, descriptor.count, `${descriptor.name} has the wrong entity count`);
    const bytes = Buffer.byteLength(JSON.stringify(fixture), "utf8");
    assert.ok(bytes < BACKUP_BOUNDARIES.fileBytes, `${descriptor.name} is ${bytes} bytes and would conflate entity count with the ${BACKUP_BOUNDARIES.fileBytes}-byte file boundary`);
    const sessionIds = new Set(fixture.sessions.map((item) => item.id));
    const exerciseIds = new Set(fixture.exercises.map((item) => item.id));
    assert.ok(fixture.exercises.every((item) => sessionIds.has(item.sessionId)), `${descriptor.name} contains an orphan exercise`);
    assert.ok(fixture.sets.every((item) => exerciseIds.has(item.exerciseId)), `${descriptor.name} contains an orphan set`);
    for (const collection of [fixture.sessions, fixture.exercises, fixture.sets, fixture.templates]) {
      assert.equal(new Set(collection.map((item) => item.id)).size, collection.length, `${descriptor.name} contains a duplicate entity ID`);
    }
  }
});

test("synthetic JSON shape fixtures land exactly on and one beyond each boundary", () => {
  const containerDepth = (value) => {
    if (!value || typeof value !== "object") return 0;
    const children = Array.isArray(value) ? value : Object.values(value);
    return 1 + children.reduce((maximum, child) => Math.max(maximum, containerDepth(child)), 0);
  };
  const fixtures = new Map(jsonShapeCases().map((item) => [item.name, item.value]));
  assert.equal(containerDepth(fixtures.get("json-depth-at-boundary")), BACKUP_BOUNDARIES.jsonDepth);
  assert.equal(containerDepth(fixtures.get("json-depth-over-boundary")), BACKUP_BOUNDARIES.jsonDepth + 1);
  assert.equal(Object.keys(fixtures.get("object-width-at-boundary")).length, BACKUP_BOUNDARIES.objectKeys);
  assert.equal(Object.keys(fixtures.get("object-width-over-boundary")).length, BACKUP_BOUNDARIES.objectKeys + 1);
});

test("cloud workout sync performs no queue or flush work without explicit true consent", async () => {
  const defaultsStart = html.indexOf("const defaultSettings");
  assert.notEqual(defaultsStart, -1, "Missing defaultSettings");
  const defaults = html.slice(defaultsStart, defaultsStart + 3500);
  const normalize = functionSource("normalizeLoadedData");
  const queue = functionSource("queueActiveWorkoutSync");
  const flush = functionSource("flushWorkoutSyncQueue");
  const consentTransition = functionSource("setCloudWorkoutSyncConsent");
  const notifications = functionSource("enablePushNotifications");
  const notificationActionWindows = [...html.matchAll(/action\s*===\s*["'](?:request-notifications|toggle-rest-notifications|timer-notifications)["']/g)]
    .map((match) => html.slice(match.index, match.index + 900));

  async function run(consent) {
    const settings = {};
    if (consent !== undefined) settings.cloudWorkoutSyncConsent = consent;
    const session = { id: "session-1" };
    const model = { settings, exercises: [{ id: "exercise-1", sessionId: session.id }], sets: [{ id: "set-1", exerciseId: "exercise-1" }] };
    const queueEvents = { reads: [], writes: [], timers: 0 };
    const queueContext = {
      data: model,
      activeWorkoutSession: () => session,
      completedSummarySessionId: "",
      dataEntityIndex: () => ({
        exerciseIndicesBySession: new Map([[session.id, [0]]]),
        setIndicesByExercise: new Map([["exercise-1", [0]]])
      }),
      readIndexedValue: async (key) => { queueEvents.reads.push(key); return []; },
      writeIndexedValue: async (key, value) => { queueEvents.writes.push({ key, value: plain(value) }); },
      id: () => "mutation-1",
      isoNow: () => "2026-07-14T12:00:00.000Z",
      window: {
        clearTimeout: () => {},
        setTimeout: () => { queueEvents.timers += 1; return 1; }
      },
      syncFlushTimer: 0,
      flushWorkoutSyncQueue: () => {}
    };
    await evaluateFunction("queueActiveWorkoutSync", queueContext)();

    const flushEvents = { reads: [], writes: [], requests: [] };
    const mutation = { mutationId: "mutation-1", sessionId: session.id, revision: "2026-07-14T12:00:00.000Z", payload: {} };
    const flushContext = {
      data: model,
      navigator: { onLine: true },
      pushIdentity: { installationId: "installation-1", token: "synthetic-token" },
      readIndexedValue: async (key) => { flushEvents.reads.push(key); return [mutation]; },
      writeIndexedValue: async (key, value) => { flushEvents.writes.push({ key, value: plain(value) }); },
      pushApi: async (url, body) => { flushEvents.requests.push({ url, body: plain(body) }); return { status: "synced" }; }
    };
    await evaluateFunction("flushWorkoutSyncQueue", flushContext)();
    return { queueEvents, flushEvents };
  }

  for (const consent of [undefined, false]) {
    const result = await run(consent);
    assert.deepEqual(result.queueEvents, { reads: [], writes: [], timers: 0 }, `${String(consent)} consent queued workout data`);
    assert.deepEqual(result.flushEvents, { reads: [], writes: [], requests: [] }, `${String(consent)} consent flushed workout data`);
  }
  const allowed = await run(true);
  assert.equal(allowed.queueEvents.writes.length, 1, "Explicit consent must permit queueing");
  assert.equal(allowed.flushEvents.requests.length, 1, "Explicit consent must permit flushing");
  collectAssertions([
    ["default off", () => assertContains(defaults, /cloudWorkoutSyncConsent\s*:\s*false/, "Cloud workout sync consent must default to false")],
    ["persisted independently", () => assertContains(normalize, /cloudWorkoutSyncConsent\s*:\s*storedSettings\.cloudWorkoutSyncConsent/, "Cloud workout sync consent must have its own persisted setting")],
    ["explicit UI control", () => assertContains(html, /renderAlertSetting\(["']cloud-workout-sync-consent["']/, "Settings must expose a distinct cloud workout sync consent control")],
    ["queue fails closed", () => assertContains(queue, /cloudWorkoutSyncConsent\s*!==\s*true|cloudWorkoutSyncConsent\s*===\s*true/, "Queueing must require explicit true consent")],
    ["flush fails closed", () => assertContains(flush, /cloudWorkoutSyncConsent\s*!==\s*true|cloudWorkoutSyncConsent\s*===\s*true/, "Flushing must require explicit true consent")],
    ["enable renders only after durable write", () => assertContains(consentTransition, /commitConsent\(true, false\)[\s\S]*await writeIndexedValue\("app-data", data\)[\s\S]*render\(\)/, "The enabled UI must not appear before consent is durably written")],
    ["pending control stays canonical", () => assertContains(html, /requestedConsent = target\.checked === true;[\s\S]*target\.checked = data\.settings\.cloudWorkoutSyncConsent === true;[\s\S]*await setCloudWorkoutSyncConsent\(requestedConsent\)/, "The checkbox must not expose unconfirmed consent while authorization is pending")],
    ["notification setup remains separate", () => assert.doesNotMatch(notifications, /cloudWorkoutSyncConsent/, "Enabling notifications must not enable workout upload")],
    ["notification toggles remain separate", () => assert.ok(notificationActionWindows.every((source) => !/cloudWorkoutSyncConsent\s*:\s*true/.test(source)), "A notification preference handler must never grant workout-upload consent")]
  ]);
});

test("remote deletion function exists and retains authorization until terminal deleted", async () => {
  assert.match(
    html,
    /(?:async\s+)?function\s+deleteRemoteInstallationData\s*\(/,
    "Missing production deleteRemoteInstallationData; behavioral assertions below execute as soon as the function exists"
  );
  const context = {
    pushIdentity: { installationId: "installation-1", deviceId: "device-1", token: "synthetic-bearer", status: "enabled" },
    settingsMessage: "",
    render: () => {},
    persistPushIdentity: async () => true,
    writeIndexedValue: async () => true,
    isoNow: () => "2026-07-14T12:00:00.000Z",
    window: { setTimeout: () => 1, clearTimeout: () => {} },
    pushApi: async () => ({ status: "deleting", retryable: true, phase: "discover" })
  };
  const remove = evaluateFunction("deleteRemoteInstallationData", context);

  const deleting = plain(await remove());
  assert.equal(deleting.status, "deleting");
  assert.equal(deleting.retryable, true);
  assert.equal(context.pushIdentity.token, "synthetic-bearer", "A 202/deleting response must retain the bearer for retry");

  context.pushApi = async () => { const error = new Error("Synthetic network failure"); error.status = 503; throw error; };
  let failure = null;
  try { failure = plain(await remove()); }
  catch (error) { failure = { status: "error", retryable: error.retryable === true }; }
  assert.equal(failure?.retryable, true, "A failed delete must expose retryable state");
  assert.equal(context.pushIdentity.token, "synthetic-bearer", "A failed delete must retain the bearer for retry");

  context.pushApi = async () => ({ status: "deleted", retryable: false });
  const deleted = plain(await remove());
  assert.equal(deleted.status, "deleted");
  assert.equal(Boolean(context.pushIdentity?.token), false, "Only terminal deleted may clear the bearer");
});

test("timer cancellation sends timerVersion and deduplicates only the same notification version", async () => {
  const immediateRequests = [];
  const immediateContext = {
    navigator: { onLine: true, serviceWorker: { controller: { postMessage: () => {} } } },
    pushIdentity: { installationId: "installation-1", token: "synthetic-bearer" },
    activeWorkoutId: "workout-1",
    pushApi: async (url, body) => { immediateRequests.push({ url, body: plain(body) }); return { status: "canceled" }; },
    readIndexedValue: async () => [],
    writeIndexedValue: async () => true
  };
  await evaluateFunction("cancelRestPush", immediateContext)({ id: "timer-1", workoutId: "workout-1", version: 7 }, "adjusted");
  assert.equal(immediateRequests[0]?.body?.timerVersion, 7, "Immediate cancellation must carry the exact timer version");

  let pending = [];
  const offlineContext = {
    navigator: { onLine: false, serviceWorker: { controller: { postMessage: () => {} } } },
    pushIdentity: { installationId: "installation-1", token: "synthetic-bearer" },
    activeWorkoutId: "workout-1",
    pushApi: async () => { throw new Error("Offline requests must not run"); },
    readIndexedValue: async () => plain(pending),
    writeIndexedValue: async (_key, value) => { pending = plain(value); return true; }
  };
  const cancelOffline = evaluateFunction("cancelRestPush", offlineContext);
  await cancelOffline({ id: "timer-1", workoutId: "workout-1", version: 7 }, "adjusted");
  await cancelOffline({ id: "timer-1", workoutId: "workout-1", version: 7 }, "duplicate");
  await cancelOffline({ id: "timer-1", workoutId: "workout-1", version: 8 }, "adjusted-again");
  assert.equal(pending.length, 2, "Queue deduplication must retain one operation for each distinct timer version");
  assert.deepEqual(pending.map((item) => item.timerVersion).sort((a, b) => a - b), [7, 8]);
});

test("quick-start cards retain native button semantics", () => {
  const source = functionSource("renderQuickStartTemplates");
  assertContains(source, /<button\s+class="quick-template-card[^>]*\stype="button"/, "Every quick-start card must remain a native type=button control");
  assert.doesNotMatch(source, /<(?:div|article|a)[^>]*class="quick-template-card[^>]*role="button"/, "Quick-start must not regress to a simulated button");
  assert.doesNotMatch(source, /class="quick-template-list"[^>]*\srole="list"/, "The visual quick-template carousel must not impose list semantics on native button children");
  assert.doesNotMatch(source, /class="quick-template-card[^>]*\srole="listitem"/, "A native quick-template button must retain its computed button role");
});

test("four-destination architecture contains no superseded five-tab UI contract", () => {
  collectAssertions([
    ["four destination IDs", () => assertContains(html, /const primaryTabIds = \["today", "plan", "progress", "more"\]/, "Primary navigation must use the four-destination contract")],
    ["four navigation buttons", () => assert.equal((functionSource("render").match(/navButton\(/g) || []).length, 4, "The shell must render exactly four primary navigation buttons")],
    ["progress workspace", () => assertContains(html, /function renderProgress\([\s\S]*progressView === "lifts"[\s\S]*progressView === "history"/, "Dashboard, lift trends, and history must share the Progress workspace")],
    ["removed top-level renderers", () => assert.doesNotMatch(html, /function renderDashboard\(|function renderReview\(/, "Superseded Dashboard and Charts top-level renderers must be removed")],
    ["removed reskin selectors", () => assert.doesNotMatch(html, /quiet-coach-hero|app-module/, "The previous reskin component selectors must not remain in source")],
    ["legacy hashes only", () => assertContains(functionSource("tabFromLocation"), /dashboard[\s\S]*charts[\s\S]*return "progress"/, "Legacy route names may remain only as four-destination redirects")]
  ]);
});

test("guided planning contains no unreachable automatic-planner contract", () => {
  const removedFunctions = [
    "renderTodayPlan",
    "renderRecoveryPanel",
    "renderReadinessChange",
    "renderActiveWorkoutAdvice",
    "renderPrescriptionBrief",
    "renderWorkoutAdvice",
    "previewMesocyclePlan",
    "regenerateMesocycleWithPracticalLimits",
    "confirmMesocycleScope",
    "addOmittedMuscleAndRebuild",
    "selectMesocycleCandidate",
    "renderMesocycleCandidate",
    "renderMesocycleCard",
    "renderMesocyclePlanner"
  ];
  const removedActions = [
    "preview-mesocycle",
    "regenerate-mesocycle",
    "mesocycle-type-option",
    "jump-mesocycle-slot",
    "toggle-mesocycle-alternates",
    "toggle-mesocycle-planner-review",
    "confirm-mesocycle-scope",
    "add-mesocycle-muscle",
    "select-mesocycle-candidate",
    "compare-mesocycle-candidate"
  ];
  collectAssertions([
    ...removedFunctions.map((name) => [name, () => assert.doesNotMatch(html, new RegExp(`function\\s+${name}\\s*\\(`), `${name} is a retired, unreachable compatibility renderer/controller`)]),
    ...removedActions.map((action) => [action, () => assert.doesNotMatch(html, new RegExp(`data-action=["']${action}["']|action\\s*===\\s*["']${action}["']`), `${action} is a retired automatic-planner action`)])
  ]);
});

test("navigation, dialogs, and Lift controls expose complete focus and naming contracts", () => {
  const setTab = functionSource("setActiveTab");
  const openDialog = functionSource("openTemplateStart");
  const closeDialog = functionSource("closeTemplateStart");
  const exercise = functionSource("renderExercise");
  const actionTags = [...exercise.matchAll(/<button[^>]*data-action="(?:move-exercise|delete-exercise)"[^>]*>/g)].map((match) => match[0]);
  const equipmentGroups = [...html.matchAll(/<section\s+class="equipment-picker"[^>]*>/g)].map((match) => match[0]);
  const scopeGroups = [...html.matchAll(/<section\s+class="muscle-scope-panel"[^>]*>/g)].map((match) => match[0]);
  collectAssertions([
    ["skip link", () => assertContains(html, /<a[^>]+href=["']#main-content["'][^>]*>[^<]*(?:skip|content)/i, "Provide a keyboard-visible skip link to main content")],
    ["main target", () => assertContains(html, /<main[^>]+id=["']main-content["'][^>]*tabindex=["']-1["']|<main[^>]+tabindex=["']-1["'][^>]*id=["']main-content["']/, "The main content target must be programmatically focusable")],
    ["primary-tab focus", () => assertContains(setTab, /\.focus\s*\(/, "Primary-tab navigation must move focus to the new view heading or main region")],
    ["dialog trigger captured", () => assertContains(openDialog, /document\.activeElement|returnFocus|focusOrigin|dialogTrigger/i, "Opening a dialog must capture its focus origin")],
    ["dialog close restores focus", () => assertContains(closeDialog, /\.focus\s*\(|restoreFocus/i, "Closing a dialog must restore focus to its trigger")],
    ["contextual Lift action names", () => assert.ok(actionTags.length >= 3 && actionTags.every((tag) => /aria-label=/.test(tag) && /exercise\.name/.test(tag)), `Move/delete controls need exercise-specific accessible names; received ${actionTags.join(" | ")}`)],
    ["Available Equipment removed", () => assert.equal(equipmentGroups.length, 0, "Deleted global equipment controls must not remain reachable")],
    ["Muscle Group Scope removed", () => assert.equal(scopeGroups.length, 0, "Deleted planner scope controls must not remain reachable")]
  ]);
});

test("history editing seals stable persistence and defers external controller reloads", () => {
  const beginHistoryEdit = functionSource("beginHistoryEdit");
  const registerPwaServiceWorker = functionSource("registerPwaServiceWorker");
  const applyPwaUpdate = functionSource("applyPwaUpdate");
  collectAssertions([
    ["pre-edit snapshot flush", () => assertContains(beginHistoryEdit, /await\s+persistStableAppDataSnapshot\s*\([\s\S]*?\)[\s\S]*?historyEditFlow\s*=/, "History editing must durably flush a cloned pre-edit snapshot before opening the temporary transaction")],
    ["edit-start lock cleanup", () => assertContains(beginHistoryEdit, /try\s*\{[\s\S]*?await\s+persistStableAppDataSnapshot[\s\S]*?finally\s*\{[\s\S]*?historyEditStartPending\s*=\s*false/, "History editing must retain and finally clear its start lock across initial persistence and reconciliation")],
    ["edit-start identity capture", () => assertContains(beginHistoryEdit, /dataRevision[\s\S]*?activeTab[\s\S]*?activeSessionId[\s\S]*?viewingHistorySessionId/, "History editing must capture the revision and complete navigation identity before awaiting persistence")],
    ["edit-start awaited reconciliation", () => assertContains(beginHistoryEdit, /editContextChanged[\s\S]*?cloneAppData\s*\(\s*data\s*\)[\s\S]*?await\s+persistStableAppDataSnapshot[\s\S]*?not durable[\s\S]*?export[\s\S]*?retry/i, "A concurrent mutation or navigation must await current-state persistence and disclose dual-store failure without claiming durability")],
    ["controllerchange transaction guard", () => assertContains(registerPwaServiceWorker, /controllerchange[\s\S]*?historyEditFlow[\s\S]*?pendingControllerReload/, "An externally activated service worker must defer reload while submitted-history editing is active")],
    ["explicit update persistence gate", () => assertContains(applyPwaUpdate, /persisted\s*=\s*await\s+persistStableAppDataSnapshot[\s\S]*?if\s*\(\s*!persisted\s*\)[\s\S]*?return\s+false[\s\S]*?pendingControllerReload/, "An explicit deferred update must refuse to reload when neither persistence layer can save the stable snapshot")],
    ["explicit deferred reload", () => assertContains(applyPwaUpdate, /pendingControllerReload[\s\S]*?location\.reload\s*\(/, "A deferred controller reload must remain behind the explicit Update action after editing ends")]
  ]);
});

test("startup resolves IndexedDB and local fallback by valid data revision", () => {
  const loadData = functionSource("loadData");
  const candidate = functionSource("storedAppDataCandidate");
  const readIndexedValue = functionSource("readIndexedValue");
  const persistStable = functionSource("persistStableAppDataSnapshot");
  const saveData = functionSource("saveData");
  const permanentlyClearLocalData = functionSource("permanentlyClearLocalData");
  const resolve = evaluateFunction("resolveStoredAppDataCandidates");
  const indexed = { source: "indexeddb", revision: 4, canonicalContent: "indexed", timestamp: 100 };
  const local = { source: "localstorage", revision: 4, canonicalContent: "local", timestamp: 200 };
  collectAssertions([
    ["candidate shape guard", () => assertContains(candidate, /typeof\s+value\s*!==\s*["']object["'][\s\S]*?Array\.isArray[\s\S]*?dataRevision/, "Persistence recovery must reject corrupt non-object sources and validate their revision")],
    ["indexed metadata reader", () => assertContains(readIndexedValue, /await\s+readIndexedRecord/, "Existing IndexedDB value callers must delegate through the metadata-preserving record reader")],
    ["newer timestamp wins equal revision", () => assert.equal(resolve(indexed, local).selected.source, "localstorage")],
    ["unorderable divergence conflicts", () => assert.equal(resolve(indexed, { ...local, timestamp: 100 }).conflict, true)],
    ["missing timestamp divergence conflicts", () => assert.equal(resolve(indexed, { ...local, timestamp: null }).conflict, true)],
    ["identical content dedupes", () => assert.equal(resolve(indexed, { ...local, canonicalContent: "indexed", timestamp: null }).identical, true)],
    ["always inspect local fallback", () => assert.doesNotMatch(loadData, /if\s*\(\s*!stored\s*\)[\s\S]{0,180}localStorage\.getItem/, "A readable IndexedDB value must not prevent inspection of the local fallback")],
    ["higher revision selection", () => assertContains(loadData, /localCandidate\.revision\s*>\s*indexedCandidate\.revision/, "The newer valid local fallback must outrank stale readable IndexedDB")],
    ["conflict skips promotion", () => assertContains(loadData, /appDataPersistenceConflict[\s\S]*?if\s*\(\s*!appDataPersistenceConflict[\s\S]*?await\s+writeIndexedValue/, "Unorderable valid copies must remain outside destructive promotion and cleanup")],
    ["stable save preserves alternate", () => assertContains(persistStable, /appDataPersistenceConflict[\s\S]*?localStorage\.removeItem|localStorage\.removeItem[\s\S]*?appDataPersistenceConflict/, "Stable snapshots must not remove a conflict-preserved local alternate")],
    ["ordinary save preserves alternate", () => assertContains(saveData, /appDataPersistenceConflict[\s\S]*?localStorage\.removeItem|localStorage\.removeItem[\s\S]*?appDataPersistenceConflict/, "Ordinary saves must not remove a conflict-preserved local alternate")],
    ["promotion precedes cleanup", () => assertContains(loadData, /await\s+writeIndexedValue\s*\(\s*["']app-data["'][\s\S]*?localStorage\.removeItem\s*\(\s*STORAGE_KEY\s*\)/, "Local fallback cleanup must occur only after successful awaited IndexedDB promotion")],
    ["confirmed clear releases preservation", () => assertContains(permanentlyClearLocalData, /localStorage\.removeItem\s*\(\s*STORAGE_KEY[\s\S]*?appDataPersistenceConflict\s*=\s*null/, "Explicitly confirmed Clear All must release the in-memory conflict-preservation guard after deleting both stores")]
  ]);
});

test("loaded-data normalization uses an indexed set lookup", () => {
  const source = functionSource("normalizeLoadedData");
  collectAssertions([
    ["no quadratic set scan", () => assert.doesNotMatch(source, /model\.sets\.filter\s*\(\s*\(set\)\s*=>\s*set\.exerciseId\s*===\s*exercise\.id/, "Do not rescan every set for every exercise")],
    ["set index constructed", () => assertContains(source, /(?:setsByExercise|setIdsByExercise|setsForExerciseById)[\s\S]{0,180}new Map\s*\(|new Map\s*\([\s\S]{0,180}(?:setsByExercise|setIdsByExercise|setsForExerciseById)/, "Build a Map keyed by exercise ID before normalizing exercises")],
    ["indexed lookup used", () => assertContains(source, /(?:setsByExercise|setIdsByExercise|setsForExerciseById)\.get\s*\(\s*exercise\.id\s*\)/, "Exercise normalization must retrieve sets from the index")]
  ]);
});

test("evidence startup fetches public research at most once", () => {
  const source = functionSource("initializePrescriptionEvidence");
  const researchLoads = source.match(/loadEvidenceFromUrls\s*\(\s*\{\s*researchBaseUrl/g) || [];
  assert.ok(researchLoads.length <= 1, `initializePrescriptionEvidence performs ${researchLoads.length} full research loads; optional personal-source probing must reuse one public research bundle`);
});

(async function run() {
  let passed = 0;
  const failures = [];
  for (const item of tests) {
    try {
      await item.fn();
      passed += 1;
      console.log(`PASS ${item.name}`);
    } catch (error) {
      failures.push({ name: item.name, error });
      console.error(`FAIL ${item.name}`);
      console.error(String(error?.message || error));
    }
  }
  console.log(`\nApp integration red harness: ${passed}/${tests.length} contracts currently pass.`);
  if (failures.length) {
    console.error(`${failures.length} frontend integration contract(s) remain red.`);
    process.exitCode = 1;
  }
})();
