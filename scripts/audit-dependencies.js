"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SEVERITIES = ["info", "low", "moderate", "high", "critical"];

function vulnerabilityCounts(report) {
  const values = report?.metadata?.vulnerabilities;
  if (!values) throw new Error("npm audit returned no vulnerability metadata");
  return Object.fromEntries([...SEVERITIES, "total"].map((severity) => [severity, Number(values[severity] || 0)]));
}

function runAudit(options = {}) {
  const bundledNpmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const npmCli = process.env.npm_execpath || (fs.existsSync(bundledNpmCli) ? bundledNpmCli : null);
  const executable = npmCli ? process.execPath : "npm";
  const args = npmCli
    ? [npmCli, "audit", "--json", ...(options.productionOnly ? ["--omit=dev"] : [])]
    : ["audit", "--json", ...(options.productionOnly ? ["--omit=dev"] : [])];
  const result = spawnSync(executable, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw result.error;
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`npm audit did not return valid JSON (exit ${result.status}): ${result.stderr || error.message}`);
  }
  vulnerabilityCounts(report);
  return report;
}

function evaluateFullAudit(fullReport, productionReport) {
  const full = vulnerabilityCounts(fullReport);
  const production = vulnerabilityCounts(productionReport);
  const developmentModerate = Math.max(0, full.moderate - production.moderate);
  const productionNames = new Set(Object.keys(productionReport.vulnerabilities || {}));
  const developmentModerateNames = Object.entries(fullReport.vulnerabilities || {})
    .filter(([name, finding]) => finding?.severity === "moderate" && !productionNames.has(name))
    .map(([name]) => name)
    .sort();
  const errors = [];
  if (full.high || full.critical) errors.push(`full dependency tree has ${full.high} high and ${full.critical} critical vulnerabilities`);
  return { full, production, developmentModerate, developmentModerateNames, errors };
}

function evaluateProductionAudit(productionReport) {
  const production = vulnerabilityCounts(productionReport);
  const errors = production.total ? [`production dependency tree has ${production.total} vulnerabilities across all severities`] : [];
  return { production, errors };
}

function formatCounts(counts) {
  return SEVERITIES.map((severity) => `${severity}=${counts[severity]}`).join(", ");
}

function main(mode) {
  if (mode === "full") {
    const result = evaluateFullAudit(runAudit(), runAudit({ productionOnly: true }));
    console.log(`Full dependency audit: ${formatCounts(result.full)}.`);
    console.log(`Production subset observed during full audit: ${formatCounts(result.production)}.`);
    console.log(`Moderate development-only findings: ${result.developmentModerate}. These are reported but do not fail the full-tree high/critical gate.`);
    if (result.developmentModerateNames.length) console.log(`Moderate development-only packages: ${result.developmentModerateNames.join(", ")}.`);
    if (result.errors.length) throw new Error(result.errors.join("; "));
    console.log("Full dependency audit gate passed (no high or critical vulnerabilities)." );
    return;
  }
  if (mode === "production") {
    const result = evaluateProductionAudit(runAudit({ productionOnly: true }));
    console.log(`Production dependency audit: ${formatCounts(result.production)}.`);
    if (result.errors.length) throw new Error(result.errors.join("; "));
    console.log("Production dependency audit gate passed (no vulnerabilities at any severity)." );
    return;
  }
  throw new Error(`Unknown dependency audit mode ${mode || "(missing)"}; expected full or production.`);
}

if (require.main === module) {
  try {
    main(process.argv[2]);
  } catch (error) {
    console.error(`Dependency audit failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { SEVERITIES, vulnerabilityCounts, runAudit, evaluateFullAudit, evaluateProductionAudit, formatCounts, main };
