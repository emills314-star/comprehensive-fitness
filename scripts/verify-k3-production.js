"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");
const { FIXED_NOW, IDS, STORAGE_KEY, buildActiveWorkoutLifecycleFixture } = require("../tests/ui/fixtures/template-workout-history.fixture");

const baseUrl = String(process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8881").replace(/\/$/, "");
const axePath = require.resolve("axe-core/axe.min.js");

async function installFixture(page) {
  const fixture = buildActiveWorkoutLifecycleFixture();
  fixture.settings.installGuideDismissed = true;
  fixture.settings.autoStartRestTimer = false;
  const restSourceSet = fixture.sets.find((set) => set.id === IDS.activeBenchSet2);
  if (restSourceSet) {
    restSourceSet.completed = true;
    restSourceSet.completedAt = FIXED_NOW;
  }
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
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator("main.app-main").waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForFunction(() => typeof prescriptionEngine !== "undefined" && Boolean(prescriptionEngine?.evidence?.research?.exerciseById?.size), null, { timeout: 45_000 });
}

async function assertAxe(page, state, viewport) {
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () => axe.run(document, { resultTypes: ["violations"] }));
  const blocking = result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  assert.deepEqual(blocking.map((item) => ({ id: item.id, impact: item.impact, targets: item.nodes.map((node) => node.target) })), [], `${viewport} ${state} has serious/critical axe violations`);
}

async function verifyViewport(browser, width, height) {
  const label = `${width}x${height}`;
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
  });
  await installFixture(page);
  await page.locator('[data-action="resume-active-workout"]').first().click();
  await page.locator(".workout-view").waitFor({ state: "visible" });
  await page.waitForTimeout(250);

  assert.equal(await page.locator(".session-dock").count(), 1, `${label} must have one session header`);
  assert.equal(await page.locator(".set-current-editor").count(), 1, `${label} must have one open set row`);
  assert.equal(await page.locator(".active-rest-dock .timer-bar").count(), 0, `${label} must not show a duplicate rest surface before rest starts`);
  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    bodyWidth: document.documentElement.scrollWidth,
    clippedExerciseNames: [...document.querySelectorAll(".exercise-name-full")].filter((node) => node.scrollWidth > node.clientWidth + 1).length
  }));
  assert.ok(layout.bodyWidth <= layout.viewport + 1, `${label} has horizontal overflow`);
  assert.equal(layout.clippedExerciseNames, 0, `${label} clips an exercise name`);
  await assertAxe(page, "workout", label);

  await page.evaluate(({ exerciseId, setId }) => startTimer(exerciseId, setId, { seconds: 72 }), {
    exerciseId: IDS.activeBenchExercise,
    setId: IDS.activeBenchSet2
  });
  const rest = page.locator(".active-rest-dock .timer-bar");
  await rest.waitFor({ state: "visible" });
  assert.equal(await page.locator(".active-rest-dock .timer-bar").count(), 1, `${label} must have exactly one rest surface`);
  assert.equal(await page.locator('[role="alertdialog"]').count(), 0, `${label} rest must not create an obstructive dialog`);
  for (const name of ["Pause timer", "Reduce rest by 15 seconds", "Add rest by 15 seconds", "Skip"]) {
    const control = page.getByRole("button", { name });
    await control.waitFor({ state: "visible" });
    const box = await control.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44, `${label} ${name} must be at least 44px`);
  }
  await page.getByRole("button", { name: "Pause timer" }).click();
  await page.getByRole("button", { name: "Resume timer" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Resume timer" }).click();
  await assertAxe(page, "rest", label);
  await page.getByRole("button", { name: "Skip", exact: true }).click();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const complete = page.getByRole("button", { name: "Mark set complete" }).first();
    if (!await complete.count()) break;
    await complete.click();
    const skip = page.getByRole("button", { name: "Skip", exact: true });
    if (await skip.count()) await skip.click();
  }
  await page.locator('[data-action="request-submit-workout"]').click();
  await page.locator('[data-action="confirm-submit-workout"]').click();
  const summary = page.locator('.completed-summary[aria-label="Workout completion"]');
  await summary.waitFor({ state: "visible", timeout: 30_000 });
  await summary.locator('[data-action="open-completion-progress"]').waitFor({ state: "visible" });
  await assertAxe(page, "completion", label);
  assert.deepEqual(errors, [], `${label} emitted browser errors`);
  await context.close();
  process.stdout.write(`verified ${label}\n`);
}

(async () => {
  const browser = await chromium.launch();
  try {
    await verifyViewport(browser, 390, 844);
    await verifyViewport(browser, 1440, 900);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
