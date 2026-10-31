"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const {
  ACTIVE_SESSION_ID,
  ACTIVE_WORKOUT_TITLE,
  FIXED_NOW,
  STORAGE_KEY,
  buildProtectedSurfaceFixture
} = require("./fixtures/protected-surfaces.fixture");

function collectBrowserErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function captureState(page, testInfo, name) {
  if (process.env.CF_CAPTURE_QUIET_CONTROL !== "1") return;
  const outputDir = path.join(__dirname, "..", "..", "redesign", "kimi-progress-refresh", "screenshots", "final");
  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({ path: path.join(outputDir, `${testInfo.project.name}-${name}.png`), fullPage: false });
}

async function captureElement(locator, testInfo, name) {
  if (process.env.CF_CAPTURE_QUIET_CONTROL !== "1") return;
  const outputDir = path.join(__dirname, "..", "..", "redesign", "kimi-progress-refresh", "screenshots", "final");
  fs.mkdirSync(outputDir, { recursive: true });
  await locator.screenshot({ path: path.join(outputDir, `${testInfo.project.name}-${name}.png`) });
}

async function setSupportedViewport(page, testInfo) {
  await page.setViewportSize(testInfo.project.name === "desktop"
    ? { width: 1280, height: 900 }
    : { width: 390, height: 844 });
}

async function installFixture(page, fixture, hash = "#today") {
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
  await page.goto(`/${hash}`);
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
}

function withoutActiveSession() {
  const fixture = buildProtectedSurfaceFixture();
  const activeExerciseIds = new Set(fixture.exercises.filter((exercise) => exercise.sessionId === ACTIVE_SESSION_ID).map((exercise) => exercise.id));
  fixture.sessions = fixture.sessions.filter((session) => session.id !== ACTIVE_SESSION_ID);
  fixture.exercises = fixture.exercises.filter((exercise) => exercise.sessionId !== ACTIVE_SESSION_ID);
  fixture.sets = fixture.sets.filter((set) => !activeExerciseIds.has(set.exerciseId));
  return fixture;
}

function gradeTreatmentFixture() {
  const fixture = withoutActiveSession();
  const grades = [["A", 95], ["B", 85], ["C", 75], ["D", 65], ["F", 55]];
  fixture.sessions = fixture.sessions.slice(0, grades.length).map((session, index) => ({
    ...session,
    title: `Representative ${grades[index][0]} grade completed session`,
    workoutAnalysis: { ...session.workoutAnalysis, grade: grades[index][0], internalScore: grades[index][1] }
  }));
  const sessionIds = new Set(fixture.sessions.map((session) => session.id));
  fixture.exercises = fixture.exercises.filter((exercise) => sessionIds.has(exercise.sessionId));
  const exerciseIds = new Set(fixture.exercises.map((exercise) => exercise.id));
  fixture.sets = fixture.sets.filter((set) => exerciseIds.has(set.exerciseId));
  return fixture;
}

test("Quiet Control empty Today and both Progress modes use shared completed-session facts", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const browserErrors = collectBrowserErrors(page);
  await setSupportedViewport(page, testInfo);
  await installFixture(page, withoutActiveSession());

  await expect(page.getByRole("heading", { name: "Choose your workout", exact: true })).toBeVisible();
  await expect(page.getByText("Choose another workout", { exact: true })).toHaveCount(0);
  const rolling = page.locator(".rolling-hypertrophy-card");
  await expect(rolling).toBeVisible();
  await expect(rolling).toContainText("Rolling hypertrophy");
  await expect(rolling).toContainText("last 10 completed sessions");
  await expect(rolling.locator(".rolling-score")).toContainText("/100");
  await captureState(page, testInfo, "today-no-session");

  await rolling.click();
  await expect(page).toHaveURL(/progressMode=exercises/);
  await expect(page.getByRole("tab", { name: "Exercises", exact: true })).toHaveAttribute("aria-selected", "true");
  const search = page.getByRole("searchbox", { name: "Search exercises" });
  await expect(search).toBeVisible();
  const searchBox = await search.boundingBox();
  expect(searchBox.height).toBeLessThanOrEqual(50);
  await expect(page.locator(".progress-exercise-row")).toHaveCount(3);
  await expect(page.locator(".progress-exercise-row").first()).toContainText(/Hypertrophy|Latest|Best/);
  await captureState(page, testInfo, "progress-exercises");

  await page.getByRole("tab", { name: "Sessions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Completed sessions", exact: true })).toBeVisible();
  await expect(page.locator(".history-session-card")).toHaveCount(48);
  await expect(page.locator(".history-grade").first()).toBeVisible();
  expect(await page.locator(".history-month-heading").count()).toBeGreaterThan(1);
  await expect(page.locator(".history-contract")).toContainText("Every submitted session");
  await captureState(page, testInfo, "progress-sessions-and-grades");
  expect(browserErrors).toEqual([]);
});

test("Quiet Control active session preserves hierarchy, timer, replacement confirmation, and scoped history return", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const browserErrors = collectBrowserErrors(page);
  await setSupportedViewport(page, testInfo);
  await installFixture(page, buildProtectedSurfaceFixture());

  await expect(page.getByText("Choose another workout", { exact: true })).toBeVisible();
  await captureState(page, testInfo, "today-session-loaded");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  const header = page.locator(".active-session-header");
  await expect(header.locator("h1")).toHaveText(ACTIVE_WORKOUT_TITLE);
  await expect(header.locator(".active-session-ready")).toHaveText(/Ready/);
  await expect(page.getByText("In progress", { exact: true })).toHaveCount(0);
  await expect(page.locator(".active-rest-dock")).toHaveCount(0);
  await expect(page.locator(".current-workout-heading")).toBeVisible();
  await expect(page.getByText("Choose another workout", { exact: true })).toBeVisible();
  const dock = page.locator(".session-dock");
  const finish = dock.locator(".session-dock-finish");
  const dockBox = await dock.boundingBox();
  const finishBox = await finish.boundingBox();
  expect(finishBox.x + finishBox.width).toBeLessThanOrEqual(dockBox.x + dockBox.width + 0.5);
  await captureState(page, testInfo, "active-ready");

  const current = page.locator('.set-block[data-set-state="current"]').first();
  const future = page.locator('.set-block[data-set-state="future"]').first();
  await expect(current.locator('[data-action="toggle-set"]')).toBeEnabled();
  await expect(current.locator(".set-previous strong")).toContainText(/lb/);
  await expect(current.locator(".set-previous strong")).toContainText(/@/);
  await expect(future.locator(".inactive-check")).toBeDisabled();
  await expect(future.locator(".pending-previous")).toContainText("Previous");
  await expect(future.locator(".pending-previous")).toContainText(/lb/);
  await dock.evaluate((element) => { element.style.visibility = "hidden"; });
  await captureElement(future, testInfo, "upcoming-set-inactive");
  await dock.evaluate((element) => { element.style.visibility = ""; });

  const currentId = await current.getAttribute("id");
  await current.locator('[data-action="toggle-set"]').click();
  const completedRow = page.locator(`#${currentId}`);
  await expect(completedRow.locator('[data-set-mode="logged"]')).toBeVisible();
  await expect(completedRow).toHaveClass(/completed/);
  await expect(completedRow.locator(".check-button.checked")).toBeVisible();
  const currentExercise = completedRow.locator("xpath=ancestor::article[contains(@class,'exercise-card')]");
  await expect(currentExercise).not.toHaveClass(/exercise-complete/);
  await captureState(page, testInfo, "set-logged");

  const restStarter = page.locator('[data-action="start-timer"]').first();
  if (await restStarter.isVisible()) await restStarter.click();
  await expect(header.locator(".active-session-timer-status")).toBeVisible();
  await expect(header.locator("[data-timer-progress-label]")).toHaveText(/^\d+:\d{2}$/);
  await expect(page.locator(".workout-timer-slot .timer-bar")).toHaveCount(0);
  await captureState(page, testInfo, "active-rest-countdown");

  const exerciseLink = page.locator(".exercise-history-link").first();
  const exerciseName = (await exerciseLink.textContent()).trim();
  await exerciseLink.click();
  await expect(page.locator(".exercise-detail-view h1")).toHaveText(exerciseName);
  await expect(page.getByRole("button", { name: /Back to workout/ })).toBeVisible();
  await expect(page.locator(".exercise-record-card")).toBeVisible();
  await expect(page.getByText(/Completed workouts|Completed sessions/)).toHaveCount(0);
  await captureState(page, testInfo, "exercise-detail");
  await page.getByRole("button", { name: /Back to workout/ }).click();
  await expect(page.locator(".active-session-header h1")).toHaveText(ACTIVE_WORKOUT_TITLE);
  await expect(page.locator(".active-session-timer-status")).toBeVisible();

  await page.locator(".active-session-menu > summary").click();
  await page.getByRole("button", { name: "Back to Today", exact: true }).click();
  await page.locator(".choose-workout-action").click();
  await page.locator('.today-template-card[data-action="start-template"]').first().click();
  await expect(page.getByRole("dialog")).toContainText("Finish or discard this draft before starting");
  await page.locator('[data-action="discard-active-workout"]').click();
  await expect(page.getByRole("dialog", { name: "Replace this workout?" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Replace this workout?" })).toContainText("logged set");
  await expect(page.getByRole("dialog", { name: "Replace this workout?" })).toContainText("Replace it with");
  expect(browserErrors).toEqual([]);
});

test("representative completed-session grades preserve one accessible family treatment", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await setSupportedViewport(page, testInfo);
  await installFixture(page, gradeTreatmentFixture());
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Completed sessions", exact: true })).toBeVisible();
  await page.locator(".bottom-nav").evaluate((nav) => { nav.style.visibility = "hidden"; });
  const gradeFamilies = ["a", "b", "c", "d", "f"];
  for (const [index, grade] of gradeFamilies.entries()) {
    const card = page.locator(".history-session-card").nth(index);
    await expect(card.locator(`.history-grade.grade-${grade}`)).toBeVisible();
    await captureElement(card, testInfo, `grade-${grade}`);
  }
});
