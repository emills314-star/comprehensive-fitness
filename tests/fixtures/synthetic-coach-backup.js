"use strict";

const coach = require("../../coach-engine.js");

function syntheticCoachBackup() {
  const createdAt = "2026-11-02T18:00:00.000Z";
  const prescription = coach.prescribeSession({
    sessionId: "coach-session",
    evaluationId: "synthetic-evaluation",
    createdAt,
    date: "2026-11-02",
    exercises: [{
      exerciseId: "coach-exercise",
      variantIdentity: "synthetic-press:external",
      resistanceType: "external",
      targetVersion: "synthetic-role-targets/1",
      roles: [{
        role: "straight", S: 2, rMin: 8, rMax: 12, eMin: 7, eMax: 9,
        restSeconds: 120, increment: { value: 5, unit: "lb" },
        defaultLoad: { value: 100, unit: "lb" }, defaultReps: 10
      }],
      sets: [0, 1].map((position) => ({
        setId: "coach-set-" + (position + 1), role: "straight", position, sequenceIndex: position
      })),
      history: []
    }]
  });
  const revised = coach.reviseAfterSet(prescription, {
    at: "2026-11-02T18:02:00.000Z",
    sets: [{
      setId: "coach-set-1", completed: true, load: 100, unit: "lb", reps: 8,
      rpe: 10, rpeSource: "typed", completionOrder: 1
    }]
  }, "coach-set-1");
  return {
    appDataVersion: 3, domainMigrationVersion: 4, dataRevision: 2,
    sessions: [{
      id: "coach-session", date: "2026-11-02", title: "Synthetic Coach Workout",
      templateId: "coach-routine", isDeload: true,
      coachingPrescription: revised,
      coachingSuspensions: [
        { scope: "session", reason: "readiness_changed", at: "2026-11-02T18:03:00.000Z" },
        { scope: "exercise", exerciseId: "coach-exercise", reason: "deload_changed", at: "2026-11-02T18:04:00.000Z" }
      ]
    }],
    exercises: [{ id: "coach-exercise", sessionId: "coach-session", name: "Synthetic Press", order: 0 }],
    sets: [{
      id: "coach-set-1", exerciseId: "coach-exercise", setNumber: 1, setType: "straight",
      weight: 100, weightUnit: "lb", reps: 8, rpe: 10, completed: true,
      loadSource: "entered", repsSource: "prefill_previous", rpeSource: "typed",
      completionOrder: 1, completedAt: "2026-11-02T18:02:00.000Z",
      loadTouched: true, repsTouched: false, rpeTouched: true
    }, {
      id: "coach-set-2", exerciseId: "coach-exercise", setNumber: 2, setType: "straight",
      weight: 100, weightUnit: "lb", reps: 9, rpe: "", completed: false,
      loadSource: "accepted_target", repsSource: "entered", rpeSource: "unknown",
      loadTouched: false, repsTouched: true, rpeTouched: false
    }],
    templates: [{
      id: "coach-routine", name: "Synthetic Coach Routine", scheduledWeekdays: ["tuesday", "friday"],
      exercises: [{
        id: "coach-template-exercise", name: "Synthetic Press", sets: 2, repMin: 8, repMax: 12,
        restSeconds: 90, defaultLoad: 100, defaultReps: 10, weightUnit: "lb", warmups: [],
        setTypes: [{
          id: "coach-role", type: "straight", setCount: 2, repMin: 8, repMax: 12,
          rpeMin: 7, rpeMax: 9, increment: 5, incrementUnit: "lb", restSeconds: 120,
          defaultLoad: { value: 100, unit: "lb" }, targetLoad: 100, defaultReps: 10, weight: 100, weightUnit: "lb", reps: 10
        }]
      }]
    }],
    skippedSessions: [{
      id: "coach-injury-skip", date: "2026-11-03", routineId: "coach-routine", routineName: "Synthetic Coach Routine", dayId: "tuesday",
      reason: "injury", note: "Synthetic injury skip", createdAt: "2026-11-03T12:00:00.000Z"
    }],
    settings: {
      weightUnit: "lb", coachMode: "show", coachBetweenSetRevisions: false,
      routineIncrementUnit: "kg", barWeight: { lb: 45, kg: 20 },
      plateInventory: { lb: [45, 10, 2.5], kg: [] },
      equipmentCorrections: [{ exerciseIdentity: "synthetic-press:external", equipmentClass: "barbell" }]
    },
    rawImports: [], migrationAudit: []
  };
}

module.exports = { syntheticCoachBackup };
