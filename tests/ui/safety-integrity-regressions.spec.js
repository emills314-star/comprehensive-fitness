"use strict";

const { test, expect } = require("@playwright/test");
const {
  IDS,
  safetyWorkoutState,
  validFullState
} = require("../fixtures/synthetic-app-backups");
const {
  invalidMuscleScoreOnlyPersonalEvidencePackage,
  threeSourcePersonalEvidencePackage
} = require("../fixtures/synthetic-personal-evidence");

const SUBMITTED_IDS = Object.freeze({
  session: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  exercise: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  set: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/");
  await page.waitForLoadState("load");
  await expect.poll(() => page.evaluate(() => prescriptionEvidenceStatus.state), {
    message: "The production prescription engine must finish loading before safety-integrity tests run"
  }).toBe("ready");
});

function crossSessionState() {
  const fixture = safetyWorkoutState({ illness: false, pain: false, affectedMuscle: "" });
  const state = structuredClone(fixture.state);
  state.sessions.push({
    ...state.sessions[0],
    id: SUBMITTED_IDS.session,
    title: "Synthetic Other Submitted Workout",
    submitted: true,
    workoutStarted: false,
    workoutState: "completed",
    startedAt: "2026-07-07T12:00:00.000Z",
    completedAt: "2026-07-07T13:00:00.000Z",
    date: "2026-07-07",
    recovery: { illness: false, pain: false, affectedMuscle: "" }
  });
  state.exercises.push({
    ...state.exercises[0],
    id: SUBMITTED_IDS.exercise,
    sessionId: SUBMITTED_IDS.session,
    name: "Barbell Bench Press",
    order: 0
  });
  state.sets.push({
    ...state.sets[0],
    id: SUBMITTED_IDS.set,
    exerciseId: SUBMITTED_IDS.exercise,
    completed: true,
    skipped: false,
    edited: false
  });
  return { ...fixture, state, submittedIds: SUBMITTED_IDS };
}

function failedHistoryState() {
  const state = validFullState();
  state.sessions[0] = {
    ...state.sessions[0],
    title: "Synthetic Failed Set History",
    submitted: true,
    workoutStarted: false,
    workoutState: "completed",
    recovery: { illness: false, pain: false, affectedMuscle: "" }
  };
  state.exercises[0] = {
    ...state.exercises[0],
    name: "Barbell Bench Press",
    primaryMuscle: "Chest",
    secondaryMuscle: "Triceps"
  };
  const failedSet = {
    ...state.sets[0],
    setType: "straight",
    isWarmup: false,
    countsTowardScore: true,
    countsTowardVolume: true,
    countsTowardProgression: true,
    completed: false,
    skipped: false,
    edited: false
  };
  state.sets = [
    { ...failedSet, setNumber: 1, sequenceIndex: 0 },
    {
      ...failedSet,
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      setNumber: 2,
      sequenceIndex: 1
    }
  ];
  state.settings = {
    ...state.settings,
    availableEquipment: ["all"],
    excludedExerciseIds: [],
    interactionVibration: false,
    timerNotifications: false
  };
  return state;
}

async function seedState(page, model, options = {}) {
  return page.evaluate(({ nextData, requested }) => {
    window.clearInterval(timerInterval);
    timerInterval = null;
    timer = null;
    pendingNextSetId = "";
    data = nextData;
    entityStructureRevision += 1;
    entityIndexCache = null;
    invalidateCompletedAnalysis();
    activeWorkoutId = requested.activeWorkoutId === undefined
      ? nextData.sessions.find((session) => !isSessionSubmitted(session))?.id || ""
      : requested.activeWorkoutId;
    activeSessionId = requested.activeSessionId || activeWorkoutId || nextData.sessions[0]?.id || "";
    activeSetId = requested.activeSetId || nextData.sets.find((set) => exerciseById(set.exerciseId)?.sessionId === activeSessionId)?.id || "";
    viewingHistorySessionId = requested.viewingHistorySessionId || "";
    completedSummarySessionId = "";
    historyEditFlow = requested.historyEditSessionId
      ? { sessionId: requested.historyEditSessionId, originalData: cloneAppData(nextData), dirty: false }
      : null;
    dashboardDetail = null;
    render();
    return {
      activeSessionId,
      activeWorkoutId,
      editingHistorySession: requested.historyEditSessionId ? isEditingHistorySession(requested.historyEditSessionId) : false
    };
  }, { nextData: model, requested: options });
}

async function submittedMutationFingerprint(page) {
  return page.evaluate((ids) => ({
    sets: data.sets
      .filter((set) => set.exerciseId === ids.exercise)
      .map((set) => ({ id: set.id, completed: set.completed, skipped: set.skipped, isWarmup: Boolean(set.isWarmup) }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    timer: timer ? { exerciseId: timer.exerciseId, setId: timer.setId, isActive: timer.isActive } : null,
    activeSetId
  }), SUBMITTED_IDS);
}

async function dispatchStaleDelegatedAction(page, action, identifiers) {
  await page.evaluate(({ requestedAction, ids }) => {
    const control = document.createElement("button");
    control.type = "button";
    control.dataset.action = requestedAction;
    if (ids.exerciseId) control.dataset.exerciseId = ids.exerciseId;
    if (ids.setId) control.dataset.setId = ids.setId;
    root.appendChild(control);
    control.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    control.remove();
  }, { requestedAction: action, ids: identifiers });
}

async function invokeNamedMutation(page, action, identifiers) {
  await page.evaluate(({ requestedAction, ids }) => {
    if (requestedAction === "add-set") addSet(ids.exerciseId, false);
    if (requestedAction === "add-warmup-set") addWarmupSet(ids.exerciseId);
    if (requestedAction === "duplicate-set") addSet(ids.exerciseId, true);
    if (requestedAction === "toggle-set") toggleSetCompletion(ids.setId);
    if (requestedAction === "toggle-skip-set") toggleSetSkipped(ids.setId);
    if (requestedAction === "start-timer") startTimer(ids.exerciseId, ids.setId);
  }, { requestedAction: action, ids: identifiers });
}

test("a different submitted session rejects stale delegated and direct executable mutations unless that exact history session is being edited", async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = crossSessionState();
  const targetableActions = ["add-set", "add-warmup-set", "duplicate-set", "toggle-set", "toggle-skip-set", "start-timer"];
  const identifiers = { exerciseId: fixture.submittedIds.exercise, setId: fixture.submittedIds.set };

  for (const action of targetableActions) {
    await seedState(page, fixture.state, {
      activeSessionId: fixture.state.sessions[0].id,
      activeWorkoutId: fixture.state.sessions[0].id
    });
    const before = await submittedMutationFingerprint(page);
    await dispatchStaleDelegatedAction(page, action, identifiers);
    const after = await submittedMutationFingerprint(page);
    expect.soft(after, `Delegated ${action} must not mutate a different submitted session`).toEqual(before);
  }

  for (const action of targetableActions) {
    await seedState(page, fixture.state, {
      activeSessionId: fixture.state.sessions[0].id,
      activeWorkoutId: fixture.state.sessions[0].id
    });
    const before = await submittedMutationFingerprint(page);
    await invokeNamedMutation(page, action, identifiers);
    const after = await submittedMutationFingerprint(page);
    expect.soft(after, `Named ${action} must independently enforce target-session ownership`).toEqual(before);
  }

  await test.step("mixed exercise and set owners fail closed in delegated and named timer paths", async () => {
    const mixedIds = { exerciseId: fixture.exerciseIds.legPress, setId: IDS.set };
    await seedState(page, fixture.state, {
      activeSessionId: fixture.state.sessions[0].id,
      activeWorkoutId: fixture.state.sessions[0].id
    });
    const delegatedDecision = await page.evaluate((ids) => guardWorkoutMutation("start-timer", ids, false), mixedIds);
    expect.soft(delegatedDecision.allowed, "A set cannot borrow an unrelated allowed exercise identity").toBe(false);
    await dispatchStaleDelegatedAction(page, "start-timer", mixedIds);
    expect.soft(await page.evaluate(() => timer), "Delegated mixed-owner timer action must remain inert").toBeNull();

    await seedState(page, fixture.state, {
      activeSessionId: fixture.state.sessions[0].id,
      activeWorkoutId: fixture.state.sessions[0].id
    });
    await invokeNamedMutation(page, "start-timer", mixedIds);
    expect.soft(await page.evaluate(() => timer), "Named mixed-owner timer action must remain inert").toBeNull();
  });

  await test.step("the exact submitted session remains editable only inside its exact history-edit flow", async () => {
    const seeded = await seedState(page, fixture.state, {
      activeSessionId: fixture.submittedIds.session,
      activeWorkoutId: fixture.state.sessions[0].id,
      viewingHistorySessionId: fixture.submittedIds.session,
      historyEditSessionId: fixture.submittedIds.session
    });
    expect(seeded.editingHistorySession).toBe(true);
    const beforeNamed = await page.evaluate((exerciseId) => setsForExercise(exerciseId).length, fixture.submittedIds.exercise);
    await invokeNamedMutation(page, "add-set", identifiers);
    expect(await page.evaluate((exerciseId) => setsForExercise(exerciseId).length, fixture.submittedIds.exercise)).toBe(beforeNamed + 1);

    await seedState(page, fixture.state, {
      activeSessionId: fixture.submittedIds.session,
      activeWorkoutId: fixture.state.sessions[0].id,
      viewingHistorySessionId: fixture.submittedIds.session,
      historyEditSessionId: fixture.submittedIds.session
    });
    const beforeDelegated = await page.evaluate((exerciseId) => setsForExercise(exerciseId).length, fixture.submittedIds.exercise);
    await dispatchStaleDelegatedAction(page, "add-set", identifiers);
    expect(await page.evaluate((exerciseId) => setsForExercise(exerciseId).length, fixture.submittedIds.exercise)).toBe(beforeDelegated + 1);
  });
});

test("resolved pain-free substitutions revalidate current equipment and exclusions without inventing unrelated blocks", async ({ page }) => {
  const fixture = safetyWorkoutState({ illness: false, pain: true, affectedMuscle: "Chest" });
  await seedState(page, fixture.state, {
    activeSessionId: fixture.state.sessions[0].id,
    activeWorkoutId: fixture.state.sessions[0].id
  });

  const seeded = await page.evaluate(({ runtimeExerciseId }) => {
    const originalExerciseId = "ex_barbell_bench_press";
    const muscleGroupId = "chest";
    const allEquipment = ["all"];
    const blocked = prescriptionEngine.prescribeExercise({
      exerciseId: originalExerciseId,
      muscleGroupId,
      readiness: { pain: true, affectedMuscle: "chest" },
      availableEquipment: allEquipment,
      trainingGoal: "hypertrophy",
      experienceLevel: "intermediate",
      nutritionPhase: "maintenance",
      createdAt: "2026-07-14T12:00:00.000Z"
    });
    if (blocked.finalPrescription?.executionBlocked !== true) throw new Error("The real engine did not create the required painful blocked source prescription");
    const research = prescriptionEngine.evidence.research;
    const originalResearchId = blocked.finalPrescription.safetyRestriction?.auditBaseTargets?.researchExerciseId
      || blocked.finalPrescription.researchExerciseId
      || originalExerciseId;
    const mappedIds = [...new Set((research.substitutionsByExercise.get(originalResearchId) || [])
      .map((row) => row.substitute_exercise_id || row.substituteExerciseId)
      .filter(Boolean))];
    const eligibleIds = mappedIds.filter((id) => {
      const catalogRecord = research.exerciseById.get(id);
      return Boolean(catalogRecord && prescriptionApi.equipmentCompatible(catalogRecord, allEquipment).eligible === true);
    });
    const capabilities = ["bodyweight", "bands", "dumbbell", "barbell", "rack", "cable_station"];
    let selected = null;
    for (const exerciseId of eligibleIds) {
      const catalogRecord = research.exerciseById.get(exerciseId);
      const invalidEquipment = capabilities.find((capability) => prescriptionApi.equipmentCompatible(catalogRecord, [capability]).eligible !== true);
      if (invalidEquipment) {
        selected = { exerciseId, invalidEquipment };
        break;
      }
    }
    if (!selected) throw new Error("Public substitution evidence did not supply a candidate with a provably incompatible equipment capability");
    const catalog = eligibleIds.map((id) => research.exerciseById.get(id)).filter(Boolean);
    const catalogRecord = research.exerciseById.get(selected.exerciseId);
    const resolved = prescriptionEngine.applyManualOverride(blocked, {
      exerciseId: selected.exerciseId,
      researchExerciseId: selected.exerciseId,
      painFreeConfirmed: true
    }, {
      allowedSafetySubstituteIds: eligibleIds,
      exerciseCatalog: catalog,
      availableEquipment: allEquipment,
      reason: "Synthetic pain-free safety-integrity regression",
      createdAt: "2026-07-14T12:05:00.000Z"
    });
    if (resolved.finalPrescription?.safetyRestriction?.status !== "resolved_by_confirmed_substitute") {
      throw new Error("The real engine did not preserve resolved confirmed-substitute lineage");
    }
    const exercise = exerciseById(runtimeExerciseId);
    Object.assign(exercise, {
      name: catalogRecord.exercise_name,
      recommendationSnapshot: resolved,
      basePrescription: resolved.basePrescription,
      finalPrescription: resolved.finalPrescription,
      executionBlocked: resolved.finalPrescription.executionBlocked,
      safetyRestriction: resolved.finalPrescription.safetyRestriction
    });
    data.recommendationHistory = [resolved];
    data.settings = { ...data.settings, availableEquipment: allEquipment, excludedExerciseIds: [] };
    entityStructureRevision += 1;
    entityIndexCache = null;
    invalidateCompletedAnalysis();
    render();
    return {
      substituteExerciseId: selected.exerciseId,
      invalidEquipment: selected.invalidEquipment,
      unrelatedExcludedExerciseId: "ex_leg_press",
      substituteExerciseName: catalogRecord.exercise_name,
      differentObservedExerciseName: [...research.exerciseById.entries()]
        .find(([id]) => id !== selected.exerciseId && id !== originalResearchId)?.[1]?.exercise_name || "Leg Press"
    };
  }, { runtimeExerciseId: fixture.exerciseIds.bench });

  const results = await page.evaluate(({ runtimeExerciseId, constraints }) => {
    const originalSets = structuredClone(data.sets);
    activeTab = "lift";
    const run = ({ availableEquipment, excludedExerciseIds, mesocycleEquipment, observedExerciseName = constraints.substituteExerciseName }) => {
      data.sets = structuredClone(originalSets);
      const exercise = exerciseById(runtimeExerciseId);
      const session = sessionById(exercise.sessionId);
      exercise.name = observedExerciseName;
      data.settings = { ...data.settings, availableEquipment, excludedExerciseIds };
      if (mesocycleEquipment === undefined) {
        data.mesocycles = [];
        session.mesocycleId = "";
      } else {
        const mesocycleId = "15151515-1515-4515-8515-151515151515";
        data.mesocycles = [{
          id: mesocycleId,
          name: "Synthetic restrictive substitute mesocycle",
          status: "active",
          type: "primary_progression",
          availableEquipment: mesocycleEquipment
        }];
        session.mesocycleId = mesocycleId;
      }
      entityStructureRevision += 1;
      entityIndexCache = null;
      invalidateCompletedAnalysis();
      const before = setsForExercise(runtimeExerciseId).length;
      const decision = guardWorkoutMutation("add-set", { exerciseId: runtimeExerciseId }, false);
      addSet(runtimeExerciseId, false);
      render();
      const addSetControl = root.querySelector(`[data-action="add-set"][data-exercise-id="${runtimeExerciseId}"]`);
      const recoveryControl = root.querySelector(`[data-safety-substitute-recovery="${runtimeExerciseId}"]`)
        || root.querySelector(`[data-override-form="${runtimeExerciseId}"]`);
      return {
        decision,
        added: setsForExercise(runtimeExerciseId).length - before,
        addSetDisabled: addSetControl?.disabled === true,
        recoveryText: recoveryControl?.innerText || ""
      };
    };
    return {
      invalidEquipment: run({ availableEquipment: [constraints.invalidEquipment], excludedExerciseIds: [] }),
      excludedSubstitute: run({ availableEquipment: ["all"], excludedExerciseIds: [constraints.substituteExerciseId] }),
      unrelatedChange: run({ availableEquipment: ["all"], excludedExerciseIds: [constraints.unrelatedExcludedExerciseId] }),
      defaultEquipment: run({ availableEquipment: [], excludedExerciseIds: [] }),
      restrictiveMesocycle: run({ availableEquipment: [], excludedExerciseIds: [], mesocycleEquipment: [constraints.invalidEquipment] }),
      missingObservedIdentity: run({
        availableEquipment: ["all"],
        excludedExerciseIds: [],
        observedExerciseName: "Synthetic Unresolvable Substitute Name"
      }),
      differentObservedIdentity: run({
        availableEquipment: ["all"],
        excludedExerciseIds: [],
        observedExerciseName: constraints.differentObservedExerciseName
      })
    };
  }, { runtimeExerciseId: fixture.exerciseIds.bench, constraints: seeded });

  expect.soft(results.invalidEquipment.decision.allowed, "A resolved substitute must become non-executable when current equipment cannot support it").toBe(false);
  expect.soft(results.invalidEquipment.added, "Equipment-invalid resolved substitutes must not add executable sets").toBe(0);
  expect.soft(results.excludedSubstitute.decision.allowed, "A newly excluded resolved substitute must become non-executable").toBe(false);
  expect.soft(results.excludedSubstitute.added, "Excluded resolved substitutes must not add executable sets").toBe(0);
  expect.soft(results.unrelatedChange.decision.allowed, "An unrelated exclusion must not invalidate a still-eligible resolved substitute").toBe(true);
  expect.soft(results.unrelatedChange.added, "A still-valid confirmed substitute remains executable").toBe(1);
  expect.soft(results.defaultEquipment.decision.allowed, "The default empty settings array means unrestricted/all equipment").toBe(true);
  expect.soft(results.defaultEquipment.added, "A valid resolved substitute remains executable under default equipment settings").toBe(1);
  expect.soft(results.restrictiveMesocycle.decision.allowed, "An explicit restrictive mesocycle must still intersect default equipment settings").toBe(false);
  expect.soft(results.restrictiveMesocycle.added, "A mesocycle-incompatible substitute must not add executable sets").toBe(0);
  for (const [label, observed] of [
    ["unresolvable", results.missingObservedIdentity],
    ["different", results.differentObservedIdentity]
  ]) {
    expect.soft(observed.decision.allowed, `A ${label} observed substitute identity must fail closed`).toBe(false);
    expect.soft(observed.added, `A ${label} observed substitute identity must not add executable sets`).toBe(0);
    expect.soft(observed.addSetDisabled, `A ${label} observed substitute identity must render disabled workout controls`).toBe(true);
    expect.soft(observed.recoveryText, `A ${label} observed substitute identity must render substitute recovery UI`).toMatch(/choose a pain-free substitute|confirmation required/i);
  }
});

test("unexpected engine faults stay distinct, non-executable, and visible instead of reviving legacy Dashboard advice", async ({ page }) => {
  const history = failedHistoryState();
  await seedState(page, history, {
    activeSessionId: history.sessions[0].id,
    activeWorkoutId: ""
  });

  const result = await page.evaluate(() => {
    const exerciseName = "Barbell Bench Press";
    const legacyAdvice = "Hold load or reduce it 5-10%, complete the programmed reps with clean technique, and avoid adding sets this week.";
    const throughDate = todayIso();
    const weekStart = startOfWeekIso(throughDate);
    data.sessions[0].date = throughDate;
    data.sessions[0].completedAt = `${throughDate}T13:00:00.000Z`;
    invalidateCompletedAnalysis();
    const baseline = unifiedPrescriptionSnapshot({ name: exerciseName, primaryMuscle: "Chest" }, {
      exerciseId: "ex_barbell_bench_press",
      muscleGroupId: "chest",
      history: [],
      mesocycle: null,
      throughDate,
      fresh: true
    });
    if (!baseline?.finalPrescription) throw new Error("The real engine baseline must succeed before its boundary is fault-injected");
    const baselineFlags = fatigueFlags(weekStart);
    if (!baselineFlags.some((flag) => flag.scope === "Lift" && flag.name === exerciseName)) {
      throw new Error("The production Dashboard pipeline did not produce the synthetic failed-set Lift flag");
    }

    const originalPrescribeExercise = prescriptionEngine.prescribeExercise;
    prescriptionEngine.prescribeExercise = () => {
      throw new TypeError("Available equipment input is malformed after a synthetic internal prescription adapter fault");
    };
    try {
      invalidateCompletedAnalysis();
      const failure = unifiedPrescriptionSnapshot({ name: exerciseName, primaryMuscle: "Chest" }, {
        exerciseId: "ex_barbell_bench_press",
        muscleGroupId: "chest",
        history: [],
        mesocycle: null,
        throughDate,
        fresh: true
      });
      let legacyAdapter;
      try {
        legacyAdapter = legacyRecommendationFromSnapshot(failure, exerciseName);
      } catch (error) {
        legacyAdapter = { threw: true, name: error?.name, message: error?.message };
      }
      let coachTarget;
      try {
        coachTarget = coachTargetForTemplateExercise({ name: exerciseName, role: "primary_progression_lift", sets: 3, reps: 8 }, {
          throughDate,
          historical: true,
          template: { id: "synthetic-engine-fault", exercises: [{ name: exerciseName }] }
        });
      } catch (error) {
        coachTarget = { threw: true, name: error?.name, message: error?.message };
      }
      invalidateCompletedAnalysis();
      const flags = fatigueFlags(weekStart);
      const flag = flags.find((item) => item.scope === "Lift" && item.name === exerciseName) || null;
      dashboardDetail = flag ? { type: "fatigue-flag", id: flag.id } : { type: "fatigue" };
      progressView = "overview";
      activeTab = "progress";
      render();
      const uiText = root.innerText;
      return { baselineRecommendationId: baseline.recommendationId, failure, legacyAdapter, coachTarget, flag, uiText, legacyAdvice };
    } finally {
      prescriptionEngine.prescribeExercise = originalPrescribeExercise;
      dashboardDetail = null;
      invalidateCompletedAnalysis();
    }
  });

  const failureType = result.failure?.type || result.failure?.kind;
  expect.soft(failureType, "Unexpected TypeError faults require their own engine_failure contract").toBe("engine_failure");
  expect.soft(result.failure?.hardConstraint, "Internal faults are not user hard-constraint violations").not.toBe(true);
  expect.soft(result.failure?.executionBlocked, "Internal faults must fail non-executable").toBe(true);
  expect.soft(result.failure?.executable, "Internal faults cannot expose executable guidance").toBe(false);

  for (const [surface, value] of [["legacy adapter", result.legacyAdapter], ["coach target", result.coachTarget]]) {
    expect.soft(value?.threw, `${surface} must consume an engine_failure without throwing`).not.toBe(true);
    expect.soft(value?.type || value?.kind, `${surface} must preserve the distinct engine_failure result`).toBe("engine_failure");
    expect.soft(value?.executable, `${surface} must not revive executable legacy guidance`).toBe(false);
  }

  expect.soft(result.flag, "The synthetic failed-set Dashboard flag must remain present").not.toBeNull();
  expect.soft(result.flag?.recommendation, "Dashboard must not silently retain its legacy recommendation after unified-engine failure").not.toBe(result.legacyAdvice);
  const unavailableState = result.flag?.recommendationUnavailable === true
    || result.flag?.recommendationStatus === "unavailable"
    || result.flag?.engineFailure?.type === "engine_failure"
    || /(?:recommendation|guidance|prescription).{0,30}unavailable|could not generate.{0,30}(?:recommendation|guidance)/i.test(String(result.flag?.recommendation || ""));
  expect.soft(unavailableState, "Dashboard analytics must explicitly retain an unavailable recommendation state").toBe(true);
  expect.soft(result.uiText).not.toContain(result.legacyAdvice);
  expect.soft(result.uiText, "Dashboard UI must explain that recommendation guidance is unavailable").toMatch(/(?:recommendation|guidance|prescription).{0,40}unavailable|could not generate.{0,40}(?:recommendation|guidance)/i);
});

test("canonical exercise analytics reject reconciler-built invalid identities while preserving valid trusted custom identities", async ({ page }) => {
  const result = await page.evaluate(() => {
    const invalidId = "custom_synthetic_invalid_identity_press";
    const invalidName = "Synthetic Invalid Identity Press";
    const validId = "custom_synthetic_valid_identity_press";
    const validName = "Synthetic Valid Identity Press";
    const personalData = {
      exerciseScores: [{
        exercise_id: validId,
        exercise_name: validName,
        equipment: "cable"
      }],
      exerciseMuscleScores: [{
        exercise_id: invalidId,
        exercise_name: invalidName,
        research_exercise_id: "ex_synthetic_unknown_research_press",
        muscle_group: "chest",
        research_muscle_group_id: "mg_chest_sternal",
        muscle_role: "primary",
        contribution_weight: 1
      }, {
        exercise_id: validId,
        exercise_name: validName,
        muscle_group: "chest",
        research_muscle_group_id: "mg_chest_sternal",
        muscle_role: "primary",
        contribution_weight: 1
      }],
      metadata: { methodology_version: "synthetic-canonical-identity-regression/1.0.0" }
    };
    const customEngine = prescriptionApi.createPrescriptionEngine({
      personalData,
      research: prescriptionEngine.evidence.research
    });
    const invalidProfile = customEngine.evidence.personal.reconciledIdentityByExerciseId.get(invalidId);
    const validProfile = customEngine.evidence.personal.reconciledIdentityByExerciseId.get(validId);
    const originalEngine = prescriptionEngine;
    const originalData = data;
    const originalActiveSessionId = activeSessionId;
    const originalActiveWorkoutId = activeWorkoutId;
    prescriptionEngine = customEngine;
    prescriptionSnapshotCache.clear();
    muscleAssignmentCache.clear();
    try {
      const invalidMuscles = musclesForExercise({ name: invalidName, primaryMuscle: "Chest" });
      const validMuscles = musclesForExercise({ name: validName, primaryMuscle: "Chest" });
      const invalidLookup = personalExerciseRecordForName(invalidName);
      const sessionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
      const invalidRuntimeId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
      const validRuntimeId = "12121212-1212-4212-8212-121212121212";
      const completedAt = `${todayIso()}T13:00:00.000Z`;
      data = emptyData();
      data.sessions = [{
        id: sessionId,
        date: todayIso(),
        title: "Synthetic Identity Analytics",
        submitted: true,
        workoutStarted: false,
        workoutState: "completed",
        completedAt,
        recovery: { illness: false, pain: false, affectedMuscle: "" }
      }];
      data.exercises = [{
        id: invalidRuntimeId,
        sessionId,
        name: invalidName,
        primaryMuscle: "Chest",
        secondaryMuscle: "",
        order: 0,
        resistanceType: "external"
      }, {
        id: validRuntimeId,
        sessionId,
        name: validName,
        primaryMuscle: "Chest",
        secondaryMuscle: "",
        order: 1,
        resistanceType: "external"
      }];
      data.sets = [{
        id: "13131313-1313-4313-8313-131313131313",
        exerciseId: invalidRuntimeId,
        setNumber: 1,
        sequenceIndex: 0,
        setType: "straight",
        reps: 8,
        weight: 100,
        weightUnit: "lb",
        resistanceType: "external",
        rpe: 8,
        completed: true,
        skipped: false,
        isWarmup: false,
        countsTowardScore: true,
        countsTowardVolume: true,
        countsTowardProgression: true
      }, {
        id: "14141414-1414-4414-8414-141414141414",
        exerciseId: validRuntimeId,
        setNumber: 1,
        sequenceIndex: 0,
        setType: "straight",
        reps: 8,
        weight: 100,
        weightUnit: "lb",
        resistanceType: "external",
        rpe: 8,
        completed: true,
        skipped: false,
        isWarmup: false,
        countsTowardScore: true,
        countsTowardVolume: true,
        countsTowardProgression: true
      }];
      activeSessionId = sessionId;
      activeWorkoutId = "";
      entityStructureRevision += 1;
      entityIndexCache = null;
      invalidateCompletedAnalysis();
      const analytics = completedAnalysisIndex();
      const invalidGrouped = [...analytics.exercisesByCanonical.entries()].some(([, exercises]) => exercises.some((exercise) => exercise.id === invalidRuntimeId));
      const validGrouped = (analytics.exercisesByCanonical.get(validId) || []).some((exercise) => exercise.id === validRuntimeId);
      return {
        invalidProfile: { invalid: invalidProfile?.invalid, invalidReason: invalidProfile?.invalidReason },
        validProfile: { invalid: validProfile?.invalid, researchExerciseId: validProfile?.researchExerciseId },
        invalidCanonicalId: canonicalExerciseId(invalidName),
        invalidPrescriptionId: prescriptionExerciseIdentity(invalidName),
        invalidLookupId: invalidLookup?.exercise_id || invalidLookup?.exerciseId || "",
        validCanonicalId: canonicalExerciseId(validName),
        validPrescriptionId: prescriptionExerciseIdentity(validName),
        invalidMuscles,
        validMuscles,
        invalidAnalyticsIndexed: analytics.canonicalByExerciseId.has(invalidRuntimeId),
        invalidAnalyticsCanonicalId: analytics.canonicalByExerciseId.get(invalidRuntimeId),
        invalidGrouped,
        validAnalyticsCanonicalId: analytics.canonicalByExerciseId.get(validRuntimeId),
        validGrouped
      };
    } finally {
      prescriptionEngine = originalEngine;
      data = originalData;
      activeSessionId = originalActiveSessionId;
      activeWorkoutId = originalActiveWorkoutId;
      entityStructureRevision += 1;
      entityIndexCache = null;
      invalidateCompletedAnalysis();
      prescriptionSnapshotCache.clear();
      muscleAssignmentCache.clear();
    }
  });

  expect.soft(result.invalidProfile.invalid, "The test identity must be invalidated by the real reconciler").toBe(true);
  expect.soft(result.invalidProfile.invalidReason).toMatch(/unknown research exercise/i);
  expect.soft(result.invalidLookupId, "The runtime lookup must discover an invalid identity supplied only by exercise-muscle evidence").toBe("custom_synthetic_invalid_identity_press");
  expect.soft(result.invalidPrescriptionId, "The prescription resolver already fails the reconciled invalid identity closed").toBeNull();
  expect.soft(result.invalidCanonicalId, "Canonical analytics must honor the same reconciled-invalid state").toBeNull();
  expect.soft(result.invalidMuscles, "An invalid reconciled identity must not re-enter analytics through manual or regex muscle inference").toEqual([]);
  expect.soft(result.invalidAnalyticsIndexed, "Completed-history analytics must omit the invalid exercise from canonical indexing").toBe(false);
  expect.soft(result.invalidAnalyticsCanonicalId, "Completed-history analytics must not group an invalid identity under a null/empty canonical key").toBeUndefined();
  expect.soft(result.invalidGrouped, "No canonical analytics bucket may contain the invalid reconciled exercise").toBe(false);
  expect.soft(result.validProfile.invalid, "The positive-control custom identity must remain trusted").not.toBe(true);
  expect.soft(result.validCanonicalId, "Valid trusted custom analytics identity must remain supported").toBe("custom_synthetic_valid_identity_press");
  expect.soft(result.validPrescriptionId, "Valid trusted custom prescription identity must remain supported").toBe("custom_synthetic_valid_identity_press");
  expect.soft(result.validMuscles.some((item) => item.muscle === "Chest"), "Valid trusted custom manual taxonomy remains supported").toBe(true);
  expect.soft(result.validAnalyticsCanonicalId, "Valid trusted custom history retains its canonical grouping").toBe("custom_synthetic_valid_identity_press");
  expect.soft(result.validGrouped, "Valid trusted custom history remains present in its canonical analytics bucket").toBe(true);
});

test("valid three-source evidence replacement invalidates caches while an invalid new identity rejects atomically", async ({ page }) => {
  const acceptedPackage = threeSourcePersonalEvidencePackage({ version: "1.0.6" });
  const invalidPackage = invalidMuscleScoreOnlyPersonalEvidencePackage({ version: "1.0.6" });
  const expectedInvalidPackage = structuredClone(acceptedPackage);
  expectedInvalidPackage.personalData.exerciseMuscleScores[0].research_exercise_id = "ex_synthetic_unknown_research_press";
  expect(invalidPackage).toEqual(expectedInvalidPackage);
  const identities = {
    score: {
      id: acceptedPackage.personalData.exerciseScores[0].exercise_id,
      name: acceptedPackage.personalData.exerciseScores[0].exercise_name
    },
    prescription: {
      id: acceptedPackage.personalData.exercisePrescriptions[0].exercise_id,
      name: acceptedPackage.personalData.exercisePrescriptions[0].exercise_name
    },
    muscle: {
      id: acceptedPackage.personalData.exerciseMuscleScores[0].exercise_id,
      name: acceptedPackage.personalData.exerciseMuscleScores[0].exercise_name
    }
  };
  const result = await page.evaluate(async ({ accepted, invalid, expectedIdentities }) => {
    const originalEngine = prescriptionEngine;
    const originalStatus = prescriptionEvidenceStatus;
    const originalData = data;
    const originalActiveSessionId = activeSessionId;
    const originalActiveWorkoutId = activeWorkoutId;
    const originalActiveTab = activeTab;
    const sessionId = "16161616-1616-4616-8616-161616161616";
    const runtimeExerciseId = "17171717-1717-4717-8717-171717171717";
    try {
      data = emptyData();
      data.sessions = [{
        id: sessionId,
        date: todayIso(),
        title: "Synthetic runtime evidence cache",
        submitted: true,
        workoutStarted: false,
        workoutState: "completed",
        completedAt: `${todayIso()}T13:00:00.000Z`,
        recovery: { illness: false, pain: false, affectedMuscle: "" }
      }];
      data.exercises = [{
        id: runtimeExerciseId,
        sessionId,
        name: expectedIdentities.muscle.name,
        primaryMuscle: "Chest",
        secondaryMuscle: "",
        order: 0,
        resistanceType: "external"
      }];
      data.sets = [{
        id: "18181818-1818-4818-8818-181818181818",
        exerciseId: runtimeExerciseId,
        setNumber: 1,
        sequenceIndex: 0,
        setType: "straight",
        reps: 8,
        weight: 100,
        weightUnit: "lb",
        resistanceType: "external",
        rpe: 8,
        completed: true,
        skipped: false,
        isWarmup: false,
        countsTowardScore: true,
        countsTowardVolume: true,
        countsTowardProgression: true
      }];
      activeSessionId = sessionId;
      activeWorkoutId = "";
      activeTab = "settings";
      entityStructureRevision += 1;
      entityIndexCache = null;
      invalidateCompletedAnalysis();

      const exercise = data.exercises[0];
      const beforeMuscles = musclesForExercise(exercise);
      const beforeAnalytics = completedAnalysisIndex();
      const weekStart = startOfWeekIso(todayIso());
      const beforeVolume = weeklyMuscleVolume(weekStart);
      const beforeCanonicalId = canonicalExerciseId(expectedIdentities.muscle.name);
      const revisionBeforeImport = analysisRevision;
      const successfulMuscleSentinelKey = "synthetic-success-muscle-cache-sentinel";
      const successfulPrescriptionSentinelKey = "synthetic-success-prescription-cache-sentinel";
      muscleAssignmentCache.set(successfulMuscleSentinelKey, Object.freeze({ stale: true }));
      prescriptionSnapshotCache.set(successfulPrescriptionSentinelKey, Object.freeze({ stale: true }));

      await importPersonalEvidenceFile(new File(
        [JSON.stringify(accepted)],
        "synthetic-valid-three-source-personal-evidence.json",
        { type: "application/json" }
      ));

      const lookup = (name) => personalExerciseRecordForName(name);
      const afterAnalytics = completedAnalysisIndex();
      const successfulData = data;
      const successfulDataJson = JSON.stringify(data);
      const successfulPackage = data.personalEvidencePackage;
      const successfulEngine = prescriptionEngine;
      const successfulStatus = prescriptionEvidenceStatus;
      const revisionAfterSuccess = analysisRevision;
      const dataRevisionAfterSuccess = data.dataRevision;
      const rejectedMuscleSentinelKey = "synthetic-rejected-muscle-cache-sentinel";
      const rejectedPrescriptionSentinelKey = "synthetic-rejected-prescription-cache-sentinel";
      const rejectedMuscleSentinel = Object.freeze({ retained: "muscle" });
      const rejectedPrescriptionSentinel = Object.freeze({ retained: "prescription" });
      muscleAssignmentCache.set(rejectedMuscleSentinelKey, rejectedMuscleSentinel);
      prescriptionSnapshotCache.set(rejectedPrescriptionSentinelKey, rejectedPrescriptionSentinel);

      await importPersonalEvidenceFile(new File(
        [JSON.stringify(invalid)],
        "synthetic-invalid-muscle-source-personal-evidence.json",
        { type: "application/json" }
      ));

      return {
        beforeMuscles,
        beforeAnalyticsCanonicalId: beforeAnalytics.canonicalByExerciseId.get(runtimeExerciseId),
        beforeVolume,
        beforeCanonicalId,
        revisionBeforeImport,
        revisionAfterSuccess,
        lookupIds: {
          score: lookup(expectedIdentities.score.name)?.exercise_id || lookup(expectedIdentities.score.name)?.exerciseId,
          prescription: lookup(expectedIdentities.prescription.name)?.exercise_id || lookup(expectedIdentities.prescription.name)?.exerciseId,
          muscle: lookup(expectedIdentities.muscle.name)?.exercise_id || lookup(expectedIdentities.muscle.name)?.exerciseId
        },
        afterCanonicalId: canonicalExerciseId(expectedIdentities.muscle.name),
        afterPrescriptionId: prescriptionExerciseIdentity(expectedIdentities.muscle.name),
        afterAnalyticsCanonicalId: afterAnalytics.canonicalByExerciseId.get(runtimeExerciseId),
        afterAnalyticsGrouped: (afterAnalytics.exercisesByCanonical.get(expectedIdentities.muscle.id) || []).some((item) => item.id === runtimeExerciseId),
        importedRecords: successfulStatus.personalRecords,
        successCachesCleared: {
          muscle: !muscleAssignmentCache.has(successfulMuscleSentinelKey),
          prescription: !prescriptionSnapshotCache.has(successfulPrescriptionSentinelKey)
        },
        rejectedState: {
          engineUnchanged: prescriptionEngine === successfulEngine,
          statusUnchanged: prescriptionEvidenceStatus === successfulStatus,
          packageUnchanged: data.personalEvidencePackage === successfulPackage,
          dataUnchanged: data === successfulData && JSON.stringify(data) === successfulDataJson,
          revisionUnchanged: analysisRevision === revisionAfterSuccess,
          dataRevisionUnchanged: data.dataRevision === dataRevisionAfterSuccess,
          muscleCacheSentinelRetained: muscleAssignmentCache.get(rejectedMuscleSentinelKey) === rejectedMuscleSentinel,
          prescriptionCacheSentinelRetained: prescriptionSnapshotCache.get(rejectedPrescriptionSentinelKey) === rejectedPrescriptionSentinel,
          message: String(settingsMessage || "")
        }
      };
    } finally {
      prescriptionEngine = originalEngine;
      prescriptionEvidenceStatus = originalStatus;
      data = originalData;
      activeSessionId = originalActiveSessionId;
      activeWorkoutId = originalActiveWorkoutId;
      activeTab = originalActiveTab;
      entityStructureRevision += 1;
      entityIndexCache = null;
      invalidateCompletedAnalysis();
    }
  }, { accepted: acceptedPackage, invalid: invalidPackage, expectedIdentities: identities });

  expect.soft(result.beforeMuscles.some((item) => item.muscle === "Chest"), "The stale-cache reproduction must start with the manual Chest assignment cached").toBe(true);
  expect.soft(result.beforeVolume.some((item) => item.muscle === "Chest" && item.sets > 0), "The stale-cache reproduction must start with completed Chest analytics").toBe(true);
  expect.soft(result.beforeCanonicalId, "The pre-import runtime name must begin under its fallback slug").toBe("custom_synthetic_muscle_source_press");
  expect.soft(result.beforeAnalyticsCanonicalId).toBe(result.beforeCanonicalId);
  expect.soft(result.lookupIds).toEqual({
    score: identities.score.id,
    prescription: identities.prescription.id,
    muscle: identities.muscle.id
  });
  expect.soft(identities.muscle.id, "The explicit muscle-source identity must differ from name-based fallback").not.toBe(result.beforeCanonicalId);
  expect.soft(result.afterCanonicalId).toBe(identities.muscle.id);
  expect.soft(result.afterPrescriptionId).toBe(identities.muscle.id);
  expect.soft(result.afterAnalyticsCanonicalId).toBe(identities.muscle.id);
  expect.soft(result.afterAnalyticsGrouped).toBe(true);
  expect.soft(result.revisionAfterSuccess, "Successful replacement must invalidate revisioned analysis caches").toBeGreaterThan(result.revisionBeforeImport);
  expect.soft(result.successCachesCleared).toEqual({ muscle: true, prescription: true });
  expect.soft(result.importedRecords, "All three valid personal identity sources must survive runtime normalization").toBe(3);
  expect.soft(result.rejectedState, "An invalid new identity must leave the accepted engine, package, revisions, and caches unchanged").toMatchObject({
    engineUnchanged: true,
    statusUnchanged: true,
    packageUnchanged: true,
    dataUnchanged: true,
    revisionUnchanged: true,
    dataRevisionUnchanged: true,
    muscleCacheSentinelRetained: true,
    prescriptionCacheSentinelRetained: true
  });
  expect.soft(result.rejectedState.message).toMatch(/identity|conflict|reconcil/i);
});

test("persisted legacy invalid muscle evidence survives startup only as quarantined non-executable data", async ({ page }) => {
  const legacyPackage = invalidMuscleScoreOnlyPersonalEvidencePackage({ version: "legacy-invalid/1.0.0" });
  const invalidRow = legacyPackage.personalData.exerciseMuscleScores[0];
  const runtimeIds = {
    session: "19191919-1919-4919-8919-191919191919",
    exercise: "20202020-2020-4020-8020-202020202020",
    set: "21212121-2121-4121-8121-212121212121"
  };
  await page.evaluate(async ({ packageValue, ids }) => {
    window.removeEventListener("pagehide", persistBeforeSuspend);
    window.removeEventListener("beforeunload", persistBeforeSuspend);
    window.clearTimeout(saveTimer);
    if (idleSaveHandle && "cancelIdleCallback" in window) window.cancelIdleCallback(idleSaveHandle);
    idleSaveHandle = 0;
    const legacy = emptyData();
    legacy.personalEvidencePackage = packageValue;
    legacy.dataRevision = Number(legacy.dataRevision || 0) + 1;
    legacy.sessions = [{
      id: ids.session,
      date: todayIso(),
      title: "Synthetic persisted legacy identity",
      submitted: true,
      workoutStarted: false,
      workoutState: "completed",
      completedAt: `${todayIso()}T13:00:00.000Z`,
      recovery: { illness: false, pain: false, affectedMuscle: "" }
    }];
    legacy.exercises = [{
      id: ids.exercise,
      sessionId: ids.session,
      name: packageValue.personalData.exerciseMuscleScores[0].exercise_name,
      primaryMuscle: "Chest",
      secondaryMuscle: "",
      order: 0,
      resistanceType: "external"
    }];
    legacy.sets = [{
      id: ids.set,
      exerciseId: ids.exercise,
      setNumber: 1,
      sequenceIndex: 0,
      setType: "straight",
      reps: 8,
      weight: 100,
      weightUnit: "lb",
      resistanceType: "external",
      rpe: 8,
      completed: true,
      skipped: false,
      isWarmup: false,
      countsTowardScore: true,
      countsTowardVolume: true,
      countsTowardProgression: true
    }];
    await writeIndexedValue("app-data", legacy);
  }, { packageValue: legacyPackage, ids: runtimeIds });

  await page.reload();
  await page.waitForLoadState("load");
  await expect.poll(() => page.evaluate(() => prescriptionEvidenceStatus?.state || "loading"), {
    message: "Persisted legacy evidence must finish normalization without traversing the import UI"
  }).toBe("ready");

  const result = await page.evaluate(async ({ invalidId, invalidName, invalidResearchId, runtimeExerciseId }) => {
    const profile = prescriptionEngine.evidence.personal.reconciledIdentityByExerciseId.get(invalidId);
    const lookup = personalExerciseRecordForName(invalidName);
    const exercise = exerciseById(runtimeExerciseId);
    const analytics = completedAnalysisIndex();
    const volume = weeklyMuscleVolume(startOfWeekIso(todayIso()));
    const persisted = await readIndexedValue("app-data");
    return {
      runtimeMarker: data.personalEvidencePackage?.personalData?.exerciseMuscleScores?.[0]?.research_exercise_id || "",
      persistedMarker: persisted?.personalEvidencePackage?.personalData?.exerciseMuscleScores?.[0]?.research_exercise_id || "",
      profile: { invalid: profile?.invalid, invalidReason: profile?.invalidReason },
      lookupId: lookup?.exercise_id || lookup?.exerciseId || "",
      canonicalId: canonicalExerciseId(invalidName),
      prescriptionId: prescriptionExerciseIdentity(invalidName),
      muscles: musclesForExercise(exercise),
      analyticsIndexed: analytics.canonicalByExerciseId.has(runtimeExerciseId),
      analyticsGrouped: [...analytics.exercisesByCanonical.values()].some((items) => items.some((item) => item.id === runtimeExerciseId)),
      positiveChestVolume: volume.some((item) => item.muscle === "Chest" && item.sets > 0),
      evidenceState: prescriptionEvidenceStatus.state,
      personalRecords: prescriptionEvidenceStatus.personalRecords,
      invalidResearchId
    };
  }, {
    invalidId: invalidRow.exercise_id,
    invalidName: invalidRow.exercise_name,
    invalidResearchId: invalidRow.research_exercise_id,
    runtimeExerciseId: runtimeIds.exercise
  });

  expect.soft(result.runtimeMarker, "The legacy package must remain available for audit instead of being silently rewritten").toBe(result.invalidResearchId);
  expect.soft(result.persistedMarker, "Startup normalization must preserve the persisted invalid marker").toBe(result.invalidResearchId);
  expect.soft(result.profile.invalid).toBe(true);
  expect.soft(result.profile.invalidReason).toMatch(/unknown research exercise/i);
  expect.soft(result.lookupId, "The three-source lookup must see the quarantined muscle-only row").toBe(invalidRow.exercise_id);
  expect.soft(result.canonicalId).toBeNull();
  expect.soft(result.prescriptionId).toBeNull();
  expect.soft(result.muscles).toEqual([]);
  expect.soft(result.analyticsIndexed).toBe(false);
  expect.soft(result.analyticsGrouped).toBe(false);
  expect.soft(result.positiveChestVolume).toBe(false);
  expect.soft(result.evidenceState).toBe("ready");
  expect.soft(result.personalRecords).toBe(3);
});
