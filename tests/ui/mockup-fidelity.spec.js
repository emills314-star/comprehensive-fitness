"use strict";

const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const {
  FIXED_NOW,
  IDS,
  STORAGE_KEY,
  buildActiveWorkoutLifecycleFixture,
  buildHistoryLifecycleFixture
} = require("./fixtures/template-workout-history.fixture");
const {
  buildProtectedSurfaceFixture
} = require("./fixtures/protected-surfaces.fixture");
const {
  buildAnalyticsEvidenceFixture,
  buildEmptyAnalyticsSettingsFixture
} = require("./fixtures/analytics-settings.fixture");

const VISUAL_SET_3_ID = "public-synthetic-active-bench-set-3";
const VISUAL_SET_4_ID = "public-synthetic-active-bench-set-4";

function buildM1ProgressiveFixture() {
  const fixture = buildActiveWorkoutLifecycleFixture();
  const benchSets = fixture.sets
    .filter((set) => set.exerciseId === IDS.activeBenchExercise)
    .sort((left, right) => left.setNumber - right.setNumber);
  const [set1, set2] = benchSets;
  Object.assign(set1, {
    completed: true,
    reps: 8,
    rpe: 8,
    targetRepMin: 8,
    targetRepMax: 8,
    targetReps: 8,
    targetRpe: 8,
    targetRpeMin: 8,
    targetRpeMax: 8,
    targetWeight: 185,
    weight: 185,
    completedAt: "2026-07-16T15:06:00.000Z"
  });
  Object.assign(set2, {
    completed: true,
    reps: 8,
    rpe: 8.5,
    targetRepMin: 8,
    targetRepMax: 8,
    targetReps: 8,
    targetRpe: 8,
    targetRpeMin: 8,
    targetRpeMax: 8,
    targetWeight: 185,
    weight: 185,
    completedAt: "2026-07-16T15:11:00.000Z"
  });
  const set3 = {
    ...structuredClone(set2),
    id: VISUAL_SET_3_ID,
    completed: false,
    completedAt: "",
    rpe: 0,
    sequence: 2,
    sequenceIndex: 2,
    setNumber: 3,
    setType: "straight",
    setTypeIndex: 2
  };
  const set4 = {
    ...structuredClone(set3),
    id: VISUAL_SET_4_ID,
    sequence: 3,
    sequenceIndex: 3,
    setNumber: 4,
    setTypeIndex: 3
  };
  fixture.sets.push(set3, set4);
  return fixture;
}

function buildM2CoreFixture() {
  const fixture = buildProtectedSurfaceFixture();
  const activeSessionIds = new Set(fixture.sessions.filter((session) => !session.submitted).map((session) => session.id));
  const activeExerciseIds = new Set(fixture.exercises.filter((exercise) => activeSessionIds.has(exercise.sessionId)).map((exercise) => exercise.id));
  fixture.sessions = fixture.sessions.filter((session) => !activeSessionIds.has(session.id));
  fixture.exercises = fixture.exercises.filter((exercise) => !activeExerciseIds.has(exercise.id));
  fixture.sets = fixture.sets.filter((set) => !activeExerciseIds.has(set.exerciseId));
  fixture.templates = [
    {
      id: "public-synthetic-upper-a",
      name: "Upper A — Push Focus",
      notes: "Public synthetic mockup-fidelity fixture.",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      exercises: [
        { id: "upper-a-bench", name: "Barbell Bench Press", primaryMuscle: "Chest", secondaryMuscle: "Triceps", resistanceType: "external", sets: 4, reps: 8, targetRpe: 8, increment: 5, restSeconds: 120 },
        { id: "upper-a-incline", name: "Incline Dumbbell Press", primaryMuscle: "Chest", secondaryMuscle: "Triceps", resistanceType: "external", sets: 3, reps: 10, targetRpe: 8, increment: 5, restSeconds: 105 },
        { id: "upper-a-fly", name: "Cable Crossover", primaryMuscle: "Chest", secondaryMuscle: "Front Delts", resistanceType: "external", sets: 3, reps: 14, targetRpe: 9, increment: 5, restSeconds: 90 },
        { id: "upper-a-lateral", name: "Cable Lateral Raise", primaryMuscle: "Side Delts", secondaryMuscle: "", resistanceType: "external", sets: 4, reps: 15, targetRpe: 8, increment: 5, restSeconds: 75 },
        { id: "upper-a-pushdown", name: "Cable Triceps Pushdown", primaryMuscle: "Triceps", secondaryMuscle: "", resistanceType: "external", sets: 4, reps: 12, targetRpe: 8, increment: 5, restSeconds: 75 }
      ]
    },
    {
      id: "public-synthetic-lower-a",
      name: "Lower A — Quad Focus",
      notes: "Public synthetic mockup-fidelity fixture.",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      exercises: [
        { id: "lower-a-squat", name: "Barbell Back Squat", primaryMuscle: "Quads", secondaryMuscle: "Glutes", resistanceType: "external", sets: 4, reps: 8, targetRpe: 8, increment: 5, restSeconds: 150 }
      ]
    },
    {
      id: "public-synthetic-upper-b",
      name: "Upper B — Pull Focus",
      notes: "Public synthetic mockup-fidelity fixture.",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      exercises: [
        { id: "upper-b-row", name: "Chest-Supported Row", primaryMuscle: "Back", secondaryMuscle: "Biceps", resistanceType: "external", sets: 4, reps: 10, targetRpe: 8, increment: 5, restSeconds: 105 }
      ]
    },
    {
      id: "public-synthetic-lower-b",
      name: "Lower B — Hinge Focus",
      notes: "Public synthetic mockup-fidelity fixture.",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      exercises: [
        { id: "lower-b-deadlift", name: "Barbell Deadlift", primaryMuscle: "Hamstrings", secondaryMuscle: "Glutes", resistanceType: "external", sets: 3, reps: 6, targetRpe: 8, increment: 5, restSeconds: 180 }
      ]
    }
  ];

  const comparisonSessionId = "public-synthetic-m2-upper-a-history";
  fixture.sessions.unshift({
    id: comparisonSessionId,
    date: "2026-07-15",
    title: "Upper A — Push Focus",
    notes: "Public synthetic comparison session for deterministic mockup-fidelity coverage.",
    submitted: true,
    workoutStarted: false,
    workoutState: "completed",
    createdAt: "2026-07-15T14:00:00.000Z",
    startedAt: "2026-07-15T14:05:00.000Z",
    completedAt: "2026-07-15",
    submittedAt: "2026-07-15T15:00:00.000Z",
    updatedAt: "2026-07-15T15:00:00.000Z",
    recovery: {},
    prs: []
  });
  const comparisonExercises = [
    { slug: "bench", name: "Barbell Bench Press", primaryMuscle: "Chest", secondaryMuscle: "Triceps", sets: 4, reps: 8, load: 185, rpe: 8 },
    { slug: "incline", name: "Incline Dumbbell Press", primaryMuscle: "Chest", secondaryMuscle: "Triceps", sets: 3, reps: 10, load: 70, rpe: 8 },
    { slug: "fly", name: "Cable Crossover", primaryMuscle: "Chest", secondaryMuscle: "Front Delts", sets: 3, reps: 14, load: 40, rpe: 9 },
    { slug: "lateral", name: "Cable Lateral Raise", primaryMuscle: "Side Delts", secondaryMuscle: "", sets: 4, reps: 15, load: 20, rpe: 8 },
    { slug: "pushdown", name: "Cable Triceps Pushdown", primaryMuscle: "Triceps", secondaryMuscle: "", sets: 4, reps: 12, load: 55, rpe: 8 }
  ];
  for (const [exerciseIndex, profile] of comparisonExercises.entries()) {
    const exerciseId = `public-synthetic-m2-upper-a-${profile.slug}`;
    fixture.exercises.unshift({
      id: exerciseId,
      sessionId: comparisonSessionId,
      name: profile.name,
      notes: "Public synthetic comparison exercise.",
      order: exerciseIndex,
      primaryMuscle: profile.primaryMuscle,
      secondaryMuscle: profile.secondaryMuscle,
      resistanceType: "external",
      isBodyweight: false,
      isDeload: false,
      restSeconds: 120
    });
    for (let setIndex = 0; setIndex < profile.sets; setIndex += 1) {
      fixture.sets.unshift({
        id: `${exerciseId}-set-${setIndex + 1}`,
        exerciseId,
        setNumber: setIndex + 1,
        sequenceIndex: setIndex,
        sequence: setIndex,
        setTypeIndex: setIndex,
        setType: setIndex === 0 ? "top" : "backoff",
        reps: profile.reps,
        weight: profile.load,
        weightUnit: "lb",
        resistanceType: "external",
        rpe: profile.rpe,
        completed: true,
        skipped: false,
        edited: false,
        isWarmup: false,
        countsTowardScore: true,
        countsTowardVolume: true,
        countsTowardProgression: true,
        classificationSource: "public-synthetic-fixture",
        classificationConfidence: 1,
        classifierVersion: 2,
        targetReps: profile.reps,
        targetRepMin: profile.reps - 2,
        targetRepMax: profile.reps + 2,
        targetWeight: profile.load,
        targetRpe: profile.rpe,
        targetRpeMin: profile.rpe - 0.5,
        targetRpeMax: profile.rpe + 0.5,
        targetRpeTolerance: 0.5,
        targetRestSeconds: 120
      });
    }
  }
  fixture.settings.availableEquipment = ["barbell", "plates", "bench", "rack", "dumbbell", "cable_station"];
  return fixture;
}

async function installFixture(page, fixture) {
  await page.addInitScript(({ fixedNow, storageKey, storedFixture }) => {
    localStorage.clear();
    sessionStorage.clear();
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
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => String(prescriptionEvidenceStatus?.state || "loading")), {
    message: "the public recommendation bundle must finish loading before fidelity checks run",
    timeout: 45_000
  }).toBe("ready");
}

test("m1 V3 progressive workout retains every functional control in the compact hierarchy", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "The m1 reference is a phone composition.");
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, buildM1ProgressiveFixture());
  await page.evaluate(({ exerciseId, restingSetId, nextSetId }) => {
    startTimer(exerciseId, restingSetId, {
      pendingNextSetId: nextSetId,
      seconds: 72
    });
  }, {
    exerciseId: IDS.activeBenchExercise,
    restingSetId: IDS.activeBenchSet2,
    nextSetId: VISUAL_SET_3_ID
  });

  await expect(page.locator('.set-logged[data-set-mode="logged"]')).toHaveCount(2);
  await expect(page.locator('.set-current-editor[data-set-mode="current"]')).toHaveCount(1);
  await expect(page.locator('.set-pending-line[data-set-mode="pending"]')).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Mark set complete" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
  await expect(page.locator('.session-dock [aria-label="Workout menu"]')).toBeVisible();
  await expect(page.locator("[data-workout-rollup]")).toBeVisible();
  await expect(page.locator(".workout-timer-slot > .timer-bar")).toHaveCount(1);
  await expect(page.locator(".set-block .timer-bar")).toHaveCount(0);
  await expect(page.locator(`[data-action="set-weight"][data-set-id="${VISUAL_SET_3_ID}"]`)).toHaveValue("185");
  await expect(page.locator(`[data-action="set-reps"][data-set-id="${VISUAL_SET_3_ID}"]`)).toHaveValue("8");
  await expect(page.locator(".set-tools-disclosure")).toHaveCount(4);

  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    fs.mkdirSync(process.env.CF_MOCKUP_REVIEW_DIR, { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m1-v3-progressive-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m1-v3-progressive-candidate-full.png"),
      fullPage: true,
      animations: "disabled",
      caret: "hide"
    });
  }
});

test("m2 core views retain their functional destinations while using the shared visual hierarchy", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "The m2 references are phone compositions.");
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, buildM2CoreFixture());

  await expect(page.locator(".lift-home-view")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Start · \d+ sets$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review this week" })).toBeVisible();
  await expect(page.locator('[data-action="start-template"]')).toHaveCount(4);
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    fs.mkdirSync(process.env.CF_MOCKUP_REVIEW_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m2-core-today-candidate-full.png"),
      fullPage: true,
      animations: "disabled",
      caret: "hide"
    });
  }

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /Plan$/ }).click();
  await expect(page.locator(".templates-view")).toBeVisible();
  await expect(page.locator(".plan-template-card")).toHaveCount(4);
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m2-core-plan-candidate-full.png"),
      fullPage: true,
      animations: "disabled",
      caret: "hide"
    });
  }

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /Progress$/ }).click();
  await expect(page.locator(".dashboard-view")).toBeVisible();
  await expect(page.locator(".volume-table")).toBeVisible();
  expect(await page.locator('[data-action="open-fatigue-flag"]').count()).toBeGreaterThan(0);
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m2-core-progress-candidate-full.png"),
      fullPage: true,
      animations: "disabled",
      caret: "hide"
    });
  }
});

test("m2 evidence and summary presentations preserve their existing disclosure and completion behavior", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "The m2 references are phone compositions.");
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, buildM1ProgressiveFixture());
  await page.evaluate((exerciseId) => {
    const exercise = data.exercises.find((item) => item.id === exerciseId);
    exercise.recommendationSnapshot = unifiedPrescriptionSnapshot(exercise, {
      fresh: true,
      throughDate: activeSession().date,
      recovery: activeSession().recovery || {}
    });
    render();
  }, IDS.activeBenchExercise);
  const recommendation = page.locator(".recommendation-card-v2").first();
  await expect(recommendation).toBeVisible();
  for (const disclosure of await recommendation.locator("details").all()) await disclosure.evaluate((node) => { node.open = true; });
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await recommendation.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m2-core-evidence-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  await page.evaluate((fixture) => {
    data = normalizeLoadedData(fixture);
    invalidateCompletedAnalysis();
    activeTab = "today";
    activeWorkoutId = "";
    viewingHistorySessionId = "";
    activeSessionId = fixture.sessions[0].id;
    completedSummarySessionId = fixture.sessions[0].id;
    render();
  }, buildHistoryLifecycleFixture());
  await expect(page.locator('.completed-summary[aria-label="Post-workout grade and analysis"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m2-core-summary-candidate-full.png"),
      fullPage: true,
      animations: "disabled",
      caret: "hide"
    });
  }
});

test("m3 start and readiness flow keeps its two-step behavior in the mockup hierarchy", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "The m3 references are phone compositions.");
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, buildM2CoreFixture());
  await page.getByRole("button", { name: /^Start · \d+ sets$/ }).click();

  const confirm = page.getByRole("dialog", { name: /Start Upper A — Push Focus\?/ });
  await expect(confirm).toBeVisible();
  await expect(confirm.locator(".readiness-evidence-summary")).toBeVisible();
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m3-start-confirm-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  await confirm.getByRole("button", { name: "Log today’s readiness", exact: true }).click();
  const readiness = page.getByRole("dialog", { name: "How did you arrive?", exact: true });
  await expect(readiness).toBeVisible();
  await readiness.getByRole("spinbutton", { name: "Sleep", exact: true }).fill("6");
  await readiness.getByRole("radiogroup", { name: "Sleep quality", exact: true }).getByRole("radio", { name: "2", exact: true }).check();
  await readiness.getByRole("radiogroup", { name: "Soreness", exact: true }).getByRole("radio", { name: "4", exact: true }).check();
  await readiness.getByRole("spinbutton", { name: "HRV", exact: true }).fill("51");
  await readiness.getByRole("spinbutton", { name: "Resting heart rate", exact: true }).fill("58");
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m3-readiness-log-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  await readiness.getByRole("button", { name: "See what this changes", exact: true }).evaluate((button) => button.click());
  const review = page.locator(".readiness-review-sheet");
  await expect(review).toBeVisible();
  await expect(review.locator(".readiness-change-entry")).toHaveCount(5);
  await expect(review.getByRole("button", { name: /Start (adjusted|planned) workout/ })).toBeVisible();
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m3-readiness-review-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }
});

test("m3 conflict and discard sheets preserve the safe exit choices", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "The m3 references are phone compositions.");
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, buildActiveWorkoutLifecycleFixture());
  await page.evaluate((templateId) => openTemplateStart(templateId), IDS.controlTemplate);

  const conflict = page.getByRole("dialog", { name: /Public Synthetic Active Upper Session/ });
  await expect(conflict).toBeVisible();
  await expect(conflict.getByRole("button", { name: /Return to Public Synthetic Active Upper Session/ })).toBeVisible();
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m3-start-conflict-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  await page.evaluate(() => closeTemplateStart());
  await page.evaluate((sessionId) => requestCancelWorkout("workout", sessionId), IDS.activeSession);
  const cancel = page.getByRole("dialog", { name: "Cancel this workout?", exact: true });
  await expect(cancel).toBeVisible();
  await expect(cancel.getByRole("button", { name: "Keep Workout", exact: true })).toBeVisible();
  await expect(cancel.getByRole("button", { name: "Discard Workout", exact: true })).toBeVisible();
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m3-cancel-workout-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }
});

test("m4 guided mesocycle screens keep the existing planning workflow in the mockup hierarchy", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "mobile", "The m4 references are phone compositions.");
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, buildM2CoreFixture());
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /Plan$/ }).click();
  await page.getByRole("button", { name: "Plan Your Mesocycle", exact: true }).click();
  await page.getByRole("button", { name: "Start planning", exact: true }).click();
  await expect(page.locator(".guided-setup-step")).toBeVisible();
  await expect(page.locator('[data-action="create-guided-draft"]')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m4-meso-setup-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  await page.locator('[data-action="create-guided-draft"]').click();
  await expect(page.locator(".guided-build-step")).toBeVisible();
  await expect(page.locator(".guided-day")).toHaveCount(4);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m4-meso-build-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  const firstDay = page.locator(".guided-day").first();
  if (!await firstDay.locator('[data-action="open-guided-exercise-browser"]').isVisible()) {
    await firstDay.locator('[data-action="toggle-guided-day"]').click();
  }
  await firstDay.locator('[data-action="open-guided-exercise-browser"]').click();
  await expect(page.locator(".guided-exercise-workspace")).toBeVisible();
  await expect(page.locator(".exercise-browser-card").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m4-meso-exercise-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  await page.locator('.exercise-browser-card [data-action="select-guided-exercise"]:not([disabled])').first().click();
  await expect(page.locator("[data-guided-configuration]")).toBeVisible();
  await page.locator('[data-action="confirm-guided-exercise"]').click();
  await page.locator('[data-action="close-guided-exercise-browser"]').click();
  for (let dayIndex = 1; dayIndex < 4; dayIndex += 1) {
    const day = page.locator(".guided-day").nth(dayIndex);
    if (!await day.locator('[data-action="open-guided-exercise-browser"]').isVisible()) {
      await day.locator('[data-action="toggle-guided-day"]').click();
    }
    await day.locator('[data-action="open-guided-exercise-browser"]').click();
    await page.locator('.exercise-browser-card [data-action="select-guided-exercise"]:not([disabled])').first().click();
    await page.locator('[data-action="confirm-guided-exercise"]').click();
    await page.locator('[data-action="close-guided-exercise-browser"]').click();
  }
  await page.locator('[data-action="check-guided-viability"]').evaluate((button) => button.click());
  await expect(page.locator(".guided-check-step")).toBeVisible();
  await expect(page.locator(".finding.blocking").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m4-meso-viability-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  await page.evaluate(() => {
    guidedGenerationReviewOpen = true;
    guidedMesocycleView = "builder";
    render();
  });
  await expect(page.locator(".guided-create-step")).toBeVisible();
  await expect(page.locator(".guided-review-day")).toHaveCount(4);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m4-meso-review-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }
});

test("m5 analysis and history retain evidence detail in the mockup hierarchy", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "mobile", "The m5 references are phone compositions.");
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, buildAnalyticsEvidenceFixture());

  await page.locator('[data-action="set-tab"][data-tab="progress"]').click();
  await page.locator('[data-action="set-progress-view"][data-progress-view="lifts"]').click();
  await expect(page.locator(".chart-recalculating")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator(".charts-view")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m5-lift-analysis-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  const chart = page.locator('.chart-card[data-chart-key="e1rm"]');
  const chartPoint = chart.locator('[data-action="show-chart-point"]').last();
  await chartPoint.evaluate((point) => point.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await expect(chart.locator(".chart-detail")).toBeVisible();
  await chart.scrollIntoViewIfNeeded();
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m5-chart-point-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  await chart.getByRole("button", { name: "Close chart detail" }).click();
  await page.locator('[data-action="set-progress-view"][data-progress-view="history"]').click();
  await expect(page.locator(".history-view")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m5-history-sessions-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  const exerciseHistory = page.locator("details.history-by-exercise");
  await exerciseHistory.locator(":scope > summary").click();
  const firstExercise = exerciseHistory.locator("details.history-exercise").first();
  await firstExercise.locator(":scope > summary").click();
  await firstExercise.scrollIntoViewIfNeeded();
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m5-history-exercise-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }
});

test("m6 settings, data, and destructive confirmation keep their existing safeguards", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "mobile", "The m6 references are phone compositions.");
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, buildAnalyticsEvidenceFixture());
  await page.locator('[data-action="set-tab"][data-tab="more"]').click();
  await expect(page.locator(".settings-view")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m6-settings-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  const appearance = page.locator("details.settings-group").filter({ hasText: "Appearance and units" });
  if (await appearance.evaluate((group) => group.open)) await appearance.locator(":scope > summary").click();
  const dataGroup = page.locator("details.settings-group").filter({ hasText: "Data and backup" });
  await dataGroup.locator(":scope > summary").click();
  await dataGroup.evaluate((group) => window.scrollTo(0, group.offsetTop - 12));
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m6-data-backup-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  await dataGroup.locator(":scope > summary").click();
  const danger = page.locator("details.settings-group").filter({ hasText: "Danger Zone" });
  await danger.locator(":scope > summary").click();
  await danger.evaluate((group) => window.scrollTo(0, group.offsetTop - 12));
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m6-danger-zone-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  await danger.locator('[data-action="clear-data"]').click();
  await expect(page.locator(".clear-data-sheet")).toBeVisible();
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m6-clear-data-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }
});

test("m6 first-run and recoverable system states remain honest", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "The m6 references are phone compositions.");
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, buildEmptyAnalyticsSettingsFixture());
  await expect(page.locator(".lift-home-view")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m6-first-run-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }

  await page.evaluate(() => {
    activeTab = "progress";
    renderProgress = () => {
      throw new Error("Public synthetic visual-state failure");
    };
    render();
  });
  await expect(page.locator(".destination-error")).toBeVisible();
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m6-system-error-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }
});

test("m7 workout exit stays in the persistent session dock", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "The m7 references are phone compositions.");
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, buildM1ProgressiveFixture());
  const dock = page.locator(".session-dock");
  await expect(dock).toBeVisible();
  await expect(dock.getByRole("button", { name: "Finish", exact: true })).toBeVisible();
  await dock.locator(".session-dock-overflow > summary").click();
  await expect(dock.getByRole("button", { name: /Save as template/ })).toBeVisible();
  await expect(dock.getByRole("button", { name: /Cancel workout/ })).toBeVisible();
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m7-session-dock-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }
});

test("m8 and m9 navigation keeps literal labeled glyphs with current-only color", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "The m8 and m9 references are phone compositions.");
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page, buildM2CoreFixture());
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.locator(".nav-button")).toHaveCount(4);
  await expect(nav.locator(".nav-button .ui-icon")).toHaveCount(4);
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  if (process.env.CF_MOCKUP_REVIEW_DIR) {
    await page.screenshot({
      path: path.join(process.env.CF_MOCKUP_REVIEW_DIR, "m9-navigation-candidate.png"),
      animations: "disabled",
      caret: "hide"
    });
  }
});
