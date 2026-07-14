"use strict";

const IDS = Object.freeze({
  session: "11111111-1111-4111-8111-111111111111",
  exercise: "22222222-2222-4222-8222-222222222222",
  set: "33333333-3333-4333-8333-333333333333",
  template: "44444444-4444-4444-8444-444444444444",
  templateExercise: "55555555-5555-4555-8555-555555555555"
});

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

  const oversized = validFullState();
  oversized.sessions[0].title = "Oversized Backup Attempt";
  oversized.padding = "x".repeat(12 * 1024 * 1024);

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
    { name: "prototype-key", raw: prototypeJson },
    { name: "oversized", value: oversized }
  ];
}

module.exports = { IDS, entityScopedUniquenessState, hostileCases, legacyState, validFullState };
