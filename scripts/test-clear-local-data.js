"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "app-workout.js"), "utf8");

function functionSource(name) {
  const declarations = [];
  const pattern = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = pattern.exec(source))) declarations.push({ name: match[1], index: match.index });
  const index = declarations.findIndex((declaration) => declaration.name === name);
  assert.notEqual(index, -1, `Missing function ${name}`);
  return source.slice(declarations[index].index, declarations[index + 1]?.index || source.length).trim();
}

function installFunction(context, name) {
  vm.runInContext(`${functionSource(name)}\nthis.${name} = ${name};`, context, { filename: `app-workout.js#${name}` });
}

function createStorage(failureKey = "") {
  const records = new Map([
    ["app-data", "app-data-sentinel"],
    ["runtime", "runtime-sentinel"],
    ["active-draft", "active-draft-sentinel"],
    ["identity", "identity-sentinel"]
  ]);
  const removalAttempts = [];
  return {
    records,
    removalAttempts,
    getItem(key) {
      return records.has(key) ? records.get(key) : null;
    },
    removeItem(key) {
      removalAttempts.push(key);
      if (key === failureKey) throw new Error(`Injected removeItem failure for ${key}`);
      records.delete(key);
    }
  };
}

function createClearHarness({ localStorageFailureKey = "" } = {}) {
  const storage = createStorage(localStorageFailureKey);
  const deleteRequests = [];
  const toasts = [];
  let renders = 0;
  const context = vm.createContext({
    ACTIVE_DRAFT_KEY: "active-draft",
    DB_NAME: "fitness-db",
    IDENTITY_KEY: "identity",
    RUNTIME_KEY: "runtime",
    STORAGE_KEY: "app-data",
    activeSessionId: "original-session",
    activeSetAcknowledged: true,
    activeSetId: "original-set",
    activeSetNotice: "original-notice",
    activeWorkoutId: "original-workout",
    appDataPersistenceConflict: { kind: "preserved-alternate" },
    applyTheme() {},
    caches: { keys: async () => [] },
    cancelPendingDataSave() {},
    cancelRestPush: async () => true,
    cancelWorkoutFlow: { open: true },
    clearDataFlow: {
      open: true,
      acknowledged: true,
      phrase: "CLEAR",
      unsynced: { workoutCount: 1, setChanges: 2 }
    },
    createSession: () => ({ id: "fresh-session" }),
    data: {
      sessions: [{ id: "original-session" }],
      exercises: [{ id: "original-exercise" }],
      sets: [{ id: "original-set" }],
      templates: [{ id: "original-template" }]
    },
    deleteRemoteInstallationData: async () => ({ status: "deleted" }),
    draftSaveTimer: 17,
    emptyData: () => ({ sessions: [], exercises: [], sets: [], templates: [] }),
    exportText: "original-export",
    indexedDB: {
      deleteDatabase(name) {
        assert.equal(name, "fitness-db");
        const request = {};
        deleteRequests.push(request);
        return request;
      }
    },
    localClearBlockReason: () => "",
    localStorage: storage,
    navigator: {
      onLine: true,
      serviceWorker: { getRegistration: async () => null }
    },
    pendingNextSetId: "original-next-set",
    persistenceReady: true,
    pushIdentity: null,
    releaseTimerWakeLock() {},
    render() { renders += 1; },
    saveRuntime() { return true; },
    setActiveTab() {},
    settingsMessage: "original-message",
    showAppToast(message) { toasts.push(message); },
    templateNumericDrafts: new Map([["sentinel", true]]),
    templateStartFlow: { open: true },
    timer: null,
    timerInterval: 0,
    window: {
      clearInterval() {},
      clearTimeout() {}
    },
    writeIndexedValue: async () => true
  });
  installFunction(context, "deleteFitnessDatabase");
  installFunction(context, "permanentlyClearLocalData");
  return {
    context,
    deleteRequests,
    get renders() { return renders; },
    storage,
    toasts
  };
}

async function waitFor(predicate, failureMessage) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail(failureMessage);
}

async function testBlockedDeleteRemainsPendingThenSucceeds() {
  const harness = createClearHarness();
  const originalData = harness.context.data;
  let settled = false;
  const clearPromise = harness.context.permanentlyClearLocalData();
  clearPromise.then(() => { settled = true; }, () => { settled = true; });
  await waitFor(() => harness.deleteRequests.length === 1, "Clear did not reach the injected IndexedDB delete request");

  harness.deleteRequests[0].onblocked();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(settled, false, "IndexedDB blocked must not settle the confirmed clear");
  assert.equal(harness.context.clearDataFlow.pending, true, "The sheet must stay in its non-cancelable pending state while the delete is queued");
  assert.match(harness.context.clearDataFlow.pendingMessage, /remains queued and will continue automatically/i);
  assert.strictEqual(harness.context.data, originalData, "Queued deletion must not reset in-memory workout data early");
  assert.deepEqual(harness.toasts, [], "Queued deletion must not announce success");

  harness.deleteRequests[0].onsuccess();
  assert.equal(await clearPromise, true);
  assert.deepEqual(harness.toasts, ["Local app data cleared."], "Only terminal IndexedDB success may announce completion");
  assert.equal(harness.context.clearDataFlow, null);
  assert.equal(harness.context.data.sessions[0].id, "fresh-session");
  assert.equal(harness.storage.records.size, 0, "Every old app-owned localStorage key must be absent before success");
}

async function testPerKeyLocalStorageFailureStopsBeforeIndexedDb() {
  const harness = createClearHarness({ localStorageFailureKey: "runtime" });
  const originalData = harness.context.data;
  const result = await harness.context.permanentlyClearLocalData();

  assert.equal(result, false);
  assert.deepEqual(
    harness.storage.removalAttempts,
    ["app-data", "runtime", "active-draft", "identity"],
    "A removeItem failure must not skip independent cleanup attempts for later app-owned keys"
  );
  assert.deepEqual([...harness.storage.records.keys()], ["runtime"], "The injected failed key must remain observable after verification");
  assert.equal(harness.deleteRequests.length, 0, "IndexedDB must be preserved when any app-owned localStorage key remains");
  assert.strictEqual(harness.context.data, originalData, "A partial localStorage mutation must not reset in-memory workout data");
  assert.equal(harness.context.clearDataFlow.pending, false);
  assert.match(harness.context.clearDataFlow.blockedMessage, /3 app-owned browser records were removed, but 1 could not be removed or verified/i);
  assert.match(harness.context.clearDataFlow.blockedMessage, /workout database was kept so its records remain recoverable/i);
  assert.deepEqual(harness.toasts, [], "Partial cleanup must never announce success");
}

async function testTerminalIndexedDbErrorReportsPartialCleanup() {
  const harness = createClearHarness();
  const originalData = harness.context.data;
  const clearPromise = harness.context.permanentlyClearLocalData();
  await waitFor(() => harness.deleteRequests.length === 1, "Clear did not reach the injected terminal-error request");
  harness.deleteRequests[0].error = new Error("Injected terminal IndexedDB failure");
  harness.deleteRequests[0].onerror();

  assert.equal(await clearPromise, false);
  assert.strictEqual(harness.context.data, originalData, "Terminal database failure must preserve the still-recoverable workout database state");
  assert.equal(harness.context.clearDataFlow.pending, false);
  assert.match(harness.context.clearDataFlow.blockedMessage, /Local clearing is incomplete/i);
  assert.match(harness.context.clearDataFlow.blockedMessage, /4 app-owned browser records were removed, but the workout database could not be deleted/i);
  assert.deepEqual(harness.toasts, [], "Terminal database failure must not announce success");
}

const clearSheetSource = functionSource("renderClearDataSheet");
assert.doesNotMatch(
  clearSheetSource,
  /research database|research source|research record|source-record count|evidence record/i,
  "The clear-data sheet must not expose deleted research/source-record inventory copy"
);
assert.match(functionSource("closeClearDataFlow"), /clearDataFlow\?\.pending[\s\S]*return false/, "A queued confirmed clear must not be dismissible");

(async () => {
  await testBlockedDeleteRemainsPendingThenSucceeds();
  await testPerKeyLocalStorageFailureStopsBeforeIndexedDb();
  await testTerminalIndexedDbErrorReportsPartialCleanup();
  console.log("Clear-local-data tests passed (queued IndexedDB deletion, per-key verification, and terminal failure truthfulness).");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
