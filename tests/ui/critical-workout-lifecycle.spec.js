"use strict";

const { test, expect } = require("@playwright/test");
const {
  FIXED_NOW,
  STORAGE_KEY,
  buildTemplateLifecycleFixture
} = require("./fixtures/template-workout-history.fixture");

const TEMPLATE_NAME = "Public Synthetic Critical Lifecycle";
const EXERCISE_NAME = "Barbell Bench Press";

function collectBrowserErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function installCleanSyntheticContext(page) {
  const fixture = buildTemplateLifecycleFixture();
  fixture.templates = [];
  fixture.settings.autoStartRestTimer = true;
  fixture.settings.timerSound = false;
  fixture.settings.timerNotifications = false;
  await page.addInitScript(({ fixedNow, storageKey, storedFixture }) => {
    localStorage.clear();
    sessionStorage.clear();
    const NativeDate = Date;
    const fixedEpoch = NativeDate.parse(fixedNow);
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixedEpoch])); }
      static now() { return fixedEpoch; }
    }
    globalThis.Date = FixedDate;
    localStorage.setItem(storageKey, JSON.stringify(storedFixture));
  }, { fixedNow: FIXED_NOW, storageKey: STORAGE_KEY, storedFixture: fixture });
  await page.goto("/");
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => String(prescriptionEvidenceStatus?.state || "loading")), {
    message: "public prescription evidence must be ready before the critical lifecycle starts",
    timeout: 45_000
  }).toBe("ready");
}

async function readIndexedData(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("comprehensive-fitness", 1);
    request.onerror = () => reject(request.error || new Error("Could not open lifecycle IndexedDB."));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("state", "readonly");
      const getRequest = transaction.objectStore("state").get("app-data");
      getRequest.onerror = () => reject(getRequest.error || new Error("Could not read lifecycle app data."));
      getRequest.onsuccess = () => resolve(getRequest.result?.value ?? null);
      transaction.oncomplete = () => database.close();
    };
  }));
}

async function persistedData(page) {
  const indexed = await readIndexedData(page);
  if (indexed) return indexed;
  return page.evaluate((storageKey) => {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
    return stored?.format === "comprehensive-fitness-local-fallback" ? stored.data : stored;
  }, STORAGE_KEY);
}

async function waitForPersisted(page, predicate, message, timeout = 20_000) {
  await expect.poll(async () => Boolean(predicate(await persistedData(page))), { message, timeout }).toBe(true);
  return persistedData(page);
}

async function openProgressView(page, view) {
  const progressTab = page.locator('[data-action="set-tab"][data-tab="progress"]');
  if (await progressTab.getAttribute("aria-current") !== "page") await progressTab.click();
  await page.locator(`[data-action="set-progress-view"][data-progress-view="${view}"]`).click();
  await expect(page.locator(`[data-action="set-progress-view"][data-progress-view="${view}"]`)).toHaveAttribute("aria-current", "page");
}

test("critical workout lifecycle remains coherent through submission, progress, reload, and unit conversion", async ({ page }) => {
  test.setTimeout(180_000);
  const browserErrors = collectBrowserErrors(page);
  await installCleanSyntheticContext(page);

  await page.locator('[data-action="set-tab"][data-tab="plan"]').click();
  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();
  await expect(page.locator(".template-card")).toHaveCount(0);
  await page.locator('[data-action="new-template"]').click();

  const templateCard = page.locator(".template-card").first();
  const templateName = templateCard.locator('[data-action="template-name"]');
  const templateId = await templateName.getAttribute("data-template-id");
  expect(templateId, "the UI-created template must receive a stable ID").toBeTruthy();
  await templateName.fill(TEMPLATE_NAME);
  await templateCard.locator('[data-action="toggle-template-editor"]').click();
  await templateCard.locator('[data-action="template-exercise-name"]').fill(EXERCISE_NAME);
  await templateCard.locator('[data-action="template-exercise-sets"]').fill("2");
  await templateCard.locator('[data-action="template-exercise-reps"]').fill("8");
  await templateCard.locator('[data-action="template-exercise-rpe"]').fill("8");
  await templateCard.locator('[data-action="template-exercise-rest"]').fill("90");
  await waitForPersisted(page, (stored) => {
    const template = stored?.templates?.find((item) => item.id === templateId);
    return template?.name === TEMPLATE_NAME
      && template.exercises?.length === 1
      && template.exercises[0].name === EXERCISE_NAME
      && template.exercises[0].sets === 2
      && template.exercises[0].restSeconds === 90;
  }, "the UI-created synthetic template must persist before it starts");

  await templateCard.locator(`[data-action="start-template"][data-template-id="${templateId}"]`).click();
  await expect(page.getByRole("dialog", { name: `Start ${TEMPLATE_NAME}?` })).toBeVisible();
  await page.locator('[data-action="continue-template-start"]').click();
  await expect(page.getByRole("dialog", { name: "Use your usual readiness?" })).toBeVisible();
  await page.locator('[data-action="use-usual-readiness"]').click();
  await expect(page.getByRole("heading", { name: TEMPLATE_NAME, exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("In progress", { exact: true })).toBeVisible();
  await expect(page.locator(".exercise-card")).toHaveCount(1);

  const active = await waitForPersisted(page, (stored) => stored?.sessions?.some((session) => session.templateId === templateId && session.workoutStarted && !session.submitted), "template start must persist one active workout");
  const activeSession = active.sessions.find((session) => session.templateId === templateId && session.workoutStarted && !session.submitted);
  const activeExercise = active.exercises.find((exercise) => exercise.sessionId === activeSession.id);
  expect(activeSession.readinessMode).toBe("usual");
  expect(activeExercise?.name).toBe(EXERCISE_NAME);

  const firstWorkingSet = page.locator(".exercise-card .set-block:not(.warmup), .exercise-card [id^=set-]:not(.warmup)").filter({
    has: page.locator('[data-action="toggle-set"]')
  }).first();
  const completion = firstWorkingSet.locator('[data-action="toggle-set"]');
  await completion.click();
  await expect(completion).toHaveAttribute("aria-pressed", "true");
  const timer = firstWorkingSet.locator(".timer-bar");
  await expect(timer, "completing an eligible set must start its rest timer").toBeVisible();
  await timer.locator("summary").click();
  await timer.getByRole("button", { name: "Pause timer" }).click();
  await expect(timer.getByRole("button", { name: "Resume timer" })).toBeVisible();
  await timer.getByRole("button", { name: "Resume timer" }).click();
  await timer.getByRole("button", { name: "Add 15 seconds" }).click();
  if (!await timer.evaluate((element) => element.open)) await timer.locator("summary").click();
  await timer.getByRole("button", { name: "Skip rest", exact: true }).click();
  await expect(firstWorkingSet.locator(".timer-bar")).toHaveCount(0);

  await page.locator('[data-action="request-submit-workout"]').click();
  await expect(page.getByText("Log this workout as completed?", { exact: true })).toBeVisible();
  await page.locator('[data-action="cancel-submit-workout"]').click();
  await expect(page.getByText("Log this workout as completed?", { exact: true })).toHaveCount(0);
  await expect(completion).toHaveAttribute("aria-pressed", "true");

  await page.locator('[data-action="request-submit-workout"]').click();
  await page.locator('[data-action="confirm-submit-workout"]').click();
  const summary = page.locator('.completed-summary[aria-label="Post-workout grade and analysis"]');
  await expect(summary).toBeVisible({ timeout: 45_000 });
  await expect(summary).toContainText("Workout logged");
  const submitted = await waitForPersisted(page, (stored) => stored?.sessions?.filter((session) => session.id === activeSession.id && session.submitted).length === 1, "confirmed submission must persist exactly one completed session");
  expect(submitted.sets.filter((set) => set.exerciseId === activeExercise.id && set.completed)).toHaveLength(1);

  await openProgressView(page, "history");
  const submittedCard = page.locator(`[data-action="open-session"][data-session-id="${activeSession.id}"]`);
  await expect(submittedCard).toHaveCount(1);
  await expect(submittedCard).toContainText(TEMPLATE_NAME);

  await openProgressView(page, "overview");
  await expect(page.locator(".dashboard-view")).toBeVisible();
  await expect(page.getByText("This week's coach", { exact: true })).toBeVisible();
  await expect(page.locator(".dashboard-summary-row")).toContainText("logged sessions");

  await openProgressView(page, "lifts");
  await expect(page.getByRole("combobox", { name: "Search or select exercise" })).toHaveValue(EXERCISE_NAME, { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Progress charts", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => String(prescriptionEvidenceStatus?.state || "loading")), { timeout: 45_000 }).toBe("ready");
  await openProgressView(page, "history");
  await expect(page.locator(`[data-action="open-session"][data-session-id="${activeSession.id}"]`), "the submitted session must survive reload").toHaveCount(1);

  const beforeUnitChange = await persistedData(page);
  const originalSet = beforeUnitChange.sets.find((set) => set.exerciseId === activeExercise.id && set.completed);
  expect(originalSet.weightUnit).toBe("lb");
  await page.locator('[data-action="toggle-unit"]').click();
  const kilograms = await waitForPersisted(page, (stored) => stored?.settings?.weightUnit === "kg" && stored.sets.find((set) => set.id === originalSet.id)?.weightUnit === "kg", "lb to kg conversion must persist coherently");
  const kilogramSet = kilograms.sets.find((set) => set.id === originalSet.id);
  expect(kilogramSet.weight).toBeCloseTo(originalSet.weight / 2.2046226218, 2);
  await expect(page.locator('[data-action="toggle-unit"]')).toHaveText("KG");

  await page.locator('[data-action="toggle-unit"]').click();
  const pounds = await waitForPersisted(page, (stored) => stored?.settings?.weightUnit === "lb" && stored.sets.find((set) => set.id === originalSet.id)?.weightUnit === "lb", "kg to lb round trip must persist coherently");
  expect(pounds.sets.find((set) => set.id === originalSet.id).weight).toBeCloseTo(originalSet.weight, 1);
  await page.reload();
  await expect(page.locator('[data-action="toggle-unit"]')).toHaveText("LB", { timeout: 45_000 });
  await openProgressView(page, "history");
  await expect(page.locator(`[data-action="open-session"][data-session-id="${activeSession.id}"]`)).toHaveCount(1);
  expect(browserErrors, "the complete critical lifecycle must not emit browser errors").toEqual([]);
});
