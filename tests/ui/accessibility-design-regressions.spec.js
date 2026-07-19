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
  { id: "today", view: ".workout-view" },
  { id: "plan", view: ".templates-view" },
  { id: "progress", view: ".dashboard-view" },
  { id: "more", view: ".settings-view" }
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
  await page.addInitScript(({ fixedNow, preserveStorageOnReload, storageKey, storedFixture }) => {
    const fixtureAlreadyInstalled = preserveStorageOnReload && sessionStorage.getItem("__cf_fixture_installed__") === "true";
    if (!fixtureAlreadyInstalled) {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(storageKey, JSON.stringify(storedFixture));
      if (preserveStorageOnReload) sessionStorage.setItem("__cf_fixture_installed__", "true");
    }
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
  }, { fixedNow: FIXED_NOW, preserveStorageOnReload: options.preserveStorageOnReload === true, storageKey: STORAGE_KEY, storedFixture: fixture });
  await page.goto("/");
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  return fixture;
}

async function readPersistedAppRecord(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("comprehensive-fitness", 1);
    request.onerror = () => reject(request.error || new Error("IndexedDB could not be opened by the regression fixture."));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("state", "readonly");
      const record = transaction.objectStore("state").get("app-data");
      record.onerror = () => reject(record.error || new Error("Persisted app data could not be read by the regression fixture."));
      record.onsuccess = () => resolve(record.result || null);
      transaction.oncomplete = () => db.close();
    };
  }));
}

async function readPersistedAppData(page) {
  return (await readPersistedAppRecord(page))?.value || null;
}

async function writePersistedAppRecord(page, value, updatedAt) {
  await page.evaluate(({ storedValue, storedUpdatedAt }) => new Promise((resolve, reject) => {
    const request = indexedDB.open("comprehensive-fitness", 1);
    request.onerror = () => reject(request.error || new Error("IndexedDB could not be opened by the conflict fixture."));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("state", "readwrite");
      transaction.objectStore("state").put({ key: "app-data", value: storedValue, updatedAt: storedUpdatedAt });
      transaction.onerror = () => reject(transaction.error || new Error("Conflict fixture could not seed IndexedDB."));
      transaction.oncomplete = () => { db.close(); resolve(); };
    };
  }), { storedValue: value, storedUpdatedAt: updatedAt });
}

async function quiesceAppDataPersistenceForRecoveryFixture(page) {
  await page.evaluate(() => {
    globalThis.cancelPendingDataSave?.();
    if (globalThis.persistBeforeSuspend) {
      window.removeEventListener("pagehide", globalThis.persistBeforeSuspend);
      window.removeEventListener("beforeunload", globalThis.persistBeforeSuspend);
    }
  });
}

function localFallbackData(stored) {
  return stored?.format === "comprehensive-fitness-local-fallback" ? stored.data : stored;
}

async function installServiceWorkerControllerFixture(page) {
  await page.addInitScript(() => {
    const registration = new EventTarget();
    registration.installing = null;
    registration.waiting = null;
    const serviceWorker = new EventTarget();
    const nativeAddEventListener = serviceWorker.addEventListener.bind(serviceWorker);
    serviceWorker.controller = { postMessage() {} };
    serviceWorker.getRegistration = async () => registration;
    serviceWorker.register = async () => registration;
    serviceWorker.addEventListener = (type, listener, options) => {
      if (type === "controllerchange") globalThis.__CF_CONTROLLER_LISTENER_READY__ = true;
      return nativeAddEventListener(type, listener, options);
    };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
    globalThis.__CF_TRIGGER_CONTROLLER_CHANGE__ = () => serviceWorker.dispatchEvent(new Event("controllerchange"));
  });
}

async function installIndexedWriteBlocker(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("comprehensive-fitness", 1);
    request.onerror = () => reject(request.error || new Error("Could not install the delayed-persistence fixture."));
    request.onsuccess = () => {
      const db = request.result;
      const blocker = db.transaction("state", "readwrite");
      const store = blocker.objectStore("state");
      let released = false;
      const nativeTransaction = IDBDatabase.prototype.transaction;
      globalThis.__CF_HISTORY_WRITE_QUEUED__ = false;
      globalThis.__CF_RELEASE_HISTORY_WRITE__ = () => {
        released = true;
        IDBDatabase.prototype.transaction = nativeTransaction;
      };
      IDBDatabase.prototype.transaction = function observedTransaction(storeNames, mode, ...args) {
        if (mode === "readwrite") globalThis.__CF_HISTORY_WRITE_QUEUED__ = true;
        return nativeTransaction.call(this, storeNames, mode, ...args);
      };
      const keepAlive = () => {
        const pending = store.get("__cf_history_edit_blocker__");
        pending.onerror = () => reject(pending.error || new Error("Delayed-persistence fixture failed."));
        pending.onsuccess = () => { if (!released) keepAlive(); };
      };
      blocker.oncomplete = () => db.close();
      keepAlive();
      resolve();
    };
  }));
}

function primaryTab(page, tabId) {
  return page.locator(`[data-action="set-tab"][data-tab="${tabId}"]`);
}

async function openPrimaryTab(page, tabId) {
  const destination = ({ lift: "today", dashboard: "progress", charts: "progress", data: "more" })[tabId] || tabId;
  const target = primaryTab(page, destination);
  await expect(target).toHaveCount(1);
  await target.click();
  await expect(target).toHaveAttribute("aria-current", "page");
  if (tabId === "charts" || tabId === "dashboard") {
    const view = page.locator(`[data-action="set-progress-view"][data-progress-view="${tabId === "charts" ? "lifts" : "overview"}"]`);
    await view.click();
    await expect(view).toHaveAttribute("aria-current", "page");
  }
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
      focused: document.activeElement === element,
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

function parseCssFunctions(value) {
  const source = String(value || "");
  const results = [];
  let searchFrom = 0;
  while (searchFrom < source.length) {
    const match = source.slice(searchFrom).match(/([a-z-]+)\s*\(/i);
    if (!match) break;
    const name = match[1].toLowerCase();
    const start = searchFrom + match.index;
    const argumentsStart = start + match[0].length;
    let depth = 1;
    let cursor = argumentsStart;
    for (; cursor < source.length && depth > 0; cursor += 1) {
      if (source[cursor] === "(") depth += 1;
      if (source[cursor] === ")") depth -= 1;
    }
    if (depth === 0) {
      const args = source.slice(argumentsStart, cursor - 1).trim();
      const normalizedArgs = args.toLowerCase().replace(/\s+/g, " ").replace(/\s*,\s*/g, ",");
      results.push({ args, name, signature: `${name}(${normalizedArgs})` });
    }
    searchFrom = Math.max(cursor, argumentsStart);
  }
  return results;
}

function multisetDifference(focusedItems, baseItems, signature = (item) => item.signature) {
  const remaining = new Map();
  for (const item of baseItems) {
    const key = signature(item);
    remaining.set(key, (remaining.get(key) || 0) + 1);
  }
  return focusedItems.filter((item) => {
    const key = signature(item);
    const count = remaining.get(key) || 0;
    if (!count) return true;
    remaining.set(key, count - 1);
    return false;
  });
}

function parseShadowLayer(value) {
  const color = String(value || "").match(/rgba?\([^)]+\)/i)?.[0] || "";
  const lengths = String(value || "")
    .replace(color, "")
    .match(/-?(?:\d+|\d*\.\d+)px/gi)
    ?.map((item) => Number.parseFloat(item)) || [];
  if (!color || lengths.length < 2) return null;
  const layer = {
    blur: Math.max(0, lengths[2] || 0),
    color,
    inset: /\binset\b/i.test(value),
    offsetX: lengths[0],
    offsetY: lengths[1],
    spread: lengths[3] || 0
  };
  const normalizedColor = color.toLowerCase().replace(/\s+/g, "");
  return {
    ...layer,
    signature: [layer.inset ? "inset" : "outer", normalizedColor, layer.offsetX, layer.offsetY, layer.blur, layer.spread].join("|")
  };
}

function shadowLayerExtent(layer, rect) {
  const rawExtent = Math.max(
    0,
    Math.abs(layer.offsetX) + layer.blur + layer.spread,
    Math.abs(layer.offsetY) + layer.blur + layer.spread
  );
  return layer.inset ? Math.min(rawExtent, Math.min(rect.width, rect.height) / 2) : rawExtent;
}

function parseShadowLayers(value) {
  return splitCssLayers(value).map(parseShadowLayer).filter(Boolean);
}

function shadowIndicatorCandidates(layers, { exteriorColor, interiorColor, rect, type }) {
  return layers.flatMap((layer) => {
    const comparisonColor = layer.inset ? interiorColor : exteriorColor;
    const contrast = contrastRatio(layer.color, comparisonColor);
    const visibleExtent = shadowLayerExtent(layer, rect);
    return contrast >= 3 && visibleExtent >= 1 && rect.width > 0 && rect.height > 0
      ? [{ contrast, inset: layer.inset, type, visibleExtent }]
      : [];
  });
}

function focusIndicatorEvidence(base, focused, { forcedColors = false } = {}) {
  const changed = (...values) => values.some(([before, after]) => before !== after);
  const candidates = [];
  const baseShadowLayers = parseShadowLayers(base.boxShadow);
  const focusedShadowLayers = parseShadowLayers(focused.boxShadow);
  const shadowDelta = multisetDifference(focusedShadowLayers, baseShadowLayers);
  const baseFilterFunctions = parseCssFunctions(base.filter);
  const focusedFilterFunctions = parseCssFunctions(focused.filter);
  const filterDelta = multisetDifference(focusedFilterFunctions, baseFilterFunctions);
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
    if (shadowDelta.length) {
      candidates.push(...shadowIndicatorCandidates(shadowDelta, {
        exteriorColor: base.adjacentBackgroundColor,
        interiorColor: base.effectiveBackgroundColor,
        rect: focused.rect,
        type: "box-shadow"
      }));
    }

    if (filterDelta.length) {
      const backgroundContrast = contrastRatio(focused.filteredBackgroundColor, base.filteredBackgroundColor);
      const textContrast = contrastRatio(focused.filteredTextColor, base.filteredTextColor);
      if (Math.max(backgroundContrast, textContrast) >= 3) {
        candidates.push({ contrast: Math.max(backgroundContrast, textContrast), type: "filter" });
      }
      for (const filterFunction of filterDelta.filter((item) => item.name === "drop-shadow")) {
        const dropShadow = parseShadowLayer(filterFunction.args);
        if (!dropShadow) continue;
        candidates.push(...shadowIndicatorCandidates([dropShadow], {
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

  return {
    candidates,
    deltas: {
      boxShadow: shadowDelta.map((item) => item.signature),
      filter: filterDelta.map((item) => item.signature)
    },
    valid: candidates.length > 0
  };
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
      },
      {
        reason: "The phone workout board is an explicit keyboard-operable horizontal exercise rail with overflow-x:auto and scroll snapping.",
        selector: ".session-exercise-rail"
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
      #baseline-shadow-mutation { box-shadow: 0 0 0 3px rgb(0, 70, 180); }
      #baseline-shadow-mutation:focus { box-shadow: 0 0 0 3px rgb(0, 70, 180), inset 0 0 0 3px rgb(255, 255, 255); }
      #baseline-filter-mutation { filter: drop-shadow(0 0 3px rgb(0, 70, 180)); }
      #baseline-filter-mutation:focus { filter: drop-shadow(0 0 3px rgb(0, 70, 180)) brightness(.99); }
      @media (forced-colors: active) {
        #forced-border { border: 1px solid CanvasText; }
        #forced-border:focus { border: 3px solid Highlight; outline: none; }
        #forced-shadow-only { appearance: none; background: rgb(255, 255, 255); border: 2px solid rgb(118, 118, 118); color: rgb(20, 20, 20); forced-color-adjust: none; }
        #forced-shadow-only:focus { border: 2px solid rgb(118, 118, 118); box-shadow: 0 0 0 3px rgb(0, 70, 180); outline: none; }
      }
    </style>
    <button id="valid-shadow">Valid exterior shadow</button>
    <button id="invisible-inset">Invisible inset shadow</button>
    <button id="visible-inset">Visible inset shadow</button>
    <button id="valid-filter">Valid filtered change</button>
    <button id="baseline-shadow-mutation">Unchanged valid shadow plus invisible focus layer</button>
    <button id="baseline-filter-mutation">Unchanged drop shadow plus irrelevant filter</button>
    <button id="forced-border">Valid forced-color border</button>
    <button id="forced-shadow-only">Forced-color shadow only</button>
  `);

  const exteriorShadow = await focusFixtureEvidence(page, "#valid-shadow");
  expect(exteriorShadow.evidence.valid, JSON.stringify(exteriorShadow)).toBe(true);
  expect(exteriorShadow.evidence.candidates.some((candidate) => candidate.type === "box-shadow" && candidate.inset === false)).toBe(true);

  const invisibleInset = await focusFixtureEvidence(page, "#invisible-inset");
  expect(invisibleInset.focused.focused, "The negative fixture must actually receive DOM focus").toBe(true);
  expect(invisibleInset.focused.boxShadow, "Focus must change the computed shadow before its visibility is evaluated").not.toBe(invisibleInset.base.boxShadow);
  const invisibleInsetDelta = multisetDifference(parseShadowLayers(invisibleInset.focused.boxShadow), parseShadowLayers(invisibleInset.base.boxShadow));
  expect(invisibleInsetDelta).toHaveLength(1);
  expect(invisibleInsetDelta[0].inset, "The changed layer must exercise inset geometry").toBe(true);
  expect(shadowLayerExtent(invisibleInsetDelta[0], invisibleInset.focused.rect), "The changed inset layer must have nonzero geometry").toBeGreaterThanOrEqual(1);
  expect(contrastRatio(invisibleInsetDelta[0].color, invisibleInset.base.effectiveBackgroundColor), "The inset layer intentionally matches the unfocused interior pixel").toBeLessThan(3);
  expect(contrastRatio(invisibleInsetDelta[0].color, invisibleInset.base.adjacentBackgroundColor), "The same layer deliberately contrasts with the exterior, proving exterior comparison would be wrong").toBeGreaterThanOrEqual(3);
  expect(invisibleInset.evidence.valid, `An inset shadow matching the interior pixel must not count: ${JSON.stringify(invisibleInset)}`).toBe(false);

  const visibleInset = await focusFixtureEvidence(page, "#visible-inset");
  expect(visibleInset.evidence.valid, JSON.stringify(visibleInset)).toBe(true);
  expect(visibleInset.evidence.candidates.some((candidate) => candidate.type === "box-shadow" && candidate.inset === true)).toBe(true);

  const filtered = await focusFixtureEvidence(page, "#valid-filter");
  expect(filtered.evidence.valid, JSON.stringify(filtered)).toBe(true);
  expect(filtered.evidence.candidates.some((candidate) => candidate.type === "filter")).toBe(true);

  const shadowMutation = await focusFixtureEvidence(page, "#baseline-shadow-mutation");
  const shadowMutationDelta = multisetDifference(parseShadowLayers(shadowMutation.focused.boxShadow), parseShadowLayers(shadowMutation.base.boxShadow));
  expect(shadowMutation.focused.focused).toBe(true);
  expect(shadowMutationDelta).toHaveLength(1);
  expect(shadowMutationDelta[0].inset).toBe(true);
  expect(contrastRatio(shadowMutationDelta[0].color, shadowMutation.base.effectiveBackgroundColor)).toBeLessThan(3);
  expect(shadowMutation.evidence.deltas.boxShadow).toEqual(shadowMutationDelta.map((item) => item.signature));
  expect(shadowMutation.evidence.valid, "An unchanged valid outer ring cannot credit a newly added invisible inset layer").toBe(false);

  const filterMutation = await focusFixtureEvidence(page, "#baseline-filter-mutation");
  const filterMutationDelta = multisetDifference(parseCssFunctions(filterMutation.focused.filter), parseCssFunctions(filterMutation.base.filter));
  expect(filterMutation.focused.focused).toBe(true);
  expect(filterMutation.focused.filter).not.toBe(filterMutation.base.filter);
  expect(filterMutationDelta.map((item) => item.name)).toEqual(["brightness"]);
  expect(filterMutation.evidence.deltas.filter).toEqual(filterMutationDelta.map((item) => item.signature));
  expect(filterMutation.evidence.candidates.some((candidate) => candidate.type === "filter-drop-shadow")).toBe(false);
  expect(filterMutation.evidence.valid, "An unchanged valid drop-shadow cannot credit an insignificant filter mutation").toBe(false);

  await page.emulateMedia({ colorScheme: "light", forcedColors: "active", reducedMotion: "reduce" });
  const forcedBorder = await focusFixtureEvidence(page, "#forced-border", { forcedColors: true });
  expect(forcedBorder.evidence.valid, JSON.stringify(forcedBorder)).toBe(true);
  expect(forcedBorder.evidence.candidates.some((candidate) => candidate.type === "border")).toBe(true);
  expect(forcedBorder.evidence.candidates.every((candidate) => ["border", "outline"].includes(candidate.type))).toBe(true);

  const forcedShadowOnly = await focusFixtureEvidence(page, "#forced-shadow-only", { forcedColors: true });
  const forcedShadowDelta = multisetDifference(parseShadowLayers(forcedShadowOnly.focused.boxShadow), parseShadowLayers(forcedShadowOnly.base.boxShadow));
  expect(forcedShadowOnly.focused.focused).toBe(true);
  expect(forcedShadowOnly.focused.boxShadow, "The forced-colors negative fixture must retain a changed author shadow").not.toBe(forcedShadowOnly.base.boxShadow);
  expect(forcedShadowDelta.length).toBeGreaterThan(0);
  expect(forcedShadowOnly.focused.outlineStyle).toBe("none");
  for (const side of ["Top", "Right", "Bottom", "Left"]) {
    expect(forcedShadowOnly.focused[`border${side}`], `The ${side.toLowerCase()} border must remain unchanged in the shadow-only fixture`).toEqual(forcedShadowOnly.base[`border${side}`]);
  }
  expect(forcedShadowOnly.evidence.deltas.boxShadow).toEqual(forcedShadowDelta.map((item) => item.signature));
  expect(forcedShadowOnly.evidence.candidates.some((candidate) => /shadow|filter/.test(candidate.type))).toBe(false);
  expect(forcedShadowOnly.evidence.valid, "Forced colors must reject a shadow-only focus delta").toBe(false);
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

test("explicit navigation across all four primary destinations moves focus into the new view without stealing focus on load", async ({ page }) => {
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

test("quick-template cards retain their native computed button role", async ({ page }) => {
  await installScenario(page, { activeWorkout: false, includeHistory: false });
  const card = page.getByRole("button", { name: /Public Synthetic Upper Strength/i });
  await expect(card, "The quick-template card must be discoverable by its native computed button role").toHaveCount(1);
  await expect(card).toHaveClass(/quick-template-card/);
  await expect(page.locator(".quick-template-list"), "The visual carousel must not override its native button children with list semantics").not.toHaveAttribute("role");
  await expect(card, "The native button must not be overwritten with listitem semantics").not.toHaveAttribute("role");
  expect(await card.ariaSnapshot()).toMatch(/^- ['"]?button\b/);
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

test("dialog initial focus falls back to the first visible enabled control when the preferred action is hidden", async ({ page }) => {
  await installScenario(page, { activeWorkout: false, includeHistory: false });
  await page.addStyleTag({ content: '[data-action="continue-template-start"] { display: none !important; }' });
  const trigger = page.locator('[data-action="start-template"][data-template-id="public-synthetic-template-upper"]');
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: /Start .*Public Synthetic Upper Strength/i });
  const preferred = dialog.locator('[data-action="continue-template-start"]');
  const fallback = dialog.getByRole("button", { name: "Close template setup", exact: true });
  const finalVisibleControl = dialog.getByRole("button", { name: "Cancel", exact: true });
  await expect(dialog).toBeVisible();
  await expect(preferred, "The nominal initial action must remain present but be genuinely hidden for this fixture").toBeHidden();
  await expect(fallback, "Focus must fall back to the first visible enabled dialog control").toBeFocused({ timeout: 1_500 });

  await page.keyboard.press("Shift+Tab");
  await expect(finalVisibleControl, "The Tab trap must use the same visible/enabled filtering and skip the hidden nominal action").toBeFocused();
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

test("browser Back guards dirty history edits and reload cannot persist the temporary draft", async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = await installScenario(page);
  const originalSession = fixture.sessions.find((session) => session.id === "public-synthetic-history-session-00");
  expect(originalSession, "The regression fixture must include a submitted history session").toBeTruthy();
  await expect.poll(async () => {
    const persisted = await readPersistedAppData(page);
    return persisted?.sessions?.find((session) => session.id === originalSession.id)?.title || "";
  }, {
    message: "The original submitted workout must be durably stored before temporary editing begins",
    timeout: 8_000
  }).toBe(originalSession.title);

  await openPrimaryTab(page, "dashboard");
  const historyEntry = page.locator(`[data-action="open-session"][data-session-id="${originalSession.id}"]`).first();
  await expect(historyEntry, "Dashboard history must provide the deterministic entry used to create a browser history record").toBeVisible();
  await historyEntry.click();
  await expect(page).toHaveURL(/#lift$/);
  await page.getByRole("button", { name: "Edit History", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Workout details" }).click();

  const temporaryTitle = "Temporary title that must never persist";
  const title = page.locator('[data-action="session-title"]');
  await title.fill(temporaryTitle);
  await expect(title).toHaveValue(temporaryTitle);
  await page.goBack();

  const dialog = page.getByRole("dialog", { name: "Cancel these edits?", exact: true });
  await expect(dialog, "Browser Back must invoke the same cancel-edit confirmation as explicit navigation").toBeVisible();
  await expect(page, "A blocked browser Back must restore the canonical Lift URL").toHaveURL(/#lift$/);
  await expect(page.locator('[data-action="session-title"]'), "The guarded edit must remain visible and temporary beneath the dialog").toHaveValue(temporaryTitle);
  await dialog.getByRole("button", { name: "Keep Editing", exact: true }).click();
  await expect(page.locator('[data-action="session-title"]')).toHaveValue(temporaryTitle);
  await primaryTab(page, "dashboard").click();
  await expect(dialog, "Explicit tab navigation must retain the same established cancel-edit guard").toBeVisible();
  await expect(page).toHaveURL(/#lift$/);
  await expect(page.locator('[data-action="session-title"]')).toHaveValue(temporaryTitle);
  await dialog.getByRole("button", { name: "Keep Editing", exact: true }).click();
  const persistedDuringEdit = await readPersistedAppData(page);
  expect(persistedDuringEdit.sessions.find((session) => session.id === originalSession.id)?.title).toBe(originalSession.title);

  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".history-edit-bar"), "Reload must not resurrect an unconfirmed edit transaction").toHaveCount(0);
  const persistedAfterReload = await readPersistedAppData(page);
  expect(persistedAfterReload.sessions.find((session) => session.id === originalSession.id)?.title).toBe(originalSession.title);
  await openPrimaryTab(page, "dashboard");
  await page.locator(`[data-action="open-session"][data-session-id="${originalSession.id}"]`).first().click();
  await expect(page.locator('[data-action="session-title"]'), "Reopening history after reload must show the last explicitly saved value, not the temporary edit").toHaveValue(originalSession.title);
});

test("external service-worker activation defers reload until history editing ends and Update is explicit", async ({ page }) => {
  test.setTimeout(90_000);
  await installServiceWorkerControllerFixture(page);
  const fixture = await installScenario(page, { activeWorkout: false });
  const originalSession = fixture.sessions.find((session) => session.id === "public-synthetic-history-session-00");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__CF_CONTROLLER_LISTENER_READY__)), {
    message: "The deterministic service-worker fixture must observe the production controllerchange listener",
    timeout: 5_000
  }).toBe(true);

  await openPrimaryTab(page, "dashboard");
  await page.locator(`[data-action="open-session"][data-session-id="${originalSession.id}"]`).first().click();
  await page.getByRole("button", { name: "Edit History", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Workout details" }).click();
  const temporaryTitle = "Temporary history edit protected from controller activation";
  await page.locator('[data-action="session-title"]').fill(temporaryTitle);

  await page.evaluate(() => globalThis.__CF_TRIGGER_CONTROLLER_CHANGE__());
  await expect(page.locator(".history-edit-bar"), "External controller activation must not tear down the edit transaction").toBeVisible();
  await expect(page.locator('[data-action="session-title"]')).toHaveValue(temporaryTitle);
  await expect(page.locator(".update-banner"), "A deferred controller reload must remain visible to the user").toContainText(/save or discard history edits/i);

  await page.getByRole("button", { name: "Cancel Edits", exact: true }).click();
  await page.getByRole("dialog", { name: "Cancel these edits?", exact: true }).getByRole("button", { name: "Discard Edits", exact: true }).click();
  const update = page.getByRole("button", { name: "Update now", exact: true });
  await expect(update, "Resolving the edit must expose an explicit action for the deferred reload").toBeVisible();

  await page.evaluate(() => {
    globalThis.__CF_NATIVE_IDB_OPEN__ = IDBFactory.prototype.open;
    globalThis.__CF_NATIVE_STORAGE_SET_ITEM__ = Storage.prototype.setItem;
    IDBFactory.prototype.open = function blockedOpen() { throw new Error("Synthetic IndexedDB write failure"); };
    Storage.prototype.setItem = function blockedAppDataWrite(key, value) {
      if (key === "comprehensive-fitness-data-v1") throw new Error("Synthetic local storage write failure");
      return globalThis.__CF_NATIVE_STORAGE_SET_ITEM__.call(this, key, value);
    };
  });
  await update.click();
  await expect(page.locator(".app-toast"), "Update must stay in place when neither persistence layer can save current state").toContainText(/update was not applied.*could not be saved/i);
  await expect(update, "A failed persistence gate must leave the explicit Update action available for retry").toBeVisible();
  await page.evaluate(() => {
    IDBFactory.prototype.open = globalThis.__CF_NATIVE_IDB_OPEN__;
    Storage.prototype.setItem = globalThis.__CF_NATIVE_STORAGE_SET_ITEM__;
  });

  const reloaded = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame());
  await update.click();
  await reloaded;
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  const persisted = await readPersistedAppData(page);
  expect(persisted.sessions.find((session) => session.id === originalSession.id)?.title).toBe(originalSession.title);
});

test("entering history edit flushes an unrelated debounced template change before isolating temporary edits", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Number(delay) === 1800 ? 60_000 : delay, ...args);
  });
  const fixture = await installScenario(page);
  const originalSession = fixture.sessions.find((session) => session.id === "public-synthetic-history-session-00");
  const templateId = "public-synthetic-template-upper";
  const persistedTemplateName = "Unrelated debounced template change";

  await openPrimaryTab(page, "plan");
  await page.locator(`[data-action="template-name"][data-template-id="${templateId}"]`).fill(persistedTemplateName);
  await openPrimaryTab(page, "dashboard");
  await page.locator(`[data-action="open-session"][data-session-id="${originalSession.id}"]`).first().click();
  await page.getByRole("button", { name: "Edit History", exact: true }).click();
  await expect(page.locator(".history-edit-bar"), "Edit mode must begin only after its stable pre-edit snapshot is flushed").toBeVisible();
  await page.locator("summary").filter({ hasText: "Workout details" }).click();
  await page.locator('[data-action="session-title"]').fill("Temporary history value that must remain isolated");

  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  const persisted = await readPersistedAppData(page);
  expect(persisted.templates.find((template) => template.id === templateId)?.name).toBe(persistedTemplateName);
  expect(persisted.sessions.find((session) => session.id === originalSession.id)?.title).toBe(originalSession.title);
  await expect(page.locator(".history-edit-bar")).toHaveCount(0);
});

test("newer local fallback outranks stale readable IndexedDB after a failed pre-edit put", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Number(delay) === 1800 ? 60_000 : delay, ...args);
  });
  const fixture = await installScenario(page, { activeWorkout: false, preserveStorageOnReload: true });
  const originalSession = fixture.sessions.find((session) => session.id === "public-synthetic-history-session-00");
  const templateId = "public-synthetic-template-upper";
  const newerTemplateName = "Newer fallback template state";
  const staleIndexed = await readPersistedAppData(page);

  await openPrimaryTab(page, "plan");
  await page.locator(`[data-action="template-name"][data-template-id="${templateId}"]`).fill(newerTemplateName);
  await openPrimaryTab(page, "dashboard");
  await page.locator(`[data-action="open-session"][data-session-id="${originalSession.id}"]`).first().click();
  await page.evaluate(() => {
    globalThis.__CF_NATIVE_IDB_OPEN_FOR_FALLBACK__ = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function blockedStableSnapshotPut() { throw new Error("Synthetic stable snapshot IndexedDB failure"); };
  });
  await page.getByRole("button", { name: "Edit History", exact: true }).click();
  await expect(page.locator(".history-edit-bar")).toBeVisible();
  await page.evaluate(() => { IDBFactory.prototype.open = globalThis.__CF_NATIVE_IDB_OPEN_FOR_FALLBACK__; });

  const localFallbackRecord = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) || "null"), STORAGE_KEY);
  const localFallback = localFallbackData(localFallbackRecord);
  expect(localFallback.dataRevision).toBeGreaterThan(staleIndexed.dataRevision);
  expect(localFallback.templates.find((template) => template.id === templateId)?.name).toBe(newerTemplateName);
  await page.locator("summary").filter({ hasText: "Workout details" }).click();
  await page.locator('[data-action="session-title"]').fill("Temporary history state excluded from fallback");

  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  const promoted = await readPersistedAppData(page);
  expect(promoted.dataRevision).toBeGreaterThan(staleIndexed.dataRevision);
  expect(promoted.templates.find((template) => template.id === templateId)?.name).toBe(newerTemplateName);
  expect(promoted.sessions.find((session) => session.id === originalSession.id)?.title).toBe(originalSession.title);
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), STORAGE_KEY)).toBeNull();
  await expect(page.locator(".history-edit-bar")).toHaveCount(0);
});

test("concurrent navigation and mutation abort delayed history-edit startup without rollback", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Number(delay) === 1800 ? 60_000 : delay, ...args);
  });
  await installScenario(page, { activeWorkout: false });
  await openPrimaryTab(page, "dashboard");
  await page.locator('[data-action="open-session"][data-session-id="public-synthetic-history-session-00"]').first().click();
  const templateId = "public-synthetic-template-upper";
  const changedTemplateName = "Concurrent mutation durably reconciled";
  await installIndexedWriteBlocker(page);

  await page.getByRole("button", { name: "Edit History", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__CF_HISTORY_WRITE_QUEUED__)), {
    message: "The edit-start stable snapshot must be waiting behind the deterministic IndexedDB blocker"
  }).toBe(true);
  await openPrimaryTab(page, "plan");
  await page.locator(`[data-action="template-name"][data-template-id="${templateId}"]`).fill(changedTemplateName);
  await page.evaluate(() => globalThis.__CF_RELEASE_HISTORY_WRITE__());

  await expect(page.locator(".app-toast"), "The stale edit startup must await and confirm the current-state resave").toContainText(/current changes were saved.*try again/i);
  await expect(page.locator(".history-edit-bar")).toHaveCount(0);
  await expect.poll(async () => (await readPersistedAppData(page)).templates.find((template) => template.id === templateId)?.name, {
    message: "The concurrent mutation must remain eligible for persistence after the stale edit startup aborts"
  }).toBe(changedTemplateName);
  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await openPrimaryTab(page, "plan");
  await expect(page.locator(`[data-action="template-name"][data-template-id="${templateId}"]`)).toHaveValue(changedTemplateName);
  await expect(page.locator(".history-edit-bar")).toHaveCount(0);
});

test("failed current-state reconciliation reports non-durability and keeps in-memory changes", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Number(delay) === 1800 ? 60_000 : delay, ...args);
  });
  await installScenario(page, { activeWorkout: false });
  await openPrimaryTab(page, "dashboard");
  await page.locator('[data-action="open-session"][data-session-id="public-synthetic-history-session-00"]').first().click();
  const templateId = "public-synthetic-template-upper";
  const changedTemplateName = "Concurrent mutation currently in memory only";
  await installIndexedWriteBlocker(page);
  await page.getByRole("button", { name: "Edit History", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__CF_HISTORY_WRITE_QUEUED__))).toBe(true);
  await openPrimaryTab(page, "plan");
  await page.locator(`[data-action="template-name"][data-template-id="${templateId}"]`).fill(changedTemplateName);
  await page.evaluate(() => {
    globalThis.__CF_NATIVE_IDB_OPEN_FOR_RECONCILIATION__ = IDBFactory.prototype.open;
    globalThis.__CF_NATIVE_STORAGE_SET_FOR_RECONCILIATION__ = Storage.prototype.setItem;
    IDBFactory.prototype.open = function blockedReconciliationOpen() { throw new Error("Synthetic reconciliation IndexedDB failure"); };
    Storage.prototype.setItem = function blockedReconciliationFallback(key, value) {
      if (key === "comprehensive-fitness-data-v1") throw new Error("Synthetic reconciliation fallback failure");
      return globalThis.__CF_NATIVE_STORAGE_SET_FOR_RECONCILIATION__.call(this, key, value);
    };
    globalThis.__CF_RELEASE_HISTORY_WRITE__();
  });

  await expect(page.locator(".app-toast"), "Dual-store failure must not claim the concurrent mutation is durable").toContainText(/not durable.*export.*retry.*before reloading/i);
  await expect(page.locator(`[data-action="template-name"][data-template-id="${templateId}"]`), "The failed resave must not roll back the in-memory mutation").toHaveValue(changedTemplateName);
  await expect(page.locator(".history-edit-bar")).toHaveCount(0);
  await page.evaluate(() => {
    IDBFactory.prototype.open = globalThis.__CF_NATIVE_IDB_OPEN_FOR_RECONCILIATION__;
    Storage.prototype.setItem = globalThis.__CF_NATIVE_STORAGE_SET_FOR_RECONCILIATION__;
  });
  expect((await readPersistedAppData(page)).templates.find((template) => template.id === templateId)?.name).not.toBe(changedTemplateName);
});

test("equal-revision divergent copies preserve the alternate through later normal saves", async ({ page }) => {
  test.setTimeout(90_000);
  await installScenario(page, { activeWorkout: false, preserveStorageOnReload: true });
  const base = await readPersistedAppData(page);
  const indexedName = "Indexed equal-revision copy";
  const localName = "Local equal-revision alternate";
  const templateId = "public-synthetic-template-upper";
  const indexedCopy = { ...base, templates: base.templates.map((template) => template.id === templateId ? { ...template, name: indexedName } : template) };
  const localCopy = { ...base, templates: base.templates.map((template) => template.id === templateId ? { ...template, name: localName } : template) };
  const equalTimestamp = "2026-07-14T15:00:00.000Z";
  await quiesceAppDataPersistenceForRecoveryFixture(page);
  await writePersistedAppRecord(page, indexedCopy, equalTimestamp);
  await page.evaluate(({ storageKey, alternate, updatedAt }) => localStorage.setItem(storageKey, JSON.stringify({
    format: "comprehensive-fitness-local-fallback", version: 1, source: "two-tab-local", updatedAt, conflictPreserved: false, data: alternate
  })), { storageKey: STORAGE_KEY, alternate: localCopy, updatedAt: equalTimestamp });
  expect((await readPersistedAppRecord(page)).updatedAt).toBe(equalTimestamp);

  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await openPrimaryTab(page, "data");
  const preservedBeforeSave = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) || "null"), STORAGE_KEY);
  expect(preservedBeforeSave.conflictPreserved).toBe(true);
  expect(localFallbackData(preservedBeforeSave).templates.find((template) => template.id === templateId)?.name).toBe(localName);
  await expect(page.locator(".persistence-conflict-note")).toContainText(/conflicting saved app-data copies.*preserved.*export.*clear all/i);

  await page.locator('[data-action="toggle-theme"]').click();
  await expect.poll(async () => (await readPersistedAppData(page)).dataRevision).toBeGreaterThan(base.dataRevision);
  const preservedAfterSave = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) || "null"), STORAGE_KEY);
  expect(localFallbackData(preservedAfterSave).templates.find((template) => template.id === templateId)?.name).toBe(localName);
  await page.reload();
  await openPrimaryTab(page, "data");
  await expect(page.locator(".persistence-conflict-note")).toBeVisible();
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey) !== null, STORAGE_KEY)).toBe(true);
});

test("confirmed Clear resolves an equal-revision conflict across IndexedDB, fallback, and reload", async ({ page }) => {
  test.setTimeout(90_000);
  await installScenario(page, { activeWorkout: false, preserveStorageOnReload: true });
  const base = await readPersistedAppData(page);
  const templateId = "public-synthetic-template-upper";
  const indexedName = "Conflict clear IndexedDB sentinel";
  const alternateName = "Conflict clear fallback sentinel";
  const indexedCopy = { ...base, templates: base.templates.map((template) => template.id === templateId ? { ...template, name: indexedName } : template) };
  const localCopy = { ...base, templates: base.templates.map((template) => template.id === templateId ? { ...template, name: alternateName } : template) };
  const equalTimestamp = "2026-07-14T15:02:00.000Z";
  await quiesceAppDataPersistenceForRecoveryFixture(page);
  await writePersistedAppRecord(page, indexedCopy, equalTimestamp);
  await page.evaluate(({ storageKey, alternate, updatedAt }) => localStorage.setItem(storageKey, JSON.stringify({
    format: "comprehensive-fitness-local-fallback", version: 1, source: "conflict-clear-fixture", updatedAt, conflictPreserved: false, data: alternate
  })), { storageKey: STORAGE_KEY, alternate: localCopy, updatedAt: equalTimestamp });

  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await openPrimaryTab(page, "data");
  await expect(page.locator(".persistence-conflict-note")).toContainText(/conflicting saved app-data copies.*preserved.*clear all/i);
  const dangerSummary = page.locator("details.settings-group > summary").filter({ hasText: "Danger Zone" });
  if (!await dangerSummary.evaluate((element) => element.parentElement.open)) await dangerSummary.click();
  await page.getByRole("button", { name: /Clear All Local App Data$/ }).click();
  const dialog = page.getByRole("dialog", { name: "Clear All Local App Data?" });
  await dialog.getByRole("checkbox", { name: /I understand/ }).check();
  await dialog.getByRole("textbox", { name: "Type CLEAR to confirm local data deletion" }).fill("CLEAR");
  await dialog.getByRole("button", { name: "Permanently Clear Local Data" }).click();

  await expect(page.getByText("Local app data cleared.", { exact: true }), "Confirmed conflict clearing must announce completion").toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), STORAGE_KEY), "The conflict-preserved fallback must be removed").toBeNull();
  const cleared = await readPersistedAppData(page);
  expect.soft(cleared.sessions).toHaveLength(1);
  expect.soft(cleared.exercises).toHaveLength(0);
  expect.soft(cleared.sets).toHaveLength(0);
  expect.soft(cleared.templates).toHaveLength(0);
  expect.soft(cleared.templates.some((template) => [indexedName, alternateName].includes(template.name))).toBe(false);

  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await openPrimaryTab(page, "data");
  await expect(page.locator(".persistence-conflict-note"), "The cleared alternate must not return after reload").toHaveCount(0);
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), STORAGE_KEY)).toBeNull();
  const reloaded = await readPersistedAppData(page);
  expect.soft(reloaded.sessions).toHaveLength(1);
  expect.soft(reloaded.templates).toHaveLength(0);
});

test("revisionless legacy divergence is wrapped and preserved without destructive promotion", async ({ page }) => {
  test.setTimeout(90_000);
  await installScenario(page, { activeWorkout: false, preserveStorageOnReload: true });
  const base = await readPersistedAppData(page);
  const templateId = "public-synthetic-template-upper";
  const withoutRevision = (name) => {
    const copy = { ...base, templates: base.templates.map((template) => template.id === templateId ? { ...template, name } : template) };
    delete copy.dataRevision;
    return copy;
  };
  const indexedCopy = withoutRevision("Revisionless IndexedDB copy");
  const legacyLocalCopy = withoutRevision("Revisionless legacy local alternate");
  await quiesceAppDataPersistenceForRecoveryFixture(page);
  await writePersistedAppRecord(page, indexedCopy, "2026-07-14T15:05:00.000Z");
  await page.evaluate(({ storageKey, alternate }) => localStorage.setItem(storageKey, JSON.stringify(alternate)), { storageKey: STORAGE_KEY, alternate: legacyLocalCopy });

  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await openPrimaryTab(page, "data");
  await expect(page.locator(".persistence-conflict-note")).toContainText(/ordering.*unavailable|conflicting saved/i);
  const wrapped = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) || "null"), STORAGE_KEY);
  expect(wrapped.format).toBe("comprehensive-fitness-local-fallback");
  expect(wrapped.conflictPreserved).toBe(true);
  expect(localFallbackData(wrapped).templates.find((template) => template.id === templateId)?.name).toBe("Revisionless legacy local alternate");
  expect((await readPersistedAppData(page)).templates.find((template) => template.id === templateId)?.name).toBe("Revisionless IndexedDB copy");
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

test("set transitions preserve manual scroll while explicit exercise jumps honor reduced motion", async ({ page }) => {
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
  const setTwo = page.locator('[data-action="toggle-set"][data-set-id="public-synthetic-active-exercise-1-set-2"]');
  await expect(setTwo).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => { globalThis.__SCROLL_INTO_VIEW_AUDIT__ = []; });
  await setTwo.click();
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => globalThis.__SCROLL_INTO_VIEW_AUDIT__), "Completing a set must not move the workout viewport").toEqual([]);

  await page.locator('[data-action="focus-workout-exercise"][data-exercise-id="public-synthetic-active-exercise-2"]').click();
  await expect.poll(() => page.evaluate(() => globalThis.__SCROLL_INTO_VIEW_AUDIT__.length), { timeout: 5_000 }).toBeGreaterThan(0);
  const result = await page.evaluate(() => ({
    mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
    calls: globalThis.__SCROLL_INTO_VIEW_AUDIT__.map((entry) => ({ ...entry })),
    cssScrollBehavior: getComputedStyle(document.documentElement).scrollBehavior
  }));
  expect(result.mediaMatches).toBe(true);
  expect(result.cssScrollBehavior).toBe("auto");
  const expectedTargetId = "exercise-public-synthetic-active-exercise-2";
  expect(result.calls.some((call) => call.id === expectedTargetId), `The explicit workout-board jump must target ${expectedTargetId}: ${JSON.stringify(result.calls)}`).toBe(true);
  expect(result.calls.filter((call) => call.id !== expectedTargetId), `No unrelated element may be scrolled by the explicit jump: ${JSON.stringify(result.calls)}`).toEqual([]);
  expect(result.calls.every((call) => call.behavior === "auto"), `Reduced motion must never request smooth programmatic scrolling: ${JSON.stringify(result.calls)}`).toBe(true);
});

test("forced-colors mode retains a visible non-shadow focus indicator on navigation and content controls", async ({ page }) => {
  test.setTimeout(90_000);
  await installScenario(page, { forcedColors: "active", includeHistory: false });
  const targets = [
    primaryTab(page, "progress"),
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
