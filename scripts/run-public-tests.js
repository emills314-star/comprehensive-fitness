"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SCRIPTS = path.join(ROOT, "scripts");
const NON_PUBLIC_TESTS = new Map([
  ["test-personal-fitness-data.js", { label: "PRIVATE-ONLY", reason: "requires ignored normalized/derived personal pipeline artifacts" }]
]);

const discovered = fs.readdirSync(SCRIPTS, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^test-.*\.js$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const publicTests = discovered.filter((name) => !NON_PUBLIC_TESTS.has(name));

if (!publicTests.length) {
  console.error("Public test discovery found no dependency-free test scripts.");
  process.exit(1);
}

console.log(`Public test discovery: ${discovered.length} found; ${publicTests.length} selected; ${discovered.length - publicTests.length} private-only harness excluded.`);
for (const [name, exclusion] of NON_PUBLIC_TESTS) {
  if (discovered.includes(name)) console.log(`${exclusion.label} ${name}: ${exclusion.reason}.`);
}

const failures = [];
for (const name of publicTests) {
  const relative = path.join("scripts", name);
  console.log(`\nPUBLIC TEST ${relative}`);
  const result = spawnSync(process.execPath, [relative], {
    cwd: ROOT,
    env: { ...process.env, CF_PUBLIC_CHECKOUT: "1" },
    stdio: "inherit"
  });
  if (result.error) failures.push(`${name}: ${result.error.message}`);
  else if (result.status !== 0) failures.push(`${name}: exit ${result.status}`);
}

if (failures.length) {
  console.error(`\nPublic test gate failed (${failures.length}/${publicTests.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`\nPublic test gate passed (${publicTests.length}/${publicTests.length} selected scripts; ${discovered.length} discovered).`);
