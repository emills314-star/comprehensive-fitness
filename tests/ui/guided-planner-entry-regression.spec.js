"use strict";

const { test, expect } = require("@playwright/test");

test.setTimeout(90_000);

test("a clean installation opens guided Setup without a Plan render failure", async ({ page }) => {
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(String(error?.message || error)));
  page.on("console", (message) => {
    if (message.type() === "error" && /Destination render failed|ReferenceError|TypeError|SyntaxError/.test(message.text())) runtimeErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({ timeout: 45_000 });
  await page.locator('[data-action="set-tab"][data-tab="plan"]').click();
  await page.locator('[data-action="begin-guided-mesocycle"]').click();
  await expect(page.getByText("Before You Build", { exact: true })).toBeVisible();
  await page.locator('[data-action="open-guided-setup"]').click();

  await expect(page.locator(".destination-error")).toHaveCount(0);
  await expect(page.getByText("Objective, Schedule, and Constraints", { exact: true })).toBeVisible();
  await expect(page.locator('.guided-builder [role="group"][aria-label="Available Equipment"]')).toBeVisible();
  await expect(page.locator('.guided-builder [role="group"][aria-label="Muscle Group Scope"]')).toBeVisible();
  await expect(page.locator('[data-action="guided-step"][data-step="setup"]')).toHaveAttribute("aria-current", "step");
  expect(runtimeErrors).toEqual([]);
});
