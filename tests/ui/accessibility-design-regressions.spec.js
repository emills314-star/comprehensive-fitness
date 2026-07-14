"use strict";

const { test, expect } = require("@playwright/test");
const {
  ACTIVE_SESSION_ID,
  FIXED_NOW,
  LONG_EXERCISE_NAMES,
  STORAGE_KEY,
  buildProtectedSurfaceFixture
} = require("./fixtures/protected-surfaces.fixture");

const PRIMARY_TABS = [
  { id: "dashboard", view: ".dashboard-view" },
  { id: "plan", view: ".templates-view" },
  { id: "charts", view: ".charts-view" },
  { id: "data", view: ".settings-view" },
  { id: "lift", view: ".workout-view" }
];

function focusedFixture({ activeWorkout = true, includeHistory = true } = {}) {
  const fixture = buildProtectedSurfaceFixture({ theme: "light" });
  const retainedSessionIds = new Set(includeHistory ? ["public-synthetic-history-session-00"] : []);
  if (activeWorkout) retainedSessionIds.add(ACTIVE_SESSION_ID);
  const retainedExercises = fixture.exercises.filter((exercise) => retainedSessionIds.has(exercise.sessionId));
  const retainedExerciseIds = new Set(retainedExercises.map((exercise) => exercise.id));
  return {
    ...fixture,
    sessions: fixture.sessions.filter((session) => retainedSessionIds.has(session.id)),
    exercises: retainedExercises,
    sets: fixture.sets.filter((set) => retainedExerciseIds.has(set.exerciseId)),
    settings: {
      ...fixture.settings,
      autoScrollNextSet: true,
      autoStartRestTimer: false,
      availableEquipment: ["all"]
    }
  };
}

async function installScenario(page, options = {}) {
  const fixture = focusedFixture({
    activeWorkout: options.activeWorkout !== false,
    includeHistory: options.includeHistory !== false
  });
  if (options.viewport) await page.setViewportSize(options.viewport);
  await page.emulateMedia({
    colorScheme: "light",
    forcedColors: options.forcedColors || "none",
    reducedMotion: options.reducedMotion || "reduce"
  });
  await page.addInitScript(({ fixedNow, storageKey, storedFixture }) => {
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
    localStorage.setItem(storageKey, JSON.stringify(storedFixture));
  }, { fixedNow: FIXED_NOW, storageKey: STORAGE_KEY, storedFixture: fixture });
  await page.goto("/");
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  return fixture;
}

function primaryTab(page, tabId) {
  return page.locator(`[data-action="set-tab"][data-tab="${tabId}"]`);
}

async function openPrimaryTab(page, tabId) {
  const target = primaryTab(page, tabId);
  await expect(target).toHaveCount(1);
  await target.click();
  await expect(target).toHaveAttribute("aria-current", "page");
  return target;
}

async function expectDialogTrap(page, dialog, expectedInitialFocus) {
  await expect(dialog).toBeVisible();
  await expect.soft(expectedInitialFocus, "A dialog must place initial focus on its safe primary action").toBeFocused({ timeout: 1_500 });
  const focusable = dialog.locator("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
  const count = await focusable.count();
  expect(count, "The reachable dialog must contain at least two focusable controls").toBeGreaterThanOrEqual(2);
  const first = focusable.nth(0);
  const last = focusable.nth(count - 1);

  await last.focus();
  await page.keyboard.press("Tab");
  await expect(first, "Tab from the final dialog control must wrap to the first").toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(last, "Shift+Tab from the first dialog control must wrap to the final control").toBeFocused();
}

async function activeFocusState(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    const main = document.querySelector("#main-content");
    return {
      activeTag: active?.tagName || "",
      activeAction: active?.getAttribute?.("data-action") || "",
      focusInMain: Boolean(active && main && (active === main || main.contains(active)) && active !== document.body)
    };
  });
}

async function documentOverflow(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const offenders = [...document.body.querySelectorAll("*")]
      .filter(visible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > innerWidth + 1;
      })
      .slice(0, 12)
      .map((element) => ({
        action: element.getAttribute("data-action") || "",
        className: String(element.className || ""),
        label: element.getAttribute("aria-label") || element.textContent.trim().slice(0, 60),
        tag: element.tagName.toLowerCase()
      }));
    return {
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      innerWidth,
      offenders
    };
  });
}

test("keyboard-visible skip link activates and focuses the canonical main-content target", async ({ page }) => {
  await installScenario(page);
  const skipLink = page.getByRole("link", { name: /skip.*content/i });
  const main = page.locator("#main-content");
  await expect(skipLink, "A skip link must be present before the application header controls").toHaveCount(1);
  await expect(skipLink).toHaveAttribute("href", "#main-content");
  await expect(main, "The skip link destination must be the unique canonical main landmark").toHaveCount(1);

  await page.keyboard.press("Tab");
  await expect(skipLink, "The first keyboard stop must be the skip link").toBeFocused();
  await expect(skipLink, "The skip link must become visible when keyboard focused").toBeVisible();
  const focusAppearance = await skipLink.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      inViewport: rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth) || 0
    };
  });
  expect(focusAppearance.focusVisible).toBe(true);
  expect(focusAppearance.inViewport).toBe(true);
  expect(focusAppearance.outlineStyle).not.toBe("none");
  expect(focusAppearance.outlineWidth).toBeGreaterThanOrEqual(2);

  await page.keyboard.press("Enter");
  await expect(main, "Activating the skip link must move focus, not only update the URL fragment").toBeFocused();
});

test("explicit navigation across all five primary tabs moves focus into the new view without stealing focus on load", async ({ page }) => {
  await installScenario(page, { includeHistory: false });
  const loadFocus = await activeFocusState(page);
  expect(loadFocus.activeTag, "Initial render must not move focus without a user action").toBe("BODY");

  for (const entry of PRIMARY_TABS) {
    await openPrimaryTab(page, entry.id);
    await expect(page.locator(entry.view), `${entry.id} must render its reachable primary view`).toBeVisible();
    const focus = await activeFocusState(page);
    expect.soft(focus.focusInMain, `${entry.id} navigation must move focus into #main-content after the explicit tab change`).toBe(true);
    expect.soft(focus.activeAction, `${entry.id} navigation must not leave focus on the persistent tab control`).not.toBe("set-tab");
  }
});

test("template-start dialog owns initial focus, traps both directions, and restores its durable trigger after every dismissal path", async ({ page }) => {
  await installScenario(page, { activeWorkout: false, includeHistory: false });
  const trigger = page.locator('[data-action="start-template"][data-template-id="public-synthetic-template-upper"]');
  await expect(trigger).toHaveCount(1);

  await trigger.click();
  let dialog = page.getByRole("dialog", { name: /Start .*Public Synthetic Upper Strength/i });
  await expectDialogTrap(page, dialog, dialog.getByRole("button", { name: "Continue", exact: true }));
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect.soft(trigger, "Escape must restore focus to the newly rendered template trigger").toBeFocused({ timeout: 1_500 });

  await trigger.click();
  dialog = page.getByRole("dialog", { name: /Start .*Public Synthetic Upper Strength/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close template setup", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.soft(trigger, "The close button must restore focus to the newly rendered template trigger").toBeFocused({ timeout: 1_500 });

  await trigger.click();
  dialog = page.getByRole("dialog", { name: /Start .*Public Synthetic Upper Strength/i });
  await expect(dialog).toBeVisible();
  const backdrop = page.locator('.sheet-backdrop[data-action="cancel-template-start"]');
  await backdrop.click({ position: { x: 6, y: 6 } });
  await expect(dialog).toHaveCount(0);
  await expect.soft(trigger, "Backdrop dismissal must restore focus to the newly rendered template trigger").toBeFocused({ timeout: 1_500 });
});

test("cancel-workout dialog owns safe focus, traps both directions, and restores its trigger after Escape, close, and backdrop", async ({ page }) => {
  await installScenario(page);
  const trigger = page.locator(`[data-action="request-cancel-workout"][data-session-id="${ACTIVE_SESSION_ID}"]`);
  await expect(trigger).toHaveCount(1);

  await trigger.click();
  let dialog = page.getByRole("dialog", { name: "Cancel this workout?", exact: true });
  await expectDialogTrap(page, dialog, dialog.getByRole("button", { name: "Keep Workout", exact: true }));
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect.soft(trigger, "Escape must restore focus to the newly rendered Cancel Workout trigger").toBeFocused({ timeout: 1_500 });

  await trigger.click();
  dialog = page.getByRole("dialog", { name: "Cancel this workout?", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep Workout", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.soft(trigger, "The safe close action must restore focus to the newly rendered Cancel Workout trigger").toBeFocused({ timeout: 1_500 });

  await trigger.click();
  dialog = page.getByRole("dialog", { name: "Cancel this workout?", exact: true });
  await expect(dialog).toBeVisible();
  const backdrop = page.locator(".sheet-backdrop");
  await backdrop.click({ position: { x: 6, y: 6 } });
  await expect.soft(dialog, "Backdrop dismissal must close the cancel-workout dialog").toHaveCount(0, { timeout: 1_000 });
  const backdropOutcome = await page.evaluate(() => ({
    closed: !document.querySelector('.bottom-sheet[aria-labelledby="cancel-workout-title"]'),
    triggerFocused: document.activeElement?.matches?.('[data-action="request-cancel-workout"]') === true
  }));
  expect.soft(backdropOutcome, "Backdrop dismissal must close the dialog and restore its durable trigger").toEqual({ closed: true, triggerFocused: true });
  if (!backdropOutcome.closed) {
    await dialog.getByRole("button", { name: "Keep Workout", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});

test("Dashboard detail receives initial focus and Back restores the durable originating summary control", async ({ page }) => {
  await installScenario(page);
  await openPrimaryTab(page, "dashboard");
  const origin = page.locator('[data-action="open-dashboard-detail"][data-detail="sessions"]');
  await expect(origin).toHaveCount(1);
  await origin.click();

  const detail = page.locator(".dashboard-detail-view");
  const back = detail.getByRole("button", { name: "Back", exact: true });
  await expect(detail).toBeVisible();
  await expect.soft(back, "Dashboard drill-down must move initial focus to Back").toBeFocused({ timeout: 1_500 });
  await back.click();
  await expect(detail).toHaveCount(0);
  await expect.soft(origin, "Back must focus the newly rendered summary control that opened the detail").toBeFocused({ timeout: 1_500 });
});

test("live guided Available Equipment and Muscle Group Scope choices are named groups with 44 CSS-pixel targets", async ({ page }) => {
  await installScenario(page, { activeWorkout: false, includeHistory: false });
  await openPrimaryTab(page, "plan");
  await page.locator('[data-action="begin-guided-mesocycle"]').click();
  await page.locator('[data-action="open-guided-setup"]').click();

  const equipmentSection = page.locator(".guided-builder .equipment-picker");
  const muscleSection = page.locator(".guided-builder .muscle-scope-panel");
  await expect(equipmentSection, "The test must exercise the live renderGuidedMesocycle setup").toBeVisible();
  await expect(muscleSection, "The test must exercise the live renderGuidedMesocycle setup").toBeVisible();
  await expect.soft(page.getByRole("group", { name: "Available Equipment", exact: true }), "Available Equipment must expose a named group boundary").toHaveCount(1, { timeout: 1_500 });
  await expect.soft(page.getByRole("group", { name: /Muscle Groups?(?: and| in)? Scope/i }), "Muscle Group Scope must expose a named group boundary").toHaveCount(1, { timeout: 1_500 });

  const targets = await page.evaluate(() => {
    const describe = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: Math.round(rect.height * 100) / 100,
        label: element.getAttribute("aria-label") || element.textContent.trim().replace(/\s+/g, " "),
        width: Math.round(rect.width * 100) / 100
      };
    };
    return {
      equipment: [...document.querySelectorAll('.guided-builder [data-action="toggle-mesocycle-equipment"]')].map(describe),
      muscles: [...document.querySelectorAll(".guided-builder .muscle-scope-option")].map(describe)
    };
  });
  expect(targets.equipment.length, "All live equipment choices must be measured").toBe(7);
  expect(targets.muscles.length, "The canonical live muscle choices must be measured").toBeGreaterThan(0);
  const undersized = [...targets.equipment, ...targets.muscles].filter((target) => target.height < 44 || target.width < 44);
  expect.soft(undersized, "Every live multi-entry choice must provide a 44 by 44 CSS-pixel target").toEqual([]);
});

test("repeated Lift move, delete, add-set, warm-up, and duplicate controls include their exercise context", async ({ page }) => {
  await installScenario(page);
  await openPrimaryTab(page, "lift");
  const cases = [
    ["public-synthetic-active-exercise-1", LONG_EXERCISE_NAMES.chest],
    ["public-synthetic-active-exercise-2", LONG_EXERCISE_NAMES.back],
    ["public-synthetic-active-exercise-3", LONG_EXERCISE_NAMES.quads]
  ];
  const actions = [
    ['[data-action="move-exercise"][data-direction="-1"]', "move up"],
    ['[data-action="move-exercise"][data-direction="1"]', "move down"],
    ['[data-action="delete-exercise"]', "delete"],
    ['[data-action="add-set"]', "add set"],
    ['[data-action="add-warmup-set"]', "add warm-up"],
    ['[data-action="duplicate-set"]', "duplicate"]
  ];

  const audit = await page.evaluate(({ expectedCases, expectedActions }) => expectedCases.flatMap(([exerciseId, exerciseName]) => {
    const exerciseField = document.querySelector(`[data-action="exercise-name"][data-exercise-id="${CSS.escape(exerciseId)}"]`);
    const card = exerciseField?.closest(".exercise-card");
    return expectedActions.map(([selector, actionLabel]) => {
      const matches = card ? [...card.querySelectorAll(selector)] : [];
      return {
        actionLabel,
        count: matches.length,
        exerciseId,
        exerciseName,
        names: matches.map((control) => control.getAttribute("aria-label") || "")
      };
    });
  }), { expectedCases: cases, expectedActions: actions });
  const missing = audit.filter((entry) => entry.count !== 1 || entry.names.some((name) => !name.toLocaleLowerCase().includes(entry.exerciseName.toLocaleLowerCase())));
  expect.soft(missing, "Every repeated Lift mutation control must have one explicit accessible name containing its exercise name").toEqual([]);
});

test("reduced motion converts the reachable next-set programmatic scroll to auto", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeScrollIntoView = Element.prototype.scrollIntoView;
    globalThis.__SCROLL_INTO_VIEW_AUDIT__ = [];
    Element.prototype.scrollIntoView = function auditedScrollIntoView(options) {
      globalThis.__SCROLL_INTO_VIEW_AUDIT__.push({
        behavior: typeof options === "object" ? options.behavior || "auto" : "auto",
        id: this.id || ""
      });
      return nativeScrollIntoView.call(this, options);
    };
  });
  await installScenario(page, { reducedMotion: "reduce", viewport: { width: 320, height: 360 } });
  await page.addStyleTag({ content: '#set-public-synthetic-active-exercise-1-set-3 { margin-top: 420px !important; }' });
  const setTwo = page.locator('[data-action="toggle-set"][data-set-id="public-synthetic-active-exercise-1-set-2"]');
  await expect(setTwo).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => { globalThis.__SCROLL_INTO_VIEW_AUDIT__ = []; });
  await setTwo.click();

  await expect.poll(() => page.evaluate(() => globalThis.__SCROLL_INTO_VIEW_AUDIT__.length), {
    message: "Completing the reachable set must exercise the next-set auto-scroll branch",
    timeout: 5_000
  }).toBeGreaterThan(0);
  const result = await page.evaluate(() => ({
    mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
    calls: globalThis.__SCROLL_INTO_VIEW_AUDIT__.map((entry) => ({ ...entry })),
    cssScrollBehavior: getComputedStyle(document.documentElement).scrollBehavior
  }));
  expect(result.mediaMatches).toBe(true);
  expect(result.cssScrollBehavior).toBe("auto");
  expect(result.calls.every((call) => call.behavior === "auto"), `Reduced motion must never request smooth programmatic scrolling: ${JSON.stringify(result.calls)}`).toBe(true);
});

test("forced-colors mode retains a visible non-shadow focus indicator on navigation and content controls", async ({ page }) => {
  test.setTimeout(90_000);
  await installScenario(page, { forcedColors: "active", includeHistory: false });
  const targets = [
    primaryTab(page, "dashboard"),
    page.locator(`[data-action="request-cancel-workout"][data-session-id="${ACTIVE_SESSION_ID}"]`)
  ];
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);

  await page.keyboard.press("Tab");
  for (const target of targets) {
    await expect(target).toHaveCount(1);
    await target.focus();
    const indicator = await target.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        focusVisible: element.matches(":focus-visible"),
        forcedColorAdjust: style.forcedColorAdjust,
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth) || 0
      };
    });
    expect.soft(indicator.focusVisible, "The focused control must match :focus-visible in keyboard modality").toBe(true);
    expect.soft(indicator.forcedColorAdjust, "The control must not suppress the user's forced-color palette").not.toBe("none");
    expect.soft(indicator.outlineStyle, "Forced colors must retain a visible outline instead of relying on removed shadows").not.toBe("none");
    expect.soft(indicator.outlineWidth, "Forced-colors focus outline must remain at least 2 CSS pixels").toBeGreaterThanOrEqual(2);
  }
});

test("all primary views reflow at 320 CSS pixels with 200 percent text and no document overflow", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name !== "desktop", "One deterministic Chromium project owns the exact 320 CSS-pixel increased-text matrix.");
  await installScenario(page, { includeHistory: false, viewport: { width: 320, height: 720 } });

  for (const textScale of [100, 200]) {
    if (textScale === 200) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    for (const entry of PRIMARY_TABS) {
      await openPrimaryTab(page, entry.id);
      await expect(page.locator(entry.view)).toBeVisible();
      const overflow = await documentOverflow(page);
      expect.soft(overflow.innerWidth, "The reflow contract must run at exactly 320 CSS pixels").toBe(320);
      expect.soft(overflow.documentWidth, `${entry.id} at ${textScale}% text must not widen the document; offenders: ${JSON.stringify(overflow.offenders)}`).toBeLessThanOrEqual(321);
      expect.soft(overflow.bodyWidth, `${entry.id} at ${textScale}% text must not widen the body; offenders: ${JSON.stringify(overflow.offenders)}`).toBeLessThanOrEqual(321);
    }
  }
});
