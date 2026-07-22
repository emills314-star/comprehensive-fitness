"use strict";

const { test, expect } = require("@playwright/test");

test("a Settings return query is consumed before later canonical navigation", async ({ page }) => {
  await page.goto("/?view=settings#support-guidance");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[data-action="set-tab"][data-tab="more"]')).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(/#more$/);
  expect(new URL(page.url()).searchParams.has("view")).toBe(false);

  await page.locator('[data-action="set-tab"][data-tab="today"]').click();
  await expect(page).toHaveURL(/#today$/);
  await page.reload();

  await expect(page.locator('[data-action="set-tab"][data-tab="today"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-action="set-tab"][data-tab="more"]')).not.toHaveAttribute("aria-current", "page");
  expect(new URL(page.url()).searchParams.has("view")).toBe(false);
});
