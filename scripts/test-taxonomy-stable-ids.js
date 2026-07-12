"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const database = require("../research_database/source/database");
const fixture = require("./fixtures/taxonomy-v2.0.0-stable-id-contract.json");

const EXPECTED_BASELINE_COMMIT = "5edcd4b9040f03cae6a0d9618084f52b4a92b316";
const EXPECTED_HISTORICAL_ROW_COUNT = 1756;
const EXPECTED_TABLES = [
  "exercise_muscle_map",
  "exercise_progression_metric_map",
  "study_exercise_map",
  "rule_exercise_map"
];

function numericSuffix(value) {
  const match = String(value).match(/(\d+)$/);
  assert.ok(match, `Expected a numeric persistent-ID suffix: ${value}`);
  return Number(match[1]);
}

function semanticDigest(row, fields) {
  const values = fields.map((field) => {
    assert.ok(Object.prototype.hasOwnProperty.call(row, field), `Current row is missing original field ${field}`);
    return row[field];
  });
  return crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

assert.equal(fixture.fixture_schema, "taxonomy-stable-id-contract/1.0.0");
assert.equal(fixture.baseline.database_version, "2.0.0");
assert.equal(fixture.baseline.source_commit, EXPECTED_BASELINE_COMMIT);
assert.equal(fixture.baseline.source_kind, "public generated research export");
assert.deepEqual(fixture.baseline.excluded_mutable_fields, ["taxonomy_version"]);
assert.equal(fixture.baseline.historical_row_count, EXPECTED_HISTORICAL_ROW_COUNT);
assert.deepEqual(Object.keys(fixture.tables), EXPECTED_TABLES);

let comparedRows = 0;
for (const table of EXPECTED_TABLES) {
  const contract = fixture.tables[table];
  const target = database.data[table];
  const idField = contract.id_field;
  const baselineIds = Object.keys(contract.row_digests);
  const targetById = new Map(target.map((row) => [row[idField], row]));

  assert.equal(targetById.size, target.length, `${table} persistent IDs must be unique`);
  assert.equal(baselineIds.length, contract.baseline_count, `${table} fixture count must match its digest contract`);
  assert.deepEqual(
    contract.original_fields,
    contract.baseline_fields.filter((field) => !fixture.baseline.excluded_mutable_fields.includes(field)),
    `${table} original fields may exclude only the declared mutable version field`
  );
  assert.equal(
    Math.max(...baselineIds.map(numericSuffix)),
    contract.baseline_max_numeric_suffix,
    `${table} baseline maximum must be derived from its historical IDs`
  );

  for (const historicalId of baselineIds) {
    const currentRow = targetById.get(historicalId);
    assert.ok(currentRow, `${table} must retain ${historicalId}`);
    assert.equal(
      semanticDigest(currentRow, contract.original_fields),
      contract.row_digests[historicalId],
      `${table}.${historicalId} must retain its 2.0.0 ID-to-semantic-field identity`
    );
  }

  const historicalIds = new Set(baselineIds);
  const additions = target.filter((row) => !historicalIds.has(row[idField]));
  assert.ok(additions.length > 0, `${table} should append the 2.1.0 cable-woodchop relationships`);
  additions.forEach((row) => {
    assert.ok(
      numericSuffix(row[idField]) > contract.baseline_max_numeric_suffix,
      `${table}.${row[idField]} must append after the 2.0.0 ID range`
    );
    assert.equal(
      row.exercise_id,
      contract.allowed_append_exercise_id,
      `${table}.${row[idField]} may only add the declared 2.1.0 exercise`
    );
  });
  comparedRows += baselineIds.length;
}

assert.equal(comparedRows, fixture.baseline.historical_row_count, "Fixture total must cover every historical row");

const currentChanges = new Map(database.data.change_log.map((row) => [row.change_id, row]));
for (const [changeId, historicalRecord] of Object.entries(fixture.change_log.historical_records)) {
  assert.deepEqual(currentChanges.get(changeId), historicalRecord, `${changeId} provenance must retain exact 2.0.0 semantics`);
}
assert.deepEqual(
  [...currentChanges.keys()],
  fixture.change_log.expected_current_order,
  "Change history must remain append-only"
);
assert.equal(
  currentChanges.get(fixture.change_log.appended_change_id)?.database_version,
  fixture.change_log.appended_database_version,
  "The programming-family migration must be the declared appended 2.1.0 change"
);

console.log(JSON.stringify({
  passed: true,
  baseline_fixture: "scripts/fixtures/taxonomy-v2.0.0-stable-id-contract.json",
  baseline_source_commit: fixture.baseline.source_commit,
  compared_tables: EXPECTED_TABLES,
  compared_historical_rows: comparedRows,
  historical_change_rows: Object.keys(fixture.change_log.historical_records),
  appended_change_row: fixture.change_log.appended_change_id
}, null, 2));
