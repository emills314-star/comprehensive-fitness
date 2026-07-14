"use strict";

const STORAGE_KEY = "comprehensive-fitness-data-v1";
const FIXED_NOW = "2026-07-15T17:00:00.000Z";
const ACTIVE_SESSION_ID = "public-synthetic-active-session";
const ACTIVE_WORKOUT_TITLE = "Upper Strength · Public Synthetic Long-Label Session With Paused Repetitions";
const LONG_EXERCISE_NAMES = Object.freeze({
  chest: "Barbell Bench Press · Public Synthetic Paused-Eccentric Long-Label Variation",
  back: "Chest-Supported Row · Public Synthetic Controlled-Scapular Long-Label Variation",
  quads: "Front Squat · Public Synthetic Front-Foot-Elevated Long-Label Variation"
});
const LONG_HISTORY_TITLE = "Wednesday · Public Synthetic Upper Body Volume With Posterior Chain, Core, Calves, and Long Labels";

function dateDaysBefore(dayOffset) {
  const value = new Date("2026-07-15T12:00:00.000Z");
  value.setUTCDate(value.getUTCDate() - dayOffset);
  return value.toISOString().slice(0, 10);
}

function completedSession(dayOffset) {
  const date = dateDaysBefore(dayOffset);
  const score = 74 + (dayOffset % 24);
  const grade = score >= 97 ? "A+" : score >= 93 ? "A" : score >= 90 ? "A-" : score >= 87 ? "B+" : score >= 83 ? "B" : score >= 80 ? "B-" : score >= 77 ? "C+" : score >= 73 ? "C" : "C-";
  const title = dayOffset === 0
    ? LONG_HISTORY_TITLE
    : dayOffset === 1
      ? "Tuesday · Public Synthetic Heavy Push, Calves, Light Quads, and Technique Practice"
      : dayOffset === 2
        ? "Monday · Public Synthetic Posterior Chain and Upper-Back Volume Session"
        : `Public Synthetic Historical Session ${String(dayOffset + 1).padStart(2, "0")} · Stable Large-Data Fixture`;
  return {
    id: `public-synthetic-history-session-${String(dayOffset).padStart(2, "0")}`,
    date,
    completedAt: date,
    submittedAt: `${date}T18:00:00.000Z`,
    createdAt: `${date}T16:45:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    title,
    notes: "Public synthetic regression data; no personal record or imported health information.",
    submitted: true,
    workoutStarted: false,
    workoutState: "completed",
    recovery: {},
    prs: [],
    workoutAnalysis: {
      version: 1,
      grade,
      internalScore: score,
      intent: "Synthetic regression session",
      interpretation: "Deterministic public fixture workout.",
      rationale: "Used only to protect rich Dashboard and Lift rendering.",
      categoryScores: [],
      highlights: [],
      improvements: [],
      exerciseResults: [],
      confidence: "moderate",
      metrics: { completedSets: dayOffset <= 2 ? 16 : 12, rpeLoggedRatio: 1 }
    }
  };
}

function completedSet(exerciseId, setIndex, dayOffset, load) {
  return {
    id: `${exerciseId}-set-${setIndex + 1}`,
    exerciseId,
    setNumber: setIndex + 1,
    sequenceIndex: setIndex,
    sequence: setIndex,
    setTypeIndex: setIndex,
    setType: setIndex === 0 ? "top" : "backoff",
    reps: 8 + ((dayOffset + setIndex) % 3),
    weight: load + Math.floor(dayOffset / 7) * 2.5,
    weightUnit: "lb",
    resistanceType: "external",
    rpe: 7.5 + (setIndex % 3) * 0.5,
    completed: true,
    skipped: false,
    edited: false,
    isWarmup: false,
    countsTowardScore: true,
    countsTowardVolume: true,
    countsTowardProgression: true,
    classificationSource: "public-synthetic-fixture",
    classificationConfidence: 1,
    classifierVersion: 2,
    targetReps: 10,
    targetRepMin: 8,
    targetRepMax: 12,
    targetWeight: load,
    targetRpe: 8,
    targetRpeMin: 7.5,
    targetRpeMax: 8.5,
    targetRpeTolerance: 0.5,
    targetRestSeconds: 120
  };
}

function activeSet(exerciseId, setNumber, options = {}) {
  const warmup = Boolean(options.warmup);
  const load = Number(options.load || 0);
  return {
    id: `${exerciseId}-set-${warmup ? "warmup" : setNumber}`,
    exerciseId,
    setNumber,
    sequenceIndex: Number(options.sequenceIndex ?? setNumber),
    sequence: Number(options.sequenceIndex ?? setNumber),
    setTypeIndex: warmup ? 0 : Math.max(0, setNumber - 1),
    setType: warmup ? "warmup" : setNumber === 1 ? "top" : "backoff",
    reps: Number(options.reps || (warmup ? 6 : 9)),
    weight: load,
    weightUnit: "lb",
    resistanceType: "external",
    rpe: Number(options.rpe || (warmup ? 5 : 8)),
    completed: Boolean(options.completed),
    skipped: Boolean(options.skipped),
    edited: false,
    isWarmup: warmup,
    countsTowardScore: !warmup,
    countsTowardVolume: !warmup,
    countsTowardProgression: !warmup,
    classificationSource: "public-synthetic-fixture",
    classificationConfidence: 1,
    classifierVersion: 2,
    targetReps: warmup ? 6 : 9,
    targetRepMin: warmup ? 5 : 8,
    targetRepMax: warmup ? 8 : 10,
    targetWeight: load,
    targetRpe: warmup ? 5 : 8,
    targetRpeMin: warmup ? 4 : 7.5,
    targetRpeMax: warmup ? 6 : 8.5,
    targetRpeTolerance: 0.5,
    targetRestSeconds: warmup ? 60 : 120,
    previousComparableSet: warmup ? null : {
      reps: 8,
      weight: Math.max(0, load - 5),
      weightUnit: "lb",
      resistanceType: "external",
      rpe: 8
    },
    setPrescription: warmup ? null : {
      nextLoad: load + 5,
      confidence: "moderate",
      progressionRule: "Reach 10 controlled repetitions inside the RPE target before adding load."
    }
  };
}

function publicTemplates() {
  return [
    {
      id: "public-synthetic-template-upper",
      name: "Public Synthetic Upper Strength · Long-Label Template",
      notes: "Public synthetic template.",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      exercises: [{ id: "public-template-upper-bench", name: LONG_EXERCISE_NAMES.chest, primaryMuscle: "Chest", secondaryMuscle: "Triceps", resistanceType: "external", sets: 3, reps: 9, targetRpe: 8, restSeconds: 120 }]
    },
    {
      id: "public-synthetic-template-lower",
      name: "Public Synthetic Lower Technique and Posterior Chain",
      notes: "Public synthetic template.",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      exercises: [{ id: "public-template-lower-squat", name: LONG_EXERCISE_NAMES.quads, primaryMuscle: "Quads", secondaryMuscle: "Glutes", resistanceType: "external", sets: 3, reps: 8, targetRpe: 7.5, restSeconds: 150 }]
    }
  ];
}

function baseFixture(theme) {
  return {
    appDataVersion: 2,
    domainMigrationVersion: 3,
    sessions: [],
    exercises: [],
    sets: [],
    templates: [],
    mesocycles: [],
    activeMesocycleId: "",
    recommendationHistory: [],
    manualOverrides: [],
    personalEvidencePackage: null,
    rawImports: [],
    migrationAudit: [],
    dataRevision: 1,
    settings: {
      theme,
      weightUnit: "lb",
      goal: "hypertrophy",
      trainingStatus: "intermediate",
      trainingDaysPerWeek: 4,
      availableEquipment: ["barbell", "rack", "dumbbells", "cable"],
      installGuideDismissed: true,
      setupSoundConfirmed: true,
      autoStartRestTimer: false,
      autoHighlightNextSet: true,
      autoScrollNextSet: false,
      readinessBaseline: { sleepHours: 7.5, sleepQuality: 4, hrv: 58, restingHr: 60, soreness: 2, band: 8 }
    }
  };
}

function buildProtectedSurfaceFixture({ theme = "light" } = {}) {
  const fixture = baseFixture(theme);

  for (let dayOffset = 0; dayOffset < 48; dayOffset += 1) {
    const session = completedSession(dayOffset);
    fixture.sessions.push(session);
    const profiles = [
      { slug: "bench", name: LONG_EXERCISE_NAMES.chest, primaryMuscle: "Chest", secondaryMuscle: "Triceps", load: 155, setCount: dayOffset <= 2 ? 8 : 4 },
      { slug: "row", name: LONG_EXERCISE_NAMES.back, primaryMuscle: "Back", secondaryMuscle: "Biceps", load: 125, setCount: 4 },
      { slug: "squat", name: LONG_EXERCISE_NAMES.quads, primaryMuscle: "Quads", secondaryMuscle: "Glutes", load: 185, setCount: 4 }
    ];
    for (const [exerciseIndex, profile] of profiles.entries()) {
      const exerciseId = `${session.id}-${profile.slug}`;
      fixture.exercises.push({
        id: exerciseId,
        sessionId: session.id,
        name: profile.name,
        order: exerciseIndex,
        primaryMuscle: profile.primaryMuscle,
        secondaryMuscle: profile.secondaryMuscle,
        resistanceType: "external",
        restSeconds: profile.slug === "squat" ? 150 : 120,
        isDeload: dayOffset > 3 && dayOffset % 13 === 0
      });
      for (let setIndex = 0; setIndex < profile.setCount; setIndex += 1) {
        fixture.sets.push(completedSet(exerciseId, setIndex, dayOffset, profile.load));
      }
    }
  }

  fixture.sessions.push({
    id: ACTIVE_SESSION_ID,
    date: "2026-07-15",
    title: ACTIVE_WORKOUT_TITLE,
    notes: "Public synthetic active workout used for deterministic visual regression coverage.",
    recovery: { sleepHours: 7.75, sleepQuality: 4, hrv: 60, restingHr: 59, soreness: 2, nutritionStatus: "on_plan", proteinStatus: "adequate", outsideBandNote: "", illness: false, affectedMuscle: "" },
    submitted: false,
    workoutStarted: true,
    workoutState: "active",
    startedAt: "2026-07-15T16:28:00.000Z",
    createdAt: "2026-07-15T16:20:00.000Z",
    updatedAt: "2026-07-15T16:58:00.000Z",
    adjustmentSummary: "Public synthetic readiness check: normal plan preserved; technique quality and hard constraints remain visible."
  });

  const activeProfiles = [
    { slug: "bench", name: LONG_EXERCISE_NAMES.chest, primaryMuscle: "Chest", secondaryMuscle: "Triceps", load: 160, warmup: true },
    { slug: "row", name: LONG_EXERCISE_NAMES.back, primaryMuscle: "Back", secondaryMuscle: "Biceps", load: 130, warmup: true },
    { slug: "squat", name: LONG_EXERCISE_NAMES.quads, primaryMuscle: "Quads", secondaryMuscle: "Glutes", load: 190, warmup: false }
  ];
  for (const [exerciseIndex, profile] of activeProfiles.entries()) {
    const exerciseId = `public-synthetic-active-exercise-${exerciseIndex + 1}`;
    fixture.exercises.push({
      id: exerciseId,
      sessionId: ACTIVE_SESSION_ID,
      name: profile.name,
      notes: "Public synthetic technique cue with intentionally long wrapping text.",
      order: exerciseIndex,
      primaryMuscle: profile.primaryMuscle,
      secondaryMuscle: profile.secondaryMuscle,
      resistanceType: "external",
      restSeconds: profile.slug === "squat" ? 150 : 120,
      isDeload: false
    });
    if (profile.warmup) fixture.sets.push(activeSet(exerciseId, 0, { warmup: true, sequenceIndex: 0, load: profile.load * 0.55, completed: true, reps: 6, rpe: 5 }));
    for (let setNumber = 1; setNumber <= 3; setNumber += 1) {
      fixture.sets.push(activeSet(exerciseId, setNumber, {
        sequenceIndex: (profile.warmup ? 1 : 0) + setNumber,
        load: profile.load - (setNumber === 1 ? 0 : 10),
        completed: setNumber === 1 && exerciseIndex < 2,
        skipped: exerciseIndex === 1 && setNumber === 3,
        reps: setNumber === 1 ? 8 : 9,
        rpe: setNumber === 1 ? 8 : 7.5
      }));
    }
  }

  fixture.templates = publicTemplates();
  return fixture;
}

function buildEmptyProtectedSurfaceFixture({ theme = "light" } = {}) {
  return baseFixture(theme);
}

module.exports = {
  ACTIVE_SESSION_ID,
  ACTIVE_WORKOUT_TITLE,
  FIXED_NOW,
  LONG_EXERCISE_NAMES,
  LONG_HISTORY_TITLE,
  STORAGE_KEY,
  buildEmptyProtectedSurfaceFixture,
  buildProtectedSurfaceFixture
};
