"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const WORKFLOW_DIR = path.join(ROOT, ".github", "workflows");

function listWorkflowFiles(directory = WORKFLOW_DIR) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function validateWorkflowFile(file) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(ROOT, file).replaceAll(path.sep, "/");
  const errors = [];

  if (/\t/.test(source)) errors.push("contains a tab; YAML indentation must use spaces");
  if (/^(?:<{7}|={7}|>{7})/m.test(source)) errors.push("contains an unresolved merge marker");
  if (!/^name:\s*\S+/m.test(source)) errors.push("is missing a workflow name");
  if (!/^["']?on["']?:\s*(?:\S.*)?$/m.test(source)) errors.push("is missing an on trigger");
  if (!/^jobs:\s*$/m.test(source)) errors.push("is missing jobs");
  if (/^\s*pull_request_target:\s*$/m.test(source)) errors.push("uses pull_request_target, which is prohibited for this public CI surface");
  if (!/^permissions:\s*\r?\n\s{2}contents:\s*read\s*$/m.test(source)) {
    errors.push("must declare workflow-level least permissions with contents: read");
  }
  if (/^\s{0,8}(?:contents|actions|checks|deployments|id-token|issues|packages|pages|pull-requests|security-events|statuses):\s*write\s*$/m.test(source)) {
    errors.push("requests a write permission");
  }

  for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+).*$/gm)) {
    const reference = match[1];
    if (reference.startsWith("./")) continue;
    const at = reference.lastIndexOf("@");
    const revision = at >= 0 ? reference.slice(at + 1) : "";
    if (!/^[0-9a-f]{40}$/.test(revision)) {
      errors.push(`external action is not pinned to a lowercase 40-character commit SHA: ${reference}`);
    }
  }

  const checkoutSteps = [...source.matchAll(/^\s*-\s+uses:\s+actions\/checkout@[0-9a-f]{40}.*?(?=^\s*-\s+(?:name:|uses:|run:)|\Z)/gms)];
  for (const checkout of checkoutSteps) {
    if (!/^\s+persist-credentials:\s*false\s*$/m.test(checkout[0])) {
      errors.push("checkout must set persist-credentials: false");
    }
  }

  if (/actions\/setup-node@/.test(source) && !/^\s+node-version:\s*["']?22["']?\s*$/m.test(source)) {
    errors.push("setup-node must use Node.js 22 consistently");
  }

  return errors.map((message) => `${relative}: ${message}`);
}

function validateWorkflows() {
  const files = listWorkflowFiles();
  if (files.length === 0) return [".github/workflows: no workflow files found"];
  return files.flatMap(validateWorkflowFile);
}

if (require.main === module) {
  const errors = validateWorkflows();
  if (errors.length > 0) {
    console.error("Workflow validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Workflow validation passed (${listWorkflowFiles().length} workflows; external actions pinned; least permissions checked).`);
}

module.exports = { listWorkflowFiles, validateWorkflowFile, validateWorkflows };
