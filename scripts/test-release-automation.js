"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(__dirname, "fixtures", "release-automation", "workflows");
const privacy = require("./check-public-privacy.js");
const workflows = require("./validate-workflows.js");
const audits = require("./audit-dependencies.js");

assert.equal(typeof privacy.projectFiles, "function", "privacy guard must expose deterministic file discovery for self-tests");
assert.equal(typeof privacy.findPrivacyIssues, "function", "privacy guard must expose deterministic scanning for self-tests");

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cf-release-gates-"));
try {
  fs.mkdirSync(path.join(temporary, "artifacts", "release", "certificates"), { recursive: true });
  fs.mkdirSync(path.join(temporary, "resources"), { recursive: true });
  fs.mkdirSync(path.join(temporary, "node_modules", "safe-tool"), { recursive: true });
  fs.writeFileSync(path.join(temporary, "resources", "tokens.css"), ":root { --space-token: 1rem; }\n");
  fs.writeFileSync(path.join(temporary, "artifacts", "release", "certificates", "deploy.pem"), "certificate fixture\n");
  fs.writeFileSync(path.join(temporary, "artifacts", "release", "private-material.txt"), [["-----BEGIN ", "PRIVATE KEY-----"].join(""), "fixture", ["-----END ", "PRIVATE KEY-----"].join("")].join("\n"));
  fs.writeFileSync(path.join(temporary, "artifacts", "release", "configuration.txt"), `${["client", "secret"].join("_")} = "${"x".repeat(20)}"\n`);
  fs.writeFileSync(path.join(temporary, "node_modules", "safe-tool", "ignored.pem"), "tool fixture\n");

  const gitFiles = privacy.projectFiles({
    root: temporary,
    runGit(args) {
      if (args[0] === "rev-parse") return { status: 0, stdout: `${temporary}\n` };
      if (args[0] === "ls-files") return { status: 0, stdout: "artifacts/release/certificates/deploy.pem\0resources/tokens.css\0" };
      return { status: 1, stdout: "" };
    }
  });
  assert(gitFiles.includes("artifacts/release/certificates/deploy.pem"), "git discovery must never blanket-skip tracked artifacts");
  assert(!gitFiles.includes("node_modules/safe-tool/ignored.pem"), "git discovery must use the tracked/unignored file list supplied by Git");

  const archiveFiles = privacy.projectFiles({ root: temporary, runGit: () => ({ status: 1, stdout: "" }) });
  assert(archiveFiles.includes("artifacts/release/certificates/deploy.pem"), "archive fallback must scan artifacts");
  assert(!archiveFiles.some((file) => file.startsWith("node_modules/")), "archive fallback may skip explicitly safe install directories");

  const negative = privacy.findPrivacyIssues(temporary, [
    "artifacts/release/certificates/deploy.pem",
    "artifacts/release/private-material.txt",
    "artifacts/release/configuration.txt"
  ]);
  assert(negative.some((issue) => /key or certificate artifact|certificate path/i.test(issue)), "certificate-path fixture must fail privacy scanning");
  assert(negative.some((issue) => /private key material/i.test(issue)), "private-key content must fail privacy scanning outside a key path");
  assert(negative.some((issue) => /credential-like assignment/i.test(issue)), "credential content must fail privacy scanning outside a credential path");
  assert.deepEqual(privacy.findPrivacyIssues(temporary, ["resources/tokens.css"]), [], "harmless design tokens.css must not be treated as a credential path");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

const validInline = workflows.validateWorkflowFile(path.join(FIXTURES, "valid-inline.yml"));
assert.deepEqual(validInline, [], `normalized inline workflow should pass:\n${validInline.join("\n")}`);

const pullTarget = workflows.validateWorkflowFile(path.join(FIXTURES, "pull-request-target-inline.yml"));
assert(pullTarget.some((error) => /pull_request_target/.test(error)), "inline trigger list must not bypass pull_request_target rejection");

const jobWrite = workflows.validateWorkflowFile(path.join(FIXTURES, "job-write-inline.yml"));
assert(jobWrite.some((error) => /write permission/.test(error)), "inline job permissions must not bypass write-permission rejection");

const stringFalse = workflows.validateWorkflowFile(path.join(FIXTURES, "checkout-string-false.yml"));
assert(stringFalse.some((error) => /persist-credentials/.test(error)), "quoted false must not satisfy literal checkout credential disabling");

const mixedCaseCheckout = workflows.validateWorkflowFile(path.join(FIXTURES, "checkout-mixed-case-missing-persist.yml"));
assert(mixedCaseCheckout.some((error) => /persist-credentials/.test(error)), "mixed-case actions/checkout identity must not bypass credential disabling");

const mixedCaseSetupNode = workflows.validateWorkflowFile(path.join(FIXTURES, "setup-node-mixed-case-unpinned-version.yml"));
assert(mixedCaseSetupNode.some((error) => /pinned Node\.js/.test(error)), "mixed-case actions/setup-node identity must not bypass the exact Node.js pin");

const validCaseSensitiveReferences = workflows.validateWorkflowFile(path.join(FIXTURES, "valid-case-sensitive-references.yml"));
assert.deepEqual(validCaseSensitiveReferences, [], `local paths and unrelated action references must retain their original case:\n${validCaseSensitiveReferences.join("\n")}`);

const invalidActionUrl = workflows.validateWorkflowFile(path.join(FIXTURES, "invalid-action-url.yml"));
assert(invalidActionUrl.some((error) => /owner\/repository|URL/i.test(error)), "URL-shaped uses references must not bypass owner/repository action identity checks");

const auditReport = (counts) => ({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...counts } } });
assert.equal(audits.evaluateFullAudit(auditReport({ moderate: 2, total: 2 }), auditReport({})).errors.length, 0, "moderate dev-only findings must be reported without weakening the high/critical full-tree threshold");
assert.equal(audits.evaluateFullAudit(auditReport({ high: 1, total: 1 }), auditReport({})).errors.length, 1, "full-tree high vulnerabilities must fail");
assert.equal(audits.evaluateProductionAudit(auditReport({ low: 1, total: 1 })).errors.length, 1, "every production vulnerability severity must fail");

const packageData = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
assert.equal(packageData.packageManager, "npm@10.9.8", "packageManager must match the npm bundled with the pinned Node 22 release");
assert.equal(packageData.engines.node, "22.23.x");
assert.equal(fs.readFileSync(path.join(ROOT, ".nvmrc"), "utf8").trim(), "22.23.1");
assert.equal(fs.readFileSync(path.join(ROOT, ".node-version"), "utf8").trim(), "22.23.1");
assert.equal(packageData.devDependencies.yaml, "2.9.0", "semantic YAML parser must remain exact-pinned");

console.log("Release automation negative/positive fixtures passed (26 focused privacy, workflow, audit-threshold, and runtime-pin contracts)." );
