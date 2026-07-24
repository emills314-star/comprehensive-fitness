"use strict";

const { test, expect } = require("@playwright/test");
const {
  FIXED_NOW,
  STORAGE_KEY,
  buildTemplateLifecycleFixture
} = require("./fixtures/template-workout-history.fixture");

const TEMPLATE_NAME = "Public Synthetic Critical Lifecycle";
const EXERCISE_NAME = "Barbell Bench Press";

function collectBrowserErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function installCleanSyntheticContext(page) {
  const fixture = buildTemplateLifecycleFixture();
  fixture.templates = [];
  fixture.settings.autoStartRestTimer = true;
  fixture.settings.timerSound = false;
  fixture.settings.timerNotifications = false;
  await page.addInitScript(({ fixedNow, storageKey, storedFixture }) => {
    localStorage.clear();
    sessionStorage.clear();
    const NativeDate = Date;
    const fixedEpoch = NativeDate.parse(fixedNow);
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixedEpoch])); }
      static now() { return fixedEpoch; }
    }
    globalThis.Date = FixedDate;
    localStorage.setItem(storageKey, JSON.stringify(storedFixture));
  }, { fixedNow: FIXED_NOW, storageKey: STORAGE_KEY, storedFixture: fixture });
  await page.goto("/");
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => String(prescriptionEvidenceStatus?.state || "loading")), {
    message: "public prescription evidence must be ready before the critical lifecycle starts",
    timeout: 45_000
  }).toBe("ready");
}

async function readIndexedData(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("comprehensive-fitness", 1);
    request.onerror = () => reject(request.error || new Error("Could not open lifecycle IndexedDB."));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("state", "readonly");
      const getRequest = transaction.objectStore("state").get("app-data");
      getRequest.onerror = () => reject(getRequest.error || new Error("Could not read lifecycle app data."));
      getRequest.onsuccess = () => resolve(getRequest.result?.value ?? null);
      transaction.oncomplete = () => database.close();
    };
  }));
}

async function persistedData(page) {
  const indexed = await readIndexedData(page);
  if (indexed) return indexed;
  return page.evaluate((storageKey) => {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
    return stored?.format === "comprehensive-fitness-local-fallback" ? stored.data : stored;
  }, STORAGE_KEY);
}

async function waitForPersisted(page, predicate, message, timeout = 20_000) {
  await expect.poll(async () => Boolean(predicate(await persistedData(page))), { message, timeout }).toBe(true);
  return persistedData(page);
}

async function openProgressView(page, view) {
  const progressTab = page.locator('[data-action="set-tab"][data-tab="progress"]');
  if (await progressTab.getAttribute("aria-current") !== "page") await progressTab.click();
  await page.locator(`[data-action="set-progress-view"][data-progress-view="${view}"]`).click();
  await expect(page.locator(`[data-action="set-progress-view"][data-progress-view="${view}"]`)).toHaveAttribute("aria-current", "page");
}

test("workout completion renders the full earned achievement strip from verified outcomes", async ({ page }) => {
  test.setTimeout(90_000);
  const browserErrors = collectBrowserErrors(page);
  await installCleanSyntheticContext(page);
  const achievementResult = await page.evaluate(() => {
    const priorSession = {
      id: "achievement-prior-session",
      title: "Prior Benchmark",
      date: "2026-07-12",
      submitted: true,
      submittedAt: "2026-07-12T18:00:00.000Z",
      workoutState: "completed"
    };
    const currentSession = {
      id: "achievement-current-session",
      title: "Benchmark Session",
      date: "2026-07-16",
      submitted: true,
      submittedAt: "2026-07-16T18:00:00.000Z",
      workoutState: "completed",
      prs: [
        { exercise: "Barbell Bench Press", type: "Best estimated performance", value: "245.0 e1RM" },
        { exercise: "Barbell Bench Press", type: "Heaviest load", value: "205 lb × 5" }
      ]
    };
    const priorExercise = {
      id: "achievement-prior-exercise",
      sessionId: priorSession.id,
      name: "Barbell Bench Press",
      resistanceType: "external",
      executionQualityAssessment: "controlled"
    };
    const currentExercise = {
      id: "achievement-current-exercise",
      sessionId: currentSession.id,
      name: "Barbell Bench Press",
      resistanceType: "external",
      executionQualityAssessment: "controlled"
    };
    data.sessions.push(priorSession, currentSession);
    data.exercises.push(priorExercise, currentExercise);
    data.sets.push(
      { id: "achievement-prior-set", exerciseId: priorExercise.id, setNumber: 1, setType: "straight", completed: true, reps: 10, weight: 80, rpe: 8 },
      { id: "achievement-current-set", exerciseId: currentExercise.id, setNumber: 1, setType: "straight", completed: true, reps: 10, weight: 1000, rpe: 8, targetRpe: 8, targetRepMin: 8, targetRepMax: 10 }
    );
    entityStructureRevision += 1;
    entityIndexCache = null;
    invalidateCompletedAnalysis();
    currentSession.workoutAnalysis = {
      version: 1,
      grade: "A+",
      internalScore: 98,
      intent: "Readiness-adjusted training",
      interpretation: "Exceptional session",
      rationale: "The adjusted plan was completed precisely",
      highlights: [{ title: "Performance moved forward", detail: "A new benchmark was established." }],
      improvements: [],
      categoryScores: [{ key: "execution", label: "Program execution", earned: 25, possible: 25, reason: "Every target was met." }],
      exerciseResults: [{
        exerciseId: currentExercise.id,
        name: currentExercise.name,
        resistanceType: "external",
        isDeload: false,
        isReadinessAdjusted: true,
        plannedSets: 1,
        completedSets: 1,
        rangeCompliance: 1,
        rpeCompliance: 1,
        bestSet: { text: "1,000 lb × 10", reps: 10, load: 1000, rpe: 8 },
        priorBestSet: { text: "80 lb × 10", reps: 10, load: 80, rpe: 8 },
        comparison: { status: "progress", label: "Load progression", change: "+920 lb while remaining in range." }
      }],
      confidence: "high",
      metrics: {
        plannedSets: 1,
        completedSets: 1,
        completionRatio: 1,
        averageRangeCompliance: 1,
        rpeLoggedRatio: 1,
        rpeCompliance: 1,
        progressedExercises: 1
      },
      readinessContext: { adjustments: 1, adherence: 1 },
      deloadContext: { isDeload: false }
    };
    const badges = workoutAchievementBadges(currentSession, currentSession.workoutAnalysis);
    document.querySelector("main.app-main").innerHTML = renderCompletedWorkoutSummary(currentSession);
    return {
      keys: badges.map((badge) => badge.key),
      currentVolume: workoutSessionVolumeLoad(currentSession),
      priorVolume: workoutSessionVolumeLoad(priorSession),
      priorExerciseVolume: priorExerciseVolumeHighWater(currentSession, currentExercise),
      historyIds: activeHistorySessions({ throughDate: currentSession.date }).map((session) => session.id)
    };
  });

  expect(achievementResult.keys, JSON.stringify(achievementResult)).toEqual([
    "e1rm_peak",
    "personal_record",
    "volume_record",
    "progression",
    "plan_complete",
    "target_precision",
    "controlled_execution",
    "smart_training"
  ]);
  const strip = page.locator(".workout-achievements");
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("8 earned");
  const badges = strip.locator(".workout-achievement");
  await expect(badges).toHaveCount(8);
  await expect(strip.locator("img")).toHaveCount(8);
  const interactiveBadges = strip.locator('[data-action="toggle-achievement-detail"]');
  await expect(interactiveBadges).toHaveCount(7);
  const planComplete = strip.locator(".workout-achievement.static", { hasText: "Plan Complete" });
  await expect(planComplete).toHaveCount(1);
  await expect(planComplete).not.toContainText("View exercise details");

  const e1rmBadge = strip.locator('details.workout-achievement:has([data-achievement-key="e1rm_peak"])');
  await e1rmBadge.locator("summary").click();
  await expect(e1rmBadge).toHaveAttribute("open", "");
  await expect(e1rmBadge.locator(".workout-achievement-detail")).toContainText("Barbell Bench Press");
  await expect(e1rmBadge.locator(".workout-achievement-detail")).toContainText("245.0 e1RM");
  await expect(e1rmBadge.locator(".workout-achievement-detail")).toContainText("Previous high-water mark");
  await expect(e1rmBadge.locator(".workout-achievement-detail")).toContainText("183.7 e1RM");

  const volumeBadge = strip.locator('details.workout-achievement:has([data-achievement-key="volume_record"])');
  await volumeBadge.locator("summary").focus();
  await volumeBadge.locator("summary").press("Enter");
  await expect(volumeBadge).toHaveAttribute("open", "");
  await expect(volumeBadge.locator(".workout-achievement-detail")).toContainText("10,000 lb");
  await expect(volumeBadge.locator(".workout-achievement-detail")).toContainText(`${Math.round(achievementResult.priorExerciseVolume).toLocaleString()} lb`);
  const layout = await strip.evaluate((element) => ({
    ...(() => {
      const parseRgb = (value) => (value.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
      const luminance = (value) => {
        const channels = parseRgb(value).map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const contrast = (foreground, background) => {
        const light = Math.max(luminance(foreground), luminance(background));
        const dark = Math.min(luminance(foreground), luminance(background));
        return (light + 0.05) / (dark + 0.05);
      };
      const card = element.querySelector(".workout-achievement");
      const cardBackground = getComputedStyle(card).backgroundColor;
      const sectionBackground = getComputedStyle(element).backgroundColor;
      const heading = element.querySelector(".workout-achievements-heading h3");
      const kicker = element.querySelector(".workout-achievements-heading .section-kicker");
      const earned = element.querySelector(".workout-achievements-heading > strong");
      const evidence = element.querySelector("details[open] .workout-achievement-evidence");
      const evidenceBackground = getComputedStyle(evidence).backgroundColor;
      return {
        titleContrast: contrast(getComputedStyle(card.querySelector(".workout-achievement-title")).color, cardBackground),
        descriptionContrast: contrast(getComputedStyle(card.querySelector(".workout-achievement-description")).color, cardBackground),
        headingContrast: contrast(getComputedStyle(heading).color, sectionBackground),
        kickerContrast: contrast(getComputedStyle(kicker).color, sectionBackground),
        earnedContrast: contrast(getComputedStyle(earned).color, getComputedStyle(earned).backgroundColor),
        evidenceNameContrast: contrast(getComputedStyle(evidence.querySelector("header strong")).color, evidenceBackground),
        evidenceLabelContrast: contrast(getComputedStyle(evidence.querySelector("div span")).color, evidenceBackground),
        evidenceValueContrast: contrast(getComputedStyle(evidence.querySelector("div strong")).color, evidenceBackground)
      };
    })(),
    stripWidth: element.getBoundingClientRect().width,
    pageWidth: document.documentElement.clientWidth,
    pageScrollWidth: document.documentElement.scrollWidth,
    missingImages: [...element.querySelectorAll("img")].filter((image) => !image.complete || image.naturalWidth === 0).length,
    openDetailWidth: element.querySelector('details[open]')?.getBoundingClientRect().width || 0
  }));
  expect(layout.missingImages).toBe(0);
  expect(layout.titleContrast).toBeGreaterThanOrEqual(7);
  expect(layout.descriptionContrast).toBeGreaterThanOrEqual(4.5);
  expect(layout.headingContrast).toBeGreaterThanOrEqual(7);
  expect(layout.kickerContrast).toBeGreaterThanOrEqual(4.5);
  expect(layout.earnedContrast).toBeGreaterThanOrEqual(7);
  expect(layout.evidenceNameContrast).toBeGreaterThanOrEqual(7);
  expect(layout.evidenceLabelContrast).toBeGreaterThanOrEqual(4.5);
  expect(layout.evidenceValueContrast).toBeGreaterThanOrEqual(7);
  expect(layout.stripWidth).toBeLessThanOrEqual(layout.pageWidth);
  expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.pageWidth);
  expect(layout.openDetailWidth).toBeGreaterThan(layout.stripWidth * 0.8);
  expect(browserErrors).toEqual([]);
});

test("critical workout lifecycle remains coherent through submission, progress, reload, and unit conversion", async ({ page }) => {
  test.setTimeout(180_000);
  const browserErrors = collectBrowserErrors(page);
  await installCleanSyntheticContext(page);

  await page.locator('[data-action="set-tab"][data-tab="plan"]').click();
  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();
  await expect(page.locator(".template-card")).toHaveCount(0);
  await page.locator('[data-action="new-template"]').click();

  const templateCard = page.locator(".template-card").first();
  const templateName = templateCard.locator('[data-action="template-name"]');
  const templateId = await templateName.getAttribute("data-template-id");
  expect(templateId, "the UI-created template must receive a stable ID").toBeTruthy();
  await templateName.fill(TEMPLATE_NAME);
  await templateCard.locator('[data-action="toggle-template-editor"]').click();
  await templateCard.locator('[data-action="template-exercise-name"]').fill(EXERCISE_NAME);
  await templateCard.locator('[data-action="template-exercise-sets"]').fill("2");
  await templateCard.locator('[data-action="template-exercise-reps"]').fill("8");
  await templateCard.locator('[data-action="template-exercise-rpe"]').fill("8");
  await templateCard.locator('[data-action="template-exercise-rest"]').fill("90");
  await waitForPersisted(page, (stored) => {
    const template = stored?.templates?.find((item) => item.id === templateId);
    return template?.name === TEMPLATE_NAME
      && template.exercises?.length === 1
      && template.exercises[0].name === EXERCISE_NAME
      && template.exercises[0].sets === 2
      && template.exercises[0].restSeconds === 90;
  }, "the UI-created synthetic template must persist before it starts");

  await templateCard.locator(`[data-action="start-template"][data-template-id="${templateId}"]`).click();
  await expect(page.getByRole("dialog", { name: `Start ${TEMPLATE_NAME}?` })).toBeVisible();
  await page.locator('[data-action="continue-template-start"]').click();
  await expect(page.getByRole("dialog", { name: "Use your usual readiness?" })).toBeVisible();
  await page.locator('[data-action="use-usual-readiness"]').click();
  await expect(page.getByRole("heading", { name: TEMPLATE_NAME, exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("In progress", { exact: true })).toBeVisible();
  await expect(page.locator(".exercise-card")).toHaveCount(1);

  const active = await waitForPersisted(page, (stored) => stored?.sessions?.some((session) => session.templateId === templateId && session.workoutStarted && !session.submitted), "template start must persist one active workout");
  const activeSession = active.sessions.find((session) => session.templateId === templateId && session.workoutStarted && !session.submitted);
  const activeExercise = active.exercises.find((exercise) => exercise.sessionId === activeSession.id);
  expect(activeSession.readinessMode).toBe("usual");
  expect(activeExercise?.name).toBe(EXERCISE_NAME);

  const firstWorkingSet = page.locator(".exercise-card .set-block:not(.warmup), .exercise-card [id^=set-]:not(.warmup)").filter({
    has: page.locator('[data-action="toggle-set"]')
  }).first();
  const completion = firstWorkingSet.locator('[data-action="toggle-set"]');
  await completion.click();
  await expect(completion).toHaveAttribute("aria-pressed", "true");
  const timer = firstWorkingSet.locator(".timer-bar");
  await expect(timer, "completing an eligible set must start its rest timer").toBeVisible();
  await timer.locator("summary").click();
  await timer.getByRole("button", { name: "Pause timer" }).click();
  await expect(timer.getByRole("button", { name: "Resume timer" })).toBeVisible();
  await timer.getByRole("button", { name: "Resume timer" }).click();
  await timer.getByRole("button", { name: "Add 15 seconds" }).click();
  if (!await timer.evaluate((element) => element.open)) await timer.locator("summary").click();
  await timer.getByRole("button", { name: "Skip rest", exact: true }).click();
  await expect(firstWorkingSet.locator(".timer-bar")).toHaveCount(0);

  await page.locator('[data-action="request-submit-workout"]').click();
  await expect(page.getByText("Log this workout as completed?", { exact: true })).toBeVisible();
  await page.locator('[data-action="cancel-submit-workout"]').click();
  await expect(page.getByText("Log this workout as completed?", { exact: true })).toHaveCount(0);
  await expect(completion).toHaveAttribute("aria-pressed", "true");

  await page.locator('[data-action="request-submit-workout"]').click();
  await page.locator('[data-action="confirm-submit-workout"]').click();
  const summary = page.locator('.completed-summary[aria-label="Post-workout grade and analysis"]');
  await expect(summary).toBeVisible({ timeout: 45_000 });
  await expect(summary).toContainText("Workout logged");
  const submitted = await waitForPersisted(page, (stored) => stored?.sessions?.filter((session) => session.id === activeSession.id && session.submitted).length === 1, "confirmed submission must persist exactly one completed session");
  expect(submitted.sets.filter((set) => set.exerciseId === activeExercise.id && set.completed)).toHaveLength(1);

  await openProgressView(page, "history");
  const submittedCard = page.locator(`[data-action="open-session"][data-session-id="${activeSession.id}"]`);
  await expect(submittedCard).toHaveCount(1);
  await expect(submittedCard).toContainText(TEMPLATE_NAME);

  await openProgressView(page, "overview");
  await expect(page.locator(".dashboard-view")).toBeVisible();
  await expect(page.getByText("This week's coach", { exact: true })).toBeVisible();
  await expect(page.locator(".dashboard-summary-row")).toContainText("logged sessions");

  await openProgressView(page, "lifts");
  await expect(page.getByRole("combobox", { name: "Search or select exercise" })).toHaveValue(EXERCISE_NAME, { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Progress charts", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => String(prescriptionEvidenceStatus?.state || "loading")), { timeout: 45_000 }).toBe("ready");
  await openProgressView(page, "history");
  await expect(page.locator(`[data-action="open-session"][data-session-id="${activeSession.id}"]`), "the submitted session must survive reload").toHaveCount(1);

  const beforeUnitChange = await persistedData(page);
  const originalSet = beforeUnitChange.sets.find((set) => set.exerciseId === activeExercise.id && set.completed);
  expect(originalSet.weightUnit).toBe("lb");
  await page.locator('[data-action="toggle-unit"]').click();
  const kilograms = await waitForPersisted(page, (stored) => stored?.settings?.weightUnit === "kg" && stored.sets.find((set) => set.id === originalSet.id)?.weightUnit === "kg", "lb to kg conversion must persist coherently");
  const kilogramSet = kilograms.sets.find((set) => set.id === originalSet.id);
  expect(kilogramSet.weight).toBeCloseTo(originalSet.weight / 2.2046226218, 2);
  await expect(page.locator('[data-action="toggle-unit"]')).toHaveText("KG");

  await page.locator('[data-action="toggle-unit"]').click();
  const pounds = await waitForPersisted(page, (stored) => stored?.settings?.weightUnit === "lb" && stored.sets.find((set) => set.id === originalSet.id)?.weightUnit === "lb", "kg to lb round trip must persist coherently");
  expect(pounds.sets.find((set) => set.id === originalSet.id).weight).toBeCloseTo(originalSet.weight, 1);
  await page.reload();
  await expect(page.locator('[data-action="toggle-unit"]')).toHaveText("LB", { timeout: 45_000 });
  await openProgressView(page, "history");
  await expect(page.locator(`[data-action="open-session"][data-session-id="${activeSession.id}"]`)).toHaveCount(1);
  expect(browserErrors, "the complete critical lifecycle must not emit browser errors").toEqual([]);
});
