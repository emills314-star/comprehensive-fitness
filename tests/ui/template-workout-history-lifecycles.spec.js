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

    await expect.poll(async () => Number((await persistedData(page)).dataRevision || 0), {
      message: "wait for the invalid edit's autosave attempt before checking persistence",
      timeout: 12_000,
    }).toBeGreaterThan(Number(before.dataRevision || 0));
    const after = await persistedData(page);
    const afterExercise = after.templates.find((item) => item.id === IDS.controlTemplate).exercises.find((item) => item.id === IDS.controlBenchTemplateExercise);
    expect.soft(afterExercise.sets, "invalid sets must not replace the last valid persisted value").toBe(beforeExercise.sets);
    expect.soft(afterExercise.reps, "invalid reps must not replace the last valid persisted value").toBe(beforeExercise.reps);
    expect.soft(afterExercise.targetRpe, "invalid RPE must not replace the last valid persisted value").toBe(beforeExercise.targetRpe);
    expect.soft(afterExercise.increment, "invalid increment must not replace the last valid persisted value").toBe(beforeExercise.increment);
    expect.soft(afterExercise.restSeconds, "invalid rest must not replace the last valid persisted value").toBe(beforeExercise.restSeconds);
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

  test("set log/undo/skip, partial submission cancellation, rapid double confirmation, summary, and reload are exactly once", async ({ page }) => {
    test.setTimeout(150_000);
    const browserErrors = collectBrowserErrors(page);
    await installFixture(page, buildActiveWorkoutLifecycleFixture());

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
    await page.locator('[data-action="request-submit-workout"]').click();
    await page.locator('[data-action="confirm-submit-workout"]').evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await expect(page.locator('[aria-label="Post-workout grade and analysis"]')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Workout logged", { exact: true }).first()).toBeVisible();
    const after = await waitForPersisted(page, (data) => data.sessions.filter((item) => item.id === IDS.activeSession && item.submitted).length === 1, "rapid confirmation must persist one submitted session");
    expect(after.sessions.filter((item) => item.id === IDS.activeSession)).toHaveLength(1);
    expect(after.exercises.filter((item) => item.sessionId === IDS.activeSession)).toHaveLength(2);
    expect(after.sets.filter((item) => item.exerciseId === IDS.activeBenchExercise)).toHaveLength(2);
    expect(after.sets.find((item) => item.id === IDS.activeBenchSet1).completed).toBe(true);
    expect(after.sets.find((item) => item.id === IDS.activeRowSet2).skipped).toBe(true);
    expect(after.sessions.find((item) => item.id === IDS.activeSession).workoutAnalysis.metrics.completedSets).toBe(1);
    assertUniqueEntityIds(after);

    await reloadAndWait(page);
    await page.locator('[data-action="set-tab"][data-tab="dashboard"]').click();
    await expect(page.locator(`[data-action="open-session"][data-session-id="${IDS.activeSession}"]`)).toHaveCount(1);
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

  test("history edit save recalculates analysis once, creates no duplicates, and survives reload", async ({ page }) => {
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
    expect(after.sessions.find((item) => item.id === IDS.historySession).workoutAnalysis.metrics.completedSets).toBe(4);
    assertUniqueEntityIds(after);

    await reloadAndWait(page);
    await page.locator('[data-action="set-tab"][data-tab="dashboard"]').click();
    const card = page.locator(`[data-action="open-session"][data-session-id="${IDS.historySession}"]`);
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(EDITED_HISTORY_TITLE);
    expect(browserErrors, "history-save lifecycle browser errors").toEqual([]);
  });

  test("the first Save Edits click after a numeric history field blur is not swallowed by rerender", async ({ page }) => {
    test.setTimeout(90_000);
    await installFixture(page, buildHistoryLifecycleFixture());
    await openSubmittedHistorySession(page);
    await page.locator('[data-action="begin-history-edit"]').click();
    const editedReps = page.locator(`[data-action="set-reps"][data-set-id="${IDS.historyBenchSet1}"]`);
    await editedReps.fill("12");
    await page.locator('[data-action="request-save-history-edits"]').click();
    await expect(page.getByRole("dialog", { name: "Save these history edits?" }), "the blur-triggered render must not detach and swallow the user's first confirmation click").toBeVisible({ timeout: 1_500 });
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
