"use strict";

const { test, expect } = require("@playwright/test");
const { IDS, entityScopedUniquenessState, hostileCases, legacyState, validFullState } = require("../fixtures/synthetic-app-backups");

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

async function importBackup(page, group, value, name = "synthetic-backup.json", expectedState = "accepted") {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const input = group.locator('[data-action="import-data"]');
  const status = group.locator('[data-import-status]');
  const importAttempt = () => status.evaluateAll((nodes) => Number(nodes[0]?.getAttribute("data-import-attempt") || 0));
  const previousAttempt = await importAttempt();
  await input.setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(raw, "utf8")
  });
  await expect.poll(importAttempt, {
    message: `${name} must publish a new import attempt`,
    timeout: 15_000
  }).toBeGreaterThan(previousAttempt);
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("data-import-state", expectedState);
  await expect(input).toBeEnabled();
  return status;
}

async function exportedBackup(group) {
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

test("a supported legacy backup migrates overloaded settings without changing relationships", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, legacyState(), "synthetic-legacy-backup.json");
  const exported = await exportedBackup(group);

  expect(exported.exercises.find((item) => item.id === IDS.exercise)?.sessionId).toBe(IDS.session);
  expect(exported.sets.find((item) => item.id === IDS.set)?.exerciseId).toBe(IDS.exercise);
  expect(exported.settings.trainingGoal).toBe("general_fitness");
  expect(exported.settings.nutritionPhase).toBe("deficit");
  expect(exported.settings.experienceLevel).toBe("novice");
  const trainingGoalSource = exported.settings.trainingGoalSource || exported.settings.trainingGoalResolution?.source || "";
  const trainingGoalDisclosure = exported.settings.trainingGoalDisclosure || exported.settings.trainingGoalResolution?.disclosure || "";
  expect(trainingGoalSource).toMatch(/missing|default/i);
  expect(trainingGoalDisclosure).toMatch(/general[ _-]?fitness|default/i);
  expect(exported.settings.goal, "The overloaded legacy goal must not remain authoritative").toBeUndefined();
  expect(exported.settings.trainingStatus, "The legacy experience field must not remain authoritative").toBeUndefined();
});

test("backup uniqueness is entity-scoped rather than globally conflating typed IDs", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, entityScopedUniquenessState(), "synthetic-entity-scoped-ids.json");
  const exported = await exportedBackup(group);
  expect(exported.exercises.some((item) => item.id === IDS.exercise)).toBe(true);
  expect(exported.templates[0].exercises.some((item) => item.id === IDS.exercise)).toBe(true);
});

test("bounded backup validation rejects duplicate IDs, malformed versions, orphans, executable keys, prototype keys, and oversized input", async ({ page }) => {
  const group = await openBackupSettings(page);
  const baseline = validFullState();

  for (const hostile of hostileCases()) {
    await test.step(hostile.name, async () => {
      await importBackup(page, group, baseline, `baseline-${hostile.name}.json`);
      const payload = hostile.raw || JSON.stringify(hostile.value);
      await importBackup(page, group, payload, `${hostile.name}.json`, "rejected");
      const exported = await exportedBackup(group);
      expect.soft(
        exported.sessions.some((item) => item.id === IDS.session && item.title === "Synthetic Round Trip"),
        `${hostile.name} must not replace the validated baseline`
      ).toBe(true);
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

  await importBackup(page, group, backup, "synthetic-hostile-backup.json", "rejected");
  const exported = await exportedBackup(group);

  expect(exported.sessions.some((item) => item.id === IDS.session && item.title === "Synthetic Round Trip"), "The invalid backup must not replace local state").toBe(true);
  expect(exported.sessions.some((item) => item.title === "Hostile Backup"), "The hostile backup must not enter persisted state").toBe(false);
  expect(await page.locator("[onerror], [onload], [onclick], [onfocus], [onpointerenter]").count(), "Imported data must never create executable DOM attributes").toBe(0);
  expect(await page.evaluate(() => window.__HOSTILE_BACKUP_EXECUTED__), "No imported field may execute").toBe(0);
});
