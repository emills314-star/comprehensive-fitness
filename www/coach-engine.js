/**
 * Pure deterministic UMD coach. No DOM, storage, app globals or clock reads.
 *
 * prescribeSession({
 *   sessionId,evaluationId,createdAt,date,isDeload?,
 *   readiness?:"usual"|"meaningfully_poor"|"unusually_good",
 *   resolverAction?:null|{code,overridden?},
 *   injurySkippedDates?:["YYYY-MM-DD"],
 *   exercises:[{
 *     exerciseId,variantIdentity,resistanceType,targetVersion,isDeload?,
 *     roles:[{
 *       role,S,rMin,rMax,eMin,eMax,restSeconds,
 *       increment:null|{value,unit:"lb"|"kg"},
 *       defaultLoad:null|{value,unit:"lb"|"kg"},defaultReps:null|integer
 *     }],
 *     sets?:[{setId,role,position,sequenceIndex}],
 *     history:[{
 *       exposureId,variantIdentity,targetVersion,date,completed,
 *       isDeload?,sessionIsDeload?,
 *       sets:[{setId,role,position,sequenceIndex?,load,unit,reps,rpe,rpeSource,
 *         targetReps?,resistanceType,completed,skipped?,isWarmup?}]
 *     }],
 *     state?:{deteriorationEpisode,addedSetExperiment}
 *   }]
 * })
 *
 * Dates are supplied ISO values. History must precede createdAt and retain at
 * least four comparable exposures plus needed predecessors. Identity, target
 * version and resistance must match. Positions are zero-based. Deload exposures
 * are excluded; injury reentry is derived from skipped dates. Carry the previous
 * output's episode/experiment state only across compatible target versions.
 *
 * reviseAfterSet(prescription,{
 *   at,revisionEnabled?,undoLocks?:[{setId,target}],
 *   sets:[{setId,completed,skipped?,edited?,load,unit,reps,rpe,rpeSource,
 *     loadSource?,repsSource?,completionOrder?,prescribedTarget?,editedTarget?}]
 * },completedSetId)
 *
 * Supply all current facts. completionOrder is immutable completion order;
 * array order is the fallback. prescribedTarget is the target shown at completion
 * or skip. editedTarget is the target frozen when edited. Both are captured when first
 * observed if omitted, then retained through corrections. Actual app observations
 * are never modified. Changing session-start conditions requires prescribeSession.
 *
 * Section 7 representation:
 * stableTargets[] freezes exercise identity, resistance, targetVersion and roles.
 * exercises[] holds exerciseId,variantIdentity,plannedSetCount,optionalSetIds,
 * codes,reasonText,comparisonExposureIds,increaseBlockedReasons,
 * deteriorationEpisode,addedSetExperiment,sessionStart,revisionReplay.
 * sets[] holds setId,exerciseId,role,position,sequenceIndex,anchor,targetRpe,
 * target,revisions. Targets are {load,unit,reps}; null means no prescription.
 * Revisions are {revisionId,at,afterSetId,from,to,code,undone,locked,superseded}.
 *
 * sessionStart={codes,reasonText} is immutable. Every evaluation rebuilds active
 * decisions from anchors in completion order. Superseded records remain audit-only.
 * revisionReplay={generation,factsDigest,facts,undoLocks,enabled,at} retains minimal
 * evaluation facts so undoRevision(prescription,setId,optionalAt) can also replay.
 * Generation namespaces audit IDs and never influences decisions.
 *
 * deteriorationEpisode={active,reduced,badStreak,stableExposures,
 *   detectedExposureId,lastExposureId,holdIssuedAfterExposureId}.
 * addedSetExperiment[]={role,active,remainingExposures,startedAfterExposureId,
 *   lastExposureId,endedReason,excludedThroughExposureId}.
 *
 * Returned objects have recursive canonical key order. Array order is preserved.
 * Stable targets and sessionStart snapshots are deeply frozen. Inputs are untouched.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ComprehensiveFitnessCoach = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COACH_CONTRACT_VERSION = "comprehensive-fitness-coach/1.0.0";
  const ENGINE_VERSION = "comprehensive-fitness-coach-engine/1.0.3";
  const PARAMETER_VERSION = "comprehensive-fitness-coach-parameters/1.0.0";
  const COACH_PARAMETERS_V1 = Object.freeze({
    historyExposures: 4, // Section 3: uncalibrated assumption.
    minimumExposures: 2, // Section 3: uncalibrated assumption.
    layoffDays: 28, // Section 3: uncalibrated assumption.
    injuryReturnExposures: 1, // Section 3: uncalibrated assumption.
    deteriorationRepLoss: 2, // Section 4.2: uncalibrated assumption.
    deteriorationRpeRise: 1, // Section 4.2: uncalibrated assumption.
    deteriorationExposures: 2, // Section 4.2: uncalibrated assumption.
    stableResetExposures: 2, // Section 4.2: uncalibrated assumption.
    reductionFraction: 0.05, // Sections 4.2/5: uncalibrated assumption.
    progressionExposures: 2, // Section 4.3: uncalibrated assumption.
    increaseFraction: 0.10, // Sections 4.3/5: uncalibrated assumption.
    midpointDivisor: 2, // Section 4.3: uncalibrated assumption.
    repStep: 1, // Sections 4.3/5: uncalibrated assumption.
    plateauExposures: 4, // Section 4.4: uncalibrated assumption.
    experimentExposures: 3, // Section 4.4: uncalibrated assumption.
    setAdjustment: 1, // Section 4.4: uncalibrated assumption.
    minimumSets: 1, // Section 4.4: uncalibrated assumption.
    revisionRepBound: 1, // Section 5: uncalibrated assumption.
    revisionIncrementBound: 1, // Section 5: uncalibrated assumption.
    revisionRepSurplus: 2, // Section 5: uncalibrated assumption.
    revisionRepDeficit: 2, // Section 5: uncalibrated assumption.
    revisionEasyMargin: 1, // Section 5: uncalibrated assumption.
    revisionHardMargin: 1, // Section 5: uncalibrated assumption.
    optionalRepDeficit: 2, // Section 5: uncalibrated assumption.
    optionalRpe: 9.5, // Section 5: uncalibrated assumption.
    recoveryBaselineDays: 28, // Section 8: uncalibrated assumption.
    recoveryMinimumDays: 14, // Section 8: uncalibrated assumption.
    recoveryMarkerCount: 2, // Section 8 shadow example: uncalibrated assumption.
    recoveryMarkerTotal: 3, // Section 8 shadow example: uncalibrated assumption.
    recoveryLowPercentile: 10, // Section 8 shadow example: uncalibrated assumption.
    recoveryHighPercentile: 90, // Section 8 shadow example: uncalibrated assumption.
    recoveryEvaluationMinimumWeeks: 6, // Section 8: uncalibrated assumption.
    recoveryEvaluationMaximumWeeks: 8, // Section 8: uncalibrated assumption.
    shadowMinimumWeeks: 2, // Section 10: uncalibrated assumption.
    shadowMaximumWeeks: 3 // Section 10: uncalibrated assumption.
  });
  const P = COACH_PARAMETERS_V1;
  const LB_PER_KG = 2.2046226218;
  const DAY_MS = 86400000;
  const EPSILON = 1e-8;
  const ROLES = ["warmup", "top", "backoff", "straight", "drop", "failure",
    "amrap", "technique", "deload", "unknown"];
  const CODES = ["seed", "add_reps", "add_load", "hold", "deteriorating_hold",
    "reduce_load", "increment_too_coarse", "add_set", "remove_set",
    "readiness_hold", "exception_suppressed", "layoff_reentry",
    "injury_reentry", "deload_marked", "factual_only"];
  const REVISION_CODES = ["event_evaluated", "add_reps", "add_load",
    "reduce_reps", "reduce_load", "increment_too_coarse", "optional_last_set",
    "completed_target", "skipped_target", "edit_lock", "undo_lock"];
  const EXTERNAL = ["external", "bodyweight_plus_load"];
  const REPS_ONLY = ["bodyweight", "assisted_bodyweight"];

  function clone(value, depth = 0) {
    if (depth > 30) throw new TypeError("Coach JSON nesting is too deep.");
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map((item) => clone(item, depth + 1));
    if (!value || typeof value !== "object"
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      throw new TypeError("Coach values must be finite JSON.");
    }
    const result = {};
    Object.keys(value).sort().forEach((key) => {
      if (["__proto__", "prototype", "constructor"].includes(key)) {
        throw new TypeError("Forbidden coach key.");
      }
      if (value[key] !== undefined) result[key] = clone(value[key], depth + 1);
    });
    return result;
  }

  function stableDigest(value) {
    const text = JSON.stringify(clone(value));
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      first = Math.imul(first ^ code, 0x01000193) >>> 0;
      second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
      second = ((second << 13) | (second >>> 19)) >>> 0;
    }
    return "fnv1a64:" + first.toString(16).padStart(8, "0")
      + second.toString(16).padStart(8, "0");
  }

  function freeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function canonicalPrescription(value) {
    const output = clone(value);
    freeze(output.stableTargets);
    output.exercises.forEach((exercise) => freeze(exercise.sessionStart));
    return output;
  }

  function time(value) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
      throw new TypeError("A supplied ISO date or timestamp is required.");
    }
    return Date.parse(value);
  }

  function physicalLoad(load, unit) {
    if (!Number.isFinite(load) || !["lb", "kg"].includes(unit)) return null;
    return unit === "kg" ? load * LB_PER_KG : load;
  }

  function sameLoad(a, b) {
    const first = physicalLoad(a.load, a.unit);
    const second = physicalLoad(b.load, b.unit);
    return first !== null && second !== null
      && Math.abs(first - second) <= EPSILON * Math.max(1, first, second);
  }

  function clamp(value, role) {
    return Math.max(role.rMin, Math.min(role.rMax, Math.round(value)));
  }

  function typed(set) {
    return set && set.rpeSource === "typed" && Number.isFinite(set.rpe)
      && set.rpe >= 0 && set.rpe <= 10;
  }

  function working(role) {
    return !["warmup", "drop", "deload", "unknown"].includes(role);
  }

  function usable(set) {
    return set.completed === true && !set.skipped && !set.isWarmup
      && working(set.role) && Number.isInteger(set.reps) && set.reps > 0;
  }

  function atPosition(exposure, role, position) {
    return exposure && exposure.sets.find((set) => usable(set)
      && set.role === role && set.position === position);
  }

  function isDeload(exposure) {
    return Boolean(exposure.isDeload || exposure.sessionIsDeload
      || exposure.sets.some((set) => set.role === "deload" || set.setType === "deload"));
  }

  function loadTarget(set) {
    return set && Number.isFinite(set.load) && ["lb", "kg"].includes(set.unit)
      ? { load: set.load, unit: set.unit } : { load: null, unit: null };
  }

  function targetsEqual(a, b) {
    if (a === null || b === null) return a === b;
    return a.reps === b.reps && ((a.load === null && b.load === null
      && a.unit === null && b.unit === null) || sameLoad(a, b));
  }

  function decideLoadStep(anchor, role, direction) {
    const blocked = (reason) => ({ target: null, reason });
    if (!role.increment || anchor.load === null) {
      return blocked("no available load is defined within one increment");
    }
    const base = physicalLoad(anchor.load, anchor.unit);
    const delta = physicalLoad(role.increment.value, role.increment.unit);
    const cap = direction > 0 ? P.increaseFraction : P.reductionFraction;
    const capName = direction > 0 ? "10% increase" : "5% reduction";
    const capReason = "the " + role.increment.value + " " + role.increment.unit
      + " increment exceeds the " + capName + " cap";
    if (!(base > 0) || !(delta > 0)) {
      return blocked("no available load is defined within one increment");
    }
    // Caps use the unrounded physical load; a coarse configured step still holds.
    if (delta / base > cap + EPSILON) return blocked(capReason);
    const factor = role.increment.unit === "kg" ? LB_PER_KG : 1;
    const edge = base / factor + direction * role.increment.value;
    // Choose the farthest grid load inside the authorized one-increment interval.
    const gridIndex = direction > 0
      ? Math.floor(edge / role.increment.value + EPSILON)
      : Math.ceil(edge / role.increment.value - EPSILON);
    const candidate = Number((gridIndex * role.increment.value).toFixed(10));
    const change = physicalLoad(candidate, role.increment.unit) - base;
    if (!Number.isFinite(candidate) || candidate < 0 || change * direction <= EPSILON) {
      return blocked("no available load exists within one increment");
    }
    if (Math.abs(change) > delta * P.revisionIncrementBound + EPSILON) {
      return blocked("the available load exceeds the one-increment anchor bound");
    }
    if (Math.abs(change) / base > cap + EPSILON) return blocked(capReason);
    return { target: { load: candidate, unit: role.increment.unit }, reason: null };
  }

  function emptyEpisode() {
    return { active: false, reduced: false, badStreak: 0, stableExposures: 0,
      detectedExposureId: null, lastExposureId: null, holdIssuedAfterExposureId: null };
  }

  function comparison(previous, current, roles) {
    if (!previous || previous.injuryReentry || current.injuryReentry
      || current.layoffReentry) return null;
    const losses = [];
    const efforts = [];
    let matched = 0;
    roles.filter((role) => working(role.role)).forEach((role) => {
      for (let position = 0; position < role.S; position += 1) {
        const a = atPosition(previous, role.role, position);
        const b = atPosition(current, role.role, position);
        if (!a || !b || !sameLoad(a, b)) continue;
        matched += 1;
        if (a.reps - b.reps >= P.deteriorationRepLoss) losses.push(role.role + ":" + position);
        if (typed(a) && typed(b)) efforts.push(b.rpe - a.rpe);
      }
    });
    return matched ? { losses, effortRise: efforts.length > 0
      && efforts.reduce((sum, value) => sum + value, 0) / efforts.length >= P.deteriorationRpeRise } : null;
  }

  function repeatedDeterioration(comparisons, index) {
    const a = comparisons[index - 1];
    const b = comparisons[index];
    return Boolean(a && b && ((a.effortRise && b.effortRise)
      || b.losses.some((position) => a.losses.includes(position))));
  }

  function advanceEpisode(history, comparisons, prior) {
    let episode = prior ? { ...emptyEpisode(), ...clone(prior) } : emptyEpisode();
    let start = 0;
    if (episode.lastExposureId !== null) {
      start = history.findIndex((item) => item.exposureId === episode.lastExposureId) + 1;
      if (!start) throw new TypeError("Episode predecessor is missing.");
    }
    for (let index = start; index < history.length; index += 1) {
      episode.lastExposureId = history[index].exposureId;
      const entry = comparisons[index];
      if (!entry) {
        episode.badStreak = 0;
        continue;
      }
      const bad = entry.losses.length > 0 || entry.effortRise;
      episode.badStreak = bad ? episode.badStreak + 1 : 0;
      if (bad) episode.stableExposures = 0;
      if (!episode.active && repeatedDeterioration(comparisons, index)) {
        episode.active = true;
        episode.detectedExposureId = history[index].exposureId;
      } else if (episode.active && !bad) {
        episode.stableExposures += 1;
        if (episode.stableExposures >= P.stableResetExposures) {
          episode = { ...emptyEpisode(), lastExposureId: history[index].exposureId };
        }
      }
    }
    return episode;
  }

  function describeEffort(sets) {
    const values = sets.filter(typed).map((set) => set.rpe);
    return values.length ? "typed RPE was " + Math.max(...values) + " or lower"
      : "RPE was unrecorded";
  }

  function sessionReason(exercise, context) {
    const { history, rows, roles, action, gapDays, resistanceType } = context;
    const codes = exercise.codes;
    const changedRole = roles.find((item) => working(item.role)
      && rows.filter((set) => set.role === item.role).length !== item.S)
      || roles.find((item) => rows.some((set) => {
        const previous = atPosition(history.at(-1), item.role, set.position);
        return set.role === item.role && previous && set.target
          && (!sameLoad(previous, set.target) || previous.reps !== set.target.reps);
      }));
    const role = changedRole || roles.find((item) => working(item.role)) || roles[0];
    const last = history.at(-1);
    const previous = last ? last.sets.filter((set) => usable(set) && set.role === role.role
      && set.position < role.S) : [];
    const row = rows.find((set) => set.role === role.role);
    const load = row?.anchor.load === null ? "the load"
      : (row?.anchor.load + " " + row?.anchor.unit);
    const facts = previous.length ? previous.map((set) => set.reps).join(", ") + " reps; "
      + describeEffort(previous) : "no comparable result is recorded";
    if (codes.includes("exception_suppressed")) return "Targets hidden: exception "
      + action.code + " is unresolved.";
    if (codes.includes("readiness_hold")) return "Holding " + load
      + " and removing one working set where possible: readiness is Worse than usual.";
    if (codes.includes("injury_reentry")) return "Repeating " + load
      + ": this is the first session after an injury skip.";
    if (codes.includes("layoff_reentry")) return "Repeating " + load
      + ": the training gap was " + Math.floor(gapDays) + " days.";
    if (codes.includes("deload_marked")) return "Repeating " + load
      + ": this session is marked as a deload.";
    if (codes.includes("increment_too_coarse")) {
      const hold = context.loadHolds[0];
      return "Holding " + (hold.anchor.load === null ? "the load"
        : hold.anchor.load + " " + hold.anchor.unit) + ": " + hold.reason + ".";
    }
    if (codes.includes("reduce_load") || codes.includes("deteriorating_hold")) {
      const recent = context.comparisons.slice(-2);
      let evidence = recent.length === 2 && recent.every((item) => item?.effortRise)
        ? "typed RPE rose in each of the last 2 comparisons"
        : "the episode has " + exercise.deteriorationEpisode.stableExposures
          + " of the required 2 stable comparable exposures";
      const old = history.at(-3);
      for (const item of role ? previous : []) {
        const before = atPosition(old, item.role, item.position);
        const position = item.role + ":" + item.position;
        if (before && recent.length === 2
          && recent.every((entry) => entry?.losses.includes(position))) {
          evidence = "set " + (item.position + 1) + " fell from " + before.reps
            + " to " + item.reps + " reps over the last 2 comparisons";
          break;
        }
      }
      const target = rows.find((set) => set.role === role.role)?.target;
      const first = previous[0];
      const delta = target && first ? (physicalLoad(target.load, target.unit)
        - physicalLoad(first.load, first.unit)) / (target.unit === "kg" ? LB_PER_KG : 1) : 0;
      return (codes.includes("reduce_load")
        ? Number(delta.toFixed(4)) + " " + target?.unit : "Holding " + load)
        + ": " + evidence + ".";
    }
    if (action?.overridden) return "Holding " + load + ": exception " + action.code
      + " was overridden.";
    if (codes.includes("remove_set")) return "Last working set removed: deterioration is active.";
    if (codes.includes("add_set")) {
      const experiment = exercise.addedSetExperiment.find((item) => item.role === role.role);
      const ordinal = (role.S + 1) + ((role.S + 1) === 2 ? "nd" : (role.S + 1) === 3 ? "rd" : "th");
      return experiment.remainingExposures < P.experimentExposures
        ? ordinal + " set retained: " + experiment.remainingExposures
          + " exposures remain in the 3-exposure experiment."
        : ordinal + " set added: the best set has not improved in 4 sessions.";
    }
    if (codes.includes("add_load")) {
      const target = rows.find((set) => set.role === role.role)?.target;
      const before = previous[0];
      const delta = target && before ? physicalLoad(target.load, target.unit)
        - physicalLoad(before.load, before.unit) : 0;
      const factor = target?.unit === "kg" ? LB_PER_KG : 1;
      return "+" + Number((delta / factor).toFixed(4)) + " " + target?.unit
        + ": all " + role.S + " sets hit " + role.rMax
        + " reps in each of the last 2 sessions; "
        + describeEffort(history.slice(-2).flatMap((item) => item.sets.filter(usable))) + ".";
    }
    if (codes.includes("add_reps")) return "+1 rep: last time " + facts + ".";
    if (codes.includes("factual_only") && roles.some((item) => item.role === "unknown")) {
      return "Factual Previous values only: the set role is ambiguous.";
    }
    if (codes.includes("factual_only")) return "Factual targets only: "
      + (EXTERNAL.includes(resistanceType) ? "the load increment has no explicit unit"
        : resistanceType + " has no supported load prescription") + ".";
    if (codes.includes("seed")) return previous.length ? "Repeating " + load + ": last time "
      + facts + "." : "Routine seed: no comparable exposure is recorded.";
    return "Holding " + load + ": last time " + facts + ".";
  }

  function validateRole(role) {
    if (!ROLES.includes(role.role) || !Number.isInteger(role.S) || role.S < 1
      || !Number.isInteger(role.rMin) || role.rMin < 1
      || !Number.isInteger(role.rMax) || role.rMax < role.rMin
      || !Number.isFinite(role.eMin) || !Number.isFinite(role.eMax)
      || role.eMin < 0 || role.eMax > 10 || role.eMax < role.eMin
      || !Number.isFinite(role.restSeconds) || role.restSeconds < 0) {
      throw new TypeError("Invalid stable role.");
    }
    for (const key of ["increment", "defaultLoad"]) {
      const value = role[key];
      if (value !== null && (!value || !Number.isFinite(value.value)
        || value.value < 0 || (key === "increment" && value.value === 0)
        || !["lb", "kg"].includes(value.unit))) {
        throw new TypeError("Stable loads require explicit units.");
      }
    }
    if (role.defaultReps !== null && (!Number.isInteger(role.defaultReps)
      || role.defaultReps < 1)) throw new TypeError("Invalid default reps.");
  }

  function prescribeSession(rawInput) {
    const input = clone(rawInput);
    const createdTime = time(input.createdAt);
    const now = time(input.date);
    if (!input.sessionId || !input.evaluationId || !Array.isArray(input.exercises)) {
      throw new TypeError("Session identity and exercises are required.");
    }
    const injuryDates = input.injurySkippedDates || [];
    injuryDates.forEach(time);
    const output = {
      contractVersion: COACH_CONTRACT_VERSION,
      engineVersion: ENGINE_VERSION,
      parameterVersion: PARAMETER_VERSION,
      evaluationId: input.evaluationId,
      createdAt: input.createdAt,
      inputDigest: stableDigest(input),
      stableTargets: [],
      exercises: [],
      sets: []
    };
    const seenExerciseIds = new Set();
    input.exercises.forEach((exercise) => {
      if (!exercise.exerciseId || !exercise.variantIdentity || !exercise.targetVersion
        || seenExerciseIds.has(exercise.exerciseId) || !exercise.roles.length) {
        throw new TypeError("Unique exercise identities and stable targets are required.");
      }
      seenExerciseIds.add(exercise.exerciseId);
      const roles = exercise.roles.map((role) => ({
        role: role.role, S: role.S, rMin: role.rMin, rMax: role.rMax,
        eMin: role.eMin, eMax: role.eMax, restSeconds: role.restSeconds,
        increment: role.increment || null, defaultLoad: role.defaultLoad || null,
        defaultReps: role.defaultReps === undefined ? null : role.defaultReps
      }));
      roles.forEach(validateRole);
      if (new Set(roles.map((role) => role.role)).size !== roles.length) {
        throw new TypeError("Stable roles must be unique.");
      }
      const arithmetic = EXTERNAL.includes(exercise.resistanceType);
      const supported = arithmetic || REPS_ONLY.includes(exercise.resistanceType);
      const all = [];
      for (const exposure of exercise.history || []) {
        if (exposure.completed !== true || exposure.variantIdentity !== exercise.variantIdentity
          || exposure.targetVersion !== exercise.targetVersion
          || !exposure.sets.every((set) => !set.resistanceType
            || set.resistanceType === exercise.resistanceType)) continue;
        exposure._time = time(exposure.date);
        if (exposure._time < createdTime) all.push(exposure);
      }
      const ordered = all.every((item, index) => !index || item._time >= all[index - 1]._time);
      if (!ordered) all.sort((a, b) => a._time - b._time
        || (a.exposureId < b.exposureId ? -1 : a.exposureId > b.exposureId ? 1 : 0));
      const history = [];
      const skipped = injuryDates.slice().sort();
      let injuryCursor = 0;
      let latestSkip = null;
      let previousNormal = null;
      let previousActivity = null;
      for (const exposure of all) {
        const day = exposure.date.slice(0, 10);
        while (injuryCursor < skipped.length && skipped[injuryCursor].slice(0, 10) <= day) {
          latestSkip = skipped[injuryCursor++].slice(0, 10);
        }
        if (!isDeload(exposure) && exposure.sets.some(usable)) {
          exposure.injuryReentry = Boolean(previousNormal && latestSkip
            && latestSkip > previousNormal.date.slice(0, 10));
          exposure.layoffReentry = Boolean(previousActivity
            && (exposure._time - previousActivity._time) / DAY_MS > P.layoffDays);
          history.push(exposure);
          previousNormal = exposure;
        }
        previousActivity = exposure;
      }
      const last = history.at(-1);
      const latestActivity = all.at(-1);
      const injury = Boolean(last && injuryDates.some((date) =>
        date.slice(0, 10) > last.date.slice(0, 10)
        && date.slice(0, 10) <= input.date.slice(0, 10)));
      const layoff = Boolean(latestActivity
        && ((now - time(latestActivity.date)) / DAY_MS > P.layoffDays
          || (injury && (now - time(last.date)) / DAY_MS > P.layoffDays)));
      const deload = Boolean(input.isDeload || exercise.isDeload
        || roles.some((role) => role.role === "deload"));
      const worse = input.readiness === "meaningfully_poor";
      const action = input.resolverAction;
      const hasAction = Boolean(action && action.code && action.code !== "no_action");
      const suppressed = hasAction && !action.overridden;
      const noIncreases = worse || hasAction || injury || layoff || deload;
      const prior = exercise.state || {};
      const comparisons = history.map((exposure, index) =>
        comparison(history[index - 1], exposure, roles));
      const episode = advanceEpisode(history, comparisons, prior.deteriorationEpisode);
      const heldAt = prior.deteriorationEpisode?.holdIssuedAfterExposureId;
      const heldIndex = heldAt ? history.findIndex((item) => item.exposureId === heldAt) : -1;
      const reduce = episode.active && !episode.reduced && heldIndex >= 0
        && heldIndex < history.length - 1 && repeatedDeterioration(comparisons, history.length - 1)
        && !injury && !layoff && !deload && !suppressed;
      if (episode.active && !episode.holdIssuedAfterExposureId && !deload && !suppressed) {
        episode.holdIssuedAfterExposureId = last?.exposureId || null;
      }
      const result = {
        exerciseId: exercise.exerciseId,
        variantIdentity: exercise.variantIdentity,
        plannedSetCount: 0,
        increaseBlockedReasons: [],
        optionalSetIds: [],
        codes: [],
        reasonText: "",
        comparisonExposureIds: history.map((item) => item.exposureId),
        deteriorationEpisode: episode,
        addedSetExperiment: []
      };
      const code = (value) => {
        if (!result.codes.includes(value)) result.codes.push(value);
      };
      if (history.length < P.minimumExposures) code("seed");
      if (!supported || roles.some((role) => role.role === "unknown")) code("factual_only");
      if (episode.active && !deload && !injury && !layoff) code("deteriorating_hold");
      if (worse) code("readiness_hold");
      if (injury) code("injury_reentry");
      if (layoff) code("layoff_reentry");
      if (deload) code("deload_marked");
      if (suppressed) code("exception_suppressed");
      if (episode.active) result.increaseBlockedReasons.push("deterioration");
      if (worse) result.increaseBlockedReasons.push("readiness");
      if (hasAction) result.increaseBlockedReasons.push(action.overridden
        ? "exception_overridden" : "exception_pending");
      if (injury) result.increaseBlockedReasons.push("injury_reentry");
      if (layoff) result.increaseBlockedReasons.push("layoff_reentry");
      if (deload) result.increaseBlockedReasons.push("deload_marked");
      if (!supported) result.increaseBlockedReasons.push("unsupported_resistance");
      const rowStart = output.sets.length;
      const loadHolds = [];
      let sequence = 0;
      roles.forEach((role) => {
        const roleHistory = history.filter((exposure) =>
          exposure.sets.some((set) => usable(set) && set.role === role.role));
        const roleLast = roleHistory.at(-1);
        const pair = roleHistory.slice(-P.progressionExposures);
        const completePositions = (exposure) => Array.from({ length: role.S },
          (_, position) => atPosition(exposure, role.role, position));
        const latestSets = roleLast ? completePositions(roleLast) : [];
        const previousSets = pair.length === P.progressionExposures
          ? completePositions(pair[0]) : [];
        const allCeiling = pair.length === P.progressionExposures
          && latestSets.length === role.S && latestSets.every(Boolean)
          && previousSets.every(Boolean)
          && [...latestSets, ...previousSets].every((set) =>
            set.reps >= role.rMax && (!typed(set) || set.rpe <= role.eMax)
            && sameLoad(set, latestSets[0]));
        const targets = [];
        for (let position = 0; position < role.S; position += 1) {
          const previous = atPosition(roleLast, role.role, position);
          const defaultSet = role.defaultLoad
            ? { load: role.defaultLoad.value, unit: role.defaultLoad.unit } : null;
          const seed = {
            ...loadTarget(previous || defaultSet),
            reps: clamp(previous ? previous.reps : role.defaultReps || role.rMin, role)
          };
          let target = { ...seed };
          if (working(role.role) && supported) {
            if (arithmetic && !role.increment) code("factual_only");
            if (reduce && arithmetic && role.increment) {
              const decision = decideLoadStep(seed, role, -1);
              if (decision.target) {
                target = { ...target, ...decision.target };
                episode.reduced = true;
                code("reduce_load");
              } else {
                code("increment_too_coarse");
                loadHolds.push({ anchor: seed, reason: decision.reason });
              }
            } else if (!noIncreases && !episode.active
              && roleHistory.length >= P.minimumExposures && previous) {
              if (allCeiling && arithmetic && role.increment) {
                const decision = decideLoadStep(seed, role, 1);
                const next = decision.target;
                if (next) {
                  const oldPhysical = physicalLoad(previous.load, previous.unit);
                  const newPhysical = physicalLoad(next.load, next.unit);
                  target = { ...next, reps: clamp(
                    30 * (oldPhysical * (1 + previous.reps / 30) / newPhysical - 1),
                    role
                  ) };
                  code("add_load");
                } else {
                  code("increment_too_coarse");
                  loadHolds.push({ anchor: seed, reason: decision.reason });
                }
              } else if (previous.reps < role.rMax
                && ((typed(previous) && previous.rpe <= (role.eMin + role.eMax) / P.midpointDivisor)
                  || (!typed(previous) && Number.isFinite(previous.targetReps)
                    && previous.reps >= previous.targetReps))) {
                target.reps = clamp(previous.reps + P.repStep, role);
                if (target.reps > seed.reps) code("add_reps");
              }
            }
          }
          targets.push(target);
        }
        const savedExperiment = (prior.addedSetExperiment || []).find((item) =>
          item.role === role.role);
        const experiment = {
          role: role.role, active: false, remainingExposures: 0,
          startedAfterExposureId: null, lastExposureId: null,
          endedReason: null, excludedThroughExposureId: null,
          ...(savedExperiment ? clone(savedExperiment) : {})
        };
        if (experiment.active && !deload && experiment.lastExposureId !== null) {
          const marker = roleHistory.findIndex((item) => item.exposureId === experiment.lastExposureId);
          if (marker < 0) throw new TypeError("Experiment predecessor is missing.");
          experiment.remainingExposures = Math.max(0,
            experiment.remainingExposures - (roleHistory.length - marker - 1));
          if (!experiment.remainingExposures) {
            experiment.active = false;
            experiment.endedReason = "completed";
            experiment.excludedThroughExposureId = roleLast?.exposureId || null;
          }
        }
        if (!deload) experiment.lastExposureId = roleLast?.exposureId || null;
        let count = role.S;
        if (working(role.role) && supported && (worse
          || (episode.active && !deload && !injury && !layoff))) {
          count = Math.max(P.minimumSets, role.S - P.setAdjustment);
          if (count < role.S) code("remove_set");
          if (experiment.active) {
            experiment.active = false;
            experiment.remainingExposures = 0;
            experiment.endedReason = worse ? "readiness" : "deterioration";
            experiment.excludedThroughExposureId = roleLast?.exposureId || null;
          }
        } else if (["straight", "backoff"].includes(role.role) && supported
          && !episode.active && !noIncreases) {
          let fresh = roleHistory;
          if (experiment.excludedThroughExposureId) {
            const cutoff = roleHistory.findIndex((item) =>
              item.exposureId === experiment.excludedThroughExposureId);
            if (cutoff < 0) throw new TypeError("Experiment cutoff is missing.");
            fresh = roleHistory.slice(cutoff + 1);
          }
          const window = fresh.slice(-P.plateauExposures);
          const metrics = window.map((exposure) => {
            const sets = completePositions(exposure);
            if (sets.some((set) => !set)) return null;
            const values = sets.map((set) => arithmetic
              ? physicalLoad(set.load, set.unit) * (1 + set.reps / 30) : set.reps);
            return values.every(Number.isFinite) ? Math.max(...values) : null;
          });
          const plateau = window.length === P.plateauExposures
            && metrics.every((value) => value !== null)
            && metrics.slice(1).every((value) => value <= metrics[0] + EPSILON);
          const effortOkay = latestSets.length === role.S
            && latestSets.every((set) => typed(set) && set.rpe <= role.eMax);
          if (!experiment.active && plateau && effortOkay) {
            experiment.active = true;
            experiment.remainingExposures = P.experimentExposures;
            experiment.startedAfterExposureId = roleLast.exposureId;
            experiment.endedReason = null;
          }
          if (experiment.active) {
            count = role.S + P.setAdjustment;
            code("add_set");
          }
        }
        result.addedSetExperiment.push(experiment);
        if (working(role.role)) result.plannedSetCount += count;
        for (let position = 0; position < count; position += 1) {
          const supplied = (exercise.sets || []).find((set) =>
            set.role === role.role && set.position === position);
          const anchor = clone(targets[Math.min(position, targets.length - 1)]);
          output.sets.push({
            setId: supplied?.setId
              || [input.sessionId, exercise.exerciseId, role.role, position].join(":"),
            exerciseId: exercise.exerciseId,
            role: role.role,
            position,
            sequenceIndex: supplied?.sequenceIndex === undefined ? sequence : supplied.sequenceIndex,
            anchor,
            targetRpe: [role.eMin, role.eMax],
            target: suppressed || !supported || ["unknown", "deload"].includes(role.role)
              ? null : clone(anchor),
            revisions: []
          });
          sequence += 1;
        }
      });
      if (!result.codes.length) code("hold");
      result.reasonText = sessionReason(result, {
        history, comparisons, roles, rows: output.sets.slice(rowStart), action,
        gapDays: latestActivity ? (now - latestActivity._time) / DAY_MS : 0,
        resistanceType: exercise.resistanceType, loadHolds
      });
      result.sessionStart = { codes: clone(result.codes), reasonText: result.reasonText };
      result.revisionReplay = {
        generation: 0, factsDigest: null, facts: [], undoLocks: [], enabled: true, at: input.createdAt
      };
      output.exercises.push(result);
      output.stableTargets.push({
        exerciseId: exercise.exerciseId,
        variantIdentity: exercise.variantIdentity,
        resistanceType: exercise.resistanceType,
        targetVersion: exercise.targetVersion,
        roles
      });
    });
    const validation = validatePrescription(output);
    if (!validation.ok) throw new TypeError("Generated coach prescription is invalid: "
      + validation.errors.join("; "));
    return canonicalPrescription(output);
  }

  function activeRevision(revision) {
    return !revision.undone && !revision.superseded;
  }

  function displayedDelta(from, to) {
    if (from.reps !== to.reps) {
      const delta = to.reps - from.reps;
      return (delta > 0 ? "+" : "") + delta + (Math.abs(delta) === 1 ? " rep" : " reps");
    }
    const delta = (physicalLoad(to.load, to.unit) - physicalLoad(from.load, from.unit))
      / (to.unit === "kg" ? LB_PER_KG : 1);
    const value = Number(delta.toFixed(8));
    return (value > 0 ? "+" : "") + value + " " + to.unit;
  }

  function captureFacts(rows, supplied, previous) {
    const byId = new Map(supplied.map((fact, index) => [fact.setId, { fact, index }]));
    const oldById = new Map(previous.map((fact) => [fact.setId, fact]));
    return rows.map((row) => {
      const entry = byId.get(row.setId);
      const fact = entry?.fact || {};
      const old = oldById.get(row.setId);
      const completed = fact.completed === true;
      const edited = fact.edited === true;
      const skipped = fact.skipped === true;
      const oldFrozenTarget = old?.completed || old?.skipped ? old.prescribedTarget
        : old?.edited ? old.editedTarget : null;
      const finite = (value) => Number.isFinite(value) ? value : null;
      return {
        setId: row.setId, completed, skipped, edited,
        load: finite(fact.load), unit: ["lb", "kg"].includes(fact.unit) ? fact.unit : null,
        reps: finite(fact.reps), rpe: finite(fact.rpe),
        rpeSource: fact.rpeSource === "typed" ? "typed" : "unknown",
        completionOrder: completed ? (finite(fact.completionOrder)
          ?? (old?.completed ? old.completionOrder : null) ?? entry.index) : null,
        prescribedTarget: completed || skipped ? clone(oldFrozenTarget
          ?? fact.prescribedTarget ?? row.target) : null,
        editedTarget: edited ? clone(oldFrozenTarget
          ?? fact.editedTarget ?? row.target) : null
      };
    });
  }

  function replayPrescription(prescription, sessionState) {
    if (!validatePrescription(prescription).ok) throw new TypeError("Invalid prescription.");
    const output = clone(prescription);
    const enabled = sessionState.revisionEnabled !== false;
    time(sessionState.at);
    const supplied = sessionState.sets || [];
    const undoLocks = sessionState.undoLocks === undefined
      ? output.exercises.flatMap((exercise) => exercise.revisionReplay.undoLocks)
      : clone(sessionState.undoLocks);
    output.exercises.forEach((exercise, exerciseIndex) => {
      const rows = output.sets.filter((row) => row.exerciseId === exercise.exerciseId);
      const rowIds = new Set(rows.map((row) => row.setId));
      const facts = captureFacts(rows, supplied, exercise.revisionReplay.facts);
      const locks = undoLocks.filter((lock) => rowIds.has(lock.setId))
        .sort((a, b) => a.setId < b.setId ? -1 : a.setId > b.setId ? 1 : 0);
      const digest = stableDigest({ facts, undoLocks: locks, enabled });
      if (exercise.revisionReplay.factsDigest === digest) return;
      const generation = exercise.revisionReplay.generation + 1;
      exercise.revisionReplay = {
        generation, factsDigest: digest, facts, undoLocks: locks, enabled, at: sessionState.at
      };
      exercise.optionalSetIds = [];
      const stable = output.stableTargets.find((item) => item.exerciseId === exercise.exerciseId);
      const supported = EXTERNAL.includes(stable.resistanceType)
        || REPS_ONLY.includes(stable.resistanceType);
      const suppressed = exercise.sessionStart.codes.includes("exception_suppressed");
      rows.forEach((row) => {
        row.revisions.forEach((revision) => { revision.superseded = true; });
        row.target = suppressed || !supported || ["unknown", "deload"].includes(row.role)
          ? null : clone(row.anchor);
      });
      let serial = 0;
      const timeline = [];
      const record = (row, target, code, afterSetId, locked = false) => {
        const revision = {
          revisionId: "revision-" + exerciseIndex + "-" + generation + "-" + serial++
            + "-" + stableDigest({ evaluationId: output.evaluationId, exerciseId: exercise.exerciseId }),
          at: sessionState.at, afterSetId,
          from: clone(row.target), to: clone(target), code,
          undone: false, locked, superseded: false
        };
        row.revisions.push(revision);
        timeline.push({ row, revision });
        row.target = clone(target);
        return revision;
      };
      const frozen = new Set();
      const lockById = new Map(locks.map((lock) => [lock.setId, lock]));
      const factsById = new Map(facts.map((fact) => [fact.setId, fact]));
      rows.forEach((row) => {
        const fact = factsById.get(row.setId);
        const lock = lockById.get(row.setId);
        if (lock && row.target) {
          record(row, lock.target, "undo_lock", row.setId, true);
          frozen.add(row.setId);
        } else if (fact.skipped && row.target) {
          record(row, fact.prescribedTarget, "skipped_target", row.setId, true);
          frozen.add(row.setId);
        } else if (fact.edited && row.target) {
          record(row, fact.editedTarget, "edit_lock", row.setId, true);
          frozen.add(row.setId);
        }
      });
      const completed = facts.filter((fact) => fact.completed && !fact.skipped)
        .sort((a, b) => a.completionOrder - b.completionOrder
          || rows.findIndex((row) => row.setId === a.setId)
            - rows.findIndex((row) => row.setId === b.setId));
      const performed = new Set();
      // Legacy completed rows without performance facts are frozen, not evidence.
      completed.filter((fact) => fact.reps === null).forEach((fact) => {
        const row = rows.find((item) => item.setId === fact.setId);
        if (row.target && fact.prescribedTarget && !targetsEqual(row.target, fact.prescribedTarget)) {
          record(row, fact.prescribedTarget, "completed_target", row.setId);
        }
        performed.add(row.setId);
      });
      let wentDown = false;
      completed.forEach((fact) => {
        const source = rows.find((row) => row.setId === fact.setId);
        if (performed.has(source.setId)) return;
        if (source.target && fact.prescribedTarget && !targetsEqual(source.target, fact.prescribedTarget)) {
          record(source, fact.prescribedTarget, "completed_target", source.setId);
        }
        performed.add(source.setId);
        if (!enabled || !source.target || !working(source.role)) return;
        const role = stable.roles.find((item) => item.role === source.role);
        const later = rows.filter((row) => row.role === source.role
          && row.sequenceIndex > source.sequenceIndex && row.target
          && !performed.has(row.setId)
          // A skipped destination consumes its slot; its revision is not redirected.
          && (factsById.get(row.setId).skipped
            || (!frozen.has(row.setId) && !factsById.get(row.setId).edited)))
          .sort((a, b) => a.sequenceIndex - b.sequenceIndex);
        const decrease = (Number.isFinite(fact.reps)
          && fact.reps <= source.target.reps - P.revisionRepDeficit)
          || (typed(fact) && fact.rpe >= role.eMax + P.revisionHardMargin);
        const matches = sameLoad(fact, source.target)
          || (REPS_ONLY.includes(stable.resistanceType)
            && fact.load === null && source.target.load === null);
        const increase = !wentDown && !exercise.increaseBlockedReasons.length
          && !exercise.deteriorationEpisode.active && typed(fact) && matches
          && fact.reps >= source.target.reps + P.revisionRepSurplus
          && fact.rpe <= role.eMax - P.revisionEasyMargin;
        const next = later[0];
        if (next && !factsById.get(next.setId).skipped && (decrease || increase)) {
          const target = clone(next.anchor);
          let code = null;
          if (decrease && target.reps > role.rMin) {
            target.reps = Math.max(role.rMin, target.reps - P.repStep);
            code = "reduce_reps";
          } else if (increase && target.reps < role.rMax) {
            target.reps = Math.min(role.rMax, target.reps + P.repStep);
            code = "add_reps";
          } else if (EXTERNAL.includes(stable.resistanceType) && role.increment) {
            const decision = decideLoadStep(next.anchor, role, decrease ? -1 : 1);
            if (decision.target) {
              Object.assign(target, decision.target);
              code = decrease ? "reduce_load" : "add_load";
            } else {
              record(next, next.target, "increment_too_coarse", source.setId);
            }
          }
          if (code && !targetsEqual(next.target, target)) {
            record(next, target, code, source.setId);
            if (decrease) wentDown = true;
          }
        }
        const last = later.at(-1);
        if (last && !factsById.get(last.setId).skipped
          && typed(fact) && fact.rpe >= P.optionalRpe
          && fact.reps < role.rMin - P.optionalRepDeficit) {
          record(last, last.target, "optional_last_set", source.setId);
        }
        record(source, source.target, "event_evaluated", source.setId);
      });
      exercise.optionalSetIds = rows.filter((row) => row.revisions.some((revision) =>
        activeRevision(revision) && revision.code === "optional_last_set")).map((row) => row.setId);
      const visible = timeline.filter(({ row, revision }) => {
        const fact = factsById.get(row.setId);
        return !fact.completed && !fact.skipped && !fact.edited && !frozen.has(row.setId)
          && ["add_reps", "add_load", "reduce_reps", "reduce_load",
            "increment_too_coarse", "optional_last_set"].includes(revision.code)
          && targetsEqual(row.target, revision.to);
      });
      exercise.codes = clone(exercise.sessionStart.codes);
      visible.forEach(({ revision }) => {
        const code = ["reduce_reps", "optional_last_set"].includes(revision.code)
          ? "hold" : revision.code;
        if (!exercise.codes.includes(code)) exercise.codes.push(code);
      });
      const current = visible.at(-1);
      exercise.reasonText = exercise.sessionStart.reasonText;
      if (current) {
        const { row, revision } = current;
        const source = rows.find((item) => item.setId === revision.afterSetId);
        const fact = factsById.get(source.setId);
        if (revision.code === "optional_last_set") {
          exercise.reasonText = "Set " + (row.position + 1) + " is optional: set "
            + (source.position + 1) + " reached " + fact.reps + " reps at RPE " + fact.rpe + ".";
        } else if (revision.code === "increment_too_coarse") {
          const role = stable.roles.find((item) => item.role === source.role);
          const decrease = fact.reps <= source.target.reps - P.revisionRepDeficit
            || (typed(fact) && fact.rpe >= role.eMax + P.revisionHardMargin);
          const decision = decideLoadStep(row.anchor, role, decrease ? -1 : 1);
          exercise.reasonText = "Holding " + (row.target.load === null ? "the load"
            : row.target.load + " " + row.target.unit) + ": " + decision.reason + ".";
        } else {
          exercise.reasonText = "Set " + (row.position + 1) + ": "
            + displayedDelta(revision.from, revision.to) + " because set "
            + (source.position + 1) + " " + (typed(fact) ? "was RPE " + fact.rpe
              : "reached " + fact.reps + " reps") + ".";
        }
      } else if (locks.length) {
        const lock = locks.at(-1);
        const row = rows.find((item) => item.setId === lock.setId);
        exercise.reasonText = "Set " + (row.position + 1) + ": undo restored "
          + (lock.target.load === null ? "" : lock.target.load + " " + lock.target.unit + " x ")
          + lock.target.reps + " reps and locked the row.";
      }
    });
    const checked = validatePrescription(output);
    if (!checked.ok) throw new TypeError("Invalid replayed prescription: " + checked.errors.join("; "));
    return canonicalPrescription(output);
  }

  function reviseAfterSet(prescription, sessionState, completedSetId) {
    // The event ID is a compatibility hint; every supplied current fact is replayed.
    return replayPrescription(prescription, sessionState);
  }

  function undoRevision(prescription, setId, at) {
    if (!validatePrescription(prescription).ok) throw new TypeError("Invalid prescription.");
    const row = prescription.sets.find((set) => set.setId === setId);
    if (!row) return canonicalPrescription(prescription);
    const exercise = prescription.exercises.find((item) => item.exerciseId === row.exerciseId);
    const fact = exercise.revisionReplay.facts.find((item) => item.setId === setId);
    if (fact?.completed || fact?.skipped || fact?.edited
      || exercise.revisionReplay.undoLocks.some((lock) => lock.setId === setId)) {
      return canonicalPrescription(prescription);
    }
    const revision = row.revisions.findLast((item) => activeRevision(item)
      && !["event_evaluated", "completed_target", "skipped_target", "edit_lock", "undo_lock"].includes(item.code));
    if (!revision) return canonicalPrescription(prescription);
    const output = replayPrescription(prescription, {
      at: at || exercise.revisionReplay.at,
      revisionEnabled: exercise.revisionReplay.enabled,
      sets: prescription.exercises.flatMap((item) => item.revisionReplay.facts),
      undoLocks: [...prescription.exercises.flatMap((item) => item.revisionReplay.undoLocks),
        { setId, target: clone(revision.from) }]
    });
    output.sets.find((set) => set.setId === setId).revisions.find((item) =>
      item.revisionId === revision.revisionId).undone = true;
    return canonicalPrescription(output);
  }

  function validatePrescription(value) {
    const errors = [];
    const fail = (path, message) => errors.push(path + ": " + message);
    const object = (item, keys, path) => {
      if (!item || typeof item !== "object" || Array.isArray(item)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(item))) {
        fail(path, "object required");
        return false;
      }
      Object.keys(item).forEach((key) => {
        if (!keys.includes(key)) fail(path, "unknown key " + key);
      });
      keys.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(item, key)) fail(path, "missing " + key);
      });
      return true;
    };
    const text = (item) => typeof item === "string" && item.length > 0;
    const integer = (item, minimum = 0) => Number.isSafeInteger(item) && item >= minimum;
    const strings = (item) => Array.isArray(item) && item.every(text)
      && new Set(item).size === item.length;
    const nullableText = (item) => item === null || text(item);
    const numericLoad = (item, path, positive) => {
      if (item === null) return;
      if (object(item, ["value", "unit"], path)
        && (!Number.isFinite(item.value) || item.value < 0
          || (positive && item.value === 0) || !["lb", "kg"].includes(item.unit))) {
        fail(path, "invalid unit-explicit load");
      }
    };
    const target = (item, role, path, nullable) => {
      if (item === null && nullable) return;
      if (!object(item, ["load", "unit", "reps"], path)) return;
      if (!integer(item.reps, 1) || (role
        && (item.reps < role.rMin || item.reps > role.rMax))) fail(path, "reps outside frozen range");
      if (item.load === null) {
        if (item.unit !== null) fail(path, "null load requires null unit");
      } else if (!Number.isFinite(item.load) || item.load < 0
        || !["lb", "kg"].includes(item.unit)) fail(path, "invalid load");
    };
    try {
      clone(value);
      if (!object(value, ["contractVersion", "engineVersion", "parameterVersion",
        "evaluationId", "createdAt", "inputDigest", "stableTargets", "exercises", "sets"], "$")) {
        return { ok: false, errors };
      }
      if (value.contractVersion !== COACH_CONTRACT_VERSION) fail("$", "wrong contract version");
      if (value.engineVersion !== ENGINE_VERSION) fail("$", "wrong engine version");
      if (value.parameterVersion !== PARAMETER_VERSION) fail("$", "wrong parameter version");
      if (!text(value.evaluationId) || !text(value.inputDigest)
        || !/^fnv1a64:[a-f0-9]{16}$/.test(value.inputDigest)) fail("$", "invalid evaluation metadata");
      time(value.createdAt);
      if (![value.stableTargets, value.exercises, value.sets].every(Array.isArray)) {
        fail("$", "arrays required");
        return { ok: false, errors };
      }
      const stableById = new Map();
      value.stableTargets.forEach((stable, index) => {
        const path = "$.stableTargets[" + index + "]";
        if (!object(stable, ["exerciseId", "variantIdentity", "resistanceType",
          "targetVersion", "roles"], path)) return;
        if (![stable.exerciseId, stable.variantIdentity, stable.resistanceType,
          stable.targetVersion].every(text) || stableById.has(stable.exerciseId)) {
          fail(path, "invalid or duplicate identity");
        }
        stableById.set(stable.exerciseId, stable);
        if (!Array.isArray(stable.roles) || !stable.roles.length) {
          fail(path, "roles required");
          return;
        }
        const roles = new Set();
        stable.roles.forEach((role, roleIndex) => {
          const rolePath = path + ".roles[" + roleIndex + "]";
          if (!object(role, ["role", "S", "rMin", "rMax", "eMin", "eMax",
            "restSeconds", "increment", "defaultLoad", "defaultReps"], rolePath)) return;
          try { validateRole(role); } catch (_error) { fail(rolePath, "invalid role"); }
          numericLoad(role.increment, rolePath + ".increment", true);
          numericLoad(role.defaultLoad, rolePath + ".defaultLoad", false);
          if (roles.has(role.role)) fail(rolePath, "duplicate role");
          roles.add(role.role);
        });
      });
      const exercises = new Map();
      value.exercises.forEach((exercise, index) => {
        const path = "$.exercises[" + index + "]";
        if (!object(exercise, ["exerciseId", "variantIdentity", "plannedSetCount", "increaseBlockedReasons",
          "optionalSetIds", "codes", "reasonText", "comparisonExposureIds",
          "deteriorationEpisode", "addedSetExperiment", "sessionStart", "revisionReplay"], path)) return;
        const stable = stableById.get(exercise.exerciseId);
        if (!stable || stable.variantIdentity !== exercise.variantIdentity
          || exercises.has(exercise.exerciseId)) fail(path, "identity mismatch");
        exercises.set(exercise.exerciseId, exercise);
        if (!strings(exercise.increaseBlockedReasons)
          || exercise.increaseBlockedReasons.some((value) => !["deterioration", "readiness",
            "exception_overridden", "exception_pending", "injury_reentry", "layoff_reentry",
            "deload_marked", "unsupported_resistance"].includes(value))) fail(path, "invalid increase blocks");
        if (!integer(exercise.plannedSetCount) || !strings(exercise.optionalSetIds)
          || !strings(exercise.codes) || !exercise.codes.length
          || exercise.codes.some((code) => !CODES.includes(code))
          || !text(exercise.reasonText) || !strings(exercise.comparisonExposureIds)) {
          fail(path, "invalid exercise fields");
        }
        if (object(exercise.sessionStart, ["codes", "reasonText"], path + ".sessionStart")) {
          if (!strings(exercise.sessionStart.codes) || !exercise.sessionStart.codes.length
            || exercise.sessionStart.codes.some((code) => !CODES.includes(code))
            || !text(exercise.sessionStart.reasonText)) fail(path, "invalid session-start snapshot");
        }
        const replay = exercise.revisionReplay;
        if (object(replay, ["generation", "factsDigest", "facts", "undoLocks", "enabled", "at"],
          path + ".revisionReplay")) {
          if (!integer(replay.generation) || typeof replay.enabled !== "boolean" || !nullableText(replay.factsDigest)
            || !Array.isArray(replay.facts) || !Array.isArray(replay.undoLocks)) fail(path, "invalid replay state");
          time(replay.at);
          if (replay.factsDigest !== null && replay.factsDigest !== stableDigest({
            facts: replay.facts, undoLocks: replay.undoLocks, enabled: replay.enabled
          })) fail(path, "replay facts digest mismatch");
          const factIds = new Set();
          (replay.facts || []).forEach((fact) => {
            if (!object(fact, ["setId", "completed", "skipped", "edited", "load", "unit",
              "reps", "rpe", "rpeSource", "completionOrder", "prescribedTarget", "editedTarget"],
              path + ".revisionReplay.facts")) return;
            const row = value.sets.find((set) => set.setId === fact.setId
              && set.exerciseId === exercise.exerciseId);
            const role = stable?.roles.find((item) => item.role === row?.role);
            if (!row || factIds.has(fact.setId) || ![fact.completed, fact.skipped, fact.edited]
              .every((item) => typeof item === "boolean")
              || (fact.load !== null && (!Number.isFinite(fact.load) || fact.load < 0))
              || ![null, "lb", "kg"].includes(fact.unit)
              || (fact.reps !== null && !integer(fact.reps))
              || (fact.rpe !== null && (!Number.isFinite(fact.rpe) || fact.rpe < 0 || fact.rpe > 10))
              || !["typed", "unknown"].includes(fact.rpeSource)
              || (fact.completionOrder !== null && !Number.isFinite(fact.completionOrder))) {
              fail(path, "invalid replay fact");
            }
            factIds.add(fact.setId);
            target(fact.prescribedTarget, role, path + ".prescribedTarget", true);
            target(fact.editedTarget, role, path + ".editedTarget", true);
          });
          const lockIds = new Set();
          (replay.undoLocks || []).forEach((lock) => {
            if (!object(lock, ["setId", "target"], path + ".undoLocks")) return;
            const row = value.sets.find((set) => set.setId === lock.setId
              && set.exerciseId === exercise.exerciseId);
            if (!row || lockIds.has(lock.setId)) fail(path, "invalid undo lock");
            lockIds.add(lock.setId);
            target(lock.target, stable?.roles.find((role) => role.role === row?.role),
              path + ".undoLock.target", false);
          });
        }
        const episode = exercise.deteriorationEpisode;
        if (object(episode, ["active", "reduced", "badStreak", "stableExposures",
          "detectedExposureId", "lastExposureId", "holdIssuedAfterExposureId"], path + ".deteriorationEpisode")) {
          if (typeof episode.active !== "boolean" || typeof episode.reduced !== "boolean"
            || !integer(episode.badStreak) || !integer(episode.stableExposures)
            || !nullableText(episode.detectedExposureId)
            || !nullableText(episode.lastExposureId)
            || !nullableText(episode.holdIssuedAfterExposureId)) fail(path, "invalid episode");
        }
        if (!Array.isArray(exercise.addedSetExperiment)) fail(path, "experiments required");
        else {
          const seen = new Set();
          exercise.addedSetExperiment.forEach((experiment) => {
            if (!object(experiment, ["role", "active", "remainingExposures",
              "startedAfterExposureId", "lastExposureId", "endedReason", "excludedThroughExposureId"],
              path + ".addedSetExperiment")) return;
            if (!stable?.roles.some((role) => role.role === experiment.role)
              || seen.has(experiment.role) || typeof experiment.active !== "boolean"
              || !integer(experiment.remainingExposures)
              || experiment.remainingExposures > P.experimentExposures
              || !nullableText(experiment.startedAfterExposureId)
              || !nullableText(experiment.lastExposureId)
              || ![null, "completed", "deterioration", "readiness"].includes(experiment.endedReason)
              || !nullableText(experiment.excludedThroughExposureId)) fail(path, "invalid experiment");
            seen.add(experiment.role);
          });
        }
      });
      if (stableById.size !== exercises.size) fail("$", "stable/exercise mismatch");
      const setIds = new Set();
      const positions = new Set();
      const revisionIds = new Set();
      value.sets.forEach((set, index) => {
        const path = "$.sets[" + index + "]";
        if (!object(set, ["setId", "exerciseId", "role", "position", "sequenceIndex",
          "anchor", "targetRpe", "target", "revisions"], path)) return;
        const stable = stableById.get(set.exerciseId);
        const role = stable?.roles.find((item) => item.role === set.role);
        const positionKey = JSON.stringify([set.exerciseId, set.role, set.position]);
        if (!text(set.setId) || setIds.has(set.setId) || !role
          || !exercises.has(set.exerciseId) || positions.has(positionKey)
          || !integer(set.position) || !integer(set.sequenceIndex)) fail(path, "invalid set identity");
        setIds.add(set.setId);
        positions.add(positionKey);
        target(set.anchor, role, path + ".anchor", false);
        target(set.target, role, path + ".target", true);
        if (!Array.isArray(set.targetRpe) || set.targetRpe.length !== 2
          || set.targetRpe[0] !== role?.eMin || set.targetRpe[1] !== role?.eMax) {
          fail(path, "RPE band differs from frozen target");
        }
        if (!Array.isArray(set.revisions)) fail(path, "revisions required");
        else set.revisions.forEach((revision, revisionIndex) => {
          const revisionPath = path + ".revisions[" + revisionIndex + "]";
          if (!object(revision, ["revisionId", "at", "afterSetId", "from", "to",
            "code", "undone", "locked", "superseded"], revisionPath)) return;
          if (!text(revision.revisionId) || revisionIds.has(revision.revisionId)
            || !text(revision.afterSetId) || !REVISION_CODES.includes(revision.code)
            || typeof revision.undone !== "boolean" || typeof revision.locked !== "boolean"
            || typeof revision.superseded !== "boolean") {
            fail(revisionPath, "invalid revision");
          }
          revisionIds.add(revision.revisionId);
          time(revision.at);
          target(revision.from, role, revisionPath + ".from", true);
          target(revision.to, role, revisionPath + ".to", true);
        });
      });
      value.sets.forEach((set) => {
        const stable = stableById.get(set.exerciseId);
        const role = stable?.roles.find((item) => item.role === set.role);
        if (!role) return;
        const bounded = (candidate) => {
          if (!candidate) return false;
          const reps = Math.abs(candidate.reps - set.anchor.reps);
          const a = physicalLoad(set.anchor.load, set.anchor.unit);
          const b = physicalLoad(candidate.load, candidate.unit);
          if (a === null || b === null) {
            return a === b && candidate.unit === set.anchor.unit && reps <= P.revisionRepBound;
          }
          const change = b - a;
          if (Math.abs(change) <= EPSILON) return reps <= P.revisionRepBound;
          const increment = role.increment
            ? physicalLoad(role.increment.value, role.increment.unit) : 0;
          return EXTERNAL.includes(stable.resistanceType) && reps === 0
            && candidate.unit === role.increment?.unit
            && Math.abs(change) <= increment * P.revisionIncrementBound + EPSILON
            && a > 0 && Math.abs(change) / a <= (change > 0
              ? P.increaseFraction : P.reductionFraction) + EPSILON;
        };
        let expected = set.anchor;
        for (const revision of set.revisions || []) {
          if (!activeRevision(revision) || revision.code === "event_evaluated") continue;
          if (!targetsEqual(revision.from, expected) || !bounded(revision.to)) {
            fail("$", "broken revision chain or anchor bound");
          }
          expected = revision.to;
        }
        if (set.target !== null && (!bounded(set.target) || !targetsEqual(set.target, expected))) {
          fail("$", "target lacks a matching bounded revision chain");
        }
        if (set.target === null) {
          const exercise = exercises.get(set.exerciseId);
          if (!exercise?.codes.some((code) => ["exception_suppressed", "factual_only",
            "deload_marked"].includes(code))) fail("$", "unexplained target suppression");
        }
      });
      value.sets.forEach((set) => {
        (set.revisions || []).forEach((revision) => {
          const source = value.sets.find((item) => item.setId === revision.afterSetId);
          if (!source || source.exerciseId !== set.exerciseId) fail("$", "revision source mismatch");
        });
      });
      value.exercises.forEach((exercise) => {
        const rows = value.sets.filter((set) => set.exerciseId === exercise.exerciseId);
        if (exercise.plannedSetCount !== rows.filter((set) => working(set.role)).length) {
          fail("$", "planned set count mismatch");
        }
        if ((exercise.optionalSetIds || []).some((id) =>
          !rows.some((set) => set.setId === id && working(set.role)))) fail("$", "invalid optional set");
        const activeOptionalIds = rows.filter((set) => set.revisions.some((revision) =>
          revision.code === "optional_last_set" && activeRevision(revision))).map((set) => set.setId).sort();
        if (JSON.stringify(activeOptionalIds) !== JSON.stringify(exercise.optionalSetIds.slice().sort())) {
          fail("$", "stale optional set IDs");
        }
        const stable = stableById.get(exercise.exerciseId);
        (stable?.roles || []).forEach((role) => {
          const count = rows.filter((set) => set.role === role.role).length;
          const minimum = working(role.role) ? Math.max(1, role.S - P.setAdjustment) : role.S;
          const maximum = ["straight", "backoff"].includes(role.role)
            ? role.S + P.setAdjustment : role.S;
          if (count < minimum || count > maximum) fail("$", "set count outside permitted bounds");
        });
      });
    } catch (_error) {
      fail("$", "invalid finite JSON or date");
    }
    return { ok: errors.length === 0, errors };
  }

  return Object.freeze({
    COACH_CONTRACT_VERSION,
    ENGINE_VERSION,
    PARAMETER_VERSION,
    COACH_PARAMETERS_V1,
    prescribeSession,
    reviseAfterSet,
    undoRevision,
    validatePrescription,
    stableDigest,
    physicalLoad
  });
});
