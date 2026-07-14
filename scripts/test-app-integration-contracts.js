"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const TEST_ROOT = path.resolve(__dirname, "..");
const APP_ROOT = process.env.APP_CONTRACT_ROOT
  ? path.resolve(process.env.APP_CONTRACT_ROOT)
  : TEST_ROOT;
const html = fs.readFileSync(path.join(APP_ROOT, "index.html"), "utf8");
const publicExercises = require(path.join(APP_ROOT, "research_database", "exports", "json", "exercise_database.json"));
const prescriptionApi = require(path.join(APP_ROOT, "prescription-engine.js"));
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

test("readiness adapter preserves explicit safety inputs without inventing fatigue", () => {
  const source = functionSource("prescriptionReadiness");
  collectAssertions([
    ["illness passthrough", () => assertContains(source, /\billness\s*:\s*(?:Boolean\s*\()?\s*recovery\.illness/, "prescriptionReadiness must pass the explicit illness value")],
    ["pain passthrough", () => assertContains(source, /\bpain\s*:\s*(?:Boolean\s*\()?\s*recovery\.pain/, "prescriptionReadiness must pass an explicit pain value independently of free text")],
    ["affected muscle passthrough", () => assertContains(source, /\baffectedMuscle\s*:\s*recovery\.affectedMuscle/, "prescriptionReadiness must identify the affected muscle")],
    ["note is not fatigue", () => assert.doesNotMatch(source, /fatigue\s*:\s*recovery\.outsideBandNote/, "A free-text note must not fabricate a fatigue score")],
    ["note is not persistence", () => assert.doesNotMatch(source, /consecutiveLowReadinessDays\s*:\s*recovery\.outsideBandNote/, "A free-text note must not fabricate multiple low-readiness days")],
    ["note is not energy availability", () => assert.doesNotMatch(source, /energyAvailabilityLow\s*:[^\n]*outsideBandNote/, "A free-text note must not infer low energy availability")]
  ]);
});

test("safety adapters distinguish workout illness from affected-exercise pain and erase executable targets", () => {
  const readiness = evaluateFunction("prescriptionReadiness", {
    cleanRecovery: (value) => ({
      sleepHours: "", sleepQuality: "", hrv: "", restingHr: "", soreness: "",
      nutritionStatus: "", proteinStatus: "", outsideBandNote: "", illness: false,
      pain: false, affectedMuscle: "", ...value
    }),
    readinessBaseline: () => ({}),
    data: { settings: { nutritionPhase: "maintenance" } }
  });
  const illnessReadiness = plain(readiness({ illness: true, pain: false, affectedMuscle: "" }, []));
  const painReadiness = plain(readiness({ illness: false, pain: true, affectedMuscle: "chest" }, []));
  assert.equal(illnessReadiness.illness, true, "Illness must remain an explicit whole-workout safety input");
  assert.equal(illnessReadiness.pain, false, "Illness must not fabricate pain");
  assert.equal(painReadiness.illness, false, "Pain must not fabricate illness");
  assert.equal(painReadiness.pain, true, "Pain must remain an explicit affected-exercise safety input");
  assert.equal(painReadiness.affectedMuscle, "chest", "Pain scope must preserve the affected muscle");

  const converter = evaluateFunction("legacyTargetFromSnapshot", {
    data: { settings: { weightUnit: "lb" } },
    inferResistanceType: () => "external",
    convertWeightValue: (value) => value,
    isBodyweightResistance: () => false,
    progressionProfileForExercise: () => ({ increment: 5 }),
    legacyRecommendationFromSnapshot: () => ({}),
    targetText: () => ""
  });
  const blocked = (reason, scope) => ({
    recommendationId: `blocked-${reason}`,
    basePrescription: {},
    finalPrescription: {
      exerciseId: "ex_barbell_bench_press",
      recommendationType: reason === "illness" ? "hold" : "substitute",
      executionBlocked: true,
      workingSets: { min: 0, target: 0, max: 0 },
      repRange: { min: 6, target: 8, max: 10 },
      targetRpe: { min: 7, max: 8 },
      restSeconds: { min: 120, target: 180, max: 240 },
      setStructure: "straight_sets",
      userExplanation: "Synthetic safety fixture",
      confidence: "high",
      safetyRestriction: { schemaVersion: "hard-safety/1.0.0", status: "blocked", reason, scope }
    }
  });
  for (const [reason, scope] of [["illness", "workout"], ["pain", "exercise"]]) {
    const target = plain(converter(blocked(reason, scope), { name: "Bench Press", resistanceType: "external" }));
    assert.equal(target.executionBlocked, true, `${reason} must remain explicitly non-executable in the app target`);
    assert.equal(target.safetyRestriction?.scope, scope, `${reason} must retain its ${scope} safety scope`);
    for (const field of ["sets", "reps", "repLow", "repHigh", "weight", "addedLoad", "assistanceLoad"]) {
      assert.equal(Number(target[field] || 0), 0, `Blocked ${reason} target leaked executable ${field}`);
    }
    assert.deepEqual(target.warmups || [], [], `Blocked ${reason} target leaked warm-ups`);
    assert.deepEqual(target.executableActions || [], [], `Blocked ${reason} target leaked executable actions`);
  }
});

test("hard-safety mutation policy blocks illness, unsited pain, matching pain, and unresolved taxonomy", () => {
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
  const decision = (action, recovery, exercise = null, exerciseMuscles = [], taxonomyResolved = true) => plain(decide(action, {
    recovery,
    exercise,
    exerciseMuscles,
    taxonomyResolved
  }));
  const expectBlocked = (result, scope, reason, label) => {
    assert.equal(result?.allowed, false, `${label} must refuse the mutation`);
    assert.equal(result?.scope, scope, `${label} must expose ${scope} scope`);
    assert.equal(result?.reason, reason, `${label} must expose the ${reason} restriction`);
  };

  for (const action of executableActions) {
    expectBlocked(
      decision(action, { illness: true, pain: false, affectedMuscle: "" }),
      "workout",
      "illness",
      `illness ${action}`
    );
    expectBlocked(
      decision(action, { illness: false, pain: true, affectedMuscle: "" }),
      "workout",
      "pain",
      `pain without an affected area ${action}`
    );
  }

  const chestPain = { illness: false, pain: true, affectedMuscle: "Chest" };
  expectBlocked(
    decision("add-set", chestPain, { id: "bench", name: "Barbell Bench Press" }, ["Chest", "Triceps"], true),
    "exercise",
    "pain",
    "localized matching exercise"
  );
  assert.equal(
    decision("add-set", chestPain, { id: "leg-press", name: "Leg Press" }, ["Quadriceps", "Glutes"], true)?.allowed,
    true,
    "A catalog-resolved exercise outside the affected area must remain usable"
  );
  expectBlocked(
    decision("add-set", chestPain, { id: "unknown", name: "Unmapped Synthetic Movement" }, [], false),
    "exercise",
    "pain",
    "unresolved exercise taxonomy"
  );
});

test("Lift render and mutation dispatch paths both enforce the hard-safety policy", () => {
  const guardPattern = /workoutMutationSafetyDecision|workoutSafetyMutationDecision|workoutMutationSafetyPolicy|assertWorkoutMutationAllowed|guardWorkoutMutation/;
  const renderSources = [functionSource("renderWorkout"), functionSource("renderExercise"), functionSource("renderSet")].join("\n");
  const namedMutators = ["addExercise", "addSet", "toggleSetCompletion", "toggleSetSkipped", "startTimer"];
  const clickStart = html.indexOf('root.addEventListener("click"');
  assert.notEqual(clickStart, -1, "Missing delegated Lift click handler");
  const clickEnd = html.indexOf('root.addEventListener("change"', clickStart);
  const clickHandler = html.slice(clickStart, clickEnd > clickStart ? clickEnd : clickStart + 40000);
  collectAssertions([
    ["blocked controls", () => assertContains(renderSources, guardPattern, "Blocked Lift controls must be omitted or disabled from the same executable policy used by mutations")],
    ["delegated event guard", () => assertContains(clickHandler, guardPattern, "Forged click events must be refused before reaching Add Exercise/Set/Warm-up/Duplicate/toggle/timer handlers")],
    ...namedMutators.map((name) => [name, () => assertContains(functionSource(name), guardPattern, `${name} must independently refuse blocked data mutations`)]),
    ["all mutation actions remain covered", () => executableMutationActions().forEach((action) => assertContains(clickHandler, new RegExp(`(?:action\\s*===\\s*["']${action}["']|["']${action}["'])`), `Missing ${action} mutation path`))]
  ]);
});

function executableMutationActions() {
  return ["add-exercise", "add-set", "add-warmup-set", "duplicate-set", "toggle-set", "toggle-skip-set", "start-timer"];
}

test("confirmed pain-free substitute stays distinct, catalog-backed, equipment-compatible, and auditable", () => {
  const engine = prescriptionApi.createPrescriptionEngine({ researchData: publicResearchData() });
  const originalId = "ex_barbell_bench_press";
  const substituteId = "ex_incline_dumbbell_press";
  const substituteRecord = publicExercises.find((item) => item.exercise_id === substituteId);
  assert.ok(substituteRecord, "Synthetic safety test requires a public catalog substitute");
  const blocked = engine.prescribeExercise({
    exerciseId: originalId,
    muscleGroupId: "chest",
    readiness: { pain: true, affectedMuscle: "chest" },
    availableEquipment: ["all"],
    trainingGoal: "hypertrophy",
    experienceLevel: "intermediate",
    nutritionPhase: "maintenance",
    createdAt: "2026-07-14T12:00:00.000Z"
  });
  const options = {
    allowedSafetySubstituteIds: [substituteId],
    exerciseCatalog: [substituteRecord],
    availableEquipment: ["all"],
    createdAt: "2026-07-14T12:05:00.000Z"
  };
  const substitute = { exerciseId: substituteId, researchExerciseId: substituteId, reason: "Synthetic pain-free alternative" };

  assert.throws(
    () => engine.applyManualOverride(blocked, substitute, options),
    /pain-free confirmation|painFreeConfirmed/i,
    "A substitute without explicit painFreeConfirmed=true must remain blocked"
  );
  assert.throws(
    () => engine.applyManualOverride(blocked, { ...substitute, exerciseId: originalId, researchExerciseId: originalId, painFreeConfirmed: true }, { ...options, allowedSafetySubstituteIds: [originalId], exerciseCatalog: [publicExercises.find((item) => item.exercise_id === originalId)] }),
    /different exercise|painful original/i,
    "The painful original cannot be re-labelled as its own safe alternative"
  );
  assert.throws(
    () => engine.applyManualOverride(blocked, { ...substitute, painFreeConfirmed: true }, { ...options, availableEquipment: ["bodyweight"] }),
    /equipment/i,
    "An equipment-incompatible alternative must remain blocked"
  );

  const resolved = engine.applyManualOverride(blocked, { ...substitute, painFreeConfirmed: true }, options);
  assert.equal(blocked.finalPrescription.executionBlocked, true, "Resolving an alternative must not mutate the original blocked snapshot");
  assert.equal(blocked.finalPrescription.exerciseId, originalId, "The original blocked identity must remain unchanged");
  assert.equal(resolved.finalPrescription.executionBlocked, false, "Only the validated substitute may become executable");
  assert.equal(resolved.finalPrescription.exerciseId, substituteId);
  assert.equal(resolved.finalPrescription.safetyRestriction.originalExerciseId, originalId);
  assert.equal(resolved.finalPrescription.safetyRestriction.painFreeConfirmed, true);

  const frontendOverride = functionSource("applyPrescriptionOverride");
  collectAssertions([
    ["explicit confirmation", () => assertContains(frontendOverride, /painFreeConfirmed/, "The UI adapter must forward explicit pain-free confirmation")],
    ["engine candidate allowlist", () => assertContains(frontendOverride, /allowedSafetySubstituteIds/, "The UI adapter must pass an engine-validated safety-substitute allowlist")],
    ["equipment restrictions", () => assertContains(frontendOverride, /availableEquipment/, "The UI adapter must preserve current equipment restrictions")],
    ["catalog identity", () => assertContains(frontendOverride, /researchExerciseId|exerciseCatalog|trustedExerciseCatalog/, "The UI adapter must pass a coherent catalog/research identity")]
  ]);
});

test("engine hard-constraint rejections stay typed and never enter legacy target fallback", () => {
  const rejectionScenarios = [
    ["excluded_exercise", "Exercise is excluded by the supplied restrictions."],
    ["unavailable_equipment", "Exercise is not compatible with available equipment."],
    ["empty_muscle_scope", "Muscle scope must be a non-empty array."],
    ["invalid_time_constraint", "Session time must be a positive finite number."],
    ["invalid_exercise_identity", "Exercise identity is invalid or contradictory."]
  ];
  const isTypedRejection = (value) => {
    const detail = value?.error || value;
    const code = String(detail?.code || value?.code || "");
    const typed = detail?.hardConstraint === true || detail?.type === "hard_constraint_rejection" || /^HARD_CONSTRAINT_/i.test(code);
    const blocked = detail?.executionBlocked === true || detail?.executable === false || value?.executionBlocked === true || value?.executable === false;
    return typed && blocked;
  };

  for (const [reason, message] of rejectionScenarios) {
    const error = Object.assign(new Error(message), {
      code: `HARD_CONSTRAINT_${reason.toUpperCase()}`,
      hardConstraint: true,
      executionBlocked: true,
      executable: false,
      constraint: reason
    });
    const context = {
      prescriptionEngine: { prescribeExercise: () => { throw error; } },
      prescriptionEvidenceStatus: { state: "ready" },
      prescriptionExerciseIdentity: () => "ex_barbell_bench_press",
      normalizePrescriptionIdentity: (value) => String(value || "").trim().toLowerCase(),
      prescriptionMuscleGroup: () => "chest",
      todayIso: () => "2026-07-14",
      prescriptionHistoryForExercise: () => [],
      prescriptionReadiness: () => ({}),
      currentMesocycle: () => null,
      prescriptionScopeHistories: () => ({ muscleExerciseHistories: [], programMuscleHistories: [] }),
      musclesForExercise: () => [{ muscle: "Chest" }],
      appMuscleFromPrescriptionGroup: () => "Chest",
      weeklyMuscleVolume: () => [],
      startOfWeekIso: (value) => value,
      prescriptionSnapshotCache: new Map(),
      analysisRevision: 1,
      data: { settings: {} },
      JSON
    };
    const unified = evaluateFunction("unifiedPrescriptionSnapshot", context);
    let result;
    let thrown = null;
    try {
      result = unified({ name: "Barbell Bench Press" }, {
        fresh: true,
        excludedExerciseIds: reason === "excluded_exercise" ? ["ex_barbell_bench_press"] : [],
        availableEquipment: reason === "unavailable_equipment" ? ["bodyweight"] : ["all"],
        includedMuscleGroupIds: reason === "empty_muscle_scope" ? [] : ["chest"],
        sessionDurationMinutes: reason === "invalid_time_constraint" ? 0 : 45
      });
    } catch (caught) {
      thrown = caught;
    }
    assert.equal(isTypedRejection(thrown || result), true, `${reason} was swallowed into an untyped/null fallback`);
  }

  const typedRejection = {
    type: "hard_constraint_rejection",
    code: "HARD_CONSTRAINT_EXCLUDED_EXERCISE",
    hardConstraint: true,
    executionBlocked: true,
    executable: false,
    constraint: "excluded_exercise"
  };
  let legacyCalls = 0;
  const coach = evaluateFunction("coachTargetForTemplateExercise", {
    unifiedPrescriptionSnapshot: () => typedRejection,
    legacyTargetFromSnapshot: () => { legacyCalls += 1; return { sets: 3, executable: true }; },
    todayIso: () => "2026-07-14"
  });
  let target;
  let thrown = null;
  try { target = coach({ name: "Barbell Bench Press" }, {}); }
  catch (caught) { thrown = caught; }
  assert.equal(legacyCalls, 0, "A hard-constraint rejection must never enter legacyTargetFromSnapshot or legacy workout construction");
  assert.equal(isTypedRejection(thrown || target), true, "Coach target resolution must retain the typed non-executable rejection");
});

test("invalid reconciled custom exercise identity resolves to null instead of an ordinary custom ID", () => {
  const invalidId = "custom_conflicting_press";
  const resolver = evaluateFunction("prescriptionExerciseIdentity", {
    prescriptionEngine: {
      evidence: {
        research: { exerciseIdByAlias: new Map(), exerciseDatabase: [] },
        personal: {
          exerciseScores: [{ exercise_id: invalidId, exercise_name: "Conflicting Garage Press" }],
          exercisePrescriptions: [],
          reconciledIdentityByExerciseId: new Map([[invalidId, {
            exerciseId: invalidId,
            researchExerciseId: "ex_barbell_bench_press",
            invalid: true,
            invalidReason: "Synthetic contradictory trusted aliases"
          }]])
        }
      }
    },
    normalizePrescriptionIdentity: normalizeIdentity
  });
  const resolved = resolver("Conflicting Garage Press");
  assert.equal(resolved, null, "An invalid reconciled identity must fail closed instead of re-entering the custom exercise path");
  assert.notEqual(resolved, invalidId, "Invalid reconciliation must never return an ordinary custom ID");
});

test("unified prescriptions preserve template intent and all hard workout constraints", () => {
  const unified = functionSource("unifiedPrescriptionSnapshot");
  const start = functionSource("startTemplate");
  const resistanceFallbacks = start.match(/resistanceType\s*:\s*target\.resistanceType\s*\|\|\s*templateResistanceType/g) || [];
  collectAssertions([
    ["planned working sets", () => assertContains(unified, /\b(?:plannedWorkingSets|plannedSets)\s*:/, "The engine call must receive the guided/template planned set count")],
    ["resistance type", () => assertContains(unified, /\bresistanceType\s*:/, "The engine call must receive the explicit resistance type")],
    ["time constraint", () => assertContains(unified, /\b(?:sessionDurationMinutes|timeConstraintMinutes|maxSessionMinutes)\s*:/, "The engine call must receive the session time constraint")],
    ["equipment constraint", () => assertContains(unified, /\bavailableEquipment\s*:/, "The engine call must receive available equipment")],
    ["exercise exclusions", () => assertContains(unified, /\b(?:excludedExerciseIds|exerciseExclusions)\s*:/, "The engine call must receive exercise exclusions")],
    ["muscle scope", () => assertContains(unified, /\b(?:includedMuscleGroupIds|muscleScope)\s*:/, "The engine call must receive the selected muscle scope")],
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
      sessions: [], exercises: [], sets: [], recommendationHistory: [], mesocycles: [], settings: { weightUnit: "lb" }
    },
    defaultRecovery: () => ({}),
    hasActiveWorkout: () => false,
    activeSession: () => null,
    todayIso: () => "2026-07-14",
    isSessionSubmitted: () => false,
    cleanRecovery: (value) => value,
    createSession: () => ({ id: "session-1", date: "2026-07-14", title: "Synthetic template" }),
    recoveryRecommendationForSession: () => ({ decision: "normal" }),
    inferResistanceType: () => "cable",
    coachTargetForTemplateExercise: () => ({
      sets: 2, reps: 8, repLow: 6, repHigh: 10, weight: 40, weightUnit: "lb", rpe: 8,
      restSeconds: 90, mode: "maintenance", confidence: "medium", reason: "Synthetic target",
      adjusted: false, triggerLabels: [], recommendationSnapshot: null
    }),
    isBodyweightResistance: () => false,
    recommendedRestSeconds: () => 90,
    adjustTargetForRecovery: (target) => ({ ...target, resistanceType: undefined }),
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

test("unified prescription invocation forwards canonical profile fields and hard constraints unchanged", () => {
  let captured = null;
  const unified = evaluateFunction("unifiedPrescriptionSnapshot", {
    prescriptionEngine: { prescribeExercise: (input) => { captured = input; return { recommendationId: "synthetic" }; } },
    prescriptionEvidenceStatus: { state: "ready" },
    prescriptionExerciseIdentity: () => "ex_barbell_bench_press",
    normalizePrescriptionIdentity: (value) => String(value || "").trim(),
    prescriptionMuscleGroup: () => "chest",
    todayIso: () => "2026-07-14",
    prescriptionHistoryForExercise: () => [],
    prescriptionReadiness: () => ({}),
    currentMesocycle: () => null,
    prescriptionScopeHistories: () => ({ muscleExerciseHistories: [], programMuscleHistories: [] }),
    musclesForExercise: () => [{ muscle: "Chest" }],
    appMuscleFromPrescriptionGroup: () => "Chest",
    weeklyMuscleVolume: () => [],
    startOfWeekIso: (value) => value,
    prescriptionSnapshotCache: new Map(),
    analysisRevision: 1,
    JSON
  });
  const requested = {
    plannedWorkingSets: 3,
    resistanceType: "external",
    sessionDurationMinutes: 35,
    availableEquipment: ["dumbbell", "bench"],
    excludedExerciseIds: ["ex_barbell_bench_press"],
    includedMuscleGroupIds: ["chest"],
    trainingGoal: "hypertrophy",
    nutritionPhase: "deficit",
    experienceLevel: "intermediate",
    createdAt: "2026-07-14T12:00:00.000Z",
    fresh: true
  };
  unified({ name: "Bench Press" }, requested);
  for (const field of [
    "plannedWorkingSets", "resistanceType", "sessionDurationMinutes", "availableEquipment",
    "excludedExerciseIds", "includedMuscleGroupIds", "trainingGoal", "nutritionPhase", "experienceLevel"
  ]) {
    assert.deepEqual(plain(captured?.[field]), plain(requested[field]), `Unified adapter dropped or rewrote ${field}`);
  }
});

test("settings use separate canonical training, nutrition, and experience fields with legacy migration", () => {
  const defaultsStart = html.indexOf("const defaultSettings");
  assert.notEqual(defaultsStart, -1, "Missing defaultSettings");
  const defaults = html.slice(defaultsStart, defaultsStart + 3500);
  const normalize = functionSource("normalizeLoadedData");
  const unified = functionSource("unifiedPrescriptionSnapshot");
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
    ["engine receives canonical fields", () => {
      assertContains(unified, /trainingGoal\s*:/, "Prescription invocation must receive trainingGoal");
      assertContains(unified, /nutritionPhase\s*:/, "Prescription invocation must receive nutritionPhase separately");
      assertContains(unified, /experienceLevel\s*:/, "Prescription invocation must receive experienceLevel");
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
  const normalize = (value) => String(value || "").toLowerCase().replace(/^ex_/, "").replace(/[^a-z0-9]+/g, " ").trim();
  const evidence = {
    personal: {
      exerciseScores: [
        { exercise_id: "custom_spoofed_bench", exercise_name: "Bench Press" },
        { exercise_id: "custom_my_press", exercise_name: "My Garage Press" }
      ],
      exercisePrescriptions: []
    },
    research: {
      exerciseIdByAlias: new Map([["bench press", "ex_barbell_bench_press"], ["flat bench", "ex_barbell_bench_press"]]),
      exerciseDatabase: [{ exercise_id: "ex_barbell_bench_press", exercise_name: "Barbell Bench Press" }]
    }
  };
  const prescriptionIdentity = evaluateFunction("prescriptionExerciseIdentity", {
    prescriptionEngine: { evidence },
    normalizePrescriptionIdentity: normalize
  });
  assert.equal(prescriptionIdentity("Flat Bench"), "ex_barbell_bench_press", "A public alias must resolve to its canonical research ID");
  assert.equal(prescriptionIdentity("Bench Press"), "ex_barbell_bench_press", "A custom name collision must not shadow the public registry");
  assert.equal(prescriptionIdentity("My Garage Press"), "custom_my_press", "A trusted custom identity must remain in its custom namespace");

  const canonicalId = evaluateFunction("canonicalExerciseId", {
    prescriptionEngine: { evidence },
    normalizePrescriptionIdentity: normalize
  });
  assert.equal(canonicalId("Flat Bench"), "ex_barbell_bench_press");
  assert.match(canonicalId("Uncatalogued Garage Press"), /^custom(?::|_)/, "An uncatalogued name must not become an unnamespaced pseudo-canonical ID");
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
    const fixture = buildEntityCollectionCase(descriptor);
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
    ["explicit UI control", () => assertContains(html, /data-action=["']cloud-workout-sync-consent["']/, "Settings must expose a distinct cloud workout sync consent control")],
    ["queue fails closed", () => assertContains(queue, /cloudWorkoutSyncConsent\s*!==\s*true|cloudWorkoutSyncConsent\s*===\s*true/, "Queueing must require explicit true consent")],
    ["flush fails closed", () => assertContains(flush, /cloudWorkoutSyncConsent\s*!==\s*true|cloudWorkoutSyncConsent\s*===\s*true/, "Flushing must require explicit true consent")],
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
    ["Available Equipment group name", () => assert.ok(equipmentGroups.length && equipmentGroups.every((tag) => /role="group"/.test(tag) && /aria-label="Available Equipment"|aria-labelledby=/.test(tag)), "Every Available Equipment picker must be a named group")],
    ["Muscle Group Scope group name", () => assert.ok(scopeGroups.length && scopeGroups.every((tag) => /role="group"/.test(tag) && /aria-label="Muscle Group Scope"|aria-labelledby=/.test(tag)), "Every Muscle Group Scope picker must be a named group")]
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
