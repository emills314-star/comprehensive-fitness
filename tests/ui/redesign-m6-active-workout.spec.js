"use strict";

const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const {
  FIXED_NOW,
  IDS,
  STORAGE_KEY,
  buildActiveWorkoutLifecycleFixture
} = require("./fixtures/template-workout-history.fixture");

const LONG_VARIANT_NAME = "Barbell Bench Press — Heavy Competition Paused Variant";
const SUBSTITUTE_NAME = "One-Arm Dumbbell Row";
const SUBSTITUTE_RESEARCH_ID = "ex_dumbbell_row";
const CUSTOM_SUBSTITUTE_NAME = "Public Synthetic Offset-Handle Press";
const MULTI_HOP_SUBSTITUTE_NAME = "Public Synthetic Multi-Hop Press Variant";
const NEW_EXERCISE_NAME = "Public Synthetic Newly Added Cable Press";
const SESSION_NOTE = "Public synthetic M6 session note preserved across interruption.";
const EXERCISE_NOTE = "Public synthetic M6 variant note preserved across interruption.";
const LEGACY_DRAFT_NOTE = "Public synthetic legacy-v1 draft note.";
const MAX_VARIANT_PREFIX = "Public Synthetic Maximum Variant ";
const MAX_VARIANT_NAME = MAX_VARIANT_PREFIX + "V".repeat(256 - MAX_VARIANT_PREFIX.length);
const OVERLONG_VARIANT_NAME = `${MAX_VARIANT_NAME}Z`;
const INSTALL_MARKER = "public-synthetic-m6-fixture-installed";
const CLOCK_KEY = "public-synthetic-m6-clock";
const AUDIT_DIR = path.resolve(__dirname, "../../artifacts/ui-audit/m6");
const M0_BACKUP_NAMES = [
  "backup-v1-legacy.json",
  "backup-v2-mesocycle-equipment.json",
  "backup-v3-current.json"
];
const M0_BACKUPS = M0_BACKUP_NAMES.map((name) => ({
  name,
  value: JSON.parse(fs.readFileSync(path.resolve(__dirname, "../fixtures/redesign-m0", name), "utf8"))
}));

async function captureAuditScreenshot(page, name) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(AUDIT_DIR, `${name}-390x844.png`),
    animations: "disabled",
    scale: "css"
  });
}

function m6Fixture({ autoStartRestTimer = false } = {}) {
  const fixture = buildActiveWorkoutLifecycleFixture();
  fixture.appDataVersion = 3;
  fixture.settings.autoStartRestTimer = autoStartRestTimer;
  fixture.settings.timerNotifications = false;
  fixture.settings.timerSound = false;
  fixture.settings.timerVibration = false;
  fixture.sets.forEach((set) => {
    set.classificationSource = "recorded";
  });

  const session = fixture.sessions.find((item) => item.id === IDS.activeSession);
  session.templateId = IDS.controlTemplate;
  session.notes = "Public synthetic active M6 session.";

  const templateExercise = fixture.templates[0].exercises.find((item) => item.id === IDS.controlBenchTemplateExercise);
  Object.assign(templateExercise, {
    name: LONG_VARIANT_NAME,
    performanceExerciseId: "variant:public-synthetic-heavy-paused-bench",
    researchExerciseId: "ex_barbell_bench_press",
    identitySource: "public-synthetic-named-variant",
    sets: 2,
    reps: 6,
    repMin: 5,
    repMax: 7,
    targetRpe: 8.5,
    restSeconds: 15
  });

  const activeExercise = fixture.exercises.find((item) => item.id === IDS.activeBenchExercise);
  Object.assign(activeExercise, {
    name: LONG_VARIANT_NAME,
    performanceExerciseId: "variant:public-synthetic-heavy-paused-bench",
    researchExerciseId: "ex_barbell_bench_press",
    identitySource: "public-synthetic-named-variant",
    notes: "Public synthetic active M6 exercise.",
    restSeconds: 15,
    stableTargetSnapshot: {
      sets: 2,
      repLow: 5,
      repHigh: 7,
      rpe: 8.5,
      restSeconds: 15
    },
    manualOverrides: []
  });
  delete activeExercise.executionQualityAssessment;

  const historicalExercise = fixture.exercises.find((item) => item.id === IDS.historyBenchExercise);
  Object.assign(historicalExercise, {
    name: LONG_VARIANT_NAME,
    performanceExerciseId: "variant:public-synthetic-heavy-paused-bench",
    researchExerciseId: "ex_barbell_bench_press",
    identitySource: "public-synthetic-named-variant",
    executionQualityAssessment: "controlled"
  });

  for (const setId of [IDS.activeBenchSet1, IDS.activeBenchSet2]) {
    const set = fixture.sets.find((item) => item.id === setId);
    Object.assign(set, {
      reps: setId === IDS.activeBenchSet1 ? 6 : 7,
      rpe: setId === IDS.activeBenchSet1 ? 7 : 7.5,
      targetReps: 6,
      targetRepMin: 5,
      targetRepMax: 7,
      targetRpe: 8.5,
      targetRpeMin: 7.5,
      targetRpeMax: 8.5,
      targetRestSeconds: 15,
      originalTargetReference: {
        templateExerciseId: IDS.controlBenchTemplateExercise,
        variantId: "variant:public-synthetic-heavy-paused-bench"
      }
    });
  }

  return fixture;
}

async function installFixture(page, fixture) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ clockKey, fixedNow, installMarker, storageKey, storedFixture }) => {
    if (localStorage.getItem(installMarker) !== "true") {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(storageKey, JSON.stringify(storedFixture));
      localStorage.setItem(clockKey, String(Date.parse(fixedNow)));
      localStorage.setItem(installMarker, "true");
    }
    const NativeDate = Date;
    let currentEpoch = Number(localStorage.getItem(clockKey) || NativeDate.parse(fixedNow));
    class ControlledDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [currentEpoch]));
      }
      static now() {
        return currentEpoch;
      }
    }
    globalThis.Date = ControlledDate;
    globalThis.__advanceM6Clock = (milliseconds) => {
      currentEpoch += Number(milliseconds || 0);
      localStorage.setItem(clockKey, String(currentEpoch));
      return currentEpoch;
    };
  }, {
    clockKey: CLOCK_KEY,
    fixedNow: FIXED_NOW,
    installMarker: INSTALL_MARKER,
    storageKey: STORAGE_KEY,
    storedFixture: fixture
  });
  await page.goto("/#workout");
  await expect(page.locator(".workout-view")).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => Boolean(
    prescriptionEngine?.evidence?.research?.exerciseById?.has("ex_dumbbell_row")
  )), {
    message: "the identity catalog must be ready before M6 substitution checks",
    timeout: 45_000
  }).toBe(true);
}

async function openDetails(details) {
  for (let attempt = 0; attempt < 2 && !await details.evaluate((element) => element.open); attempt += 1) {
    await details.locator(":scope > summary").click();
    await details.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  }
  await expect.poll(() => details.evaluate((element) => element.open)).toBe(true);
}

async function activeState(page) {
  return page.evaluate(() => {
    const session = activeWorkoutSession();
    const exercises = data.exercises
      .filter((item) => item.sessionId === session.id)
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
    const exerciseIds = new Set(exercises.map((item) => item.id));
    return {
      session,
      exercises,
      sets: data.sets.filter((item) => exerciseIds.has(item.exerciseId)),
      timer: timer ? structuredClone(timer) : null,
      manualOverrides: structuredClone(data.manualOverrides),
      template: structuredClone(data.templates.find((item) => item.id === session.templateId))
    };
  });
}

test("M6 shows stable full variant targets and preserves historical execution quality without live UI", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, m6Fixture());

  const card = page.locator(`.exercise-card[aria-label="Exercise: ${LONG_VARIANT_NAME}"]`);
  await expect(card).toHaveCount(1);
  await expect(card.locator(".exercise-name-full")).toHaveText(LONG_VARIANT_NAME);
  const nameBox = await card.locator(".exercise-name-full").boundingBox();
  expect(nameBox?.width).toBeGreaterThanOrEqual(150);
  expect(nameBox?.height).toBeLessThanOrEqual(120);
  await expect(card.locator(".exercise-target")).toHaveAttribute("aria-label", /Stable target: .*5-7.*7\.5-8\.5/);
  await expect(page.getByText("Plate calculator", { exact: false })).toHaveCount(0);
  await expect(page.locator('[data-action="exercise-execution-quality"]')).toHaveCount(0);
  await expect(page.getByText(/execution quality|technique breakdown/i)).toHaveCount(0);

  await expect(page.locator(".workout-rest-starter")).toHaveCount(0);
  await expect(page.locator(".set-rest-button")).toHaveCount(0);
  await expect(page.locator(".set-block [data-action='start-timer']")).toHaveCount(0);

  await card.locator('[data-action="toggle-set"]').first().click();
  await expect(page.locator(".workout-rest-starter")).toHaveCount(1);
  await expect(page.locator(".workout-timer-slot .workout-rest-starter[data-action='start-timer']")).toHaveCount(1);

  const qualityBoundary = await page.evaluate(({ activeExerciseId, historicalExerciseId }) => ({
    historical: data.exercises.find((item) => item.id === historicalExerciseId)?.executionQualityAssessment,
    activeHasField: Object.hasOwn(data.exercises.find((item) => item.id === activeExerciseId), "executionQualityAssessment")
  }), {
    activeExerciseId: IDS.activeBenchExercise,
    historicalExerciseId: IDS.historyBenchExercise
  });
  expect(qualityBoundary).toEqual({ historical: "controlled", activeHasField: false });
  await captureAuditScreenshot(page, "active-workout-stable-targets");
});

test("M6 Add Exercise rejects invalid visible targets and creates target-complete working rows", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, m6Fixture());
  const panel = page.locator(".add-exercise-panel");
  await openDetails(panel);
  const name = panel.locator('[data-action="add-exercise-draft"]');
  const setCount = panel.locator('[data-action="add-exercise-set-count"]');
  const repMin = panel.locator('[data-action="add-exercise-rep-min"]');
  const repMax = panel.locator('[data-action="add-exercise-rep-max"]');
  const targetRpe = panel.locator('[data-action="add-exercise-target-rpe"]');
  const restSeconds = panel.locator('[data-action="add-exercise-rest-seconds"]');
  const add = panel.locator('[data-action="add-exercise"]');
  await expect(setCount).toBeVisible();
  await expect(repMin).toBeVisible();
  await expect(repMax).toBeVisible();
  await expect(targetRpe).toBeVisible();
  await expect(restSeconds).toBeVisible();

  const beforeCount = await page.evaluate(() => data.exercises.length);
  await name.fill(NEW_EXERCISE_NAME);
  await setCount.fill("3");
  await repMin.fill("11");
  await repMax.fill("10");
  await targetRpe.fill("7.5");
  await restSeconds.fill("75");
  await add.click();
  await expect.poll(() => page.evaluate(() => data.exercises.length)).toBe(beforeCount);
  await expect(page.locator(".app-toast")).toContainText(/ordered|rep range|1.*100/i);

  await openDetails(panel);
  await repMin.fill("6");
  await add.click();
  await expect.poll(() => page.evaluate((exerciseName) => {
    const exercise = data.exercises.find((item) => item.name === exerciseName);
    if (!exercise) return null;
    const sets = data.sets.filter((set) => set.exerciseId === exercise.id);
    return {
      exercise: {
        performanceExerciseId: exercise.performanceExerciseId,
        identitySource: exercise.identitySource,
        stableTargetSnapshot: exercise.stableTargetSnapshot,
        restSeconds: exercise.restSeconds
      },
      sets: sets.map((set) => ({
        setNumber: set.setNumber,
        setType: set.setType,
        completed: set.completed,
        skipped: set.skipped,
        targetReps: set.targetReps,
        targetRepMin: set.targetRepMin,
        targetRepMax: set.targetRepMax,
        targetRpe: set.targetRpe,
        targetRpeMin: set.targetRpeMin,
        targetRpeMax: set.targetRpeMax,
        targetRestSeconds: set.targetRestSeconds
      }))
    };
  }, NEW_EXERCISE_NAME)).toMatchObject({
    exercise: {
      performanceExerciseId: expect.stringMatching(/^custom_/),
      identitySource: "user_declared_custom",
      stableTargetSnapshot: {
        sets: 3,
        repLow: 6,
        repHigh: 10,
        rpe: 7.5,
        restSeconds: 75
      },
      restSeconds: 75
    },
    sets: [1, 2, 3].map((setNumber) => ({
      setNumber,
      setType: "straight",
      completed: false,
      skipped: false,
      targetReps: 8,
      targetRepMin: 6,
      targetRepMax: 10,
      targetRpe: 7.5,
      targetRpeMin: 7.5,
      targetRpeMax: 7.5,
      targetRestSeconds: 75
    }))
  });
});

test("M6 rejects a malformed draft atomically and preserves legacy-v1 draft and import compatibility", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, m6Fixture());

  const compatibility = await page.evaluate(async ({ historicalQuality, legacyDraftNote, m0Backups }) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    window.clearTimeout(draftSaveTimer);
    window.clearTimeout(saveTimer);

    const legacyImport = {
      appDataVersion: 1,
      sessions: [{
        id: "public-synthetic-import-session",
        date: "2026-07-01",
        title: "Public synthetic historical import",
        submitted: true,
        workoutStarted: false,
        workoutState: "complete"
      }],
      exercises: [{
        id: "public-synthetic-import-exercise",
        sessionId: "public-synthetic-import-session",
        name: "Public Synthetic Historical Press",
        executionQualityAssessment: historicalQuality
      }],
      sets: [],
      templates: [],
      settings: { weightUnit: "lb" }
    };
    const appStateBeforeImportValidation = JSON.stringify(data);
    const acceptedImport = validateImportedAppData(legacyImport);
    let invalidImportError = "";
    try {
      validateImportedAppData({
        ...legacyImport,
        exercises: [{
          ...legacyImport.exercises[0],
          executionQualityAssessment: "invented_live_quality"
        }]
      });
    } catch (error) {
      invalidImportError = String(error?.message || error);
    }
    const importValidationWasPure = JSON.stringify(data) === appStateBeforeImportValidation;
    const activeQualitySessionId = "public-synthetic-active-quality-import";
    const submittedQualitySessionId = "public-synthetic-submitted-quality-import";
    const activeQualityExerciseId = "public-synthetic-active-quality-exercise";
    const submittedQualityExerciseId = "public-synthetic-submitted-quality-exercise";
    const normalizedQualityImport = normalizeLoadedData(validateImportedAppData({
      appDataVersion: 3,
      sessions: [{
        id: activeQualitySessionId,
        date: "2026-07-16",
        title: "Public synthetic active quality compatibility",
        submitted: false,
        workoutStarted: true,
        workoutState: "active",
        exerciseQualityAnswers: { [activeQualityExerciseId]: historicalQuality }
      }, {
        id: submittedQualitySessionId,
        date: "2026-07-01",
        title: "Public synthetic submitted quality compatibility",
        submitted: true,
        workoutStarted: false,
        workoutState: "completed",
        submittedAt: "2026-07-01T12:00:00.000Z",
        exerciseQualityAnswers: { [submittedQualityExerciseId]: historicalQuality }
      }],
      exercises: [{
        id: activeQualityExerciseId,
        sessionId: activeQualitySessionId,
        name: "Public Synthetic Active Quality Press",
        executionQualityAssessment: historicalQuality
      }, {
        id: submittedQualityExerciseId,
        sessionId: submittedQualitySessionId,
        name: "Public Synthetic Submitted Quality Press",
        executionQualityAssessment: historicalQuality
      }],
      sets: [],
      templates: [],
      settings: { weightUnit: "lb" }
    }));
    const normalizedActiveQualitySession = normalizedQualityImport.sessions
      .find((session) => session.id === activeQualitySessionId);
    const normalizedSubmittedQualitySession = normalizedQualityImport.sessions
      .find((session) => session.id === submittedQualitySessionId);
    const normalizedActiveQualityExercise = normalizedQualityImport.exercises
      .find((exercise) => exercise.id === activeQualityExerciseId);
    const normalizedSubmittedQualityExercise = normalizedQualityImport.exercises
      .find((exercise) => exercise.id === submittedQualityExerciseId);
    const strictBackupImports = m0Backups.map(({ name, value }) => {
      const envelope = window.FitnessBackupContract.validateAndSanitizeBackup(value, {
        byteLength: new TextEncoder().encode(JSON.stringify(value)).byteLength
      });
      const decoded = window.FitnessBackupContract.decodeLegacyBackup(envelope);
      const { backupSchemaVersion: _backupSchemaVersion, ...appData } = decoded;
      const validated = validateImportedAppData(appData);
      return {
        name,
        appDataVersion: validated.appDataVersion,
        sessions: validated.sessions.length,
        exercises: validated.exercises.length,
        sets: validated.sets.length,
        templates: validated.templates.length,
        historicalQuality: validated.exercises.find((exercise) => exercise.executionQualityAssessment)?.executionQualityAssessment || null
      };
    });

    const validV2 = structuredClone(activeWorkoutDraftSnapshot());
    const currentStateBytes = () => JSON.stringify({
      dataRevision: data.dataRevision,
      sessions: data.sessions,
      exercises: data.exercises,
      sets: data.sets,
      timer
    });
    const invalidDraftCases = [
      ["cross-reference", (draft) => {
        draft.sets[0].exerciseId = "public-synthetic-missing-exercise";
      }],
      ["rpe-step", (draft) => {
        draft.sets[0].rpe = 7.25;
      }],
      ["decimal-reps", (draft) => {
        draft.sets[0].reps = 7.25;
      }],
      ["decimal-duration", (draft) => {
        draft.sets[0].durationSeconds = 7.25;
      }],
      ["target-rest-maximum", (draft) => {
        draft.sets[0].targetRestSeconds = 3601;
      }],
      ["target-rep-order", (draft) => {
        draft.sets[0].targetRepMin = 9;
        draft.sets[0].targetRepMax = 8;
      }],
      ["target-rpe-order", (draft) => {
        draft.sets[0].targetRpeMin = 8.5;
        draft.sets[0].targetRpeMax = 8;
      }],
      ["session-title-length", (draft) => {
        draft.session.title = "T".repeat(257);
      }],
      ["session-notes-length", (draft) => {
        draft.session.notes = "N".repeat(4097);
      }],
      ["exercise-notes-length", (draft) => {
        draft.exercises[0].notes = "E".repeat(4097);
      }],
      ["timer-duration", (draft) => {
        draft.timer = {
          id: "public-synthetic-invalid-timer",
          version: 1,
          workoutId: draft.workoutId,
          exerciseId: draft.exercises[0].id,
          setId: draft.sets[0].id,
          pendingNextSetId: "",
          durationSeconds: 4,
          remainingSeconds: 4,
          endsAt: Date.now() + 4_000,
          isActive: true,
          isPaused: false,
          isOvertime: false,
          overtimeSeconds: 0,
          notificationStatus: "disabled",
          backgroundedAt: 0
        };
      }],
      ["set-role", (draft) => {
        draft.sets[0].setType = "invented_role";
      }],
      ["exercise-order", (draft) => {
        draft.exercises[0].order = -1;
      }],
      ["role-provenance", (draft) => {
        draft.sets[0].classificationSource = "invented_provenance";
      }]
    ];
    const invalidDraftResults = [];
    for (const [label, mutate] of invalidDraftCases) {
      const malformed = structuredClone(validV2);
      mutate(malformed);
      const before = currentStateBytes();
      localStorage.setItem("comprehensive-fitness-active-draft-v1", JSON.stringify(malformed));
      await writeIndexedValue("active-workout-draft", malformed);
      const restored = await restoreActiveWorkoutDraft();
      invalidDraftResults.push({
        label,
        restored,
        stateWasAtomic: currentStateBytes() === before
      });
    }

    const legacyV1 = {
      version: 1,
      workoutId: validV2.workoutId,
      savedAt: validV2.savedAt,
      session: {
        ...validV2.session,
        notes: legacyDraftNote,
        exerciseQualityAnswers: { [validV2.exercises[0].id]: historicalQuality }
      },
      exercises: validV2.exercises.map((exercise, index) => index === 0
        ? { ...exercise, executionQualityAssessment: historicalQuality }
        : exercise),
      sets: validV2.sets,
      resolvedActions: validV2.resolvedActions
    };
    data = {
      ...data,
      sessions: data.sessions.map((session) => session.id === legacyV1.workoutId
        ? { ...session, notes: "State that the legacy draft must replace." }
        : session)
    };
    entityStructureRevision += 1;
    entityIndexCache = null;
    localStorage.setItem("comprehensive-fitness-active-draft-v1", JSON.stringify(legacyV1));
    await writeIndexedValue("active-workout-draft", legacyV1);
    const legacyRestored = await restoreActiveWorkoutDraft();
    window.clearTimeout(draftSaveTimer);
    const upgradedV2 = JSON.parse(localStorage.getItem("comprehensive-fitness-active-draft-v1") || "null");
    const draftFacts = (snapshot) => JSON.stringify({
      workoutId: snapshot?.workoutId,
      session: snapshot?.session,
      exercises: snapshot?.exercises,
      sets: snapshot?.sets,
      timer: snapshot?.timer || null,
      resolvedActions: snapshot?.resolvedActions || []
    });
    const upgradedV2Facts = draftFacts(upgradedV2);
    const upgradedV2Restored = await restoreActiveWorkoutDraft();
    window.clearTimeout(draftSaveTimer);
    const secondV2 = activeWorkoutDraftSnapshot();
    const v1ToV2Idempotent = upgradedV2Restored && draftFacts(secondV2) === upgradedV2Facts;
    const hiddenQualityV2 = structuredClone(secondV2);
    hiddenQualityV2.session.exerciseQualityAnswers = {
      [hiddenQualityV2.exercises[0].id]: historicalQuality
    };
    hiddenQualityV2.exercises[0].executionQualityAssessment = historicalQuality;
    localStorage.setItem("comprehensive-fitness-active-draft-v1", JSON.stringify(hiddenQualityV2));
    await writeIndexedValue("active-workout-draft", hiddenQualityV2);
    const hiddenQualityV2Restored = await restoreActiveWorkoutDraft();
    window.clearTimeout(draftSaveTimer);
    const resavedAfterHiddenQualityV2 = activeWorkoutDraftSnapshot();
    const restoredSession = data.sessions.find((session) => session.id === legacyV1.workoutId);
    const restoredExerciseIds = new Set(data.exercises
      .filter((exercise) => exercise.sessionId === legacyV1.workoutId)
      .map((exercise) => exercise.id));
    const boundaryPrefix = "Public Synthetic Maximum Variant ";
    const boundaryName = boundaryPrefix + "V".repeat(256 - boundaryPrefix.length);
    const boundaryIdentity = userSelectedExerciseIdentity(boundaryName);
    data = {
      ...data,
      dataRevision: Number(data.dataRevision || 0) + 1,
      exercises: data.exercises.map((exercise) => exercise.id === validV2.exercises[0].id
        ? {
            ...exercise,
            name: boundaryName,
            ...boundaryIdentity
          }
        : exercise)
    };
    entityStructureRevision += 1;
    entityIndexCache = null;
    const boundaryV2 = structuredClone(activeWorkoutDraftSnapshot());
    data = {
      ...data,
      exercises: data.exercises.map((exercise) => exercise.id === validV2.exercises[0].id
        ? { ...exercise, name: "Temporary name that the 256-character draft must replace." }
        : exercise)
    };
    localStorage.setItem("comprehensive-fitness-active-draft-v1", JSON.stringify(boundaryV2));
    await writeIndexedValue("active-workout-draft", boundaryV2);
    const boundaryRestored = await restoreActiveWorkoutDraft();
    window.clearTimeout(draftSaveTimer);
    const boundaryRestoredExercise = data.exercises.find((exercise) => exercise.id === validV2.exercises[0].id);

    const overlongV2 = structuredClone(boundaryV2);
    overlongV2.dataRevision = Number(data.dataRevision || 0);
    overlongV2.draftSequence = Number(overlongV2.draftSequence || 0) + 1;
    overlongV2.exercises[0].name = `${boundaryName}Z`;
    const stateBeforeOverlongRestore = currentStateBytes();
    localStorage.setItem("comprehensive-fitness-active-draft-v1", JSON.stringify(overlongV2));
    await writeIndexedValue("active-workout-draft", overlongV2);
    const overlongRestored = await restoreActiveWorkoutDraft();
    const overlongRestoreWasAtomic = currentStateBytes() === stateBeforeOverlongRestore;

    return {
      acceptedImportVersion: acceptedImport.appDataVersion,
      acceptedHistoricalQuality: acceptedImport.exercises[0]?.executionQualityAssessment,
      invalidImportError,
      importValidationWasPure,
      activeImportSessionHasQuality: Object.hasOwn(normalizedActiveQualitySession, "exerciseQualityAnswers"),
      activeImportExerciseHasQuality: Object.hasOwn(normalizedActiveQualityExercise, "executionQualityAssessment"),
      submittedImportSessionQuality: normalizedSubmittedQualitySession.exerciseQualityAnswers,
      submittedImportExerciseQuality: normalizedSubmittedQualityExercise.executionQualityAssessment,
      strictBackupImports,
      invalidDraftResults,
      legacyRestored,
      upgradedContractVersion: upgradedV2?.contractVersion,
      upgradedVersion: upgradedV2?.version,
      upgradedTimer: upgradedV2?.timer || null,
      upgradedV2Restored,
      v1ToV2Idempotent,
      upgradedSessionHasQuality: Object.hasOwn(upgradedV2?.session || {}, "exerciseQualityAnswers"),
      upgradedExerciseHasQuality: Object.hasOwn(upgradedV2?.exercises?.[0] || {}, "executionQualityAssessment"),
      hiddenQualityV2Restored,
      resavedV2SessionHasQuality: Object.hasOwn(resavedAfterHiddenQualityV2.session, "exerciseQualityAnswers"),
      resavedV2ExerciseHasQuality: Object.hasOwn(resavedAfterHiddenQualityV2.exercises[0], "executionQualityAssessment"),
      restoredLegacyNote: restoredSession?.notes,
      restoredLegacyExerciseIds: [...restoredExerciseIds].sort(),
      expectedLegacyExerciseIds: validV2.exercises.map((exercise) => exercise.id).sort(),
      restoredLegacySetIds: data.sets
        .filter((set) => restoredExerciseIds.has(set.exerciseId))
        .map((set) => set.id)
        .sort(),
      expectedLegacySetIds: validV2.sets.map((set) => set.id).sort(),
      restoredTimer: timer ? structuredClone(timer) : null,
      boundaryNameLength: boundaryName.length,
      boundaryIdentityLength: String(boundaryIdentity.performanceExerciseId || "").length,
      boundaryIdentity: boundaryIdentity.performanceExerciseId,
      boundaryRestored,
      boundaryRestoredName: boundaryRestoredExercise?.name,
      boundaryRestoredIdentity: boundaryRestoredExercise?.performanceExerciseId,
      overlongNameLength: overlongV2.exercises[0].name.length,
      overlongRestored,
      overlongRestoreWasAtomic
    };
  }, {
    historicalQuality: "controlled",
    legacyDraftNote: LEGACY_DRAFT_NOTE,
    m0Backups: M0_BACKUPS
  });

  expect(compatibility).toMatchObject({
    acceptedImportVersion: 1,
    acceptedHistoricalQuality: "controlled",
    importValidationWasPure: true,
    activeImportSessionHasQuality: false,
    activeImportExerciseHasQuality: false,
    submittedImportSessionQuality: {
      "public-synthetic-submitted-quality-exercise": "controlled"
    },
    submittedImportExerciseQuality: "controlled",
    legacyRestored: true,
    upgradedContractVersion: "comprehensive-fitness-active-draft/2.0.0",
    upgradedVersion: 2,
    upgradedTimer: null,
    upgradedV2Restored: true,
    v1ToV2Idempotent: true,
    upgradedSessionHasQuality: false,
    upgradedExerciseHasQuality: false,
    hiddenQualityV2Restored: true,
    resavedV2SessionHasQuality: false,
    resavedV2ExerciseHasQuality: false,
    restoredLegacyNote: LEGACY_DRAFT_NOTE,
    restoredTimer: null,
    boundaryNameLength: 256,
    boundaryRestored: true,
    overlongNameLength: 257,
    overlongRestored: false,
    overlongRestoreWasAtomic: true
  });
  expect(compatibility.invalidImportError).toMatch(/execution quality is invalid/i);
  expect(compatibility.strictBackupImports.map((fixture) => [fixture.name, fixture.appDataVersion])).toEqual([
    ["backup-v1-legacy.json", 1],
    ["backup-v2-mesocycle-equipment.json", 2],
    ["backup-v3-current.json", 3]
  ]);
  expect(compatibility.strictBackupImports.every((fixture) => fixture.sessions > 0
    && fixture.exercises > 0
    && fixture.sets > 0
    && fixture.templates > 0)).toBe(true);
  expect(compatibility.strictBackupImports.find((fixture) => fixture.name === "backup-v1-legacy.json")?.historicalQuality).toBe("controlled");
  expect(compatibility.invalidDraftResults).toEqual([
    { label: "cross-reference", restored: false, stateWasAtomic: true },
    { label: "rpe-step", restored: false, stateWasAtomic: true },
    { label: "decimal-reps", restored: false, stateWasAtomic: true },
    { label: "decimal-duration", restored: false, stateWasAtomic: true },
    { label: "target-rest-maximum", restored: false, stateWasAtomic: true },
    { label: "target-rep-order", restored: false, stateWasAtomic: true },
    { label: "target-rpe-order", restored: false, stateWasAtomic: true },
    { label: "session-title-length", restored: false, stateWasAtomic: true },
    { label: "session-notes-length", restored: false, stateWasAtomic: true },
    { label: "exercise-notes-length", restored: false, stateWasAtomic: true },
    { label: "timer-duration", restored: false, stateWasAtomic: true },
    { label: "set-role", restored: false, stateWasAtomic: true },
    { label: "exercise-order", restored: false, stateWasAtomic: true },
    { label: "role-provenance", restored: false, stateWasAtomic: true }
  ]);
  expect(compatibility.restoredLegacyExerciseIds).toEqual(compatibility.expectedLegacyExerciseIds);
  expect(compatibility.restoredLegacySetIds).toEqual(compatibility.expectedLegacySetIds);
  expect(compatibility.boundaryIdentityLength).toBeGreaterThan(0);
  expect(compatibility.boundaryIdentityLength).toBeLessThanOrEqual(128);
  expect(compatibility.boundaryRestoredName).toHaveLength(256);
  expect(compatibility.boundaryRestoredIdentity).toBe(compatibility.boundaryIdentity);
});

test("M6 routine rename accepts 256 characters, rejects 257 atomically, and starts with the full stable identity", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, m6Fixture());

  const result = await page.evaluate(({
    maxName,
    overlongName,
    rowTemplateExerciseId,
    templateExerciseId,
    templateId
  }) => {
    const templateExercise = data.templates
      .find((template) => template.id === templateId)
      ?.exercises.find((exercise) => exercise.id === templateExerciseId);
    const priorPerformanceExerciseId = templateExercise.performanceExerciseId;
    patchTemplateExerciseName(templateId, templateExerciseId, maxName, false);
    const accepted = structuredClone(data.templates
      .find((template) => template.id === templateId)
      .exercises.find((exercise) => exercise.id === templateExerciseId));
    const existingCustomId = "custom_public_synthetic_existing_row_12345678";
    const existingCustomName = "Public Synthetic Existing Custom Row";
    const renamedCustomName = "Public Synthetic Existing Custom Row Renamed";
    patchTemplateExercise(templateId, rowTemplateExerciseId, {
      name: existingCustomName,
      performanceExerciseId: existingCustomId,
      researchExerciseId: "",
      identitySource: "user_declared_custom",
      identityVersion: "exercise-identity/2.1.0"
    }, false);
    patchTemplateExerciseName(templateId, rowTemplateExerciseId, renamedCustomName, false);
    const renamedExistingCustom = structuredClone(data.templates
      .find((template) => template.id === templateId)
      .exercises.find((exercise) => exercise.id === rowTemplateExerciseId));

    const beforeOverlong = JSON.stringify({
      dataRevision: data.dataRevision,
      exercise: accepted
    });
    patchTemplateExerciseName(templateId, templateExerciseId, overlongName, false);
    const afterOverlongExercise = data.templates
      .find((template) => template.id === templateId)
      .exercises.find((exercise) => exercise.id === templateExerciseId);
    const overlongWasAtomic = JSON.stringify({
      dataRevision: data.dataRevision,
      exercise: afterOverlongExercise
    }) === beforeOverlong;

    activeWorkoutId = "";
    startTemplate(templateId, defaultRecovery(), "usual");
    const startedSession = activeWorkoutSession();
    const startedExercise = data.exercises.find((exercise) => exercise.sessionId === startedSession?.id
      && exercise.name === maxName);
    const startedExistingCustom = data.exercises.find((exercise) => exercise.sessionId === startedSession?.id
      && exercise.name === renamedCustomName);
    const startedSets = data.sets.filter((set) => set.exerciseId === startedExercise?.id);
    return {
      priorPerformanceExerciseId,
      accepted,
      existingCustomId,
      renamedExistingCustom,
      overlongWasAtomic,
      startedSessionId: startedSession?.id,
      startedName: startedExercise?.name,
      startedPerformanceExerciseId: startedExercise?.performanceExerciseId,
      startedHasPriorComparableHistory: startedSets.some((set) => Boolean(set.previousComparableSet)),
      startedExistingCustomName: startedExistingCustom?.name,
      startedExistingCustomPerformanceExerciseId: startedExistingCustom?.performanceExerciseId
    };
  }, {
    maxName: MAX_VARIANT_NAME,
    overlongName: OVERLONG_VARIANT_NAME,
    rowTemplateExerciseId: IDS.controlRowTemplateExercise,
    templateExerciseId: IDS.controlBenchTemplateExercise,
    templateId: IDS.controlTemplate
  });

  expect(result.accepted.name).toBe(MAX_VARIANT_NAME);
  expect(result.accepted.name).toHaveLength(256);
  expect(result.accepted.performanceExerciseId).not.toBe(result.priorPerformanceExerciseId);
  expect(result.accepted.performanceExerciseId).toMatch(/^custom_/);
  expect(result.accepted.performanceExerciseId.length).toBeLessThanOrEqual(128);
  expect(result.renamedExistingCustom).toMatchObject({
    name: "Public Synthetic Existing Custom Row Renamed",
    performanceExerciseId: result.existingCustomId,
    researchExerciseId: "",
    identitySource: "user_declared_custom"
  });
  expect(result.overlongWasAtomic).toBe(true);
  expect(result.startedSessionId).toBe(IDS.activeSession);
  expect(result.startedName).toBe(MAX_VARIANT_NAME);
  expect(result.startedName).toHaveLength(256);
  expect(result.startedPerformanceExerciseId).toBe(result.accepted.performanceExerciseId);
  expect(result.startedHasPriorComparableHistory).toBe(false);
  expect(result.startedExistingCustomName).toBe("Public Synthetic Existing Custom Row Renamed");
  expect(result.startedExistingCustomPerformanceExerciseId).toBe(result.existingCustomId);
});

test("M6 keeps lifetime PR high-water and submitted equipment evidence while clearing active equipment blockers", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, m6Fixture());

  const boundaries = await page.evaluate(({ activeExerciseId, activeSessionId }) => {
    const currentSession = data.sessions.find((session) => session.id === activeSessionId);
    const currentExercise = data.exercises.find((exercise) => exercise.id === activeExerciseId);
    const olderSession = {
      id: "public-synthetic-lifetime-pr-session",
      date: "2025-12-01",
      title: "Public synthetic older lifetime high-water",
      submitted: true,
      workoutStarted: false,
      workoutState: "completed",
      submittedAt: "2025-12-01T18:00:00.000Z",
      completedAt: "2025-12-01T18:00:00.000Z"
    };
    const olderExercise = {
      id: "public-synthetic-lifetime-pr-exercise",
      sessionId: olderSession.id,
      name: currentExercise.name,
      performanceExerciseId: currentExercise.performanceExerciseId,
      researchExerciseId: currentExercise.researchExerciseId,
      identitySource: currentExercise.identitySource,
      order: 0,
      resistanceType: "external",
      isBodyweight: false
    };
    const olderSet = {
      id: "public-synthetic-lifetime-pr-set",
      exerciseId: olderExercise.id,
      setNumber: 1,
      setType: "straight",
      classificationSource: "recorded",
      completed: true,
      skipped: false,
      weight: 225,
      reps: 5,
      rpe: 8,
      resistanceType: "external",
      isBodyweight: false
    };
    data = {
      ...data,
      sessions: [...data.sessions, olderSession],
      exercises: [...data.exercises, olderExercise],
      sets: [...data.sets, olderSet]
    };
    entityStructureRevision += 1;
    entityIndexCache = null;
    const lifetimePrevious = workoutPrPreviousHighWater(currentSession, currentExercise, {
      exercise: currentExercise.name,
      type: "Heaviest set",
      value: "230 lb"
    });
    const ageDays = Math.floor((Date.parse(currentSession.date) - Date.parse(olderSession.date)) / 86_400_000);

    const restriction = {
      status: "blocked",
      reason: "unavailable_equipment",
      scope: "exercise",
      originalExerciseId: "ex_public_synthetic_machine_press",
      auditBaseTargets: {
        exerciseId: "ex_public_synthetic_machine_press",
        workingSets: 3,
        repRange: { min: 6, max: 8 },
        targetRpe: 8
      }
    };
    const blockedExercise = (id, sessionId) => ({
      id,
      sessionId,
      name: "Public Synthetic Machine Press",
      order: 0,
      resistanceType: "external",
      isBodyweight: false,
      executionBlocked: true,
      safetyRestriction: structuredClone(restriction),
      finalPrescription: {
        executionBlocked: true,
        executable: false,
        reason: "unavailable_equipment",
        safetyRestriction: structuredClone(restriction)
      },
      recommendationSnapshot: {
        recommendationId: `recommendation-${id}`,
        finalPrescription: {
          executionBlocked: true,
          executable: false,
          reason: "unavailable_equipment",
          safetyRestriction: structuredClone(restriction)
        }
      }
    });
    const submittedBlocked = blockedExercise(
      "public-synthetic-submitted-equipment-block",
      "public-synthetic-submitted-equipment-session"
    );
    const activeBlocked = blockedExercise(
      "public-synthetic-active-equipment-block",
      "public-synthetic-active-equipment-session"
    );
    const blockerBytes = (exercise) => JSON.stringify({
      executionBlocked: exercise.executionBlocked,
      safetyRestriction: exercise.safetyRestriction,
      finalPrescription: exercise.finalPrescription,
      recommendationSnapshot: exercise.recommendationSnapshot
    });
    const submittedBlockBytesBefore = blockerBytes(submittedBlocked);
    const activeRecommendationBytesBefore = JSON.stringify(activeBlocked.recommendationSnapshot);
    const normalized = normalizeLoadedData({
      ...emptyData(),
      appDataVersion: 3,
      dataRevision: 7,
      sessions: [{
        id: submittedBlocked.sessionId,
        date: "2026-01-01",
        title: "Public synthetic submitted equipment history",
        submitted: true,
        workoutStarted: false,
        workoutState: "completed",
        submittedAt: "2026-01-01T12:00:00.000Z"
      }, {
        id: activeBlocked.sessionId,
        date: "2026-07-16",
        title: "Public synthetic active equipment migration",
        submitted: false,
        workoutStarted: true,
        workoutState: "active",
        startedAt: "2026-07-16T16:00:00.000Z"
      }],
      exercises: [submittedBlocked, activeBlocked],
      sets: [],
      templates: [],
      settings: { ...data.settings }
    });
    const normalizedSubmitted = normalized.exercises.find((exercise) => exercise.id === submittedBlocked.id);
    const normalizedActive = normalized.exercises.find((exercise) => exercise.id === activeBlocked.id);

    return {
      ageDays,
      lifetimePrevious,
      submittedBlockBytesBefore,
      submittedBlockBytesAfter: blockerBytes(normalizedSubmitted),
      activeHasExecutionBlocked: Object.hasOwn(normalizedActive, "executionBlocked"),
      activeHasSafetyRestriction: Object.hasOwn(normalizedActive, "safetyRestriction"),
      activeFinalPrescription: structuredClone(normalizedActive.finalPrescription),
      activeRecommendationBytesBefore,
      activeRecommendationBytesAfter: JSON.stringify(normalizedActive.recommendationSnapshot)
    };
  }, {
    activeExerciseId: IDS.activeBenchExercise,
    activeSessionId: IDS.activeSession
  });

  expect(boundaries.ageDays).toBeGreaterThan(183);
  expect(boundaries.lifetimePrevious).toBe("225 lb");
  expect(boundaries.submittedBlockBytesAfter).toBe(boundaries.submittedBlockBytesBefore);
  expect(boundaries.activeHasExecutionBlocked).toBe(false);
  expect(boundaries.activeHasSafetyRestriction).toBe(false);
  expect(boundaries.activeFinalPrescription).not.toHaveProperty("executionBlocked");
  expect(boundaries.activeFinalPrescription).not.toHaveProperty("executable");
  expect(boundaries.activeFinalPrescription).not.toHaveProperty("safetyRestriction");
  expect(boundaries.activeFinalPrescription).not.toHaveProperty("reason");
  expect(boundaries.activeRecommendationBytesAfter).toBe(boundaries.activeRecommendationBytesBefore);
});

test("M6 ordinary substitution splits actual identity, audits the override, and changes the routine only after explicit save", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, m6Fixture());
  const sourceCard = page.locator(`.exercise-card[aria-label="Exercise: ${LONG_VARIANT_NAME}"]`);
  const routineBefore = await page.evaluate((templateExerciseId) => {
    const template = data.templates.find((item) => item.id === activeWorkoutSession().templateId);
    return JSON.stringify(template.exercises.find((item) => item.id === templateExerciseId));
  }, IDS.controlBenchTemplateExercise);

  await sourceCard.getByRole("button", { name: "Mark set complete", exact: true }).click();
  await openDetails(sourceCard.locator(".exercise-details"));
  const substituteName = sourceCard.locator('[data-action="exercise-substitute-name"]');
  await expect(substituteName).toBeVisible();
  await substituteName.fill(SUBSTITUTE_NAME);
  await sourceCard.locator('[data-action="apply-exercise-substitution"]').click();

  const afterSubstitution = await activeState(page);
  const source = afterSubstitution.exercises.find((item) => item.id === IDS.activeBenchExercise);
  const replacement = afterSubstitution.exercises.find((item) => item.name === SUBSTITUTE_NAME);
  expect(source).toBeTruthy();
  expect(replacement).toBeTruthy();
  expect(replacement.id).not.toBe(source.id);
  expect(replacement.performanceExerciseId).not.toBe(source.performanceExerciseId);
  expect(replacement.researchExerciseId).toBe(SUBSTITUTE_RESEARCH_ID);
  expect(replacement.identitySource).toBeTruthy();

  const sourceSets = afterSubstitution.sets.filter((item) => item.exerciseId === source.id);
  const replacementSets = afterSubstitution.sets.filter((item) => item.exerciseId === replacement.id);
  expect(sourceSets).toHaveLength(1);
  expect(sourceSets[0].completed).toBe(true);
  expect(replacementSets).toHaveLength(1);
  expect(replacementSets[0].completed).toBe(false);
  expect(replacementSets[0].previousComparableSet).toBeFalsy();

  const override = afterSubstitution.manualOverrides.find((item) => item.action === "substitute_exercise");
  expect(override).toMatchObject({
    field: "exerciseVariant",
    action: "substitute_exercise",
    lockedForWorkout: true,
    from: {
      name: LONG_VARIANT_NAME,
      performanceExerciseId: "variant:public-synthetic-heavy-paused-bench",
      researchExerciseId: "ex_barbell_bench_press"
    },
    to: {
      name: SUBSTITUTE_NAME,
      researchExerciseId: SUBSTITUTE_RESEARCH_ID
    }
  });
  expect(replacement.manualOverrides.some((item) => item.overrideId === override.overrideId)).toBe(true);
  expect(JSON.stringify(afterSubstitution.template.exercises.find((item) => item.id === IDS.controlBenchTemplateExercise))).toBe(routineBefore);

  const replacementCard = page.locator(`.exercise-card[aria-label="Exercise: ${SUBSTITUTE_NAME}"]`);
  await expect(replacementCard).toHaveCount(1);
  await expect(replacementCard.getByText(/No previous workout found|No history/i)).toBeVisible();
  const replacementDetails = replacementCard.locator(".exercise-details");
  await openDetails(replacementDetails);
  const explicitSave = replacementDetails.locator('[data-action="update-template-exercise"]');
  await expect(explicitSave).toHaveAccessibleName("Save today’s targets to routine");
  await explicitSave.click();
  await expect.poll(() => page.evaluate((templateExerciseId) => {
    const template = data.templates.find((item) => item.id === activeWorkoutSession().templateId);
    const exercise = template.exercises.find((item) => item.id === templateExerciseId);
    return {
      name: exercise?.name,
      performanceExerciseId: exercise?.performanceExerciseId,
      researchExerciseId: exercise?.researchExerciseId,
      sets: exercise?.sets,
      reps: exercise?.reps,
      repMin: exercise?.repMin,
      repMax: exercise?.repMax,
      targetRpe: exercise?.targetRpe,
      restSeconds: exercise?.restSeconds,
      warmupCount: exercise?.warmups?.length,
      setTypes: exercise?.setTypes?.map((setType) => ({
        type: setType.type,
        setCount: setType.setCount,
        repMin: setType.repMin,
        repMax: setType.repMax,
        rpeMin: setType.rpeMin,
        rpeMax: setType.rpeMax,
        restSeconds: setType.restSeconds,
        countsTowardScore: setType.countsTowardScore,
        countsTowardVolume: setType.countsTowardVolume
      }))
    };
  }, IDS.controlBenchTemplateExercise)).toMatchObject({
    name: SUBSTITUTE_NAME,
    researchExerciseId: SUBSTITUTE_RESEARCH_ID,
    sets: 2,
    reps: 6,
    repMin: 5,
    repMax: 7,
    targetRpe: 8.5,
    restSeconds: 15,
    warmupCount: 0,
    setTypes: [{
      type: "top",
      setCount: 1,
      repMin: 5,
      repMax: 7,
      rpeMin: 7.5,
      rpeMax: 8.5,
      restSeconds: 15,
      countsTowardScore: true,
      countsTowardVolume: true
    }, {
      type: "backoff",
      setCount: 1,
      repMin: 5,
      repMax: 7,
      rpeMin: 7.5,
      rpeMax: 8.5,
      restSeconds: 15,
      countsTowardScore: true,
      countsTowardVolume: true
    }]
  });
});

test("M6 multi-hop substitution saves the earliest routine slot with the complete source-to-current structure", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, m6Fixture());

  const result = await page.evaluate(({
    firstName,
    multiHopName,
    sourceExerciseId,
    sourceSetId,
    templateExerciseId
  }) => {
    patchSet(sourceSetId, { completed: true, skipped: false }, false);
    applyExerciseSubstitution(sourceExerciseId, firstName);
    const firstReplacement = data.exercises.find((exercise) => exercise.name === firstName
      && exercise.sessionId === activeWorkoutSession().id);
    applyExerciseSubstitution(firstReplacement.id, multiHopName);
    const current = data.exercises.find((exercise) => exercise.id === firstReplacement.id);
    updateTemplateFromExercise(current.id);
    const templateExercise = data.templates
      .find((template) => template.id === activeWorkoutSession().templateId)
      .exercises.find((exercise) => exercise.id === templateExerciseId);
    return {
      current: structuredClone(current),
      substitutions: current.manualOverrides
        .filter((entry) => entry.field === "exerciseVariant" && entry.action === "substitute_exercise")
        .map((entry) => ({
          exerciseRuntimeId: entry.exerciseRuntimeId,
          fromName: entry.from?.name,
          toName: entry.to?.name
        })),
      templateExercise: structuredClone(templateExercise)
    };
  }, {
    firstName: SUBSTITUTE_NAME,
    multiHopName: MULTI_HOP_SUBSTITUTE_NAME,
    sourceExerciseId: IDS.activeBenchExercise,
    sourceSetId: IDS.activeBenchSet1,
    templateExerciseId: IDS.controlBenchTemplateExercise
  });

  expect(result.current.name).toBe(MULTI_HOP_SUBSTITUTE_NAME);
  expect(result.substitutions).toEqual([{
    exerciseRuntimeId: IDS.activeBenchExercise,
    fromName: LONG_VARIANT_NAME,
    toName: SUBSTITUTE_NAME
  }, {
    exerciseRuntimeId: result.current.id,
    fromName: SUBSTITUTE_NAME,
    toName: MULTI_HOP_SUBSTITUTE_NAME
  }]);
  expect(result.templateExercise).toMatchObject({
    id: IDS.controlBenchTemplateExercise,
    name: MULTI_HOP_SUBSTITUTE_NAME,
    performanceExerciseId: result.current.performanceExerciseId,
    researchExerciseId: "",
    sets: 2,
    reps: 6,
    repMin: 5,
    repMax: 7,
    targetRpe: 8.5,
    restSeconds: 15,
    setTypes: [{
      type: "top",
      setCount: 1,
      repMin: 5,
      repMax: 7,
      rpeMin: 7.5,
      rpeMax: 8.5,
      restSeconds: 15
    }, {
      type: "backoff",
      setCount: 1,
      repMin: 5,
      repMax: 7,
      rpeMin: 7.5,
      rpeMax: 8.5,
      restSeconds: 15
    }]
  });
});

test("M6 substitution keeps completed warm-up and skipped work on source and seeds one real replacement working set", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, m6Fixture());
  await page.evaluate(({ warmupSetId, skippedWorkingSetId }) => {
    data = {
      ...data,
      sets: data.sets.map((set) => {
        if (set.id === warmupSetId) {
          return {
            ...set,
            setType: "warmup",
            isWarmup: true,
            countsTowardScore: false,
            countsTowardVolume: false,
            countsTowardProgression: false,
            completed: true,
            skipped: false
          };
        }
        if (set.id === skippedWorkingSetId) {
          return {
            ...set,
            setType: "straight",
            isWarmup: false,
            countsTowardScore: true,
            countsTowardVolume: true,
            countsTowardProgression: true,
            completed: false,
            skipped: true
          };
        }
        return set;
      })
    };
    entityStructureRevision += 1;
    entityIndexCache = null;
    render();
  }, {
    warmupSetId: IDS.activeBenchSet1,
    skippedWorkingSetId: IDS.activeBenchSet2
  });

  const sourceCard = page.locator(`.exercise-card[aria-label="Exercise: ${LONG_VARIANT_NAME}"]`);
  await openDetails(sourceCard.locator(".exercise-details"));
  await sourceCard.locator('[data-action="exercise-substitute-name"]').fill(SUBSTITUTE_NAME);
  await sourceCard.locator('[data-action="apply-exercise-substitution"]').click();

  const result = await activeState(page);
  const source = result.exercises.find((exercise) => exercise.id === IDS.activeBenchExercise);
  const replacement = result.exercises.find((exercise) => exercise.name === SUBSTITUTE_NAME);
  expect(source).toBeTruthy();
  expect(replacement).toBeTruthy();
  const sourceSets = result.sets.filter((set) => set.exerciseId === source.id);
  const replacementSets = result.sets.filter((set) => set.exerciseId === replacement.id);
  expect(sourceSets.map((set) => set.id).sort()).toEqual([
    IDS.activeBenchSet1,
    IDS.activeBenchSet2
  ].sort());
  expect(sourceSets.find((set) => set.id === IDS.activeBenchSet1)).toMatchObject({
    setType: "warmup",
    isWarmup: true,
    completed: true,
    skipped: false,
    countsTowardProgression: false
  });
  expect(sourceSets.find((set) => set.id === IDS.activeBenchSet2)).toMatchObject({
    setType: "straight",
    isWarmup: false,
    completed: false,
    skipped: true
  });
  expect(replacementSets).toHaveLength(1);
  expect(replacementSets[0]).toMatchObject({
    setType: "straight",
    isWarmup: false,
    completed: false,
    skipped: false,
    countsTowardScore: true,
    countsTowardVolume: true,
    countsTowardProgression: true,
    targetRepMin: 5,
    targetRepMax: 7,
    targetRpe: 8.5,
    targetRestSeconds: 15
  });
});

test("M6 custom substitution creates a stable custom identity without borrowing canonical history or mutating the routine", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, m6Fixture());
  const sourceCard = page.locator(`.exercise-card[aria-label="Exercise: ${LONG_VARIANT_NAME}"]`);
  const routineBefore = await page.evaluate((templateExerciseId) => {
    const template = data.templates.find((item) => item.id === activeWorkoutSession().templateId);
    return JSON.stringify(template.exercises.find((item) => item.id === templateExerciseId));
  }, IDS.controlBenchTemplateExercise);

  await openDetails(sourceCard.locator(".exercise-details"));
  await sourceCard.locator('[data-action="exercise-substitute-name"]').fill(CUSTOM_SUBSTITUTE_NAME);
  await sourceCard.locator('[data-action="apply-exercise-substitution"]').click();

  const result = await page.evaluate(({ activeExerciseId, customName, templateExerciseId }) => {
    const session = activeWorkoutSession();
    const exercise = data.exercises.find((item) => item.id === activeExerciseId);
    const override = data.manualOverrides.find((item) => item.action === "substitute_exercise"
      && item.exerciseRuntimeId === activeExerciseId);
    const resolvedAgain = userSelectedExerciseIdentity(customName);
    const normalizedExactAgain = userSelectedExerciseIdentity(`  ${customName.toLowerCase()}  `);
    const collidingSlug = userSelectedExerciseIdentity("Public Synthetic Offset Handle Press");
    const collidingSlugAgain = userSelectedExerciseIdentity("Public Synthetic Offset Handle Press");
    const template = data.templates.find((item) => item.id === session.templateId);
    return {
      exercise: structuredClone(exercise),
      setExerciseIds: data.sets.filter((set) => set.exerciseId === activeExerciseId).map((set) => set.exerciseId),
      retainedComparableHistory: data.sets
        .filter((set) => set.exerciseId === activeExerciseId)
        .some((set) => Boolean(set.previousComparableSet)),
      override: structuredClone(override),
      resolvedAgain,
      normalizedExactAgain,
      collidingSlug,
      collidingSlugAgain,
      routineExercise: JSON.stringify(template.exercises.find((item) => item.id === templateExerciseId))
    };
  }, {
    activeExerciseId: IDS.activeBenchExercise,
    customName: CUSTOM_SUBSTITUTE_NAME,
    templateExerciseId: IDS.controlBenchTemplateExercise
  });

  expect(result.exercise).toMatchObject({
    id: IDS.activeBenchExercise,
    name: CUSTOM_SUBSTITUTE_NAME,
    researchExerciseId: "",
    identitySource: "user_declared_custom",
    identityVersion: "exercise-identity/2.1.0",
    overrideLocked: true
  });
  expect(result.exercise.performanceExerciseId).toMatch(/^custom_public_synthetic_offset_handle_press_[0-9a-f]{8}$/);
  expect(result.exercise.performanceExerciseId).not.toBe("variant:public-synthetic-heavy-paused-bench");
  expect(result.setExerciseIds).toHaveLength(2);
  expect(new Set(result.setExerciseIds)).toEqual(new Set([IDS.activeBenchExercise]));
  expect(result.retainedComparableHistory).toBe(false);
  expect(result.override).toMatchObject({
    field: "exerciseVariant",
    action: "substitute_exercise",
    lockedForWorkout: true,
    to: {
      name: CUSTOM_SUBSTITUTE_NAME,
      performanceExerciseId: result.exercise.performanceExerciseId,
      researchExerciseId: "",
      identitySource: "user_declared_custom"
    }
  });
  expect(result.resolvedAgain).toMatchObject({
    performanceExerciseId: result.exercise.performanceExerciseId,
    researchExerciseId: "",
    identitySource: "user_declared_custom"
  });
  expect(result.normalizedExactAgain.performanceExerciseId).toBe(result.exercise.performanceExerciseId);
  expect(result.collidingSlug).toMatchObject({
    researchExerciseId: "",
    identitySource: "user_declared_custom"
  });
  expect(result.collidingSlug.performanceExerciseId).toMatch(/^custom_public_synthetic_offset_handle_press_[0-9a-f]{8}$/);
  expect(result.collidingSlug.performanceExerciseId).not.toBe(result.exercise.performanceExerciseId);
  expect(result.collidingSlugAgain.performanceExerciseId).toBe(result.collidingSlug.performanceExerciseId);
  expect(result.routineExercise).toBe(routineBefore);
  await expect(page.locator(`.exercise-card[aria-label="Exercise: ${CUSTOM_SUBSTITUTE_NAME}"]`)).toHaveCount(1);
  await captureAuditScreenshot(page, "custom-substitution-identity");
});

test("M6 rejects invalid set writers atomically and preserves half-step RPE through draft restore", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, m6Fixture());

  const result = await page.evaluate(async ({ setId }) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    window.clearTimeout(draftSaveTimer);
    window.clearTimeout(saveTimer);
    const stateFacts = () => ({
      dataBytes: JSON.stringify(data),
      timerBytes: JSON.stringify(timer),
      activeSetId,
      activeSetAcknowledged,
      pendingNextSetId
    });
    const invalidCases = [
      ["decimal-reps", "reps", "7.5"],
      ["negative-load", "weight", "-0.5"],
      ["quarter-rpe", "rpe", "7.25"],
      ["decimal-duration", "durationSeconds", "1.5"],
      ["negative-distance", "distance", "-0.5"]
    ];
    const invalidResults = invalidCases.map(([label, field, value]) => {
      setActiveSet(setId, "Public synthetic current-set notice", false);
      const before = stateFacts();
      const accepted = patchSetValue(setId, field, value, false);
      const after = stateFacts();
      const changedFacts = Object.keys(before).filter((key) => before[key] !== after[key]);
      return {
        label,
        accepted,
        stateWasAtomic: changedFacts.length === 0,
        changedFacts
      };
    });

    setActiveSet(setId, "Public synthetic valid writer", false);
    const acceptedHalfStep = patchSetValue(setId, "rpe", "7.5", false);
    const persisted = persistActiveWorkoutDraft();
    const storedDraft = JSON.parse(localStorage.getItem("comprehensive-fitness-active-draft-v1") || "null");
    data.sets.find((set) => set.id === setId).rpe = 7;
    const restored = await restoreActiveWorkoutDraft();
    window.clearTimeout(draftSaveTimer);
    window.clearTimeout(saveTimer);
    return {
      invalidResults,
      acceptedHalfStep,
      persisted,
      storedRpe: storedDraft?.sets?.find((set) => set.id === setId)?.rpe,
      restored,
      restoredRpe: data.sets.find((set) => set.id === setId)?.rpe
    };
  }, { setId: IDS.activeBenchSet1 });

  expect(result.invalidResults).toEqual([
    { label: "decimal-reps", accepted: false, stateWasAtomic: true, changedFacts: [] },
    { label: "negative-load", accepted: false, stateWasAtomic: true, changedFacts: [] },
    { label: "quarter-rpe", accepted: false, stateWasAtomic: true, changedFacts: [] },
    { label: "decimal-duration", accepted: false, stateWasAtomic: true, changedFacts: [] },
    { label: "negative-distance", accepted: false, stateWasAtomic: true, changedFacts: [] }
  ]);
  expect(result).toMatchObject({
    acceptedHalfStep: true,
    persisted: true,
    storedRpe: 7.5,
    restored: true,
    restoredRpe: 7.5
  });
});

test("M6 enforces exact title, routine-name, and note storage boundaries atomically", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, m6Fixture());

  const result = await page.evaluate(({ exerciseId, maxName, overlongName }) => {
    const maxNotes = "N".repeat(4096);
    const overlongNotes = `${maxNotes}Z`;
    const session = activeWorkoutSession();
    const template = data.templates.find((item) => item.id === session.templateId);
    const stateBytes = () => JSON.stringify(data);

    const acceptedSession = patchSession({ title: maxName, notes: maxNotes }, false);
    const acceptedRoutine = patchTemplate(template.id, { name: maxName, notes: maxNotes }, false);
    const acceptedExerciseNotes = patchExercise(exerciseId, { notes: maxNotes }, false);
    const accepted = {
      sessionTitleLength: activeWorkoutSession().title.length,
      sessionNotesLength: activeWorkoutSession().notes.length,
      routineNameLength: data.templates.find((item) => item.id === template.id).name.length,
      routineNotesLength: data.templates.find((item) => item.id === template.id).notes.length,
      exerciseNotesLength: data.exercises.find((item) => item.id === exerciseId).notes.length
    };
    const invalidCases = [
      ["session-title", () => patchSession({ title: overlongName, notes: "must-not-replace-max-notes" }, false)],
      ["session-notes", () => patchSession({ title: "must-not-replace-max-title", notes: overlongNotes }, false)],
      ["routine-name", () => patchTemplate(template.id, { name: overlongName, notes: "must-not-replace-max-notes" }, false)],
      ["routine-notes", () => patchTemplate(template.id, { name: "must-not-replace-max-name", notes: overlongNotes }, false)],
      ["exercise-notes", () => patchExercise(exerciseId, { notes: overlongNotes }, false)]
    ];
    const invalidResults = invalidCases.map(([label, mutate]) => {
      const before = stateBytes();
      const acceptedValue = mutate();
      return {
        label,
        accepted: acceptedValue,
        stateWasAtomic: stateBytes() === before
      };
    });
    window.clearTimeout(draftSaveTimer);
    window.clearTimeout(saveTimer);
    return {
      acceptedSession,
      acceptedRoutine,
      acceptedExerciseNotes,
      accepted,
      invalidResults
    };
  }, {
    exerciseId: IDS.activeBenchExercise,
    maxName: MAX_VARIANT_NAME,
    overlongName: OVERLONG_VARIANT_NAME
  });

  expect(result).toMatchObject({
    acceptedSession: true,
    acceptedRoutine: true,
    acceptedExerciseNotes: true,
    accepted: {
      sessionTitleLength: 256,
      sessionNotesLength: 4096,
      routineNameLength: 256,
      routineNotesLength: 4096,
      exerciseNotesLength: 4096
    }
  });
  expect(result.invalidResults).toEqual([
    { label: "session-title", accepted: false, stateWasAtomic: true },
    { label: "session-notes", accepted: false, stateWasAtomic: true },
    { label: "routine-name", accepted: false, stateWasAtomic: true },
    { label: "routine-notes", accepted: false, stateWasAtomic: true },
    { label: "exercise-notes", accepted: false, stateWasAtomic: true }
  ]);
});

test("M6 strictly validates nested template warm-ups and set roles while normalizing legacy working/count", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, m6Fixture());

  const result = await page.evaluate(() => {
    const validImport = {
      appDataVersion: 3,
      sessions: [],
      exercises: [],
      sets: [],
      templates: [{
        id: "public-synthetic-nested-template",
        name: "Public Synthetic Nested Import",
        notes: "",
        exercises: [{
          id: "public-synthetic-nested-exercise",
          name: "Public Synthetic Nested Press",
          notes: "",
          warmups: [{
            id: "public-synthetic-nested-warmup",
            reps: 5,
            targetRepMin: 4,
            targetRepMax: 6,
            targetRpe: 6.5,
            targetRpeMin: 6,
            targetRpeMax: 7,
            targetRestSeconds: 75,
            weight: 45,
            weightUnit: "lb",
            resistanceType: "external",
            isBodyweight: false,
            addedLoad: 0,
            assistanceLoad: 0,
            rpe: 6.5
          }],
          setTypes: [{
            id: "public-synthetic-nested-role",
            type: "working",
            label: "Legacy working sets",
            count: 2,
            repMin: 6,
            repMax: 8,
            rpeMin: 7.5,
            rpeMax: 8.5,
            targetRpe: 8,
            restSeconds: 90,
            countsTowardVolume: true,
            countsTowardScore: true,
            isWarmup: false
          }]
        }]
      }],
      settings: { weightUnit: "lb" }
    };
    const applicationBytes = JSON.stringify(data);
    const importBytes = JSON.stringify(validImport);
    const validated = validateImportedAppData(validImport);
    const normalizedExercise = validated.templates[0].exercises[0];
    const invalidCases = [
      ["warmup-unknown-field", (candidate) => { candidate.templates[0].exercises[0].warmups[0].invented = true; }],
      ["warmup-rpe-step", (candidate) => { candidate.templates[0].exercises[0].warmups[0].targetRpe = 7.25; }],
      ["warmup-count", (candidate) => {
        const warmup = candidate.templates[0].exercises[0].warmups[0];
        candidate.templates[0].exercises[0].warmups = Array.from({ length: 101 }, (_, index) => ({ ...warmup, id: `nested-warmup-${index}` }));
      }],
      ["role-unknown-field", (candidate) => { candidate.templates[0].exercises[0].setTypes[0].invented = true; }],
      ["role-type", (candidate) => { candidate.templates[0].exercises[0].setTypes[0].type = "invented"; }],
      ["role-count", (candidate) => { candidate.templates[0].exercises[0].setTypes[0].count = 101; }],
      ["role-total-count", (candidate) => {
        const role = candidate.templates[0].exercises[0].setTypes[0];
        candidate.templates[0].exercises[0].setTypes = [{ ...role, id: "nested-role-a", count: 60 }, { ...role, id: "nested-role-b", count: 60 }];
      }],
      ["role-rpe-step", (candidate) => { candidate.templates[0].exercises[0].setTypes[0].rpeMin = 7.25; }]
    ];
    const invalidResults = invalidCases.map(([label, mutate]) => {
      const candidate = structuredClone(validImport);
      mutate(candidate);
      let error = "";
      try {
        validateImportedAppData(candidate);
      } catch (caught) {
        error = String(caught?.message || caught);
      }
      return {
        label,
        rejected: Boolean(error),
        applicationWasAtomic: JSON.stringify(data) === applicationBytes
      };
    });
    return {
      warmup: normalizedExercise.warmups[0],
      role: normalizedExercise.setTypes[0],
      sourceImportWasPreserved: JSON.stringify(validImport) === importBytes,
      applicationWasPreserved: JSON.stringify(data) === applicationBytes,
      invalidResults
    };
  });

  expect(result.warmup).toMatchObject({
    reps: 5,
    targetRepMin: 4,
    targetRepMax: 6,
    targetRpe: 6.5,
    targetRpeMin: 6,
    targetRpeMax: 7,
    targetRestSeconds: 75,
    weight: 45,
    weightUnit: "lb",
    resistanceType: "external",
    isBodyweight: false,
    addedLoad: 0,
    assistanceLoad: 0,
    rpe: 6.5
  });
  expect(result.role).toMatchObject({
    type: "straight",
    setCount: 2,
    repMin: 6,
    repMax: 8,
    rpeMin: 7.5,
    rpeMax: 8.5,
    targetRpe: 8,
    restSeconds: 90,
    countsTowardVolume: true,
    countsTowardScore: true,
    isWarmup: false
  });
  expect(result.role).not.toHaveProperty("count");
  expect(result.sourceImportWasPreserved).toBe(true);
  expect(result.applicationWasPreserved).toBe(true);
  expect(result.invalidResults.map((item) => item.label)).toEqual([
    "warmup-unknown-field",
    "warmup-rpe-step",
    "warmup-count",
    "role-unknown-field",
    "role-type",
    "role-count",
    "role-total-count",
    "role-rpe-step"
  ]);
  expect(result.invalidResults.every((item) => item.rejected && item.applicationWasAtomic)).toBe(true);
});

test("M6 replaces RPE 7 with 7.5, enters overtime, and recovers order, notes, values, role, and timer", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, m6Fixture({ autoStartRestTimer: true }));
  const sourceCard = page.locator(`.exercise-card[aria-label="Exercise: ${LONG_VARIANT_NAME}"]`);
  const setBlock = sourceCard.locator(`#set-${IDS.activeBenchSet1}`);
  const load = setBlock.getByRole("spinbutton", { name: "Set 1 load" });
  const reps = setBlock.getByRole("spinbutton", { name: "Set 1 reps" });
  const rpe = setBlock.getByRole("spinbutton", { name: "Set 1 RPE" });

  await load.fill("177.5");
  await reps.fill("7");
  await expect(rpe).toHaveValue("7");
  await rpe.click();
  await rpe.pressSequentially("7.5");
  await expect(rpe).toHaveValue("7.5");
  await rpe.press("Tab");

  const setTools = setBlock.locator(".set-tools-disclosure");
  await setTools.evaluate((element) => { element.open = true; });
  await setTools.locator('[data-action="set-type-override"]').selectOption("drop");

  const exerciseDetails = sourceCard.locator(".exercise-details");
  await exerciseDetails.evaluate((element) => { element.open = true; });
  const exerciseNotes = exerciseDetails.locator('[data-action="exercise-notes"]');
  await exerciseNotes.fill(EXERCISE_NOTE);
  await exerciseNotes.press("Tab");

  await page.evaluate((note) => {
    const sessionNotes = document.querySelector('[data-action="session-notes"]');
    if (!(sessionNotes instanceof HTMLTextAreaElement)) throw new Error("Missing session-notes textarea");
    sessionNotes.value = note;
    sessionNotes.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: note,
      inputType: "insertText"
    }));
  }, SESSION_NOTE);
  await expect.poll(() => page.evaluate(() => activeWorkoutSession()?.notes)).toBe(SESSION_NOTE);

  const exerciseMenu = sourceCard.locator(".exercise-overflow");
  await exerciseMenu.evaluate((element) => { element.open = true; });
  const moveDown = exerciseMenu.locator('[data-action="move-exercise"][data-direction="1"]');
  await moveDown.dispatchEvent("click");
  await expect.poll(() => page.evaluate((exerciseId) => {
    const exercises = data.exercises
      .filter((item) => item.sessionId === activeWorkoutSession().id)
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
    return exercises.at(-1)?.id;
  }, IDS.activeBenchExercise)).toBe(IDS.activeBenchExercise);
  await page.locator(`.exercise-card[aria-label="Exercise: ${LONG_VARIANT_NAME}"]`)
    .getByRole("button", { name: "Mark set complete", exact: true })
    .click();

  const timerBar = page.locator(".workout-timer-slot .timer-bar");
  await expect(timerBar).toHaveCount(1);
  await expect(timerBar).toHaveAttribute("data-phase", /resting|final/);
  const timerBeforeNavigation = await page.evaluate(() => structuredClone(timer));

  await page.locator('[data-action="close-workout-context"]').click();
  await expect(page).toHaveURL(/#today$/);
  await expect(page.locator('[data-action="resume-active-workout"]')).toBeVisible();
  await page.evaluate(() => globalThis.__advanceM6Clock(4_000));
  await page.locator('[data-action="resume-active-workout"]').click();
  await expect(page).toHaveURL(/#workout$/);
  await expect(page.locator(".workout-timer-slot .timer-bar")).toHaveCount(1);
  expect((await page.evaluate(() => timer.id))).toBe(timerBeforeNavigation.id);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    globalThis.__advanceM6Clock(14_000);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const overtime = page.locator('.workout-timer-slot .timer-bar[data-phase="overtime"]');
  await expect(overtime).toHaveCount(1);
  await expect(overtime.locator("[data-timer-progress-label]")).toHaveText("+00:03");

  await page.waitForTimeout(500);
  const beforeReload = await activeState(page);
  const suspendedTimer = await page.evaluate(() => {
    persistBeforeSuspend();
    return JSON.parse(localStorage.getItem("comprehensive-fitness-active-draft-v1") || "null")?.timer || null;
  });
  expect(suspendedTimer).toMatchObject({
    id: beforeReload.timer.id,
    workoutId: IDS.activeSession,
    setId: IDS.activeBenchSet1,
    isOvertime: true
  });
  await page.reload();
  await expect(page.locator(".workout-view")).toBeVisible({ timeout: 45_000 });
  const afterReload = await activeState(page);

  expect(afterReload.session.notes).toBe(SESSION_NOTE);
  expect(afterReload.session.startedAt).toBe(beforeReload.session.startedAt);
  expect(afterReload.exercises.map((item) => item.id)).toEqual(beforeReload.exercises.map((item) => item.id));
  expect(afterReload.exercises.map((item) => item.id).at(-1)).toBe(IDS.activeBenchExercise);
  expect(afterReload.exercises.find((item) => item.id === IDS.activeBenchExercise)?.notes).toBe(EXERCISE_NOTE);

  const recoveredSet = afterReload.sets.find((item) => item.id === IDS.activeBenchSet1);
  expect(recoveredSet).toMatchObject({
    weight: 177.5,
    reps: 7,
    rpe: 7.5,
    setType: "drop",
    completed: true,
    manualOverride: true,
    classificationSource: "manual",
    targetRepMin: 5,
    targetRepMax: 7,
    targetRpe: 8.5,
    targetRestSeconds: 15,
    originalTargetReference: {
      templateExerciseId: IDS.controlBenchTemplateExercise,
      variantId: "variant:public-synthetic-heavy-paused-bench"
    }
  });
  expect(afterReload.timer).toMatchObject({
    id: beforeReload.timer.id,
    workoutId: IDS.activeSession,
    setId: IDS.activeBenchSet1,
    durationSeconds: 15
  });
  await expect(page.locator('.workout-timer-slot .timer-bar[data-phase="overtime"]')).toHaveCount(1);
  await expect(page.locator("[data-timer-progress-label]")).toHaveText("+00:03");
  await captureAuditScreenshot(page, "overtime-reload-recovery");
});
