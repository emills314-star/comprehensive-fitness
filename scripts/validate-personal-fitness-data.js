"use strict";

const path = require("node:path");
const { validatePersonalFitnessOutputs } = require("./personal-fitness/validator");
const { writeJsonAtomic } = require("./personal-fitness/utils");

async function main() {
  const repositoryRoot = path.resolve(__dirname, "..");
  const report = await validatePersonalFitnessOutputs({ repositoryRoot });
  await writeJsonAtomic(path.join(repositoryRoot, "personal_fitness_data", "reports", "validation_report.json"), report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
