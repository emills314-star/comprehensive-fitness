const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

function loadTypescript(relativePath, dependencies = {}) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
    throw new Error(`Unexpected runtime import ${specifier} in ${relativePath}`);
  };
  vm.runInNewContext(`(function (exports, module, require) { ${output}\n})(module.exports, module, require);`, { module, require: localRequire }, { filename });
  return module.exports;
}

const typesModule = loadTypescript("redesign/src/types.ts");
const { capabilityIds } = typesModule;
const { concepts, backendTotal, experienceTotal, compositeScore, structuralDifferenceCount } = loadTypescript("redesign/src/concepts.ts", { "./types": typesModule });

assert.equal(concepts.length, 15, "exactly 15 concepts are required");
assert.equal(new Set(concepts.map((concept) => concept.id)).size, 15, "concept ids must be unique");
assert.deepEqual(Array.from(concepts, (concept) => concept.rank), Array.from({ length: 15 }, (_, index) => index + 1), "concepts must remain rank ordered");

for (const concept of concepts) {
  assert.equal(Object.keys(concept.dimensions).length, 7, `${concept.name} must define all structural dimensions`);
  assert.deepEqual(Object.keys(concept.capabilityFit).sort(), [...capabilityIds].sort(), `${concept.name} must classify every capability`);
  assert.ok(backendTotal(concept) >= 0 && backendTotal(concept) <= 100, `${concept.name} backend score is out of range`);
  assert.ok(experienceTotal(concept) >= 0 && experienceTotal(concept) <= 100, `${concept.name} experience score is out of range`);
  assert.equal(compositeScore(concept), Number((experienceTotal(concept) * 0.6 + backendTotal(concept) * 0.4).toFixed(1)), `${concept.name} composite formula changed`);
}

let pairCount = 0;
let minimumDifference = 7;
for (let left = 0; left < concepts.length; left += 1) {
  for (let right = left + 1; right < concepts.length; right += 1) {
    const difference = structuralDifferenceCount(concepts[left], concepts[right]);
    minimumDifference = Math.min(minimumDifference, difference);
    assert.ok(difference >= 4, `${concepts[left].name} and ${concepts[right].name} differ in only ${difference} dimensions`);
    pairCount += 1;
  }
}

assert.equal(pairCount, 105, "15 concepts should produce 105 pairwise audits");
assert.deepEqual(Array.from(concepts.slice(0, 3), (concept) => concept.name), ["Dual Track", "Bento Studio", "Set Stack"], "approved finalists changed");
assert.equal(concepts[0].name, "Dual Track", "recommended winner changed");

const publicSources = [
  "redesign/src/fixtures.ts",
  "redesign/src/concepts.ts",
  "docs/design/COMPLETE_REDESIGN_CONCEPTS.md",
  "docs/design/REDESIGN_MIGRATION_BLUEPRINT.md",
].filter((file) => fs.existsSync(path.join(root, file)));
for (const file of publicSources) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  assert.doesNotMatch(text, /personal_fitness_data|private-personal-data|www\/private/i, `${file} references a private-data location`);
}

console.log(`PASS redesign contracts: 15 concepts, ${pairCount} pairs, minimum ${minimumDifference} structural differences, ${capabilityIds.length} classified capabilities each.`);
