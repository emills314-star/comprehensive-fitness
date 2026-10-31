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
  await expect.poll(() => page.evaluate(() => Boolean(
    prescriptionEngine?.evidence?.research?.exerciseById?.has("ex_barbell_bench_press")
  )), {
    message: "the identity compatibility catalog must be ready before lifecycle checks run",
    timeout: 45_000
  }).toBe(true);
  return fixture;
}

async function openPrimaryTab(page, tabId) {
  if (tabId === "settings") {
    if (await page.locator(".settings-view").isVisible().catch(() => false)) return;
    const settingsTrigger = page.locator('[data-action="open-settings"]');
    if (await settingsTrigger.count()) await settingsTrigger.click();
    else await page.goto("/#settings");
    await expect(page).toHaveURL(/#settings$/);
    await expect(page.locator(".settings-view")).toBeVisible();
    return;
  }
  const target = page.locator(`[data-action="set-tab"][data-tab="${tabId}"]`);
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

test("Progress empty states do not render invented session or exercise history", async ({ page }) => {
  await installFixture(page, buildEmptyAnalyticsSettingsFixture());
  await openPrimaryTab(page, "progress");
  await expect(page.getByText("Completed sessions will appear here.", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Exercises", exact: true }).click();
  await expect(page.getByText("No exercises match this search.", { exact: true })).toBeVisible();
  await expect(page.locator(".chart-card")).toHaveCount(0);
  expect(await page.evaluate(() => exerciseCatalog().length)).toBe(0);
});

test("exercise search is case-insensitive and does not invent a lift on no result", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "progress");
  await page.getByRole("tab", { name: "Exercises", exact: true }).click();
  const input = page.getByRole("searchbox", { name: "Search exercises" });
  await input.fill("dUmBbElL bEnCh PrEsS");
  await expect(page.locator('[data-action="open-progress-exercise"]')).toHaveCount(1);
  await expect(page.locator('[data-action="open-progress-exercise"] strong')).toHaveText("Dumbbell Bench Press");
  const catalogIds = await page.evaluate(() => exerciseCatalog().map((exercise) => exercise.id));
  await input.fill("unlogged synthetic movement");
  await expect(page.getByText("No exercises match this search.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => exerciseCatalog().map((exercise) => exercise.id))).toEqual(catalogIds);
});

test("partial exercise search exposes all exact retained variants", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "progress");
  await page.getByRole("tab", { name: "Exercises", exact: true }).click();
  const input = page.getByRole("searchbox", { name: "Search exercises" });
  await input.fill("bEnCh");
  const suggestions = page.locator('[data-action="open-progress-exercise"]');
  await expect(suggestions).toHaveCount(3);
  expect((await suggestions.locator("strong").allTextContents()).sort()).toEqual([
    "Barbell Bench Press",
    "Close-Grip Bench Press",
    "Dumbbell Bench Press"
  ].sort());
});

test("Progress renders one factual performance chart and exposes recorded point details", async ({ page }) => {
  test.setTimeout(90_000);
  await installFixture(page);
  await openPrimaryTab(page, "progress");
  await page.getByRole("tab", { name: "Exercises", exact: true }).click();
  const input = page.getByRole("searchbox", { name: "Search exercises" });
  await input.fill("dUmBbElL bEnCh PrEsS");
  await page.locator('[data-action="open-progress-exercise"]').evaluate((button) => button.click());
  await expect(page.getByRole("heading", { name: "Dumbbell Bench Press", exact: true })).toBeVisible();

  const chart = page.locator('.chart-card[data-chart-key="performance"]');
  await expect(chart).toBeVisible();
  const points = chart.locator('[data-action="show-chart-point"]');
  expect(await points.count()).toBeGreaterThan(0);
  await expect(chart.locator('[data-action="show-chart-point"][tabindex="0"]')).toHaveCount(1);
  await points.last().focus();
  if (await points.count() > 1) {
    await points.last().press("Home");
    await expect(points.first()).toBeFocused();
    await points.first().press("End");
    await expect(points.last()).toBeFocused();
  }
  await expect(points.last()).toHaveAttribute("aria-label", /Dumbbell Bench Press|estimated|performance/i);
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

test("Settings changes the load display preference without rewriting stored loads or retaining legacy program defaults", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "settings");

  const obsoleteKeys = ["trainingGoal", "trainingGoalSource", "trainingGoalDisclosure", "nutritionPhase", "experienceLevel", "returningAfterGap", "theme", "colorPackage", "workoutCompletionSound", "interactionVibration", "restCompleteLockScreenNotifications", "autoScrollNextSet"];
  const normalizedState = await page.evaluate((keys) => ({
    obsoleteSettings: keys.filter((key) => Object.prototype.hasOwnProperty.call(data.settings, key)),
    obsoleteCollections: ["manualOverrides", "personalEvidencePackage"].filter((key) => Object.prototype.hasOwnProperty.call(data, key))
  }), obsoleteKeys);
  expect(normalizedState).toEqual({ obsoleteSettings: [], obsoleteCollections: [] });
  await expect(page.getByText("Training defaults", { exact: true })).toHaveCount(0);
  for (const action of ["training-goal", "nutrition-phase", "experience-level", "returning-after-gap"]) {
    await expect(page.locator(`[data-action="${action}"]`), `${action} must remain absent from the approved Settings surface`).toHaveCount(0);
  }
  for (const action of ["theme-mode", "color-package", "workout-completion-sound", "interaction-vibration", "auto-scroll-next"]) {
    await expect(page.locator(`[data-action="${action}"]`), `${action} must remain absent from minimized Settings`).toHaveCount(0);
  }
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect(page.locator("html")).not.toHaveAttribute("data-color-package");
  await page.locator('[data-action="weight-unit"][value="kg"]').check();
  await openSettingsGroup(page, "Rest timer and alerts");
  await setNumericSetting(page, "default-rest-seconds", 150);

  const inMemory = await page.evaluate(() => ({
    settings: structuredClone(data.settings),
    firstSet: structuredClone(data.sets[0])
  }));
  expect(inMemory.settings).toMatchObject({
    weightUnit: "kg",
    defaultRestSeconds: 150
  });
  for (const key of obsoleteKeys) expect(inMemory.settings).not.toHaveProperty(key);
  expect(inMemory.firstSet).toMatchObject({ weight: 220, weightUnit: "lb", targetWeight: 220 });

  await expect.poll(async () => (await persistedAppData(page))?.settings?.defaultRestSeconds, { timeout: 10_000 }).toBe(150);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
  await openPrimaryTab(page, "settings");

  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect(page.locator("html")).not.toHaveAttribute("data-color-package");
  await expect(page.locator('[data-action="weight-unit"][value="kg"]')).toBeChecked();
  await expect(page.getByText("Training defaults", { exact: true })).toHaveCount(0);
  const restored = await page.evaluate(() => ({ settings: structuredClone(data.settings), firstSet: structuredClone(data.sets[0]) }));
  expect(restored.settings).toMatchObject(inMemory.settings);
  expect(restored.firstSet).toMatchObject({ weight: 220, weightUnit: "lb", targetWeight: 220 });
});

test("contextual Settings default-rest control enforces its import-safe domain and survives reload", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "settings");
  await openSettingsGroup(page, "Rest timer and alerts");

  const control = page.locator('[data-action="default-rest-seconds"]');
  await control.fill("9999");
  await control.dispatchEvent("change");

  await expect(page.locator('[data-action="default-rest-seconds"]')).toHaveValue("900");
  expect(await page.evaluate(() => data.settings.defaultRestSeconds)).toBe(900);
  await expect.poll(async () => (await persistedAppData(page))?.settings?.defaultRestSeconds, { timeout: 10_000 }).toBe(900);

  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
  await openPrimaryTab(page, "settings");
  await openSettingsGroup(page, "Rest timer and alerts");
  await expect(page.locator('[data-action="default-rest-seconds"]')).toHaveValue("900");
});

test("the fixed light Signal Garden semantic styling is not user-configurable", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "settings");
  await expect(page.getByText("Appearance and units", { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-action="theme-mode"], [data-action="color-package"]')).toHaveCount(0);
  expect(await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      background: style.getPropertyValue("--bg").trim(),
      action: style.getPropertyValue("--action").trim(),
      success: style.getPropertyValue("--success").trim(),
      danger: style.getPropertyValue("--red").trim()
    };
  })).toEqual({ background: "#fff", action: "#176fd1", success: "#168a54", danger: "#c83f35" });
});

test("persistence exhaustion keeps the in-memory setting and immediately surfaces recovery guidance", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "settings");

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
    await openSettingsGroup(page, "Rest timer and alerts");
    await setNumericSetting(page, "default-rest-seconds", 105);
    await expect.poll(() => page.evaluate(() => ({
      persistenceFailuresObserved:
        globalThis.__CF_PERSISTENCE_FAILURE_AUDIT__.appDataPutAborts > 0
        && globalThis.__CF_PERSISTENCE_FAILURE_AUDIT__.localQuotaFailures > 0,
      defaultRestSeconds: data.settings.defaultRestSeconds,
      settingsMessage
    })), { timeout: 10_000 }).toEqual({
      persistenceFailuresObserved: true,
      defaultRestSeconds: 105,
      settingsMessage: "Storage is full on this device. Export a backup, clear old data, or import a smaller file."
    });
    await expect.soft(page.getByText("Storage is full on this device. Export a backup, clear old data, or import a smaller file.", { exact: true }), "The recovery message must render immediately when both persistence layers reject the write").toBeVisible();
  } finally {
    await page.evaluate(() => globalThis.__CF_RESTORE_PERSISTENCE_METHODS__?.()).catch(() => undefined);
  }
});

test("Clear All Local App Data supports cancel, exact dual confirmation, defaults, and durable reload clearing", async ({ page }) => {
  await installFixture(page);
  await openPrimaryTab(page, "settings");
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
    weightUnit: "lb",
    defaultRestSeconds: 90
  };
  const cleared = await page.evaluate(() => ({
    sessions: data.sessions.length,
    exercises: data.exercises.length,
    sets: data.sets.length,
    templates: data.templates.length,
    weightUnit: data.settings.weightUnit,
    defaultRestSeconds: data.settings.defaultRestSeconds
  }));
  expect(cleared).toEqual(expectedDefaults);

  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
  const reloaded = await page.evaluate(() => ({
    sessions: data.sessions.length,
    exercises: data.exercises.length,
    sets: data.sets.length,
    templates: data.templates.length,
    weightUnit: data.settings.weightUnit,
    defaultRestSeconds: data.settings.defaultRestSeconds
  }));
  expect(reloaded).toEqual(expectedDefaults);
});

test("the registered service worker serves the public app shell while the isolated context is offline", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
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
    await expect(page.locator(".offline-banner")).toContainText("Background notifications wait");
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
  await openPrimaryTab(page, "settings");
  await openSettingsGroup(page, "Data and backup");

  const dataGroup = page.locator("details.settings-group").filter({ has: page.locator("summary", { hasText: "Data and backup" }) });
  await expect(dataGroup).toContainText("Workout history, routines, settings, readiness, and imports stay in this browser");
  await expect(dataGroup).toContainText("Export is the recoverable copy");
  await expect(dataGroup).not.toContainText(/cloud copy|cloud-copy|workout upload/i);
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
