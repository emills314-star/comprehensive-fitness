"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const resolver = require("../exception-resolver");

const root = path.resolve(__dirname, "..");
const fixtureDirectory = path.join(root, "tests", "fixtures", "redesign-m2");
const EVALUATED_AT = "2030-01-15T12:00:00.000Z";
const QUALIFIED = Object.freeze(Object.fromEntries(resolver.QUALIFICATION_FIELDS.map((field) => [field, true])));

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDirectory, name), "utf8"));
}

function candidate(overrides = {}) {
  const id = overrides.candidateId || "candidate-test-a";
  const sourceReference = overrides.sourceReference || "observation-test-a";
  return {
    candidateVersion: resolver.CANDIDATE_VERSION,
    candidateId: id,
    detector: { id: "detector-test", version: "1.0.0", ruleVersion: "rule-test/1.0.0" },
    evaluatedAt: "2030-01-15T11:55:00.000Z",
    effectiveAt: "2030-01-15T11:55:00.000Z",
    expiresAt: "2030-01-16T12:00:00.000Z",
    category: "fatigue",
    scope: { type: "session" },
    action: { code: "reduce_sets", parameters: { setReductionCount: 1 } },
    reasonCodes: ["test-qualified"],
    sourceReferences: [sourceReference],
    inputDigest: "digest-" + id,
    evidence: [{ sourceReference, provenance: "inferred", required: true }],
    qualification: { ...QUALIFIED },
    ...overrides
  };
}

function resolve(candidates, extra = {}) {
  return resolver.resolveExceptionCandidates({ evaluatedAt: EVALUATED_AT, candidates, ...extra });
}

function suppressionReason(result, candidateId) {
  return result.suppressions.find((item) => item.candidateId === candidateId)?.reason || null;
}

function test(name, run) {
  try {
    run();
    console.log("PASS", name);
  } catch (error) {
    console.error("FAIL", name);
    throw error;
  }
}

test("ordinary sessions are deterministically silent and stable targets remain immutable", () => {
  const input = fixture("ordinary-silence.json");
  const originalTargets = JSON.stringify(input.stableTargets);
  Object.freeze(input.stableTargets.repRange);
  Object.freeze(input.stableTargets);
  const first = resolver.resolveExceptionCandidates(input);
  const second = resolver.resolveExceptionCandidates(input);
  assert.equal(first.actions.length, 0);
  assert.equal(first.decisions.length, 1);
  assert.equal(first.sessionDecision.outcome, "no_action");
  assert.equal(first.sessionDecision.category, "none");
  assert.equal(first.sessionDecision.action.code, "no_action");
  assert.equal(resolver.validateResolvedAction(first.sessionDecision).valid, true);
  assert.equal(
    resolver.validateResolvedAction({ ...first.sessionDecision, effectiveAt: null }).reason,
    "invalid_no_action_boundary"
  );
  assert.equal(first.evaluationDigest, second.evaluationDigest);
  assert.equal(first.sessionDecision.decisionId, second.sessionDecision.decisionId);
  assert.equal(JSON.stringify(input.stableTargets), originalTargets);
});

test("missing, ambiguous, uncalibrated, and stale evidence are suppressed without visible coaching", () => {
  const ambiguous = resolver.resolveExceptionCandidates(fixture("ambiguous-evidence.json"));
  assert.equal(ambiguous.actions.length, 0);
  assert.equal(suppressionReason(ambiguous, "candidate-ambiguous-a"), "missing_or_ambiguous_evidence");

  const uncalibrated = candidate({ candidateId: "candidate-uncalibrated", qualification: { ...QUALIFIED, calibration: false } });
  const stale = candidate({ candidateId: "candidate-stale", expiresAt: "2030-01-15T11:59:59.000Z" });
  const missingSource = candidate({ candidateId: "candidate-no-source", sourceReferences: [], inputDigest: "", evidence: [{ sourceReference: "observation-orphan", provenance: "inferred", required: true }] });
  const missingRequired = candidate({ candidateId: "candidate-missing-required", evidence: [{ sourceReference: "observation-test-a", provenance: "missing", required: true }] });
  const result = resolve([uncalibrated, stale, missingSource, missingRequired]);
  assert.equal(result.actions.length, 0);
  assert.equal(suppressionReason(result, "candidate-uncalibrated"), "qualification_failed");
  assert.equal(suppressionReason(result, "candidate-stale"), "stale_or_not_effective");
  assert.equal(suppressionReason(result, "candidate-no-source"), "missing_source_reference");
  assert.equal(suppressionReason(result, "candidate-missing-required"), "missing_or_ambiguous_evidence");

  const optionalMissing = candidate({
    candidateId: "candidate-optional-missing",
    evidence: [
      { sourceReference: "observation-test-a", provenance: "inferred", required: true },
      { sourceReference: "observation-optional-a", provenance: "missing", required: false }
    ]
  });
  assert.equal(resolve([optionalMissing]).actions.length, 1, "missing optional data must not count against an otherwise qualified action");
});

test("explicit pain or illness wins precedence and suppresses ordinary plateau output", () => {
  const result = resolver.resolveExceptionCandidates(fixture("pain-precedence.json"));
  assert.equal(result.actions.length, 1);
  assert.equal(result.sessionDecision.category, "pain_or_illness");
  assert.equal(result.sessionDecision.action.code, "stop_or_skip_work");
  assert.equal(result.exerciseDecision, null);
  assert.equal(suppressionReason(result, "candidate-pain-plateau"), "suppressed_by_safety_action");

  const inferredPain = candidate({
    candidateId: "candidate-inferred-pain",
    category: "pain_or_illness",
    explicitSafetyInput: false,
    action: { code: "stop_or_skip_work", parameters: { mode: "stop" } },
    evidence: [{ sourceReference: "observation-test-a", provenance: "inferred", required: true }]
  });
  assert.equal(suppressionReason(resolve([inferredPain]), "candidate-inferred-pain"), "safety_input_not_explicit");
});

test("deload precedence and the one-session plus one-stricter-exercise cap are deterministic", () => {
  const input = fixture("arbitration.json");
  const result = resolver.resolveExceptionCandidates(input);
  assert.equal(result.actions.length, 2);
  assert.equal(result.sessionDecision.category, "deload", "deload precedence must win over even a stricter readiness candidate");
  assert.equal(result.sessionDecision.action.code, "time_bounded_deload");
  assert.equal(result.exerciseDecision.category, "fatigue");
  assert.equal(result.exerciseDecision.scope.exerciseVariantId, "variant-alpha");
  assert.equal(result.exerciseDecision.action.code, "stop_or_skip_work");
  assert.equal(suppressionReason(result, "candidate-exercise-plateau"), "lost_arbitration");

  const reversed = resolver.resolveExceptionCandidates({ ...input, candidates: [...input.candidates].reverse() });
  assert.equal(reversed.evaluationDigest, result.evaluationDigest);
  assert.deepEqual(reversed.decisions, result.decisions);
});

test("readiness and fatigue select the stricter coherent action at a shared scope", () => {
  const readiness = candidate({
    candidateId: "candidate-readiness-a",
    category: "readiness",
    action: { code: "reduce_sets", parameters: { setReductionCount: 1 } },
    sourceReference: "observation-readiness-a",
    sourceReferences: ["observation-readiness-a"],
    evidence: [{ sourceReference: "observation-readiness-a", provenance: "recorded", required: true }]
  });
  const fatigue = candidate({
    candidateId: "candidate-fatigue-a",
    category: "fatigue",
    action: { code: "use_lighter_session", parameters: { rpeCeiling: 7 } },
    sourceReference: "observation-fatigue-a",
    sourceReferences: ["observation-fatigue-a"],
    evidence: [{ sourceReference: "observation-fatigue-a", provenance: "inferred", required: true }]
  });
  const result = resolve([readiness, fatigue]);
  assert.equal(result.actions.length, 1);
  assert.equal(result.sessionDecision.category, "fatigue");
  assert.equal(result.sessionDecision.action.code, "use_lighter_session");
  assert.equal(suppressionReason(result, "candidate-readiness-a"), "lost_arbitration");
});

test("an equal or weaker exercise action is redundant under a session action", () => {
  const session = candidate({ candidateId: "candidate-session-light", action: { code: "use_lighter_session", parameters: { rpeCeiling: 7 } } });
  const exercise = candidate({
    candidateId: "candidate-exercise-cap",
    scope: { type: "exercise", exerciseVariantId: "variant-alpha" },
    action: { code: "cap_rpe", parameters: { rpeCeiling: 7 } },
    sourceReference: "observation-exercise-cap",
    sourceReferences: ["observation-exercise-cap"],
    evidence: [{ sourceReference: "observation-exercise-cap", provenance: "inferred", required: true }]
  });
  const result = resolve([session, exercise]);
  assert.equal(result.actions.length, 1);
  assert.equal(result.exerciseDecision, null);
  assert.equal(suppressionReason(result, "candidate-exercise-cap"), "exercise_not_materially_stricter");
});

test("supporting candidates are absorbed into one structural action", () => {
  const first = candidate({ candidateId: "candidate-support-a", reasonCodes: ["reason-a"] });
  const second = candidate({
    candidateId: "candidate-support-b",
    category: "readiness",
    reasonCodes: ["reason-b"],
    sourceReference: "observation-support-b",
    sourceReferences: ["observation-support-b"],
    evidence: [{ sourceReference: "observation-support-b", provenance: "recorded", required: true }]
  });
  const result = resolve([first, second]);
  assert.equal(result.actions.length, 1);
  assert.deepEqual(result.sessionDecision.reasonCodes, ["reason-a", "reason-b"]);
  assert.deepEqual(result.absorbedCandidateIds, ["candidate-support-a", "candidate-support-b"]);
});

test("resolver and detector failure remain silent except for the canonical explicit-safety fallback", () => {
  const detectorRecords = [];
  const detectorFailure = resolve(
    [{ candidateId: "candidate-detector-error", status: "error" }],
    { onEngineeringError: (record) => detectorRecords.push(record) }
  );
  assert.equal(detectorFailure.actions.length, 0);
  assert.equal(suppressionReason(detectorFailure, "candidate-detector-error"), "detector_error");
  assert.deepEqual(detectorRecords, [{
    code: "detector_error",
    module: "exception-resolver",
    ruleVersion: "candidate-normalization/1.0.0"
  }]);

  const brokenWithoutSafety = { evaluatedAt: EVALUATED_AT, get candidates() { throw new Error("synthetic resolver failure"); } };
  const silent = resolver.resolveExceptionCandidates(brokenWithoutSafety);
  assert.equal(silent.actions.length, 0);
  assert.equal(silent.failureCode, "resolver_error_silenced");
  assert.deepEqual(silent.sessionDecision.reasonCodes, ["resolver_failure"], "failure silence must not claim an ordinary no-action result");

  const brokenWithSafety = {
    evaluatedAt: EVALUATED_AT,
    get candidates() { throw new Error("synthetic resolver failure"); },
    explicitSafetyObservation: { explicit: true, observedAt: EVALUATED_AT, sourceReference: "observation-explicit-safety", scope: { type: "session" } }
  };
  const fallback = resolver.resolveExceptionCandidates(brokenWithSafety);
  assert.equal(fallback.actions.length, 1);
  assert.equal(fallback.failureCode, "resolver_error_safety_fallback");
  assert.equal(fallback.sessionDecision.category, "pain_or_illness");
  assert.equal(fallback.sessionDecision.action.code, "stop_or_skip_work");
});

test("candidate exceptions emit only a deterministic privacy-safe engineering record", () => {
  const sensitiveFragments = [
    "Private Person",
    "private note about pain",
    "observation-private-8392",
    "candidate-private-4711",
    "detector-private-name",
    "private-detector/9.9.9",
    "private-person-rule/8.8.8",
    "317.25"
  ];
  const throwingCandidate = candidate({
    candidateId: "candidate-private-4711",
    detector: {
      id: "detector-private-name",
      version: "private-detector/9.9.9",
      ruleVersion: "private-person-rule/8.8.8"
    },
    sourceReference: "observation-private-8392",
    sourceReferences: ["observation-private-8392"],
    evidence: [{ sourceReference: "observation-private-8392", provenance: "recorded", required: true }],
    privateObservation: {
      name: "Private Person",
      note: "private note about pain",
      value: 317.25
    }
  });
  Object.defineProperty(throwingCandidate, "action", {
    enumerable: true,
    get() {
      throw new Error(sensitiveFragments.join(" | "));
    }
  });

  const firstRecords = [];
  const first = resolve([throwingCandidate], {
    onEngineeringError: (record) => firstRecords.push(record)
  });
  const secondRecords = [];
  const second = resolve([throwingCandidate, candidate({ candidateId: "candidate-unaffected" })], {
    onEngineeringError: (record) => secondRecords.push(record)
  });

  assert.equal(first.actions.length, 0);
  assert.equal(first.sessionDecision.outcome, "no_action");
  assert.equal(suppressionReason(first, "candidate-private-4711"), "candidate_normalization_error");
  assert.equal(Object.hasOwn(first, "engineeringErrors"), false, "engineering records must not enter product result state");
  assert.equal(second.actions.length, 1, "one broken candidate must not suppress an unaffected candidate");
  assert.deepEqual(second.absorbedCandidateIds, ["candidate-unaffected"]);
  assert.deepEqual(firstRecords, [{
    code: "candidate_normalization_error",
    module: "exception-resolver",
    ruleVersion: "candidate-normalization/1.0.0"
  }]);
  assert.deepEqual(secondRecords, firstRecords, "the same failure path must emit the same bounded record");
  assert.deepEqual(Object.keys(firstRecords[0]).sort(), ["code", "module", "ruleVersion"]);
  assert.equal(Object.isFrozen(firstRecords[0]), true);
  const serializedRecord = JSON.stringify(firstRecords);
  sensitiveFragments.forEach((fragment) => {
    assert.equal(serializedRecord.includes(fragment), false, `engineering record leaked sensitive fragment: ${fragment}`);
  });

  assert.doesNotThrow(() => resolve([throwingCandidate], {
    onEngineeringError() {
      throw new Error("synthetic reporting failure");
    }
  }), "engineering reporting must not interfere with workout logging");
});

test("decision IDs, input digests, handling, and supersession are stable and auditable", () => {
  const firstCandidate = candidate({ candidateId: "candidate-decision-a" });
  const first = resolve([firstCandidate]);
  const repeated = resolve([firstCandidate]);
  assert.equal(first.evaluationDigest, repeated.evaluationDigest);
  assert.equal(first.sessionDecision.decisionId, repeated.sessionDecision.decisionId);
  assert.match(first.evaluationDigest, /^fnv1a64:[a-f0-9]{16}$/);

  const accepted = resolver.applyDecisionHandling(first.sessionDecision, "accepted");
  assert.equal(accepted.handling, "accepted");
  assert.equal(accepted.decisionId, first.sessionDecision.decisionId);
  assert.equal(first.sessionDecision.handling, "pending");
  assert.equal(resolver.validateResolvedAction(accepted).valid, true);
  assert.deepEqual(
    resolver.validateResolvedAction({ ...accepted, unexpected: true }),
    { valid: false, reason: "unknown_decision_field" },
    "Persisted actions reject fields outside the versioned contract"
  );
  assert.equal(
    resolver.validateResolvedAction({ ...accepted, action: { code: "reduce_load", parameters: { exactLoad: 100 } } }).reason,
    "stable_target_mutation",
    "Persisted actions cannot bypass the stable-target boundary"
  );

  const sameWithPrior = resolve([firstCandidate], { priorDecisions: [accepted] });
  assert.equal(sameWithPrior.sessionDecision.decisionId, accepted.decisionId);
  assert.equal(sameWithPrior.sessionDecision.handling, "accepted");

  const changedCandidate = candidate({ candidateId: "candidate-decision-b", action: { code: "use_lighter_session", parameters: { rpeCeiling: 7 } } });
  const changed = resolve([changedCandidate], { priorDecisions: [accepted] });
  assert.notEqual(changed.sessionDecision.decisionId, accepted.decisionId);
  assert.equal(changed.sessionDecision.supersedesDecisionId, accepted.decisionId);
  assert.equal(changed.sessionDecision.handling, "pending");

  const cleared = resolve([], { priorDecisions: [changed.sessionDecision] });
  assert.equal(cleared.sessionDecision.outcome, "no_action");
  assert.equal(cleared.sessionDecision.supersedesDecisionId, changed.sessionDecision.decisionId);

  const readdedAt = "2030-01-15T12:10:00.000Z";
  const readdedCandidate = candidate({
    candidateId: "candidate-decision-readded",
    evaluatedAt: readdedAt,
    effectiveAt: readdedAt,
    expiresAt: "2030-01-16T12:10:00.000Z"
  });
  const readded = resolver.resolveExceptionCandidates({
    evaluatedAt: readdedAt,
    candidates: [readdedCandidate],
    priorDecisions: [cleared.sessionDecision, changed.sessionDecision, accepted]
  });
  assert.equal(readded.sessionDecision.outcome, "action");
  assert.equal(readded.sessionDecision.effectiveAt, readdedAt, "A safety action re-added after a clear boundary must start a new effective interval");
  assert.notEqual(readded.sessionDecision.effectiveAt, changed.sessionDecision.effectiveAt);
});

test("candidate actions cannot create a normal prescription or mutate stable targets", () => {
  const forbidden = [
    candidate({ candidateId: "candidate-rep-range", action: { code: "use_lighter_session", parameters: { repRange: { min: 8, max: 10 } } } }),
    candidate({ candidateId: "candidate-exact-load", action: { code: "reduce_load", parameters: { loadReductionPercent: 10, exactLoad: 90 } } }),
    candidate({ candidateId: "candidate-normal-rpe", action: { code: "cap_rpe", parameters: { rpeCeiling: 7, targetRpe: 7 } } })
  ];
  const result = resolve(forbidden);
  assert.equal(result.actions.length, 0);
  forbidden.forEach((item) => assert.equal(suppressionReason(result, item.candidateId), "stable_target_mutation"));

  const allowed = resolve([candidate({ candidateId: "candidate-exception-only", action: { code: "reduce_load", parameters: { loadReductionPercent: 10 } } })]);
  assert.equal(allowed.actions.length, 1);
  const serialized = JSON.stringify(allowed.actions);
  assert.doesNotMatch(serialized, /repRange|targetRpe|exactLoad|exactReps|nextLoad|nextReps/);
  assert.equal(allowed.sessionDecision.action.parameters.loadReductionPercent, 10);
});

test("privacy-safe historical replay preserves silence, safety precedence, and identity ambiguity", () => {
  const replay = fixture("historical-replay.json");
  assert.equal(replay.privacy, "synthetic");
  replay.cases.forEach((replayCase) => {
    const result = resolver.resolveExceptionCandidates({
      evaluatedAt: replayCase.evaluatedAt,
      candidates: replayCase.candidates
    });
    assert.equal(result.actions.length, replayCase.expected.actionCount, replayCase.caseId);
    assert.equal(result.sessionDecision.outcome, replayCase.expected.sessionOutcome, replayCase.caseId);
    if (replayCase.expected.category) assert.equal(result.sessionDecision.category, replayCase.expected.category, replayCase.caseId);
    if (replayCase.expected.suppressionReason) {
      assert.equal(result.suppressions[0]?.reason, replayCase.expected.suppressionReason, replayCase.caseId);
    }
  });
});

console.log("Redesign M2 exception resolver contract passed.");
