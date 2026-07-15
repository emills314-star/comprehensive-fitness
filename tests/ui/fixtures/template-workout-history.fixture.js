"use strict";

const STORAGE_KEY = "comprehensive-fitness-data-v1";
const FIXED_NOW = "2026-07-16T17:00:00.000Z";
const FIXED_DATE = "2026-07-16";

const IDS = Object.freeze({
  controlTemplate: "public-synthetic-control-template",
  controlBenchTemplateExercise: "public-synthetic-control-template-bench",
  controlRowTemplateExercise: "public-synthetic-control-template-row",
  historySession: "public-synthetic-history-session",
  historyBenchExercise: "public-synthetic-history-bench",
  historyRowExercise: "public-synthetic-history-row",
  historyBenchSet1: "public-synthetic-history-bench-set-1",
  historyBenchSet2: "public-synthetic-history-bench-set-2",
  historyRowSet1: "public-synthetic-history-row-set-1",
  historyRowSet2: "public-synthetic-history-row-set-2",
  activeSession: "public-synthetic-active-session",
  activeBenchExercise: "public-synthetic-active-bench",
  activeRowExercise: "public-synthetic-active-row",
  activeBenchSet1: "public-synthetic-active-bench-set-1",
  activeBenchSet2: "public-synthetic-active-bench-set-2",
  activeRowSet1: "public-synthetic-active-row-set-1",
  activeRowSet2: "public-synthetic-active-row-set-2"
});

const NAMES = Object.freeze({
  controlTemplate: "Public Synthetic Upper Lifecycle",
  historySession: "Public Synthetic Logged Upper Session",
  activeSession: "Public Synthetic Active Upper Session",
  bench: "Barbell Bench Press",
  row: "Dumbbell Bench Press"
});

function settings() {
  return {
    theme: "light",
    weightUnit: "lb",
    goal: "hypertrophy",
    trainingStatus: "intermediate",
    experienceLevel: "intermediate",
    trainingDaysPerWeek: 4,
    availableEquipment: ["barbell", "plates", "bench", "rack", "dumbbell"],
    excludedExerciseIds: [],
    installGuideDismissed: true,
    setupSoundConfirmed: true,
    timerSound: false,
    timerNotifications: false,
    restCompleteSoundEnabled: false,
    restCompleteLockScreenNotifications: false,
    workoutUploadConsent: false,
    autoStartRestTimer: false,
    autoHighlightNextSet: true,
    autoScrollNextSet: false,
    defaultRestSeconds: 120,
    readinessBaseline: {
      sleepHours: 7.5,
      sleepQuality: 4,
      hrv: 60,
      restingHr: 58,
      soreness: 2,
      band: 8
    }
  };
}

function controlTemplate() {
  return {
    id: IDS.controlTemplate,
    name: NAMES.controlTemplate,
    notes: "Public synthetic repeatable workout; no personal or imported fitness data.",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
    exercises: [
      {
        id: IDS.controlBenchTemplateExercise,
        name: NAMES.bench,
        primaryMuscle: "Chest",
        secondaryMuscle: "Triceps",
        resistanceType: "external",
        isBodyweight: false,
        sets: 2,
        reps: 8,
        targetRpe: 8,
        increment: 5,
        restSeconds: 120,
        warmups: [{ reps: 8, weight: 45, weightUnit: "lb", resistanceType: "external", isBodyweight: false, addedLoad: 0, assistanceLoad: 0, rpe: 5 }]
      },
      {
        id: IDS.controlRowTemplateExercise,
        name: NAMES.row,
        primaryMuscle: "Chest",
        secondaryMuscle: "Triceps",
        resistanceType: "external",
        isBodyweight: false,
        sets: 2,
        reps: 10,
        targetRpe: 8,
        increment: 5,
        restSeconds: 105,
        warmups: []
      }
    ]
  };
}

function submittedSession() {
  return {
    id: IDS.historySession,
    date: FIXED_DATE,
    title: NAMES.historySession,
    notes: "Public synthetic submitted workout used only for deterministic lifecycle testing.",
    submitted: true,
    workoutStarted: false,
    workoutState: "completed",
    createdAt: "2026-07-16T14:00:00.000Z",
    startedAt: "2026-07-16T14:05:00.000Z",
    completedAt: FIXED_DATE,
    submittedAt: "2026-07-16T15:00:00.000Z",
    updatedAt: "2026-07-16T15:00:00.000Z",
    recovery: {},
    prs: []
  };
}

function activeSession() {
  return {
    id: IDS.activeSession,
    date: FIXED_DATE,
    title: NAMES.activeSession,
    notes: "Public synthetic active workout used only for deterministic lifecycle testing.",
    submitted: false,
    workoutStarted: true,
    workoutState: "active",
    createdAt: "2026-07-16T16:00:00.000Z",
    startedAt: "2026-07-16T16:05:00.000Z",
    updatedAt: "2026-07-16T16:30:00.000Z",
    recovery: {},
    prs: []
  };
}

function exercise(id, sessionId, name, order, primaryMuscle, secondaryMuscle) {
  return {
    id,
    sessionId,
    name,
    notes: "Public synthetic technique note.",
    order,
    primaryMuscle,
    secondaryMuscle,
    resistanceType: "external",
    isBodyweight: false,
    isDeload: false,
    restSeconds: name === NAMES.bench ? 120 : 105
  };
}

function workingSet(id, exerciseId, setNumber, { completed = false, reps = 8, weight = 100 } = {}) {
  return {
    id,
    exerciseId,
    setNumber,
    sequenceIndex: setNumber - 1,
    sequence: setNumber - 1,
    setTypeIndex: setNumber - 1,
    setType: setNumber === 1 ? "top" : "backoff",
    reps,
    weight,
    weightUnit: "lb",
    resistanceType: "external",
    rpe: setNumber === 1 ? 8 : 7.5,
    completed,
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
    targetRepMin: Math.max(1, reps - 2),
    targetRepMax: reps + 2,
    targetWeight: weight,
    targetRpe: 8,
    targetRpeMin: 7,
    targetRpeMax: 8.5,
    targetRpeTolerance: 0.5,
    targetRestSeconds: exerciseId.includes("bench") ? 120 : 105
  };
}

function historyEntities() {
  return {
    sessions: [submittedSession()],
    exercises: [
      exercise(IDS.historyBenchExercise, IDS.historySession, NAMES.bench, 0, "Chest", "Triceps"),
      exercise(IDS.historyRowExercise, IDS.historySession, NAMES.row, 1, "Chest", "Triceps")
    ],
    sets: [
      workingSet(IDS.historyBenchSet1, IDS.historyBenchExercise, 1, { completed: true, reps: 8, weight: 145 }),
      workingSet(IDS.historyBenchSet2, IDS.historyBenchExercise, 2, { completed: true, reps: 9, weight: 135 }),
      workingSet(IDS.historyRowSet1, IDS.historyRowExercise, 1, { completed: true, reps: 10, weight: 110 }),
      workingSet(IDS.historyRowSet2, IDS.historyRowExercise, 2, { completed: true, reps: 10, weight: 105 })
    ]
  };
}

function activeEntities() {
  return {
    sessions: [activeSession()],
    exercises: [
      exercise(IDS.activeBenchExercise, IDS.activeSession, NAMES.bench, 0, "Chest", "Triceps"),
      exercise(IDS.activeRowExercise, IDS.activeSession, NAMES.row, 1, "Chest", "Triceps")
    ],
    sets: [
      workingSet(IDS.activeBenchSet1, IDS.activeBenchExercise, 1, { reps: 8, weight: 150 }),
      workingSet(IDS.activeBenchSet2, IDS.activeBenchExercise, 2, { reps: 9, weight: 140 }),
      workingSet(IDS.activeRowSet1, IDS.activeRowExercise, 1, { reps: 10, weight: 115 }),
      workingSet(IDS.activeRowSet2, IDS.activeRowExercise, 2, { reps: 10, weight: 110 })
    ]
  };
}

function baseData() {
  const history = historyEntities();
  return {
    appDataVersion: 2,
    domainMigrationVersion: 3,
    sessions: history.sessions,
    exercises: history.exercises,
    sets: history.sets,
    templates: [controlTemplate()],
    mesocycles: [],
    activeMesocycleId: "",
    recommendationHistory: [],
    manualOverrides: [],
    personalEvidencePackage: null,
    rawImports: [],
    migrationAudit: [],
    dataRevision: 10,
    settings: settings()
  };
}

function buildTemplateLifecycleFixture() {
  return structuredClone(baseData());
}

function buildActiveWorkoutLifecycleFixture() {
  const fixture = baseData();
  const active = activeEntities();
  fixture.sessions = [...active.sessions, ...fixture.sessions];
  fixture.exercises = [...active.exercises, ...fixture.exercises];
  fixture.sets = [...active.sets, ...fixture.sets];
  return structuredClone(fixture);
}

function buildHistoryLifecycleFixture() {
  return structuredClone(baseData());
}

function fixtureContract(fixture) {
  return {
    sessions: fixture.sessions.length,
    exercises: fixture.exercises.length,
    sets: fixture.sets.length,
    templates: fixture.templates.length,
    uniqueSessionIds: new Set(fixture.sessions.map((item) => item.id)).size,
    uniqueExerciseIds: new Set(fixture.exercises.map((item) => item.id)).size,
    uniqueSetIds: new Set(fixture.sets.map((item) => item.id)).size,
    uniqueTemplateIds: new Set(fixture.templates.map((item) => item.id)).size,
    privateFieldNames: Object.keys(fixture).filter((key) => /private|health|sourcePackage/i.test(key))
  };
}

module.exports = {
  FIXED_DATE,
  FIXED_NOW,
  IDS,
  NAMES,
  STORAGE_KEY,
  buildActiveWorkoutLifecycleFixture,
  buildHistoryLifecycleFixture,
  buildTemplateLifecycleFixture,
  fixtureContract
};
