"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRECTORIES = new Set([".git", "artifacts", "node_modules", "DerivedData", "Pods", "build"]);
const TEXT_LIMIT_BYTES = 2 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  "", ".css", ".csv", ".html", ".js", ".json", ".md", ".ps1", ".toml",
  ".txt", ".xml", ".yaml", ".yml"
]);

function normalize(file) {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (entry.isFile()) files.push(normalize(path.relative(ROOT, absolute)));
  }
  return files;
}

function projectFiles() {
  const topLevel = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  const isRepositoryRoot = topLevel.status === 0
    && path.resolve(topLevel.stdout.trim()).toLowerCase() === ROOT.toLowerCase();
  if (isRepositoryRoot) {
    const result = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: ROOT,
      encoding: "utf8"
    });
    if (result.status === 0) return result.stdout.split("\0").filter(Boolean).map(normalize).sort();
  }
  return walk(ROOT).sort();
}

const forbiddenPathRules = [
  { pattern: /(?:^|\/)private-personal-data(?:\/|$)/i, reason: "private personal-data directory" },
  { pattern: /^personal_fitness_data\/(?:raw|normalized|derived|reports)(?:\/|$)/i, reason: "raw, normalized, derived, or report personal fitness data" },
  { pattern: /^personal_fitness_data\/config\/personal_context\.json$/i, reason: "personal context configuration" },
  { pattern: /(?:^|\/)\.env(?:\..+)?$/i, except: /(?:^|\/)\.env\.example$/i, reason: "environment file" },
  { pattern: /\.(?:db|sqlite|sqlite3|realm|bak|backup)$/i, reason: "database or backup artifact" },
  { pattern: /(?:^|\/)(?:credentials?|service[-_.]?account|secrets?|tokens?)(?:[._-]|$)/i, reason: "credential or secret artifact" },
  { pattern: /(?:^|\/)(?:fitness|health|workout|personal)[-_].*(?:backup|export)(?:[._-]|$)/i, reason: "personal-data backup or export" }
];
const forbiddenContentRules = [
  { pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, reason: "private key material" },
  { pattern: /\bsk-proj-[A-Za-z0-9_-]{12,}\b/, reason: "OpenAI project key" },
  { pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][^"'\s]{12,}["']/i, reason: "credential-like assignment" },
  { pattern: /PRIVATE_PERSONAL_DATA_SENTINEL/, reason: "private-data sentinel" }
];

function checkPrivacy() {
  const files = projectFiles();
  const findings = [];

  for (const file of files) {
    for (const rule of forbiddenPathRules) {
      if (rule.pattern.test(file) && !(rule.except && rule.except.test(file))) {
        findings.push(`${file}: ${rule.reason}`);
      }
    }

    if (file === "scripts/check-public-privacy.js") continue;
    const absolute = path.join(ROOT, file);
    let stats;
    try {
      stats = fs.statSync(absolute);
    } catch {
      continue;
    }
    if (stats.size > TEXT_LIMIT_BYTES || !TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    const source = fs.readFileSync(absolute, "utf8");
    for (const rule of forbiddenContentRules) {
      if (rule.pattern.test(source)) findings.push(`${file}: ${rule.reason}`);
    }
  }

  if (findings.length > 0) {
    console.error("Public privacy guard failed:");
    for (const finding of findings) console.error(`- ${finding}`);
    process.exit(1);
  }
  console.log(`Public privacy guard passed (${files.length} tracked/unignored project files checked).`);
}

checkPrivacy();
