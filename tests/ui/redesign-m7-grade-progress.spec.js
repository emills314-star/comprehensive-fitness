"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const {
  FIXED_NOW,
  STORAGE_KEY,
  buildActiveWorkoutLifecycleFixture,
  buildHistoryLifecycleFixture
} = require("./fixtures/template-workout-history.fixture");

const ARTIFACT_DIR = path.resolve(__dirname, "..", "..", "artifacts", "ui-audit", "m7");
const LONG_VARIANT = "Cambered Barbell Bench Press — Extra Long Heavy Competition Variant";
const LIGHT_VARIANT = "Cambered Barbell Bench Press — Extra Long Light Technique Variant";
const HEAVY_ID = "custom:cambered-bench-heavy";
const LIGHT_ID = "custom:cambered-bench-light";

function captureBrowserErrors(page) {
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
      constructor(...args) { super(...(args.length ? args : [fixedEpoch])); }
      static now() { return fixedEpoch; }
    }
    globalThis.Date = FixedDate;
    localStorage.setItem(storageKey, JSON.stringify(storedFixture));
  }, { fixedNow: FIXED_NOW, storageKey: STORAGE_KEY, storedFixture: fixture });
  await page.goto("/");
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
}

function adaptedWorkoutFixture() {
  const fixture = buildActiveWorkoutLifecycleFixture();
  const activeSession = fixture.sessions.find((session) => !session.submitted);
  const historySession = fixture.sessions.find((session) => session.submitted);
  const activeExercises = fixture.exercises.filter((exercise) => exercise.sessionId === activeSession.id);
  const historyExercises = fixture.exercises.filter((exercise) => exercise.sessionId === historySession.id);
  const activeExercise = activeExercises[0];
  const historyExercise = historyExercises[0];

  activeSession.title = "Public Synthetic Adapted Workout";
  activeSession.notes = "Actual work retained after an in-workout substitution.";
  activeExercise.name = LONG_VARIANT;
  activeExercise.performanceExerciseId = HEAVY_ID;
  activeExercise.originalExerciseName = "Barbell Bench Press";
  activeExercise.substitution = {
    fromName: "Barbell Bench Press",
    toName: LONG_VARIANT,
    source: "in-workout"
  };
  historySession.date = "2026-07-01";
  historySession.completedAt = "2026-07-01";
  historySession.submittedAt = "2026-07-01T15:00:00.000Z";
  historyExercise.name = LONG_VARIANT;
  historyExercise.performanceExerciseId = HEAVY_ID;

  fixture.exercises = [historyExercise, activeExercise];
  fixture.sets = fixture.sets.filter((set) => [historyExercise.id, activeExercise.id].includes(set.exerciseId));
  const priorSets = fixture.sets.filter((set) => set.exerciseId === historyExercise.id);
  const activeSets = fixture.sets.filter((set) => set.exerciseId === activeExercise.id);
  priorSets[0].setType = "top";
  priorSets[0].weight = 1200;
  priorSets[0].reps = 8;
  priorSets[0].rpe = 8;
  priorSets[1].setType = "backoff";
  priorSets[1].weight = 1100;
  priorSets[1].reps = 10;
  priorSets[1].rpe = 7.5;
  activeSets[0].setType = "top";
  activeSets[0].weight = 1234.5;
  activeSets[0].reps = 9;
  activeSets[0].rpe = 8.5;
  activeSets[0].completed = true;
  activeSets[0].completedAt = "2026-07-16T16:20:00.000Z";
  activeSets[1].setType = "backoff";
  activeSets[1].weight = 1125;
  activeSets[1].reps = 11;
  activeSets[1].rpe = 7.5;
  activeSets[1].completed = true;
  activeSets[1].completedAt = "2026-07-16T16:25:00.000Z";
  fixture.dataRevision += 1;
  return { fixture, activeSessionId: activeSession.id };
}

function progressFixture() {
  const fixture = buildHistoryLifecycleFixture();
  const baseSession = fixture.sessions[0];
  const baseExercise = fixture.exercises[0];
  const baseSet = fixture.sets[0];
  const sessions = [
    {
      ...structuredClone(baseSession),
      id: "m7-heavy-old-session",
      date: "2025-10-01",
      completedAt: "2025-10-01",
      submittedAt: "2025-10-01T15:00:00.000Z",
      title: "Public Synthetic Older Heavy Session",
      notes: "Older than the recent display window, still preserved."
    },
    {
      ...structuredClone(baseSession),
      id: "m7-heavy-prior-session",
      date: "2026-07-01",
      completedAt: "2026-07-01",
      submittedAt: "2026-07-01T15:00:00.000Z",
      title: "Public Synthetic Prior Heavy Session",
      notes: "Prior session source note."
    },
    {
      ...structuredClone(baseSession),
      id: "m7-heavy-latest-session",
      date: "2026-07-16",
      completedAt: "2026-07-16",
      submittedAt: "2026-07-16T15:00:00.000Z",
      title: "Public Synthetic Latest Heavy Session",
      notes: "Session note: smooth lockout after the pause."
    },
    {
      ...structuredClone(baseSession),
      id: "m7-light-session",
      date: "2026-07-15",
      completedAt: "2026-07-15",
      submittedAt: "2026-07-15T15:00:00.000Z",
      title: "Public Synthetic Light Variant Session"
    },
    {
      ...structuredClone(baseSession),
      id: "m7-heavy-duration-session",
      date: "2026-07-14",
      completedAt: "2026-07-14",
      submittedAt: "2026-07-14T15:00:00.000Z",
      title: "Public Synthetic Heavy Isometric Session"
    }
  ];
  const exercises = sessions.map((session, index) => ({
    ...structuredClone(baseExercise),
    id: `m7-exercise-${index}`,
    sessionId: session.id,
    name: index === 3 ? LIGHT_VARIANT : LONG_VARIANT,
    performanceExerciseId: index === 3 ? LIGHT_ID : HEAVY_ID,
    resistanceType: index === 4 ? "duration" : "external",
    source: index === 2 ? "strong" : "recorded",
    notes: index === 2 ? "Exercise note: two-second pause on every repetition." : ""
  }));
  const sets = [
    {
      ...structuredClone(baseSet),
      id: "m7-heavy-old-top",
      exerciseId: exercises[0].id,
      setType: "top",
      weight: 400,
      weightUnit: "kg",
      reps: 10,
      rpe: 7.5,
      source: "recorded"
    },
    {
      ...structuredClone(baseSet),
      id: "m7-heavy-prior-top",
      exerciseId: exercises[1].id,
      setType: "top",
      weight: 1100,
      reps: 9,
      rpe: 8,
      source: "recorded"
    },
    {
      ...structuredClone(baseSet),
      id: "m7-heavy-prior-backoff",
      exerciseId: exercises[1].id,
      setType: "backoff",
      setNumber: 2,
      sequenceIndex: 1,
      sequence: 1,
      weight: 9999,
      reps: 20,
      rpe: 10,
      source: "recorded"
    },
    {
      ...structuredClone(baseSet),
      id: "m7-heavy-latest-top",
      exerciseId: exercises[2].id,
      setType: "top",
      weight: 1234.5,
      reps: 8,
      rpe: 8.5,
      source: "manual-correction:public-synthetic-ui-fixture"
    },
    {
      ...structuredClone(baseSet),
      id: "m7-light-top",
      exerciseId: exercises[3].id,
      setType: "top",
      weight: 3000,
      reps: 20,
      rpe: 6,
      source: "recorded"
    },
    {
      ...structuredClone(baseSet),
      id: "m7-heavy-duration-top",
      exerciseId: exercises[4].id,
      setType: "top",
      weight: 0,
      reps: 0,
      durationSeconds: 120,
      rpe: 7,
      source: "recorded"
    }
  ];
  fixture.sessions = sessions;
  fixture.exercises = exercises;
  fixture.sets = sets;
  fixture.dataRevision += 1;
  return fixture;
}

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test("M7 completes an adapted mobile workout with one concise actual-work result", async ({ page }) => {
  test.setTimeout(120_000);
  const browserErrors = captureBrowserErrors(page);
  const { fixture, activeSessionId } = adaptedWorkoutFixture();
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, fixture);
  await page.evaluate(() => setActiveTab("workout"));

  const adaptedExercise = page.locator(".exercise-card").filter({ has: page.getByRole("heading", { name: LONG_VARIANT, exact: true }) });
  await expect(adaptedExercise).toBeVisible();
  await expect(adaptedExercise).toContainText(/1,?234\.5/);
  await expect(adaptedExercise).toContainText("8.5");

  await page.locator('[data-action="request-submit-workout"]').click();
  const confirmation = page.locator(".submit-confirmation");
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toHaveCount(1);
  await expect(confirmation).toContainText("Log this workout as completed?");
  await confirmation.locator('[data-action="confirm-submit-workout"]').click();

  const summary = page.locator('.completed-summary[aria-label="Workout completion"]');
  await expect(summary).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".completed-workout-view .notification-prompt")).toHaveCount(0);
  await expect(page.locator(".session-dock")).toHaveCount(0);
  await expect(summary.locator(".workout-grade-mark")).toHaveText(/^[ABCDF]$/);
  await expect(summary.locator(".workout-grade-version")).toContainText("actual-work-rubric/1.0.0");
  await expect(summary.locator(".grade-reasons li")).toHaveCount(3);
  expect(await summary.locator(".workout-highlight").count()).toBeLessThanOrEqual(3);
  await expect(summary.locator('[data-action="close-completed-summary"]')).toHaveText("Done");
  await expect(summary.locator('[data-action="open-completion-progress"]')).toHaveText("Progress");
  await expect(summary.locator(".workout-achievements, .workout-achievement, [data-action='toggle-achievement-detail']")).toHaveCount(0);
  await expect(summary).not.toContainText(/plan complete|target precision|the session, diffed|confidence|category score|adherence/i);

  const stored = await page.evaluate((sessionId) => {
    const session = data.sessions.find((item) => item.id === sessionId);
    return {
      workoutAnalysis: session.workoutAnalysis,
      exerciseName: data.exercises.find((item) => item.sessionId === sessionId)?.name,
      completedSets: data.sets.filter((set) => data.exercises.find((item) => item.id === set.exerciseId)?.sessionId === sessionId && set.completed).length
    };
  }, activeSessionId);
  expect(stored.exerciseName).toBe(LONG_VARIANT);
  expect(stored.completedSets).toBe(2);
  expect(stored.workoutAnalysis).toEqual(expect.objectContaining({
    contractVersion: "comprehensive-fitness-workout-grade/2.0.0",
    algorithmVersion: "actual-work-rubric/1.0.0",
    sourceSessionId: activeSessionId
  }));
  expect(Object.keys(stored.workoutAnalysis).sort()).toEqual([
    "algorithmVersion",
    "contractVersion",
    "createdAt",
    "letter",
    "reasons",
    "resolvedActionDecisionIds",
    "sourceSessionId"
  ]);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "m7-mobile-adapted-completion.png"), fullPage: true });
  await summary.locator('[data-action="open-completion-progress"]').click();
  await expect(page.getByRole("heading", { name: "Training history" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Search or select exercise" })).toHaveValue(LONG_VARIANT);
  const selectedVariant = page.locator(".chart-viewing-summary strong");
  await expect(selectedVariant).toHaveText(LONG_VARIANT);
  expect(await selectedVariant.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.locator('[data-action="show-chart-point"]')).toHaveCount(2);
  expect(browserErrors).toEqual([]);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "m7-mobile-adapted-completion-progress.png"), fullPage: true });
});

test("M7 completion Progress stays contextual when a baseline workout has no highlight", async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, progressFixture());
  await page.evaluate(() => {
    const session = data.sessions.find((item) => item.id === "m7-heavy-old-session");
    const completedExercise = data.exercises.find((item) => item.sessionId === session.id);
    const completedSet = data.sets.find((item) => item.exerciseId === completedExercise.id);
    completedExercise.order = 1;
    data.exercises.unshift({
      ...structuredClone(completedExercise),
      id: "m7-skipped-first-exercise",
      name: "Public Synthetic Skipped First Exercise",
      performanceExerciseId: "custom:skipped-first",
      order: 0
    });
    data.sets.push({
      ...structuredClone(completedSet),
      id: "m7-skipped-first-set",
      exerciseId: "m7-skipped-first-exercise",
      completed: true,
      skipped: true
    });
    session.workoutAnalysis = calculateWorkoutAnalysis(session, { prs: [] });
    completedSummarySessionId = session.id;
    activeSessionId = session.id;
    activeWorkoutId = "";
    activeTab = "workout";
    render();
  });

  await expect(page.locator(".completion-highlights")).toHaveCount(0);
  const progress = page.locator('[data-action="open-completion-progress"]');
  await expect(progress).toHaveAttribute("data-exercise-id", HEAVY_ID);
  await expect(progress).toHaveAttribute("data-resistance-type", "external");
  await progress.click();
  await expect(page.locator(".chart-viewing-summary strong")).toHaveText(LONG_VARIANT);
  await expect(page.locator(".primary-analysis-chart")).toContainText("Best completed load");
  expect(browserErrors).toEqual([]);
});

test("M7 preserves a stored legacy plus/minus grade across boot, history detail, and reload", async ({ page }) => {
  test.setTimeout(120_000);
  const browserErrors = captureBrowserErrors(page);
  const fixture = buildHistoryLifecycleFixture();
  const legacySession = fixture.sessions[0];
  legacySession.grade = "B+";
  legacySession.gradeVersion = "legacy-adherence-grade/1.7.0";
  delete legacySession.workoutAnalysis;
  const immutableBefore = JSON.stringify({
    grade: legacySession.grade,
    gradeVersion: legacySession.gradeVersion,
    workoutAnalysis: legacySession.workoutAnalysis
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, fixture);
  await page.locator('[data-action="set-tab"][data-tab="progress"]').click();
  const historyRow = page.locator(`[data-action="open-session"][data-session-id="${legacySession.id}"]`);
  await expect(historyRow.locator('[aria-label="Stored workout grade B+"]')).toHaveText("B+");
  await historyRow.click();
  const historicalSummary = page.locator('.completed-summary[aria-label="Workout completion"]');
  await expect(historicalSummary.locator(".workout-grade-mark")).toHaveText("B+");
  await expect(historicalSummary).toContainText("legacy-adherence-grade/1.7.0");
  await expect(historicalSummary).toContainText("newer grade rules were not applied");
  await expect(historicalSummary.locator(".completion-actions")).toHaveCount(0);

  const persistedBeforeReload = await page.evaluate((sessionId) => {
    const session = data.sessions.find((item) => item.id === sessionId);
    return JSON.stringify({
      grade: session.grade,
      gradeVersion: session.gradeVersion,
      workoutAnalysis: session.workoutAnalysis
    });
  }, legacySession.id);
  expect(persistedBeforeReload).toBe(immutableBefore);
  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  const persistedAfterReload = await page.evaluate((sessionId) => {
    const session = data.sessions.find((item) => item.id === sessionId);
    return JSON.stringify({
      grade: session.grade,
      gradeVersion: session.gradeVersion,
      workoutAnalysis: session.workoutAnalysis
    });
  }, legacySession.id);
  expect(persistedAfterReload).toBe(immutableBefore);
  expect(browserErrors).toEqual([]);
});

test("M7 Progress keeps old history and exact variants while charting one comparable role with notes and source", async ({ page }) => {
  test.setTimeout(120_000);
  const browserErrors = captureBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, progressFixture());
  await page.locator('[data-action="set-tab"][data-tab="progress"]').click();

  const search = page.getByRole("combobox", { name: "Search or select exercise" });
  await search.fill(LONG_VARIANT);
  const heavySuggestions = page.locator('[data-action="select-chart-exercise"]').filter({ hasText: LONG_VARIANT });
  await expect(heavySuggestions).toHaveCount(2);
  await heavySuggestions.filter({ hasText: "External load" }).click();
  const selectedHeavyVariant = page.locator(".chart-viewing-summary strong");
  await expect(selectedHeavyVariant).toHaveText(LONG_VARIANT);
  expect(await selectedHeavyVariant.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.locator(".chart-viewing-summary .status-pill")).toHaveText("3 sessions");
  await expect(page.locator('[data-action="show-chart-point"]')).toHaveCount(3);
  await expect(page.locator(".chart-control-context")).toContainText("top set observations");
  await expect(page.getByText("Public Synthetic Older Heavy Session", { exact: true })).toBeVisible();
  await expect(page.getByText("Public Synthetic Light Variant Session", { exact: true })).toBeVisible();

  await page.locator('[data-action="show-chart-point"]').last().click();
  const latestDetail = page.locator(".chart-detail");
  await expect(latestDetail).toContainText("1234.5");
  await expect(latestDetail).toContainText("8.5");
  await expect(latestDetail).toContainText("Top set");
  await expect(latestDetail).toContainText("Exercise note: two-second pause on every repetition.");
  await expect(latestDetail).toContainText("Session note: smooth lockout after the pause.");
  await expect(latestDetail).toContainText("manual-correction:public-synthetic-ui-fixture");
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "m7-mobile-progress-heavy-point-detail.png"), fullPage: true });

  await page.locator('[data-action="show-chart-point"]').nth(1).click();
  const priorDetail = page.locator(".chart-detail");
  await expect(priorDetail).toContainText("1100");
  await expect(priorDetail).not.toContainText("9999");
  await expect(priorDetail).not.toContainText("Back-off set");

  await page.locator('[data-action="show-chart-point"]').first().click();
  const importedUnitDetail = page.locator(".chart-detail");
  await expect(importedUnitDetail).toContainText("882 lb");
  await expect(importedUnitDetail).toContainText("400 kg");

  await search.fill(LONG_VARIANT);
  await page.locator('[data-action="select-chart-exercise"]').filter({ hasText: LONG_VARIANT }).filter({ hasText: "Duration" }).click();
  await expect(page.locator(".chart-viewing-summary .status-pill")).toHaveText("1 session");
  await expect(page.locator(".primary-analysis-chart")).toContainText("Best completed duration");
  await expect(page.locator('[data-action="show-chart-point"]')).toHaveCount(1);

  await search.fill(LIGHT_VARIANT);
  await page.locator('[data-action="select-chart-exercise"]').filter({ hasText: LIGHT_VARIANT }).click();
  const selectedLightVariant = page.locator(".chart-viewing-summary strong");
  await expect(selectedLightVariant).toHaveText(LIGHT_VARIANT);
  expect(await selectedLightVariant.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.locator(".chart-viewing-summary .status-pill")).toHaveText("1 session");
  await expect(page.locator('[data-action="show-chart-point"]')).toHaveCount(1);
  await expect(page.locator(".chart-control-context")).toContainText("Named variants and resistance types remain separate.");
  await expect(page.locator(".progress-switcher, [data-action='set-progress-view']")).toHaveCount(0);
  expect(browserErrors).toEqual([]);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "m7-mobile-progress-variant-role-source.png"), fullPage: true });
});
