"use strict";

const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.__HOSTILE_BACKUP_EXECUTED__ = 0;
  });
  await page.goto("/");
  await page.waitForLoadState("load");
});

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

test("hostile backup IDs and executable-looking fields are rejected before DOM rendering", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: /Settings$/ }).click();
  await page.locator("details.settings-group > summary").filter({ hasText: "Data and backup" }).click();

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

  await page.locator('[data-action="import-data"]').setInputFiles({
    name: "synthetic-hostile-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup), "utf8")
  });
  await page.waitForTimeout(150);

  expect(await page.getByText("Hostile Backup", { exact: true }).count(), "The invalid backup must not replace local state").toBe(0);
  expect(await page.locator("[onerror], [onload], [onclick], [onfocus], [onpointerenter]").count(), "Imported data must never create executable DOM attributes").toBe(0);
  expect(await page.evaluate(() => window.__HOSTILE_BACKUP_EXECUTED__), "No imported field may execute").toBe(0);
});
