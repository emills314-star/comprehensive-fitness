"use strict";

const { test, expect } = require("@playwright/test");

test.setTimeout(90_000);

test("browser Back and Forward restore Progress and a contextual secondary route", async ({ page }) => {
  await page.goto("/#progress");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
  await expect(page).toHaveURL(/#progress$/);
  await expect(page.locator(".progress-sessions-view h1")).toHaveText("Completed sessions");
  await expect(page.getByRole("tab", { name: "Sessions", exact: true })).toHaveAttribute("aria-selected", "true");

  await page.goto("/#settings");
  await expect(page).toHaveURL(/#settings$/);
  await expect(page.locator(".settings-view")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#progress$/);
  await expect(page.locator('[data-action="set-tab"][data-tab="progress"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".progress-sessions-view h1")).toHaveText("Completed sessions");
  await expect(page.locator(".settings-view")).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(/#settings$/);
  await expect(page.locator(".settings-view")).toBeVisible();
  await expect(page.locator(".progress-sessions-view, .progress-exercises-view, .exercise-detail-view")).toHaveCount(0);
});
