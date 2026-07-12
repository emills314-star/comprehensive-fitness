"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const database = require("../research_database/source/database");

const BASELINE_REF = process.env.TAXONOMY_BASELINE_REF || "5edcd4b9040f03cae6a0d9618084f52b4a92b316";
const EXPORT_ROOT = "research_database/exports/json";

function baselineTable(table) {
  try {
    return JSON.parse(execFileSync(
      "git",
      ["show", `${BASELINE_REF}:${EXPORT_ROOT}/${table}.json`],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
    ));
  } catch (error) {
    throw new Error(`Unable to read taxonomy baseline ${BASELINE_REF}:${table}. Set TAXONOMY_BASELINE_REF to the final 2.0.0 commit.\n${error.message}`);
  }
}

function numericSuffix(value) {
  const match = String(value).match(/(\d+)$/);
  assert.ok(match, `Expected a numeric persistent-ID suffix: ${value}`);
  return Number(match[1]);
}

const tableContracts = [
  ["exercise_muscle_map", "exercise_muscle_map_id"],
  ["exercise_progression_metric_map", "exercise_progression_metric_map_id"],
  ["study_exercise_map", "study_exercise_map_id"],
  ["rule_exercise_map", "rule_exercise_map_id"]
];

for (const [table, idField] of tableContracts) {
  const baseline = baselineTable(table);
  const target = database.data[table];
  const baselineById = new Map(baseline.map((row) => [row[idField], row]));
  const targetById = new Map(target.map((row) => [row[idField], row]));
  assert.equal(targetById.size, target.length, `${table} persistent IDs must be unique`);

  baseline.forEach((oldRow) => {
    const currentRow = targetById.get(oldRow[idField]);
    assert.ok(currentRow, `${table} must retain ${oldRow[idField]}`);
    Object.keys(oldRow).filter((field) => field !== "taxonomy_version").forEach((field) => {
      assert.deepEqual(
        currentRow[field],
        oldRow[field],
        `${table}.${oldRow[idField]} must retain its 2.0.0 ${field} identity`
      );
    });
  });

  const baselineMax = Math.max(...baseline.map((row) => numericSuffix(row[idField])));
  const additions = target.filter((row) => !baselineById.has(row[idField]));
  assert.ok(additions.length > 0, `${table} should append the 2.1.0 cable-woodchop relationships`);
  additions.forEach((row) => {
    assert.ok(numericSuffix(row[idField]) > baselineMax, `${table}.${row[idField]} must append after the 2.0.0 ID range`);
    assert.equal(row.exercise_id, "ex_cable_woodchop", `${table}.${row[idField]} may only add the 2.1.0 exercise`);
  });
}

const oldChanges = new Map(baselineTable("change_log").map((row) => [row.change_id, row]));
const currentChanges = new Map(database.data.change_log.map((row) => [row.change_id, row]));
["chg_0002", "chg_0003"].forEach((changeId) => {
  assert.deepEqual(currentChanges.get(changeId), oldChanges.get(changeId), `${changeId} provenance must remain byte-for-byte semantic history`);
});
assert.equal(currentChanges.get("chg_0004")?.database_version, "2.1.0", "The programming-family migration must be a new 2.1.0 change");
assert.deepEqual([...currentChanges.keys()], ["chg_0001", "chg_0002", "chg_0003", "chg_0004"], "Change history must remain append-only");

console.log(JSON.stringify({
  passed: true,
  baseline_ref: BASELINE_REF,
  compared_tables: tableContracts.map(([table]) => table),
  historical_change_rows: ["chg_0002", "chg_0003"],
  appended_change_row: "chg_0004"
}, null, 2));
