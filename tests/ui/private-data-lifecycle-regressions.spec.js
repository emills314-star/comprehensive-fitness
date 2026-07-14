"use strict";

const { test, expect } = require("@playwright/test");
const { IDS, validFullState } = require("../fixtures/synthetic-app-backups");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__cf_lifecycle_test_initialized__") !== "1") {
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem("__cf_lifecycle_test_initialized__", "1");
    }
    globalThis.__MIGRATION_XSS_EXECUTED__ = 0;
  });
  await page.goto("/");
  await page.waitForLoadState("load");
  await expect.poll(() => page.evaluate(() => String(prescriptionEvidenceStatus?.state || "loading")), {
    timeout: 30_000
  }).not.toBe("loading");
});

test("migration audit import fields are typed and every rendered value is escaped", async ({ page }) => {
  const state = validFullState();
  const result = await page.evaluate(({ model, ids }) => {
    const validAudit = {
      version: 2,
      startedAt: "2026-07-14T12:00:00.000Z",
      completedAt: "2026-07-14T12:00:01.000Z",
      inspected: 1,
      changed: 1,
      explicitRetained: 0,
      manualOverridesPreserved: 0,
      warmups: 0,
      topSets: 1,
      backoffSets: 0,
      dropSets: 0,
      ambiguous: 0,
      templatesReseeded: 1,
      changes: [{ setId: ids.set, exerciseId: ids.exercise, from: "straight", to: "top", reason: "Synthetic migration", confidence: 0.9 }]
    };
    const validate = (audit) => {
      const candidate = structuredClone(model);
      candidate.migrationAudit = [audit];
      try {
        validateImportedAppData(candidate, BACKUP_IMPORT_LIMITS);
        return "accepted";
      } catch (error) {
        return String(error?.message || error);
      }
    };
    const validation = {
      valid: validate(validAudit),
      stringVersion: validate({ ...validAudit, version: '<img id="migration-version-xss">' }),
      stringCount: validate({ ...validAudit, inspected: "1" }),
      longTimestamp: validate({ ...validAudit, startedAt: "2".repeat(65) }),
      longReason: validate({ ...validAudit, changes: [{ ...validAudit.changes[0], reason: "r".repeat(4097) }] }),
      stringConfidence: validate({ ...validAudit, changes: [{ ...validAudit.changes[0], confidence: "0.9" }] })
    };

    const payload = '<img id="migration-render-xss" src="x" onerror="globalThis.__MIGRATION_XSS_EXECUTED__=1">';
    data = structuredClone(model);
    data.migrationAudit = [{
      version: payload,
      inspected: payload,
      changed: payload,
      manualOverridesPreserved: payload,
      warmups: payload,
      topSets: payload,
      backoffSets: payload,
      dropSets: payload,
      ambiguous: payload,
      templatesReseeded: payload,
      changes: []
    }];
    activeTab = "data";
    render();
    return { validation, payload };
  }, { model: state, ids: IDS });

  expect(result.validation.valid).toBe("accepted");
  for (const [name, message] of Object.entries(result.validation)) {
    if (name === "valid") continue;
    expect(message, name).not.toBe("accepted");
  }
  await expect(page.locator("#migration-render-xss")).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__MIGRATION_XSS_EXECUTED__)).toBe(0);
  await expect(page.locator(".settings-view")).toContainText(result.payload);
});

test("consent epochs discard stale reads, abort in-flight upload, clear durably, and permit a fresh epoch", async ({ page }) => {
  const state = validFullState();
  const result = await page.evaluate(async (model) => {
    data = structuredClone(model);
    data.settings.cloudWorkoutSyncConsent = true;
    completedSummarySessionId = data.sessions[0].id;
    pushIdentity = { installationId: "installation-sync", deviceId: "device-sync", token: "sync-secret", status: "enabled" };
    syncConsentEpoch = 40;
    syncConsentTransition = Promise.resolve();
    activeWorkoutSyncOperations.clear();
    activeWorkoutSyncAbortControllers.clear();
    window.clearTimeout(syncFlushTimer);
    syncFlushTimer = 0;

    const writes = [];
    let releaseRead;
    let markReadStarted;
    const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
    readIndexedValue = async (key) => {
      if (key !== "sync-queue") return null;
      markReadStarted();
      return new Promise((resolve) => { releaseRead = resolve; });
    };
    writeIndexedValue = async (key, value) => {
      if (key === "sync-queue") writes.push({ phase: "stale-read", value: structuredClone(value), consent: data.settings.cloudWorkoutSyncConsent, epoch: syncConsentEpoch });
      return true;
    };
    const staleQueue = queueActiveWorkoutSync(syncConsentEpoch);
    await readStarted;
    const revoke = setCloudWorkoutSyncConsent(false);
    releaseRead([{ mutationId: "stale", sessionId: data.sessions[0].id, payload: {} }]);
    await Promise.all([staleQueue, revoke]);
    const afterFirstRevoke = { consent: data.settings.cloudWorkoutSyncConsent, epoch: syncConsentEpoch, writes: structuredClone(writes), timer: syncFlushTimer };

    writes.length = 0;
    readIndexedValue = async (key) => key === "sync-queue" ? [] : null;
    const priorEpoch = syncConsentEpoch;
    await setCloudWorkoutSyncConsent(true);
    const afterEnable = { consent: data.settings.cloudWorkoutSyncConsent, priorEpoch, epoch: syncConsentEpoch, writes: structuredClone(writes) };
    window.clearTimeout(syncFlushTimer);
    syncFlushTimer = 0;

    writes.length = 0;
    const queuedMutation = { mutationId: "upload-1", sessionId: data.sessions[0].id, revision: "2026-07-14T12:00:00.000Z", payload: {} };
    readIndexedValue = async (key) => key === "sync-queue" ? [queuedMutation] : null;
    let markUploadStarted;
    const uploadStarted = new Promise((resolve) => { markUploadStarted = resolve; });
    let uploadAborted = false;
    pushApi = async (path, body, options = {}) => {
      if (path !== "/api/sync/workout") return { status: "ok" };
      markUploadStarted();
      return new Promise((resolve, reject) => {
        const rejectAbort = () => {
          uploadAborted = true;
          const error = new Error("Synthetic abort");
          error.name = "AbortError";
          reject(error);
        };
        if (options.signal?.aborted) rejectAbort();
        else options.signal?.addEventListener("abort", rejectAbort, { once: true });
      });
    };
    writeIndexedValue = async (key, value) => {
      if (key === "sync-queue") writes.push({ phase: "upload", value: structuredClone(value), consent: data.settings.cloudWorkoutSyncConsent, epoch: syncConsentEpoch });
      return true;
    };
    const upload = flushWorkoutSyncQueue(syncConsentEpoch);
    await uploadStarted;
    const revokeDuringUpload = setCloudWorkoutSyncConsent(false);
    await Promise.all([upload, revokeDuringUpload]);
    window.clearTimeout(saveTimer);
    window.clearTimeout(syncFlushTimer);
    return {
      afterFirstRevoke,
      afterEnable,
      afterUploadRevoke: { consent: data.settings.cloudWorkoutSyncConsent, epoch: syncConsentEpoch, writes: structuredClone(writes), uploadAborted, activeControllers: activeWorkoutSyncAbortControllers.size }
    };
  }, state);

  expect(result.afterFirstRevoke.consent).toBe(false);
  expect(result.afterFirstRevoke.timer).toBe(0);
  expect(result.afterFirstRevoke.writes).toEqual([{ phase: "stale-read", value: [], consent: false, epoch: 41 }]);
  expect(result.afterEnable.consent).toBe(true);
  expect(result.afterEnable.epoch).toBe(result.afterEnable.priorEpoch + 1);
  expect(result.afterEnable.writes.some((entry) => entry.value.length === 1 && entry.consent === true)).toBe(true);
  expect(result.afterUploadRevoke.consent).toBe(false);
  expect(result.afterUploadRevoke.uploadAborted).toBe(true);
  expect(result.afterUploadRevoke.activeControllers).toBe(0);
  expect(result.afterUploadRevoke.writes).toEqual([{ phase: "upload", value: [], consent: false, epoch: 43 }]);
});

test("local clearing preserves pending deletion and awaits timer cancellation while ordinary authorization remains local-only", async ({ page }) => {
  const state = validFullState();
  const result = await page.evaluate(async (model) => {
    data = structuredClone(model);
    pushIdentity = { installationId: "installation-delete", deviceId: "device-delete", token: "secret-delete", status: "enabled" };
    persistPushIdentity = async () => true;
    writeIndexedValue = async () => true;
    pushApi = async (path) => path === "/api/install/delete" ? { status: "deleting", phase: "timers", retryAfterMs: 1000 } : { status: "ok" };
    await deleteRemoteInstallationData({ scheduleRetry: false });
    let databaseDeletes = 0;
    deleteFitnessDatabase = async () => { databaseDeletes += 1; };
    clearDataFlow = { open: true, acknowledged: true, phrase: "CLEAR", unsynced: {} };
    const blockedResult = await permanentlyClearLocalData();
    const pendingDeletion = { blockedResult, databaseDeletes, token: pushIdentity?.token, status: pushIdentity?.status, blockedMessage: clearDataFlow?.blockedMessage || "" };

    pushIdentity = { installationId: "ordinary-installation", deviceId: "ordinary-device", token: "ordinary-secret", status: "enabled" };
    timer = null;
    clearDataFlow = { open: true, acknowledged: true, phrase: "CLEAR", unsynced: {} };
    databaseDeletes = 0;
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => null } }) } });
    const ordinaryResult = await permanentlyClearLocalData();
    const ordinaryClear = { ordinaryResult, databaseDeletes, pushIdentity };

    data = structuredClone(model);
    pushIdentity = null;
    timer = { id: "local-timer", version: 4, workoutId: model.sessions[0].id, isActive: true };
    clearDataFlow = { open: true, acknowledged: true, phrase: "CLEAR", unsynced: {} };
    databaseDeletes = 0;
    let releaseCancellation;
    cancelRestPush = async () => new Promise((resolve) => { releaseCancellation = resolve; });
    const clearPromise = permanentlyClearLocalData();
    await Promise.resolve();
    const beforeCancellation = { databaseDeletes, timerId: timer?.id || "" };
    releaseCancellation(false);
    const cancellationResult = await clearPromise;
    const afterCancellationFailure = { cancellationResult, databaseDeletes, timerId: timer?.id || "", blockedMessage: clearDataFlow?.blockedMessage || "" };
    return { pendingDeletion, ordinaryClear, beforeCancellation, afterCancellationFailure };
  }, state);

  expect(result.pendingDeletion.blockedResult).toBe(false);
  expect(result.pendingDeletion.databaseDeletes).toBe(0);
  expect(result.pendingDeletion.token).toBe("secret-delete");
  expect(result.pendingDeletion.status).toBe("deleting");
  expect(result.pendingDeletion.blockedMessage).toContain("Remote installation deletion");
  expect(result.ordinaryClear.ordinaryResult).toBe(true);
  expect(result.ordinaryClear.databaseDeletes).toBe(1);
  expect(result.ordinaryClear.pushIdentity).toBeNull();
  expect(result.beforeCancellation).toEqual({ databaseDeletes: 0, timerId: "local-timer" });
  expect(result.afterCancellationFailure.cancellationResult).toBe(false);
  expect(result.afterCancellationFailure.databaseDeletes).toBe(0);
  expect(result.afterCancellationFailure.timerId).toBe("local-timer");
  expect(result.afterCancellationFailure.blockedMessage).toContain("could not be canceled");
});

test("pending remote deletion resumes after offline reload and the online event", async ({ page }) => {
  const state = validFullState();
  const identity = {
    installationId: "installation-resume",
    deviceId: "device-resume",
    token: "secret-resume",
    status: "deleting",
    deletion: { status: "deleting", retryable: true, phase: "timers", message: "Synthetic pending cleanup" }
  };
  await page.evaluate(async ({ model, push }) => {
    await writeIndexedValue("app-data", model);
    await writeIndexedValue("push-identity", push);
  }, { model: state, push: identity });

  let deleteRequests = 0;
  await page.route("**/api/install/delete", async (route) => {
    deleteRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "deleted" })
    });
  });
  await page.addInitScript(() => {
    globalThis.__LIFECYCLE_TEST_ONLINE__ = false;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => globalThis.__LIFECYCLE_TEST_ONLINE__ });
  });
  await page.reload();
  await page.waitForLoadState("load");
  await expect.poll(() => page.evaluate(() => pushIdentity?.status || "missing")).toBe("deleting");
  expect(deleteRequests).toBe(0);

  await page.evaluate(() => {
    globalThis.__LIFECYCLE_TEST_ONLINE__ = true;
    window.dispatchEvent(new Event("online"));
  });
  await expect.poll(() => deleteRequests, { timeout: 15_000 }).toBe(1);
  await expect.poll(() => page.evaluate(async () => {
    const stored = await readIndexedValue("push-identity");
    return { status: stored?.status || "", token: stored?.token || "" };
  }), { timeout: 15_000 }).toEqual({ status: "deleted", token: "" });
});

test("failed identity persistence survives a null IndexedDB recovery and resumes deletion online", async ({ page }) => {
  const pending = {
    installationId: "installation-fallback-null",
    deviceId: "device-fallback-null",
    token: "fallback-null-secret",
    status: "deleting",
    registeredAt: "2026-07-14T10:00:00.000Z",
    deletion: {
      status: "deleting",
      retryable: true,
      phase: "timers",
      updatedAt: "2026-07-14T12:00:00.000Z",
      message: "Synthetic fallback cleanup"
    }
  };
  const setup = await page.evaluate(async ({ identity, identityKey }) => {
    const originalWrite = writeIndexedValue;
    pushIdentity = structuredClone(identity);
    writeIndexedValue = async (key, value) => {
      if (key === "push-identity") throw new Error("Synthetic IndexedDB write failure");
      return originalWrite(key, value);
    };
    const persisted = await persistPushIdentity();
    const fallbackAfterFailure = JSON.parse(localStorage.getItem(identityKey) || "null");
    writeIndexedValue = originalWrite;
    await originalWrite("push-identity", null);
    return { persisted, fallbackAfterFailure };
  }, { identity: pending, identityKey: "comprehensive-fitness-installation-v1" });
  expect(setup.persisted).toBe(true);
  expect(setup.fallbackAfterFailure).toEqual(pending);

  await page.addInitScript(() => {
    globalThis.__CF_IDENTITY_TEST_ONLINE__ = false;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => globalThis.__CF_IDENTITY_TEST_ONLINE__ });
  });
  const requests = [];
  await page.route("**/api/install/delete", async (route) => {
    requests.push({
      authorization: route.request().headers().authorization || "",
      body: route.request().postDataJSON()
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "deleted" }) });
  });
  await page.reload();
  await page.waitForLoadState("load");

  const recovered = await page.evaluate(async (identityKey) => ({
    runtime: structuredClone(pushIdentity),
    indexed: await readIndexedValue("push-identity"),
    fallback: localStorage.getItem(identityKey)
  }), "comprehensive-fitness-installation-v1");
  expect(recovered.runtime).toEqual(pending);
  expect(recovered.indexed).toEqual(pending);
  expect(recovered.fallback).toBeNull();
  expect(requests).toHaveLength(0);

  await page.evaluate(() => {
    globalThis.__CF_IDENTITY_TEST_ONLINE__ = true;
    window.dispatchEvent(new Event("online"));
  });
  await expect.poll(() => requests.length, { timeout: 15_000 }).toBe(1);
  expect(requests[0]).toEqual({
    authorization: "Bearer fallback-null-secret",
    body: { installationId: "installation-fallback-null" }
  });
  await expect.poll(() => page.evaluate(async () => {
    const stored = await readIndexedValue("push-identity");
    return { installationId: stored?.installationId || "", status: stored?.status || "", token: stored?.token || "" };
  }), { timeout: 15_000 }).toEqual({ installationId: "installation-fallback-null", status: "deleted", token: "" });
});

test("newer pending fallback defeats an older IndexedDB identity and boot resumes with the retained bearer", async ({ page }) => {
  const pending = {
    installationId: "installation-fallback-older",
    deviceId: "device-fallback-older",
    token: "fallback-older-secret",
    status: "deleting",
    deletion: {
      status: "error",
      retryable: true,
      phase: "workouts",
      updatedAt: "2026-07-14T13:00:00.000Z",
      message: "Synthetic interrupted cleanup"
    }
  };
  const olderIndexed = {
    installationId: "installation-generated-too-early",
    deviceId: "device-generated-too-early",
    token: "",
    status: "disabled",
    updatedAt: "2026-07-14T09:00:00.000Z"
  };
  await page.evaluate(async ({ fallback, indexed, identityKey }) => {
    const originalWrite = writeIndexedValue;
    pushIdentity = structuredClone(fallback);
    writeIndexedValue = async (key, value) => {
      if (key === "push-identity") throw new Error("Synthetic IndexedDB write failure");
      return originalWrite(key, value);
    };
    await persistPushIdentity();
    writeIndexedValue = originalWrite;
    await originalWrite("push-identity", indexed);
    if (!localStorage.getItem(identityKey)) throw new Error("Fallback journal was not retained.");
  }, { fallback: pending, indexed: olderIndexed, identityKey: "comprehensive-fitness-installation-v1" });

  let releaseDeletion;
  let markDeletionStarted;
  const deletionStarted = new Promise((resolve) => { markDeletionStarted = resolve; });
  const requests = [];
  await page.route("**/api/install/delete", async (route) => {
    requests.push({
      authorization: route.request().headers().authorization || "",
      body: route.request().postDataJSON()
    });
    markDeletionStarted();
    await new Promise((resolve) => { releaseDeletion = resolve; });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "deleted" }) });
  });
  await page.reload();
  await page.waitForLoadState("load");
  await deletionStarted;

  const duringResume = await page.evaluate(async (identityKey) => ({
    runtime: structuredClone(pushIdentity),
    indexed: await readIndexedValue("push-identity"),
    fallback: localStorage.getItem(identityKey)
  }), "comprehensive-fitness-installation-v1");
  expect(duringResume.runtime).toEqual(pending);
  expect(duringResume.indexed).toEqual(pending);
  expect(duringResume.fallback).toBeNull();
  expect(requests).toEqual([{ authorization: "Bearer fallback-older-secret", body: { installationId: "installation-fallback-older" } }]);
  releaseDeletion();
  await expect.poll(() => page.evaluate(() => pushIdentity?.status || ""), { timeout: 15_000 }).toBe("deleted");
});

test("newer terminal deletion for the same installation defeats a stale pending fallback", async ({ page }) => {
  const terminal = {
    installationId: "installation-same-terminal",
    deviceId: "device-same-terminal",
    token: "",
    status: "deleted",
    deletion: {
      status: "deleted",
      retryable: false,
      completedAt: "2026-07-14T16:00:00.000Z",
      message: "Synthetic confirmed deletion"
    }
  };
  const stalePending = {
    installationId: "installation-same-terminal",
    deviceId: "device-same-terminal",
    token: "stale-pending-secret",
    status: "deleting",
    deletion: {
      status: "deleting",
      retryable: true,
      updatedAt: "2026-07-14T15:00:00.000Z",
      message: "Synthetic stale pending deletion"
    }
  };
  let deleteRequests = 0;
  await page.route("**/api/install/delete", async (route) => {
    deleteRequests += 1;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Terminal state must not resume." }) });
  });
  await page.evaluate(async ({ current, stale, identityKey }) => {
    await writeIndexedValue("push-identity", current);
    localStorage.setItem(identityKey, JSON.stringify(stale));
  }, { current: terminal, stale: stalePending, identityKey: "comprehensive-fitness-installation-v1" });
  await page.reload();
  await page.waitForLoadState("load");

  const selected = await page.evaluate(async (identityKey) => ({
    runtime: structuredClone(pushIdentity),
    indexed: await readIndexedValue("push-identity"),
    fallback: localStorage.getItem(identityKey)
  }), "comprehensive-fitness-installation-v1");
  expect(selected.runtime).toEqual(terminal);
  expect(selected.indexed).toEqual(terminal);
  expect(selected.fallback).toBeNull();
  await page.waitForTimeout(250);
  expect(deleteRequests).toBe(0);
});

test("ordinary active identity deterministically wins a weaker stale fallback", async ({ page }) => {
  const indexed = {
    installationId: "installation-ordinary-active",
    deviceId: "device-ordinary-active",
    token: "ordinary-active-secret",
    status: "enabled",
    registeredAt: "2026-07-14T14:00:00.000Z"
  };
  const staleFallback = {
    installationId: "installation-ordinary-stale",
    deviceId: "device-ordinary-stale",
    token: "",
    status: "disabled",
    updatedAt: "2026-07-13T14:00:00.000Z"
  };
  await page.evaluate(async ({ current, stale, identityKey }) => {
    await writeIndexedValue("push-identity", current);
    localStorage.setItem(identityKey, JSON.stringify(stale));
  }, { current: indexed, stale: staleFallback, identityKey: "comprehensive-fitness-installation-v1" });
  await page.reload();
  await page.waitForLoadState("load");

  const selected = await page.evaluate(async (identityKey) => ({
    runtime: structuredClone(pushIdentity),
    indexed: await readIndexedValue("push-identity"),
    fallback: localStorage.getItem(identityKey)
  }), "comprehensive-fitness-installation-v1");
  expect(selected.runtime).toEqual(indexed);
  expect(selected.indexed).toEqual(indexed);
  expect(selected.fallback).toBeNull();
});

test("cancel-before-schedule reconciles authoritative IDs, persists ambiguous cancellation, and suppresses either push ID by version", async ({ page }) => {
  const state = validFullState();
  const result = await page.evaluate(async (model) => {
    data = structuredClone(model);
    data.settings.timerNotifications = true;
    pushIdentity = { installationId: "installation-timer", deviceId: "device-timer", token: "timer-secret", status: "enabled" };
    activeWorkoutId = model.sessions[0].id;
    timer = null;
    restSchedulePromises.clear();
    canceledRestScheduleKeys.clear();
    pushOperationWriteChain = Promise.resolve();
    Object.defineProperty(Notification, "permission", { configurable: true, value: "granted" });
    const snapshot = {
      id: "client-timer",
      version: 7,
      workoutId: model.sessions[0].id,
      exerciseId: model.exercises[0].id,
      setId: model.sets[0].id,
      pendingNextSetId: "",
      endsAt: Date.now() + 60_000
    };

    let releaseSchedule;
    let markScheduleStarted;
    const scheduleStarted = new Promise((resolve) => { markScheduleStarted = resolve; });
    const cancelRequests = [];
    pushApi = async (path, body) => {
      if (path === "/api/push/schedule") {
        markScheduleStarted();
        return new Promise((resolve) => { releaseSchedule = resolve; });
      }
      if (path === "/api/push/cancel") {
        cancelRequests.push(structuredClone(body));
        return { status: "canceled" };
      }
      return { status: "ok" };
    };
    const scheduled = scheduleRestPush(snapshot);
    await scheduleStarted;
    const canceled = cancelRestPush(snapshot, "synthetic-race");
    releaseSchedule({ status: "scheduled", notificationId: "server-timer" });
    const successRace = { scheduleResult: await scheduled, cancelResult: await canceled, cancelRequests: structuredClone(cancelRequests) };

    restSchedulePromises.clear();
    canceledRestScheduleKeys.clear();
    pushOperationWriteChain = Promise.resolve();
    const durableWrites = [];
    readIndexedValue = async (key) => key === "push-operations" ? [] : null;
    writeIndexedValue = async (key, value) => { if (key === "push-operations") durableWrites.push(structuredClone(value)); return true; };
    let rejectSchedule;
    let markAmbiguousStarted;
    const ambiguousStarted = new Promise((resolve) => { markAmbiguousStarted = resolve; });
    pushApi = async (path) => {
      if (path === "/api/push/schedule") {
        markAmbiguousStarted();
        return new Promise((resolve, reject) => { rejectSchedule = reject; });
      }
      return { status: "canceled" };
    };
    const ambiguousSnapshot = { ...snapshot, id: "client-ambiguous", version: 8 };
    const ambiguousSchedule = scheduleRestPush(ambiguousSnapshot);
    await ambiguousStarted;
    const ambiguousCancel = cancelRestPush(ambiguousSnapshot, "response-lost");
    rejectSchedule(new TypeError("Synthetic accepted schedule response was lost"));
    const ambiguousRace = { scheduleResult: await ambiguousSchedule, cancelResult: await ambiguousCancel, durableWrites: structuredClone(durableWrites) };

    pushOperationWriteChain = Promise.resolve();
    const authorizationWrites = [];
    readIndexedValue = async (key) => key === "push-operations" ? [] : null;
    writeIndexedValue = async (key, value) => { if (key === "push-operations") authorizationWrites.push(structuredClone(value)); return true; };
    pushApi = async (path) => {
      if (path === "/api/push/cancel") {
        const error = new Error("Synthetic authorization failure");
        error.status = 401;
        throw error;
      }
      return { status: "ok" };
    };
    const authorizationFailure = {
      cancelResult: await cancelRestPush({ ...snapshot, id: "client-auth-failure", version: 9 }, "authorization-lost"),
      durableWrites: structuredClone(authorizationWrites)
    };

    const swSource = await (await fetch("/sw.js", { cache: "no-store" })).text();
    const swModule = { exports: {} };
    const sw = new Function("module", "self", `${swSource}\nreturn module.exports;`)(swModule, undefined);
    const now = Date.now();
    sw.rememberCanceledTimer("client-payload", now, 2);
    const clientMatch = sw.pushPayloadWasCanceled({ notificationId: "server-payload", timerId: "client-payload", timerVersion: 2 }, now + 1);
    const wrongVersion = sw.pushPayloadWasCanceled({ notificationId: "server-payload", timerId: "client-payload", timerVersion: 3 }, now + 1);
    sw.rememberCanceledTimer("server-only", now, 4);
    const serverMatch = sw.pushPayloadWasCanceled({ notificationId: "server-only", timerId: "other-client", timerVersion: 4 }, now + 1);
    sw.rememberCanceledTimer("legacy-v1", now);
    const legacyMatch = sw.pushPayloadWasCanceled({ timerId: "legacy-v1" }, now + 1);
    return { successRace, ambiguousRace, authorizationFailure, sw: { clientMatch, wrongVersion, serverMatch, legacyMatch } };
  }, state);

  expect(result.successRace.scheduleResult).toBe(false);
  expect(result.successRace.cancelResult).toBe(true);
  expect(result.successRace.cancelRequests).toHaveLength(1);
  expect(result.successRace.cancelRequests[0]).toMatchObject({ notificationId: "server-timer", timerVersion: 7 });
  expect(result.ambiguousRace.scheduleResult).toBe(false);
  expect(result.ambiguousRace.cancelResult).toBe(false);
  expect(result.ambiguousRace.durableWrites.at(-1)).toEqual([expect.objectContaining({ notificationId: "client-ambiguous", timerVersion: 8, reason: "canceled-with-ambiguous-schedule-result" })]);
  expect(result.authorizationFailure.cancelResult).toBe(false);
  expect(result.authorizationFailure.durableWrites.at(-1)).toEqual([expect.objectContaining({ notificationId: "client-auth-failure", timerVersion: 9, reason: "authorization-lost" })]);
  expect(result.sw).toEqual({ clientMatch: true, wrongVersion: false, serverMatch: true, legacyMatch: true });
});
