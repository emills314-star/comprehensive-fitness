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
    data.recommendationHistory = [historicalSnapshot];
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
      .filter((pathname) => pathname.includes("/research_database/exports/json/"));
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

test("valid legacy personal evidence is preserved but stays inert while an invalid identity rejects atomically", async ({ page }) => {
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
    const originalData = data;
    const originalPersisted = await readIndexedValue("app-data");
    const originalActiveSessionId = activeSessionId;
    const originalActiveWorkoutId = activeWorkoutId;
    const originalActiveTab = activeTab;
    try {
      data = emptyData();
      activeSessionId = "";
      activeWorkoutId = "";
      activeTab = "settings";
      entityStructureRevision += 1;
      entityIndexCache = null;
      invalidateCompletedAnalysis();

      const revisionBeforeImport = analysisRevision;
      const knownIdentityBefore = prescriptionEngine.resolveExerciseIdentity("Barbell Bench Press");

      await importPersonalEvidenceFile(new File(
        [JSON.stringify(accepted)],
        "synthetic-valid-three-source-personal-evidence.json",
        { type: "application/json" }
      ));

      const successfulData = data;
      const successfulDataJson = JSON.stringify(data);
      const successfulPackage = data.personalEvidencePackage;
      const successfulEngine = prescriptionEngine;
      const successfulIdentityCatalog = prescriptionEngine?.evidence?.research?.exerciseDatabase;
      const knownIdentityAfter = prescriptionEngine.resolveExerciseIdentity("Barbell Bench Press");
      const persistedAfterSuccess = await readIndexedValue("app-data");
      const revisionAfterSuccess = analysisRevision;
      const dataRevisionAfterSuccess = data.dataRevision;

      await importPersonalEvidenceFile(new File(
        [JSON.stringify(invalid)],
        "synthetic-invalid-muscle-source-personal-evidence.json",
        { type: "application/json" }
      ));

      return {
        revisionBeforeImport,
        revisionAfterSuccess,
        engineReplacedWithIdentityOnlyRuntime: successfulEngine !== originalEngine,
        knownIdentityStable: JSON.stringify(knownIdentityAfter) === JSON.stringify(knownIdentityBefore),
        identityEnginePersonalRows: [
          successfulEngine?.evidence?.personal?.exercisePrescriptions,
          successfulEngine?.evidence?.personal?.exerciseScores,
          successfulEngine?.evidence?.personal?.exerciseMuscleScores
        ].reduce((count, rows) => count + (Array.isArray(rows) ? rows.length : 0), 0),
        importedCounts: {
          score: successfulPackage?.personalData?.exerciseScores?.length || 0,
          prescription: successfulPackage?.personalData?.exercisePrescriptions?.length || 0,
          muscle: successfulPackage?.personalData?.exerciseMuscleScores?.length || 0
        },
        persistedPackageUnchanged: JSON.stringify(persistedAfterSuccess?.personalEvidencePackage) === JSON.stringify(successfulPackage),
        importedNamesRemainInert: Object.values(expectedIdentities).every(({ name }) => (
          personalExerciseRecordForName(name) == null
          && prescriptionEngine.resolveExerciseIdentity(name)?.status !== "resolved"
        )),
        rejectedState: {
          engineUnchanged: prescriptionEngine === successfulEngine,
          identityCatalogUnchanged: prescriptionEngine?.evidence?.research?.exerciseDatabase === successfulIdentityCatalog,
          identityResolutionUnchanged: JSON.stringify(prescriptionEngine.resolveExerciseIdentity("Barbell Bench Press")) === JSON.stringify(knownIdentityAfter),
          packageUnchanged: data.personalEvidencePackage === successfulPackage,
          dataUnchanged: data === successfulData && JSON.stringify(data) === successfulDataJson,
          revisionUnchanged: analysisRevision === revisionAfterSuccess,
          dataRevisionUnchanged: data.dataRevision === dataRevisionAfterSuccess,
          persistedUnchanged: JSON.stringify(await readIndexedValue("app-data")) === JSON.stringify(persistedAfterSuccess),
          message: String(settingsMessage || "")
        }
      };
    } finally {
      prescriptionEngine = originalEngine;
      data = originalData;
      if (originalPersisted) await writeIndexedValue("app-data", originalPersisted);
      activeSessionId = originalActiveSessionId;
      activeWorkoutId = originalActiveWorkoutId;
      activeTab = originalActiveTab;
      entityStructureRevision += 1;
      entityIndexCache = null;
      invalidateCompletedAnalysis();
    }
  }, { accepted: acceptedPackage, invalid: invalidPackage, expectedIdentities: identities });

  expect.soft(result.engineReplacedWithIdentityOnlyRuntime, "Accepted imports must rebuild, not enrich, the identity-only runtime engine").toBe(true);
  expect.soft(result.knownIdentityStable, "Accepted legacy evidence must not alter a known public identity").toBe(true);
  expect.soft(result.identityEnginePersonalRows, "Normal runtime must not activate analytical personal rows").toBe(0);
  expect.soft(result.importedCounts, "All three valid legacy collections must remain preserved in app data").toEqual({ score: 1, prescription: 1, muscle: 1 });
  expect.soft(result.persistedPackageUnchanged, "The accepted package must be durable byte-for-byte").toBe(true);
  expect.soft(result.importedNamesRemainInert, "Stored legacy evidence names must not become a second identity source of truth").toBe(true);
  expect.soft(result.revisionAfterSuccess, "Successful import must invalidate revisioned derived state").toBeGreaterThan(result.revisionBeforeImport);
  expect.soft(result.rejectedState, "An invalid new identity must leave the accepted identity engine, package, revisions, and storage unchanged").toMatchObject({
    engineUnchanged: true,
    identityCatalogUnchanged: true,
    identityResolutionUnchanged: true,
    packageUnchanged: true,
    dataUnchanged: true,
    revisionUnchanged: true,
    dataRevisionUnchanged: true,
    persistedUnchanged: true
  });
  expect.soft(result.rejectedState.message).toMatch(/identity|conflict|reconcil/i);
});

test("persisted legacy invalid muscle evidence survives startup as inert preserved data", async ({ page }) => {
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
  await expect.poll(() => page.evaluate(() => {
    const identity = prescriptionEngine?.resolveExerciseIdentity?.("Barbell Bench Press");
    return identity?.status === "resolved" ? identity.exerciseId : "";
  }), {
    message: "Identity-only startup must complete without activating persisted legacy evidence"
  }).toBe("ex_barbell_bench_press");

  const result = await page.evaluate(async ({ invalidId, invalidName, invalidResearchId, runtimeExerciseId }) => {
    const lookup = personalExerciseRecordForName(invalidName);
    const identity = prescriptionEngine.resolveExerciseIdentity(invalidName);
    const profile = resolveExerciseIdentityProfile(exerciseById(runtimeExerciseId));
    const persisted = await readIndexedValue("app-data");
    return {
      runtimeMarker: data.personalEvidencePackage?.personalData?.exerciseMuscleScores?.[0]?.research_exercise_id || "",
      persistedMarker: persisted?.personalEvidencePackage?.personalData?.exerciseMuscleScores?.[0]?.research_exercise_id || "",
      lookupId: lookup?.exercise_id || lookup?.exerciseId || "",
      identity,
      profile,
      canonicalId: canonicalExerciseId(invalidName),
      identityEnginePersonalRows: [
        prescriptionEngine?.evidence?.personal?.exercisePrescriptions,
        prescriptionEngine?.evidence?.personal?.exerciseScores,
        prescriptionEngine?.evidence?.personal?.exerciseMuscleScores
      ].reduce((count, rows) => count + (Array.isArray(rows) ? rows.length : 0), 0),
      knownIdentity: prescriptionEngine.resolveExerciseIdentity("Barbell Bench Press"),
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
  expect.soft(result.identityEnginePersonalRows, "Startup must not activate persisted analytical personal rows").toBe(0);
  expect.soft(result.lookupId, "The identity-only engine must not index the persisted legacy row").toBe("");
  expect.soft(result.identity, "The persisted name must remain unresolved by the public identity catalog").toMatchObject({
    status: "unresolved"
  });
  expect.soft(result.profile, "The historical exercise may retain a reporting identity but it must not become executable").toMatchObject({
    status: "resolved",
    identitySource: "reporting_fallback",
    executable: false
  });
  expect.soft(result.canonicalId, "Historical grouping must use a stable reporting fallback without trusting the invalid research crosswalk").toBe("custom_synthetic_muscle_source_press");
  expect.soft(result.knownIdentity).toMatchObject({ status: "resolved", exerciseId: "ex_barbell_bench_press" });
});
