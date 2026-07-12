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
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: /Templates$/ }).click();
  await page.getByRole("button", { name: /Fatigue Management/ }).click();
  await expect(page.getByRole("button", { name: /Fatigue Management/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Duration in Weeks").fill("4");
  await page.getByLabel("Training Days per Week").fill("4");
  await page.getByRole("button", { name: "Dumbbells" }).click();
  await page.getByRole("button", { name: "Machines" }).click();
  await expect(page.getByRole("button", { name: "Dumbbells" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Build full-program draft" }).click();
  await expect(page.getByLabel("Mesocycle summary")).toBeVisible();
  await expect(page.getByText("Selected Program-Wide Exercise Portfolio")).toBeVisible();
  await expect(page.getByText("Full Program Review")).toBeVisible();
  await expect(page.getByRole("button", { name: /View Alternates/ })).toBeVisible();
  await page.getByRole("button", { name: /View Alternates/ }).click();
  expect(await page.getByText("Alternative Replacement").count()).toBeGreaterThan(0);
  expect(await page.getByText(/working sets|Blocking/).count()).toBeGreaterThan(0);
});
