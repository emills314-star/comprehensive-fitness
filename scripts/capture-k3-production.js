"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const {
  FIXED_NOW,
  IDS,
  STORAGE_KEY,
  buildActiveWorkoutLifecycleFixture
} = require("../tests/ui/fixtures/template-workout-history.fixture");
const { buildProtectedSurfaceFixture } = require("../tests/ui/fixtures/protected-surfaces.fixture");

const root = path.resolve(__dirname, "..");
const baseUrl = String(process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8881").replace(/\/$/, "");
const referenceDir = path.join(root, "artifacts", "design-review", "direction-a");
const outputDir = path.join(root, "artifacts", "design-review", "corrective", "production");
const boardPath = path.join(root, "artifacts", "design-review", "corrective", "k3-comparison-board.html");
const boardImagePath = path.join(root, "artifacts", "design-review", "corrective", "k3-comparison-board.png");
const mockupSource = fs.readFileSync(path.join(root, "tests", "ui", "mockup-fidelity.spec.js"), "utf8");

function extractFunctionSource(name) {
  const start = mockupSource.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const bodyStart = mockupSource.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < mockupSource.length; index += 1) {
    if (mockupSource[index] === "{") depth += 1;
    if (mockupSource[index] === "}") depth -= 1;
    if (depth === 0) return mockupSource.slice(start, index + 1);
  }
  throw new Error(`Unterminated ${name}`);
}

const buildM1ProgressiveFixture = new Function(
  "buildActiveWorkoutLifecycleFixture",
  "IDS",
  "VISUAL_SET_3_ID",
  "VISUAL_SET_4_ID",
  "structuredClone",
  `return (${extractFunctionSource("buildM1ProgressiveFixture")});`
)(buildActiveWorkoutLifecycleFixture, IDS, "public-synthetic-active-bench-set-3", "public-synthetic-active-bench-set-4", structuredClone);

const buildM2CoreFixture = new Function(
  "buildProtectedSurfaceFixture",
  "FIXED_NOW",
  `return (${extractFunctionSource("buildM2CoreFixture")});`
)(buildProtectedSurfaceFixture, FIXED_NOW);

const captures = [
  { name: "mobile-390-today.png", width: 390, height: 844, state: "today" },
  { name: "mobile-390-workout.png", width: 390, height: 844, state: "workout" },
  { name: "mobile-390-rest.png", width: 390, height: 844, state: "rest" },
  { name: "mobile-390-complete.png", width: 390, height: 844, state: "complete" },
  { name: "mobile-390-progress.png", width: 390, height: 844, state: "progress" },
  { name: "mobile-390-routines.png", width: 390, height: 844, state: "routines" },
  { name: "mobile-430-today.png", width: 430, height: 932, state: "today" },
  { name: "mobile-430-workout.png", width: 430, height: 932, state: "workout" },
  { name: "desktop-today.png", width: 1440, height: 900, state: "today" },
  { name: "desktop-workout.png", width: 1440, height: 900, state: "workout" },
  { name: "desktop-progress.png", width: 1440, height: 900, state: "progress" }
];

function fixtureForState(state) {
  const fixture = state === "workout" || state === "rest" || state === "complete"
    ? buildM1ProgressiveFixture()
    : buildM2CoreFixture();
  if (fixture.templates?.[0]) {
    fixture.templates[0].scheduledWeekdays = ["thursday"];
    fixture.settings.expectedTemplateId = fixture.templates[0].id;
  }
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
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator("main.app-main").waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForFunction(() => typeof prescriptionEngine !== "undefined" && Boolean(prescriptionEngine?.evidence?.research?.exerciseById?.size), null, { timeout: 45_000 });
}

async function openWorkout(page) {
  await page.locator('[data-action="resume-active-workout"]').first().click();
  await page.locator(".workout-view").waitFor({ state: "visible", timeout: 15_000 });
}

async function prepareState(page, state) {
  if (state === "today") {
    await page.locator('.bottom-nav [data-action="set-tab"][data-tab="progress"]').click();
    await page.locator(".charts-view").waitFor({ state: "visible", timeout: 15_000 });
    await page.locator('.bottom-nav [data-action="set-tab"][data-tab="today"]').click();
    await page.locator(".lift-home-view").waitFor({ state: "visible", timeout: 15_000 });
  }
  if (state === "workout" || state === "rest" || state === "complete") await openWorkout(page);
  if (state === "rest") {
    await page.evaluate(({ exerciseId, restingSetId, nextSetId }) => {
      startTimer(exerciseId, restingSetId, { pendingNextSetId: nextSetId, seconds: 72 });
    }, {
      exerciseId: IDS.activeBenchExercise,
      restingSetId: IDS.activeBenchSet2,
      nextSetId: "public-synthetic-active-bench-set-3"
    });
    await page.locator(".active-rest-dock .timer-bar").waitFor({ state: "visible" });
  }
  if (state === "complete") {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const complete = page.getByRole("button", { name: "Mark set complete" }).first();
      if (!await complete.count()) break;
      await complete.click();
      const skip = page.getByRole("button", { name: "Skip", exact: true });
      if (await skip.count()) await skip.click();
      await page.waitForTimeout(40);
    }
    await page.locator('[data-action="request-submit-workout"]').click();
    await page.locator('[data-action="confirm-submit-workout"]').click();
    await page.locator('.completed-summary[aria-label="Workout completion"]').waitFor({ state: "visible", timeout: 30_000 });
  }
  if (state === "progress") {
    await page.locator('.bottom-nav [data-action="set-tab"][data-tab="progress"]').click();
    await page.locator(".charts-view").waitFor({ state: "visible", timeout: 15_000 });
  }
  if (state === "routines") {
    await page.evaluate(() => setActiveTab("routines"));
    await page.locator(".templates-view").waitFor({ state: "visible", timeout: 15_000 });
  }
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  });
  await page.waitForTimeout(50);
}

function createBoard() {
  const rows = captures.map(({ name, state, width, height }) => `
    <section class="pair">
      <h2>${name.replace(".png", "")} <small>${state} · ${width}×${height}</small></h2>
      <figure><figcaption>Approved Direction A</figcaption><img src="../direction-a/${name}" alt="Approved ${state}" /></figure>
      <figure><figcaption>Production result</figcaption><img src="production/${name}" alt="Production ${state}" /></figure>
    </section>`).join("");
  fs.writeFileSync(boardPath, `<!doctype html><html><head><meta charset="utf-8"><title>K3 comparison board</title><style>
    *{box-sizing:border-box}body{margin:0;background:#e8ebee;color:#111827;font:14px system-ui,sans-serif}header{background:#fff;border-bottom:1px solid #aeb7c2;padding:24px 32px}h1{font-size:24px;margin:0 0 6px}p{margin:0;color:#526070}.board{display:grid;gap:28px;padding:28px}.pair{background:#fff;border:1px solid #aeb7c2;padding:18px;display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}.pair h2{grid-column:1/-1;font-size:16px;margin:0;padding-bottom:12px;border-bottom:1px solid #d6dbe1}.pair h2 small{color:#667281;font-weight:400}figure{margin:0;min-width:0}figcaption{font-weight:600;margin:0 0 8px}img{display:block;width:100%;height:auto;border:1px solid #d6dbe1;background:#fff;object-fit:contain;object-position:top}@media(max-width:800px){.pair{grid-template-columns:1fr}}
  </style></head><body><header><h1>Approved K3 Logbook vs production</h1><p>Direction A authority at left; corrective production render at right. Blue-gray prior facts and explicit Pause/Resume are approved deviations.</p></header><main class="board">${rows}</main></body></html>`);
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  try {
    for (const capture of captures) {
      const context = await browser.newContext({ viewport: { width: capture.width, height: capture.height }, colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block" });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(`${capture.name}: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(`${capture.name}: ${message.text()}`);
      });
      await installFixture(page, fixtureForState(capture.state));
      await prepareState(page, capture.state);
      await page.screenshot({ path: path.join(outputDir, capture.name), fullPage: false, animations: "disabled", caret: "hide" });
      await context.close();
      process.stdout.write(`captured ${capture.name}\n`);
    }
    createBoard();
    const boardPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", reducedMotion: "reduce" });
    await boardPage.goto(`file:///${boardPath.replaceAll("\\", "/")}`, { waitUntil: "load" });
    await boardPage.screenshot({ path: boardImagePath, fullPage: true, animations: "disabled", caret: "hide" });
    await boardPage.close();
  } finally {
    await browser.close();
  }
  if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
  console.log(`Comparison board: ${boardImagePath}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
