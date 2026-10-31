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
  await expect.poll(() => page.evaluate(() => Boolean(
    prescriptionEngine?.evidence?.research?.exerciseById?.has("ex_barbell_bench_press")
  )), {
    message: "the identity compatibility catalog must be ready before the critical lifecycle starts",
    timeout: 45_000
  }).toBe(true);
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

async function openProgress(page) {
  const progressTab = page.locator('[data-action="set-tab"][data-tab="progress"]');
  if (await progressTab.getAttribute("aria-current") !== "page") await progressTab.click();
  await expect(progressTab).toHaveAttribute("aria-current", "page");
}

test("workout completion renders one concise grade result without achievement analytics", async ({ page }) => {
  test.setTimeout(90_000);
  const browserErrors = collectBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await installCleanSyntheticContext(page);

  await page.evaluate(() => {
    const session = data.sessions[0];
    const exercise = data.exercises.find((item) => item.sessionId === session.id);
    exercise.name = "Cambered Barbell Bench Press — Extra Long Heavy Competition Variant";
    session.workoutAnalysis = {
      contractVersion: "comprehensive-fitness-workout-grade/2.0.0",
      algorithmVersion: "actual-work-rubric/1.0.0",
      letter: "A",
      reasons: [
        { code: "valid_work", text: "Recorded work was complete and valid." },
        { code: "effort_coherent", text: "Recorded effort was coherent with the completed work." }
      ],
      sourceSessionId: session.id,
      resolvedActionDecisionIds: [],
      createdAt: "2026-07-16T15:00:00.000Z"
    };
    document.querySelector("main.app-main").innerHTML = renderCompletedWorkoutSummary(session);
  });

  const summary = page.locator('.completed-summary[aria-label="Workout completion"]');
  await expect(summary).toBeVisible();
  await expect(summary.locator(".workout-grade-mark")).toHaveText("A");
  await expect(summary.locator(".workout-grade-version")).toContainText("actual-work-rubric/1.0.0");
  await expect(summary.locator(".grade-reasons li")).toHaveCount(2);
  expect(await summary.locator(".workout-highlight").count()).toBeLessThanOrEqual(3);
  await expect(summary.locator('[data-action="close-completed-summary"]')).toHaveText("Done");
  await expect(summary.locator('[data-action="open-completion-progress"]')).toHaveText("Progress");
  await expect(summary.locator(".workout-achievements, .workout-achievement, [data-action='toggle-achievement-detail']")).toHaveCount(0);
  await expect(summary).not.toContainText(/plan complete|target precision|the session, diffed|confidence|category score|adherence/i);
  const geometry = await summary.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    smallestAction: Math.min(...[...element.querySelectorAll("button")].map((button) => button.getBoundingClientRect().height))
  }));
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.smallestAction).toBeGreaterThanOrEqual(44);
  expect(browserErrors).toEqual([]);
});

test("critical workout lifecycle remains coherent through submission, progress, reload, and unit conversion", async ({ page }) => {
  test.setTimeout(180_000);
  const browserErrors = collectBrowserErrors(page);
  await installCleanSyntheticContext(page);

  await page.getByRole("button", { name: "Routines", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Routines", exact: true })).toBeVisible();
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
  await templateCard.locator('[data-action="template-exercise-rep-min"]').fill("8");
  await templateCard.locator('[data-action="template-exercise-rep-max"]').fill("8");
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
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: TEMPLATE_NAME, exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".active-session-ready")).toHaveText("Ready");
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
  await expect(firstWorkingSet.locator('[data-set-mode="current"]')).toHaveCount(1);
  await completion.click();
  await expect(completion).toHaveAttribute("aria-pressed", "true");
  await expect(firstWorkingSet.locator('[data-set-mode="current"]')).toHaveCount(0);
  await expect(firstWorkingSet.locator('[data-set-mode="logged"]')).toHaveCount(1);
  await expect(firstWorkingSet).toHaveClass(/completed/);
  await expect(page.locator('[data-session-dock-progress]')).toHaveText("1 of 2 sets");
  const timer = page.locator(".active-session-header .timer-bar");
  await expect(timer, "completing an eligible set must start its rest timer").toBeVisible();
  await expect(firstWorkingSet.locator(".timer-bar"), "the M1 rest strip must not be nested inside a logged set").toHaveCount(0);
  await page.locator('[data-action="toggle-timer"]').click();
  await expect(page.locator('[data-action="toggle-timer"]')).toHaveText("Resume");
  await page.locator('[data-action="toggle-timer"]').click();
  await page.locator('[data-action="adjust-timer"][data-seconds="15"]').click();
  await page.locator('[data-action="skip-timer"]').click();
  await expect(page.locator(".active-session-header .timer-bar")).toHaveCount(0);
  await expect(page.locator(".active-session-ready")).toHaveText("Ready");

  await page.locator('[data-action="request-submit-workout"]').click();
  await expect(page.getByText("Log this workout as completed?", { exact: true })).toBeVisible();
  await page.locator('[data-action="cancel-submit-workout"]').click();
  await expect(page.getByText("Log this workout as completed?", { exact: true })).toHaveCount(0);
  await expect(completion).toHaveAttribute("aria-pressed", "true");

  await page.locator('[data-action="request-submit-workout"]').click();
  await page.locator('[data-action="confirm-submit-workout"]').click();
  const summary = page.locator('.completed-summary[aria-label="Workout completion"]');
  await expect(summary).toBeVisible({ timeout: 45_000 });
  await expect(summary).toContainText("Session logged");
  await expect(page.locator(".session-dock, .session-dock-submitted, .session-dock-finish")).toHaveCount(0);
  const submitted = await waitForPersisted(page, (stored) => stored?.sessions?.filter((session) => session.id === activeSession.id && session.submitted).length === 1, "confirmed submission must persist exactly one completed session");
  expect(submitted.sets.filter((set) => set.exerciseId === activeExercise.id && set.completed)).toHaveLength(1);
  await page.locator('[data-action="close-completed-summary"]').click();
  await expect(page.locator(".session-dock")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

  await openProgress(page);
  const submittedCard = page.locator(`[data-action="open-session"][data-session-id="${activeSession.id}"]`);
  await expect(submittedCard).toHaveCount(1);
  await expect(submittedCard).toContainText(TEMPLATE_NAME);

  await page.getByRole("tab", { name: "Exercises", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search exercises" });
  await search.fill(EXERCISE_NAME);
  await page.locator('[data-action="open-progress-exercise"]').click();
  await expect(page.locator(".exercise-detail-hero h1")).toHaveText(EXERCISE_NAME);
  await expect(page.locator('.chart-card[data-chart-key="performance"]')).toBeVisible();
  await expect(page.getByText("Completed workouts", { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await openProgress(page);
  if (await page.locator(".exercise-detail-view").count()) await page.locator('[data-action="close-progress-exercise"]').click();
  await page.getByRole("tab", { name: "Sessions", exact: true }).click();
  await expect(page.locator(`[data-action="open-session"][data-session-id="${activeSession.id}"]`), "the submitted session must survive reload").toHaveCount(1);

  const beforeUnitChange = await persistedData(page);
  const originalSet = beforeUnitChange.sets.find((set) => set.exerciseId === activeExercise.id && set.completed);
  const originalSetBytes = JSON.stringify(originalSet);
  expect(originalSet.weightUnit).toBe("lb");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "App settings.", exact: true })).toBeVisible();
  await page.locator('[data-action="weight-unit"][value="kg"]').check();
  const kilograms = await waitForPersisted(page, (stored) => stored?.settings?.weightUnit === "kg", "the kilogram display preference must persist");
  const kilogramSet = kilograms.sets.find((set) => set.id === originalSet.id);
  expect(JSON.stringify(kilogramSet)).toBe(originalSetBytes);
  await expect(page.locator('[data-action="weight-unit"][value="kg"]')).toBeChecked();

  await page.locator('[data-action="weight-unit"][value="lb"]').check();
  const pounds = await waitForPersisted(page, (stored) => stored?.settings?.weightUnit === "lb", "the pound display preference must persist");
  expect(JSON.stringify(pounds.sets.find((set) => set.id === originalSet.id))).toBe(originalSetBytes);
  await page.reload();
  await expect(page.locator('[data-action="weight-unit"][value="lb"]')).toBeChecked({ timeout: 45_000 });
  await openProgress(page);
  await expect(page.locator(`[data-action="open-session"][data-session-id="${activeSession.id}"]`)).toHaveCount(1);
  expect(browserErrors, "the complete critical lifecycle must not emit browser errors").toEqual([]);
});
