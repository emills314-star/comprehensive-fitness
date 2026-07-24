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
  PERSONAL_EVIDENCE_BOUNDARIES,
  clone: clonePersonalEvidence,
  conflictingIdentityPersonalEvidencePackage,
  invalidMuscleScoreOnlyPersonalEvidencePackage,
  jsonDepth: personalEvidenceJsonDepth,
  jsonObjectAtWidth,
  jsonValueAtDepth,
  maximumObjectWidth: personalEvidenceObjectWidth,
  partialPersonalEvidencePackage,
  personalEvidenceAtNameLength,
  personalEvidenceAtScalarBoundaries,
  personalEvidenceAtStableIdLength,
  personalEvidenceAtTextLength,
  personalEvidenceWithMatchedCoreCount,
  syntheticPersonalEvidencePackage
} = require("../fixtures/synthetic-personal-evidence");

const PRIVATE_EVIDENCE_PATH = /^\/(?:private-personal-data|personal_fitness_data)\//;

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
  return page.evaluate(() => {
    const identityMap = prescriptionEngine?.evidence?.personal?.reconciledIdentityByExerciseId;
    const hasReconciledIdentityMap = identityMap instanceof Map;
    return {
      package: data.personalEvidencePackage ? JSON.parse(JSON.stringify(data.personalEvidencePackage)) : null,
      packageJson: JSON.stringify(data.personalEvidencePackage || null),
      engineHasReconciledIdentityMap: hasReconciledIdentityMap,
      enginePersonalVersion: String(prescriptionEngine?.evidence?.versions?.personal || prescriptionEngine?.evidence?.personal?.version || "unknown"),
      enginePersonalIds: hasReconciledIdentityMap ? [...identityMap.keys()].sort() : [],
      status: {
        state: prescriptionEvidenceStatus?.state,
        source: prescriptionEvidenceStatus?.source,
        personalRecords: prescriptionEvidenceStatus?.personalRecords,
        personalVersion: prescriptionEvidenceStatus?.personalVersion,
        researchVersion: prescriptionEvidenceStatus?.researchVersion
      }
    };
  });
}

async function persistedPersonalEvidenceState(page) {
  return page.evaluate(async () => {
    try {
      const stored = await readIndexedValue("app-data");
      const packageValue = stored?.personalEvidencePackage || null;
      return {
        error: "",
        package: packageValue ? JSON.parse(JSON.stringify(packageValue)) : null,
        packageJson: JSON.stringify(packageValue)
      };
    } catch (error) {
      return { error: String(error?.message || error), package: null, packageJson: "null" };
    }
  });
}

function packageContainsExerciseId(packageValue, exerciseId) {
  return ["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores"].some((collection) => (
    (packageValue?.personalData?.[collection] || []).some((row) => (row.exercise_id || row.exerciseId) === exerciseId)
  ));
}

function primaryPackageExerciseId(packageValue) {
  return packageValue?.personalData?.exerciseScores?.[0]?.exercise_id
    || packageValue?.personalData?.exercisePrescriptions?.[0]?.exercise_id
    || packageValue?.personalData?.exerciseMuscleScores?.[0]?.exercise_id
    || "";
}

function jsonBufferAtExactBytes(packageValue, bytes) {
  const json = Buffer.from(JSON.stringify(packageValue), "utf8");
  if (json.length > bytes) throw new Error(`Synthetic package requires ${json.length} bytes, above requested ${bytes}`);
  return Buffer.concat([json, Buffer.alloc(bytes - json.length, 0x20)]);
}

async function executePersonalEvidenceShapeValidator(page, value) {
  return page.evaluate(({ candidate, limits }) => {
    if (typeof validatePersonalEvidenceJsonShape !== "function") {
      return { available: false, rejected: true, error: "validatePersonalEvidenceJsonShape is unavailable" };
    }
    try {
      const result = validatePersonalEvidenceJsonShape(candidate, {
        maxDepth: limits.jsonDepth,
        maxObjectKeys: limits.objectKeys
      });
      return {
        available: true,
        rejected: result === false || result?.valid === false,
        error: ""
      };
    } catch (error) {
      return { available: true, rejected: true, error: String(error?.message || error) };
    }
  }, { candidate: value, limits: PERSONAL_EVIDENCE_BOUNDARIES });
}

async function waitForEvidenceTerminal(page) {
  await expect.poll(() => page.evaluate(() => String(prescriptionEvidenceStatus?.state || "missing")), {
    message: "Personal evidence startup must reach a terminal state",
    timeout: 30_000
  }).not.toBe("loading");
}

async function personalEvidenceInput(page) {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: /More$/ }).click();
  const group = page.locator("details.settings-group").filter({ has: page.locator("summary", { hasText: "Data and backup" }) });
  if (!(await group.evaluate((element) => element.open))) await group.locator("summary").click();
  return group.locator('[data-action="import-personal-evidence"]');
}

async function armPersonalEvidenceImportObserver(page, name, failBuildVersion = "", expectedShapeJson = "") {
  return page.evaluate(({ fileName, failureVersion, expectedJson }) => {
    globalThis.__PERSONAL_EVIDENCE_IMPORT_AUDIT__ ||= {};
    if (!globalThis.__PERSONAL_EVIDENCE_IMPORT_OBSERVER_INSTALLED__) {
      const productionImport = importPersonalEvidenceFile;
      const productionWriteIndexedValue = writeIndexedValue;
      const productionShapeValidator = typeof validatePersonalEvidenceJsonShape === "function"
        ? validatePersonalEvidenceJsonShape
        : null;
      if (productionShapeValidator) {
        validatePersonalEvidenceJsonShape = function observedPersonalEvidenceShapeValidation(...args) {
          const attemptKey = globalThis.__ACTIVE_PERSONAL_EVIDENCE_IMPORT_KEY__;
          const audit = attemptKey ? globalThis.__PERSONAL_EVIDENCE_IMPORT_AUDIT__?.[attemptKey] : null;
          if (audit) {
            audit.shapeValidationCalls += 1;
            try {
              if (audit.expectedShapeJson && JSON.stringify(args[0]) === audit.expectedShapeJson) {
                audit.shapeValidatedImportedPayload = true;
              }
            } catch {
              // The production validator still decides how to reject non-serializable values.
            }
          }
          return productionShapeValidator(...args);
        };
      }
      writeIndexedValue = async function observedPersonalEvidenceWrite(key, value) {
        const attemptKey = globalThis.__ACTIVE_PERSONAL_EVIDENCE_IMPORT_KEY__;
        const audit = attemptKey ? globalThis.__PERSONAL_EVIDENCE_IMPORT_AUDIT__?.[attemptKey] : null;
        if (audit && key === "app-data") {
          audit.persistenceWrites += 1;
          const packageValue = value?.personalEvidencePackage || null;
          const coreCollections = ["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores"];
          audit.persistenceWritePackages.push({
            topLevelKeys: Object.keys(packageValue || {}).sort(),
            schemaVersion: packageValue?.schemaVersion || "",
            createdAt: packageValue?.createdAt || "",
            personalDataVersion: packageValue?.personalDataVersion || "",
            researchDatabaseVersion: packageValue?.researchDatabaseVersion || "",
            privacy: packageValue?.privacy || "",
            importedAt: packageValue?.importedAt || "",
            coreCounts: Object.fromEntries(coreCollections.map((collection) => [
              collection,
              Array.isArray(packageValue?.personalData?.[collection]) ? packageValue.personalData[collection].length : -1
            ])),
            firstIds: Object.fromEntries(coreCollections.map((collection) => [
              collection,
              packageValue?.personalData?.[collection]?.[0]?.exercise_id || ""
            ])),
            lastIds: Object.fromEntries(coreCollections.map((collection) => [
              collection,
              packageValue?.personalData?.[collection]?.at(-1)?.exercise_id || ""
            ]))
          });
        }
        try {
          return await productionWriteIndexedValue(key, value);
        } finally {
          if (audit && key === "app-data") audit.persistenceWritesSettled += 1;
        }
      };
      importPersonalEvidenceFile = async function observedPersonalEvidenceImport(file) {
        const attemptKey = globalThis.__PENDING_PERSONAL_EVIDENCE_IMPORT_KEY__;
        const audit = globalThis.__PERSONAL_EVIDENCE_IMPORT_AUDIT__?.[attemptKey];
        if (!audit) return productionImport(file);
        globalThis.__ACTIVE_PERSONAL_EVIDENCE_IMPORT_KEY__ = attemptKey;
        audit.started = true;
        audit.observedName = file.name;
        audit.observedSize = file.size;
        const observedBlobs = new WeakSet([file]);
        const restorations = [];
        const replaceMethod = (prototype, method, replacement) => {
          if (!prototype) return;
          const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
          if (!descriptor || typeof descriptor.value !== "function" || !descriptor.configurable) return;
          Object.defineProperty(prototype, method, { ...descriptor, value: replacement(descriptor.value) });
          restorations.push(() => Object.defineProperty(prototype, method, descriptor));
        };
        replaceMethod(Blob.prototype, "slice", (nativeSlice) => function observedSlice(...args) {
          const result = nativeSlice.apply(this, args);
          if (observedBlobs.has(this)) observedBlobs.add(result);
          return result;
        });
        for (const [method, field] of [
          ["text", "textReads"],
          ["arrayBuffer", "arrayBufferReads"],
          ["stream", "streamReads"],
          ["bytes", "bytesReads"]
        ]) {
          replaceMethod(Blob.prototype, method, (nativeRead) => function observedBlobRead(...args) {
            if (observedBlobs.has(this)) audit[field] += 1;
            return nativeRead.apply(this, args);
          });
        }
        for (const method of ["readAsText", "readAsArrayBuffer", "readAsBinaryString", "readAsDataURL"]) {
          replaceMethod(globalThis.FileReader?.prototype, method, (nativeRead) => function observedFileReaderRead(blob, ...args) {
            if (observedBlobs.has(blob)) audit.fileReaderReads += 1;
            return nativeRead.call(this, blob, ...args);
          });
        }
        try {
          return await productionImport(file);
        } catch (error) {
          audit.thrown = String(error?.message || error);
          throw error;
        } finally {
          while (restorations.length) restorations.pop()();
          audit.completed = true;
          audit.settingsMessage = String(settingsMessage || "");
          globalThis.__FAIL_PERSONAL_EVIDENCE_BUILD_VERSION__ = "";
          globalThis.__PENDING_PERSONAL_EVIDENCE_IMPORT_KEY__ = "";
        }
      };
      globalThis.__PERSONAL_EVIDENCE_IMPORT_OBSERVER_INSTALLED__ = true;
    }
    const key = `personal-evidence-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    globalThis.__PERSONAL_EVIDENCE_IMPORT_AUDIT__[key] = {
      expectedName: fileName,
      observedName: "",
      observedSize: 0,
      textReads: 0,
      arrayBufferReads: 0,
      streamReads: 0,
      bytesReads: 0,
      fileReaderReads: 0,
      persistenceWrites: 0,
      persistenceWritesSettled: 0,
      persistenceWritePackages: [],
      shapeValidationCalls: 0,
      shapeValidatedImportedPayload: false,
      started: false,
      completed: false,
      thrown: "",
      settingsMessageBefore: String(settingsMessage || ""),
      settingsMessage: "",
      expectedShapeJson: expectedJson
    };
    globalThis.__FAIL_PERSONAL_EVIDENCE_BUILD_VERSION__ = failureVersion;
    globalThis.__PENDING_PERSONAL_EVIDENCE_IMPORT_KEY__ = key;
    return key;
  }, { fileName: name, failureVersion: failBuildVersion, expectedJson: expectedShapeJson });
}

async function importPersonalEvidenceThroughUi(page, packageOrRaw, name, options = {}) {
  const input = await personalEvidenceInput(page);
  const buffer = Buffer.isBuffer(packageOrRaw)
    ? packageOrRaw
    : Buffer.from(typeof packageOrRaw === "string" ? packageOrRaw : JSON.stringify(packageOrRaw), "utf8");
  let expectedShapeJson = "";
  try {
    expectedShapeJson = JSON.stringify(JSON.parse(buffer.toString("utf8")));
  } catch {
    // Malformed JSON is intentionally exercised by rejection cases.
  }
  const auditKey = await armPersonalEvidenceImportObserver(page, name, options.failBuildVersion || "", expectedShapeJson);
  await input.setInputFiles({ name, mimeType: "application/json", buffer });
  const auditField = (field) => page.evaluate(({ key, property }) => (
    globalThis.__PERSONAL_EVIDENCE_IMPORT_AUDIT__?.[key]?.[property]
  ), { key: auditKey, property: field });
  await expect.poll(() => auditField("started"), { message: `${name} must traverse the production file-input handler` }).toBe(true);
  await expect.poll(() => auditField("completed"), {
    message: `${name} must complete the production personal-evidence import path`,
    timeout: 120_000
  }).toBe(true);
  await expect.poll(async () => Number(await auditField("persistenceWritesSettled")) === Number(await auditField("persistenceWrites")), {
    message: `${name} must settle every IndexedDB write started by the import`,
    timeout: 30_000
  }).toBe(true);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const audit = await personalEvidenceImportAudit(page, auditKey);
  expect.soft(audit.observedName).toBe(name);
  expect.soft(audit.observedSize).toBe(buffer.length);
  return { auditKey, ...audit };
}

async function personalEvidenceImportAudit(page, auditKey) {
  return page.evaluate((key) => {
    const { expectedShapeJson: _expectedShapeJson, ...audit } = globalThis.__PERSONAL_EVIDENCE_IMPORT_AUDIT__[key];
    return audit;
  }, auditKey);
}

function personalEvidenceReadOperations(audit) {
  return ["textReads", "arrayBufferReads", "streamReads", "bytesReads", "fileReaderReads"]
    .reduce((total, field) => total + Number(audit[field] || 0), 0);
}

async function waitForPersistedPersonalEvidence(page, expectedExerciseId) {
  await expect.poll(async () => {
    const persisted = await persistedPersonalEvidenceState(page);
    return !persisted.error && packageContainsExerciseId(persisted.package, expectedExerciseId);
  }, {
    message: `IndexedDB app-data must persist personal evidence for ${expectedExerciseId}`,
    timeout: 60_000
  }).toBe(true);
}

async function reloadPersonalEvidenceState(page) {
  await page.reload();
  await page.waitForLoadState("load");
  await waitForEvidenceTerminal(page);
  return {
    runtime: await personalEvidenceRuntimeState(page),
    persisted: await persistedPersonalEvidenceState(page)
  };
}

async function seedPersistedPersonalEvidencePackage(page, packageValue, name = "synthetic-prior-personal-evidence.json") {
  const expectedExerciseId = primaryPackageExerciseId(packageValue);
  const audit = await importPersonalEvidenceThroughUi(page, packageValue, name);
  expect.soft(personalEvidenceReadOperations(audit), `${name} must be consumed through a production File or Blob read API`).toBeGreaterThan(0);
  await waitForPersistedPersonalEvidence(page, expectedExerciseId);
  const reloaded = await reloadPersonalEvidenceState(page);
  expect.soft(reloaded.persisted.error).toBe("");
  expect.soft(packageContainsExerciseId(reloaded.runtime.package, expectedExerciseId), `${name} must survive reload in application state`).toBe(true);
  expect.soft(packageContainsExerciseId(reloaded.persisted.package, expectedExerciseId), `${name} must survive reload in IndexedDB`).toBe(true);
  expect.soft(reloaded.runtime.status.state).toBe("ready");
  return { ...reloaded.runtime, persistedPackageJson: reloaded.persisted.packageJson };
}

function expectCanonicalPersonalEvidencePackage(actual, expected, label) {
  const expectedKeys = ["createdAt", "importedAt", "personalData", "personalDataVersion", "privacy", "researchDatabaseVersion", "schemaVersion"];
  expect.soft(Object.keys(actual || {}).sort(), `${label} must use the canonical persisted package shape`).toEqual(expectedKeys);
  expect.soft(actual?.schemaVersion, `${label} must retain the package schema version`).toBe(expected.schemaVersion);
  expect.soft(actual?.createdAt, `${label} must retain package creation provenance`).toBe(expected.createdAt);
  expect.soft(actual?.personalDataVersion, `${label} must retain the declared personal-data version`).toBe(expected.personalDataVersion);
  expect.soft(actual?.researchDatabaseVersion, `${label} must retain the declared research version`).toBe(expected.researchDatabaseVersion);
  expect.soft(actual?.privacy, `${label} must retain the private-local-only classification`).toBe(expected.privacy);
  expect.soft(actual?.importedAt, `${label} must record a valid import timestamp`).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect.soft(actual?.personalData, `${label} must persist the canonical validated aggregate payload`).toEqual(expected.personalData);
}

function expectCanonicalPersonalEvidenceWriteSnapshot(actual, expected, expectedExerciseId, label) {
  const expectedKeys = ["createdAt", "importedAt", "personalData", "personalDataVersion", "privacy", "researchDatabaseVersion", "schemaVersion"];
  expect.soft(actual?.topLevelKeys, `${label} canonical top-level keys`).toEqual(expectedKeys);
  expect.soft(actual?.schemaVersion, `${label} schema version`).toBe(expected.schemaVersion);
  expect.soft(actual?.createdAt, `${label} creation provenance`).toBe(expected.createdAt);
  expect.soft(actual?.personalDataVersion, `${label} personal-data version`).toBe(expected.personalDataVersion);
  expect.soft(actual?.researchDatabaseVersion, `${label} research version`).toBe(expected.researchDatabaseVersion);
  expect.soft(actual?.privacy, `${label} privacy classification`).toBe(expected.privacy);
  expect.soft(actual?.importedAt, `${label} import timestamp`).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  for (const collection of ["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores"]) {
    expect.soft(actual?.coreCounts?.[collection], `${label} ${collection} count`).toBe(expected.personalData[collection].length);
    expect.soft(actual?.firstIds?.[collection], `${label} ${collection} first identity`).toBe(expected.personalData[collection][0].exercise_id);
  }
  expect.soft(Object.values(actual?.lastIds || {}), `${label} must include the expected reconciled identity`).toContain(expectedExerciseId);
}

function expectReconciledPersonalIdentity(state, expectedExerciseId, label, excludedExerciseId = "") {
  expect.soft(state.engineHasReconciledIdentityMap, `${label} must expose the real reconciled identity Map`).toBe(true);
  expect.soft(state.enginePersonalIds, `${label} must contain the canonical imported identity`).toContain(expectedExerciseId);
  if (excludedExerciseId) expect.soft(state.enginePersonalIds, `${label} must replace, not merge, the prior identity`).not.toContain(excludedExerciseId);
}

async function expectAcceptedPersonalEvidenceImport(page, packageValue, raw, name, options = {}) {
  const expectedExerciseId = options.expectedExerciseId || primaryPackageExerciseId(packageValue);
  const audit = await importPersonalEvidenceThroughUi(page, raw ?? packageValue, name);
  expect.soft(personalEvidenceReadOperations(audit), `${name} must be consumed through a production File or Blob read API`).toBeGreaterThan(0);
  expect.soft(audit.shapeValidationCalls, `${name} must execute the dedicated production JSON-shape validator`).toBeGreaterThan(0);
  expect.soft(audit.shapeValidatedImportedPayload, `${name} must pass the actual parsed import payload to the JSON-shape validator`).toBe(true);
  expect.soft(audit.persistenceWrites, `${name} must traverse production IndexedDB persistence`).toBeGreaterThan(0);
  await waitForPersistedPersonalEvidence(page, expectedExerciseId);
  const immediate = await personalEvidenceRuntimeState(page);
  const persisted = await persistedPersonalEvidenceState(page);
  expectCanonicalPersonalEvidencePackage(immediate.package, packageValue, `${name} in-memory state`);
  expectCanonicalPersonalEvidencePackage(persisted.package, packageValue, `${name} IndexedDB state`);
  expectCanonicalPersonalEvidenceWriteSnapshot(
    audit.persistenceWritePackages.at(-1),
    packageValue,
    expectedExerciseId,
    `${name} captured production persistence write`
  );
  expectReconciledPersonalIdentity(immediate, expectedExerciseId, `${name} immediate engine`, options.excludedExerciseId || "");

  const reloaded = await reloadPersonalEvidenceState(page);
  expectCanonicalPersonalEvidencePackage(reloaded.runtime.package, packageValue, `${name} reloaded state`);
  expectCanonicalPersonalEvidencePackage(reloaded.persisted.package, packageValue, `${name} reloaded IndexedDB state`);
  expectReconciledPersonalIdentity(reloaded.runtime, expectedExerciseId, `${name} reloaded engine`, options.excludedExerciseId || "");
  expect.soft(reloaded.runtime.status.state).toBe("ready");
  expect.soft(reloaded.runtime.status.personalVersion).toBe(packageValue.personalDataVersion);
  return reloaded;
}

function expectPreservedPersonalEvidenceState(actual, before, label) {
  expect.soft(actual.packageJson === before.packageJson, `${label} must preserve the prior canonical package byte-for-byte`).toBe(true);
  expect.soft(actual.engineHasReconciledIdentityMap, `${label} must retain the reconciled identity Map`).toBe(true);
  expect.soft(actual.enginePersonalVersion, `${label} must preserve the prior real-engine version`).toBe(before.enginePersonalVersion);
  expect.soft(JSON.stringify(actual.enginePersonalIds) === JSON.stringify(before.enginePersonalIds), `${label} must preserve the prior reconciled identities`).toBe(true);
  expect.soft(actual.status, `${label} must preserve the prior evidence status`).toEqual(before.status);
}

async function expectRejectedPersonalEvidenceImport(page, priorPackage, raw, name, options = {}) {
  const before = await seedPersistedPersonalEvidencePackage(page, priorPackage, `prior-${name}`);
  expect.soft(before.engineHasReconciledIdentityMap, `${name} setup must use the real reconciled identity Map`).toBe(true);
  const audit = await importPersonalEvidenceThroughUi(page, raw, name, { failBuildVersion: options.failBuildVersion || "" });
  const readOperations = personalEvidenceReadOperations(audit);
  if (options.expectUnread) {
    expect.soft(readOperations, `${name} must be rejected before any File, Blob, stream, or FileReader consumption`).toBe(0);
  } else {
    expect.soft(readOperations, `${name} must traverse a production File or Blob read path`).toBeGreaterThan(0);
  }
  const changedVisibleMessage = audit.settingsMessage && audit.settingsMessage !== audit.settingsMessageBefore
    ? audit.settingsMessage
    : "";
  const rejectionSignal = String(audit.thrown || changedVisibleMessage).slice(0, 2_000);
  expect.soft(rejectionSignal, `${name} must produce an explicit thrown or user-visible rejection signal`).not.toBe("");
  expect.soft(rejectionSignal, `${name} rejection must identify the invalid condition`).toMatch(options.expectedRejection);
  expect.soft(audit.persistenceWrites, `${name} must not write rejected app data before restoring prior state`).toBe(0);
  expect.soft(audit.persistenceWritePackages, `${name} must produce no rejected or rollback IndexedDB writes`).toEqual([]);

  const immediate = await personalEvidenceRuntimeState(page);
  const persisted = await persistedPersonalEvidenceState(page);
  expectPreservedPersonalEvidenceState(immediate, before, `${name} immediate state`);
  expect.soft(persisted.error, `${name} must leave IndexedDB readable`).toBe("");
  expect.soft(persisted.packageJson === before.persistedPackageJson, `${name} must not write rejected input to IndexedDB`).toBe(true);
  const settledAudit = await personalEvidenceImportAudit(page, audit.auditKey);
  expect.soft(settledAudit.persistenceWrites, `${name} must remain write-free after the browser event loop settles`).toBe(0);
  expect.soft(settledAudit.persistenceWritePackages, `${name} must not enqueue a late rejected or rollback write`).toEqual([]);

  const reloaded = await reloadPersonalEvidenceState(page);
  expectPreservedPersonalEvidenceState(reloaded.runtime, before, `${name} post-reload state`);
  expect.soft(reloaded.persisted.error, `${name} reloaded IndexedDB must remain readable`).toBe("");
  expect.soft(reloaded.persisted.packageJson === before.persistedPackageJson, `${name} must not resurrect rejected input after reload`).toBe(true);
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

test("personal evidence import canonically persists valid replacement and atomically preserves prior state on failure", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "IndexedDB transaction semantics are viewport-independent and run once in desktop Chromium.");
  test.setTimeout(420_000);
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

  await seedPersistedPersonalEvidencePackage(page, priorPackage);
  await expectAcceptedPersonalEvidenceImport(
    page,
    candidatePackage,
    candidatePackage,
    "synthetic-valid-replacement-personal-evidence.json",
    { excludedExerciseId: "custom_synthetic_prior_press" }
  );

  const unsupportedVersion = clonePersonalEvidence(candidatePackage);
  unsupportedVersion.schemaVersion = "personal-evidence-package/99.0.0";
  const invalidRowType = clonePersonalEvidence(candidatePackage);
  invalidRowType.personalData.exerciseScores[0].session_count = "six";
  const unexpectedTopLevel = clonePersonalEvidence(candidatePackage);
  unexpectedTopLevel.unexpectedExecutableConfiguration = { enabled: true };
  const buildFailurePackage = syntheticPersonalEvidencePackage({
    exerciseId: "custom_synthetic_build_failure_press",
    exerciseName: "Synthetic Build Failure Press",
    researchExerciseId: "ex_machine_chest_press",
    version: "1.0.3"
  });
  const scenarios = [
    {
      name: "synthetic-malformed-personal-evidence.json",
      raw: '{"schemaVersion":',
      expectedRejection: /json|parse|unexpected|malformed|valid/i
    },
    ...["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores"].map((collection) => ({
      name: `synthetic-partial-missing-${collection}.json`,
      raw: JSON.stringify(partialPersonalEvidencePackage(collection)),
      expectedRejection: /prescription|score|muscle|collection|required|missing/i
    })),
    ...["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores"].map((collection) => {
      const value = clonePersonalEvidence(candidatePackage);
      value.personalData[collection] = [];
      return {
        name: `synthetic-partial-empty-${collection}.json`,
        raw: JSON.stringify(value),
        expectedRejection: /empty|at least|required|collection|record/i
      };
    }),
    {
      name: "synthetic-unsupported-personal-evidence.json",
      raw: JSON.stringify(unsupportedVersion),
      expectedRejection: /schema|version|unsupported/i
    },
    {
      name: "synthetic-invalid-row-personal-evidence.json",
      raw: JSON.stringify(invalidRowType),
      expectedRejection: /session|score|row|number|type|invalid/i
    },
    {
      name: "synthetic-unknown-field-personal-evidence.json",
      raw: JSON.stringify(unexpectedTopLevel),
      expectedRejection: /field|property|unknown|unexpected/i
    },
    {
      name: "synthetic-conflicting-personal-evidence.json",
      raw: JSON.stringify(conflictingIdentityPersonalEvidencePackage()),
      expectedRejection: /identity|conflict|reconcil/i
    },
    {
      name: "synthetic-invalid-muscle-source-personal-evidence.json",
      raw: JSON.stringify(invalidMuscleScoreOnlyPersonalEvidencePackage({ version: "1.0.6" })),
      expectedRejection: /identity|conflict|reconcil|unknown research/i
    },
    {
      name: "synthetic-build-failure-personal-evidence.json",
      raw: JSON.stringify(buildFailurePackage),
      failBuildVersion: "1.0.3",
      expectedRejection: /engine|construction|build|synthetic/i
    }
  ];

  for (const scenario of scenarios) {
    await test.step(scenario.name, async () => {
      await expectRejectedPersonalEvidenceImport(page, priorPackage, scenario.raw, scenario.name, {
        failBuildVersion: scenario.failBuildVersion || "",
        expectedRejection: scenario.expectedRejection
      });
    });
  }
});

test("personal evidence import enforces exact reachable file, collection, shape, ID, and text boundaries", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "Import resource boundaries are viewport-independent and run once in desktop Chromium.");
  test.setTimeout(600_000);
  const priorPackage = syntheticPersonalEvidencePackage({
    exerciseId: "custom_synthetic_boundary_prior_press",
    exerciseName: "Synthetic Boundary Prior Press",
    researchExerciseId: "ex_barbell_bench_press",
    version: "1.1.0"
  });

  const depthAtLimit = jsonValueAtDepth(PERSONAL_EVIDENCE_BOUNDARIES.jsonDepth);
  const depthOverLimit = jsonValueAtDepth(PERSONAL_EVIDENCE_BOUNDARIES.jsonDepth + 1);
  const widthAtLimit = jsonObjectAtWidth(PERSONAL_EVIDENCE_BOUNDARIES.objectKeys);
  const widthOverLimit = jsonObjectAtWidth(PERSONAL_EVIDENCE_BOUNDARIES.objectKeys + 1);
  expect(personalEvidenceJsonDepth(depthAtLimit)).toBe(PERSONAL_EVIDENCE_BOUNDARIES.jsonDepth);
  expect(personalEvidenceJsonDepth(depthOverLimit)).toBe(PERSONAL_EVIDENCE_BOUNDARIES.jsonDepth + 1);
  expect(personalEvidenceObjectWidth(widthAtLimit)).toBe(PERSONAL_EVIDENCE_BOUNDARIES.objectKeys);
  expect(personalEvidenceObjectWidth(widthOverLimit)).toBe(PERSONAL_EVIDENCE_BOUNDARIES.objectKeys + 1);
  for (const shapeCase of [
    { name: "depth-at-limit", value: depthAtLimit, rejected: false },
    { name: "depth-limit-plus-one", value: depthOverLimit, rejected: true },
    { name: "width-at-limit", value: widthAtLimit, rejected: false },
    { name: "width-limit-plus-one", value: widthOverLimit, rejected: true }
  ]) {
    await test.step(`production shape validator: ${shapeCase.name}`, async () => {
      const result = await executePersonalEvidenceShapeValidator(page, shapeCase.value);
      expect.soft(result.available, "A dedicated validatePersonalEvidenceJsonShape production helper is required").toBe(true);
      expect.soft(result.rejected, `${shapeCase.name} structural result`).toBe(shapeCase.rejected);
      if (shapeCase.rejected && result.error) expect.soft(result.error).toMatch(/depth|key|width|shape|limit/i);
    });
  }

  const scalarBoundary = personalEvidenceAtScalarBoundaries();
  const scalarBoundaryId = primaryPackageExerciseId(scalarBoundary);
  expect(scalarBoundaryId.length).toBe(PERSONAL_EVIDENCE_BOUNDARIES.stableIdChars);
  expect(scalarBoundary.personalData.exerciseScores[0].exercise_name.length).toBe(PERSONAL_EVIDENCE_BOUNDARIES.nameChars);
  expect(scalarBoundary.personalData.exercisePrescriptions[0].evidence_summary.length).toBe(PERSONAL_EVIDENCE_BOUNDARIES.textChars);
  const exactFileBoundary = jsonBufferAtExactBytes(scalarBoundary, PERSONAL_EVIDENCE_BOUNDARIES.fileBytes);
  expect(exactFileBoundary.length).toBe(PERSONAL_EVIDENCE_BOUNDARIES.fileBytes);
  await expectAcceptedPersonalEvidenceImport(
    page,
    scalarBoundary,
    exactFileBoundary,
    "synthetic-personal-evidence-file-and-scalar-limits.json",
    { expectedExerciseId: scalarBoundaryId }
  );

  const coreCollections = ["exercisePrescriptions", "exerciseScores", "exerciseMuscleScores"];
  const collectionBoundary = personalEvidenceWithMatchedCoreCount(PERSONAL_EVIDENCE_BOUNDARIES.coreCollectionItems, "1.2.6");
  const lastBoundaryId = `custom_synthetic_boundary_${String(PERSONAL_EVIDENCE_BOUNDARIES.coreCollectionItems - 1).padStart(4, "0")}`;
  const identitySequence = (collection) => collectionBoundary.personalData[collection].map((row) => row.exercise_id);
  for (const collection of coreCollections) {
    expect(collectionBoundary.personalData[collection]).toHaveLength(PERSONAL_EVIDENCE_BOUNDARIES.coreCollectionItems);
    expect(identitySequence(collection), `${collection} must use the same reconciled identity sequence at the limit`).toEqual(identitySequence(coreCollections[0]));
  }
  await expectAcceptedPersonalEvidenceImport(
    page,
    collectionBoundary,
    collectionBoundary,
    "synthetic-personal-evidence-all-collection-limits.json",
    { expectedExerciseId: lastBoundaryId }
  );

  const boundaryRejections = [
    {
      name: "synthetic-personal-evidence-file-limit-plus-one.json",
      expectUnread: true,
      expectedRejection: /file|size|large|byte|limit|8\s*(?:mib|mb)/i,
      build: () => jsonBufferAtExactBytes(scalarBoundary, PERSONAL_EVIDENCE_BOUNDARIES.fileBytes + 1)
    },
    {
      name: "synthetic-personal-evidence-name-limit-plus-one.json",
      expectedRejection: /name|length|character|limit|256/i,
      build: () => JSON.stringify(personalEvidenceAtNameLength(PERSONAL_EVIDENCE_BOUNDARIES.nameChars + 1))
    },
    {
      name: "synthetic-personal-evidence-text-limit-plus-one.json",
      expectedRejection: /text|summary|length|character|limit|4096/i,
      build: () => JSON.stringify(personalEvidenceAtTextLength(PERSONAL_EVIDENCE_BOUNDARIES.textChars + 1))
    },
    {
      name: "synthetic-personal-evidence-id-limit-plus-one.json",
      expectedRejection: /id|identifier|length|character|limit|128/i,
      build: () => JSON.stringify(personalEvidenceAtStableIdLength(PERSONAL_EVIDENCE_BOUNDARIES.stableIdChars + 1))
    },
    {
      name: "synthetic-personal-evidence-matched-core-collection-limit-plus-one.json",
      expectedRejection: /collection|record|item|row|exercise|limit|1024|too many|maximum/i,
      build: () => {
        const overLimit = personalEvidenceWithMatchedCoreCount(PERSONAL_EVIDENCE_BOUNDARIES.coreCollectionItems + 1, "1.2.7");
        const expectedIdentities = overLimit.personalData.exercisePrescriptions.map((row) => row.exercise_id);
        for (const collection of coreCollections) {
          expect(overLimit.personalData[collection]).toHaveLength(PERSONAL_EVIDENCE_BOUNDARIES.coreCollectionItems + 1);
          expect(overLimit.personalData[collection].map((row) => row.exercise_id), `${collection} +1 fixture identity relation`).toEqual(expectedIdentities);
        }
        return JSON.stringify(overLimit);
      }
    }
  ];

  for (const scenario of boundaryRejections) {
    await test.step(scenario.name, async () => {
      const raw = scenario.build();
      await expectRejectedPersonalEvidenceImport(page, priorPackage, raw, scenario.name, {
        expectUnread: scenario.expectUnread || false,
        expectedRejection: scenario.expectedRejection
      });
    });
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
  await expect.poll(() => page.evaluate(() => Boolean(prescriptionEngine?.evidence?.research?.exerciseById?.has("ex_barbell_bench_press"))), {
    message: "The page prescription engine must finish loading public research before seeding a safety recommendation"
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
    const preferred = blocked.finalPrescription?.preferredReplacementExerciseId || null;
    if (preferred && !mappedIds.has(preferred)) throw new Error(`Engine preferred replacement ${preferred} is absent from its public substitution evidence`);
    const eligibleIds = [...mappedIds].filter((exerciseId) => (
      prescriptionEngine.evidence.research.exerciseById.has(exerciseId)
        && prescriptionApi.equipmentCompatible(prescriptionEngine.evidence.research.exerciseById.get(exerciseId), availableEquipment).eligible === true
    ));
    if (!eligibleIds.length) throw new Error(`No engine-confirmed, catalog-backed substitute satisfies the supplied equipment constraint for ${originalExerciseId}`);
    const candidateId = preferred && eligibleIds.includes(preferred)
      ? preferred
      : eligibleIds[0];
    if (!candidateId) throw new Error(`Engine supplied no usable public substitute for ${originalExerciseId}`);
    const catalogRecord = prescriptionEngine.evidence.research.exerciseById.get(candidateId);
    if (!catalogRecord) throw new Error("Engine-confirmed safety substitute does not retain a public catalog record");
    const candidate = {
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
        exerciseName: catalogRecord.exercise_name
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
  await navigation.getByRole("button", { name: /More$/ }).click();
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

async function armBackupImportAtomicityObserver(page) {
  return page.evaluate(async () => {
    window.clearTimeout(saveTimer);
    if (idleSaveHandle && "cancelIdleCallback" in window) window.cancelIdleCallback(idleSaveHandle);
    idleSaveHandle = 0;
    const key = `backup-atomicity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const productionImport = importDataFile;
    const productionWrite = writeIndexedValue;
    const muscleCacheKey = `${key}-muscle`;
    const prescriptionCacheKey = `${key}-prescription`;
    const muscleSentinel = Object.freeze({ kind: "muscle", key });
    const prescriptionSentinel = Object.freeze({ kind: "prescription", key });
    muscleAssignmentCache.set(muscleCacheKey, muscleSentinel);
    prescriptionSnapshotCache.set(prescriptionCacheKey, prescriptionSentinel);
    const persisted = await readIndexedValue("app-data");
    const state = {
      productionImport,
      productionWrite,
      beforeData: data,
      beforePackage: data.personalEvidencePackage,
      beforeEngine: prescriptionEngine,
      beforeStatus: prescriptionEvidenceStatus,
      beforeDataJson: JSON.stringify(data),
      beforePackageJson: JSON.stringify(data.personalEvidencePackage || null),
      beforeStatusJson: JSON.stringify(prescriptionEvidenceStatus || null),
      beforePersistedJson: JSON.stringify(persisted),
      beforeDataRevision: Number(data.dataRevision || 0),
      beforeAnalysisRevision: analysisRevision,
      beforeEnginePersonalVersion: String(prescriptionEngine?.evidence?.versions?.personal || prescriptionEngine?.evidence?.personal?.version || "unknown"),
      beforeEnginePersonalIds: [...(prescriptionEngine?.evidence?.personal?.reconciledIdentityByExerciseId?.keys?.() || [])].sort(),
      muscleCacheKey,
      prescriptionCacheKey,
      muscleSentinel,
      prescriptionSentinel,
      importCalls: 0,
      importCompleted: false,
      observedName: "",
      observedSize: 0,
      appDataWrites: 0,
      appDataWritesSettled: 0
    };
    globalThis.__APP_TEST_BACKUP_ATOMICITY__ ||= {};
    globalThis.__APP_TEST_BACKUP_ATOMICITY__[key] = state;
    writeIndexedValue = async function observedBackupImportWrite(storageKey, value) {
      if (storageKey === "app-data") state.appDataWrites += 1;
      try {
        return await productionWrite(storageKey, value);
      } finally {
        if (storageKey === "app-data") state.appDataWritesSettled += 1;
      }
    };
    importDataFile = async function observedBackupImport(file) {
      state.importCalls += 1;
      state.observedName = String(file?.name || "");
      state.observedSize = Number(file?.size || 0);
      try {
        return await productionImport(file);
      } finally {
        state.importCompleted = true;
      }
    };
    return key;
  });
}

async function collectBackupImportAtomicityAudit(page, key, options = {}) {
  return page.evaluate(async ({ auditKey, restore }) => {
    const state = globalThis.__APP_TEST_BACKUP_ATOMICITY__?.[auditKey];
    if (!state) throw new Error(`Missing backup atomicity audit ${auditKey}`);
    const persisted = await readIndexedValue("app-data");
    const result = {
      importCalls: state.importCalls,
      importCompleted: state.importCompleted,
      observedName: state.observedName,
      observedSize: state.observedSize,
      appDataWrites: state.appDataWrites,
      appDataWritesSettled: state.appDataWritesSettled,
      dataReferenceUnchanged: data === state.beforeData,
      dataJsonUnchanged: JSON.stringify(data) === state.beforeDataJson,
      packageReferenceUnchanged: data.personalEvidencePackage === state.beforePackage,
      packageJsonUnchanged: JSON.stringify(data.personalEvidencePackage || null) === state.beforePackageJson,
      engineReferenceUnchanged: prescriptionEngine === state.beforeEngine,
      statusReferenceUnchanged: prescriptionEvidenceStatus === state.beforeStatus,
      statusJsonUnchanged: JSON.stringify(prescriptionEvidenceStatus || null) === state.beforeStatusJson,
      dataRevisionUnchanged: Number(data.dataRevision || 0) === state.beforeDataRevision,
      analysisRevisionUnchanged: analysisRevision === state.beforeAnalysisRevision,
      muscleCacheSentinelRetained: muscleAssignmentCache.get(state.muscleCacheKey) === state.muscleSentinel,
      prescriptionCacheSentinelRetained: prescriptionSnapshotCache.get(state.prescriptionCacheKey) === state.prescriptionSentinel,
      persistedJsonUnchanged: JSON.stringify(persisted) === state.beforePersistedJson,
      beforeDataJson: state.beforeDataJson,
      beforePackageJson: state.beforePackageJson,
      beforePersistedJson: state.beforePersistedJson,
      beforeDataRevision: state.beforeDataRevision,
      beforeAnalysisRevision: state.beforeAnalysisRevision,
      beforeEnginePersonalVersion: state.beforeEnginePersonalVersion,
      beforeEnginePersonalIds: state.beforeEnginePersonalIds,
      beforeStatusJson: state.beforeStatusJson
    };
    if (restore) {
      writeIndexedValue = state.productionWrite;
      importDataFile = state.productionImport;
      delete globalThis.__APP_TEST_BACKUP_ATOMICITY__[auditKey];
    }
    return result;
  }, { auditKey: key, restore: options.restore === true });
}

async function backupRuntimePersistenceFingerprint(page) {
  return page.evaluate(async () => {
    const persisted = await readIndexedValue("app-data");
    return {
      dataJson: JSON.stringify(data),
      packageJson: JSON.stringify(data.personalEvidencePackage || null),
      persistedJson: JSON.stringify(persisted),
      dataRevision: Number(data.dataRevision || 0),
      analysisRevision,
      enginePersonalVersion: String(prescriptionEngine?.evidence?.versions?.personal || prescriptionEngine?.evidence?.personal?.version || "unknown"),
      enginePersonalIds: [...(prescriptionEngine?.evidence?.personal?.reconciledIdentityByExerciseId?.keys?.() || [])].sort(),
      statusJson: JSON.stringify(prescriptionEvidenceStatus || null)
    };
  });
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
  if (await confirmation.count()) {
    await confirmation.focus();
    await confirmation.press("Space");
    await expect(confirmation).toBeChecked();
  }
  const observedCatalog = await page.evaluate(({ exerciseRuntimeId, replacementName }) => {
    const exercise = exerciseById(exerciseRuntimeId);
    const context = safetySubstituteContext(exercise.recommendationSnapshot, { exercise, session: sessionById(exercise.sessionId) });
    return {
      resolved: exactResearchCatalogIdentity(replacementName, context.exerciseCatalog),
      replacementName,
      allowed: context.allowedSafetySubstituteIds,
      catalog: context.exerciseCatalog.map((item) => ({ id: item.exercise_id, name: item.exercise_name }))
    };
  }, { exerciseRuntimeId: fixture.exerciseIds.bench, replacementName: substituteName });
  expect(observedCatalog.resolved, JSON.stringify(observedCatalog)).toBe(substituteId);
  await override.locator('[data-action="apply-prescription-override"]').click();
  await expect.poll(() => page.evaluate(() => appToast), { message: "The catalog-backed pain-free substitution must be accepted" }).toMatch(/Prescription override saved/i);

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

test("every exercise exposes shared defaults plus per-set reps, RPE, types, and rest", async ({ page }) => {
  test.setTimeout(60_000);
  const fixture = safetyWorkoutState({ illness: false, pain: false });
  await seedApplicationState(page, fixture.state);
  await expect.poll(() => page.evaluate(() => Boolean(prescriptionEngine?.evidence?.research?.exerciseById?.has("ex_barbell_bench_press"))), {
    message: "The prescription engine must finish loading before the role-aware workload fixture is created"
  }).toBe(true);

  const seeded = await page.evaluate(({ benchRuntimeId, legPressRuntimeId }) => {
    const snapshot = prescriptionEngine.prescribeExercise({
      exerciseId: "ex_barbell_bench_press",
      muscleGroupId: "chest",
      history: [{
        workout_date: "2026-07-20",
        progression_status: "held",
        comparison_performance_value: 110,
        set_repetitions: "[10,10,10]",
        set_loads: "[100,100,100]",
        set_rpes: "[8,8,8]",
        average_rpe: 8,
        completedSetRatio: 1
      }],
      experienceLevel: "advanced",
      setStructurePreference: "advanced_if_supported",
      createdAt: "2026-07-22T12:00:00.000Z"
    });
    if (snapshot.finalPrescription.setStructure !== "top_set_backoff") throw new Error(`Expected a top-set/back-off fixture, received ${snapshot.finalPrescription.setStructure}`);
    const straightSnapshot = prescriptionEngine.prescribeExercise({
      exerciseId: "ex_leg_press",
      muscleGroupId: "mg_quadriceps",
      experienceLevel: "beginner",
      setStructurePreference: "straight_sets",
      createdAt: "2026-07-22T12:00:01.000Z"
    });
    if (straightSnapshot.finalPrescription.setStructure !== "straight_sets") throw new Error(`Expected a straight-set fixture, received ${straightSnapshot.finalPrescription.setStructure}`);
    const exercise = data.exercises.find((item) => item.id === benchRuntimeId) || data.exercises.find((item) => item.name === "Barbell Bench Press");
    Object.assign(exercise, {
      recommendationSnapshot: snapshot,
      basePrescription: snapshot.basePrescription,
      finalPrescription: snapshot.finalPrescription,
      prescription: legacyTargetFromSnapshot(snapshot, { name: exercise.name, resistanceType: exercise.resistanceType, increment: exercise.prescription?.increment }),
      executionBlocked: false
    });
    const straightExercise = data.exercises.find((item) => item.id === legPressRuntimeId) || data.exercises.find((item) => item.name === "Leg Press");
    Object.assign(straightExercise, {
      recommendationSnapshot: straightSnapshot,
      basePrescription: straightSnapshot.basePrescription,
      finalPrescription: straightSnapshot.finalPrescription,
      prescription: legacyTargetFromSnapshot(straightSnapshot, { name: straightExercise.name, resistanceType: straightExercise.resistanceType, increment: straightExercise.prescription?.increment }),
      executionBlocked: false
    });
    const templateId = "role-defaults-template";
    data.sessions[0].templateId = templateId;
    data.templates = [{
      id: templateId,
      name: "Role Defaults",
      createdAt: "2026-07-22T12:00:00.000Z",
      updatedAt: "2026-07-22T12:00:00.000Z",
      exercises: [
        { id: "template-bench", name: exercise.name, sets: snapshot.finalPrescription.workingSets.target, reps: snapshot.finalPrescription.repRange.max, repMin: snapshot.finalPrescription.repRange.min, repMax: snapshot.finalPrescription.repRange.max, restSeconds: snapshot.finalPrescription.restSeconds.target, setTypes: [], warmups: [] },
        { id: "template-leg-press", name: straightExercise.name, sets: straightSnapshot.finalPrescription.workingSets.target, reps: straightSnapshot.finalPrescription.repRange.max, repMin: straightSnapshot.finalPrescription.repRange.min, repMax: straightSnapshot.finalPrescription.repRange.max, restSeconds: straightSnapshot.finalPrescription.restSeconds.target, setTypes: [], warmups: [] }
      ]
    }];
    data.recommendationHistory = [snapshot, straightSnapshot];
    render();
    return [snapshot.finalPrescription.setStructure, straightSnapshot.finalPrescription.setStructure];
  }, { benchRuntimeId: fixture.exerciseIds.bench, legPressRuntimeId: fixture.exerciseIds.legPress });
  expect(seeded).toEqual(["top_set_backoff", "straight_sets"]);

  const card = page.locator(`.exercise-card:has([data-exercise-id="${fixture.exerciseIds.bench}"])`).first();
  await card.getByRole("button", { name: "Add warm-up set to Barbell Bench Press" }).click();
  await card.locator("details.exercise-options > summary").click();
  const collapseCue = await card.locator("details.exercise-options > summary").evaluate((summary) => {
    const style = getComputedStyle(summary, "::after");
    return { content: style.content, background: style.backgroundColor };
  });
  expect(collapseCue.content).toContain("⌃");
  expect(collapseCue.background).not.toBe("rgba(0, 0, 0, 0)");
  const benchmark = card.locator(".guidance-benchmark-strip");
  await expect(benchmark.getByText("Program benchmark", { exact: true })).toBeVisible();
  await expect(benchmark.getByText("Informational · not an input", { exact: true })).toBeVisible();
  await expect(benchmark.locator("input, select, textarea, button")).toHaveCount(0);
  const editor = card.locator('[data-standard-workload-form]');
  await expect(editor.getByText("Sets, reps, RPE & rest", { exact: true })).toBeVisible();
  await expect(editor.locator('[data-default-field="sets"]')).toBeVisible();
  await expect(editor.locator('[data-default-field="target-rpe-min"]')).toBeVisible();
  await expect(editor.locator('[data-default-field="target-rpe-max"]')).toBeVisible();
  const workingSetInput = editor.locator('[data-default-field="sets"]');
  const initialWorkingSets = await workingSetInput.inputValue();
  await editor.getByRole("button", { name: "Increase Default working set count" }).click();
  await expect(workingSetInput).toHaveValue(String(Number(initialWorkingSets) + 1));
  await editor.getByRole("button", { name: "Decrease Default working set count" }).click();
  await expect(workingSetInput).toHaveValue(initialWorkingSets);
  await editor.locator("[data-individual-set-disclosure] > summary").click();
  await expect.poll(() => editor.locator("[data-individual-set-disclosure]").evaluate((node) => node.open)).toBe(true);
  await expect(editor.locator('[data-set-default-field="type"]')).toHaveCount(20);
  const warmupRow = editor.locator('[data-set-default-row][data-set-scope="warmup"]');
  await expect(warmupRow).toHaveCount(1);
  const compactStepperGeometry = await warmupRow.locator("[data-numeric-stepper]").first().evaluate((stepper) => {
    const input = stepper.querySelector("input");
    const buttons = [...stepper.querySelectorAll("button")];
    return {
      inputWidth: input?.getBoundingClientRect().width || 0,
      buttonWidths: buttons.map((button) => button.getBoundingClientRect().width)
    };
  });
  expect(compactStepperGeometry.inputWidth).toBeGreaterThanOrEqual(52);
  expect(compactStepperGeometry.buttonWidths).toHaveLength(2);
  for (const width of compactStepperGeometry.buttonWidths) expect(width).toBeLessThanOrEqual(36.5);
  await warmupRow.locator('[data-set-default-field="target-rpe-min"]').fill("3.5");
  await warmupRow.locator('[data-set-default-field="target-rpe-max"]').fill("4.5");
  await warmupRow.locator('[data-set-default-field="rest"]').fill("60");

  const straightCard = page.locator(`.exercise-card:has([data-exercise-id="${fixture.exerciseIds.legPress}"])`).first();
  await straightCard.locator("details.exercise-options > summary").click();
  const straightEditor = straightCard.locator('[data-standard-workload-form]');
  await expect.poll(() => straightEditor.locator("[data-individual-set-disclosure]").evaluate((node) => node.open)).toBe(false);
  await expect(straightEditor.locator('[data-default-field="working-rest"]')).toBeVisible();
  await expect(straightEditor.locator('[data-default-field="warmup-rest"]')).toBeVisible();
  await expect(straightEditor.locator('[data-default-field="target-rpe-min"]')).toBeVisible();
  await expect(straightEditor.locator('[data-default-field="target-rpe-max"]')).toBeVisible();

  await editor.locator('[data-default-field="sets"]').fill("5");
  const rows = editor.locator('[data-set-default-row][data-set-scope="working"]:not([hidden])');
  await expect(rows).toHaveCount(5);
  const targets = [
    ["top", "5", "6", "7.5", "8.5", "90"],
    ["top", "5", "6", "8", "9", "150"],
    ["backoff", "8", "10", "7", "8", "120"],
    ["drop", "12", "15", "8.5", "9.5", "45"],
    ["backoff", "8", "10", "7", "8", "120"]
  ];
  for (let index = 0; index < targets.length; index += 1) {
    const row = rows.nth(index);
    await row.locator('[data-set-default-field="type"]').selectOption(targets[index][0]);
    await row.locator('[data-set-default-field="rep-min"]').fill(targets[index][1]);
    await row.locator('[data-set-default-field="rep-max"]').fill(targets[index][2]);
    await row.locator('[data-set-default-field="target-rpe-min"]').fill(targets[index][3]);
    await row.locator('[data-set-default-field="target-rpe-max"]').fill(targets[index][4]);
    await row.locator('[data-set-default-field="rest"]').fill(targets[index][5]);
  }
  await editor.locator("[data-standard-save-template]").check();
  await editor.locator('[data-action="apply-standard-workload"]').click();
  await expect.poll(() => page.evaluate((exerciseRuntimeId) => {
    return data.sets.filter((set) => set.exerciseId === exerciseRuntimeId && !set.isWarmup && !set.completed).length;
  }, fixture.exerciseIds.bench), { message: "The individual working-set count must persist through rerender" }).toBe(5);

  const result = await page.evaluate((exerciseRuntimeId) => {
    const exercise = data.exercises.find((item) => item.id === exerciseRuntimeId);
    const warmupSet = data.sets.find((set) => set.exerciseId === exerciseRuntimeId && set.isWarmup);
    const workingSets = data.sets.filter((set) => set.exerciseId === exerciseRuntimeId && !set.isWarmup && !set.completed);
    const session = data.sessions.find((item) => item.id === exercise.sessionId);
    const template = data.templates.find((item) => item.id === session.templateId);
    const templateExercise = template.exercises.find((item) => item.name === exercise.name);
    startTimer(exerciseRuntimeId, warmupSet.id);
    const warmupTimerSeconds = timer.durationSeconds;
    startTimer(exerciseRuntimeId, workingSets[0].id);
    return {
      setTypes: workingSets.map((set) => set.setType),
      setRanges: workingSets.map((set) => [set.targetRepMin, set.targetRepMax]),
      setRpeRanges: workingSets.map((set) => [set.targetRpeMin, set.targetRpeMax]),
      setRests: workingSets.map((set) => set.targetRestSeconds),
      warmupRpeRange: [warmupSet.targetRpeMin, warmupSet.targetRpeMax],
      warmupRest: warmupSet.targetRestSeconds,
      warmupTimerSeconds,
      timerSeconds: timer.durationSeconds,
      templateSets: templateExercise.sets,
      templateWarmupRpeRange: [templateExercise.warmups[0].targetRpeMin, templateExercise.warmups[0].targetRpeMax],
      templateWarmupRest: templateExercise.warmups[0].targetRestSeconds,
      templateTypes: templateExercise.setTypes.map((setType) => [setType.type, setType.repMin, setType.repMax, setType.rpeMin, setType.rpeMax, setType.restSeconds]),
      overrideAction: exercise.manualOverrides.at(-1)?.action
    };
  }, fixture.exerciseIds.bench);
  expect(result.setTypes).toEqual(["top", "top", "backoff", "drop", "backoff"]);
  expect(result.setRanges).toEqual([[5, 6], [5, 6], [8, 10], [12, 15], [8, 10]]);
  expect(result.setRpeRanges).toEqual([[7.5, 8.5], [8, 9], [7, 8], [8.5, 9.5], [7, 8]]);
  expect(result.setRests).toEqual([90, 150, 120, 45, 120]);
  expect(result.warmupRpeRange).toEqual([3.5, 4.5]);
  expect(result.warmupRest).toBe(60);
  expect(result.warmupTimerSeconds).toBe(60);
  expect(result.timerSeconds).toBe(90);
  expect(result.templateSets).toBe(5);
  expect(result.templateWarmupRpeRange).toEqual([3.5, 4.5]);
  expect(result.templateWarmupRest).toBe(60);
  expect(result.templateTypes).toEqual([
    ["top", 5, 6, 7.5, 8.5, 90],
    ["top", 5, 6, 8, 9, 150],
    ["backoff", 8, 10, 7, 8, 120],
    ["drop", 12, 15, 8.5, 9.5, 45],
    ["backoff", 8, 10, 7, 8, 120]
  ]);
  expect(result.overrideAction).toBe("exercise_default_targets");
  await card.locator("details.exercise-options > summary").click();
  await expect.poll(() => card.locator("details.exercise-options").evaluate((node) => node.open)).toBe(false);
});

test("an exercise without research or historical guidance still has editable defaults", async ({ page }) => {
  const fixture = safetyWorkoutState({ illness: false, pain: false });
  await seedApplicationState(page, fixture.state);
  const customId = await page.evaluate((sessionId) => {
    const exerciseId = "custom-without-guidance";
    const exercise = {
      id: exerciseId,
      sessionId,
      name: "My Cable Variation",
      performanceExerciseId: "user_custom_my_cable_variation",
      researchExerciseId: "",
      identitySource: "user_declared_custom",
      identityVersion: "exercise-identity/2.1.0",
      order: 99,
      restSeconds: 75,
      resistanceType: "external",
      customExerciseProfile: { schemaVersion: "custom-exercise-profile/1.0.0", status: "incomplete" },
      executionQualityAssessment: "not_assessed"
    };
    const set = {
      ...data.sets[0],
      id: "custom-without-guidance-set",
      exerciseId,
      setNumber: 1,
      sequenceIndex: 0,
      sequence: 0,
      setTypeIndex: 0,
      setType: "straight",
      isWarmup: false,
      reps: 8,
      targetReps: 10,
      targetRepMin: 8,
      targetRepMax: 12,
      targetRestSeconds: 75,
      completed: false,
      skipped: false
    };
    commit({ ...data, exercises: [...data.exercises, exercise], sets: [...data.sets, set] });
    return exerciseId;
  }, fixture.state.sessions[0].id);
  const card = page.locator(`.exercise-card:has([data-exercise-id="${customId}"])`).first();
  await card.locator("details.exercise-options > summary").click();
  const editor = card.locator("[data-standard-workload-form]");
  await expect(editor.getByText("No exercise-specific range", { exact: true })).toBeVisible();
  await editor.locator('[data-default-field="sets"]').fill("3");
  await editor.locator('[data-default-field="rep-min"]').fill("10");
  await editor.locator('[data-default-field="rep-max"]').fill("14");
  await editor.locator('[data-default-field="target-rpe-min"]').fill("8");
  await editor.locator('[data-default-field="target-rpe-max"]').fill("9");
  await editor.locator('[data-default-field="working-rest"]').fill("105");
  await editor.locator('[data-action="apply-standard-workload"]').click();
  await expect.poll(() => page.evaluate((exerciseId) => data.sets
    .filter((set) => set.exerciseId === exerciseId && !set.isWarmup)
    .map((set) => [set.targetRepMin, set.targetRepMax, set.targetRpeMin, set.targetRpeMax, set.targetRestSeconds]), customId)).toEqual([[10, 14, 8, 9, 105], [10, 14, 8, 9, 105], [10, 14, 8, 9, 105]]);
});

test("primary navigation exposes a skip target and moves focus into the selected view", async ({ page }) => {
  const skipLink = page.getByRole("link", { name: /skip.*content/i });
  await expect(skipLink).toHaveAttribute("href", "#main-content");
  await skipLink.focus();
  await expect(skipLink).toBeFocused();

  const progress = page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /Progress$/ });
  await progress.click();
  await expect(page.locator(".dashboard-view")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Training signals, in context.", exact: true })).toBeVisible();
  const focusIsInView = await page.evaluate(() => {
    const active = document.activeElement;
    const main = document.querySelector("#main-content");
    return Boolean(active && main && (active === main || main.contains(active)) && active !== document.body);
  });
  expect(focusIsInView, "Selecting a primary tab must place focus in the new main view").toBe(true);
});

test("closing the template-start dialog restores focus to its quick-start button", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: /Plan$/ }).click();
  await page.locator('[data-action="new-template"]').click();
  await navigation.getByRole("button", { name: /Today$/ }).click();

  const quickStart = page.locator('.quick-template-card[data-action="start-template"]').first();
  await expect(quickStart).toBeVisible();
  await quickStart.focus();
  await quickStart.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close template setup" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(quickStart).toBeFocused();
});

test("Progress overview detail Back restores focus to the originating summary control", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: /Progress$/ }).click();
  const origin = page.locator('[data-action="open-dashboard-detail"]').first();
  await origin.focus();
  await origin.click();
  await expect(page.locator(".dashboard-detail-view")).toBeVisible();
  await page.locator('[data-action="close-dashboard-detail"]').click();
  await expect(page.locator(".dashboard-detail-view")).toHaveCount(0);
  await expect(origin).toBeFocused();
});

test("cloud workout sync consent defaults off and persists independently when explicitly enabled", async ({ page }) => {
  await page.route("**/api/sync/authorize", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "authorized", token: "synthetic-sync-token" })
  }));
  await page.route("**/api/sync/consent", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "enabled" })
  }));
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: /More$/ }).click();
  const dataGroup = page.locator("details.settings-group").filter({ has: page.locator("summary", { hasText: "Data and backup" }) });
  await dataGroup.locator("summary").click();
  const consent = page.locator('[data-action="cloud-workout-sync-consent"]');
  await expect(consent).toBeVisible();
  await expect(consent).not.toBeChecked();
  await consent.click();
  await expect(consent).toBeChecked({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(async () => {
    const stored = await readIndexedValue("app-data");
    return stored?.settings?.cloudWorkoutSyncConsent === true;
  }), { message: "Enabled cloud-copy consent must be durable before reload", timeout: 15_000 }).toBe(true);

  await page.reload();
  await navigation.getByRole("button", { name: /More$/ }).click();
  await page.locator("details.settings-group").filter({ has: page.locator("summary", { hasText: "Data and backup" }) }).locator("summary").click();
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
    colorPackage: "signal-garden",
    cloudWorkoutSyncConsent: false
  });
});

test("a full backup with an invalid muscle-only evidence identity rejects atomically and preserves reload state", async ({ page }) => {
  test.setTimeout(90_000);
  let group = await openBackupSettings(page);
  const baseline = validFullState();
  baseline.personalEvidencePackage = syntheticPersonalEvidencePackage({
    version: "1.0.8",
    exerciseId: "custom_synthetic_backup_baseline_press",
    exerciseName: "Synthetic Backup Baseline Press"
  });
  const accepted = await importBackup(page, group, baseline, "synthetic-valid-evidence-backup.json");
  expect.soft(accepted.terminalState).toBe("accepted");

  await page.reload();
  await page.waitForLoadState("load");
  await waitForEvidenceTerminal(page);
  group = await openBackupSettings(page);
  const before = await backupRuntimePersistenceFingerprint(page);
  const auditKey = await armBackupImportAtomicityObserver(page);
  const rejectedBackup = validFullState();
  rejectedBackup.personalEvidencePackage = invalidMuscleScoreOnlyPersonalEvidencePackage({ version: "1.0.9" });
  const rejectedRaw = JSON.stringify(rejectedBackup);
  const rejected = await importBackup(page, group, rejectedRaw, "synthetic-invalid-muscle-source-backup.json");
  expect.soft(rejected.terminalState, "The production backup importer must expose an explicit rejected state").toBe("rejected");
  expect.soft(rejected.terminalText, "The rejection must identify the embedded evidence identity conflict").toMatch(/identity|conflict|reconcil|unknown research/i);

  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, 100)));
  }));
  const audit = await collectBackupImportAtomicityAudit(page, auditKey, { restore: true });
  expect.soft(audit.importCalls, "The file input must call the production importDataFile boundary exactly once").toBe(1);
  expect.soft(audit.importCompleted).toBe(true);
  expect.soft(audit.observedName).toBe("synthetic-invalid-muscle-source-backup.json");
  expect.soft(audit.observedSize).toBe(Buffer.byteLength(rejectedRaw, "utf8"));
  expect.soft(audit.appDataWrites, "Rejected embedded evidence must cause zero app-data writes, including rollback writes").toBe(0);
  expect.soft(audit.appDataWritesSettled, "No rejected or late app-data write may settle").toBe(0);
  expect.soft(audit, "Runtime state, evidence, revisions, and dependent cache sentinels must remain untouched").toMatchObject({
    dataReferenceUnchanged: true,
    dataJsonUnchanged: true,
    packageReferenceUnchanged: true,
    packageJsonUnchanged: true,
    engineReferenceUnchanged: true,
    statusReferenceUnchanged: true,
    statusJsonUnchanged: true,
    dataRevisionUnchanged: true,
    analysisRevisionUnchanged: true,
    muscleCacheSentinelRetained: true,
    prescriptionCacheSentinelRetained: true,
    persistedJsonUnchanged: true
  });
  expect.soft(audit.beforeDataJson).toBe(before.dataJson);
  expect.soft(audit.beforePackageJson).toBe(before.packageJson);
  expect.soft(audit.beforePersistedJson).toBe(before.persistedJson);
  expect.soft(audit.beforeDataRevision).toBe(before.dataRevision);
  expect.soft(audit.beforeAnalysisRevision).toBe(before.analysisRevision);
  expect.soft(audit.beforeEnginePersonalVersion).toBe(before.enginePersonalVersion);
  expect.soft(audit.beforeEnginePersonalIds).toEqual(before.enginePersonalIds);
  expect.soft(audit.beforeStatusJson).toBe(before.statusJson);

  await page.reload();
  await page.waitForLoadState("load");
  await waitForEvidenceTerminal(page);
  const reloaded = await backupRuntimePersistenceFingerprint(page);
  expect.soft(reloaded, "Reload must recover the exact accepted runtime and persisted evidence, never the rejected backup").toEqual(before);
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
