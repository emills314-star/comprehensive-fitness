"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const {
  FIXED_NOW,
  STORAGE_KEY,
  buildTemplateLifecycleFixture
} = require("./fixtures/template-workout-history.fixture");

const ARTIFACT_DIR = path.resolve(__dirname, "..", "..", "artifacts", "ui-audit", "m3");

async function installFixture(page) {
  const fixture = buildTemplateLifecycleFixture();
  fixture.templates = [{
    id: "public-synthetic-m3-routine",
    name: "Public Synthetic Long Routine Name for Planner Removal Verification",
    notes: "Synthetic M3 fixture.",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
    exercises: [{
      id: "public-synthetic-m3-exercise",
      name: "Very Long Cambered Barbell Bench Press Variation Name",
      primaryMuscle: "Chest",
      resistanceType: "external",
      sets: 3,
      reps: 6,
      repMin: 5,
      repMax: 8,
      targetRpe: 8.5,
      increment: 5,
      restSeconds: 180,
      warmups: []
    }]
  }];
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
}

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test("M3 Plan renders routines only and removed planner paths stay unreachable at 390 by 844", async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await installFixture(page);
  await page.goto("/#mesocycle");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });

  await page.locator('[data-action="set-tab"][data-tab="plan"]').click();
  await expect(page.locator('[data-action="set-tab"][data-tab="plan"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-action="start-template"][data-template-id="public-synthetic-m3-routine"]')).toBeVisible();

  await expect(page.getByText(/plan your mesocycle|guided planner|mesocycle completed/i)).toHaveCount(0);
  await expect(page.locator('[data-action*="mesocycle"], [data-action*="guided"], .mesocycle-planner, .guided-builder')).toHaveCount(0);
  await expect(page.locator('script[src*="guided-mesocycle"]')).toHaveCount(0);
  await expect(page.locator(".vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]")).toHaveCount(0);

  const activeState = await page.evaluate(() => ({
    hasContent: document.body.innerText.trim().length > 0,
    hasMesocycles: Object.prototype.hasOwnProperty.call(data, "mesocycles"),
    hasActiveMesocycle: Object.prototype.hasOwnProperty.call(data, "activeMesocycleId")
  }));
  expect(activeState).toEqual({ hasContent: true, hasMesocycles: false, hasActiveMesocycle: false });
  expect(consoleErrors.filter((message) => !/Failed to load resource: the server responded with a status of 404/i.test(message))).toEqual([]);

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "m3-mobile-plan-routines-only.png"),
    fullPage: true
  });
});
