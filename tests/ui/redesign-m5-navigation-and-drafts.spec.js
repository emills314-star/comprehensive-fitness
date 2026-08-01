"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const {
  FIXED_NOW,
  IDS,
  STORAGE_KEY,
  buildActiveWorkoutLifecycleFixture,
  buildTemplateLifecycleFixture
} = require("./fixtures/template-workout-history.fixture");

const ARTIFACT_DIR = path.resolve(__dirname, "..", "..", "artifacts", "ui-audit", "m5");
const ALTERNATE_TEMPLATE_ID = "public-synthetic-m5-alternate-template";
const ALTERNATE_TEMPLATE_NAME = "Public Synthetic M5 Alternate Workout";

function fixtureWithAlternate({ active = false } = {}) {
  const fixture = active ? buildActiveWorkoutLifecycleFixture() : buildTemplateLifecycleFixture();
  const alternate = structuredClone(fixture.templates[0]);
  alternate.id = ALTERNATE_TEMPLATE_ID;
  alternate.name = ALTERNATE_TEMPLATE_NAME;
  alternate.createdAt = "2026-07-02T12:00:00.000Z";
  alternate.updatedAt = "2026-07-02T12:00:00.000Z";
  alternate.exercises = alternate.exercises.map((exercise, index) => ({
    ...exercise,
    id: `public-synthetic-m5-alternate-exercise-${index + 1}`,
    name: index === 0
      ? "Very Long Cambered Barbell Bench Press Heavy Competition Variant"
      : exercise.name
  }));
  fixture.templates.push(alternate);
  if (active) {
    const activeSession = fixture.sessions.find((session) => session.id === IDS.activeSession);
    activeSession.templateId = IDS.controlTemplate;
  }
  return fixture;
}

async function installFixture(page, fixture) {
  await page.setViewportSize({ width: 390, height: 844 });
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
  await page.goto("/#today");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
}

async function activeDraftIds(page) {
  return page.evaluate(() => data.sessions
    .filter((session) => !isSessionSubmitted(session) && sessionHasStarted(session))
    .map((session) => session.id));
}

async function revealAlternatePicker(page) {
  const picker = page.locator(".today-template-strip");
  if (await picker.count() && !await picker.evaluate((element) => element.open)) {
    await picker.locator("summary").click();
  }
}

async function openAlternateConflict(page) {
  await revealAlternatePicker(page);
  const alternate = page.locator(`[data-action="start-template"][data-template-id="${ALTERNATE_TEMPLATE_ID}"]`);
  await expect(alternate).toBeVisible();
  await alternate.click();
  const conflict = page.getByRole("dialog");
  await expect(conflict).toBeVisible();
  return conflict;
}

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test("M5 exposes only Today and Progress persistently while routines and Settings return contextually", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, fixtureWithAlternate());

  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  const destinations = navigation.locator('[data-action="set-tab"]');
  await expect(destinations).toHaveCount(2);
  await expect(destinations.nth(0)).toHaveAttribute("data-tab", "today");
  await expect(destinations.nth(1)).toHaveAttribute("data-tab", "progress");
  await expect(navigation.getByRole("button", { name: /Plan|More|Routines|Settings/ })).toHaveCount(0);

  await page.locator('[data-action="open-routines"]').click();
  await expect(page).toHaveURL(/#routines$/);
  await expect(page.locator('[data-action="close-secondary-context"]')).toHaveAccessibleName("Back to Today");
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "m5-mobile-contextual-routines.png"),
    fullPage: true
  });
  await page.goBack();
  await expect(page).toHaveURL(/#today$/);
  await expect(page.getByRole("heading", { name: /Today|Expected workout/i })).toBeVisible();

  await page.locator('[data-action="open-settings"]').click();
  await expect(page).toHaveURL(/#settings$/);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "m5-mobile-contextual-settings.png"),
    fullPage: true
  });
  await page.locator('[data-action="close-secondary-context"]').click();
  await expect(page).toHaveURL(/#today$/);
  await expect(destinations).toHaveCount(2);

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "m5-mobile-two-destination-today.png"),
    fullPage: true
  });
});

test("M5 Start opens one full-screen active logger directly and browser Back returns to Resume", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, fixtureWithAlternate());

  await page.locator('[data-action="start-next-template"]').click();
  await expect(page).toHaveURL(/#workout$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Public Synthetic Upper Lifecycle", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  await expect(page.locator('[data-action="close-workout-context"]')).toHaveAccessibleName("Back to Today");
  expect(await activeDraftIds(page)).toHaveLength(1);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "m5-mobile-direct-full-screen-logger.png"),
    fullPage: true
  });

  await page.goBack();
  await expect(page).toHaveURL(/#today$/);
  await expect(page.locator('[data-action="resume-active-workout"]')).toHaveAccessibleName("Resume");
  expect(await activeDraftIds(page)).toHaveLength(1);

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "m5-mobile-today-resume.png"),
    fullPage: true
  });
});

test("M5 optional readiness is secondary, single-step, and available during the workout", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, fixtureWithAlternate());

  await page.locator('[data-action="log-template-readiness"]').click();
  const readiness = page.getByRole("dialog", { name: "What is different today?", exact: true });
  await expect(readiness).toBeVisible();
  await expect(readiness.locator(".readiness-review-sheet")).toHaveCount(0);
  await readiness.getByRole("radio", { name: "Unusual", exact: true }).check();
  await readiness.getByRole("checkbox", { name: "Pain or injury", exact: true }).check();
  await readiness.getByLabel("Affected area", { exact: true }).selectOption({ label: "Back" });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "m5-mobile-optional-readiness.png"),
    fullPage: true
  });

  await readiness.locator('[data-action="start-workout-with-readiness"]').click();
  await expect(page).toHaveURL(/#workout$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => activeDraftIds(page)).toHaveLength(1);
  const recovery = await page.evaluate(() => activeWorkoutSession()?.recovery);
  expect(recovery).toMatchObject({ soreness: 3, pain: true, affectedMuscle: "Back" });

  await page.locator('[data-action="session-menu"]').click();
  await expect(page.locator('[data-action="log-workout-readiness"]')).toHaveAccessibleName("Log readiness");
  await page.locator('[data-action="log-workout-readiness"]').click();
  const activeReadiness = page.getByRole("dialog", { name: "What is different today?", exact: true });
  await activeReadiness.getByRole("radio", { name: "Very unusual", exact: true }).check();
  await activeReadiness.locator('[data-action="save-workout-readiness"]').click();
  await expect.poll(() => page.evaluate(() => activeWorkoutSession()?.recovery?.soreness)).toBe(5);
});

test("M5 active-draft conflict offers exactly Resume, Finish, or Discard without creating a second draft", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, fixtureWithAlternate({ active: true }));
  const before = await activeDraftIds(page);
  expect(before).toEqual([IDS.activeSession]);

  const conflict = await openAlternateConflict(page);
  const actions = conflict.locator("button");
  await expect(actions).toHaveCount(3);
  await expect(conflict.locator('[data-action="resume-active-workout"]')).toHaveAccessibleName("Resume");
  await expect(conflict.locator('[data-action="finish-active-workout"]')).toHaveAccessibleName("Finish");
  await expect(conflict.locator('[data-action="discard-active-workout"]')).toHaveAccessibleName("Discard");
  await expect(conflict.getByRole("button", { name: /start|later|browse|cancel/i })).toHaveCount(0);
  expect(await activeDraftIds(page)).toEqual(before);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "m5-mobile-active-draft-conflict.png"),
    fullPage: true
  });

  await conflict.locator('[data-action="resume-active-workout"]').click();
  await expect(page).toHaveURL(/#workout$/);
  await expect(page.getByRole("heading", { name: "Public Synthetic Active Upper Session", exact: true })).toBeVisible();
  expect(await activeDraftIds(page)).toEqual(before);
});

test("M5 Discard keeps the active draft until concise confirmation and never overlaps drafts", async ({ page }) => {
  test.setTimeout(120_000);
  await installFixture(page, fixtureWithAlternate({ active: true }));

  const conflict = await openAlternateConflict(page);
  await conflict.locator('[data-action="discard-active-workout"]').click();
  const confirmation = page.getByRole("dialog");
  await expect(confirmation).toBeVisible();
  await expect(confirmation.locator("button")).toHaveCount(2);
  await expect(confirmation.locator('[data-action="keep-workout"]')).toHaveAccessibleName("Keep workout");
  await expect(confirmation.locator('[data-action="confirm-cancel-workout"]')).toHaveAccessibleName("Discard workout");
  expect(await activeDraftIds(page)).toEqual([IDS.activeSession]);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "m5-mobile-discard-confirmation.png"),
    fullPage: true
  });

  await confirmation.locator('[data-action="keep-workout"]').click();
  expect(await activeDraftIds(page)).toEqual([IDS.activeSession]);

  const reopened = await openAlternateConflict(page);
  await reopened.locator('[data-action="discard-active-workout"]').click();
  await page.locator('[data-action="confirm-cancel-workout"]').click();
  await expect.poll(() => activeDraftIds(page)).toHaveLength(0);
  await expect(page).toHaveURL(/#today$/);

  await revealAlternatePicker(page);
  await page.locator(`[data-action="start-template"][data-template-id="${ALTERNATE_TEMPLATE_ID}"]`).click();
  await expect.poll(() => activeDraftIds(page)).toHaveLength(1);
  expect(await activeDraftIds(page)).not.toContain(IDS.activeSession);
  await expect(page).toHaveURL(/#workout$/);
  await expect(page.getByRole("heading", { name: ALTERNATE_TEMPLATE_NAME, exact: true })).toBeVisible();

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "m5-mobile-discard-starts-requested-workout.png"),
    fullPage: true
  });
});
