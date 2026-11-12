"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { APPLICATION_RUNTIME_FILES } = require("./read-application-contract-source");

const root = path.resolve(__dirname, "..");
const element = { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
const context = {
  console, URL, URLSearchParams, TextEncoder, TextDecoder, structuredClone,
  navigator: { onLine: false },
  document: { getElementById: (id) => id === "root" ? element : null, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], documentElement: { removeAttribute() {} } },
  location: { hostname: "synthetic.invalid", hash: "#today", search: "", href: "https://synthetic.invalid/#today" },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, addEventListener() {},
  requestAnimationFrame: () => 0, history: { state: null }, performance: { now: () => 0 },
  crypto: { randomUUID: () => "synthetic-routine-id" }
};
context.window = context;
vm.createContext(context);
// Real ordered application sources and dependencies; only automatic browser boot
// is suppressed. Import preparation, classification, and strict validation run.
for (const file of ["prescription-engine.js", "exception-resolver.js", "coach-engine.js", "loaded-bar.js", "backup-contract.js", ...APPLICATION_RUNTIME_FILES]) {
  let source = fs.readFileSync(path.join(root, file), "utf8");
  if (file === "app.js") source = source.replace(/\n\s+boot\(\);/, "\n// Test owns startup.");
  vm.runInContext(source, context, { filename: file });
}
const run = (source) => vm.runInContext(source, context);
const plain = (value) => JSON.parse(JSON.stringify(value));

function csv(rpe, includeRpe = true) {
  const headers = ["Date", "Workout Name", "Duration", "Exercise Name", "Set Order", "Weight", "Reps", "Distance", "Seconds"];
  const values = ["2026-07-01", "Synthetic RPE Workout", "", "Barbell Bench Press", "1", "100", "5", "", ""];
  if (includeRpe) { headers.push("RPE"); values.push(rpe); }
  return [headers.join(","), values.join(",")].join("\n");
}

const cases = [
  { name: "empty cell", input: "", actual: "", source: "unknown" },
  { name: "whitespace cell", input: " ", actual: "", source: "unknown" },
  { name: "absent column", input: "", includeRpe: false, actual: "", source: "unknown" },
  { name: "decimal", input: "7.5", actual: 7.5, source: "typed" },
  { name: "explicit zero", input: "0", actual: 0, source: "typed" },
  { name: "numeric whitespace", input: " 8 ", actual: 8, source: "typed" },
  { name: "malformed", input: "unknown", actual: "", source: "unknown" },
  { name: "NaN", input: "NaN", actual: "", source: "unknown" },
  { name: "infinite", input: "Infinity", actual: "", source: "unknown" }
];
for (const entry of cases) {
  context.csvText = csv(entry.input, entry.includeRpe);
  const before = plain(run("data"));
  const operation = run("prepareStrongCsvImport(csvText, 'lb', 'synthetic-rpe.csv')");
  const set = operation.candidate.sets[0];
  assert.equal(set.rpe, entry.actual, entry.name + " actual RPE");
  assert.equal(set.rpeSource, entry.source, entry.name + " provenance");
  assert.deepEqual(plain(run("data")), before, "Preparation must not write partial data");
  const exported = context.FitnessBackupContract.createBackupExport(operation.candidate);
  assert.equal(exported.sets[0].rpe, entry.actual, entry.name + " backup RPE");
  assert.equal(exported.sets[0].rpeSource, entry.source, entry.name + " backup provenance");
}
context.csvText = csv("11");
const beforeRejected = plain(run("data"));
assert.throws(() => run("prepareStrongCsvImport(csvText, 'lb', 'invalid-rpe.csv')"), /rpe must be between 0 and 10/i);
assert.deepEqual(plain(run("data")), beforeRejected, "An out-of-range RPE must fail atomically");

console.log("Strong RPE contract passed (9 real importer cases, backup preservation, and atomic range rejection).");
