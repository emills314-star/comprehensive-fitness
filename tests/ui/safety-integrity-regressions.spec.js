"use strict";

const { test, expect } = require("@playwright/test");
const {
  IDS,
  safetyWorkoutState,
  validFullState
} = require("../fixtures/synthetic-app-backups");

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
  await expect.poll(() => page.evaluate(() => {
    const identity = prescriptionEngine?.resolveExerciseIdentity?.("Barbell Bench Press");
    return identity?.status === "resolved" ? identity.exerciseId : "";
  }), {
    message: "The identity compatibility catalog must resolve a known exercise before safety-integrity tests run"
  }).toBe("ex_barbell_bench_press");
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

test("historical equipment metadata remains immutable and cannot block workout logging", async ({ page }) => {
  const fixture = safetyWorkoutState({ illness: false, pain: true, affectedMuscle: "Chest" });
  await seedState(page, fixture.state, {
    activeSessionId: fixture.state.sessions[0].id,
    activeWorkoutId: fixture.state.sessions[0].id
  });

  const result = await page.evaluate(({ runtimeExerciseId }) => {
    const historicalSnapshot = {
      recommendationId: "public-synthetic-equipment-history",
      schemaVersion: "historical-recommendation/1.0.0",
      request: {
        exerciseId: "ex_barbell_bench_press",
        equipmentContext: {
          requirementAlternatives: [["barbell", "bench"]],
          observed: ["bodyweight"]
        }
      },
      finalPrescription: {
        exerciseId: "ex_barbell_bench_press",
        executable: false,
        executionBlocked: true,
        reason: "unavailable_equipment",
        safetyRestriction: {
          status: "blocked",
          reason: "unavailable_equipment",
          requiredEquipment: ["barbell", "bench"],
          observedEquipment: ["bodyweight"]
        }
      },
      createdAt: "2026-07-14T12:00:00.000Z"
    };
    const exercise = exerciseById(runtimeExerciseId);
    Object.assign(exercise, {
      recommendationSnapshot: historicalSnapshot,
      finalPrescription: historicalSnapshot.finalPrescription,
      executionBlocked: true,
      safetyRestriction: historicalSnapshot.finalPrescription.safetyRestriction
    });
    entityStructureRevision += 1;
    entityIndexCache = null;
    invalidateCompletedAnalysis();
    render();

    const metadataBefore = structuredClone({
      recommendationSnapshot: exercise.recommendationSnapshot,
      finalPrescription: exercise.finalPrescription,
      executionBlocked: exercise.executionBlocked,
      safetyRestriction: exercise.safetyRestriction
    });
    const before = setsForExercise(runtimeExerciseId).length;
    const decision = guardWorkoutMutation("add-set", { exerciseId: runtimeExerciseId }, false);
    addSet(runtimeExerciseId, false);
    render();
    const addSetControl = root.querySelector(`[data-action="add-set"][data-exercise-id="${runtimeExerciseId}"]`);
    return {
      decision,
      added: setsForExercise(runtimeExerciseId).length - before,
      addSetDisabled: addSetControl?.disabled === true,
      metadataBefore,
      metadataAfter: {
        recommendationSnapshot: exercise.recommendationSnapshot,
        finalPrescription: exercise.finalPrescription,
        executionBlocked: exercise.executionBlocked,
        safetyRestriction: exercise.safetyRestriction
      }
    };
  }, { runtimeExerciseId: fixture.exerciseIds.bench });

  expect.soft(result.decision.allowed, "Equipment metadata from an immutable historical recommendation cannot authorize a logging block").toBe(true);
  expect.soft(result.added, "The active exercise must accept an actual set despite historical equipment metadata").toBe(1);
  expect.soft(result.addSetDisabled, "The active logging control must remain enabled").toBe(false);
  expect.soft(result.metadataAfter, "Logging must not rewrite the historical recommendation or its equipment facts").toEqual(result.metadataBefore);
});

test("normal startup loads only the identity catalog and exposes no analytical evidence state", async ({ page }) => {
  const result = await page.evaluate(() => {
    const researchJsonRequests = performance.getEntriesByType("resource")
      .map((entry) => new URL(entry.name, location.href).pathname)
      .filter((pathname) => /^(?:\/resources\/[^/]+|\/research_database\/exports\/json\/[^/]+)\.json$/.test(pathname));
    const personal = prescriptionEngine?.evidence?.personal;
    return {
      knownIdentity: prescriptionEngine.resolveExerciseIdentity("Barbell Bench Press"),
      researchJsonRequests,
      identityRows: prescriptionEngine?.evidence?.research?.exerciseDatabase?.length || 0,
      personalRows: [
        personal?.exercisePrescriptions,
        personal?.exerciseScores,
        personal?.exerciseMuscleScores
      ].reduce((count, rows) => count + (Array.isArray(rows) ? rows.length : 0), 0),
      removedEvidenceStatusAbsent: typeof prescriptionEvidenceStatus === "undefined",
      visibleText: root.innerText
    };
  });

  expect.soft(result.knownIdentity).toMatchObject({ status: "resolved", exerciseId: "ex_barbell_bench_press" });
  expect.soft(result.identityRows, "The normal runtime needs a non-empty identity catalog").toBeGreaterThan(0);
  expect.soft(result.researchJsonRequests.filter((pathname) => pathname.endsWith("/exercise_database.json"))).toHaveLength(1);
  expect.soft(result.researchJsonRequests.filter((pathname) => !pathname.endsWith("/exercise_database.json")), "Normal startup must not fetch analytical or snapshot-validation JSON").toEqual([]);
  expect.soft(result.personalRows, "Normal startup must not activate personal analytical rows").toBe(0);
  expect.soft(result.removedEvidenceStatusAbsent, "The removed research-status state must not survive under a hidden name").toBe(true);
  expect.soft(result.visibleText).not.toMatch(/research status|evidence records|confidence score/i);
});

test("on-demand import validation quarantines an invalid crosswalk without enriching the identity-only runtime", async ({ page }) => {
  const result = await page.evaluate(async () => {
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
    const runtimeEngine = prescriptionEngine;
    const knownIdentityBefore = runtimeEngine.resolveExerciseIdentity("Barbell Bench Press");
    const researchData = await loadImportValidationResearch();
    const bundle = prescriptionApi.normalizeEvidenceBundle({ personalData, researchData });
    const customEngine = prescriptionApi.createPrescriptionEngine(bundle);
    const invalidProfile = customEngine.evidence.personal.reconciledIdentityByExerciseId.get(invalidId);
    const validProfile = customEngine.evidence.personal.reconciledIdentityByExerciseId.get(validId);
    const invalidLookup = personalExerciseRecordForName(invalidName, customEngine.evidence);
    const validLookup = personalExerciseRecordForName(validName, customEngine.evidence);
    return {
      invalidProfile: { invalid: invalidProfile?.invalid, invalidReason: invalidProfile?.invalidReason },
      validProfile: { invalid: validProfile?.invalid, researchExerciseId: validProfile?.researchExerciseId },
      invalidLookupId: invalidLookup?.exercise_id || invalidLookup?.exerciseId || "",
      validLookupId: validLookup?.exercise_id || validLookup?.exerciseId || "",
      invalidCustomResolution: customEngine.resolveExerciseIdentity(invalidName),
      runtimeEngineUnchanged: prescriptionEngine === runtimeEngine,
      runtimeInvalidLookup: personalExerciseRecordForName(invalidName),
      runtimeValidLookup: personalExerciseRecordForName(validName),
      knownIdentityStable: JSON.stringify(prescriptionEngine.resolveExerciseIdentity("Barbell Bench Press")) === JSON.stringify(knownIdentityBefore),
      runtimePersonalRows: [
        prescriptionEngine?.evidence?.personal?.exercisePrescriptions,
        prescriptionEngine?.evidence?.personal?.exerciseScores,
        prescriptionEngine?.evidence?.personal?.exerciseMuscleScores
      ].reduce((count, rows) => count + (Array.isArray(rows) ? rows.length : 0), 0)
    };
  });

  expect.soft(result.invalidProfile.invalid, "The test identity must be invalidated by the real reconciler").toBe(true);
  expect.soft(result.invalidProfile.invalidReason).toMatch(/unknown research exercise/i);
  expect.soft(result.invalidLookupId, "The temporary validation bundle must retain the invalid source row for an exact audit result").toBe("custom_synthetic_invalid_identity_press");
  expect.soft(result.invalidCustomResolution?.status, "The temporary validation engine must not resolve an invalid crosswalk").not.toBe("resolved");
  expect.soft(result.validProfile.invalid, "The positive-control custom identity must remain trusted").not.toBe(true);
  expect.soft(result.validLookupId).toBe("custom_synthetic_valid_identity_press");
  expect.soft(result.runtimeEngineUnchanged, "On-demand validation must not replace the normal identity engine").toBe(true);
  expect.soft(result.runtimeInvalidLookup).toBeNull();
  expect.soft(result.runtimeValidLookup).toBeNull();
  expect.soft(result.knownIdentityStable).toBe(true);
  expect.soft(result.runtimePersonalRows, "On-demand validation must not activate personal analytical rows globally").toBe(0);
});
