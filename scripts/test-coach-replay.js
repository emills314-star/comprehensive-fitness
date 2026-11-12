"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseCSV, replayCSV, planSession } = require("./coach-replay.js");

const fixturePath = path.join(__dirname, "..", "tests", "fixtures",
  "coach-replay.synthetic.csv");
const csv = fs.readFileSync(fixturePath, "utf8");
let count = 0;
const failures = [];
let skipped = 0;

function test(name, run) {
  try {
    run();
    count += 1;
    console.log("PASS " + name);
  } catch (error) {
    if (error.skip) {
      skipped += 1;
      console.log("SKIP " + name + ": " + error.message);
      return;
    }
    failures.push(name);
    console.error("FAIL " + name);
    console.error(error.stack || String(error));
  }
}

function runNode(args, options, spawn = spawnSync, report = console.error) {
  let child;
  try {
    child = spawn(process.execPath, args, options);
  } catch (error) {
    child = { status: null, error };
  }
  if (child.error) {
    const detail = (child.error.code || child.error.name || "unknown") + ": " + child.error.message;
    report("SPAWN ERROR " + detail);
    if (!child.pid && child.status === null
      && ["EPERM", "EACCES", "ENOENT", "ENOSYS", "ENOTSUP", "EAGAIN"].includes(child.error.code)) {
      const skip = new Error("Node spawning is unavailable (" + detail + ")");
      skip.skip = true;
      throw skip;
    }
    throw new Error("Node subprocess failed: " + detail);
  }
  if (child.status === null) {
    throw new Error("Node subprocess did not exit normally; signal=" + (child.signal || "unknown"));
  }
  return child;
}

function serialize(rows) {
  const headers = Object.keys(rows[0]);
  const quote = (value) => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? "\"" + text.replace(/"/g, "\"\"") + "\"" : text;
  };
  return [headers.join(","), ...rows.map((row) =>
    headers.map((header) => quote(row[header])).join(","))].join("\r\n") + "\r\n";
}

test("RFC-4180 parser handles BOM, embedded commas, quotes, CRLF and newlines", () => {
  const rows = parseCSV("\uFEFFa,b\r\n\"hello, \"\"coach\"\"\",\"two\nlines\"\r\n");
  assert.deepEqual(rows, [{ a: "hello, \"coach\"", b: "two\nlines" }]);
  assert.throws(() => parseCSV("a,b\n\"unterminated,b"));
  assert.throws(() => parseCSV("a,a\n1,2\n"));
  assert.throws(() => parseCSV("a,b\n1\n"));
});

test("synthetic replay has the exact aggregate-only top-level output shape", () => {
  const result = replayCSV(csv);
  assert.deepEqual(Object.keys(result).sort(), [
    "formatVersion", "aggregateOnly", "approximations", "sessions", "exercises",
    "skippedReasons", "codeDistribution", "unitInferences", "metrics",
    "oscillationCount", "boundViolationCount", "leakage", "setAccounting", "identityCoverage"
  ].sort());
  assert.equal(result.aggregateOnly, true);
  assert.equal(result.sessions.total, 8);
  assert(result.sessions.evaluated > 0);
  assert(result.exercises.evaluated > 0);
  assert(result.skippedReasons.no_prior_structure > 0);
  assert(result.identityCoverage.unconfirmed.exposures > 0);
  assert.equal(result.skippedReasons.equipment_identity_unconfirmed, undefined);
  assert(result.skippedReasons.unsupported_resistance > 0);
  assert(result.unitInferences.rows > 0);
  assert.equal(result.oscillationCount, 0);
  assert.equal(result.boundViolationCount, 0);
  assert.equal(result.leakage.passed, true);
  assert.equal(result.leakage.violations, 0);
  assert(result.leakage.sessionHistoryChecks > 0);
  assert(result.leakage.setPrefixChecks > 0);
  assert(result.leakage.futurePerturbationChecks > 0);
  for (const name of ["coach", "repeatLast", "doubleProgression", "coachBetweenSets"]) {
    const metric = result.metrics[name];
    assert(metric.comparedSets > 0);
    assert.equal(metric.setsScored, result.setAccounting.commonScoredSets);
    assert.equal(metric.actualWorkingSets, result.setAccounting.actualWorkingSets);
    assert.equal(metric.coverage, metric.setsScored / metric.actualWorkingSets);
    assert(Number.isFinite(metric.mae));
    assert(Number.isFinite(metric.bias));
    assert(metric.loadMatchRate >= 0 && metric.loadMatchRate <= 1);
    if (metric.overshootRate !== null) {
      assert(metric.overshootRate >= 0 && metric.overshootRate <= 1);
    }
  }
  const encoded = JSON.stringify(result);
  for (const privateText of ["Synthetic Press", "synthetic_press", "secret-machine",
    "2026-01-01", "2026-01-08", "session-1", "row-1"]) {
    assert(!encoded.includes(privateText), "row-level value leaked");
  }
  function inspect(value) {
    if (!value || typeof value !== "object") return;
    assert(!Array.isArray(value), "row-level array in aggregate output");
    Object.keys(value).forEach((key) => {
      assert(!["rows", "records", "sets", "history", "exerciseId", "sessionId",
        "date", "load", "exerciseName"].includes(key)
        || (key === "rows" && value === result.unitInferences));
      inspect(value[key]);
    });
  }
  inspect(result);
});

test("the last session's retrospective role labels cannot influence its predictions", () => {
  const rows = parseCSV(csv);
  const changed = rows.map((row) => row.session_id === "session-8"
    ? { ...row, set_type: "back_off_set" } : row);
  assert.deepEqual(replayCSV(serialize(changed)), replayCSV(csv));
});

test("future data is excluded from prior-target inference", () => {
  const result = replayCSV(csv);
  assert.equal(result.leakage.violations, 0);
  assert(result.leakage.futurePerturbationChecks >= result.exercises.evaluated);
});

test("optional injury dates produce aggregate injury reentry codes", () => {
  const result = replayCSV(csv, { injuryDates: ["2026-01-04"] });
  assert((result.codeDistribution.injury_reentry || 0) > 0);
  assert.throws(() => replayCSV(csv, { injuryDates: ["2026-02-31"] }));
});

test("explicit deload marks affect history without marking the predicted session", () => {
  const rows = parseCSV(csv).map((row) => row.session_id === "session-4"
    ? { ...row, set_type: "deload" } : row);
  const result = replayCSV(serialize(rows));
  assert.equal(result.codeDistribution.deload_marked || 0, 0);
  assert.equal(result.boundViolationCount, 0);
  assert.equal(result.leakage.violations, 0);
});

test("CLI replays the fixture end to end and prints only aggregate JSON", () => {
  const child = runNode([
    path.join(__dirname, "coach-replay.js"), fixturePath
  ], { encoding: "utf8", timeout: 30000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, "");
  const result = JSON.parse(child.stdout);
  assert.deepEqual(result, replayCSV(csv));
  assert(!child.stdout.includes("Synthetic Press"));
  assert(!child.stdout.includes(fixturePath));
});

test("CLI errors do not reveal input paths or row data", () => {
  const marker = path.join(__dirname, "private-synthetic-missing.csv");
  const child = runNode([
    path.join(__dirname, "coach-replay.js"), marker
  ], { encoding: "utf8", timeout: 30000 });
  assert.equal(child.status, 1);
  assert.equal(child.stdout, "");
  assert.equal(child.stderr, "Coach replay failed: invalid input or output destination.\n");
  assert(!child.stderr.includes(marker));
});

function priorFixture(count = 4) {
  return Array.from({ length: count }, (_, index) => ({
    exposureId: "prior-" + index, variantIdentity: "synthetic-key",
    targetVersion: "harness-inferred/v1", date: "2026-01-0" + (index + 1) + "T10:00:00.000Z",
    completed: true, isDeload: false, sessionIsDeload: false,
    sets: [0, 1].map((position) => ({
      setId: "prior-" + index + "-" + position, role: "straight", position,
      sequenceIndex: position, load: 100, unit: "lb", reps: 10, rpe: 8,
      rpeSource: "typed", targetReps: 10, resistanceType: "external", completed: true
    }))
  }));
}

function simpleCSV(exposures) {
  const template = parseCSV(csv).find((row) => row.record_id === "row-2");
  return serialize(exposures.flatMap((sets, index) => sets.map((set, position) => ({
    ...template, record_id: "synthetic-" + index + "-" + position,
    session_id: "synthetic-session-" + index,
    workout_date: "2026-01-" + String(index + 1).padStart(2, "0"),
    workout_time_local: "10:00:00",
    workout_local_datetime: "2026-01-" + String(index + 1).padStart(2, "0") + "T10:00:00",
    set_sequence_in_exercise: String(position + 1), session_set_sequence: String(position + 1),
    source_set_order_kind: "numeric_working", set_type: "straight_working_set",
    is_warmup: "false", load: "100", repetitions: String(set.reps),
    rpe: String(set.rpe === undefined ? 8 : set.rpe)
  }))));
}

test("all predicted-session labels including deload, completion and resistance are leakage-invariant", () => {
  const prior = priorFixture();
  const metadata = { sessionId: "future", at: "2026-01-10T10:00:00.000Z",
    key: "synthetic-key", records: parseCSV(csv).slice(0, 3), isDeload: false,
    resistanceType: "external" };
  const original = planSession(prior, metadata);
  const changed = planSession(prior, {
    ...metadata, isDeload: true, resistanceType: "duration", completed: false,
    records: metadata.records.map((row) => ({
      ...Object.fromEntries(Object.keys(row).map((key) => [key, "changed"])),
      set_type: "deload", is_warmup: "true", completed: "false",
      completion_inference: "not_completed", resistance_type: "duration",
      source_set_order_kind: "warmup", load: "99999", repetitions: "999", rpe: "10"
    }))
  });
  assert.deepEqual(changed, original);
  assert.equal(original.input.isDeload, false);
  assert.equal(original.input.exercises[0].resistanceType, "external");
  const deloadHistory = priorFixture();
  deloadHistory.at(-1).isDeload = true;
  const plan = planSession(deloadHistory, metadata);
  assert(!plan.prescription.exercises[0].comparisonExposureIds.includes("prior-3"));
});

test("fair scoring shares positions after removal and reports actual removed sets", () => {
  const result = replayCSV(simpleCSV([14, 12, 10, 8].map((reps) => [
    { reps }, { reps }
  ])));
  assert(result.setAccounting.coachRemovedPlannedSets > 0);
  assert(result.setAccounting.actualCoachRemovedSets > 0);
  assert(result.setAccounting.actualSetsOutsideCommonPlan > 0);
  const scored = result.setAccounting.commonScoredSets;
  for (const metric of Object.values(result.metrics)) {
    assert.equal(metric.setsScored, scored);
    assert.equal(metric.comparedSets, scored);
    assert.equal(metric.coverage, scored / result.setAccounting.actualWorkingSets);
  }
  assert.equal(result.metrics.coach.phase, "session_start");
  assert.equal(result.metrics.repeatLast.phase, "session_start");
  assert.equal(result.metrics.doubleProgression.phase, "session_start");
  assert.equal(result.metrics.coachBetweenSets.phase, "between_sets");
});

test("added experiment sets and missing actual added sets are counted outside the common cohort", () => {
  const sessions = Array.from({ length: 6 }, () => [{ reps: 10 }, { reps: 10 }]);
  sessions[5].push({ reps: 10 });
  const result = replayCSV(simpleCSV(sessions));
  assert(result.setAccounting.coachAddedPlannedSets > 0);
  assert(result.setAccounting.actualCoachAddedSets > 0);
  assert(result.setAccounting.unperformedCoachAddedSets > 0);
  assert(result.setAccounting.actualSetsOutsideCommonPlan > 0);
  assert.equal(result.metrics.coach.setsScored, result.metrics.repeatLast.setsScored);
});

test("session-start coach errors remain separate from revised coach errors on the same actual sets", () => {
  const result = replayCSV(simpleCSV([
    [{ reps: 10 }, { reps: 10 }],
    [{ reps: 10 }, { reps: 10 }],
    [{ reps: 13, rpe: 7 }, { reps: 10 }]
  ]));
  assert.equal(result.metrics.coach.setsScored, result.metrics.coachBetweenSets.setsScored);
  assert.notEqual(result.metrics.coach.mae, result.metrics.coachBetweenSets.mae);
  assert.equal(result.boundViolationCount, 0);
  assert.equal(result.oscillationCount, 0);
});

test("recorded name and variation identity ignores changing IDs and normalizes whitespace and case", () => {
  const changed = parseCSV(csv).map((row, index) => row.exercise_name_recorded === "Synthetic Press"
    ? { ...row, exercise_name_recorded: "  SYNTHETIC \t PRESS  ", exercise_variation: " FLAT ",
      exercise_id: "changed-id-" + index, comparison_group: "changed-group-" + index } : row);
  assert.deepEqual(replayCSV(serialize(changed)), replayCSV(csv));
});

test("unconfirmed recorded identities remain eligible and have separate aggregate coverage", () => {
  const changed = parseCSV(csv).map((row) => row.exercise_name_recorded === "Synthetic Press"
    ? { ...row, equipment_identity_status: "unconfirmed" } : row);
  const result = replayCSV(serialize(changed));
  assert(result.identityCoverage.unconfirmed.evaluated >= 7);
  assert(result.identityCoverage.unconfirmed.identities >= 2);
  assert(result.identityCoverage.confirmed.identities >= 1);
  assert.equal(result.skippedReasons.equipment_identity_unconfirmed, undefined);
  for (const coverage of Object.values(result.identityCoverage)) {
    assert.equal(coverage.evaluated + coverage.skipped, coverage.exposures);
    assert.equal(coverage.coverage, coverage.actualWorkingSets
      ? coverage.setsScored / coverage.actualWorkingSets : null);
  }
  assert.equal(result.identityCoverage.confirmed.actualWorkingSets
    + result.identityCoverage.unconfirmed.actualWorkingSets, result.setAccounting.actualWorkingSets);
  assert.equal(result.identityCoverage.confirmed.setsScored
    + result.identityCoverage.unconfirmed.setsScored, result.setAccounting.commonScoredSets);
});

test("explicit writer mapping conflicts and unmapped flags remain exclusions", () => {
  const changed = parseCSV(csv).map((row) => ({
    ...row, exercise_mapping_unmapped: row.session_id === "session-2" ? "true" : "false",
    exercise_mapping_conflict: row.session_id === "session-3" ? "true" : "false"
  }));
  const result = replayCSV(serialize(changed));
  assert.equal(result.skippedReasons.mapping_unmapped, 1);
  assert.equal(result.skippedReasons.mapping_conflict, 1);
  assert.equal(result.boundViolationCount, 0);
  assert.equal(result.leakage.passed, true);
});

test("subprocess reporting distinguishes unavailable spawning from a child failure", () => {
  const messages = [];
  const denied = Object.assign(new Error("synthetic sandbox denial"), { code: "EACCES" });
  assert.throws(() => runNode([], {}, () => ({ status: null, error: denied }),
    (message) => messages.push(message)), (error) => error.skip === true);
  assert.match(messages[0], /SPAWN ERROR EACCES.*synthetic sandbox denial/);
  const child = runNode([], {}, () => ({ status: 2, pid: 123, stderr: "child assertion failed" }));
  assert.equal(child.status, 2);
  assert.throws(() => runNode([], {}, () => ({ status: null, pid: 123, signal: "SIGTERM" })),
    (error) => !error.skip && /SIGTERM/.test(error.message));
});

console.log((failures.length ? "FAIL" : "PASS") + " coach-replay: " + count + " tests"
  + (skipped ? ", " + skipped + " skipped" : "") + (failures.length ? ", " + failures.length + " failed" : ""));
if (failures.length) process.exitCode = 1;
