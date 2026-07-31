"use strict";

const { test, expect } = require("@playwright/test");
const {
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
  const destination = ({ lift: "today", dashboard: "progress", charts: "progress", data: "more" })[tabId] || tabId;
  const target = primaryTab(page, destination);
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

test("Progress empty state asks for a completed workout without rendering invented history", async ({ page }) => {
  await installFixture(page, buildEmptyAnalyticsSettingsFixture());
  await openPrimaryTab(page, "charts");

  const empty = page.getByText("Complete a workout to add exercise history.", { exact: true });
  await expect(empty).toContainText("Complete a workout");
  await expect(page.locator(".charts-view .chart-control-panel, .charts-view .chart-card")).toHaveCount(0);
  expect(await page.evaluate(() => exerciseCatalog().length)).toBe(0);
});

test("chart search is case-insensitive and retains the selected lift on no result", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "charts");
  await waitForCharts(page);
  let input = page.getByRole("combobox", { name: "Search or select exercise" });
  await expect(input).toHaveValue("Barbell Bench Press");
  await input.fill("dUmBbElL bEnCh PrEsS");
  await input.press("Enter");
  await waitForCharts(page);
  await expect(input).toHaveValue("Dumbbell Bench Press");

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
  await expect(input).toHaveValue("Dumbbell Bench Press");
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

test("Progress renders one factual performance chart and exposes recorded point details", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "charts");
  await waitForCharts(page);

  const input = page.getByRole("combobox", { name: "Search or select exercise" });
  await input.fill("dUmBbElL bEnCh PrEsS");
  await input.press("Enter");
  await waitForCharts(page);

  await expect(page.locator(".chart-viewing-summary")).toContainText("Dumbbell Bench Press");
  await expect(page.locator(".primary-analysis-chart")).toContainText("Performance trend");
  await expect(page.locator('[data-chart-key="e1rm"], [data-chart-key="volume"]')).toHaveCount(0);

  const chart = page.locator('.chart-card[data-chart-key="performance"]');
  await expect(chart).toBeVisible();
  await expect(chart.locator("header strong")).toContainText("Best completed");
  const points = chart.locator('[data-action="show-chart-point"]');
  expect(await points.count()).toBeGreaterThan(0);
  await expect(points.last()).toHaveAttribute("aria-label", /Dumbbell Bench Press|Best completed/i);
  await points.last().click();
  const detail = chart.locator(".chart-detail");
  await expect(detail).toContainText("Dumbbell Bench Press");
  await expect(detail).toContainText("load");
  await expect(detail).toContainText("reps");
  await expect(detail).toContainText("RPE");
  await expect(detail).toContainText("role");
  await expect(detail.locator(".chart-session-group")).toHaveCount(1);
  await detail.getByRole("button", { name: "Close chart detail" }).click();
  await expect(chart.locator(".chart-detail")).toHaveCount(0);
  await points.last().focus();
  await points.last().press("Enter");
  await expect(chart.locator(".chart-detail")).toBeVisible();
  await chart.getByRole("button", { name: "Close chart detail" }).click();
  await expect(points.last()).toBeFocused();
});

test("Settings converts real loads and persists profile, timer, readiness, unit, theme, and color-package changes across reload", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "data");

  await page.locator('[data-action="theme-mode"][value="dark"]').check();
  await page.locator('[data-action="color-package"][value="heritage-atlas"]').check();
  await page.locator('[data-action="weight-unit"][value="kg"]').check();
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
    colorPackage: "heritage-atlas",
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
  await expect(page.locator("html")).toHaveAttribute("data-color-package", "heritage-atlas");
  await expect(page.locator('[data-action="theme-mode"][value="dark"]')).toBeChecked();
  await expect(page.locator('[data-action="color-package"][value="heritage-atlas"]')).toBeChecked();
  await expect(page.locator('[data-action="weight-unit"][value="kg"]')).toBeChecked();
  const restored = await page.evaluate(() => ({ settings: structuredClone(data.settings), firstSet: structuredClone(data.sets[0]) }));
  expect(restored.settings).toMatchObject(inMemory.settings);
  expect(restored.firstSet).toMatchObject({ weight: 99.79, weightUnit: "kg", targetWeight: 99.79 });
});

test("More numeric settings enforce their import-safe domains and survive reload", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "data");
  await openSettingsGroup(page, "Rest timer and alerts");

  const control = page.locator('[data-action="default-rest-seconds"]');
  await control.fill("9999");
  await control.dispatchEvent("change");

  await expect(page.locator('[data-action="default-rest-seconds"]')).toHaveValue("900");
  expect(await page.evaluate(() => data.settings.defaultRestSeconds)).toBe(900);
  await expect.poll(async () => (await persistedAppData(page))?.settings?.defaultRestSeconds, { timeout: 10_000 }).toBe(900);

  const baselineCases = [
    ["baseline-sleep-hours", "15", "14", "sleepHours"],
    ["baseline-sleep-quality", "0", "1", "sleepQuality"],
    ["baseline-hrv", "-4", "0", "hrv"],
    ["baseline-resting-hr", "-2", "0", "restingHr"],
    ["baseline-soreness", "9", "5", "soreness"],
    ["baseline-band", "99", "20", "band"]
  ];
  for (const [action, attempted, expected, field] of baselineCases) {
    await openSettingsGroup(page, "Readiness baseline");
    const baselineControl = page.locator(`[data-action="${action}"]`);
    await baselineControl.fill(attempted);
    await baselineControl.dispatchEvent("change");
    await expect(page.locator(`[data-action="${action}"]`)).toHaveValue(expected);
    expect(await page.evaluate((key) => data.settings.readinessBaseline[key], field)).toBe(expected);
  }
  await expect.poll(async () => (await persistedAppData(page))?.settings?.readinessBaseline?.band, { timeout: 10_000 }).toBe("20");

  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
  await openPrimaryTab(page, "data");
  await openSettingsGroup(page, "Rest timer and alerts");
  await expect(page.locator('[data-action="default-rest-seconds"]')).toHaveValue("900");
  await openSettingsGroup(page, "Readiness baseline");
  await expect(page.locator('[data-action="baseline-sleep-hours"]')).toHaveValue("14");
  await expect(page.locator('[data-action="baseline-sleep-quality"]')).toHaveValue("1");
  await expect(page.locator('[data-action="baseline-hrv"]')).toHaveValue("0");
  await expect(page.locator('[data-action="baseline-resting-hr"]')).toHaveValue("0");
  await expect(page.locator('[data-action="baseline-soreness"]')).toHaveValue("5");
  await expect(page.locator('[data-action="baseline-band"]')).toHaveValue("20");
});

test("all ten color packages are selectable and apply distinct semantic colors", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "data");
  await page.locator('[data-action="theme-mode"][value="light"]').check();
  const selectors = page.locator('[data-action="color-package"]');
  const packageIds = await selectors.evaluateAll((options) => options.map((option) => option.value));
  expect(packageIds).toEqual([
    "heritage-atlas", "signal-garden", "alpine-ledger", "training-hall", "harbor-pulse",
    "prairie-electric", "redwood-circuit", "mediterranean-set", "modern-primary", "night-stadium"
  ]);
  const applied = new Set();
  for (const packageId of packageIds) {
    await page.locator(`[data-action="color-package"][value="${packageId}"]`).check();
    await expect(page.locator("html")).toHaveAttribute("data-color-package", packageId);
    applied.add(await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return [style.getPropertyValue("--bg"), style.getPropertyValue("--action"), style.getPropertyValue("--success"), style.getPropertyValue("--red")].join("|");
    }));
  }
  expect(applied.size).toBe(10);
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
    await page.locator('[data-action="theme-mode"][value="dark"]').check();
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
  const keepButton = dialog.getByRole("button", { name: "Keep My Data" });
  await expect(keepButton, "The destructive sheet must focus its safe action first").toBeFocused();
  await keepButton.click();
  await expect(dialog).toHaveCount(0);
  await expect(clearButton, "Closing the destructive sheet must restore its trigger").toBeFocused();
  expect(await page.evaluate(() => ({ sessions: data.sessions.length, templates: data.templates.length }))).toEqual({ sessions: 14, templates: 1 });

  await openSettingsGroup(page, "Danger Zone");
  await clearButton.click();
  dialog = page.getByRole("dialog", { name: "Clear All Local App Data?" });
  await expect(dialog.getByRole("button", { name: "Keep My Data" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Export first" })).toBeFocused();
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
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(page.locator(".offline-banner")).toContainText("Workout logging and local changes continue");
    await expect(page.locator(".offline-banner")).toContainText("cloud-copy operations wait");
    expect(await page.evaluate(() => ({ online: navigator.onLine, controlled: Boolean(navigator.serviceWorker.controller) }))).toEqual({ online: false, controlled: true });
  } finally {
    if (offlineEnabled) await context.setOffline(false).catch(() => undefined);
    await context.close();
  }
});

test("Settings states the verified privacy and recoverability boundaries without fabricated backup facts", async ({ page }) => {
  await page.addInitScript(() => {
    if (navigator.storage) Object.defineProperty(navigator.storage, "persisted", { configurable: true, value: async () => true });
  });
  await installFixture(page);
  await openPrimaryTab(page, "data");
  await openSettingsGroup(page, "Data and backup");

  const dataGroup = page.locator("details.settings-group").filter({ has: page.locator("summary", { hasText: "Data and backup" }) });
  await expect(dataGroup).toContainText("active, unsubmitted workout");
  await expect(dataGroup).toContainText("every associated exercise and set object");
  await expect(dataGroup).toContainText("Cloud copy is not a backup");
  await expect(dataGroup).toContainText("no cloud-history or restore endpoint");
  await expect(dataGroup).toContainText("Granted by this browser");
  await expect(dataGroup).not.toContainText(/Jul \d|days ago|sessions since|MB/i);

  await openSettingsGroup(page, "Rest timer and alerts");
  const alertsGroup = page.locator("details.settings-group").filter({ has: page.locator("summary", { hasText: "Rest timer and alerts" }) });
  await expect(alertsGroup).toContainText("Private changes the visible notification body only");
  await expect(alertsGroup).toContainText("exercise name");
  await expect(alertsGroup).toContainText("server-side timer record");

  for (const [status, expected] of [["not-granted", "Not granted"], ["unsupported", "does not expose"]]) {
    await page.evaluate((nextStatus) => {
      storagePersistenceStatus = nextStatus;
      render();
    }, status);
    await openSettingsGroup(page, "Data and backup");
    await expect(page.locator(".storage-persistence-fact")).toContainText(expected);
  }
});
