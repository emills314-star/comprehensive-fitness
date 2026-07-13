"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACT_ROOT = path.join(ROOT, "artifacts");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
    windowsHide: true
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed in ${options.cwd || ROOT}\n${result.stdout || ""}${result.stderr || ""}`
  );
  return String(result.stdout || "").trim();
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function assertManifestHashParity(repositoryRoot, label) {
  const researchRoot = path.join(repositoryRoot, "research_database");
  const manifest = JSON.parse(fs.readFileSync(path.join(researchRoot, "exports", "json", "manifest.json"), "utf8"));
  let checked = 0;
  Object.entries(manifest.tables).forEach(([table, entry]) => {
    const files = {
      csv_sha256: path.join(researchRoot, "exports", "csv", `${table}.csv`),
      json_sha256: path.join(researchRoot, "exports", "json", `${table}.json`),
      schema_sha256: path.join(researchRoot, "schema", `${table}.schema.json`)
    };
    Object.entries(files).forEach(([field, file]) => {
      assert.equal(sha256(file), entry[field], `${label}: ${table}.${field} must match the extracted bytes`);
      checked += 1;
    });
  });
  return checked;
}

function assertScienceValidation(repositoryRoot, label) {
  const nodePath = [path.join(ROOT, "node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  const env = { NODE_PATH: nodePath };
  run(process.execPath, ["scripts/test-science-evidence-contracts.js"], { cwd: repositoryRoot, env });
  run(process.execPath, ["scripts/validate-research-database.js"], { cwd: repositoryRoot, env });
  return label;
}

fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
const temporaryRoot = fs.mkdtempSync(path.join(ARTIFACT_ROOT, "research-archive-integrity-"));

try {
  // A clean CI checkout has the committed tree in its index. Using write-tree also
  // lets this contract verify the exact candidate tree before it is committed.
  const candidateTree = run("git", ["write-tree"]);
  const lfArchiveFile = path.join(temporaryRoot, "repository-lf.tar");
  const lfArchiveRoot = path.join(temporaryRoot, "archive-lf");
  const autocrlfArchiveFile = path.join(temporaryRoot, "repository-autocrlf.tar");
  const autocrlfArchiveRoot = path.join(temporaryRoot, "archive-autocrlf");
  const checkoutRoot = path.join(temporaryRoot, "autocrlf-checkout");
  fs.mkdirSync(lfArchiveRoot);
  fs.mkdirSync(autocrlfArchiveRoot);
  fs.mkdirSync(checkoutRoot);

  run("git", [
    "-c", "core.autocrlf=false",
    "archive", "--format=tar", `--output=${lfArchiveFile}`, candidateTree
  ]);
  run("tar", ["-xf", lfArchiveFile, "-C", lfArchiveRoot]);
  const lfArchiveHashCount = assertManifestHashParity(lfArchiveRoot, "core.autocrlf=false git archive");
  assertScienceValidation(lfArchiveRoot, "core.autocrlf=false git archive");

  run("git", [
    "-c", "core.autocrlf=true",
    "-c", "core.eol=crlf",
    "archive", "--format=tar", `--output=${autocrlfArchiveFile}`, candidateTree
  ]);
  run("tar", ["-xf", autocrlfArchiveFile, "-C", autocrlfArchiveRoot]);
  const autocrlfArchiveHashCount = assertManifestHashParity(autocrlfArchiveRoot, "core.autocrlf=true git archive");
  assertScienceValidation(autocrlfArchiveRoot, "core.autocrlf=true git archive");

  const temporaryIndex = path.join(temporaryRoot, "autocrlf.index");
  const checkoutEnvironment = { GIT_INDEX_FILE: temporaryIndex };
  const gitCheckoutArgs = ["-c", "core.autocrlf=true", "-c", "core.eol=crlf", `--work-tree=${checkoutRoot}`];
  run("git", [...gitCheckoutArgs, "read-tree", candidateTree], { env: checkoutEnvironment });
  run("git", [...gitCheckoutArgs, "checkout-index", "--all", "--force"], { env: checkoutEnvironment });
  const checkoutHashCount = assertManifestHashParity(checkoutRoot, "core.autocrlf=true checkout");
  assertScienceValidation(checkoutRoot, "core.autocrlf=true checkout");

  assert.equal(autocrlfArchiveHashCount, lfArchiveHashCount, "LF and autocrlf archives must verify the same manifest surface");
  assert.equal(checkoutHashCount, lfArchiveHashCount, "Archive and checkout must verify the same manifest surface");
  console.log(`Research archive integrity passed (${lfArchiveHashCount} manifest hashes; LF archive, autocrlf archive, and autocrlf checkout validated).`);
  console.log(`Platform: ${os.platform()} ${os.release()}`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
