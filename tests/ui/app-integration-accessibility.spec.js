"use strict";

const { test, expect } = require("@playwright/test");
const {
  BACKUP_BOUNDARIES,
  IDS,
  entityScopedUniquenessState,
  hostileCases,
  legacyState,
  validFullState
} = require("../fixtures/synthetic-app-backups");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.__HOSTILE_BACKUP_EXECUTED__ = 0;
  });
  await page.goto("/");
  await page.waitForLoadState("load");
});

async function openBackupSettings(page) {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: /Settings$/ }).click();
  const group = page.locator("details.settings-group").filter({ has: page.locator("summary", { hasText: "Data and backup" }) });
  await group.locator("summary").click();
  return group;
}

async function armImportLifecycleObserver(page) {
  return page.evaluate(() => {
    const key = `import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.__APP_TEST_IMPORT_LIFECYCLES__ ||= {};
    const initialStatus = document.querySelector("[data-import-status]");
    const state = {
      started: false,
      completed: false,
      initialAttempt: Number(initialStatus?.getAttribute("data-import-attempt") || 0),
      terminalAttempt: 0,
      terminalState: "",
      terminalText: ""
    };
    const inspect = () => {
      const input = document.querySelector('[data-action="import-data"]');
      const group = input?.closest("details.settings-group");
      const status = group?.querySelector("[data-import-status]");
      const text = String(group?.innerText || "");
      const attempt = Number(status?.getAttribute("data-import-attempt") || 0);
      const statusState = String(status?.getAttribute("data-import-state") || "");
      const importing = Boolean(input?.disabled) || /\bimporting\b/i.test(text) || statusState === "importing";
      if (importing || attempt > state.initialAttempt) state.started = true;
      const terminalMarker = attempt > state.initialAttempt && statusState && statusState !== "importing";
      const terminalControlState = state.started && input && !input.disabled && !/\bimporting\b/i.test(text);
      if (terminalMarker || terminalControlState) {
        state.completed = true;
        state.terminalAttempt = attempt;
        state.terminalState = statusState;
        state.terminalText = String(status?.textContent || text).trim();
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(inspect);
    state.observer = observer;
    window.__APP_TEST_IMPORT_LIFECYCLES__[key] = state;
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-import-attempt", "data-import-state", "disabled"],
      childList: true,
      subtree: true
    });
    inspect();
    return key;
  });
}

async function waitForImportLifecycle(page, lifecycleKey, name) {
  const lifecycleValue = (field) => page.evaluate(({ key, property }) => (
    window.__APP_TEST_IMPORT_LIFECYCLES__?.[key]?.[property]
  ), { key: lifecycleKey, property: field });
  await expect.poll(() => lifecycleValue("started"), {
    message: `${name} must enter an observable importing or attempt state`,
    timeout: 15_000
  }).toBe(true);
  await expect.poll(() => lifecycleValue("completed"), {
    message: `${name} must return to an enabled, non-Importing terminal state`,
    timeout: 15_000
  }).toBe(true);
  return page.evaluate((key) => {
    const state = window.__APP_TEST_IMPORT_LIFECYCLES__?.[key] || {};
    const result = {
      started: Boolean(state.started),
      completed: Boolean(state.completed),
      initialAttempt: Number(state.initialAttempt || 0),
      terminalAttempt: Number(state.terminalAttempt || 0),
      terminalState: String(state.terminalState || ""),
      terminalText: String(state.terminalText || "")
    };
    delete window.__APP_TEST_IMPORT_LIFECYCLES__?.[key];
    return result;
  }, lifecycleKey);
}

async function importBackup(page, group, value, name = "synthetic-backup.json") {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const input = group.locator('[data-action="import-data"]');
  const lifecycleKey = await armImportLifecycleObserver(page);
  await input.setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(raw, "utf8")
  });
  const lifecycle = await waitForImportLifecycle(page, lifecycleKey, name);
  await expect(input).toBeEnabled();
  return lifecycle;
}

async function importBackupWithClaimedSize(page, group, value, claimedBytes, name) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const input = group.locator('[data-action="import-data"]');
  const lifecycleKey = await armImportLifecycleObserver(page);
  await input.evaluate((node, fileInit) => {
    const file = new File([fileInit.raw], fileInit.name, { type: "application/json" });
    Object.defineProperty(file, "size", { configurable: true, value: fileInit.claimedBytes });
    const nativeText = file.text.bind(file);
    window.__APP_TEST_SIZED_IMPORT__ = { name: fileInit.name, observedSize: 0, textReads: 0 };
    Object.defineProperty(file, "text", {
      configurable: true,
      value: () => {
        window.__APP_TEST_SIZED_IMPORT__.textReads += 1;
        return nativeText();
      }
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    node.files = transfer.files;
    window.__APP_TEST_SIZED_IMPORT__.observedSize = Number(node.files[0]?.size || 0);
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, { claimedBytes, name, raw });
  const lifecycle = await waitForImportLifecycle(page, lifecycleKey, name);
  await expect(input).toBeEnabled();
  const instrumentation = await page.evaluate(() => ({ ...window.__APP_TEST_SIZED_IMPORT__ }));
  return { instrumentation, lifecycle };
}

async function exportedBackup(group) {
  if (!(await group.evaluate((element) => element.open))) await group.locator("summary").click();
  await group.locator('[data-action="export-data"]').click();
  return JSON.parse(await group.getByLabel("Exported backup JSON").inputValue());
}

test("primary navigation exposes a skip target and moves focus into the selected view", async ({ page }) => {
  const skipLink = page.getByRole("link", { name: /skip.*content/i });
  await expect(skipLink).toHaveAttribute("href", "#main-content");
  await skipLink.focus();
  await expect(skipLink).toBeFocused();

  const dashboard = page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /Dashboard$/ });
  await dashboard.click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const focusIsInView = await page.evaluate(() => {
    const active = document.activeElement;
    const main = document.querySelector("#main-content");
    return Boolean(active && main && (active === main || main.contains(active)) && active !== document.body);
  });
  expect(focusIsInView, "Selecting a primary tab must place focus in the new main view").toBe(true);
});

test("closing the template-start dialog restores focus to its quick-start button", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: /Templates$/ }).click();
  await page.locator('[data-action="new-template"]').click();
  await navigation.getByRole("button", { name: /Workout$/ }).click();

  const quickStart = page.locator('.quick-template-card[data-action="start-template"]').first();
  await expect(quickStart).toBeVisible();
  await quickStart.focus();
  await quickStart.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close template setup" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(quickStart).toBeFocused();
});

test("Dashboard detail Back restores focus to the originating summary control", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: /Dashboard$/ }).click();
  const origin = page.locator('[data-action="open-dashboard-detail"]').first();
  await origin.focus();
  await origin.click();
  await expect(page.locator(".dashboard-detail-view")).toBeVisible();
  await page.locator('[data-action="close-dashboard-detail"]').click();
  await expect(page.locator(".dashboard-detail-view")).toHaveCount(0);
  await expect(origin).toBeFocused();
});

test("cloud workout sync consent defaults off and persists independently when explicitly enabled", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: /Settings$/ }).click();
  const consent = page.locator('[data-action="cloud-workout-sync-consent"]');
  await expect(consent).toBeVisible();
  await expect(consent).not.toBeChecked();
  await consent.check();
  await expect(consent).toBeChecked();

  await page.reload();
  await navigation.getByRole("button", { name: /Settings$/ }).click();
  await expect(page.locator('[data-action="cloud-workout-sync-consent"]')).toBeChecked();
});

test("a complete synthetic backup round-trips relationships and canonical settings", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, validFullState());
  const exported = await exportedBackup(group);

  expect(exported.sessions.map((item) => item.id)).toContain(IDS.session);
  expect(exported.exercises.find((item) => item.id === IDS.exercise)?.sessionId).toBe(IDS.session);
  expect(exported.sets.find((item) => item.id === IDS.set)?.exerciseId).toBe(IDS.exercise);
  expect(exported.templates.find((item) => item.id === IDS.template)?.exercises[0].id).toBe(IDS.templateExercise);
  expect(exported.settings).toMatchObject({
    trainingGoal: "hypertrophy",
    nutritionPhase: "maintenance",
    experienceLevel: "intermediate",
    cloudWorkoutSyncConsent: false
  });
});

test("backup import publishes an attempt-scoped accessible terminal status", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, validFullState(), "synthetic-status-contract.json");
  const status = group.locator('[data-import-status]');
  const marker = await status.evaluateAll((nodes) => nodes[0] ? ({
    role: nodes[0].getAttribute("role"),
    state: nodes[0].getAttribute("data-import-state"),
    attempt: Number(nodes[0].getAttribute("data-import-attempt") || 0)
  }) : null);
  expect.soft(marker, "Import results need a dedicated product status marker").not.toBeNull();
  expect.soft(marker?.role || "").toBe("status");
  expect.soft(marker?.state || "").toBe("accepted");
  expect.soft(Number(marker?.attempt || 0), "Each terminal import result needs a monotonically increasing attempt marker").toBeGreaterThan(0);
});

test("a supported legacy backup migrates overloaded settings without changing relationships", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, legacyState(), "synthetic-legacy-backup.json");
  const exported = await exportedBackup(group);

  expect(exported.exercises.find((item) => item.id === IDS.exercise)?.sessionId).toBe(IDS.session);
  expect(exported.sets.find((item) => item.id === IDS.set)?.exerciseId).toBe(IDS.exercise);
  expect.soft(exported.settings.trainingGoal).toBe("general_fitness");
  expect.soft(exported.settings.nutritionPhase).toBe("deficit");
  expect.soft(exported.settings.experienceLevel).toBe("novice");
  const trainingGoalSource = exported.settings.trainingGoalSource || exported.settings.trainingGoalResolution?.source || "";
  const trainingGoalDisclosure = exported.settings.trainingGoalDisclosure || exported.settings.trainingGoalResolution?.disclosure || "";
  expect.soft(trainingGoalSource).toMatch(/missing|default/i);
  expect.soft(trainingGoalDisclosure).toMatch(/general[ _-]?fitness|default/i);
  expect.soft(exported.settings.goal, "The overloaded legacy goal must not remain authoritative").toBeUndefined();
  expect.soft(exported.settings.trainingStatus, "The legacy experience field must not remain authoritative").toBeUndefined();
});

test("backup uniqueness is entity-scoped rather than globally conflating typed IDs", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, entityScopedUniquenessState(), "synthetic-entity-scoped-ids.json");
  const exported = await exportedBackup(group);
  expect(exported.exercises.some((item) => item.id === IDS.exercise)).toBe(true);
  expect(exported.templates[0].exercises.some((item) => item.id === IDS.exercise)).toBe(true);
});

test("backup file-size enforcement accepts the exact boundary and rejects overflow before reading", async ({ page }) => {
  test.setTimeout(60_000);
  const group = await openBackupSettings(page);
  const boundary = validFullState();
  boundary.sessions[0].title = "Synthetic file size at boundary";
  const accepted = await importBackupWithClaimedSize(page, group, boundary, BACKUP_BOUNDARIES.fileBytes, "file-size-at-boundary.json");
  expect.soft(accepted.instrumentation.observedSize).toBe(BACKUP_BOUNDARIES.fileBytes);
  expect.soft(accepted.instrumentation.textReads, "An at-boundary file must be read exactly once").toBe(1);
  expect.soft((await exportedBackup(group)).sessions.some((item) => item.title === boundary.sessions[0].title)).toBe(true);

  await importBackup(page, group, validFullState(), "baseline-file-size-overflow.json");
  const overflow = validFullState();
  overflow.sessions[0].title = "Synthetic file size over boundary";
  const rejected = await importBackupWithClaimedSize(page, group, overflow, BACKUP_BOUNDARIES.fileBytes + 1, "file-size-over-boundary.json");
  const exported = await exportedBackup(group);
  expect.soft(rejected.instrumentation.observedSize).toBe(BACKUP_BOUNDARIES.fileBytes + 1);
  expect.soft(rejected.instrumentation.textReads, "An oversized file must be rejected before file.text() is called").toBe(0);
  expect.soft(exported.sessions.some((item) => item.id === IDS.session && item.title === "Synthetic Round Trip"), "Oversized input must preserve the baseline").toBe(true);
  expect.soft(exported.sessions.some((item) => item.title === overflow.sessions[0].title), "Oversized input must not enter state").toBe(false);
});

test("bounded backup validation rejects duplicate IDs, malformed versions, orphans, executable keys, and prototype keys", async ({ page }) => {
  test.setTimeout(120_000);
  const group = await openBackupSettings(page);
  const baseline = validFullState();

  for (const hostile of hostileCases()) {
    await test.step(hostile.name, async () => {
      await importBackup(page, group, baseline, `baseline-${hostile.name}.json`);
      const payload = hostile.raw || JSON.stringify(hostile.value);
      await importBackup(page, group, payload, `${hostile.name}.json`);
      const exported = await exportedBackup(group);
      expect.soft(
        exported.sessions.some((item) => item.id === IDS.session && item.title === "Synthetic Round Trip"),
        `${hostile.name} must not replace the validated baseline`
      ).toBe(true);
      expect.soft(exported.sessions.length, `${hostile.name} must not change the session count`).toBe(baseline.sessions.length);
      expect.soft(exported.exercises.length, `${hostile.name} must not change the exercise count`).toBe(baseline.exercises.length);
      expect.soft(exported.sets.length, `${hostile.name} must not change the set count`).toBe(baseline.sets.length);
      expect.soft(exported.templates.length, `${hostile.name} must not change the template count`).toBe(baseline.templates.length);
      if (hostile.name === "prototype-key") {
        expect.soft(Object.prototype.hasOwnProperty.call(exported, "__proto__"), "Prototype keys must not survive import").toBe(false);
        expect.soft(Object.prototype.hasOwnProperty.call(exported, "constructor"), "Constructor keys must not survive import").toBe(false);
      }
      expect.soft(await page.evaluate(() => Object.prototype.polluted), `${hostile.name} must not pollute object prototypes`).toBeUndefined();
      expect.soft(await page.evaluate(() => window.__HOSTILE_BACKUP_EXECUTED__), `${hostile.name} must not execute imported fields`).toBe(0);
    });
  }
});

test("hostile backup IDs and executable-looking fields are rejected before DOM rendering", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, validFullState(), "baseline-hostile-id.json");

  const safeSessionId = "11111111-1111-4111-8111-111111111111";
  const hostileExerciseId = 'evil" autofocus onfocus="window.__HOSTILE_BACKUP_EXECUTED__=1';
  const backup = {
    appDataVersion: 2,
    sessions: [{
      id: safeSessionId,
      date: "2026-07-12",
      title: "Hostile Backup",
      submitted: false,
      workoutStarted: true,
      workoutState: "active",
      recovery: {}
    }],
    exercises: [{
      id: hostileExerciseId,
      sessionId: safeSessionId,
      name: "Synthetic Exercise",
      order: 0,
      resistanceType: "external",
      onfocus: "window.__HOSTILE_BACKUP_EXECUTED__=1"
    }],
    sets: [{
      id: "33333333-3333-4333-8333-333333333333",
      exerciseId: hostileExerciseId,
      setNumber: 1,
      reps: 8,
      weight: 50,
      completed: false,
      onclick: "window.__HOSTILE_BACKUP_EXECUTED__=1"
    }],
    templates: [],
    settings: {}
  };

  await importBackup(page, group, backup, "synthetic-hostile-backup.json");
  const exported = await exportedBackup(group);

  expect.soft(exported.sessions.some((item) => item.id === IDS.session && item.title === "Synthetic Round Trip"), "The invalid backup must not replace local state").toBe(true);
  expect.soft(exported.sessions.some((item) => item.title === "Hostile Backup"), "The hostile backup must not enter persisted state").toBe(false);
  expect.soft(await page.locator("[onerror], [onload], [onclick], [onfocus], [onpointerenter]").count(), "Imported data must never create executable DOM attributes").toBe(0);
  expect.soft(await page.evaluate(() => window.__HOSTILE_BACKUP_EXECUTED__), "No imported field may execute").toBe(0);
});
