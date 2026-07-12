(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ComprehensiveFitnessGuidedMesocycle = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BUILDER_VERSION = "guided-mesocycle/1.0.0";
  const RULES_VERSION = "planning-rules/1.0.0";
  const PLANNING_RULES = Object.freeze({
    version: RULES_VERSION,
    maxWorkingSetsPerDay: 18,
    maxExercisesPerMusclePerDay: 2,
    normalFrequency: 2,
    maintenanceFrequency: 1,
    specializationFrequency: 2,
    practicalExerciseRange: [5, 8],
    guidelines: [
      { id: "frequency", title: "Distribute priority work", summary: "Train priority muscles across at least two weekly sessions.", detail: "Two exposures are a practical default, not an absolute law. Maintenance muscles may use one; specialization muscles often benefit from two or three when recovery permits." },
      { id: "daily_sets", title: "Keep sessions practical", summary: "Keep normal workouts at 18 working sets or fewer.", detail: "Warm-ups do not count. Setup changes, exercise count, and high-fatigue compounds can make a session impractical before it reaches 18 sets." },
      { id: "same_day_variety", title: "Use focused exercise variety", summary: "Use no more than two exercises per muscle group in one day.", detail: "A second exercise should add a distinct angle, resistance profile, muscle-length emphasis, rep range, or role." },
      { id: "volume", title: "Prioritize direct volume", summary: "Separate direct sets from secondary contribution.", detail: "Primary muscles receive direct work first. Fractional stimulus can prevent unnecessary isolation work, but should not silently replace required direct training." },
      { id: "selection", title: "Choose high-value movements first", summary: "Build around useful compounds and progression-friendly lifts.", detail: "Add isolation and supplemental work after the important movement and muscle requirements are covered. The same exercise may be intentionally used on multiple days." },
      { id: "recovery", title: "Leave room to progress", summary: "Balance fatigue, recovery, and progression from the first week.", detail: "Avoid starting at maximum recoverable workload. Separate demanding sessions and preserve a clear load, rep, RPE, or RIR progression strategy." }
    ]
  });

  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const round = (value) => Math.round(value * 10) / 10;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uid = () => `guided-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  function createDraft(options = {}) {
    const trainingDays = Math.max(1, Math.min(7, number(options.trainingDays, 4)));
    return {
      id: options.id || uid(), schemaVersion: BUILDER_VERSION, builderMode: "guided", rulesVersion: RULES_VERSION,
      name: options.name || "Guided Mesocycle", type: options.type || "primary_progression", status: "draft",
      durationWeeks: Math.max(2, Math.min(12, number(options.durationWeeks, 6))), trainingDays,
      availableEquipment: clone(options.availableEquipment || ["all"]), includedMuscleGroupIds: clone(options.includedMuscleGroupIds || []),
      musclePriorities: clone(options.musclePriorities || {}), specializationMuscleGroups: clone(options.specializationMuscleGroups || []),
      guidedDays: Array.from({ length: trainingDays }, (_, index) => ({ id: uid(), ordinal: index + 1, name: `Day ${index + 1}`, assignments: [] })),
      acceptedExceptions: [], viabilityResult: null, viabilityStale: true, linkedTemplateIds: [], revision: 1,
      createdAt: options.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
    };
  }

  function touch(draft) {
    return { ...draft, viabilityResult: null, viabilityStale: true, updatedAt: new Date().toISOString(), revision: number(draft.revision, 0) + 1 };
  }

  function updateDay(draft, dayId, updater) {
    return touch({ ...draft, guidedDays: draft.guidedDays.map((day) => day.id === dayId ? updater(clone(day)) : day) });
  }

  function addExercise(draft, dayId, assignment) {
    return updateDay(draft, dayId, (day) => ({ ...day, assignments: [...day.assignments, { id: assignment.id || uid(), workingSets: Math.max(1, number(assignment.workingSets, 3)), ...clone(assignment) }] }));
  }

  function patchAssignment(draft, dayId, assignmentId, patch) {
    return updateDay(draft, dayId, (day) => ({ ...day, assignments: day.assignments.map((item) => item.id === assignmentId ? { ...item, ...clone(patch) } : item) }));
  }

  function removeAssignment(draft, dayId, assignmentId) {
    return updateDay(draft, dayId, (day) => ({ ...day, assignments: day.assignments.filter((item) => item.id !== assignmentId) }));
  }

  function moveAssignment(draft, fromDayId, toDayId, assignmentId) {
    if (fromDayId === toDayId) return draft;
    const assignment = draft.guidedDays.find((day) => day.id === fromDayId)?.assignments.find((item) => item.id === assignmentId);
    if (!assignment) return draft;
    const days = draft.guidedDays.map((day) => {
      if (day.id === fromDayId) return { ...day, assignments: day.assignments.filter((item) => item.id !== assignmentId) };
      if (day.id === toDayId) return { ...day, assignments: [...day.assignments, clone(assignment)] };
      return day;
    });
    return touch({ ...draft, guidedDays: days });
  }

  function volumeLedger(draft, relationshipResolver) {
    const muscleTotals = new Map();
    const dayTotals = draft.guidedDays.map((day) => {
      const muscles = new Map();
      let workingSets = 0;
      day.assignments.forEach((assignment) => {
        const sets = Math.max(0, number(assignment.workingSets));
        workingSets += sets;
        (relationshipResolver(assignment) || []).forEach((relationship) => {
          const muscleId = relationship.muscleGroupId || relationship.muscle_group_id;
          if (!muscleId) return;
          const type = relationship.relationshipType || relationship.relationship_type || "unknown_insufficient_evidence";
          const weight = Math.max(0, number(relationship.setContribution ?? relationship.set_contribution));
          const direct = type === "direct_load" ? sets : 0;
          const fractional = type === "meaningful_fractional_load" ? sets * weight : 0;
          const isometric = type === "isometric_stabilizing_load" ? sets : 0;
          const currentDay = muscles.get(muscleId) || { direct: 0, fractional: 0, isometric: 0, exercises: [] };
          currentDay.direct += direct; currentDay.fractional += fractional; currentDay.isometric += isometric;
          currentDay.exercises.push({ exerciseId: assignment.exerciseId, name: assignment.name, sets, weight, type });
          muscles.set(muscleId, currentDay);
          const total = muscleTotals.get(muscleId) || { muscleGroupId: muscleId, directSets: 0, fractionalSets: 0, isometricExposure: 0, exposureDayIds: new Set(), contributors: [] };
          total.directSets += direct; total.fractionalSets += fractional; total.isometricExposure += isometric;
          if (direct + fractional > 0) total.exposureDayIds.add(day.id);
          total.contributors.push({ dayId: day.id, dayName: day.name, exerciseId: assignment.exerciseId, name: assignment.name, sets, weight, type });
          muscleTotals.set(muscleId, total);
        });
      });
      return { dayId: day.id, dayName: day.name, workingSets, exerciseCount: day.assignments.length, muscles: Array.from(muscles, ([muscleGroupId, value]) => ({ muscleGroupId, ...value, direct: round(value.direct), fractional: round(value.fractional), isometric: round(value.isometric) })) };
    });
    return {
      dayTotals,
      muscleTotals: Array.from(muscleTotals.values()).map((item) => ({ ...item, directSets: round(item.directSets), fractionalSets: round(item.fractionalSets), weightedSets: round(item.directSets + item.fractionalSets), isometricExposure: round(item.isometricExposure), exposureDayIds: Array.from(item.exposureDayIds) }))
    };
  }

  function viability(draft, options = {}) {
    const ledger = options.ledger || volumeLedger(draft, options.relationshipResolver || (() => []));
    const targetFor = options.targetFor || (() => ({ min: 4, target: 8, max: 12 }));
    const findings = [];
    if (!draft.guidedDays.length || draft.guidedDays.every((day) => !day.assignments.length)) findings.push({ id: "no-exercises", severity: "blocking", title: "Add exercises before creating templates", why: "A mesocycle cannot create usable workout templates without exercise assignments.", actions: ["Return to builder"] });
    draft.guidedDays.forEach((day) => {
      const daily = ledger.dayTotals.find((item) => item.dayId === day.id);
      if (!day.assignments.length) findings.push({ id: `empty-${day.id}`, severity: "blocking", dayId: day.id, title: `${day.name} is empty`, why: "Every configured training day needs at least one exercise.", actions: ["Add exercise", "Reduce training days"] });
      if (daily?.workingSets > PLANNING_RULES.maxWorkingSetsPerDay) findings.push({ id: `sets-${day.id}`, severity: "strong_warning", dayId: day.id, title: `${day.name} has ${daily.workingSets} working sets`, why: `This exceeds the ${PLANNING_RULES.maxWorkingSetsPerDay}-set practical limit.`, actions: ["Reduce sets", "Move an exercise"] });
      if (daily?.exerciseCount > PLANNING_RULES.practicalExerciseRange[1]) findings.push({ id: `count-${day.id}`, severity: "advisory", dayId: day.id, title: `${day.name} has ${daily.exerciseCount} exercises`, why: "Setup changes and transition time may make this session longer than expected.", actions: ["Consolidate exercises"] });
      (daily?.muscles || []).filter((muscle) => muscle.exercises.filter((item) => item.type === "direct_load").length > PLANNING_RULES.maxExercisesPerMusclePerDay).forEach((muscle) => findings.push({ id: `same-day-${day.id}-${muscle.muscleGroupId}`, severity: "strong_warning", dayId: day.id, muscleGroupId: muscle.muscleGroupId, title: `More than two direct exercises target ${muscle.muscleGroupId} on ${day.name}`, why: "A third same-day exercise often adds fatigue and setup time without enough distinct stimulus.", actions: ["Remove one exercise", "Move one exercise"] }));
    });
    (draft.includedMuscleGroupIds || []).forEach((muscleGroupId) => {
      const total = ledger.muscleTotals.find((item) => item.muscleGroupId === muscleGroupId) || { directSets: 0, fractionalSets: 0, weightedSets: 0, exposureDayIds: [] };
      const target = targetFor(muscleGroupId, draft) || { min: 4, target: 8, max: 12 };
      const priority = draft.musclePriorities?.[muscleGroupId] || "normal";
      const frequencyTarget = priority === "maintenance" ? PLANNING_RULES.maintenanceFrequency : priority === "specialization" ? PLANNING_RULES.specializationFrequency : PLANNING_RULES.normalFrequency;
      if (total.directSets <= 0) findings.push({ id: `missing-${muscleGroupId}`, severity: "strong_warning", muscleGroupId, title: `${muscleGroupId} has no direct work`, why: "Fractional participation does not automatically replace a selected muscle group's direct training.", actions: ["Add suggested exercise", "Accept intentional omission"] });
      else if (total.directSets < number(target.min, 0)) findings.push({ id: `low-${muscleGroupId}`, severity: "strong_warning", muscleGroupId, title: `${muscleGroupId} is below its direct-set target`, why: `${total.directSets} direct sets are planned; the current evidence-adjusted range begins at ${target.min}.`, actions: ["Add sets", "Accept lower volume"] });
      if (total.weightedSets > number(target.max, 99)) findings.push({ id: `high-${muscleGroupId}`, severity: "strong_warning", muscleGroupId, title: `${muscleGroupId} is above its weighted-volume range`, why: `${total.weightedSets} weighted sets exceed the current upper target of ${target.max}.`, actions: ["Reduce sets", "Accept specialization volume"] });
      if (total.exposureDayIds.length < frequencyTarget) findings.push({ id: `frequency-${muscleGroupId}`, severity: "strong_warning", muscleGroupId, title: `${muscleGroupId} is trained in ${total.exposureDayIds.length} weekly session${total.exposureDayIds.length === 1 ? "" : "s"}`, why: `The selected ${priority} priority uses a practical default of ${frequencyTarget} meaningful exposure${frequencyTarget === 1 ? "" : "s"}.`, actions: ["Add work to another day", "Accept lower frequency"] });
    });
    const accepted = new Set(draft.acceptedExceptions || []);
    const visible = findings.map((finding) => ({ ...finding, accepted: accepted.has(finding.id) }));
    const active = visible.filter((finding) => !finding.accepted);
    const score = Math.max(0, Math.round(100 - active.reduce((sum, finding) => sum + (finding.severity === "blocking" ? 25 : finding.severity === "strong_warning" ? 8 : 3), 0)));
    return { version: "viability/1.0.0", rulesVersion: RULES_VERSION, checkedAt: new Date().toISOString(), score, grade: score >= 90 ? "Excellent" : score >= 80 ? "Good" : score >= 70 ? "Workable" : "Needs Revision", findings: visible, blockingCount: active.filter((item) => item.severity === "blocking").length, warningCount: active.filter((item) => item.severity === "strong_warning").length, readyToGenerate: active.every((item) => item.severity !== "blocking"), ledger };
  }

  return Object.freeze({ BUILDER_VERSION, RULES_VERSION, PLANNING_RULES, createDraft, addExercise, patchAssignment, removeAssignment, moveAssignment, volumeLedger, viability });
});
