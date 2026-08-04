"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const prescriptionApi = require("../prescription-engine");
const { APP_SHELL } = require("../sw");

const root = path.resolve(__dirname, "..");
const foundation = fs.readFileSync(path.join(root, "app-foundation.js"), "utf8");
const imports = fs.readFileSync(path.join(root, "app-import.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const syncWeb = fs.readFileSync(path.join(root, "scripts", "sync-web.ps1"), "utf8");
const verifyPwa = fs.readFileSync(path.join(root, "scripts", "verify-pwa.ps1"), "utf8");
const vercelIgnore = fs.readFileSync(path.join(root, ".vercelignore"), "utf8");
const exerciseDatabase = require("../research_database/exports/json/exercise_database.json");
const exerciseMuscleMap = require("../research_database/exports/json/exercise_muscle_map.json");

function functionSource(source, name) {
  const declarations = [];
  const pattern = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = pattern.exec(source))) declarations.push({ name: match[1], index: match.index });
  const index = declarations.findIndex((declaration) => declaration.name === name);
  assert.notEqual(index, -1, `Missing function ${name}`);
  return source.slice(declarations[index].index, declarations[index + 1]?.index || source.length).trim();
}

function installFunctions(context, source, names) {
  vm.createContext(context);
  for (const name of names) vm.runInContext(`${functionSource(source, name)}\nthis.${name} = ${name};`, context, { filename: `${name}.js` });
}

const productionRuntime = [foundation, imports, app].join("\n");
assert.doesNotMatch(productionRuntime, /initializePrescriptionEvidence|loadPrescriptionEvidence|loadEvidenceFromUrls|prescriptionEvidenceStatus/, "Normal runtime must not retain full evidence initialization or its UI status state");
assert.match(app, /await\s+initializeExerciseIdentityCompatibility\s*\(\s*\)/, "Boot must await identity compatibility before rendering");

const requests = [];
const context = {
  exerciseIdentityCatalogPromise: null,
  importValidationResearchPromise: null,
  prescriptionApi,
  prescriptionEngine: prescriptionApi.createPrescriptionEngine({}),
  fetch: async (url) => {
    requests.push(String(url));
    const records = String(url).endsWith("/exercise_database.json") ? exerciseDatabase : exerciseMuscleMap;
    return { ok: true, status: 200, json: async () => records };
  },
  Promise
};
installFunctions(context, foundation, [
  "fetchIdentityCompatibilityRecords",
  "loadExerciseIdentityCatalog",
  "loadImportValidationResearch",
  "installExerciseIdentityCompatibility",
  "initializeExerciseIdentityCompatibility"
]);

(async () => {
  assert.equal(await context.initializeExerciseIdentityCompatibility(), true);
  assert.deepEqual(requests, ["./resources/exercise_database.json"], "Cold boot must fetch only the public exercise identity catalog");
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.prescriptionEngine.resolveExerciseIdentity("Bench Press (Barbell)"))),
    { status: "resolved", exerciseId: "ex_barbell_bench_press", source: "research_alias" },
    "Identity-only boot must retain Strong alias resolution"
  );
  assert.equal(context.prescriptionEngine.evidence.research.exerciseMuscleMap.length, 0, "Normal runtime engine must not contain the import-only relationship map");

  const importResearch = await context.loadImportValidationResearch();
  assert.equal(importResearch.exerciseDatabase.length, exerciseDatabase.length);
  assert.equal(importResearch.exerciseMuscleMap.length, exerciseMuscleMap.length);
  assert.deepEqual(requests, [
    "./resources/exercise_database.json",
    "./resources/exercise_muscle_map.json"
  ], "Import validation must reuse the boot catalog and fetch only the relationship map");

  const researchHelper = functionSource(imports, "researchOnlyBundleForImport");
  const backupImport = functionSource(imports, "importDataFile");
  const applyPendingImport = functionSource(imports, "applyPendingImport");
  assert.match(researchHelper, /await\s+loadImportValidationResearch\s*\(\s*\)/);
  assert.match(backupImport, /preparedEvidence\s*=\s*await\s+researchOnlyBundleForImport/);
  const executableValidationIndex = backupImport.indexOf("validateImportedExecutableRecommendationSnapshots");
  const previewStagingIndex = backupImport.indexOf("pendingImport = {");
  assert.ok(executableValidationIndex !== -1 && previewStagingIndex !== -1 && executableValidationIndex < previewStagingIndex, "Executable compatibility validation must finish before the imported backup is staged for apply");
  assert.doesNotMatch(backupImport, /writeIndexedValuesAtomically|writeIndexedValue\s*\(\s*["']app-data["']/, "Selecting a backup file must stage a validated preview without a durable write");
  assert.match(applyPendingImport, /const\s+operation\s*=\s*pendingImport[\s\S]*writeIndexedValuesAtomically\s*\(\s*writes\s*\)/, "Only explicit Apply may atomically persist the staged import candidate");
  assert.doesNotMatch(imports, /personalEvidenceBundleForImport|importPersonalEvidenceFile/, "The removed personal-evidence import path must not survive as dormant runtime code");
  assert.doesNotMatch(imports, /prescriptionEngine\s*=\s*prepared\.engine/, "Import-only analytical evidence must not become a second runtime source of truth");

  const researchShellAssets = APP_SHELL.filter((asset) => (
    asset === "/resources/exercise_database.json" ||
    asset === "/resources/exercise_muscle_map.json"
  ));
  assert.deepEqual(researchShellAssets, [
    "/resources/exercise_database.json",
    "/resources/exercise_muscle_map.json"
  ], "The offline shell must contain only identity and legacy-snapshot validation JSON");

  const copiedResearchAssets = [...syncWeb.matchAll(/Source = "research_database\\exports\\json\\([^"]+)"; Destination = "resources\\([^"]+)"/g)]
    .map((match) => ({ source: match[1], destination: match[2] }));
  assert.deepEqual(copiedResearchAssets, [
    { source: "exercise_database.json", destination: "exercise_database.json" },
    { source: "exercise_muscle_map.json", destination: "exercise_muscle_map.json" }
  ], "Web sync must materialize only the two compatibility assets under the public resources boundary");
  const verifiedPublicList = verifyPwa.slice(verifyPwa.indexOf("$publicFiles = @("), verifyPwa.indexOf("$compatibilityAssets = @("));
  const verifiedResearchAssets = [...verifiedPublicList.matchAll(/"resources\\(exercise_[^"]+\.json)"/g)].map((match) => match[1]);
  assert.deepEqual(verifiedResearchAssets, ["exercise_database.json", "exercise_muscle_map.json"], "PWA verification must require only the two compatibility assets");
  assert.match(verifyPwa, /Public compatibility asset differs from its canonical source/, "PWA verification must enforce canonical-to-public byte parity");
  assert.match(verifyPwa, /Obsolete analytical runtime asset remains packaged/, "PWA verification must reject stale analytical JSON left by an older package");
  assert.deepEqual(
    fs.readFileSync(path.join(root, "resources", "exercise_database.json")),
    fs.readFileSync(path.join(root, "research_database", "exports", "json", "exercise_database.json")),
    "The public exercise database must be byte-identical to its canonical source"
  );
  assert.deepEqual(
    fs.readFileSync(path.join(root, "resources", "exercise_muscle_map.json")),
    fs.readFileSync(path.join(root, "research_database", "exports", "json", "exercise_muscle_map.json")),
    "The public muscle map must be byte-identical to its canonical source"
  );
  const vercelIgnoreLines = vercelIgnore.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const deployedResearchRules = vercelIgnoreLines.filter((line) => (
    line === "**/exports/**" || line.includes("research_database/exports")
  ));
  assert.deepEqual(deployedResearchRules, ["**/exports/**"], "Vercel packaging must exclude every export tree without runtime exceptions");

  console.log("M4 identity-only boot and import compatibility tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
