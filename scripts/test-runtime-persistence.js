"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "app-foundation.js"), "utf8");

function functionSource(name) {
  const declarations = [];
  const pattern = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = pattern.exec(source))) declarations.push({ name: match[1], index: match.index });
  const index = declarations.findIndex((declaration) => declaration.name === name);
  assert.notEqual(index, -1, `Missing function ${name}`);
  return source.slice(declarations[index].index, declarations[index + 1]?.index || source.length).trim();
}

async function restoreWith({ indexedRuntime, indexedError = null, localRuntime }) {
  const localReads = [];
  const sandbox = {
    RUNTIME_KEY: "comprehensive-fitness-runtime-v1",
    readIndexedValue: async () => {
      if (indexedError) throw indexedError;
      return indexedRuntime;
    },
    localStorage: {
      getItem(key) {
        localReads.push(key);
        return localRuntime === undefined ? null : JSON.stringify(localRuntime);
      }
    },
    data: {
      sessions: [
        { id: "indexed-session" },
        { id: "fallback-session" }
      ],
      sets: [],
      settings: {}
    },
    activeSessionId: "indexed-session",
    activeWorkoutId: "",
    activeSetId: "",
    activeSetAcknowledged: false,
    activeSetNotice: "",
    pendingNextSetId: "",
    timerCompleteNotice: null,
    restCompletionState: null,
    restCompletionController: null,
    restNavigationState: null,
    timer: null,
    isSessionSubmitted: () => false,
    id: () => "generated-id",
    setRestNavigationState: () => undefined,
    startTimerInterval: () => undefined,
    completeTimer: () => undefined,
    window: { setTimeout: () => undefined }
  };
  vm.createContext(sandbox);
  vm.runInContext(`${functionSource("restoreRuntime")}\nthis.restoreRuntime = restoreRuntime;`, sandbox, { filename: "app-foundation.js#restoreRuntime" });
  await sandbox.restoreRuntime();
  return { sandbox, localReads };
}

(async () => {
  const fallback = {
    activeSessionId: "fallback-session",
    activeWorkoutId: "fallback-session"
  };

  const missingRecord = await restoreWith({ indexedRuntime: null, localRuntime: fallback });
  assert.equal(missingRecord.sandbox.activeSessionId, "fallback-session", "A successful IndexedDB read with no runtime record must restore the failed-write local fallback");
  assert.equal(missingRecord.sandbox.activeWorkoutId, "fallback-session", "The local fallback must restore the active workout after a missing IndexedDB record");
  assert.deepEqual(missingRecord.localReads, ["comprehensive-fitness-runtime-v1"], "The missing-record path must inspect the runtime fallback exactly once");

  const failedRead = await restoreWith({ indexedRuntime: null, indexedError: new Error("synthetic read failure"), localRuntime: fallback });
  assert.equal(failedRead.sandbox.activeSessionId, "fallback-session", "An IndexedDB read failure must continue to restore the local runtime fallback");

  const indexed = await restoreWith({
    indexedRuntime: { activeSessionId: "indexed-session", activeWorkoutId: "indexed-session" },
    localRuntime: fallback
  });
  assert.equal(indexed.sandbox.activeSessionId, "indexed-session", "A present IndexedDB runtime remains authoritative");
  assert.deepEqual(indexed.localReads, [], "A present IndexedDB runtime must not read a stale local fallback");

  console.log("Runtime persistence fallback tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
