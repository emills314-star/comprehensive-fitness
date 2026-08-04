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
  await expect.poll(() => page.evaluate(() => {
    const identity = prescriptionEngine?.resolveExerciseIdentity?.("Barbell Bench Press");
    return identity?.status === "resolved" ? identity.exerciseId : "";
  }), {
    message: "the identity compatibility catalog must resolve a known exercise before lifecycle actions run",
    timeout: 45_000
  }).toBe("ex_barbell_bench_press");
  const resume = page.locator('[data-action="resume-active-workout"]').first();
  if (await resume.count()) {
    await resume.click();
    await expect(page.locator(".workout-view")).toBeVisible();
  }
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

async function openRoutines(page) {
  if (await page.locator(".templates-view").isVisible().catch(() => false)) return;
  let opener = page.locator('[data-action="open-routines"]');
  if (!(await opener.count())) {
    const closeContext = page.locator('[data-action="close-secondary-context"], [data-action="close-workout-context"]');
    if (await closeContext.count()) await closeContext.first().click();
    else await page.locator('[data-action="set-tab"][data-tab="today"]').click();
    opener = page.locator('[data-action="open-routines"]');
  }
  await opener.click();
  await expect(page.locator(".templates-view")).toBeVisible();
}

async function openProgressHistory(page) {
  await page.locator('[data-action="set-tab"][data-tab="progress"]').click();
  await expect(page.locator(".history-view")).toBeVisible();
}

async function openSubmittedHistorySession(page) {
  await openProgressHistory(page);
  const historyCard = page.locator(`[data-action="open-session"][data-session-id="${IDS.historySession}"]`);
  await expect(historyCard).toHaveCount(1);
  await historyCard.click();
  await expect(page.getByRole("heading", { name: NAMES.historySession, exact: true })).toBeVisible();
}

async function reloadAndWait(page) {
  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => {
    const identity = prescriptionEngine?.resolveExerciseIdentity?.("Barbell Bench Press");
    return identity?.status === "resolved" ? identity.exerciseId : "";
  }), { timeout: 45_000 }).toBe("ex_barbell_bench_press");
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
    if (typeof realSubmitWorkout !== "function" || typeof realCalculateWorkoutAnalysis !== "function" || typeof realWriteIndexedValue !== "function") {
      throw new Error("The lifecycle probe could not access the real submission, analysis, and persistence functions.");
    }
    const probe = window.__lifecycleSubmissionProbe = {
      attempts: [],
      returnedTypes: [],
      analysisCalls: [],
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
  test("routine create, autosave, reorder, duplicate, deletion confirmation, and reload", async ({ page }) => {
    test.setTimeout(120_000);
    const browserErrors = collectBrowserErrors(page);
    await installFixture(page, buildTemplateLifecycleFixture());
    await openRoutines(page);

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
    await editor.locator(`[data-action="move-template-exercise"][data-template-exercise-id="${addedExerciseId}"][data-direction="up"]`).click();
    await waitForPersisted(page, (stored) => {
      const created = stored.templates.find((item) => item.id === templateId);
      return created?.exercises.length === 2 && created.exercises[0].name === "Public Synthetic Cable Fly" && created.exercises[1].name === "Public Synthetic Paused Bench Press";
    }, "routine exercise order must persist");
    await expect(editor.locator('[data-action="template-exercise-reps"], [data-action="template-exercise-increment"], [data-action="template-exercise-resistance"], [data-action="add-template-warmup"], [data-action="remove-template-warmup"]')).toHaveCount(0);

    await reloadAndWait(page);
    await openRoutines(page);
    editor = page.locator(`.template-card:has([data-template-id="${templateId}"])`);
    await expect(editor.locator('[data-action="template-name"]')).toHaveValue(TEST_TEMPLATE_NAME);
    await editor.locator('[data-action="toggle-template-editor"]').click();
    await expect(editor.locator('[data-action="template-exercise-name"]')).toHaveCount(2);
    await expect(editor.locator('[data-action="template-exercise-name"]').first()).toHaveValue("Public Synthetic Cable Fly");

    await editor.locator(`[data-action="delete-template-exercise"][data-template-exercise-id="${addedExerciseId}"]`).click();
    await waitForPersisted(page, (stored) => {
      const created = stored.templates.find((item) => item.id === templateId);
      return created?.exercises.length === 1 && created.exercises[0].id === originalExerciseId;
    }, "routine exercise removal must persist");
    await page.evaluate(({ sourceTemplateId, sourceExerciseId }) => {
      patchTemplateExercise(sourceTemplateId, sourceExerciseId, {
        increment: 2.5,
        resistanceType: "external",
        warmups: [{ id: "public-synthetic-compatible-warmup", reps: 5, weight: 45, weightUnit: "lb", rpe: 5 }]
      });
    }, { sourceTemplateId: templateId, sourceExerciseId: originalExerciseId });
    const renameAudit = await page.evaluate(({ sourceTemplateId, sourceExerciseId }) => {
      const before = data.templates.find((item) => item.id === sourceTemplateId).exercises.find((item) => item.id === sourceExerciseId).restSeconds;
      patchTemplateExerciseName(sourceTemplateId, sourceExerciseId, "Public Synthetic Paused Bench Press — Heavy", true);
      const after = data.templates.find((item) => item.id === sourceTemplateId).exercises.find((item) => item.id === sourceExerciseId).restSeconds;
      return { before, after };
    }, { sourceTemplateId: templateId, sourceExerciseId: originalExerciseId });
    expect(renameAudit.after, "renaming a routine variant must not silently recalculate rest").toBe(renameAudit.before);

    const countsBeforeDuplicate = await page.evaluate(() => ({
      sessions: data.sessions.length,
      exercises: data.exercises.length,
      sets: data.sets.length
    }));
    await editor.locator(`[data-action="duplicate-template"][data-template-id="${templateId}"]`).click();
    const copyName = `${TEST_TEMPLATE_NAME} Copy`;
    const copyId = await page.locator('[data-action="template-name"]').evaluateAll((elements, expectedName) => (
      elements.find((element) => element.value === expectedName)?.dataset.templateId || ""
    ), copyName);
    expect(copyId).not.toBe("");
    const copyNameInput = page.locator(`[data-action="template-name"][data-template-id="${copyId}"]`);
    await expect(copyNameInput).toHaveCount(1);
    await waitForPersisted(page, (stored) => stored.templates.some((item) => item.id === copyId), "duplicated routine must persist independently");
    const duplicateAudit = await page.evaluate(({ sourceId, copiedId }) => {
      const source = data.templates.find((item) => item.id === sourceId);
      const copied = data.templates.find((item) => item.id === copiedId);
      return {
        counts: { sessions: data.sessions.length, exercises: data.exercises.length, sets: data.sets.length },
        source,
        copied
      };
    }, { sourceId: templateId, copiedId: copyId });
    expect(duplicateAudit.counts).toEqual(countsBeforeDuplicate);
    expect(duplicateAudit.copied.id).not.toBe(duplicateAudit.source.id);
    expect(duplicateAudit.copied.exercises.map((exercise) => exercise.id)).not.toEqual(duplicateAudit.source.exercises.map((exercise) => exercise.id));
    expect(duplicateAudit.copied.exercises.flatMap((exercise) => exercise.setTypes || []).every((setType) => Boolean(setType.id))).toBe(true);
    expect(duplicateAudit.copied.exercises.flatMap((exercise) => exercise.setTypes || []).map((setType) => setType.id))
      .not.toEqual(duplicateAudit.source.exercises.flatMap((exercise) => exercise.setTypes || []).map((setType) => setType.id));
    expect(duplicateAudit.copied.exercises.flatMap((exercise) => exercise.warmups || []).every((warmup) => Boolean(warmup.id))).toBe(true);
    expect(duplicateAudit.copied.exercises.flatMap((exercise) => exercise.warmups || []).map((warmup) => warmup.id))
      .not.toEqual(duplicateAudit.source.exercises.flatMap((exercise) => exercise.warmups || []).map((warmup) => warmup.id));
    expect(duplicateAudit.copied.exercises.flatMap((exercise) => exercise.warmups || []).map(({ id, ...warmup }) => warmup))
      .toEqual(duplicateAudit.source.exercises.flatMap((exercise) => exercise.warmups || []).map(({ id, ...warmup }) => warmup));
    expect(duplicateAudit.copied.exercises.flatMap((exercise) => exercise.setTypes || []).map(({ id, ...setType }) => setType))
      .toEqual(duplicateAudit.source.exercises.flatMap((exercise) => exercise.setTypes || []).map(({ id, ...setType }) => setType));
    expect(duplicateAudit.copied.exercises.map(({ id, setTypes, warmups, ...exercise }) => exercise))
      .toEqual(duplicateAudit.source.exercises.map(({ id, setTypes, warmups, ...exercise }) => exercise));

    await editor.locator(`[data-action="request-delete-template"][data-template-id="${templateId}"]`).click();
    await page.locator('[data-action="cancel-delete-template"]').click();
    await expect(page.locator(`[data-action="template-name"][data-template-id="${templateId}"]`)).toHaveCount(1);
    await page.locator(`[data-action="request-delete-template"][data-template-id="${templateId}"]`).click();
    await page.locator(`[data-action="confirm-delete-template"][data-template-id="${templateId}"]`).click();
    await waitForPersisted(page, (stored) => !stored.templates.some((item) => item.id === templateId), "confirmed deletion must remove only the created template");
    await page.locator(`[data-action="request-delete-template"][data-template-id="${copyId}"]`).click();
    await page.locator(`[data-action="confirm-delete-template"][data-template-id="${copyId}"]`).click();
    await reloadAndWait(page);
    await openRoutines(page);
    await expect(page.locator(`[data-action="template-name"][data-template-id="${templateId}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-action="template-name"][data-template-id="${IDS.controlTemplate}"]`)).toHaveValue(NAMES.controlTemplate);
    expect(browserErrors, "template lifecycle browser errors").toEqual([]);
  });

  test("routine editor keeps named controls, focus, 44px targets, and increased-text reflow", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await installFixture(page, buildTemplateLifecycleFixture());
    await openRoutines(page);

    const templateId = IDS.controlTemplate;
    const card = page.locator(`.template-card:has([data-template-id="${templateId}"])`);
    const editorToggle = card.locator('[data-action="toggle-template-editor"]');
    await editorToggle.focus();
    await editorToggle.click();
    await expect(editorToggle, "Opening the routine editor must retain focus on its disclosure control").toBeFocused();

    const exerciseName = await card.locator('[data-action="template-exercise-name"]').first().inputValue();
    const repeatedControls = [
      ['[data-action="template-exercise-name"]', "Exercise name"],
      ['[data-action="template-exercise-sets"]', "Sets"],
      ['[data-action="template-exercise-rep-min"]', "Minimum repetitions"],
      ['[data-action="template-exercise-rep-max"]', "Maximum repetitions"],
      ['[data-action="template-exercise-rpe"]', "Target RPE"],
      ['[data-action="template-exercise-rest"]', "Rest seconds"],
      ['[data-action="delete-template-exercise"]', "Remove"]
    ];
    for (const [selector, actionLabel] of repeatedControls) {
      await expect(card.locator(selector).first(), `${actionLabel} must include the exercise context`).toHaveAccessibleName(new RegExp(exerciseName, "i"));
    }

    const deleteRequest = card.locator('[data-action="request-delete-template"]');
    await deleteRequest.focus();
    await deleteRequest.click();
    const deleteConfirm = card.locator('[data-action="confirm-delete-template"]');
    await expect(deleteConfirm, "Requesting routine deletion must move focus to its confirmation").toBeFocused();
    await card.locator('[data-action="cancel-delete-template"]').click();
    await expect(card.locator('[data-action="request-delete-template"]'), "Canceling routine deletion must restore its durable trigger").toBeFocused();

    const measure = () => page.locator(".templates-view").evaluate((surface) => {
      const targets = [...surface.querySelectorAll("button, input, summary")]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { height: rect.height, left: rect.left, right: rect.right, width: rect.width };
        });
      return { bodyWidth: document.body.scrollWidth, documentWidth: document.documentElement.scrollWidth, targets };
    });
    const expectGeometry = async (label, maximumWidth) => {
      const geometry = await measure();
      expect.soft(geometry.documentWidth, `${label} must not widen the document`).toBeLessThanOrEqual(maximumWidth + 1);
      expect.soft(geometry.bodyWidth, `${label} must not widen the body`).toBeLessThanOrEqual(maximumWidth + 1);
      expect.soft(geometry.targets.filter((target) => target.width < 44 || target.height < 44), `${label} must retain 44 by 44 CSS-pixel controls`).toEqual([]);
      expect.soft(geometry.targets.filter((target) => target.left < -1 || target.right > maximumWidth + 1), `${label} must not clip controls horizontally`).toEqual([]);
    };
    await expectGeometry("Routine editor at 390 pixels", 390);

    await page.setViewportSize({ width: 320, height: 720 });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.evaluate(() => render());
    await expect(card.locator('[data-action="template-exercise-name"]').first()).toBeVisible();
    await expectGeometry("Routine editor at 320 pixels and 200 percent text", 320);
  });

  test("an empty template cannot start an empty active workout and becomes startable after an exercise is restored", async ({ page }) => {
    test.setTimeout(90_000);
    const browserErrors = collectBrowserErrors(page);
    await installFixture(page, buildTemplateLifecycleFixture());
    await openRoutines(page);

    const templateId = IDS.controlTemplate;
    let card = page.locator(`.template-card:has([data-template-id="${templateId}"])`);
    await card.locator('[data-action="toggle-template-editor"]').click();
    const exerciseIds = await card.locator('[data-action="template-exercise-name"]').evaluateAll((controls) => controls.map((control) => control.dataset.templateExerciseId));
    expect(exerciseIds).toHaveLength(2);
    for (const exerciseId of exerciseIds) {
      card = page.locator(`.template-card:has([data-template-id="${templateId}"])`);
      await card.locator(`[data-action="delete-template-exercise"][data-template-exercise-id="${exerciseId}"]`).click();
    }

    card = page.locator(`.template-card:has([data-template-id="${templateId}"])`);
    const start = card.locator(`[data-action="start-template"][data-template-id="${templateId}"]`);
    await expect(start, "A template with zero exercises must not offer an executable Start action").toBeDisabled();
    await expect(card).toContainText("Add at least one exercise before starting this template.");
    await waitForPersisted(page, (stored) => stored.templates.find((template) => template.id === templateId)?.exercises.length === 0, "the empty template state must persist without creating a workout");

    const guarded = await page.evaluate((requestedTemplateId) => {
      const beforeSessions = data.sessions.length;
      startTemplate(requestedTemplateId, defaultRecovery(), "usual");
      return {
        beforeSessions,
        afterSessions: data.sessions.length,
        hasActiveWorkout: hasActiveWorkout(),
        dialogOpen: Boolean(templateStartFlow)
      };
    }, templateId);
    expect(guarded, "Runtime entry points must reject stale or programmatic empty-template starts").toEqual({
      beforeSessions: guarded.beforeSessions,
      afterSessions: guarded.beforeSessions,
      hasActiveWorkout: false,
      dialogOpen: false
    });

    await card.locator('[data-action="add-template-exercise"]').click();
    card = page.locator(`.template-card:has([data-template-id="${templateId}"])`);
    await expect(card.locator(`[data-action="start-template"][data-template-id="${templateId}"]`)).toBeEnabled();
    await expect(card).not.toContainText("Add at least one exercise before starting this template.");
    expect(browserErrors, "empty-template start guard browser errors").toEqual([]);
  });

  test("template validation enforces exact HTML/domain boundaries, exposes accessible errors, and refuses invalid persistence", async ({ page }) => {
    test.setTimeout(90_000);
    await installFixture(page, buildTemplateLifecycleFixture());
    await openRoutines(page);
    const card = page.locator(`.template-card:has([data-template-id="${IDS.controlTemplate}"])`);
    await card.locator('[data-action="toggle-template-editor"]').click();

    const sets = card.locator('[data-action="template-exercise-sets"]').first();
    const repMin = card.locator('[data-action="template-exercise-rep-min"]').first();
    const repMax = card.locator('[data-action="template-exercise-rep-max"]').first();
    const rpe = card.locator('[data-action="template-exercise-rpe"]').first();
    const rest = card.locator('[data-action="template-exercise-rest"]').first();
    for (const [control, label] of [[sets, "sets"], [repMin, "rep minimum"], [repMax, "rep maximum"], [rpe, "RPE"], [rest, "rest"]]) {
      await expect.soft(control, `${label} must expose native required semantics in addition to custom draft validation`).toHaveAttribute("required", "");
    }
    await expect(sets).toHaveAttribute("min", "1");
    await expect(repMin).toHaveAttribute("min", "1");
    await expect(repMax).toHaveAttribute("min", "1");
    await expect(rpe).toHaveAttribute("min", "5");
    await expect(rpe).toHaveAttribute("max", "10");
    await expect(rpe).toHaveAttribute("step", "0.5");
    await expect(rest).toHaveAttribute("min", "15");
    await expect(rest).toHaveAttribute("step", "15");
    await expect(card.locator('[data-action="template-exercise-reps"], [data-action="template-exercise-increment"], [data-action="template-exercise-resistance"], [data-action="add-template-warmup"]')).toHaveCount(0);

    const before = await persistedData(page);
    const beforeExercise = before.templates.find((item) => item.id === IDS.controlTemplate).exercises.find((item) => item.id === IDS.controlBenchTemplateExercise);
    await sets.fill("");
    expect(await sets.evaluate((element) => ({ valid: element.validity.valid, valueMissing: element.validity.valueMissing })), "an empty required number must fail the browser constraint before custom validation").toEqual({ valid: false, valueMissing: true });
    await sets.fill("0");
    await repMin.fill("0");
    await repMax.fill("0");
    await rpe.fill("4.5");
    await rest.fill("0");
    for (const [control, label] of [[sets, "sets"], [repMin, "rep minimum"], [repMax, "rep maximum"], [rpe, "RPE"], [rest, "rest"]]) {
      expect(await control.evaluate((element) => element.validity.valid), `${label} must fail the browser's declared HTML constraint`).toBe(false);
    }

    await expect.soft(card.locator('[role="alert"]'), "invalid template fields must expose a rendered accessible error").toHaveCount(1, { timeout: 750 });
    await expect.soft(sets, "the invalid sets control must be programmatically identified").toHaveAttribute("aria-invalid", "true", { timeout: 750 });
    await expect.soft(repMin, "the invalid rep-minimum control must be programmatically identified").toHaveAttribute("aria-invalid", "true", { timeout: 750 });
    await expect.soft(repMax, "the invalid rep-maximum control must be programmatically identified").toHaveAttribute("aria-invalid", "true", { timeout: 750 });
    await expect.soft(rpe, "the invalid RPE control must be programmatically identified").toHaveAttribute("aria-invalid", "true", { timeout: 750 });
    await expect.soft(rest, "the invalid rest control must be programmatically identified").toHaveAttribute("aria-invalid", "true", { timeout: 750 });

    await page.waitForTimeout(2_200);
    const after = await persistedData(page);
    const afterExercise = after.templates.find((item) => item.id === IDS.controlTemplate).exercises.find((item) => item.id === IDS.controlBenchTemplateExercise);
    expect.soft(after.dataRevision, "invalid edits must not create a persisted data revision").toBe(before.dataRevision);
    expect.soft(afterExercise.sets, "invalid sets must not replace the last valid persisted value").toBe(beforeExercise.sets);
    expect.soft(afterExercise.repMin, "invalid rep minimum must not replace the last valid persisted value").toBe(beforeExercise.repMin);
    expect.soft(afterExercise.repMax, "invalid rep maximum must not replace the last valid persisted value").toBe(beforeExercise.repMax);
    expect.soft(afterExercise.targetRpe, "invalid RPE must not replace the last valid persisted value").toBe(beforeExercise.targetRpe);
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
      ["template-exercise-rep-max", "12"],
      ["template-exercise-rep-min", "8"],
      ["template-exercise-rpe", "8.5"],
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
    for (const [control, label] of [[sets, "sets"], [repMin, "rep minimum"], [repMax, "rep maximum"], [rpe, "RPE"], [rest, "rest"]]) {
      await expect.soft(control, `correcting ${label} must clear its programmatic invalid state`).not.toHaveAttribute("aria-invalid", "true");
    }
    await expect.poll(() => page.evaluate(() => structuredClone(window.__templateCorrectionWriteProbe)), {
      message: "the corrected template fields must settle through one debounced durable app-data write",
      timeout: 12_000
    }).toEqual({ started: 1, completed: 1, failed: 0 });

    const corrected = await persistedData(page);
    const correctedExercise = corrected.templates.find((item) => item.id === IDS.controlTemplate).exercises.find((item) => item.id === IDS.controlBenchTemplateExercise);
    expect.soft(corrected.dataRevision, "four changed field corrections must create four coherent logical revisions before one debounced persistence write").toBe(correctionRevision + 4);
    expect.soft(correctedExercise, "the corrected template values must persist exactly as entered").toMatchObject({
      sets: 4,
      repMin: 8,
      repMax: 12,
      targetRpe: 8.5,
      restSeconds: 150
    });
    const rangeRevision = corrected.dataRevision;
    await repMin.fill("13");
    await expect(repMin, "a minimum above the stored maximum must be rejected instead of clamped").toHaveAttribute("aria-invalid", "true");
    await page.waitForTimeout(2_200);
    const rejectedRange = await persistedData(page);
    expect(rejectedRange.dataRevision).toBe(rangeRevision);
    expect(rejectedRange.templates.find((item) => item.id === IDS.controlTemplate).exercises.find((item) => item.id === IDS.controlBenchTemplateExercise)).toMatchObject({ repMin: 8, repMax: 12 });
    await repMin.fill("8");
    expect.soft(await page.evaluate(() => Number(data.dataRevision)), "the durable revision must equal the current in-memory revision").toBe(corrected.dataRevision);
  });

  test("the expected workout starts directly and survives reload", async ({ page }) => {
    test.setTimeout(120_000);
    const browserErrors = collectBrowserErrors(page);
    await installFixture(page, buildTemplateLifecycleFixture());
    await page.locator(`[data-action="start-next-template"][data-template-id="${IDS.controlTemplate}"]`).click();
    await expect(page.getByRole("heading", { name: NAMES.controlTemplate, exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("In progress", { exact: true })).toBeVisible();
    await expect(page.locator(".exercise-card"), "the active workout must render every exercise in one continuous document").toHaveCount(2);
    const firstExercise = page.locator(".exercise-card").first();
    await expect(firstExercise.locator(".set-current-editor .set-previous"), "a newly started template begins with its warm-up editor and must label that role rather than invent working-set history").toContainText("Warm-up");
    const stored = await waitForPersisted(page, (data) => {
      const sessions = data.sessions.filter((item) => item.templateId === IDS.controlTemplate && item.workoutStarted && !item.submitted);
      if (sessions.length !== 1) return false;
      const exerciseIds = data.exercises.filter((item) => item.sessionId === sessions[0].id).map((item) => item.id);
      return exerciseIds.length === 2 && data.sets.filter((item) => exerciseIds.includes(item.exerciseId)).length >= 4;
    }, "direct routine start must persist one active workout with both template exercises", 30_000);
    const started = stored.sessions.find((item) => item.templateId === IDS.controlTemplate && item.workoutStarted && !item.submitted);
    expect(started.readinessMode).toBe("usual");

    await reloadAndWait(page);
    await expect(page.getByRole("heading", { name: NAMES.controlTemplate, exact: true })).toBeVisible();
    await expect(page.getByText("In progress", { exact: true })).toBeVisible();
    expect(browserErrors, "template-start lifecycle browser errors").toEqual([]);
  });

  test("optional readiness is secondary and starts without a review gate", async ({ page }) => {
    test.setTimeout(120_000);
    const browserErrors = collectBrowserErrors(page);
    await installFixture(page, buildTemplateLifecycleFixture());
    await page.locator(`[data-action="log-template-readiness"][data-template-id="${IDS.controlTemplate}"]`).click();

    const readiness = page.getByRole("dialog", { name: "What is different today?", exact: true });
    await expect(readiness).toBeVisible();
    await readiness.getByRole("radio", { name: "Meaningfully poor", exact: true }).check();
    await readiness.getByRole("checkbox", { name: "Pain or injury", exact: true }).check();
    await readiness.getByLabel("Affected area", { exact: true }).selectOption({ label: "Back" });
    await readiness.getByLabel("Optional context", { exact: true }).fill("Public synthetic readiness context.");
    await expect(page.locator(".readiness-review-sheet"), "optional readiness must not introduce a mandatory review screen").toHaveCount(0);
    await readiness.locator('[data-action="start-workout-with-readiness"]').click();
    await expect(page.getByRole("heading", { name: NAMES.controlTemplate, exact: true })).toBeVisible({ timeout: 45_000 });
    const stored = await waitForPersisted(page, (data) => {
      const session = data.sessions.find((item) => item.templateId === IDS.controlTemplate && item.workoutStarted && !item.submitted);
      return session?.readinessMode === "daily";
    }, "optional readiness must persist with the one coherent active workout", 30_000);
    const started = stored.sessions.find((item) => item.templateId === IDS.controlTemplate && item.workoutStarted && !item.submitted);
    expect(started.readinessMode).toBe("daily");
    expect(started.recovery).toMatchObject({ readinessDeviation: "meaningfully_poor", pain: true, affectedMuscle: "Back" });
    expect(browserErrors, "optional-readiness lifecycle browser errors").toEqual([]);
  });

  test("an equipment-ineligible lift stays bounded in Progress and a newly started template", async ({ page }) => {
    test.setTimeout(120_000);
    const browserErrors = collectBrowserErrors(page);
    const fixture = buildTemplateLifecycleFixture();
    const unavailableName = "Cable Fly";
    fixture.settings.availableEquipment = ["barbell", "plates", "bench", "rack"];
    fixture.exercises = fixture.exercises
      .filter((exercise) => exercise.id === IDS.historyBenchExercise)
      .map((exercise) => ({ ...exercise, name: unavailableName, primaryMuscle: "Chest", secondaryMuscle: "" }));
    fixture.sets = fixture.sets.filter((set) => set.exerciseId === IDS.historyBenchExercise);
    fixture.templates[0] = {
      ...fixture.templates[0],
      name: "Public Synthetic New Cable Exercise",
      exercises: [{
        id: "public-synthetic-template-cable-fly",
        name: unavailableName,
        primaryMuscle: "Chest",
        secondaryMuscle: "",
        resistanceType: "external",
        isBodyweight: false,
        sets: 2,
        reps: 12,
        targetRpe: 8,
        increment: 5,
        restSeconds: 90,
        warmups: []
      }]
    };
    await installFixture(page, fixture);

    await page.locator('[data-action="set-tab"][data-tab="progress"]').click();
    await expect(page.locator(".destination-error"), "an unavailable-equipment recommendation must not crash the selected-lift destination").toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Search or select exercise" })).toHaveValue(unavailableName, { timeout: 45_000 });
    await expect(page.locator(".recommendation.blocked-recommendation"), "Equipment metadata must not create a logging block in Progress").toHaveCount(0);

    await openRoutines(page);
    await page.locator(`[data-action="start-template"][data-template-id="${IDS.controlTemplate}"]`).click();
    await expect(page.locator(".destination-error"), "a newly started unavailable-equipment exercise must remain inside its workout card").toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Public Synthetic New Cable Exercise", exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(".exercise-card")).toHaveCount(1);
    await expect(page.locator(".exercise-card .program-warning.blocking"), "Equipment metadata must not block the active logger").toHaveCount(0);
    await page.locator(".exercise-card details.exercise-details > summary").click();
    await expect(page.locator(".exercise-card [data-action=\"add-set\"]")).toBeEnabled();
    expect(browserErrors, "bounded unavailable-equipment paths must not emit browser errors").toEqual([]);
  });

  test("a persisted active recommendation snapshot remains inert audit history without blocking the logger", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);
    const fixture = buildActiveWorkoutLifecycleFixture();
    const partialSnapshot = {
      schemaVersion: "prescription-snapshot/public-synthetic-legacy",
      recommendationId: "public-synthetic-active-partial",
      exerciseId: "ex_barbell_bench_press",
      muscleGroupId: "mg_chest_sternal",
      confidence: "moderate",
      finalPrescription: {
        exerciseId: "ex_barbell_bench_press",
        recommendationType: "hold",
        sets: 2,
        repRange: { min: 8, max: 10, target: 9 },
        targetRpe: { min: 7, max: 8 },
        restSeconds: { min: 90, max: 150, target: 120 }
      }
    };
    fixture.exercises.find((exercise) => exercise.id === IDS.activeBenchExercise).recommendationSnapshot = structuredClone(partialSnapshot);
    await installFixture(page, fixture);

    await expect(page.locator(".destination-error"), "a persisted partial recommendation must not replace Today with the destination error surface").toHaveCount(0);
    await expect(page.locator(`#exercise-${IDS.activeBenchExercise}`)).toBeVisible();
    await expect(page.locator(`#exercise-${IDS.activeBenchExercise} .unified-prescription`), "Legacy analytical recommendations must stay out of the active logger").toHaveCount(0);
    await page.locator(`#exercise-${IDS.activeBenchExercise} details.exercise-details > summary`).click();
    await expect(page.locator(`#exercise-${IDS.activeBenchExercise} [data-action="add-set"]`)).toBeEnabled();
    const hasActiveSnapshot = await page.evaluate((exerciseId) => Object.hasOwn(data.exercises.find((exercise) => exercise.id === exerciseId), "recommendationSnapshot"), IDS.activeBenchExercise);
    expect(hasActiveSnapshot, "the original active-workout reference must survive as inert recovery/audit history").toBe(true);
    expect(browserErrors, "partial active recommendation presentation must not emit browser errors").toEqual([]);
  });

  test("a persisted structured legacy prescription reason remains inert and hidden on Today", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);
    const fixture = buildActiveWorkoutLifecycleFixture();
    const exercise = fixture.exercises.find((item) => item.id === IDS.activeBenchExercise);
    exercise.prescription = {
      sets: 2,
      reps: 8,
      repLow: 8,
      repHigh: 10,
      weight: 150,
      rpe: 8,
      restSeconds: 120,
      confidence: "moderate",
      reason: { summary: "Public synthetic structured legacy explanation." }
    };
    await installFixture(page, fixture);

    await expect(page.locator(".destination-error"), "a structured legacy reason must not replace Today with the destination error surface").toHaveCount(0);
    await expect(page.locator(`#exercise-${IDS.activeBenchExercise}`)).toBeVisible();
    await expect(page.locator(`#exercise-${IDS.activeBenchExercise} .prescription-brief`), "Legacy explanation copy must not re-enter the normal workout interface").toHaveCount(0);
    const hasLegacyPrescription = await page.evaluate((exerciseId) => Object.hasOwn(data.exercises.find((item) => item.id === exerciseId), "prescription"), IDS.activeBenchExercise);
    expect(hasLegacyPrescription, "the original active-workout prescription reference must survive without becoming current authority").toBe(true);
    expect(browserErrors, "inert structured legacy prescription data must not emit browser errors").toEqual([]);
  });

  test("compact set rows and Progress History keep logged facts in plain ink", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);
    const fixture = buildActiveWorkoutLifecycleFixture();
    fixture.sessions.find((session) => session.id === IDS.historySession).workoutAnalysis = {
      version: 1,
      grade: "B",
      internalScore: 82
    };
    await installFixture(page, fixture);

    const currentLayout = await page.locator(`#set-${IDS.activeBenchSet1}`).evaluate((block) => {
      const previous = block.querySelector(".set-previous").getBoundingClientRect();
      const load = block.querySelector('[data-action="set-weight"]').getBoundingClientRect();
      const style = getComputedStyle(document.body);
      return {
        collapsed: !block.querySelector(".set-tools-disclosure").open,
        height: block.getBoundingClientRect().height,
        previousTop: previous.top,
        previousWidth: previous.width,
        loadBottom: load.bottom,
        editorWidth: block.querySelector(".set-current-editor").getBoundingClientRect().width,
        bodyBackground: style.backgroundColor
      };
    });
    const pendingLayout = await page.locator(`#set-${IDS.activeBenchSet2}`).evaluate((block) => ({
      collapsed: !block.querySelector(".set-tools-disclosure").open,
      height: block.getBoundingClientRect().height,
      mode: block.querySelector("[data-set-mode]")?.getAttribute("data-set-mode")
    }));
    expect(currentLayout.collapsed, "current set controls should start collapsed").toBe(true);
    expect(pendingLayout.collapsed, "pending set controls should start collapsed").toBe(true);
    expect(pendingLayout.mode, "a pending set must use the V3 target-only shape").toBe("pending");
    expect(pendingLayout.height, "the pending target line must remain vertically cheaper than the current editor").toBeLessThan(currentLayout.height);
    expect(currentLayout.previousTop, "Previous history must follow the three primary M1 entry boxes").toBeGreaterThanOrEqual(currentLayout.loadBottom - 1);
    expect(currentLayout.previousWidth, "Previous history must remain a compact full-width strip rather than a fourth primary entry box").toBeGreaterThanOrEqual(currentLayout.editorWidth * 0.85);
    expect(currentLayout.bodyBackground, "the light application canvas must be true white").toBe("rgb(255, 255, 255)");

    await page.evaluate(() => setActiveTab("progress"));
    await expect(page.locator(".history-view")).toBeVisible();
    const card = page.locator(`.history-session-row[data-session-id="${IDS.historySession}"]`);
    const title = card.locator(".ri-copy b");
    const grade = card.locator(".ri-val");
    await expect(title).toHaveText(NAMES.historySession);
    await expect(grade).toHaveText("B");
    await expect(card).not.toContainText("Grade B");
    const hierarchy = await card.evaluate((element) => {
      const title = element.querySelector(".ri-copy b");
      const grade = element.querySelector(".ri-val");
      const probe = document.createElement("span");
      probe.style.color = "var(--text)";
      document.body.appendChild(probe);
      const textColor = getComputedStyle(probe).color;
      probe.remove();
      return {
        titleColor: getComputedStyle(title).color,
        textColor,
        gradeColor: getComputedStyle(grade).color,
        gradeBackground: getComputedStyle(grade).backgroundColor
      };
    });
    expect(hierarchy.titleColor, "logged session names should use plain text ink").toBe(hierarchy.textColor);
    expect(hierarchy.gradeColor, "the saved grade fact should use the same plain ink").toBe(hierarchy.titleColor);
    expect(hierarchy.gradeBackground).toBe("rgba(0, 0, 0, 0)");
    expect(browserErrors, "compact Today and History hierarchy must not emit browser errors").toEqual([]);
  });

  test("Previous and return preserve exercise context while Exercise options updates the active session", async ({ page }) => {
    test.setTimeout(90_000);
    const browserErrors = collectBrowserErrors(page);
    const fixture = buildActiveWorkoutLifecycleFixture();
    fixture.sets = fixture.sets.map((set) => [IDS.activeBenchSet1, IDS.activeBenchSet2].includes(set.id) ? { ...set, completed: true } : set);
    await installFixture(page, fixture);

    const previous = page.locator(`#set-${IDS.activeRowSet1} .set-previous-link`);
    await expect(previous).toHaveAttribute("data-exercise-id", IDS.historyRowExercise);
    await expect(previous).toHaveAttribute("data-return-exercise-id", IDS.activeRowExercise);
    await previous.click();

    const historyExercise = page.locator(`#exercise-${IDS.historyRowExercise}`);
    await expect(historyExercise).toBeVisible();
    await expect.poll(() => page.evaluate((exerciseId) => document.activeElement?.id === `exercise-${exerciseId}`, IDS.historyRowExercise), {
      message: "Previous must focus the matching exercise in the submitted session"
    }).toBe(true);

    await page.getByRole("button", { name: "Return to active session" }).click();
    const activeExercise = page.locator(`#exercise-${IDS.activeRowExercise}`);
    await expect(activeExercise).toBeVisible();
    await expect.poll(() => page.evaluate((exerciseId) => document.activeElement?.id === `exercise-${exerciseId}`, IDS.activeRowExercise), {
      message: "Returning must restore the same exercise in the active session"
    }).toBe(true);

    const initialSessionUpdatedAt = await page.evaluate((sessionId) => data.sessions.find((session) => session.id === sessionId)?.updatedAt, IDS.activeSession);
    await activeExercise.locator("details.exercise-details > summary").click();
    const editor = activeExercise.locator("[data-standard-workload-form]");
    await editor.locator('[data-default-field="sets"]').fill("3");
    await editor.locator('[data-default-field="rep-min"]').fill("12");
    await editor.locator('[data-default-field="rep-max"]').fill("14");
    await editor.locator('[data-default-field="target-rpe-min"]').fill("8");
    await editor.locator('[data-default-field="target-rpe-max"]').fill("9");
    await editor.locator('[data-default-field="working-rest"]').fill("135");
    await editor.locator('[data-action="apply-standard-workload"]').click();

    const persisted = await waitForPersisted(page, (stored) => {
      const activeSets = stored.sets.filter((set) => set.exerciseId === IDS.activeRowExercise && !set.isWarmup);
      const historySets = stored.sets.filter((set) => set.exerciseId === IDS.historyRowExercise && !set.isWarmup);
      const session = stored.sessions.find((item) => item.id === IDS.activeSession);
      const audit = stored.exercises.find((item) => item.id === IDS.activeRowExercise)?.manualOverrides
        ?.find((item) => item.sessionId === IDS.activeSession && item.exerciseRuntimeId === IDS.activeRowExercise && item.action === "exercise_default_targets");
      return activeSets.length === 3
        && activeSets.every((set) => set.targetRepMin === 12 && set.targetRepMax === 14 && set.targetRpeMin === 8 && set.targetRpeMax === 9 && set.targetRestSeconds === 135)
        && historySets.length === 2
        && session?.updatedAt !== initialSessionUpdatedAt
        && Boolean(audit);
    }, "Exercise options must durably update only the owning active session");
    expect(persisted.sessions.find((session) => session.id === IDS.historySession)?.updatedAt).toBe("2026-07-16T15:00:00.000Z");

    await reloadAndWait(page);
    await expect(page.locator(`#exercise-${IDS.activeRowExercise} .set-block`)).toHaveCount(3);
    await expect(page.locator(`#exercise-${IDS.activeRowExercise} [data-set-mode="current"]`)).toHaveCount(1);
    await expect(page.locator(`#exercise-${IDS.activeRowExercise} [data-set-mode="pending"]`)).toHaveCount(2);
    expect(browserErrors, "context-preserving Previous and exercise-default updates must not emit browser errors").toEqual([]);
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
    await openRoutines(page);
    await page.locator(`[data-action="start-template"][data-template-id="${IDS.controlTemplate}"]`).click();
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
    expect.soft(exercise.researchExerciseId, "the active exercise must retain the catalog identity").toBe("ex_seated_cable_row");
    expect.soft(exercise.stableTargetSnapshot, "the active exercise must retain its approved stable logging target").toMatchObject({
      sets: 2,
      repLow: 10,
      repHigh: 10,
      rpe: 8,
      restSeconds: 105
    });
  });

  test("legacy root state is discarded while an embedded historical snapshot remains byte-equivalent", async ({ page }) => {
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
    fixture.manualOverrides = [{
      overrideId: "public-synthetic-legacy-history-override",
      sessionId: IDS.historySession,
      exerciseRuntimeId: IDS.historyBenchExercise,
      action: "exercise_default_targets"
    }];
    fixture.personalEvidencePackage = {
      schemaVersion: "public-synthetic-legacy-evidence",
      rows: []
    };
    await installFixture(page, fixture);

    const observed = await page.evaluate((exerciseId) => {
      const exercise = data.exercises.find((item) => item.id === exerciseId);
      return {
        exerciseBytes: JSON.stringify(exercise.recommendationSnapshot),
        hasRecommendationHistory: Object.hasOwn(data, "recommendationHistory"),
        hasManualOverrides: Object.hasOwn(data, "manualOverrides"),
        hasPersonalEvidencePackage: Object.hasOwn(data, "personalEvidencePackage"),
        personalRows: [
          prescriptionEngine?.evidence?.personal?.exercisePrescriptions,
          prescriptionEngine?.evidence?.personal?.exerciseScores,
          prescriptionEngine?.evidence?.personal?.exerciseMuscleScores
        ].reduce((count, rows) => count + (Array.isArray(rows) ? rows.length : 0), 0)
      };
    }, IDS.historyBenchExercise);

    expect(observed.exerciseBytes).toBe(JSON.stringify(storedSnapshot));
    expect(observed.hasRecommendationHistory, "legacy top-level recommendation history must not become active state").toBe(false);
    expect(observed.hasManualOverrides, "legacy top-level override state must not become active state").toBe(false);
    expect(observed.hasPersonalEvidencePackage, "legacy personal evidence must not become active state").toBe(false);
    expect(observed.personalRows, "Historical evidence must not enrich the identity-only runtime").toBe(0);
  });

  test("a corrupt active legacy snapshot remains inert and cannot block active-workout logging", async ({ page }) => {
    const fixture = buildActiveWorkoutLifecycleFixture();
    const corruptSnapshot = {
      recommendationId: "public-synthetic-corrupt-active-snapshot",
      exerciseId: "ex_barbell_bench_press",
      muscleGroupId: "mg_chest_sternal",
      executable: true,
      finalPrescription: { executable: true, executionBlocked: false, sets: 99, reps: 99 }
    };
    fixture.exercises.find((item) => item.id === IDS.activeBenchExercise).recommendationSnapshot = corruptSnapshot;
    await installFixture(page, fixture);
    const card = page.locator(`#exercise-${IDS.activeBenchExercise}`);
    const beforeCount = await page.evaluate((exerciseId) => data.sets.filter((set) => set.exerciseId === exerciseId).length, IDS.activeBenchExercise);
    await card.locator("details.exercise-details > summary").click();
    await expect(card.locator('[data-action="add-set"]')).toBeEnabled();
    await card.locator('[data-action="add-set"]').click();
    await expect.poll(() => page.evaluate((exerciseId) => data.sets.filter((set) => set.exerciseId === exerciseId).length, IDS.activeBenchExercise)).toBe(beforeCount + 1);
    const hasActiveSnapshot = await page.evaluate((exerciseId) => Object.hasOwn(data.exercises.find((item) => item.id === exerciseId), "recommendationSnapshot"), IDS.activeBenchExercise);
    expect(hasActiveSnapshot, "logging must preserve the original snapshot bytes without executing them").toBe(true);
  });

  test("active workout substitution, reorder, add/remove exercises and sets, save-as-template, and reload remain coherent", async ({ page }) => {
    test.setTimeout(120_000);
    const browserErrors = collectBrowserErrors(page);
    await installFixture(page, buildActiveWorkoutLifecycleFixture());
    await expect(page.getByRole("heading", { name: NAMES.activeSession, exact: true })).toBeVisible();

    const renamed = "Public Synthetic Paused Bench Press — Session Edit";
    const sourceCard = page.locator(`#exercise-${IDS.activeBenchExercise}`);
    await sourceCard.locator("details.exercise-details > summary").click();
    await sourceCard.locator('[data-action="exercise-substitute-name"]').fill(renamed);
    await sourceCard.locator('[data-action="apply-exercise-substitution"]').click();
    await page.locator(`#exercise-${IDS.activeRowExercise} details.exercise-overflow > summary`).click();
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
    const afterAddRenderError = await page.evaluate(() => {
      try {
        renderWorkout();
        return "";
      } catch (error) {
        return `${error?.name || "Error"}: ${error?.message || "Unknown render error"}\n${error?.stack || ""}`;
      }
    });
    expect(afterAddRenderError, "adding a custom exercise must leave the active workout renderable").toBe("");
    await page.evaluate((exerciseId) => {
      const control = document.createElement("button");
      control.type = "button";
      control.dataset.action = "delete-exercise";
      control.dataset.exerciseId = exerciseId;
      root.appendChild(control);
      control.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      control.remove();
    }, custom.id);
    await expect.poll(() => page.evaluate((exerciseId) => data.exercises.some((item) => item.id === exerciseId), custom.id)).toBe(false);

    const initialBenchSetCount = stored.sets.filter((item) => item.exerciseId === IDS.activeBenchExercise).length;
    await page.locator(`#exercise-${IDS.activeBenchExercise} details.exercise-details > summary`).click();
    await page.locator(`[data-action="add-set"][data-exercise-id="${IDS.activeBenchExercise}"]`).click();
    stored = await waitForPersisted(page, (data) => data.sets.filter((item) => item.exerciseId === IDS.activeBenchExercise).length === initialBenchSetCount + 1, "added working set must persist");
    const addedSet = stored.sets.filter((item) => item.exerciseId === IDS.activeBenchExercise).sort((a, b) => Number(b.sequenceIndex) - Number(a.sequenceIndex))[0];
    await page.locator(`#set-${addedSet.id} .set-tools-disclosure > summary`).click();
    await page.locator(`[data-action="delete-set"][data-set-id="${addedSet.id}"]`).click();
    await page.locator('[data-action="session-menu"]').click();
    await page.locator('[data-action="save-template"]').click();
    await expect(page.locator(".templates-view")).toBeVisible();

    stored = await waitForPersisted(page, (data) => {
      const activeExercises = data.exercises.filter((item) => item.sessionId === IDS.activeSession).sort((a, b) => a.order - b.order);
      const saved = data.templates.find((item) => item.name === `${NAMES.activeSession} Template` && item.createdAt === FIXED_NOW);
      return activeExercises.length === 2 && activeExercises[0].id === IDS.activeRowExercise && activeExercises[1].name === renamed && data.sets.filter((item) => item.exerciseId === IDS.activeBenchExercise).length === initialBenchSetCount && saved?.exercises.some((item) => item.name === renamed);
    }, "active edits and save-as-template must persist without the removed entities");
    assertUniqueEntityIds(stored);

    await reloadAndWait(page);
    await page.locator('[data-action="set-tab"][data-tab="today"]').click();
    await expect(page.getByRole("heading", { name: NAMES.activeSession, exact: true })).toBeVisible();
    await page.locator('[data-action="resume-active-workout"]').first().click();
    await expect(page.locator(".workout-view")).toBeVisible();
    await expect(page.locator(`.exercise-card[aria-label="Exercise: ${renamed}"]`)).toHaveCount(1);
    await expect(page.locator('[data-action="exercise-name"]')).toHaveCount(0);
    expect(browserErrors, "active-edit lifecycle browser errors").toEqual([]);
  });

  test("cancel keeps an active workout first, then discards only that draft and preserves unrelated data across reload", async ({ page }) => {
    test.setTimeout(120_000);
    const browserErrors = collectBrowserErrors(page);
    await installFixture(page, buildActiveWorkoutLifecycleFixture());
    const before = await persistedData(page);

    const sessionMenu = page.locator(".session-dock-overflow");
    if (!await sessionMenu.evaluate((node) => node.open)) await sessionMenu.locator(":scope > summary").click();
    await expect(sessionMenu).toHaveAttribute("open", "");
    await sessionMenu.getByRole("button", { name: "Cancel workout" }).click();
    await expect(page.getByRole("dialog", { name: "Cancel this workout?" })).toBeVisible();
    await page.getByRole("button", { name: "Keep workout", exact: true }).click();
    await expect(page.getByRole("heading", { name: NAMES.activeSession, exact: true })).toBeVisible();
    expect((await persistedData(page)).sessions.some((item) => item.id === IDS.activeSession)).toBe(true);

    if (!await sessionMenu.evaluate((node) => node.open)) await sessionMenu.locator(":scope > summary").click();
    await expect(sessionMenu).toHaveAttribute("open", "");
    await sessionMenu.getByRole("button", { name: "Cancel workout" }).click();
    await page.locator('[data-action="confirm-cancel-workout"]').click();
    const after = await waitForPersisted(page, (data) => !data.sessions.some((item) => item.id === IDS.activeSession), "discard must remove the active session");
    expect(after.exercises.some((item) => item.sessionId === IDS.activeSession)).toBe(false);
    expect(after.sets.some((item) => [IDS.activeBenchExercise, IDS.activeRowExercise].includes(item.exerciseId))).toBe(false);
    expect(after.sessions.find((item) => item.id === IDS.historySession)).toEqual(before.sessions.find((item) => item.id === IDS.historySession));
    expect(after.templates.find((item) => item.id === IDS.controlTemplate)).toEqual(before.templates.find((item) => item.id === IDS.controlTemplate));

    await reloadAndWait(page);
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    expect((await persistedData(page)).sessions.filter((item) => item.id === IDS.historySession)).toHaveLength(1);
    expect(browserErrors, "cancel-workout lifecycle browser errors").toEqual([]);
  });

  test("set log/undo/skip, partial cancellation, and two routed submission attempts produce one durable effect", async ({ page }) => {
    test.setTimeout(150_000);
    const browserErrors = collectBrowserErrors(page);
    const fixture = buildActiveWorkoutLifecycleFixture();
    await installFixture(page, fixture);

    const first = page.locator(`[data-action="toggle-set"][data-set-id="${IDS.activeBenchSet1}"]`);
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "false");
    await page.locator(`#set-${IDS.activeRowSet2} .set-tools-disclosure > summary`).click();
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

    await expect(page.locator('[aria-label="Workout completion"]')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('.completed-summary[aria-label="Workout completion"]')).toContainText("Session logged");
    const afterFirst = await waitForPersisted(page, (data) => data.sessions.filter((item) => item.id === IDS.activeSession && item.submitted).length === 1, "the UI confirmation must persist one submitted session");
    await waitForSubmissionWrites(page);
    expect(await submissionProbe(page)).toMatchObject({
      attempts: [[IDS.activeSession]],
      returnedTypes: ["undefined"],
      analysisCalls: [IDS.activeSession],
      writesFailed: 0
    });
    expect(afterFirst.dataRevision, "the first routed submission must create exactly one data revision").toBe(Number(beforeSubmit.dataRevision) + 1);

    const secondRoute = await page.evaluate(() => {
      const beforeAttempts = window.__lifecycleSubmissionProbe.attempts.length;
      const duplicate = document.createElement("button");
      duplicate.type = "button";
      duplicate.dataset.action = "confirm-submit-workout";
      document.getElementById("root").appendChild(duplicate);
      duplicate.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      duplicate.remove();
      return {
        beforeAttempts,
        afterAttempts: window.__lifecycleSubmissionProbe.attempts.length,
        returnedAttempts: window.__lifecycleSubmissionProbe.returnedTypes.length,
        returnType: window.__lifecycleSubmissionProbe.returnedTypes.at(-1)
      };
    });
    expect(secondRoute, "the generic router must still invoke and return from the duplicate application-level submission attempt").toEqual({
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
    expect.soft(finalSession.workoutAnalysis).toMatchObject({
      contractVersion: "comprehensive-fitness-workout-grade/2.0.0",
      algorithmVersion: "actual-work-rubric/1.1.0",
      sourceSessionId: IDS.activeSession
    });
    expect.soft(finalSession.workoutAnalysis.reasons.length).toBeGreaterThanOrEqual(2);
    expect.soft(finalSession.workoutAnalysis.reasons.length).toBeLessThanOrEqual(3);
    expect.soft(Object.hasOwn(after, "recommendationHistory"), "submission must not recreate deleted recommendation-history state").toBe(false);
    expect.soft(Object.hasOwn(after, "manualOverrides"), "submission must not recreate deleted top-level override state").toBe(false);
    assertUniqueEntityIds(after);

    await reloadAndWait(page);
    await page.locator('[data-action="set-tab"][data-tab="progress"]').click();
    await expect(page.locator(`[data-action="open-session"][data-session-id="${IDS.activeSession}"]`)).toHaveCount(1);
    const reloaded = await persistedData(page);
    expect.soft(reloaded.dataRevision, "reload must preserve the single submission effect").toBe(Number(beforeSubmit.dataRevision) + 1);
    expect.soft(reloaded.sessions.filter((item) => item.id === IDS.activeSession)).toHaveLength(1);
    expect.soft(reloaded.sessions.find((item) => item.id === IDS.activeSession).workoutAnalysis).toEqual(firstSession.workoutAnalysis);
    expect.soft(Object.hasOwn(reloaded, "recommendationHistory")).toBe(false);
    expect.soft(Object.hasOwn(reloaded, "manualOverrides")).toBe(false);
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

  test("history edit save persists nested set changes, preserves the stored grade, creates no duplicates, and survives reload", async ({ page }) => {
    test.setTimeout(150_000);
    const browserErrors = collectBrowserErrors(page);
    const fixture = buildHistoryLifecycleFixture();
    const storedHistoricalGrade = {
      version: 1,
      grade: "B+",
      rationale: "Stored public synthetic historical grade."
    };
    fixture.sessions.find((item) => item.id === IDS.historySession).workoutAnalysis = structuredClone(storedHistoricalGrade);
    await installFixture(page, fixture);
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

    const after = await waitForPersisted(page, (data) => data.sessions.find((item) => item.id === IDS.historySession)?.title === EDITED_HISTORY_TITLE && data.sets.find((item) => item.id === IDS.historyBenchSet1)?.reps === 11, "saved history edits must persist while retaining the stored grade");
    expect(after.sessions.filter((item) => item.id === IDS.historySession)).toHaveLength(1);
    expect(after.exercises.filter((item) => item.sessionId === IDS.historySession)).toHaveLength(2);
    expect(after.sets.filter((item) => item.exerciseId === IDS.historyBenchExercise)).toHaveLength(2);
    expect(after.sets.find((item) => item.id === IDS.historyBenchSet1).reps).toBe(11);
    const savedAnalysis = after.sessions.find((item) => item.id === IDS.historySession).workoutAnalysis;
    expect(savedAnalysis).toEqual(storedHistoricalGrade);
    assertUniqueEntityIds(after);

    await reloadAndWait(page);
    await openProgressHistory(page);
    const card = page.locator(`[data-action="open-session"][data-session-id="${IDS.historySession}"]`);
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(EDITED_HISTORY_TITLE);
    await card.click();
    await expect(page.getByRole("heading", { name: EDITED_HISTORY_TITLE, exact: true })).toBeVisible();
    const editedSet = page.locator(`#set-${IDS.historyBenchSet1}`);
    await expect(editedSet).toContainText("11");
    await expect(editedSet).toContainText("145 lb");
    const reloaded = await persistedData(page);
    const reloadedSession = reloaded.sessions.find((item) => item.id === IDS.historySession);
    expect(reloaded.sets.find((item) => item.id === IDS.historyBenchSet1).reps).toBe(11);
    expect(reloadedSession.workoutAnalysis).toEqual(storedHistoricalGrade);
    expect(reloaded.sessions.filter((item) => item.id === IDS.historySession)).toHaveLength(1);
    await page.locator('[data-action="begin-history-edit"]').click();
    await page.locator("summary").filter({ hasText: "Workout details" }).click();
    await expect(page.locator(`[data-action="set-reps"][data-set-id="${IDS.historyBenchSet1}"]`)).toHaveValue("11");
    expect(browserErrors, "history-save lifecycle browser errors").toEqual([]);
  });

  test("the first Save Edits click after a numeric history field blur is not swallowed by rerender", async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = buildHistoryLifecycleFixture();
    const storedHistoricalGrade = {
      version: 1,
      grade: "B+",
      rationale: "Stored public synthetic historical grade."
    };
    fixture.sessions.find((item) => item.id === IDS.historySession).workoutAnalysis = structuredClone(storedHistoricalGrade);
    await installFixture(page, fixture);
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
      return set?.reps === 12 && JSON.stringify(analysis) === JSON.stringify(storedHistoricalGrade);
    }, "the first Save Edits confirmation must persist the numeric edit without rewriting its stored grade", 30_000);
    expect.soft(saved.sets.find((item) => item.id === IDS.historyBenchSet1).reps).toBe(12);
    expect.soft(saved.sessions.find((item) => item.id === IDS.historySession).workoutAnalysis).toEqual(storedHistoricalGrade);
    expect.soft(saved.dataRevision, "one real numeric edit must create exactly one logical revision despite input/change/focusout delivery").toBe(revisionBeforeEdit + 1);
    await expect.poll(() => page.evaluate(() => structuredClone(window.__historyFirstClickWriteProbe)), {
      message: "the explicit Save Edits confirmation must route exactly one durable app-data write",
      timeout: 12_000
    }).toEqual({ started: 1, completed: 1, failed: 0 });

    await reloadAndWait(page);
    await openProgressHistory(page);
    const card = page.locator(`[data-action="open-session"][data-session-id="${IDS.historySession}"]`);
    await expect(card).toHaveCount(1);
    await card.click();
    const editedSet = page.locator(`#set-${IDS.historyBenchSet1}`);
    await expect(editedSet).toContainText("12");
    await expect(editedSet).toContainText("145 lb");
    const reloaded = await persistedData(page);
    expect.soft(reloaded.sets.find((item) => item.id === IDS.historyBenchSet1).reps).toBe(12);
    expect.soft(reloaded.sessions.find((item) => item.id === IDS.historySession).workoutAnalysis).toEqual(storedHistoricalGrade);
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
    await expect.soft(page, "browser Back must not leave the edit surface before the user resolves the confirmation").toHaveURL(/#workout$/, { timeout: 1_000 });
    await expect.soft(page.locator('[data-action="session-title"]'), "the temporary edit must remain available while confirmation is unresolved").toHaveValue(temporaryTitle, { timeout: 1_000 });

    await reloadAndWait(page);
    const afterReload = await persistedData(page);
    expect.soft(afterReload.sessions.find((item) => item.id === IDS.historySession).title, "pagehide/reload must not save a temporary history edit without explicit Save Edits confirmation").toBe(NAMES.historySession);
    expect.soft(afterReload.sessions.find((item) => item.id === IDS.historySession), "the saved history session must otherwise remain unchanged").toEqual(original.sessions.find((item) => item.id === IDS.historySession));
    assertUniqueEntityIds(afterReload);
  });
});
