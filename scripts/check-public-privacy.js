"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TEXT_LIMIT_BYTES = 2 * 1024 * 1024;
const SAFE_INSTALL_DIRECTORY_NAMES = new Set([".git", ".npm", ".pnpm-store", "node_modules", "Pods", "DerivedData"]);
const SAFE_INSTALL_DIRECTORY_PATHS = new Set([".yarn/cache", ".yarn/unplugged"]);

function normalize(file) {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isSafeInstallDirectory(relative) {
  const normalized = normalize(relative).replace(/\/$/, "");
  const segments = normalized.split("/");
  return segments.some((segment) => SAFE_INSTALL_DIRECTORY_NAMES.has(segment))
    || [...SAFE_INSTALL_DIRECTORY_PATHS].some((safe) => normalized === safe || normalized.startsWith(`${safe}/`));
}

function walk(directory, root, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = normalize(path.relative(root, absolute));
    if (entry.isDirectory()) {
      if (!isSafeInstallDirectory(relative)) walk(absolute, root, files);
    } else if (entry.isFile() || entry.isSymbolicLink()) files.push(relative);
  }
  return files;
}

function defaultRunGit(args, root) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

function projectFiles(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const runGit = options.runGit || ((args) => defaultRunGit(args, root));
  const topLevel = runGit(["rev-parse", "--show-toplevel"]);
  const isRepositoryRoot = topLevel?.status === 0
    && path.resolve(String(topLevel.stdout || "").trim()).toLowerCase() === root.toLowerCase();
  if (isRepositoryRoot) {
    const result = runGit(["ls-files", "-z"]);
    if (result?.status === 0) {
      return String(result.stdout || "").split("\0").filter(Boolean).map(normalize).sort();
    }
  }
  return walk(root, root).sort();
}

const forbiddenPathRules = [
  { pattern: /(?:^|\/)private-personal-data(?:\/|$)/i, reason: "private personal-data directory" },
  { pattern: /^personal_fitness_data\/(?:raw|normalized|derived|reports)(?:\/|$)/i, reason: "raw, normalized, derived, or report personal fitness data" },
  { pattern: /^personal_fitness_data\/config\/personal_context\.json$/i, reason: "personal context configuration" },
  { pattern: /(?:^|\/)\.env(?:\..+)?$/i, except: /(?:^|\/)\.env\.example$/i, reason: "environment file" },
  { pattern: /\.(?:db|sqlite|sqlite3|realm|bak|backup)$/i, reason: "database or backup artifact" },
  { pattern: /\.(?:pem|key|p12|pfx|crt|cer)$/i, reason: "key or certificate artifact" },
  { pattern: /(?:^|\/)(?:certs?|certificates?|keys?)(?:\/|$)/i, reason: "key or certificate path" },
  { pattern: /(?:^|\/)(?:credentials?|service[-_.]?account|secrets?)(?:[._-][^/]*)?$/i, reason: "credential or secret artifact" },
  { pattern: /(?:^|\/)(?:fitness|health|workout|personal)[-_].*(?:backup|export)(?:[._-]|$)/i, reason: "personal-data backup or export" }
];

const privateSentinel = ["PRIVATE", "PERSONAL", "DATA", "SENTINEL"].join("_");
const forbiddenContentRules = [
  { pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/, reason: "private key material" },
  { pattern: /\bsk-proj-[A-Za-z0-9_-]{12,}\b/, reason: "OpenAI project key" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, reason: "AWS access key" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b/, reason: "GitHub credential" },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/, reason: "Slack credential" },
  { pattern: /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*["'][^"'\s]{12,}["']/i, reason: "credential-like assignment" },
  { pattern: new RegExp(privateSentinel), reason: "private-data sentinel" }
];

function findPrivacyIssues(root, files) {
  const resolvedRoot = path.resolve(root);
  const findings = new Set();

  for (const rawFile of files) {
    const file = normalize(rawFile);
    for (const rule of forbiddenPathRules) {
      if (rule.pattern.test(file) && !(rule.except && rule.except.test(file))) findings.add(`${file}: ${rule.reason}`);
    }

    const absolute = path.resolve(resolvedRoot, file);
    if (!absolute.toLowerCase().startsWith(`${resolvedRoot.toLowerCase()}${path.sep}`) && absolute.toLowerCase() !== resolvedRoot.toLowerCase()) {
      findings.add(`${file}: path escapes the project root`);
      continue;
    }
    let stats;
    try {
      stats = fs.lstatSync(absolute);
    } catch {
      continue;
    }
    if (!stats.isFile() || stats.size > TEXT_LIMIT_BYTES) continue;
    const source = fs.readFileSync(absolute, "utf8");
    for (const rule of forbiddenContentRules) {
      if (rule.pattern.test(source)) findings.add(`${file}: ${rule.reason}`);
    }
  }

  return [...findings].sort();
}

function checkPrivacy(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const files = options.files || projectFiles({ ...options, root });
  const findings = findPrivacyIssues(root, files);
  return { root, files, findings };
}

if (require.main === module) {
  const result = checkPrivacy();
  if (result.findings.length > 0) {
    console.error("Public privacy guard failed:");
    result.findings.forEach((finding) => console.error(`- ${finding}`));
    process.exit(1);
  }
  console.log(`Public privacy guard passed (${result.files.length} tracked Git or archive project files checked).`);
}

module.exports = {
  SAFE_INSTALL_DIRECTORY_NAMES,
  SAFE_INSTALL_DIRECTORY_PATHS,
  forbiddenPathRules,
  forbiddenContentRules,
  normalize,
  projectFiles,
  findPrivacyIssues,
  checkPrivacy
};
