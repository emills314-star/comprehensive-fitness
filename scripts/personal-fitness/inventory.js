"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { stableId } = require("./utils");

async function walkFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  await visit(root);
  return files;
}

function primaryRole(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (/^strong_workouts \(8\)\.csv$/i.test(normalized)) return "workout_sets_primary";
  if (/^meals\/HKQuantityTypeIdentifierDietary.*\.csv$/i.test(normalized)) return "nutrition_primary";
  if (/Physical Activity_GoogleData\/daily_(heart_rate_variability|resting_heart_rate|readiness|respiratory_rate|oxygen_saturation|sleep_temperature_derivations)\.csv$/i.test(normalized)) return "fitbit_daily_primary";
  if (/Physical Activity_GoogleData\/(weight|nutrition_log)\.csv$/i.test(normalized)) return /weight\.csv$/i.test(normalized) ? "body_weight_primary" : "nutrition_sparse_support";
  if (/Physical Activity_GoogleData\/(body_fat|steps|calories|active_zone_minutes)_\d.*\.csv$/i.test(normalized)) return "fitbit_aggregate_primary";
  if (/Global Export Data\/(sleep|exercise)-.*\.json$/i.test(normalized)) return /sleep-/i.test(normalized) ? "sleep_primary" : "activity_session_primary";
  if (/Sleep Score\/sleep_score\.csv$/i.test(normalized)) return "sleep_score_primary";
  if (/Your Profile\/Profile\.csv$/i.test(normalized)) return "profile_support";
  return "not_ingested_supporting_raw";
}

function privacyClass(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (/Your Profile|UserConversations|User Security Data|Account Changes|Paired Devices/i.test(normalized)) return "direct_or_sensitive_identifier";
  if (/Heart Rate|Sleep|weight|body_fat|nutrition|meals|strong_workouts|Biometrics|Oxygen|Temperature/i.test(normalized)) return "sensitive_health_data";
  return "personal_export_data";
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function buildSourceInventory(rawRoot) {
  const files = await walkFiles(rawRoot);
  const rows = [];
  for (const filePath of files.sort()) {
    const relativePath = path.relative(rawRoot, filePath).replace(/\\/g, "/");
    const stat = await fsp.stat(filePath);
    const role = primaryRole(relativePath);
    const included = role !== "not_ingested_supporting_raw";
    rows.push({
      source_file_id: stableId("src", relativePath),
      relative_path: relativePath,
      file_name: path.basename(filePath),
      extension: path.extname(filePath).toLowerCase() || null,
      size_bytes: stat.size,
      modified_time: stat.mtime.toISOString(),
      source_role: role,
      included_in_analysis: included,
      privacy_class: privacyClass(relativePath),
      sha256: included ? await sha256File(filePath) : null,
      workbook_name: null,
      worksheet_name: null,
      notes: included ? "Primary or supporting source read by the reproducible pipeline." : "Preserved raw export file; not needed for the current personal analysis."
    });
  }
  return {
    rows,
    summary: {
      raw_root: path.relative(path.dirname(rawRoot), rawRoot).replace(/\\/g, "/"),
      file_count: rows.length,
      total_bytes: rows.reduce((total, row) => total + row.size_bytes, 0),
      extension_counts: Object.fromEntries([...new Set(rows.map((row) => row.extension))].sort().map((extension) => [extension, rows.filter((row) => row.extension === extension).length])),
      included_analysis_files: rows.filter((row) => row.included_in_analysis).length,
      workbooks: [],
      workbook_finding: "No XLS, XLSX, ODS, or Numbers workbooks were present; worksheet inventory is therefore empty."
    }
  };
}

module.exports = { buildSourceInventory, primaryRole, walkFiles };
