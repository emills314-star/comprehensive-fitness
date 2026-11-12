"use strict";

const { expect } = require("@playwright/test");

async function closeLoadedBarSheet(page) {
  const done = page.locator('.loaded-bar-sheet button[data-action="close-set-sheet"]');
  if (await done.count()) {
    await done.click();
    await expect(page.locator(".loaded-bar-sheet")).toHaveCount(0);
  }
}

async function focusExercise(page, exerciseId) {
  await closeLoadedBarSheet(page);
  const exercise = page.locator(`[id="exercise-${exerciseId}"]`);
  if (!await exercise.count()) {
    await page.locator(`.loaded-bar-up-next [data-action="focus-workout-exercise"][data-exercise-id="${exerciseId}"]`).click();
  }
  await expect(exercise).toBeVisible();
  return exercise;
}

async function openExerciseOptions(page, exerciseId) {
  const exercise = await focusExercise(page, exerciseId);
  if (await exercise.locator('[data-action="exercise-menu"]').count()) {
    await exercise.locator('[data-action="exercise-menu"]').click();
    const sheet = page.locator(".loaded-bar-exercise-sheet");
    await expect(sheet).toBeVisible();
    await sheet.locator(".loaded-bar-exercise-more > summary").click();
    return sheet;
  }
  // Submitted/history-edit views retain their full exercise list.
  const details = exercise.locator("details.exercise-details");
  if (!await details.getAttribute("open").then((value) => value !== null)) {
    await details.locator(":scope > summary").click();
  }
  return exercise;
}

async function openSetOptions(page, setId) {
  await closeLoadedBarSheet(page);
  await page.locator(`[data-action="set-type-sheet"][data-set-id="${setId}"]`).click();
  const sheet = page.locator(".loaded-bar-sheet");
  await expect(sheet).toBeVisible();
  await sheet.locator("details.loaded-bar-tools > summary").click();
  return sheet;
}

async function enterRpe(page, setId, value) {
  await page.locator(`.loaded-bar-row [data-action="set-rpe"][data-set-id="${setId}"]`).click();
  const sheet = page.locator(".loaded-bar-sheet");
  await expect(sheet).toBeVisible();
  const input = sheet.locator(`[data-action="set-rpe"][data-set-id="${setId}"]`);
  await input.fill(String(value));
  // Blur commits the edit before the close button is resolved after any render.
  await input.press("Tab");
  await closeLoadedBarSheet(page);
  await expect(page.locator(`.loaded-bar-row [data-action="set-rpe"][data-set-id="${setId}"]`)).toHaveValue(String(value));
}

module.exports = { closeLoadedBarSheet, focusExercise, openExerciseOptions, openSetOptions, enterRpe };
