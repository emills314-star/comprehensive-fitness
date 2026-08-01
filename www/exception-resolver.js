(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FitnessExceptionResolver = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CANDIDATE_VERSION = "comprehensive-fitness-exception-candidate/1.0.0";
  const CONTRACT_VERSION = "comprehensive-fitness-resolved-action/1.0.0";
  const RESOLVER_VERSION = "comprehensive-fitness-exception-resolver/1.0.0";
  const ENGINEERING_ERROR_MODULE = "exception-resolver";
  const CANDIDATE_NORMALIZATION_RULE_VERSION = "candidate-normalization/1.0.0";
  const QUALIFICATION_FIELDS = Object.freeze([
    "identityIntegrity",
    "sourceIntegrity",
    "comparability",
    "sufficiency",
    "freshness",
    "materiality",
    "calibration",
    "actionability",
    "nonDuplication",
    "auditability"
  ]);
  const CATEGORIES = new Set(["pain_or_illness", "deload", "readiness", "fatigue", "plateau"]);
  const HANDLING = new Set(["pending", "accepted", "modified", "ignored", "overridden"]);
  const PROVENANCE = new Set(["recorded", "inferred", "missing", "ambiguous"]);
  const CATEGORY_PRECEDENCE = Object.freeze({ pain_or_illness: 5, deload: 4, readiness: 3, fatigue: 3, plateau: 2 });
  const CATEGORY_TIE_ORDER = Object.freeze({ pain_or_illness: 5, deload: 4, readiness: 3, fatigue: 2, plateau: 1 });
  const ACTION_STRICTNESS = Object.freeze({
    no_action: 0,
    address_plateau: 1,
    reduce_load: 2,
    reduce_sets: 2,
    cap_rpe: 2,
    use_lighter_session: 3,
    use_lighter_exercise: 3,
    time_bounded_deload: 4,
    stop_or_skip_work: 5,
    skip_exercise: 5
  });
  const ALLOWED_ACTION_CODES = new Set(Object.keys(ACTION_STRICTNESS).filter((code) => code !== "no_action"));
  const FORBIDDEN_TARGET_KEYS = new Set([
    "normalrepreange", "normalreprange", "reprange", "programmedreprange", "exactreps", "nextreps", "reps",
    "normaltargetrpe", "targetrpe", "normalrpe", "normalrestdefault", "restdefault", "restseconds",
    "normalsetcount", "workingsets", "sets", "setcount", "exactload", "nextload", "load", "weight"
  ]);

  function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== "[object Object]") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function cloneJson(value, depth = 0) {
    if (depth > 20) throw new TypeError("Resolver input exceeds the supported nesting depth.");
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError("Resolver input contains a non-finite number.");
      return value;
    }
    if (Array.isArray(value)) return value.map((item) => cloneJson(item, depth + 1));
    if (!isPlainObject(value)) throw new TypeError("Resolver input must contain JSON-compatible values.");
    const output = {};
    Object.keys(value).sort().forEach((key) => {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new TypeError("Resolver input contains a forbidden key.");
      if (value[key] !== undefined) output[key] = cloneJson(value[key], depth + 1);
    });
    return output;
  }

  function canonicalStringify(value) {
    const canonical = cloneJson(value);
    return JSON.stringify(canonical);
  }

  function stableDigest(value) {
    const text = canonicalStringify(value);
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      first = Math.imul(first ^ code, 0x01000193) >>> 0;
      second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
      second = ((second << 13) | (second >>> 19)) >>> 0;
    }
    return "fnv1a64:" + first.toString(16).padStart(8, "0") + second.toString(16).padStart(8, "0");
  }

  function validTimestamp(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function uniqueSortedText(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))].sort();
  }

  function scopeKey(scope) {
    return scope?.type === "exercise" ? "exercise:" + scope.exerciseVariantId : "session";
  }

  function normalizeScope(scope) {
    if (!isPlainObject(scope) || !["session", "exercise"].includes(scope.type)) return null;
    if (scope.type === "exercise") {
      const exerciseVariantId = text(scope.exerciseVariantId);
      if (!exerciseVariantId) return null;
      return { type: "exercise", exerciseVariantId };
    }
    return { type: "session" };
  }

  function containsForbiddenTargetMutation(value, parentKey = "") {
    if (Array.isArray(value)) return value.some((item) => containsForbiddenTargetMutation(item, parentKey));
    if (!isPlainObject(value)) return false;
    return Object.entries(value).some(([key, item]) => {
      const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
      return FORBIDDEN_TARGET_KEYS.has(normalized) || containsForbiddenTargetMutation(item, key);
    });
  }

  function numberInRange(value, minimum, maximum) {
    return Number.isFinite(Number(value)) && Number(value) >= minimum && Number(value) <= maximum;
  }

  function validateAction(action, category, scope) {
    if (!isPlainObject(action)) return { ok: false, reason: "invalid_action" };
    const code = text(action.code);
    if (!ALLOWED_ACTION_CODES.has(code)) return { ok: false, reason: "unapproved_action" };
    const parameters = action.parameters == null ? {} : cloneJson(action.parameters);
    if (!isPlainObject(parameters) || containsForbiddenTargetMutation(parameters)) return { ok: false, reason: "stable_target_mutation" };
    const permittedParameterKeys = {
      stop_or_skip_work: new Set(["mode"]),
      skip_exercise: new Set(),
      use_lighter_session: new Set(["loadReductionPercent", "setReductionCount", "rpeCeiling"]),
      use_lighter_exercise: new Set(["loadReductionPercent", "setReductionCount", "rpeCeiling"]),
      reduce_load: new Set(["loadReductionPercent"]),
      reduce_sets: new Set(["setReductionCount"]),
      cap_rpe: new Set(["rpeCeiling"]),
      time_bounded_deload: new Set(["loadReductionPercent", "setReductionCount", "rpeCeiling"]),
      address_plateau: new Set(["strategy"])
    };
    if (Object.keys(parameters).some((key) => !permittedParameterKeys[code].has(key))) return { ok: false, reason: "invalid_action_parameters" };
    if (code === "stop_or_skip_work" && parameters.mode !== undefined && !["stop", "skip", "stop_or_skip"].includes(parameters.mode)) return { ok: false, reason: "invalid_action_parameters" };
    if (code === "use_lighter_session" && scope.type !== "session") return { ok: false, reason: "action_scope_mismatch" };
    if (["use_lighter_exercise", "skip_exercise"].includes(code) && scope.type !== "exercise") return { ok: false, reason: "action_scope_mismatch" };
    if (code === "time_bounded_deload" && (category !== "deload" || scope.type !== "session")) return { ok: false, reason: "action_category_mismatch" };
    if (code === "address_plateau" && category !== "plateau") return { ok: false, reason: "action_category_mismatch" };
    if (code === "reduce_load" && !numberInRange(parameters.loadReductionPercent, 0.01, 100)) return { ok: false, reason: "invalid_action_parameters" };
    if (code === "reduce_sets" && (!Number.isInteger(Number(parameters.setReductionCount)) || Number(parameters.setReductionCount) < 1)) return { ok: false, reason: "invalid_action_parameters" };
    if (code === "cap_rpe" && !numberInRange(parameters.rpeCeiling, 0, 10)) return { ok: false, reason: "invalid_action_parameters" };
    if (code === "address_plateau" && !["reduce_load", "reduce_sets", "cap_rpe", "use_lighter_exercise", "change_exercise"].includes(parameters.strategy)) return { ok: false, reason: "invalid_action_parameters" };
    if (["use_lighter_session", "use_lighter_exercise", "time_bounded_deload"].includes(code)) {
      const allowedKeys = new Set(["loadReductionPercent", "setReductionCount", "rpeCeiling"]);
      if (Object.keys(parameters).some((key) => !allowedKeys.has(key))) return { ok: false, reason: "invalid_action_parameters" };
      if (parameters.loadReductionPercent !== undefined && !numberInRange(parameters.loadReductionPercent, 0.01, 100)) return { ok: false, reason: "invalid_action_parameters" };
      if (parameters.setReductionCount !== undefined && (!Number.isInteger(Number(parameters.setReductionCount)) || Number(parameters.setReductionCount) < 1)) return { ok: false, reason: "invalid_action_parameters" };
      if (parameters.rpeCeiling !== undefined && !numberInRange(parameters.rpeCeiling, 0, 10)) return { ok: false, reason: "invalid_action_parameters" };
    }
    return { ok: true, value: { code, parameters } };
  }

  function qualificationPassed(qualification) {
    if (!isPlainObject(qualification)) return false;
    return QUALIFICATION_FIELDS.every((field) => qualification[field] === true || qualification[field] === "pass");
  }

  function normalizeEvidence(evidence) {
    if (!Array.isArray(evidence) || !evidence.length) return null;
    const normalized = [];
    for (const item of evidence) {
      if (!isPlainObject(item)) return null;
      const sourceReference = text(item.sourceReference);
      const provenance = text(item.provenance);
      if (!sourceReference || !PROVENANCE.has(provenance)) return null;
      normalized.push({ sourceReference, provenance, required: item.required !== false });
    }
    return normalized.sort((left, right) => left.sourceReference.localeCompare(right.sourceReference));
  }

  function suppress(candidateId, reason) {
    return { candidateId: text(candidateId) || "unidentified", reason };
  }

  function emitEngineeringError(recordEngineeringError, code) {
    if (typeof recordEngineeringError !== "function") return;
    const record = Object.freeze({
      code: code === "detector_error" ? "detector_error" : "candidate_normalization_error",
      module: ENGINEERING_ERROR_MODULE,
      ruleVersion: CANDIDATE_NORMALIZATION_RULE_VERSION
    });
    try {
      recordEngineeringError(record);
    } catch (_error) {
      // Engineering reporting is best-effort and must never become a second failure path.
    }
  }

  function normalizeCandidate(candidate, resolverEvaluatedAt, recordEngineeringError) {
    let candidateId = "unidentified";
    try {
      if (!isPlainObject(candidate)) return { suppression: suppress(candidateId, "invalid_candidate") };
      candidateId = text(candidate.candidateId) || candidateId;
      if (candidate.status === "error") {
        emitEngineeringError(recordEngineeringError, "detector_error");
        return { suppression: suppress(candidateId, "detector_error") };
      }
      if (candidate.candidateVersion !== CANDIDATE_VERSION) return { suppression: suppress(candidateId, "unsupported_candidate_version") };
      if (candidateId === "unidentified") return { suppression: suppress(candidateId, "missing_candidate_id") };
      const detectorId = text(candidate.detector?.id);
      const detectorVersion = text(candidate.detector?.version);
      const ruleVersion = text(candidate.detector?.ruleVersion);
      if (!detectorId || !detectorVersion || !ruleVersion) return { suppression: suppress(candidateId, "missing_detector_version") };
      const category = text(candidate.category);
      if (!CATEGORIES.has(category)) return { suppression: suppress(candidateId, "unapproved_category") };
      const scope = normalizeScope(candidate.scope);
      if (!scope) return { suppression: suppress(candidateId, "invalid_scope") };
      if (!qualificationPassed(candidate.qualification)) return { suppression: suppress(candidateId, "qualification_failed") };
      const evidence = normalizeEvidence(candidate.evidence);
      if (!evidence) return { suppression: suppress(candidateId, "missing_evidence_provenance") };
      if (evidence.some((item) => item.required && ["missing", "ambiguous"].includes(item.provenance))) return { suppression: suppress(candidateId, "missing_or_ambiguous_evidence") };
      if (category === "pain_or_illness" && candidate.explicitSafetyInput !== true) return { suppression: suppress(candidateId, "safety_input_not_explicit") };
      const evaluatedAt = validTimestamp(candidate.evaluatedAt);
      const effectiveAt = validTimestamp(candidate.effectiveAt || candidate.evaluatedAt);
      const expiresAt = candidate.expiresAt == null ? null : validTimestamp(candidate.expiresAt);
      const returnCondition = candidate.returnCondition == null ? null : cloneJson(candidate.returnCondition);
      if (!evaluatedAt || !effectiveAt || (candidate.expiresAt != null && !expiresAt)) return { suppression: suppress(candidateId, "invalid_time_boundary") };
      const resolverTime = Date.parse(resolverEvaluatedAt);
      if (Date.parse(evaluatedAt) > resolverTime || Date.parse(effectiveAt) > resolverTime || (expiresAt && Date.parse(expiresAt) <= resolverTime)) return { suppression: suppress(candidateId, "stale_or_not_effective") };
      if (!expiresAt && (!isPlainObject(returnCondition) || !Object.keys(returnCondition).length)) return { suppression: suppress(candidateId, "missing_return_boundary") };
      const sourceReferences = uniqueSortedText(candidate.sourceReferences);
      const inputDigest = text(candidate.inputDigest);
      if (!sourceReferences.length && !inputDigest) return { suppression: suppress(candidateId, "missing_source_reference") };
      const evidenceReferences = uniqueSortedText(evidence.map((item) => item.sourceReference));
      if (sourceReferences.some((reference) => !evidenceReferences.includes(reference))) return { suppression: suppress(candidateId, "source_provenance_mismatch") };
      const reasonCodes = uniqueSortedText(candidate.reasonCodes || [candidate.reasonCode]);
      if (!reasonCodes.length) return { suppression: suppress(candidateId, "missing_reason_code") };
      const action = validateAction(candidate.action, category, scope);
      if (!action.ok) return { suppression: suppress(candidateId, action.reason) };
      const normalized = {
        candidateVersion: CANDIDATE_VERSION,
        candidateId,
        detector: { id: detectorId, version: detectorVersion, ruleVersion },
        evaluatedAt,
        effectiveAt,
        expiresAt,
        returnCondition,
        category,
        scope,
        action: action.value,
        reasonCodes,
        sourceReferences: sourceReferences.length ? sourceReferences : ["digest:" + inputDigest],
        inputDigest: inputDigest || stableDigest({ sourceReferences, evidence }),
        evidence,
        explicitSafetyInput: category === "pain_or_illness"
      };
      normalized.strictness = ACTION_STRICTNESS[normalized.action.code];
      return { candidate: normalized };
    } catch (_error) {
      emitEngineeringError(recordEngineeringError, "candidate_normalization_error");
      return { suppression: suppress(candidateId, "candidate_normalization_error") };
    }
  }

  function compareCandidates(left, right) {
    return (CATEGORY_PRECEDENCE[right.category] - CATEGORY_PRECEDENCE[left.category])
      || (right.strictness - left.strictness)
      || (CATEGORY_TIE_ORDER[right.category] - CATEGORY_TIE_ORDER[left.category])
      || left.candidateId.localeCompare(right.candidateId);
  }

  function selectWinner(candidates) {
    if (!candidates.length) return null;
    return [...candidates].sort(compareCandidates)[0];
  }

  function actionFingerprint(candidate) {
    return canonicalStringify({
      scope: candidate.scope,
      action: candidate.action,
      effectiveAt: candidate.effectiveAt,
      expiresAt: candidate.expiresAt,
      returnCondition: candidate.returnCondition
    });
  }

  function absorbSupportingCandidates(winner, allCandidates) {
    const fingerprint = actionFingerprint(winner);
    const supporting = allCandidates.filter((candidate) => scopeKey(candidate.scope) === scopeKey(winner.scope) && actionFingerprint(candidate) === fingerprint);
    return {
      ...winner,
      reasonCodes: uniqueSortedText(supporting.flatMap((candidate) => candidate.reasonCodes)),
      sourceReferences: uniqueSortedText(supporting.flatMap((candidate) => candidate.sourceReferences)),
      absorbedCandidateIds: uniqueSortedText(supporting.map((candidate) => candidate.candidateId))
    };
  }

  function decisionCore(candidate, evaluatedAt, noActionReason = "ordinary_silence") {
    if (!candidate) {
      return {
        contractVersion: CONTRACT_VERSION,
        resolverVersion: RESOLVER_VERSION,
        evaluatedAt,
        outcome: "no_action",
        category: "none",
        scope: { type: "session" },
        action: { code: "no_action", parameters: {} },
        reasonCodes: [noActionReason],
        sourceReferences: [],
        effectiveAt: evaluatedAt,
        expiresAt: null,
        returnCondition: null,
        handling: "pending",
        supersedesDecisionId: null
      };
    }
    return {
      contractVersion: CONTRACT_VERSION,
      resolverVersion: RESOLVER_VERSION,
      evaluatedAt,
      outcome: "action",
      category: candidate.category,
      scope: cloneJson(candidate.scope),
      action: cloneJson(candidate.action),
      reasonCodes: [...candidate.reasonCodes],
      sourceReferences: [...candidate.sourceReferences],
      effectiveAt: candidate.effectiveAt,
      expiresAt: candidate.expiresAt,
      returnCondition: candidate.returnCondition == null ? null : cloneJson(candidate.returnCondition),
      handling: "pending",
      supersedesDecisionId: null
    };
  }

  function decisionSignature(decision) {
    return canonicalStringify({
      outcome: decision.outcome,
      category: decision.category,
      scope: decision.scope,
      action: decision.action,
      reasonCodes: decision.reasonCodes,
      sourceReferences: decision.sourceReferences,
      effectiveAt: decision.effectiveAt,
      expiresAt: decision.expiresAt,
      returnCondition: decision.returnCondition
    });
  }

  function latestPriorForScope(priorDecisions, scope) {
    return (Array.isArray(priorDecisions) ? priorDecisions : [])
      .filter((decision) => isPlainObject(decision) && scopeKey(decision.scope) === scopeKey(scope) && text(decision.decisionId))
      .sort((left, right) => String(right.evaluatedAt || "").localeCompare(String(left.evaluatedAt || "")))[0] || null;
  }

  function finalizeDecision(core, priorDecisions) {
    const prior = latestPriorForScope(priorDecisions, core.scope);
    if (prior && decisionSignature(prior) === decisionSignature(core)) {
      return {
        ...core,
        decisionId: prior.decisionId,
        evaluatedAt: validTimestamp(prior.evaluatedAt) || core.evaluatedAt,
        handling: HANDLING.has(prior.handling) ? prior.handling : "pending",
        supersedesDecisionId: prior.supersedesDecisionId || null
      };
    }
    const withSupersession = { ...core, supersedesDecisionId: prior ? prior.decisionId : null };
    const decisionId = "decision-" + stableDigest({ ...withSupersession, handling: undefined }).slice("fnv1a64:".length);
    return { ...withSupersession, decisionId };
  }

  function createResult(evaluatedAt, normalizedCandidates, suppressions, selectedCandidates, priorDecisions, failureCode = null, noActionReason = "ordinary_silence") {
    const sessionCandidate = selectedCandidates.session || null;
    const exerciseCandidate = selectedCandidates.exercise || null;
    const cores = sessionCandidate || exerciseCandidate
      ? [sessionCandidate, exerciseCandidate].filter(Boolean).map((candidate) => decisionCore(candidate, evaluatedAt))
      : [decisionCore(null, evaluatedAt, noActionReason)];
    const decisions = cores.map((core) => finalizeDecision(core, priorDecisions));
    const sortedSuppressions = [...suppressions].sort((left, right) => left.candidateId.localeCompare(right.candidateId) || left.reason.localeCompare(right.reason));
    const result = {
      contractVersion: CONTRACT_VERSION,
      resolverVersion: RESOLVER_VERSION,
      evaluatedAt,
      evaluationDigest: stableDigest({
        resolverVersion: RESOLVER_VERSION,
        evaluatedAt,
        candidates: normalizedCandidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          inputDigest: candidate.inputDigest,
          category: candidate.category,
          scope: candidate.scope,
          action: candidate.action
        })),
        suppressions: sortedSuppressions
      }),
      decisions,
      actions: decisions.filter((decision) => decision.outcome === "action"),
      sessionDecision: decisions.find((decision) => decision.scope.type === "session") || null,
      exerciseDecision: decisions.find((decision) => decision.scope.type === "exercise") || null,
      suppressions: sortedSuppressions,
      absorbedCandidateIds: uniqueSortedText([sessionCandidate, exerciseCandidate].filter(Boolean).flatMap((candidate) => candidate.absorbedCandidateIds || [candidate.candidateId])),
      failureCode
    };
    return result;
  }

  function resolveInternal(input) {
    if (!isPlainObject(input)) throw new TypeError("Resolver input must be an object.");
    const evaluatedAt = validTimestamp(input.evaluatedAt);
    if (!evaluatedAt) throw new TypeError("Resolver evaluatedAt must be a valid timestamp.");
    const rawCandidates = input.candidates;
    if (!Array.isArray(rawCandidates)) throw new TypeError("Resolver candidates must be an array.");
    const normalizedCandidates = [];
    const suppressions = [];
    const seenCandidateIds = new Set();
    const recordEngineeringError = safeProperty(input, "onEngineeringError");
    rawCandidates.forEach((rawCandidate) => {
      const normalized = normalizeCandidate(rawCandidate, evaluatedAt, recordEngineeringError);
      if (normalized.suppression) {
        suppressions.push(normalized.suppression);
        return;
      }
      if (seenCandidateIds.has(normalized.candidate.candidateId)) {
        suppressions.push(suppress(normalized.candidate.candidateId, "duplicate_candidate_id"));
        return;
      }
      seenCandidateIds.add(normalized.candidate.candidateId);
      normalizedCandidates.push(normalized.candidate);
    });
    normalizedCandidates.sort((left, right) => left.candidateId.localeCompare(right.candidateId));

    const hasSafetyAction = normalizedCandidates.some((candidate) => candidate.category === "pain_or_illness");
    const eligible = hasSafetyAction
      ? normalizedCandidates.filter((candidate) => candidate.category !== "plateau")
      : normalizedCandidates;
    if (hasSafetyAction) {
      normalizedCandidates.filter((candidate) => candidate.category === "plateau").forEach((candidate) => {
        suppressions.push(suppress(candidate.candidateId, "suppressed_by_safety_action"));
      });
    }

    let sessionCandidate = selectWinner(eligible.filter((candidate) => candidate.scope.type === "session"));
    if (sessionCandidate) sessionCandidate = absorbSupportingCandidates(sessionCandidate, eligible);
    const exerciseScopeWinners = [...new Set(eligible.filter((candidate) => candidate.scope.type === "exercise").map((candidate) => candidate.scope.exerciseVariantId))]
      .sort()
      .map((exerciseVariantId) => selectWinner(eligible.filter((candidate) => candidate.scope.type === "exercise" && candidate.scope.exerciseVariantId === exerciseVariantId)))
      .filter(Boolean);
    let exerciseCandidate = selectWinner(exerciseScopeWinners);
    if (exerciseCandidate) exerciseCandidate = absorbSupportingCandidates(exerciseCandidate, eligible);

    if (sessionCandidate && exerciseCandidate && exerciseCandidate.strictness <= sessionCandidate.strictness) {
      suppressions.push(suppress(exerciseCandidate.candidateId, "exercise_not_materially_stricter"));
      exerciseCandidate = null;
    }
    eligible.forEach((candidate) => {
      if (sessionCandidate?.absorbedCandidateIds?.includes(candidate.candidateId) || exerciseCandidate?.absorbedCandidateIds?.includes(candidate.candidateId)) return;
      if (suppressions.some((item) => item.candidateId === candidate.candidateId)) return;
      suppressions.push(suppress(candidate.candidateId, "lost_arbitration"));
    });
    return createResult(evaluatedAt, normalizedCandidates, suppressions, { session: sessionCandidate, exercise: exerciseCandidate }, input.priorDecisions);
  }

  function safeProperty(source, key) {
    try { return source && source[key]; } catch (_error) { return undefined; }
  }

  function fallbackResult(input) {
    const requestedTime = validTimestamp(safeProperty(input, "evaluatedAt"));
    const safety = safeProperty(input, "explicitSafetyObservation");
    const evaluatedAt = requestedTime || validTimestamp(safeProperty(safety, "observedAt")) || "1970-01-01T00:00:00.000Z";
    const scope = normalizeScope(safeProperty(safety, "scope")) || { type: "session" };
    const sourceReference = text(safeProperty(safety, "sourceReference"));
    if (isPlainObject(safety) && safety.explicit === true && sourceReference) {
      const candidate = {
        category: "pain_or_illness",
        scope,
        action: { code: "stop_or_skip_work", parameters: { mode: "stop_or_skip" } },
        reasonCodes: ["explicit_pain_or_illness", "resolver_failure"],
        sourceReferences: [sourceReference],
        effectiveAt: evaluatedAt,
        expiresAt: null,
        returnCondition: { type: "user_decision" },
        absorbedCandidateIds: []
      };
      return createResult(evaluatedAt, [], [], { session: scope.type === "session" ? candidate : null, exercise: scope.type === "exercise" ? candidate : null }, safeProperty(input, "priorDecisions"), "resolver_error_safety_fallback");
    }
    return createResult(evaluatedAt, [], [], { session: null, exercise: null }, safeProperty(input, "priorDecisions"), "resolver_error_silenced", "resolver_failure");
  }

  function resolveExceptionCandidates(input) {
    try {
      return resolveInternal(input);
    } catch (_error) {
      return fallbackResult(input);
    }
  }

  function applyDecisionHandling(decision, handling) {
    if (!isPlainObject(decision) || !text(decision.decisionId)) throw new TypeError("A resolved decision is required.");
    if (!HANDLING.has(handling) || handling === "pending") throw new TypeError("Handling must record an explicit user response.");
    return { ...cloneJson(decision), handling };
  }

  function validateResolvedAction(decision) {
    try {
      if (!isPlainObject(decision)) return { valid: false, reason: "invalid_decision" };
      const allowedFields = new Set([
        "contractVersion", "resolverVersion", "decisionId", "evaluatedAt", "outcome", "category",
        "scope", "action", "reasonCodes", "sourceReferences", "effectiveAt", "expiresAt",
        "returnCondition", "handling", "supersedesDecisionId"
      ]);
      if (Object.keys(decision).some((key) => !allowedFields.has(key))) return { valid: false, reason: "unknown_decision_field" };
      if (decision.contractVersion !== CONTRACT_VERSION) return { valid: false, reason: "unsupported_contract_version" };
      if (!text(decision.resolverVersion) || !text(decision.decisionId) || !validTimestamp(decision.evaluatedAt)) return { valid: false, reason: "missing_decision_identity" };
      if (!["no_action", "action"].includes(decision.outcome)) return { valid: false, reason: "invalid_outcome" };
      const scope = normalizeScope(decision.scope);
      if (!scope) return { valid: false, reason: "invalid_scope" };
      if (!HANDLING.has(decision.handling)) return { valid: false, reason: "invalid_handling" };
      if (decision.supersedesDecisionId !== null && !text(decision.supersedesDecisionId)) return { valid: false, reason: "invalid_supersession" };
      if (!Array.isArray(decision.reasonCodes) || !decision.reasonCodes.length || decision.reasonCodes.some((item) => !text(item))) return { valid: false, reason: "invalid_reason_codes" };
      if (!Array.isArray(decision.sourceReferences) || decision.sourceReferences.some((item) => !text(item))) return { valid: false, reason: "invalid_source_references" };

      if (decision.outcome === "no_action") {
        if (decision.category !== "none" || decision.action?.code !== "no_action" || !isPlainObject(decision.action?.parameters) || Object.keys(decision.action.parameters).length) {
          return { valid: false, reason: "invalid_no_action" };
        }
        if (!validTimestamp(decision.effectiveAt) || decision.expiresAt !== null || decision.returnCondition !== null || decision.sourceReferences.length) {
          return { valid: false, reason: "invalid_no_action_boundary" };
        }
        return { valid: true, value: cloneJson(decision) };
      }

      if (!CATEGORIES.has(decision.category)) return { valid: false, reason: "unapproved_category" };
      if (!decision.sourceReferences.length) return { valid: false, reason: "missing_source_reference" };
      const effectiveAt = validTimestamp(decision.effectiveAt);
      const expiresAt = decision.expiresAt === null ? null : validTimestamp(decision.expiresAt);
      if (!effectiveAt || (decision.expiresAt !== null && !expiresAt)) return { valid: false, reason: "invalid_time_boundary" };
      if (!expiresAt && (!isPlainObject(decision.returnCondition) || !Object.keys(decision.returnCondition).length)) {
        return { valid: false, reason: "missing_return_boundary" };
      }
      const action = validateAction(decision.action, decision.category, scope);
      if (!action.ok) return { valid: false, reason: action.reason };
      return { valid: true, value: cloneJson(decision) };
    } catch (_error) {
      return { valid: false, reason: "decision_validation_error" };
    }
  }

  return Object.freeze({
    CANDIDATE_VERSION,
    CONTRACT_VERSION,
    RESOLVER_VERSION,
    QUALIFICATION_FIELDS,
    ACTION_STRICTNESS,
    stableDigest,
    normalizeCandidate,
    resolveExceptionCandidates,
    applyDecisionHandling,
    validateResolvedAction
  });
});
