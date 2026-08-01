"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const {
  FIXED_NOW,
  STORAGE_KEY,
  buildTemplateLifecycleFixture
} = require("./fixtures/template-workout-history.fixture");

const TEMPLATE_ID = "public-synthetic-m2-template";
const TEMPLATE_NAME = "Public Synthetic M2 Quiet Spotter Verification";
const EXERCISE_NAME = "Cambered Barbell Bench Press with Extended Range Heavy Variant";
const HISTORY_SESSION_ID = "public-synthetic-m2-history-session";
const HISTORY_EXERCISE_ID = "public-synthetic-m2-history-exercise";
const ARTIFACT_DIR = path.resolve(__dirname, "..", "..", "artifacts", "ui-audit", "m2");

function m2Fixture() {
  const fixture = buildTemplateLifecycleFixture();
  fixture.appDataVersion = 2;
  fixture.settings.autoStartRestTimer = false;
  fixture.templates = [{
    id: TEMPLATE_ID,
    name: TEMPLATE_NAME,
    notes: "Privacy-safe synthetic M2 exception-resolver verification.",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
    exercises: [{
      id: "public-synthetic-m2-template-exercise",
      name: EXERCISE_NAME,
      primaryMuscle: "Chest",
      secondaryMuscle: "Triceps",
      resistanceType: "external",
      isBodyweight: false,
      sets: 3,
      reps: 6,
      repMin: 5,
      repMax: 7,
      targetRpe: 8.5,
      increment: 5,
      restSeconds: 180,
      warmups: [],
      setTypes: [
        {
          id: "public-synthetic-m2-top",
          type: "top",
          label: "Top set",
          setCount: 1,
          repMin: 5,
          repMax: 7,
          rpeMin: 7.5,
          rpeMax: 8.5,
          restSeconds: 180,
          countsTowardProgression: true
        },
        {
          id: "public-synthetic-m2-backoff",
          type: "backoff",
          label: "Back-off",
          setCount: 2,
          repMin: 6,
          repMax: 8,
          rpeMin: 7,
          rpeMax: 8,
          restSeconds: 180,
          countsTowardProgression: true
        }
      ]
    }]
  }];
  fixture.sessions = [{
    id: HISTORY_SESSION_ID,
    date: "2026-07-12",
    title: "Public Synthetic M2 Prior Performance",
    notes: "Privacy-safe synthetic history.",
    submitted: true,
    workoutStarted: false,
    workoutState: "completed",
    createdAt: "2026-07-12T14:00:00.000Z",
    startedAt: "2026-07-12T14:05:00.000Z",
    completedAt: "2026-07-12",
    submittedAt: "2026-07-12T15:00:00.000Z",
    updatedAt: "2026-07-12T15:00:00.000Z",
    recovery: {},
    prs: []
  }];
  fixture.exercises = [{
    id: HISTORY_EXERCISE_ID,
    sessionId: HISTORY_SESSION_ID,
    name: EXERCISE_NAME,
    order: 0,
    primaryMuscle: "Chest",
    secondaryMuscle: "Triceps",
    resistanceType: "external",
    isBodyweight: false,
    restSeconds: 180
  }];
  fixture.sets = [
    {
      id: "public-synthetic-m2-history-top",
      exerciseId: HISTORY_EXERCISE_ID,
      setNumber: 1,
      sequenceIndex: 0,
      sequence: 0,
      setTypeIndex: 0,
      setType: "top",
      reps: 6,
      weight: 12345.5,
      weightUnit: "lb",
      resistanceType: "external",
      rpe: 8.5,
      completed: true,
      skipped: false,
      isWarmup: false,
      countsTowardProgression: true
    },
    {
      id: "public-synthetic-m2-history-backoff-1",
      exerciseId: HISTORY_EXERCISE_ID,
      setNumber: 2,
      sequenceIndex: 1,
      sequence: 1,
      setTypeIndex: 0,
      setType: "backoff",
      reps: 7,
      weight: 9876.5,
      weightUnit: "lb",
      resistanceType: "external",
      rpe: 8,
      completed: true,
      skipped: false,
      isWarmup: false,
      countsTowardProgression: true
    },
    {
      id: "public-synthetic-m2-history-backoff-2",
      exerciseId: HISTORY_EXERCISE_ID,
      setNumber: 3,
      sequenceIndex: 2,
      sequence: 2,
      setTypeIndex: 1,
      setType: "backoff",
      reps: 8,
      weight: 9654.25,
      weightUnit: "lb",
      resistanceType: "external",
      rpe: 8.5,
      completed: true,
      skipped: false,
      isWarmup: false,
      countsTowardProgression: true
    }
  ];
  return fixture;
}

function collectBrowserErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
      errors.push(`console: ${message.text()}`);
    }
  });
  return errors;
}

async function installFixture(page) {
  const blockPersonalData = (route) => route.fulfill({
    status: 404,
    contentType: "text/plain",
    body: "Synthetic M2 verification does not load local personal-data artifacts."
  });
  await page.route("**/private-personal-data/**", blockPersonalData);
  await page.route("**/personal_fitness_data/**", blockPersonalData);
  await page.addInitScript(({ fixedNow, storageKey, storedFixture }) => {
    const NativeDate = Date;
    const fixedEpoch = NativeDate.parse(fixedNow);
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixedEpoch])); }
      static now() { return fixedEpoch; }
    }
    globalThis.Date = FixedDate;
    if (sessionStorage.getItem("public-synthetic-m2-fixture-installed") !== "true") {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(storageKey, JSON.stringify(storedFixture));
      sessionStorage.setItem("public-synthetic-m2-fixture-installed", "true");
    }
  }, {
    fixedNow: FIXED_NOW,
    storageKey: STORAGE_KEY,
    storedFixture: m2Fixture()
  });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
  await expect.poll(
    () => page.evaluate(() => Boolean(
      prescriptionEngine?.evidence?.research?.exerciseById?.has("ex_barbell_bench_press")
    )),
    {
      message: "the identity compatibility catalog must be ready before exception-resolver checks run",
      timeout: 45_000
    }
  ).toBe(true);
}

async function beginTemplate(page) {
  const start = page.locator(`[data-action="start-next-template"][data-template-id="${TEMPLATE_ID}"]`);
  await expect(start).toBeVisible();
  await start.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

function activeExercise(page) {
  return page.locator(".exercise-card").filter({ hasText: EXERCISE_NAME });
}

async function assertStableTargetAndPriorFact(exercise) {
  await expect(exercise).toHaveCount(1);
  await expect(exercise).toHaveAttribute("aria-label", `Exercise: ${EXERCISE_NAME}`);
  await expect(exercise.getByRole("heading", { name: EXERCISE_NAME, exact: true })).toBeVisible();
  await expect(exercise.locator(".set-current-editor")).toContainText("3 sets planned");
  await expect(exercise).toContainText("5-7 reps");
  await expect(exercise.getByRole("spinbutton", { name: "Set 1 load" })).toHaveValue("12345.5");
  await expect(exercise.getByRole("spinbutton", { name: "Set 1 reps" })).toHaveValue("6");
  await expect(exercise.getByRole("spinbutton", { name: "Set 1 RPE" })).toHaveValue("8.5");
  await expect(exercise.locator(".set-previous").first()).toContainText("12,345.5");
  await expect(exercise.locator(".set-previous").first()).toContainText("8.5");
}

async function logLargeDecimalSet(page, exercise) {
  const load = exercise.getByRole("spinbutton", { name: "Set 1 load" });
  const reps = exercise.getByRole("spinbutton", { name: "Set 1 reps" });
  const rpe = exercise.getByRole("spinbutton", { name: "Set 1 RPE" });
  const setId = await load.getAttribute("data-set-id");

  await load.fill("12346.75");
  await reps.fill("7");
  await rpe.fill("7.5");
  await exercise.getByRole("button", { name: "Mark set complete", exact: true }).click();
  await expect(exercise.getByRole("button", { name: "Set completed", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate((id) => {
    const set = data.sets.find((item) => item.id === id);
    return set ? { weight: set.weight, reps: set.reps, rpe: set.rpe, completed: set.completed } : null;
  }, setId)).toEqual({ weight: 12346.75, reps: 7, rpe: 7.5, completed: true });
}

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test("ordinary M2 start is silent while stable target, prior fact, and logging remain usable", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const browserErrors = collectBrowserErrors(page);
  await installFixture(page);
  await beginTemplate(page);
  await expect(page.getByRole("heading", { name: TEMPLATE_NAME, exact: true })).toBeVisible({ timeout: 45_000 });

  const exercise = activeExercise(page);
  await assertStableTargetAndPriorFact(exercise);
  const workout = page.locator(".workout-view");
  await expect(workout.locator(".resolved-action-card")).toHaveCount(0);
  await expect(workout.locator(".recommendation")).toHaveCount(0);
  await expect(workout.locator(".analysis-confidence, .readiness-evidence-summary, .meter[data-conf]")).toHaveCount(0);

  const persistedDecision = await page.evaluate(() => {
    const session = data.sessions.find((item) => item.workoutState === "active" && item.submitted !== true);
    return session?.resolvedActions || null;
  });
  expect(persistedDecision).toHaveLength(1);
  expect(persistedDecision[0].outcome).toBe("no_action");

  await logLargeDecimalSet(page, exercise);
  const geometry = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(browserErrors).toEqual([]);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "m2-mobile-ordinary-silent.png"),
    fullPage: true
  });
});

test("pain or injury entry yields one canonical continued-action card without rewriting targets", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const browserErrors = collectBrowserErrors(page);
  await installFixture(page);

  await page.locator(`[data-action="log-template-readiness"][data-template-id="${TEMPLATE_ID}"]`).click();
  const readiness = page.getByRole("dialog", { name: "What is different today?", exact: true });
  await expect(readiness).toBeVisible();
  await readiness.getByRole("checkbox", { name: "Pain or injury", exact: true }).check();
  await readiness.getByLabel("Affected area", { exact: true }).selectOption({ label: "Back" });
  await readiness.getByLabel("Optional context", { exact: true }).fill("Synthetic non-diagnostic test context.");
  await readiness.locator('[data-action="start-workout-with-readiness"]').click();
  await expect(page.getByRole("heading", { name: TEMPLATE_NAME, exact: true })).toBeVisible({ timeout: 45_000 });

  const workout = page.locator(".workout-view");
  const actionCard = workout.locator(".resolved-action-card");
  await expect(actionCard).toHaveCount(1);
  await expect(actionCard).toContainText("Stop or skip this workout");
  await expect(actionCard).toContainText("You recorded pain or an injury concern.");
  await expect(actionCard).toContainText("This is not a diagnosis");
  await expect(actionCard).not.toContainText(/syndrome|pathology/i);
  await expect(workout.locator(".recommendation")).toHaveCount(1);
  await expect(workout.locator(".analysis-confidence, .readiness-evidence-summary, .meter[data-conf]")).toHaveCount(0);

  const exercise = activeExercise(page);
  await assertStableTargetAndPriorFact(exercise);
  await actionCard.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(actionCard).toContainText("Decision to continue recorded.");
  const canonical = await page.evaluate(({ templateId }) => {
    const session = data.sessions.find((item) => item.workoutState === "active" && item.submitted !== true);
    const exercise = data.exercises.find((item) => item.sessionId === session?.id);
    const template = data.templates.find((item) => item.id === templateId);
    const actions = session?.resolvedActions || [];
    return {
      actionCount: actions.length,
      action: actions[0],
      valid: actions[0] ? FitnessExceptionResolver.validateResolvedAction(actions[0]) : null,
      stableTargetSnapshot: exercise?.stableTargetSnapshot,
      templateRepRange: {
        min: template?.exercises?.[0]?.repMin,
        max: template?.exercises?.[0]?.repMax
      }
    };
  }, { templateId: TEMPLATE_ID });
  expect(canonical.actionCount).toBe(1);
  expect(canonical.valid?.valid).toBe(true);
  expect(canonical.action).toMatchObject({
    contractVersion: "comprehensive-fitness-resolved-action/1.0.0",
    outcome: "action",
    category: "pain_or_illness",
    scope: { type: "session" },
    action: { code: "stop_or_skip_work", parameters: { mode: "stop_or_skip" } },
    reasonCodes: ["explicit_pain_or_injury"],
    handling: "overridden"
  });
  expect(canonical.stableTargetSnapshot).toMatchObject({ repLow: 5, repHigh: 7 });
  expect(canonical.templateRepRange).toEqual({ min: 5, max: 7 });

  await exercise.getByRole("spinbutton", { name: "Set 1 load" }).fill("12346.75");
  await expect.poll(() => page.evaluate(() => {
    try {
      const draft = JSON.parse(localStorage.getItem("comprehensive-fitness-active-draft-v1") || "null");
      return draft?.contractVersion || "";
    } catch {
      return "";
    }
  }), { timeout: 10_000 }).toBe("comprehensive-fitness-active-draft/2.0.0");
  await page.reload();
  await expect(page.getByRole("heading", { name: TEMPLATE_NAME, exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".workout-view .resolved-action-card")).toHaveCount(1);
  const restored = await page.evaluate(() => {
    const session = data.sessions.find((item) => item.workoutState === "active" && item.submitted !== true);
    const action = session?.resolvedActions?.[0] || null;
    return {
      action,
      valid: action ? FitnessExceptionResolver.validateResolvedAction(action) : null
    };
  });
  expect(restored.valid?.valid).toBe(true);
  expect(restored.action).toMatchObject({
    contractVersion: "comprehensive-fitness-resolved-action/1.0.0",
    outcome: "action",
    category: "pain_or_illness",
    handling: "overridden"
  });

  const restoredExercise = activeExercise(page);
  await expect(restoredExercise).toHaveCount(1);
  await expect(restoredExercise).toHaveAttribute("aria-label", `Exercise: ${EXERCISE_NAME}`);
  await expect(restoredExercise.getByRole("spinbutton", { name: "Set 1 load" })).toHaveValue("12347");
  await expect(restoredExercise.locator(".set-previous").first()).toContainText("12,345.5");
  await logLargeDecimalSet(page, restoredExercise);
  const geometry = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(browserErrors).toEqual([]);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "m2-mobile-pain-continued-action.png"),
    fullPage: true
  });
});
