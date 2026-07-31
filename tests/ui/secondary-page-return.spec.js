"use strict";

const { test, expect } = require("@playwright/test");

test("a Settings return query is consumed before later canonical navigation", async ({ page }) => {
  await page.goto("/?view=settings#support-guidance");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".settings-view")).toBeVisible();
  await expect(page).toHaveURL(/#settings$/);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /Plan$|More$/ })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("view")).toBe(false);

  await page.locator('[data-action="close-secondary-context"]').click();
  await expect(page).toHaveURL(/#today$/);
  await page.reload();

  await expect(page.locator('[data-action="set-tab"][data-tab="today"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-action="set-tab"][data-tab="plan"], [data-action="set-tab"][data-tab="more"]')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("view")).toBe(false);
});
