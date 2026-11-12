/**
 * Offline aggregate-only replay of the normalized Strong writer contract in
 * scripts/personal-fitness/normalize-workouts.js.
 *
 * node scripts/coach-replay.js normalized_workouts.csv
 *   [--out aggregate.json] [--injury-dates dates.txt]
 *
 * Identity uses Erik's recorded name plus variation, normalized case/whitespace.
 * Unconfirmed equipment identities are included and reported separately; explicit
 * writer mapping-conflict and unmapped flags remain exclusions.
 *
 * Harness approximations, not routine targets:
 * - Most recent eight prior completed non-deload exposures.
 * - S is the modal working-set count, ties favoring the latest count.
 * - Role structure is the latest prior structure with that modal count.
 * - Rep bounds: rounded per-role 20th/80th percentiles, widened to two reps.
 * - RPE bounds: per-role 20th/80th percentiles with >=50% typed coverage,
 *   otherwise [7,9].
 * - Increment: smallest distinct positive working-load difference in lb,
 *   floored at 2.5 lb; default 5 lb.
 * - Historical target versions are absent and treated as compatible.
 * - Local datetimes use a UTC ordering axis, not UTC evidence.
 * - Strong RPE is typed when present and unknown when absent.
 * - Deload applies to history only; predicted sessions are unmarked.
 * - Injury dates are supplied, never inferred.
 *
 * Current completions map to prior role/position structure. Retrospective roles
 * enter history only after evaluation. Errors project Epley capacity to actual
 * load; reps-only work requires matching load. All methods share one cohort of
 * actual positions in their session-start plans. coachBetweenSets reports revised
 * predictions separately on that cohort. Coverage and added/removed sets are
 * explicit. replayCSV and the CLI emit aggregates only.
 */
"use strict";

const fs = require("node:fs");
const coach = require("../coach-engine.js");

const ROLE_MAP = Object.freeze({
  warmup: "warmup", top_set: "top", top: "top",
  back_off_set: "backoff", backoff: "backoff",
  straight_working_set: "straight", straight: "straight",
  drop_set: "drop", drop: "drop", failure: "failure",
  amrap: "amrap", technique: "technique", deload: "deload",
  other: "unknown", unknown: "unknown", unclassified: "unknown"
});
const ALLOWED_CODES = ["seed", "add_reps", "add_load", "hold", "deteriorating_hold",
  "reduce_load", "increment_too_coarse", "add_set", "remove_set", "readiness_hold",
  "exception_suppressed", "layoff_reentry", "injury_reentry", "deload_marked", "factual_only"];
const SUPPORTED = ["external", "bodyweight_plus_load", "bodyweight", "assisted_bodyweight"];
const EXTERNAL = ["external", "bodyweight_plus_load"];

function parseCSV(text) {
  if (typeof text !== "string") throw new TypeError("CSV text required.");
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closed = false;
  const finishField = () => {
    row.push(field);
    field = "";
    closed = false;
  };
  const finishRow = () => {
    finishField();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === "\"") {
        if (text[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += character;
      continue;
    }
    if (closed && ![",", "\r", "\n"].includes(character)) {
      throw new TypeError("Invalid quoted CSV field.");
    }
    if (character === "\"") {
      if (field.length || closed) throw new TypeError("Invalid CSV quote.");
      quoted = true;
    } else if (character === ",") finishField();
    else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      finishRow();
    } else field += character;
  }
  if (quoted) throw new TypeError("Unterminated CSV field.");
  if (field.length || row.length || closed) finishRow();
  if (!rows.length) throw new TypeError("CSV header required.");
  const header = rows.shift();
  if (new Set(header).size !== header.length || header.some((name) => !name)) {
    throw new TypeError("Invalid CSV header.");
  }
  return rows.map((values) => {
    if (values.length !== header.length) throw new TypeError("CSV column count mismatch.");
    return Object.fromEntries(header.map((key, index) => [key, values[index]]));
  });
}

function number(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolean(value) {
  return ["true", "1"].includes(String(value).trim().toLowerCase());
}

function workingRole(role) {
  return !["warmup", "drop", "deload", "unknown"].includes(role);
}

function unit(value) {
  if (value === "lb_inferred_from_strong_context") return "lb";
  return ["lb", "kg"].includes(value) ? value : null;
}

function physical(value, loadUnit) {
  return coach.physicalLoad(value, loadUnit);
}

function equalLoad(a, b) {
  const first = physical(a.load, a.unit);
  const second = physical(b.load, b.unit);
  return first !== null && second !== null
    && Math.abs(first - second) <= 1e-8 * Math.max(1, first, second);
}

function percentile(values, fraction) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const location = (sorted.length - 1) * fraction;
  const low = Math.floor(location);
  const high = Math.ceil(location);
  return sorted[low] + (sorted[high] - sorted[low]) * (location - low);
}

function mode(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const maximum = Math.max(...counts.values());
  return values.slice().reverse().find((value) => counts.get(value) === maximum);
}

function inferTargets(prior) {
  const window = prior.filter((exposure) => !exposure.isDeload
    && !exposure.sessionIsDeload).slice(-8);
  if (!window.length) return null;
  const work = (exposure) => exposure.sets.filter((set) => workingRole(set.role));
  const counts = window.map((exposure) => work(exposure).length).filter((value) => value > 0);
  if (!counts.length) return null;
  const normalCount = mode(counts);
  const structure = window.slice().reverse().find((exposure) =>
    work(exposure).length === normalCount);
  const pattern = work(structure).map((set) => set.role);
  const workingSets = window.flatMap(work);
  const loads = [...new Set(workingSets.map((set) =>
    physical(set.load, set.unit)).filter((value) => value !== null))]
    .sort((a, b) => a - b);
  const differences = loads.slice(1).map((value, index) => value - loads[index])
    .filter((value) => value > 1e-8);
  const increment = differences.length ? Math.max(2.5, Math.min(...differences)) : 5;
  const roles = [...new Set(pattern)].map((name) => {
    const observations = workingSets.filter((set) => set.role === name);
    const reps = observations.map((set) => set.reps).filter((value) =>
      Number.isInteger(value) && value > 0);
    let low = Math.max(1, Math.round(percentile(reps, 0.2)));
    let high = Math.max(low, Math.round(percentile(reps, 0.8)));
    if (high - low < 2) {
      const midpoint = Math.round((high + low) / 2);
      low = Math.max(1, midpoint - 1);
      high = low + 2;
    }
    const efforts = observations.filter((set) => set.rpeSource === "typed"
      && Number.isFinite(set.rpe)).map((set) => set.rpe);
    const typedCoverage = efforts.length / Math.max(1, observations.length);
    const last = observations.at(-1);
    const lastLoad = physical(last.load, last.unit);
    return {
      role: name,
      S: pattern.filter((value) => value === name).length,
      rMin: low, rMax: high,
      eMin: typedCoverage < 0.5 ? 7 : percentile(efforts, 0.2),
      eMax: typedCoverage < 0.5 ? 9 : percentile(efforts, 0.8),
      restSeconds: 90,
      increment: { value: increment, unit: "lb" },
      defaultLoad: lastLoad === null ? null : { value: lastLoad, unit: "lb" },
      defaultReps: Math.max(low, Math.min(high, last.reps))
    };
  });
  return roles;
}

function timestamp(row) {
  const value = row.workout_local_datetime
    || (row.workout_date + "T" + (row.workout_time_local || "00:00:00"));
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const iso = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized) ? normalized : normalized + "Z";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function normalizedLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function identity(row) {
  return JSON.stringify([normalizedLabel(row.exercise_name_recorded),
    normalizedLabel(row.exercise_variation)]);
}

function identityCategory(rows) {
  const confirmed = new Set(["confirmed", "verified", "user_confirmed", "equipment_confirmed"]);
  return rows.every((row) => confirmed.has(normalizedLabel(row.equipment_identity_status)))
    ? "confirmed" : "unconfirmed";
}

function mappingProblem(row) {
  if (["exercise_mapping_conflict", "exercise_mapping_conflicted", "mapping_conflict"]
    .some((key) => boolean(row[key]))) return "mapping_conflict";
  if (["exercise_mapping_unmapped", "mapping_unmapped"].some((key) => boolean(row[key]))) {
    return "mapping_unmapped";
  }
  const labels = [row.exercise_mapping_source, row.exercise_mapping_status, row.mapping_status,
    row.missing_data_flags].map((value) => String(value || "").toLowerCase()).join(" ");
  if (/mapping_conflict|mapping conflic|conflicted|mapping_status_conflict|\bconflict\b/.test(labels)) {
    return "mapping_conflict";
  }
  if (/unmapped/.test(labels) || normalizedLabel(row.equipment_identity_status) === "unmapped") {
    return "mapping_unmapped";
  }
  return null;
}

function observedExposure(rows, metadata) {
  const positions = new Map();
  const sets = rows.filter((row) => boolean(row.completed)).map((row, index) => {
    const role = ROLE_MAP[row.set_type] || "unknown";
    const position = positions.get(role) || 0;
    positions.set(role, position + 1);
    const rpe = number(row.rpe);
    return {
      setId: row.record_id,
      role, position, sequenceIndex: index,
      load: number(row.load), unit: unit(row.load_unit),
      reps: number(row.repetitions),
      rpe, rpeSource: rpe === null ? "unknown" : "typed",
      resistanceType: row.resistance_type,
      completed: true,
      skipped: false,
      targetReps: number(row.repetitions)
    };
  });
  return {
    exposureId: metadata.sessionId + ":" + metadata.key,
    variantIdentity: metadata.key,
    targetVersion: "harness-inferred/v1",
    date: metadata.at,
    completed: true,
    isDeload: rows.some((row) => row.set_type === "deload"),
    sessionIsDeload: false,
    sets
  };
}

function makeInput(prior, metadata, previousState, injuryDates) {
  const roles = inferTargets(prior);
  if (!roles) return null;
  return {
    sessionId: metadata.sessionId,
    evaluationId: "replay:" + metadata.sessionId + ":" + metadata.key,
    createdAt: metadata.at,
    date: metadata.at.slice(0, 10),
    isDeload: false,
    readiness: "usual",
    resolverAction: null,
    injurySkippedDates: injuryDates,
    exercises: [{
      exerciseId: "replay-exercise",
      variantIdentity: metadata.key,
      resistanceType: prior.filter((item) => !item.isDeload).at(-1)?.sets
        .find((set) => workingRole(set.role))?.resistanceType || "unknown",
      targetVersion: "harness-inferred/v1",
      roles,
      history: prior,
      ...(previousState ? { state: previousState } : {})
    }]
  };
}

function baseline(prior, row, stableRole, progressive, resistanceType) {
  const history = prior.filter((exposure) => !exposure.isDeload);
  const last = history.at(-1);
  const match = (exposure) => exposure?.sets.find((set) =>
    set.role === row.role && set.position === row.position && set.completed);
  const previous = match(last);
  if (!previous) return null;
  const clamp = (reps) => Math.max(stableRole.rMin, Math.min(stableRole.rMax, reps));
  let result = { load: previous.load, unit: previous.unit, reps: previous.reps };
  if (!progressive) return result;
  const previousExposure = history.at(-2);
  const ceiling = [previousExposure, last].every((exposure) => exposure
    && Array.from({ length: stableRole.S }, (_, position) => {
      return exposure.sets.find((set) => set.role === row.role && set.position === position);
    }).every((set) => set && set.reps >= stableRole.rMax && equalLoad(set, previous)));
  if (ceiling && EXTERNAL.includes(resistanceType)) {
    const load = physical(previous.load, previous.unit);
    const next = Math.round((load + stableRole.increment.value) / stableRole.increment.value)
      * stableRole.increment.value;
    result = {
      load: next, unit: "lb",
      reps: clamp(Math.round(30 * (load * (1 + previous.reps / 30) / next - 1)))
    };
  } else result.reps = clamp(previous.reps + 1);
  return result;
}

function planSession(prior, metadata, previousState, injuryDates = []) {
  prior = prior.filter((exposure) => exposure.date < metadata.at);
  const input = makeInput(prior, metadata, previousState, injuryDates);
  if (!input) return null;
  const prescription = coach.prescribeSession(input);
  const exercise = input.exercises[0];
  const slots = exercise.roles.flatMap((role) => Array.from({ length: role.S },
    (_, position) => ({ role: role.role, position })));
  const repeatLast = slots.map((slot) => ({
    ...slot, target: baseline(prior, slot,
      exercise.roles.find((role) => role.role === slot.role), false, exercise.resistanceType)
  }));
  const doubleProgression = slots.map((slot) => ({
    ...slot, target: baseline(prior, slot,
      exercise.roles.find((role) => role.role === slot.role), true, exercise.resistanceType)
  }));
  return { input, prescription, slots, repeatLast, doubleProgression };
}

function perturbedMetadata(metadata) {
  const known = new Set(["session_id", "record_id", "exercise_id", "exercise_variation",
    "comparison_group", "exercise_name_recorded", "workout_date", "workout_time_local", "workout_local_datetime"]);
  const records = (metadata.records || []).map((row) => {
    const result = {};
    Object.keys(row).forEach((key) => {
      result[key] = known.has(key) ? row[key] : "perturbed";
    });
    return { ...result, set_type: "deload", is_warmup: "true", completed: "false",
      completion_status: "incomplete", completion_inference: "perturbed",
      source_set_order_kind: "warmup", resistance_type: "duration",
      equipment_identity_status: "ambiguous", load: "999999", repetitions: "999",
      rpe: "10", load_unit: "kg", set_sequence_in_exercise: "999",
      session_set_sequence: "999", working_set_number: "999" };
  });
  return { ...metadata, records, isDeload: true, completed: false,
    resistanceType: "duration", role: "deload" };
}

function metricAccumulator() {
  return { evaluatedSets: 0, comparedSets: 0, absoluteError: 0, signedError: 0,
    matchedLoadSets: 0, overshoots: 0 };
}

function projectedReps(target, actual, resistanceType) {
  if (!target) return null;
  if (!EXTERNAL.includes(resistanceType)) return equalLoad(target, actual) ? target.reps : null;
  const a = physical(target.load, target.unit), b = physical(actual.load, actual.unit);
  return a > 0 && b > 0 ? Math.max(0, 30 * (a * (1 + target.reps / 30) / b - 1)) : null;
}

function score(accumulator, target, actual, prediction) {
  accumulator.evaluatedSets += 1;
  if (equalLoad(target, actual)) {
    accumulator.matchedLoadSets += 1;
    if (actual.reps < target.reps) accumulator.overshoots += 1;
  }
  if (prediction !== null) {
    const error = prediction - actual.reps;
    accumulator.comparedSets += 1;
    accumulator.absoluteError += Math.abs(error);
    accumulator.signedError += error;
  }
}

function finalizeMetric(value, actualWorkingSets, phase) {
  return {
    phase, evaluatedSets: value.evaluatedSets,
    setsScored: value.evaluatedSets, actualWorkingSets,
    coverage: actualWorkingSets ? value.evaluatedSets / actualWorkingSets : null,
    comparedSets: value.comparedSets,
    mae: value.comparedSets ? value.absoluteError / value.comparedSets : null,
    bias: value.comparedSets ? value.signedError / value.comparedSets : null,
    matchedLoadSets: value.matchedLoadSets,
    loadMatchRate: value.evaluatedSets ? value.matchedLoadSets / value.evaluatedSets : null,
    overshoots: value.overshoots,
    overshootRate: value.matchedLoadSets ? value.overshoots / value.matchedLoadSets : null
  };
}

function replayCSV(csv, options = {}) {
  const rows = parseCSV(csv);
  const required = ["record_id", "session_id", "exercise_id", "exercise_name_recorded", "exercise_variation",
    "comparison_group", "equipment_identity_status", "workout_date",
    "set_sequence_in_exercise", "source_set_order_kind", "set_type", "is_warmup",
    "resistance_type", "load", "load_unit", "repetitions", "rpe", "completed",
    "completion_inference"];
  if (rows.length && required.some((key) => !(key in rows[0]))) {
    throw new TypeError("Required normalized workout columns are missing.");
  }
  const injuryDates = options.injuryDates || [];
  injuryDates.forEach((date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
      || new Date(date).toISOString().slice(0, 10) !== date) {
      throw new TypeError("Invalid injury date.");
    }
  });
  const summary = {
    formatVersion: "comprehensive-fitness-coach-replay/1.0.2",
    aggregateOnly: true,
    approximations: {
      source: "normalized Strong writer contract",
      identity: "recorded name and variation, normalized case and whitespace",
      identityCoverage: "identities counted within each provenance category; labels can occur in both",
      historyWindow: 8,
      setCount: "modal prior working count; latest matching role structure",
      repRange: "per-role rounded 20th/80th percentiles widened to two reps",
      rpeBand: "per-role 20th/80th percentiles at 50% typed coverage; otherwise 7-9",
      increment: "smallest distinct prior load difference in lb; floor 2.5; default 5",
      targetVersions: "unavailable; observed history treated as compatible",
      previousTargets: "unavailable; achieved reps used as the prior met-target proxy",
      clock: "local datetimes interpreted on a UTC ordering axis",
      deload: "history only; predicted session is never marked from its completed rows",
      injury: "supplied skipped dates only",
      scoring: "same actual positions shared by all session-start plans; revised coach reported separately",
      coverage: "scored sets divided by valid actual working sets, including cold starts"
    },
    sessions: { total: 0, evaluated: 0, skipped: 0 },
    exercises: { identities: 0, evaluated: 0, skipped: 0 },
    skippedReasons: {}, codeDistribution: {},
    unitInferences: { rows: rows.filter((row) =>
      row.load_unit === "lb_inferred_from_strong_context").length },
    metrics: {},
    identityCoverage: Object.fromEntries(["confirmed", "unconfirmed"].map((category) =>
      [category, { identities: 0, exposures: 0, evaluated: 0, skipped: 0,
        actualWorkingSets: 0, setsScored: 0, coverage: null }])),
    setAccounting: { actualWorkingSets: 0, commonScoredSets: 0,
      coachAddedPlannedSets: 0, coachRemovedPlannedSets: 0,
      actualCoachAddedSets: 0, unperformedCoachAddedSets: 0,
      actualCoachRemovedSets: 0, actualSetsOutsideCommonPlan: 0 },
    oscillationCount: 0, boundViolationCount: 0,
    leakage: { sessionHistoryChecks: 0, setPrefixChecks: 0,
      futurePerturbationChecks: 0, violations: 0, passed: true }
  };
  const skip = (reason) => {
    summary.exercises.skipped += 1;
    summary.skippedReasons[reason] = (summary.skippedReasons[reason] || 0) + 1;
  };
  const sessions = new Map(), identities = new Set();
  rows.forEach((row, index) => {
    const at = timestamp(row);
    if (!at) {
      summary.skippedReasons.invalid_timestamp_rows =
        (summary.skippedReasons.invalid_timestamp_rows || 0) + 1;
      return;
    }
    const sessionKey = JSON.stringify([row.session_id, at]);
    if (!sessions.has(sessionKey)) sessions.set(sessionKey, {
      sessionId: row.session_id, at, exercises: new Map()
    });
    const session = sessions.get(sessionKey), key = identity(row);
    identities.add(key);
    if (!session.exercises.has(key)) session.exercises.set(key, []);
    session.exercises.get(key).push({ ...row, replayOrder: index });
  });
  summary.exercises.identities = identities.size;
  const histories = new Map(), states = new Map();
  const coverageIdentities = { confirmed: new Set(), unconfirmed: new Set() };
  const accumulators = Object.fromEntries(["coach", "repeatLast", "doubleProgression",
    "coachBetweenSets"].map((key) => [key, metricAccumulator()]));
  const ordered = [...sessions.values()].sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1
      : a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0);
  const positionKey = (row) => JSON.stringify([row.role, row.position]);
  const inspect = (prescription) => {
    if (!coach.validatePrescription(prescription).ok) summary.boundViolationCount += 1;
  };
  ordered.forEach((session) => {
    summary.sessions.total += 1;
    let evaluated = false;
    const pending = [];
    session.exercises.forEach((sourceRows, key) => {
      const current = sourceRows.slice().sort((a, b) =>
        (number(a.session_set_sequence) ?? number(a.set_sequence_in_exercise) ?? a.replayOrder)
        - (number(b.session_set_sequence) ?? number(b.set_sequence_in_exercise) ?? b.replayOrder));
      const category = identityCategory(current);
      const coverage = summary.identityCoverage[category];
      coverage.exposures += 1;
      coverageIdentities[category].add(key);
      const skipExposure = (reason) => { coverage.skipped += 1; skip(reason); };
      const prior = (histories.get(key) || []).filter((item) => item.date < session.at);
      const metadata = { sessionId: session.sessionId, at: session.at, key, records: current };
      const plan = planSession(prior, metadata, states.get(key), injuryDates);
      if (plan) {
        summary.leakage.sessionHistoryChecks += 1;
        if (plan.input.exercises[0].history.some((item) => item.date >= session.at)) {
          summary.leakage.violations += 1;
        }
        const perturbed = planSession(prior, perturbedMetadata(metadata), states.get(key), injuryDates);
        summary.leakage.futurePerturbationChecks += 1;
        if (coach.stableDigest(plan) !== coach.stableDigest(perturbed)) {
          summary.leakage.violations += 1;
        }
      }
      if (!normalizedLabel(current[0].exercise_name_recorded)) {
        skipExposure("missing_recorded_identity"); return;
      }
      const mapping = current.map(mappingProblem).find(Boolean);
      if (mapping) { skipExposure(mapping); return; }
      const completed = current.filter((row) => boolean(row.completed));
      if (!completed.length) { skipExposure("no_completed_sets"); return; }
      const resistanceType = completed[0].resistance_type;
      if (!SUPPORTED.includes(resistanceType)) { skipExposure("unsupported_resistance"); return; }
      if (completed.some((row) => row.resistance_type !== resistanceType)) {
        skipExposure("mixed_resistance"); return;
      }
      if (completed.some((row) => !unit(row.load_unit) || number(row.load) === null
        || number(row.load) < 0)) { skipExposure("invalid_load_or_unit"); return; }
      const actualRows = completed.filter((row) =>
        !["warmup", "drop_set", "rest_timer"].includes(row.source_set_order_kind));
      if (actualRows.some((row) => !Number.isInteger(number(row.repetitions))
        || number(row.repetitions) < 1 || (number(row.rpe) !== null
          && (number(row.rpe) < 0 || number(row.rpe) > 10)))) {
        skipExposure("invalid_reps_or_rpe"); return;
      }
      summary.setAccounting.actualWorkingSets += actualRows.length;
      coverage.actualWorkingSets += actualRows.length;
      const observed = observedExposure(completed, metadata);
      if (observed.sets.some((set) => workingRole(set.role)) || observed.isDeload) {
        pending.push([key, observed]);
      }
      if (!plan) {
        summary.setAccounting.actualSetsOutsideCommonPlan += actualRows.length;
        skipExposure("no_prior_structure"); return;
      }
      evaluated = true;
      summary.exercises.evaluated += 1;
      coverage.evaluated += 1;
      let prescription = plan.prescription;
      inspect(prescription);
      const coachRows = prescription.sets.filter((row) => workingRole(row.role));
      const coachMap = new Map(coachRows.map((row) => [positionKey(row), row]));
      const repeatMap = new Map(plan.repeatLast.map((row) => [positionKey(row), row.target]));
      const doubleMap = new Map(plan.doubleProgression.map((row) => [positionKey(row), row.target]));
      const baseKeys = new Set(plan.slots.map(positionKey));
      const added = coachRows.filter((row) => !baseKeys.has(positionKey(row)));
      const removed = plan.slots.filter((row) => !coachMap.has(positionKey(row)));
      summary.setAccounting.coachAddedPlannedSets += added.length;
      summary.setAccounting.coachRemovedPlannedSets += removed.length;
      const slots = [...plan.slots, ...added];
      const observedPositions = new Set();
      const prefix = [];
      let commonCount = 0;
      actualRows.forEach((record, index) => {
        const slot = slots[index];
        if (!slot) return;
        const slotKey = positionKey(slot);
        observedPositions.add(slotKey);
        const start = coachMap.get(slotKey);
        const currentTarget = start && prescription.sets.find((row) => row.setId === start.setId);
        const actual = {
          setId: start?.setId || "unplanned:" + index, completed: true, skipped: false, edited: false,
          load: number(record.load), unit: unit(record.load_unit),
          reps: number(record.repetitions), rpe: number(record.rpe),
          rpeSource: number(record.rpe) === null ? "unknown" : "typed",
          loadSource: "entered", repsSource: "entered"
        };
        const targets = { coach: start?.target, repeatLast: repeatMap.get(slotKey),
          doubleProgression: doubleMap.get(slotKey), coachBetweenSets: currentTarget?.target };
        if (Object.values(targets).every(Boolean)) {
          const predictions = Object.fromEntries(Object.entries(targets).map(([name, target]) =>
            [name, projectedReps(target, actual, resistanceType)]));
          const commonError = Object.values(predictions).every((value) => value !== null);
          Object.entries(targets).forEach(([name, target]) =>
            score(accumulators[name], target, actual, commonError ? predictions[name] : null));
          commonCount += 1;
        }
        if (start) {
          prefix.push(actual);
          summary.leakage.setPrefixChecks += 1;
          if (prefix.some((set) => !set.completed)) summary.leakage.violations += 1;
          prescription = coach.reviseAfterSet(prescription, { at: session.at, sets: prefix }, actual.setId);
          inspect(prescription);
        }
      });
      summary.setAccounting.commonScoredSets += commonCount;
      coverage.setsScored += commonCount;
      summary.setAccounting.actualSetsOutsideCommonPlan += actualRows.length - commonCount;
      summary.setAccounting.actualCoachAddedSets += added.filter((row) =>
        observedPositions.has(positionKey(row))).length;
      summary.setAccounting.unperformedCoachAddedSets += added.filter((row) =>
        !observedPositions.has(positionKey(row))).length;
      summary.setAccounting.actualCoachRemovedSets += removed.filter((row) =>
        observedPositions.has(positionKey(row))).length;
      prescription.exercises[0].codes.forEach((code) => {
        if (ALLOWED_CODES.includes(code)) summary.codeDistribution[code] =
          (summary.codeDistribution[code] || 0) + 1;
      });
      const events = prescription.sets.flatMap((row) => row.revisions)
        .filter((revision) => !revision.undone && !revision.superseded).sort((a, b) =>
          coachRows.findIndex((row) => row.setId === a.afterSetId)
          - coachRows.findIndex((row) => row.setId === b.afterSetId));
      let down = false;
      events.forEach((revision) => {
        if (["reduce_reps", "reduce_load"].includes(revision.code)) down = true;
        if (down && ["add_reps", "add_load"].includes(revision.code)) summary.oscillationCount += 1;
      });
      const exercise = prescription.exercises[0];
      states.set(key, { deteriorationEpisode: exercise.deteriorationEpisode,
        addedSetExperiment: exercise.addedSetExperiment });
    });
    pending.forEach(([key, exposure]) => {
      const history = histories.get(key) || [];
      history.push(exposure); histories.set(key, history);
    });
    if (evaluated) summary.sessions.evaluated += 1; else summary.sessions.skipped += 1;
  });
  Object.entries(accumulators).forEach(([name, accumulator]) => {
    summary.metrics[name] = finalizeMetric(accumulator, summary.setAccounting.actualWorkingSets,
      name === "coachBetweenSets" ? "between_sets" : "session_start");
  });
  Object.entries(summary.identityCoverage).forEach(([category, coverage]) => {
    coverage.identities = coverageIdentities[category].size;
    coverage.coverage = coverage.actualWorkingSets
      ? coverage.setsScored / coverage.actualWorkingSets : null;
  });
  summary.leakage.passed = summary.leakage.violations === 0;
  return summary;
}

function main(argv) {
  if (!argv.length) throw new TypeError("CSV path required.");
  const csvPath = argv[0];
  let outPath = null;
  let injuryPath = null;
  for (let index = 1; index < argv.length; index += 2) {
    if (!argv[index + 1]) throw new TypeError("Option value required.");
    if (argv[index] === "--out" && outPath === null) outPath = argv[index + 1];
    else if (argv[index] === "--injury-dates" && injuryPath === null) injuryPath = argv[index + 1];
    else throw new TypeError("Unknown or duplicate option.");
  }
  const injuryDates = injuryPath
    ? fs.readFileSync(injuryPath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : [];
  const summary = replayCSV(fs.readFileSync(csvPath, "utf8"), { injuryDates });
  const output = JSON.stringify(summary, null, 2) + "\n";
  if (outPath) fs.writeFileSync(outPath, output, "utf8");
  process.stdout.write(output);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (_error) {
    process.stderr.write("Coach replay failed: invalid input or output destination.\n");
    process.exitCode = 1;
  }
}

module.exports = { parseCSV, inferTargets, replayCSV, planSession };
