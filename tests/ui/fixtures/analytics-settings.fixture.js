"use strict";

const STORAGE_KEY = "comprehensive-fitness-data-v1";
const FIXED_NOW = "2026-07-15T17:00:00.000Z";
const FIXED_DAY = "2026-07-15";

const EXERCISES = Object.freeze([
  Object.freeze({
    slug: "barbell-bench",
    name: "Barbell Bench Press",
    primaryMuscle: "Chest",
    secondaryMuscle: "Triceps",
    latestTopLoad: 220,
    weeklyLoadStep: 2
  }),
  Object.freeze({
    slug: "close-grip-bench",
    name: "Close-Grip Bench Press",
    primaryMuscle: "Triceps",
    secondaryMuscle: "Chest",
    latestTopLoad: 165,
    weeklyLoadStep: 1
  }),
  Object.freeze({
    slug: "dumbbell-bench",
    name: "Dumbbell Bench Press",
    primaryMuscle: "Chest",
    secondaryMuscle: "Triceps",
    latestTopLoad: 90,
    weeklyLoadStep: 1
  })
]);

const ANALYTICS_EXPECTATIONS = Object.freeze({
  latestWindow: Object.freeze({ start: "June 8", end: "July 19", qualifyingWeeks: 6, setCount: 18 }),
  previousWindow: Object.freeze({ start: "April 27", end: "June 7", qualifyingWeeks: 6, setCount: 18 }),
  dumbbellLatest: Object.freeze({ e1rm: "114", volume: "2285", pointDate: "July 15" }),
  dumbbellPrevious: Object.freeze({ e1rm: "106.4", volume: "2123", pointDate: "June 3" })
});

function dateForWeekOffset(weekOffset) {
  const date = new Date(`${FIXED_DAY}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - (weekOffset * 7));
  return date.toISOString().slice(0, 10);
}

function settingsFixture() {
  return {
    weightUnit: "lb",
    trainingGoal: "hypertrophy",
    trainingGoalSource: "explicit",
    trainingGoalDisclosure: "",
    nutritionPhase: "maintenance",
    experienceLevel: "intermediate",
    returningAfterGap: false,
    trainingDaysPerWeek: 4,
    availableEquipment: ["all"],
    excludedExerciseIds: [],
    theme: "light",
    timerSound: false,
    workoutCompletionSound: false,
    timerVibration: false,
    interactionVibration: false,
    timerNotifications: false,
    inAppRestAlerts: true,
    restCompleteSound: "sharp_two_tone",
    restCompleteSoundVolume: 0.85,
    restCompleteAutoDismissMs: 5000,
    restCompleteLockScreenNotifications: false,
    restCompleteAutoReturnToWorkout: false,
    defaultRestSeconds: 90,
    notificationMessageDetail: "exercise-set",
    autoStartRestTimer: false,
    autoHighlightNextSet: true,
    autoScrollNextSet: false,
    installGuideDismissed: true,
    setupSoundConfirmed: true,
    cloudWorkoutSyncConsent: false,
    readinessBaseline: {
      sleepHours: 7.5,
      sleepQuality: 4,
      hrv: 58,
      restingHr: 60,
      soreness: 2,
      band: 8
    }
  };
}

function emptyModel() {
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
    settings: settingsFixture()
  };
}

function completedSession(weekOffset) {
  const date = dateForWeekOffset(weekOffset);
  return {
    id: `public-analytics-session-${String(weekOffset).padStart(2, "0")}`,
    date,
    completedAt: date,
    submittedAt: `${date}T18:00:00.000Z`,
    createdAt: `${date}T16:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    title: `Public Synthetic Analytics Session ${String(weekOffset + 1).padStart(2, "0")}`,
    notes: "Deterministic public synthetic browser-test data; no personal or imported health record.",
    submitted: true,
    workoutStarted: false,
    workoutState: "completed",
    recovery: {},
    prs: []
  };
}

function completedExercise(session, profile, order) {
  return {
    id: `${session.id}-${profile.slug}`,
    sessionId: session.id,
    name: profile.name,
    notes: "Public synthetic analytics exercise.",
    order,
    primaryMuscle: profile.primaryMuscle,
    secondaryMuscle: profile.secondaryMuscle,
    resistanceType: "external",
    isBodyweight: false,
    restSeconds: 120,
    isDeload: false
  };
}

function completedSet(exercise, weekOffset, setIndex, profile) {
  const topLoad = profile.latestTopLoad - (weekOffset * profile.weeklyLoadStep);
  const reps = 8 + setIndex;
  const load = topLoad - (setIndex * 5);
  return {
    id: `${exercise.id}-set-${setIndex + 1}`,
    exerciseId: exercise.id,
    setNumber: setIndex + 1,
    sequenceIndex: setIndex,
    sequence: setIndex,
    setTypeIndex: setIndex,
    setType: setIndex === 0 ? "top" : "backoff",
    reps,
    weight: load,
    weightUnit: "lb",
    resistanceType: "external",
    rpe: setIndex === 0 ? 8 : 7.5,
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
    targetReps: reps,
    targetRepMin: 8,
    targetRepMax: 10,
    targetWeight: load,
    targetRpe: 8,
    targetRpeMin: 7,
    targetRpeMax: 8.5,
    targetRpeTolerance: 0.5,
    targetRestSeconds: 120
  };
}

function buildAnalyticsSettingsFixture() {
  const model = emptyModel();
  for (let weekOffset = 0; weekOffset < 14; weekOffset += 1) {
    const session = completedSession(weekOffset);
    model.sessions.push(session);
    EXERCISES.forEach((profile, order) => {
      const exercise = completedExercise(session, profile, order);
      model.exercises.push(exercise);
      for (let setIndex = 0; setIndex < 3; setIndex += 1) {
        model.sets.push(completedSet(exercise, weekOffset, setIndex, profile));
      }
    });
  }
  model.templates.push({
    id: "public-analytics-template",
    name: "Public Synthetic Analytics Template",
    notes: "Public synthetic browser-test template.",
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    exercises: [{
      id: "public-analytics-template-bench",
      name: "Barbell Bench Press",
      primaryMuscle: "Chest",
      secondaryMuscle: "Triceps",
      resistanceType: "external",
      sets: 3,
      reps: 8,
      targetRpe: 8,
      restSeconds: 120
    }]
  });
  return model;
}

function buildEmptyAnalyticsSettingsFixture() {
  return emptyModel();
}

module.exports = {
  ANALYTICS_EXPECTATIONS,
  EXERCISES,
  FIXED_NOW,
  STORAGE_KEY,
  buildAnalyticsSettingsFixture,
  buildEmptyAnalyticsSettingsFixture
};
