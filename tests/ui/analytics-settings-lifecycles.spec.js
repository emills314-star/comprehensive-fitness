"use strict";

const { test, expect } = require("@playwright/test");
const {
  ANALYTICS_EXPECTATIONS,
  FIXED_NOW,
  STORAGE_KEY,
  buildAnalyticsSettingsFixture,
  buildEmptyAnalyticsSettingsFixture
} = require("./fixtures/analytics-settings.fixture");

const FIXTURE_MARKER = "__cf_analytics_settings_fixture_installed__";

async function installFixture(page, fixture = buildAnalyticsSettingsFixture()) {
  await page.addInitScript(({ fixedNow, marker, storageKey, storedFixture }) => {
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
    if (sessionStorage.getItem(marker) !== "1") {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(storageKey, JSON.stringify(storedFixture));
      sessionStorage.setItem(marker, "1");
    }
  }, { fixedNow: FIXED_NOW, marker: FIXTURE_MARKER, storageKey: STORAGE_KEY, storedFixture: fixture });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => String(prescriptionEvidenceStatus?.state || "loading")), {
    timeout: 45_000
  }).not.toBe("loading");
  return fixture;
}

function primaryTab(page, tabId) {
  return page.locator(`[data-action="set-tab"][data-tab="${tabId}"]`);
}

async function openPrimaryTab(page, tabId) {
  const target = primaryTab(page, tabId);
  await target.click();
  await expect(target).toHaveAttribute("aria-current", "page");
}

async function waitForCharts(page) {
  await expect(page.locator(".chart-recalculating")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator(".chart-control-panel")).toBeVisible({ timeout: 15_000 });
}

async function setNumericSetting(page, action, value) {
  const control = page.locator(`[data-action="${action}"]`);
  await control.fill(String(value));
  await control.dispatchEvent("change");
  await expect(page.locator(`[data-action="${action}"]`)).toHaveValue(String(value));
}

async function openSettingsGroup(page, label) {
  const summary = page.locator("details.settings-group > summary").filter({ hasText: label });
  await expect(summary).toHaveCount(1);
  if (!await summary.evaluate((element) => element.parentElement.open)) await summary.click();
}

async function persistedAppData(page) {
  return page.evaluate(async () => readIndexedValue("app-data"));
}

test("Charts empty state explains the qualifying action without rendering invented analytics", async ({ page }) => {
  await installFixture(page, buildEmptyAnalyticsSettingsFixture());
  await openPrimaryTab(page, "charts");

  const empty = page.locator(".charts-view .empty-state");
  await expect(empty).toContainText("Log an exercise");
  await expect(empty).toContainText("progression charts and next-step guidance");
  await expect(page.locator(".charts-view .chart-control-panel, .charts-view .chart-card, .charts-view .chart-metric-row")).toHaveCount(0);
  expect(await page.evaluate(() => exerciseCatalog().length)).toBe(0);
});

test("chart search is case-insensitive and retains the selected lift on no result", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "charts");
  await waitForCharts(page);
  await expect(page.getByRole("heading", { name: "Barbell Bench Press", exact: true })).toBeVisible();

  let input = page.getByRole("combobox", { name: "Search or select exercise" });
  await input.fill("dUmBbElL bEnCh PrEsS");
  await input.press("Enter");
  await waitForCharts(page);
  await expect(page.getByRole("heading", { name: "Dumbbell Bench Press", exact: true })).toBeVisible();

  const beforeUnknownQuery = await page.evaluate(() => ({
    selectedExerciseId,
    recentChartExerciseIds: [...recentChartExerciseIds],
    catalogIds: exerciseCatalog().map((exercise) => exercise.id)
  }));

  input = page.getByRole("combobox", { name: "Search or select exercise" });
  const unknownQuery = "unlogged synthetic movement";
  await input.fill(unknownQuery);
  await expect(page.locator(".exercise-search-empty")).toContainText("No matching logged exercise");
  await input.press("Enter");
  await expect(input).toHaveValue("Dumbbell Bench Press");
  await expect(page.locator(".exercise-search-error")).toHaveText("No logged exercise matched. The previous lift remains selected.");
  await expect(page.getByRole("heading", { name: "Dumbbell Bench Press", exact: true })).toBeVisible();
  const afterUnknownQuery = await page.evaluate((query) => ({
    selectedExerciseId,
    recentChartExerciseIds: [...recentChartExerciseIds],
    catalogIds: exerciseCatalog().map((exercise) => exercise.id),
    matchingQueryIds: matchingChartExercises(query).map((exercise) => exercise.id)
  }), unknownQuery);
  expect.soft(afterUnknownQuery.selectedExerciseId, "an unknown query must preserve the prior canonical selection").toBe(beforeUnknownQuery.selectedExerciseId);
  expect.soft(afterUnknownQuery.recentChartExerciseIds, "an unknown query must not add a fabricated custom identifier to the recent-selection history").toEqual(beforeUnknownQuery.recentChartExerciseIds);
  expect.soft(afterUnknownQuery.catalogIds, "an unknown query must not add a fabricated custom exercise to the logged catalog").toEqual(beforeUnknownQuery.catalogIds);
  expect.soft(afterUnknownQuery.matchingQueryIds, "free-text chart matching must return no result instead of treating a reporting-only custom fallback as a logged exercise").toEqual([]);
});

test("partial chart search ranks all matches and promotes the most recently selected lift", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "charts");
  await waitForCharts(page);

  let input = page.getByRole("combobox", { name: "Search or select exercise" });
  await input.fill("bEnCh");
  const suggestions = page.locator('[data-action="select-chart-exercise"]');
  await expect(suggestions).toHaveCount(3);
  expect(await suggestions.locator("strong").allTextContents()).toEqual([
    "Barbell Bench Press",
    "Close-Grip Bench Press",
    "Dumbbell Bench Press"
  ]);

  await suggestions.filter({ hasText: "Dumbbell Bench Press" }).click();
  await waitForCharts(page);
  input = page.getByRole("combobox", { name: "Search or select exercise" });
  await input.fill("BeNcH");
  await expect(suggestions).toHaveCount(3);
  await expect(suggestions.first().locator("strong")).toHaveText("Dumbbell Bench Press");
});

test("Charts changes six-week windows with exact dates and metrics, then opens and closes the selected point", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "charts");
  await waitForCharts(page);

  const input = page.getByRole("combobox", { name: "Search or select exercise" });
  await input.fill("dUmBbElL bEnCh PrEsS");
  await input.press("Enter");
  await waitForCharts(page);

  const summary = page.locator(".chart-viewing-summary");
  await expect(summary).toContainText(new RegExp(`${ANALYTICS_EXPECTATIONS.latestWindow.start}.*${ANALYTICS_EXPECTATIONS.latestWindow.end}`));
  await expect(summary).toContainText(`${ANALYTICS_EXPECTATIONS.latestWindow.qualifyingWeeks} qualifying`);
  const metrics = page.locator(".chart-metric-row > div");
  await expect(metrics.nth(0).locator("strong")).toHaveText(ANALYTICS_EXPECTATIONS.dumbbellLatest.e1rm);
  await expect(metrics.nth(1).locator("strong")).toHaveText(ANALYTICS_EXPECTATIONS.dumbbellLatest.volume);
  await expect(metrics.nth(2).locator("strong")).toHaveText(String(ANALYTICS_EXPECTATIONS.latestWindow.setCount));

  await page.locator(".analysis-period-menu summary").click();
  const priorPeriod = page.locator('[data-action="select-chart-period"]').nth(1);
  await expect(priorPeriod).toContainText("Previous qualifying period 1");
  await priorPeriod.click();
  await waitForCharts(page);

  await expect(summary).toContainText(new RegExp(`${ANALYTICS_EXPECTATIONS.previousWindow.start}.*${ANALYTICS_EXPECTATIONS.previousWindow.end}`));
  await expect(metrics.nth(0).locator("strong")).toHaveText(ANALYTICS_EXPECTATIONS.dumbbellPrevious.e1rm);
  await expect(metrics.nth(1).locator("strong")).toHaveText(ANALYTICS_EXPECTATIONS.dumbbellPrevious.volume);
  await expect(metrics.nth(2).locator("strong")).toHaveText(String(ANALYTICS_EXPECTATIONS.previousWindow.setCount));

  const e1rmChart = page.locator('.chart-card[data-chart-key="e1rm"]');
  const points = e1rmChart.locator('[data-action="show-chart-point"]');
  await expect(points).toHaveCount(6);
  await expect(points.last()).toHaveAttribute("aria-label", new RegExp(ANALYTICS_EXPECTATIONS.dumbbellPrevious.pointDate));
  await points.last().click();
  const detail = e1rmChart.locator(".chart-detail");
  await expect.soft(detail, "The opened point must use the date represented by the activated historical SVG point").toContainText(ANALYTICS_EXPECTATIONS.dumbbellPrevious.pointDate);
  await expect(detail).toContainText("Dumbbell Bench Press");
  await detail.getByRole("button", { name: "Close chart detail" }).click();
  await expect(e1rmChart.locator(".chart-detail")).toHaveCount(0);
});

test("guided planning honors equipment, muscle scope, partial search, no results, viability, and template creation", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, buildEmptyAnalyticsSettingsFixture());
  await openPrimaryTab(page, "plan");
  await page.getByRole("button", { name: "Plan Your Mesocycle" }).click();
  await page.getByRole("button", { name: "Start Planning" }).click();

  await setNumericSetting(page, "mesocycle-training-days", 2);
  const allEquipment = page.locator('[data-action="toggle-mesocycle-equipment"][data-value="all"]');
  const dumbbells = page.locator('[data-action="toggle-mesocycle-equipment"][data-value="dumbbell"]');
  await dumbbells.click();
  await expect(allEquipment).toHaveAttribute("aria-pressed", "false");
  await expect(dumbbells).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => data.settings.availableEquipment)).toEqual(["dumbbell"]);
  await allEquipment.click();
  await expect(allEquipment).toHaveAttribute("aria-pressed", "true");
  await expect(dumbbells).toHaveAttribute("aria-pressed", "false");

  const scopeInputs = page.locator('[data-action="mesocycle-muscle-scope"]');
  const scopeCount = await scopeInputs.count();
  expect(scopeCount).toBeGreaterThan(1);
  for (let index = 0; index < scopeCount; index += 1) {
    const scope = scopeInputs.nth(index);
    if (await scope.getAttribute("value") !== "chest") await scope.uncheck();
  }
  await expect(page.locator('[data-action="mesocycle-muscle-scope"][value="chest"]')).toBeChecked();
  await page.locator('[data-action="create-guided-draft"]').click();
  await expect(page.locator(".guided-day")).toHaveCount(2);

  async function addFiveBenchPressSets(dayIndex) {
    const days = page.locator(".guided-day");
    const day = days.nth(dayIndex);
    if (!await day.locator('[data-action="open-guided-exercise-browser"]').isVisible()) {
      await day.locator('[data-action="toggle-guided-day"]').click();
    }
    await day.locator('[data-action="open-guided-exercise-browser"]').click();
    const search = page.locator('[data-action="guided-exercise-search"]');
    await search.fill("no such public synthetic exercise");
    await search.dispatchEvent("change");
    await expect(page.locator(".exercise-browser-card")).toHaveCount(0);
    await search.fill("bEnCh");
    await search.dispatchEvent("change");
    const cards = page.locator(".exercise-browser-card");
    expect(await cards.count()).toBeGreaterThan(0);
    const names = await cards.locator("h3").allTextContents();
    expect(names.every((name) => /bench/i.test(name))).toBe(true);
    await cards.first().locator('[data-action="select-guided-exercise"]:not([disabled])').click();
    const pending = page.locator("[data-guided-configuration]");
    await expect(pending).toBeVisible();
    const output = pending.locator("output");
    while (Number((await output.textContent()).match(/\d+/)?.[0] || 0) < 5) {
      await pending.getByRole("button", { name: "Add one planned working set" }).click();
    }
    await pending.locator('[data-action="confirm-guided-exercise"]').click();
    await expect(page.locator("[data-guided-configuration]")).toHaveCount(0);
    await page.locator('[data-action="close-guided-exercise-browser"]').click();
  }

  await addFiveBenchPressSets(0);
  await addFiveBenchPressSets(1);
  await page.locator('[data-action="check-guided-viability"]').click();
  await expect(page.getByText("Viability Check", { exact: true })).toBeVisible();
  await expect(page.locator(".finding.blocking")).toHaveCount(0);
  const reviewCreation = page.locator('[data-action="open-guided-generation-review"]');
  await expect(reviewCreation).toBeEnabled();
  await reviewCreation.click();
  await expect(page.getByText(/2 linked templates will preserve/)).toBeVisible();
  await page.locator('[data-action="create-guided-templates"]').click();
  await expect(page.getByText("Mesocycle Completed", { exact: true })).toBeVisible();
  await expect(page.locator('[data-action="start-first-mesocycle-template"]')).toBeEnabled();
  expect(await page.evaluate(() => data.templates.length)).toBe(2);
});

test("Settings converts real loads and persists profile, timer, readiness, unit, and theme changes across reload", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "data");

  await page.getByLabel("Theme").selectOption("dark");
  await page.getByLabel("Weight unit").selectOption("kg");
  await openSettingsGroup(page, "Training defaults");
  await page.locator('[data-action="training-goal"]').selectOption("strength");
  await openSettingsGroup(page, "Training defaults");
  await page.locator('[data-action="nutrition-phase"]').selectOption("surplus");
  await openSettingsGroup(page, "Training defaults");
  await page.locator('[data-action="experience-level"]').selectOption("advanced");
  await openSettingsGroup(page, "Training defaults");
  await page.locator('[data-action="returning-after-gap"]').selectOption("true");
  await openSettingsGroup(page, "Rest timer and alerts");
  await setNumericSetting(page, "default-rest-seconds", 150);
  await openSettingsGroup(page, "Readiness baseline");
  await setNumericSetting(page, "baseline-sleep-hours", 8);
  await openSettingsGroup(page, "Readiness baseline");
  await setNumericSetting(page, "baseline-sleep-quality", 5);
  await openSettingsGroup(page, "Readiness baseline");
  await setNumericSetting(page, "baseline-hrv", 62);
  await openSettingsGroup(page, "Readiness baseline");
  await setNumericSetting(page, "baseline-resting-hr", 55);
  await openSettingsGroup(page, "Readiness baseline");
  await setNumericSetting(page, "baseline-soreness", 1);
  await openSettingsGroup(page, "Readiness baseline");
  await setNumericSetting(page, "baseline-band", 10);

  const inMemory = await page.evaluate(() => ({
    settings: structuredClone(data.settings),
    firstSet: structuredClone(data.sets[0])
  }));
  expect(inMemory.settings).toMatchObject({
    theme: "dark",
    weightUnit: "kg",
    trainingGoal: "strength",
    nutritionPhase: "surplus",
    experienceLevel: "advanced",
    returningAfterGap: true,
    defaultRestSeconds: 150,
    readinessBaseline: { sleepHours: "8", sleepQuality: "5", hrv: "62", restingHr: "55", soreness: "1", band: "10" }
  });
  expect(inMemory.firstSet).toMatchObject({ weight: 99.79, weightUnit: "kg", targetWeight: 99.79 });

  await expect.poll(async () => (await persistedAppData(page))?.settings?.readinessBaseline?.band, { timeout: 10_000 }).toBe("10");
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
  await openPrimaryTab(page, "data");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("Theme")).toHaveValue("dark");
  await expect(page.getByLabel("Weight unit")).toHaveValue("kg");
  const restored = await page.evaluate(() => ({ settings: structuredClone(data.settings), firstSet: structuredClone(data.sets[0]) }));
  expect(restored.settings).toMatchObject(inMemory.settings);
  expect(restored.firstSet).toMatchObject({ weight: 99.79, weightUnit: "kg", targetWeight: 99.79 });
});

test("persistence exhaustion keeps the in-memory setting and immediately surfaces recovery guidance", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "data");

  await page.evaluate((storageKey) => {
    const audit = { appDataPutAborts: 0, localQuotaFailures: 0 };
    const nativePut = IDBObjectStore.prototype.put;
    const nativeSetItem = Storage.prototype.setItem;
    globalThis.__CF_PERSISTENCE_FAILURE_AUDIT__ = audit;
    globalThis.__CF_RESTORE_PERSISTENCE_METHODS__ = () => {
      IDBObjectStore.prototype.put = nativePut;
      Storage.prototype.setItem = nativeSetItem;
    };
    IDBObjectStore.prototype.put = function instrumentedPut(value, ...args) {
      if (value?.key === "app-data") {
        audit.appDataPutAborts += 1;
        const request = nativePut.call(this, value, ...args);
        this.transaction.abort();
        return request;
      }
      return nativePut.call(this, value, ...args);
    };
    Storage.prototype.setItem = function instrumentedSetItem(key, value) {
      if (this === localStorage && key === storageKey) {
        audit.localQuotaFailures += 1;
        throw new DOMException("Synthetic public fixture quota exhaustion", "QuotaExceededError");
      }
      return nativeSetItem.call(this, key, value);
    };
  }, STORAGE_KEY);

  try {
    await page.getByLabel("Theme").selectOption("dark");
    await expect.poll(() => page.evaluate(() => ({
      ...globalThis.__CF_PERSISTENCE_FAILURE_AUDIT__,
      theme: data.settings.theme,
      settingsMessage
    })), { timeout: 10_000 }).toEqual({
      appDataPutAborts: 1,
      localQuotaFailures: 1,
      theme: "dark",
      settingsMessage: "Storage is full on this device. Export a backup, clear old data, or import a smaller file."
    });
    await expect.soft(page.getByText("Storage is full on this device. Export a backup, clear old data, or import a smaller file.", { exact: true }), "The recovery message must render immediately when both persistence layers reject the write").toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  } finally {
    await page.evaluate(() => globalThis.__CF_RESTORE_PERSISTENCE_METHODS__?.()).catch(() => undefined);
  }
});

test("Clear All Local App Data supports cancel, exact dual confirmation, defaults, and durable reload clearing", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "data");
  await openSettingsGroup(page, "Danger Zone");
  const clearButton = page.getByRole("button", { name: /Clear All Local App Data$/ });
  await clearButton.click();
  let dialog = page.getByRole("dialog", { name: "Clear All Local App Data?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep My Data" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => ({ sessions: data.sessions.length, templates: data.templates.length }))).toEqual({ sessions: 14, templates: 1 });

  await openSettingsGroup(page, "Danger Zone");
  await clearButton.click();
  dialog = page.getByRole("dialog", { name: "Clear All Local App Data?" });
  const acknowledge = dialog.getByRole("checkbox", { name: /I understand/ });
  const phrase = dialog.getByRole("textbox", { name: "Type CLEAR to confirm local data deletion" });
  const confirm = dialog.getByRole("button", { name: "Permanently Clear Local Data" });
  await expect(confirm).toBeDisabled();
  await acknowledge.check();
  await expect(confirm).toBeDisabled();
  await phrase.fill("clear");
  await expect(confirm).toBeDisabled();
  await phrase.fill("CLEAR");
  await expect(confirm).toBeEnabled();
  await acknowledge.uncheck();
  await expect(confirm).toBeDisabled();
  await acknowledge.check();
  await expect(confirm).toBeEnabled();

  await page.evaluate(() => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => null } }) }
    });
  });
  await confirm.click();
  await expect(page.getByText("Local app data cleared.", { exact: true })).toBeVisible({ timeout: 15_000 });
  const expectedDefaults = {
    sessions: 1,
    exercises: 0,
    sets: 0,
    templates: 0,
    mesocycles: 0,
    theme: "light",
    weightUnit: "lb",
    trainingGoal: "",
    nutritionPhase: "",
    experienceLevel: "",
    returningAfterGap: null,
    defaultRestSeconds: 90,
    readinessBaseline: { sleepHours: 7.5, sleepQuality: 4, hrv: "", restingHr: "", soreness: 2, band: 8 }
  };
  const cleared = await page.evaluate(() => ({
    sessions: data.sessions.length,
    exercises: data.exercises.length,
    sets: data.sets.length,
    templates: data.templates.length,
    mesocycles: data.mesocycles.length,
    theme: data.settings.theme,
    weightUnit: data.settings.weightUnit,
    trainingGoal: data.settings.trainingGoal,
    nutritionPhase: data.settings.nutritionPhase,
    experienceLevel: data.settings.experienceLevel,
    returningAfterGap: data.settings.returningAfterGap,
    defaultRestSeconds: data.settings.defaultRestSeconds,
    readinessBaseline: structuredClone(data.settings.readinessBaseline)
  }));
  expect(cleared).toEqual(expectedDefaults);

  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
  const reloaded = await page.evaluate(() => ({
    sessions: data.sessions.length,
    exercises: data.exercises.length,
    sets: data.sets.length,
    templates: data.templates.length,
    mesocycles: data.mesocycles.length,
    theme: data.settings.theme,
    weightUnit: data.settings.weightUnit,
    trainingGoal: data.settings.trainingGoal,
    nutritionPhase: data.settings.nutritionPhase,
    experienceLevel: data.settings.experienceLevel,
    returningAfterGap: data.settings.returningAfterGap,
    defaultRestSeconds: data.settings.defaultRestSeconds,
    readinessBaseline: structuredClone(data.settings.readinessBaseline)
  }));
  expect(reloaded).toEqual(expectedDefaults);
});

test("the registered service worker serves the public app shell while the isolated context is offline", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, serviceWorkers: "allow" });
  const page = await context.newPage();
  let offlineEnabled = false;
  try {
    const fixture = buildEmptyAnalyticsSettingsFixture();
    await context.addInitScript(({ fixedNow, storageKey, storedFixture }) => {
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
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
    await expect.poll(async () => {
      try {
        return await page.evaluate(async () => {
          if (!("serviceWorker" in navigator)) return { supported: false, active: false, controlled: false, cache: false };
          const registration = await navigator.serviceWorker.ready;
          const keys = await caches.keys();
          return {
            supported: true,
            active: registration.active?.state === "activated",
            controlled: Boolean(navigator.serviceWorker.controller),
            cache: keys.some((key) => key.startsWith("comprehensive-fitness-pwa-"))
          };
        });
      } catch (error) {
        if (/execution context was destroyed|navigation/i.test(String(error?.message || error))) {
          return { supported: true, active: false, controlled: false, cache: false };
        }
        throw error;
      }
    }, { timeout: 45_000 }).toEqual({ supported: true, active: true, controlled: true, cache: true });

    await context.setOffline(true);
    offlineEnabled = true;
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Program overview", exact: true })).toBeVisible();
    expect(await page.evaluate(() => ({ online: navigator.onLine, controlled: Boolean(navigator.serviceWorker.controller) }))).toEqual({ online: false, controlled: true });
  } finally {
    if (offlineEnabled) await context.setOffline(false).catch(() => undefined);
    await context.close();
  }
});
