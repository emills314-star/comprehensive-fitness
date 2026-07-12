"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const REQUIRED_PRIVATE_ARTIFACTS = [
  "personal_fitness_data/derived/exercise_scores.csv",
  "personal_fitness_data/derived/exercise_prescriptions.json",
  "personal_fitness_data/reports/analysis_metadata.json"
];
const PRIVATE_TESTS = [
  "scripts/validate-personal-fitness-data.js",
  "scripts/test-personal-fitness-data.js",
  "scripts/test-prescription-engine.js",
  "scripts/test-prescription-app-integration.js"
];

const missing = REQUIRED_PRIVATE_ARTIFACTS.filter((relative) => !fs.existsSync(path.join(ROOT, relative)));
if (missing.length) {
  console.error("Private test gate was explicitly requested, but local ignored personal artifacts are unavailable:");
  missing.forEach((relative) => console.error(`- ${relative}`));
  console.error("Run the authorized local personal-data build first. Never copy these artifacts into a public checkout or CI artifact.");
  process.exit(1);
}

for (const relative of PRIVATE_TESTS) {
  console.log(`\nPRIVATE TEST ${relative}`);
  const result = spawnSync(process.execPath, [relative], { cwd: ROOT, stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`\nPrivate local test gate passed (${PRIVATE_TESTS.length}/${PRIVATE_TESTS.length}).`);
