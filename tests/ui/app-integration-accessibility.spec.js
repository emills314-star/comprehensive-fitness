"use strict";

const { test, expect } = require("@playwright/test");
const {
  BACKUP_BOUNDARIES,
  IDS,
  entityScopedUniquenessState,
  hostileCases,
  legacyState,
  safetyWorkoutState,
  validFullState
} = require("../fixtures/synthetic-app-backups");
const {
  clone: clonePersonalEvidence,
  conflictingIdentityPersonalEvidencePackage,
  partialPersonalEvidencePackage,
  syntheticPersonalEvidencePackage
} = require("../fixtures/synthetic-personal-evidence");

const PRIVATE_EVIDENCE_PATH = /^\/(?:private-personal-data|personal_fitness_data)\//;
const CLEARLY_OVERSIZED_PERSONAL_EVIDENCE_BYTES = 1024 * 1024 * 1024;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.__HOSTILE_BACKUP_EXECUTED__ = 0;
  });
  await page.goto("/");
  await page.waitForLoadState("load");
});

async function installEvidenceFetchAudit(page) {
  await page.addInitScript(() => {
    const nativeSimulation = new URL(globalThis.location.href).searchParams.get("__simulate_native_evidence__") === "1";
    if (nativeSimulation) {
      globalThis.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => "android"
      };
    }
    const nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.__PERSONAL_EVIDENCE_FETCH_AUDIT__ = [];
    globalThis.fetch = (input, init = {}) => {
      const request = typeof Request === "function" && input instanceof Request ? input : null;
      const raw = request?.url || (input instanceof URL ? input.href : String(input));
      const resolved = new URL(raw, globalThis.location.href);
      globalThis.__PERSONAL_EVIDENCE_FETCH_AUDIT__.push({
        href: resolved.href,
        origin: resolved.origin,
        pathname: resolved.pathname,
        credentials: init.credentials || request?.credentials || "",
        cache: init.cache || request?.cache || ""
      });
      return nativeFetch(input, init);
    };
  });
}

async function proxyHostedOriginToSource(page, hostedOrigin, sourceOrigin) {
  await page.route(`${hostedOrigin}/**`, async (route) => {
    const requested = new URL(route.request().url());
    const sourceUrl = new URL(`${requested.pathname}${requested.search}`, sourceOrigin);
    const response = await route.fetch({ url: sourceUrl.href });
    await route.fulfill({ response });
  });
}

async function navigateWithEvidenceFetchAudit(page, url) {
  await page.goto(url);
  await page.waitForLoadState("load");
  await expect.poll(() => page.evaluate(() => String(prescriptionEvidenceStatus?.state || "missing")), {
    message: `${url} must reach a terminal evidence-startup state`,
    timeout: 30_000
  }).not.toBe("loading");
  return page.evaluate(() => ({
    pageOrigin: globalThis.location.origin,
    evidenceState: String(prescriptionEvidenceStatus?.state || "missing"),
    fetches: (globalThis.__PERSONAL_EVIDENCE_FETCH_AUDIT__ || []).map((entry) => ({ ...entry }))
  }));
}

async function installPersonalEvidenceBuildFault(page) {
  await page.addInitScript(() => {
    let assignedApi;
    Object.defineProperty(globalThis, "ComprehensiveFitnessPrescriptionEngine", {
      configurable: true,
      get: () => assignedApi,
      set: (api) => {
        const realCreatePrescriptionEngine = api.createPrescriptionEngine;
        const RealPrescriptionEngine = api.PrescriptionEngine;
        const shouldFail = (input) => {
          const metadata = input?.personal?.metadata || input?.personalData?.metadata || {};
          const version = String(metadata.methodology_version || metadata.pipeline_version || "");
          return globalThis.__FAIL_PERSONAL_EVIDENCE_BUILD_VERSION__ === version;
        };
        class FaultInjectablePrescriptionEngine extends RealPrescriptionEngine {
          constructor(input = {}) {
            if (shouldFail(input)) throw new Error("Synthetic engine construction failure");
            super(input);
          }
        }
        assignedApi = {
          ...api,
          PrescriptionEngine: FaultInjectablePrescriptionEngine,
          createPrescriptionEngine(input = {}) {
            if (shouldFail(input)) throw new Error("Synthetic engine construction failure");
            return realCreatePrescriptionEngine(input);
          }
        };
      }
    });
  });
  await page.reload();
  await page.waitForLoadState("load");
  await expect.poll(() => page.evaluate(() => Boolean(prescriptionEngine)), {
    message: "The real prescription engine must initialize before import fault injection"
  }).toBe(true);
}

async function personalEvidenceRuntimeState(page) {
  return page.evaluate(() => ({
    package: data.personalEvidencePackage ? JSON.parse(JSON.stringify(data.personalEvidencePackage)) : null,
    packageJson: JSON.stringify(data.personalEvidencePackage || null),
    enginePersonalVersion: String(prescriptionEngine?.evidence?.versions?.personal || prescriptionEngine?.evidence?.personal?.version || "unknown"),
    enginePersonalIds: prescriptionEngine?.evidence?.personal?.reconciledIdentityByExerciseId
      ? [...prescriptionEngine.evidence.personal.reconciledIdentityByExerciseId.keys()].sort()
      : (prescriptionEngine?.evidence?.personal?.exerciseScores || []).map((item) => item.exercise_id || item.exerciseId).filter(Boolean).sort(),
    status: {
      state: prescriptionEvidenceStatus?.state,
      source: prescriptionEvidenceStatus?.source,
      personalRecords: prescriptionEvidenceStatus?.personalRecords,
      personalVersion: prescriptionEvidenceStatus?.personalVersion,
      researchVersion: prescriptionEvidenceStatus?.researchVersion
    }
  }));
}

async function seedPersonalEvidencePackage(page, packageValue) {
  const result = await page.evaluate(async (value) => {
    globalThis.__FAIL_PERSONAL_EVIDENCE_BUILD_VERSION__ = "";
    data = { ...data, personalEvidencePackage: value };
    const initialized = await initializePrescriptionEvidence();
    render();
    return { initialized, state: prescriptionEvidenceStatus?.state };
  }, packageValue);
  expect(result.initialized, "The synthetic prior package must initialize through the real evidence engine").toBe(true);
  expect(result.state).toBe("ready");
  return personalEvidenceRuntimeState(page);
}

async function importPersonalEvidenceInPage(page, input) {
  return page.evaluate(async ({ raw, name, claimedBytes, failBuildVersion }) => {
    globalThis.__FAIL_PERSONAL_EVIDENCE_BUILD_VERSION__ = failBuildVersion || "";
    const file = new File([raw], name, { type: "application/json" });
    const nativeText = file.text.bind(file);
    let textReads = 0;
    Object.defineProperty(file, "text", {
      configurable: true,
      value: () => {
        textReads += 1;
        return nativeText();
      }
    });
    if (claimedBytes !== null && claimedBytes !== undefined) {
      Object.defineProperty(file, "size", { configurable: true, value: claimedBytes });
    }
    settingsMessage = "";
    let thrown = "";
    try {
      await importPersonalEvidenceFile(file);
    } catch (error) {
      thrown = String(error?.message || error);
    }
    globalThis.__FAIL_PERSONAL_EVIDENCE_BUILD_VERSION__ = "";
    return {
      textReads,
      thrown,
      settingsMessage: String(settingsMessage || ""),
      package: data.personalEvidencePackage ? JSON.parse(JSON.stringify(data.personalEvidencePackage)) : null,
      packageJson: JSON.stringify(data.personalEvidencePackage || null),
      enginePersonalVersion: String(prescriptionEngine?.evidence?.versions?.personal || prescriptionEngine?.evidence?.personal?.version || "unknown"),
      enginePersonalIds: prescriptionEngine?.evidence?.personal?.reconciledIdentityByExerciseId
        ? [...prescriptionEngine.evidence.personal.reconciledIdentityByExerciseId.keys()].sort()
        : (prescriptionEngine?.evidence?.personal?.exerciseScores || []).map((item) => item.exercise_id || item.exerciseId).filter(Boolean).sort(),
      status: {
        state: prescriptionEvidenceStatus?.state,
        source: prescriptionEvidenceStatus?.source,
        personalRecords: prescriptionEvidenceStatus?.personalRecords,
        personalVersion: prescriptionEvidenceStatus?.personalVersion,
        researchVersion: prescriptionEvidenceStatus?.researchVersion
      }
    };
  }, input);
}

test("optional private evidence discovery is local-only, same-origin, and never cacheable", async ({ page }) => {
  test.setTimeout(90_000);
  const sourceUrl = page.url();
  const sourceOrigin = new URL(sourceUrl).origin;
  const hostedOrigins = ["https://fitness.example", "https://localhost.evil.example"];
  await installEvidenceFetchAudit(page);
  for (const hostedOrigin of hostedOrigins) await proxyHostedOriginToSource(page, hostedOrigin, sourceOrigin);

  const privateFetches = (audit) => audit.fetches.filter((entry) => PRIVATE_EVIDENCE_PATH.test(entry.pathname));
  for (const hostedOrigin of hostedOrigins) {
    const audit = await navigateWithEvidenceFetchAudit(page, `${hostedOrigin}/`);
    expect.soft(audit.evidenceState, `${hostedOrigin} must still load public research evidence`).toBe("ready");
    expect.soft(privateFetches(audit).length, `${hostedOrigin} must not probe optional private paths`).toBe(0);
  }

  const localAudit = await navigateWithEvidenceFetchAudit(page, sourceUrl);
  const nativeAudit = await navigateWithEvidenceFetchAudit(page, `${hostedOrigins[0]}/?__simulate_native_evidence__=1`);
  for (const [label, audit] of [["loopback", localAudit], ["native", nativeAudit]]) {
    const fetches = privateFetches(audit);
    expect.soft(fetches.length, `${label} startup must explicitly permit optional local aggregate discovery`).toBeGreaterThan(0);
    expect.soft(fetches.filter((entry) => entry.origin !== audit.pageOrigin).length, `${label} private discovery must remain on the active app origin`).toBe(0);
    expect.soft(fetches.filter((entry) => entry.credentials !== "same-origin").length, `${label} private discovery must use same-origin credentials`).toBe(0);
    expect.soft(fetches.filter((entry) => entry.cache !== "no-store").length, `${label} private aggregate fetches must all use cache=no-store`).toBe(0);
  }
});

test("personal evidence import validates and builds before atomically replacing the active package", async ({ page }) => {
  test.setTimeout(120_000);
  await installPersonalEvidenceBuildFault(page);
  const priorPackage = syntheticPersonalEvidencePackage({
    exerciseId: "custom_synthetic_prior_press",
    exerciseName: "Synthetic Prior Press",
    researchExerciseId: "ex_barbell_bench_press",
    version: "1.0.0"
  });
  const candidatePackage = syntheticPersonalEvidencePackage({
    exerciseId: "custom_synthetic_candidate_press",
    exerciseName: "Synthetic Candidate Press",
    researchExerciseId: "ex_dumbbell_bench_press",
    version: "1.0.1"
  });
  const validResult = await importPersonalEvidenceInPage(page, {
    raw: JSON.stringify(candidatePackage),
    name: "synthetic-valid-personal-evidence.json",
    claimedBytes: null,
    failBuildVersion: ""
  });
  expect(validResult.textReads).toBe(1);
  expect(validResult.enginePersonalVersion, "A valid package must become the active real-engine version").toBe("1.0.1");
  expect(validResult.enginePersonalIds, "A valid package must reach the real identity reconciler").toContain("custom_synthetic_candidate_press");
  expect(validResult.status.state).toBe("ready");

  const unsupportedVersion = clonePersonalEvidence(candidatePackage);
  unsupportedVersion.schemaVersion = "personal-evidence-package/99.0.0";
  const unexpectedTopLevel = clonePersonalEvidence(candidatePackage);
  unexpectedTopLevel.unexpectedExecutableConfiguration = { enabled: true };
  const invalidRowType = clonePersonalEvidence(candidatePackage);
  invalidRowType.personalData.exerciseScores[0].session_count = "six";
  const buildFailurePackage = syntheticPersonalEvidencePackage({
    exerciseId: "custom_synthetic_build_failure_press",
    exerciseName: "Synthetic Build Failure Press",
    researchExerciseId: "ex_machine_chest_press",
    version: "1.0.3"
  });
  const oversizedPackage = syntheticPersonalEvidencePackage({
    exerciseId: "custom_synthetic_oversized_press",
    exerciseName: "Synthetic Oversized Press",
    researchExerciseId: "ex_dumbbell_bench_press",
    version: "1.0.6"
  });
  const scenarios = [
    {
      name: "parse failure",
      raw: '{"schemaVersion":',
      fileName: "synthetic-malformed-personal-evidence.json"
    },
    ...["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores"].map((collection) => ({
      name: `partial package missing ${collection}`,
      raw: JSON.stringify(partialPersonalEvidencePackage(collection)),
      fileName: `synthetic-partial-${collection}.json`
    })),
    ...["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores"].map((collection) => {
      const partial = clonePersonalEvidence(candidatePackage);
      partial.personalData[collection] = [];
      return {
        name: `partial package with empty ${collection}`,
        raw: JSON.stringify(partial),
        fileName: `synthetic-empty-${collection}.json`
      };
    }),
    {
      name: "unsupported schema version",
      raw: JSON.stringify(unsupportedVersion),
      fileName: "synthetic-unsupported-personal-evidence.json"
    },
    {
      name: "unknown top-level field",
      raw: JSON.stringify(unexpectedTopLevel),
      fileName: "synthetic-extra-field-personal-evidence.json"
    },
    {
      name: "invalid aggregate row schema",
      raw: JSON.stringify(invalidRowType),
      fileName: "synthetic-invalid-row-personal-evidence.json"
    },
    {
      name: "conflicting reconciled identity",
      raw: JSON.stringify(conflictingIdentityPersonalEvidencePackage()),
      fileName: "synthetic-conflicting-personal-evidence.json"
    },
    {
      name: "temporary engine construction failure",
      raw: JSON.stringify(buildFailurePackage),
      fileName: "synthetic-build-failure-personal-evidence.json",
      failBuildVersion: "1.0.3"
    },
    {
      name: "oversized package",
      raw: JSON.stringify(oversizedPackage),
      fileName: "synthetic-oversized-personal-evidence.json",
      claimedBytes: CLEARLY_OVERSIZED_PERSONAL_EVIDENCE_BYTES,
      expectUnread: true
    }
  ];

  for (const scenario of scenarios) {
    const before = await seedPersonalEvidencePackage(page, priorPackage);
    const result = await importPersonalEvidenceInPage(page, {
      raw: scenario.raw,
      name: scenario.fileName,
      claimedBytes: scenario.claimedBytes ?? null,
      failBuildVersion: scenario.failBuildVersion || ""
    });
    expect.soft(result.packageJson === before.packageJson, `${scenario.name} must preserve the prior active package byte-for-byte`).toBe(true);
    expect.soft(result.enginePersonalVersion, `${scenario.name} must preserve the prior active engine version`).toBe(before.enginePersonalVersion);
    expect.soft(result.enginePersonalIds, `${scenario.name} must preserve the prior real-engine identity index`).toEqual(before.enginePersonalIds);
    expect.soft(result.status, `${scenario.name} must preserve the prior active evidence status`).toEqual(before.status);
    if (scenario.expectUnread) {
      expect.soft(result.textReads, "An oversized personal evidence file must be rejected before its contents are read").toBe(0);
    }
  }
});

async function seedApplicationState(page, state) {
  const seeded = await page.evaluate((model) => {
    data = model;
    entityStructureRevision += 1;
    entityIndexCache = null;
    activeSessionId = model.sessions[0].id;
    activeWorkoutId = model.sessions[0].id;
    viewingHistorySessionId = "";
    completedSummarySessionId = "";
    activeSetId = model.sets[0]?.id || "";
    timer = null;
    render();
    return {
      activeSessionId,
      activeWorkoutId,
      exerciseCount: data.exercises.length,
      title: data.sessions[0].title
    };
  }, state);
  expect(seeded).toMatchObject({
    activeSessionId: state.sessions[0].id,
    activeWorkoutId: state.sessions[0].id,
    exerciseCount: state.exercises.length,
    title: "Synthetic Safety Workout"
  });
  await expect(page.getByRole("heading", { name: "Synthetic Safety Workout" })).toBeVisible();
}

async function seedBlockedSafetyRecommendation(page, fixture, request) {
  await seedApplicationState(page, fixture.state);
  await expect.poll(() => page.evaluate(() => Boolean(prescriptionEngine)), {
    message: "The page prescription engine must initialize before seeding a safety recommendation"
  }).toBe(true);
  return page.evaluate(({ exerciseRuntimeId, engineRequest }) => {
    const blocked = prescriptionEngine.prescribeExercise(engineRequest);
    const originalExerciseId = blocked.finalPrescription?.safetyRestriction?.originalExerciseId
      || blocked.finalPrescription?.exerciseId
      || blocked.exerciseId;
    const originalResearchExerciseId = blocked.finalPrescription?.safetyRestriction?.auditBaseTargets?.researchExerciseId
      || blocked.finalPrescription?.researchExerciseId
      || blocked.basePrescription?.researchExerciseId
      || prescriptionEngine.evidence.personal?.crosswalkByPersonalId?.get(originalExerciseId)
      || originalExerciseId;
    const substitutionRows = prescriptionEngine.evidence.research.substitutionsByExercise.get(originalResearchExerciseId) || [];
    const mappedIds = new Set(substitutionRows.map((item) => item.substitute_exercise_id || item.substituteExerciseId).filter(Boolean));
    if (!mappedIds.size) throw new Error(`Public substitution evidence has no alternatives for ${originalExerciseId}`);
    const availableEquipment = engineRequest.availableEquipment || [];
    const ranked = prescriptionEngine.rankExercisePool(engineRequest.muscleGroupId, { availableEquipment });
    const rankedById = new Map(ranked.candidates.map((candidate) => [candidate.exerciseId, candidate]));
    const preferred = blocked.finalPrescription?.preferredReplacementExerciseId || null;
    if (preferred && !mappedIds.has(preferred)) throw new Error(`Engine preferred replacement ${preferred} is absent from its public substitution evidence`);
    const eligibleIds = [...mappedIds].filter((exerciseId) => (
      prescriptionEngine.evidence.research.exerciseById.has(exerciseId)
        && (availableEquipment.includes("all") || rankedById.has(exerciseId))
    ));
    if (!eligibleIds.length) throw new Error(`No engine-confirmed, catalog-backed substitute satisfies the supplied equipment constraint for ${originalExerciseId}`);
    const candidateId = preferred && eligibleIds.includes(preferred)
      ? preferred
      : eligibleIds.find((exerciseId) => rankedById.has(exerciseId));
    if (!candidateId) throw new Error(`Engine supplied neither a usable preferred replacement nor a ranked public substitute for ${originalExerciseId}`);
    const catalogRecord = prescriptionEngine.evidence.research.exerciseById.get(candidateId);
    if (!catalogRecord) throw new Error("Engine-confirmed safety substitute does not retain a public catalog record");
    const candidate = rankedById.get(candidateId) || {
      exerciseId: candidateId,
      researchExerciseId: candidateId,
      exerciseName: catalogRecord.exercise_name
    };
    const exercise = data.exercises.find((item) => item.id === exerciseRuntimeId);
    if (!exercise) throw new Error(`Synthetic runtime exercise ${exerciseRuntimeId} is unavailable`);
    Object.assign(exercise, {
      recommendationSnapshot: blocked,
      basePrescription: blocked.basePrescription,
      finalPrescription: blocked.finalPrescription,
      executionBlocked: Boolean(blocked.finalPrescription?.executionBlocked),
      safetyRestriction: blocked.finalPrescription?.safetyRestriction || null
    });
    data.recommendationHistory = [blocked];
    render();
    return {
      recommendationId: blocked.recommendationId,
      originalExerciseId,
      originalResearchExerciseId,
      preferredReplacementExerciseId: preferred,
      candidate: {
        exerciseId: candidate.exerciseId,
        researchExerciseId: candidate.researchExerciseId || candidate.exerciseId,
        exerciseName: candidate.exerciseName || catalogRecord.exercise_name
      },
      allowedSafetySubstituteIds: eligibleIds
    };
  }, { exerciseRuntimeId: fixture.exerciseIds.bench, engineRequest: request });
}

async function runtimeWorkoutState(page) {
  return page.evaluate(() => {
    const safetyRestriction = (value) => value ? {
      status: value.status,
      reason: value.reason,
      scope: value.scope,
      originalExerciseId: value.originalExerciseId,
      painFreeConfirmed: value.painFreeConfirmed,
      substituteExerciseId: value.substituteExerciseId,
      substituteResearchExerciseId: value.substituteResearchExerciseId
    } : null;
    const prescription = (value) => value ? {
      exerciseId: value.exerciseId,
      researchExerciseId: value.researchExerciseId,
      executionBlocked: value.executionBlocked,
      executable: value.executable,
      safetyRestriction: safetyRestriction(value.safetyRestriction)
    } : null;
    const manualOverride = (value) => ({
      overrideId: value?.overrideId,
      recommendationId: value?.recommendationId,
      exerciseRuntimeId: value?.exerciseRuntimeId,
      changes: value?.changes,
      previousFinalPrescription: prescription(value?.previousFinalPrescription)
    });
    const recommendationSnapshot = (value) => value ? {
      recommendationId: value.recommendationId,
      exerciseId: value.exerciseId,
      basePrescription: prescription(value.basePrescription),
      finalPrescription: prescription(value.finalPrescription),
      manualOverrides: (value.manualOverrides || []).map(manualOverride)
    } : null;
    return {
      exercises: data.exercises.map((item) => ({
        id: item.id,
        name: item.name,
        executionBlocked: item.executionBlocked,
        safetyRestriction: safetyRestriction(item.safetyRestriction),
        basePrescription: prescription(item.basePrescription),
        finalPrescription: prescription(item.finalPrescription),
        recommendationSnapshot: recommendationSnapshot(item.recommendationSnapshot),
        manualOverrides: (item.manualOverrides || []).map(manualOverride)
      })),
      recommendationHistory: (data.recommendationHistory || []).map(recommendationSnapshot),
      manualOverrides: (data.manualOverrides || []).map(manualOverride),
      sets: data.sets.map((item) => ({ id: item.id, exerciseId: item.exerciseId, completed: item.completed, skipped: item.skipped, isWarmup: item.isWarmup })),
      timer: timer ? { exerciseId: timer.exerciseId, setId: timer.setId, isActive: timer.isActive } : null
    };
  });
}

async function dispatchForgedWorkoutAction(page, action, identifiers = {}) {
  const attempt = await page.evaluate(({ requestedAction, ids }) => {
    if (requestedAction === "add-exercise") addExerciseDraft = "Synthetic Forbidden Exercise";
    const control = document.createElement("button");
    control.type = "button";
    control.dataset.action = requestedAction;
    if (ids.exerciseId) control.dataset.exerciseId = ids.exerciseId;
    if (ids.setId) control.dataset.setId = ids.setId;
    let observedAfterDelegatedHandler = 0;
    const observe = (event) => {
      if (event.target === control) observedAfterDelegatedHandler += 1;
    };
    root.addEventListener("click", observe, { once: true });
    root.appendChild(control);
    const dispatched = control.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    control.remove();
    return { dispatched, observedAfterDelegatedHandler };
  }, { requestedAction: action, ids: identifiers });
  expect(attempt.observedAfterDelegatedHandler, `${action} must traverse the delegated Lift click handler before state is asserted`).toBe(1);
  return attempt;
}

async function expectMutationControlsBlocked(scope, message) {
  const actions = ["add-set", "add-warmup-set", "duplicate-set", "toggle-set", "toggle-skip-set", "start-timer"];
  for (const action of actions) {
    const controls = scope.locator(`[data-action="${action}"]`);
    const allBlocked = await controls.evaluateAll((nodes) => nodes.every((node) => (
      node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true"
    )));
    expect.soft(allBlocked, `${message}: ${action} must be omitted or disabled`).toBe(true);
  }
}

async function openBackupSettings(page) {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: /Settings$/ }).click();
  const group = page.locator("details.settings-group").filter({ has: page.locator("summary", { hasText: "Data and backup" }) });
  await group.locator("summary").click();
  return group;
}

async function armImportLifecycleObserver(page) {
  return page.evaluate(() => {
    const key = `import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.__APP_TEST_IMPORT_LIFECYCLES__ ||= {};
    const initialStatus = document.querySelector("[data-import-status]");
    const state = {
      started: false,
      completed: false,
      initialAttempt: Number(initialStatus?.getAttribute("data-import-attempt") || 0),
      terminalAttempt: 0,
      terminalState: "",
      terminalText: ""
    };
    const inspect = () => {
      const input = document.querySelector('[data-action="import-data"]');
      const group = input?.closest("details.settings-group");
      const status = group?.querySelector("[data-import-status]");
      const text = String(group?.innerText || "");
      const attempt = Number(status?.getAttribute("data-import-attempt") || 0);
      const statusState = String(status?.getAttribute("data-import-state") || "");
      const importing = Boolean(input?.disabled) || /\bimporting\b/i.test(text) || statusState === "importing";
      if (importing || attempt > state.initialAttempt) state.started = true;
      const terminalMarker = attempt > state.initialAttempt && statusState && statusState !== "importing";
      const terminalControlState = state.started && input && !input.disabled && !/\bimporting\b/i.test(text);
      if (terminalMarker || terminalControlState) {
        state.completed = true;
        state.terminalAttempt = attempt;
        state.terminalState = statusState;
        state.terminalText = String(status?.textContent || text).trim();
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(inspect);
    state.observer = observer;
    window.__APP_TEST_IMPORT_LIFECYCLES__[key] = state;
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-import-attempt", "data-import-state", "disabled"],
      childList: true,
      subtree: true
    });
    inspect();
    return key;
  });
}

async function waitForImportLifecycle(page, lifecycleKey, name) {
  const lifecycleValue = (field) => page.evaluate(({ key, property }) => (
    window.__APP_TEST_IMPORT_LIFECYCLES__?.[key]?.[property]
  ), { key: lifecycleKey, property: field });
  await expect.poll(() => lifecycleValue("started"), {
    message: `${name} must enter an observable importing or attempt state`,
    timeout: 15_000
  }).toBe(true);
  await expect.poll(() => lifecycleValue("completed"), {
    message: `${name} must return to an enabled, non-Importing terminal state`,
    timeout: 15_000
  }).toBe(true);
  return page.evaluate((key) => {
    const state = window.__APP_TEST_IMPORT_LIFECYCLES__?.[key] || {};
    const result = {
      started: Boolean(state.started),
      completed: Boolean(state.completed),
      initialAttempt: Number(state.initialAttempt || 0),
      terminalAttempt: Number(state.terminalAttempt || 0),
      terminalState: String(state.terminalState || ""),
      terminalText: String(state.terminalText || "")
    };
    delete window.__APP_TEST_IMPORT_LIFECYCLES__?.[key];
    return result;
  }, lifecycleKey);
}

async function importBackup(page, group, value, name = "synthetic-backup.json") {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const input = group.locator('[data-action="import-data"]');
  const lifecycleKey = await armImportLifecycleObserver(page);
  await input.setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(raw, "utf8")
  });
  const lifecycle = await waitForImportLifecycle(page, lifecycleKey, name);
  await expect(input).toBeEnabled();
  return lifecycle;
}

async function importBackupWithClaimedSize(page, group, value, claimedBytes, name) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const input = group.locator('[data-action="import-data"]');
  const lifecycleKey = await armImportLifecycleObserver(page);
  await input.evaluate((node, fileInit) => {
    const file = new File([fileInit.raw], fileInit.name, { type: "application/json" });
    Object.defineProperty(file, "size", { configurable: true, value: fileInit.claimedBytes });
    const nativeText = file.text.bind(file);
    window.__APP_TEST_SIZED_IMPORT__ = { name: fileInit.name, observedSize: 0, textReads: 0 };
    Object.defineProperty(file, "text", {
      configurable: true,
      value: () => {
        window.__APP_TEST_SIZED_IMPORT__.textReads += 1;
        return nativeText();
      }
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    node.files = transfer.files;
    window.__APP_TEST_SIZED_IMPORT__.observedSize = Number(node.files[0]?.size || 0);
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, { claimedBytes, name, raw });
  const lifecycle = await waitForImportLifecycle(page, lifecycleKey, name);
  await expect(input).toBeEnabled();
  const instrumentation = await page.evaluate(() => ({ ...window.__APP_TEST_SIZED_IMPORT__ }));
  return { instrumentation, lifecycle };
}

async function exportedBackup(group) {
  if (!(await group.evaluate((element) => element.open))) await group.locator("summary").click();
  await group.locator('[data-action="export-data"]').click();
  return JSON.parse(await group.getByLabel("Exported backup JSON").inputValue());
}

test("hard-safety UI and delegated handlers refuse illness, unsited pain, matching pain, and unknown taxonomy", async ({ page }) => {
  test.setTimeout(90_000);
  const actions = ["add-exercise", "add-set", "add-warmup-set", "duplicate-set", "toggle-set", "toggle-skip-set", "start-timer"];

  await test.step("illness blocks every mutation across the workout", async () => {
    const fixture = safetyWorkoutState({ illness: true, pain: false, affectedMuscle: "" });
    await seedApplicationState(page, fixture.state);
    const addExerciseControls = page.locator('[data-action="add-exercise"]');
    expect.soft(await addExerciseControls.evaluateAll((nodes) => nodes.every((node) => node.disabled || node.getAttribute("aria-disabled") === "true")), "Illness must omit or disable Add Exercise").toBe(true);
    await expectMutationControlsBlocked(page.locator("#main-content"), "Illness whole-workout restriction");
    const before = await runtimeWorkoutState(page);
    for (const action of actions) {
      await dispatchForgedWorkoutAction(page, action, {
        exerciseId: fixture.exerciseIds.bench,
        setId: IDS.set
      });
    }
    expect(await runtimeWorkoutState(page), "Forged illness mutations must leave exercises, sets, and timer unchanged").toEqual(before);
  });

  await test.step("pain without an affected area blocks the whole workout", async () => {
    const fixture = safetyWorkoutState({ illness: false, pain: true, affectedMuscle: "" });
    await seedApplicationState(page, fixture.state);
    await expectMutationControlsBlocked(page.locator("#main-content"), "Unsited pain whole-workout restriction");
    const before = await runtimeWorkoutState(page);
    await dispatchForgedWorkoutAction(page, "add-set", { exerciseId: fixture.exerciseIds.legPress });
    expect(await runtimeWorkoutState(page), "Unsited pain must refuse even a nonmatching exercise mutation").toEqual(before);
  });

  await test.step("localized pain blocks matches and unknowns but permits a known nonmatch", async () => {
    const fixture = safetyWorkoutState({ illness: false, pain: true, affectedMuscle: "Chest" });
    await seedApplicationState(page, fixture.state);
    const card = (id) => page.locator(`.exercise-card:has([data-exercise-id="${id}"])`).first();
    await expectMutationControlsBlocked(card(fixture.exerciseIds.bench), "Localized matching exercise");
    await expectMutationControlsBlocked(card(fixture.exerciseIds.unknown), "Unresolved taxonomy exercise");
    const legAddSet = card(fixture.exerciseIds.legPress).locator('[data-action="add-set"]');
    await expect.soft(legAddSet, "A known nonmatching exercise must stay actionable").toBeEnabled();

    const before = await runtimeWorkoutState(page);
    await dispatchForgedWorkoutAction(page, "add-set", { exerciseId: fixture.exerciseIds.bench });
    await dispatchForgedWorkoutAction(page, "add-set", { exerciseId: fixture.exerciseIds.unknown });
    const afterBlockedAttempts = await runtimeWorkoutState(page);
    expect(afterBlockedAttempts.sets, "Matching and unresolved exercise mutations must fail closed").toEqual(before.sets);

    await dispatchForgedWorkoutAction(page, "add-set", { exerciseId: fixture.exerciseIds.legPress });
    const afterAllowed = await runtimeWorkoutState(page);
    expect(afterAllowed.sets.filter((item) => item.exerciseId === fixture.exerciseIds.legPress)).toHaveLength(
      before.sets.filter((item) => item.exerciseId === fixture.exerciseIds.legPress).length + 1
    );
  });
});

test("confirmed pain-free substitution uses an explicit catalog-backed UI flow and preserves the original block", async ({ page }) => {
  const originalId = "ex_barbell_bench_press";
  const availableEquipment = ["all"];
  const request = {
    exerciseId: originalId,
    muscleGroupId: "chest",
    readiness: { pain: true, affectedMuscle: "chest" },
    availableEquipment,
    trainingGoal: "hypertrophy",
    experienceLevel: "intermediate",
    nutritionPhase: "maintenance",
    createdAt: "2026-07-14T12:00:00.000Z"
  };
  const fixture = safetyWorkoutState({ illness: false, pain: true, affectedMuscle: "Chest" });
  const seeded = await seedBlockedSafetyRecommendation(page, fixture, request);
  const blockedOriginalId = seeded.originalExerciseId;
  const substituteId = seeded.candidate.exerciseId;
  const substituteName = seeded.candidate.exerciseName;
  expect(seeded.allowedSafetySubstituteIds).toContain(substituteId);
  if (seeded.preferredReplacementExerciseId) expect(substituteId).toBe(seeded.preferredReplacementExerciseId);
  const before = await runtimeWorkoutState(page);
  const sourceExercise = before.exercises.find((item) => item.id === fixture.exerciseIds.bench);
  const sourceHistory = before.recommendationHistory.find((item) => item.recommendationId === seeded.recommendationId);
  expect.soft(sourceExercise?.executionBlocked, "The browser exercise state must begin non-executable").toBe(true);
  expect.soft(sourceExercise?.safetyRestriction?.status, "The browser exercise state must retain the source block").toBe("blocked");
  expect.soft(sourceExercise?.safetyRestriction?.originalExerciseId).toBe(blockedOriginalId);
  expect.soft(sourceExercise?.recommendationSnapshot?.finalPrescription?.executionBlocked, "The browser source snapshot must begin blocked").toBe(true);
  expect.soft(sourceHistory?.finalPrescription?.executionBlocked, "The browser recommendation history must contain the blocked source snapshot").toBe(true);
  expect.soft(sourceHistory?.finalPrescription?.safetyRestriction?.originalExerciseId).toBe(blockedOriginalId);

  const card = page.locator(`.exercise-card:has([data-exercise-id="${fixture.exerciseIds.bench}"])`).first();
  await card.locator("details.exercise-options > summary").click();
  const override = card.locator("details.prescription-override");
  await override.locator("summary").click();
  await override.locator('[data-override-field="exercise"]').fill(substituteName);
  const confirmation = override.locator('[data-override-field="pain-free-confirmed"]');
  await expect.soft(confirmation, "Safety substitution requires an explicit pain-free confirmation control").toHaveCount(1);
  if (await confirmation.count()) await confirmation.check();
  await override.locator('[data-action="apply-prescription-override"]').click();

  const runtime = await runtimeWorkoutState(page);
  const substituted = runtime.exercises.find((item) => item.id === fixture.exerciseIds.bench);
  const historySnapshot = runtime.recommendationHistory.find((item) => item.recommendationId === seeded.recommendationId);
  const exerciseOverride = substituted?.manualOverrides?.at(-1);
  const snapshotOverride = substituted?.recommendationSnapshot?.manualOverrides?.at(-1);
  const historyOverride = historySnapshot?.manualOverrides?.at(-1);
  const globalOverride = runtime.manualOverrides.at(-1);
  expect.soft(substituted?.name).toBe(substituteName);
  expect.soft(substituted?.executionBlocked, "Resolved browser exercise state must be executable").toBe(false);
  expect.soft(substituted?.safetyRestriction?.status, "Resolved browser exercise safety metadata must mirror the final prescription").toBe("resolved_by_confirmed_substitute");
  expect.soft(substituted?.finalPrescription?.exerciseId).toBe(substituteId);
  expect.soft(substituted?.finalPrescription?.executionBlocked).toBe(false);
  expect.soft(substituted?.finalPrescription?.safetyRestriction?.painFreeConfirmed).toBe(true);
  expect.soft(substituted?.finalPrescription?.safetyRestriction?.substituteExerciseId).toBe(substituteId);
  expect.soft(substituted?.finalPrescription?.safetyRestriction?.originalExerciseId, "The painful original must remain bound in the safety audit").toBe(blockedOriginalId);
  expect.soft(historySnapshot?.finalPrescription?.executionBlocked, "Recommendation history must expose the resolved current snapshot").toBe(false);
  for (const [label, entry] of [
    ["exercise audit", exerciseOverride],
    ["exercise source-snapshot audit", snapshotOverride],
    ["recommendation-history audit", historyOverride],
    ["global override audit", globalOverride]
  ]) {
    expect.soft(entry?.previousFinalPrescription?.executionBlocked, `${label} must retain the original non-executable prescription`).toBe(true);
    expect.soft(entry?.previousFinalPrescription?.exerciseId, `${label} must retain the original painful exercise identity`).toBe(blockedOriginalId);
    expect.soft(entry?.previousFinalPrescription?.safetyRestriction?.status, `${label} must retain the original blocked safety status`).toBe("blocked");
    expect.soft(entry?.previousFinalPrescription?.safetyRestriction?.originalExerciseId, `${label} must retain the bound original exercise`).toBe(blockedOriginalId);
  }
});

test("primary navigation exposes a skip target and moves focus into the selected view", async ({ page }) => {
  const skipLink = page.getByRole("link", { name: /skip.*content/i });
  await expect(skipLink).toHaveAttribute("href", "#main-content");
  await skipLink.focus();
  await expect(skipLink).toBeFocused();

  const dashboard = page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /Dashboard$/ });
  await dashboard.click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const focusIsInView = await page.evaluate(() => {
    const active = document.activeElement;
    const main = document.querySelector("#main-content");
    return Boolean(active && main && (active === main || main.contains(active)) && active !== document.body);
  });
  expect(focusIsInView, "Selecting a primary tab must place focus in the new main view").toBe(true);
});

test("closing the template-start dialog restores focus to its quick-start button", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: /Templates$/ }).click();
  await page.locator('[data-action="new-template"]').click();
  await navigation.getByRole("button", { name: /Workout$/ }).click();

  const quickStart = page.locator('.quick-template-card[data-action="start-template"]').first();
  await expect(quickStart).toBeVisible();
  await quickStart.focus();
  await quickStart.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close template setup" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(quickStart).toBeFocused();
});

test("Dashboard detail Back restores focus to the originating summary control", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: /Dashboard$/ }).click();
  const origin = page.locator('[data-action="open-dashboard-detail"]').first();
  await origin.focus();
  await origin.click();
  await expect(page.locator(".dashboard-detail-view")).toBeVisible();
  await page.locator('[data-action="close-dashboard-detail"]').click();
  await expect(page.locator(".dashboard-detail-view")).toHaveCount(0);
  await expect(origin).toBeFocused();
});

test("cloud workout sync consent defaults off and persists independently when explicitly enabled", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: /Settings$/ }).click();
  const consent = page.locator('[data-action="cloud-workout-sync-consent"]');
  await expect(consent).toBeVisible();
  await expect(consent).not.toBeChecked();
  await consent.check();
  await expect(consent).toBeChecked();

  await page.reload();
  await navigation.getByRole("button", { name: /Settings$/ }).click();
  await expect(page.locator('[data-action="cloud-workout-sync-consent"]')).toBeChecked();
});

test("a complete synthetic backup round-trips relationships and canonical settings", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, validFullState());
  const exported = await exportedBackup(group);

  expect(exported.sessions.map((item) => item.id)).toContain(IDS.session);
  expect(exported.exercises.find((item) => item.id === IDS.exercise)?.sessionId).toBe(IDS.session);
  expect(exported.sets.find((item) => item.id === IDS.set)?.exerciseId).toBe(IDS.exercise);
  expect(exported.templates.find((item) => item.id === IDS.template)?.exercises[0].id).toBe(IDS.templateExercise);
  expect(exported.settings).toMatchObject({
    trainingGoal: "hypertrophy",
    nutritionPhase: "maintenance",
    experienceLevel: "intermediate",
    cloudWorkoutSyncConsent: false
  });
});

test("backup import publishes an attempt-scoped accessible terminal status", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, validFullState(), "synthetic-status-contract.json");
  const status = group.locator('[data-import-status]');
  const marker = await status.evaluateAll((nodes) => nodes[0] ? ({
    role: nodes[0].getAttribute("role"),
    state: nodes[0].getAttribute("data-import-state"),
    attempt: Number(nodes[0].getAttribute("data-import-attempt") || 0)
  }) : null);
  expect.soft(marker, "Import results need a dedicated product status marker").not.toBeNull();
  expect.soft(marker?.role || "").toBe("status");
  expect.soft(marker?.state || "").toBe("accepted");
  expect.soft(Number(marker?.attempt || 0), "Each terminal import result needs a monotonically increasing attempt marker").toBeGreaterThan(0);
});

test("a supported legacy backup migrates overloaded settings without changing relationships", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, legacyState(), "synthetic-legacy-backup.json");
  const exported = await exportedBackup(group);

  expect(exported.exercises.find((item) => item.id === IDS.exercise)?.sessionId).toBe(IDS.session);
  expect(exported.sets.find((item) => item.id === IDS.set)?.exerciseId).toBe(IDS.exercise);
  expect.soft(exported.settings.trainingGoal).toBe("general_fitness");
  expect.soft(exported.settings.nutritionPhase).toBe("deficit");
  expect.soft(exported.settings.experienceLevel).toBe("novice");
  const trainingGoalSource = exported.settings.trainingGoalSource || exported.settings.trainingGoalResolution?.source || "";
  const trainingGoalDisclosure = exported.settings.trainingGoalDisclosure || exported.settings.trainingGoalResolution?.disclosure || "";
  expect.soft(trainingGoalSource).toMatch(/missing|default/i);
  expect.soft(trainingGoalDisclosure).toMatch(/general[ _-]?fitness|default/i);
  expect.soft(exported.settings.goal, "The overloaded legacy goal must not remain authoritative").toBeUndefined();
  expect.soft(exported.settings.trainingStatus, "The legacy experience field must not remain authoritative").toBeUndefined();
});

test("backup uniqueness is entity-scoped rather than globally conflating typed IDs", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, entityScopedUniquenessState(), "synthetic-entity-scoped-ids.json");
  const exported = await exportedBackup(group);
  expect(exported.exercises.some((item) => item.id === IDS.exercise)).toBe(true);
  expect(exported.templates[0].exercises.some((item) => item.id === IDS.exercise)).toBe(true);
});

test("backup file-size enforcement accepts the exact boundary and rejects overflow before reading", async ({ page }) => {
  test.setTimeout(60_000);
  const group = await openBackupSettings(page);
  const boundary = validFullState();
  boundary.sessions[0].title = "Synthetic file size at boundary";
  const accepted = await importBackupWithClaimedSize(page, group, boundary, BACKUP_BOUNDARIES.fileBytes, "file-size-at-boundary.json");
  expect.soft(accepted.instrumentation.observedSize).toBe(BACKUP_BOUNDARIES.fileBytes);
  expect.soft(accepted.instrumentation.textReads, "An at-boundary file must be read exactly once").toBe(1);
  expect.soft((await exportedBackup(group)).sessions.some((item) => item.title === boundary.sessions[0].title)).toBe(true);

  await importBackup(page, group, validFullState(), "baseline-file-size-overflow.json");
  const overflow = validFullState();
  overflow.sessions[0].title = "Synthetic file size over boundary";
  const rejected = await importBackupWithClaimedSize(page, group, overflow, BACKUP_BOUNDARIES.fileBytes + 1, "file-size-over-boundary.json");
  const exported = await exportedBackup(group);
  expect.soft(rejected.instrumentation.observedSize).toBe(BACKUP_BOUNDARIES.fileBytes + 1);
  expect.soft(rejected.instrumentation.textReads, "An oversized file must be rejected before file.text() is called").toBe(0);
  expect.soft(exported.sessions.some((item) => item.id === IDS.session && item.title === "Synthetic Round Trip"), "Oversized input must preserve the baseline").toBe(true);
  expect.soft(exported.sessions.some((item) => item.title === overflow.sessions[0].title), "Oversized input must not enter state").toBe(false);
});

test("bounded backup validation rejects duplicate IDs, malformed versions, orphans, executable keys, and prototype keys", async ({ page }) => {
  test.setTimeout(120_000);
  const group = await openBackupSettings(page);
  const baseline = validFullState();

  for (const hostile of hostileCases()) {
    await test.step(hostile.name, async () => {
      await importBackup(page, group, baseline, `baseline-${hostile.name}.json`);
      const payload = hostile.raw || JSON.stringify(hostile.value);
      await importBackup(page, group, payload, `${hostile.name}.json`);
      const exported = await exportedBackup(group);
      expect.soft(
        exported.sessions.some((item) => item.id === IDS.session && item.title === "Synthetic Round Trip"),
        `${hostile.name} must not replace the validated baseline`
      ).toBe(true);
      expect.soft(exported.sessions.length, `${hostile.name} must not change the session count`).toBe(baseline.sessions.length);
      expect.soft(exported.exercises.length, `${hostile.name} must not change the exercise count`).toBe(baseline.exercises.length);
      expect.soft(exported.sets.length, `${hostile.name} must not change the set count`).toBe(baseline.sets.length);
      expect.soft(exported.templates.length, `${hostile.name} must not change the template count`).toBe(baseline.templates.length);
      if (hostile.name === "prototype-key") {
        expect.soft(Object.prototype.hasOwnProperty.call(exported, "__proto__"), "Prototype keys must not survive import").toBe(false);
        expect.soft(Object.prototype.hasOwnProperty.call(exported, "constructor"), "Constructor keys must not survive import").toBe(false);
      }
      expect.soft(await page.evaluate(() => Object.prototype.polluted), `${hostile.name} must not pollute object prototypes`).toBeUndefined();
      expect.soft(await page.evaluate(() => window.__HOSTILE_BACKUP_EXECUTED__), `${hostile.name} must not execute imported fields`).toBe(0);
    });
  }
});

test("hostile backup IDs and executable-looking fields are rejected before DOM rendering", async ({ page }) => {
  const group = await openBackupSettings(page);
  await importBackup(page, group, validFullState(), "baseline-hostile-id.json");

  const safeSessionId = "11111111-1111-4111-8111-111111111111";
  const hostileExerciseId = 'evil" autofocus onfocus="window.__HOSTILE_BACKUP_EXECUTED__=1';
  const backup = {
    appDataVersion: 2,
    sessions: [{
      id: safeSessionId,
      date: "2026-07-12",
      title: "Hostile Backup",
      submitted: false,
      workoutStarted: true,
      workoutState: "active",
      recovery: {}
    }],
    exercises: [{
      id: hostileExerciseId,
      sessionId: safeSessionId,
      name: "Synthetic Exercise",
      order: 0,
      resistanceType: "external",
      onfocus: "window.__HOSTILE_BACKUP_EXECUTED__=1"
    }],
    sets: [{
      id: "33333333-3333-4333-8333-333333333333",
      exerciseId: hostileExerciseId,
      setNumber: 1,
      reps: 8,
      weight: 50,
      completed: false,
      onclick: "window.__HOSTILE_BACKUP_EXECUTED__=1"
    }],
    templates: [],
    settings: {}
  };

  await importBackup(page, group, backup, "synthetic-hostile-backup.json");
  const exported = await exportedBackup(group);

  expect.soft(exported.sessions.some((item) => item.id === IDS.session && item.title === "Synthetic Round Trip"), "The invalid backup must not replace local state").toBe(true);
  expect.soft(exported.sessions.some((item) => item.title === "Hostile Backup"), "The hostile backup must not enter persisted state").toBe(false);
  expect.soft(await page.locator("[onerror], [onload], [onclick], [onfocus], [onpointerenter]").count(), "Imported data must never create executable DOM attributes").toBe(0);
  expect.soft(await page.evaluate(() => window.__HOSTILE_BACKUP_EXECUTED__), "No imported field may execute").toBe(0);
});
