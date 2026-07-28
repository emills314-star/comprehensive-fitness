"use strict";

const { test, expect } = require("@playwright/test");
const AxeBuilder = require("axe-core");
const fs = require("node:fs");
const path = require("node:path");
const {
  ACTIVE_WORKOUT_TITLE,
  FIXED_NOW,
  LONG_EXERCISE_NAMES,
  LONG_HISTORY_TITLE,
  STORAGE_KEY,
  buildEmptyProtectedSurfaceFixture,
  buildProtectedSurfaceFixture
} = require("./fixtures/protected-surfaces.fixture");

const protectedCases = [
  { slug: "lift-desktop-1280-light", surface: "lift", viewport: { width: 1280, height: 900 }, theme: "light" },
  { slug: "dashboard-desktop-1280-light", surface: "dashboard", viewport: { width: 1280, height: 900 }, theme: "light" },
  { slug: "lift-mobile-320-light", surface: "lift", viewport: { width: 320, height: 720 }, theme: "light" },
  { slug: "dashboard-mobile-390-light", surface: "dashboard", viewport: { width: 390, height: 844 }, theme: "light" },
  { slug: "lift-tablet-768-light", surface: "lift", viewport: { width: 768, height: 1024 }, theme: "light" },
  { slug: "dashboard-tablet-768-light", surface: "dashboard", viewport: { width: 768, height: 1024 }, theme: "light" },
  { slug: "lift-desktop-1280-dark", surface: "lift", viewport: { width: 1280, height: 900 }, theme: "dark" },
  { slug: "dashboard-desktop-1280-dark", surface: "dashboard", viewport: { width: 1280, height: 900 }, theme: "dark" },
  { slug: "lift-desktop-200-percent-equivalent", surface: "lift", viewport: { width: 640, height: 450 }, theme: "light", zoomEquivalent: true },
  { slug: "dashboard-desktop-200-percent-equivalent", surface: "dashboard", viewport: { width: 640, height: 450 }, theme: "light", zoomEquivalent: true }
];

function desktopProjectOnly(testInfo) {
  test.skip(testInfo.project.name !== "desktop", "The protected matrix controls its own exact viewports from one deterministic Chromium project.");
}

function collectBrowserErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function installScenario(page, { fixture, viewport, theme = "light", malformedStorage = false }) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.addInitScript(({ fixedNow, storageKey, storedFixture, malformed }) => {
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
    localStorage.setItem(storageKey, malformed ? "{public-synthetic-malformed-json" : JSON.stringify(storedFixture));
  }, { fixedNow: FIXED_NOW, storageKey: STORAGE_KEY, storedFixture: fixture, malformed: malformedStorage });
  await page.goto("/");
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}input,textarea{caret-color:transparent!important}"
  });
}

async function openSurface(page, surface, { expandDashboard = false, liftHeading = ACTIVE_WORKOUT_TITLE } = {}) {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  let target = navigation.getByRole("button", { name: surface === "dashboard" ? /Progress$/ : /Today$/ });
  if (await target.count()) {
    await target.click();
    await expect(target).toHaveAttribute("aria-current", "page");
  } else if (surface === "dashboard") {
    await page.evaluate(() => { activeTab = "progress"; render(); });
    target = navigation.getByRole("button", { name: /Progress$/ });
    await expect(target).toHaveAttribute("aria-current", "page");
  } else {
    target = page.locator('[data-action="session-menu"]');
  }
  if (surface === "dashboard") {
    await page.locator('[data-action="set-progress-view"][data-progress-view="overview"]').click();
    await expect(page.locator(".progress-conclusion")).toBeVisible();
    if (expandDashboard) {
      const chest = page.locator('[data-action="toggle-volume-muscle"][data-muscle="Chest"]');
      await expect(chest).toHaveCount(1);
      await chest.click();
      await expect(chest).toHaveAttribute("aria-expanded", "true");
    }
  } else {
    await expect(page.getByRole("heading", { name: liftHeading, exact: true })).toBeVisible();
  }
  return target;
}

async function assertProtectedLayout(page, surface, expectedWidth, { requireProtectedTargets = true } = {}) {
  const layout = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const closedDisclosure = element.closest("details:not([open])");
      const visibleSummary = closedDisclosure?.querySelector(":scope > summary")?.contains(element);
      return (!closedDisclosure || visibleSummary) && style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const overflow = [...document.querySelectorAll("main *")]
      .filter(visible)
      .filter((element) => !["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName))
      .filter((element) => element.scrollWidth > element.clientWidth + 2)
      .filter((element) => !["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(element).overflowX))
      .slice(0, 10)
      .map((element) => {
        const rightEdge = element.getBoundingClientRect().right;
        const culprit = [...element.querySelectorAll("*")]
          .filter(visible)
          .map((child) => ({ child, overflow: child.getBoundingClientRect().right - rightEdge }))
          .sort((left, right) => right.overflow - left.overflow)[0];
        const culpritLabel = culprit?.overflow > 2 ? `>${culprit.child.tagName.toLowerCase()}.${String(culprit.child.className)}` : "";
        return `${element.tagName.toLowerCase()}.${String(element.className)}${culpritLabel}[${element.getAttribute("aria-label") || element.getAttribute("data-action") || "unlabelled"};${element.scrollWidth}/${element.clientWidth}]`;
      });
    const clippedTargets = [...document.querySelectorAll("button, input, select, textarea, summary, a[href]")]
      .filter(visible)
      .filter((element) => {
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          if (["auto", "scroll"].includes(getComputedStyle(ancestor).overflowX)) return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > innerWidth + 1;
      })
      .slice(0, 10)
      .map((element) => element.getAttribute("aria-label") || element.textContent.trim().slice(0, 80));
    const navTargets = [...document.querySelectorAll('nav[aria-label="Main navigation"] button')]
      .filter(visible)
      .map((element) => ({ label: element.getAttribute("aria-label"), height: element.getBoundingClientRect().height }));
    const protectedTargets = [...document.querySelectorAll(".volume-card-toggle, .check-button")]
      .filter(visible)
      .slice(0, 10)
      .map((element) => ({ label: element.getAttribute("aria-label") || element.textContent.trim().slice(0, 40), height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width }));
    return {
      clippedTargets,
      hasMain: Boolean(document.querySelector("main.app-main")),
      hasNavigation: Boolean(document.querySelector('nav[aria-label="Main navigation"]')),
      innerWidth,
      navTargets,
      overflow,
      protectedTargets
    };
  });
  expect(layout.innerWidth).toBe(expectedWidth);
  expect(layout.hasMain, "a named main landmark must remain present").toBe(true);
  expect(layout.hasNavigation, "primary navigation must be absent only from the active workout shell").toBe(surface !== "lift");
  expect(layout.overflow, `${surface} must not introduce horizontal content overflow`).toEqual([]);
  expect(layout.clippedTargets, `${surface} controls must remain inside the viewport`).toEqual([]);
  expect(layout.navTargets).toHaveLength(surface === "lift" ? 0 : 4);
  if (surface !== "lift") {
    expect(layout.navTargets.every((target) => target.height >= 44), "primary navigation targets must remain at least 44 CSS px tall").toBe(true);
  }
  if (requireProtectedTargets) {
    expect(layout.protectedTargets.length).toBeGreaterThan(0);
    expect(layout.protectedTargets.every((target) => target.height >= 44 && target.width >= 44), "critical Lift/Dashboard controls must retain 44 CSS px targets").toBe(true);
  }
}

async function assertVisibleKeyboardFocus(page, navTarget) {
  await page.keyboard.press("Tab");
  await navTarget.focus();
  const focus = await navTarget.evaluate((element) => {
    const style = getComputedStyle(element);
    return { focusVisible: element.matches(":focus-visible"), outlineWidth: style.outlineWidth };
  });
  expect(focus.focusVisible, "the protected tab must expose a keyboard-visible focus state").toBe(true);
  expect(Number.parseFloat(focus.outlineWidth), "the protected tab focus ring must be visibly thick").toBeGreaterThanOrEqual(2);
  await page.evaluate(() => document.activeElement?.blur());
}

async function assertProtectedFactsPresent(page, surface, viewportWidth) {
  if (surface === "lift") {
    await expect(page.locator(".active-workout-hero")).toBeVisible();
    await expect(page.locator(".exercise-card.active-exercise")).toHaveCount(1);
    const sessionDock = page.locator(".session-dock");
    await expect(sessionDock.getByText("2 of 9 sets", { exact: true })).toBeVisible();
    await expect(sessionDock.getByText("32m elapsed", { exact: true })).toBeVisible();
    await expect(page.getByText("2 of 9 sets", { exact: true })).toHaveCount(1);
    await expect(page.getByText("32m elapsed", { exact: true })).toHaveCount(1);
    if (viewportWidth <= 719) {
      await expect(page.locator(".active-workout-hero .workout-status-strip")).toBeHidden();
      await expect(page.getByText(/6 working sets remain/)).toBeVisible();
    }
    await expect(page.getByLabel("Exercise name").filter({ hasText: LONG_EXERCISE_NAMES.chest })).toHaveCount(1);
    await expect(page.getByText("Previous", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Set options").first()).toBeVisible();
  } else {
    await expect(page.locator(".progress-switcher")).toBeVisible();
    await expect(page.locator(".progress-conclusion")).toContainText("volume and fatigue signals");
    const recentTitle = page.locator(".recent-history-title").filter({ hasText: LONG_HISTORY_TITLE });
    await expect(recentTitle).toHaveCount(1);
    await expect(recentTitle).toBeVisible();
    await expect(page.locator(".volume-table-entry.expanded")).toContainText(LONG_EXERCISE_NAMES.chest);
    const chestFatigueFlag = page.locator('[data-action="open-fatigue-flag"][data-flag-id="muscle-chest-volume"]');
    await expect(chestFatigueFlag).toHaveCount(1);
    await expect(chestFatigueFlag).toContainText("Weekly volume exceeded the planned range.");
  }
}

test.describe("Lift and Dashboard capability and accessibility invariants", () => {
  for (const scenario of protectedCases) {
    test(`${scenario.slug} retains facts, capability, accessibility, and responsive layout`, async ({ page }, testInfo) => {
      desktopProjectOnly(testInfo);
      test.setTimeout(90_000);
      const browserErrors = collectBrowserErrors(page);
      await installScenario(page, {
        fixture: buildProtectedSurfaceFixture({ theme: scenario.theme }),
        viewport: scenario.viewport,
        theme: scenario.theme
      });
      const navTarget = await openSurface(page, scenario.surface, { expandDashboard: scenario.surface === "dashboard" });
      await assertProtectedFactsPresent(page, scenario.surface, scenario.viewport.width);
      await assertProtectedLayout(page, scenario.surface, scenario.viewport.width);
      await assertVisibleKeyboardFocus(page, navTarget);
      if (scenario.zoomEquivalent) {
        expect(scenario.viewport.width * 2, "640 CSS px represents a 1280 px desktop viewport at 200% zoom").toBe(1280);
      }
      expect(browserErrors, "protected surface browser errors").toEqual([]);
      const reviewSlugs = new Set([
        "lift-desktop-1280-light", "lift-mobile-320-light", "lift-tablet-768-light",
        "lift-desktop-1280-dark", "lift-desktop-200-percent-equivalent",
        "dashboard-desktop-1280-light", "dashboard-mobile-390-light", "dashboard-tablet-768-light"
      ]);
      if (process.env.CF_PHASE5_REVIEW_DIR && reviewSlugs.has(scenario.slug)) {
        fs.mkdirSync(process.env.CF_PHASE5_REVIEW_DIR, { recursive: true });
        await page.screenshot({
          path: path.join(process.env.CF_PHASE5_REVIEW_DIR, `protected-${scenario.slug}.png`),
          fullPage: true,
          animations: "disabled",
          caret: "hide"
        });
      }
    });
  }

  test("primary Lift and Dashboard interactions preserve facts, status, and focus", async ({ page }, testInfo) => {
    desktopProjectOnly(testInfo);
    test.setTimeout(90_000);
    const browserErrors = collectBrowserErrors(page);
    await installScenario(page, {
      fixture: buildProtectedSurfaceFixture(),
      viewport: { width: 1280, height: 900 }
    });

    await openSurface(page, "lift");
    const nextSet = page.locator('[data-action="toggle-set"][data-set-id="public-synthetic-active-exercise-1-set-2"]');
    await expect(nextSet).toHaveCount(1);
    await expect(nextSet).toHaveAttribute("aria-pressed", "false");
    await nextSet.click();
    await expect(nextSet).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".session-dock").getByText("3 of 9 sets", { exact: true })).toBeVisible();
    await expect(page.getByText("3 of 9 sets", { exact: true })).toHaveCount(1);
    await expect(page.locator(".timer-bar")).toHaveCount(0);

    await openSurface(page, "dashboard");
    const chest = page.locator('[data-action="toggle-volume-muscle"][data-muscle="Chest"]');
    await chest.click();
    await expect(chest).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".volume-table-entry.expanded")).toContainText(LONG_EXERCISE_NAMES.chest);
    const fatigue = page.locator('[data-action="open-fatigue-flag"]').first();
    await fatigue.click();
    await expect(page.locator(".dashboard-detail-view")).toBeVisible();
    const back = page.getByRole("button", { name: "Back", exact: true });
    await back.click();
    await expect(page.locator(".progress-conclusion")).toBeVisible();
    expect(browserErrors, "protected interaction browser errors").toEqual([]);
  });

  test("empty Lift state stays readable at 390 px", async ({ page }, testInfo) => {
    desktopProjectOnly(testInfo);
    test.setTimeout(90_000);
    const browserErrors = collectBrowserErrors(page);
    await installScenario(page, {
      fixture: buildEmptyProtectedSurfaceFixture(),
      viewport: { width: 390, height: 844 }
    });
    await openSurface(page, "lift", { liftHeading: "Today" });
    await expect(page.locator(".coach-lead")).toBeVisible();
    if (process.env.CF_PHASE5_REVIEW_DIR) {
      fs.mkdirSync(process.env.CF_PHASE5_REVIEW_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.CF_PHASE5_REVIEW_DIR, "protected-lift-empty-mobile-390.png"), fullPage: true, animations: "disabled", caret: "hide" });
    }
    expect(browserErrors, "empty Lift browser errors").toEqual([]);
  });

  test("empty Dashboard state stays readable at 390 px", async ({ page }, testInfo) => {
    desktopProjectOnly(testInfo);
    test.setTimeout(90_000);
    const browserErrors = collectBrowserErrors(page);
    await installScenario(page, {
      fixture: buildEmptyProtectedSurfaceFixture(),
      viewport: { width: 390, height: 844 }
    });
    await openSurface(page, "dashboard");
    await expect(page.getByText("Log a working set to start your weekly volume dashboard.", { exact: true })).toBeVisible();
    await expect(page.getByText("No saved workouts yet.", { exact: true })).toBeVisible();
    await assertProtectedLayout(page, "dashboard empty state", 390, { requireProtectedTargets: false });
    if (process.env.CF_PHASE5_REVIEW_DIR) {
      fs.mkdirSync(process.env.CF_PHASE5_REVIEW_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.CF_PHASE5_REVIEW_DIR, "protected-dashboard-empty-mobile-390.png"), fullPage: true, animations: "disabled", caret: "hide" });
    }
    expect(browserErrors, "empty Dashboard browser errors").toEqual([]);
  });

  test("Lift and Dashboard retain WCAG contrast across all color packages and both themes", async ({ page }, testInfo) => {
    desktopProjectOnly(testInfo);
    test.setTimeout(180_000);
    await installScenario(page, {
      fixture: buildProtectedSurfaceFixture(),
      viewport: { width: 390, height: 844 }
    });
    await page.addScriptTag({ content: AxeBuilder.source });
    const colorPackages = [
      "heritage-atlas", "signal-garden", "alpine-ledger", "training-hall", "harbor-pulse",
      "prairie-electric", "redwood-circuit", "mediterranean-set", "modern-primary", "night-stadium"
    ];
    const contrastFailures = [];
    const dockAndGlyphContrast = [];
    const navigationHierarchyFailures = [];
    for (const theme of ["light", "dark"]) {
      for (const colorPackage of colorPackages) {
        for (const surface of ["lift", "dashboard"]) {
          await page.evaluate(({ colorPackage, surface, theme }) => {
            document.documentElement.dataset.colorPackage = colorPackage;
            document.documentElement.dataset.theme = theme;
            activeTab = surface === "lift" ? "today" : "progress";
            if (surface === "dashboard") progressView = "overview";
            render();
          }, { colorPackage, surface, theme });
          const violations = await page.evaluate(async () => (await axe.run(document, {
            runOnly: { type: "rule", values: ["color-contrast"] }
          })).violations);
          if (violations.length) {
            contrastFailures.push({
              colorPackage,
              surface,
              theme,
              targets: violations.flatMap((violation) => violation.nodes.map((node) => node.target.join(" ")))
            });
          }
          if (surface === "lift") {
            const samples = await page.evaluate(() => {
              const parseColor = (value) => {
                const parts = String(value).match(/[\d.]+/g)?.map(Number) || [];
                return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts.length > 3 ? parts[3] : 1 };
              };
              const composite = (foreground, background) => {
                const alpha = foreground.a + background.a * (1 - foreground.a);
                if (!alpha) return { r: 255, g: 255, b: 255, a: 1 };
                return {
                  r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
                  g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
                  b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
                  a: alpha
                };
              };
              const effectiveBackground = (element) => {
                const layers = [];
                for (let node = element; node; node = node.parentElement) layers.push(parseColor(getComputedStyle(node).backgroundColor));
                let color = { r: 255, g: 255, b: 255, a: 1 };
                for (const layer of layers.reverse()) color = composite(layer, color);
                return color;
              };
              const luminance = (color) => {
                const channel = (value) => {
                  const normalized = value / 255;
                  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
                };
                return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
              };
              const ratio = (foreground, background) => {
                const first = luminance(foreground);
                const second = luminance(background);
                return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
              };
              const sample = (name, selector) => {
                const element = document.querySelector(selector);
                if (!element) return { name, missing: true };
                const foreground = parseColor(getComputedStyle(element).color);
                const background = effectiveBackground(element);
                return {
                  name,
                  foreground: `rgb(${Math.round(foreground.r)}, ${Math.round(foreground.g)}, ${Math.round(foreground.b)})`,
                  background: `rgb(${Math.round(background.r)}, ${Math.round(background.g)}, ${Math.round(background.b)})`,
                  ratio: Number(ratio(foreground, background).toFixed(2))
                };
              };
              return [
                sample("finish", ".session-dock-finish"),
                sample("grip", ".exercise-grip"),
                sample("exercise-overflow", ".exercise-overflow > summary"),
                sample("session-overflow", ".session-dock-overflow > summary")
              ];
            });
            dockAndGlyphContrast.push({ colorPackage, theme, samples });
          }
          if (surface === "dashboard") {
            const hierarchy = await page.evaluate(() => {
              const navigation = document.querySelector(".bottom-nav");
              const active = navigation?.querySelector('.nav-button[aria-current="page"]');
              const inactive = [...(navigation?.querySelectorAll(".nav-button:not([aria-current])") || [])];
              const activeStyle = active ? getComputedStyle(active) : null;
              return {
                activeColor: activeStyle?.color || "",
                activeBorderColor: activeStyle?.borderColor || "",
                activeWeight: Number(activeStyle?.fontWeight || 0),
                inactive: inactive.map((button) => {
                  const style = getComputedStyle(button);
                  return { color: style.color, weight: Number(style.fontWeight || 0) };
                })
              };
            });
            const invalid = !hierarchy.activeColor
              || hierarchy.activeBorderColor !== hierarchy.activeColor
              || hierarchy.activeWeight !== 900
              || hierarchy.inactive.length !== 3
              || hierarchy.inactive.some((item) => item.color === hierarchy.activeColor || item.weight !== 850);
            if (invalid) navigationHierarchyFailures.push({ colorPackage, theme, hierarchy });
          }
        }
      }
    }
    console.log(`DOCK_GLYPH_CONTRAST ${JSON.stringify(dockAndGlyphContrast)}`);
    expect(contrastFailures, "every Lift/Dashboard package and theme must meet WCAG contrast").toEqual([]);
    expect(dockAndGlyphContrast.flatMap((entry) => entry.samples.filter((sample) => sample.name === "finish" && (sample.missing || sample.ratio < 4.5)).map((sample) => ({ ...entry, samples: [sample] }))), "Finish must retain 4.5:1 text contrast across every package and theme").toEqual([]);
    expect(dockAndGlyphContrast.flatMap((entry) => entry.samples.filter((sample) => sample.name !== "finish" && (sample.missing || sample.ratio < 3)).map((sample) => ({ ...entry, samples: [sample] }))), "22 px grip and overflow glyphs must retain 3:1 non-text contrast across every package and theme").toEqual([]);
    expect(navigationHierarchyFailures, "inactive navigation must remain visually subordinate while the bordered active tab carries state").toEqual([]);
  });

  test("Lift targets remain 44 CSS px with no clipping at 320 px and 200 percent text", async ({ page }, testInfo) => {
    desktopProjectOnly(testInfo);
    await installScenario(page, {
      fixture: buildProtectedSurfaceFixture(),
      viewport: { width: 320, height: 720 }
    });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.evaluate(() => render());
    const targets = await page.evaluate(() => [...document.querySelectorAll(".exercise-overflow > summary, .session-overflow > summary, .check-button")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, width: rect.width, name: element.getAttribute("aria-label") || element.dataset.action };
      }));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.filter((target) => target.height < 44 || target.width < 44), "all visible Lift targets must remain at least 44 CSS px").toEqual([]);
    await assertProtectedLayout(page, "lift", 320);
  });

  test("restructured populated Lift and Dashboard materially reduce page height", async ({ page }, testInfo) => {
    desktopProjectOnly(testInfo);
    await installScenario(page, {
      fixture: buildProtectedSurfaceFixture(),
      viewport: { width: 320, height: 720 }
    });
    await openSurface(page, "lift");
    const liftHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 390, height: 844 });
    await openSurface(page, "dashboard", { expandDashboard: true });
    const dashboardHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(`PHASE_RESTRUCTURE_HEIGHTS lift320=${liftHeight} dashboard390=${dashboardHeight}`);
    expect(liftHeight, "populated Lift must fall materially below its 4029 px pre-restructure height").toBeLessThan(3425);
    expect(dashboardHeight, "populated Dashboard must fall materially below its 2994 px pre-restructure height").toBeLessThan(2545);
  });

  test("keyboard traversal excludes closed overflow actions and reaches them when opened", async ({ page }, testInfo) => {
    desktopProjectOnly(testInfo);
    await installScenario(page, {
      fixture: buildProtectedSurfaceFixture(),
      viewport: { width: 320, height: 720 }
    });
    const exerciseMenu = page.locator(".exercise-overflow > summary").first();
    const hiddenMove = page.locator('[data-action="move-exercise"]').first();
    await expect(exerciseMenu).toBeVisible();
    await expect(hiddenMove).toBeHidden();
    await exerciseMenu.focus();
    await page.keyboard.press("Enter");
    await expect(hiddenMove).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(hiddenMove).toBeFocused();
  });

  test("workout cancellation remains an explicit overflow action with destructive confirmation", async ({ page }, testInfo) => {
    desktopProjectOnly(testInfo);
    await installScenario(page, {
      fixture: buildProtectedSurfaceFixture(),
      viewport: { width: 320, height: 720 }
    });
    const menu = page.locator('[data-action="session-menu"]');
    await menu.scrollIntoViewIfNeeded();
    await menu.click();
    const cancel = page.getByRole("button", { name: "Cancel workout", exact: true });
    await expect(cancel).toBeVisible();
    await cancel.click();
    const dialog = page.getByRole("dialog", { name: "Cancel this workout?", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Keep Workout", exact: true })).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Discard Workout", exact: true })).toBeVisible();
  });

  test("session dock retains fixed geometry, target size, and keyboard order at 320 px and 200 percent text", async ({ page }, testInfo) => {
    desktopProjectOnly(testInfo);
    await installScenario(page, {
      fixture: buildProtectedSurfaceFixture(),
      viewport: { width: 320, height: 720 }
    });
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
    const dock = page.getByRole("complementary", { name: "Workout session controls" });
    const finish = dock.getByRole("button", { name: "Finish", exact: true });
    const menu = dock.locator('[data-action="session-menu"]');
    const cancel = dock.getByRole("button", { name: "Cancel workout", exact: true });
    await expect(dock).toBeVisible();
    await expect(cancel, "Closed overflow items must be excluded from traversal").toBeHidden();
    await finish.focus();
    await page.keyboard.press("Tab");
    await expect(menu).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(dock.getByRole("button", { name: "Save as template", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancel).toBeFocused();

    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.evaluate(() => render());
    const scaledDock = page.getByRole("complementary", { name: "Workout session controls" });
    const scaledMenu = scaledDock.locator('[data-action="session-menu"]');
    await scaledMenu.click();
    const geometry = await page.evaluate(() => {
      const dockElement = document.querySelector(".session-dock");
      const finish = dockElement.querySelector(".session-dock-finish");
      const finishText = finish?.firstChild;
      const range = finishText ? document.createRange() : null;
      if (range && finishText) range.selectNodeContents(finishText);
      const controls = [...dockElement.querySelectorAll("button, summary")].filter((element) => getComputedStyle(element).display !== "none");
      return {
        position: getComputedStyle(dockElement).position,
        bottom: Math.round(innerHeight - dockElement.getBoundingClientRect().bottom),
        documentWidth: document.documentElement.scrollWidth,
        elapsedText: dockElement.querySelector("[data-session-dock-elapsed]")?.textContent || "",
        finishTextLines: range ? range.getClientRects().length : 0,
        finishWhiteSpace: finish ? getComputedStyle(finish).whiteSpace : "",
        controls: controls.map((element) => {
          const rect = element.getBoundingClientRect();
          return { action: element.dataset.action, width: Math.round(rect.width), height: Math.round(rect.height), left: Math.round(rect.left), right: Math.round(rect.right) };
        })
      };
    });
    console.log(`SESSION_DOCK_GEOMETRY ${JSON.stringify(geometry)}`);
    expect(geometry.position).toBe("fixed");
    expect(geometry.bottom).toBe(0);
    expect(geometry.documentWidth).toBeLessThanOrEqual(320);
    expect(geometry.finishTextLines, "Finish must render as one unbroken line at 320 px and 200 percent text").toBe(1);
    expect(geometry.finishWhiteSpace).toBe("nowrap");
    expect(geometry.elapsedText).not.toMatch(/elapsed\s+elapsed/i);
    for (const control of geometry.controls) {
      expect.soft(control.width, `${control.action} must remain at least 44 CSS px wide`).toBeGreaterThanOrEqual(44);
      expect.soft(control.height, `${control.action} must remain at least 44 CSS px tall`).toBeGreaterThanOrEqual(44);
      expect.soft(control.left, `${control.action} must not clip left`).toBeGreaterThanOrEqual(0);
      expect.soft(control.right, `${control.action} must not clip right`).toBeLessThanOrEqual(320);
    }
  });

  test("populated Lift review capture includes the session dock at 320 px and 200 percent text", async ({ page }, testInfo) => {
    desktopProjectOnly(testInfo);
    test.skip(!process.env.CF_PHASE5_REVIEW_DIR, "Review-only artefact capture");
    await installScenario(page, {
      fixture: buildProtectedSurfaceFixture(),
      viewport: { width: 320, height: 720 }
    });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.evaluate(() => render());
    await expect(page.locator(".session-dock")).toBeVisible();
    fs.mkdirSync(process.env.CF_PHASE5_REVIEW_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(process.env.CF_PHASE5_REVIEW_DIR, "protected-lift-mobile-320-light-200-percent-text.png"),
      fullPage: true,
      animations: "disabled",
      caret: "hide"
    });
  });

  test("malformed local storage fails closed into a usable empty Dashboard", async ({ page }, testInfo) => {
    desktopProjectOnly(testInfo);
    test.setTimeout(90_000);
    const browserErrors = collectBrowserErrors(page);
    await installScenario(page, {
      fixture: null,
      malformedStorage: true,
      viewport: { width: 390, height: 844 }
    });
    await openSurface(page, "dashboard");
    await expect(page.getByText("Log a working set to start your weekly volume dashboard.", { exact: true })).toBeVisible();
    await expect(page.getByText("No saved workouts yet.", { exact: true })).toBeVisible();
    await assertProtectedLayout(page, "Dashboard malformed-storage recovery", 390, { requireProtectedTargets: false });
    expect(browserErrors, "malformed-storage recovery browser errors").toEqual([]);
  });

  test("public fixture and visual contract contain no private-data or hostile local paths", async ({}, testInfo) => {
    desktopProjectOnly(testInfo);
    const files = [
      path.join(__dirname, "protected-surfaces.spec.js"),
      path.join(__dirname, "fixtures", "protected-surfaces.fixture.js")
    ];
    const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    expect(source).toContain("Public Synthetic");
    const forbiddenFragments = [
      "C:" + "\\Users\\",
      "/" + "Users/",
      "private-" + "personal-data",
      "personal_fitness_data/" + "raw",
      "personal_fitness_data/" + "normalized",
      "personal_fitness_data/" + "derived",
      "personal_fitness_data/" + "reports",
      "strong_" + "workouts",
      "fit" + "bit",
      "nutrition " + "export"
    ];
    for (const fragment of forbiddenFragments) expect(source.toLowerCase()).not.toContain(fragment.toLowerCase());
  });
});
