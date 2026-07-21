"use strict";

const { test, expect } = require("@playwright/test");
const { validFullState } = require("../fixtures/synthetic-app-backups");
const {
  FIXED_NOW,
  IDS,
  STORAGE_KEY,
  buildActiveWorkoutLifecycleFixture,
  buildTemplateLifecycleFixture
} = require("./fixtures/template-workout-history.fixture");

const LOCAL_FALLBACK_FORMAT = "comprehensive-fitness-local-fallback";
const LOCAL_FALLBACK_VERSION = 1;
const FIXTURE_MARKER = "__cf_runtime_trust_fixture_installed__";

test.use({ actionTimeout: 15_000, navigationTimeout: 45_000 });

function clone(value) {
  return structuredClone(value);
}

async function createFixturePage(browser, baseURL, fixture) {
  const context = await browser.newContext({
    baseURL,
    serviceWorkers: "block",
    viewport: { width: 1280, height: 900 }
  });
  await context.addInitScript(({ fixedNow, marker, storageKey, storedFixture }) => {
    const NativeDate = Date;
    const fixedEpoch = NativeDate.parse(fixedNow);
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixedEpoch])); }
      static now() { return fixedEpoch; }
    }
    globalThis.Date = FixedDate;
    if (sessionStorage.getItem(marker) !== "1") {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(storageKey, JSON.stringify(storedFixture));
      sessionStorage.setItem(marker, "1");
    }
  }, { fixedNow: FIXED_NOW, marker: FIXTURE_MARKER, storageKey: STORAGE_KEY, storedFixture: fixture });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => String(prescriptionEvidenceStatus?.state || "loading")), {
    message: "the public recommendation bundle must reach a terminal state",
    timeout: 45_000
  }).not.toBe("loading");
  return { context, page };
}

async function readPersistedRecord(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("comprehensive-fitness", 1);
    request.onerror = () => reject(request.error || new Error("Could not open runtime-trust IndexedDB."));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("state", "readonly");
      const getRequest = transaction.objectStore("state").get("app-data");
      getRequest.onerror = () => reject(getRequest.error || new Error("Could not read runtime-trust app data."));
      getRequest.onsuccess = () => resolve(getRequest.result || null);
      transaction.oncomplete = () => database.close();
    };
  }));
}

async function readPersistedData(page) {
  return (await readPersistedRecord(page))?.value || null;
}

async function writePersistedRecord(page, value, updatedAt) {
  await page.evaluate(({ storedValue, storedUpdatedAt }) => new Promise((resolve, reject) => {
    const request = indexedDB.open("comprehensive-fitness", 1);
    request.onerror = () => reject(request.error || new Error("Could not open conflict-fixture IndexedDB."));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("state", "readwrite");
      transaction.objectStore("state").put({ key: "app-data", value: storedValue, updatedAt: storedUpdatedAt });
      transaction.onerror = () => reject(transaction.error || new Error("Could not seed the conflict fixture."));
      transaction.oncomplete = () => { database.close(); resolve(); };
    };
  }), { storedValue: value, storedUpdatedAt: updatedAt });
}

async function openPrimaryTab(page, tabId) {
  const destination = ({ lift: "today", dashboard: "progress", charts: "progress", data: "more" })[tabId] || tabId;
  const tab = page.locator(`[data-action="set-tab"][data-tab="${destination}"]`);
  await tab.click();
  await expect(tab).toHaveAttribute("aria-current", "page");
  if (tabId === "charts" || tabId === "dashboard") await page.locator(`[data-action="set-progress-view"][data-progress-view="${tabId === "charts" ? "lifts" : "overview"}"]`).click();
}

async function openBackupGroup(page) {
  await openPrimaryTab(page, "data");
  const group = page.locator("details.settings-group").filter({
    has: page.locator("summary", { hasText: "Data and backup" })
  });
  await expect(group).toHaveCount(1);
  if (!await group.evaluate((element) => element.open)) await group.locator("summary").click();
  return group;
}

async function armImportAudit(page) {
  await page.evaluate(async () => {
    globalThis.cancelPendingDataSave?.();
    const persisted = await readIndexedValue("app-data");
    const realWrite = writeIndexedValue;
    const realImport = importDataFile;
    const realScheduleSave = scheduleSave;
    const muscleCacheKey = `runtime-trust-muscle-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const prescriptionCacheKey = `runtime-trust-prescription-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const muscleSentinel = Object.freeze({ kind: "muscle", key: muscleCacheKey });
    const prescriptionSentinel = Object.freeze({ kind: "prescription", key: prescriptionCacheKey });
    muscleAssignmentCache.set(muscleCacheKey, muscleSentinel);
    prescriptionSnapshotCache.set(prescriptionCacheKey, prescriptionSentinel);
    const state = globalThis.__CF_RUNTIME_IMPORT_AUDIT__ = {
      beforeData: data,
      beforeDataJson: JSON.stringify(data),
      beforePersistedJson: JSON.stringify(persisted),
      beforeRevision: Number(data.dataRevision || 0),
      beforeAnalysisRevision: analysisRevision,
      beforeEngine: prescriptionEngine,
      beforeEvidenceStatus: prescriptionEvidenceStatus,
      beforeEvidenceStatusJson: JSON.stringify(prescriptionEvidenceStatus || null),
      muscleCacheKey,
      prescriptionCacheKey,
      muscleSentinel,
      prescriptionSentinel,
      writesStarted: 0,
      writesSettled: 0,
      importsStarted: 0,
      importsSettled: 0,
      fileTextReads: 0
    };
    state.savesScheduled = 0;
    writeIndexedValue = async function observedRuntimeTrustWrite(key, value) {
      if (key === "app-data") state.writesStarted += 1;
      try { return await Reflect.apply(realWrite, this, [key, value]); }
      finally { if (key === "app-data") state.writesSettled += 1; }
    };
    importDataFile = async function observedRuntimeTrustImport(file) {
      state.importsStarted += 1;
      try { return await Reflect.apply(realImport, this, [file]); }
      finally { state.importsSettled += 1; }
    };
    scheduleSave = function observedRuntimeTrustScheduleSave(...args) {
      state.savesScheduled += 1;
      return Reflect.apply(realScheduleSave, this, args);
    };
  });
}

async function collectImportAudit(page) {
  return page.evaluate(async () => {
    const state = globalThis.__CF_RUNTIME_IMPORT_AUDIT__;
    const persisted = await readIndexedValue("app-data");
    return {
      beforeRevision: state.beforeRevision,
      beforeAnalysisRevision: state.beforeAnalysisRevision,
      writesStarted: state.writesStarted,
      writesSettled: state.writesSettled,
      importsStarted: state.importsStarted,
      importsSettled: state.importsSettled,
      savesScheduled: state.savesScheduled,
      fileTextReads: state.fileTextReads,
      dataReferenceUnchanged: data === state.beforeData,
      dataJsonUnchanged: JSON.stringify(data) === state.beforeDataJson,
      persistedJsonUnchanged: JSON.stringify(persisted) === state.beforePersistedJson,
      analysisRevisionUnchanged: analysisRevision === state.beforeAnalysisRevision,
      engineReferenceUnchanged: prescriptionEngine === state.beforeEngine,
      evidenceStatusReferenceUnchanged: prescriptionEvidenceStatus === state.beforeEvidenceStatus,
      evidenceStatusJsonUnchanged: JSON.stringify(prescriptionEvidenceStatus || null) === state.beforeEvidenceStatusJson,
      muscleCacheSentinelRetained: muscleAssignmentCache.get(state.muscleCacheKey) === state.muscleSentinel,
      prescriptionCacheSentinelRetained: prescriptionSnapshotCache.get(state.prescriptionCacheKey) === state.prescriptionSentinel,
      currentRevision: Number(data.dataRevision),
      currentRevisionIsSafe: Number.isSafeInteger(data.dataRevision) && data.dataRevision >= 0,
      persistedRevision: Number(persisted?.dataRevision),
      currentDataJson: JSON.stringify(data),
      persistedJson: JSON.stringify(persisted)
    };
  });
}

async function readImportStatus(group) {
  return group.locator("[data-import-status]").evaluateAll((nodes) => ({
    attempt: Number(nodes[0]?.getAttribute("data-import-attempt") || 0),
    state: String(nodes[0]?.getAttribute("data-import-state") || ""),
    text: String(nodes[0]?.textContent || "")
  }));
}

async function importBackup(page, group, value, name) {
  const input = group.locator('[data-action="import-data"]');
  const beforeStatus = await readImportStatus(group);
  await input.setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value), "utf8")
  });
  await expect.poll(async () => {
    const status = await readImportStatus(group);
    return status.attempt > beforeStatus.attempt && /^(?:accepted|rejected)$/.test(status.state);
  }, { message: `${name} must publish a new terminal import attempt`, timeout: 20_000 }).toBe(true);
  const result = { beforeAttempt: beforeStatus.attempt, ...await readImportStatus(group) };
  return result;
}

async function seedEqualRevisionConflict(page) {
  const base = await readPersistedData(page);
  const indexed = clone(base);
  const alternate = clone(base);
  indexed.templates[0].name = "Public Synthetic Indexed Conflict Copy";
  alternate.templates[0].name = "Public Synthetic Local Conflict Alternate";
  indexed.dataRevision = 41;
  alternate.dataRevision = 41;
  const updatedAt = "2026-07-15T15:00:00.000Z";
  await page.evaluate(() => {
    globalThis.cancelPendingDataSave?.();
    if (globalThis.persistBeforeSuspend) {
      window.removeEventListener("pagehide", globalThis.persistBeforeSuspend);
      window.removeEventListener("beforeunload", globalThis.persistBeforeSuspend);
    }
  });
  await writePersistedRecord(page, indexed, updatedAt);
  await page.evaluate(({ storageKey, fallbackFormat, fallbackVersion, storedAlternate, timestamp }) => {
    localStorage.setItem(storageKey, JSON.stringify({
      format: fallbackFormat,
      version: fallbackVersion,
      source: "public-synthetic-two-store-conflict",
      updatedAt: timestamp,
      conflictPreserved: false,
      conflictReason: "",
      data: storedAlternate
    }));
  }, {
    storageKey: STORAGE_KEY,
    fallbackFormat: LOCAL_FALLBACK_FORMAT,
    fallbackVersion: LOCAL_FALLBACK_VERSION,
    storedAlternate: alternate,
    timestamp: updatedAt
  });
  await page.reload();
  await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
  await openPrimaryTab(page, "data");
  await expect(page.locator(".persistence-conflict-note")).toBeVisible();
  return { indexed, alternate };
}

function containsSentinel(value, sentinel) {
  if (value === sentinel) return true;
  if (Array.isArray(value)) return value.some((item) => containsSentinel(item, sentinel));
  return Boolean(value && typeof value === "object" && Object.values(value).some((item) => containsSentinel(item, sentinel)));
}

test("backup import validates revision metadata but always commits on the local monotonic clock", async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const cases = [
    { name: "omitted", expected: "accepted", mutate: (state) => { delete state.dataRevision; } },
    { name: "negative", expected: "rejected", mutate: (state) => { state.dataRevision = -1; } },
    { name: "fractional", expected: "rejected", mutate: (state) => { state.dataRevision = 7.5; } },
    { name: "unsafe", expected: "rejected", mutate: (state) => { state.dataRevision = Number.MAX_SAFE_INTEGER + 1; } },
    { name: "maximum-safe", expected: "accepted", mutate: (state) => { state.dataRevision = Number.MAX_SAFE_INTEGER; }, verifyNextCommit: true },
    { name: "lower", expected: "accepted", mutate: (state) => { state.dataRevision = 0; } },
    { name: "equal", expected: "accepted", mutate: (state) => { state.dataRevision = 7; } },
    { name: "higher", expected: "accepted", mutate: (state) => { state.dataRevision = 1007; } }
  ];

  for (const scenario of cases) {
    await test.step(scenario.name, async () => {
      const baseline = validFullState();
      baseline.sessions[0].title = `Public Synthetic Revision Baseline ${scenario.name}`;
      const { context, page } = await createFixturePage(browser, baseURL, baseline);
      try {
        const before = await page.evaluate(() => Number(data.dataRevision));
        const candidate = validFullState();
        candidate.sessions[0].title = `Public Synthetic Imported Revision ${scenario.name}`;
        scenario.mutate(candidate);
        const group = await openBackupGroup(page);
        await armImportAudit(page);
        const lifecycle = await importBackup(page, group, candidate, `public-synthetic-revision-${scenario.name}.json`);
        await page.waitForTimeout(100);
        const audit = await collectImportAudit(page);

        expect.soft(lifecycle.state, `${scenario.name} import classification`).toBe(scenario.expected);
        if (scenario.expected === "accepted") {
          expect.soft(audit.importsStarted, `${scenario.name} must traverse the production importer once`).toBe(1);
          expect.soft(audit.writesStarted, `${scenario.name} must create one durable import write`).toBe(1);
          expect.soft(audit.writesSettled, `${scenario.name} import write must settle once`).toBe(1);
          expect.soft(audit.currentRevision, `${scenario.name} must rebase to one local logical revision`).toBe(before + 1);
          expect.soft(audit.persistedRevision, `${scenario.name} durable revision must match memory`).toBe(before + 1);
          expect.soft(audit.currentRevisionIsSafe, `${scenario.name} must leave a safe non-negative integer revision`).toBe(true);
          expect.soft(JSON.parse(audit.currentDataJson).sessions[0].title).toBe(candidate.sessions[0].title);
          if (scenario.verifyNextCommit) {
            const next = await page.evaluate(() => {
              const prior = data.dataRevision;
              commit({ ...data, settings: { ...data.settings, theme: data.settings.theme === "dark" ? "light" : "dark" } });
              return { prior, current: data.dataRevision, safe: Number.isSafeInteger(data.dataRevision) };
            });
            expect.soft(next, "MAX_SAFE imported metadata must not poison the next local commit").toEqual({
              prior: before + 1,
              current: before + 2,
              safe: true
            });
          }
        } else {
          expect.soft(audit.importsStarted, `${scenario.name} must traverse the guarded importer once`).toBe(1);
          expect.soft(audit.writesStarted, `${scenario.name} rejection must enqueue zero writes`).toBe(0);
          expect.soft(audit.writesSettled, `${scenario.name} rejection must settle zero writes`).toBe(0);
          expect.soft(audit.dataReferenceUnchanged, `${scenario.name} must preserve the runtime reference`).toBe(true);
          expect.soft(audit.dataJsonUnchanged, `${scenario.name} must preserve runtime bytes`).toBe(true);
          expect.soft(audit.persistedJsonUnchanged, `${scenario.name} must preserve durable bytes`).toBe(true);
          expect.soft(audit.analysisRevisionUnchanged, `${scenario.name} must preserve analysis revision`).toBe(true);
        }
      } finally {
        await context.close();
      }
    });
  }
});

test("equal-revision conflict blocks import, tells the truth about export recovery, and Clear owns both copies", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);

  await test.step("conflict blocks imports before file consumption", async () => {
    const { context, page } = await createFixturePage(browser, baseURL, validFullState());
    try {
      const conflict = await seedEqualRevisionConflict(page);
      const group = await openBackupGroup(page);
      await armImportAudit(page);
      const beforeStatus = await readImportStatus(group);
      const input = group.locator('[data-action="import-data"]');
      await input.evaluate((node, fileInit) => {
        const file = new File([fileInit.raw], fileInit.name, { type: "application/json" });
        const nativeText = file.text.bind(file);
        Object.defineProperty(file, "text", {
          configurable: true,
          value: () => {
            globalThis.__CF_RUNTIME_IMPORT_AUDIT__.fileTextReads += 1;
            return nativeText();
          }
        });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        node.files = transfer.files;
        node.dispatchEvent(new Event("change", { bubbles: true }));
      }, { name: "public-synthetic-conflict-blocked-import.json", raw: JSON.stringify(validFullState()) });
      await expect.poll(async () => {
        const [audit, status] = await Promise.all([collectImportAudit(page), readImportStatus(group)]);
        return {
          importsStarted: audit.importsStarted,
          importsSettled: audit.importsSettled,
          attemptDelta: status.attempt - beforeStatus.attempt,
          terminal: /^(?:accepted|rejected)$/.test(status.state)
        };
      }, {
        message: "the conflict-guarded import route must attempt and settle exactly once with a terminal UI status",
        timeout: 20_000
      }).toEqual({ importsStarted: 1, importsSettled: 1, attemptDelta: 1, terminal: true });
      const audit = await collectImportAudit(page);
      const terminalStatus = await readImportStatus(group);
      const local = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), STORAGE_KEY);
      const persisted = await readPersistedData(page);
      expect.soft(audit.importsStarted, "conflict mode must route exactly one guarded import attempt").toBe(1);
      expect.soft(audit.importsSettled, "the conflict-guarded import attempt must settle exactly once").toBe(1);
      expect.soft(terminalStatus.attempt, "the conflict import must publish exactly one new attempt").toBe(beforeStatus.attempt + 1);
      expect.soft(terminalStatus.state, "the conflict import must publish a rejected terminal state").toBe("rejected");
      expect.soft(
        terminalStatus.text,
        "the terminal status must identify the unresolved persistence disagreement"
      ).toMatch(/(?:\bconflict(?:ing)?\b|\b(?:two|both)\b[^.\n]{0,80}\b(?:saved|app[- ]?data)\b[^.\n]{0,80}\bcop(?:y|ies)\b[^.\n]{0,80}\b(?:disagree|differ|diverge)\b|\b(?:saved|app[- ]?data)\b[^.\n]{0,80}\bcop(?:y|ies)\b[^.\n]{0,80}\b(?:disagree|differ|diverge)\b)/i);
      expect.soft(audit.fileTextReads, "conflict mode must block before consuming file bytes").toBe(0);
      expect.soft(audit.writesStarted, "conflict-blocked import must write nothing").toBe(0);
      expect.soft(audit.dataJsonUnchanged, "conflict-blocked import must preserve active runtime bytes").toBe(true);
      expect.soft(persisted.templates[0].name).toBe(conflict.indexed.templates[0].name);
      expect.soft(local.data.templates[0].name).toBe(conflict.alternate.templates[0].name);
    } finally {
      await context.close();
    }
  });

  await test.step("export disclosure and Clear recovery", async () => {
    const { context, page } = await createFixturePage(browser, baseURL, validFullState());
    try {
      const conflict = await seedEqualRevisionConflict(page);
      const group = await openBackupGroup(page);
      await group.locator('[data-action="export-data"]').click();
      const exportedText = await group.getByLabel("Exported backup JSON").inputValue();
      const exported = JSON.parse(exportedText);
      const disclosureText = await page.locator('.settings-view > .persistence-status-note[role="status"]').evaluateAll((nodes) => String(nodes[0]?.textContent || ""));
      const includesActive = containsSentinel(exported, conflict.indexed.templates[0].name);
      const includesAlternate = containsSentinel(exported, conflict.alternate.templates[0].name);
      const disclosureSentences = disclosureText.split(/[.\n]+/).map((sentence) => sentence.trim()).filter(Boolean);
      const disclosesSelectedCopyOnly = disclosureSentences.some((sentence) =>
        /\b(?:export|exported|backup|download)\b/i.test(sentence)
        && /\b(?:selected|current|currently|active)\b/i.test(sentence)
        && /\bcopy\b/i.test(sentence)
        && /\bonly\b/i.test(sentence)
      );
      const disclosesPreservedAlternateExcluded = disclosureSentences.some((sentence) =>
        /\b(?:preserved\s+)?alternate\b/i.test(sentence)
        && /\b(?:excluded|omitted)\b|\b(?:is not|isn't|not)\s+included\b/i.test(sentence)
      );
      expect.soft(includesActive, "conflict export must include the selected active copy").toBe(true);
      expect.soft(includesAlternate, "ordinary conflict export must not silently embed the preserved alternate").toBe(false);
      expect.soft(disclosesSelectedCopyOnly, "the accessible export disclosure must say that only the selected/current copy is exported").toBe(true);
      expect.soft(disclosesPreservedAlternateExcluded, "the accessible export disclosure must say that the preserved alternate is excluded or not included").toBe(true);

      const danger = page.locator("details.settings-group").filter({ has: page.locator("summary", { hasText: "Danger Zone" }) });
      if (!await danger.evaluate((element) => element.open)) await danger.locator("summary").click();
      const clear = page.getByRole("button", { name: /Clear All Local App Data$/ });
      await clear.click();
      let dialog = page.getByRole("dialog", { name: "Clear All Local App Data?" });
      await dialog.getByRole("button", { name: "Keep My Data" }).click();
      expect.soft((await readPersistedData(page)).templates[0].name, "Clear cancel retains the active copy").toBe(conflict.indexed.templates[0].name);
      expect.soft(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null")?.data?.templates?.[0]?.name, STORAGE_KEY), "Clear cancel retains the alternate").toBe(conflict.alternate.templates[0].name);

      if (!await danger.evaluate((element) => element.open)) await danger.locator("summary").click();
      await clear.click();
      dialog = page.getByRole("dialog", { name: "Clear All Local App Data?" });
      await dialog.getByRole("checkbox", { name: /I understand/ }).check();
      await dialog.getByRole("textbox", { name: "Type CLEAR to confirm local data deletion" }).fill("CLEAR");
      await dialog.getByRole("button", { name: "Permanently Clear Local Data" }).click();
      await expect.soft(page.getByText("Local app data cleared.", { exact: true }), "confirmed Clear should announce completion").toBeVisible({ timeout: 15_000 });
      expect.soft(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), "confirmed Clear removes the preserved alternate").toBeNull();
      expect.soft(await page.locator(".persistence-conflict-note").count(), "confirmed Clear removes conflict UI").toBe(0);

      await page.reload();
      await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
      expect.soft(await page.locator(".persistence-conflict-note").count(), "cleared conflict must not return after reload").toBe(0);
      const reloaded = await page.evaluate(() => ({ sessions: data.sessions.length, templates: data.templates.length }));
      expect.soft(reloaded, "reload after conflict Clear must start from product defaults").toEqual({ sessions: 1, templates: 0 });
    } finally {
      await context.close();
    }
  });
});

function activeBackupWithSnapshot(snapshot, options = {}) {
  const state = validFullState();
  state.sessions[0] = {
    ...state.sessions[0],
    title: options.title || "Public Synthetic Active Snapshot Import",
    submitted: false,
    workoutStarted: true,
    workoutState: "active",
    completedAt: "",
    submittedAt: "",
    startedAt: "2026-07-15T12:00:00.000Z"
  };
  state.exercises[0] = {
    ...state.exercises[0],
    name: options.exerciseName || "Barbell Bench Press",
    primaryMuscle: options.primaryMuscle || "Chest",
    secondaryMuscle: options.secondaryMuscle || "Triceps",
    recommendationSnapshot: clone(snapshot),
    basePrescription: clone(snapshot.basePrescription),
    finalPrescription: clone(snapshot.finalPrescription),
    canonicalExerciseId: options.canonicalExerciseId || "ex_barbell_bench_press",
    researchExerciseId: options.researchExerciseId || "ex_barbell_bench_press"
  };
  state.sets[0] = { ...state.sets[0], completed: false };
  state.recommendationHistory = [clone(snapshot)];
  return state;
}

async function generateRealSnapshotFixtures(page) {
  return page.evaluate(() => {
    const api = globalThis.ComprehensiveFitnessPrescriptionEngine;
    if (!api?.deserializeRecommendationSnapshot || !api?.refreshRecommendationChecksum) {
      throw new Error("The real recommendation serializer API is unavailable.");
    }
    const identity = prescriptionEngine.resolveExerciseIdentity("Barbell Bench Press");
    const target = prescriptionEngine.resolveDefaultPrescriptionTarget("Barbell Bench Press");
    if (identity?.status !== "resolved" || target?.status !== "resolved") {
      throw new Error(`The public Bench Press identity/target fixture did not resolve: ${JSON.stringify({ identity, target })}`);
    }
    const valid = prescriptionEngine.prescribeExercise({
      exerciseId: identity.exerciseId,
      muscleGroupId: target.muscleGroupId,
      history: [],
      availableEquipment: ["all"],
      trainingGoal: "hypertrophy",
      experienceLevel: "intermediate",
      createdAt: "2026-07-15T12:00:00.000Z"
    });
    api.deserializeRecommendationSnapshot(valid);

    const staleChecksum = structuredClone(valid);
    staleChecksum.finalPrescription.workingSets.target = Math.min(20, staleChecksum.finalPrescription.workingSets.target + 1);

    const unknownSchema = structuredClone(valid);
    unknownSchema.schemaVersion = "99.0.0";
    const checksumValidUnknownSchema = api.refreshRecommendationChecksum(unknownSchema);
    if (api.refreshRecommendationChecksum(checksumValidUnknownSchema).checksum !== checksumValidUnknownSchema.checksum) {
      throw new Error("The unsupported-schema fixture does not carry a stable real checksum.");
    }

    const targetMismatch = structuredClone(valid);
    targetMismatch.muscleGroupId = "mg_lats";
    targetMismatch.basePrescription.muscleGroupId = "mg_lats";
    targetMismatch.finalPrescription.muscleGroupId = "mg_lats";
    const checksumValidTargetMismatch = api.refreshRecommendationChecksum(targetMismatch);
    api.deserializeRecommendationSnapshot(checksumValidTargetMismatch);

    return {
      valid,
      staleChecksum,
      checksumValidUnknownSchema,
      checksumValidTargetMismatch,
      identity,
      target,
      validBytes: JSON.stringify(valid)
    };
  });
}

test("stored snapshots preserve immutable history but validate every executable active/template boundary atomically", async ({ browser, baseURL }) => {
  test.setTimeout(480_000);
  const generator = await createFixturePage(browser, baseURL, buildTemplateLifecycleFixture());
  let snapshots;
  try {
    snapshots = await generateRealSnapshotFixtures(generator.page);
    const templateControl = await generator.page.evaluate((validSnapshot) => {
      const templateExercise = data.templates[0].exercises[0];
      const executableTemplateRecord = { ...templateExercise, recommendationSnapshot: validSnapshot };
      const beforeBytes = JSON.stringify(validSnapshot);
      const result = unifiedPrescriptionSnapshot(executableTemplateRecord);
      const restored = globalThis.ComprehensiveFitnessPrescriptionEngine.deserializeRecommendationSnapshot(result);
      return {
        sameReference: result === executableTemplateRecord.recommendationSnapshot,
        beforeBytes,
        afterBytes: JSON.stringify(result),
        checksum: restored.checksum
      };
    }, snapshots.valid);
    expect.soft(templateControl.sameReference, "a checksum-valid executable template snapshot may be reused without regeneration").toBe(true);
    expect.soft(templateControl.afterBytes, "valid executable template reuse must preserve exact bytes").toBe(templateControl.beforeBytes);
    expect.soft(templateControl.checksum, "the template control must use a real engine checksum").toMatch(/^[0-9a-f]{8}$/);
  } finally {
    await generator.context.close();
  }

  await test.step("submitted historical bytes and reference remain immutable", async () => {
    const baseline = validFullState();
    const { context, page } = await createFixturePage(browser, baseURL, baseline);
    try {
      const historical = {
        schemaVersion: "prescription-snapshot/public-synthetic-historical",
        recommendationId: "public-synthetic-immutable-history-snapshot",
        exerciseId: "ex_barbell_bench_press",
        muscleGroupId: "mg_pectoralis_major",
        explanation: { summary: "Public synthetic immutable historical evidence." },
        finalPrescription: {
          executable: true,
          executionBlocked: false,
          sets: 2,
          repRange: { min: 8, max: 10, target: 9 },
          targetRpe: { min: 7, max: 8, target: 8 },
          restSeconds: { min: 90, max: 150, target: 120 }
        }
      };
      const candidate = validFullState();
      candidate.exercises[0].recommendationSnapshot = clone(historical);
      candidate.recommendationHistory = [clone(historical)];
      const group = await openBackupGroup(page);
      await armImportAudit(page);
      const lifecycle = await importBackup(page, group, candidate, "public-synthetic-immutable-history.json");
      const observed = await page.evaluate((exerciseId) => {
        const exercise = data.exercises.find((item) => item.id === exerciseId);
        const calls = { identity: 0, target: 0, prescribe: 0 };
        prescriptionEngine.resolveExerciseIdentity = function () { calls.identity += 1; throw new Error("immutable history must not resolve identity"); };
        prescriptionEngine.resolveDefaultPrescriptionTarget = function () { calls.target += 1; throw new Error("immutable history must not resolve target"); };
        prescriptionEngine.prescribeExercise = function () { calls.prescribe += 1; throw new Error("immutable history must not regenerate"); };
        const beforeBytes = JSON.stringify(exercise.recommendationSnapshot);
        const result = unifiedPrescriptionSnapshot(exercise);
        return { calls, sameReference: result === exercise.recommendationSnapshot, beforeBytes, afterBytes: JSON.stringify(result) };
      }, candidate.exercises[0].id);
      expect.soft(lifecycle.state, "submitted historical snapshots remain importable as immutable evidence").toBe("accepted");
      expect.soft(observed.calls).toEqual({ identity: 0, target: 0, prescribe: 0 });
      expect.soft(observed.sameReference).toBe(true);
      expect.soft(observed.afterBytes).toBe(observed.beforeBytes);
    } finally {
      await context.close();
    }
  });

  const cases = [
    { name: "real-valid-checksum", snapshot: snapshots.valid, expected: "accepted" },
    { name: "stale-checksum", snapshot: snapshots.staleChecksum, expected: "rejected" },
    { name: "unknown-schema", snapshot: snapshots.checksumValidUnknownSchema, expected: "rejected" },
    {
      name: "host-exercise-mismatch",
      snapshot: snapshots.valid,
      expected: "rejected",
      options: {
        exerciseName: "Dumbbell Bench Press",
        canonicalExerciseId: "ex_dumbbell_bench_press",
        researchExerciseId: "ex_dumbbell_bench_press"
      }
    },
    { name: "checksum-valid-target-mismatch", snapshot: snapshots.checksumValidTargetMismatch, expected: "rejected" }
  ];

  for (const scenario of cases) {
    await test.step(scenario.name, async () => {
      const { context, page } = await createFixturePage(browser, baseURL, validFullState());
      try {
        const candidate = activeBackupWithSnapshot(scenario.snapshot, {
          title: `Public Synthetic Snapshot ${scenario.name}`,
          ...(scenario.options || {})
        });
        const group = await openBackupGroup(page);
        await armImportAudit(page);
        const lifecycle = await importBackup(page, group, candidate, `public-synthetic-snapshot-${scenario.name}.json`);
        await page.waitForTimeout(100);
        const audit = await collectImportAudit(page);
        expect.soft(lifecycle.state, `${scenario.name} import classification`).toBe(scenario.expected);
        if (scenario.expected === "accepted") {
          const storedBytes = await page.evaluate((exerciseId) => JSON.stringify(data.exercises.find((item) => item.id === exerciseId)?.recommendationSnapshot), candidate.exercises[0].id);
          expect.soft(audit.writesStarted, "valid executable snapshot import writes once").toBe(1);
          expect.soft(audit.writesSettled, "valid executable snapshot write settles once").toBe(1);
          expect.soft(storedBytes, "valid executable snapshot bytes remain exact").toBe(JSON.stringify(scenario.snapshot));
        } else {
          expect.soft(audit.writesStarted, `${scenario.name} must enqueue zero app-data writes`).toBe(0);
          expect.soft(audit.writesSettled, `${scenario.name} must settle zero app-data writes`).toBe(0);
          expect.soft(audit.dataReferenceUnchanged, `${scenario.name} must preserve the runtime reference`).toBe(true);
          expect.soft(audit.dataJsonUnchanged, `${scenario.name} must preserve runtime bytes`).toBe(true);
          expect.soft(audit.persistedJsonUnchanged, `${scenario.name} must preserve durable bytes`).toBe(true);
          expect.soft(audit.analysisRevisionUnchanged, `${scenario.name} must preserve the analysis revision`).toBe(true);
          expect.soft(audit.engineReferenceUnchanged, `${scenario.name} must preserve the engine`).toBe(true);
          expect.soft(audit.evidenceStatusReferenceUnchanged, `${scenario.name} must preserve evidence status identity`).toBe(true);
          expect.soft(audit.evidenceStatusJsonUnchanged, `${scenario.name} must preserve evidence status bytes`).toBe(true);
          expect.soft(audit.muscleCacheSentinelRetained, `${scenario.name} must retain muscle cache entries`).toBe(true);
          expect.soft(audit.prescriptionCacheSentinelRetained, `${scenario.name} must retain prescription cache entries`).toBe(true);
        }
      } finally {
        await context.close();
      }
    });
  }

  await test.step("a corrupt in-memory executable snapshot hard-rejects without regeneration", async () => {
    const active = activeBackupWithSnapshot(snapshots.valid);
    const { context, page } = await createFixturePage(browser, baseURL, active);
    try {
      const result = await page.evaluate((staleSnapshot) => {
        const exercise = data.exercises[0];
        exercise.recommendationSnapshot = staleSnapshot;
        let prescribeCalls = 0;
        const realPrescribe = prescriptionEngine.prescribeExercise;
        prescriptionEngine.prescribeExercise = function (...args) {
          prescribeCalls += 1;
          return Reflect.apply(realPrescribe, this, args);
        };
        const resolved = unifiedPrescriptionSnapshot(exercise);
        return { prescribeCalls, resolved };
      }, snapshots.staleChecksum);
      expect.soft(result.prescribeCalls, "corrupt stored executable evidence must never trigger silent regeneration").toBe(0);
      expect.soft(result.resolved, "corrupt executable evidence must use the deterministic zero-execution contract").toMatchObject({
        type: "hard_constraint_rejection",
        kind: "hard_constraint_rejection",
        hardConstraint: true,
        executionBlocked: true,
        executable: false,
        reason: "invalid_stored_recommendation_snapshot",
        sets: 0,
        reps: 0,
        weight: 0,
        executableActions: []
      });
    } finally {
      await context.close();
    }
  });
});

async function openTemplateEditor(page) {
  await openPrimaryTab(page, "plan");
  const card = page.locator(`.template-card:has([data-template-id="${IDS.controlTemplate}"])`);
  await expect(card).toHaveCount(1);
  await card.locator('[data-action="toggle-template-editor"]').click();
  await expect(card.locator('[data-action="template-exercise-sets"]')).toHaveCount(2);
  return card;
}

test("template numeric values share one fail-closed draft, model, import, and deletion contract", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const uiCases = [
    { name: "empty", action: "template-exercise-sets", property: "sets", value: "", expected: 2 },
    { name: "negative", action: "template-exercise-reps", property: "reps", value: "-1", expected: 8 },
    { name: "fractional-integer", action: "template-exercise-sets", property: "sets", value: "1.5", expected: 2 },
    { name: "nan-equivalent", action: "template-exercise-increment", property: "increment", value: null, expected: 5, nonFinite: "nan" },
    { name: "infinity-equivalent", action: "template-exercise-rpe", property: "targetRpe", value: null, expected: 8, nonFinite: "infinity" },
    { name: "huge", action: "template-exercise-rest", property: "restSeconds", value: String(Number.MAX_SAFE_INTEGER), expected: 120 }
  ];

  for (const scenario of uiCases) {
    await test.step(`UI draft ${scenario.name}`, async () => {
      const { context, page } = await createFixturePage(browser, baseURL, buildTemplateLifecycleFixture());
      try {
        const card = await openTemplateEditor(page);
        const control = card.locator(`[data-action="${scenario.action}"][data-template-exercise-id="${IDS.controlBenchTemplateExercise}"]`);
        const before = await page.evaluate(({ templateId, exerciseId, property }) => {
          const template = data.templates.find((item) => item.id === templateId);
          const exercise = template.exercises.find((item) => item.id === exerciseId);
          return { revision: data.dataRevision, value: exercise[property] };
        }, { templateId: IDS.controlTemplate, exerciseId: IDS.controlBenchTemplateExercise, property: scenario.property });

        if (scenario.nonFinite) {
          await control.evaluate((element, kind) => {
            if (kind === "nan") element.valueAsNumber = Number.NaN;
            else element.value = "1e309";
            element.dispatchEvent(new Event("input", { bubbles: true }));
          }, scenario.nonFinite);
        } else {
          await control.fill(scenario.value);
        }
        await page.waitForTimeout(2_100);
        const after = await page.evaluate(({ templateId, exerciseId, property }) => {
          const template = data.templates.find((item) => item.id === templateId);
          const exercise = template.exercises.find((item) => item.id === exerciseId);
          return { revision: data.dataRevision, value: exercise[property] };
        }, { templateId: IDS.controlTemplate, exerciseId: IDS.controlBenchTemplateExercise, property: scenario.property });
        const persisted = await readPersistedData(page);
        const persistedExercise = persisted.templates.find((item) => item.id === IDS.controlTemplate).exercises.find((item) => item.id === IDS.controlBenchTemplateExercise);
        expect.soft(await control.evaluate((element) => element.validity.valid), `${scenario.name} must fail the native field contract`).toBe(false);
        expect.soft(await control.getAttribute("aria-invalid"), `${scenario.name} must expose programmatic invalid state`).toBe("true");
        expect.soft(await card.locator('[role="alert"]').count(), `${scenario.name} must expose one accessible error`).toBe(1);
        expect.soft(after.revision, `${scenario.name} draft must not create a logical revision`).toBe(before.revision);
        expect.soft(after.value, `${scenario.name} draft must preserve the last valid model value`).toBe(scenario.expected);
        expect.soft(persisted.dataRevision, `${scenario.name} draft must not create a durable revision`).toBe(before.revision);
        expect.soft(persistedExercise[scenario.property], `${scenario.name} draft must preserve durable model value`).toBe(scenario.expected);
      } finally {
        await context.close();
      }
    });
  }

  const modelCases = [
    { name: "empty", field: "sets", token: "empty" },
    { name: "zero", field: "reps", token: "zero" },
    { name: "negative", field: "reps", token: "negative" },
    { name: "fractional-integer", field: "sets", token: "fractional" },
    { name: "nan", field: "targetRpe", token: "nan" },
    { name: "infinity", field: "increment", token: "infinity" },
    { name: "huge", field: "restSeconds", token: "huge" }
  ];
  for (const scenario of modelCases) {
    await test.step(`direct model ${scenario.name}`, async () => {
      const { context, page } = await createFixturePage(browser, baseURL, buildTemplateLifecycleFixture());
      try {
        await armImportAudit(page);
        const before = await page.evaluate(({ templateId, exerciseId, field }) => {
          const exercise = data.templates.find((item) => item.id === templateId).exercises.find((item) => item.id === exerciseId);
          return { revision: data.dataRevision, value: exercise[field] };
        }, { templateId: IDS.controlTemplate, exerciseId: IDS.controlBenchTemplateExercise, field: scenario.field });
        const mutation = await page.evaluate(({ templateId, exerciseId, field, token }) => {
          const valueFor = {
            empty: "",
            zero: 0,
            negative: -1,
            fractional: 1.5,
            nan: Number.NaN,
            infinity: Number.POSITIVE_INFINITY,
            huge: Number.MAX_SAFE_INTEGER
          };
          let threw = false;
          let errorMessage = "";
          try { patchTemplateExercise(templateId, exerciseId, { [field]: valueFor[token] }, false); }
          catch (error) {
            threw = true;
            errorMessage = error instanceof Error ? error.message : String(error);
          }
          return { threw, errorMessage };
        }, {
          templateId: IDS.controlTemplate,
          exerciseId: IDS.controlBenchTemplateExercise,
          field: scenario.field,
          token: scenario.token
        });

        // scheduleSave waits 1.8 s and its idle callback has a 1.5 s deadline. Leave
        // an invalid mutation's full persistence path intact so it cannot be canceled away.
        await page.waitForTimeout(3_500);
        const audit = await collectImportAudit(page);
        const persisted = await readPersistedData(page);
        const after = await page.evaluate(({ templateId, exerciseId, field }) => {
          const exercise = data.templates.find((item) => item.id === templateId).exercises.find((item) => item.id === exerciseId);
          return { revision: data.dataRevision, value: exercise[field] };
        }, { templateId: IDS.controlTemplate, exerciseId: IDS.controlBenchTemplateExercise, field: scenario.field });
        const persistedExercise = persisted.templates.find((item) => item.id === IDS.controlTemplate).exercises.find((item) => item.id === IDS.controlBenchTemplateExercise);

        expect.soft(mutation.threw, `${scenario.name} direct model input must throw and fail closed`).toBe(true);
        expect.soft(audit.savesScheduled, `${scenario.name} direct model input must schedule zero saves`).toBe(0);
        expect.soft(audit.writesStarted, `${scenario.name} direct model input must enqueue zero durable writes`).toBe(0);
        expect.soft(audit.writesSettled, `${scenario.name} direct model input must settle zero durable writes`).toBe(0);
        expect.soft(audit.dataReferenceUnchanged, `${scenario.name} direct model input must preserve runtime identity`).toBe(true);
        expect.soft(audit.dataJsonUnchanged, `${scenario.name} direct model input must preserve runtime bytes`).toBe(true);
        expect.soft(audit.persistedJsonUnchanged, `${scenario.name} direct model input must preserve durable bytes`).toBe(true);
        expect.soft(after.revision, `${scenario.name} direct model input must preserve the revision`).toBe(before.revision);
        expect.soft(after.value, `${scenario.name} direct model input must preserve the prior value`).toBe(before.value);
        expect.soft(persisted.dataRevision, `${scenario.name} direct model input must preserve the durable revision`).toBe(before.revision);
        expect.soft(persistedExercise[scenario.field], `${scenario.name} direct model input must preserve the durable value`).toBe(before.value);

        await page.reload();
        await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
        const reloaded = await page.evaluate(({ templateId, exerciseId, field }) => {
          const exercise = data.templates.find((item) => item.id === templateId).exercises.find((item) => item.id === exerciseId);
          return { revision: data.dataRevision, value: exercise[field] };
        }, { templateId: IDS.controlTemplate, exerciseId: IDS.controlBenchTemplateExercise, field: scenario.field });
        expect.soft(reloaded, `${scenario.name} direct model rejection must remain unchanged after reload`).toEqual(before);
      } finally {
        await context.close();
      }
    });
  }

  const importCases = [
    { name: "explicit-empty", field: "sets", value: "" },
    { name: "zero", field: "reps", value: 0 },
    { name: "negative", field: "reps", value: -1 },
    { name: "fractional-integer", field: "sets", value: 1.5 },
    { name: "nan-string", field: "targetRpe", value: "NaN" },
    { name: "infinity-string", field: "increment", value: "Infinity" },
    { name: "huge", field: "restSeconds", value: Number.MAX_SAFE_INTEGER }
  ];
  for (const scenario of importCases) {
    await test.step(`import ${scenario.name}`, async () => {
      const { context, page } = await createFixturePage(browser, baseURL, validFullState());
      try {
        const candidate = validFullState();
        candidate.templates[0].exercises[0][scenario.field] = scenario.value;
        const group = await openBackupGroup(page);
        await armImportAudit(page);
        const lifecycle = await importBackup(page, group, candidate, `public-synthetic-template-numeric-${scenario.name}.json`);
        await page.waitForTimeout(100);
        const audit = await collectImportAudit(page);
        expect.soft(lifecycle.state, `${scenario.name} import must reject`).toBe("rejected");
        expect.soft(audit.writesStarted, `${scenario.name} import must enqueue zero writes`).toBe(0);
        expect.soft(audit.writesSettled, `${scenario.name} import must settle zero writes`).toBe(0);
        expect.soft(audit.dataReferenceUnchanged, `${scenario.name} import must preserve runtime identity`).toBe(true);
        expect.soft(audit.dataJsonUnchanged, `${scenario.name} import must preserve runtime bytes`).toBe(true);
        expect.soft(audit.persistedJsonUnchanged, `${scenario.name} import must preserve durable bytes`).toBe(true);
      } finally {
        await context.close();
      }
    });
  }

  await test.step("pending invalid draft cannot resurrect a deleted template exercise", async () => {
    const { context, page } = await createFixturePage(browser, baseURL, buildTemplateLifecycleFixture());
    try {
      const card = await openTemplateEditor(page);
      const beforeRevision = await page.evaluate(() => Number(data.dataRevision));
      await armImportAudit(page);
      await card.locator(`[data-action="template-exercise-sets"][data-template-exercise-id="${IDS.controlBenchTemplateExercise}"]`).fill("");
      await card.locator(`[data-action="delete-template-exercise"][data-template-exercise-id="${IDS.controlBenchTemplateExercise}"]`).click();
      await expect.poll(() => page.evaluate((exerciseId) => data.templates[0].exercises.some((item) => item.id === exerciseId), IDS.controlBenchTemplateExercise), {
        message: "the selected template exercise must leave the in-memory model"
      }).toBe(false);
      await page.waitForTimeout(2_200);
      const audit = await collectImportAudit(page);
      const persisted = await readPersistedData(page);
      expect.soft(audit.currentRevision, "invalid draft plus deletion must create only the deletion revision").toBe(beforeRevision + 1);
      expect.soft(audit.writesStarted, "invalid draft plus deletion must coalesce to one durable write").toBe(1);
      expect.soft(audit.writesSettled).toBe(1);
      expect.soft(persisted.templates[0].exercises.some((item) => item.id === IDS.controlBenchTemplateExercise), "deleted exercise must be absent durably").toBe(false);

      await page.reload();
      await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
      const reloaded = await page.evaluate((exerciseId) => data.templates[0].exercises.some((item) => item.id === exerciseId), IDS.controlBenchTemplateExercise);
      expect.soft(reloaded, "pending invalid draft must not resurrect the deleted exercise after reload").toBe(false);
    } finally {
      await context.close();
    }
  });
});

async function prepareSubmissionFixture(page) {
  const completed = page.locator(`[data-action="toggle-set"][data-set-id="${IDS.activeBenchSet1}"]`);
  await completed.click();
  await page.locator(`#set-${IDS.activeRowSet2} .set-tools-disclosure > summary`).click();
  await page.locator(`[data-action="toggle-skip-set"][data-set-id="${IDS.activeRowSet2}"]`).click();
  await expect.poll(async () => {
    const persisted = await readPersistedData(page);
    return {
      completed: persisted?.sets?.find((item) => item.id === IDS.activeBenchSet1)?.completed,
      skipped: persisted?.sets?.find((item) => item.id === IDS.activeRowSet2)?.skipped
    };
  }, { message: "submission fixture set mutations must settle", timeout: 15_000 }).toEqual({ completed: true, skipped: true });
}

async function installFullSubmissionProbe(page) {
  await page.evaluate(() => {
    globalThis.cancelPendingDataSave?.();
    const real = {
      submitWorkout,
      submitWorkoutPrs,
      calculateWorkoutAnalysis,
      evaluateWorkoutOverrideOutcomes,
      writeIndexedValue,
      queueActiveWorkoutSync,
      playWorkoutCompletionSound,
      performInteractionFeedback
    };
    const probe = globalThis.__CF_RUNTIME_SUBMISSION_PROBE__ = {
      beforeRevision: Number(data.dataRevision),
      attempts: [],
      prCalls: [],
      analysisCalls: [],
      overrideCalls: [],
      writesStarted: 0,
      writesSettled: 0,
      syncCalls: 0,
      soundCalls: 0,
      successFeedbackCalls: 0
    };
    submitWorkout = function (...args) {
      probe.attempts.push(args.map(String));
      return Reflect.apply(real.submitWorkout, this, args);
    };
    submitWorkoutPrs = function (...args) {
      probe.prCalls.push(String(args[0]?.id || ""));
      return Reflect.apply(real.submitWorkoutPrs, this, args);
    };
    calculateWorkoutAnalysis = function (...args) {
      probe.analysisCalls.push(String(args[0]?.id || ""));
      return Reflect.apply(real.calculateWorkoutAnalysis, this, args);
    };
    evaluateWorkoutOverrideOutcomes = function (...args) {
      probe.overrideCalls.push(String(args[0]?.id || ""));
      return Reflect.apply(real.evaluateWorkoutOverrideOutcomes, this, args);
    };
    writeIndexedValue = async function (...args) {
      const appData = args[0] === "app-data";
      if (appData) probe.writesStarted += 1;
      try { return await Reflect.apply(real.writeIndexedValue, this, args); }
      finally { if (appData) probe.writesSettled += 1; }
    };
    queueActiveWorkoutSync = function (...args) {
      probe.syncCalls += 1;
      return Reflect.apply(real.queueActiveWorkoutSync, this, args);
    };
    playWorkoutCompletionSound = function (...args) {
      probe.soundCalls += 1;
      return Reflect.apply(real.playWorkoutCompletionSound, this, args);
    };
    performInteractionFeedback = function (...args) {
      if (args[0] === "success") probe.successFeedbackCalls += 1;
      return Reflect.apply(real.performInteractionFeedback, this, args);
    };
  });
}

async function waitForSubmissionProbe(page) {
  await expect.poll(() => page.evaluate(() => {
    const probe = globalThis.__CF_RUNTIME_SUBMISSION_PROBE__;
    return Boolean(probe && probe.writesStarted > 0 && probe.writesSettled === probe.writesStarted);
  }), { message: "submission persistence effects must settle", timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const probe = structuredClone(globalThis.__CF_RUNTIME_SUBMISSION_PROBE__);
    const session = data.sessions.find((item) => item.id === globalThis.__CF_RUNTIME_SUBMISSION_SESSION_ID__);
    return {
      probe,
      revision: data.dataRevision,
      sessionCount: data.sessions.filter((item) => item.id === globalThis.__CF_RUNTIME_SUBMISSION_SESSION_ID__).length,
      submitted: Boolean(session?.submitted),
      analysisJson: JSON.stringify(session?.workoutAnalysis || null)
    };
  });
}

test("direct reentry and rapid duplicate UI confirmation produce one complete submission side effect", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const scenarios = [
    { name: "two-direct-calls-one-task", route: "direct", expectedFeedback: 1 },
    { name: "two-routed-ui-confirmations-one-task", route: "ui", expectedFeedback: 2 }
  ];

  for (const scenario of scenarios) {
    await test.step(scenario.name, async () => {
      const fixture = buildActiveWorkoutLifecycleFixture();
      const { context, page } = await createFixturePage(browser, baseURL, fixture);
      try {
        await prepareSubmissionFixture(page);
        await installFullSubmissionProbe(page);
        await page.evaluate((sessionId) => { globalThis.__CF_RUNTIME_SUBMISSION_SESSION_ID__ = sessionId; }, IDS.activeSession);

        if (scenario.route === "direct") {
          await page.evaluate((sessionId) => {
            submitWorkout(sessionId);
            submitWorkout(sessionId);
          }, IDS.activeSession);
        } else {
          await page.locator('[data-action="request-submit-workout"]').click();
          await expect(page.locator('[data-action="confirm-submit-workout"]')).toBeVisible();
          await page.evaluate(() => {
            const first = document.querySelector('[data-action="confirm-submit-workout"]');
            first.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            const duplicate = document.createElement("button");
            duplicate.type = "button";
            duplicate.dataset.action = "confirm-submit-workout";
            document.getElementById("root").appendChild(duplicate);
            duplicate.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            duplicate.remove();
          });
        }

        const result = await waitForSubmissionProbe(page);
        const persisted = await readPersistedData(page);
        const persistedSession = persisted.sessions.find((item) => item.id === IDS.activeSession);
        expect.soft(result.probe.attempts, `${scenario.name} must exercise two real submit entry attempts`).toEqual([[IDS.activeSession], [IDS.activeSession]]);
        expect.soft(result.probe.prCalls, `${scenario.name} must calculate PRs once`).toEqual([IDS.activeSession]);
        expect.soft(result.probe.analysisCalls, `${scenario.name} must calculate analysis once`).toEqual([IDS.activeSession]);
        expect.soft(result.probe.overrideCalls, `${scenario.name} must evaluate overrides once`).toEqual([IDS.activeSession]);
        expect.soft(result.probe.writesStarted, `${scenario.name} must enqueue one app-data write`).toBe(1);
        expect.soft(result.probe.writesSettled, `${scenario.name} must settle one app-data write`).toBe(1);
        expect.soft(result.probe.syncCalls, `${scenario.name} must enqueue cloud-sync evaluation once`).toBe(1);
        expect.soft(result.probe.soundCalls, `${scenario.name} must route completion sound once`).toBe(1);
        expect.soft(result.probe.successFeedbackCalls, `${scenario.name} must not replay completion feedback`).toBe(scenario.expectedFeedback);
        expect.soft(result.revision, `${scenario.name} must create one logical revision`).toBe(result.probe.beforeRevision + 1);
        expect.soft(result.sessionCount, `${scenario.name} must retain one session row`).toBe(1);
        expect.soft(result.submitted, `${scenario.name} must submit the session`).toBe(true);
        expect.soft(persisted.dataRevision, `${scenario.name} durable revision must match memory`).toBe(result.probe.beforeRevision + 1);
        expect.soft(persisted.sessions.filter((item) => item.id === IDS.activeSession)).toHaveLength(1);
        expect.soft(JSON.stringify(persistedSession.workoutAnalysis), `${scenario.name} must persist the single analysis`).toBe(result.analysisJson);

        await page.reload();
        await expect(page.locator("main.app-main")).toBeVisible({ timeout: 45_000 });
        const reloaded = await page.evaluate((sessionId) => {
          const session = data.sessions.find((item) => item.id === sessionId);
          return {
            revision: data.dataRevision,
            count: data.sessions.filter((item) => item.id === sessionId).length,
            submitted: Boolean(session?.submitted),
            analysisJson: JSON.stringify(session?.workoutAnalysis || null)
          };
        }, IDS.activeSession);
        expect.soft(reloaded).toEqual({
          revision: result.probe.beforeRevision + 1,
          count: 1,
          submitted: true,
          analysisJson: result.analysisJson
        });
      } finally {
        await context.close();
      }
    });
  }
});
