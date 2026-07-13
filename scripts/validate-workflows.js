"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseDocument } = require("yaml");

const ROOT = path.resolve(__dirname, "..");
const WORKFLOW_DIR = path.join(ROOT, ".github", "workflows");
const EXTERNAL_ACTION_SHA = /^[0-9a-f]{40}$/;
const PINNED_NODE_VERSION = "22.23.1";

function listWorkflowFiles(directory = WORKFLOW_DIR) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function isMapping(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizedTriggers(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(normalizedTriggers);
  if (isMapping(value)) return Object.keys(value);
  return [];
}

function validatePermissions(value, location, options = {}) {
  const errors = [];
  if (typeof value === "string") {
    const permission = value.toLowerCase();
    if (permission === "write-all" || permission.includes("write")) errors.push(`${location} requests a write permission`);
    else if (options.requireContentsRead && permission !== "read-all") errors.push(`${location} must explicitly grant contents: read or read-all`);
    return errors;
  }
  if (!isMapping(value)) {
    errors.push(`${location} must be a permission mapping or read-all`);
    return errors;
  }
  for (const [scope, rawLevel] of Object.entries(value)) {
    const level = String(rawLevel).toLowerCase();
    if (level === "write" || level === "write-all" || level.includes("write")) errors.push(`${location}.${scope} requests a write permission`);
    else if (!new Set(["read", "none"]).has(level)) errors.push(`${location}.${scope} has an unsupported permission level ${JSON.stringify(rawLevel)}`);
  }
  if (options.requireContentsRead && String(value.contents || "").toLowerCase() !== "read") errors.push(`${location} must declare contents: read`);
  return errors;
}

function collectUses(value, location = "workflow", records = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectUses(entry, `${location}[${index}]`, records));
    return records;
  }
  if (!isMapping(value)) return records;
  for (const [key, child] of Object.entries(value)) {
    if (key === "uses") records.push({ location: `${location}.uses`, value: child, step: value });
    collectUses(child, `${location}.${key}`, records);
  }
  return records;
}

function parseActionReference(reference) {
  if (reference.startsWith("./")) return { kind: "local", reference };
  const at = reference.lastIndexOf("@");
  const actionPath = at >= 0 ? reference.slice(0, at) : reference;
  const revision = at >= 0 ? reference.slice(at + 1) : "";
  const segments = actionPath.split("/");
  const validRepositoryPath = !actionPath.includes("://")
    && segments.length >= 2
    && Boolean(segments[0])
    && Boolean(segments[1]);
  return {
    kind: "external",
    reference,
    revision,
    validRepositoryPath,
    repositoryIdentity: validRepositoryPath
      ? `${segments[0].toLowerCase()}/${segments[1].toLowerCase()}`
      : null
  };
}

function validateWorkflowObject(workflow, relative) {
  const errors = [];
  if (!isMapping(workflow)) return [`${relative}: workflow root must be a mapping`];
  if (typeof workflow.name !== "string" || !workflow.name.trim()) errors.push(`${relative}: is missing a workflow name`);
  if (!Object.prototype.hasOwnProperty.call(workflow, "on")) errors.push(`${relative}: is missing an on trigger`);
  const triggers = normalizedTriggers(workflow.on).map((trigger) => String(trigger).toLowerCase());
  if (!triggers.length) errors.push(`${relative}: on must contain at least one trigger`);
  if (triggers.includes("pull_request_target")) errors.push(`${relative}: uses pull_request_target, which is prohibited for this public CI surface`);
  if (!isMapping(workflow.jobs) || !Object.keys(workflow.jobs).length) errors.push(`${relative}: is missing jobs`);

  if (!Object.prototype.hasOwnProperty.call(workflow, "permissions")) errors.push(`${relative}: must declare workflow-level least permissions with contents: read`);
  else errors.push(...validatePermissions(workflow.permissions, `${relative}: workflow permissions`, { requireContentsRead: true }));

  if (isMapping(workflow.jobs)) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (!isMapping(job)) {
        errors.push(`${relative}: jobs.${jobName} must be a mapping`);
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(job, "permissions")) errors.push(...validatePermissions(job.permissions, `${relative}: jobs.${jobName}.permissions`));
    }
  }

  for (const record of collectUses(workflow)) {
    if (typeof record.value !== "string") {
      errors.push(`${relative}: ${record.location} must be a literal string`);
      continue;
    }
    const reference = record.value;
    const action = parseActionReference(reference);
    if (action.kind === "external") {
      if (!action.validRepositoryPath) errors.push(`${relative}: external uses reference must use owner/repository[/path]@sha syntax; URL references are not allowed: ${reference}`);
      if (!EXTERNAL_ACTION_SHA.test(action.revision)) errors.push(`${relative}: external action is not pinned to a lowercase 40-character commit SHA: ${reference}`);
    }
    if (action.repositoryIdentity === "actions/checkout") {
      const withOptions = record.step.with;
      if (!isMapping(withOptions) || withOptions["persist-credentials"] !== false) errors.push(`${relative}: checkout must set literal persist-credentials: false`);
    }
    if (action.repositoryIdentity === "actions/setup-node") {
      const withOptions = record.step.with;
      if (!isMapping(withOptions) || String(withOptions["node-version"]) !== PINNED_NODE_VERSION) errors.push(`${relative}: setup-node must use pinned Node.js ${PINNED_NODE_VERSION} consistently`);
    }
  }

  return errors;
}

function validateWorkflowSource(source, relative = "workflow.yml") {
  const preflight = [];
  if (/\t/.test(source)) preflight.push(`${relative}: contains a tab; YAML indentation must use spaces`);
  if (/^(?:<{7}|={7}|>{7})/m.test(source)) preflight.push(`${relative}: contains an unresolved merge marker`);
  if (preflight.length) return preflight;

  const document = parseDocument(source, {
    prettyErrors: false,
    uniqueKeys: true,
    merge: true,
    maxAliasCount: 100
  });
  if (document.errors.length) return document.errors.map((error) => `${relative}: invalid YAML (${error.message})`);
  let workflow;
  try {
    workflow = document.toJS({ maxAliasCount: 100 });
  } catch (error) {
    return [`${relative}: YAML normalization failed (${error.message})`];
  }
  return validateWorkflowObject(workflow, relative);
}

function validateWorkflowFile(file) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(ROOT, file).replaceAll(path.sep, "/");
  return validateWorkflowSource(source, relative);
}

function validateWorkflows(directory = WORKFLOW_DIR) {
  const files = listWorkflowFiles(directory);
  if (files.length === 0) return [".github/workflows: no workflow files found"];
  return files.flatMap(validateWorkflowFile);
}

if (require.main === module) {
  const errors = validateWorkflows();
  if (errors.length > 0) {
    console.error("Workflow validation failed:");
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }
  console.log(`Workflow validation passed (${listWorkflowFiles().length} workflows; semantic YAML, pinned actions, literal checkout credential disabling, and read-only permissions checked).`);
}

module.exports = {
  listWorkflowFiles,
  PINNED_NODE_VERSION,
  normalizedTriggers,
  validatePermissions,
  parseActionReference,
  validateWorkflowObject,
  validateWorkflowSource,
  validateWorkflowFile,
  validateWorkflows
};
