"use strict";

const { test, expect } = require("@playwright/test");
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
  const target = navigation.getByRole("button", { name: surface === "dashboard" ? /Dashboard$/ : /Workout$/ });
  await target.click();
  await expect(target).toHaveAttribute("aria-current", "page");
  if (surface === "dashboard") {
    await expect(page.getByRole("heading", { name: "Volume and fatigue", exact: true })).toBeVisible();
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
      .filter((element) => !["auto", "scroll"].includes(getComputedStyle(element).overflowX))
      .filter((element) => {
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          if (["auto", "scroll"].includes(getComputedStyle(ancestor).overflowX)) return false;
        }
        const rect = element.getBoundingClientRect();
        return document.documentElement.scrollWidth > innerWidth + 2 || rect.left < -1 || rect.right > innerWidth + 1;
      })
      .slice(0, 10)
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.className)}[${element.getAttribute("aria-label") || element.getAttribute("data-action") || "unlabelled"};${element.scrollWidth}/${element.clientWidth}]`);
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
  expect(layout.hasNavigation, "a named primary navigation landmark must remain present").toBe(true);
  expect(layout.overflow, `${surface} must not introduce horizontal content overflow`).toEqual([]);
  expect(layout.clippedTargets, `${surface} controls must remain inside the viewport`).toEqual([]);
  expect(layout.navTargets).toHaveLength(5);
  expect(layout.navTargets.every((target) => target.height >= 44), "primary navigation targets must remain at least 44 CSS px tall").toBe(true);
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

async function assertRichLabels(page, surface) {
  if (surface === "lift") {
    await expect(page.getByText("2/9 sets", { exact: true })).toBeVisible();
    await expect(page.getByText("32m elapsed", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Exercise name").filter({ hasText: LONG_EXERCISE_NAMES.chest })).toHaveCount(1);
    await expect(page.getByText("Last time", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Next increment", { exact: true }).first()).toBeVisible();
  } else {
    await expect(page.locator('[data-action="open-dashboard-detail"][data-detail="sessions"]')).toContainText("3");
    const recentTitle = page.locator(".recent-history-title").filter({ hasText: LONG_HISTORY_TITLE });
    await expect(recentTitle).toHaveCount(1);
    await expect(recentTitle).toBeVisible();
    await expect(page.locator(".volume-card.expanded")).toContainText(LONG_EXERCISE_NAMES.chest);
    const chestFatigueFlag = page.locator('[data-action="open-fatigue-flag"][data-flag-id="family-chest-volume"]');
    await expect(chestFatigueFlag).toHaveCount(1);
    await expect(chestFatigueFlag).toContainText("Chest weekly volume exceeded its family-level range.");
  }
}

test.describe("protected Lift and Dashboard visual baselines", () => {
  for (const scenario of protectedCases) {
    test(`${scenario.slug} preserves rich appearance and layout`, async ({ page }, testInfo) => {
      desktopProjectOnly(testInfo);
      test.setTimeout(90_000);
      const browserErrors = collectBrowserErrors(page);
      await installScenario(page, {
        fixture: buildProtectedSurfaceFixture({ theme: scenario.theme }),
        viewport: scenario.viewport,
        theme: scenario.theme
      });
      const navTarget = await openSurface(page, scenario.surface, { expandDashboard: scenario.surface === "dashboard" });
      await assertRichLabels(page, scenario.surface);
      await assertProtectedLayout(page, scenario.surface, scenario.viewport.width);
      await assertVisibleKeyboardFocus(page, navTarget);
      if (scenario.zoomEquivalent) {
        expect(scenario.viewport.width * 2, "640 CSS px represents a 1280 px desktop viewport at 200% zoom").toBe(1280);
      }
      expect(browserErrors, "protected surface browser errors").toEqual([]);
      await expect(page).toHaveScreenshot(`protected-${scenario.slug}.png`, {
        fullPage: true,
        animations: "disabled",
        caret: "hide",
        scale: "css",
        maxDiffPixelRatio: 0.003
      });
    });
  }

  test("primary Lift and Dashboard interactions preserve status, labels, and focus", async ({ page }, testInfo) => {
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
    await expect(page.getByText("3/9 sets", { exact: true })).toBeVisible();
    await expect(page.locator(".timer-bar")).toHaveCount(0);

    await openSurface(page, "dashboard");
    const chest = page.locator('[data-action="toggle-volume-muscle"][data-muscle="Chest"]');
    await chest.click();
    await expect(chest).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".volume-card.expanded")).toContainText(LONG_EXERCISE_NAMES.chest);
    const sessions = page.locator('[data-action="open-dashboard-detail"][data-detail="sessions"]');
    await sessions.click();
    await expect(page.getByRole("heading", { name: "Logged sessions", exact: true })).toBeVisible();
    const loggedSessionTitle = page.locator('.drilldown-item[data-action="open-dashboard-session"] strong').filter({ hasText: LONG_HISTORY_TITLE });
    await expect(loggedSessionTitle).toHaveCount(1);
    await expect(loggedSessionTitle).toBeVisible();
    const back = page.getByRole("button", { name: "Back", exact: true });
    await back.click();
    await expect(page.getByRole("heading", { name: "Volume and fatigue", exact: true })).toBeVisible();
    expect(browserErrors, "protected interaction browser errors").toEqual([]);
  });

  test("empty Lift and Dashboard states stay readable at 390 px", async ({ page }, testInfo) => {
    desktopProjectOnly(testInfo);
    test.setTimeout(90_000);
    const browserErrors = collectBrowserErrors(page);
    await installScenario(page, {
      fixture: buildEmptyProtectedSurfaceFixture(),
      viewport: { width: 390, height: 844 }
    });
    await openSurface(page, "lift", { liftHeading: "Program overview" });
    await expect(page).toHaveScreenshot("protected-lift-empty-mobile-390.png", { fullPage: true, animations: "disabled", caret: "hide", scale: "css", maxDiffPixelRatio: 0.003 });
    await openSurface(page, "dashboard");
    await expect(page.getByText("Log a working set to start your weekly volume dashboard.", { exact: true })).toBeVisible();
    await expect(page.getByText("No saved workouts yet.", { exact: true })).toBeVisible();
    await assertProtectedLayout(page, "dashboard empty state", 390, { requireProtectedTargets: false });
    await expect(page).toHaveScreenshot("protected-dashboard-empty-mobile-390.png", { fullPage: true, animations: "disabled", caret: "hide", scale: "css", maxDiffPixelRatio: 0.003 });
    expect(browserErrors, "empty-state browser errors").toEqual([]);
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
