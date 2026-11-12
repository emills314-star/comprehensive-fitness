"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const coach = require("../coach-engine.js");
const resolver = require("../exception-resolver.js");
let count = 0;
const failures = [];

function test(name, run) {
  try { run(); count += 1; console.log("PASS " + name); }
  catch (error) { failures.push(name); console.error("FAIL " + name); console.error(error.stack); }
}

function input() {
  return {
    sessionId: "synthetic-session", evaluationId: "synthetic-evaluation", createdAt: "2026-01-10T10:00:00.000Z",
    date: "2026-01-10", exercises: [{ exerciseId: "synthetic-bench", variantIdentity: "bench|external",
      resistanceType: "external", targetVersion: "synthetic-v1", roles: [{ role: "straight", S: 3,
        rMin: 8, rMax: 12, eMin: 7, eMax: 9, restSeconds: 90,
        increment: { value: 5, unit: "lb" }, defaultLoad: { value: 100, unit: "lb" }, defaultReps: 10 }],
      sets: [0, 1, 2].map((position) => ({ setId: "s" + position, role: "straight", position, sequenceIndex: position })),
      history: [] }]
  };
}

function project(prescription, options = {}, validate = coach.validatePrescription) {
  return resolver.resolvePrescriptionChannel({ prescription, effectiveMode: "show", exceptionDecisions: [],
    suspensions: [], revisionEnabled: true, actualSetIds: ["s0", "s1", "s2"], ...options }, validate);
}

function revised() {
  return coach.reviseAfterSet(coach.prescribeSession(input()), {
    at: "2026-01-10T10:05:00.000Z", sets: [{ setId: "s0", completed: true, load: 100,
      unit: "lb", reps: 10, rpe: 10, rpeSource: "typed", completionOrder: 1 }]
  }, "s0");
}

test("off, shadow, missing validation and corrupt prescriptions expose no target payload", () => {
  const prescription = coach.prescribeSession(input());
  for (const effectiveMode of ["off", "shadow", null, "SHOW"]) {
    assert.deepEqual(project(prescription, { effectiveMode }), { visible: false, reason: "mode_hidden" });
  }
  assert.deepEqual(project({ ...prescription, sets: [] }), { visible: false, reason: "invalid_prescription" });
  assert.deepEqual(project(prescription, {}, () => { throw new Error("broken validator"); }),
    { visible: false, reason: "invalid_prescription" });
  assert.equal(resolver.resolvePrescriptionChannel({ prescription, effectiveMode: "show" }).visible, false);
});

test("seed projection returns current targets and anchors without a spurious start reason", () => {
  const prescription = coach.prescribeSession(input());
  const before = JSON.stringify(prescription);
  const channel = project(prescription);
  assert.equal(channel.visible, true);
  assert.equal(channel.exercises[0].reasonText, null);
  assert.deepEqual(channel.exercises[0].sets[1].target, { load: 100, reps: 10, unit: "lb" });
  assert.deepEqual(channel.exercises[0].sets[1].anchor, prescription.sets[1].anchor);
  assert.equal(channel.exercises[0].sets[1].revision, null);
  channel.exercises[0].sets[1].target.reps = 999;
  assert.equal(JSON.stringify(prescription), before, "View projections cannot mutate the prescription");
});

test("an engine-authorized progression exposes the engine start reason", () => {
  const source = input();
  source.exercises[0].history = [1, 2].map((day) => ({ exposureId: "exposure-" + day,
    variantIdentity: "bench|external", targetVersion: "synthetic-v1", date: "2026-01-0" + day,
    completed: true, sets: [0, 1, 2].map((position) => ({ setId: "h" + day + position,
      role: "straight", position, load: 100, unit: "lb", reps: 12, rpe: 8,
      rpeSource: "typed", resistanceType: "external", completed: true })) }));
  const prescription = coach.prescribeSession(source);
  const channel = project(prescription);
  assert.ok(channel.exercises[0].codes.includes("add_load"));
  assert.equal(channel.exercises[0].reasonText, prescription.exercises[0].sessionStart.reasonText);
});

test("count-only adjustments never imply a proven change from last time", () => {
  function exposures(count, setCount) {
    return Array.from({ length: count }, (_, index) => ({ exposureId: "count-exposure-" + index,
      variantIdentity: "bench|external", targetVersion: "synthetic-v1", date: "2026-01-0" + (index + 1),
      completed: true, sets: Array.from({ length: setCount }, (_, position) => ({ setId: "count-" + index + "-" + position,
        role: "straight", position, load: 100, unit: "lb", reps: 10, rpe: 9,
        rpeSource: "typed", resistanceType: "external", completed: true })) }));
  }
  const poorStart = input(); poorStart.readiness = "meaningfully_poor";
  const noHistory = coach.prescribeSession(poorStart);
  assert.ok(noHistory.exercises[0].codes.includes("remove_set"));
  assert.equal(project(noHistory).exercises[0].reasonText, null, "No prior result cannot establish a last-time difference");
  poorStart.exercises[0].history = exposures(2, 2);
  const sameReducedCount = coach.prescribeSession(poorStart);
  assert.ok(sameReducedCount.exercises[0].codes.includes("remove_set"));
  assert.equal(sameReducedCount.exercises[0].plannedSetCount, 2);
  assert.equal(project(sameReducedCount).exercises[0].reasonText, null, "Consecutive reduced counts are unchanged");
  const plateau = input(); plateau.exercises[0].history = exposures(4, 4);
  const added = coach.prescribeSession(plateau);
  assert.ok(added.exercises[0].codes.includes("add_set"));
  assert.equal(added.exercises[0].plannedSetCount, 4);
  assert.equal(project(added).exercises[0].reasonText, null, "A new experiment need not change an owner-added prior row count");
});

function priorPrescription({ readiness, version = "synthetic-v1", identity = "bench|external", resistanceType = "external" } = {}) {
  const source = input();
  source.sessionId = "prior-session";
  source.evaluationId = "prior-evaluation";
  source.createdAt = "2026-01-01T10:00:00.000Z";
  source.date = "2026-01-01";
  if (readiness) source.readiness = readiness;
  Object.assign(source.exercises[0], { exerciseId: "prior-bench", variantIdentity: identity, targetVersion: version, resistanceType });
  source.exercises[0].sets = source.exercises[0].sets.map((row) => ({ ...row, setId: "prior-" + row.setId }));
  return coach.prescribeSession(source);
}

function observedHistory({ count = 1, reps = 10 } = {}) {
  return Array.from({ length: count }, (_, index) => ({ exposureId: "proven-exposure-" + index,
    variantIdentity: "bench|external", targetVersion: "synthetic-v1", date: "2026-01-0" + (index + 1), completed: true,
    sets: [0, 1, 2].map((position) => ({ setId: "actual-" + index + "-" + position, role: "straight", position,
      load: 100, unit: "lb", reps, rpe: 9, rpeSource: "typed", resistanceType: "external", completed: true })) }));
}

test("verified previous prescription exposes the actual three-to-two readiness reason", () => {
  const prior = priorPrescription();
  const source = input();
  source.readiness = "meaningfully_poor";
  source.exercises[0].history = observedHistory();
  const prescription = coach.prescribeSession(source);
  assert.equal(prior.exercises[0].plannedSetCount, 3);
  assert.equal(prescription.exercises[0].plannedSetCount, 2);
  assert.ok(prescription.exercises[0].sessionStart.codes.includes("remove_set"));
  const expected = prescription.exercises[0].sessionStart.reasonText;
  assert.equal(project(prescription, { previousPrescriptions: [prior] }).exercises[0].reasonText, expected);
  assert.equal(project(prescription, {}, (value) => ({ ...coach.validatePrescription(value), previousPrescriptions: [prior] })).exercises[0].reasonText, expected,
    "The existing view callback can supply comparison metadata without changing its call site");
  assert.equal(project(prescription, { previousPrescriptions: [prior], revisionEnabled: false }).exercises[0].reasonText, expected,
    "Revision-off still exposes a verified session-start change");
  const previousReduced = priorPrescription({ readiness: "meaningfully_poor" });
  assert.equal(project(prescription, { previousPrescriptions: [previousReduced] }).exercises[0].reasonText, null,
    "Two reduced sets both times is unchanged");
});

test("verified previous targets expose add-set and held-target changes, with exact identity and version gates", () => {
  const prior = priorPrescription();
  const plateau = input(); plateau.exercises[0].history = observedHistory({ count: 4 });
  const added = coach.prescribeSession(plateau);
  assert.ok(added.exercises[0].codes.includes("add_set"));
  assert.equal(added.exercises[0].plannedSetCount, 4);
  assert.equal(project(added, { previousPrescriptions: [prior] }).exercises[0].reasonText, added.exercises[0].sessionStart.reasonText);
  const held = input(); held.exercises[0].history = observedHistory({ count: 2, reps: 8 });
  const changed = coach.prescribeSession(held);
  assert.deepEqual(changed.exercises[0].sessionStart.codes, ["hold"]);
  assert.equal(project(changed, { previousPrescriptions: [prior] }).exercises[0].reasonText, changed.exercises[0].sessionStart.reasonText);
  for (const mismatch of [priorPrescription({ version: "different" }), priorPrescription({ identity: "different|external" }),
    priorPrescription({ resistanceType: "bodyweight_plus_load" })]) {
    assert.equal(project(changed, { previousPrescriptions: [mismatch] }).exercises[0].reasonText, null);
  }
  const latest = input(); latest.sessionId = "latest-prior"; latest.evaluationId = "latest-prior-evaluation";
  latest.createdAt = "2026-01-09T10:00:00.000Z"; latest.date = "2026-01-09";
  latest.exercises[0].roles[0].defaultReps = 8;
  const unchangedLatest = coach.prescribeSession(latest);
  assert.equal(project(changed, { previousPrescriptions: [unchangedLatest, prior] }).exercises[0].reasonText, null,
    "The newest compatible prior plan establishes the comparison, irrespective of input order");
  const future = input(); future.createdAt = "2026-01-11T10:00:00.000Z"; future.date = "2026-01-11";
  assert.equal(project(changed, { previousPrescriptions: [coach.prescribeSession(future)] }).exercises[0].reasonText, null,
    "A later prescription is not comparison evidence");
});

test("previous-target comparisons use physical loads rather than stored display units", () => {
  const prior = priorPrescription();
  const source = input(); source.exercises[0].roles[0].defaultLoad = { value: 45.359237, unit: "kg" };
  const unchanged = coach.prescribeSession(source);
  assert.equal(project(unchanged, { previousPrescriptions: [prior] }).exercises[0].reasonText, null);
  source.exercises[0].roles[0].defaultReps = 11;
  const changed = coach.prescribeSession(source);
  assert.equal(project(changed, { previousPrescriptions: [prior] }).exercises[0].reasonText, changed.exercises[0].sessionStart.reasonText);
});

test("between-set projection exposes the latest active revision and exact reason", () => {
  const prescription = revised();
  assert.equal(coach.validatePrescription(prescription).ok, true);
  const exercise = project(prescription).exercises[0];
  assert.equal(exercise.reasonText, prescription.exercises[0].reasonText);
  assert.equal(exercise.sets[1].target.reps, 9);
  assert.deepEqual(exercise.sets[1].anchor, { load: 100, reps: 10, unit: "lb" });
  assert.equal(exercise.sets[1].revision.code, "reduce_reps");
  assert.deepEqual(Object.keys(exercise.sets[1].revision).sort(), ["code", "from", "locked", "revisionId", "to"]);
  assert.equal(exercise.sets[0].revision, null, "Evaluation audit records are not UI revisions");
});

test("revision off returns anchors, no revision, optional flag or post-revision reason", () => {
  const prescription = revised();
  const channel = project(prescription, { revisionEnabled: false });
  channel.exercises[0].sets.forEach((row) => {
    assert.deepEqual(row.target, row.anchor);
    assert.equal(row.revision, null);
    assert.equal(row.optional, false);
  });
  assert.equal(channel.exercises[0].reasonText, null);
  assert.deepEqual(channel.exercises[0].codes, prescription.exercises[0].sessionStart.codes);
});

test("Undo displays the engine's lock, restored target and reason", () => {
  const prescription = coach.undoRevision(revised(), "s1", "2026-01-10T10:06:00.000Z");
  const exercise = project(prescription).exercises[0];
  assert.deepEqual(exercise.sets[1].target, exercise.sets[1].anchor);
  assert.equal(exercise.sets[1].revision.locked, true);
  assert.equal(exercise.sets[1].revision.code, "undo_lock");
  assert.equal(exercise.reasonText, prescription.exercises[0].reasonText);
});

test("explicit stop decisions suppress all targets until Continue, with cleared archives ignored", () => {
  const prescription = revised();
  const stop = { outcome: "action", category: "pain_or_illness", scope: { type: "session" },
    action: { code: "stop_or_skip_work" }, handling: "pending" };
  assert.deepEqual(project(prescription, { exceptionDecisions: [stop] }),
    { visible: false, reason: "exception_unresolved" });
  assert.equal(project(prescription, { exceptionDecisions: [{ ...stop, handling: "overridden" }] }).visible, true);
  assert.equal(project(prescription, { exceptionDecisions: [{ outcome: "no_action" }, stop] }).visible, true);
  assert.equal(project(prescription, { exceptionDecisions: [{ ...stop, handling: "overridden" }, stop] }).visible, true);
  assert.equal(project(prescription, { exceptionDecisions: [{ ...stop, category: "readiness" }] }).visible, true);
});

test("session suspension hides all; an exercise suspension leaves other exercises visible", () => {
  const source = input();
  source.exercises.push({ ...source.exercises[0], exerciseId: "second", variantIdentity: "second|external",
    sets: source.exercises[0].sets.map((set) => ({ ...set, setId: "second-" + set.setId })) });
  const prescription = coach.prescribeSession(source);
  assert.deepEqual(project(prescription, { suspensions: [{ scope: "session", reason: "readiness_changed" }] }),
    { visible: false, reason: "suspended" });
  const channel = project(prescription, { suspensions: [{ scope: "exercise", exerciseId: "synthetic-bench" }] });
  assert.deepEqual(channel.exercises.map((exercise) => exercise.exerciseId), ["second"]);
});

test("factual-only exercises expose no targets, even when the engine has a non-null seed", () => {
  for (const resistanceType of ["duration", "distance", "external"]) {
    const source = input();
    source.exercises[0].resistanceType = resistanceType;
    if (resistanceType === "external") source.exercises[0].roles[0].increment = null;
    const prescription = coach.prescribeSession(source);
    assert.ok(prescription.exercises[0].codes.includes("factual_only"));
    assert.deepEqual(project(prescription), { visible: false, reason: "no_targets" });
  }
});

test("actual set ownership determines virtual rows rather than set-id spelling", () => {
  const prescription = coach.prescribeSession(input());
  const channel = project(prescription, { actualSetIds: ["s0", "s2"] });
  assert.deepEqual(channel.exercises[0].sets.map((row) => row.virtual), [false, true, false]);
});

test("view helper delegates mode, decisions, suspension and actual ownership to the channel", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "app-views.js"), "utf8");
  const start = source.indexOf("function coachingTargetsForSession(");
  const end = source.indexOf("\n      function ", start + 1);
  assert.ok(start >= 0 && end > start);
  const session = { id: "synthetic-session", coachingPrescription: coach.prescribeSession(input()),
    resolvedActions: [], coachingSuspensions: [] };
  const validate = (owner, prescription) => ({ ok: owner === session && coach.validatePrescription(prescription).ok });
  const helper = vm.runInNewContext("(" + source.slice(start, end).trim() + ")", {
    exceptionResolverApi: resolver, effectiveCoachMode: () => "show", validateSessionCoachingPrescription: validate,
    data: { settings: { coachBetweenSetRevisions: true }, exercises: [{ id: "synthetic-bench", sessionId: session.id },
      { id: "foreign-exercise", sessionId: "other-session" }], sets: [{ id: "s0", exerciseId: "synthetic-bench" },
      { id: "s1", exerciseId: "foreign-exercise" }] }
  });
  const result = helper(session);
  assert.equal(result.visible, true);
  assert.deepEqual(result.exercises[0].sets.map((row) => row.virtual), [false, true, true]);
  assert.ok((source.match(/coachingTargetsForSession\(/g) || []).length > 1, "The set table consumes the resolver channel");
  assert.doesNotMatch(source, /ComprehensiveFitnessCoach\./, "Views never call the coach module directly");
});

console.log("coach-prescription-channel: " + count + " passed, " + failures.length + " failed");
if (failures.length) process.exitCode = 1;
