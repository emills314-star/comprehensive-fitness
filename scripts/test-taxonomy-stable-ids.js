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
const NEGATIVE_CASES = [
  "persistent ID reuse",
  "2.0 historical-row mutation",
  "unknown future append",
  "misattributed future append",
  "reordered change history",
  "rewritten change history"
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function numericSuffix(value) {
  const match = String(value).match(/(\d+)$/);
  assert.ok(match, `Expected a numeric persistent-ID suffix: ${value}`);
  return Number(match[1]);
}

function splitPipe(value) {
  return String(value || "").split("|").map((entry) => entry.trim()).filter(Boolean);
}

function semanticDigest(row, fields) {
  const values = fields.map((field) => {
    assert.ok(Object.prototype.hasOwnProperty.call(row, field), `Current row is missing contracted field ${field}`);
    return row[field];
  });
  return crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function parseSemver(value) {
  const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)$/);
  assert.ok(match, `Expected a semantic database version: ${value}`);
  return match.slice(1).map(Number);
}

function compareSemver(left, right) {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function expectedEpochIds(epoch) {
  const firstMatch = String(epoch.first_id).match(/^(.*?)(\d+)$/);
  const lastMatch = String(epoch.last_id).match(/^(.*?)(\d+)$/);
  assert.ok(firstMatch && lastMatch, `${epoch.change_id} must declare numeric first/last IDs`);
  assert.equal(lastMatch[1], firstMatch[1], `${epoch.change_id} first/last IDs must share a prefix`);
  assert.equal(lastMatch[2].length, firstMatch[2].length, `${epoch.change_id} first/last IDs must share padding`);
  const first = Number(firstMatch[2]);
  const last = Number(lastMatch[2]);
  assert.equal(last - first + 1, epoch.count, `${epoch.change_id} ID range must equal its declared count`);
  return Array.from({ length: epoch.count }, (_, index) => `${firstMatch[1]}${String(first + index).padStart(firstMatch[2].length, "0")}`);
}

function selectorKey(row, fields) {
  return JSON.stringify(fields.map((field) => row[field]));
}

function rangeTokenCovers(token, value) {
  if (token === value) return true;
  const range = String(token).match(/^([a-z][a-z0-9_]*?)(\d+)-([a-z][a-z0-9_]*?)(\d+)$/i);
  const candidate = String(value).match(/^([a-z][a-z0-9_]*?)(\d+)$/i);
  if (!range || !candidate || range[1] !== range[3] || candidate[1] !== range[1]) return false;
  const suffix = Number(candidate[2]);
  return suffix >= Number(range[2]) && suffix <= Number(range[4]);
}

function changeAttributes(change, table, row, contract) {
  const affectedTables = splitPipe(change.affected_tab);
  if (!affectedTables.includes(table)) return false;
  const affectedIds = splitPipe(change.affected_record_ids);
  return contract.future_attribution_fields.some((field) => {
    if (!Object.prototype.hasOwnProperty.call(row, field)) return false;
    return affectedIds.some((token) => rangeTokenCovers(token, String(row[field])));
  });
}

function validateFixtureMetadata() {
  assert.equal(fixture.fixture_schema, "taxonomy-stable-id-contract/2.0.0");
  assert.equal(fixture.baseline.database_version, "2.0.0");
  assert.equal(fixture.baseline.source_commit, EXPECTED_BASELINE_COMMIT);
  assert.equal(fixture.baseline.source_kind, "public generated research export");
  assert.deepEqual(fixture.baseline.excluded_mutable_fields, ["taxonomy_version"]);
  assert.equal(fixture.baseline.historical_row_count, EXPECTED_HISTORICAL_ROW_COUNT);
  assert.deepEqual(Object.keys(fixture.tables), EXPECTED_TABLES);
  assert.deepEqual(
    Object.keys(fixture.change_log.historical_records),
    fixture.change_log.expected_current_order,
    "Known change-record fixture order must be exact"
  );

  for (const table of EXPECTED_TABLES) {
    const contract = fixture.tables[table];
    assert.ok(contract.append_fields.includes(contract.id_field), `${table} append fields must include its ID`);
    assert.ok(contract.future_attribution_fields.includes(contract.id_field), `${table} future attribution must permit the explicit row ID`);
    let priorMaximum = contract.baseline_max_numeric_suffix;
    for (const epoch of contract.known_append_epochs) {
      const expectedIds = expectedEpochIds(epoch);
      assert.equal(epoch.row_selectors.length, epoch.count, `${table}.${epoch.change_id} selector count must be exact`);
      assert.equal(new Set(epoch.row_selectors.map(JSON.stringify)).size, epoch.count, `${table}.${epoch.change_id} selectors must be unique`);
      if (epoch.row_digests) assert.equal(epoch.row_digests.length, epoch.count, `${table}.${epoch.change_id} digest count must be exact`);
      else {
        const fullySpecifiedFields = new Set([contract.id_field, ...epoch.selector_fields]);
        assert.ok(
          contract.append_fields.every((field) => fullySpecifiedFields.has(field)),
          `${table}.${epoch.change_id} without digests must specify every semantic field`
        );
      }
      assert.ok(numericSuffix(expectedIds[0]) > priorMaximum, `${table}.${epoch.change_id} must start above the prior suffix maximum`);
      priorMaximum = numericSuffix(expectedIds.at(-1));

      const change = fixture.change_log.historical_records[epoch.change_id];
      assert.ok(change, `${table}.${epoch.change_id} must reference an exact known change record`);
      assert.equal(change.database_version, epoch.database_version, `${table}.${epoch.change_id} version must match its change record`);
      assert.ok(splitPipe(change.affected_tab).includes(epoch.change_attribution.table), `${table}.${epoch.change_id} must name its attribution table`);
      assert.ok(
        splitPipe(change.affected_record_ids).some((token) => rangeTokenCovers(token, epoch.change_attribution.record_id)),
        `${table}.${epoch.change_id} must name its attribution record`
      );
    }
  }
}

function validateChangeLog(changeLog) {
  assert.ok(Array.isArray(changeLog), "Change history must be an array");
  const knownOrder = fixture.change_log.expected_current_order;
  assert.ok(changeLog.length >= knownOrder.length, "Change history must retain every known row");
  assert.deepEqual(
    changeLog.slice(0, knownOrder.length).map((row) => row.change_id),
    knownOrder,
    "Change history must retain the exact ordered known prefix"
  );
  knownOrder.forEach((changeId, index) => {
    assert.deepEqual(changeLog[index], fixture.change_log.historical_records[changeId], `${changeId} provenance must retain exact semantics`);
  });

  const futureChanges = changeLog.slice(knownOrder.length);
  let priorSuffix = numericSuffix(knownOrder.at(-1));
  let priorVersion = fixture.change_log.historical_records[knownOrder.at(-1)].database_version;
  futureChanges.forEach((change, index) => {
    const suffix = numericSuffix(change.change_id);
    assert.ok(suffix > priorSuffix, `${change.change_id} must append after every known change ID`);
    const versionComparison = compareSemver(change.database_version, priorVersion);
    assert.ok(index === 0 ? versionComparison > 0 : versionComparison >= 0, `${change.change_id} must declare a later append-only database version`);
    assert.ok(splitPipe(change.affected_tab).length > 0, `${change.change_id} must name an affected table`);
    assert.ok(splitPipe(change.affected_record_ids).length > 0, `${change.change_id} must name affected records`);
    priorSuffix = suffix;
    priorVersion = change.database_version;
  });
  return futureChanges;
}

function validateTable(table, target, futureChanges) {
  const contract = fixture.tables[table];
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

  const knownIds = [...baselineIds];
  let priorMaximum = contract.baseline_max_numeric_suffix;
  for (const epoch of contract.known_append_epochs) {
    const epochIds = expectedEpochIds(epoch);
    epochIds.forEach((expectedId, index) => {
      const row = targetById.get(expectedId);
      assert.ok(row, `${table} must retain ${epoch.database_version} append ID ${expectedId}`);
      assert.deepEqual(
        epoch.selector_fields.map((field) => row[field]),
        epoch.row_selectors[index],
        `${table}.${expectedId} must retain its ${epoch.database_version} append semantics`
      );
      if (epoch.row_digests) {
        assert.equal(
          semanticDigest(row, contract.append_fields),
          epoch.row_digests[index],
          `${table}.${expectedId} must retain its complete ${epoch.database_version} row semantics`
        );
      }
    });
    assert.ok(numericSuffix(epochIds[0]) > priorMaximum, `${table}.${epoch.change_id} must append above the prior epoch`);
    priorMaximum = numericSuffix(epochIds.at(-1));
    knownIds.push(...epochIds);
  }

  assert.deepEqual(
    target.slice(0, knownIds.length).map((row) => row[idField]),
    knownIds,
    `${table} must preserve the exact historical and known-epoch row order`
  );

  const knownIdSet = new Set(knownIds);
  const futureRows = target.filter((row) => !knownIdSet.has(row[idField]));
  let lastSuffix = priorMaximum;
  let lastChangeIndex = -1;
  futureRows.forEach((row) => {
    const suffix = numericSuffix(row[idField]);
    assert.ok(suffix > lastSuffix, `${table}.${row[idField]} must append above all prior suffix maxima`);
    const matches = futureChanges
      .map((change, index) => ({ change, index }))
      .filter(({ change }) => changeAttributes(change, table, row, contract));
    assert.equal(matches.length, 1, `${table}.${row[idField]} must be attributable to exactly one explicit later change row`);
    assert.ok(matches[0].index >= lastChangeIndex, `${table}.${row[idField]} must follow change-log epoch order`);
    lastSuffix = suffix;
    lastChangeIndex = matches[0].index;
  });

  return { baselineCount: baselineIds.length, knownAppendCount: knownIds.length - baselineIds.length, futureCount: futureRows.length };
}

function validateStableIdContract(data) {
  validateFixtureMetadata();
  const violations = [];
  let futureChanges = [];
  try {
    futureChanges = validateChangeLog(data.change_log);
  } catch (error) {
    violations.push(error);
  }
  const totals = { baseline: 0, knownAppend: 0, future: 0 };
  for (const table of EXPECTED_TABLES) {
    try {
      const result = validateTable(table, data[table], futureChanges);
      totals.baseline += result.baselineCount;
      totals.knownAppend += result.knownAppendCount;
      totals.future += result.futureCount;
    } catch (error) {
      violations.push(error);
    }
  }
  if (violations.length > 0) {
    const error = new assert.AssertionError({
      message: `Stable-ID contract violations:\n${violations.map((violation) => `- ${violation.message}`).join("\n")}`
    });
    error.contractViolations = violations;
    throw error;
  }
  assert.equal(totals.baseline, fixture.baseline.historical_row_count, "Fixture total must cover every 2.0.0 historical row");
  return totals;
}

function buildKnownGoodData(sourceData) {
  const result = clone(sourceData);
  for (const table of EXPECTED_TABLES) {
    const contract = fixture.tables[table];
    const idField = contract.id_field;
    const baselineIds = Object.keys(contract.row_digests);
    const sourceById = new Map(sourceData[table].map((row) => [row[idField], row]));
    const rows = baselineIds.map((id) => clone(sourceById.get(id)));
    const sourceBySelector = new Map();
    for (const epoch of contract.known_append_epochs) {
      for (const row of sourceData[table]) {
        const key = selectorKey(row, epoch.selector_fields);
        if (!sourceBySelector.has(`${epoch.change_id}:${key}`)) sourceBySelector.set(`${epoch.change_id}:${key}`, []);
        sourceBySelector.get(`${epoch.change_id}:${key}`).push(row);
      }
      const epochIds = expectedEpochIds(epoch);
      epoch.row_selectors.forEach((selector, index) => {
        const key = `${epoch.change_id}:${JSON.stringify(selector)}`;
        const matches = sourceBySelector.get(key) || [];
        assert.equal(matches.length, 1, `Synthetic setup must find one ${table}.${epoch.change_id} row for ${JSON.stringify(selector)}`);
        const row = clone(matches[0]);
        row[idField] = epochIds[index];
        rows.push(row);
      });
    }
    result[table] = rows;
  }
  result.change_log = fixture.change_log.expected_current_order.map((id) => clone(fixture.change_log.historical_records[id]));
  return result;
}

function makeFutureChange({ affectedTab = "exercise_muscle_map", affectedRecordIds = "emm_0152|ex_public_future" } = {}) {
  return {
    change_id: "chg_0006",
    change_date: "2026-07-13",
    database_version: "4.0.0",
    affected_tab: affectedTab,
    affected_record_ids: affectedRecordIds,
    change_type: "compatible_append_contract_test",
    previous_value: "No public synthetic future row.",
    new_value: "Appended one public synthetic future row.",
    reason_for_change: "Exercises the stable-ID test contract without personal data.",
    supporting_study_ids: "stu_0043",
    reviewer_notes: "Synthetic public contract fixture only."
  };
}

function makeFutureExerciseMuscleRow(data, id = "emm_0152") {
  const row = clone(data.exercise_muscle_map.at(-1));
  row.exercise_muscle_map_id = id;
  row.exercise_id = "ex_public_future";
  row.muscle_group_id = "mg_abdominals";
  row.taxonomy_version = "4.0.0";
  return row;
}

function expectContractFailure(name, mutate, expectedMessage) {
  const data = buildKnownGoodData(database.data);
  mutate(data);
  let caught = null;
  try {
    validateStableIdContract(data);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${name} must fail the stable-ID contract`);
  assert.match(caught.message, expectedMessage, `${name} must fail for the intended contract reason`);
}

function runSyntheticCases() {
  const knownGood = buildKnownGoodData(database.data);
  assert.doesNotThrow(() => validateStableIdContract(knownGood), "Known 2.0, 2.1, and 3.0 epochs must pass when ordered correctly");

  const validFuture = buildKnownGoodData(database.data);
  validFuture.change_log.push(makeFutureChange());
  validFuture.exercise_muscle_map.push(makeFutureExerciseMuscleRow(validFuture));
  assert.doesNotThrow(() => validateStableIdContract(validFuture), "An explicitly attributed, higher-suffix future epoch must pass");

  expectContractFailure("persistent ID reuse", (data) => {
    data.change_log.push(makeFutureChange({ affectedRecordIds: "emm_0151|ex_public_future" }));
    data.exercise_muscle_map.push(makeFutureExerciseMuscleRow(data, "emm_0151"));
  }, /persistent IDs must be unique/);

  expectContractFailure("2.0 historical-row mutation", (data) => {
    data.exercise_muscle_map[0].exercise_id = "ex_mutated_historical_identity";
  }, /must retain its 2\.0\.0 ID-to-semantic-field identity/);

  expectContractFailure("unknown future append", (data) => {
    data.exercise_muscle_map.push(makeFutureExerciseMuscleRow(data));
  }, /must be attributable to exactly one explicit later change row/);

  expectContractFailure("misattributed future append", (data) => {
    data.change_log.push(makeFutureChange({ affectedTab: "exercise_database" }));
    data.exercise_muscle_map.push(makeFutureExerciseMuscleRow(data));
  }, /must be attributable to exactly one explicit later change row/);

  expectContractFailure("reordered change history", (data) => {
    [data.change_log[3], data.change_log[4]] = [data.change_log[4], data.change_log[3]];
  }, /exact ordered known prefix/);

  expectContractFailure("rewritten change history", (data) => {
    data.change_log[3].reviewer_notes = "Rewritten provenance is forbidden.";
  }, /chg_0004 provenance must retain exact semantics/);

  return { negative: NEGATIVE_CASES, positive: ["known epochs", "valid future epoch"] };
}

function main() {
  const syntheticCases = runSyntheticCases();
  console.log(JSON.stringify({ synthetic_contract_cases_passed: syntheticCases }, null, 2));
  const totals = validateStableIdContract(database.data);
  console.log(JSON.stringify({
    passed: true,
    baseline_fixture: "scripts/fixtures/taxonomy-v2.0.0-stable-id-contract.json",
    baseline_source_commit: fixture.baseline.source_commit,
    compared_tables: EXPECTED_TABLES,
    compared_historical_rows: totals.baseline,
    compared_known_append_rows: totals.knownAppend,
    attributed_future_rows: totals.future,
    exact_change_rows: fixture.change_log.expected_current_order
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  buildKnownGoodData,
  validateStableIdContract
};
