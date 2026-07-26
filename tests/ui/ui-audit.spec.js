const { test, expect } = require("@playwright/test");
const AxeBuilder = require("axe-core");
const fs = require("node:fs");
const path = require("node:path");

const tabs = ["Today", "Plan", "Progress", "More"];

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
    if (process.env.CF_PHASE5_REVIEW_DIR) {
      fs.mkdirSync(process.env.CF_PHASE5_REVIEW_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.CF_PHASE5_REVIEW_DIR, `${tabName.toLowerCase()}-${testInfo.project.name}.png`),
        fullPage: true,
        animations: "disabled",
        caret: "hide"
      });
    }
    if (!process.env.CF_PHASE5_REVIEW_DIR) {
      await expect(page).toHaveScreenshot(`${tabName.toLowerCase()}-${testInfo.project.name}.png`, {
        fullPage: true,
        animations: "disabled",
        maxDiffPixelRatio: 0.01
      });
    }
  });
}

test("Templates initial frame stays progressive under large history", async ({ page }, testInfo) => {
  await page.goto("/?perf=1&perfFixture=large");
  await page.waitForLoadState("load");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /Plan$/ }).click();
  await expect(page.getByRole("heading", { name: "Your plan", exact: true })).toBeVisible();

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
  await page.locator('.nav-button[data-tab="plan"]').waitFor({ state: "visible", timeout: 90_000 });
  await page.locator('.nav-button[data-tab="plan"]').click();
  await expect(page.locator(".mesocycle-planner h2")).toContainText("Plan Your Mesocycle", { timeout: 30_000 });
  await page.getByRole("button", { name: "Plan Your Mesocycle" }).click();
  await expect(page.getByText("Before you build", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start planning" }).click();
  const workflow = await page.evaluate(() => [...document.querySelectorAll(".guided-progress button")].map((item) => item.dataset.step));
  expect(workflow).toEqual(["guide", "setup", "build", "check", "create"]);
  await expect(page.locator('[data-action="guided-step"][data-step="guide"]')).toBeEnabled();
  await expect(page.locator('[data-action="guided-step"][data-step="build"]')).toBeDisabled();

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
  const build = page.locator('[data-action="create-guided-draft"]');
  expect(await build.count()).toBe(1);
  await build.click();
  await expect(page.locator('[data-action="guided-step"][data-step="guide"]')).toBeEnabled();
  await expect(page.locator('[data-action="guided-step"][data-step="setup"]')).toBeEnabled();
  await expect(page.locator('[data-action="guided-step"][data-step="build"]')).toBeEnabled();
  await expect(page.locator('[data-action="guided-step"][data-step="create"]')).toBeDisabled();
  await page.getByRole("button", { name: "Add Exercise" }).click();
  const candidateNames = await page.evaluate(() => [...document.querySelectorAll(".exercise-browser-card h3")].map((item) => item.textContent.trim()));
  expect(candidateNames.some((name) => /cable|barbell|dumbbell|machine|leg press/i.test(name))).toBe(false);
  expect(await page.getByText("Unknown", { exact: true }).count()).toBe(0);
  await page.locator('[data-action="close-guided-exercise-browser"]').click();
  await page.locator('[data-action="guided-step"][data-step="setup"]').click();
  await page.getByRole("button", { name: "All Equipment / Standard Gym" }).click();
  await page.getByRole("button", { name: "Build the days" }).click();
  await page.getByRole("button", { name: "Add Exercise" }).click();
  const configureButtons = page.locator('[data-action="select-guided-exercise"]:not([disabled])');
  expect(await configureButtons.count()).toBeGreaterThan(0);
  await configureButtons.first().click();
  await expect(page.getByText("Configuring now", { exact: true })).toBeVisible();
  await expect(page.locator("[data-guided-configuration]")).toBeFocused();
  await page.locator('[data-action="confirm-guided-exercise"]').click();
  await expect(page.getByText(/Already added to Day 1/)).toBeVisible();
});

test("design-system source does not accumulate one-off styling", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");
  const style = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] || "";
  const structuralStyle = style.replace(/\[[^\]]*data-color-package[^\]]*\]\s*\{[^}]*\}/g, "");
  const metrics = {
    hexColors: (structuralStyle.match(/#[0-9a-f]{3,8}\b/gi) || []).length,
    rgbColors: (style.match(/rgba?\(/gi) || []).length,
    inlineStyles: (source.match(/\sstyle\s*=\s*["']/gi) || []).length,
    importantRules: (style.match(/!important\b/gi) || []).length
  };
  expect(metrics.hexColors, "replace new hard-coded colors with semantic tokens").toBeLessThanOrEqual(74);
  expect(metrics.rgbColors, "replace new rgb colors with semantic tokens").toBeLessThanOrEqual(40);
  expect(metrics.inlineStyles, "do not add inline presentation styles").toBeLessThanOrEqual(3);
  expect(metrics.importantRules, "avoid new specificity overrides").toBeLessThanOrEqual(17);
});

test("all confidence text retains contrast in every color package and theme", async ({ page }) => {
  const colorPackages = [
    "heritage-atlas",
    "signal-garden",
    "alpine-ledger",
    "training-hall",
    "harbor-pulse",
    "prairie-electric",
    "redwood-circuit",
    "mediterranean-set",
    "modern-primary",
    "night-stadium"
  ];
  const results = await page.evaluate(({ colorPackages }) => {
    const probeHost = document.createElement("div");
    probeHost.innerHTML = [1, 2, 3].map((level) => (
      `<section data-contrast-level="${level}">
        <span class="chip" data-conf="${level}" data-contrast-name="chip">Confidence ${level}</span>
        <div class="claim-card" data-conf="${level}">
          <span class="cc-title" data-contrast-name="cc-title">Today's target</span>
          <strong class="cc-value" data-contrast-name="cc-value">145 lb × 8 reps</strong>
          <span class="cc-why" data-contrast-name="cc-why">Confidence and evidence summary</span>
          <div class="claim-projection-grid">
            <div>
              <span class="claim-projection-label" data-contrast-name="claim-projection-label">Rest</span>
              <strong class="claim-projection-value" data-contrast-name="claim-projection-value">120 sec</strong>
            </div>
          </div>
          <div class="claim-projection-rule">
            <span data-contrast-name="claim-projection-rule-label">Next action</span>
            <strong data-contrast-name="claim-projection-rule-value">Progress after the completed range</strong>
          </div>
          <div class="prescription-base">
            <span data-contrast-name="prescription-base-label">Base prescription</span>
            <strong data-contrast-name="prescription-base-value">3 sets · 8 reps</strong>
          </div>
        </div>
        <article class="role-prescription" data-conf="${level}">
          <div class="role-prescription-heading">
            <span>Top set</span>
            <span class="role-confidence-label" data-contrast-name="role-confidence-label">Confidence ${level}</span>
          </div>
          <p class="role-evidence-copy" data-contrast-name="role-evidence-copy">Stored evidence for this role.</p>
        </article>
        <div class="rationale-heading" data-conf="${level}">
          <div>
            <strong class="evidence-confidence-label" data-contrast-name="evidence-confidence-label">Confidence ${level}</strong>
            <span class="evidence-confidence-copy" data-contrast-name="evidence-confidence-copy">Personal and research evidence</span>
          </div>
        </div>
      </section>`
    )).join("");
    document.body.append(probeHost);
    const parseColor = (value) => {
      const normalized = String(value);
      const channels = (normalized.match(/[\d.]+/g) || []).map(Number);
      const srgb = normalized.startsWith("color(srgb");
      return {
        red: (channels[0] || 0) * (srgb ? 255 : 1),
        green: (channels[1] || 0) * (srgb ? 255 : 1),
        blue: (channels[2] || 0) * (srgb ? 255 : 1),
        alpha: channels[3] ?? 1
      };
    };
    const composite = (foreground, background) => ({
      red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
      green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
      blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
      alpha: 1
    });
    const effectiveBackground = (element) => {
      const layers = [];
      for (let node = element; node && node !== document.body; node = node.parentElement) {
        layers.push(parseColor(getComputedStyle(node).backgroundColor));
      }
      let background = parseColor(getComputedStyle(document.body).backgroundColor);
      for (const layer of layers.reverse()) background = composite(layer, background);
      return background;
    };
    const luminance = (rgb) => rgb.reduce((sum, channel, index) => {
      const value = channel / 255;
      const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    const contrast = (foreground, background) => {
      const foregroundLuminance = luminance([foreground.red, foreground.green, foreground.blue]);
      const backgroundLuminance = luminance([background.red, background.green, background.blue]);
      return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
    };
    const measurements = [];
    for (const theme of ["dark", "light"]) {
      document.documentElement.dataset.theme = theme;
      for (const colorPackage of colorPackages) {
        document.documentElement.dataset.colorPackage = colorPackage;
        for (const element of probeHost.querySelectorAll("[data-contrast-name]")) {
          const background = effectiveBackground(element);
          const foreground = composite(parseColor(getComputedStyle(element).color), background);
          const levelHost = element.closest("[data-contrast-level]");
          measurements.push({
            theme,
            colorPackage,
            level: Number(levelHost.dataset.contrastLevel),
            selector: element.dataset.contrastName,
            ratio: contrast(foreground, background)
          });
        }
      }
    }
    probeHost.remove();
    return measurements;
  }, { colorPackages });

  for (const result of results) {
    expect(
      result.ratio,
      `${result.theme}/${result.colorPackage} confidence level ${result.level} ${result.selector} contrast`
    ).toBeGreaterThanOrEqual(4.5);
  }
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
  await nav.getByRole("button", { name: /Plan$/ }).click();
  await page.getByRole("button", { name: "Plan Your Mesocycle" }).click();
  await page.getByRole("button", { name: "Start planning" }).click();
  await page.getByLabel("Duration (weeks)").fill("4");
  await page.getByLabel("Training Days per Week").fill("4");
  await page.getByRole("button", { name: "Dumbbells" }).click();
  await page.getByRole("button", { name: "Rack" }).click();
  await expect(page.getByRole("button", { name: "Dumbbells" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "All Equipment / Standard Gym" }).click();
  await page.getByRole("button", { name: "Build the days" }).click();
  await expect(page.locator(".guided-build-step")).toBeVisible();
  expect(await page.locator(".guided-day").count()).toBe(4);
  await page.getByRole("button", { name: "Full weekly review" }).click();
  await expect(page.getByText("Weekly muscle volume", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check viability" }).click();
  await expect(page.locator(".guided-check-step")).toBeVisible();
  expect(await page.locator(".finding.blocking").count()).toBeGreaterThan(0);
  expect(await page.getByText("Passed Checks", { exact: true }).count()).toBe(0);
  if (process.env.PLAYWRIGHT_BASE_URL) console.log(`HOSTED_GUIDED_MESOCYCLE ${testInfo.project.name}: empty-day blocker and live weekly summary verified`);
});
