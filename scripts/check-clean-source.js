"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

function git(args) {
  return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function main() {
  const gitMetadataExists = fs.existsSync(path.join(ROOT, ".git"));
  if (!gitMetadataExists) {
    console.log("Clean tracked-source check skipped: this is a Git-free source archive." );
    return;
  }
  const topLevel = git(["rev-parse", "--show-toplevel"]);
  if (topLevel.status !== 0) throw new Error(`Git metadata exists but git rev-parse failed: ${topLevel.stderr || topLevel.error?.message || "unknown error"}`);
  if (path.resolve(topLevel.stdout.trim()).toLowerCase() !== ROOT.toLowerCase()) throw new Error("Release verification must run from the repository worktree root.");

  const staged = git(["diff", "--cached", "--quiet", "--exit-code"]);
  if (staged.status !== 0) throw new Error("Tracked staged changes are present; commit the intended release source before release:verify.");
  const unstaged = git(["diff", "--quiet", "--exit-code", "--ignore-space-at-eol"]);
  if (unstaged.status !== 0) throw new Error("Tracked source changes are present; release:verify requires committed source (line-ending-only validation report noise is ignored)." );
  console.log("Clean tracked-source check passed (committed source; no staged or semantic unstaged changes)." );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Clean tracked-source check failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { main };
