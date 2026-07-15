"use strict";

const IDS = Object.freeze({
  session: "11111111-1111-4111-8111-111111111111",
  exercise: "22222222-2222-4222-8222-222222222222",
  set: "33333333-3333-4333-8333-333333333333",
  template: "44444444-4444-4444-8444-444444444444",
  templateExercise: "55555555-5555-4555-8555-555555555555"
});

const BACKUP_BOUNDARIES = Object.freeze({
  fileBytes: 8 * 1024 * 1024,
  jsonDepth: 32,
  objectKeys: 128,
  sessions: 1024,
  exercises: 4096,
  sets: 16384,
  templates: 512
});

function generatedId(namespace, index) {
  const namespaceHex = Number(namespace).toString(16).padStart(4, "0");
  const versionSuffix = namespaceHex.slice(-3);
  const first = Number(index + 1).toString(16).padStart(8, "0");
  const tail = `${namespaceHex}${Number(index).toString(16).padStart(8, "0")}`;
  return `${first}-${namespaceHex}-4${versionSuffix}-8${versionSuffix}-${tail}`;
}

function validFullState() {
  return {
    appDataVersion: 2,
    sessions: [{
      id: IDS.session,
      date: "2026-07-14",
      title: "Synthetic Round Trip",
      submitted: true,
      workoutStarted: false,
      workoutState: "completed",
      completedAt: "2026-07-14T13:00:00.000Z",
      recovery: { illness: false, pain: false, affectedMuscle: "" }
    }],
    exercises: [{
      id: IDS.exercise,
      sessionId: IDS.session,
      name: "Bench Press",
      order: 0,
      resistanceType: "external",
      primaryMuscle: "Chest",
      secondaryMuscle: "Triceps"
    }],
    sets: [{
      id: IDS.set,
      exerciseId: IDS.exercise,
      setNumber: 1,
      sequenceIndex: 0,
      setType: "straight",
      reps: 8,
      weight: 100,
      weightUnit: "lb",
      resistanceType: "external",
      rpe: 8,
      completed: true,
      skipped: false,
      edited: false
    }],
    templates: [{
      id: IDS.template,
      name: "Synthetic Template",
      notes: "Public test fixture only",
      createdAt: "2026-07-14T12:00:00.000Z",
      updatedAt: "2026-07-14T12:00:00.000Z",
      exercises: [{
        id: IDS.templateExercise,
        name: "Bench Press",
        sets: 3,
        reps: 8,
        targetRpe: 8,
        resistanceType: "external",
        restSeconds: 180,
        warmups: [],
        setTypes: []
      }]
    }],
    mesocycles: [],
    activeMesocycleId: "",
    recommendationHistory: [],
    manualOverrides: [],
    personalEvidencePackage: null,
    rawImports: [],
    migrationAudit: [],
    dataRevision: 7,
    settings: {
      weightUnit: "lb",
      trainingGoal: "hypertrophy",
      nutritionPhase: "maintenance",
      experienceLevel: "intermediate",
      trainingDaysPerWeek: 4,
      availableEquipment: ["barbell", "bench"],
      cloudWorkoutSyncConsent: false,
      theme: "light"
    }
  };
}

function legacyState() {
  const state = validFullState();
  state.appDataVersion = 1;
  state.sessions[0].title = "Synthetic Legacy Migration";
  state.settings = {
    weightUnit: "lb",
    goal: "cut",
    trainingStatus: "novice",
    trainingDaysPerWeek: 3,
    availableEquipment: ["dumbbell"],
    theme: "light"
  };
  return state;
}

function entityScopedUniquenessState() {
  const state = validFullState();
  state.sessions[0].title = "Entity Scoped IDs";
  state.templates[0].exercises[0].id = IDS.exercise;
  return state;
}

function safetyWorkoutState(recovery = {}, options = {}) {
  const state = validFullState();
  const exerciseIds = {
    bench: IDS.exercise,
    legPress: "66666666-6666-4666-8666-666666666666",
    unknown: "77777777-7777-4777-8777-777777777777"
  };
  state.sessions = [{
    ...state.sessions[0],
    title: "Synthetic Safety Workout",
    submitted: false,
    workoutStarted: true,
    workoutState: "active",
    completedAt: "",
    startedAt: "2026-07-14T12:00:00.000Z",
    recovery: { illness: false, pain: false, affectedMuscle: "", ...recovery }
  }];
  state.exercises = [
    {
      ...state.exercises[0],
      id: exerciseIds.bench,
      name: "Barbell Bench Press",
      primaryMuscle: "Chest",
      secondaryMuscle: "Triceps",
      order: 0,
      ...(options.recommendationSnapshot ? {
        recommendationSnapshot: options.recommendationSnapshot,
        basePrescription: options.recommendationSnapshot.basePrescription,
        finalPrescription: options.recommendationSnapshot.finalPrescription,
        executionBlocked: Boolean(options.recommendationSnapshot.finalPrescription?.executionBlocked),
        safetyRestriction: options.recommendationSnapshot.finalPrescription?.safetyRestriction || null
      } : {})
    },
    {
      ...state.exercises[0],
      id: exerciseIds.legPress,
      name: "Leg Press",
      primaryMuscle: "Quadriceps",
      secondaryMuscle: "Glutes",
      order: 1
    },
    {
      ...state.exercises[0],
      id: exerciseIds.unknown,
      name: "Unmapped Synthetic Movement",
      primaryMuscle: "",
      secondaryMuscle: "",
      order: 2
    }
  ];
  state.sets = state.exercises.map((exercise, index) => ({
    ...state.sets[0],
    id: [IDS.set, "88888888-8888-4888-8888-888888888888", "99999999-9999-4999-8999-999999999999"][index],
    exerciseId: exercise.id,
    completed: false,
    skipped: false
  }));
  state.templates = [];
  state.recommendationHistory = options.recommendationSnapshot ? [options.recommendationSnapshot] : [];
  state.settings = {
    ...state.settings,
    availableEquipment: ["all"],
    autoStartRestTimer: false,
    timerNotifications: false,
    interactionVibration: false
  };
  return { state, exerciseIds };
}

function entityCollectionCases() {
  return ["sessions", "exercises", "sets", "templates"].flatMap((collection) => ([
    {
      name: `${collection}-at-boundary`,
      collection,
      count: BACKUP_BOUNDARIES[collection],
      expected: "accepted"
    },
    {
      name: `${collection}-over-boundary`,
      collection,
      count: BACKUP_BOUNDARIES[collection] + 1,
      expected: "rejected"
    }
  ]));
}

function buildEntityCollectionCase({ collection, count, name }) {
  const state = validFullState();
  state.sessions[0].title = `Synthetic ${name}`;
  if (collection === "sessions") {
    state.sessions = Array.from({ length: count }, (_, index) => ({
      ...state.sessions[0],
      id: generatedId(1, index),
      title: index === 0 ? `Synthetic ${name}` : `Synthetic session ${index}`
    }));
    state.exercises[0].sessionId = state.sessions[0].id;
  } else if (collection === "exercises") {
    state.exercises = Array.from({ length: count }, (_, index) => ({
      ...state.exercises[0],
      id: generatedId(2, index),
      name: `Synthetic exercise ${index}`,
      order: index
    }));
    state.sets[0].exerciseId = state.exercises[0].id;
  } else if (collection === "sets") {
    state.exercises = Array.from({ length: Math.ceil(count / 20) }, (_, index) => ({
      ...state.exercises[0],
      id: generatedId(5, index),
      name: `Synthetic set-owner exercise ${index}`,
      order: index
    }));
    state.sets = Array.from({ length: count }, (_, index) => ({
      ...state.sets[0],
      id: generatedId(3, index),
      exerciseId: state.exercises[Math.floor(index / 20)].id,
      setNumber: (index % 20) + 1,
      sequenceIndex: index % 20
    }));
  } else if (collection === "templates") {
    state.templates = Array.from({ length: count }, (_, index) => ({
      ...state.templates[0],
      id: generatedId(4, index),
      name: `Synthetic template ${index}`,
      exercises: index === 0 ? state.templates[0].exercises : []
    }));
  } else {
    throw new Error(`Unsupported synthetic entity collection: ${collection}`);
  }
  return state;
}

function nestedArrayAtJsonDepth(depth) {
  let value = "synthetic-depth-leaf";
  for (let level = 0; level < depth; level += 1) value = [value];
  return value;
}

function jsonShapeCases() {
  const widthBoundary = Object.fromEntries(Array.from(
    { length: BACKUP_BOUNDARIES.objectKeys },
    (_, index) => [`syntheticKey${String(index).padStart(3, "0")}`, index]
  ));
  const widthOverflow = Object.fromEntries(Array.from(
    { length: BACKUP_BOUNDARIES.objectKeys + 1 },
    (_, index) => [`syntheticKey${String(index).padStart(3, "0")}`, index]
  ));

  return [
    { name: "json-depth-at-boundary", expected: "accepted", value: nestedArrayAtJsonDepth(BACKUP_BOUNDARIES.jsonDepth) },
    { name: "json-depth-over-boundary", expected: "rejected", value: nestedArrayAtJsonDepth(BACKUP_BOUNDARIES.jsonDepth + 1) },
    { name: "object-width-at-boundary", expected: "accepted", value: widthBoundary },
    { name: "object-width-over-boundary", expected: "rejected", value: widthOverflow }
  ];
}

function hostileCases() {
  const duplicate = validFullState();
  duplicate.sessions.push({ ...duplicate.sessions[0], title: "Duplicate ID" });

  const duplicateExercise = validFullState();
  duplicateExercise.sessions[0].title = "Duplicate Exercise ID";
  duplicateExercise.exercises.push({ ...duplicateExercise.exercises[0], name: "Duplicate Exercise" });

  const duplicateSet = validFullState();
  duplicateSet.sessions[0].title = "Duplicate Set ID";
  duplicateSet.sets.push({ ...duplicateSet.sets[0], setNumber: 2 });

  const duplicateTemplate = validFullState();
  duplicateTemplate.sessions[0].title = "Duplicate Template ID";
  duplicateTemplate.templates.push({ ...duplicateTemplate.templates[0], name: "Duplicate Template" });

  const duplicateTemplateExercise = validFullState();
  duplicateTemplateExercise.sessions[0].title = "Duplicate Template Exercise ID";
  duplicateTemplateExercise.templates[0].exercises.push({
    ...duplicateTemplateExercise.templates[0].exercises[0],
    name: "Duplicate Template Exercise"
  });

  const duplicateTemplateExerciseAcrossTemplates = validFullState();
  duplicateTemplateExerciseAcrossTemplates.sessions[0].title = "Cross Template Exercise ID";
  duplicateTemplateExerciseAcrossTemplates.templates.push({
    ...duplicateTemplateExerciseAcrossTemplates.templates[0],
    id: "66666666-6666-4666-8666-666666666666",
    name: "Second Synthetic Template",
    exercises: [{ ...duplicateTemplateExerciseAcrossTemplates.templates[0].exercises[0] }]
  });

  const orphanExercise = validFullState();
  orphanExercise.sessions[0].title = "Orphan Exercise Attempt";
  orphanExercise.exercises[0].sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  const orphanSet = validFullState();
  orphanSet.sessions[0].title = "Orphan Set Attempt";
  orphanSet.sets[0].exerciseId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const orphanActiveMesocycle = validFullState();
  orphanActiveMesocycle.sessions[0].title = "Orphan Active Mesocycle Attempt";
  orphanActiveMesocycle.activeMesocycleId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  const orphanTemplateReference = validFullState();
  orphanTemplateReference.sessions[0].title = "Orphan Template Reference Attempt";
  orphanTemplateReference.sessions[0].templateId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  const unsupportedVersion = validFullState();
  unsupportedVersion.sessions[0].title = "Unsupported Version Attempt";
  unsupportedVersion.appDataVersion = 999;

  const malformedVersion = validFullState();
  malformedVersion.sessions[0].title = "Malformed Version Attempt";
  malformedVersion.appDataVersion = "two";

  const executableKey = validFullState();
  executableKey.sessions[0].title = "Executable Key Attempt";
  executableKey.exercises[0].onfocus = "window.__HOSTILE_BACKUP_EXECUTED__=1";

  const prototypeJson = JSON.stringify(validFullState()).replace(
    /^{/,
    '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},'
  );

  return [
    { name: "duplicate-session-ids", value: duplicate },
    { name: "duplicate-exercise-ids", value: duplicateExercise },
    { name: "duplicate-set-ids", value: duplicateSet },
    { name: "duplicate-template-ids", value: duplicateTemplate },
    { name: "duplicate-template-exercise-ids", value: duplicateTemplateExercise },
    { name: "duplicate-template-exercise-ids-across-templates", value: duplicateTemplateExerciseAcrossTemplates },
    { name: "orphan-exercise", value: orphanExercise },
    { name: "orphan-set", value: orphanSet },
    { name: "orphan-active-mesocycle", value: orphanActiveMesocycle },
    { name: "orphan-template-reference", value: orphanTemplateReference },
    { name: "unsupported-version", value: unsupportedVersion },
    { name: "malformed-version", value: malformedVersion },
    { name: "executable-key", value: executableKey },
    { name: "prototype-key", raw: prototypeJson }
  ];
}

module.exports = {
  BACKUP_BOUNDARIES,
  IDS,
  buildEntityCollectionCase,
  entityCollectionCases,
  entityScopedUniquenessState,
  hostileCases,
  jsonShapeCases,
  legacyState,
  safetyWorkoutState,
  validFullState
};
