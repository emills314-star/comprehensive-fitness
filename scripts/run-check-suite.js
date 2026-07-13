"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SUITES = Object.freeze({
  public: ["lint", "check:workflows", "check:privacy", "audit:dependencies:full", "audit:dependencies:production", "test:public", "research:validate", "verify:pwa"],
  release: ["check:clean-source", "check:public", "audit:ui"],
  "all-local": ["test:public", "test:private"]
});
const requested = process.argv[2];
const steps = SUITES[requested];

if (!steps) {
  console.error(`Unknown check suite ${requested || "(missing)"}. Expected one of: ${Object.keys(SUITES).join(", ")}.`);
  process.exit(1);
}

console.log(`${requested} verification suite: ${steps.join(" -> ")}`);
for (const script of steps) {
  console.log(`\nCHECK npm run ${script}`);
  const npmCli = process.env.npm_execpath;
  const executable = npmCli ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
  const args = npmCli ? [npmCli, "run", script] : ["run", script];
  const result = spawnSync(executable, args, { cwd: ROOT, stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`\n${requested} verification suite passed.`);
