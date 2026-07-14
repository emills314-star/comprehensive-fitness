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

async function readFocusAppearance(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const transparent = (value) => {
      if (value === "transparent") return true;
      const color = String(value || "").match(/rgba?\(([^)]+)\)/i)?.[1] || "";
      const parts = color.match(/[\d.]+/g)?.map(Number) || [];
      return parts.length >= 4 && parts[3] === 0;
    };
    const systemCanvas = () => {
      const probe = document.createElement("span");
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = "background-color:Canvas;position:fixed;inset:auto;visibility:hidden";
      document.documentElement.append(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    };
    const effectiveBackground = (start) => {
      for (let current = start; current; current = current.parentElement) {
        const value = getComputedStyle(current).backgroundColor;
        if (!transparent(value)) return value;
      }
      return systemCanvas();
    };
    const filteredPixel = (color, filter) => {
      if (!filter || filter === "none") return color;
      const canvas = document.createElement("canvas");
      canvas.width = 3;
      canvas.height = 3;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return color;
      context.filter = filter;
      context.fillStyle = color;
      context.fillRect(0, 0, 3, 3);
      const [red, green, blue, alpha] = context.getImageData(1, 1, 1, 1).data;
      return `rgba(${red}, ${green}, ${blue}, ${Math.round((alpha / 255) * 1000) / 1000})`;
    };
    const border = (side) => ({
      color: style[`border${side}Color`],
      style: style[`border${side}Style`],
      width: Number.parseFloat(style[`border${side}Width`]) || 0
    });
    const interiorBackground = effectiveBackground(element);
    const rect = element.getBoundingClientRect();
    return {
      adjacentBackgroundColor: effectiveBackground(element.parentElement),
      backgroundColor: style.backgroundColor,
      borderBottom: border("Bottom"),
      borderLeft: border("Left"),
      borderRight: border("Right"),
      borderTop: border("Top"),
      boxShadow: style.boxShadow,
      color: style.color,
      effectiveBackgroundColor: interiorBackground,
      filter: style.filter,
      filteredBackgroundColor: filteredPixel(interiorBackground, style.filter),
      filteredTextColor: filteredPixel(style.color, style.filter),
      focusVisible: element.matches(":focus-visible"),
      outlineColor: style.outlineColor,
      outlineOffset: Number.parseFloat(style.outlineOffset) || 0,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
      rect: { height: rect.height, width: rect.width },
      textDecorationColor: style.textDecorationColor,
      textDecorationLine: style.textDecorationLine,
      textDecorationStyle: style.textDecorationStyle,
      textDecorationThickness: Number.parseFloat(style.textDecorationThickness) || 0
    };
  });
}

function parseCssColor(value) {
  const color = String(value || "").match(/rgba?\(([^)]+)\)/i)?.[1] || "";
  const parts = color.match(/[\d.]+/g)?.map(Number) || [];
  if (parts.length < 3) return null;
  const alpha = parts.length >= 4 ? parts[3] : 1;
  if (alpha <= 0) return null;
  return { alpha, blue: parts[2], green: parts[1], red: parts[0] };
}

function contrastRatio(first, second) {
  const a = parseCssColor(first);
  const b = parseCssColor(second);
  if (!a || !b) return 0;
  const composite = (foreground, background) => ({
    alpha: 1,
    blue: (foreground.blue * foreground.alpha) + (background.blue * (1 - foreground.alpha)),
    green: (foreground.green * foreground.alpha) + (background.green * (1 - foreground.alpha)),
    red: (foreground.red * foreground.alpha) + (background.red * (1 - foreground.alpha))
  });
  const backdrop = b.alpha < 1 ? composite(b, { alpha: 1, blue: 255, green: 255, red: 255 }) : b;
  const foreground = a.alpha < 1 ? composite(a, backdrop) : a;
  const luminance = ({ red, green, blue }) => {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return (0.2126 * channel(red)) + (0.7152 * channel(green)) + (0.0722 * channel(blue));
  };
  const bright = Math.max(luminance(foreground), luminance(backdrop));
  const dark = Math.min(luminance(foreground), luminance(backdrop));
  return Math.round(((bright + 0.05) / (dark + 0.05)) * 100) / 100;
}

function splitCssLayers(value) {
  const layers = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < String(value || "").length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      layers.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  const finalLayer = String(value || "").slice(start).trim();
  if (finalLayer) layers.push(finalLayer);
  return layers;
}

function cssFunctionArguments(value, functionName) {
  const source = String(value || "");
  const lower = source.toLowerCase();
  const needle = `${functionName.toLowerCase()}(`;
  const results = [];
  let searchFrom = 0;
  while (searchFrom < source.length) {
    const start = lower.indexOf(needle, searchFrom);
    if (start < 0) break;
    let depth = 1;
    let cursor = start + needle.length;
    for (; cursor < source.length && depth > 0; cursor += 1) {
      if (source[cursor] === "(") depth += 1;
      if (source[cursor] === ")") depth -= 1;
    }
    if (depth === 0) results.push(source.slice(start + needle.length, cursor - 1));
    searchFrom = Math.max(cursor, start + needle.length);
  }
  return results;
}

function parseShadowLayer(value) {
  const color = String(value || "").match(/rgba?\([^)]+\)/i)?.[0] || "";
  const lengths = String(value || "")
    .replace(color, "")
    .match(/-?(?:\d+|\d*\.\d+)px/gi)
    ?.map((item) => Number.parseFloat(item)) || [];
  if (!color || lengths.length < 2) return null;
  return {
    blur: Math.max(0, lengths[2] || 0),
    color,
    inset: /\binset\b/i.test(value),
    offsetX: lengths[0],
    offsetY: lengths[1],
    spread: lengths[3] || 0
  };
}

function shadowIndicatorCandidates(value, { exteriorColor, interiorColor, rect, type }) {
  return splitCssLayers(value).flatMap((layerValue) => {
    const layer = parseShadowLayer(layerValue);
    if (!layer) return [];
    const comparisonColor = layer.inset ? interiorColor : exteriorColor;
    const contrast = contrastRatio(layer.color, comparisonColor);
    const rawExtent = Math.max(
      0,
      Math.abs(layer.offsetX) + layer.blur + layer.spread,
      Math.abs(layer.offsetY) + layer.blur + layer.spread
    );
    const visibleExtent = layer.inset ? Math.min(rawExtent, Math.min(rect.width, rect.height) / 2) : rawExtent;
    return contrast >= 3 && visibleExtent >= 1 && rect.width > 0 && rect.height > 0
      ? [{ contrast, inset: layer.inset, type, visibleExtent }]
      : [];
  });
}

function focusIndicatorEvidence(base, focused, { forcedColors = false } = {}) {
  const changed = (...values) => values.some(([before, after]) => before !== after);
  const candidates = [];
  const outlineInset = focused.outlineOffset < 0;
  const outlineComparison = outlineInset ? base.effectiveBackgroundColor : base.adjacentBackgroundColor;
  const outlineContrast = contrastRatio(focused.outlineColor, outlineComparison);
  const outlineGeometryFits = !outlineInset
    || Math.abs(focused.outlineOffset) < Math.min(focused.rect.width, focused.rect.height) / 2;
  if (
    focused.outlineStyle !== "none"
    && focused.outlineWidth >= 1
    && outlineContrast >= 3
    && outlineGeometryFits
    && changed(
      [base.outlineStyle, focused.outlineStyle],
      [base.outlineWidth, focused.outlineWidth],
      [base.outlineColor, focused.outlineColor],
      [base.outlineOffset, focused.outlineOffset]
    )
  ) {
    candidates.push({ contrast: outlineContrast, inset: outlineInset, type: "outline" });
  }

  for (const side of ["Top", "Right", "Bottom", "Left"]) {
    const before = base[`border${side}`];
    const after = focused[`border${side}`];
    const borderContrast = contrastRatio(after.color, base.effectiveBackgroundColor);
    if (
      after.style !== "none"
      && after.width >= 1
      && borderContrast >= 3
      && Math.min(focused.rect.width, focused.rect.height) > after.width * 2
      && changed([before.style, after.style], [before.width, after.width], [before.color, after.color])
    ) {
      candidates.push({ contrast: borderContrast, side: side.toLowerCase(), type: "border" });
      break;
    }
  }

  if (!forcedColors) {
    if (base.boxShadow !== focused.boxShadow && focused.boxShadow !== "none") {
      candidates.push(...shadowIndicatorCandidates(focused.boxShadow, {
        exteriorColor: base.adjacentBackgroundColor,
        interiorColor: base.effectiveBackgroundColor,
        rect: focused.rect,
        type: "box-shadow"
      }));
    }

    if (base.filter !== focused.filter && focused.filter !== "none") {
      const backgroundContrast = contrastRatio(focused.filteredBackgroundColor, base.filteredBackgroundColor);
      const textContrast = contrastRatio(focused.filteredTextColor, base.filteredTextColor);
      if (Math.max(backgroundContrast, textContrast) >= 3) {
        candidates.push({ contrast: Math.max(backgroundContrast, textContrast), type: "filter" });
      }
      for (const dropShadow of cssFunctionArguments(focused.filter, "drop-shadow")) {
        candidates.push(...shadowIndicatorCandidates(dropShadow, {
          exteriorColor: base.adjacentBackgroundColor,
          interiorColor: base.effectiveBackgroundColor,
          rect: focused.rect,
          type: "filter-drop-shadow"
        }));
      }
    }

    const backgroundContrast = contrastRatio(focused.effectiveBackgroundColor, base.effectiveBackgroundColor);
    if (base.backgroundColor !== focused.backgroundColor && backgroundContrast >= 3) {
      candidates.push({ contrast: backgroundContrast, type: "background" });
    }

    const textColorContrast = contrastRatio(focused.color, base.color);
    const textBackgroundContrast = contrastRatio(focused.color, focused.effectiveBackgroundColor);
    if (base.color !== focused.color && textColorContrast >= 3 && textBackgroundContrast >= 3) {
      candidates.push({ contrast: textColorContrast, type: "text-color" });
    }

    const textDecorationContrast = contrastRatio(focused.textDecorationColor, base.effectiveBackgroundColor);
    if (
      focused.textDecorationLine !== "none"
      && textDecorationContrast >= 3
      && focused.textDecorationThickness >= 1
      && changed(
        [base.textDecorationLine, focused.textDecorationLine],
        [base.textDecorationStyle, focused.textDecorationStyle],
        [base.textDecorationColor, focused.textDecorationColor]
      )
    ) {
      candidates.push({ contrast: textDecorationContrast, type: "text-decoration" });
    }
  }

  return { candidates, valid: candidates.length > 0 };
}

async function representativeTextMetrics(page, viewSelector) {
  return page.evaluate((selector) => {
    const view = document.querySelector(selector);
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const element = [...(view?.querySelectorAll("h1, h2, h3, p, label, legend") || [])]
      .find((candidate) => visible(candidate) && candidate.textContent.trim().length > 1);
    if (!element) return null;
    const style = getComputedStyle(element);
    return {
      fontSize: Number.parseFloat(style.fontSize) || 0,
      lineHeight: Number.parseFloat(style.lineHeight) || 0,
      tag: element.tagName.toLowerCase(),
      text: element.textContent.trim().replace(/\s+/g, " ").slice(0, 100)
    };
  }, viewSelector);
}

async function reflowAudit(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const describe = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        action: element.getAttribute("data-action") || "",
        className: String(element.className || ""),
        clientWidth: element.clientWidth,
        label: element.getAttribute("aria-label") || element.textContent.trim().slice(0, 60),
        left: Math.round(rect.left * 100) / 100,
        overflowX: style.overflowX,
        right: Math.round(rect.right * 100) / 100,
        scrollWidth: element.scrollWidth,
        tag: element.tagName.toLowerCase()
      };
    };
    const allowedScrollContainers = [
      {
        reason: "The Plan quick-template row is an explicit keyboard-operable horizontal carousel with overflow-x:auto and scroll snapping.",
        selector: ".quick-template-list"
      }
    ];
    const allowedScrollContainer = (element, entry) => {
      if (!element.matches(entry.selector)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return ["auto", "scroll"].includes(style.overflowX) && rect.left >= -1 && rect.right <= innerWidth + 1;
    };
    const allowedAncestor = (element) => allowedScrollContainers.find((entry) => {
      const container = element.closest(entry.selector);
      return container && container !== element && allowedScrollContainer(container, entry);
    });
    const intentionallyVisuallyHidden = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width <= 2 && rect.height <= 2 && (style.clip !== "auto" || style.clipPath !== "none");
    };
    const elements = [...document.body.querySelectorAll("*")].filter(visible);
    const offscreen = elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > innerWidth + 1;
      })
      .filter((element) => !allowedAncestor(element) && !intentionallyVisuallyHidden(element))
      .slice(0, 20)
      .map(describe);
    const nestedOverflow = elements
      .filter((element) => element !== document.documentElement && element !== document.body)
      .filter((element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1)
      .filter((element) => ["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(element).overflowX))
      .filter((element) => !allowedScrollContainers.some((entry) => allowedScrollContainer(element, entry)))
      .slice(0, 20)
      .map(describe);
    const excludedScrollContainers = allowedScrollContainers.flatMap((entry) => [...document.querySelectorAll(entry.selector)]
      .filter(visible)
      .filter((element) => allowedScrollContainer(element, entry))
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({ ...describe(element), reason: entry.reason, selector: entry.selector })));
    return {
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      excludedScrollContainers,
      innerWidth,
      nestedOverflow,
      offscreen
    };
  });
}

async function focusFixtureEvidence(page, selector, options = {}) {
  await page.evaluate(() => document.activeElement?.blur());
  const target = page.locator(selector);
  await expect(target).toHaveCount(1);
  const base = await readFocusAppearance(target);
  await target.focus();
  const focused = await readFocusAppearance(target);
  return { base, evidence: focusIndicatorEvidence(base, focused, options), focused };
}

test("focus-indicator evidence distinguishes exterior, inset, filtered, and forced-color geometry", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", forcedColors: "none", reducedMotion: "reduce" });
  await page.setContent(`
    <style>
      html, body { background: rgb(255, 255, 255); color: rgb(20, 20, 20); }
      button { background: rgb(255, 255, 255); border: 2px solid rgb(118, 118, 118); color: rgb(20, 20, 20); height: 48px; margin: 12px; outline: none; width: 180px; }
      button:focus { outline: none; }
      #valid-shadow:focus { box-shadow: 0 0 0 3px rgb(0, 70, 180); }
      #invisible-inset, #visible-inset { background: rgb(20, 20, 20); color: rgb(255, 255, 255); }
      #invisible-inset:focus { box-shadow: inset 0 0 0 3px rgb(20, 20, 20); }
      #visible-inset:focus { box-shadow: inset 0 0 0 3px rgb(255, 255, 255); }
      #valid-filter:focus { filter: invert(1); }
      @media (forced-colors: active) {
        #forced-border { border: 1px solid CanvasText; }
        #forced-border:focus { border: 3px solid Highlight; outline: none; }
      }
    </style>
    <button id="valid-shadow">Valid exterior shadow</button>
    <button id="invisible-inset">Invisible inset shadow</button>
    <button id="visible-inset">Visible inset shadow</button>
    <button id="valid-filter">Valid filtered change</button>
    <button id="forced-border">Valid forced-color border</button>
  `);

  const exteriorShadow = await focusFixtureEvidence(page, "#valid-shadow");
  expect(exteriorShadow.evidence.valid, JSON.stringify(exteriorShadow)).toBe(true);
  expect(exteriorShadow.evidence.candidates.some((candidate) => candidate.type === "box-shadow" && candidate.inset === false)).toBe(true);

  const invisibleInset = await focusFixtureEvidence(page, "#invisible-inset");
  expect(invisibleInset.evidence.valid, `An inset shadow matching the interior pixel must not count: ${JSON.stringify(invisibleInset)}`).toBe(false);

  const visibleInset = await focusFixtureEvidence(page, "#visible-inset");
  expect(visibleInset.evidence.valid, JSON.stringify(visibleInset)).toBe(true);
  expect(visibleInset.evidence.candidates.some((candidate) => candidate.type === "box-shadow" && candidate.inset === true)).toBe(true);

  const filtered = await focusFixtureEvidence(page, "#valid-filter");
  expect(filtered.evidence.valid, JSON.stringify(filtered)).toBe(true);
  expect(filtered.evidence.candidates.some((candidate) => candidate.type === "filter")).toBe(true);

  await page.emulateMedia({ colorScheme: "light", forcedColors: "active", reducedMotion: "reduce" });
  const forcedBorder = await focusFixtureEvidence(page, "#forced-border", { forcedColors: true });
  expect(forcedBorder.evidence.valid, JSON.stringify(forcedBorder)).toBe(true);
  expect(forcedBorder.evidence.candidates.some((candidate) => candidate.type === "border")).toBe(true);
  expect(forcedBorder.evidence.candidates.every((candidate) => ["border", "outline"].includes(candidate.type))).toBe(true);
});

test("keyboard-visible skip link activates and focuses the canonical main-content target", async ({ page }) => {
  await installScenario(page);
  const skipLink = page.getByRole("link", { name: /skip.*content/i });
  const main = page.locator("#main-content");
  await expect(skipLink, "A skip link must be present before the application header controls").toHaveCount(1);
  await expect(skipLink).toHaveAttribute("href", "#main-content");
  await expect(main, "The skip link destination must be the unique canonical main landmark").toHaveCount(1);
  const baseAppearance = await readFocusAppearance(skipLink);

  await page.keyboard.press("Tab");
  await expect(skipLink, "The first keyboard stop must be the skip link").toBeFocused();
  await expect(skipLink, "The skip link must become visible when keyboard focused").toBeVisible();
  const visibility = await skipLink.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      focusVisible: element.matches(":focus-visible"),
      inViewport: rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth
    };
  });
  const focusedAppearance = await readFocusAppearance(skipLink);
  const indicator = focusIndicatorEvidence(baseAppearance, focusedAppearance);
  expect(visibility.focusVisible).toBe(true);
  expect(visibility.inViewport).toBe(true);
  expect(indicator.valid, `Focus must create a contrast-backed visual change without prescribing one CSS technique: ${JSON.stringify({ baseAppearance, focusedAppearance, indicator })}`).toBe(true);

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
    ['[data-action="move-exercise"][data-direction="-1"]', "move up", [/\bmove\b/i, /\bup\b/i]],
    ['[data-action="move-exercise"][data-direction="1"]', "move down", [/\bmove\b/i, /\bdown\b/i]],
    ['[data-action="delete-exercise"]', "delete", [/\bdelete(?: exercise)?\b/i]],
    ['[data-action="add-set"]', "add set", [/(?:\badd(?: a| one)? (?:working )?set\b|[+＋]\s*(?:working\s*)?set\b)/i]],
    ['[data-action="add-warmup-set"]', "add warm-up", [/(?:\badd(?: a| one)? warm[- ]?up(?: set)?\b|[+＋]\s*warm[- ]?up(?: set)?\b)/i]],
    ['[data-action="duplicate-set"]', "duplicate", [/\bduplicate(?: set)?\b/i]]
  ];

  let auditedControls = 0;
  for (const [exerciseId, exerciseName] of cases) {
    const exerciseField = page.locator(`[data-action="exercise-name"][data-exercise-id="${exerciseId}"]`);
    await expect(exerciseField).toHaveCount(1);
    const card = exerciseField.locator("xpath=ancestor::article[contains(concat(' ', normalize-space(@class), ' '), ' exercise-card ')][1]");
    await expect(card).toHaveCount(1);
    const expectedContext = new RegExp(exerciseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    for (const [selector, actionLabel, expectedActionParts] of actions) {
      const controls = card.locator(selector);
      const count = await controls.count();
      for (let index = 0; index < count; index += 1) {
        const control = controls.nth(index);
        const accessibilityTree = await control.ariaSnapshot();
        const computedRoleAndName = accessibilityTree.split(/\r?\n/, 1)[0];
        auditedControls += 1;
        expect.soft(
          computedRoleAndName,
          `${actionLabel} for ${exerciseName} must expose the exercise context in its computed accessible name; snapshot: ${accessibilityTree}`
        ).toMatch(expectedContext);
        for (const expectedActionPart of expectedActionParts) {
          expect.soft(
            computedRoleAndName,
            `${actionLabel} for ${exerciseName} must retain every action term in its computed accessible name; snapshot: ${accessibilityTree}`
          ).toMatch(expectedActionPart);
        }
      }
    }
  }
  expect(auditedControls, "The live Lift fixture must expose repeated mutation controls to audit").toBeGreaterThan(0);
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
  const expectedTargetId = "set-public-synthetic-active-exercise-1-set-3";
  expect(result.calls.some((call) => call.id === expectedTargetId), `The completed second set must target the intended next set ${expectedTargetId}: ${JSON.stringify(result.calls)}`).toBe(true);
  expect(result.calls.filter((call) => call.id !== expectedTargetId), `No unrelated element may be treated as the next set: ${JSON.stringify(result.calls)}`).toEqual([]);
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
    const baseAppearance = await readFocusAppearance(target);
    await target.focus();
    const focusedAppearance = await readFocusAppearance(target);
    const indicator = focusIndicatorEvidence(baseAppearance, focusedAppearance, { forcedColors: true });
    expect.soft(focusedAppearance.focusVisible, "The focused control must match :focus-visible in keyboard modality").toBe(true);
    expect.soft(
      indicator.valid,
      `Forced colors must create a changed, >=3:1 outline or border indicator; shadows alone are intentionally insufficient: ${JSON.stringify({ baseAppearance, focusedAppearance, indicator })}`
    ).toBe(true);
  }
});

test("all primary views reflow at 320 CSS pixels with 200 percent text and no document overflow", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name !== "desktop", "One deterministic Chromium project owns the exact 320 CSS-pixel increased-text matrix.");
  await installScenario(page, { includeHistory: false, viewport: { width: 320, height: 720 } });
  const rootBaseline = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  const textBaselines = new Map();

  for (const entry of PRIMARY_TABS) {
    await openPrimaryTab(page, entry.id);
    await expect(page.locator(entry.view)).toBeVisible();
    const metrics = await representativeTextMetrics(page, entry.view);
    expect(metrics, `${entry.id} must expose representative visible text for scaling verification`).not.toBeNull();
    textBaselines.set(entry.id, metrics);
    const overflow = await reflowAudit(page);
    const evidence = JSON.stringify({ excluded: overflow.excludedScrollContainers, nested: overflow.nestedOverflow, offscreen: overflow.offscreen });
    expect.soft(overflow.innerWidth, "The reflow contract must run at exactly 320 CSS pixels").toBe(320);
    expect.soft(overflow.documentWidth, `${entry.id} at 100% text must not widen the root; ${evidence}`).toBeLessThanOrEqual(321);
    expect.soft(overflow.bodyWidth, `${entry.id} at 100% text must not widen the body; ${evidence}`).toBeLessThanOrEqual(321);
    expect.soft(overflow.offscreen, `${entry.id} at 100% text must not render unclipped content outside the viewport; ${evidence}`).toEqual([]);
    expect.soft(overflow.nestedOverflow, `${entry.id} at 100% text must not contain clipped or nested horizontal overflow beyond the documented carousel exclusion; ${evidence}`).toEqual([]);
  }

  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const scaledRoot = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(scaledRoot, "The test harness must prove that its large-text mode doubles the root computed font size").toBeGreaterThanOrEqual(rootBaseline * 1.9);

  for (const entry of PRIMARY_TABS) {
    await openPrimaryTab(page, entry.id);
    await expect(page.locator(entry.view)).toBeVisible();
    const baseline = textBaselines.get(entry.id);
    const scaled = await representativeTextMetrics(page, entry.view);
    expect(scaled, `${entry.id} must retain representative visible text at 200%`).not.toBeNull();
    expect.soft({ tag: scaled.tag, text: scaled.text }, `${entry.id} must compare the same representative text before and after scaling`).toEqual({ tag: baseline.tag, text: baseline.text });
    expect.soft(scaled.fontSize, `${entry.id} representative text must scale to an equivalent 200% computed size: ${JSON.stringify({ baseline, scaled })}`).toBeGreaterThanOrEqual(baseline.fontSize * 1.9);
    if (baseline.lineHeight > 0 && scaled.lineHeight > 0) {
      expect.soft(scaled.lineHeight, `${entry.id} representative line height must scale with its 200% text: ${JSON.stringify({ baseline, scaled })}`).toBeGreaterThanOrEqual(baseline.lineHeight * 1.9);
    }
    const overflow = await reflowAudit(page);
    const evidence = JSON.stringify({ excluded: overflow.excludedScrollContainers, nested: overflow.nestedOverflow, offscreen: overflow.offscreen });
    expect.soft(overflow.innerWidth, "The reflow contract must remain exactly 320 CSS pixels").toBe(320);
    expect.soft(overflow.documentWidth, `${entry.id} at 200% text must not widen the root; ${evidence}`).toBeLessThanOrEqual(321);
    expect.soft(overflow.bodyWidth, `${entry.id} at 200% text must not widen the body; ${evidence}`).toBeLessThanOrEqual(321);
    expect.soft(overflow.offscreen, `${entry.id} at 200% text must not render unclipped content outside the viewport; ${evidence}`).toEqual([]);
    expect.soft(overflow.nestedOverflow, `${entry.id} at 200% text must not contain clipped or nested horizontal overflow beyond the documented carousel exclusion; ${evidence}`).toEqual([]);
  }
});
