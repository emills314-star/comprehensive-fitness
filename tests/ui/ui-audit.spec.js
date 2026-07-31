const { test, expect } = require("@playwright/test");
const AxeBuilder = require("axe-core");
const fs = require("node:fs");
const path = require("node:path");

const tabs = ["Today", "Progress"];

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
    await expect(nav.getByRole("button")).toHaveCount(2);
    await expect(nav.getByRole("button", { name: /Plan$|More$/ })).toHaveCount(0);
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
    if (!process.env.CF_PHASE5_REVIEW_DIR && process.env.CF_APPEARANCE_PROTECTION === "1") {
      await expect(page).toHaveScreenshot(`${tabName.toLowerCase()}-${testInfo.project.name}.png`, {
        fullPage: true,
        animations: "disabled",
        maxDiffPixelRatio: 0.01
      });
    }
  });
}

test("contextual Routines initial frame stays progressive under large history", async ({ page }, testInfo) => {
  await page.goto("/?perf=1&perfFixture=large#routines");
  await page.waitForLoadState("load");
  await expect(page).toHaveURL(/#routines$/);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /Plan$|More$/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Routines", exact: true })).toBeVisible();

  const result = await page.evaluate(() => {
    const events = (window.__CF_PERF__ || []).filter((event) => event.label === "renderTotal:routines");
    return {
      duration: events.at(-1)?.duration ?? Number.POSITIVE_INFINITY,
      hiddenEditorBodies: document.querySelectorAll(".template-editor .disclosure-body").length
    };
  });

  console.log(`${testInfo.project.name} contextual Routines large-fixture render: ${result.duration.toFixed(1)} ms`);
  expect(result.duration).toBeLessThan(250);
  expect(result.hiddenEditorBodies).toBe(0);

  const editor = page.locator(".template-editor").first();
  await editor.locator("summary").click();
  await expect(editor.locator(".disclosure-body")).toHaveCount(1);
  await editor.locator("summary").click();
  await expect(editor.locator(".disclosure-body")).toHaveCount(0);
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
  const subFloorRem = [...style.matchAll(/font-size:\s*(0?\.\d+)rem/g)].filter((match) => Number(match[1]) < 0.75);
  const subFloorPx = [...style.matchAll(/font-size:\s*([0-9.]+)px/g)].filter((match) => Number(match[1]) < 12);
  expect(subFloorRem, "literal rem type must respect the 12px floor").toEqual([]);
  expect(subFloorPx, "literal pixel type must respect the 12px floor").toEqual([]);
  const directHexDeclarations = style.split(/\r?\n/).filter((line) => {
    const declarations = (line.includes("{") ? line.slice(line.indexOf("{") + 1) : line).split(";");
    return declarations.some((declaration) => {
      const match = declaration.match(/^\s*([-\w]+)\s*:\s*([^{}]*)$/);
      return Boolean(match && !match[1].startsWith("--") && /#[0-9a-f]{3,8}\b/i.test(match[2]));
    });
  });
  expect(directHexDeclarations, "component colors must consume semantic tokens").toEqual([]);
});

const polishVisualStates = [
  ["rest-rail-collapsed", '<details class="timer-bar" data-phase="resting"><summary class="timer-summary"><span class="timer-progress" style="--timer-progress:35%"><span></span></span><span class="timer-rest-copy"><span>Rest</span></span><strong>1:24</strong></summary></details>'],
  ["rest-rail-expanded", '<details class="timer-bar" data-phase="resting" open><summary class="timer-summary"><span class="timer-progress" style="--timer-progress:35%"><span></span></span><span class="timer-rest-copy"><span>Rest</span></span><strong>1:24</strong></summary><div class="timer-controls-panel"><div class="timer-primary-controls"><button>−15</button><button>+15</button><button>Skip</button></div><div class="timer-context">Next: Bench Press · In-app alert ready</div></div></details>'],
  ["rest-rail-final-10s", '<details class="timer-bar" data-phase="final"><summary class="timer-summary"><span class="timer-progress" style="--timer-progress:92%"><span></span></span><span class="timer-rest-copy"><span>Rest</span></span><strong>0:08</strong></summary></details>'],
  ["rest-rail-paused", '<details class="timer-bar" data-phase="resting" data-paused="true"><summary class="timer-summary"><span class="timer-progress" style="--timer-progress:48%"><span></span></span><span class="timer-rest-copy"><span>Paused</span></span><strong>0:47</strong></summary></details>'],
  ["reconcile-strip", '<div class="reconcile-strip" data-tone="over"><span class="reconcile-copy"><strong>195 lb × 8 logged</strong><small>10 lb above target · 2 sets remain</small></span><span class="reconcile-actions"><button class="primary-action">Apply to remaining</button><button class="mini-button">Just this set</button></span></div>'],
  ["caret-closed", '<details class="compact-disclosure"><summary>Section disclosure</summary></details>'],
  ["caret-open", '<details class="compact-disclosure" open><summary>Section disclosure</summary><div class="disclosure-body">Visible detail</div></details>'],
  ["range-bar-tones", '<div class="range-tone-specimen">' + ["on", "under", "over", "out", "none"].map((tone, index) => '<label>' + tone + '<span class="range-bar" data-tone="' + tone + '" style="--band-start:30%;--band-end:70%;--actual:' + (25 + index * 13) + '%"><i class="rb-band"></i><i class="rb-mark"></i></span></label>').join("") + '</div>'],
  ["plate-diagram", '<div class="plate-calculator"><strong>Plate calculator · 225 lb</strong><svg class="plate-diagram" viewBox="0 0 180 86"><line x1="8" y1="42" x2="170" y2="42"></line><rect class="plate-sleeve" x="18" y="36" width="24" height="12" rx="2"></rect><g class="plate plate-0"><rect x="42" y="15" width="10" height="54" rx="2"></rect></g><g class="plate plate-1"><rect x="54" y="21" width="8" height="42" rx="2"></rect></g></svg><span>Each side: 2 × 45</span></div>']
];

for (const [name, markup] of polishVisualStates) {
  test(`polish visual state: ${name}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Specimens render inside a fixed 360 px container, so a second project would only duplicate the mobile image.");
    test.skip(process.env.CF_APPEARANCE_PROTECTION !== "1", "Appearance comparison is owner-gated and platform-specific; baselines are captured on the owner's machine.");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("navigation", { name: "Main navigation" }).waitFor();
    await page.locator("body").evaluate((body, content) => {
      body.innerHTML = '<main id="polish-specimen" style="max-width:360px;padding:24px"></main>';
      document.getElementById("polish-specimen").innerHTML = content;
    }, markup);
    await expect(page.locator("#polish-specimen")).toHaveScreenshot(`polish-${name}.png`, { animations: "disabled" });
  });
}

test("the authoritative UI documentation remains present", async () => {
  const documentation = fs.readFileSync(path.join(__dirname, "..", "..", "docs", "UI_UX.md"), "utf8");
  for (const contract of ["Design system", "Accessibility", "weekly UI/UX audit", "Visual regression"]) {
    expect(documentation.toLowerCase()).toContain(contract.toLowerCase());
  }
});
