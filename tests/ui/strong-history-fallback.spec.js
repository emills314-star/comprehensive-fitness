"use strict";

const { test, expect } = require("@playwright/test");
const { closeLoadedBarSheet, focusExercise, openExerciseOptions, openSetOptions } = require("./fixtures/loaded-bar.helpers");

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
      appDataVersion: 3, sessions: [], exercises: [], sets: [], templates: [],
      rawImports: [], migrationAudit: [], dataRevision: 0,
      settings: { weightUnit: "lb" }
    }));
  });
  await waitForApp(page);
}

async function waitForApp(page) {
  await page.goto("/");
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => {
    const identity = prescriptionEngine?.resolveExerciseIdentity?.("Barbell Bench Press");
    return identity?.status === "resolved" ? identity.exerciseId : "";
  }), {
    timeout: 45_000
  }).toBe("ex_barbell_bench_press");
}

test("Strong CSV unit choice is explicit, durable per record, and duplicate-safe", async ({ page }) => {
  test.setTimeout(120_000);
  await installBlankApp(page);
  const audit = await page.evaluate(async (csv) => {
    data = { ...data, settings: { ...data.settings, weightUnit: "kg" } };
    let missingUnitError = "";
    try { importStrongCsv(csv); } catch (error) { missingUnitError = error.message; }
    const beforeImport = { sessions: data.sessions.length, sets: data.sets.length, rawImports: data.rawImports.length };
    const firstPreview = importStrongCsv(csv, "lb");
    const afterPreview = { sessions: data.sessions.length, sets: data.sets.length, rawImports: data.rawImports.length };
    await applyPendingImport();
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
    const duplicatePreview = importStrongCsv(csv, "lb");
    await applyPendingImport();
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
      afterPreview,
      firstPreview,
      duplicatePreview,
      afterFirst,
      afterDuplicate,
      appUnit: data.settings.weightUnit,
      importedUnits: [...new Set(importedSets.map((set) => set.weightUnit))],
      importedWeights: importedSets.map((set) => set.weight),
      originalUnits: [...new Set(importedSets.map((set) => set.originalImportedValue?.weightUnit))],
      rawUnit: retained?.weightUnit || "",
      rawVersion: retained?.importVersion || "",
      rawTextPreserved: retained?.originalText === csv
    };
  }, STRONG_CSV);

  expect(audit.missingUnitError).toContain("Choose whether the Strong CSV Weight column uses");
  expect(audit.beforeImport.sets).toBe(0);
  expect(audit.beforeImport.rawImports).toBe(0);
  expect(audit.afterPreview).toEqual(audit.beforeImport);
  expect(audit.firstPreview).toMatchObject({
    mode: "Merge history",
    version: "strong-csv-import/1.0.0",
    sourceUnit: "lb",
    counts: { sessions: 2, exercises: 3, sets: 6, templates: 1 }
  });
  expect(audit.duplicatePreview).toMatchObject({ mode: "No changes", counts: { sessions: 0, exercises: 0, sets: 0, templates: 0 } });
  expect(audit.appUnit).toBe("kg");
  expect(audit.importedUnits).toEqual(["lb"]);
  expect(audit.originalUnits).toEqual(["lb"]);
  expect(audit.importedWeights).toContain(27.5);
  expect(audit.rawUnit).toBe("lb");
  expect(audit.rawVersion).toBe("strong-csv-import/1.0.0");
  expect(audit.rawTextPreserved).toBe(true);
  expect(audit.afterDuplicate).toEqual(audit.afterFirst);
  expect(audit.conflictingUnitError).toContain("already imported as lb");
});

test("Strong CSV file selection shows a bounded preview and explicit Apply before durable change", async ({ page }) => {
  test.setTimeout(120_000);
  await installBlankApp(page);
  await page.locator('[data-action="open-settings"]').click();
  const group = page.locator("details.settings-group").filter({ has: page.locator("summary", { hasText: "Data and backup" }) });
  await group.locator("summary").click();
  await group.locator('[data-action="strong-import-weight-unit"]').selectOption("lb");

  const before = await page.evaluate(() => ({
    revision: data.dataRevision,
    sessions: data.sessions.length,
    sets: data.sets.length,
    rawImports: data.rawImports.length
  }));
  await group.locator('[data-action="import-data"]').setInputFiles({
    name: "public-synthetic-strong-preview.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(STRONG_CSV, "utf8")
  });

  const preview = group.locator("[data-import-preview]");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("Strong CSV ready to apply");
  await expect(preview).toContainText("2 workouts · 3 exercises · 6 sets · 1 routine");
  await expect(preview).toContainText("source weights lb");
  await expect(preview).toContainText("No data has changed");
  await expect(group.locator('[data-import-status]')).toHaveAttribute("data-import-state", "preview");
  await expect.poll(() => page.evaluate(() => ({
    revision: data.dataRevision,
    sessions: data.sessions.length,
    sets: data.sets.length,
    rawImports: data.rawImports.length
  }))).toEqual(before);

  await preview.getByRole("button", { name: "Apply import" }).click();
  await expect(group.locator('[data-import-status]')).toHaveAttribute("data-import-state", "accepted");
  await expect(preview).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => ({
    sessions: data.sessions.filter((session) => session.source === "strong").length,
    sets: data.sets.filter((set) => data.exercises.some((exercise) => exercise.source === "strong" && exercise.id === set.exerciseId)).length,
    rawVersion: data.rawImports.find((item) => item.source === "strong")?.importVersion || ""
  }))).toEqual({ sessions: 2, sets: 6, rawVersion: "strong-csv-import/1.0.0" });
  await expect.poll(() => page.evaluate(async () => {
    const stored = await readIndexedValue("app-data");
    return stored?.rawImports?.find((item) => item.source === "strong")?.importVersion || "";
  })).toBe("strong-csv-import/1.0.0");
});

test("a post-write Strong finalization failure restores the original durable app data", async ({ page }) => {
  test.setTimeout(120_000);
  await installBlankApp(page);
  const result = await page.evaluate(async (csv) => {
    const before = cloneImportSnapshot(data);
    const beforePersisted = await readIndexedValue("app-data");
    importStrongCsv(csv, "lb", { render: false });
    const realAudit = strongImportAuditMessage;
    strongImportAuditMessage = () => { throw new Error("Synthetic post-write finalization failure"); };
    let applied = false;
    try { applied = await applyPendingImport(); }
    finally { strongImportAuditMessage = realAudit; }
    const afterPersisted = await readIndexedValue("app-data");
    return {
      applied,
      status: importStatus.state,
      message: importStatus.message,
      liveEqual: JSON.stringify(data) === JSON.stringify(before),
      durableEqual: JSON.stringify(afterPersisted) === JSON.stringify(beforePersisted)
    };
  }, STRONG_CSV);
  expect(result).toMatchObject({
    applied: false,
    status: "rejected",
    liveEqual: true,
    durableEqual: true
  });
  expect(result.message).toContain("Synthetic post-write finalization failure");
  expect(result.message).toContain("original app data");
  expect(result.message).toContain("restored");
});

test("all configured research-mapped Strong labels resolve through the browser's public identity registry", async ({ page }) => {
  await installBlankApp(page);
  const expected = {
    "Ab Wheel": "ex_ab_wheel",
    "Bench Press (Barbell)": "ex_barbell_bench_press",
    "Bicep Curl (Cable)": "ex_cable_curl",
    "Bicep Curls Light (Cable)": "ex_cable_curl",
    "Calf Press on Seated Leg Press": "ex_leg_press_calf_raise",
    "Incline Bench Press (Dumbbell)": "ex_incline_dumbbell_press",
    "Incline Curl (Dumbbell)": "ex_incline_dumbbell_curl",
    "Lat Pulldown Double Pulley": "ex_lat_pulldown",
    "Lateral Raise (Cable)": "ex_cable_lateral_raise",
    "Leg Extension (Heavy)": "ex_leg_extension",
    "Leg Extension (Machine)": "ex_leg_extension",
    "Lying Leg Curl (Machine)": "ex_lying_leg_curl",
    "Neck Curls (Back)": "ex_neck_extension",
    "Neck Curls (Front)": "ex_neck_flexion",
    "Seated Leg Curl (Machine)": "ex_seated_leg_curl",
    "Standing Calf Raise (Machine)": "ex_standing_calf_raise",
    "Tricep Pushdown - Dongles": "ex_cable_pushdown",
    "Triceps Pushdown (Cable - Straight Bar)": "ex_cable_pushdown"
  };
  const audit = await page.evaluate((entries) => entries.map(([recordedName, exerciseId]) => ({
    recordedName,
    exerciseId,
    identity: prescriptionEngine.resolveExerciseIdentity(recordedName),
    profile: resolveExerciseIdentityProfile({ name: recordedName })
  })), Object.entries(expected));

  for (const result of audit) {
    expect(result.identity).toMatchObject({ status: "resolved", exerciseId: result.exerciseId, source: "research_alias" });
    expect(result.profile).toMatchObject({ status: "resolved", researchExerciseId: result.exerciseId, executable: true });
    expect(["research_alias", "personal_research_crosswalk"]).toContain(result.profile.identitySource);
    if (result.profile.identitySource === "research_alias") {
      expect(result.profile.performanceExerciseId).toBe(`alias_${result.recordedName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`);
    } else {
      expect(result.profile.performanceExerciseId).not.toBe(result.exerciseId);
    }
  }
});

test("Strong-only history starts an editable workout without inventing a research identity", async ({ page }) => {
  test.setTimeout(120_000);
  await installBlankApp(page);

  const audit = await page.evaluate(async (csv) => {
    importStrongCsv(csv, "lb");
    await applyPendingImport();
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
  expect(audit.performanceExerciseId).toMatch(/^custom_public_synthetic_strong_cable_sweep_[0-9a-f]{8}$/);
  expect(audit.researchExerciseId).toBe("");
  expect(audit.message).toContain("Verified dated prior workout history and startable set structure for all 2 template exercises");

  await page.getByRole("button", { name: "Routines", exact: true }).click();
  await page.locator(`[data-template-id="${audit.templateId}"][data-action="start-next-template"], [data-template-id="${audit.templateId}"][data-action="start-template"]`).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await expect(page.getByRole("heading", { name: STRONG_TEMPLATE, exact: true })).toBeVisible({ timeout: 45_000 });
  const activeExerciseId = await page.evaluate((name) => data.exercises.find((exercise) => exercise.sessionId === activeWorkoutId && exercise.name === name)?.id || "", STRONG_EXERCISE);
  const card = await focusExercise(page, activeExerciseId);
  await expect(card).toHaveCount(1);
  await expect(card).not.toContainText("unknown_exercise_identity");
  const options = await openExerciseOptions(page, activeExerciseId);
  await expect(options.locator('[data-action="add-set"]')).toBeEnabled();
  await closeLoadedBarSheet(page);
  const pallofExerciseId = await page.evaluate((name) => data.exercises.find((exercise) => exercise.sessionId === activeWorkoutId && exercise.name === name)?.id || "", STATIC_RESEARCH_EXERCISE);
  const pallofCard = await focusExercise(page, pallofExerciseId);
  await expect(pallofCard).not.toContainText("no_dynamic_direct_target");
  const pallofOptions = await openExerciseOptions(page, pallofExerciseId);
  await expect(pallofOptions.locator('[data-action="add-set"]')).toBeEnabled();
  await closeLoadedBarSheet(page);
  await focusExercise(page, activeExerciseId);

  const lastTime = card.locator(".loaded-bar-previous .set-previous-link");
  await expect(lastTime).toHaveCount(2);
  for (const previous of await lastTime.all()) await expect(previous).toHaveAttribute("title", /July 17/);
  await expect(lastTime.first()).toContainText("27.5");
  await expect(lastTime.first()).toContainText("14");
  await expect(lastTime.nth(1)).toContainText("25 × 16");
  // PLAN R5 and coach contract §9: prior values are targets, not actuals.
  const firstRow = card.locator(".loaded-bar-row").first();
  await expect(firstRow.locator('[data-action="set-weight"]')).toHaveValue("");
  await expect(firstRow.locator('[data-action="set-weight"]')).toHaveAttribute("placeholder", "27.5");
  await expect(firstRow.locator('[data-action="set-reps"]')).toHaveValue("");
  await expect(firstRow.locator('[data-action="set-reps"]')).toHaveAttribute("placeholder", "14");
  await expect(firstRow.locator('[data-action="set-rpe"]')).toHaveValue("");
  await firstRow.locator('[data-action="toggle-set"]').click();
  await expect(firstRow.locator('[data-action="set-weight"]')).toHaveValue("27.5");
  await expect(firstRow.locator('[data-action="set-reps"]')).toHaveValue("14");
  await expect(firstRow.locator('[data-action="set-rpe"]')).toHaveValue("");

  const beforeCount = await page.evaluate((exerciseId) => data.sets.filter((set) => set.exerciseId === exerciseId && !set.isWarmup).length, activeExerciseId);
  const addOptions = await openExerciseOptions(page, activeExerciseId);
  await addOptions.locator('[data-action="add-set"]').click();
  await closeLoadedBarSheet(page);
  await expect.poll(() => page.evaluate((exerciseId) => data.sets.filter((set) => set.exerciseId === exerciseId && !set.isWarmup).length, activeExerciseId)).toBe(beforeCount + 1);

  const newestSetId = await page.evaluate((exerciseId) => data.sets.filter((set) => set.exerciseId === exerciseId).sort((a, b) => Number(b.sequenceIndex) - Number(a.sequenceIndex))[0].id, activeExerciseId);
  const setOptions = await openSetOptions(page, newestSetId);
  await setOptions.locator(`[data-action="delete-set"][data-set-id="${newestSetId}"]`).click();
  await closeLoadedBarSheet(page);
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
  const recoveredOptions = await openExerciseOptions(page, activeExerciseId);
  await expect(recoveredOptions.locator(`[data-action="add-set"][data-exercise-id="${activeExerciseId}"]`)).toBeEnabled();
  await expect.poll(() => page.evaluate((exerciseId) => data.sets.filter((set) => set.exerciseId === exerciseId && !set.isWarmup).length, activeExerciseId)).toBe(beforeCount);
});

test("Last time keeps a distinct performance identity separate from the Strong archive", async ({ page }) => {
  test.setTimeout(120_000);
  await installBlankApp(page);
  const templateId = await page.evaluate(async ({ csv, exerciseName, templateName }) => {
    importStrongCsv(csv, "lb");
    await applyPendingImport();
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

  await page.getByRole("button", { name: "Routines", exact: true }).click();
  await page.locator(`[data-template-id="${templateId}"][data-action="start-next-template"], [data-template-id="${templateId}"][data-action="start-template"]`).first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: OLD_STRONG_TEMPLATE, exact: true })).toBeVisible({ timeout: 45_000 });

  const activeExerciseId = await page.evaluate((name) => data.exercises.find((exercise) => exercise.sessionId === activeWorkoutId && exercise.name === name)?.id || "", OLD_STRONG_EXERCISE);
  const card = await focusExercise(page, activeExerciseId);
  const lastTime = card.locator(".loaded-bar-previous .set-previous-link");
  await expect(lastTime).toHaveCount(2);
  await expect(lastTime.first()).toHaveAttribute("title", /January 12/);
  await expect(page.getByRole("columnheader", { name: "LB", exact: true })).toBeVisible();
  await expect(lastTime.first()).toHaveText("80 × 10 @ 8");
  await expect(lastTime.nth(1)).toHaveText("75 × 12 @ 8.5");
  const options = await openExerciseOptions(page, activeExerciseId);
  await expect(options.locator('[data-action="add-set"]')).toBeEnabled();
});
