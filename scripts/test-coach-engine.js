"use strict";

const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const coach = require("../coach-engine.js");
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
    console.error(error && error.stack ? error.stack : String(error));
  }
}

function finishTests() {
  const total = count + failures.length + skipped;
  console.log((failures.length ? "FAIL" : "PASS") + " coach-engine: "
    + count + " passed, " + failures.length + " failed, " + total + " total"
    + (skipped ? ", " + skipped + " skipped" : ""));
  if (failures.length) process.exitCode = 1;
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

function role(overrides = {}) {
  return {
    role: "straight", S: 2, rMin: 8, rMax: 12, eMin: 7, eMax: 9,
    restSeconds: 90, increment: { value: 5, unit: "lb" },
    defaultLoad: { value: 100, unit: "lb" }, defaultReps: 10,
    ...overrides
  };
}

function exposure(index, reps = [10, 10], options = {}) {
  const resistanceType = options.resistanceType || "external";
  return {
    exposureId: "history-" + index,
    variantIdentity: "synthetic-variant",
    targetVersion: "synthetic-targets/v1",
    date: "2026-01-" + String(index).padStart(2, "0"),
    completed: true,
    isDeload: Boolean(options.isDeload),
    sessionIsDeload: Boolean(options.sessionIsDeload),
    sets: reps.map((value, position) => ({
      setId: "history-" + index + "-" + position,
      role: options.role || "straight",
      position,
      sequenceIndex: position,
      load: options.load === undefined ? 100 : options.load,
      unit: options.unit || "lb",
      reps: value,
      rpe: options.rpe === undefined ? 8 : options.rpe,
      rpeSource: options.rpeSource || "typed",
      targetReps: options.targetReps === undefined ? 10 : options.targetReps,
      resistanceType,
      completed: true,
      skipped: false
    }))
  };
}

function input(history = [], options = {}) {
  const exercise = {
    exerciseId: "exercise",
    variantIdentity: "synthetic-variant",
    resistanceType: options.resistanceType || "external",
    targetVersion: "synthetic-targets/v1",
    roles: options.roles || [role()],
    history,
    ...(options.state ? { state: options.state } : {}),
    ...(options.exerciseDeload ? { isDeload: true } : {})
  };
  return {
    sessionId: "current",
    evaluationId: "evaluation",
    createdAt: "2026-01-20T12:00:00.000Z",
    date: "2026-01-20",
    isDeload: false,
    readiness: "usual",
    resolverAction: null,
    injurySkippedDates: [],
    exercises: [exercise],
    ...(options.session || {})
  };
}

function prescribe(history, options) {
  return coach.prescribeSession(input(history, options));
}

function stateOf(prescription) {
  const exercise = prescription.exercises[0];
  return {
    deteriorationEpisode: exercise.deteriorationEpisode,
    addedSetExperiment: exercise.addedSetExperiment
  };
}

function codes(prescription) {
  return prescription.exercises[0].codes;
}

function actual(prescription, index, values = {}) {
  const row = prescription.sets[index];
  return {
    setId: row.setId, completed: true, edited: false, skipped: false,
    load: row.target.load, unit: row.target.unit, reps: row.target.reps,
    rpe: 8, rpeSource: "typed", loadSource: "entered", repsSource: "entered",
    ...values
  };
}

function revise(prescription, sets, setId = sets.at(-1).setId) {
  return coach.reviseAfterSet(prescription, {
    at: "2026-01-20T12:01:00.000Z", sets
  }, setId);
}

test("8-12 range, missing RPE, 12 twice increases load without deadlock", () => {
  const p = prescribe([1, 2].map((i) => exposure(i, [12, 12], {
    rpe: null, rpeSource: "unknown"
  })));
  assert(codes(p).includes("add_load"));
  assert.equal(p.sets[0].target.load, 105);
  assert(p.sets.every((set) => set.target.reps >= 8 && set.target.reps <= 12));
});

test("25 percent increment holds and reps never exceed rMax", () => {
  const p = prescribe([1, 2].map((i) => exposure(i, [12, 12], { load: 10 })),
    { roles: [role({ increment: { value: 2.5, unit: "lb" } })] });
  assert(codes(p).includes("increment_too_coarse"));
  assert.equal(p.sets[0].target.load, 10);
  assert.equal(p.sets[0].target.reps, 12);
});

test("deterioration reduces once across successive loads and resets after two stable exposures", () => {
  const roles = [role({ rMin: 2, rMax: 20 })];
  const history = [exposure(1, [14, 14]), exposure(2, [12, 12]), exposure(3, [10, 10])];
  const first = prescribe(history, { roles });
  assert(codes(first).includes("deteriorating_hold"));
  assert(!codes(first).includes("reduce_load"));
  history.push(exposure(4, [8, 8]));
  const reduced = prescribe(history, { roles, state: stateOf(first) });
  assert.equal(reduced.sets[0].target.load, 95);
  assert(codes(reduced).includes("reduce_load"));
  history.push(exposure(5, [6, 6], { load: 95 }));
  const later = prescribe(history, { roles, state: stateOf(reduced) });
  assert(!codes(later).includes("reduce_load"));
  assert(later.exercises[0].deteriorationEpisode.reduced);
  history.push(exposure(6, [6, 6], { load: 95 }));
  const stableOne = prescribe(history, { roles, state: stateOf(later) });
  assert(stableOne.exercises[0].deteriorationEpisode.active);
  history.push(exposure(7, [6, 6], { load: 95 }));
  const stableTwo = prescribe(history, { roles, state: stateOf(stableOne) });
  assert(!stableTwo.exercises[0].deteriorationEpisode.active);
});

test("removed positions do not create deterioration from lower set totals", () => {
  const p = prescribe([exposure(1, [10, 10, 10]), exposure(2, [10, 10]),
    exposure(3, [10, 10])]);
  assert(!p.exercises[0].deteriorationEpisode.active);
});

test("typed RPE rise detects deterioration while unknown RPE does not", () => {
  const typed = prescribe([exposure(1, [10, 10], { rpe: 6 }),
    exposure(2, [10, 10], { rpe: 7 }), exposure(3, [10, 10], { rpe: 8 })]);
  assert(typed.exercises[0].deteriorationEpisode.active);
  const unknown = prescribe([1, 2, 3].map((i) =>
    exposure(i, [10, 10], { rpe: i + 5, rpeSource: "unknown" })));
  assert(!unknown.exercises[0].deteriorationEpisode.active);
});

test("add-set experiment lasts three exposures, ignores one fluctuation, ceiling S+1", () => {
  const history = [1, 2, 3, 4].map((i) => exposure(i));
  let p = prescribe(history);
  assert(codes(p).includes("add_set"));
  assert.equal(p.exercises[0].plannedSetCount, 3);
  history.push(exposure(5, [11, 11]));
  p = prescribe(history, { state: stateOf(p) });
  assert.equal(p.exercises[0].plannedSetCount, 3);
  assert.equal(p.exercises[0].addedSetExperiment[0].remainingExposures, 2);
  history.push(exposure(6, [10, 10]));
  p = prescribe(history, { state: stateOf(p) });
  assert.equal(p.exercises[0].plannedSetCount, 3);
  history.push(exposure(7, [11, 11]));
  p = prescribe(history, { state: stateOf(p) });
  assert(p.exercises[0].plannedSetCount <= 3);
  assert.equal(p.exercises[0].addedSetExperiment[0].remainingExposures, 0);
});

test("12@7, 9@9, 11@7 does not ping-pong after a downward revision", () => {
  let p = prescribe([], { roles: [role({ S: 4, eMax: 8 })] });
  const first = actual(p, 0, { reps: 12, rpe: 7 });
  p = revise(p, [first]);
  assert.equal(p.sets[1].target.reps, 11);
  const second = actual(p, 1, { reps: 9, rpe: 9 });
  p = revise(p, [first, second]);
  assert.equal(p.sets[2].target.reps, 9);
  const third = actual(p, 2, { reps: 11, rpe: 7 });
  p = revise(p, [first, second, third]);
  assert.equal(p.sets[3].target.reps, 10);
});

test("planned 100x10, actual 50x12 without RPE cannot increase", () => {
  const p = prescribe([]);
  const revised = revise(p, [actual(p, 0, {
    load: 50, reps: 12, rpe: null, rpeSource: "unknown"
  })]);
  assert.deepEqual(revised.sets[1].target, p.sets[1].anchor);
});

test("planned 100x10, actual 100x12 without RPE cannot increase", () => {
  const p = prescribe([]);
  const revised = revise(p, [actual(p, 0, {
    reps: 12, rpe: null, rpeSource: "unknown"
  })]);
  assert.deepEqual(revised.sets[1].target, p.sets[1].anchor);
});

test("typed easy performance at a different physical load cannot increase", () => {
  const p = prescribe([]);
  const revised = revise(p, [actual(p, 0, { load: 50, reps: 12, rpe: 7 })]);
  assert.deepEqual(revised.sets[1].target, p.sets[1].anchor);
});

test("reduction increment larger than five percent holds", () => {
  const p = prescribe([], { roles: [role({
    defaultLoad: { value: 10, unit: "lb" }, defaultReps: 8,
    increment: { value: 2.5, unit: "lb" }
  })] });
  const revised = revise(p, [actual(p, 0, { reps: 6, rpe: 10 })]);
  assert(codes(revised).includes("increment_too_coarse"));
  assert.equal(revised.sets[1].target.load, 10);
});

test("bodyweight and assisted resistance progress reps without load arithmetic", () => {
  for (const resistanceType of ["bodyweight", "assisted_bodyweight"]) {
    const p = prescribe([1, 2].map((i) => exposure(i, [10, 10], {
      resistanceType, load: 50, rpe: 7
    })), { resistanceType });
    assert(codes(p).includes("add_reps"));
    assert.equal(p.sets[0].target.load, 50);
    assert.equal(p.sets[0].target.reps, 11);
    assert(!codes(p).includes("add_load"));
  }
});

test("bodyweight plus load progresses added load", () => {
  const resistanceType = "bodyweight_plus_load";
  const p = prescribe([1, 2].map((i) => exposure(i, [12, 12], {
    resistanceType
  })), { resistanceType });
  assert.equal(p.sets[0].target.load, 105);
});

test("duration, distance and unknown resistance are factual only", () => {
  for (const resistanceType of ["duration", "distance", "band", "unknown"]) {
    const p = prescribe([], { resistanceType });
    assert(codes(p).includes("factual_only"));
    assert(p.sets.every((set) => set.target === null));
  }
});

test("missing increment disables load arithmetic while preserving reps rules", () => {
  const p = prescribe([exposure(1), exposure(2)], {
    roles: [role({ increment: null })]
  });
  assert(codes(p).includes("factual_only"));
  assert(codes(p).includes("add_reps"));
  assert.equal(p.sets[0].target.load, 100);
});

test("more than 28 days gives layoff reentry then one exposure permits progression", () => {
  const history = [exposure(1, [12, 12]), exposure(2, [12, 12])];
  const session = { date: "2026-03-01", createdAt: "2026-03-01T12:00:00Z" };
  const p = prescribe(history, { session });
  assert(codes(p).includes("layoff_reentry"));
  assert.equal(p.sets[0].target.load, 100);
  const back = exposure(3, [12, 12]);
  back.date = "2026-03-01";
  history.push(back);
  const resumed = prescribe(history, {
    session: { date: "2026-03-02", createdAt: "2026-03-02T12:00:00Z" }
  });
  assert(codes(resumed).includes("add_load"));
});

test("top-set results never revise back-off rows", () => {
  const p = prescribe([], { roles: [
    role({ role: "top", S: 1 }),
    role({ role: "backoff", S: 2 })
  ] });
  const revised = revise(p, [actual(p, 0, { reps: 12, rpe: 7 })]);
  assert.deepEqual(revised.sets.slice(1).map((set) => set.target),
    p.sets.slice(1).map((set) => set.target));
  const backoff = actual(revised, 1, { reps: 12, rpe: 7 });
  const own = revise(revised, [actual(p, 0), backoff]);
  assert.equal(own.sets[2].target.reps, 11);
});

test("kg history to lb target and lb history to kg target use available increments", () => {
  const kgLoad = 100 / 2.2046226218;
  const lb = prescribe([1, 2].map((i) =>
    exposure(i, [12, 12], { load: kgLoad, unit: "kg" })));
  assert.equal(lb.sets[0].target.load, 105);
  assert.equal(lb.sets[0].target.unit, "lb");
  const kg = prescribe([exposure(1, [12, 12]), exposure(2, [12, 12])], {
    roles: [role({ increment: { value: 2.5, unit: "kg" } })]
  });
  assert.equal(kg.sets[0].target.unit, "kg");
  assert.equal(kg.sets[0].target.load % 2.5, 0);
  assert.equal(coach.physicalLoad(kgLoad, "kg"), 100);
});

test("pain/illness and other exception actions suppress all targets", () => {
  for (const code of ["stop_or_skip_work", "skip_exercise"]) {
    const p = prescribe([exposure(1, [12, 12]), exposure(2, [12, 12])], {
      session: { resolverAction: { code, overridden: false } }
    });
    assert(codes(p).includes("exception_suppressed"));
    assert(p.sets.every((set) => set.target === null));
  }
});

test("overridden exception restores targets without increases", () => {
  const p = prescribe([exposure(1, [12, 12]), exposure(2, [12, 12])], {
    session: { resolverAction: { code: "stop_or_skip_work", overridden: true } }
  });
  assert.equal(p.sets[0].target.load, 100);
  assert(!codes(p).includes("add_load"));
});

test("Worse than usual holds increases and removes one set", () => {
  const p = prescribe([exposure(1, [12, 12]), exposure(2, [12, 12])], {
    session: { readiness: "meaningfully_poor" }
  });
  assert(codes(p).includes("readiness_hold"));
  assert(codes(p).includes("remove_set"));
  assert.equal(p.exercises[0].plannedSetCount, 1);
  assert.equal(p.sets[0].target.load, 100);
});

test("warm-up and drop counts stay unchanged during readiness reduction", () => {
  const p = prescribe([], {
    roles: [role({ role: "warmup", S: 1 }), role(),
      role({ role: "drop", S: 1 })],
    session: { readiness: "meaningfully_poor" }
  });
  assert.equal(p.sets.filter((set) => set.role === "warmup").length, 1);
  assert.equal(p.sets.filter((set) => set.role === "drop").length, 1);
  assert.equal(p.sets.filter((set) => set.role === "straight").length, 1);
});

test("edited, completed and skipped rows never receive revisions", () => {
  const p = prescribe([], { roles: [role({ S: 4 })] });
  const first = actual(p, 0, { reps: 12, rpe: 7 });
  const revised = revise(p, [first,
    { setId: p.sets[1].setId, edited: true },
    { setId: p.sets[2].setId, completed: true },
    { setId: p.sets[3].setId, skipped: true }
  ], first.setId);
  assert(p.sets.slice(1).every((set, i) =>
    JSON.stringify(set.target) === JSON.stringify(revised.sets[i + 1].target)));
});

test("undo restores and locks a row; recompletion is byte-idempotent", () => {
  const p = prescribe([]);
  const first = actual(p, 0, { reps: 12, rpe: 7 });
  const once = revise(p, [first]);
  assert.equal(once.sets[1].target.reps, 11);
  assert.equal(JSON.stringify(revise(once, [first])), JSON.stringify(once));
  const undone = coach.undoRevision(once, once.sets[1].setId);
  assert.equal(undone.sets[1].target.reps, 10);
  const changed = revise(undone, [{ ...first, reps: 13 }]);
  assert.equal(changed.sets[1].target.reps, 10);
  assert(changed.sets[1].revisions.some((revision) => revision.locked));
});

test("editing a completed result re-evaluates from the anchor", () => {
  const p = prescribe([]);
  const first = actual(p, 0, { reps: 12, rpe: 7 });
  const increased = revise(p, [first]);
  const changed = revise(increased, [{ ...first, reps: 8, rpe: 10 }]);
  assert.equal(changed.sets[1].target.reps, 9);
  assert.equal(JSON.stringify(revise(changed, [{ ...first, reps: 8, rpe: 10 }])),
    JSON.stringify(changed));
});

test("between-set revisions can be disabled", () => {
  const p = prescribe([]);
  const first = actual(p, 0, { reps: 12, rpe: 7 });
  const revised = coach.reviseAfterSet(p, {
    at: "2026-01-20T12:01:00Z", revisionEnabled: false, sets: [first]
  }, first.setId);
  assert.deepEqual(revised.sets.map((set) => set.target), p.sets.map((set) => set.anchor));
  assert(revised.sets.every((set) => !set.revisions.some((revision) =>
    !revision.superseded && ["add_reps", "add_load", "reduce_reps", "reduce_load"].includes(revision.code))));
});

test("very difficult set marks the final untouched same-role set optional", () => {
  const p = prescribe([], { roles: [role({ S: 3 })] });
  const revised = revise(p, [actual(p, 0, { reps: 5, rpe: 9.5 })]);
  assert.deepEqual(revised.exercises[0].optionalSetIds, [p.sets[2].setId]);
  assert.equal(revised.sets.length, p.sets.length);
});

test("deload exposure marks never seed, progress, plateau or extend deterioration", () => {
  for (const mark of ["isDeload", "sessionIsDeload", "setType"]) {
    const history = [exposure(1, [12, 12]), exposure(2, [12, 12])];
    const deload = exposure(3, [2, 2], { load: 20 });
    if (mark === "setType") deload.sets.forEach((set) => { set.role = "deload"; });
    else deload[mark] = true;
    history.push(deload);
    const p = prescribe(history);
    assert.equal(p.sets[0].target.load, 105);
    assert.deepEqual(p.exercises[0].comparisonExposureIds, ["history-1", "history-2"]);
    assert(!p.exercises[0].deteriorationEpisode.active);
  }
  const plateau = prescribe([exposure(1), exposure(2), exposure(3),
    exposure(4, [10, 10], { isDeload: true })]);
  assert(!codes(plateau).includes("add_set"));
});

test("deload activity is not a layoff gap and current deload repeats normal work", () => {
  const old = exposure(1, [12, 12]);
  const deload = exposure(2, [2, 2], { isDeload: true, load: 20 });
  deload.date = "2026-02-10";
  const p = prescribe([old, deload], {
    session: { date: "2026-02-11", createdAt: "2026-02-11T12:00:00Z" }
  });
  assert(!codes(p).includes("layoff_reentry"));
  for (const options of [{ exerciseDeload: true }, { session: { isDeload: true } }]) {
    const marked = prescribe([exposure(1, [12, 12]), exposure(2, [12, 12])], options);
    assert(codes(marked).includes("deload_marked"));
    assert.equal(marked.sets[0].target.load, 100);
  }
});

test("deload does not reset an existing deterioration episode", () => {
  const history = [exposure(1, [14, 14]), exposure(2, [12, 12]), exposure(3, [10, 10])];
  const roles = [role({ rMax: 20 })];
  const before = prescribe(history, { roles });
  history.push(exposure(4, [20, 20], { isDeload: true }));
  const after = prescribe(history, { roles, state: stateOf(before) });
  assert(after.exercises[0].deteriorationEpisode.active);
  assert.equal(after.exercises[0].deteriorationEpisode.stableExposures, 0);
  assert.equal(after.exercises[0].deteriorationEpisode.lastExposureId, "history-3");
});

test("injury reentry repeats, excludes deterioration, then progression resumes", () => {
  const history = [exposure(1, [12, 12]), exposure(2, [12, 12])];
  const session = { injurySkippedDates: ["2026-01-03"] };
  const returning = prescribe(history, { session });
  assert(codes(returning).includes("injury_reentry"));
  assert.equal(returning.sets[0].target.load, 100);
  const back = exposure(10, [12, 12]);
  history.push(back);
  const resumed = prescribe(history, { session });
  assert(!codes(resumed).includes("injury_reentry"));
  assert(codes(resumed).includes("add_load"));
  assert(!resumed.exercises[0].deteriorationEpisode.active);
});

test("long injury gap also applies layoff reentry", () => {
  const p = prescribe([exposure(1), exposure(2)], {
    session: { injurySkippedDates: ["2026-01-10"],
      date: "2026-03-01", createdAt: "2026-03-01T12:00:00Z" }
  });
  assert(codes(p).includes("injury_reentry"));
  assert(codes(p).includes("layoff_reentry"));
});

test("exact identity and target version mismatches are excluded", () => {
  const wrong = exposure(2, [12, 12]);
  wrong.variantIdentity = "another-variant";
  const old = exposure(3, [12, 12]);
  old.targetVersion = "older-targets";
  const p = prescribe([exposure(1), wrong, old]);
  assert.deepEqual(p.exercises[0].comparisonExposureIds, ["history-1"]);
});

test("same input is byte-identical with identical digest and no mutation", () => {
  const source = input([exposure(1), exposure(2)]);
  const before = JSON.stringify(source);
  const first = coach.prescribeSession(source);
  const second = coach.prescribeSession(source);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.inputDigest, second.inputDigest);
  assert.equal(JSON.stringify(source), before);
  assert(Object.isFrozen(first.stableTargets[0].roles[0].increment));
  assert(Object.isFrozen(coach.COACH_PARAMETERS_V1));
});

test("strict validator rejects unknown keys, invalid ranges, versions and nonfinite values", () => {
  const p = prescribe([]);
  assert(coach.validatePrescription(p).ok);
  const mutations = [
    (v) => { v.extra = true; },
    (v) => { v.sets[0].target.extra = true; },
    (v) => { v.stableTargets[0].roles[0].increment.extra = true; },
    (v) => { v.sets[0].target.reps = 13; },
    (v) => { v.sets[0].anchor.reps = 7; },
    (v) => { v.contractVersion = "wrong"; },
    (v) => { v.engineVersion = "wrong"; },
    (v) => { v.parameterVersion = "wrong"; },
    (v) => { v.sets[0].target.load = Infinity; }
  ];
  mutations.forEach((mutate) => {
    const invalid = JSON.parse(JSON.stringify(p));
    mutate(invalid);
    assert(!coach.validatePrescription(invalid).ok);
  });
});

test("UMD browser global loads without DOM, storage or a clock read", () => {
  const context = vm.createContext({});
  const source = fs.readFileSync(path.join(__dirname, "..", "coach-engine.js"), "utf8");
  vm.runInContext(source, context);
  assert.equal(context.ComprehensiveFitnessCoach.COACH_CONTRACT_VERSION,
    coach.COACH_CONTRACT_VERSION);
});

function assertCanonical(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(assertCanonical);
    return;
  }
  const keys = Object.keys(value);
  assert.deepEqual(keys, keys.slice().sort());
  Object.values(value).forEach(assertCanonical);
}

test("every prescription return path uses recursive canonical key order", () => {
  const p = prescribe([]);
  const original = JSON.stringify(p);
  const first = actual(p, 0, { reps: 12, rpe: 7 });
  const changed = revise(p, [first]);
  const undone = coach.undoRevision(changed, changed.sets[1].setId);
  const outputs = [
    p, changed, revise(changed, [first]), undone,
    coach.undoRevision(undone, undone.sets[1].setId),
    coach.undoRevision(changed, "missing-row"),
    coach.reviseAfterSet(changed, {
      at: "2026-01-20T12:01:00Z", revisionEnabled: false, sets: [first]
    }, first.setId),
    coach.reviseAfterSet(changed, {
      at: "2026-01-20T12:01:00Z", sets: []
    }, "missing-row")
  ];
  outputs.forEach((output) => {
    assertCanonical(output);
    assert(Object.isFrozen(output.stableTargets));
    assert(Object.isFrozen(output.stableTargets[0].roles[0].increment));
  });
  assert.equal(JSON.stringify(p), original);
  assert.equal(JSON.stringify(revise(changed, [first])), JSON.stringify(changed));
  assert.equal(JSON.stringify(coach.undoRevision(undone, undone.sets[1].setId)),
    JSON.stringify(undone));
});

test("test runner records failures, continues and exits nonzero with a summary", () => {
  const source = fs.readFileSync(__filename, "utf8");
  const runnerSource = source.slice(0, source.indexOf("function role("));
  const child = runNode(["-e", runnerSource +
    "\ntest('intentional failure', () => { throw new Error('synthetic failure'); });" +
    "\ntest('later test', () => {});\nfinishTests();"], {
    cwd: __dirname, encoding: "utf8", timeout: 30000
  });
  assert.equal(child.status, 1);
  assert(child.stderr.includes("FAIL intentional failure"));
  assert(child.stderr.includes("synthetic failure"));
  assert.equal(child.stdout, "PASS later test\nFAIL coach-engine: 1 passed, 1 failed, 2 total\n");
});

test("held loads stay exactly 103 through seed, hold, readiness, injury, layoff and deload", () => {
  const h = [exposure(1, [10, 10], { load: 103, rpe: 9 }),
    exposure(2, [10, 10], { load: 103, rpe: 9 })];
  const variants = [
    prescribe([h[0]]), prescribe(h),
    prescribe(h, { session: { readiness: "meaningfully_poor" } }),
    prescribe(h, { session: { injurySkippedDates: ["2026-01-03"] } }),
    prescribe(h, { session: { date: "2026-03-01", createdAt: "2026-03-01T12:00:00Z" } }),
    prescribe(h, { session: { isDeload: true } })
  ];
  variants.forEach((p) => p.sets.forEach((set) => {
    assert.equal(set.anchor.load, 103);
    assert.equal(set.target.load, 103);
  }));
});

test("96x12 with a 10 lb increment holds against the unrounded load cap", () => {
  const p = prescribe([1, 2].map((i) => exposure(i, [12, 12], { load: 96 })),
    { roles: [role({ increment: { value: 10, unit: "lb" } })] });
  assert(codes(p).includes("increment_too_coarse"));
  assert.equal(p.sets[0].target.load, 96);
});

test("102 lb deterioration cannot round a 5 lb reduction down to 95", () => {
  const roles = [role({ rMin: 2, rMax: 20 })];
  const h = [exposure(1, [14, 14], { load: 102 }),
    exposure(2, [12, 12], { load: 102 }), exposure(3, [10, 10], { load: 102 })];
  const held = prescribe(h, { roles });
  h.push(exposure(4, [8, 8], { load: 102 }));
  const p = prescribe(h, { roles, state: stateOf(held) });
  assert(codes(p).includes("reduce_load"));
  assert.equal(p.sets[0].target.load, 100);
  assert(p.exercises[0].deteriorationEpisode.reduced);
  assert.match(p.exercises[0].reasonText, /-2 lb/);
});

test("alternating position losses 12,12 to 10,12 to 10,10 are not deterioration", () => {
  const p = prescribe([exposure(1, [12, 12]), exposure(2, [10, 12]),
    exposure(3, [10, 10])]);
  assert(!p.exercises[0].deteriorationEpisode.active);
  assert(!codes(p).includes("deteriorating_hold"));
});

test("cold-start deterioration must issue a hold before a later session can reduce", () => {
  const roles = [role({ rMin: 2, rMax: 20 })];
  const h = [exposure(1, [16, 16]), exposure(2, [14, 14]),
    exposure(3, [12, 12]), exposure(4, [10, 10])];
  const held = prescribe(h, { roles });
  assert(codes(held).includes("deteriorating_hold"));
  assert(!codes(held).includes("reduce_load"));
  assert.equal(held.exercises[0].deteriorationEpisode.holdIssuedAfterExposureId, "history-4");
  assert(!codes(prescribe(h, { roles, state: stateOf(held) })).includes("reduce_load"));
  h.push(exposure(5, [8, 8]));
  assert(codes(prescribe(h, { roles, state: stateOf(held) })).includes("reduce_load"));
});

test("current and historical deloads pause an experiment without consuming or cancelling it", () => {
  const h = [1, 2, 3, 4].map((i) => exposure(i));
  const start = prescribe(h);
  const paused = prescribe(h, { state: stateOf(start), session: { isDeload: true } });
  assert.equal(paused.exercises[0].addedSetExperiment[0].remainingExposures, 3);
  assert(paused.exercises[0].addedSetExperiment[0].active);
  assert(!codes(paused).includes("add_set"));
  h.push(exposure(5, [2, 2], { isDeload: true, load: 20 }));
  const resumed = prescribe(h, { state: stateOf(paused) });
  assert.equal(resumed.exercises[0].addedSetExperiment[0].remainingExposures, 3);
  assert.equal(resumed.exercises[0].plannedSetCount, 3);
});

test("an ended experiment needs four fresh exposures and records readiness cancellation", () => {
  const h = [1, 2, 3, 4].map((i) => exposure(i));
  let p = prescribe(h);
  for (let i = 5; i <= 7; i += 1) {
    h.push(exposure(i));
    p = prescribe(h, { state: stateOf(p) });
  }
  assert.equal(p.exercises[0].addedSetExperiment[0].endedReason, "completed");
  assert(!codes(p).includes("add_set"));
  for (let i = 8; i <= 10; i += 1) {
    h.push(exposure(i));
    p = prescribe(h, { state: stateOf(p) });
    assert(!codes(p).includes("add_set"));
  }
  h.push(exposure(11));
  p = prescribe(h, { state: stateOf(p) });
  assert(codes(p).includes("add_set"));
  const cancelled = prescribe(h, { state: stateOf(p),
    session: { readiness: "meaningfully_poor" } });
  assert.equal(cancelled.exercises[0].addedSetExperiment[0].endedReason, "readiness");
  assert(!cancelled.exercises[0].addedSetExperiment[0].active);
});

test("Worse than usual removes a set together with injury, layoff and deload", () => {
  for (const session of [
    { injurySkippedDates: ["2026-01-03"] },
    { date: "2026-03-01", createdAt: "2026-03-01T12:00:00Z" },
    { isDeload: true }
  ]) {
    const p = prescribe([exposure(1), exposure(2)], {
      roles: [role({ S: 3 })],
      session: { ...session, readiness: "meaningfully_poor" }
    });
    assert(codes(p).includes("remove_set"));
    assert.equal(p.exercises[0].plannedSetCount, 2);
  }
});

test("overridden exception persists as an increase block after 12 at RPE 7", () => {
  const p = prescribe([], { session: {
    resolverAction: { code: "stop_or_skip_work", overridden: true }
  } });
  const q = revise(p, [actual(p, 0, { reps: 12, rpe: 7 })]);
  assert(q.exercises[0].increaseBlockedReasons.includes("exception_overridden"));
  assert.equal(q.sets[1].target.reps, 10);
});

test("active deterioration persists as an increase block after an easy set", () => {
  const p = prescribe([exposure(1, [14, 14]), exposure(2, [12, 12]),
    exposure(3, [10, 10])], { roles: [role({ S: 3, rMax: 20 })] });
  assert(p.exercises[0].increaseBlockedReasons.includes("deterioration"));
  const q = revise(p, [actual(p, 0, { reps: 12, rpe: 7 })]);
  assert.equal(q.sets[1].target.reps, q.sets[1].anchor.reps);
});

test("all readiness and reentry increase blocks allow decreases but never increases", () => {
  const variants = [
    { readiness: "meaningfully_poor" },
    { injurySkippedDates: ["2026-01-03"] },
    { date: "2026-03-01", createdAt: "2026-03-01T12:00:00Z" },
    { isDeload: true }
  ];
  variants.forEach((session) => {
    const p = prescribe([exposure(1), exposure(2)], { roles: [role({ S: 3 })], session });
    const easy = revise(p, [actual(p, 0, { reps: 12, rpe: 7 })]);
    assert.equal(easy.sets[1].target.reps, easy.sets[1].anchor.reps);
    const hard = revise(p, [actual(p, 0, { reps: 8, rpe: 10 })]);
    assert.equal(hard.sets[1].target.reps, 9);
  });
});

test("A-to-B-to-A completion corrections keep IDs unique and reconcile optional marks", () => {
  let p = prescribe([], { roles: [role({ S: 3 })] });
  const a = actual(p, 0, { reps: 5, rpe: 10 });
  const b = { ...a, reps: 10, rpe: 8 };
  p = revise(p, [a]);
  assert.equal(p.exercises[0].optionalSetIds.length, 1);
  p = revise(p, [b]);
  assert.deepEqual(p.exercises[0].optionalSetIds, []);
  assert.equal(p.sets[1].target.reps, 10);
  p = revise(p, [a]);
  assert.equal(p.exercises[0].optionalSetIds.length, 1);
  const ids = p.sets.flatMap((set) => set.revisions.map((revision) => revision.revisionId));
  assert.equal(new Set(ids).size, ids.length);
  assert(coach.validatePrescription(p).ok);
  assert.equal(JSON.stringify(revise(p, [a])), JSON.stringify(p));
});

test("validator rejects unrecorded changes, broken chains and load jumps from the anchor", () => {
  const p = prescribe([]);
  for (const change of [
    (q) => { q.sets[0].target.reps = 11; },
    (q) => { q.sets[0].target.load = 10000; }
  ]) {
    const q = JSON.parse(JSON.stringify(p));
    change(q);
    assert(!coach.validatePrescription(q).ok);
  }
  const revised = revise(p, [actual(p, 0, { reps: 12, rpe: 7 })]);
  assert(coach.validatePrescription(revised).ok);
  revised.sets[1].revisions[0].from.reps = 9;
  assert(!coach.validatePrescription(revised).ok);
});

test("reason text names evidence for seed, hold, progression, deterioration and arbitration codes", () => {
  const checks = [
    [prescribe([exposure(1, [10, 10], { load: 103, rpe: 9 })]), /103 lb.*10, 10.*9/],
    [prescribe([1, 2].map((i) => exposure(i, [10, 10], { rpe: 9 }))), /Holding 100 lb.*10, 10/],
    [prescribe([exposure(1), exposure(2)]), /\+1 rep.*10, 10.*RPE.*8/],
    [prescribe([1, 2].map((i) => exposure(i, [12, 12]))), /\+5 lb.*all 2 sets.*12.*last 2.*8/],
    [prescribe([1, 2].map((i) => exposure(i, [12, 12], { load: 96 })),
      { roles: [role({ increment: { value: 10, unit: "lb" } })] }), /96 lb.*10 lb.*10%/],
    [prescribe([exposure(1, [12, 12]), exposure(2, [10, 10]), exposure(3, [8, 8])]),
      /Holding 100 lb.*12.*8.*2 comparisons/],
    [prescribe([1, 2, 3, 4].map((i) => exposure(i))), /set added.*4 sessions/],
    [prescribe([], { session: { readiness: "meaningfully_poor" } }), /removing.*Worse than usual/],
    [prescribe([exposure(1)], { session: { injurySkippedDates: ["2026-01-03"] } }), /injury skip/],
    [prescribe([exposure(1)], { session: {
      date: "2026-03-01", createdAt: "2026-03-01T12:00:00Z"
    } }), /gap was.*days/],
    [prescribe([], { session: { isDeload: true } }), /marked as a deload/],
    [prescribe([], { session: { resolverAction: { code: "stop_or_skip_work" } } }),
      /stop_or_skip_work.*unresolved/],
    [prescribe([], { resistanceType: "duration" }), /duration/]
  ];
  checks.forEach(([p, pattern]) => {
    assert.match(p.exercises[0].reasonText, pattern);
    assert.doesNotMatch(p.exercises[0].reasonText, /confidence|probably|likely/i);
  });
  const p = prescribe([]);
  assert.match(revise(p, [actual(p, 0, { reps: 8, rpe: 9.5 })])
    .exercises[0].reasonText, /Set 2: -1 rep.*set 1.*9.5/);
});

test("history preprocessing grows linearly from 1300 to 2600 exposures", () => {
  const make = (size) => {
    const h = Array.from({ length: size }, (_, index) => {
      const item = exposure(1);
      item.exposureId = "benchmark-" + index;
      item.date = new Date(Date.UTC(2010, 0, index + 1)).toISOString().slice(0, 10);
      return item;
    });
    return input(h, { session: { date: "2030-01-01", createdAt: "2030-01-01T12:00:00Z" } });
  };
  const small = make(1300), large = make(2600);
  const measure = (value) => {
    const start = performance.now();
    coach.prescribeSession(value);
    return performance.now() - start;
  };
  for (let i = 0; i < 3; i += 1) { measure(small); measure(large); }
  const a = [], b = [];
  for (let i = 0; i < 7; i += 1) { a.push(measure(small)); b.push(measure(large)); }
  a.sort((x, y) => x - y); b.sort((x, y) => x - y);
  assert(a[3] < 500, "1300 exposures exceeded the generous 500 ms ceiling");
  assert(b[3] < 3 * a[3], "2600 exposures must take less than 3x the 1300-exposure time");
  console.log("PERF 1300=" + a[3].toFixed(2) + "ms 2600=" + b[3].toFixed(2) + "ms");
});

test("correcting one exercise never restores targets on another factual-only exercise", () => {
  const source = input([]);
  source.exercises.push({ ...source.exercises[0], exerciseId: "timer",
    resistanceType: "duration", variantIdentity: "synthetic-timer" });
  const p = coach.prescribeSession(source);
  const first = actual(p, 0, { reps: 12, rpe: 7 });
  const q = revise(p, [first]);
  assert(q.sets.filter((set) => set.exerciseId === "timer").every((set) => set.target === null));
});

test("reduction and continuing-experiment reasons name the actual delta and remaining exposures", () => {
  const roles = [role({ rMin: 2, rMax: 20 })];
  const h = [exposure(1, [16, 16]), exposure(2, [14, 14]), exposure(3, [12, 12])];
  const held = prescribe(h, { roles });
  h.push(exposure(4, [10, 10]));
  const reduced = prescribe(h, { roles, state: stateOf(held) });
  assert.match(reduced.exercises[0].reasonText, /-5 lb.*14.*10.*2 comparisons/);
  const plateau = [1, 2, 3, 4].map((i) => exposure(i));
  const start = prescribe(plateau);
  plateau.push(exposure(5, [11, 11]));
  const continuing = prescribe(plateau, { state: stateOf(start) });
  assert.match(continuing.exercises[0].reasonText, /3rd set retained.*2 exposures remain/);
});

function effectivePrescription(prescription) {
  return {
    exercises: prescription.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId, codes: exercise.codes,
      reasonText: exercise.reasonText, optionalSetIds: exercise.optionalSetIds,
      increaseBlockedReasons: exercise.increaseBlockedReasons
    })),
    sets: prescription.sets.map((row) => ({
      setId: row.setId, target: row.target,
      effects: row.revisions.filter((revision) => !revision.superseded && !revision.undone
        && revision.code !== "event_evaluated").map((revision) => ({
        code: revision.code, afterSetId: revision.afterSetId,
        from: revision.from, to: revision.to, locked: revision.locked
      }))
    }))
  };
}

test("superseded downward results cannot block the corrected easy result", () => {
  const base = prescribe([], { roles: [role({ S: 3 })] });
  const hard = actual(base, 0, { reps: 5, rpe: 10 });
  const easy = { ...hard, reps: 12, rpe: 7 };
  const prior = revise(base, [hard]);
  const corrected = revise(prior, [easy]);
  const fresh = revise(base, [easy]);
  assert.deepEqual(corrected.sets.map((row) => row.target.reps), [10, 11, 10]);
  assert.deepEqual(effectivePrescription(corrected), effectivePrescription(fresh));
  assert.deepEqual(corrected.exercises[0].optionalSetIds, []);
  assert.match(corrected.exercises[0].reasonText, /Set 2: \+1 rep.*set 1.*7/);
  assert.doesNotMatch(corrected.exercises[0].reasonText, /optional|5 reps|RPE 10/);
  assert(corrected.sets.some((row) => row.revisions.some((revision) => revision.superseded)));
});

test("correcting one hard result preserves an optional mark justified by another result", () => {
  const base = prescribe([], { roles: [role({ S: 4 })] });
  const first = actual(base, 0, { reps: 5, rpe: 10 });
  let p = revise(base, [first]);
  const second = actual(p, 1, { reps: 5, rpe: 10 });
  p = revise(p, [first, second]);
  const corrected = revise(p, [{ ...first, reps: 10, rpe: 8 }, second]);
  assert.deepEqual(corrected.exercises[0].optionalSetIds, [base.sets[3].setId]);
  assert.match(corrected.exercises[0].reasonText, /Set 4 is optional: set 2.*5 reps.*10/);
  const marks = corrected.sets[3].revisions.filter((revision) =>
    !revision.superseded && !revision.undone && revision.code === "optional_last_set");
  assert.equal(marks.length, 1);
  assert.equal(marks[0].afterSetId, second.setId);
});

test("ambiguous roles are factual-only and cannot invalidate or change other exercises", () => {
  const source = input([], { roles: [role({ role: "unknown" })] });
  source.exercises.push({ ...source.exercises[0], exerciseId: "normal",
    variantIdentity: "normal-variant", roles: [role()] });
  const p = coach.prescribeSession(source);
  assert(coach.validatePrescription(p).ok);
  assert(p.exercises[0].codes.includes("factual_only"));
  assert.match(p.exercises[0].reasonText, /ambiguous/);
  assert(p.sets.filter((row) => row.exerciseId === "exercise").every((row) => row.target === null));
  const index = p.sets.findIndex((row) => row.exerciseId === "normal");
  const q = revise(p, [actual(p, index, { reps: 12, rpe: 7 })]);
  assert.equal(q.sets[index + 1].target.reps, 11);
  assert(q.sets.filter((row) => row.exerciseId === "exercise").every((row) => row.target === null));
});

test("rounded load changes display their actual delta rather than the configured increment", () => {
  const p = prescribe([], { roles: [role({
    defaultLoad: { value: 102, unit: "lb" }, defaultReps: 12
  })] });
  const q = revise(p, [actual(p, 0, { reps: 14, rpe: 7 })]);
  assert.equal(q.sets[1].target.load, 105);
  assert.match(q.exercises[0].reasonText, /\+3 lb/);
  assert.doesNotMatch(q.exercises[0].reasonText, /\+5 lb/);
});

test("disabling revisions rebuilds from anchors and removes prior transient explanations", () => {
  const base = prescribe([]);
  const first = actual(base, 0, { reps: 12, rpe: 7 });
  const p = revise(base, [first]);
  const q = coach.reviseAfterSet(p, { at: "2026-01-20T12:02:00Z",
    sets: [first], revisionEnabled: false }, first.setId);
  assert.equal(q.sets[1].target.reps, 10);
  assert.equal(q.exercises[0].reasonText, base.exercises[0].reasonText);
  assert(!q.exercises[0].codes.includes("add_reps"));
});

test("seeded completions, corrections and undos always equal a fresh replay of final facts", () => {
  let exercisedUndos = 0;
  for (const seed of [7, 991, 1234567]) {
    let randomState = seed;
    const random = (maximum) => {
      randomState ^= randomState << 13;
      randomState ^= randomState >>> 17;
      randomState ^= randomState << 5;
      return (randomState >>> 0) % maximum;
    };
    const base = prescribe([], { roles: [role({ S: 5 })] });
    let p = base;
    let facts = [];
    let order = 0;
    for (let step = 0; step < 60; step += 1) {
      const index = step === 0 ? 0 : step === 1 ? 1 : random(base.sets.length);
      const action = step === 0 ? 0 : step === 1 ? 2 : random(3);
      if (action === 2) {
        const before = p.exercises[0].revisionReplay.undoLocks.length;
        p = coach.undoRevision(p, base.sets[index].setId);
        if (p.exercises[0].revisionReplay.undoLocks.length > before) exercisedUndos += 1;
      } else {
        const byId = new Map(facts.map((fact) => [fact.setId, { ...fact }]));
        const previous = byId.get(base.sets[index].setId);
        byId.set(base.sets[index].setId, {
          ...(previous || {}), setId: base.sets[index].setId, completed: true,
          skipped: false, edited: false, load: 100, unit: "lb",
          reps: step === 0 ? 12 : [5, 8, 10, 12, 14][random(5)],
          rpe: step === 0 ? 7 : [7, 8, 10][random(3)], rpeSource: "typed",
          completionOrder: previous?.completed ? previous.completionOrder : order++
        });
        p = coach.reviseAfterSet(p, { at: "2026-01-20T12:01:00Z",
          sets: [...byId.values()] }, base.sets[index].setId);
      }
      facts = JSON.parse(JSON.stringify(p.exercises.flatMap((exercise) =>
        exercise.revisionReplay.facts)));
      const undoLocks = JSON.parse(JSON.stringify(p.exercises.flatMap((exercise) =>
        exercise.revisionReplay.undoLocks)));
      const state = { at: "2026-01-20T12:01:00Z", sets: facts, undoLocks };
      const fresh = coach.reviseAfterSet(base, state, "fresh-replay");
      assert.deepEqual(effectivePrescription(p), effectivePrescription(fresh),
        "seed " + seed + ", step " + step);
      const ids = p.sets.flatMap((row) => row.revisions.map((revision) => revision.revisionId));
      assert.equal(new Set(ids).size, ids.length);
      assert(coach.validatePrescription(p).ok);
      assert.equal(JSON.stringify(coach.reviseAfterSet(p, state, "repeat")), JSON.stringify(p));
    }
  }
  assert(exercisedUndos >= 3);
});

test("subprocess failures expose errors and skip only when no child could start", () => {
  const messages = [];
  const denied = Object.assign(new Error("synthetic spawn denied"), { code: "EPERM" });
  assert.throws(() => runNode([], {}, () => ({ status: null, error: denied }),
    (message) => messages.push(message)), (error) => error.skip === true);
  assert.match(messages[0], /SPAWN ERROR EPERM.*synthetic spawn denied/);
  const child = runNode([], {}, () => ({ status: 1, pid: 123, stderr: "child failed" }));
  assert.equal(child.status, 1);
  const timeout = Object.assign(new Error("synthetic timeout"), { code: "ETIMEDOUT" });
  assert.throws(() => runNode([], {}, () => ({ status: null, pid: 123, error: timeout }),
    (message) => messages.push(message)), (error) => !error.skip && /ETIMEDOUT/.test(error.message));
});

test("current explanations omit hypothetical changes to already-completed targets", () => {
  const base = prescribe([], { roles: [role({ S: 3 })] });
  const hard = actual(base, 0, { reps: 5, rpe: 10 });
  let p = revise(base, [hard]);
  const second = actual(p, 1, { reps: 10, rpe: 8 });
  p = revise(p, [hard, second]);
  const corrected = revise(p, [{ ...hard, reps: 12, rpe: 7 }, second]);
  assert.equal(corrected.sets[1].target.reps, 9);
  assert.equal(corrected.exercises[0].reasonText, base.exercises[0].sessionStart.reasonText);
  assert(!corrected.exercises[0].codes.includes("add_reps"));
});

test("skipped rows freeze their revised target and consume rather than redirect the revision", () => {
  const base = prescribe([], { roles: [role({ S: 3 })] });
  const first = actual(base, 0, { reps: 8, rpe: 10 });
  const changed = revise(base, [first]);
  assert.deepEqual(changed.sets.map((row) => row.target.reps), [10, 9, 10]);
  const skip = { setId: base.sets[1].setId, completed: false, skipped: true };
  const frozen = revise(changed, [first, skip]);
  assert.deepEqual(frozen.sets.map((row) => row.target.reps), [10, 9, 10]);
  assert.equal(JSON.stringify(revise(frozen, [first, skip])), JSON.stringify(frozen));
  assert.equal(JSON.stringify(coach.undoRevision(frozen, skip.setId)), JSON.stringify(frozen));
  const corrected = revise(frozen, [{ ...first, reps: 12, rpe: 7 }, skip]);
  assert.deepEqual(corrected.sets.map((row) => row.target.reps), [10, 9, 10]);
  const disabled = coach.reviseAfterSet(corrected, {
    at: "2026-01-20T12:02:00Z", revisionEnabled: false,
    sets: [{ ...first, reps: 12, rpe: 7 }, skip]
  }, first.setId);
  assert.deepEqual(disabled.sets.map((row) => row.target.reps), [10, 9, 10]);
  const facts = corrected.exercises[0].revisionReplay.facts;
  const fresh = revise(base, facts);
  assert.deepEqual(effectivePrescription(corrected), effectivePrescription(fresh));
  assert(coach.validatePrescription(frozen).ok);
  const optionalBase = prescribe([], { roles: [role({ S: 4 })] });
  const hard = actual(optionalBase, 0, { reps: 5, rpe: 10 });
  const optional = revise(optionalBase, [hard]);
  assert.deepEqual(optional.exercises[0].optionalSetIds, [optional.sets[3].setId]);
  const skippedLast = revise(optional, [hard,
    { setId: optional.sets[3].setId, skipped: true }]);
  assert.deepEqual(skippedLast.exercises[0].optionalSetIds, []);
  assert.equal(skippedLast.sets[2].target.reps, 10);
});

test("skipping an upward-revised row freezes it even through corrections and status changes", () => {
  const base = prescribe([], { roles: [role({ S: 3 })] });
  const first = actual(base, 0, { reps: 12, rpe: 7 });
  let p = revise(base, [first]);
  const skip = { setId: base.sets[1].setId, completed: false, skipped: true };
  p = revise(p, [first, skip]);
  assert.deepEqual(p.sets.map((row) => row.target.reps), [10, 11, 10]);
  p = revise(p, [{ ...first, reps: 8, rpe: 10 }, skip]);
  assert.deepEqual(p.sets.map((row) => row.target.reps), [10, 11, 10]);
  const second = actual(p, 1, { reps: 11, rpe: 8 });
  p = revise(p, [{ ...first, reps: 8, rpe: 10 }, second]);
  assert.equal(p.sets[1].target.reps, 11);
  const edited = { ...second, completed: false, edited: true };
  p = revise(p, [{ ...first, reps: 12, rpe: 7 }, edited]);
  assert.equal(p.sets[1].target.reps, 11);
  assert(coach.validatePrescription(p).ok);
});

test("off-grid load steps select available loads within one increment at session start and between sets", () => {
  const upRoles = [role({ defaultLoad: { value: 103, unit: "lb" }, defaultReps: 12 })];
  const base = prescribe([], { roles: upRoles });
  const raised = revise(base, [actual(base, 0, { reps: 14, rpe: 7 })]);
  assert.equal(raised.sets[1].target.load, 105);
  assert.match(raised.exercises[0].reasonText, /\+2 lb/);
  assert(!codes(raised).includes("increment_too_coarse"));
  const start = prescribe([1, 2].map((i) => exposure(i, [12, 12], { load: 103 })),
    { roles: upRoles });
  assert.equal(start.sets[0].target.load, 105);
  assert.match(start.exercises[0].reasonText, /\+2 lb/);
  const downRoles = [role({ defaultLoad: { value: 103, unit: "lb" }, defaultReps: 8 })];
  const down = prescribe([], { roles: downRoles });
  const lowered = revise(down, [actual(down, 0, { reps: 6, rpe: 10 })]);
  assert.equal(lowered.sets[1].target.load, 100);
  assert.match(lowered.exercises[0].reasonText, /-3 lb/);
  const h = [exposure(1, [14, 14], { load: 103 }),
    exposure(2, [12, 12], { load: 103 }), exposure(3, [10, 10], { load: 103 })];
  const roles = [role({ rMin: 2, rMax: 20 })];
  const held = prescribe(h, { roles });
  h.push(exposure(4, [8, 8], { load: 103 }));
  const reduced = prescribe(h, { roles, state: stateOf(held) });
  assert.equal(reduced.sets[0].target.load, 100);
  assert.match(reduced.exercises[0].reasonText, /-3 lb/);
  for (const unit of ["lb", "kg"]) {
    const historyUnit = unit === "kg" ? "lb" : "kg";
    const rawLoad = unit === "kg" ? 103 / 2.2046226218 : 103 * 2.2046226218;
    const roles = [role({
      defaultLoad: { value: rawLoad, unit }, defaultReps: 12,
      increment: { value: 5, unit: historyUnit }
    })];
    const mixed = prescribe([], { roles });
    const q = revise(mixed, [actual(mixed, 0, { reps: 14, rpe: 7 })]);
    assert.equal(q.sets[1].target.unit, historyUnit);
    assert.equal(q.sets[1].target.load, 105);
    assert(coach.validatePrescription(q).ok);
  }
});

test("shared load-step holds name the actual cap or lack of an available load", () => {
  const roles = [role({ defaultLoad: { value: 96, unit: "lb" },
    defaultReps: 12, increment: { value: 10, unit: "lb" } })];
  const base = prescribe([], { roles });
  const between = revise(base, [actual(base, 0, { reps: 14, rpe: 7 })]);
  const start = prescribe([1, 2].map((i) => exposure(i, [12, 12], { load: 96 })), { roles });
  assert.equal(between.sets[1].target.load, 96);
  assert.match(between.exercises[0].reasonText, /10 lb increment exceeds the 10% increase cap/);
  assert.equal(between.exercises[0].reasonText, start.exercises[0].reasonText);
  const reductionRoles = [role({ defaultLoad: { value: 10, unit: "lb" },
    defaultReps: 8, increment: { value: 2.5, unit: "lb" } })];
  const reduction = prescribe([], { roles: reductionRoles });
  const reduced = revise(reduction, [actual(reduction, 0, { reps: 6, rpe: 10 })]);
  assert.match(reduced.exercises[0].reasonText, /2.5 lb increment exceeds the 5% reduction cap/);
  const noLoad = prescribe([], { roles: [role({
    defaultLoad: { value: 0, unit: "lb" }, defaultReps: 12
  })] });
  const unavailable = revise(noLoad, [actual(noLoad, 0, { reps: 14, rpe: 7 })]);
  assert.match(unavailable.exercises[0].reasonText, /no available load/);
  assert.doesNotMatch(unavailable.exercises[0].reasonText, /10%|5%|anchor bound/);
});

finishTests();
