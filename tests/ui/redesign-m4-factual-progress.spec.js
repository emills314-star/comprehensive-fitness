"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const {
  FIXED_NOW,
  STORAGE_KEY,
  buildHistoryLifecycleFixture
} = require("./fixtures/template-workout-history.fixture");

const ARTIFACT_DIR = path.resolve(__dirname, "..", "..", "artifacts", "ui-audit", "m4");
const VARIANT = "Cambered Barbell Bench Press — Extra Long Heavy Competition Variant";

function populatedFixture() {
  const fixture = buildHistoryLifecycleFixture();
  const priorSession = structuredClone(fixture.sessions[0]);
  priorSession.id = "public-synthetic-m4-prior-session";
  priorSession.date = "2026-07-09";
  priorSession.completedAt = "2026-07-09";
  priorSession.title = "Public Synthetic Earlier Session";
  const priorExercise = structuredClone(fixture.exercises[0]);
  priorExercise.id = "public-synthetic-m4-prior-exercise";
  priorExercise.sessionId = priorSession.id;
  priorExercise.name = VARIANT;
  priorExercise.performanceExerciseId = "public_synthetic_cambered_heavy";
  const latestExercise = structuredClone(priorExercise);
  latestExercise.id = "public-synthetic-m4-latest-exercise";
  latestExercise.sessionId = fixture.sessions[0].id;
  const priorSet = structuredClone(fixture.sets[0]);
  priorSet.id = "public-synthetic-m4-prior-set";
  priorSet.exerciseId = priorExercise.id;
  priorSet.weight = 987.5;
  priorSet.reps = 12;
  priorSet.rpe = 7.5;
  priorSet.setType = "top";
  const latestSet = structuredClone(priorSet);
  latestSet.id = "public-synthetic-m4-latest-set";
  latestSet.exerciseId = latestExercise.id;
  latestSet.weight = 1234.5;
  latestSet.reps = 10;
  latestSet.rpe = 8.5;
  fixture.sessions = [priorSession, fixture.sessions[0]];
  fixture.exercises = [priorExercise, latestExercise];
  fixture.sets = [priorSet, latestSet];
  fixture.dataRevision += 1;
  return fixture;
}

async function installFixture(page, fixture) {
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
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
}

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test("M4 Progress exposes scoped exercise facts and separate completed sessions", async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, populatedFixture());

  await page.locator('[data-action="set-tab"][data-tab="progress"]').click();
  await page.waitForTimeout(250);
  await expect(page.getByRole("heading", { name: "Completed sessions" })).toBeVisible();
  await page.getByRole("tab", { name: "Exercises", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search exercises" });
  await search.fill(VARIANT);
  await page.locator('[data-action="open-progress-exercise"]').filter({ hasText: VARIANT }).click();

  await expect(page.locator(".exercise-detail-hero h1")).toHaveText(VARIANT);
  await expect(page.locator('[data-action="show-chart-point"]')).toHaveCount(2);
  await page.locator('[data-action="show-chart-point"]').last().click();
  const detail = page.locator(".chart-detail");
  await expect(detail).toContainText("Jul");
  await expect(detail).toContainText("1,234.5");
  await expect(detail).toContainText("10");
  await expect(detail).toContainText("8.5");
  await expect(detail).toContainText(/Top Set|top/i);
  await expect(detail).toContainText("Public Synthetic Logged Upper Session");
  await expect(page.getByText("Completed workouts", { exact: true })).toHaveCount(0);

  await expect(page.getByText(/weekly volume|hypertrophy|research status|confidence score|evidence matrix/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /overview|lifts|history/i })).toHaveCount(0);
  expect(consoleErrors.filter((message) => !/Failed to load resource: the server responded with a status of 404/i.test(message))).toEqual([]);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "m4-mobile-factual-progress-point.png"), fullPage: true });
});

test("M4 Progress has a stable empty state without deleted analysis controls", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = buildHistoryLifecycleFixture();
  fixture.sessions = [];
  fixture.exercises = [];
  fixture.sets = [];
  await installFixture(page, fixture);

  await page.locator('[data-action="set-tab"][data-tab="progress"]').click();
  await expect(page.getByRole("heading", { name: "Completed sessions" })).toBeVisible();
  await expect(page.getByText("Completed sessions will appear here.", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Exercises", exact: true }).click();
  await expect(page.getByText("No exercises match this search.", { exact: true })).toBeVisible();
  await expect(page.locator('[data-action="show-chart-point"], [data-action="dashboard-week"], [data-action="hypertrophy-window"]')).toHaveCount(0);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "m4-mobile-progress-empty.png"), fullPage: true });
});
