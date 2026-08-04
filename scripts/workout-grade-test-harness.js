"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const historySource = fs.readFileSync(path.join(root, "app-history.js"), "utf8");
const engineEnd = historySource.indexOf("// WORKOUT_GRADING_ENGINE_END");
assert.notEqual(engineEnd, -1, "Workout grading engine end marker must remain available for focused tests");
const engineSource = historySource.slice(0, engineEnd);

function normalizedRole(setType, isWarmup) {
  if (isWarmup || String(setType || "").toLowerCase() === "warmup") return "warmup";
  const value = String(setType || "working").toLowerCase().replaceAll("-", "_");
  if (["backoff", "back_off"].includes(value)) return "backoff";
  if (["drop", "drop_set"].includes(value)) return "drop";
  return "working";
}

function buildGradeHarness(seed = {}) {
  const data = {
    sessions: structuredClone(seed.sessions || []),
    exercises: structuredClone(seed.exercises || []),
    sets: structuredClone(seed.sets || []),
    settings: { weightUnit: "lb", ...(seed.settings || {}) }
  };
  const context = vm.createContext({
    console,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    Date,
    data,
    canonicalExerciseId(value) {
      if (typeof value === "object") {
        return String(value?.performanceExerciseId || value?.canonicalId || value?.name || "")
          .trim()
          .toLowerCase()
          .replace(/\W+/g, "-");
      }
      return String(value || "").trim().toLowerCase().replace(/\W+/g, "-");
    },
    activeHistorySessions({ throughDate } = {}) {
      return data.sessions.filter((session) =>
        session.submitted
        && (!throughDate || String(session.date || "") <= String(throughDate))
      );
    },
    isSessionSubmitted(session) {
      return Boolean(session?.submitted || session?.submittedAt);
    },
    normalizeSetTypeCode: normalizedRole,
    setTypeSemantics(set) {
      const type = normalizedRole(set?.setType, set?.isWarmup);
      return { type, isWarmup: type === "warmup" };
    },
    resistanceTypeFor(exercise) {
      return exercise?.resistanceType || "external";
    },
    resistanceLoad(set) {
      return Number(set?.weight ?? set?.load ?? 0);
    },
    resistanceLoadInUnit(set) {
      const load = Number(set?.weight ?? set?.load ?? 0);
      const fromUnit = set?.weightUnit === "kg" || set?.weightUnit === "lb" ? set.weightUnit : data.settings.weightUnit;
      if (fromUnit === data.settings.weightUnit) return load;
      const converted = fromUnit === "kg" ? load * 2.2046226218 : load / 2.2046226218;
      return data.settings.weightUnit === "lb" ? Math.round(converted * 2) / 2 : Number(converted.toFixed(3));
    },
    isWorkingSet(set) {
      return normalizedRole(set?.setType, set?.isWarmup) !== "warmup";
    },
    setsForExercise(exerciseId) {
      return data.sets.filter((set) => set.exerciseId === exerciseId);
    },
    samePerformanceExercise(left, right) {
      const identity = (exercise) => String(
        exercise?.performanceExerciseId || exercise?.canonicalId || exercise?.name || ""
      ).trim().toLowerCase();
      return Boolean(identity(left) && identity(left) === identity(right));
    },
    formatLoadNumber(value) {
      return String(Number(value));
    },
    formatSetPerformance(set, exercise) {
      const type = exercise?.resistanceType || "external";
      if (type === "duration") return `${Number(set.durationSeconds || 0)} sec`;
      if (type === "distance") return `${Number(set.distance || 0)} distance`;
      return `${Number(set.weight ?? set.load ?? 0)} lb × ${Number(set.reps || 0)}`;
    },
    isoNow() {
      return "2026-07-31T12:00:00.000Z";
    }
  });
  vm.runInContext(engineSource, context);
  return { context, data, engineSource, historySource };
}

module.exports = { buildGradeHarness, engineSource, historySource, normalizedRole, root };
