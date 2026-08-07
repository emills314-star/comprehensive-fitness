"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const resolver = require("../exception-resolver.js");

const foundation = fs.readFileSync("app-foundation.js", "utf8");
const history = fs.readFileSync("app-history.js", "utf8");
const views = fs.readFileSync("app-views.js", "utf8");
const workout = fs.readFileSync("app-workout.js", "utf8");
const analysis = fs.readFileSync("app-analysis.js", "utf8");
const imports = fs.readFileSync("app-import.js", "utf8");
const interactions = fs.readFileSync("app.js", "utf8");

function functionSource(input, name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(input);
  assert.ok(match, `Missing production function ${name}`);
  const bodyStart = input.indexOf("{", input.indexOf(")", match.index) + 1);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < input.length; index += 1) {
    const current = input[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === quote) quote = "";
      continue;
    }
    if (current === "'" || current === '"' || current === "`") {
      quote = current;
      continue;
    }
    if (current === "{") depth += 1;
    if (current === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(match.index, index + 1);
    }
  }
  assert.fail(`Unclosed production function ${name}`);
}

const qualification = Object.fromEntries(resolver.QUALIFICATION_FIELDS.map((field) => [field, true]));
const evaluatedAt = "2026-08-01T15:00:00.000Z";
function candidate({ id, category, action, source, effectiveAt = evaluatedAt, expiresAt = null }) {
  return {
    candidateVersion: resolver.CANDIDATE_VERSION,
    candidateId: id,
    detector: { id: `detector-${id}`, version: "detector/1.0.0", ruleVersion: "rule/1.0.0" },
    evaluatedAt,
    effectiveAt,
    expiresAt,
    returnCondition: expiresAt ? null : { type: "input_cleared_or_workout_ended" },
    category,
    explicitSafetyInput: category === "pain_or_illness",
    scope: { type: "session" },
    action,
    reasonCodes: [id],
    sourceReferences: [source],
    evidence: [{ sourceReference: source, provenance: "recorded", required: true }],
    qualification
  };
}

const poor = candidate({
  id: "meaningfully-poor",
  category: "readiness",
  action: { code: "use_lighter_session", parameters: {} },
  source: "session:test:recovery.readinessDeviation"
});
const pain = candidate({
  id: "explicit-pain",
  category: "pain_or_illness",
  action: { code: "stop_or_skip_work", parameters: { mode: "stop_or_skip" } },
  source: "session:test:recovery.pain"
});
const resolvedPoor = resolver.resolveExceptionCandidates({ evaluatedAt, candidates: [poor] });
assert.equal(resolvedPoor.actions.length, 1);
assert.equal(resolvedPoor.actions[0].action.code, "use_lighter_session");
assert.deepEqual(resolvedPoor.actions[0].action.parameters, {}, "Categorical readiness must not invent numeric adjustment parameters");
assert.equal(resolvedPoor.actions[0].handling, "pending", "A resolved action must stay pending before an explicit choice");

const resolvedPain = resolver.resolveExceptionCandidates({ evaluatedAt, candidates: [poor, pain] });
assert.equal(resolvedPain.actions.length, 1);
assert.equal(resolvedPain.actions[0].category, "pain_or_illness", "Direct pain must win session arbitration");
assert.equal(resolvedPain.actions[0].handling, "pending");
assert.equal(resolver.applyDecisionHandling(resolvedPain.actions[0], "overridden").handling, "overridden");

const superseded = resolver.resolveExceptionCandidates({
  evaluatedAt,
  candidates: [pain],
  priorDecisions: resolvedPoor.decisions
});
assert.equal(superseded.actions[0].supersedesDecisionId, resolvedPoor.actions[0].decisionId, "A changed session action must retain its supersession link");
const mergeDecisionHistory = vm.runInNewContext(`(${functionSource(foundation, "mergeResolvedDecisionHistory")})`);
const handledPrior = { ...resolvedPain.actions[0], handling: "overridden" };
const cleared = resolver.resolveExceptionCandidates({ evaluatedAt: "2026-08-01T15:05:00.000Z", candidates: [], priorDecisions: [handledPrior] });
const preservedHistory = mergeDecisionHistory([handledPrior], cleared.decisions);
assert.equal(preservedHistory[0].outcome, "no_action", "The current decision must remain first for presentation");
assert.equal(preservedHistory[1].decisionId, handledPrior.decisionId, "Reevaluation must retain the superseded decision");
assert.equal(preservedHistory[1].handling, "overridden", "Reevaluation must retain explicit historical handling");

const staleExerciseAction = {
  ...handledPrior,
  decisionId: "historical-exercise-action",
  scope: { type: "exercise", exerciseVariantId: "exercise-test" }
};
const clearedAuditHistory = [preservedHistory[0], preservedHistory[1], staleExerciseAction];
const resolvedActionForVariant = vm.runInNewContext(`(${functionSource(foundation, "resolvedActionForVariant")})`);
assert.equal(resolvedActionForVariant(clearedAuditHistory, "exercise-test"), null, "Current no-action must suppress stale session and exercise actions from target application");
const viewActionContext = vm.createContext({
  canonicalExerciseId: (exercise) => exercise?.performanceExerciseId || exercise?.id || ""
});
vm.runInContext(`${functionSource(views, "resolvedActionForScope")}; this.resolveForScope = resolvedActionForScope;`, viewActionContext);
const clearedAuditSession = { resolvedActions: clearedAuditHistory };
assert.equal(viewActionContext.resolveForScope(clearedAuditSession, "session"), null, "Current no-action must suppress a stale session card");
assert.equal(
  viewActionContext.resolveForScope(clearedAuditSession, "exercise", { id: "exercise-test", performanceExerciseId: "exercise-test" }),
  null,
  "Current no-action must suppress a stale exercise card"
);
assert.equal(clearedAuditHistory.length, 3, "Current suppression must not delete audit history");

let safetyNow = "2026-08-01T16:00:00.000Z";
let resolverInput = null;
const engineeringRecords = [];
const safetyContext = vm.createContext({
  READINESS_DEVIATIONS: new Set(["", "usual", "unusually_good", "meaningfully_poor"]),
  exceptionResolverApi: {
    CANDIDATE_VERSION: resolver.CANDIDATE_VERSION,
    QUALIFICATION_FIELDS: resolver.QUALIFICATION_FIELDS,
    resolveExceptionCandidates(input) {
      resolverInput = input;
      input.onEngineeringError({
        code: "detector_error",
        module: "exception-resolver",
        ruleVersion: "candidate-normalization/1.0.0",
        privateNote: "must not escape"
      });
      return { decisions: [] };
    }
  },
  isoNow: () => safetyNow,
  console: {
    error(label, record) {
      engineeringRecords.push({ label, record: { ...record } });
    }
  }
});
for (const name of [
  "cleanRecovery",
  "passedExceptionQualification",
  "explicitSafetyCandidate",
  "reportExceptionResolverEngineeringError",
  "resolveWorkoutExceptions"
]) {
  vm.runInContext(`${functionSource(foundation, name)}; this.${name} = ${name};`, safetyContext);
}
const directSession = { id: "private-session-id", resolvedActions: [] };
const bothSafetyReasons = safetyContext.explicitSafetyCandidate(directSession, {
  illness: true,
  pain: true,
  affectedMuscle: "private affected area"
});
assert.deepEqual(Array.from(bothSafetyReasons.reasonCodes), ["explicit_illness", "explicit_pain_or_injury"], "Direct illness and pain must both remain represented");
assert.deepEqual(
  Array.from(bothSafetyReasons.sourceReferences),
  ["session:private-session-id:recovery.illness", "session:private-session-id:recovery.pain"]
);
assert.deepEqual(Array.from(bothSafetyReasons.evidence, (item) => item.provenance), ["recorded", "recorded"], "Direct safety evidence must retain recorded provenance");
assert.equal(
  safetyContext.explicitSafetyCandidate(directSession, { illness: true, affectedMuscle: "legacy inferred injury" }),
  null,
  "A legacy illness-plus-affected-area inference must never become a live pain action"
);
const cleanedLegacy = safetyContext.cleanRecovery({ illness: true, affectedMuscle: "legacy inferred injury" });
assert.equal(cleanedLegacy.illness, true, "Legacy source bytes must remain recognizable");
assert.equal(Object.hasOwn(cleanedLegacy, "pain"), false, "Normalization must not rewrite legacy inferred pain as a direct pain observation");

const oldEffectiveAt = "2026-08-01T14:00:00.000Z";
const oldPainAction = {
  ...handledPrior,
  sourceReferences: ["session:private-session-id:recovery.pain"],
  effectiveAt: oldEffectiveAt
};
const uninterrupted = safetyContext.explicitSafetyCandidate({ id: directSession.id, resolvedActions: [oldPainAction] }, { illness: false, pain: true });
assert.equal(uninterrupted.effectiveAt, oldEffectiveAt, "An uninterrupted recorded safety interval may retain its original effective time");
const firstDirectDecision = resolver.resolveExceptionCandidates({
  evaluatedAt: safetyNow,
  candidates: [JSON.parse(JSON.stringify(safetyContext.explicitSafetyCandidate(directSession, { illness: false, pain: true })))]
}).sessionDecision;
const handledDirectDecision = resolver.applyDecisionHandling(firstDirectDecision, "accepted");
safetyNow = "2026-08-01T16:03:00.000Z";
const reevaluatedDirect = resolver.resolveExceptionCandidates({
  evaluatedAt: safetyNow,
  candidates: [JSON.parse(JSON.stringify(safetyContext.explicitSafetyCandidate(
    { id: directSession.id, resolvedActions: [handledDirectDecision] },
    { illness: false, pain: true, readinessDeviation: "usual" }
  )))],
  priorDecisions: [handledDirectDecision]
}).sessionDecision;
assert.equal(reevaluatedDirect.effectiveAt, firstDirectDecision.effectiveAt, "An unrelated recovery edit must retain the active safety interval");
assert.equal(reevaluatedDirect.decisionId, handledDirectDecision.decisionId);
assert.equal(reevaluatedDirect.handling, "accepted", "An unrelated recovery edit must retain explicit handling");
safetyNow = "2026-08-01T16:05:00.000Z";
const readded = safetyContext.explicitSafetyCandidate(
  { id: directSession.id, resolvedActions: [preservedHistory[0], oldPainAction] },
  { illness: false, pain: true }
);
assert.equal(readded.effectiveAt, safetyNow, "A cleared then re-added safety observation must start a new effective interval");
assert.notEqual(readded.effectiveAt, oldEffectiveAt);

safetyContext.resolveWorkoutExceptions(directSession, { illness: false, pain: true, privateNote: "private note" });
assert.equal(typeof resolverInput.onEngineeringError, "function", "The application must wire resolver detector failures to the engineering callback");
assert.deepEqual(engineeringRecords, [{
  label: "[CF exception resolver]",
  record: {
    code: "detector_error",
    module: "exception-resolver",
    ruleVersion: "candidate-normalization/1.0.0"
  }
}]);
assert.doesNotMatch(JSON.stringify(engineeringRecords), /private-session-id|private note|private affected area|must not escape/, "Engineering output must remain privacy-safe and bounded");

const expired = candidate({
  id: "expired-readiness",
  category: "readiness",
  action: { code: "use_lighter_session", parameters: {} },
  source: "session:test:expired",
  effectiveAt: "2026-08-01T13:00:00.000Z",
  expiresAt: "2026-08-01T14:00:00.000Z"
});
const expiredResult = resolver.resolveExceptionCandidates({ evaluatedAt, candidates: [expired] });
assert.equal(expiredResult.actions.length, 0);
assert.ok(expiredResult.suppressions.some((item) => item.reason === "stale_or_not_effective"));

const durationContext = {
  WORKOUT_DURATION_SEMANTICS_VERSION: "comprehensive-fitness-workout-duration/1.0.0",
  isSessionSubmitted: (session) => session?.submitted === true,
  isoNow: () => evaluatedAt
};
vm.createContext(durationContext);
for (const name of ["workoutDurationTimestamp", "legacyDraftKnownActiveDurationMs", "workoutActiveDurationMs", "startWorkoutDuration", "pauseWorkoutDuration", "finalizeWorkoutDurationSession"]) {
  vm.runInContext(`${functionSource(foundation, name)}; this.${name} = ${name};`, durationContext);
}
const started = durationContext.startWorkoutDuration({ id: "duration-test", submitted: false }, "2026-08-01T15:00:00.000Z");
const paused = durationContext.pauseWorkoutDuration(started, "2026-08-01T15:00:10.000Z");
assert.equal(paused.activeDurationMs, 10_000);
assert.equal(durationContext.workoutActiveDurationMs(structuredClone(paused), Date.parse("2026-08-01T16:00:00.000Z")), 10_000, "Paused duration must not grow across reload or wall-clock time");
const resumed = durationContext.startWorkoutDuration(structuredClone(paused), "2026-08-01T16:00:00.000Z");
const finalized = durationContext.finalizeWorkoutDurationSession(resumed, "2026-08-01T16:00:05.000Z");
assert.equal(finalized.activeDurationMs, 15_000);
assert.equal(finalized.durationSeconds, 15, "Submitted duration must derive from accumulated active time");
const legacy = { id: "legacy", submitted: true, durationSeconds: 321, startedAt: "2020-01-01T00:00:00.000Z", submittedAt: "2020-01-01T04:00:00.000Z" };
assert.equal(durationContext.workoutActiveDurationMs(legacy), null);
assert.equal(legacy.durationSeconds, 321, "Legacy duration bytes must remain unchanged");
const legacyActive = durationContext.startWorkoutDuration({ id: "legacy-active", submitted: false, durationSeconds: 321 }, "2026-08-01T15:00:00.000Z");
assert.equal(legacyActive.activeDurationMs, 321_000, "Resuming a legacy active workout must retain its recorded elapsed duration");
const legacyDraftFixture = JSON.parse(fs.readFileSync("tests/fixtures/redesign-m0/active-draft-recovery.json", "utf8"));
const fixtureSavedAt = Date.parse(legacyDraftFixture.savedAt);
const knownFixtureDuration = durationContext.legacyDraftKnownActiveDurationMs(legacyDraftFixture, fixtureSavedAt, legacyDraftFixture.session);
assert.equal(knownFixtureDuration, 30 * 60 * 1000, "The committed startedAt-only draft must retain its known 30 pre-save minutes");
const recoveredLegacyDraft = durationContext.startWorkoutDuration({
  ...legacyDraftFixture.session,
  durationSemanticsVersion: durationContext.WORKOUT_DURATION_SEMANTICS_VERSION,
  activeDurationMs: knownFixtureDuration,
  activeDurationStartedAt: "",
  workoutPausedAt: ""
}, "2026-08-01T15:00:00.000Z");
assert.equal(recoveredLegacyDraft.activeDurationMs, 30 * 60 * 1000, "Draft recovery must not invent elapsed time beyond known stored timestamps");
assert.equal(recoveredLegacyDraft.activeDurationStartedAt, "2026-08-01T15:00:00.000Z", "Known legacy elapsed time must be preserved before normal timing resumes");

const targetContext = {};
vm.createContext(targetContext);
vm.runInContext(`${functionSource(foundation, "applyResolvedActionToStableTarget")}; this.apply = applyResolvedActionToStableTarget;`, targetContext);
const stableTarget = { sets: 4, repLow: 6, repHigh: 8, rpe: 8, restSeconds: 180 };
const stableBytes = JSON.stringify(stableTarget);
targetContext.apply(stableTarget, resolvedPoor.actions[0]);
assert.equal(JSON.stringify(stableTarget), stableBytes, "A readiness action must not mutate stable target bytes");

assert.match(foundation, /expectedTemplateId:\s*""/);
assert.match(foundation, /model\.settings\.expectedTemplateId\s*=\s*""/, "Migration must clear an invalid legacy pointer instead of selecting an unrelated routine");
assert.match(views, /const nextTemplate = expectedWorkoutTemplate\(\)/);
assert.doesNotMatch(functionSource(views, "renderLiftHome"), /data\.templates\[0\]/, "Today must not relabel array position zero as expected");
assert.match(functionSource(views, "renderLiftHome"), /if \(running\)[\s\S]*renderResolvedAction\(resolvedActionForScope\(running, "session"\)/, "Today must present an active session exception before Resume");
assert.match(analysis, /data-action="template-scheduled-weekday"/);
assert.match(interactions, /action === "template-scheduled-weekday"[\s\S]*scheduledWeekdays/);

assert.match(foundation, /readinessDeviation/);
assert.doesNotMatch(foundation, /function explicitReadinessCandidate/, "No readiness detector may feed the live resolver before calibration and independent approval");
assert.doesNotMatch(functionSource(foundation, "resolveWorkoutExceptions"), /readinessCandidate|use_lighter_session/, "The current live pipeline is limited to the approved direct safety rule");
assert.match(functionSource(foundation, "resolveWorkoutExceptions"), /onEngineeringError:\s*reportExceptionResolverEngineeringError/);
assert.match(foundation, /returnCondition:\s*\{\s*type:\s*"input_cleared_or_workout_ended"\s*\}/);
assert.match(views, /template-readiness-soreness/, "Optional readiness must expose the approved compact unusual-soreness input");
assert.doesNotMatch(views, /template-readiness-(?:sleep|hrv|resting|nutrition|protein)/);
assert.doesNotMatch(interactions, /baseline-(?:sleep|hrv|resting|soreness|band)|patchReadinessBaseline/);
assert.doesNotMatch(analysis, /data-action="baseline-|Readiness baseline/);
assert.match(views, /data-choice="stop"[\s\S]*data-choice="modify"[\s\S]*data-choice="continue"/);
assert.match(views, /data-choice="lighter"[\s\S]*Continue as planned/);
assert.match(workout, /action\.handling !== "pending"[\s\S]*applyDecisionHandling/, "Only an explicit pending-action choice may persist handling");
assert.match(history, /const session = finalizeWorkoutDurationSession\(startWorkoutDuration\(sourceSession\)\)/);
assert.match(interactions, /if \(action === "confirm-submit-workout"\)[\s\S]{0,120}submitWorkout\(activeSessionId\)/);
assert.match(imports, /"expectedTemplateId"/);
assert.match(imports, /"durationSemanticsVersion"[\s\S]*"activeDurationMs"[\s\S]*"activeDurationStartedAt"[\s\S]*"workoutPausedAt"/);

console.log("Final contract state checks passed (expected pointer, recorded readiness, approved direct safety rule, and active-time duration).");
