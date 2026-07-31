"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const {
  FIXED_NOW,
  STORAGE_KEY,
  buildTemplateLifecycleFixture
} = require("./fixtures/template-workout-history.fixture");

const TEMPLATE_ID = "public-synthetic-control-template";
const TEMPLATE_NAME = "Public Synthetic M1 Stable-Target Verification";
const EXERCISE_NAME = "Cambered Barbell Bench Press";
const ARTIFACT_DIR = path.resolve(__dirname, "..", "..", "artifacts", "ui-audit", "m1");

function m1Fixture() {
  const fixture = buildTemplateLifecycleFixture();
  fixture.appDataVersion = 2;
  fixture.settings.availableEquipment = ["bodyweight"];
  fixture.settings.autoStartRestTimer = false;
  fixture.templates = [{
    id: TEMPLATE_ID,
    name: TEMPLATE_NAME,
    notes: "Public synthetic M1 fixture; no personal or imported fitness data.",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
    exercises: [{
      id: "public-synthetic-m1-cambered-press",
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
      standardWorkloadOverride: false,
      standardRoleWorkload: {
        setStructure: "top_set_backoff",
        topSet: { count: 1, repRange: { min: 5, max: 7 } },
        backoffSets: { count: 2, repRange: { min: 6, max: 8 } }
      }
    }]
  }];
  fixture.sessions = [{
    id: "public-synthetic-m1-history-session",
    date: "2026-07-16",
    title: "Public Synthetic M1 Prior Session",
    submitted: true,
    workoutStarted: false,
    workoutState: "completed",
    createdAt: "2026-07-16T14:00:00.000Z",
    startedAt: "2026-07-16T14:05:00.000Z",
    completedAt: "2026-07-16",
    submittedAt: "2026-07-16T15:00:00.000Z",
    updatedAt: "2026-07-16T15:00:00.000Z",
    recovery: {},
    prs: []
  }];
  fixture.exercises = [{
    id: "public-synthetic-m1-history-exercise",
    sessionId: "public-synthetic-m1-history-session",
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
      id: "public-synthetic-m1-history-top",
      exerciseId: "public-synthetic-m1-history-exercise",
      setNumber: 1,
      sequenceIndex: 0,
      sequence: 0,
      setTypeIndex: 0,
      setType: "top",
      reps: 6,
      weight: 1234.5,
      weightUnit: "lb",
      resistanceType: "external",
      rpe: 8.5,
      completed: true,
      skipped: false,
      isWarmup: false,
      countsTowardScore: true,
      countsTowardVolume: true,
      countsTowardProgression: true
    },
    {
      id: "public-synthetic-m1-history-backoff-1",
      exerciseId: "public-synthetic-m1-history-exercise",
      setNumber: 2,
      sequenceIndex: 1,
      sequence: 1,
      setTypeIndex: 0,
      setType: "backoff",
      reps: 7,
      weight: 987.5,
      weightUnit: "lb",
      resistanceType: "external",
      rpe: 8,
      completed: true,
      skipped: false,
      isWarmup: false,
      countsTowardScore: true,
      countsTowardVolume: true,
      countsTowardProgression: true
    },
    {
      id: "public-synthetic-m1-history-backoff-2",
      exerciseId: "public-synthetic-m1-history-exercise",
      setNumber: 3,
      sequenceIndex: 2,
      sequence: 2,
      setTypeIndex: 1,
      setType: "backoff",
      reps: 8,
      weight: 965,
      weightUnit: "lb",
      resistanceType: "external",
      rpe: 8.5,
      completed: true,
      skipped: false,
      isWarmup: false,
      countsTowardScore: true,
      countsTowardVolume: true,
      countsTowardProgression: true
    }
  ];
  return fixture;
}

async function installFixture(page, fixture = m1Fixture()) {
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
  await expect.poll(() => page.evaluate(() => String(prescriptionEvidenceStatus?.state || "loading")), {
    timeout: 45_000
  }).toBe("ready");
}

async function openPlan(page) {
  await page.locator('[data-action="set-tab"][data-tab="plan"]').click();
  await expect(page.locator('[data-action="set-tab"][data-tab="plan"]')).toHaveAttribute("aria-current", "page");
}

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test("M1 starts stable variant targets with factual same-role prefills at 390 by 844", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page);
  await openPlan(page);

  await page.locator(`[data-action="start-template"][data-template-id="${TEMPLATE_ID}"]`).click();
  await page.locator('[data-action="use-usual-readiness"]').click();
  await expect(page.getByRole("heading", { name: TEMPLATE_NAME, exact: true })).toBeVisible({ timeout: 45_000 });

  const exercise = page.locator(".exercise-card").filter({ hasText: EXERCISE_NAME });
  await expect(exercise).toHaveCount(1);
  await expect(exercise.locator(".program-warning.blocking")).toHaveCount(0);
  await expect(exercise.locator(".set-current-editor")).toContainText("3 sets planned");
  await expect(exercise).toContainText("Top Set is ready");
  await expect(exercise).toContainText("5-7 reps");
  await expect(exercise).toContainText("7.5-8.5 RPE");
  await expect(exercise.getByRole("spinbutton", { name: "Set 1 load" })).toHaveValue("1234.5");
  await expect(exercise.getByRole("spinbutton", { name: "Set 1 reps" })).toHaveValue("6");
  await expect(exercise.getByRole("spinbutton", { name: "Set 1 RPE" })).toHaveValue("8.5");

  const normalized = await page.evaluate(() => ({
    settingsHasEquipment: Object.hasOwn(data.settings, "availableEquipment"),
    template: data.templates.find((item) => item.id === "public-synthetic-control-template")
  }));
  expect(normalized.settingsHasEquipment).toBe(false);
  expect(normalized.template.exercises[0].standardWorkloadOverride).toBeUndefined();
  expect(normalized.template.exercises[0].standardRoleWorkload).toBeUndefined();
  expect(normalized.template.exercises[0].setTypes.map((item) => item.type)).toEqual(["top", "backoff"]);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "m1-mobile-stable-target-prefill.png"), fullPage: true });
  await exercise.getByRole("button", { name: "Mark set complete", exact: true }).click();
  await expect(exercise.getByRole("button", { name: "Set completed", exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "m1-mobile-stable-target-completed.png"), fullPage: true });
});

test("M1 removes the global equipment preference from the live guided setup", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page);
  await openPlan(page);

  await page.locator('[data-action="begin-guided-mesocycle"]').click();
  await page.locator('[data-action="open-guided-setup"]').click();
  await expect(page.getByRole("group", { name: "Available Equipment", exact: true })).toHaveCount(0);
  await expect(page.locator('[data-action="toggle-mesocycle-equipment"]')).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Muscle Group Scope", exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "m1-mobile-equipment-preference-removed.png"), fullPage: true });
});

test("M1 replaces a prefilled RPE 7 with 7.5 in one focused edit", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = m1Fixture();
  fixture.sets.find((set) => set.id === "public-synthetic-m1-history-top").rpe = 7;
  await installFixture(page, fixture);
  await openPlan(page);

  await page.locator(`[data-action="start-template"][data-template-id="${TEMPLATE_ID}"]`).click();
  await page.locator('[data-action="use-usual-readiness"]').click();
  const exercise = page.locator(".exercise-card").filter({ hasText: EXERCISE_NAME });
  const rpe = exercise.getByRole("spinbutton", { name: "Set 1 RPE" });
  const setId = await rpe.getAttribute("data-set-id");
  await expect(rpe).toHaveValue("7");

  await rpe.click();
  await rpe.pressSequentially("7.5");
  await expect(rpe).toHaveValue("7.5");
  await exercise.getByRole("button", { name: "Mark set complete", exact: true }).click();
  await expect(exercise.getByRole("button", { name: "Set completed", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate((id) => data.sets.find((set) => set.id === id)?.rpe, setId)).toBe(7.5);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "m1-mobile-rpe-7-to-7-5.png"), fullPage: true });
});
