const { test, expect } = require("@playwright/test");
const AxeBuilder = require("axe-core");
const fs = require("node:fs");
const path = require("node:path");

const tabs = ["Workout", "Dashboard", "Templates", "Charts", "Settings"];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/");
  await page.waitForLoadState("load");
});

for (const tabName of tabs) {
  test(`${tabName} is accessible, responsive, and visually stable`, async ({ page }, testInfo) => {
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await page.reload();
    await page.waitForLoadState("load");

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const target = nav.getByRole("button", { name: new RegExp(`${tabName}$`) });
    await target.click();
    await expect(target).toHaveAttribute("aria-current", "page");

    const layout = await page.evaluate(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const overflow = [...document.querySelectorAll("main *")]
        .filter(visible)
        .filter((element) => element.scrollWidth > element.clientWidth + 2)
        .filter((element) => !["auto", "scroll"].includes(getComputedStyle(element).overflowX))
        .slice(0, 10)
        .map((element) => `${element.tagName.toLowerCase()}.${element.className}`);
      const clippedTargets = [...document.querySelectorAll("button, input, select, textarea, summary, a[href]")]
        .filter(visible)
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > innerWidth + 1;
        })
        .slice(0, 10)
        .map((element) => element.getAttribute("aria-label") || element.textContent.trim().slice(0, 50));
      return { overflow, clippedTargets };
    });
    expect(layout.overflow, "unexpected horizontal content overflow").toEqual([]);
    expect(layout.clippedTargets, "interactive controls must remain in the viewport").toEqual([]);

    await page.addScriptTag({ content: AxeBuilder.source });
    const accessibility = await page.evaluate(async () => axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      rules: { "color-contrast": { enabled: true } }
    }));
    expect(accessibility.violations, accessibility.violations.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
    expect(consoleErrors, "browser console errors").toEqual([]);
    await expect(page).toHaveScreenshot(`${tabName.toLowerCase()}-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: "disabled",
      maxDiffPixelRatio: 0.01
    });
  });
}

test("Templates initial frame stays progressive under large history", async ({ page }, testInfo) => {
  await page.goto("/?perf=1&perfFixture=large");
  await page.waitForLoadState("load");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /Templates$/ }).click();
  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();

  const result = await page.evaluate(() => {
    const events = (window.__CF_PERF__ || []).filter((event) => event.label === "renderTotal:plan");
    return {
      duration: events.at(-1)?.duration ?? Number.POSITIVE_INFINITY,
      hiddenEditorBodies: document.querySelectorAll(".template-editor .disclosure-body").length,
      eagerCandidates: document.querySelectorAll(".mesocycle-candidate").length
    };
  });

  console.log(`${testInfo.project.name} Templates large-fixture render: ${result.duration.toFixed(1)} ms`);
  expect(result.duration).toBeLessThan(250);
  expect(result.hiddenEditorBodies).toBe(0);
  expect(result.eagerCandidates).toBe(0);

  const editor = page.locator(".template-editor").first();
  await editor.locator("summary").click();
  await expect(editor.locator(".disclosure-body")).toHaveCount(1);
  await editor.locator("summary").click();
  await expect(editor.locator(".disclosure-body")).toHaveCount(0);
});

test("Mesocycle Planner follows dependencies and enforces restricted equipment", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "Restricted-equipment interaction is covered at the narrow mobile viewport; desktop runs the complete full-review workflow.");
  test.setTimeout(120_000);
  await page.locator('[data-tab="plan"]').waitFor({ state: "visible", timeout: 90_000 });
  await page.locator('[data-tab="plan"]').click();
  await expect(page.locator(".mesocycle-planner h2")).toContainText("Mesocycle planner", { timeout: 30_000 });
  const workflow = await page.evaluate(() => [...document.querySelectorAll(".planner-step span")].map((item) => item.textContent.trim()));
  expect(workflow).toEqual(["Objective & Schedule", "Equipment", "Training Scope", "Exercise Portfolio", "Exercise Assignments", "Full Review", "Confirm", "Ready"]);

  const equipmentLabels = await page.locator('[data-action="toggle-mesocycle-equipment"]').allTextContents();
  expect(equipmentLabels).toEqual(["All Equipment / Standard Gym", "Bodyweight", "Bands", "Dumbbells", "Barbell", "Rack", "Cable Station"]);

  const allEquipment = page.locator('[data-action="toggle-mesocycle-equipment"][data-value="all"]');
  const bodyweight = page.locator('[data-action="toggle-mesocycle-equipment"][data-value="bodyweight"]');
  expect(await allEquipment.count()).toBe(1);
  expect(await bodyweight.count()).toBe(1);
  await expect(allEquipment).toHaveAttribute("aria-pressed", "true");
  await bodyweight.click();
  await expect(allEquipment).toHaveAttribute("aria-pressed", "false");
  await expect(bodyweight).toHaveAttribute("aria-pressed", "true");

  const chestScope = page.locator('[data-action="mesocycle-muscle-scope"][value="chest"]');
  expect(await chestScope.count()).toBe(1);
  await chestScope.setChecked(false);
  const build = page.locator('[data-action="preview-mesocycle"]');
  expect(await build.count()).toBe(1);
  await build.click();
  await expect(page.getByText("Intentionally Omitted Muscle Groups", { exact: true })).toBeVisible();
  expect(await page.getByText("Why Train This Muscle Group?", { exact: true }).count()).toBeGreaterThan(0);

  const candidateNames = await page.evaluate(() => [...document.querySelectorAll(".mesocycle-candidate .candidate-heading > strong")].map((item) => item.textContent.trim()));
  expect(candidateNames.some((name) => /cable|barbell|dumbbell|machine|leg press/i.test(name))).toBe(false);
  expect(await page.locator(".program-warning.blocking").count()).toBeGreaterThan(0);
  expect(await page.getByText("Unknown", { exact: true }).count()).toBe(0);
});

test("design-system source does not accumulate one-off styling", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");
  const style = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] || "";
  const metrics = {
    hexColors: (style.match(/#[0-9a-f]{3,8}\b/gi) || []).length,
    rgbColors: (style.match(/rgba?\(/gi) || []).length,
    inlineStyles: (source.match(/\sstyle\s*=\s*["']/gi) || []).length,
    importantRules: (style.match(/!important\b/gi) || []).length
  };
  expect(metrics.hexColors, "replace new hard-coded colors with semantic tokens").toBeLessThanOrEqual(74);
  expect(metrics.rgbColors, "replace new rgb colors with semantic tokens").toBeLessThanOrEqual(40);
  expect(metrics.inlineStyles, "do not add inline presentation styles").toBeLessThanOrEqual(3);
  expect(metrics.importantRules, "avoid new specificity overrides").toBeLessThanOrEqual(14);
});

test("the authoritative UI documentation remains present", async () => {
  const documentation = fs.readFileSync(path.join(__dirname, "..", "..", "docs", "UI_UX.md"), "utf8");
  for (const contract of ["Design system", "Accessibility", "weekly UI/UX audit", "Visual regression"]) {
    expect(documentation.toLowerCase()).toContain(contract.toLowerCase());
  }
});

test("Mesocycle Planner progresses from compact setup to full review", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: /Templates$/ }).click();
  await page.getByRole("button", { name: /Fatigue Management/ }).waitFor({ state: "visible", timeout: 60_000 });
  await page.getByRole("button", { name: /Fatigue Management/ }).click();
  await expect(page.getByRole("button", { name: /Fatigue Management/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Duration in Weeks").fill("4");
  await page.getByLabel("Training Days per Week").fill("4");
  await page.getByRole("button", { name: "Dumbbells" }).click();
  await page.getByRole("button", { name: "Rack" }).click();
  await expect(page.getByRole("button", { name: "Dumbbells" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "All Equipment / Standard Gym" }).click();
  await page.getByRole("button", { name: "Build full-program draft" }).click();
  await expect(page.getByLabel("Mesocycle summary")).toBeVisible();
  await expect(page.getByText("Selected Program-Wide Exercise Portfolio")).toBeVisible();
  await expect(page.locator(".compact-program-review").getByText("Full Program Review")).toBeVisible();
  await expect(page.locator(".review-session-card").first()).toBeVisible();
  expect(await page.locator(".review-groups").count()).toBeLessThanOrEqual(1);
  expect(await page.getByText("Passed Checks", { exact: true }).count()).toBe(0);
  expect(await page.getByText("Informational Notes", { exact: true }).count()).toBe(0);
  const sessionTotals = await page.evaluate(() => [...document.querySelectorAll(".review-session-card")].map((card) => ({ header: card.querySelector(".review-session-title span")?.textContent || "", sets: [...card.querySelectorAll(".review-session-exercises li > strong:last-child")].reduce((sum, item) => sum + Number.parseInt(item.textContent, 10), 0) })));
  expect(sessionTotals.length).toBe(4);
  sessionTotals.forEach((session) => expect(session.sets).toBeLessThanOrEqual(18));
  const scheduledExerciseNames = await page.evaluate(() => [...document.querySelectorAll(".review-session-exercises li > div:first-child > strong")].map((item) => item.textContent.trim()));
  expect(scheduledExerciseNames.length).toBe(new Set(scheduledExerciseNames).size);
  if (process.env.PLAYWRIGHT_BASE_URL) console.log(`HOSTED_MESOCYCLE ${testInfo.project.name}: ${JSON.stringify({ sessionTotals, scheduledExerciseNames })}`);
  const scoreDisclosure = page.getByText("Why the Score?", { exact: true }).first();
  await scoreDisclosure.click();
  await expect(page.getByText("Taxonomy Basis", { exact: true }).first()).toBeVisible();
  if (await page.getByRole("button", { name: "Regenerate with Practical Limits" }).count()) {
    await page.getByRole("button", { name: "Regenerate with Practical Limits" }).click();
    await expect(page.locator(".review-session-card").first()).toBeVisible();
  }
  const alternatesToggle = page.getByRole("button", { name: /View Alternates/ }).first();
  await expect(alternatesToggle).toBeVisible();
  await alternatesToggle.click();
  await expect(page.getByRole("button", { name: /Hide Alternates/ }).first()).toBeVisible();
  expect(await page.getByText(/working sets|Blocking/).count()).toBeGreaterThan(0);
});
