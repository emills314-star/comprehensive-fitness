"use strict";

const { test, expect } = require("@playwright/test");
const {
  FIXED_NOW,
  IDS,
  NAMES,
  STORAGE_KEY,
  buildActiveWorkoutLifecycleFixture,
  buildHistoryLifecycleFixture,
  buildTemplateLifecycleFixture,
  fixtureContract
} = require("./fixtures/template-workout-history.fixture");

const TEST_TEMPLATE_NAME = "Public Synthetic Lifecycle Template";
const EDITED_HISTORY_TITLE = "Public Synthetic Logged Upper Session — Corrected";

function verifyFixtureExactness() {
  const template = fixtureContract(buildTemplateLifecycleFixture());
  const active = fixtureContract(buildActiveWorkoutLifecycleFixture());
  const history = fixtureContract(buildHistoryLifecycleFixture());
  const expected = [
    [template, { sessions: 1, exercises: 2, sets: 4, templates: 1 }],
    [active, { sessions: 2, exercises: 4, sets: 8, templates: 1 }],
    [history, { sessions: 1, exercises: 2, sets: 4, templates: 1 }]
  ];
  for (const [actual, counts] of expected) {
    for (const [key, value] of Object.entries(counts)) {
      if (actual[key] !== value || actual[`unique${key[0].toUpperCase()}${key.slice(1, -1)}Ids`] !== value) {
        throw new Error(`Public synthetic fixture contract mismatch for ${key}.`);
      }
    }
    if (actual.privateFieldNames.length) throw new Error(`Public synthetic fixture contains a private-data field: ${actual.privateFieldNames.join(", ")}`);
  }
}

verifyFixtureExactness();

function collectBrowserErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function installFixture(page, fixture) {
  await page.addInitScript(({ fixedNow, storageKey, storedFixture }) => {
    localStorage.clear();
    sessionStorage.clear();
    const NativeDate = Date;
    const fixedEpoch = NativeDate.parse(fixedNow);
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedEpoch]));
      }
      static now() {
        return fixedEpoch;
      }
    }
    globalThis.Date = FixedDate;
    localStorage.setItem(storageKey, JSON.stringify(storedFixture));
  }, { fixedNow: FIXED_NOW, storageKey: STORAGE_KEY, storedFixture: fixture });
  await page.goto("/");
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => String(prescriptionEvidenceStatus?.state || "loading")), {
    message: "the public recommendation bundle must finish loading before lifecycle actions run",
    timeout: 45_000
  }).toBe("ready");
}

async function readIndexedValue(page, key) {
  return page.evaluate((requestedKey) => new Promise((resolve, reject) => {
    const request = indexedDB.open("comprehensive-fitness", 1);
    request.onerror = () => reject(request.error || new Error("Could not open lifecycle-test IndexedDB."));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("state", "readonly");
      const getRequest = transaction.objectStore("state").get(requestedKey);
      getRequest.onsuccess = () => resolve(getRequest.result?.value ?? null);
      getRequest.onerror = () => reject(getRequest.error || new Error(`Could not read ${requestedKey}.`));
      transaction.oncomplete = () => database.close();
    };
  }), key);
}

async function persistedData(page) {
  return (await readIndexedValue(page, "app-data")) || page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), STORAGE_KEY);
}

async function waitForPersisted(page, predicate, message, timeout = 12_000) {
  await expect.poll(async () => Boolean(predicate(await persistedData(page))), { message, timeout }).toBe(true);
  return persistedData(page);
}

async function openPlan(page) {
  await page.locator('[data-action="set-tab"][data-tab="plan"]').click();
  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();
}

async function openSubmittedHistorySession(page) {
  await page.locator('[data-action="set-tab"][data-tab="dashboard"]').click();
  const historyCard = page.locator(`[data-action="open-session"][data-session-id="${IDS.historySession}"]`);
  await expect(historyCard).toHaveCount(1);
  await historyCard.click();
  await expect(page.getByRole("heading", { name: NAMES.historySession, exact: true })).toBeVisible();
}

async function reloadAndWait(page) {
  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => String(prescriptionEvidenceStatus?.state || "loading")), { timeout: 45_000 }).toBe("ready");
}

function assertUniqueEntityIds(data) {
  for (const collection of ["sessions", "exercises", "sets", "templates"]) {
    expect(new Set(data[collection].map((item) => item.id)).size, `${collection} IDs must remain unique`).toBe(data[collection].length);
  }
}

async function installSubmissionProbe(page) {
  await page.evaluate(() => {
    const realSubmitWorkout = window.submitWorkout;
    const realCalculateWorkoutAnalysis = window.calculateWorkoutAnalysis;
    const realWriteIndexedValue = window.writeIndexedValue;
    const realPlayWorkoutCompletionSound = window.playWorkoutCompletionSound;
    const realPerformInteractionFeedback = window.performInteractionFeedback;
    if (typeof realSubmitWorkout !== "function" || typeof realCalculateWorkoutAnalysis !== "function" || typeof realWriteIndexedValue !== "function" || typeof realPlayWorkoutCompletionSound !== "function" || typeof realPerformInteractionFeedback !== "function") {
      throw new Error("The lifecycle probe could not access the real submission, analysis, persistence, sound, and feedback functions.");
    }
    const probe = window.__lifecycleSubmissionProbe = {
      attempts: [],
      returnedTypes: [],
      analysisCalls: [],
      completionSoundCalls: [],
      successFeedbackCalls: [],
      writesStarted: 0,
      writesCompleted: 0,
      writesFailed: 0
    };
    window.submitWorkout = function (...args) {
      probe.attempts.push(args.map((value) => String(value)));
      const result = Reflect.apply(realSubmitWorkout, this, args);
      probe.returnedTypes.push(typeof result);
      return result;
    };
    window.calculateWorkoutAnalysis = function (...args) {
      probe.analysisCalls.push(String(args[0]?.id || ""));
      return Reflect.apply(realCalculateWorkoutAnalysis, this, args);
    };
    window.playWorkoutCompletionSound = function (...args) {
      probe.completionSoundCalls.push(args.map((value) => Boolean(value)));
      return Reflect.apply(realPlayWorkoutCompletionSound, this, args);
    };
    window.performInteractionFeedback = function (...args) {
      if (args[0] === "success") probe.successFeedbackCalls.push(args.map((value) => String(value)));
      return Reflect.apply(realPerformInteractionFeedback, this, args);
    };
    window.writeIndexedValue = async function (...args) {
      probe.writesStarted += 1;
      try {
        const result = await Reflect.apply(realWriteIndexedValue, this, args);
        probe.writesCompleted += 1;
        return result;
      } catch (error) {
        probe.writesFailed += 1;
        throw error;
      }
    };
  });
}

async function submissionProbe(page) {
  return page.evaluate(() => structuredClone(window.__lifecycleSubmissionProbe));
}

async function waitForSubmissionWrites(page) {
  await expect.poll(() => page.evaluate(() => {
    const probe = window.__lifecycleSubmissionProbe;
    return Boolean(probe && probe.writesStarted > 0 && probe.writesCompleted === probe.writesStarted && probe.writesFailed === 0);
  }), { message: "all application persistence writes routed by the submission attempts must settle", timeout: 12_000 }).toBe(true);
}

test.describe("template, active-workout, submission, and history lifecycles", () => {
  test("template create, autosave, edit, exercise/warm-up changes, deletion cancellation, confirmation, and reload", async ({ page }) => {
    test.setTimeout(120_000);
    const browserErrors = collectBrowserErrors(page);
    await installFixture(page, buildTemplateLifecycleFixture());
    await openPlan(page);

    await page.locator('[data-action="new-template"]').click();
    const createdCard = page.locator(".template-card").first();
    const nameInput = createdCard.locator('[data-action="template-name"]');
    const templateId = await nameInput.getAttribute("data-template-id");
    expect(templateId).toBeTruthy();
    await nameInput.fill(TEST_TEMPLATE_NAME);
    await waitForPersisted(page, (stored) => stored.templates.some((item) => item.id === templateId && item.name === TEST_TEMPLATE_NAME), "template-name input must autosave");

    await createdCard.locator('[data-action="toggle-template-editor"]').click();
    let editor = page.locator(`.template-card:has([data-template-id="${templateId}"])`);
    const originalExerciseId = await editor.locator('[data-action="template-exercise-name"]').first().getAttribute("data-template-exercise-id");
    await editor.locator('[data-action="template-exercise-name"]').first().fill("Public Synthetic Paused Bench Press");
    await editor.locator('[data-action="add-template-exercise"]').click();
    editor = page.locator(`.template-card:has([data-template-id="${templateId}"])`);
    const exerciseNames = editor.locator('[data-action="template-exercise-name"]');
    await expect(exerciseNames).toHaveCount(2);
    const addedExerciseId = await exerciseNames.nth(1).getAttribute("data-template-exercise-id");
    await exerciseNames.nth(1).fill("Public Synthetic Cable Fly");
    await editor.locator(`[data-action="add-template-warmup"][data-template-exercise-id="${originalExerciseId}"]`).click();
    await waitForPersisted(page, (stored) => {
      const created = stored.templates.find((item) => item.id === templateId);
      return created?.exercises.length === 2 && created.exercises[0].name === "Public Synthetic Paused Bench Press" && created.exercises[1].name === "Public Synthetic Cable Fly" && created.exercises[0].warmups?.length === 1;
    }, "template exercises and warm-up must persist together");

    await reloadAndWait(page);
    await openPlan(page);
    editor = page.locator(`.template-card:has([data-template-id="${templateId}"])`);
    await expect(editor.locator('[data-action="template-name"]')).toHaveValue(TEST_TEMPLATE_NAME);
    await editor.locator('[data-action="toggle-template-editor"]').click();
    await expect(editor.locator('[data-action="template-exercise-name"]')).toHaveCount(2);
    await expect(editor.locator('[data-action="template-exercise-name"]').first()).toHaveValue("Public Synthetic Paused Bench Press");

    await editor.locator(`[data-action="remove-template-warmup"][data-template-exercise-id="${originalExerciseId}"]`).click();
    await editor.locator(`[data-action="delete-template-exercise"][data-template-exercise-id="${addedExerciseId}"]`).click();
    await waitForPersisted(page, (stored) => {
      const created = stored.templates.find((item) => item.id === templateId);
      return created?.exercises.length === 1 && created.exercises[0].warmups?.length === 0;
    }, "warm-up and exercise removals must persist");

    await editor.locator(`[data-action="request-delete-template"][data-template-id="${templateId}"]`).click();
    await page.locator('[data-action="cancel-delete-template"]').click();
    await expect(page.locator(`[data-action="template-name"][data-template-id="${templateId}"]`)).toHaveCount(1);
    await page.locator(`[data-action="request-delete-template"][data-template-id="${templateId}"]`).click();
    await page.locator(`[data-action="confirm-delete-template"][data-template-id="${templateId}"]`).click();
    await waitForPersisted(page, (stored) => !stored.templates.some((item) => item.id === templateId), "confirmed deletion must remove only the created template");
    await reloadAndWait(page);
    await openPlan(page);
    await expect(page.locator(`[data-action="template-name"][data-template-id="${templateId}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-action="template-name"][data-template-id="${IDS.controlTemplate}"]`)).toHaveValue(NAMES.controlTemplate);
    expect(browserErrors, "template lifecycle browser errors").toEqual([]);
  });

  test("template validation enforces exact HTML/domain boundaries, exposes accessible errors, and refuses invalid persistence", async ({ page }) => {
    test.setTimeout(90_000);
    await installFixture(page, buildTemplateLifecycleFixture());
    await openPlan(page);
    const card = page.locator(`.template-card:has([data-template-id="${IDS.controlTemplate}"])`);
    await card.locator('[data-action="toggle-template-editor"]').click();

    const sets = card.locator('[data-action="template-exercise-sets"]').first();
    const reps = card.locator('[data-action="template-exercise-reps"]').first();
    const rpe = card.locator('[data-action="template-exercise-rpe"]').first();
    const increment = card.locator('[data-action="template-exercise-increment"]').first();
    const rest = card.locator('[data-action="template-exercise-rest"]').first();
    await expect(sets).toHaveAttribute("min", "1");
    await expect(reps).toHaveAttribute("min", "1");
    await expect(rpe).toHaveAttribute("min", "5");
    await expect(rpe).toHaveAttribute("max", "10");
    await expect(rpe).toHaveAttribute("step", "0.5");
    await expect(increment).toHaveAttribute("min", "0.5");
    await expect(increment).toHaveAttribute("step", "0.5");
    await expect(rest).toHaveAttribute("min", "15");
    await expect(rest).toHaveAttribute("step", "15");

    const before = await persistedData(page);
    const beforeExercise = before.templates.find((item) => item.id === IDS.controlTemplate).exercises.find((item) => item.id === IDS.controlBenchTemplateExercise);
    await sets.fill("0");
    await reps.fill("0");
    await rpe.fill("4.5");
    await increment.fill("0");
    await rest.fill("0");
    for (const [control, label] of [[sets, "sets"], [reps, "reps"], [rpe, "RPE"], [increment, "increment"], [rest, "rest"]]) {
      expect(await control.evaluate((element) => element.validity.valid), `${label} must fail the browser's declared HTML constraint`).toBe(false);
    }

    await expect.soft(card.locator('[role="alert"]'), "invalid template fields must expose a rendered accessible error").toHaveCount(1, { timeout: 750 });
    await expect.soft(sets, "the invalid sets control must be programmatically identified").toHaveAttribute("aria-invalid", "true", { timeout: 750 });
    await expect.soft(reps, "the invalid reps control must be programmatically identified").toHaveAttribute("aria-invalid", "true", { timeout: 750 });
    await expect.soft(rpe, "the invalid RPE control must be programmatically identified").toHaveAttribute("aria-invalid", "true", { timeout: 750 });
    await expect.soft(increment, "the invalid increment control must be programmatically identified").toHaveAttribute("aria-invalid", "true", { timeout: 750 });
    await expect.soft(rest, "the invalid rest control must be programmatically identified").toHaveAttribute("aria-invalid", "true", { timeout: 750 });

    await page.waitForTimeout(2_200);
    const after = await persistedData(page);
    const afterExercise = after.templates.find((item) => item.id === IDS.controlTemplate).exercises.find((item) => item.id === IDS.controlBenchTemplateExercise);
    expect.soft(after.dataRevision, "invalid edits must not create a persisted data revision").toBe(before.dataRevision);
    expect.soft(afterExercise.sets, "invalid sets must not replace the last valid persisted value").toBe(beforeExercise.sets);
    expect.soft(afterExercise.reps, "invalid reps must not replace the last valid persisted value").toBe(beforeExercise.reps);
    expect.soft(afterExercise.targetRpe, "invalid RPE must not replace the last valid persisted value").toBe(beforeExercise.targetRpe);
    expect.soft(afterExercise.increment, "invalid increment must not replace the last valid persisted value").toBe(beforeExercise.increment);
    expect.soft(afterExercise.restSeconds, "invalid rest must not replace the last valid persisted value").toBe(beforeExercise.restSeconds);

    const correctionRevision = await page.evaluate(() => {
      const realWriteIndexedValue = window.writeIndexedValue;
      window.__templateCorrectionWriteProbe = { started: 0, completed: 0, failed: 0 };
      window.writeIndexedValue = async function (...args) {
        const isAppDataWrite = args[0] === "app-data";
        if (isAppDataWrite) window.__templateCorrectionWriteProbe.started += 1;
        try {
          const result = await Reflect.apply(realWriteIndexedValue, this, args);
          if (isAppDataWrite) window.__templateCorrectionWriteProbe.completed += 1;
          return result;
        } catch (error) {
          if (isAppDataWrite) window.__templateCorrectionWriteProbe.failed += 1;
          throw error;
        }
      };
      return Number(data.dataRevision);
    });
    const correctedValues = [
      ["template-exercise-sets", "4"],
      ["template-exercise-reps", "12"],
      ["template-exercise-rpe", "8.5"],
      ["template-exercise-increment", "2.5"],
      ["template-exercise-rest", "150"]
    ];
    await page.evaluate(({ templateId, exerciseId, values }) => {
      values.forEach(([action, value]) => {
        const selector = `[data-action="${action}"][data-template-id="${templateId}"][data-template-exercise-id="${exerciseId}"]`;
        const control = document.querySelector(selector);
        if (!control) throw new Error(`Missing corrected template control: ${action}`);
        control.value = value;
        control.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }, { templateId: IDS.controlTemplate, exerciseId: IDS.controlBenchTemplateExercise, values: correctedValues });

    await expect(card.locator('[role="alert"]'), "correcting every invalid field must clear the single accessible validation alert").toHaveCount(0);
    for (const [control, label] of [[sets, "sets"], [reps, "reps"], [rpe, "RPE"], [increment, "increment"], [rest, "rest"]]) {
      await expect.soft(control, `correcting ${label} must clear its programmatic invalid state`).not.toHaveAttribute("aria-invalid", "true");
    }
    await expect.poll(() => page.evaluate(() => structuredClone(window.__templateCorrectionWriteProbe)), {
      message: "the corrected template fields must settle through one debounced durable app-data write",
      timeout: 12_000
    }).toEqual({ started: 1, completed: 1, failed: 0 });

    const corrected = await persistedData(page);
    const correctedExercise = corrected.templates.find((item) => item.id === IDS.controlTemplate).exercises.find((item) => item.id === IDS.controlBenchTemplateExercise);
    expect.soft(corrected.dataRevision, "five valid field corrections must create five coherent logical revisions before one debounced persistence write").toBe(correctionRevision + 5);
    expect.soft(correctedExercise, "the corrected template values must persist exactly as entered").toMatchObject({
      sets: 4,
      reps: 12,
      targetRpe: 8.5,
      increment: 2.5,
      restSeconds: 150
    });
    expect.soft(await page.evaluate(() => Number(data.dataRevision)), "the durable revision must equal the current in-memory revision").toBe(corrected.dataRevision);
  });

  test("template Continue to usual readiness starts one coherent workout and survives reload", async ({ page }) => {
    test.setTimeout(120_000);
    const browserErrors = collectBrowserErrors(page);
    await installFixture(page, buildTemplateLifecycleFixture());
    await openPlan(page);
    await page.locator(`[data-action="start-template"][data-template-id="${IDS.controlTemplate}"]`).click();
    await expect(page.getByRole("dialog", { name: `Start ${NAMES.controlTemplate}?` })).toBeVisible();
    await page.locator('[data-action="continue-template-start"]').click();
    await expect(page.getByRole("dialog", { name: "Use your usual readiness?" })).toBeVisible();
    await page.locator('[data-action="use-usual-readiness"]').click();
    await expect(page.getByRole("heading", { name: NAMES.controlTemplate, exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("In progress", { exact: true })).toBeVisible();

    const stored = await waitForPersisted(page, (data) => {
      const sessions = data.sessions.filter((item) => item.templateId === IDS.controlTemplate && item.workoutStarted && !item.submitted);
      if (sessions.length !== 1) return false;
      const exerciseIds = data.exercises.filter((item) => item.sessionId === sessions[0].id).map((item) => item.id);
      return exerciseIds.length === 2 && data.sets.filter((item) => exerciseIds.includes(item.exerciseId)).length >= 4;
    }, "usual readiness start must persist one active workout with both template exercises", 30_000);
    const started = stored.sessions.find((item) => item.templateId === IDS.controlTemplate && item.workoutStarted && !item.submitted);
    expect(started.readinessMode).toBe("usual");
    expect(started.adjustmentSummary).toContain("No recovery adjustments");

    await reloadAndWait(page);
    await expect(page.getByRole("heading", { name: NAMES.controlTemplate, exact: true })).toBeVisible();
    await expect(page.getByText("In progress", { exact: true })).toBeVisible();
    expect(browserErrors, "template-start lifecycle browser errors").toEqual([]);
  });

  test("legacy Back on a catalog Seated Cable Row resolves to its canonical upper-back target and remains auditable", async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = buildTemplateLifecycleFixture();
    fixture.settings.availableEquipment = ["cable_station"];
    fixture.templates[0].name = "Public Synthetic Legacy Back Projection";
    fixture.templates[0].exercises = [{
      id: "public-synthetic-template-cable-row",
      name: "Seated Cable Row",
      primaryMuscle: "Back",
      secondaryMuscle: "Biceps",
      resistanceType: "external",
      isBodyweight: false,
      sets: 2,
      reps: 10,
      targetRpe: 8,
      increment: 5,
      restSeconds: 105,
      warmups: []
    }];
    await installFixture(page, fixture);
    await openPlan(page);
    await page.locator(`[data-action="start-template"][data-template-id="${IDS.controlTemplate}"]`).click();
    await page.locator('[data-action="continue-template-start"]').click();
    await page.locator('[data-action="use-usual-readiness"]').click();
    await expect(page.getByRole("heading", { name: "Public Synthetic Legacy Back Projection", exact: true })).toBeVisible({ timeout: 45_000 });

    const stored = await waitForPersisted(page, (data) => {
      const session = data.sessions.find((item) => item.templateId === IDS.controlTemplate && item.workoutStarted && !item.submitted);
      return Boolean(session && data.exercises.some((item) => item.sessionId === session.id && item.name === "Seated Cable Row"));
    }, "the legacy-Back template start must persist its audit record", 30_000);
    const session = stored.sessions.find((item) => item.templateId === IDS.controlTemplate && item.workoutStarted && !item.submitted);
    const exercise = stored.exercises.find((item) => item.sessionId === session.id && item.name === "Seated Cable Row");
    expect.soft(exercise.executionBlocked, "legacy/UI Back must not become a hard invalid-identity block for a catalog row").not.toBe(true);
    expect.soft(exercise.safetyRestriction?.reason, "legacy/UI Back must not fail canonical target validation").not.toBe("invalid_exercise_identity");
    expect.soft(stored.sets.filter((item) => item.exerciseId === exercise.id).length, "a valid catalog row must retain executable working sets").toBeGreaterThan(0);
    expect.soft(exercise.programTargetContext?.exerciseId, "the program audit must retain the catalog identity").toBe("ex_seated_cable_row");
    expect.soft(exercise.recommendationSnapshot?.exerciseId, "the recommendation snapshot must retain the catalog identity").toBe("ex_seated_cable_row");
    expect.soft(exercise.recommendationSnapshot?.muscleGroupId, "legacy/UI Back must resolve to the catalog's direct canonical target").toBe("mg_upper_back");
  });

  const frontendHardRejectionCases = [
    { reason: "no_dynamic_direct_target", stage: "target" },
    { reason: "ambiguous_dynamic_direct_target", stage: "target" },
    { reason: "invalid_reconciled_identity", stage: "identity" },
    { reason: "ambiguous_public_exercise_identity", stage: "identity" },
    { reason: "personal_public_identity_collision", stage: "identity" },
    { reason: "unknown_exercise_identity", stage: "identity" }
  ];

  for (const scenario of frontendHardRejectionCases) {
    test(`frontend preserves ${scenario.reason} as a zero-execution hard rejection without prescribing`, async ({ page }) => {
      await installFixture(page, buildTemplateLifecycleFixture());
      const observed = await page.evaluate(({ reason, stage }) => {
        const calls = { identity: [], target: [], prescribe: [] };
        prescriptionEngine.resolveExerciseIdentity = function (...args) {
          calls.identity.push(args.map((value) => typeof value === "string" ? value : JSON.stringify(value)));
          if (stage === "identity") return { status: "unresolved", reason };
          return { status: "resolved", exerciseId: "ex_barbell_bench_press", source: "public-synthetic-resolver-probe" };
        };
        prescriptionEngine.resolveDefaultPrescriptionTarget = function (...args) {
          calls.target.push(args.map((value) => typeof value === "string" ? value : JSON.stringify(value)));
          return { status: "ineligible", exerciseId: "ex_barbell_bench_press", reason };
        };
        prescriptionEngine.prescribeExercise = function (...args) {
          calls.prescribe.push(args.map((value) => JSON.stringify(value)));
          return {
            recommendationId: "public-synthetic-unexpected-prescription",
            executable: true,
            finalPrescription: { executable: true, executionBlocked: false, sets: 3, reps: 8 }
          };
        };
        const result = unifiedPrescriptionSnapshot({
          name: "Barbell Bench Press",
          primaryMuscle: "Chest",
          secondaryMuscle: "Triceps",
          sets: 3,
          reps: 8,
          targetRpe: 8,
          restSeconds: 120
        }, {
          history: [],
          availableEquipment: ["all"],
          includedMuscleGroupIds: ["mg_pectoralis_major"],
          sessionDurationMinutes: 45
        });
        return { calls, result };
      }, scenario);

      expect.soft(observed.calls.identity.length, "the frontend must consult the engine's canonical identity resolver").toBeGreaterThan(0);
      expect.soft(observed.calls.target.length, "only a resolved identity may proceed to the engine's default-target resolver").toBe(scenario.stage === "target" ? 1 : 0);
      expect.soft(observed.calls.prescribe, "an ineligible or unresolved adapter result must never reach prescribeExercise").toEqual([]);
      expect.soft(observed.result, "the adapter failure must retain the ordinary hard-rejection contract").toMatchObject({
        type: "hard_constraint_rejection",
        kind: "hard_constraint_rejection",
        hardConstraint: true,
        executionBlocked: true,
        executable: false,
        status: "blocked",
        reason: scenario.reason,
        decision: "hold",
        mode: "stop-modify",
        interventionType: "stop_modify",
        sets: 0,
        reps: 0,
        repLow: 0,
        repHigh: 0,
        weight: 0,
        addedLoad: 0,
        assistanceLoad: 0,
        rpe: 0,
        restSeconds: 0,
        warmups: [],
        executableActions: [],
        safetyRestriction: { status: "blocked", reason: scenario.reason }
      });
    });
  }

  test("an existing stored recommendation snapshot bypasses identity and default-target resolution byte-equivalently", async ({ page }) => {
    const fixture = buildHistoryLifecycleFixture();
    const storedSnapshot = {
      schemaVersion: "prescription-snapshot/public-synthetic",
      recommendationId: "public-synthetic-existing-recommendation",
      exerciseId: "ex_barbell_bench_press",
      muscleGroupId: "mg_pectoralis_major",
      explanation: { summary: "Public synthetic immutable recommendation snapshot." },
      finalPrescription: {
        executable: true,
        executionBlocked: false,
        sets: 2,
        repRange: { min: 8, max: 10, target: 9 },
        targetRpe: { min: 7, max: 8, target: 8 },
        restSeconds: { min: 90, max: 150, target: 120 }
      }
    };
    fixture.exercises.find((item) => item.id === IDS.historyBenchExercise).recommendationSnapshot = storedSnapshot;
    fixture.recommendationHistory = [structuredClone(storedSnapshot)];
    await installFixture(page, fixture);

    const observed = await page.evaluate((exerciseId) => {
      const exercise = data.exercises.find((item) => item.id === exerciseId);
      const calls = { identity: 0, target: 0, prescribe: 0 };
      prescriptionEngine.resolveExerciseIdentity = function () { calls.identity += 1; throw new Error("Stored snapshots must bypass identity resolution."); };
      prescriptionEngine.resolveDefaultPrescriptionTarget = function () { calls.target += 1; throw new Error("Stored snapshots must bypass default-target resolution."); };
      prescriptionEngine.prescribeExercise = function () { calls.prescribe += 1; throw new Error("Stored snapshots must bypass fresh prescription."); };
      const beforeBytes = JSON.stringify(exercise.recommendationSnapshot);
      const result = unifiedPrescriptionSnapshot(exercise);
      return {
        calls,
        sameReference: result === exercise.recommendationSnapshot,
        beforeBytes,
        afterBytes: JSON.stringify(result)
      };
    }, IDS.historyBenchExercise);

    expect(observed.calls).toEqual({ identity: 0, target: 0, prescribe: 0 });
    expect(observed.sameReference).toBe(true);
    expect(observed.afterBytes).toBe(observed.beforeBytes);
  });

  test("a corrupt active executable snapshot fails closed without prescribing or entering the recommendation cache", async ({ page }) => {
    await installFixture(page, buildActiveWorkoutLifecycleFixture());
    const observed = await page.evaluate((exerciseId) => {
      const exercise = data.exercises.find((item) => item.id === exerciseId);
      exercise.recommendationSnapshot = {
        recommendationId: "public-synthetic-corrupt-active-snapshot",
        exerciseId: "ex_barbell_bench_press",
        muscleGroupId: "mg_chest_sternal",
        executable: true,
        finalPrescription: { executable: true, executionBlocked: false, sets: 5, reps: 5 }
      };
      const calls = { prescribe: 0 };
      const originalPrescribe = prescriptionEngine.prescribeExercise;
      prescriptionEngine.prescribeExercise = function (...args) {
        calls.prescribe += 1;
        return originalPrescribe.apply(this, args);
      };
      const cacheSizeBefore = prescriptionSnapshotCache.size;
      const result = unifiedPrescriptionSnapshot(exercise);
      return { calls, cacheSizeBefore, cacheSizeAfter: prescriptionSnapshotCache.size, result };
    }, IDS.activeBenchExercise);

    expect(observed.calls.prescribe, "a corrupt stored executable snapshot must never reach fresh prescription").toBe(0);
    expect(observed.cacheSizeAfter, "a rejected stored snapshot must not enter the recommendation cache").toBe(observed.cacheSizeBefore);
    expect(observed.result).toMatchObject({
      type: "hard_constraint_rejection",
      kind: "hard_constraint_rejection",
      hardConstraint: true,
      executionBlocked: true,
      executable: false,
      status: "blocked",
      reason: "invalid_stored_recommendation_snapshot",
      sets: 0,
      reps: 0,
      repLow: 0,
      repHigh: 0,
      weight: 0,
      addedLoad: 0,
      assistanceLoad: 0,
      rpe: 0,
      restSeconds: 0,
      warmups: [],
      executableActions: [],
      safetyRestriction: { status: "blocked", reason: "invalid_stored_recommendation_snapshot" }
    });
  });

  test("active workout rename, reorder, add/remove exercises and sets, save-as-template, and reload remain coherent", async ({ page }) => {
    test.setTimeout(120_000);
    const browserErrors = collectBrowserErrors(page);
    await installFixture(page, buildActiveWorkoutLifecycleFixture());
    await expect(page.getByRole("heading", { name: NAMES.activeSession, exact: true })).toBeVisible();

    const renamed = "Public Synthetic Paused Bench Press — Session Edit";
    await page.locator(`[data-action="exercise-name"][data-exercise-id="${IDS.activeBenchExercise}"]`).fill(renamed);
    await page.locator(`[data-action="move-exercise"][data-exercise-id="${IDS.activeRowExercise}"][data-direction="-1"]`).click();
    await page.locator("details.add-exercise-panel > summary").click();
    await page.locator('[data-action="add-exercise-draft"]').fill("Public Synthetic Custom Cable Fly");
    await page.locator('[data-action="add-exercise-primary"]').selectOption("Chest");
    await page.locator('[data-action="add-exercise-secondary"]').selectOption("Triceps");
    await page.locator('[data-action="add-exercise"]').click();
    let stored = await waitForPersisted(page, (data) => data.exercises.some((item) => item.sessionId === IDS.activeSession && item.name === "Public Synthetic Custom Cable Fly"), "added active exercise must persist");
    const custom = stored.exercises.find((item) => item.sessionId === IDS.activeSession && item.name === "Public Synthetic Custom Cable Fly");
    expect(custom.primaryMuscle).toBe("Chest");
    expect(custom.secondaryMuscle).toBe("Triceps");
    await page.locator(`[data-action="delete-exercise"][data-exercise-id="${custom.id}"]`).click();

    const initialBenchSetCount = stored.sets.filter((item) => item.exerciseId === IDS.activeBenchExercise).length;
    await page.locator(`[data-action="add-set"][data-exercise-id="${IDS.activeBenchExercise}"]`).click();
    stored = await waitForPersisted(page, (data) => data.sets.filter((item) => item.exerciseId === IDS.activeBenchExercise).length === initialBenchSetCount + 1, "added working set must persist");
    const addedSet = stored.sets.filter((item) => item.exerciseId === IDS.activeBenchExercise).sort((a, b) => Number(b.sequenceIndex) - Number(a.sequenceIndex))[0];
    await page.locator(`[data-action="delete-set"][data-set-id="${addedSet.id}"]`).click();
    await page.locator('[data-action="save-template"]').click();
    await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();

    stored = await waitForPersisted(page, (data) => {
      const activeExercises = data.exercises.filter((item) => item.sessionId === IDS.activeSession).sort((a, b) => a.order - b.order);
      const saved = data.templates.find((item) => item.name === `${NAMES.activeSession} Template` && item.createdAt === FIXED_NOW);
      return activeExercises.length === 2 && activeExercises[0].id === IDS.activeRowExercise && activeExercises[1].name === renamed && data.sets.filter((item) => item.exerciseId === IDS.activeBenchExercise).length === initialBenchSetCount && saved?.exercises.some((item) => item.name === renamed);
    }, "active edits and save-as-template must persist without the removed entities");
    assertUniqueEntityIds(stored);

    await reloadAndWait(page);
    await page.locator('[data-action="set-tab"][data-tab="lift"]').click();
    await expect(page.getByRole("heading", { name: NAMES.activeSession, exact: true })).toBeVisible();
    await expect(page.locator(`[data-action="exercise-name"][data-exercise-id="${IDS.activeBenchExercise}"]`)).toHaveValue(renamed);
    await expect(page.locator('[data-action="exercise-name"]')).toHaveCount(2);
    expect(browserErrors, "active-edit lifecycle browser errors").toEqual([]);
  });

  test("cancel keeps an active workout first, then discards only that draft and preserves unrelated data across reload", async ({ page }) => {
    test.setTimeout(120_000);
    const browserErrors = collectBrowserErrors(page);
    await installFixture(page, buildActiveWorkoutLifecycleFixture());
    const before = await persistedData(page);

    await page.locator(`[data-action="request-cancel-workout"][data-session-id="${IDS.activeSession}"]`).click();
    await expect(page.getByRole("dialog", { name: "Cancel this workout?" })).toBeVisible();
    await page.getByRole("button", { name: "Keep Workout", exact: true }).click();
    await expect(page.getByRole("heading", { name: NAMES.activeSession, exact: true })).toBeVisible();
    expect((await persistedData(page)).sessions.some((item) => item.id === IDS.activeSession)).toBe(true);

    await page.locator(`[data-action="request-cancel-workout"][data-session-id="${IDS.activeSession}"]`).click();
    await page.locator('[data-action="confirm-cancel-workout"]').click();
    const after = await waitForPersisted(page, (data) => !data.sessions.some((item) => item.id === IDS.activeSession), "discard must remove the active session");
    expect(after.exercises.some((item) => item.sessionId === IDS.activeSession)).toBe(false);
    expect(after.sets.some((item) => [IDS.activeBenchExercise, IDS.activeRowExercise].includes(item.exerciseId))).toBe(false);
    expect(after.sessions.find((item) => item.id === IDS.historySession)).toEqual(before.sessions.find((item) => item.id === IDS.historySession));
    expect(after.templates.find((item) => item.id === IDS.controlTemplate)).toEqual(before.templates.find((item) => item.id === IDS.controlTemplate));

    await reloadAndWait(page);
    await expect(page.getByRole("heading", { name: "Program overview", exact: true })).toBeVisible();
    expect((await persistedData(page)).sessions.filter((item) => item.id === IDS.historySession)).toHaveLength(1);
    expect(browserErrors, "cancel-workout lifecycle browser errors").toEqual([]);
  });

  test("set log/undo/skip, partial cancellation, and two routed submission attempts produce one durable effect", async ({ page }) => {
    test.setTimeout(150_000);
    const browserErrors = collectBrowserErrors(page);
    const fixture = buildActiveWorkoutLifecycleFixture();
    const controlRecommendation = {
      recommendationId: "public-synthetic-control-recommendation",
      sessionId: IDS.historySession,
      source: "public-synthetic-idempotency-control"
    };
    const controlOverride = {
      overrideId: "public-synthetic-control-override",
      recommendationId: controlRecommendation.recommendationId,
      sessionId: IDS.historySession,
      exerciseRuntimeId: IDS.historyBenchExercise,
      outcomeEvaluation: { result: "inconclusive", evaluatedAt: FIXED_NOW }
    };
    fixture.recommendationHistory = [controlRecommendation];
    fixture.manualOverrides = [controlOverride];
    await installFixture(page, fixture);

    const first = page.locator(`[data-action="toggle-set"][data-set-id="${IDS.activeBenchSet1}"]`);
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "false");
    await page.locator(`[data-action="toggle-skip-set"][data-set-id="${IDS.activeRowSet2}"]`).click();
    await page.locator(`[data-action="toggle-set"][data-set-id="${IDS.activeBenchSet1}"]`).click();

    await page.locator('[data-action="request-submit-workout"]').click();
    await expect(page.getByText("Log this workout as completed?", { exact: true })).toBeVisible();
    await page.locator('[data-action="cancel-submit-workout"]').click();
    await expect(page.getByText("Log this workout as completed?", { exact: true })).toHaveCount(0);
    const beforeSubmit = await waitForPersisted(page, (data) => {
      return data.sets.find((item) => item.id === IDS.activeBenchSet1)?.completed === true
        && data.sets.find((item) => item.id === IDS.activeRowSet2)?.skipped === true;
    }, "the logged and skipped set state must persist before submission effects are measured");
    await installSubmissionProbe(page);
    await page.locator('[data-action="request-submit-workout"]').click();
    await page.locator('[data-action="confirm-submit-workout"]').click();

    await expect(page.locator('[aria-label="Post-workout grade and analysis"]')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Workout logged", { exact: true }).first()).toBeVisible();
    const afterFirst = await waitForPersisted(page, (data) => data.sessions.filter((item) => item.id === IDS.activeSession && item.submitted).length === 1, "the UI confirmation must persist one submitted session");
    await waitForSubmissionWrites(page);
    expect(await submissionProbe(page)).toMatchObject({
      attempts: [[IDS.activeSession]],
      returnedTypes: ["undefined"],
      analysisCalls: [IDS.activeSession],
      writesFailed: 0
    });
    const firstEffectProbe = await submissionProbe(page);
    expect.soft(firstEffectProbe.completionSoundCalls, "the first accepted submission must route workout-completion sound exactly once").toHaveLength(1);
    expect.soft(firstEffectProbe.successFeedbackCalls, "the accepted UI confirmation and completed workout must each route their deliberate success-feedback signal").toHaveLength(2);
    expect(afterFirst.dataRevision, "the first routed submission must create exactly one data revision").toBe(Number(beforeSubmit.dataRevision) + 1);

    const secondRoute = await page.evaluate((sessionId) => {
      const beforeAttempts = window.__lifecycleSubmissionProbe.attempts.length;
      const result = window.submitWorkout(sessionId);
      return {
        beforeAttempts,
        afterAttempts: window.__lifecycleSubmissionProbe.attempts.length,
        returnedAttempts: window.__lifecycleSubmissionProbe.returnedTypes.length,
        returnType: typeof result
      };
    }, IDS.activeSession);
    expect(secondRoute, "the second application-level submission function must be invoked and return").toEqual({
      beforeAttempts: 1,
      afterAttempts: 2,
      returnedAttempts: 2,
      returnType: "undefined"
    });
    await waitForSubmissionWrites(page);
    const finalProbe = await submissionProbe(page);
    expect.soft(finalProbe.attempts, "both independent application-level attempts must reach the real submit function").toEqual([[IDS.activeSession], [IDS.activeSession]]);
    expect.soft(finalProbe.returnedTypes, "both real submit calls must return to their callers").toEqual(["undefined", "undefined"]);
    expect.soft(finalProbe.analysisCalls, "two submission attempts must calculate the durable analysis only once").toEqual([IDS.activeSession]);
    expect.soft(finalProbe.completionSoundCalls, "the retry must not replay workout-completion sound").toEqual(firstEffectProbe.completionSoundCalls);
    expect.soft(finalProbe.successFeedbackCalls, "the direct retry must not add a third success-feedback signal after the UI confirmation and first completion effect").toEqual(firstEffectProbe.successFeedbackCalls);

    const after = await persistedData(page);
    const firstSession = afterFirst.sessions.find((item) => item.id === IDS.activeSession);
    const finalSession = after.sessions.find((item) => item.id === IDS.activeSession);
    expect.soft(after.dataRevision, "two routed attempts must produce exactly one persisted submission revision").toBe(Number(beforeSubmit.dataRevision) + 1);
    expect.soft(after.sessions.filter((item) => item.id === IDS.activeSession), "submission retries must not duplicate the session").toHaveLength(1);
    expect.soft(after.exercises.filter((item) => item.sessionId === IDS.activeSession)).toHaveLength(2);
    expect.soft(after.sets.filter((item) => item.exerciseId === IDS.activeBenchExercise)).toHaveLength(2);
    expect.soft(after.sets.find((item) => item.id === IDS.activeBenchSet1).completed).toBe(true);
    expect.soft(after.sets.find((item) => item.id === IDS.activeRowSet2).skipped).toBe(true);
    expect.soft(finalSession.workoutAnalysis, "the one stored analysis must remain identical after the retry").toEqual(firstSession.workoutAnalysis);
    expect.soft(finalSession.workoutAnalysis.metrics.completedSets).toBe(1);
    expect.soft(after.recommendationHistory, "the existing recommendation record must remain singular and unchanged").toEqual([controlRecommendation]);
    expect.soft(after.manualOverrides, "the existing manual-override record must remain singular and unchanged").toEqual([controlOverride]);
    expect.soft(new Set(after.recommendationHistory.map((item) => item.recommendationId)).size).toBe(after.recommendationHistory.length);
    expect.soft(new Set(after.manualOverrides.map((item) => item.overrideId)).size).toBe(after.manualOverrides.length);
    assertUniqueEntityIds(after);

    await reloadAndWait(page);
    await page.locator('[data-action="set-tab"][data-tab="dashboard"]').click();
    await expect(page.locator(`[data-action="open-session"][data-session-id="${IDS.activeSession}"]`)).toHaveCount(1);
    const reloaded = await persistedData(page);
    expect.soft(reloaded.dataRevision, "reload must preserve the single submission effect").toBe(Number(beforeSubmit.dataRevision) + 1);
    expect.soft(reloaded.sessions.filter((item) => item.id === IDS.activeSession)).toHaveLength(1);
    expect.soft(reloaded.sessions.find((item) => item.id === IDS.activeSession).workoutAnalysis).toEqual(firstSession.workoutAnalysis);
    expect.soft(reloaded.recommendationHistory).toEqual([controlRecommendation]);
    expect.soft(reloaded.manualOverrides).toEqual([controlOverride]);
    expect(browserErrors, "submit lifecycle browser errors").toEqual([]);
  });

  test("history edit discard restores the exact saved workout and remains restored after reload", async ({ page }) => {
    test.setTimeout(120_000);
    const browserErrors = collectBrowserErrors(page);
    await installFixture(page, buildHistoryLifecycleFixture());
    const before = await persistedData(page);
    await openSubmittedHistorySession(page);
    await page.locator('[data-action="begin-history-edit"]').click();
    await page.locator("summary").filter({ hasText: "Workout details" }).click();
    await page.locator('[data-action="session-title"]').fill("Public Synthetic Temporary History Title");
    const editedReps = page.locator(`[data-action="set-reps"][data-set-id="${IDS.historyBenchSet1}"]`);
    await editedReps.fill("12");
    await editedReps.evaluate((element) => element.blur());
    await page.locator('[data-action="request-cancel-history-edits"]').click();
    await expect(page.getByRole("dialog", { name: "Cancel these edits?" })).toBeVisible();
    await page.locator('[data-action="confirm-cancel-history-edits"]').click();

    const after = await waitForPersisted(page, (data) => data.sessions.find((item) => item.id === IDS.historySession)?.title === NAMES.historySession, "discarded history edits must restore the saved title");
    expect(after.sessions.find((item) => item.id === IDS.historySession)).toEqual(before.sessions.find((item) => item.id === IDS.historySession));
    expect(after.sets.find((item) => item.id === IDS.historyBenchSet1)).toEqual(before.sets.find((item) => item.id === IDS.historyBenchSet1));
    assertUniqueEntityIds(after);

    await reloadAndWait(page);
    await openSubmittedHistorySession(page);
    await expect(page.getByRole("heading", { name: NAMES.historySession, exact: true })).toBeVisible();
    expect(browserErrors, "history-discard lifecycle browser errors").toEqual([]);
  });

  test("history edit save persists nested set changes, recalculates derived analysis, creates no duplicates, and survives reload", async ({ page }) => {
    test.setTimeout(150_000);
    const browserErrors = collectBrowserErrors(page);
    await installFixture(page, buildHistoryLifecycleFixture());
    await openSubmittedHistorySession(page);
    await page.locator('[data-action="begin-history-edit"]').click();
    await page.locator("summary").filter({ hasText: "Workout details" }).click();
    await page.locator('[data-action="session-title"]').fill(EDITED_HISTORY_TITLE);
    const editedReps = page.locator(`[data-action="set-reps"][data-set-id="${IDS.historyBenchSet1}"]`);
    await editedReps.fill("11");
    await editedReps.evaluate((element) => element.blur());
    await page.locator('[data-action="request-save-history-edits"]').click();
    await expect(page.getByRole("dialog", { name: "Save these history edits?" })).toBeVisible();
    await page.locator('[data-action="confirm-save-history-edits"]').click();

    const after = await waitForPersisted(page, (data) => data.sessions.find((item) => item.id === IDS.historySession)?.title === EDITED_HISTORY_TITLE && data.sessions.find((item) => item.id === IDS.historySession)?.workoutAnalysis?.version === 1, "saved history edits must persist with recalculated analysis");
    expect(after.sessions.filter((item) => item.id === IDS.historySession)).toHaveLength(1);
    expect(after.exercises.filter((item) => item.sessionId === IDS.historySession)).toHaveLength(2);
    expect(after.sets.filter((item) => item.exerciseId === IDS.historyBenchExercise)).toHaveLength(2);
    expect(after.sets.find((item) => item.id === IDS.historyBenchSet1).reps).toBe(11);
    const savedAnalysis = after.sessions.find((item) => item.id === IDS.historySession).workoutAnalysis;
    const savedBenchResult = savedAnalysis.exerciseResults.find((item) => item.exerciseId === IDS.historyBenchExercise);
    expect(savedAnalysis.metrics.completedSets).toBe(4);
    expect(savedBenchResult.bestSet).toMatchObject({ id: IDS.historyBenchSet1, reps: 11, load: 145 });
    expect(savedBenchResult.bestSet.text).toContain("11 reps");
    assertUniqueEntityIds(after);

    await reloadAndWait(page);
    await page.locator('[data-action="set-tab"][data-tab="dashboard"]').click();
    const card = page.locator(`[data-action="open-session"][data-session-id="${IDS.historySession}"]`);
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(EDITED_HISTORY_TITLE);
    await card.click();
    await expect(page.getByRole("heading", { name: EDITED_HISTORY_TITLE, exact: true })).toBeVisible();
    const result = page.locator(".workout-exercise-result").filter({ hasText: NAMES.bench });
    await result.locator("summary").click();
    await expect(result).toContainText("11 reps");
    await expect(result).toContainText("145 lb");
    const reloaded = await persistedData(page);
    const reloadedSession = reloaded.sessions.find((item) => item.id === IDS.historySession);
    const reloadedBenchResult = reloadedSession.workoutAnalysis.exerciseResults.find((item) => item.exerciseId === IDS.historyBenchExercise);
    expect(reloaded.sets.find((item) => item.id === IDS.historyBenchSet1).reps).toBe(11);
    expect(reloadedBenchResult.bestSet).toEqual(savedBenchResult.bestSet);
    expect(reloaded.sessions.filter((item) => item.id === IDS.historySession)).toHaveLength(1);
    await page.locator('[data-action="begin-history-edit"]').click();
    await page.locator("summary").filter({ hasText: "Workout details" }).click();
    await expect(page.locator(`[data-action="set-reps"][data-set-id="${IDS.historyBenchSet1}"]`)).toHaveValue("11");
    expect(browserErrors, "history-save lifecycle browser errors").toEqual([]);
  });

  test("the first Save Edits click after a numeric history field blur is not swallowed by rerender", async ({ page }) => {
    test.setTimeout(120_000);
    await installFixture(page, buildHistoryLifecycleFixture());
    await openSubmittedHistorySession(page);
    await page.locator('[data-action="begin-history-edit"]').click();
    const revisionBeforeEdit = await page.evaluate(() => {
      const realWriteIndexedValue = window.writeIndexedValue;
      window.__historyFirstClickWriteProbe = { started: 0, completed: 0, failed: 0 };
      window.writeIndexedValue = async function (...args) {
        const isAppDataWrite = args[0] === "app-data";
        if (isAppDataWrite) window.__historyFirstClickWriteProbe.started += 1;
        try {
          const result = await Reflect.apply(realWriteIndexedValue, this, args);
          if (isAppDataWrite) window.__historyFirstClickWriteProbe.completed += 1;
          return result;
        } catch (error) {
          if (isAppDataWrite) window.__historyFirstClickWriteProbe.failed += 1;
          throw error;
        }
      };
      return Number(data.dataRevision);
    });
    const editedReps = page.locator(`[data-action="set-reps"][data-set-id="${IDS.historyBenchSet1}"]`);
    await editedReps.fill("12");
    await page.locator('[data-action="request-save-history-edits"]').click();
    const dialog = page.getByRole("dialog", { name: "Save these history edits?" });
    await expect(dialog, "the blur-triggered render must not detach and swallow the user's first confirmation click").toBeVisible({ timeout: 1_500 });
    await dialog.locator('[data-action="confirm-save-history-edits"]').click();

    const saved = await waitForPersisted(page, (stored) => {
      const set = stored.sets.find((item) => item.id === IDS.historyBenchSet1);
      const analysis = stored.sessions.find((item) => item.id === IDS.historySession)?.workoutAnalysis;
      const result = analysis?.exerciseResults?.find((item) => item.exerciseId === IDS.historyBenchExercise);
      return set?.reps === 12 && result?.bestSet?.id === IDS.historyBenchSet1 && result.bestSet.reps === 12;
    }, "the first Save Edits confirmation must persist the numeric edit and its recalculated analysis", 30_000);
    const savedResult = saved.sessions.find((item) => item.id === IDS.historySession).workoutAnalysis.exerciseResults.find((item) => item.exerciseId === IDS.historyBenchExercise);
    expect.soft(saved.sets.find((item) => item.id === IDS.historyBenchSet1).reps).toBe(12);
    expect.soft(savedResult.bestSet).toMatchObject({ id: IDS.historyBenchSet1, reps: 12, load: 145 });
    expect.soft(saved.dataRevision, "one real numeric edit must create exactly one logical revision despite input/change/focusout delivery").toBe(revisionBeforeEdit + 1);
    await expect.poll(() => page.evaluate(() => structuredClone(window.__historyFirstClickWriteProbe)), {
      message: "the explicit Save Edits confirmation must route exactly one durable app-data write",
      timeout: 12_000
    }).toEqual({ started: 1, completed: 1, failed: 0 });

    await reloadAndWait(page);
    await page.locator('[data-action="set-tab"][data-tab="dashboard"]').click();
    const card = page.locator(`[data-action="open-session"][data-session-id="${IDS.historySession}"]`);
    await expect(card).toHaveCount(1);
    await card.click();
    const result = page.locator(".workout-exercise-result").filter({ hasText: NAMES.bench });
    await result.locator("summary").click();
    await expect(result).toContainText("12 reps");
    await expect(result).toContainText("145 lb");
    const reloaded = await persistedData(page);
    const reloadedResult = reloaded.sessions.find((item) => item.id === IDS.historySession).workoutAnalysis.exerciseResults.find((item) => item.exerciseId === IDS.historyBenchExercise);
    expect.soft(reloaded.sets.find((item) => item.id === IDS.historyBenchSet1).reps).toBe(12);
    expect.soft(reloadedResult.bestSet).toEqual(savedResult.bestSet);
  });

  test("browser Back cannot bypass unsaved-history confirmation or persist temporary edits on unload", async ({ page }) => {
    test.setTimeout(120_000);
    await installFixture(page, buildHistoryLifecycleFixture());
    const original = await persistedData(page);
    await openSubmittedHistorySession(page);
    await page.locator('[data-action="begin-history-edit"]').click();
    await page.locator("summary").filter({ hasText: "Workout details" }).click();
    const temporaryTitle = "Public Synthetic Temporary Popstate Edit";
    await page.locator('[data-action="session-title"]').fill(temporaryTitle);
    expect((await persistedData(page)).sessions.find((item) => item.id === IDS.historySession).title).toBe(NAMES.historySession);

    await page.goBack();
    await expect.soft(page.getByRole("dialog", { name: "Cancel these edits?" }), "browser Back must enter the same guarded confirmation flow as primary navigation").toBeVisible({ timeout: 1_000 });
    await expect.soft(page, "browser Back must not leave the edit surface before the user resolves the confirmation").toHaveURL(/#lift$/, { timeout: 1_000 });
    await expect.soft(page.locator('[data-action="session-title"]'), "the temporary edit must remain available while confirmation is unresolved").toHaveValue(temporaryTitle, { timeout: 1_000 });

    await reloadAndWait(page);
    const afterReload = await persistedData(page);
    expect.soft(afterReload.sessions.find((item) => item.id === IDS.historySession).title, "pagehide/reload must not save a temporary history edit without explicit Save Edits confirmation").toBe(NAMES.historySession);
    expect.soft(afterReload.sessions.find((item) => item.id === IDS.historySession), "the saved history session must otherwise remain unchanged").toEqual(original.sessions.find((item) => item.id === IDS.historySession));
    assertUniqueEntityIds(afterReload);
  });
});
