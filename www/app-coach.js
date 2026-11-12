// Activation stays closed pending calibration, the 2-3-week shadow period,
// independent parameter review, and the owner's explicit opt-in.
const COACH_ACTIVATION_APPROVED = false;

function effectiveCoachMode(settings = data.settings) {
  const mode = settings?.coachMode || "shadow";
  return mode === "show" && !COACH_ACTIVATION_APPROVED ? "shadow"
    : ["off", "shadow", "show"].includes(mode) ? mode : "shadow";
}

// Reading legacy observations never assigns provenance to their stored rows.
function setFieldProvenance(set, field) {
  const value = set?.[field + "Source"];
  return field === "rpe" ? value === "typed" ? "typed" : "unknown"
    : ["accepted_target", "entered", "prefill_previous"].includes(value) ? value : "unknown";
}

function isCoachingSuspended(session, exerciseId) {
  return Array.isArray(session?.coachingSuspensions) && session.coachingSuspensions.some((entry) =>
    entry?.scope === "session" || (entry?.scope === "exercise" && entry.exerciseId === exerciseId));
}

// A model argument joins the suspension to a factual mutation's pending commit.
// Without it this remains S1a's guarded standalone mutator.
function suspendSessionCoaching(sessionId, suspension, model) {
  const candidate = model || data;
  const session = candidate.sessions.find((item) => item.id === sessionId);
  if (!session || isSessionSubmitted(session)) return model ? candidate : false;
  if (!model) {
    const authorization = guardWorkoutMutation("suspend-session-coaching", { sessionId });
    if (!authorization.allowed) return false;
  }
  try { window.FitnessBackupContract.validateCoachingSuspension(suspension, sessionId, candidate); }
  catch { return false; }
  const entries = session.coachingSuspensions || [];
  if (entries.some((entry) => entry.scope === suspension.scope
    && entry.exerciseId === suspension.exerciseId && entry.reason === suspension.reason)) return model ? candidate : true;
  // Never evict an earlier scope suspension and accidentally resume coaching.
  if (entries.length >= 50) {
    if (!model || entries.some((entry) => entry.scope === "session")) return model ? candidate : false;
    // At capacity, a session suspension subsumes every earlier exercise scope;
    // no scope can resume because its audit slot was replaced.
    suspension = { scope: "session", reason: suspension.reason, at: suspension.at };
  }
  const retained = entries.length >= 50 ? entries.slice(0, 49) : entries;
  const next = { ...candidate, sessions: candidate.sessions.map((item) => item.id === sessionId
    ? { ...item, coachingSuspensions: [...retained, { ...suspension }], updatedAt: isoNow() } : item)
  };
  if (model) return next;
  commit(next, false, { invalidateAnalysis: false, deferPersistence: true });
  return true;
}

// This adapter is the application's only caller of the pure coach. It never
// converts raw observations using a display preference or upgrades old history.
function coachResistanceType(exercise) {
  const value = exercise?.resistanceType;
  return ["external", "bodyweight_plus_load", "bodyweight", "assisted_bodyweight", "duration", "distance"].includes(value) ? value : null;
}

function coachVariantIdentity(exercise) {
  const identity = canonicalExerciseId(exercise);
  const resistance = coachResistanceType(exercise);
  return identity && resistance ? identity + "|" + resistance : null;
}

function coachRole(record) {
  if (record?.reviewRequired || record?.ambiguous) return null;
  const role = normalizeCanonicalSetType(record?.type || record?.setType, record?.isWarmup);
  return role === "unknown" ? null : role;
}

function buildCoachStableTargets(templateExercise, settings = data.settings) {
  const resistanceType = coachResistanceType(templateExercise);
  if (!resistanceType || templateExercise?.reviewRequired) return null;
  const source = Array.isArray(templateExercise.setTypes) && templateExercise.setTypes.length
    ? templateExercise.setTypes : normalizeStableTemplateExercise(templateExercise).setTypes;
  // Runtime rows are matched by role, not template group. One untrusted group
  // makes that entire role factual; otherwise known rows could borrow its slots.
  const factualRoles = new Set(source.filter((item) => !coachRole(item)).map((item) =>
    normalizeCanonicalSetType(item.type || item.setType, item.isWarmup)));
  const byRole = new Map();
  for (const item of source) {
    const role = coachRole(item);
    if (!role || role === "warmup" || factualRoles.has(role)) continue;
    const incrementUnit = item.incrementUnit || settings?.routineIncrementUnit;
    const incrementValue = Number(item.increment || templateExercise.increment);
    const frozen = {
      role, S: Number(item.setCount),
      rMin: Number(item.repMin ?? templateExercise.repMin ?? templateExercise.reps),
      rMax: Number(item.repMax ?? templateExercise.repMax ?? templateExercise.reps),
      eMin: Number(item.rpeMin ?? Math.max(0, Number(item.rpeMax ?? templateExercise.targetRpe) - 1)),
      eMax: Number(item.rpeMax ?? templateExercise.targetRpe),
      restSeconds: Number(item.restSeconds ?? templateExercise.restSeconds),
      increment: ["lb", "kg"].includes(incrementUnit) && incrementValue > 0
        ? { value: incrementValue, unit: incrementUnit } : null,
      defaultLoad: item.defaultLoad == null ? null : { value: item.defaultLoad.value, unit: item.defaultLoad.unit },
      defaultReps: item.defaultReps ?? null
    };
    const previous = byRole.get(role);
    if (previous) {
      const signature = (value) => window.ComprehensiveFitnessCoach.stableDigest({ ...value, S: 1 });
      // The engine has one group per role. Heterogeneous duplicates cannot be
      // coalesced without losing the owner's targets, so the exercise is factual.
      if (signature(previous) !== signature(frozen)) return null;
      previous.S += frozen.S;
    } else byRole.set(role, frozen);
  }
  const order = ["warmup", "top", "backoff", "straight", "drop", "failure", "amrap", "technique", "deload"];
  const roles = [...byRole.values()].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  if (!roles.length) return null;
  return { resistanceType, roles, targetVersion: window.ComprehensiveFitnessCoach.stableDigest({ resistanceType, roles }) };
}

function orderedCoachRows(rows) {
  return rows.map((row, index) => ({ row, index })).sort((a, b) => canonicalSetSequence(a.row) - canonicalSetSequence(b.row)
    || a.index - b.index).map(({ row }) => row);
}

function coachPositionedRows(rows) {
  const positions = new Map();
  return orderedCoachRows(rows).map((row, sequenceIndex) => {
    const role = normalizeCanonicalSetType(row.setType, row.isWarmup);
    const position = positions.get(role) || 0;
    positions.set(role, position + 1);
    return { row, role, position, sequenceIndex };
  });
}

function coachNumber(value) {
  return value !== "" && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
}

function coachHistoryPositionedRows(rows, plannedRows) {
  const planned = new Map(plannedRows.map((row) => [row.setId, row]));
  const nextPositions = new Map();
  plannedRows.forEach((row) => nextPositions.set(row.role, Math.max(row.position + 1, nextPositions.get(row.role) || 0)));
  return coachPositionedRows(rows).map((entry) => {
    const saved = planned.get(entry.row.id);
    const position = saved?.role === entry.role ? saved.position : nextPositions.get(entry.role) || 0;
    nextPositions.set(entry.role, Math.max(position + 1, nextPositions.get(entry.role) || 0));
    return { ...entry, position };
  });
}

function coachRowLoad(row, resistanceType) {
  const value = resistanceType === "bodyweight_plus_load" ? row.addedLoad ?? row.weight
    : resistanceType === "assisted_bodyweight" ? row.assistanceLoad ?? row.weight : row.weight;
  return coachNumber(value);
}

function coachHistoryIndex(model, before) {
  const beforeTime = Date.parse(before);
  const sessions = new Map((model.sessions || []).filter((session) => {
    const timestamps = [session.completedAt, session.submittedAt].filter((value) => value != null && value !== "");
    return isSessionSubmitted(session) && timestamps.length > 0
      && timestamps.every((value) => Number.isFinite(Date.parse(value)) && Date.parse(value) < beforeTime);
  }).map((session) => [session.id, session]));
  const sets = new Map();
  (model.sets || []).forEach((row) => {
    if (!sets.has(row.exerciseId)) sets.set(row.exerciseId, []);
    sets.get(row.exerciseId).push(row);
  });
  const variants = new Map();
  (model.exercises || []).forEach((exercise) => {
    const session = sessions.get(exercise.sessionId);
    if (!session?.coachingPrescription) return;
    const identity = coachVariantIdentity(exercise);
    if (!identity) return;
    const proof = session.coachingPrescription.stableTargets.find((entry) => entry.exerciseId === exercise.id
      && entry.variantIdentity === identity);
    if (!proof) return;
    if (!variants.has(identity)) variants.set(identity, []);
    variants.get(identity).push({ session, exercise, proof, rows: sets.get(exercise.id) || [] });
  });
  variants.forEach((entries) => entries.sort((a, b) => Date.parse(a.session.date) - Date.parse(b.session.date)
    || Date.parse(a.session.completedAt || a.session.submittedAt) - Date.parse(b.session.completedAt || b.session.submittedAt)
    || (a.session.id + ":" + a.exercise.id).localeCompare(b.session.id + ":" + b.exercise.id)));
  return variants;
}

function collectCoachHistory(model, exercise, frozenTargets, before, index = coachHistoryIndex(model, before)) {
  const variantIdentity = coachVariantIdentity(exercise);
  const entries = (index.get(variantIdentity) || []).filter(({ session, proof }) => session.id !== exercise.sessionId
    && proof.targetVersion === frozenTargets.targetVersion && proof.resistanceType === frozenTargets.resistanceType
    && Date.parse(session.date) < Date.parse(before));
  const history = entries.map(({ session, exercise: prior, rows }) => ({
    exposureId: session.id + ":" + prior.id, variantIdentity, targetVersion: frozenTargets.targetVersion,
    date: session.date, completed: true,
    isDeload: isDeloadExposure(session, prior, rows),
    sessionIsDeload: isDeloadExposure(session, null),
    sets: coachHistoryPositionedRows(rows, session.coachingPrescription.sets.filter((row) => row.exerciseId === prior.id)).map(({ row, role, position }) => ({
      setId: row.id, role, position,
      load: coachRowLoad(row, frozenTargets.resistanceType), unit: row.weightUnit || null,
      reps: coachNumber(row.reps), rpe: coachNumber(row.rpe), rpeSource: setFieldProvenance(row, "rpe"),
      // Fixed role positions replace the optional historical sequence index.
      // The engine consults targetReps only when actual typed RPE is unavailable.
      ...(setFieldProvenance(row, "rpe") === "typed" && coachNumber(row.rpe) !== null ? {} : { targetReps: coachNumber(row.targetReps) }),
      resistanceType: coachResistanceType(row) || frozenTargets.resistanceType,
      completed: row.completed === true && coachRole(row) !== null, skipped: row.skipped === true, isWarmup: row.isWarmup === true || role === "warmup"
    }))
  }));
  // Keep all proven predecessors. Episode/experiment markers can reference an
  // exposure older than the comparison window; trimming it would invent state.
  const predecessor = entries.findLast(({ session, exercise: prior }) => !isCoachingSuspended(session, prior.id));
  const previous = predecessor?.session.coachingPrescription.exercises.find((item) => item.exerciseId === predecessor.exercise.id);
  const state = previous ? { deteriorationEpisode: previous.deteriorationEpisode, addedSetExperiment: previous.addedSetExperiment } : {};
  return { history, state };
}

function coachSetDescriptors(session, exercise, frozen, sets) {
  const positioned = coachPositionedRows(sets.filter((row) => row.exerciseId === exercise.id));
  const actual = positioned.filter(({ row, role }) => coachRole(row) && frozen.roles.some((item) => item.role === role))
    .map(({ row, role, position, sequenceIndex }) => ({ setId: row.id, role, position, sequenceIndex }));
  // Reserve deterministic virtual IDs with ordering after every actual row.
  // The engine's default ordinal can collide with the last working row when
  // warm-ups precede it, preventing that row from revising an added set.
  const virtual = frozen.roles.filter((role) => ["straight", "backoff"].includes(role.role)).map((role, index) => ({
    setId: [session.id, exercise.id, role.role, role.S].join(":"), role: role.role,
    position: role.S, sequenceIndex: positioned.length + index
  })).filter((row) => !actual.some((item) => item.role === row.role && item.position === row.position));
  return [...actual, ...virtual];
}

function buildCoachSessionInput(session, template, exercises, sets, model = data) {
  const historyIndex = coachHistoryIndex(model, session.createdAt);
  const decisions = session.resolvedActions || [];
  const latest = decisions.filter((decision) => !decisions.some((other) => other.supersedesDecisionId === decision.decisionId));
  const action = latest.find((decision) => decision.action?.code === "stop_or_skip_work");
  return {
    sessionId: session.id, evaluationId: "coach-evaluation-" + id(), createdAt: session.createdAt, date: session.date,
    isDeload: Boolean(session.isDeload), readiness: session.recovery?.readinessDeviation || "usual",
    resolverAction: action ? { code: "stop_or_skip_work", overridden: action.handling === "overridden" } : null,
    injurySkippedDates: (model.skippedSessions || []).map((skip) => skip.date),
    exercises: session.templateId !== template?.id ? [] : exercises.flatMap((exercise, index) => {
      const templateExercise = template.exercises[index];
      if (!templateExercise) return [];
      const frozen = buildCoachStableTargets(templateExercise, model.settings);
      const variantIdentity = coachVariantIdentity(exercise);
      if (!frozen || !variantIdentity || coachResistanceType(exercise) !== frozen.resistanceType) return [];
      return [{ exerciseId: exercise.id, variantIdentity, ...frozen, isDeload: Boolean(exercise.isDeload),
        sets: coachSetDescriptors(session, exercise, frozen, sets),
        ...collectCoachHistory(model, exercise, frozen, session.createdAt, historyIndex)
      }];
    })
  };
}

function previousCoachPrescriptions(session, prescription, model) {
  // Presentation compares stored plans only, never recollects prior observations
  // or evaluates the engine. This also works after draft restoration.
  const before = Date.parse(session.createdAt);
  const priorSessions = model.sessions.filter((prior) => prior.id !== session.id && prior.coachingPrescription
    && isSessionSubmitted(prior) && Date.parse(prior.date) < before
    && [prior.completedAt, prior.submittedAt].filter((value) => value != null && value !== "").length > 0
    && [prior.completedAt, prior.submittedAt].filter((value) => value != null && value !== "")
      .every((value) => Number.isFinite(Date.parse(value)) && Date.parse(value) < before))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)
      || Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
  const selected = new Map();
  const checked = new Map();
  for (const current of prescription.stableTargets) {
    const prior = priorSessions.find((candidate) => {
      const plan = candidate.coachingPrescription;
      const compatible = Array.isArray(plan.stableTargets) && plan.stableTargets.find((target) => target.variantIdentity === current.variantIdentity
        && target.targetVersion === current.targetVersion && target.resistanceType === current.resistanceType
        && !isCoachingSuspended(candidate, target.exerciseId));
      if (!compatible || Date.parse(plan.createdAt) >= before) return false;
      if (!checked.has(plan)) checked.set(plan, validateSessionCoachingPrescription(candidate, plan, model, false).ok);
      return checked.get(plan);
    });
    if (prior) {
      const plan = prior.coachingPrescription;
      const target = plan.stableTargets.find((entry) => entry.variantIdentity === current.variantIdentity
        && entry.targetVersion === current.targetVersion && entry.resistanceType === current.resistanceType
        && !isCoachingSuspended(prior, entry.exerciseId));
      if (!selected.has(plan)) selected.set(plan, new Set());
      selected.get(plan).add(target.exerciseId);
    }
  }
  // Comparison-only projections of validated stored plans. Including an entire
  // plan selected for B would also leak its suspended or older A into A's lookup.
  // These projections are never stored as prescriptions or sent to the engine.
  return [...selected].map(([plan, exerciseIds]) => ({ ...plan,
    stableTargets: plan.stableTargets.filter((entry) => exerciseIds.has(entry.exerciseId)),
    exercises: plan.exercises.filter((entry) => exerciseIds.has(entry.exerciseId)),
    sets: plan.sets.filter((entry) => exerciseIds.has(entry.exerciseId))
  }));
}

function validateSessionCoachingPrescription(session, prescription = session?.coachingPrescription, model = data, includePrevious = true) {
  try {
    // Retain every live owner and every archived plan that can claim a candidate
    // ID. Unrelated archived plans cannot affect these ownership checks; avoid
    // revalidating the entire workout archive on every keystroke or start.
    const exerciseIds = new Set(prescription.exercises.map((exercise) => exercise.exerciseId));
    const setIds = new Set(prescription.sets.map((row) => row.setId));
    const ownershipModel = { ...model, sessions: model.sessions.filter((item) => item.id === session.id
      || (Array.isArray(item.coachingPrescription?.exercises) && item.coachingPrescription.exercises.some((exercise) => exerciseIds.has(exercise.exerciseId)))
      || (Array.isArray(item.coachingPrescription?.sets) && item.coachingPrescription.sets.some((row) => setIds.has(row.setId) || exerciseIds.has(row.exerciseId)))) };
    // This S1a boundary runs the engine validator and ownership checks together.
    window.FitnessBackupContract.validateCoachingPrescription(prescription, session.id, ownershipModel);
    let previousPrescriptions = [];
    if (includePrevious) {
      try { previousPrescriptions = previousCoachPrescriptions(session, prescription, model); }
      catch { /* Unverifiable comparison metadata suppresses only the start reason. */ }
    }
    return { ok: true, errors: [], ...(includePrevious ? { previousPrescriptions } : {}) };
  } catch { return { ok: false, errors: ["Invalid coaching prescription or ownership."] }; }
}

function recordCoachEvaluationFailure(boundary) {
  // Use the existing bounded diagnostic path; never include observations or an
  // exception message (which could contain personal input).
  try { recordCoachRecovery([{ code: "coach_evaluation_failed", count: 1 }], boundary); }
  catch { /* Diagnostics can never block logging. */ }
}

function recordCoachPreviewFailure() {
  // A temporary preview has no persisted coach metadata to quarantine. Keep a
  // bounded, observation-free diagnostic without touching live save controls.
  try {
    coachRecoveryDiagnostics.push({ boundary: "coach_preview", code: "coach_evaluation_failed", count: 1 });
    if (coachRecoveryDiagnostics.length > 100) coachRecoveryDiagnostics.splice(0, coachRecoveryDiagnostics.length - 100);
    console.warn("Coach preview failed; workout observations were preserved.");
  } catch { /* Diagnostics can never block a preview or logging. */ }
}

function materializeCoachRows(model, session, prescription) {
  const plannedIds = new Set(prescription.sets.map((row) => row.setId));
  const coachedIds = new Set(prescription.exercises.filter((exercise) => !exercise.codes.includes("factual_only")
    && !exercise.codes.includes("exception_suppressed")).map((exercise) => exercise.exerciseId));
  const working = (row) => !["warmup", "drop", "deload", "unknown"].includes(normalizeCanonicalSetType(row.setType, row.isWarmup));
  let rows = model.sets.filter((row) => {
    const stable = prescription.stableTargets.find((entry) => entry.exerciseId === row.exerciseId);
    const ownedRole = coachRole(row) && stable?.roles.some((entry) => entry.role === coachRole(row));
    return !coachedIds.has(row.exerciseId) || plannedIds.has(row.id) || !working(row) || !ownedRole
      || row.completed || row.skipped || row.edited || row.loadTouched || row.repsTouched;
  });
  const actualIds = new Set(rows.map((row) => row.id));
  for (const planned of prescription.sets) {
    if (!coachedIds.has(planned.exerciseId) || actualIds.has(planned.setId)
      || ["warmup", "drop", "deload", "unknown"].includes(planned.role)) continue;
    const stable = prescription.stableTargets.find((entry) => entry.exerciseId === planned.exerciseId);
    const role = stable.roles.find((entry) => entry.role === planned.role);
    const row = createSet(planned.exerciseId, planned.position + 1, {
      sequenceIndex: planned.sequenceIndex, sequence: planned.sequenceIndex, setTypeIndex: planned.position,
      setType: planned.role, resistanceType: stable.resistanceType, weight: "", reps: "",
      targetRepMin: role.rMin, targetRepMax: role.rMax, targetRestSeconds: role.restSeconds
    });
    rows = [...rows, { ...row, id: planned.setId }];
  }
  return { ...model, sets: rows };
}

function prescribeSessionCoaching(model, sessionId, template, options = {}) {
  const session = model.sessions.find((item) => item.id === sessionId);
  if (!session || isSessionSubmitted(session) || session.coachingPrescription || effectiveCoachMode(model.settings) === "off") return model;
  try {
    const exercises = model.exercises.filter((exercise) => exercise.sessionId === sessionId).sort((a, b) => a.order - b.order);
    const prescription = window.ComprehensiveFitnessCoach.prescribeSession(buildCoachSessionInput(session, template, exercises, model.sets, model));
    if (!validateSessionCoachingPrescription(session, prescription, model, false).ok) throw new Error("Invalid prescription.");
    let next = { ...model, sessions: model.sessions.map((item) => item.id === sessionId ? { ...item, coachingPrescription: prescription } : item) };
    if (effectiveCoachMode(model.settings) === "show") {
      next = materializeCoachRows(next, session, prescription);
      if (!validateSessionCoachingPrescription(session, prescription, next, false).ok) throw new Error("Invalid materialized prescription.");
    }
    return next;
  } catch {
    if (options.preview === true) recordCoachPreviewFailure();
    else recordCoachEvaluationFailure("coach_start");
    return model;
  }
}

function buildCoachSessionFacts(session, model = data) {
  const prescription = session.coachingPrescription;
  const actual = new Map(model.sets.map((row) => [row.id, row]));
  return prescription.exercises.flatMap((exercise) => {
    if (isCoachingSuspended(session, exercise.exerciseId)) return exercise.revisionReplay.facts;
    const stable = prescription.stableTargets.find((entry) => entry.exerciseId === exercise.exerciseId);
    const plannedRows = prescription.sets.filter((row) => row.exerciseId === exercise.exerciseId);
    const plannedIds = new Set(plannedRows.map((row) => row.setId));
    const rows = [...plannedRows, ...model.sets.filter((row) => row.exerciseId === exercise.exerciseId && !plannedIds.has(row.id))
      .map((row) => ({ setId: row.id }))];
    return rows.map((planned) => {
      const row = actual.get(planned.setId) || {};
      // Touch flags survive clearing; an RPE entry alone is not a row edit.
      const edited = !row.completed && !row.skipped && (row.loadTouched === true || row.repsTouched === true
        || row.loadSource === "entered" || row.repsSource === "entered");
      return { setId: planned.setId, completed: row.completed === true, skipped: row.skipped === true, edited,
        load: coachRowLoad(row, stable.resistanceType), unit: row.weightUnit || null,
        reps: coachNumber(row.reps), rpe: coachNumber(row.rpe),
        rpeSource: setFieldProvenance(row, "rpe"), loadSource: setFieldProvenance(row, "load"),
        repsSource: setFieldProvenance(row, "reps"), completionOrder: row.completionOrder ?? null };
    });
  });
}

function preserveSuspendedCoachScopes(session, revised) {
  const frozen = new Set(session.coachingPrescription.exercises.filter((exercise) => isCoachingSuspended(session, exercise.exerciseId)).map((exercise) => exercise.exerciseId));
  if (!frozen.size) return revised;
  return { ...revised, exercises: revised.exercises.map((exercise) => frozen.has(exercise.exerciseId)
    ? session.coachingPrescription.exercises.find((prior) => prior.exerciseId === exercise.exerciseId) : exercise),
    sets: revised.sets.map((row) => frozen.has(row.exerciseId)
      ? session.coachingPrescription.sets.find((prior) => prior.setId === row.setId) : row) };
}

function suspendFailedCoachingEvaluation(model, sessionId, exerciseId, at = isoNow()) {
  const session = model.sessions.find((item) => item.id === sessionId);
  if (!session?.coachingPrescription || sessionId !== activeWorkoutId || isSessionSubmitted(session) || isEditingHistorySession()) return model;
  const owned = exerciseId && session.coachingPrescription.exercises.some((exercise) => exercise.exerciseId === exerciseId);
  return suspendSessionCoaching(sessionId, { scope: owned ? "exercise" : "session", ...(owned ? { exerciseId } : {}), reason: "evaluation_failed", at }, model) || model;
}

function replaySessionCoaching(model, sessionId, changedSetId, at = isoNow(), affectedExerciseIds) {
  const session = model.sessions.find((item) => item.id === sessionId);
  if (!session?.coachingPrescription || sessionId !== activeWorkoutId || isSessionSubmitted(session)
    || effectiveCoachMode(model.settings) === "off" || isCoachingSuspended(session)
    || session.coachingPrescription.exercises.every((exercise) => isCoachingSuspended(session, exercise.exerciseId))) return model;
  try {
    const revised = preserveSuspendedCoachScopes(session, window.ComprehensiveFitnessCoach.reviseAfterSet(session.coachingPrescription,
      { at, revisionEnabled: model.settings.coachBetweenSetRevisions, sets: buildCoachSessionFacts(session, model) }, changedSetId));
    if (!validateSessionCoachingPrescription(session, revised, model, false).ok) throw new Error("Invalid replay.");
    return { ...model, sessions: model.sessions.map((item) => item.id === sessionId ? { ...item, coachingPrescription: revised } : item) };
  } catch {
    recordCoachEvaluationFailure("coach_replay");
    const hinted = session.coachingPrescription.sets.find((row) => row.setId === changedSetId)?.exerciseId;
    const affected = affectedExerciseIds ? [...new Set(affectedExerciseIds)] : hinted ? [hinted] : [];
    return suspendFailedCoachingEvaluation(model, sessionId, affected.length === 1 ? affected[0] : null, at);
  }
}

// One pre-persistence step for every factual commit. It uses only current-session
// observations and the stored prescription, never re-collects history or rebases.
function postMutationSessionCoaching(previousModel, nextModel) {
  try { return updateSessionCoachingAfterMutation(previousModel, nextModel); }
  catch {
    recordCoachEvaluationFailure("coach_mutation");
    return suspendFailedCoachingEvaluation(nextModel, activeWorkoutId, null);
  }
}

function updateSessionCoachingAfterMutation(previousModel, nextModel) {
  const previous = previousModel.sessions.find((session) => session.id === activeWorkoutId);
  let session = nextModel.sessions.find((item) => item.id === previous?.id);
  if (!previous?.coachingPrescription || !session || isSessionSubmitted(previous) || isSessionSubmitted(session)
    || isEditingHistorySession()) return nextModel;
  const at = isoNow();
  const suspend = (scope, reason, exerciseId) => {
    const result = suspendSessionCoaching(session.id, { scope, ...(exerciseId ? { exerciseId } : {}), reason, at }, nextModel);
    if (result) nextModel = result;
    session = nextModel.sessions.find((item) => item.id === session.id);
  };
  // Off ends coaching for this session, including work logged before switching
  // back to shadow/show. Only the next Start creates a fresh prescription.
  if (effectiveCoachMode(previousModel.settings) !== "off" && effectiveCoachMode(nextModel.settings) === "off") {
    suspend("session", "coach_off");
  }
  if (Boolean(previous.isDeload) !== Boolean(session.isDeload)) suspend("session", "deload_changed");
  if ((previous.recovery?.readinessDeviation || "") !== (session.recovery?.readinessDeviation || "")) suspend("session", "readiness_changed");
  if ((session.resolvedActions || []).some((decision) => decision.category === "pain_or_illness"
    && decision.action?.code === "stop_or_skip_work" && decision.handling === "overridden"
    && !(previous.resolvedActions || []).some((old) => old.decisionId === decision.decisionId && old.handling === "overridden"))) {
    suspend("session", "exception_overridden");
  }
  const priorExercises = new Map(previousModel.exercises.map((exercise) => [exercise.id, exercise]));
  const nextExercises = new Map(nextModel.exercises.map((exercise) => [exercise.id, exercise]));
  const previousRows = new Map(previousModel.sets.map((row) => [row.id, row]));
  const nextRows = new Map(nextModel.sets.map((row) => [row.id, row]));
  const nextSetIds = new Set(nextModel.sets.map((row) => row.id));
  for (const exercise of previous.coachingPrescription.exercises) {
    const prior = priorExercises.get(exercise.exerciseId);
    const current = nextExercises.get(exercise.exerciseId);
    if (!prior) continue;
    const substituted = current && (current.name !== prior.name || coachVariantIdentity(current) !== coachVariantIdentity(prior)
      || nextModel.exercises.some((item) => item.sessionId === session.id && (item.manualOverrides || []).some((entry) =>
        entry.action === "substitute_exercise" && entry.exerciseRuntimeId === prior.id
        && !previousModel.exercises.some((oldExercise) => (oldExercise.manualOverrides || []).some((old) => old.overrideId === entry.overrideId)))));
    if (substituted) suspend("exercise", "exercise_substituted", prior.id);
    if (current && Boolean(prior.isDeload) !== Boolean(current.isDeload)) suspend("exercise", "deload_changed", prior.id);
    if (!substituted && (!current || previousModel.sets.some((row) => row.exerciseId === prior.id
      && isWorkingSet(row) && !nextSetIds.has(row.id)))) {
      suspend("exercise", "row_removed", prior.id);
    }
    if (previous.coachingPrescription.sets.some((planned) => {
      if (planned.exerciseId !== prior.id) return false;
      const before = previousRows.get(planned.setId);
      const after = nextRows.get(planned.setId);
      // Check both sides, including corrections back into a frozen role. Older
      // restored drafts may already contain a mismatch without a suspension.
      return before && after && (coachRole(before) !== planned.role || coachRole(after) !== planned.role);
    })) suspend("exercise", "role_changed", prior.id);
  }
  const beforeFacts = buildCoachSessionFacts(previous, previousModel);
  const afterFacts = buildCoachSessionFacts(session, nextModel);
  const factsChanged = JSON.stringify(beforeFacts) !== JSON.stringify(afterFacts);
  const typeChanged = nextModel.sets.some((row) => {
    const prior = previousRows.get(row.id);
    return prior && priorExercises.get(row.exerciseId)?.sessionId === session.id
      && (row.setType !== prior.setType || row.isWarmup !== prior.isWarmup || row.reviewRequired !== prior.reviewRequired);
  });
  const revisionsChanged = (previousModel.settings.coachBetweenSetRevisions !== false)
    !== (nextModel.settings.coachBetweenSetRevisions !== false);
  if (!factsChanged && !typeChanged && !revisionsChanged) return nextModel;
  const beforeById = new Map(beforeFacts.map((fact) => [fact.setId, JSON.stringify(fact)]));
  const afterById = new Map(afterFacts.map((fact) => [fact.setId, JSON.stringify(fact)]));
  const affected = new Set();
  for (const setId of new Set([...beforeById.keys(), ...afterById.keys()])) {
    if (beforeById.get(setId) === afterById.get(setId)) continue;
    const exerciseId = (nextRows.get(setId) || previousRows.get(setId))?.exerciseId;
    if (exerciseId && !isCoachingSuspended(session, exerciseId)) affected.add(exerciseId);
  }
  if (revisionsChanged) session.coachingPrescription.exercises.forEach((exercise) => {
    if (!isCoachingSuspended(session, exercise.exerciseId)) affected.add(exercise.exerciseId);
  });
  // Settings reconcile immediately so the next first edit/completion/skip captures
  // the displayed target. Off still stops replay and never attaches a new plan.
  return replaySessionCoaching(nextModel, session.id, null, at, [...affected]);
}

function undoSessionCoachRevision(sessionId, setId, at = isoNow()) {
  const session = sessionById(sessionId);
  const row = session?.coachingPrescription?.sets.find((item) => item.setId === setId);
  if (!row || sessionId !== activeWorkoutId || isSessionSubmitted(session) || isEditingHistorySession()
    || effectiveCoachMode() === "off" || isCoachingSuspended(session, row.exerciseId)) return false;
  if (!guardWorkoutMutation("undo-coach-revision", { sessionId, setId }).allowed) return false;
  try {
    const prescription = preserveSuspendedCoachScopes(session, window.ComprehensiveFitnessCoach.undoRevision(session.coachingPrescription, setId, at));
    if (!validateSessionCoachingPrescription(session, prescription, data, false).ok) return false;
    commit({ ...data, sessions: data.sessions.map((item) => item.id === sessionId ? { ...item, coachingPrescription: prescription } : item) },
      false, { invalidateAnalysis: false, deferPersistence: true });
    return true;
  } catch { recordCoachEvaluationFailure("coach_undo"); return false; }
}
