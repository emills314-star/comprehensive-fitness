"use strict";

const { test, expect } = require("@playwright/test");

test.setTimeout(90_000);

test("browser Back and Forward restore the rendered Progress subview", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });

  await page.locator('[data-action="set-tab"][data-tab="progress"]').click();
  await page.locator('[data-action="set-progress-view"][data-progress-view="lifts"]').click();
  await expect(page).toHaveURL(/#progress-lifts$/);
  await expect(page.locator(".charts-view h1")).toHaveText("Lift progress");

  await page.locator('[data-action="set-progress-view"][data-progress-view="history"]').click();
  await expect(page).toHaveURL(/#progress-history$/);
  await expect(page.locator(".history-view h1")).toHaveText("Training log");

  await page.goBack();
  await expect(page).toHaveURL(/#progress-lifts$/);
  await expect(page.locator('[data-action="set-progress-view"][data-progress-view="lifts"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".charts-view h1")).toHaveText("Lift progress");
  await expect(page.locator(".history-view")).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(/#progress-history$/);
  await expect(page.locator('[data-action="set-progress-view"][data-progress-view="history"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".history-view h1")).toHaveText("Training log");
  await expect(page.locator(".charts-view")).toHaveCount(0);
});
