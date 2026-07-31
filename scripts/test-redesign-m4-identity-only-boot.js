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
  assert.deepEqual(requests, ["./research_database/exports/json/exercise_database.json"], "Cold boot must fetch only the exercise identity catalog");
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
    "./research_database/exports/json/exercise_database.json",
    "./research_database/exports/json/exercise_muscle_map.json"
  ], "Import validation must reuse the boot catalog and fetch only the relationship map");

  const personalHelper = functionSource(imports, "personalEvidenceBundleForImport");
  const researchHelper = functionSource(imports, "researchOnlyBundleForImport");
  const backupImport = functionSource(imports, "importDataFile");
  const personalImport = functionSource(imports, "importPersonalEvidenceFile");
  assert.match(personalHelper, /await\s+loadImportValidationResearch\s*\(\s*\)/);
  assert.match(researchHelper, /await\s+loadImportValidationResearch\s*\(\s*\)/);
  assert.match(backupImport, /preparedEvidence\s*=\s*await\s+personalEvidenceBundleForImport/);
  assert.match(backupImport, /preparedEvidence\s*=\s*await\s+researchOnlyBundleForImport/);
  assert.ok(backupImport.indexOf("validateImportedExecutableRecommendationSnapshots") < backupImport.indexOf('writeIndexedValue("app-data"'), "Executable compatibility validation must finish before the imported backup is written");
  assert.match(personalImport, /const prepared = await personalEvidenceBundleForImport/);
  assert.ok(personalImport.indexOf("personalEvidenceBundleForImport") < personalImport.indexOf('writeIndexedValue("app-data"'), "Personal evidence validation must finish before its package is written");
  assert.doesNotMatch(imports, /prescriptionEngine\s*=\s*prepared\.engine/, "Import-only analytical evidence must not become a second runtime source of truth");

  const researchShellAssets = APP_SHELL.filter((asset) => asset.startsWith("/research_database/exports/json/"));
  assert.deepEqual(researchShellAssets, [
    "/research_database/exports/json/exercise_database.json",
    "/research_database/exports/json/exercise_muscle_map.json"
  ], "The offline shell must contain only identity and legacy-snapshot validation JSON");

  const copiedResearchAssets = [...syncWeb.matchAll(/Source = "research_database\\exports\\json\\([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(copiedResearchAssets, ["exercise_database.json", "exercise_muscle_map.json"], "Web sync must package only the two compatibility assets");
  const verifiedPublicList = verifyPwa.slice(verifyPwa.indexOf("$publicFiles = @("), verifyPwa.indexOf("$obsoleteAnalyticalJson = @("));
  const verifiedResearchAssets = [...verifiedPublicList.matchAll(/"research_database\\exports\\json\\([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(verifiedResearchAssets, ["exercise_database.json", "exercise_muscle_map.json"], "PWA verification must require only the two compatibility assets");
  assert.match(verifyPwa, /Obsolete analytical runtime asset remains packaged/, "PWA verification must reject stale analytical JSON left by an older package");

  console.log("M4 identity-only boot and import compatibility tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
