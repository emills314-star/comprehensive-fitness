(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ComprehensiveFitnessGuidedMesocycle = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BUILDER_VERSION = "guided-mesocycle/1.1.0";
  const RULES_VERSION = "planning-rules/1.1.0";
  const LEDGER_VERSION = "volume-ledger/1.1.0";
  const PROGRAMMING_FAMILY_VERSION = "programming-family/1.0.0";
  const CANONICAL_TO_PROGRAMMING_FAMILY = Object.freeze({
    mg_chest_sternal: "chest", mg_chest_clavicular: "chest", mg_upper_back: "upper_back", mg_lats: "lats", mg_traps_upper: "traps",
    mg_front_delts: "front_delts", mg_side_delts: "side_delts", mg_rear_delts: "rear_delts", mg_biceps: "biceps", mg_triceps: "triceps",
    mg_forearms: "forearms", mg_spinal_erectors: "spinal_erectors", mg_abdominals: "abs", mg_obliques: "obliques", mg_glutes_max: "glutes",
    mg_quadriceps: "quads", mg_hamstrings: "hamstrings", mg_adductors: "adductors", mg_abductors: "abductors",
    mg_calves_gastroc: "calves", mg_calves_soleus: "calves", mg_neck_flexors: "neck", mg_neck_extensors: "neck"
  });
  const PROGRAMMING_FAMILY_ALIASES = Object.freeze({
    abs: "abs", abdominals: "abs", calves_gastroc: "calves", calves_soleus: "calves", chest_clavicular: "chest", chest_sternal: "chest",
    glutes_max: "glutes", neck_extensors: "neck", neck_flexors: "neck", neck_musculature: "neck", quads: "quads", quadriceps: "quads", traps_upper: "traps"
  });
  const PROGRAMMING_FAMILIES = Object.freeze([...new Set(Object.values(CANONICAL_TO_PROGRAMMING_FAMILY))]);
  const STEPS = Object.freeze(["guide", "setup", "build", "check", "create"]);
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
  const sum = (values) => values.reduce((total, value) => total + number(value), 0);
  const round = (value) => Math.round(value * 10) / 10;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uid = () => `guided-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  function programmingFamilyId(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!normalized) return "";
    const canonical = normalized.startsWith("mg_") ? normalized : `mg_${normalized}`;
    if (CANONICAL_TO_PROGRAMMING_FAMILY[canonical]) return CANONICAL_TO_PROGRAMMING_FAMILY[canonical];
    const family = PROGRAMMING_FAMILY_ALIASES[normalized] || normalized.replace(/^mg_/, "");
    if (PROGRAMMING_FAMILIES.includes(family)) return family;
    return normalized.startsWith("mg_") ? "" : family;
  }

  const relationshipPriority = Object.freeze({ direct_load: 4, meaningful_fractional_load: 3, isometric_stabilizing_load: 2, minor_incidental_load: 1, unknown_insufficient_evidence: 0 });

  function normalizedRelationship(relationship) {
    const canonicalMuscleGroupId = relationship.muscleGroupId || relationship.muscle_group_id || "";
    const family = programmingFamilyId(relationship.programmingFamilyId || relationship.programming_family_id || canonicalMuscleGroupId);
    if (!family) return null;
    const type = relationship.relationshipType || relationship.relationship_type || "unknown_insufficient_evidence";
    const contribution = type === "direct_load" ? 1 : type === "meaningful_fractional_load" ? Math.max(0, number(relationship.setContribution ?? relationship.set_contribution ?? relationship.fractional_set_credit)) : 0;
    const defaultFatigue = type === "direct_load" ? 1 : type === "meaningful_fractional_load" ? Math.max(0.5, contribution) : type === "isometric_stabilizing_load" ? 0.5 : 0;
    const localFatigueWeight = Math.max(0, number(relationship.localFatigueWeight ?? relationship.local_fatigue_weight, defaultFatigue));
    return { ...relationship, canonicalMuscleGroupId, programmingFamilyId: family, relationshipType: type, setContribution: contribution, localFatigueWeight };
  }

  function coalesceRelationshipsByProgrammingFamily(relationships) {
    const families = new Map();
    (relationships || []).map(normalizedRelationship).filter(Boolean).forEach((relationship) => {
      const current = families.get(relationship.programmingFamilyId) || { programmingFamilyId: relationship.programmingFamilyId, selected: null, localFatigueWeight: 0, isometricFatigueWeight: 0, canonicalMuscleGroupIds: new Set(), relationships: [] };
      current.localFatigueWeight += relationship.localFatigueWeight;
      if (relationship.relationshipType === "isometric_stabilizing_load") current.isometricFatigueWeight += relationship.localFatigueWeight;
      if (relationship.canonicalMuscleGroupId) current.canonicalMuscleGroupIds.add(relationship.canonicalMuscleGroupId);
      current.relationships.push(relationship);
      const selected = current.selected;
      const candidateDirect = relationship.relationshipType === "direct_load";
      const selectedDirect = selected?.relationshipType === "direct_load";
      if (!selected
        || (candidateDirect && !selectedDirect)
        || (candidateDirect === selectedDirect && relationship.setContribution > selected.setContribution)
        || (candidateDirect === selectedDirect && relationship.setContribution === selected.setContribution && (relationshipPriority[relationship.relationshipType] || 0) > (relationshipPriority[selected.relationshipType] || 0))) current.selected = relationship;
      families.set(relationship.programmingFamilyId, current);
    });
    return Array.from(families.values()).map((family) => ({
      muscleGroupId: family.programmingFamilyId,
      programmingFamilyId: family.programmingFamilyId,
      canonicalMuscleGroupIds: Array.from(family.canonicalMuscleGroupIds),
      relationshipType: family.selected?.relationshipType || "unknown_insufficient_evidence",
      setContribution: family.selected?.setContribution || 0,
      localFatigueWeight: round(family.localFatigueWeight),
      isometricFatigueWeight: round(family.isometricFatigueWeight),
      relationshipCount: family.relationships.length
    }));
  }

  function projectedScope(draft) {
    const projected = new Map();
    (draft.includedMuscleGroupIds || []).forEach((sourceMuscleGroupId) => {
      const family = programmingFamilyId(sourceMuscleGroupId);
      if (!family) return;
      const current = projected.get(family) || { muscleGroupId: family, sourceMuscleGroupIds: [] };
      current.sourceMuscleGroupIds.push(sourceMuscleGroupId);
      projected.set(family, current);
    });
    return Array.from(projected.values());
  }

  function createDraft(options = {}) {
    const trainingDays = Math.max(1, Math.min(7, number(options.trainingDays, 4)));
    return {
      id: options.id || uid(), schemaVersion: BUILDER_VERSION, builderMode: "guided", rulesVersion: RULES_VERSION,
      name: options.name || "Guided Mesocycle", type: options.type || "primary_progression", status: "draft",
      durationWeeks: Math.max(2, Math.min(12, number(options.durationWeeks, 6))), trainingDays,
      availableEquipment: clone(options.availableEquipment || ["all"]), includedMuscleGroupIds: clone(options.includedMuscleGroupIds || []),
      musclePriorities: clone(options.musclePriorities || {}), specializationMuscleGroups: clone(options.specializationMuscleGroups || []),
      guidedDays: Array.from({ length: trainingDays }, (_, index) => ({ id: uid(), ordinal: index + 1, name: `Day ${index + 1}`, assignments: [] })),
      planningProgress: { highestUnlockedStep: "guide", completedSteps: [], setupRevision: 1, buildRevision: 0, viabilityRevision: null, createReadyRevision: null },
      acceptedExceptions: [], viabilityResult: null, viabilityStale: true, linkedTemplateIds: [], revision: 1,
      createdAt: options.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
    };
  }

  function touch(draft) {
    const progress = draft.planningProgress || {};
    return { ...draft, viabilityResult: null, viabilityStale: true, planningProgress: { ...progress, highestUnlockedStep: STEPS.indexOf(progress.highestUnlockedStep) >= STEPS.indexOf("check") ? "check" : (progress.highestUnlockedStep || "build"), completedSteps: (progress.completedSteps || []).filter((step) => !["check", "create"].includes(step)), buildRevision: number(progress.buildRevision, 0) + 1, viabilityRevision: null, createReadyRevision: null }, updatedAt: new Date().toISOString(), revision: number(draft.revision, 0) + 1 };
  }

  function unlockStep(draft, step, completedStep) {
    const progress = draft.planningProgress || { highestUnlockedStep: "guide", completedSteps: [] };
    const highest = STEPS[Math.max(STEPS.indexOf(progress.highestUnlockedStep), STEPS.indexOf(step))];
    return { ...draft, planningProgress: { ...progress, highestUnlockedStep: highest, completedSteps: Array.from(new Set([...(progress.completedSteps || []), ...(completedStep ? [completedStep] : [])])) }, updatedAt: new Date().toISOString() };
  }

  function canonicalExerciseId(assignment) {
    return String(assignment?.researchExerciseId || assignment?.canonicalExerciseId || assignment?.exerciseId || "").trim().toLowerCase();
  }

  function canAssignExercise(draft, dayId, assignment, ignoreAssignmentId = "") {
    const canonicalId = canonicalExerciseId(assignment);
    if (!canonicalId) return { allowed: false, reason: "missing_canonical_exercise_id" };
    const day = draft.guidedDays.find((item) => item.id === dayId);
    if (!day) return { allowed: false, reason: "training_day_not_found" };
    const duplicate = day.assignments.find((item) => item.id !== ignoreAssignmentId && canonicalExerciseId(item) === canonicalId);
    return duplicate ? { allowed: false, reason: "already_added_to_day", duplicateAssignmentId: duplicate.id } : { allowed: true };
  }

  function updateDay(draft, dayId, updater) {
    return touch({ ...draft, guidedDays: draft.guidedDays.map((day) => day.id === dayId ? updater(clone(day)) : day) });
  }

  function addExercise(draft, dayId, assignment) {
    const validation = canAssignExercise(draft, dayId, assignment);
    if (!validation.allowed) return { ...draft, assignmentError: validation };
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
    const validation = canAssignExercise(draft, toDayId, assignment, assignmentId);
    if (!validation.allowed) return { ...draft, assignmentError: validation };
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
        coalesceRelationshipsByProgrammingFamily(relationshipResolver(assignment) || []).forEach((relationship) => {
          const muscleId = relationship.programmingFamilyId;
          if (!muscleId) return;
          const type = relationship.relationshipType;
          const weight = Math.max(0, number(relationship.setContribution));
          const direct = type === "direct_load" ? sets : 0;
          const fractional = type === "meaningful_fractional_load" ? sets * weight : 0;
          const isometric = relationship.isometricFatigueWeight > 0 ? sets : 0;
          const localFatigue = sets * relationship.localFatigueWeight;
          const currentDay = muscles.get(muscleId) || { direct: 0, fractional: 0, isometric: 0, localFatigue: 0, exercises: [] };
          currentDay.direct += direct; currentDay.fractional += fractional; currentDay.isometric += isometric; currentDay.localFatigue += localFatigue;
          currentDay.exercises.push({ exerciseId: assignment.exerciseId, name: assignment.name, sets, weight, type, localFatigueWeight: relationship.localFatigueWeight, canonicalMuscleGroupIds: relationship.canonicalMuscleGroupIds, relationshipCount: relationship.relationshipCount });
          muscles.set(muscleId, currentDay);
          const total = muscleTotals.get(muscleId) || { muscleGroupId: muscleId, programmingFamilyId: muscleId, directSets: 0, fractionalSets: 0, isometricExposure: 0, localFatigueExposure: 0, exposureDayIds: new Set(), contributors: [] };
          total.directSets += direct; total.fractionalSets += fractional; total.isometricExposure += isometric; total.localFatigueExposure += localFatigue;
          if (direct + fractional > 0) total.exposureDayIds.add(day.id);
          total.contributors.push({ dayId: day.id, dayName: day.name, exerciseId: assignment.exerciseId, name: assignment.name, sets, weight, type, localFatigueWeight: relationship.localFatigueWeight, canonicalMuscleGroupIds: relationship.canonicalMuscleGroupIds, relationshipCount: relationship.relationshipCount });
          muscleTotals.set(muscleId, total);
        });
      });
      return { dayId: day.id, dayName: day.name, workingSets, exerciseCount: day.assignments.length, muscles: Array.from(muscles, ([muscleGroupId, value]) => ({ muscleGroupId, ...value, direct: round(value.direct), fractional: round(value.fractional), isometric: round(value.isometric), localFatigue: round(value.localFatigue) })) };
    });
    return {
      ledgerVersion: LEDGER_VERSION,
      programmingFamilyVersion: PROGRAMMING_FAMILY_VERSION,
      dayTotals,
      muscleTotals: Array.from(muscleTotals.values()).map((item) => ({ ...item, directSets: round(item.directSets), fractionalSets: round(item.fractionalSets), weightedSets: round(item.directSets + item.fractionalSets), isometricExposure: round(item.isometricExposure), localFatigueExposure: round(item.localFatigueExposure), exposureDayIds: Array.from(item.exposureDayIds) }))
    };
  }

  function muscleTargetStatuses(draft, ledger, targetFor) {
    const populatedDays = new Set(draft.guidedDays.filter((day) => day.assignments.length).map((day) => day.id));
    const remainingTrainingDays = Math.max(0, draft.guidedDays.length - populatedDays.size);
    return projectedScope(draft).map(({ muscleGroupId, sourceMuscleGroupIds }) => {
      const total = ledger.muscleTotals.find((item) => item.muscleGroupId === muscleGroupId) || { directSets: 0, fractionalSets: 0, weightedSets: 0, exposureDayIds: [] };
      const target = targetFor(muscleGroupId, draft);
      const priorities = sourceMuscleGroupIds.map((source) => draft.musclePriorities?.[source]).filter(Boolean);
      const priority = ["specialization", "priority", "normal", "maintenance"].find((candidate) => priorities.includes(candidate)) || draft.musclePriorities?.[muscleGroupId] || "normal";
      const frequencyTarget = priority === "maintenance" ? PLANNING_RULES.maintenanceFrequency : priority === "specialization" ? PLANNING_RULES.specializationFrequency : PLANNING_RULES.normalFrequency;
      const volumeStatus = total.weightedSets < target.min ? "below" : total.weightedSets > target.max ? "above" : "within";
      const setsRemaining = Math.max(0, round(target.min - total.weightedSets));
      const frequencyRemaining = Math.max(0, frequencyTarget - total.exposureDayIds.length);
      const frequencyStatus = frequencyRemaining > 0 ? "needed" : "satisfied";
      const distributionIssue = total.exposureDayIds.length === 1 && total.weightedSets > Math.max(target.min, target.target || target.min);
      const overallStatus = volumeStatus === "above" ? "above"
        : frequencyRemaining > 0 ? "needs_frequency"
          : volumeStatus === "below" ? "below"
            : distributionIssue ? "needs_distribution" : "within";
      const priorityWeight = priority === "specialization" ? 1.35 : priority === "priority" ? 1.2 : priority === "maintenance" ? 0.65 : 1;
      const normalizedDeficit = target.min ? setsRemaining / target.min : 0;
      const recommendationScore = round((total.directSets === 0 ? 50 : 0) + normalizedDeficit * 35 * priorityWeight + frequencyRemaining * 18 + (frequencyRemaining > remainingTrainingDays ? 25 : 0));
      return { muscleGroupId, programmingFamilyId: muscleGroupId, sourceMuscleGroupIds, ...total, totalEffectiveSets: total.weightedSets, targetRange: target, setsRemaining, headroom: Math.max(0, round(target.max - total.weightedSets)), status: overallStatus, overallStatus, volumeStatus, frequencyStatus, distributionIssue, priority, frequencyTarget, frequencyRemaining, remainingTrainingDays, recommendationScore };
    }).sort((a, b) => b.recommendationScore - a.recommendationScore || b.setsRemaining - a.setsRemaining || a.muscleGroupId.localeCompare(b.muscleGroupId));
  }

  function viability(draft, options = {}) {
    const ledger = options.ledger || volumeLedger(draft, options.relationshipResolver || (() => []));
    const targetFor = options.targetFor || (() => ({ min: 4, target: 8, max: 12 }));
    const findings = [];
    if (!draft.guidedDays.length || draft.guidedDays.every((day) => !day.assignments.length)) findings.push({ id: "no-exercises", severity: "blocking", title: "Add exercises before creating templates", why: "A mesocycle cannot create usable workout templates without exercise assignments.", actions: ["Return to builder"] });
    draft.guidedDays.forEach((day) => {
      const daily = ledger.dayTotals.find((item) => item.dayId === day.id);
      const canonicalCounts = new Map();
      day.assignments.forEach((assignment) => { const key = canonicalExerciseId(assignment); if (key) canonicalCounts.set(key, (canonicalCounts.get(key) || 0) + 1); });
      canonicalCounts.forEach((count, canonicalId) => { if (count > 1) findings.push({ id: `duplicate-${day.id}-${canonicalId}`, severity: "blocking", dayId: day.id, title: `${day.name} repeats the same exercise`, why: "An exact canonical exercise may appear only once in one training day. Increase or restructure the existing assignment instead.", actions: ["Merge sets", "Remove duplicate"] }); });
      if (!day.assignments.length) findings.push({ id: `empty-${day.id}`, severity: "blocking", dayId: day.id, title: `${day.name} is empty`, why: "Every configured training day needs at least one exercise.", actions: ["Add exercise", "Reduce training days"] });
      if (daily?.workingSets > PLANNING_RULES.maxWorkingSetsPerDay) findings.push({ id: `sets-${day.id}`, severity: "blocking", dayId: day.id, title: `${day.name} has ${daily.workingSets} working sets`, why: `This exceeds the hard ${PLANNING_RULES.maxWorkingSetsPerDay}-set daily limit.`, actions: ["Reduce sets", "Move an exercise"] });
      if (daily?.exerciseCount > PLANNING_RULES.practicalExerciseRange[1]) findings.push({ id: `count-${day.id}`, severity: "advisory", dayId: day.id, title: `${day.name} has ${daily.exerciseCount} exercises`, why: "Setup changes and transition time may make this session longer than expected.", actions: ["Consolidate exercises"] });
      (daily?.muscles || []).filter((muscle) => muscle.exercises.filter((item) => item.type === "direct_load").length > PLANNING_RULES.maxExercisesPerMusclePerDay).forEach((muscle) => findings.push({ id: `same-day-${day.id}-${muscle.muscleGroupId}`, severity: "blocking", dayId: day.id, muscleGroupId: muscle.muscleGroupId, title: `More than two direct exercises target ${muscle.muscleGroupId} on ${day.name}`, why: "The guided builder permits no more than two exercises for one muscle in a training day.", actions: ["Remove one exercise", "Move one exercise"] }));
      const estimatedMinutes = day.assignments.reduce((sum, assignment) => sum + number(assignment.workingSets) * (number(assignment.restSeconds, 90) + 45) / 60 + 1.5, 0);
      const systemic = sum(day.assignments.map((assignment) => number(assignment.systemicFatigue) * Math.max(1, number(assignment.workingSets)) / 3));
      const spinal = sum(day.assignments.map((assignment) => number(assignment.spinalLoad) * Math.max(1, number(assignment.workingSets)) / 3));
      const demanding = day.assignments.filter((assignment) => number(assignment.systemicFatigue) >= 65 || number(assignment.spinalLoad) >= 65);
      if (estimatedMinutes > 100) findings.push({ id: `duration-${day.id}`, severity: "warning", dayId: day.id, title: `${day.name} may take about ${Math.round(estimatedMinutes)} minutes`, why: "Working sets, programmed rest, warm-up/setup allowance, and exercise transitions make the session impractically long for most gym sessions.", actions: ["Consolidate exercises", "Move work to another day"] });
      if (demanding.length >= 3 || systemic > 420 || spinal > 300) findings.push({ id: `fatigue-${day.id}`, severity: "warning", dayId: day.id, title: `${day.name} concentrates high fatigue`, why: `${demanding.map((item) => item.name).join(", ") || "The selected exercises"} create substantial systemic or spinal demand that may compromise later work and recovery.`, actions: ["Reorder priority work", "Replace one demanding lift", "Move one lift"] });
    });
    draft.guidedDays.slice(0, -1).forEach((day, index) => {
      const next = draft.guidedDays[index + 1];
      const fatigue = (candidate) => sum(candidate.assignments.map((assignment) => number(assignment.systemicFatigue) + number(assignment.spinalLoad) + number(assignment.jointStress)));
      if (fatigue(day) >= 300 && fatigue(next) >= 300) findings.push({ id: `recovery-spacing-${day.id}-${next.id}`, severity: "warning", dayId: next.id, title: `${day.name} and ${next.name} are consecutive high-fatigue sessions`, why: "Back-to-back systemic, spinal, or joint demand can impair the later session even when each day is acceptable in isolation.", actions: ["Move a demanding exercise", "Insert recovery spacing", "Accept the schedule tradeoff"] });
    });
    projectedScope(draft).forEach(({ muscleGroupId, sourceMuscleGroupIds }) => {
      const total = ledger.muscleTotals.find((item) => item.muscleGroupId === muscleGroupId) || { directSets: 0, fractionalSets: 0, weightedSets: 0, exposureDayIds: [] };
      const target = targetFor(muscleGroupId, draft) || { min: 4, target: 8, max: 12 };
      const priorities = sourceMuscleGroupIds.map((source) => draft.musclePriorities?.[source]).filter(Boolean);
      const priority = ["specialization", "priority", "normal", "maintenance"].find((candidate) => priorities.includes(candidate)) || draft.musclePriorities?.[muscleGroupId] || "normal";
      const frequencyTarget = priority === "maintenance" ? PLANNING_RULES.maintenanceFrequency : priority === "specialization" ? PLANNING_RULES.specializationFrequency : PLANNING_RULES.normalFrequency;
      if (total.weightedSets <= 0) findings.push({ id: `missing-${muscleGroupId}`, severity: "blocking", muscleGroupId, title: `${muscleGroupId} receives no meaningful stimulus`, why: "The selected muscle has no direct or credited fractional hypertrophy work, so its templates would be incomplete.", actions: ["Add suggested exercise", "Remove the muscle from scope"] });
      else if (total.weightedSets < number(target.min, 0)) findings.push({ id: `low-${muscleGroupId}`, severity: "warning", muscleGroupId, title: `${muscleGroupId} is below its effective-set target`, why: `${total.weightedSets} total effective sets are planned (${total.directSets} direct + ${total.fractionalSets} fractional); the range begins at ${target.min}.`, actions: ["Add effective sets", "Accept lower volume"] });
      if (total.weightedSets > number(target.max, 99)) findings.push({ id: `high-${muscleGroupId}`, severity: "warning", muscleGroupId, title: `${muscleGroupId} is above its effective-volume range`, why: `${total.weightedSets} total effective sets exceed the current upper target of ${target.max}.`, actions: ["Reduce sets", "Accept specialization volume"] });
      if (total.exposureDayIds.length < frequencyTarget) findings.push({ id: `frequency-${muscleGroupId}`, severity: "warning", muscleGroupId, title: `${muscleGroupId} needs more frequency`, why: `Volume is evaluated separately. ${total.exposureDayIds.length} of ${frequencyTarget} meaningful weekly exposures are planned for the selected ${priority} priority.`, actions: ["Add work to another day", "Accept lower frequency"] });
      const remainingDays = draft.guidedDays.filter((day) => !total.exposureDayIds.includes(day.id)).length;
      if (Math.max(0, frequencyTarget - total.exposureDayIds.length) > remainingDays) findings.push({ id: `capacity-${muscleGroupId}`, severity: "warning", muscleGroupId, title: `${muscleGroupId} cannot reach its frequency target with the remaining days`, why: "The current distribution leaves too few compatible training days for the default exposure target.", actions: ["Move work", "Increase training days", "Accept lower frequency"] });
    });
    const accepted = new Set(draft.acceptedExceptions || []);
    const visible = findings.map((finding) => ({ ...finding, accepted: accepted.has(finding.id) }));
    const active = visible.filter((finding) => !finding.accepted);
    const score = Math.max(0, Math.round(100 - active.reduce((sum, finding) => sum + (finding.severity === "blocking" ? 25 : finding.severity === "warning" || finding.severity === "strong_warning" ? 8 : 3), 0)));
    const result = { version: "viability/1.2.0", rulesVersion: RULES_VERSION, checkedAt: new Date().toISOString(), score, grade: score >= 90 ? "Excellent" : score >= 80 ? "Good" : score >= 70 ? "Workable" : "Needs Revision", findings: visible, blockingCount: active.filter((item) => item.severity === "blocking").length, warningCount: active.filter((item) => ["warning", "strong_warning"].includes(item.severity)).length, informationCount: active.filter((item) => item.severity === "information" || item.severity === "advisory").length, readyToGenerate: active.every((item) => item.severity !== "blocking"), ledger };
    return result;
  }

  return Object.freeze({ BUILDER_VERSION, RULES_VERSION, LEDGER_VERSION, PROGRAMMING_FAMILY_VERSION, CANONICAL_TO_PROGRAMMING_FAMILY, programmingFamilyId, coalesceRelationshipsByProgrammingFamily, STEPS, PLANNING_RULES, createDraft, unlockStep, canonicalExerciseId, canAssignExercise, addExercise, patchAssignment, removeAssignment, moveAssignment, volumeLedger, muscleTargetStatuses, viability });
});
