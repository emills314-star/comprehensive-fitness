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

test("ordinary substitution identity uses an exact unambiguous public record without hidden exclusion state", () => {
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
  assert.doesNotMatch(html, /function safetySubstituteContext|data\.settings\.excludedExerciseIds/, "Deleted global exercise exclusions must not remain as a hidden logging constraint");
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
    ["explicit input only", () => assertContains(source, /if \(!hasDirectIllness && !hasDirectPain\) return null/, "No directly recorded pain or illness must produce a safety candidate")],
    ["reason separation", () => {
      assertContains(source, /hasDirectIllness[\s\S]*?reasonCode:\s*"explicit_illness"/, "Direct illness must retain its recorded reason code");
      assertContains(source, /hasDirectPain[\s\S]*?reasonCode:\s*"explicit_pain_or_injury"/, "Direct pain must retain its recorded reason code");
    }],
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
      sessions: [], exercises: [], sets: [], settings: { weightUnit: "lb", defaultRestSeconds: 90 }
    },
    defaultRecovery: () => ({}),
    hasActiveWorkout: () => false,
    activeSession: () => null,
    todayIso: () => "2026-07-14",
    isSessionSubmitted: () => false,
    WORKOUT_DURATION_SEMANTICS_VERSION: "comprehensive-fitness-workout-duration/1.0.0",
    cleanRecovery: (value) => value,
    createSession: () => ({ id: "session-1", date: "2026-07-14", title: "Synthetic template" }),
    measurePerformance: (_label, operation) => operation(),
    resolveWorkoutExceptions: () => [],
    inferResistanceType: () => "cable",
    stableTargetForTemplateExercise: () => ({
      sets: 2, reps: 8, repLow: 6, repHigh: 10, weight: 40, weightUnit: "lb", rpe: 8,
      restSeconds: 90, mode: "stable-target", adjusted: false
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
    exerciseIdentityFields: () => ({ performanceExerciseId: "synthetic_press" }),
    stableSetTypesForWorkoutStart: () => [{
      id: "straight-1", type: "straight", setCount: 2, repMin: 6, repMax: 10,
      rpeMin: 7, rpeMax: 8, restSeconds: 90, countsTowardScore: true, countsTowardVolume: true
    }],
    id: () => `generated-${++nextId}`,
    getMostRecentWorkoutSets: () => [],
    factualSetPrefillForWorkoutStart: (_exercise, _target, setType, setTypeIndex, sequenceIndex) => ({
      setType: "straight", setTypeIndex, sequenceIndex, reps: 8, weight: 40, rpe: 8,
      repMin: 6, repMax: 10, rpeMin: 7, rpeMax: 8, restSeconds: setType.restSeconds,
      previousComparableSet: null
    }),
    normalizeSetTypeCode: (value) => value || "straight",
    setTypeLabels: { straight: "Working set" },
    createSet: (exerciseId, setNumber, source) => ({ id: `set-${setNumber}-${nextId}`, exerciseId, setNumber, ...source }),
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
  context.startWorkoutDuration = evaluateFunction("startWorkoutDuration", context);
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
  const handling = functionSource("handleResolvedActionChoice");
  collectAssertions([
    ["candidate list", () => assertContains(resolver, /candidates:\s*\[safetyCandidate\]\.filter\(Boolean\)/, "The current resolver boundary must receive only the independently approved direct safety candidate")],
    ["prior decisions", () => assertContains(resolver, /priorDecisions:\s*Array\.isArray\(session\.resolvedActions\)/, "Reevaluation must preserve the prior canonical decision chain")],
    ["explicit observation", () => assertContains(resolver, /explicitSafetyObservation:\s*safetyCandidate \?/, "The deterministic safety fallback must stay inside the canonical resolver boundary")],
    ["explicit handling boundary", () => {
      assertContains(handling, /action\.handling\s*!==\s*["']pending["']/, "Only pending decisions may accept an explicit handling choice");
      assertContains(handling, /exceptionResolverApi\.applyDecisionHandling\(action,\s*handling\)/, "Explicit user handling must be persisted structurally through the choice handler");
      assert.doesNotMatch(resolver, /applyDecisionHandling/, "Resolver evaluation must not auto-handle a pending decision");
    }],
    ["no program-profile inputs", () => assert.doesNotMatch(`${resolver}\n${safetyCandidate}`, /trainingGoal|nutritionPhase|experienceLevel|availableEquipment|plannedWorkingSets|sessionDurationMinutes|includedMuscleGroupIds|excludedExerciseIds/, "The canonical exception path must not recreate the deleted program-prescription request")],
    ["no exact normal target", () => assert.doesNotMatch(`${resolver}\n${safetyCandidate}`, /\b(?:sets|reps|repRange|targetRpe|weight|load)\s*:/, "The canonical exception path must not create exact normal targets")]
  ]);
});

test("canonical exercise identity resolution is registry-first and exhaustive", () => {
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
  collectAssertions([
    ["no regex-only canonical fallback", () => assert.doesNotMatch(canonical, /return\s+researchId\s*\|\|\s*normalized/, "Known public exercises must resolve through a canonical registry instead of becoming regex-normalized pseudo IDs")],
    ["no deleted analytics coupling", () => assert.doesNotMatch(canonical, /weeklyMuscleVolume|hypertrophyAnalysis|calculateExerciseMuscleContributions/, "Canonical identity must remain independent from deleted volume and hypertrophy analysis")]
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
  context.stableCustomPerformanceExerciseId = evaluateFunction("stableCustomPerformanceExerciseId", context);
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
  context.stableCustomPerformanceExerciseId = evaluateFunction("stableCustomPerformanceExerciseId", context);
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

test("Strong CSV import requires explicit source-unit provenance and preserves it", () => {
  const prepareStrongSource = functionSource("prepareStrongCsvImport");
  const importStrongSource = functionSource("importStrongCsv");
  const importFileSource = functionSource("importDataFile");
  const applySource = functionSource("applyPendingImport");
  collectAssertions([
    ["explicit source unit", () => assertContains(prepareStrongSource, /normalizeStrongImportWeightUnit\s*\(\s*sourceWeightUnit\s*\)/, "Strong import must validate an explicit source unit")],
    ["per-set provenance", () => assertContains(prepareStrongSource, /weightUnit\s*,/, "Strong sets must store the selected source unit")],
    ["raw-source provenance", () => assertContains(prepareStrongSource, /originalText:\s*text[\s\S]{0,220}weightUnit/, "Retained Strong source metadata must store the selected unit")],
    ["versioned raw source", () => assertContains(prepareStrongSource, /importVersion:\s*STRONG_IMPORT_CONTRACT_VERSION/, "Retained Strong source metadata must store the import contract version")],
    ["deterministic duplicate", () => assertContains(prepareStrongSource, /retainedRawImport[\s\S]{0,1400}No data was changed/, "An exact duplicate Strong source must be a deterministic no-op")],
    ["pending preview", () => assertContains(importStrongSource, /pendingImport\s*=\s*prepareStrongCsvImport[\s\S]*state:\s*"preview"/, "Strong import must stage an in-memory preview rather than commit")],
    ["file wiring", () => assertContains(importFileSource, /importStrongCsv\s*\(\s*text\s*,\s*strongImportWeightUnit\s*,/, "The file importer must pass the explicit Strong unit choice")],
    ["explicit apply", () => assertContains(applySource, /writeIndexedValuesAtomically[\s\S]*operation\.candidate/, "Only the explicit Apply path may durably write the staged candidate")],
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
  const makeContext = ({ conflict = false, loaderError = null, snapshotError = null } = {}) => {
    const events = { writes: [], removals: [], renders: 0, snapshotChecks: 0, identityInstalls: 0, invalidations: 0, runtimeSaves: 0 };
    const engineSentinel = { id: "engine-sentinel" };
    const cacheSentinel = { id: "cache-sentinel" };
    const context = {
      importInProgress: false,
      importAttempt: 0,
      importStatus: { state: "idle", message: "" },
      pendingImport: null,
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
      researchOnlyBundleForImport: async () => {
        if (loaderError) throw new Error(loaderError);
        return { bundle: { personal: {} }, engine: { id: "prepared-engine" }, exerciseDatabase: [] };
      },
      normalizeLoadedData: (value) => structuredClone(value),
      nextMonotonicImportRevision: () => 42,
      validateImportedExecutableRecommendationSnapshots: () => {
        events.snapshotChecks += 1;
        if (snapshotError) throw new Error(snapshotError);
      },
      assertCandidateHasRecoverableExport: () => true,
      collectionCounts: (value) => ({ sessions: value.sessions.length, exercises: value.exercises.length, sets: value.sets.length, templates: value.templates.length }),
      validateActiveWorkoutDraftEnvelope: () => { throw new Error("Draft validation was not expected"); },
      localStorage: { removeItem: (key) => events.removals.push(key) },
      STORAGE_KEY: "comprehensive-fitness-data",
      data: { dataRevision: 41, sessions: [{ id: "runtime-session-sentinel" }], evidenceSentinel: "unchanged" },
      templateNumericDrafts: new Map(),
      prescriptionEngine: engineSentinel,
      prescriptionSnapshotCache: new Map([["sentinel", cacheSentinel]]),
      installExerciseIdentityCompatibility: () => { events.identityInstalls += 1; context.prescriptionEngine = { id: "installed-engine" }; return true; },
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

  const unavailable = makeContext({ loaderError: "Synthetic compatibility catalog unavailable" });
  const unavailableData = unavailable.context.data;
  const unavailableEngine = unavailable.context.prescriptionEngine;
  await unavailable.run(file);
  assert.equal(unavailable.events.snapshotChecks, 0, "Snapshot evaluation must wait for the compatibility catalog");
  assert.equal(unavailable.events.writes.length, 0, "A missing compatibility catalog must reject before IndexedDB write");
  assert.equal(unavailable.events.removals.length, 0, "A missing compatibility catalog must preserve the durable fallback");
  assert.equal(unavailable.events.identityInstalls, 0, "A missing compatibility catalog must preserve the current identity engine");
  assert.strictEqual(unavailable.context.data, unavailableData);
  assert.strictEqual(unavailable.context.prescriptionEngine, unavailableEngine);
  assert.match(unavailable.context.settingsMessage, /compatibility catalog unavailable/i);

  const invalid = makeContext({ snapshotError: "Synthetic invalid executable snapshot" });
  const invalidBefore = {
    data: invalid.context.data,
    bytes: JSON.stringify(invalid.context.data),
    engine: invalid.context.prescriptionEngine,
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
  assert.equal(invalid.events.identityInstalls, 0, "Rejected snapshot import must not replace the active identity engine");
  assert.equal(invalid.events.invalidations, 0, "Rejected snapshot import must not invalidate accepted-state caches");
  assert.equal(invalid.events.runtimeSaves, 0, "Rejected snapshot import must not persist altered runtime state");
  assert.strictEqual(invalid.context.data, invalidBefore.data);
  assert.equal(JSON.stringify(invalid.context.data), invalidBefore.bytes);
  assert.strictEqual(invalid.context.prescriptionEngine, invalidBefore.engine);
  assert.strictEqual(invalid.context.prescriptionSnapshotCache.get("sentinel"), invalidBefore.cacheValue);
  assert.equal(invalid.context.entityStructureRevision, invalidBefore.entityStructureRevision);
  assert.strictEqual(invalid.context.entityIndexCache, invalidBefore.entityIndexCache);
  assert.equal(invalid.context.activeSessionId, invalidBefore.activeSessionId);
  assert.equal(invalid.context.activeWorkoutId, invalidBefore.activeWorkoutId);
  assert.match(invalid.context.settingsMessage, /invalid executable snapshot/i);

  const accepted = makeContext();
  await accepted.run(file);
  assert.equal(accepted.events.snapshotChecks, 1);
  assert.equal(accepted.events.writes.length, 0, "A validated backup preview must perform zero durable writes");
  assert.equal(accepted.context.pendingImport.candidate.dataRevision, 42, "Previewed revision metadata must be replaced by the next local monotonic revision");
  assert.equal(accepted.context.data.dataRevision, 41, "Preview must not mutate live app data");
  assert.equal(accepted.context.importStatus.state, "preview");
  assert.equal(accepted.events.identityInstalls, 0, "Preview must not replace the identity-only runtime engine");
  assert.deepEqual(accepted.events.removals, [], "Preview must preserve every durable fallback");

  const importSource = functionSource("importDataFile");
  const applySource = functionSource("applyPendingImport");
  const exportSource = functionSource("exportData");
  collectAssertions([
    ["conflict gate precedes file read", () => assert.ok(importSource.indexOf("appDataPersistenceConflict") < importSource.indexOf("file.text()"), "Conflict import must fail before consuming untrusted bytes")],
    ["preview validates without writing", () => assert.doesNotMatch(importSource, /writeIndexedValue|writeIndexedValuesAtomically/, "File selection must only stage a validated in-memory preview")],
    ["explicit apply writes atomically", () => assertContains(applySource, /writeIndexedValuesAtomically\s*\(\s*writes\s*\)/, "Explicit Apply must own the durable replacement")],
    ["rollback follows durable replacement", () => assertContains(applySource, /durableReplacementWritten[\s\S]*rollbackWrites[\s\S]*writeIndexedValuesAtomically\s*\(\s*rollbackWrites\s*\)/, "A post-write finalization failure must restore the pre-import snapshot")],
    ["fallback cleanup follows write", () => assert.ok(applySource.indexOf("writeIndexedValuesAtomically(writes)") < applySource.indexOf("localStorage.removeItem(STORAGE_KEY)"), "Fallback cleanup must follow the successful atomic write")],
    ["active draft is optional and atomic", () => assertContains(applySource, /operation\.activeWorkoutDraft[\s\S]*active-workout-draft[\s\S]*writeIndexedValuesAtomically/, "An imported active draft must share the atomic app-data transaction")],
    ["absent backup draft clears stale recovery", () => assertContains(applySource, /operation\.replaceActiveWorkoutDraft[\s\S]*value:\s*operation\.activeWorkoutDraft \|\| null[\s\S]*removeItem\(ACTIVE_DRAFT_KEY\)/, "Applying a backup without a draft must atomically clear stale draft recovery")],
    ["export includes side-effect-free draft", () => assertContains(exportSource, /activeWorkoutDraftSnapshot\s*\(\s*\{\s*incrementSequence:\s*false\s*\}\s*\)[\s\S]*serializeBackupExport\s*\(\s*data\s*,\s*\{\s*activeWorkoutDraft\s*\}/, "Complete export must include a side-effect-free active-draft snapshot in the exact size-checked serialization")],
    ["export identifies selected copy", () => assertContains(exportSource, /selected app-data copy only[\s\S]*?alternate[\s\S]*?not included/i, "Conflict export must disclose both selected scope and excluded alternate")]
  ]);
});

test("workout submission acceptance is shared by duration finalization and the reentrant idempotency boundary", () => {
  const session = { id: "session-1", date: "2026-07-15", submitted: false, workoutPrescription: null };
  const context = {
    data: { sessions: [session], exercises: [], recommendationHistory: [], manualOverrides: [], dataRevision: 1 },
    workoutSubmissionsInProgress: new Set(),
    timer: null,
    timerCompleteNotice: null,
    restNavigationState: null,
    isoNow: () => "2026-07-15T00:00:00.000Z",
    startWorkoutDuration: (currentSession) => ({ ...currentSession, activeDurationMs: 90_000 }),
    finalizeWorkoutDurationSession: (currentSession) => ({ ...currentSession, durationSeconds: 90 }),
    submitWorkoutPrs: null,
    calculateWorkoutAnalysis: () => ({ grade: "B" }),
    evaluateWorkoutOverrideOutcomes: () => ({ exercises: [], recommendationHistory: [], manualOverrides: [], evaluatedByRecommendation: new Map() }),
    pendingSubmitSessionId: "session-1",
    completedSummarySessionId: "",
    activeWorkoutId: "session-1",
    clearActiveWorkoutDraft: () => { context.draftClears += 1; },
    commit: (nextData) => { context.commits += 1; context.data = { ...nextData, dataRevision: context.data.dataRevision + 1 }; },
    cancelTimer: () => {},
    commits: 0,
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
  assert.equal(context.draftClears, 1, "The active draft must clear once");
  assert.equal(context.data.sessions[0].submitted, true);
  assert.equal(workoutSubmissionIsAccepted("session-1"), false, "A submitted session must not be accepted again");
  assert.equal(context.workoutSubmissionsInProgress.size, 0, "The reentrancy lock must release after completion");
  collectAssertions([
    ["submit uses shared predicate", () => assertContains(functionSource("submitWorkout"), /if\s*\(\s*!workoutSubmissionIsAccepted\s*\(\s*sessionId\s*\)\s*\)\s*return/, "submitWorkout must use the shared acceptance predicate")],
    ["submit owns duration finalization", () => assertContains(functionSource("submitWorkout"), /const\s+session\s*=\s*finalizeWorkoutDurationSession\s*\(\s*startWorkoutDuration\s*\(\s*sourceSession\s*\)\s*\)/, "submitWorkout must finalize active duration inside the same idempotent completion boundary")],
    ["router invokes submission once", () => assertContains(html, /if\s*\(\s*action\s*===\s*["']confirm-submit-workout["']\s*\)\s*\{[\s\S]{0,120}submitWorkout\s*\(\s*activeSessionId\s*\)\s*;[\s\S]{0,20}\}/, "The confirm route must delegate the entire atomic completion to submitWorkout")]
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

test("cloud workout copy is decommissioned while notification delivery remains independent", () => {
  const defaultsStart = html.indexOf("const defaultSettings");
  assert.notEqual(defaultsStart, -1, "Missing defaultSettings");
  const defaults = html.slice(defaultsStart, defaultsStart + 3500);
  const normalize = functionSource("normalizeLoadedData");
  const cleanup = functionSource("cleanupLegacyWorkoutCloudData");
  const notifications = functionSource("enablePushNotifications");
  const registration = functionSource("registerPushSubscription");
  collectAssertions([
    ["no current defaults", () => assert.doesNotMatch(defaults, /cloudWorkoutSyncConsent|workoutCloudSync/, "Cloud-copy consent must not remain a current setting")],
    ["legacy aliases discarded", () => assertContains(normalize, /delete model\.settings\.cloudWorkoutSyncConsent[\s\S]*delete model\.settings\.workoutCloudSync[\s\S]*delete model\.settings\.workoutCloudSyncConsentVersion/, "Legacy cloud settings must be discarded during normalization")],
    ["no queue or enable functions", () => assert.doesNotMatch(html, /function\s+(?:queueActiveWorkoutSync|flushWorkoutSyncQueue|setCloudWorkoutSyncConsent|ensureInstallationAuthorization)\s*\(/, "No client upload or enable path may remain")],
    ["no upload routes", () => assert.doesNotMatch(html, /\/api\/sync\/(?:authorize|workout)/, "The client must never call disabled upload or authorization routes")],
    ["cleanup only", () => assertContains(cleanup, /\/api\/sync\/consent[\s\S]*enabled:\s*false/, "The isolated compatibility path may only request cleanup")],
    ["no consent UI", () => assert.doesNotMatch(html, /data-action=["']cloud-workout-sync-consent["']|Optional workout cloud copy/, "Settings must not offer cloud-copy consent")],
    ["notification setup remains", () => {
      assertContains(notifications, /registerPushSubscription/, "Notification setup must retain its registration step");
      assertContains(registration, /\/api\/push\/register/, "Notification registration must retain the push-only endpoint");
    }],
    ["notification privacy remains", () => assertContains(html, /Private changes the visible notification body only[\s\S]*server-side timer record/, "Decommissioning cloud copy must not weaken push privacy disclosure")]
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

test("two-destination architecture uses one factual Progress surface", () => {
  collectAssertions([
    ["two destination IDs", () => assertContains(html, /const primaryTabIds = \["today", "progress"\]/, "Primary navigation must contain only Today and Progress")],
    ["two navigation buttons", () => assert.equal((functionSource("render").match(/navButton\(/g) || []).length, 2, "The persistent shell must render exactly two primary navigation buttons")],
    ["single progress renderer", () => assertContains(functionSource("renderProgress"), /return renderLiftProgress\(\)/, "Progress must delegate to the single factual history and performance surface")],
    ["bounded progress modes", () => assertContains(html, /data-action="set-progress-mode"[\s\S]*Sessions[\s\S]*Exercises/, "Progress must expose only the approved Sessions and Exercises modes")],
    ["factual progress content", () => assertContains(functionSource("renderLiftProgress"), /progressMode === "exercises" \? renderProgressExercises\(\) : renderProgressSessions\(\)/, "Progress must route between the approved session history and scoped exercise surfaces")],
    ["removed top-level renderers", () => assert.doesNotMatch(html, /function renderDashboard\(|function renderReview\(/, "Superseded Dashboard and Charts top-level renderers must be removed")],
    ["removed reskin selectors", () => assert.doesNotMatch(html, /quiet-coach-hero|app-module/, "The previous reskin component selectors must not remain in source")],
    ["secondary contexts are not primary", () => assert.doesNotMatch(functionSource("render"), /navButton\("(?:routines|settings)"/, "Routines and Settings must remain contextual, not persistent destinations")],
    ["current destination allowlist", () => assertContains(html, /const currentDestinationIds = \["today", "progress", "workout", "routines", "settings"\]/, "Only current destinations may resolve")],
    ["no legacy destination redirects", () => assert.doesNotMatch(functionSource("normalizedDestination"), /plan|more|data|dashboard|charts|lift|progress-overview|progress-lifts|progress-history/, "Deleted destination aliases must not remain in the destination normalizer")]
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
  const openDialog = functionSource("requestCancelWorkout");
  const closeDialog = functionSource("closeCancelWorkout");
  const exercise = functionSource("renderExercise");
  const actionTags = [...exercise.matchAll(/<button[^>]*data-action="(?:move-exercise|delete-exercise)"[^>]*>/g)].map((match) => match[0]);
  const equipmentGroups = [...html.matchAll(/<section\s+class="equipment-picker"[^>]*>/g)].map((match) => match[0]);
  const scopeGroups = [...html.matchAll(/<section\s+class="muscle-scope-panel"[^>]*>/g)].map((match) => match[0]);
  collectAssertions([
    ["skip link", () => assertContains(html, /<a[^>]+href=["']#main-content["'][^>]*>[^<]*(?:skip|content)/i, "Provide a keyboard-visible skip link to main content")],
    ["main target", () => assertContains(html, /<main[^>]+id=["']main-content["'][^>]*tabindex=["']-1["']|<main[^>]+tabindex=["']-1["'][^>]*id=["']main-content["']/, "The main content target must be programmatically focusable")],
    ["primary-tab focus", () => assertContains(setTab, /\.focus\s*\(/, "Primary-tab navigation must move focus to the new view heading or main region")],
    ["dialog trigger captured", () => assertContains(openDialog, /document\.activeElement|returnFocus|focusOrigin|dialogTrigger/i, "Opening the destructive confirmation must capture its focus origin")],
    ["dialog close restores focus", () => assertContains(closeDialog, /\.focus\s*\(|restoreFocus/i, "Closing the destructive confirmation must restore focus to its trigger")],
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

test("normal startup installs identity compatibility without analytical evidence initialization", () => {
  const startup = functionSource("initializeExerciseIdentityCompatibility");
  const catalog = functionSource("loadExerciseIdentityCatalog");
  const importValidation = functionSource("loadImportValidationResearch");
  collectAssertions([
    ["identity-only boot call", () => assertContains(html, /await\s+initializeExerciseIdentityCompatibility\s*\(\s*\)/, "Startup must await the identity-only compatibility boundary")],
    ["single boot asset", () => assertContains(catalog, /exercise_database\.json/, "Normal boot must load the public exercise identity catalog")],
    ["no import map at boot", () => assert.doesNotMatch(catalog + startup, /exercise_muscle_map|loadEvidenceFromUrls/, "Normal boot must not load analytical evidence or the import-only relationship map")],
    ["lazy import map", () => assertContains(importValidation, /loadExerciseIdentityCatalog\(\)[\s\S]*exercise_muscle_map\.json/, "Import validation must reuse the identity catalog and lazily add only the relationship map")],
    ["removed evidence status", () => assert.doesNotMatch(html, /prescriptionEvidenceStatus|initializePrescriptionEvidence|loadPrescriptionEvidence/, "The current runtime must not retain the deleted evidence initialization/status path")]
  ]);
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
