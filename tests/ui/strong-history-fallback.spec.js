"use strict";

const { test, expect } = require("@playwright/test");

const STRONG_EXERCISE = "Public Synthetic Strong Cable Sweep";
const STRONG_TEMPLATE = "Public Synthetic Strong Upper";
const STATIC_RESEARCH_EXERCISE = "Pallof Press";
const OLD_STRONG_EXERCISE = "Public Synthetic Archived Row";
const OLD_STRONG_TEMPLATE = "Public Synthetic Archived Strong Template";

const STRONG_CSV = [
  "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
  `2026-07-10 10:00:00,${STRONG_TEMPLATE},45m,${STRONG_EXERCISE},1,20,15,,,,,8`,
  `2026-07-10 10:00:00,${STRONG_TEMPLATE},45m,${STRONG_EXERCISE},2,20,12,,,,,8.5`,
  `2026-07-17 10:00:00,${STRONG_TEMPLATE},45m,${STRONG_EXERCISE},1,27.5,14,,,,,`,
  `2026-07-17 10:00:00,${STRONG_TEMPLATE},45m,${STRONG_EXERCISE},2,25,16,,,,,`,
  `2026-07-17 10:00:00,${STRONG_TEMPLATE},45m,${STATIC_RESEARCH_EXERCISE},1,30,12,,,,,7`,
  `2026-07-17 10:00:00,${STRONG_TEMPLATE},45m,${STATIC_RESEARCH_EXERCISE},2,30,10,,,,,8`
].join("\n");

const ARCHIVED_STRONG_CSV = [
  "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
  `2024-01-12 09:00:00,Public Synthetic Archived Strong Session,40m,${OLD_STRONG_EXERCISE},1,80,10,,,,,8`,
  `2024-01-12 09:00:00,Public Synthetic Archived Strong Session,40m,${OLD_STRONG_EXERCISE},2,75,12,,,,,8.5`
].join("\n");

async function installBlankApp(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("comprehensive-fitness-data-v1", JSON.stringify({
      appDataVersion: 2, sessions: [], exercises: [], sets: [], templates: [], mesocycles: [], activeMesocycleId: "",
      recommendationHistory: [], manualOverrides: [], personalEvidencePackage: null, rawImports: [], migrationAudit: [], dataRevision: 0,
      settings: { weightUnit: "lb" }
    }));
  });
  await waitForApp(page);
}

async function waitForApp(page) {
  await page.goto("/");
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => String(prescriptionEvidenceStatus?.state || "loading")), {
    timeout: 45_000
  }).toBe("ready");
}

test("Strong CSV unit choice is explicit, durable per record, and duplicate-safe", async ({ page }) => {
  test.setTimeout(120_000);
  await installBlankApp(page);
  const audit = await page.evaluate((csv) => {
    data = { ...data, settings: { ...data.settings, weightUnit: "kg" } };
    let missingUnitError = "";
    try { importStrongCsv(csv); } catch (error) { missingUnitError = error.message; }
    const beforeImport = { sessions: data.sessions.length, sets: data.sets.length, rawImports: data.rawImports.length };
    importStrongCsv(csv, "lb");
    const afterFirst = {
      revision: data.dataRevision,
      sessions: data.sessions.length,
      exercises: data.exercises.length,
      sets: data.sets.length,
      templates: data.templates.length,
      rawImports: data.rawImports.length
    };
    const importedSets = data.sets.filter((set) => data.exercises.some((exercise) => exercise.source === "strong" && exercise.id === set.exerciseId));
    const retained = data.rawImports.find((item) => item.source === "strong" && item.originalText === csv);
    importStrongCsv(csv, "lb");
    const afterDuplicate = {
      revision: data.dataRevision,
      sessions: data.sessions.length,
      exercises: data.exercises.length,
      sets: data.sets.length,
      templates: data.templates.length,
      rawImports: data.rawImports.length
    };
    let conflictingUnitError = "";
    try { importStrongCsv(csv, "kg"); } catch (error) { conflictingUnitError = error.message; }
    return {
      missingUnitError,
      conflictingUnitError,
      beforeImport,
      afterFirst,
      afterDuplicate,
      appUnit: data.settings.weightUnit,
      importedUnits: [...new Set(importedSets.map((set) => set.weightUnit))],
      importedWeights: importedSets.map((set) => set.weight),
      originalUnits: [...new Set(importedSets.map((set) => set.originalImportedValue?.weightUnit))],
      rawUnit: retained?.weightUnit || "",
      rawTextPreserved: retained?.originalText === csv
    };
  }, STRONG_CSV);

  expect(audit.missingUnitError).toContain("Choose whether the Strong CSV Weight column uses");
  expect(audit.beforeImport.sets).toBe(0);
  expect(audit.beforeImport.rawImports).toBe(0);
  expect(audit.appUnit).toBe("kg");
  expect(audit.importedUnits).toEqual(["lb"]);
  expect(audit.originalUnits).toEqual(["lb"]);
  expect(audit.importedWeights).toContain(27.5);
  expect(audit.rawUnit).toBe("lb");
  expect(audit.rawTextPreserved).toBe(true);
  expect(audit.afterDuplicate).toEqual(audit.afterFirst);
  expect(audit.conflictingUnitError).toContain("already imported as lb");
});

test("Strong-only history starts an editable workout without inventing a research identity", async ({ page }) => {
  test.setTimeout(120_000);
  await installBlankApp(page);

  const audit = await page.evaluate((csv) => {
    importStrongCsv(csv, "lb");
    const template = data.templates.find((item) => item.name === "Public Synthetic Strong Upper");
    const exercise = template?.exercises.find((item) => item.name === "Public Synthetic Strong Cable Sweep");
    return {
      templateId: template?.id || "",
      source: template?.source || "",
      performanceExerciseId: exercise?.performanceExerciseId || "",
      researchExerciseId: exercise?.researchExerciseId || "",
      message: settingsMessage
    };
  }, STRONG_CSV);
  expect(audit.source).toBe("strong");
  expect(audit.performanceExerciseId).toBe("custom_public_synthetic_strong_cable_sweep");
  expect(audit.researchExerciseId).toBe("");
  expect(audit.message).toContain("Verified dated prior workout history and startable set structure for all 2 template exercises");

  await page.locator('[data-action="set-tab"][data-tab="plan"]').click();
  await page.locator(`[data-action="start-template"][data-template-id="${audit.templateId}"]`).click();
  await page.locator('[data-action="continue-template-start"]').click();
  await page.locator('[data-action="use-usual-readiness"]').click();

  await expect(page.getByRole("heading", { name: STRONG_TEMPLATE, exact: true })).toBeVisible({ timeout: 45_000 });
  const activeExerciseId = await page.evaluate((name) => data.exercises.find((exercise) => exercise.sessionId === activeWorkoutId && exercise.name === name)?.id || "", STRONG_EXERCISE);
  const card = page.locator(`.exercise-card:has([data-exercise-id="${activeExerciseId}"])`);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Using your latest imported Strong performance");
  await expect(card).not.toContainText("unknown_exercise_identity");
  await expect(card.locator('[data-action="add-set"]')).toBeEnabled();
  const pallofExerciseId = await page.evaluate((name) => data.exercises.find((exercise) => exercise.sessionId === activeWorkoutId && exercise.name === name)?.id || "", STATIC_RESEARCH_EXERCISE);
  const pallofCard = page.locator(`.exercise-card:has([data-exercise-id="${pallofExerciseId}"])`);
  await expect(pallofCard).toContainText("Using your latest imported Strong performance");
  await expect(pallofCard).not.toContainText("no_dynamic_direct_target");
  await expect(pallofCard.locator('[data-action="add-set"]')).toBeEnabled();

  const lastTime = card.locator(".set-previous");
  await expect(lastTime).toHaveCount(2);
  expect((await lastTime.allTextContents()).every((text) => text.includes("July 17") && !text.includes("No prior working set found"))).toBe(true);
  await expect(lastTime.first()).toContainText("27.5");
  await expect(lastTime.first()).toContainText("14");

  const beforeCount = await page.evaluate((exerciseId) => data.sets.filter((set) => set.exerciseId === exerciseId && !set.isWarmup).length, activeExerciseId);
  await card.locator('[data-action="add-set"]').click();
  await expect.poll(() => page.evaluate((exerciseId) => data.sets.filter((set) => set.exerciseId === exerciseId && !set.isWarmup).length, activeExerciseId)).toBe(beforeCount + 1);

  const newestSetId = await page.evaluate((exerciseId) => data.sets.filter((set) => set.exerciseId === exerciseId).sort((a, b) => Number(b.sequenceIndex) - Number(a.sequenceIndex))[0].id, activeExerciseId);
  await page.locator(`#set-${newestSetId} .set-tools-disclosure > summary`).click();
  await page.locator(`[data-action="delete-set"][data-set-id="${newestSetId}"]`).click();
  await expect.poll(() => page.evaluate((exerciseId) => data.sets.filter((set) => set.exerciseId === exerciseId && !set.isWarmup).length, activeExerciseId)).toBe(beforeCount);
  await expect.poll(() => page.evaluate((exerciseId) => new Promise((resolve, reject) => {
    const request = indexedDB.open("comprehensive-fitness", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("state", "readonly");
      const read = transaction.objectStore("state").get("app-data");
      read.onsuccess = () => resolve((read.result?.value?.sets || []).filter((set) => set.exerciseId === exerciseId && !set.isWarmup).length);
      read.onerror = () => reject(read.error);
      transaction.oncomplete = () => database.close();
    };
  }), activeExerciseId), { timeout: 15_000 }).toBe(beforeCount);

  await page.reload();
  await expect(page.getByRole("heading", { name: STRONG_TEMPLATE, exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(`[data-action="add-set"][data-exercise-id="${activeExerciseId}"]`)).toBeEnabled();
  await expect.poll(() => page.evaluate((exerciseId) => data.sets.filter((set) => set.exerciseId === exerciseId && !set.isWarmup).length, activeExerciseId)).toBe(beforeCount);
});

test("Last time searches the full submitted Strong archive and tolerates performance-ID drift", async ({ page }) => {
  test.setTimeout(120_000);
  await installBlankApp(page);
  const templateId = await page.evaluate(({ csv, exerciseName, templateName }) => {
    importStrongCsv(csv, "lb");
    const imported = data.exercises.find((exercise) => exercise.source === "strong" && exercise.name === exerciseName);
    const template = {
      id: "public-synthetic-archived-template",
      name: templateName,
      source: "strong",
      notes: "Synthetic all-history resolver regression.",
      createdAt: isoNow(),
      updatedAt: isoNow(),
      exercises: [{
        id: "public-synthetic-archived-template-exercise",
        name: exerciseName,
        performanceExerciseId: "custom_public_synthetic_identity_drift_probe",
        researchExerciseId: "",
        identitySource: "reporting_fallback",
        identityVersion: "exercise-identity/2.0.0",
        resistanceType: imported.resistanceType,
        sets: 2,
        reps: 10,
        targetRpe: 8,
        increment: 5,
        restSeconds: 90,
        warmups: [],
        setTypes: [{ type: "straight", setCount: 2, repMin: 8, repMax: 12, rpeMin: 7, rpeMax: 8, countsTowardScore: true, countsTowardVolume: true }]
      }]
    };
    commit({ ...data, templates: [template, ...data.templates] }, false);
    return template.id;
  }, { csv: ARCHIVED_STRONG_CSV, exerciseName: OLD_STRONG_EXERCISE, templateName: OLD_STRONG_TEMPLATE });

  await page.locator('[data-action="set-tab"][data-tab="plan"]').click();
  await page.locator(`[data-action="start-template"][data-template-id="${templateId}"]`).click();
  await page.locator('[data-action="continue-template-start"]').click();
  await page.locator('[data-action="use-usual-readiness"]').click();
  await expect(page.getByRole("heading", { name: OLD_STRONG_TEMPLATE, exact: true })).toBeVisible({ timeout: 45_000 });

  const activeExerciseId = await page.evaluate((name) => data.exercises.find((exercise) => exercise.sessionId === activeWorkoutId && exercise.name === name)?.id || "", OLD_STRONG_EXERCISE);
  const card = page.locator(`.exercise-card:has([data-exercise-id="${activeExerciseId}"])`);
  const lastTime = card.locator(".set-previous");
  await expect(lastTime).toHaveCount(1);
  expect((await lastTime.allTextContents()).every((text) => text.includes("January 12") && !text.includes("No prior working set found"))).toBe(true);
  await expect(lastTime.first()).toContainText("80");
  await expect(lastTime.first()).toContainText("10");
  await expect(card.locator('[data-action="add-set"]')).toBeEnabled();
});
