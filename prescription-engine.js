/*
 * Comprehensive Fitness unified training-prescription engine.
 *
 * This file deliberately contains no personal fitness records. Callers supply
 * personal/protected aggregates and the public research database through the
 * adapters below. The UMD wrapper keeps the same implementation available to
 * the static browser app and to Node-based validation scripts.
 */
(function prescriptionEngineUmd(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ComprehensiveFitnessPrescriptionEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function prescriptionEngineFactory() {
  "use strict";

  const ENGINE_VERSION = "3.1.11";
  const PRESCRIPTION_SCHEMA_VERSION = "2.1.0";
  const SNAPSHOT_SCHEMA_VERSION = "1.1.0";
  const HARD_SAFETY_SCHEMA_VERSION = "hard-safety/1.0.0";
  const SNAPSHOT_CHECKSUM_PATTERN = /^[0-9a-f]{8}$/;
  const HISTORY_STORAGE_KEY = "comprehensiveFitness.recommendationHistory.v1";

  const MESOCYCLE_TYPES = Object.freeze({
    PRIMARY: "primary_progression",
    ALTERNATIVE: "alternative_exercise",
    LOWER_FATIGUE: "lower_fatigue_resensitization",
    SPECIALIZATION: "specialization"
  });

  const STALENESS = Object.freeze({
    PRODUCTIVE: "productive",
    APPROACHING_PLATEAU: "productive_approaching_plateau",
    STALLED: "stalled",
    REGRESSING: "regressing",
    EXCESSIVELY_FATIGUING: "excessively_fatiguing",
    ROTATION_CANDIDATE: "candidate_for_rotation",
    INSUFFICIENT: "insufficient_evidence"
  });

  const RECOMMENDATION_TYPES = Object.freeze([
    "normal",
    "progress",
    "hold",
    "reduce_volume",
    "light_session",
    "exercise_deload",
    "muscle_group_deload",
    "full_program_deload",
    "substitute",
    "rotate_exercise"
  ]);

  const HARD_SAFETY_PROGRESSION_ACTIONS = Object.freeze(new Set([
    "hold_for_pain_free_modification",
    "hold_for_pain_free_substitution",
    "hold_for_technique",
    "stop_for_illness"
  ]));

  const ROLES = Object.freeze([
    "primary_progression_lift",
    "secondary_hypertrophy_lift",
    "low_fatigue_accessory",
    "maintenance_lift",
    "deload_variation"
  ]);

  const SET_STRUCTURES = Object.freeze([
    "straight_sets",
    "top_set_backoff",
    "multiple_top_sets",
    "single_working_set",
    "custom"
  ]);

  const DEFAULT_POLICY = Object.freeze({
    minimumComparableExposures: 3,
    moderateComparableExposures: 5,
    highComparableExposures: 8,
    personalWeightCap: 0.9,
    plateauWindow: 3,
    regressionWindow: 2,
    candidatePoolSize: 5,
    minimumRepRangeWidth: 2,
    backoffReduction: { min: 8, target: 12, max: 18 },
    maximumRepLossPercent: 25,
    maximumBackoffLoadReductionPercent: 30,
    deloadVolumeFactor: 0.5,
    lowerFatigueVolumeFactor: 0.72,
    specializationVolumeFactor: 1.2,
    recentExerciseWindowDays: 56,
    maximumReturnGapDays: 56,
    sessionDurationTargetMinutes: 75,
    sessionDurationMaximumMinutes: 100,
    maximumHighFatigueCompoundsPerSession: 3,
    maximumExercisesPerSession: 8,
    absoluteMaximumExercisesPerSession: 10,
    maximumWorkingSetsPerSession: 18,
    absoluteMaximumWorkingSetsPerSession: 18,
    maximumExercisesPerMusclePerSession: 2,
    maximumSessionSpinalLoad: 180,
    maximumSessionGripDemand: 190
  });

  const MAJOR_PROGRAM_MUSCLES = Object.freeze(new Set(["chest", "upper_back", "lats", "quads", "hamstrings", "glutes", "front_delts", "side_delts", "rear_delts"]));

  const CONFIDENCE_SCORE = Object.freeze({
    very_high: 95,
    high: 85,
    moderate: 70,
    low: 52,
    very_low: 35,
    insufficient_personal_evidence: 20,
    "high confidence": 85,
    "moderate confidence": 65,
    "low confidence": 40
  });

  function number(value, fallback = 0) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function nullableNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizedBoolean(value, fallback = null) {
    if (value === true || value === false) return value;
    if (value === 1 || value === 0) return value === 1;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "n", "off", ""].includes(normalized)) return false;
    }
    return fallback;
  }

  function anyExplicitTrue(...values) {
    return values.some((value) => normalizedBoolean(value, false) === true);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, number(value)));
  }

  function round(value, places = 2) {
    const scale = 10 ** places;
    return Math.round((number(value) + Number.EPSILON) * scale) / scale;
  }

  function average(values, fallback = 0) {
    const valid = values.map(nullableNumber).filter((value) => value !== null);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : fallback;
  }

  function sum(values) {
    return values.reduce((total, value) => total + number(value), 0);
  }

  function deepClone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined) return [];
    return [value];
  }

  function splitMulti(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value !== "string") return value ? [value] : [];
    const text = value.trim();
    if (!text) return [];
    if (text[0] === "[") {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (_error) {
        // Continue with delimiter parsing.
      }
    }
    return text.split(/[|;,]/).map((part) => part.trim()).filter(Boolean);
  }

  function unique(values) {
    return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function normalizeMuscleId(value) {
    return normalizeText(value).replace(/^mg_/, "");
  }

  function muscleFamily(value) {
    const muscle = normalizeMuscleId(value);
    if (muscle.startsWith("chest")) return "chest";
    if (muscle.includes("latissimus") || muscle === "lats") return "lats";
    if (muscle.includes("upper_back") || muscle.includes("rhomboid")) return "upper_back";
    if (muscle.startsWith("quad")) return "quads";
    if (muscle.startsWith("hamstring")) return "hamstrings";
    if (muscle.startsWith("glute")) return "glutes";
    if (muscle.includes("abdominal") || muscle === "abs") return "abs";
    if (muscle.includes("neck")) return "neck";
    return muscle;
  }

  function isoNow(clock) {
    const value = typeof clock === "function" ? clock() : new Date();
    return (value instanceof Date ? value : new Date(value)).toISOString();
  }

  function dateOnly(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
  }

  function stableHash(value) {
    const text = typeof value === "string" ? value : stableStringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function confidenceValue(value, fallback = 55) {
    if (typeof value === "number") return value <= 1 ? value * 100 : value;
    const key = String(value || "").toLowerCase();
    return CONFIDENCE_SCORE[key] || fallback;
  }

  function mapBy(items, selector) {
    const result = new Map();
    items.forEach((item) => {
      const key = selector(item);
      if (key !== null && key !== undefined && key !== "") result.set(key, item);
    });
    return result;
  }

  function groupBy(items, selector) {
    const result = new Map();
    items.forEach((item) => {
      const key = selector(item);
      if (key === null || key === undefined || key === "") return;
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(item);
    });
    return result;
  }

  function table(source, ...names) {
    for (const name of names) {
      if (Array.isArray(source?.[name])) return source[name];
    }
    return [];
  }

  function firstPresent(...values) {
    return values.find((value) => value !== null && value !== undefined && value !== "");
  }

  function normalizeRange(raw, fallback = null, integer = false) {
    if (!raw && !fallback) return null;
    const source = raw || fallback || {};
    const min = nullableNumber(firstPresent(source.min, source.low, source.minimum));
    const max = nullableNumber(firstPresent(source.max, source.high, source.maximum));
    if (min === null && max === null) return fallback ? normalizeRange(fallback, null, integer) : null;
    const resolvedMin = min === null ? max : min;
    const resolvedMax = max === null ? min : max;
    return {
      min: integer ? Math.round(Math.min(resolvedMin, resolvedMax)) : round(Math.min(resolvedMin, resolvedMax), 2),
      max: integer ? Math.round(Math.max(resolvedMin, resolvedMax)) : round(Math.max(resolvedMin, resolvedMax), 2)
    };
  }

  function targetRange(range, integer = false) {
    if (!range) return null;
    const target = (number(range.min) + number(range.max)) / 2;
    return { ...range, target: integer ? Math.round(target) : round(target, 1) };
  }

  function blendRange(personal, research, personalWeight, options = {}) {
    const personalRange = normalizeRange(personal, null, options.integer);
    const researchRange = normalizeRange(research, null, options.integer);
    if (!personalRange) return targetRange(researchRange, options.integer);
    if (!researchRange) return targetRange(personalRange, options.integer);
    const weight = clamp(personalWeight, 0, 1);
    let min = personalRange.min * weight + researchRange.min * (1 - weight);
    let max = personalRange.max * weight + researchRange.max * (1 - weight);
    if (options.integer) {
      min = Math.round(min);
      max = Math.round(max);
    } else {
      min = round(min, 1);
      max = round(max, 1);
    }
    const minimumWidth = number(options.minimumWidth, 0);
    if (max - min < minimumWidth) {
      const center = (min + max) / 2;
      min = center - minimumWidth / 2;
      max = center + minimumWidth / 2;
      if (options.integer) {
        min = Math.floor(min);
        max = Math.ceil(max);
      }
    }
    if (Number.isFinite(options.floor)) min = Math.max(options.floor, min);
    if (Number.isFinite(options.ceiling)) max = Math.min(options.ceiling, max);
    if (max < min) max = min;
    return targetRange({ min, max }, options.integer);
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < String(text || "").length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') quoted = false;
        else field += character;
      } else if (character === '"') quoted = true;
      else if (character === ",") {
        row.push(field);
        field = "";
      } else if (character === "\n") {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        field = "";
      } else field += character;
    }
    if (field || row.length) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
    }
    const headers = rows.shift() || [];
    return rows.filter((values) => values.some((value) => value !== "")).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  }

  function createPersonalDataAdapter(source = {}) {
    const exercisePrescriptions = table(source, "exercisePrescriptions", "exercise_prescriptions");
    const exerciseScores = table(source, "exerciseScores", "exercise_scores");
    const exerciseMuscleScores = table(source, "exerciseMuscleScores", "exercise_muscle_scores");
    const exerciseSessionMetrics = table(source, "exerciseSessionMetrics", "exercise_session_metrics");
    const weeklyMuscleVolumeResponse = table(source, "weeklyMuscleVolumeResponse", "weekly_muscle_volume_response");
    const recoveryRules = table(source, "recoveryRules", "recovery_rules");
    const muscleGroupSweetSpots = table(source, "muscleGroupSweetSpots", "muscle_group_sweet_spots");
    const metadata = source.metadata || source.analysisMetadata || source.analysis_metadata || {};

    const scoreByExercise = mapBy(exerciseScores, (item) => item.exercise_id || item.exerciseId);
    const prescriptionsByExercise = groupBy(exercisePrescriptions, (item) => item.exercise_id || item.exerciseId);
    const muscleScoresByExercise = groupBy(exerciseMuscleScores, (item) => item.exercise_id || item.exerciseId);
    const sessionsByExercise = groupBy(exerciseSessionMetrics, (item) => item.exercise_id || item.exerciseId);
    const volumeByMuscle = groupBy(weeklyMuscleVolumeResponse, (item) => normalizeMuscleId(item.muscle_group || item.muscleGroup));
    const sweetSpotByMuscle = mapBy(muscleGroupSweetSpots, (item) => normalizeMuscleId(item.muscle_group_id || item.muscle_group || item.muscleGroupId));
    const crosswalkByPersonalId = new Map();
    const personalIdsByResearchId = new Map();

    [...exerciseScores, ...exercisePrescriptions].forEach((item) => {
      const personalId = item.exercise_id || item.exerciseId;
      const researchId = item.research_exercise_id || item.researchExerciseId;
      if (!personalId || !researchId) return;
      crosswalkByPersonalId.set(personalId, researchId);
      if (!personalIdsByResearchId.has(researchId)) personalIdsByResearchId.set(researchId, []);
      if (!personalIdsByResearchId.get(researchId).includes(personalId)) personalIdsByResearchId.get(researchId).push(personalId);
    });

    function prescriptionsFor(exerciseId, muscleGroupId) {
      const records = prescriptionsByExercise.get(exerciseId) || [];
      if (!muscleGroupId) return records;
      const requested = normalizeMuscleId(muscleGroupId);
      return records.filter((item) => {
        const personalMuscle = normalizeMuscleId(item.muscle_group_id || item.muscleGroupId);
        const researchMuscle = normalizeMuscleId(item.research_muscle_group_id || item.researchMuscleGroupId);
        return personalMuscle === requested || researchMuscle === requested || personalMuscle.startsWith(requested) || requested.startsWith(personalMuscle);
      });
    }

    function muscleScoresFor(exerciseId, muscleGroupId) {
      const records = muscleScoresByExercise.get(exerciseId) || [];
      if (!muscleGroupId) return records;
      const requested = normalizeMuscleId(muscleGroupId);
      return records.filter((item) => {
        const muscle = normalizeMuscleId(item.muscle_group || item.muscleGroup || item.research_muscle_group_id);
        return muscle === requested || muscle.startsWith(requested) || requested.startsWith(muscle);
      });
    }

    return {
      kind: "personal_evidence_adapter",
      raw: source,
      metadata,
      version: metadata.methodology_version || metadata.pipeline_version || source.version || "unknown",
      exercisePrescriptions,
      exerciseScores,
      exerciseMuscleScores,
      exerciseSessionMetrics,
      weeklyMuscleVolumeResponse,
      recoveryRules,
      muscleGroupSweetSpots,
      scoreByExercise,
      prescriptionsByExercise,
      muscleScoresByExercise,
      sessionsByExercise,
      volumeByMuscle,
      sweetSpotByMuscle,
      crosswalkByPersonalId,
      personalIdsByResearchId,
      prescriptionsFor,
      muscleScoresFor,
      historyFor(exerciseId) { return sessionsByExercise.get(exerciseId) || []; }
    };
  }

  function createResearchDataAdapter(source = {}) {
    const exerciseDatabase = table(source, "exerciseDatabase", "exercise_database");
    const exerciseMuscleMap = table(source, "exerciseMuscleMap", "exercise_muscle_map");
    const exerciseSubstitutionMap = table(source, "exerciseSubstitutionMap", "exercise_substitution_map");
    const muscleGroupRecommendations = table(source, "muscleGroupRecommendations", "muscle_group_recommendations");
    const progressionRules = table(source, "progressionRules", "progression_rules");
    const nutritionStrategies = table(source, "nutritionStrategies", "nutrition_strategies");
    const manifest = source.manifest || {};
    const exerciseById = mapBy(exerciseDatabase, (item) => item.exercise_id || item.exerciseId);
    const muscleMapsByExercise = groupBy(exerciseMuscleMap, (item) => item.exercise_id || item.exerciseId);
    const muscleMapsByMuscle = groupBy(exerciseMuscleMap, (item) => item.muscle_group_id || item.muscleGroupId);
    const substitutionsByExercise = groupBy(exerciseSubstitutionMap, (item) => item.exercise_id || item.exerciseId);
    const muscleRecommendationById = mapBy(muscleGroupRecommendations, (item) => item.muscle_group_id || item.muscleGroupId);
    const exerciseIdByAlias = new Map();
    exerciseDatabase.forEach((exercise) => {
      const exerciseId = exercise.exercise_id || exercise.exerciseId;
      [exercise.exercise_name, exercise.exerciseName, ...splitMulti(exercise.exercise_aliases || exercise.exerciseAliases)].forEach((name) => {
        const alias = normalizeText(name);
        if (alias && !exerciseIdByAlias.has(alias)) exerciseIdByAlias.set(alias, exerciseId);
      });
    });

    function muscleRecommendationsFor(muscleGroupId) {
      const requested = normalizeMuscleId(muscleGroupId);
      return muscleGroupRecommendations.filter((item) => {
        const id = normalizeMuscleId(item.muscle_group_id || item.muscleGroupId);
        const group = normalizeMuscleId(item.muscle_group || item.muscleGroup);
        return id === requested || group === requested || id.startsWith(`${requested}_`) || requested.startsWith(`${group}_`);
      });
    }

    function exerciseTargetsMuscle(exerciseId, muscleGroupId) {
      const requested = normalizeMuscleId(muscleGroupId);
      return (muscleMapsByExercise.get(exerciseId) || []).some((mapping) => {
        if (number(mapping.fractional_set_credit ?? mapping.fractionalSetCredit, 0) <= 0) return false;
        const mapped = normalizeMuscleId(mapping.muscle_group_id || mapping.muscleGroupId);
        const rec = muscleRecommendationById.get(mapping.muscle_group_id || mapping.muscleGroupId);
        const category = normalizeMuscleId(rec?.muscle_group || rec?.muscleGroup);
        return mapped === requested || category === requested || mapped.startsWith(`${requested}_`);
      });
    }

    return {
      kind: "research_evidence_adapter",
      raw: source,
      manifest,
      version: manifest.database_version || source.databaseVersion || source.version || "unknown",
      exerciseDatabase,
      exerciseMuscleMap,
      exerciseSubstitutionMap,
      muscleGroupRecommendations,
      progressionRules,
      nutritionStrategies,
      exerciseById,
      muscleMapsByExercise,
      muscleMapsByMuscle,
      substitutionsByExercise,
      muscleRecommendationById,
      exerciseIdByAlias,
      muscleRecommendationsFor,
      exerciseTargetsMuscle
    };
  }

  function normalizeEvidenceBundle(input = {}) {
    const personal = input.personal?.kind === "personal_evidence_adapter" ? input.personal : createPersonalDataAdapter(input.personalData || input.personal || {});
    const research = input.research?.kind === "research_evidence_adapter" ? input.research : createResearchDataAdapter(input.researchData || input.research || {});
    const reconciledPersonalIdentities = buildReconciledPersonalIdentityIndex(personal, research);
    personal.reconciledIdentityByExerciseId = reconciledPersonalIdentities.identities;
    personal.reconciledPersonalIdsByResearchId = reconciledPersonalIdentities.personalIdsByResearchId;
    personal.selectedPersonalIdByResearchId = reconciledPersonalIdentities.selectedPersonalIdByResearchId;
    personal.crosswalkByPersonalId.clear();
    personal.personalIdsByResearchId.clear();
    reconciledPersonalIdentities.identities.forEach((identity, exerciseId) => {
      if (!identity.invalid && identity.researchExerciseId) personal.crosswalkByPersonalId.set(exerciseId, identity.researchExerciseId);
    });
    reconciledPersonalIdentities.personalIdsByResearchId.forEach((exerciseIds, researchExerciseId) => {
      personal.personalIdsByResearchId.set(researchExerciseId, [...exerciseIds]);
    });
    return {
      personal,
      research,
      versions: {
        engine: ENGINE_VERSION,
        personal: input.personalDataVersion || personal.version,
        research: input.researchDatabaseVersion || research.version
      }
    };
  }

  function loadEvidenceFromFiles(rootDirectory, options = {}) {
    if (typeof require !== "function") throw new Error("loadEvidenceFromFiles is available only in a CommonJS/Node environment.");
    const fs = require("fs");
    const path = require("path");
    const readJson = (relative, fallback) => {
      const file = path.join(rootDirectory, relative);
      return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
    };
    const readCsv = (relative) => {
      const file = path.join(rootDirectory, relative);
      return fs.existsSync(file) ? parseCsv(fs.readFileSync(file, "utf8")) : [];
    };
    const personalData = {
      exercisePrescriptions: readJson("personal_fitness_data/derived/exercise_prescriptions.json", []),
      exerciseScores: readCsv("personal_fitness_data/derived/exercise_scores.csv"),
      exerciseMuscleScores: readCsv("personal_fitness_data/derived/exercise_muscle_scores.csv"),
      exerciseSessionMetrics: options.includeSessionMetrics === false ? [] : readCsv("personal_fitness_data/derived/exercise_session_metrics.csv"),
      weeklyMuscleVolumeResponse: options.includeWeeklyVolume === false ? [] : readCsv("personal_fitness_data/derived/weekly_muscle_volume_response.csv"),
      muscleGroupSweetSpots: readJson("personal_fitness_data/derived/muscle_group_sweet_spots.json", []),
      recoveryRules: readJson("personal_fitness_data/derived/recovery_rules.json", []),
      metadata: readJson("personal_fitness_data/reports/analysis_metadata.json", {})
    };
    const researchBase = "research_database/exports/json";
    const researchData = {
      exerciseDatabase: readJson(`${researchBase}/exercise_database.json`, []),
      exerciseMuscleMap: readJson(`${researchBase}/exercise_muscle_map.json`, []),
      exerciseSubstitutionMap: readJson(`${researchBase}/exercise_substitution_map.json`, []),
      muscleGroupRecommendations: readJson(`${researchBase}/muscle_group_recommendations.json`, []),
      progressionRules: readJson(`${researchBase}/progression_rules.json`, []),
      nutritionStrategies: readJson(`${researchBase}/nutrition_strategies.json`, []),
      manifest: readJson(`${researchBase}/manifest.json`, {})
    };
    return normalizeEvidenceBundle({ personalData, researchData });
  }

  async function loadEvidenceFromUrls(options = {}) {
    const fetchImpl = options.fetch || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw new Error("A fetch implementation is required.");
    const fetchJson = async (url, fallback, optional = false) => {
      if (!url) return fallback;
      const response = await fetchImpl(url, { credentials: options.credentials || "same-origin" });
      if (!response.ok) {
        if (optional && (response.status === 401 || response.status === 403 || response.status === 404)) return fallback;
        throw new Error(`Unable to load evidence (${response.status}) from ${url}`);
      }
      return response.json();
    };
    const fetchCsv = async (url, optional = false) => {
      if (!url) return [];
      const response = await fetchImpl(url, { credentials: options.credentials || "same-origin" });
      if (!response.ok) {
        if (optional && (response.status === 401 || response.status === 403 || response.status === 404)) return [];
        throw new Error(`Unable to load evidence (${response.status}) from ${url}`);
      }
      return parseCsv(await response.text());
    };
    const researchBase = String(options.researchBaseUrl || "research_database/exports/json").replace(/\/$/, "");
    const personalBase = options.personalBaseUrl ? String(options.personalBaseUrl).replace(/\/$/, "") : "";
    const [exerciseDatabase, exerciseMuscleMap, substitutionMap, muscleRecommendations, progressionRules, nutritionStrategies, manifest] = await Promise.all([
      fetchJson(`${researchBase}/exercise_database.json`, []),
      fetchJson(`${researchBase}/exercise_muscle_map.json`, []),
      fetchJson(`${researchBase}/exercise_substitution_map.json`, []),
      fetchJson(`${researchBase}/muscle_group_recommendations.json`, []),
      fetchJson(`${researchBase}/progression_rules.json`, []),
      fetchJson(`${researchBase}/nutrition_strategies.json`, []),
      fetchJson(`${researchBase}/manifest.json`, {})
    ]);
    let personalData = options.personalData || {};
    if (personalBase) {
      const [prescriptions, scores, muscleScores, sessionMetrics, weeklyVolume, recoveryRules, muscleSweetSpots, metadata] = await Promise.all([
        fetchJson(`${personalBase}/exercise_prescriptions.json`, [], true),
        fetchCsv(`${personalBase}/exercise_scores.csv`, true),
        fetchCsv(`${personalBase}/exercise_muscle_scores.csv`, true),
        options.includeSessionMetrics === false ? [] : fetchCsv(`${personalBase}/exercise_session_metrics.csv`, true),
        options.includeWeeklyVolume === false ? [] : fetchCsv(`${personalBase}/weekly_muscle_volume_response.csv`, true),
        fetchJson(`${personalBase}/recovery_rules.json`, [], true),
        fetchJson(`${personalBase}/muscle_group_sweet_spots.json`, [], true),
        fetchJson(`${personalBase}/analysis_metadata.json`, {}, true)
      ]);
      personalData = { exercisePrescriptions: prescriptions, exerciseScores: scores, exerciseMuscleScores: muscleScores, exerciseSessionMetrics: sessionMetrics, weeklyMuscleVolumeResponse: weeklyVolume, recoveryRules, muscleGroupSweetSpots: muscleSweetSpots, metadata };
    }
    return normalizeEvidenceBundle({
      personalData,
      researchData: { exerciseDatabase, exerciseMuscleMap, exerciseSubstitutionMap: substitutionMap, muscleGroupRecommendations: muscleRecommendations, progressionRules, nutritionStrategies, manifest }
    });
  }

  function dataFraction(value, fallback = 0) {
    const resolved = number(value, fallback);
    return clamp(resolved > 1 ? resolved / 100 : resolved, 0, 1);
  }

  function derivePersonalEvidenceMetrics(options = {}) {
    const score = options.score || {};
    const prescription = options.prescription || {};
    const muscleScore = options.muscleScore || {};
    const history = asArray(options.history);
    const comparableExposures = Math.max(
      number(options.comparableExposures),
      number(score.comparable_session_count || score.comparableSessionCount),
      history.filter((item) => !["", "baseline", "insufficient_data"].includes(String(item.progression_status || item.progressionStatus || ""))).length
    );
    const sessionCount = Math.max(number(options.sessionCount), number(score.session_count || score.sessionCount), number(prescription.sample_size || prescription.sampleSize), history.length);
    const observationSpanDays = Math.max(
      number(options.observationSpanDays),
      number(score.observation_span_days || score.observationSpanDays),
      history.length > 1 ? Math.max(0, (new Date(dateOnly(history.at(-1)?.workout_date || history.at(-1)?.date)).getTime() - new Date(dateOnly(history[0]?.workout_date || history[0]?.date)).getTime()) / 86400000) : 0
    );
    const rpeCompleteness = firstPresent(options.rpeCompleteness, score.rpe_completeness_pct, score.rpeCompletenessPct);
    const recoveryCompleteness = firstPresent(options.recoveryCompleteness, score.recovery_completeness_pct, score.recoveryCompletenessPct);
    const nutritionCompleteness = firstPresent(options.nutritionCompleteness, score.nutrition_completeness_pct, score.nutritionCompletenessPct);
    const variationConsistency = dataFraction(firstPresent(options.variationConsistency, score.variation_consistency, 0.9), 0.9);
    const muscleRole = String(muscleScore.muscle_role || muscleScore.muscleRole || options.muscleRole || "").toLowerCase();
    const muscleAttributionConfidence = dataFraction(firstPresent(
      options.muscleAttributionConfidence,
      muscleRole === "primary" ? 0.95 : muscleRole === "secondary" ? 0.65 : null,
      muscleScore.contribution_weight || muscleScore.contributionWeight,
      0.6
    ), 0.6);
    const regimeChanges = history.filter((item) => String(item.comparison_regime_change_flag || item.comparisonRegimeChangeFlag).toLowerCase() === "true").length;
    const programChangePenalty = clamp(firstPresent(options.programChangePenalty, history.length ? regimeChanges / history.length : 0), 0, 0.5);
    const limitationText = String(score.important_limitations || score.importantLimitations || prescription.notes || "").toLowerCase();
    const inferredConfounding = /shared by every exercise|cannot prove|confound/.test(limitationText) ? 0.12 : 0;
    const confoundingPenalty = clamp(firstPresent(options.confoundingPenalty, inferredConfounding), 0, 0.5);
    const statedConfidence = dataFraction(firstPresent(
      options.statedConfidence,
      score.data_confidence_score || score.dataConfidenceScore,
      prescription.confidence_score || prescription.confidenceScore,
      confidenceValue(score.confidence_level || prescription.confidence_level) / 100
    ), 0.5);
    const rpe = dataFraction(rpeCompleteness, history.length ? history.filter((item) => nullableNumber(item.average_rpe || item.averageRpe) !== null).length / history.length : 0);
    const recovery = dataFraction(recoveryCompleteness, history.length ? history.filter((item) => nullableNumber(item.recovery_strain_score || item.recoveryStrainScore) !== null).length / history.length : 0);
    const nutrition = dataFraction(nutritionCompleteness, history.length ? history.filter((item) => nullableNumber(item.observed_daily_calories || item.observedDailyCalories) !== null).length / history.length : 0);
    return {
      comparableExposures,
      sessionCount,
      observationSpanDays,
      statedConfidence,
      rpeCompleteness: rpe,
      recoveryCompleteness: recovery,
      nutritionCompleteness: nutrition,
      variationConsistency,
      muscleAttributionConfidence,
      confoundingPenalty,
      programChangePenalty
    };
  }

  function calculateEvidenceWeight(input = {}, policy = DEFAULT_POLICY) {
    const metrics = input.comparableExposures !== undefined && input.statedConfidence !== undefined
      ? input
      : derivePersonalEvidenceMetrics(input);
    const comparable = number(metrics.comparableExposures);
    if (comparable < number(policy.minimumComparableExposures, 3)) {
      return {
        personalEvidenceWeight: 0,
        researchEvidenceWeight: 1,
        confidence: "research_default",
        personalDataConfidence: round(number(metrics.statedConfidence) * 100, 1),
        factors: deepClone(metrics),
        weightingReason: `${comparable} comparable exposure${comparable === 1 ? "" : "s"} is below the ${policy.minimumComparableExposures} exposure minimum, so research defaults remain controlling.`
      };
    }
    const sampleAdequacy = clamp((comparable - 2) / 10, 0.12, 1);
    const durationAdequacy = clamp(number(metrics.observationSpanDays) / 168, 0.15, 1);
    const completeness = (
      dataFraction(metrics.rpeCompleteness) * 0.24 +
      dataFraction(metrics.recoveryCompleteness) * 0.24 +
      dataFraction(metrics.nutritionCompleteness) * 0.08 +
      dataFraction(metrics.variationConsistency, 0.75) * 0.2 +
      dataFraction(metrics.muscleAttributionConfidence, 0.6) * 0.24
    );
    const penalty = clamp(number(metrics.confoundingPenalty) + number(metrics.programChangePenalty), 0, 0.65);
    const support = sampleAdequacy * 0.48 + durationAdequacy * 0.14 + completeness * 0.23 + dataFraction(metrics.statedConfidence, 0.5) * 0.15;
    let personalWeight = clamp(support * (1 - penalty), 0.1, number(policy.personalWeightCap, 0.9));
    if (comparable < number(policy.moderateComparableExposures, 5)) personalWeight = Math.min(personalWeight, 0.32);
    if (comparable >= number(policy.highComparableExposures, 8) && completeness >= 0.65 && durationAdequacy >= 0.5) personalWeight = Math.max(personalWeight, 0.68);
    personalWeight = round(personalWeight, 3);
    const confidence = personalWeight >= 0.68 && comparable >= number(policy.highComparableExposures, 8)
      ? "high"
      : personalWeight >= 0.4 && comparable >= number(policy.moderateComparableExposures, 5)
        ? "moderate"
        : "low";
    return {
      personalEvidenceWeight: personalWeight,
      researchEvidenceWeight: round(1 - personalWeight, 3),
      confidence,
      personalDataConfidence: round(dataFraction(metrics.statedConfidence) * 100, 1),
      factors: deepClone(metrics),
      weightingReason: `${comparable} comparable exposures over ${Math.round(number(metrics.observationSpanDays))} days support a ${Math.round(personalWeight * 100)}% personal / ${Math.round((1 - personalWeight) * 100)}% research blend after completeness and confounding adjustments.`
    };
  }

  function normalizeHistory(history = []) {
    return asArray(history).map((item, index) => {
      const status = String(item.progression_status || item.progressionStatus || item.status || "").toLowerCase();
      const repetitions = splitMulti(item.set_repetitions || item.setRepetitions || item.reps).map(number);
      const rpes = splitMulti(item.set_rpes || item.setRpes).map((value) => nullableNumber(value)).filter((value) => value !== null);
      const loads = splitMulti(item.set_loads || item.setLoads).map(number);
      const completedSetCount = nullableNumber(firstPresent(item.completedSetCount, item.completed_set_count));
      const prescribedSetCount = nullableNumber(firstPresent(item.prescribedSetCount, item.prescribed_set_count, item.plannedSetCount, item.planned_set_count));
      const completedSetRatio = nullableNumber(firstPresent(item.completedSetRatio, item.completed_set_ratio, item.adherence));
      const techniqueValid = normalizedBoolean(firstPresent(item.techniqueValid, item.technique_valid), null);
      const techniqueQuality = normalizeText(firstPresent(item.techniqueQuality, item.technique_quality));
      return {
        raw: item,
        index,
        date: dateOnly(item.workout_date || item.date || item.createdAt),
        status,
        performance: nullableNumber(firstPresent(item.comparison_performance_value, item.comparisonPerformanceValue, item.performance_value, item.performanceValue, item.best_epley_e1rm, item.estimated1Rm, item.e1rm)),
        estimated1Rm: nullableNumber(firstPresent(item.best_epley_e1rm, item.estimated1Rm, item.e1rm, item.performance_value, item.performanceValue)),
        topSetPerformance: nullableNumber(firstPresent(item.top_set_performance_value, item.topSetPerformance, item.performance_value)),
        backoffPerformance: nullableNumber(firstPresent(item.backoff_performance_value, item.backoffPerformance)),
        averageRpe: nullableNumber(firstPresent(item.average_rpe, item.averageRpe, item.rpe, rpes.length ? average(rpes) : null)),
        repLossPercent: nullableNumber(firstPresent(item.max_set_rep_loss_pct, item.maxSetRepLossPct, item.repLossPercent)),
        loadReductionPercent: nullableNumber(firstPresent(item.max_set_load_reduction_pct, item.maxSetLoadReductionPct, item.loadReductionPercent)),
        recoveryCost: nullableNumber(firstPresent(item.recovery_strain_score, item.recoveryStrainScore, item.recoveryCost)),
        plateauExposures: number(item.plateau_duration_exposures || item.plateauExposures),
        regressionExposures: number(item.regression_duration_exposures || item.regressionExposures),
        pain: anyExplicitTrue(item.pain, item.discomfort, item.painReported, item.pain_reported),
        techniqueValid,
        techniqueQuality,
        completedSetCount,
        prescribedSetCount,
        incompletePrescribedWork: (completedSetRatio !== null && completedSetRatio < 0.999) || (completedSetCount !== null && prescribedSetCount !== null && completedSetCount < prescribedSetCount),
        adherence: completedSetRatio,
        reps: repetitions.length ? repetitions : asArray(item.reps).map(number),
        rpes,
        loads: loads.length ? loads : asArray(item.loads).map(number),
        setTypes: splitMulti(item.set_types || item.setTypes),
        topSetCount: number(item.top_set_count || item.topSetCount),
        backoffSetCount: number(item.back_off_set_count || item.backoffSetCount),
        straightSetCount: number(item.straight_working_set_count || item.straightSetCount),
        progressionPercent: nullableNumber(item.progression_pct_vs_prior || item.progressionPercent),
        prescribedReduction: anyExplicitTrue(item.prescribed_reduction, item.prescribedReduction) || /planned[_ -]?reduction|light[_ -]?session|deload/.test(status)
      };
    }).sort((left, right) => (left.date || "9999").localeCompare(right.date || "9999") || left.index - right.index);
  }

  function linearSlope(values) {
    const valid = values.map((value, index) => ({ x: index, y: nullableNumber(value) })).filter((item) => item.y !== null);
    if (valid.length < 2) return 0;
    const meanX = average(valid.map((item) => item.x));
    const meanY = average(valid.map((item) => item.y));
    const denominator = sum(valid.map((item) => (item.x - meanX) ** 2));
    return denominator ? sum(valid.map((item) => (item.x - meanX) * (item.y - meanY))) / denominator : 0;
  }

  function assessExerciseStaleness(history = [], options = {}) {
    const exposures = normalizeHistory(history).filter((item) => !item.prescribedReduction);
    const recent = exposures.slice(-Math.max(3, number(options.lookbackExposures, 6)));
    const minimum = number(options.minimumComparableExposures, DEFAULT_POLICY.minimumComparableExposures);
    const insufficientMetrics = {
      progressionTrend: 0,
      rpeTrend: 0,
      estimated1RmTrend: 0,
      backoffTrend: 0,
      setRepLossFlag: false,
      recoveryCostFlag: false,
      painFlag: false,
      adherenceFlag: false,
      averageAdherence: null,
      improvedExposures: 0,
      heldExposures: 0,
      regressedExposures: 0
    };
    if (recent.length < minimum) {
      return {
        score: 0,
        classification: STALENESS.INSUFFICIENT,
        label: "Insufficient evidence",
        exposureCount: recent.length,
        rotationRecommended: false,
        deloadCandidate: false,
        reasons: [`Only ${recent.length} recent comparable exposure${recent.length === 1 ? "" : "s"}; continue collecting consistent performance and RPE data.`],
        metrics: insufficientMetrics
      };
    }
    const asOfDate = dateOnly(firstPresent(options.asOfDate, options.createdAt));
    const latestDate = recent.at(-1)?.date;
    const maximumReturnGapDays = number(options.maximumReturnGapDays, DEFAULT_POLICY.maximumReturnGapDays);
    if (asOfDate && latestDate && maximumReturnGapDays > 0) {
      const elapsedDays = Math.floor((new Date(`${asOfDate}T00:00:00Z`).getTime() - new Date(`${latestDate}T00:00:00Z`).getTime()) / 86400000);
      if (Number.isFinite(elapsedDays) && elapsedDays > maximumReturnGapDays) {
        return {
          score: 0,
          classification: STALENESS.INSUFFICIENT,
          label: "Insufficient evidence",
          exposureCount: recent.length,
          rotationRecommended: false,
          deloadCandidate: false,
          reasons: [`The latest comparable exposure is ${elapsedDays} days old; establish a return-to-training baseline before diagnosing a plateau or progressing load.`],
          metrics: insufficientMetrics
        };
      }
    }
    const statusCounts = {
      improved: recent.filter((item) => /improv|progress/.test(item.status) || number(item.progressionPercent) >= 1).length,
      held: recent.filter((item) => /held|hold|stable|plateau/.test(item.status) || (item.progressionPercent !== null && Math.abs(item.progressionPercent) < 1)).length,
      regressed: recent.filter((item) => /regress|declin/.test(item.status) || number(item.progressionPercent) < -1.5).length
    };
    const lastThree = recent.slice(-3);
    const lastTwo = recent.slice(-2);
    const performanceSlope = linearSlope(recent.map((item) => item.performance));
    const e1rmSlope = linearSlope(recent.map((item) => item.estimated1Rm));
    const rpeSlope = linearSlope(recent.map((item) => item.averageRpe));
    const backoffSlope = linearSlope(recent.map((item) => item.backoffPerformance));
    const repeatedPain = recent.filter((item) => item.pain).length >= 2 || (recent.at(-1)?.pain && options.painRequiresImmediateRotation);
    const adherenceValues = recent.map((item) => item.adherence).filter((value) => value !== null);
    const lowAdherence = adherenceValues.length >= 2 && average(adherenceValues) < 0.75;
    const highRecoveryCost = recent.filter((item) => number(item.recoveryCost) >= 60).length >= 2;
    const excessiveRepLoss = recent.filter((item) => number(item.repLossPercent) > number(options.maximumRepLossPercent, DEFAULT_POLICY.maximumRepLossPercent)).length >= 2;
    const excessiveBackoffDrop = recent.filter((item) => number(item.loadReductionPercent) > number(options.maximumBackoffLoadReductionPercent, DEFAULT_POLICY.maximumBackoffLoadReductionPercent)).length >= 2 || backoffSlope < -1;
    const fatigueFactors = [highRecoveryCost, excessiveRepLoss, excessiveBackoffDrop, rpeSlope >= 0.3].filter(Boolean).length;
    const recentRegression = lastTwo.filter((item) => /regress|declin/.test(item.status) || number(item.progressionPercent) < -1.5).length >= 2 || Math.max(...lastTwo.map((item) => item.regressionExposures), 0) >= 2;
    const plateau = lastThree.filter((item) => /held|hold|stable|plateau/.test(item.status)).length >= 3 || Math.max(...lastThree.map((item) => item.plateauExposures), 0) >= number(options.plateauWindow, DEFAULT_POLICY.plateauWindow);
    const stillProgressing = lastThree.some((item) => /improv|progress/.test(item.status) || number(item.progressionPercent) >= 1) && (performanceSlope > 0 || e1rmSlope > 0 || statusCounts.improved >= 2);
    const alternativeAdvantage = number(options.bestAlternativeScore) - number(options.currentExerciseScore);
    let score = statusCounts.regressed * 12 + statusCounts.held * 5 + fatigueFactors * 12 + (repeatedPain ? 32 : 0) + (recentRegression ? 20 : 0) + (plateau ? 14 : 0);
    if (alternativeAdvantage >= 10 && !stillProgressing) score += 10;
    if (number(options.currentMesocycleExposures) >= 12 && !stillProgressing) score += 6;
    if (lowAdherence && !repeatedPain) score -= 15;
    if (stillProgressing) score = Math.min(score, 24);
    score = clamp(score, 0, 100);
    let classification = STALENESS.PRODUCTIVE;
    if (repeatedPain || (recentRegression && fatigueFactors >= 1) || (plateau && fatigueFactors >= 2) || score >= 70) classification = STALENESS.ROTATION_CANDIDATE;
    else if (fatigueFactors >= 2 && !stillProgressing) classification = STALENESS.EXCESSIVELY_FATIGUING;
    else if (recentRegression || (statusCounts.regressed >= 2 && performanceSlope < 0)) classification = STALENESS.REGRESSING;
    else if (plateau) classification = STALENESS.STALLED;
    else if (!stillProgressing && (statusCounts.held >= 2 || score >= 30)) classification = STALENESS.APPROACHING_PLATEAU;
    if (lowAdherence && !repeatedPain && fatigueFactors < 2 && classification !== STALENESS.PRODUCTIVE) classification = STALENESS.APPROACHING_PLATEAU;
    const labels = {
      [STALENESS.PRODUCTIVE]: "Productive",
      [STALENESS.APPROACHING_PLATEAU]: "Productive but approaching a plateau",
      [STALENESS.STALLED]: "Stalled",
      [STALENESS.REGRESSING]: "Regressing",
      [STALENESS.EXCESSIVELY_FATIGUING]: "Excessively fatiguing",
      [STALENESS.ROTATION_CANDIDATE]: "Candidate for rotation"
    };
    const reasons = [];
    if (stillProgressing) reasons.push("Comparable performance is still improving, so time in the program alone is not a rotation reason.");
    if (recentRegression) reasons.push("The last two comparable exposures regressed.");
    if (plateau) reasons.push(`No meaningful improvement has appeared across the ${DEFAULT_POLICY.plateauWindow}-exposure plateau window.`);
    if (rpeSlope >= 0.3) reasons.push("RPE is rising while comparable output is not improving enough to justify the added fatigue.");
    if (excessiveRepLoss) reasons.push("Set-to-set repetition loss repeatedly exceeded the quality threshold.");
    if (excessiveBackoffDrop) reasons.push("Back-off performance or required load reductions deteriorated.");
    if (highRecoveryCost) reasons.push("Recovery cost was repeatedly high.");
    if (repeatedPain) reasons.push("Pain or discomfort was recorded repeatedly; use a pain-free substitute.");
    if (alternativeAdvantage >= 10 && !stillProgressing) reasons.push("A less redundant alternative is producing materially stronger results for the same function.");
    if (lowAdherence) reasons.push("Recent adherence is too low to attribute the flat or declining result confidently to exercise staleness; restore comparable execution before rotating.");
    if (!reasons.length) reasons.push("Performance remains repeatable without a confirmed fatigue or regression pattern.");
    return {
      score: Math.round(score),
      classification,
      label: labels[classification],
      exposureCount: recent.length,
      rotationRecommended: classification === STALENESS.ROTATION_CANDIDATE,
      deloadCandidate: [STALENESS.ROTATION_CANDIDATE, STALENESS.EXCESSIVELY_FATIGUING, STALENESS.REGRESSING].includes(classification) && (fatigueFactors >= 1 || repeatedPain),
      reasons,
      metrics: {
        progressionTrend: round(performanceSlope, 3),
        rpeTrend: round(rpeSlope, 3),
        estimated1RmTrend: round(e1rmSlope, 3),
        backoffTrend: round(backoffSlope, 3),
        setRepLossFlag: excessiveRepLoss,
        recoveryCostFlag: highRecoveryCost,
        painFlag: repeatedPain,
        adherenceFlag: lowAdherence,
        averageAdherence: adherenceValues.length ? round(average(adherenceValues), 2) : null,
        improvedExposures: statusCounts.improved,
        heldExposures: statusCounts.held,
        regressedExposures: statusCounts.regressed
      }
    };
  }

  function evaluateReadiness(readiness = {}) {
    const signals = [];
    const add = (domain, severity, explanation) => {
      if (!signals.some((signal) => signal.domain === domain)) signals.push({ domain, severity, explanation });
    };
    const hrvRatio = nullableNumber(firstPresent(readiness.hrvRatio, readiness.hrvPctOfBaseline !== undefined ? number(readiness.hrvPctOfBaseline) / 100 : null, readiness.hrv !== undefined && readiness.baselineHrv ? number(readiness.hrv) / number(readiness.baselineHrv) : null));
    const rhrRatio = nullableNumber(firstPresent(readiness.restingHeartRateRatio, readiness.restingHeartRatePctOfBaseline !== undefined ? number(readiness.restingHeartRatePctOfBaseline) / 100 : null, readiness.restingHeartRate !== undefined && readiness.baselineRestingHeartRate ? number(readiness.restingHeartRate) / number(readiness.baselineRestingHeartRate) : null));
    const sleepRatio = nullableNumber(firstPresent(readiness.sleepRatio, readiness.sleepHours !== undefined && readiness.baselineSleepHours ? number(readiness.sleepHours) / number(readiness.baselineSleepHours) : null));
    const illness = anyExplicitTrue(readiness.illness, readiness.isIll, readiness.illnessReported);
    const pain = anyExplicitTrue(readiness.pain, readiness.discomfort, readiness.injury, readiness.painReported);
    if (illness) add("illness", 3, "Illness is a hard readiness restriction; do not progress training stress today.");
    if (pain) add("pain", 3, `Pain${readiness.affectedMuscle ? ` affecting ${readiness.affectedMuscle}` : ""} requires a pain-free modification or stopping the affected work.`);
    const autonomicReasons = [];
    if (hrvRatio !== null && hrvRatio < 0.9) autonomicReasons.push(`HRV is ${Math.round((1 - hrvRatio) * 100)}% below baseline.`);
    if (rhrRatio !== null && rhrRatio > 1.07) autonomicReasons.push(`Resting heart rate is ${Math.round((rhrRatio - 1) * 100)}% above baseline.`);
    if (autonomicReasons.length) {
      const autonomicSeverity = (hrvRatio !== null && hrvRatio < 0.82) || (rhrRatio !== null && rhrRatio > 1.12) ? 2 : 1;
      add(hrvRatio !== null && hrvRatio < 0.9 ? "hrv" : "resting_heart_rate", autonomicSeverity, autonomicReasons.join(" "));
    }
    if ((sleepRatio !== null && sleepRatio < 0.85) || (nullableNumber(readiness.sleepHours) !== null && number(readiness.sleepHours) < 6)) add("sleep", sleepRatio !== null && sleepRatio < 0.7 ? 2 : 1, "Sleep was materially below the personal baseline.");
    if (number(readiness.soreness) >= 7 || number(readiness.fatigue) >= 7) add("subjective_recovery", number(readiness.soreness) >= 9 || number(readiness.fatigue) >= 9 ? 2 : 1, "Soreness or fatigue is high enough to affect training quality.");
    if (number(readiness.readinessScore, 10) <= 4) add("subjective_readiness", number(readiness.readinessScore, 10) <= 2 ? 2 : 1, "Readiness is below the usual training range.");
    if (anyExplicitTrue(readiness.previousExposureRegressed) || number(readiness.consecutiveRegressions) >= 1) add("recent_performance", number(readiness.consecutiveRegressions) >= 2 ? 2 : 1, "The previous comparable exposure regressed.");
    const energyAvailabilityLow = anyExplicitTrue(readiness.energyAvailabilityLow);
    if (normalizedBoolean(readiness.nutritionAdequate, null) === false || normalizedBoolean(readiness.proteinAdequate, null) === false || energyAvailabilityLow) add("nutrition", energyAvailabilityLow ? 2 : 1, "Nutrition or energy availability is below the planned condition.");
    const severity = sum(signals.map((signal) => signal.severity));
    const persistent = number(readiness.consecutiveLowReadinessDays || readiness.consecutiveAdverseDays) >= 2;
    const hardSafety = illness || pain;
    return {
      signalCount: signals.length,
      severity,
      signals,
      persistent,
      state: hardSafety || signals.length >= 3 || severity >= 4 ? "low" : signals.length >= 2 ? "below_baseline" : signals.length === 1 ? "monitor" : "normal"
    };
  }

  function readinessAdjustmentFor(basePrescription, readiness = {}) {
    const evaluation = evaluateReadiness(readiness);
    const hardSafetySignals = evaluation.signals.filter((signal) => signal.domain === "illness" || signal.domain === "pain");
    if (evaluation.signalCount < 2 && !hardSafetySignals.length) {
      return {
        changed: false,
        temporary: true,
        affectsMesocycle: false,
        setChange: 0,
        loadChangePercent: 0,
        repTargetChange: 0,
        rpeChange: 0,
        explanation: evaluation.signalCount === 1 ? `${evaluation.signals[0].explanation} One isolated marker is monitored without rewriting today's prescription.` : "Readiness supports the base prescription.",
        resumeRule: "Continue the base progression unless another independent recovery or performance signal also worsens.",
        signals: evaluation.signals
      };
    }
    if (hardSafetySignals.length) {
      const illness = hardSafetySignals.some((signal) => signal.domain === "illness");
      return {
        changed: true,
        temporary: true,
        affectsMesocycle: false,
        setChange: 0,
        loadChangePercent: 0,
        repTargetChange: 0,
        rpeChange: 0,
        explanation: `${hardSafetySignals.map((signal) => signal.explanation).join(" ")} ${illness ? "Hold the workout rather than testing readiness with a lighter session." : "Do not test the affected movement at a lower load; use a pain-free substitute or stop that work."}`,
        resumeRule: illness ? "Resume training only after the acute illness restriction has resolved; seek qualified guidance when symptoms are severe, unexplained, or persistent." : "Resume the affected movement only when it is pain-free; seek qualified evaluation when pain is severe, unexplained, or persistent.",
        signals: evaluation.signals
      };
    }
    const severe = evaluation.state === "low";
    const targetSets = number(basePrescription?.workingSets?.target, 1);
    const canReduceSet = targetSets >= 3;
    const setChange = canReduceSet ? -1 : 0;
    return {
      changed: true,
      temporary: true,
      affectsMesocycle: false,
      setChange,
      loadChangePercent: severe ? -5 : canReduceSet ? 0 : -5,
      repTargetChange: 0,
      rpeChange: severe ? -1 : -0.5,
      explanation: `${evaluation.signals.map((signal) => signal.explanation).join(" ")} The smallest useful one-day adjustment was selected: ${setChange ? "remove one set" : "preserve set count"}, ${severe || !canReduceSet ? "reduce load about 5%" : "preserve load"}, preserve the programmed rep range, and lower target effort. This is not a mesocycle rewrite or evidence of lost strength.`,
      resumeRule: "Resume the base prescription when at least two affected readiness domains return near baseline and warm-ups or the next comparable exposure are stable.",
      signals: evaluation.signals
    };
  }

  function applyReadinessAdjustment(basePrescription, readiness = {}) {
    const adjusted = deepClone(basePrescription);
    const change = readinessAdjustmentFor(basePrescription, readiness);
    adjusted.readinessAdjustment = change;
    if (!change.changed) return adjusted;
    const illness = change.signals.some((signal) => signal.domain === "illness");
    const pain = change.signals.some((signal) => signal.domain === "pain");
    if (illness || pain) {
      const auditBaseTargets = {
        exerciseId: adjusted.exerciseId,
        researchExerciseId: adjusted.researchExerciseId,
        workingSets: deepClone(adjusted.workingSets),
        repRange: deepClone(adjusted.repRange),
        targetRpe: deepClone(adjusted.targetRpe),
        targetRir: deepClone(adjusted.targetRir),
        restSeconds: deepClone(adjusted.restSeconds),
        volume: deepClone(adjusted.volume),
        ...(adjusted.prescribedLoad ? { prescribedLoad: deepClone(adjusted.prescribedLoad) } : {})
      };
      adjusted.recommendationType = illness ? "hold" : "substitute";
      adjusted.progressionAction = illness ? "stop_for_illness" : "hold_for_pain_free_substitution";
      adjusted.progressionRule = change.explanation;
      adjusted.holdRule = change.resumeRule;
      adjusted.userExplanation = change.explanation;
      adjusted.executionBlocked = true;
      adjusted.workingSets = { min: 0, target: 0, max: 0 };
      const zeroRange = { min: 0, target: 0, max: 0 };
      const zeroVolumeLevel = { recommendedStarting: 0, normalOperatingRange: deepClone(zeroRange), currentPrescribed: 0, highestRecoverableObserved: null, deload: 0, researchFallbackRange: deepClone(zeroRange) };
      adjusted.volume = {
        adjustmentType: "reduce_volume",
        perExercise: deepClone(zeroVolumeLevel),
        perMusclePerSession: deepClone(zeroRange),
        perMusclePerWeek: deepClone(zeroVolumeLevel),
        reason: "Hard safety restriction: executable volume is zero; the base volume remains available only in safetyRestriction.auditBaseTargets."
      };
      adjusted.setStructure = "straight_sets";
      adjusted.setStructureReason = "Hard safety restriction: no working-set structure is executable until the restriction is resolved.";
      adjusted.safetyRestriction = {
        schemaVersion: HARD_SAFETY_SCHEMA_VERSION,
        status: "blocked",
        scope: illness ? "workout" : "exercise",
        reason: illness ? "illness" : "pain",
        resumeCriteria: change.resumeRule,
        originalExerciseId: adjusted.exerciseId,
        painFreeConfirmed: false,
        substituteExerciseId: null,
        substituteResearchExerciseId: null,
        confirmedAt: null,
        auditBaseTargets
      };
      delete adjusted.prescribedLoad;
      delete adjusted.topSet;
      delete adjusted.backoffSets;
      if (pain) adjusted.substitutionRule = "Use only a pain-free alternative that preserves all equipment, exclusion, and safety constraints; stop the affected work if no such option exists.";
      return adjusted;
    }
    adjusted.workingSets.target = Math.max(1, adjusted.workingSets.target + change.setChange);
    adjusted.workingSets.min = Math.min(adjusted.workingSets.min, adjusted.workingSets.target);
    adjusted.workingSets.max = Math.max(adjusted.workingSets.target, adjusted.workingSets.max + Math.min(0, change.setChange));
    if (adjusted.repRange?.target !== undefined) adjusted.repRange.target = Math.max(adjusted.repRange.min, adjusted.repRange.target + change.repTargetChange);
    if (adjusted.targetRpe) {
      adjusted.targetRpe = {
        min: Math.max(5, round(adjusted.targetRpe.min + change.rpeChange, 1)),
        max: Math.max(5.5, round(adjusted.targetRpe.max + change.rpeChange, 1))
      };
    }
    if (adjusted.targetRir) adjusted.targetRir = { min: round(adjusted.targetRir.min - change.rpeChange, 1), max: round(adjusted.targetRir.max - change.rpeChange, 1) };
    if (adjusted.prescribedLoad?.target) adjusted.prescribedLoad.target = round(adjusted.prescribedLoad.target * (1 + change.loadChangePercent / 100), 2);
    adjusted.recommendationType = "light_session";
    adjusted.progressionRule = `Hold progression today. ${change.explanation}`;
    return adjusted;
  }

  function researchMuscleMatch(research, muscleGroupId, researchMuscleId) {
    const requested = normalizeMuscleId(muscleGroupId);
    const mapped = normalizeMuscleId(researchMuscleId);
    const recommendation = research.muscleRecommendationById.get(researchMuscleId);
    const category = normalizeMuscleId(recommendation?.muscle_group || recommendation?.muscleGroup);
    return mapped === requested || category === requested || muscleFamily(mapped) === muscleFamily(requested) || (category && muscleFamily(category) === muscleFamily(requested)) || mapped.startsWith(`${requested}_`) || (category && requested.startsWith(`${category}_`));
  }

  function taxonomyRelationshipsFor(research, exerciseOrId) {
    if (typeof exerciseOrId === "object" && asArray(exerciseOrId?.muscleRelationships).length) return asArray(exerciseOrId.muscleRelationships);
    const id = typeof exerciseOrId === "string" ? exerciseOrId : firstPresent(exerciseOrId?.researchExerciseId, exerciseOrId?.exerciseId);
    return asArray(research?.muscleMapsByExercise?.get(id));
  }

  function taxonomyContributionFor(research, exerciseOrId, muscleGroupId) {
    const matches = taxonomyRelationshipsFor(research, exerciseOrId).filter((mapping) => researchMuscleMatch(research, muscleGroupId, mapping.muscle_group_id || mapping.muscleGroupId));
    return matches.sort((a, b) => number(b.fractional_set_credit, 0) - number(a.fractional_set_credit, 0))[0] || null;
  }

  function calculateExerciseMuscleContributions(researchInput, exerciseOrId, workingSets = 1) {
    const research = researchInput?.kind === "research_evidence_adapter" ? researchInput : createResearchDataAdapter(researchInput || {});
    return taxonomyRelationshipsFor(research, exerciseOrId).map((mapping) => {
      const setCredit = number(mapping.fractional_set_credit, 0);
      return {
        exerciseId: typeof exerciseOrId === "string" ? exerciseOrId : firstPresent(exerciseOrId?.researchExerciseId, exerciseOrId?.exerciseId),
        muscleGroupId: mapping.muscle_group_id || mapping.muscleGroupId,
        relationshipType: mapping.relationship_type,
        loadingRole: mapping.loading_role || "unknown",
        directSets: mapping.relationship_type === "direct_load" ? round(workingSets * setCredit, 2) : 0,
        fractionalSets: mapping.relationship_type === "meaningful_fractional_load" ? round(workingSets * setCredit, 2) : 0,
        weightedHypertrophySets: round(workingSets * setCredit, 2),
        isometricExposure: mapping.relationship_type === "isometric_stabilizing_load" ? round(workingSets * number(mapping.local_fatigue_weight, 0), 2) : 0,
        taxonomyVersion: String(firstPresent(mapping.taxonomy_version, mapping.taxonomyVersion) || "").trim() || null,
        confidence: mapping.confidence_rating,
        evidenceNotes: mapping.evidence_notes
      };
    });
  }

  function recalculateHistoricalMuscleVolume(evidenceInput, records = []) {
    const evidence = evidenceInput?.research ? evidenceInput : normalizeEvidenceBundle(evidenceInput || {});
    const snapshot = deepClone(records);
    const totals = new Map();
    const taxonomyVersions = new Set();
    let missingTaxonomyProvenance = snapshot.length === 0;
    snapshot.forEach((record) => {
      const canonicalId = firstPresent(record.researchExerciseId, evidence.research.exerciseIdByAlias.get(normalizeText(record.exerciseName)), record.exerciseId);
      const contributions = calculateExerciseMuscleContributions(evidence.research, canonicalId, number(record.workingSets, record.sets || 0));
      if (!contributions.length) missingTaxonomyProvenance = true;
      contributions.forEach((entry) => {
        if (entry.taxonomyVersion) taxonomyVersions.add(entry.taxonomyVersion);
        else missingTaxonomyProvenance = true;
        if (!totals.has(entry.muscleGroupId)) totals.set(entry.muscleGroupId, { muscleGroupId: entry.muscleGroupId, directSets: 0, fractionalSets: 0, weightedHypertrophySets: 0, isometricExposure: 0, contributions: [] });
        const total = totals.get(entry.muscleGroupId);
        total.directSets += entry.directSets;
        total.fractionalSets += entry.fractionalSets;
        total.weightedHypertrophySets += entry.weightedHypertrophySets;
        total.isometricExposure += entry.isometricExposure;
        total.contributions.push(entry);
      });
    });
    const taxonomyVersion = taxonomyVersions.size === 0
      ? "unknown"
      : missingTaxonomyProvenance || taxonomyVersions.size > 1
        ? "mixed"
        : [...taxonomyVersions][0];
    return { taxonomyVersion, sourceRecords: snapshot, muscleTotals: [...totals.values()].map((item) => ({ ...item, directSets: round(item.directSets, 2), fractionalSets: round(item.fractionalSets, 2), weightedHypertrophySets: round(item.weightedHypertrophySets, 2), isometricExposure: round(item.isometricExposure, 2) })) };
  }

  function aggregateMuscleResearchDefaults(research, muscleGroupId) {
    const recommendations = research.muscleRecommendationsFor(muscleGroupId);
    if (!recommendations.length) {
      return {
        recommendations: [],
        weeklySets: { min: 6, target: 10, max: 14 },
        setsPerSession: { min: 2, target: 3, max: 5 },
        frequency: { min: 1, target: 2, max: 3 },
        repRange: { min: 6, target: 10, max: 15 },
        rir: { min: 1, max: 3 },
        restSeconds: { min: 90, target: 150, max: 240 },
        confidence: 45,
        evidenceSummary: "Generic resistance-training fallback; no exact research muscle-group row was available."
      };
    }
    const low = (field, fallback) => Math.min(...recommendations.map((item) => number(item[field], fallback)));
    const high = (field, fallback) => Math.max(...recommendations.map((item) => number(item[field], fallback)));
    const weeklyMin = low("minimum_effective_weekly_sets", 6);
    const weeklyLow = low("typical_effective_weekly_sets_low", weeklyMin);
    const weeklyHigh = high("typical_effective_weekly_sets_high", 16);
    return {
      recommendations,
      weeklySets: { min: weeklyMin, target: Math.round((weeklyLow + weeklyHigh) / 2), max: weeklyHigh },
      setsPerSession: {
        min: low("recommended_sets_per_session_low", 2),
        target: Math.round(average(recommendations.map((item) => (number(item.recommended_sets_per_session_low, 2) + number(item.recommended_sets_per_session_high, 5)) / 2))),
        max: high("recommended_sets_per_session_high", 5)
      },
      frequency: {
        min: low("recommended_frequency_low", 1),
        target: round(average(recommendations.map((item) => (number(item.recommended_frequency_low, 1) + number(item.recommended_frequency_high, 3)) / 2)), 1),
        max: high("recommended_frequency_high", 3)
      },
      repRange: {
        min: low("recommended_rep_range_low", 5),
        target: Math.round(average(recommendations.map((item) => (number(item.recommended_rep_range_low, 5) + number(item.recommended_rep_range_high, 20)) / 2))),
        max: high("recommended_rep_range_high", 20)
      },
      rir: { min: low("recommended_rir_low", 0), max: high("recommended_rir_high", 4) },
      restSeconds: {
        min: low("recommended_rest_seconds_low", 90),
        target: Math.round(average(recommendations.map((item) => (number(item.recommended_rest_seconds_low, 90) + number(item.recommended_rest_seconds_high, 240)) / 2))),
        max: high("recommended_rest_seconds_high", 240)
      },
      confidence: average(recommendations.map((item) => confidenceValue(item.confidence_rating || item.evidence_strength))),
      evidenceSummary: unique(recommendations.map((item) => `${item.muscle_group || muscleGroupId}: ${item.notes || "research operating range"}`)).join(" ")
    };
  }

  function researchExerciseDefaults(exercise, muscleDefaults) {
    if (!exercise) return muscleDefaults;
    const repRange = {
      min: number(exercise.recommended_rep_range_low, muscleDefaults.repRange.min),
      target: Math.round((number(exercise.recommended_rep_range_low, muscleDefaults.repRange.min) + number(exercise.recommended_rep_range_high, muscleDefaults.repRange.max)) / 2),
      max: number(exercise.recommended_rep_range_high, muscleDefaults.repRange.max)
    };
    const sets = {
      min: number(exercise.recommended_sets_per_session_low, muscleDefaults.setsPerSession.min),
      target: Math.round((number(exercise.recommended_sets_per_session_low, muscleDefaults.setsPerSession.min) + number(exercise.recommended_sets_per_session_high, muscleDefaults.setsPerSession.max)) / 2),
      max: number(exercise.recommended_sets_per_session_high, muscleDefaults.setsPerSession.max)
    };
    return {
      ...muscleDefaults,
      setsPerSession: sets,
      repRange,
      rir: {
        min: number(exercise.recommended_rir_low, muscleDefaults.rir.min),
        max: number(exercise.recommended_rir_high, muscleDefaults.rir.max)
      },
      restSeconds: {
        min: number(exercise.recommended_rest_seconds_low, muscleDefaults.restSeconds.min),
        target: Math.round((number(exercise.recommended_rest_seconds_low, muscleDefaults.restSeconds.min) + number(exercise.recommended_rest_seconds_high, muscleDefaults.restSeconds.max)) / 2),
        max: number(exercise.recommended_rest_seconds_high, muscleDefaults.restSeconds.max)
      },
      confidence: confidenceValue(exercise.confidence_rating || exercise.evidence_quality, muscleDefaults.confidence)
    };
  }

  function personalRecordMatchesMuscle(record, muscleGroupId) {
    const requested = normalizeMuscleId(muscleGroupId);
    const muscle = normalizeMuscleId(record.muscle_group || record.muscle_group_id || record.muscleGroup || record.muscleGroupId);
    const research = normalizeMuscleId(record.research_muscle_group_id || record.researchMuscleGroupId);
    return muscle === requested || research === requested || muscle.startsWith(`${requested}_`) || requested.startsWith(`${muscle}_`) || research.startsWith(`${requested}_`);
  }

  function buildMergedExerciseCandidates(evidence, muscleGroupId, options = {}) {
    const bundle = evidence.personal ? evidence : normalizeEvidenceBundle(evidence);
    const { personal, research } = bundle;
    const candidates = new Map();
    const addPersonal = (muscleScore) => {
      const exerciseId = muscleScore.exercise_id || muscleScore.exerciseId;
      if (!exerciseId) return;
      const score = personal.scoreByExercise.get(exerciseId) || {};
      const prescriptions = personal.prescriptionsFor(exerciseId, muscleGroupId);
      const prescription = prescriptions[0] || (personal.prescriptionsByExercise.get(exerciseId) || [])[0] || {};
      const selectedIdentity = personal.reconciledIdentityByExerciseId?.get(exerciseId) || null;
      const researchExerciseId = selectedIdentity?.invalid ? null : selectedIdentity?.researchExerciseId || null;
      // Resolve the custom/canonical identity before equipment filtering. A valid
      // selected custom variation owns this canonical slot even when its actual
      // equipment is unavailable; ranking must not resurrect a duplicate later.
      if (researchExerciseId && personal.selectedPersonalIdByResearchId?.get(researchExerciseId) !== exerciseId) return;
      const researchExercise = research.exerciseById.get(researchExerciseId) || null;
      const mappings = researchExerciseId ? research.muscleMapsByExercise.get(researchExerciseId) || [] : [];
      const canonicalIdentity = researchExerciseId === exerciseId && selectedIdentity?.researchIdentitySource === "canonical_id";
      candidates.set(exerciseId, {
        exerciseId,
        researchExerciseId: researchExerciseId || null,
        exerciseName: firstPresent(canonicalIdentity ? researchExercise?.exercise_name : null, score.exercise_name, muscleScore.exercise_name, prescription.exercise_name, researchExercise?.exercise_name, exerciseId),
        personalScore: score,
        personalPrescription: prescription,
        muscleScore,
        history: options.histories?.[exerciseId] || personal.historyFor(exerciseId),
        researchExercise,
        researchMappings: mappings,
        selectedIdentity,
        source: researchExercise ? "personal_and_research" : "personal_only"
      });
    };
    personal.exerciseMuscleScores.filter((record) => personalRecordMatchesMuscle(record, muscleGroupId)).forEach(addPersonal);
    personal.exercisePrescriptions.filter((record) => personalRecordMatchesMuscle(record, muscleGroupId)).forEach((prescription) => {
      const exerciseId = prescription.exercise_id || prescription.exerciseId;
      if (candidates.has(exerciseId)) return;
      addPersonal({
        exercise_id: exerciseId,
        exercise_name: prescription.exercise_name,
        muscle_group: prescription.muscle_group_id,
        muscle_role: "primary",
        contribution_weight: 1,
        research_muscle_group_id: prescription.research_muscle_group_id
      });
    });
    research.exerciseDatabase.forEach((exercise) => {
      const researchExerciseId = exercise.exercise_id || exercise.exerciseId;
      const mappings = research.muscleMapsByExercise.get(researchExerciseId) || [];
      if (!mappings.some((mapping) => number(mapping.fractional_set_credit, 0) > 0 && researchMuscleMatch(research, muscleGroupId, mapping.muscle_group_id || mapping.muscleGroupId))) return;
      const relevantMapping = mappings.find((mapping) => researchMuscleMatch(research, muscleGroupId, mapping.muscle_group_id || mapping.muscleGroupId)) || {};
      const selectedPersonalId = personal.selectedPersonalIdByResearchId?.get(researchExerciseId);
      if (selectedPersonalId && !candidates.has(selectedPersonalId)) {
        addPersonal({
          exercise_id: selectedPersonalId,
          exercise_name: personal.reconciledIdentityByExerciseId.get(selectedPersonalId)?.source?.exercise_name,
          muscle_group: muscleGroupId,
          muscle_role: relevantMapping.relationship_type,
          contribution_weight: relevantMapping.fractional_set_credit,
          research_muscle_group_id: relevantMapping.muscle_group_id
        });
      }
      if (selectedPersonalId && candidates.has(selectedPersonalId)) return;
      candidates.set(researchExerciseId, {
        exerciseId: researchExerciseId,
        researchExerciseId,
        exerciseName: exercise.exercise_name || exercise.exerciseName,
        personalScore: {},
        personalPrescription: {},
        muscleScore: {
          muscle_group: muscleGroupId,
          muscle_role: relevantMapping.relationship_type,
          contribution_weight: relevantMapping.fractional_set_credit,
          research_muscle_group_id: relevantMapping.muscle_group_id
        },
        history: options.histories?.[researchExerciseId] || [],
        researchExercise: exercise,
        researchMappings: mappings,
        selectedIdentity: null,
        source: "research_only"
      });
    });
    return [...candidates.values()].filter((candidate) => {
      const canonicalMappings = asArray(candidate.researchMappings);
      if (!canonicalMappings.length) {
        const personalRole = String(candidate.muscleScore?.muscle_role || candidate.muscleScore?.muscleRole || "").toLowerCase();
        return number(candidate.muscleScore?.contribution_weight, ["primary", "direct_load"].includes(personalRole) ? 1 : ["secondary", "meaningful_fractional_load"].includes(personalRole) ? 0.5 : 0) > 0;
      }
      const relevant = canonicalMappings.filter((mapping) => researchMuscleMatch(research, muscleGroupId, mapping.muscle_group_id || mapping.muscleGroupId));
      if (!relevant.length) return false;
      return relevant.some((mapping) => ["direct_load", "meaningful_fractional_load", "primary", "secondary"].includes(mapping.relationship_type || mapping.relationshipType) && number(mapping.fractional_set_credit ?? mapping.setContribution, 0) > 0);
    }).map((candidate) => ({ ...candidate, equipmentProfile: resolveCandidateEquipmentProfile(candidate) }));
  }

  function fatigueCostScore(exercise) {
    const cost = String(exercise?.local_fatigue_cost || exercise?.localFatigueCost || "moderate").toLowerCase();
    if (cost === "very_high") return 92;
    if (cost === "high") return 78;
    if (cost === "low") return 30;
    if (cost === "very_low") return 18;
    return 55;
  }

  function demandScore(value, fallback = 50) {
    const demand = String(value || "").toLowerCase();
    if (/very_high|very high/.test(demand)) return 95;
    if (/high/.test(demand)) return 80;
    if (/very_low|very low/.test(demand)) return 18;
    if (/low/.test(demand)) return 32;
    if (/moderate/.test(demand)) return 55;
    return fallback;
  }

  function exerciseDemandProfile(exercise = {}) {
    const name = String(exercise.exercise_name || exercise.exerciseName || "").toLowerCase();
    const pattern = String(exercise.movement_pattern || exercise.movementPattern || "").toLowerCase();
    const equipment = String(exercise.equipment || "").toLowerCase();
    const primary = splitMulti(exercise.primary_muscles);
    const secondary = splitMulti(exercise.secondary_muscles);
    const systemicFatigue = demandScore(exercise.systemic_fatigue_cost || exercise.systemicFatigueCost, /compound/.test(String(exercise.exercise_type || "")) ? 68 : 35);
    let spinalLoad = primary.concat(secondary).some((muscle) => /spinal_erector/.test(muscle)) ? 82 : 18;
    if (/squat|hinge|deadlift|good morning|barbell row/.test(`${pattern} ${name}`)) spinalLoad = Math.max(spinalLoad, 78);
    if (/chest.support|machine|cable|supported/.test(`${equipment} ${name}`)) spinalLoad = Math.min(spinalLoad, 28);
    let gripDemand = /pull|row|hinge|deadlift|carry|shrug/.test(`${pattern} ${name}`) ? 74 : 20;
    if (/machine|cable/.test(equipment) && !/carry/.test(pattern)) gripDemand -= 12;
    const jointText = String(exercise.joint_stress_considerations || exercise.jointStressConsiderations || "").toLowerCase();
    const jointStress = /high|pain|irrit|caution/.test(jointText) ? 70 : /compound/.test(String(exercise.exercise_type || "")) ? 52 : 34;
    return {
      systemicFatigue: clamp(systemicFatigue, 0, 100),
      localFatigue: fatigueCostScore(exercise),
      spinalLoad: clamp(spinalLoad, 0, 100),
      gripDemand: clamp(gripDemand, 0, 100),
      jointStress: clamp(jointStress, 0, 100),
      highFatigueCompound: /compound/.test(String(exercise.exercise_type || "")) && systemicFatigue >= 65
    };
  }

  function stabilityScore(exercise) {
    const demand = String(exercise?.stability_demand || exercise?.stabilityDemand || "moderate").toLowerCase();
    const equipment = String(exercise?.equipment || "").toLowerCase();
    if (/machine|cable/.test(equipment) || demand === "low") return 90;
    if (demand === "high") return 62;
    return 78;
  }

  function lengthenedPositionScore(exercise) {
    const text = `${exercise?.exercise_name || ""} ${exercise?.range_of_motion_criteria || ""} ${exercise?.movement_pattern || ""}`.toLowerCase();
    if (/overhead.*extension|incline.*curl|romanian|stiff.leg|fly|pullover|deep|lengthened|full.*range/.test(text)) return 90;
    if (/largest pain.free controlled rom|pain.free.*rom/.test(text)) return 74;
    return 60;
  }

  function easeOfProgressionScore(exercise) {
    const model = String(exercise?.preferred_progression_model || "").toLowerCase();
    const metric = String(exercise?.primary_progression_metric || "").toLowerCase();
    const equipment = String(exercise?.equipment || "").toLowerCase();
    let score = /double|load_then|rep_then/.test(model) ? 85 : /technique|duration/.test(model) ? 60 : 72;
    if (/machine|cable|barbell/.test(equipment)) score += 6;
    if (/estimated_1rm|repetitions_at_load/.test(metric)) score += 5;
    return clamp(score, 0, 100);
  }

  function scoreExerciseCandidate(candidate, evidence, muscleGroupId, options = {}) {
    const bundle = evidence.personal ? evidence : normalizeEvidenceBundle(evidence);
    const score = candidate.personalScore || {};
    const muscleScore = candidate.muscleScore || {};
    const prescription = candidate.personalPrescription || {};
    const exercise = candidate.researchExercise || {};
    const equipmentProfile = candidateEquipmentProfile(candidate);
    if (equipmentProfile.invalid) throw new Error(equipmentProfile.invalidReason);
    const equipmentAwareExercise = {
      ...exercise,
      equipment: equipmentRequirementFamilySignature(equipmentProfile.requirements)
    };
    const evidenceMetrics = derivePersonalEvidenceMetrics({ score, prescription, muscleScore, history: candidate.history });
    const weights = calculateEvidenceWeight(evidenceMetrics, { ...DEFAULT_POLICY, ...(options.policy || {}) });
    const personalHypertrophySupport = number(firstPresent(score.hypertrophy_support_score, score.hypertrophySupportScore), 50);
    const progressionQuality = number(firstPresent(score.progression_score, score.progressionScore, muscleScore.progression_score), 50);
    const recoveryEfficiency = number(firstPresent(score.recovery_efficiency_score, score.recoveryEfficiencyScore, muscleScore.recovery_efficiency_score), 50);
    const repeatability = number(firstPresent(score.repeatability_score, score.repeatabilityScore), 50);
    const relationship = String(firstPresent(muscleScore.muscle_role, muscleScore.muscleRole, "primary")).toLowerCase();
    const directRelationship = relationship === "primary" || relationship === "direct_load";
    const contribution = dataFraction(firstPresent(muscleScore.contribution_weight, muscleScore.contributionWeight, directRelationship ? 1 : 0.5), directRelationship ? 1 : 0.5);
    const canonicalRelationship = asArray(candidate.researchMappings)
      .filter((mapping) => researchMuscleMatch(bundle.research, muscleGroupId, mapping.muscle_group_id || mapping.muscleGroupId))
      .sort((a, b) => number(b.fractional_set_credit, 0) - number(a.fractional_set_credit, 0))[0];
    const canonicalContribution = canonicalRelationship ? number(canonicalRelationship.fractional_set_credit, 0) : contribution;
    const canonicalDynamic = !canonicalRelationship || ["direct_load", "meaningful_fractional_load", "primary", "secondary"].includes(canonicalRelationship.relationship_type);
    const personalMuscleEstimate = number(firstPresent(muscleScore.muscle_specific_effectiveness_score, muscleScore.muscleSpecificEffectivenessScore), canonicalContribution * 100);
    const muscleSpecificity = clamp(canonicalDynamic ? Math.min(personalMuscleEstimate, canonicalContribution >= 1 ? 100 : canonicalContribution * 100) : 0, 0, 100);
    const lengthenedPositionLoading = lengthenedPositionScore(exercise);
    const stability = stabilityScore(equipmentAwareExercise);
    const easeOfProgression = easeOfProgressionScore(equipmentAwareExercise);
    const fatigueCost = fatigueCostScore(exercise);
    const demands = exerciseDemandProfile(equipmentAwareExercise);
    const painCount = normalizeHistory(candidate.history).filter((item) => item.pain).length;
    const jointTolerance = clamp(82 - Math.min(50, painCount * 20), 10, 95);
    const researchSupport = clamp(confidenceValue(exercise.confidence_rating || exercise.evidence_quality, 55) + (exercise.direct_exercise_evidence ? 5 : 0), 0, 100);
    const personalDataConfidence = round(weights.personalDataConfidence, 1);
    const personalOverall = (
      personalHypertrophySupport * 0.24 + progressionQuality * 0.24 + recoveryEfficiency * 0.2 + repeatability * 0.13 + muscleSpecificity * 0.19
    );
    const researchOverall = (
      researchSupport * 0.25 + muscleSpecificity * 0.18 + lengthenedPositionLoading * 0.12 + stability * 0.12 + easeOfProgression * 0.15 + jointTolerance * 0.1 + (100 - fatigueCost) * 0.08
    );
    const staleness = assessExerciseStaleness(candidate.history, {
      currentExerciseScore: number(score.overall_personal_exercise_score, personalOverall),
      bestAlternativeScore: options.bestAlternativeScore,
      currentMesocycleExposures: options.currentMesocycleExposures,
      asOfDate: firstPresent(options.asOfDate, options.createdAt),
      maximumReturnGapDays: firstPresent(options.maximumReturnGapDays, options.policy?.maximumReturnGapDays, DEFAULT_POLICY.maximumReturnGapDays)
    });
    const targetMuscleEffectiveness = round(clamp(
      muscleSpecificity * 0.55 + progressionQuality * 0.16 + recoveryEfficiency * 0.12 + researchSupport * 0.1 + (100 - fatigueCost) * 0.07,
      0, 100
    ), 2);
    const generalExerciseQuality = personalOverall * weights.personalEvidenceWeight + researchOverall * weights.researchEvidenceWeight;
    let overallRecommendationStrength = targetMuscleEffectiveness * 0.72 + generalExerciseQuality * 0.28;
    if (staleness.rotationRecommended) overallRecommendationStrength -= 14;
    else if ([STALENESS.REGRESSING, STALENESS.EXCESSIVELY_FATIGUING].includes(staleness.classification)) overallRecommendationStrength -= 8;
    const mesocycleType = options.mesocycleType;
    if (mesocycleType === MESOCYCLE_TYPES.LOWER_FATIGUE) overallRecommendationStrength += (100 - fatigueCost) * 0.12 + recoveryEfficiency * 0.08;
    if (mesocycleType === MESOCYCLE_TYPES.PRIMARY) overallRecommendationStrength += progressionQuality * 0.07 + easeOfProgression * 0.04;
    if (mesocycleType === MESOCYCLE_TYPES.ALTERNATIVE && options.currentExerciseIds?.includes(candidate.exerciseId) && staleness.classification !== STALENESS.PRODUCTIVE) overallRecommendationStrength -= 7;
    if (mesocycleType === MESOCYCLE_TYPES.SPECIALIZATION && asArray(options.specializationMuscleGroups).map(normalizeMuscleId).includes(normalizeMuscleId(muscleGroupId))) overallRecommendationStrength += muscleSpecificity * 0.06;
    overallRecommendationStrength = round(clamp(overallRecommendationStrength, 0, 100), 2);
    return {
      exerciseId: candidate.exerciseId,
      researchExerciseId: candidate.researchExerciseId,
      muscleGroupId,
      personalHypertrophySupport: round(personalHypertrophySupport, 2),
      progressionQuality: round(progressionQuality, 2),
      recoveryEfficiency: round(recoveryEfficiency, 2),
      repeatability: round(repeatability, 2),
      muscleSpecificity: round(muscleSpecificity, 2),
      targetMuscleEffectiveness,
      targetRelationshipType: canonicalRelationship?.relationship_type || relationship,
      targetSetContribution: round(canonicalContribution, 2),
      lengthenedPositionLoading: round(lengthenedPositionLoading, 2),
      stability: round(stability, 2),
      easeOfProgression: round(easeOfProgression, 2),
      jointTolerance: round(jointTolerance, 2),
      fatigueCost: round(fatigueCost, 2),
      systemicFatigue: round(demands.systemicFatigue, 2),
      spinalLoad: round(demands.spinalLoad, 2),
      gripDemand: round(demands.gripDemand, 2),
      jointStress: round(demands.jointStress, 2),
      highFatigueCompound: demands.highFatigueCompound,
      researchSupport: round(researchSupport, 2),
      personalDataConfidence,
      overallRecommendationStrength,
      personalEvidenceWeight: weights.personalEvidenceWeight,
      researchEvidenceWeight: weights.researchEvidenceWeight,
      confidence: weights.confidence,
      weightingReason: weights.weightingReason,
      staleness
    };
  }

  function equipmentFamily(value) {
    const text = String(value || "").toLowerCase();
    if (/barbell/.test(text)) return "barbell";
    if (/dumbbell/.test(text)) return "dumbbell";
    if (/cable/.test(text)) return "cable";
    if (/machine/.test(text)) return "machine";
    if (/bodyweight/.test(text)) return "bodyweight";
    return normalizeText(text) || "other";
  }

  const EQUIPMENT_REQUIREMENT_OVERRIDES = Object.freeze({
    ex_barbell_bench_press: "barbell+plates+bench+rack", ex_cambered_barbell_bench_press: "cambered_bar+plates+bench+rack",
    ex_close_grip_bench_press: "barbell+plates+bench+rack", ex_overhead_press: "barbell+plates+rack",
    ex_back_squat: "barbell+plates+rack", ex_front_squat: "barbell+plates+rack", ex_deadlift: "barbell+plates",
    ex_good_morning: "barbell+plates+rack", ex_hip_thrust: "barbell+plates+bench", ex_nordic_curl: "bodyweight+nordic_anchor",
    ex_barbell_shrug: "barbell+plates", ex_romanian_deadlift: "barbell+plates|dumbbell", ex_bulgarian_split_squat: "dumbbell|barbell+plates+rack",
    ex_leg_press: "leg_press_machine", ex_hack_squat: "hack_squat_machine", ex_leg_extension: "leg_extension_machine",
    ex_seated_leg_curl: "leg_curl_machine", ex_lying_leg_curl: "leg_curl_machine", ex_hip_adduction_machine: "hip_adduction_machine",
    ex_hip_abduction_machine: "hip_abduction_machine", ex_leg_press_calf_raise: "leg_press_machine", ex_back_extension: "back_extension_bench",
    ex_hanging_leg_raise: "pull_up_bar", ex_ab_wheel: "ab_wheel", ex_preacher_curl: "preacher_bench+barbell+plates|preacher_curl_machine",
    ex_incline_dumbbell_press: "dumbbell+incline_bench", ex_incline_dumbbell_curl: "dumbbell+incline_bench",
    ex_wrist_curl: "dumbbell|barbell+plates", ex_reverse_wrist_curl: "dumbbell|barbell+plates", ex_farmers_carry: "dumbbell|trap_bar+plates",
    ex_standing_calf_raise: "selectorized_machine|dumbbell|barbell+plates", ex_neck_flexion: "neck_harness|plates", ex_neck_extension: "neck_harness|bands"
  });

  const EQUIPMENT_REQUIREMENT_FIELDS = Object.freeze([
    "equipment_requirements", "equipmentRequirements", "required_equipment", "requiredEquipment"
  ]);
  const EQUIPMENT_SUMMARY_FIELDS = Object.freeze(["equipment", "equipment_type", "equipmentType"]);
  const PRIMARY_EQUIPMENT_FAMILIES = Object.freeze(new Set([
    "barbell", "dumbbell", "cable", "machine", "bodyweight", "bands", "kettlebell", "trap_bar", "cambered_bar", "ez_bar"
  ]));

  function normalizeEquipmentItem(value) {
    if (typeof value !== "string" || !value.trim()) throw new Error("Equipment values must be non-empty strings.");
    const item = normalizeText(value);
    if (!item) throw new Error("Equipment values must contain a recognized name.");
    const aliases = {
      dumbbells: "dumbbell",
      cables: "cable_station",
      cable: "cable_station",
      cable_machine: "cable_station",
      none: "bodyweight",
      no_equipment: "bodyweight",
      machine: "selectorized_machine",
      leg_press: "leg_press_machine"
    };
    return aliases[item] || item;
  }

  function normalizeEquipmentRequirementOptions(options, label) {
    if (!Array.isArray(options) || !options.length) throw new Error(`${label} must declare at least one equipment option.`);
    const normalized = options.map((option) => {
      if (!Array.isArray(option) || !option.length) throw new Error(`${label} contains an empty or malformed equipment option.`);
      const items = unique(option.map((item) => normalizeEquipmentItem(item)));
      if (!items.length) throw new Error(`${label} contains an empty equipment option.`);
      return items;
    });
    return minimizePositiveEquipmentOptions(normalized);
  }

  function minimizePositiveEquipmentOptions(options) {
    if (!Array.isArray(options)) throw new Error("Equipment Boolean options must be an array.");
    const seen = new Set();
    const deduplicated = [];
    options.forEach((option) => {
      if (!Array.isArray(option) || !option.length || option.some((item) => typeof item !== "string" || !item.trim())) {
        throw new Error("Equipment Boolean options cannot contain empty or malformed conjunctions.");
      }
      const items = unique(option);
      const key = [...items].sort().join("+");
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(items);
      }
    });
    return deduplicated.filter((candidate) => !deduplicated.some((broader) => (
      broader.length < candidate.length && broader.every((item) => candidate.includes(item))
    )));
  }

  function canonicalEquipmentOptions(options) {
    return minimizePositiveEquipmentOptions(options)
      .map((option) => [...option].sort())
      .sort((left, right) => left.join("+").localeCompare(right.join("+")));
  }

  function parseEquipmentRequirementString(value, label) {
    const raw = value.trim();
    if (!raw) throw new Error(`${label} must be a non-empty string or string array.`);
    const normalizedKey = normalizeText(raw);
    const special = {
      bodyweight: [["bodyweight"]],
      bodyweight_or_belt: [["bodyweight"], ["bodyweight", "dip_belt", "plates"]],
      cable_machine: [["cable_station"]],
      dumbbell_or_machine: [["dumbbell"], ["selectorized_machine"]],
      machine_or_free_weight: [["selectorized_machine"], ["dumbbell"], ["barbell", "plates"]]
    };
    if (special[normalizedKey]) return normalizeEquipmentRequirementOptions(special[normalizedKey], label);
    const delimited = raw
      .replace(/_or_|\s+or\s+/gi, "|")
      .replace(/_and_|\s+and\s+/gi, "+");
    const options = delimited.split("|").map((option) => option.split("+"));
    if (options.some((option) => option.some((item) => !item.trim()))) throw new Error(`${label} contains an empty or malformed equipment value.`);
    return normalizeEquipmentRequirementOptions(options, label);
  }

  function parseEquipmentRequirementValue(value, label) {
    if (typeof value === "string") return parseEquipmentRequirementString(value, label);
    if (!Array.isArray(value) || !value.length) throw new Error(`${label} must be a non-empty string or string array.`);
    const nested = value.every(Array.isArray);
    const flat = value.every((item) => !Array.isArray(item));
    if (!nested && !flat) throw new Error(`${label} cannot mix equipment strings and option arrays.`);
    const options = nested ? value : [value];
    options.forEach((option) => {
      if (!option.length || option.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`${label} contains a malformed equipment array.`);
      if (option.some((item) => /[|+]|_or_|_and_|\s+or\s+|\s+and\s+/i.test(item))) {
        throw new Error(`${label} array entries must be atomic equipment names; express alternatives as nested arrays.`);
      }
    });
    return normalizeEquipmentRequirementOptions(options, label);
  }

  function equipmentOptionsKey(options) {
    return canonicalEquipmentOptions(options).map((option) => option.join("+")).join("|");
  }

  function declaredEquipmentMetadata(exercise, fields, label) {
    const entries = fields
      .filter((field) => Object.prototype.hasOwnProperty.call(exercise, field))
      .map((field) => ({ field, options: parseEquipmentRequirementValue(exercise[field], `${label} field ${field}`) }));
    if (!entries.length) return { declared: false, options: [] };
    const expected = equipmentOptionsKey(entries[0].options);
    const conflicting = entries.find((entry) => equipmentOptionsKey(entry.options) !== expected);
    if (conflicting) throw new Error(`Contradictory ${label} aliases ${entries[0].field} and ${conflicting.field}.`);
    return { declared: true, options: entries[0].options };
  }

  function equipmentOptionFamilies(option) {
    const families = unique(option.map(equipmentFamily));
    const primary = families.filter((family) => PRIMARY_EQUIPMENT_FAMILIES.has(family));
    return primary.length ? primary : families;
  }

  function equipmentMetadataIsConsistent(requirements, summary) {
    const minimizedRequirements = minimizePositiveEquipmentOptions(requirements);
    const minimizedSummary = minimizePositiveEquipmentOptions(summary);
    return minimizedRequirements.every((requirementOption) => {
      const requirementFamilies = equipmentOptionFamilies(requirementOption);
      return minimizedSummary.some((summaryOption) => {
        const summaryFamilies = equipmentOptionFamilies(summaryOption);
        return requirementFamilies.some((family) => summaryFamilies.includes(family));
      });
    });
  }

  function hasDeclaredEquipmentMetadata(exercise) {
    return Boolean(exercise && typeof exercise === "object" && !Array.isArray(exercise)
      && [...EQUIPMENT_REQUIREMENT_FIELDS, ...EQUIPMENT_SUMMARY_FIELDS].some((field) => Object.prototype.hasOwnProperty.call(exercise, field)));
  }

  function resolveDeclaredEquipmentMetadata(exercise) {
    if (!exercise || typeof exercise !== "object" || Array.isArray(exercise)) throw new Error("Equipment metadata must be supplied as an exercise object.");
    const requirements = declaredEquipmentMetadata(exercise, EQUIPMENT_REQUIREMENT_FIELDS, "equipment requirements");
    const summary = declaredEquipmentMetadata(exercise, EQUIPMENT_SUMMARY_FIELDS, "equipment summary");
    if (requirements.declared && summary.declared && !equipmentMetadataIsConsistent(requirements.options, summary.options)) {
      throw new Error("Contradictory equipment requirements and equipment summary metadata.");
    }
    if (requirements.declared) return { declared: true, detailLevel: 2, options: requirements.options };
    if (summary.declared) return { declared: true, detailLevel: 1, options: summary.options };
    return { declared: false, detailLevel: 0, options: [] };
  }

  function equipmentRequirementOptions(exercise = {}) {
    const declared = resolveDeclaredEquipmentMetadata(exercise);
    if (declared.detailLevel === 2) return declared.options;
    const override = EQUIPMENT_REQUIREMENT_OVERRIDES[exercise.exercise_id || exercise.exerciseId];
    if (override) return parseEquipmentRequirementString(override, "built-in equipment requirements");
    return declared.options;
  }

  function normalizeAvailableEquipmentInput(availableEquipment) {
    if (availableEquipment === undefined || availableEquipment === null) return { provided: false, valid: true, values: [] };
    if (typeof availableEquipment !== "string" && !Array.isArray(availableEquipment)) return { provided: true, valid: false, values: [] };
    const values = Array.isArray(availableEquipment) ? availableEquipment : [availableEquipment];
    if (!values.length || values.some((value) => typeof value !== "string" || !value.trim() || Array.isArray(value))) {
      return { provided: true, valid: false, values: [] };
    }
    if (values.some((value) => /[|+;,/]|_or_|_and_|\s+or\s+|\s+and\s+/i.test(value))) return { provided: true, valid: false, values: [] };
    try {
      return { provided: true, valid: true, values: unique(values.map((value) => normalizeEquipmentItem(value))) };
    } catch (_error) {
      return { provided: true, valid: false, values: [] };
    }
  }

  function equipmentCompatible(exercise, availableEquipment) {
    const bundles = {
      bodyweight: ["bodyweight"], bands: ["bands"], dumbbell: ["dumbbell"],
      barbell: ["barbell", "plates"], rack: ["rack", "bench", "incline_bench", "pull_up_bar", "nordic_anchor"],
      cable_station: ["cable_station", "pull_up_bar"]
    };
    const requirements = minimizePositiveEquipmentOptions(equipmentRequirementOptions(exercise));
    const input = normalizeAvailableEquipmentInput(availableEquipment);
    if (!input.valid) return { eligible: false, requirements, missing: ["valid available equipment input"], equipmentInput: input };
    if (!input.provided) return { eligible: true, requirements, missing: [], equipmentInput: input };
    const available = new Set(input.values.flatMap((item) => bundles[item] || [item]));
    if (available.has("all")) return { eligible: true, requirements, missing: [], equipmentInput: input };
    if (!requirements.length) return { eligible: false, requirements, missing: ["verified equipment metadata"], equipmentInput: input };
    const matched = requirements.some((option) => option.every((item) => available.has(item)));
    const missing = requirements.map((option) => option.filter((item) => !available.has(item))).sort((a, b) => a.length - b.length)[0] || [];
    return { eligible: matched, requirements, missing, equipmentInput: input };
  }

  function reconciledEquipmentSource(selectedIdentity, canonicalSource = null) {
    rejectInvalidTrustedIdentity(selectedIdentity);
    const selectedSource = selectedIdentity?.source || {};
    const source = hasDeclaredEquipmentMetadata(selectedSource) ? selectedSource : canonicalSource || selectedSource;
    equipmentRequirementOptions(source);
    return source;
  }

  function fallbackSelectedIdentityForCandidate(candidate) {
    const sources = [candidate.personalScore, candidate.personalPrescription, candidate.muscleScore]
      .filter((source) => source && typeof source === "object" && Object.keys(source).length);
    if (!sources.length) return null;
    const identities = sources.map((source) => ({ source }));
    const equipment = reconcileTrustedEquipmentDeclarationBatch(identities, candidate.exerciseId || "candidate");
    return {
      exerciseId: candidate.exerciseId || null,
      researchExerciseId: candidate.researchExerciseId || null,
      invalid: false,
      source: mergeTrustedCatalogSourceBatch(identities, equipment, candidate.researchExerciseId || null)
    };
  }

  function resolveCandidateEquipmentProfile(candidate) {
    try {
      const selectedIdentity = Object.prototype.hasOwnProperty.call(candidate, "selectedIdentity")
        ? candidate.selectedIdentity
        : fallbackSelectedIdentityForCandidate(candidate);
      const source = reconciledEquipmentSource(selectedIdentity, candidate.researchExercise || null);
      const requirements = canonicalEquipmentOptions(equipmentRequirementOptions(source));
      return {
        invalid: false,
        invalidReason: null,
        origin: selectedIdentity?.researchIdentitySource === "canonical_id"
          ? "research"
          : selectedIdentity && hasDeclaredEquipmentMetadata(selectedIdentity.source || {})
            ? "personal"
            : candidate.researchExercise ? "research" : "unmapped_personal",
        source,
        requirements
      };
    } catch (error) {
      return {
        invalid: true,
        invalidReason: error instanceof Error ? error.message : String(error || "Invalid reconciled equipment identity."),
        origin: "invalid",
        source: {},
        requirements: []
      };
    }
  }

  function candidateEquipmentProfile(candidate) {
    return candidate.equipmentProfile || resolveCandidateEquipmentProfile(candidate);
  }

  function equipmentCompatibilityForCandidate(candidate, availableEquipment) {
    const profile = candidateEquipmentProfile(candidate);
    if (profile.invalid) {
      return {
        eligible: false,
        requirements: [],
        missing: ["valid reconciled equipment identity"],
        equipmentInput: normalizeAvailableEquipmentInput(availableEquipment),
        invalidReason: profile.invalidReason
      };
    }
    return equipmentCompatible(profile.source, availableEquipment);
  }

  function equipmentRequirementFamilySignature(requirements) {
    if (!requirements.length) return "other";
    return canonicalEquipmentOptions(requirements)
      .map((option) => equipmentOptionFamilies(option).sort().join("+"))
      .sort()
      .join("|") || "other";
  }

  const JOINT_ACTIONS_BY_PATTERN = Object.freeze({
    horizontal_push: ["shoulder_horizontal_adduction", "elbow_extension"], vertical_push: ["shoulder_flexion", "elbow_extension"],
    horizontal_pull: ["shoulder_extension", "scapular_retraction", "elbow_flexion"], vertical_pull: ["shoulder_adduction", "elbow_flexion"],
    squat: ["knee_extension", "hip_extension"], lunge: ["knee_extension", "hip_extension"], hinge: ["hip_extension"],
    hip_extension: ["hip_extension"], knee_extension: ["knee_extension"], knee_flexion: ["knee_flexion"],
    elbow_flexion: ["elbow_flexion"], elbow_extension: ["elbow_extension"], shoulder_abduction: ["shoulder_abduction"],
    shoulder_horizontal_abduction: ["shoulder_horizontal_abduction", "scapular_retraction"], hip_abduction: ["hip_abduction"],
    hip_adduction: ["hip_adduction"], plantar_flexion: ["ankle_plantar_flexion"], spinal_flexion: ["spinal_flexion"],
    anti_extension: ["trunk_anti_extension"], anti_rotation: ["trunk_anti_rotation"], loaded_carry: ["grip", "trunk_stabilization"],
    wrist_flexion: ["wrist_flexion"], wrist_extension: ["wrist_extension"], neck_flexion: ["cervical_flexion"],
    neck_extension: ["cervical_extension"], scapular_elevation: ["scapular_elevation"]
  });

  function jointActionsForExercise(exercise = {}) {
    const explicit = splitMulti(exercise.joint_actions || exercise.jointActions);
    if (explicit.length) return explicit;
    const name = normalizeText(exercise.exercise_name || exercise.exerciseName);
    if (/fly|crossover|pec_deck/.test(name)) return ["shoulder_horizontal_adduction"];
    if (/pullover|straight_arm_pulldown/.test(name)) return ["shoulder_extension"];
    return JOINT_ACTIONS_BY_PATTERN[normalizeText(exercise.movement_pattern || exercise.movementPattern)] || [];
  }

  function diversitySignature(candidate) {
    const exercise = candidate.researchExercise || {};
    const equipmentProfile = candidateEquipmentProfile(candidate);
    if (equipmentProfile.invalid) throw new Error(equipmentProfile.invalidReason);
    const repLow = number(exercise.recommended_rep_range_low, 8);
    return {
      movement: exercise.movement_pattern || "unknown",
      equipment: equipmentRequirementFamilySignature(equipmentProfile.requirements),
      equipmentRequirements: deepClone(equipmentProfile.requirements),
      jointActions: jointActionsForExercise(exercise),
      region: exercise.muscle_subdivisions_emphasized || candidate.muscleScore?.regional_function || candidate.muscleScore?.regionalFunction || "general",
      stability: String(exercise.stability_demand || "moderate"),
      loading: repLow <= 6 ? "high_load" : repLow >= 10 ? "moderate_light_load" : "moderate_load"
    };
  }

  function diversityPenalty(candidate, selected) {
    const signature = diversitySignature(candidate);
    return selected.reduce((penalty, existing) => {
      const other = diversitySignature(existing.candidate);
      let overlap = 0;
      if (signature.movement === other.movement) overlap += 7;
      if (signature.equipment === other.equipment) overlap += 5;
      if (signature.region === other.region) overlap += 5;
      if (signature.stability === other.stability) overlap += 2;
      if (signature.loading === other.loading) overlap += 2;
      if (signature.movement === other.movement && signature.equipment === other.equipment && signature.region === other.region) overlap += 9;
      return penalty + overlap;
    }, 0);
  }

  function normalizeRole(value, exercise = {}) {
    exercise = exercise || {};
    const role = String(value || "").toLowerCase();
    if (ROLES.includes(role)) return role;
    if (role === "technique_or_maintenance_lift") return "maintenance_lift";
    if (role === "deload_substitute") return "deload_variation";
    if (role === "remove_or_deprioritize") return "maintenance_lift";
    const type = String(exercise.exercise_type || exercise.exerciseType || "").toLowerCase();
    return /isolation/.test(type) || isIsolationExercise(exercise) ? "secondary_hypertrophy_lift" : "primary_progression_lift";
  }

  function inferPoolRole(item, index, selected) {
    const requested = normalizeRole(item.candidate.personalPrescription?.role, item.candidate.researchExercise);
    if (item.score.staleness.rotationRecommended) return "deload_variation";
    if (index === 0 && requested === "primary_progression_lift") return "primary_progression_lift";
    const lowestFatigue = selected.reduce((best, entry) => entry.score.fatigueCost < best.score.fatigueCost ? entry : best, selected[0]);
    if (item === lowestFatigue && index > 0) return "low_fatigue_accessory";
    return requested === "primary_progression_lift" && index > 0 ? "secondary_hypertrophy_lift" : requested;
  }

  function isIsolationExercise(exercise = {}) {
    const type = String(exercise.exercise_type || exercise.exerciseType || "").toLowerCase();
    const pattern = `${exercise.movement_pattern || exercise.movementPattern || ""} ${exercise.exercise_name || exercise.exerciseName || ""}`.toLowerCase();
    return /isolation/.test(type) || /elbow_flexion|elbow_extension|knee_extension|knee_flexion|shoulder_abduction|fly|curl|extension/.test(pattern);
  }

  function parseObservedSetPattern(value) {
    const text = String(value || "").toLowerCase();
    const top = text.match(/(\d+)\s*top/);
    const backoff = text.match(/(\d+)\s*back[ -]?off/);
    const straight = text.match(/(\d+)\s*straight/);
    return { top: number(top?.[1]), backoff: number(backoff?.[1]), straight: number(straight?.[1]), available: Boolean(top || backoff || straight) };
  }

  function chooseSetStructure(options = {}) {
    const exercise = options.researchExercise || {};
    const prescription = options.personalPrescription || {};
    const role = normalizeRole(options.role, exercise);
    const history = normalizeHistory(options.history);
    const recent = history.slice(-6);
    const targetSets = Math.max(1, number(options.workingSets?.target, 3));
    const repRange = options.repRange || { min: 6, target: 8, max: 12 };
    const isolation = isIsolationExercise(exercise) || role === "low_fatigue_accessory";
    const suitability = String(exercise.top_set_backoff_suitability || exercise.topSetBackoffSuitability || "").toLowerCase();
    const personalTopCount = number(prescription.top_set_structure?.recommended_count || prescription.topSetStructure?.recommendedCount);
    const personalBackoffCount = number(prescription.backoff_set_structure?.recommended_count || prescription.backoffSetStructure?.recommendedCount);
    const productivePattern = parseObservedSetPattern(
      prescription.recommended_future_range?.top_and_backoff_pattern || prescription.recommendedFutureRange?.topAndBackoffPattern ||
      prescription.observed_best_range?.top_and_backoff_pattern || prescription.observedBestRange?.topAndBackoffPattern
    );
    const patternSample = number(prescription.observed_best_range?.qualifying_sessions || prescription.observedBestRange?.qualifyingSessions);
    const structuralConflict = productivePattern.available && (productivePattern.top !== personalTopCount || productivePattern.backoff !== personalBackoffCount);
    const observedTopCount = average(recent.map((item) => item.topSetCount), 0);
    const observedBackoffCount = average(recent.map((item) => item.backoffSetCount), 0);
    const observedStraightCount = average(recent.map((item) => item.straightSetCount), 0);
    const repLoss = average(recent.map((item) => item.repLossPercent), 0);
    const recoveryCost = average(recent.map((item) => item.recoveryCost), 35);
    const highPersonalWeight = number(options.personalEvidenceWeight) >= 0.68;
    const explicitlyStraight = personalTopCount === 0 && personalBackoffCount === 0 && observedStraightCount >= 2 && highPersonalWeight;
    const supportedTopCount = recent.length >= 3 ? observedTopCount : patternSample >= 3 ? productivePattern.top : personalTopCount;
    const supportedBackoffCount = recent.length >= 3 ? observedBackoffCount : patternSample >= 3 ? productivePattern.backoff : personalBackoffCount;
    const repeatedTopSetsSupported = supportedTopCount >= 1.75 && supportedBackoffCount < 0.5 && repLoss <= 15 && recoveryCost < 60;
    let setStructure = "straight_sets";
    let reasoning = "Straight sets keep execution and target-muscle tension consistent without an unnecessary peak set.";
    if (targetSets <= 1) {
      setStructure = "single_working_set";
      reasoning = "Only one working set is prescribed for this maintenance or deload exposure.";
    } else if (isolation) {
      setStructure = "straight_sets";
      reasoning = "This accessory/isolation lift gains little tracking value from a heavy peak set; repeatable tension and simple progression are preferred.";
    } else if (repeatedTopSetsSupported) {
      setStructure = "multiple_top_sets";
      reasoning = "Comparable high-quality sets have remained stable with acceptable rep loss and recovery cost, supporting multiple similar top sets.";
    } else if (!explicitlyStraight && role === "primary_progression_lift" && !/inappropriate|avoid|not_recommended/.test(suitability)) {
      setStructure = "top_set_backoff";
      reasoning = supportedTopCount > 0 && supportedBackoffCount > 0
        ? "Personal sessions support a measurable top set followed by productive lower-fatigue volume."
        : "A safe, measurable primary compound benefits from one tracking top set while back-off work supplies volume at lower fatigue.";
    } else if (explicitlyStraight) {
      reasoning = "High-confidence personal data shows stable straight-set performance, so generic top-set programming does not override that successful structure.";
    }
    const topMax = Math.max(repRange.min + 1, Math.min(repRange.max, Math.round(number(repRange.target, (repRange.min + repRange.max) / 2))));
    const topMin = Math.min(repRange.min, topMax - 1);
    const backoffMin = Math.max(topMin + 1, Math.round(number(repRange.target, topMax)));
    const observedReductions = recent.map((item) => item.loadReductionPercent).filter((value) => value !== null && value > 0 && value <= DEFAULT_POLICY.maximumBackoffLoadReductionPercent);
    const observedReduction = observedReductions.length ? average(observedReductions) : DEFAULT_POLICY.backoffReduction.target;
    const reductionTarget = clamp(Math.round(observedReduction), DEFAULT_POLICY.backoffReduction.min, DEFAULT_POLICY.backoffReduction.max);
    const topSet = setStructure === "top_set_backoff" || setStructure === "multiple_top_sets" ? {
      enabled: true,
      count: setStructure === "multiple_top_sets" ? targetSets : 1,
      repRange: { min: topMin, max: topMax },
      targetRpe: role === "primary_progression_lift" ? 8.5 : 8,
      targetRir: role === "primary_progression_lift" ? 1.5 : 2
    } : undefined;
    const backoffSets = setStructure === "top_set_backoff" ? {
      count: Math.max(1, targetSets - 1),
      loadReductionPercent: {
        min: Math.max(DEFAULT_POLICY.backoffReduction.min, reductionTarget - 4),
        target: reductionTarget,
        max: Math.min(DEFAULT_POLICY.maximumBackoffLoadReductionPercent, reductionTarget + 6)
      },
      repRange: { min: Math.min(backoffMin, repRange.max - 1), max: repRange.max },
      targetRpe: 7.5,
      targetRir: 2.5,
      maximumAcceptableRepLossPercent: DEFAULT_POLICY.maximumRepLossPercent,
      maximumAcceptableLoadReductionPercent: DEFAULT_POLICY.maximumBackoffLoadReductionPercent,
      conversionRule: "Convert the remaining work to lighter straight sets when technique breaks down, the back-off load must fall more than the maximum, pain appears, or rep loss exceeds the quality limit."
    } : undefined;
    if (structuralConflict) reasoning += " The all-exposure structure count and productive sweet-spot pattern disagree, so the engine used recent comparable sessions first, then the productive pattern only when at least three qualifying sessions existed.";
    return { setStructure, reasoning, topSet, backoffSets, evidenceConflict: structuralConflict ? "personal_structure_fields_disagree" : null };
  }

  function personalPrescriptionRanges(prescription = {}) {
    const future = prescription.recommended_future_range || prescription.recommendedFutureRange || {};
    return {
      setsPerSession: normalizeRange(firstPresent(future.sets_per_session, future.setsPerSession, prescription.recommended_sets_per_session, prescription.recommendedSetsPerSession), null, true),
      weeklySets: normalizeRange(firstPresent(future.weekly_hard_sets, future.weeklyHardSets, prescription.recommended_weekly_sets, prescription.recommendedWeeklySets), null, true),
      frequency: normalizeRange(firstPresent(future.sessions_per_week, future.sessionsPerWeek, prescription.recommended_sessions_per_week, prescription.recommendedSessionsPerWeek)),
      repRange: normalizeRange(firstPresent(future.rep_range, future.repRange, prescription.recommended_rep_range, prescription.recommendedRepRange), null, true),
      rpe: normalizeRange(firstPresent(future.rpe, prescription.recommended_rpe, prescription.recommendedRpe)),
      rir: normalizeRange(firstPresent(future.rir, prescription.recommended_rir, prescription.recommendedRir)),
      restSeconds: normalizeRange(firstPresent(future.rest_seconds, future.restSeconds, prescription.recommended_rest_seconds, prescription.recommendedRestSeconds), null, true)
    };
  }

  function determineVolumePrescription(options = {}) {
    const personal = options.personalRanges || {};
    const research = options.researchDefaults || {};
    const weight = number(options.personalEvidenceWeight);
    const perExercise = blendRange(personal.setsPerSession, research.setsPerSession, weight, { integer: true });
    const weekly = blendRange(personal.weeklySets, research.weeklySets, weight, { integer: true });
    const highestObserved = number(
      options.personalPrescription?.highest_recoverable_range_observed?.max_weekly_hard_sets ||
      options.personalPrescription?.highestRecoverableRangeObserved?.maxWeeklyHardSets,
      weekly?.max
    );
    let targetSets = Math.max(1, number(perExercise?.target, 3));
    let weeklyTarget = Math.max(targetSets, number(weekly?.target, targetSets * 2));
    let adjustmentType = "normal";
    const staleness = options.staleness || {};
    const mesocycleType = options.mesocycleType;
    const specialization = asArray(options.specializationMuscleGroups).map(normalizeMuscleId).includes(normalizeMuscleId(options.muscleGroupId));
    let reason = "The current set target blends the personal productive range with the research operating range.";
    if (mesocycleType === MESOCYCLE_TYPES.LOWER_FATIGUE) {
      targetSets = Math.max(1, Math.round(targetSets * DEFAULT_POLICY.lowerFatigueVolumeFactor));
      weeklyTarget = Math.max(targetSets, Math.round(weeklyTarget * DEFAULT_POLICY.lowerFatigueVolumeFactor));
      reason = "The resensitization block intentionally uses lower volume and lower-fatigue selections.";
    } else if (mesocycleType === MESOCYCLE_TYPES.SPECIALIZATION && specialization) {
      targetSets = Math.min(number(perExercise?.max, targetSets + 1), Math.max(targetSets + 1, Math.round(targetSets * DEFAULT_POLICY.specializationVolumeFactor)));
      weeklyTarget = Math.min(number(weekly?.max, weeklyTarget + 2), Math.round(weeklyTarget * DEFAULT_POLICY.specializationVolumeFactor));
      reason = "Specialization adds recoverable work to the selected muscle while total-program workload is constrained elsewhere.";
    } else if (mesocycleType === MESOCYCLE_TYPES.SPECIALIZATION && !specialization) {
      weeklyTarget = Math.max(number(weekly?.min, targetSets), Math.round(weeklyTarget * 0.9));
      reason = "Non-specialized muscles remain near maintenance so specialization does not inflate total recoverable workload.";
    }
    if ([STALENESS.REGRESSING, STALENESS.EXCESSIVELY_FATIGUING, STALENESS.ROTATION_CANDIDATE].includes(staleness.classification)) {
      targetSets = Math.max(1, targetSets - 1);
      weeklyTarget = Math.max(targetSets, weeklyTarget - 2);
      adjustmentType = "reduce_volume";
      reason = "Repeated regression or fatigue supports reducing stress before considering any volume increase.";
    } else if ([STALENESS.STALLED, STALENESS.APPROACHING_PLATEAU].includes(staleness.classification)) {
      reason = "Volume is held during the plateau check; first pursue reps, load, execution, recovery, or a variation change rather than automatically adding sets.";
    }
    const currentWeeklySets = nullableNumber(options.currentWeeklySets);
    if (currentWeeklySets !== null && currentWeeklySets > number(weekly?.max, weeklyTarget)) {
      targetSets = Math.max(1, targetSets - 1);
      weeklyTarget = Math.min(weeklyTarget, number(weekly?.max, weeklyTarget));
      adjustmentType = "reduce_volume";
      reason = `Current weekly volume (${round(currentWeeklySets, 1)} effective sets) exceeds the blended operating range, so one set is removed instead of adding more work.`;
    }
    return {
      adjustmentType,
      perExercise: {
        recommendedStarting: number(perExercise?.min, Math.max(1, targetSets - 1)),
        normalOperatingRange: { min: number(perExercise?.min, 2), max: number(perExercise?.max, 5) },
        currentPrescribed: targetSets,
        highestRecoverableObserved: Math.max(targetSets, number(options.personalPrescription?.highest_recoverable_range_observed?.max_sets_per_session, number(perExercise?.max, targetSets))),
        deload: Math.max(1, Math.round(targetSets * DEFAULT_POLICY.deloadVolumeFactor)),
        researchFallbackRange: { min: number(research.setsPerSession?.min, 2), max: number(research.setsPerSession?.max, 5) }
      },
      perMusclePerSession: {
        min: Math.max(1, number(perExercise?.min, 2)),
        target: targetSets,
        max: Math.max(targetSets, number(perExercise?.max, 5))
      },
      perMusclePerWeek: {
        recommendedStarting: number(weekly?.min, 6),
        normalOperatingRange: { min: number(weekly?.min, 6), max: number(weekly?.max, 16) },
        currentPrescribed: weeklyTarget,
        highestRecoverableObserved: highestObserved,
        deload: Math.max(2, Math.round(weeklyTarget * DEFAULT_POLICY.deloadVolumeFactor)),
        researchFallbackRange: { min: number(research.weeklySets?.min, 6), max: number(research.weeklySets?.max, 16) }
      },
      reason
    };
  }

  function determineProgressionDecision(options = {}) {
    const history = normalizeHistory(options.history).filter((item) => !item.prescribedReduction);
    const recent = history.slice(-4);
    const last = recent.at(-1);
    const repRange = options.repRange || { min: 6, max: 12 };
    const rpeRange = options.targetRpe || { min: 7, max: 9 };
    const staleness = options.staleness || assessExerciseStaleness(history);
    const structure = options.setStructure || "straight_sets";
    const method = options.progressionMethod || "double_progression";
    const normalizedMethod = String(method).toLowerCase();
    if (!last) {
      return {
        action: "establish_baseline",
        recommendationType: "normal",
        progressionMethod: method,
        instruction: `Establish a controlled baseline inside ${repRange.min}-${repRange.max} reps at the target effort; do not force a load jump without comparable data.`,
        holdRule: "Hold load until execution, ROM, and effort are repeatable.",
        regressionRule: "If the first comparable exposure is outside the target, adjust the load before changing volume."
      };
    }
    const returnBaselineRequired = staleness.classification === STALENESS.INSUFFICIENT
      && asArray(staleness.reasons).some((reason) => /latest comparable exposure|return-to-training baseline/i.test(reason));
    if (returnBaselineRequired) {
      return {
        action: "establish_baseline",
        recommendationType: "hold",
        progressionMethod: method,
        instruction: "Hold progression and establish a controlled return-to-training baseline at pain-free technique and target effort before changing load, repetitions, or volume.",
        holdRule: "Keep the last normal prescription as historical context only; the first current comparable exposure establishes the new baseline.",
        regressionRule: "Adjust conservatively if the return exposure exceeds target effort, loses technique, or cannot complete the prescribed work."
      };
    }
    const regressions = recent.slice(-2).filter((item) => /regress|declin/.test(item.status) || number(item.progressionPercent) < -1.5).length;
    const risingRpe = linearSlope(recent.map((item) => item.averageRpe)) >= 0.3;
    const lastReps = last.reps.length ? last.reps : [number(last.raw.reps || last.raw.repetitions)];
    const acceptableRepLoss = number(options.maximumRepLossPercent, DEFAULT_POLICY.maximumRepLossPercent) / 100;
    const firstSetAtTop = lastReps.length > 0 && lastReps[0] >= number(repRange.max);
    const laterSetsConverged = lastReps.slice(1).every((reps) => reps >= Math.ceil(number(repRange.max) * (1 - acceptableRepLoss)));
    const allAtTop = firstSetAtTop && laterSetsConverged;
    const effortRecorded = last.averageRpe !== null || last.rpes.length > 0;
    const effortAcceptable = effortRecorded && (last.averageRpe === null || last.averageRpe <= number(rpeRange.max, 9)) && last.rpes.every((rpe) => rpe <= number(rpeRange.max, 9));
    const topReached = lastReps[0] >= number(repRange.max) && effortAcceptable;
    if (staleness.deloadCandidate && regressions >= 2) {
      return {
        action: "exercise_deload",
        recommendationType: "exercise_deload",
        progressionMethod: method,
        instruction: "Begin an exercise-specific deload: reduce working sets about 50%, lower load 7.5-12%, avoid failure work, and reassess after one lower-fatigue exposure.",
        holdRule: "Do not resume progression until warm-ups and a comparable work set stabilize.",
        regressionRule: "If regression or pain persists after the deload, rotate to the preferred replacement."
      };
    }
    const invalidTechnique = last.techniqueValid === false || /invalid|poor|breakdown|failed/.test(last.techniqueQuality);
    const effortTooHigh = effortRecorded && !effortAcceptable;
    const blockers = [
      last.pain ? "current pain or discomfort" : "",
      invalidTechnique ? "invalid or deteriorated technique" : "",
      !effortRecorded ? "missing RPE evidence" : "",
      effortTooHigh ? "RPE above the prescribed ceiling" : "",
      last.incompletePrescribedWork ? "incomplete prescribed working sets" : ""
    ].filter(Boolean);
    if (blockers.length) {
      return {
        action: last.pain ? "hold_for_pain_free_modification" : invalidTechnique ? "hold_for_technique" : "hold_for_complete_evidence",
        recommendationType: "hold",
        progressionMethod: method,
        instruction: `Do not progress this exposure because of ${blockers.join(", ")}. Repeat only with pain-free execution, complete prescribed work, valid technique, and recorded effort inside the target range.`,
        holdRule: "Hold load, repetitions, and volume until the blocking evidence is resolved on a comparable exposure.",
        regressionRule: last.pain ? "Use a pain-free substitute or seek qualified evaluation when pain is severe, unexplained, or persistent." : "Reduce load or complexity if valid technique and target effort cannot be restored."
      };
    }
    if (risingRpe && !allAtTop) {
      return {
        action: "hold_load",
        recommendationType: "hold",
        progressionMethod: "rpe_adjusted_progression",
        instruction: "Repeat the same load and rep target, aiming to make the work at least 0.5 RPE easier before adding load or sets.",
        holdRule: "Hold while RPE rises at flat performance.",
        regressionRule: "After two comparable regressions, remove one set or deload the exercise rather than adding volume."
      };
    }
    if (regressions >= 2) {
      return {
        action: "reduce_one_set",
        recommendationType: "reduce_volume",
        progressionMethod: method,
        instruction: "Remove one working set for the next exposure and hold load; rebuild only after comparable performance stabilizes.",
        holdRule: "Hold load and volume after the one-set reduction until performance is stable.",
        regressionRule: "Escalate to an exercise deload if fatigue or another regression remains."
      };
    }
    if (/fixed[_ -]?load/.test(normalizedMethod)) {
      return allAtTop ? {
        action: "hold_fixed_load",
        recommendationType: "hold",
        progressionMethod: "fixed_load_progression",
        instruction: "Keep the fixed load and repeat the completed rep target while making the sets easier or cleaner; change load only when the fixed-load phase ends.",
        holdRule: "Hold load for the planned fixed-load phase even after the rep ceiling is reached.",
        regressionRule: "If reps or technique regress twice at the fixed load, remove one set or reset the fixed load instead of adding volume."
      } : {
        action: "add_one_rep_fixed_load",
        recommendationType: "progress",
        progressionMethod: "fixed_load_progression",
        instruction: "Keep load fixed and add one repetition to the lowest-performing eligible set without exceeding target RPE.",
        holdRule: "Hold reps when another repetition would exceed target RPE or reduce ROM.",
        regressionRule: "After two comparable regressions, reduce one set or reset the fixed load."
      };
    }
    if (/volume/.test(normalizedMethod) && allAtTop && effortAcceptable && staleness.classification === STALENESS.PRODUCTIVE && number(options.workingSets?.target) < number(options.workingSets?.max, Infinity)) {
      return {
        action: "add_one_working_set",
        recommendationType: "progress",
        progressionMethod: "volume_progression",
        instruction: "Add one working set within the prescribed operating range because all current sets reached the rep ceiling at manageable effort; keep load and execution constant.",
        holdRule: "Hold volume if recovery, completion, technique, or performance worsens after the added set.",
        regressionRule: "Remove the added set after two comparable regressions or a converging recovery decline."
      };
    }
    if (structure === "top_set_backoff") {
      if (topReached) {
        const backoffReps = last.raw.backoffReps || last.raw.backoff_reps;
        const backoffAtTop = Array.isArray(backoffReps) ? backoffReps.every((value) => number(value) >= number(repRange.max)) : false;
        return backoffAtTop ? {
          action: "increase_top_set_load",
          recommendationType: "progress",
          progressionMethod: "top_set_progression_with_backoff_recalculation",
          instruction: "Add the smallest available load increment to the top set, then recalculate back-off loads from the prescribed reduction percentage.",
          holdRule: "Hold the new load if top-set RPE exceeds the target.",
          regressionRule: "Increase the back-off reduction within its allowed range if rep loss exceeds the limit."
        } : {
          action: "progress_backoff_reps",
          recommendationType: "progress",
          progressionMethod: "top_set_progression_with_backoff_recalculation",
          instruction: "Keep the top set constant and add one repetition to the lowest-performing back-off set.",
          holdRule: "Hold the top set until back-off quality catches up.",
          regressionRule: "Reduce back-off load by the prescribed percentage if quality or rep loss deteriorates."
        };
      }
      return {
        action: "progress_top_set_rep",
        recommendationType: "progress",
        progressionMethod: "top_set_progression_with_backoff_recalculation",
        instruction: "Add one repetition to the top set while keeping the back-off percentage and target RPE unchanged.",
        holdRule: "Hold load when the added rep would exceed target RPE or change technique.",
        regressionRule: "Repeat or reduce back-off stress before reducing the top-set benchmark."
      };
    }
    if (/(technique|rom_then|distance_then|duration_then|hold_quality)/.test(normalizedMethod)) {
      return {
        action: "improve_technique_quality",
        recommendationType: "progress",
        progressionMethod: "technique_quality_progression",
        instruction: "Keep load stable and improve the exercise-specific quality metric (ROM, control, distance, duration, or repeatability) before adding resistance.",
        holdRule: "Hold the prescription until the quality metric is repeatable at target effort.",
        regressionRule: "Reduce load or complexity if the quality metric regresses twice."
      };
    }
    if (/(load_first|load_then_reps)/.test(normalizedMethod) && effortAcceptable && lastReps.every((reps) => reps >= number(repRange.min))) {
      return {
        action: "increase_load_first",
        recommendationType: "progress",
        progressionMethod: "load_first_progression",
        instruction: "Add the smallest available load increment while keeping every working set at or above the rep-range floor and inside target effort.",
        holdRule: "Hold the new load when any set falls below the rep floor or exceeds target RPE.",
        regressionRule: "Return to the prior load after two comparable failures at the range floor."
      };
    }
    if (allAtTop && effortAcceptable) {
      return {
        action: "increase_load",
        recommendationType: "progress",
        progressionMethod: method === "load_then_reps" ? "load_first_progression" : "double_progression",
        instruction: `Add the smallest available load increment to every comparable straight set and return to the lower half of the rep range. The first set reached ${repRange.max} reps and later sets stayed within the ${Math.round(acceptableRepLoss * 100)}% acceptable rep-loss boundary.`,
        holdRule: "Hold the new load if execution or target RPE is not repeatable.",
        regressionRule: "Treat one poor session as noise; reduce stress only after a confirmed regression pattern."
      };
    }
    return {
      action: "add_one_rep",
      recommendationType: "progress",
      progressionMethod: /technique/.test(method) ? "technique_quality_progression" : "rep_first_progression",
      instruction: "Add one repetition to the first or lowest-performing eligible working set while keeping load, ROM, and target effort constant.",
      holdRule: "Hold the prescription when the extra repetition would exceed target RPE, alter ROM, or require compensatory technique.",
      regressionRule: "After two comparable regressions, remove one low-quality set or deload before adding volume."
    };
  }

  function assessDeloadNeed(options = {}) {
    const exercise = options.exerciseStaleness || assessExerciseStaleness(options.exerciseHistory || []);
    const readiness = evaluateReadiness(options.readiness || {});
    const muscleAssessments = asArray(options.muscleExerciseHistories).map((history) => history?.classification ? history : assessExerciseStaleness(history));
    const degradedExercises = muscleAssessments.filter((item) => [STALENESS.REGRESSING, STALENESS.EXCESSIVELY_FATIGUING, STALENESS.ROTATION_CANDIDATE].includes(item.classification));
    const programAssessments = asArray(options.programMuscleHistories).map((entry) => {
      if (entry?.classification) return entry;
      if (Array.isArray(entry)) {
        const statuses = entry.map((history) => assessExerciseStaleness(history));
        return { classification: statuses.filter((status) => [STALENESS.REGRESSING, STALENESS.EXCESSIVELY_FATIGUING, STALENESS.ROTATION_CANDIDATE].includes(status.classification)).length >= 2 ? STALENESS.REGRESSING : STALENESS.PRODUCTIVE };
      }
      return assessExerciseStaleness(entry?.history || []);
    });
    const degradedMuscles = programAssessments.filter((item) => [STALENESS.REGRESSING, STALENESS.EXCESSIVELY_FATIGUING, STALENESS.ROTATION_CANDIDATE].includes(item.classification)).length;
    const fullProgram = degradedMuscles >= 3 && readiness.signalCount >= 2 && readiness.persistent;
    const muscleGroup = !fullProgram && degradedExercises.length >= 2;
    const exerciseSpecific = !fullProgram && !muscleGroup && exercise.deloadCandidate;
    const lightSession = Boolean(options.plannedLightSession);
    const readinessOnly = !fullProgram && !muscleGroup && !exerciseSpecific && readiness.signalCount >= 2;
    let state = "normal";
    let explanation = "No multi-factor deload trigger is present.";
    if (fullProgram) {
      state = "full_program_deload";
      explanation = "Performance is deteriorating across at least three muscle groups while multiple recovery domains remain suppressed across days; reduce whole-program stress temporarily.";
    } else if (muscleGroup) {
      state = "muscle_group_deload";
      explanation = "Multiple exercises for the same muscle show confirmed regression or excessive fatigue, supporting a muscle-group deload rather than changing only one lift.";
    } else if (exerciseSpecific) {
      state = "exercise_deload";
      explanation = "This exercise alone shows repeated regression plus fatigue or pain; deload the lift while unaffected work can continue normally.";
    } else if (lightSession) {
      state = "light_session";
      explanation = "This is a planned lower-fatigue exposure that preserves practice; it is distinct from a fatigue-triggered deload.";
    } else if (readinessOnly) {
      state = "readiness_adjustment";
      explanation = "Multiple recovery markers are poor today, so apply a temporary one-day adjustment without rewriting the mesocycle.";
    } else if (readiness.signalCount === 1) {
      explanation = "One abnormal recovery marker is monitored; it is not sufficient for a major deload."
    }
    return {
      state,
      fullProgram,
      muscleGroup,
      exerciseSpecific,
      lightSession,
      readinessOnly,
      explanation,
      readinessEvaluation: readiness,
      exerciseStaleness: exercise,
      degradedExerciseCount: degradedExercises.length,
      degradedMuscleGroupCount: degradedMuscles
    };
  }

  function preferredReplacementFor(candidate, evidence, rankedCandidates = [], options = {}) {
    const research = evidence.research;
    const replacementAllowed = (replacementCandidate) => Boolean(
      replacementCandidate
      && !candidateEquipmentProfile(replacementCandidate).invalid
      && equipmentCompatibilityForCandidate(replacementCandidate, options.availableEquipment).eligible
    );
    const substitutions = research.substitutionsByExercise.get(candidate.researchExerciseId) || [];
    for (const mapping of substitutions) {
      const targetResearchId = mapping.substitute_exercise_id || mapping.substituteExerciseId;
      const ranked = rankedCandidates.find((item) => (
        item.candidate.exerciseId !== candidate.exerciseId
        && (item.candidate.researchExerciseId === targetResearchId || item.candidate.exerciseId === targetResearchId)
        && replacementAllowed(item.candidate)
      ));
      if (ranked) return ranked.candidate.exerciseId;
      const personalId = evidence.personal.selectedPersonalIdByResearchId?.get(targetResearchId);
      if (personalId && personalId !== candidate.exerciseId) {
        const selectedIdentity = evidence.personal.reconciledIdentityByExerciseId?.get(personalId);
        if (selectedIdentity && !selectedIdentity.invalid && selectedIdentity.researchExerciseId === targetResearchId) {
          const researchExercise = research.exerciseById.get(targetResearchId) || null;
          const linkedCandidate = {
            exerciseId: personalId,
            researchExerciseId: targetResearchId,
            selectedIdentity,
            researchExercise
          };
          linkedCandidate.equipmentProfile = resolveCandidateEquipmentProfile(linkedCandidate);
          if (replacementAllowed(linkedCandidate)) return personalId;
        }
      }
      if (personalId) continue;
      const researchExercise = research.exerciseById.get(targetResearchId);
      if (researchExercise) {
        const canonicalCandidate = {
          exerciseId: targetResearchId,
          researchExerciseId: targetResearchId,
          selectedIdentity: null,
          researchExercise
        };
        canonicalCandidate.equipmentProfile = resolveCandidateEquipmentProfile(canonicalCandidate);
        if (replacementAllowed(canonicalCandidate)) return targetResearchId;
      }
    }
    return rankedCandidates.find((item) => item.candidate.exerciseId !== candidate.exerciseId && replacementAllowed(item.candidate))?.candidate.exerciseId || null;
  }

  function recommendationReasons(selected, entry, index) {
    const scores = selected.map((item) => item.score);
    const reasons = [];
    const isMax = (field) => entry.score[field] >= Math.max(...scores.map((score) => score[field]));
    if (entry.score.personalEvidenceWeight > 0 && isMax("progressionQuality")) reasons.push("Best personal progression in this pool.");
    if (isMax("recoveryEfficiency") || entry.score.recoveryEfficiency - entry.score.fatigueCost >= Math.max(...scores.map((score) => score.recoveryEfficiency - score.fatigueCost))) reasons.push("Best stimulus-to-fatigue relationship among the selected options.");
    if (isMax("researchSupport") && entry.score.personalEvidenceWeight < 0.4) reasons.push("Best research-supported default where personal evidence is limited.");
    if (entry.score.fatigueCost <= Math.min(...scores.map((score) => score.fatigueCost))) reasons.push("Best low-fatigue accessory or lighter-block option.");
    if (index > 0 && entry.score.staleness.classification === STALENESS.PRODUCTIVE) reasons.push("Non-redundant alternative if the primary lift later stalls.");
    if (!reasons.length) reasons.push("Adds a distinct movement, equipment, loading, stability, or regional-emphasis option without excessive score sacrifice.");
    return reasons;
  }

  function rankExercisePool(evidenceInput, muscleGroupId, options = {}) {
    const evidence = evidenceInput.personal ? evidenceInput : normalizeEvidenceBundle(evidenceInput);
    const maxCandidates = clamp(number(options.maxCandidates, DEFAULT_POLICY.candidatePoolSize), 1, 5);
    const equipmentInput = normalizeAvailableEquipmentInput(options.availableEquipment);
    let candidates = buildMergedExerciseCandidates(evidence, muscleGroupId, options);
    const excludedCandidates = [];
    candidates = candidates.filter((candidate) => {
      const profile = candidateEquipmentProfile(candidate);
      if (!profile.invalid) return true;
      excludedCandidates.push({
        exerciseId: candidate.exerciseId,
        exerciseName: candidate.exerciseName,
        reasonCode: "invalid_equipment_identity",
        explanation: `Excluded because the trusted equipment identity is invalid: ${profile.invalidReason}`
      });
      return false;
    });
    if (equipmentInput.provided && (!equipmentInput.valid || !equipmentInput.values.includes("all"))) {
      const compatible = candidates.filter((candidate) => {
        const compatibility = equipmentCompatibilityForCandidate(candidate, options.availableEquipment);
        if (!compatibility.eligible) excludedCandidates.push({
          exerciseId: candidate.exerciseId,
          exerciseName: candidate.exerciseName,
          reasonCode: "equipment_unavailable",
          explanation: candidate.source === "personal_only" && !compatibility.requirements.length
            ? "Excluded because verified equipment requirements are missing while equipment restrictions are active."
            : `Requires ${compatibility.requirements.map((option) => option.join(" + ")).join(" or ")}; the selected equipment is missing ${compatibility.missing.join(" + ")}.`
        });
        return compatibility.eligible;
      });
      candidates = compatible;
    }
    const scored = candidates.map((candidate) => ({
      candidate,
      score: scoreExerciseCandidate(candidate, evidence, muscleGroupId, options)
    })).sort((left, right) => right.score.overallRecommendationStrength - left.score.overallRecommendationStrength || left.candidate.exerciseName.localeCompare(right.candidate.exerciseName));
    const selected = [];
    const remaining = scored.slice();
    while (remaining.length && selected.length < maxCandidates) {
      const best = remaining.reduce((winner, entry) => {
        const adjusted = entry.score.overallRecommendationStrength - diversityPenalty(entry.candidate, selected);
        if (!winner || adjusted > winner.adjusted || (adjusted === winner.adjusted && entry.score.overallRecommendationStrength > winner.entry.score.overallRecommendationStrength)) return { entry, adjusted };
        return winner;
      }, null);
      selected.push({ ...best.entry, diversityAdjustedStrength: round(best.adjusted, 2), rawRank: scored.indexOf(best.entry) + 1 });
      remaining.splice(remaining.indexOf(best.entry), 1);
    }
    const items = selected.map((entry, index) => {
      const candidate = entry.candidate;
      const role = inferPoolRole(entry, index, selected);
      const muscleDefaults = aggregateMuscleResearchDefaults(evidence.research, muscleGroupId);
      const researchDefaults = researchExerciseDefaults(candidate.researchExercise, muscleDefaults);
      const personalRanges = personalPrescriptionRanges(candidate.personalPrescription);
      const repRange = blendRange(personalRanges.repRange, researchDefaults.repRange, entry.score.personalEvidenceWeight, { integer: true, minimumWidth: DEFAULT_POLICY.minimumRepRangeWidth, floor: 3, ceiling: 30 });
      const volume = determineVolumePrescription({
        personalRanges,
        researchDefaults,
        personalEvidenceWeight: entry.score.personalEvidenceWeight,
        personalPrescription: candidate.personalPrescription,
        staleness: entry.score.staleness,
        mesocycleType: options.mesocycleType,
        specializationMuscleGroups: options.specializationMuscleGroups,
        muscleGroupId
      });
      const workingSets = {
        min: volume.perExercise.normalOperatingRange.min,
        target: volume.perExercise.currentPrescribed,
        max: volume.perExercise.normalOperatingRange.max
      };
      const structure = chooseSetStructure({
        researchExercise: candidate.researchExercise,
        personalPrescription: candidate.personalPrescription,
        history: candidate.history,
        role,
        workingSets,
        repRange,
        personalEvidenceWeight: entry.score.personalEvidenceWeight
      });
      const targetRir = blendRange(personalRanges.rir, researchDefaults.rir, entry.score.personalEvidenceWeight, { floor: 0, ceiling: 5 }) || { min: 1, target: 2, max: 3 };
      const frequency = blendRange(personalRanges.frequency, researchDefaults.frequency, entry.score.personalEvidenceWeight, { floor: 1, ceiling: 7 });
      const progression = determineProgressionDecision({
        history: candidate.history,
        repRange,
        targetRpe: { min: 10 - targetRir.max, max: 10 - targetRir.min },
        staleness: entry.score.staleness,
        setStructure: structure.setStructure,
        progressionMethod: candidate.researchExercise?.preferred_progression_model
      });
      const preferredReplacementExerciseId = preferredReplacementFor(candidate, evidence, scored, options);
      const taxonomy = asArray(candidate.researchMappings).length ? asArray(candidate.researchMappings) : [{
        muscle_group_id: candidate.muscleScore?.research_muscle_group_id || candidate.muscleScore?.muscle_group || muscleGroupId,
        relationship_type: number(candidate.muscleScore?.contribution_weight, 1) >= 1 ? "direct_load" : "meaningful_fractional_load",
        loading_role: "dynamic",
        range_of_motion_role: "unknown",
        fractional_set_credit: number(candidate.muscleScore?.contribution_weight, 1),
        local_fatigue_weight: 1,
        confidence_rating: candidate.personalScore?.confidence_level || "low",
        evidence_basis: "personal_mapping_pending_canonical_research_crosswalk",
        evidence_notes: "Personal exercise mapping is used because this recorded variation has no canonical research relationship yet.",
        taxonomy_version: "personal_mapping_review_queue"
      }];
      const primaryMuscles = unique(taxonomy.filter((mapping) => mapping.relationship_type === "direct_load" || mapping.relationship_type === "primary").map((mapping) => mapping.muscle_group_id || mapping.muscleGroupId));
      const secondaryMuscles = unique(taxonomy.filter((mapping) => mapping.relationship_type === "meaningful_fractional_load" || mapping.relationship_type === "secondary").map((mapping) => mapping.muscle_group_id || mapping.muscleGroupId));
      const stabilizingMuscles = unique(taxonomy.filter((mapping) => mapping.relationship_type === "isometric_stabilizing_load").map((mapping) => mapping.muscle_group_id || mapping.muscleGroupId));
      return {
        rank: index + 1,
        rawScoreRank: entry.rawRank,
        exerciseId: candidate.exerciseId,
        researchExerciseId: candidate.researchExerciseId,
        exerciseName: candidate.exerciseName,
        intendedRole: role,
        primaryMuscles: primaryMuscles.length ? primaryMuscles : unique([candidate.muscleScore?.research_muscle_group_id || candidate.muscleScore?.muscle_group || muscleGroupId]),
        secondaryMuscles,
        stabilizingMuscles,
        muscleRelationships: taxonomy,
        equipmentRequirements: deepClone(candidateEquipmentProfile(candidate).requirements),
        jointActions: jointActionsForExercise(candidate.researchExercise || candidate.personalScore),
        recommendedSetStructure: structure.setStructure,
        setStructureReason: structure.reasoning,
        recommendedSetRange: workingSets,
        recommendedRepRange: repRange,
        recommendedRpe: { min: round(10 - targetRir.max, 1), max: round(10 - targetRir.min, 1) },
        recommendedRir: { min: targetRir.min, max: targetRir.max },
        recommendedFrequency: frequency,
        progressionMethod: progression.progressionMethod,
        progressionInstruction: progression.instruction,
        deloadTrigger: candidate.researchExercise?.deload_criteria || candidate.personalPrescription?.deload_rule?.trigger || "Two confirmed regressions plus fatigue or pain; one noisy session is insufficient.",
        rotationTrigger: entry.score.staleness.reasons.join(" ") || candidate.researchExercise?.substitution_triggers,
        preferredReplacementExerciseId,
        reasonForMesocycle: recommendationReasons(selected, entry, index).join(" "),
        sourceTrace: {
          category: asArray(options.currentProgramExerciseIds).includes(candidate.exerciseId) ? "current_program"
            : asArray(options.recentExerciseIds).includes(candidate.exerciseId) ? "recent_exercise"
              : asArray(options.successfulExerciseIds).includes(candidate.exerciseId) ? "previously_successful"
                : "eligible_library",
          personalRecord: candidate.source !== "research_only",
          researchRecord: Boolean(candidate.researchExerciseId),
          explanation: candidate.source === "research_only"
            ? "Eligible exercise library; research evidence supplies the starting estimate."
            : "Personal performance history is linked to the canonical exercise; research is blended when available."
        },
        personalDataConfidence: entry.score.confidence,
        researchDataConfidence: candidate.researchExercise?.confidence_rating || "low",
        scores: entry.score,
        diversitySignature: diversitySignature(candidate)
      };
    });
    return {
      muscleGroupId,
      mesocycleType: options.mesocycleType || MESOCYCLE_TYPES.PRIMARY,
      generatedAt: options.generatedAt || isoNow(options.clock),
      candidateCount: items.length,
      availableViableExerciseCount: scored.length,
      candidates: items,
      excludedCandidates,
      diversificationApplied: true,
      explanation: `These are the top ${Math.min(maxCandidates, items.length)} alternatives for one program role, not exercises that must all be performed. Ranking uses predicted target-muscle value, personal evidence, research, equipment, fatigue, and redundancy.`
    };
  }

  function representedMuscleGroups(evidenceInput) {
    const evidence = evidenceInput.personal ? evidenceInput : normalizeEvidenceBundle(evidenceInput);
    const personalGroups = unique([
      ...evidence.personal.exerciseMuscleScores.map((item) => normalizeMuscleId(item.muscle_group || item.muscleGroup)),
      ...evidence.personal.exercisePrescriptions.map((item) => normalizeMuscleId(item.muscle_group_id || item.muscleGroupId))
    ]);
    const researchGroups = unique(evidence.research.muscleGroupRecommendations.map((item) => normalizeMuscleId(item.muscle_group || item.muscleGroup || item.muscle_group_id)));
    return unique([...personalGroups, ...researchGroups]).filter(Boolean).sort();
  }

  function buildAllCandidatePools(evidenceInput, options = {}) {
    const evidence = evidenceInput.personal ? evidenceInput : normalizeEvidenceBundle(evidenceInput);
    const groups = options.muscleGroupIds || representedMuscleGroups(evidence);
    return Object.fromEntries(groups.map((muscleGroupId) => [muscleGroupId, rankExercisePool(evidence, muscleGroupId, options)]));
  }

  function chooseMesocycleDuration(evidence, options = {}) {
    if (number(options.durationWeeks) > 0) return clamp(Math.round(number(options.durationWeeks)), 2, 12);
    const type = options.type || MESOCYCLE_TYPES.PRIMARY;
    const defaults = {
      [MESOCYCLE_TYPES.PRIMARY]: 6,
      [MESOCYCLE_TYPES.ALTERNATIVE]: 5,
      [MESOCYCLE_TYPES.LOWER_FATIGUE]: 3,
      [MESOCYCLE_TYPES.SPECIALIZATION]: 6
    };
    const personalPlateaus = evidence.personal.exerciseScores.map((item) => number(item.maximum_plateau_exposures || item.maximumPlateauExposures)).filter((value) => value > 0 && value < 12);
    const medianPlateau = personalPlateaus.length ? personalPlateaus.slice().sort((a, b) => a - b)[Math.floor(personalPlateaus.length / 2)] : 0;
    const frequency = number(options.frequencyPerWeek, 2);
    const inferred = medianPlateau ? Math.round(clamp((medianPlateau + 6) / Math.max(1, frequency), 3, 8)) : defaults[type];
    if (type === MESOCYCLE_TYPES.LOWER_FATIGUE) return Math.min(4, inferred);
    return clamp(inferred || defaults[type], 3, 10);
  }

  function selectActiveExercisesFromPools(pools, options = {}) {
    const trainingDays = clamp(number(options.trainingDays, 4), 1, 7);
    const currentIds = new Set(asArray(options.currentExerciseIds));
    const readiness = evaluateReadiness(options.readiness || {});
    const specializationGroups = new Set(asArray(options.specializationMuscleGroups).map(normalizeMuscleId));
    const poolList = Object.values(pools);
    const capacity = Math.max(poolList.length, trainingDays * number(options.maxExercisesPerDay, readiness.state === "low" ? 4 : 5));
    const selected = [];
    const selectedById = new Map();
    const add = (pool, candidate, reason) => {
      const existing = selectedById.get(candidate.exerciseId);
      if (existing) {
        existing.targetMuscleGroupIds = unique([...existing.targetMuscleGroupIds, pool.muscleGroupId]);
        return existing;
      }
      if (selected.length >= capacity) return null;
      const entry = { muscleGroupId: pool.muscleGroupId, targetMuscleGroupIds: [pool.muscleGroupId], selectionReason: reason, ...candidate };
      selected.push(entry);
      selectedById.set(candidate.exerciseId, entry);
      return entry;
    };
    // First provide one strong, non-stale option for every represented muscle.
    poolList.forEach((pool) => {
      const productiveCurrent = pool.candidates.find((candidate) => currentIds.has(candidate.exerciseId) && candidate.scores.staleness.classification === STALENESS.PRODUCTIVE);
      const first = productiveCurrent || pool.candidates.find((candidate) => !candidate.scores.staleness.rotationRecommended) || pool.candidates[0];
      if (first) add(pool, first, productiveCurrent ? "Preserved because it is still progressing and well tolerated." : "Highest viable non-stale candidate after evidence weighting and redundancy checks.");
    });
    // Add a second pattern only where specialization or training capacity makes it useful.
    poolList
      .filter((pool) => specializationGroups.has(normalizeMuscleId(pool.muscleGroupId)) || (trainingDays >= 5 && readiness.state !== "low"))
      .forEach((pool) => {
        if (selected.length >= capacity) return;
        const firstForMuscle = selected.find((item) => item.targetMuscleGroupIds.includes(pool.muscleGroupId));
        const alternative = pool.candidates.find((candidate) => {
          if (selectedById.has(candidate.exerciseId) || candidate.scores.staleness.rotationRecommended) return false;
          return !firstForMuscle || candidate.diversitySignature.movement !== firstForMuscle.diversitySignature.movement || candidate.diversitySignature.region !== firstForMuscle.diversitySignature.region;
        });
        if (alternative) add(pool, alternative, specializationGroups.has(normalizeMuscleId(pool.muscleGroupId)) ? "Additional non-redundant specialization stimulus." : "Additional pattern supported by the available training-day capacity.");
      });
    return selected;
  }

  function mechanicalRedundancyScore(candidate, other) {
    const candidatePattern = normalizeText(candidate.diversitySignature?.movement);
    const otherPattern = normalizeText(other.diversitySignature?.movement);
    if (!candidatePattern || candidatePattern === "unknown" || !otherPattern || otherPattern === "unknown" || candidatePattern !== otherPattern) return 0;
    const candidatePrimary = new Set(asArray(candidate.primaryMuscles).map(muscleFamily));
    const otherPrimary = new Set(asArray(other.primaryMuscles).map(muscleFamily));
    if (![...otherPrimary].some((muscle) => candidatePrimary.has(muscle))) return 0;
    const candidateActions = new Set(asArray(candidate.jointActions || candidate.diversitySignature?.jointActions));
    const otherActions = new Set(asArray(other.jointActions || other.diversitySignature?.jointActions));
    const sharedActions = [...candidateActions].filter((action) => otherActions.has(action)).length;
    const actionUnion = new Set([...candidateActions, ...otherActions]).size;
    if (candidateActions.size && otherActions.size && !sharedActions) return 0;
    let score = 0.5;
    score += actionUnion ? sharedActions / actionUnion * 0.18 : 0.06;
    if (candidate.intendedRole && candidate.intendedRole === other.intendedRole) score += 0.1;
    if (candidate.diversitySignature?.loading === other.diversitySignature?.loading) score += 0.07;
    if (candidate.diversitySignature?.stability === other.diversitySignature?.stability) score += 0.05;
    if (candidate.diversitySignature?.region === other.diversitySignature?.region) score += 0.05;
    if (candidate.diversitySignature?.equipment === other.diversitySignature?.equipment) score += 0.05;
    return round(clamp(score, 0, 1), 2);
  }

  function candidateProgramFit(candidate, portfolio = [], policy = DEFAULT_POLICY) {
    const others = portfolio.filter((item) => item.exerciseId !== candidate.exerciseId);
    const redundant = others.map((item) => ({ item, similarity: mechanicalRedundancyScore(candidate, item) })).filter((entry) => entry.similarity >= 0.72);
    const sameEquipment = others.filter((item) => item.diversitySignature?.equipment === candidate.diversitySignature?.equipment);
    const spinalTotal = sum(others.map((item) => item.scores?.spinalLoad));
    const gripTotal = sum(others.map((item) => item.scores?.gripDemand));
    const systemicTotal = sum(others.map((item) => item.scores?.systemicFatigue));
    const positiveFactors = [];
    const limitingFactors = [];
    let fit = 94;
    if (!redundant.length) positiveFactors.push("Adds a mechanically distinct pattern or target-muscle role to the program.");
    if (candidate.scores.recoveryEfficiency >= 70) positiveFactors.push("Personal or blended evidence supports good recovery efficiency.");
    if (candidate.scores.easeOfProgression >= 75) positiveFactors.push("Load or repetition progression is easy to measure.");
    if (candidate.scores.personalEvidenceWeight >= 0.6) positiveFactors.push("Adequate comparable personal evidence informs the estimate.");
    if (redundant.length) {
      fit -= 9 + (redundant.length - 1) * 5;
      limitingFactors.push(`Mechanically redundant with ${redundant.slice(0, 3).map((entry) => entry.item.exerciseName).join(", ")}: shared primary target, joint action, movement pattern, and similar program role or loading profile.`);
    }
    if (sameEquipment.length >= 4) fit -= 4;
    if (candidate.scores.spinalLoad >= 70 && spinalTotal >= policy.maximumSessionSpinalLoad * 2) {
      fit -= 12;
      limitingFactors.push("The current portfolio already carries substantial spinal loading.");
    }
    if (candidate.scores.gripDemand >= 70 && gripTotal >= policy.maximumSessionGripDemand * 2) {
      fit -= 8;
      limitingFactors.push("The current portfolio already contains substantial grip-limited pulling or hinging.");
    }
    if (candidate.scores.systemicFatigue >= 70 && systemicTotal >= 450) {
      fit -= 10;
      limitingFactors.push("Systemic fatigue is already concentrated in several demanding compounds.");
    }
    if (candidate.scores.jointStress >= 70) {
      fit -= 6;
      limitingFactors.push("Joint-stress considerations require conservative placement and monitoring.");
    }
    const targetMuscleEffectiveness = candidate.scores.overallRecommendationStrength;
    const fullProgramFit = round(clamp(fit, 0, 100), 1);
    const predictedProgramEffectiveness = round(clamp(targetMuscleEffectiveness * 0.72 + fullProgramFit * 0.28, 0, 100), 1);
    if (!limitingFactors.length) positiveFactors.push("No major portfolio conflict reduced the score.");
    return { targetMuscleEffectiveness, fullProgramFit, predictedProgramEffectiveness, positiveFactors, limitingFactors };
  }

  function consolidateProgramPools(pools) {
    const grouped = new Map();
    Object.values(pools).forEach((pool) => {
      const family = muscleFamily(pool.muscleGroupId);
      if (!grouped.has(family)) grouped.set(family, { muscleGroupId: family, mesocycleType: pool.mesocycleType, generatedAt: pool.generatedAt, candidates: [], excludedCandidates: [], availableViableExerciseCount: 0, sourceMuscleGroupIds: [] });
      const target = grouped.get(family);
      target.sourceMuscleGroupIds.push(pool.muscleGroupId);
      target.availableViableExerciseCount += number(pool.availableViableExerciseCount, pool.candidates.length);
      target.excludedCandidates.push(...asArray(pool.excludedCandidates));
      pool.candidates.forEach((candidate) => {
        const existing = target.candidates.find((item) => item.exerciseId === candidate.exerciseId);
        if (!existing || candidate.scores.overallRecommendationStrength > existing.scores.overallRecommendationStrength) target.candidates = target.candidates.filter((item) => item.exerciseId !== candidate.exerciseId).concat(candidate);
      });
    });
    return Object.fromEntries([...grouped.entries()].map(([family, pool]) => { const candidates = pool.candidates.sort((a, b) => b.scores.overallRecommendationStrength - a.scores.overallRecommendationStrength).slice(0, 5).map((candidate, index) => ({ ...candidate, rank: index + 1 })); return [family, { ...pool, sourceMuscleGroupIds: unique(pool.sourceMuscleGroupIds), candidateCount: candidates.length, diversificationApplied: true, explanation: `Top alternatives for the ${family.replaceAll("_", " ")} program slot; select the required number, not all candidates.`, candidates, excludedCandidates: unique(pool.excludedCandidates.map((item) => JSON.stringify(item))).map((item) => JSON.parse(item)).slice(0, 20) }]; }));
  }

  function createProgramSlots(pools, options = {}) {
    const specialization = new Set(asArray(options.specializationMuscleGroups).map(normalizeMuscleId));
    return Object.values(pools).filter((pool) => pool.candidates.length > 0).map((pool, index) => {
      const defaults = options.evidence ? aggregateMuscleResearchDefaults(options.evidence.research, pool.muscleGroupId) : null;
      const specialized = specialization.has(normalizeMuscleId(pool.muscleGroupId));
      const objectiveFactor = options.type === MESOCYCLE_TYPES.LOWER_FATIGUE ? 0.72 : specialized ? 1.2 : 1;
      const weeklyTarget = Math.max(2, Math.round(number(defaults?.weeklySets?.min, pool.candidates[0]?.recommendedSetRange?.target || 3) * objectiveFactor));
      const frequencyTarget = Math.min(weeklyTarget, number(options.trainingDays, 4), specialized ? 3 : 2, Math.max(1, Math.round(number(defaults?.frequency?.target, pool.candidates[0]?.recommendedFrequency?.target || 2))));
      const desiredSelections = frequencyTarget;
      return ({
      id: `slot_${normalizeText(pool.muscleGroupId)}_${index + 1}`,
      muscleGroupId: pool.muscleGroupId,
      trainingPurpose: specialized ? "Specialization volume and progression" : "Meet evidence-adjusted weekly volume and frequency",
      role: pool.candidates[0]?.intendedRole || "secondary_hypertrophy_lift",
      selectionRequired: Math.min(pool.candidates.length, desiredSelections),
      selectedExerciseIds: [],
      candidateExerciseIds: pool.candidates.map((candidate) => candidate.exerciseId),
      weeklySetsRange: { min: Math.max(2, Math.round(number(defaults?.weeklySets?.min, weeklyTarget) * objectiveFactor)), target: weeklyTarget, max: Math.max(weeklyTarget, Math.round(number(defaults?.weeklySets?.max, weeklyTarget + 4) * objectiveFactor)) },
      weeklySetsTarget: weeklyTarget,
      weeklyExposuresTarget: frequencyTarget,
      plannedSessionIds: [],
      rationale: `This slot ensures ${pool.muscleGroupId.replaceAll("_", " ")} receives its evidence-adjusted volume across ${frequencyTarget} weekly exposure${frequencyTarget === 1 ? "" : "s"}.`
    });
    });
  }

  function buildProgramPortfolio(pools, slots, options = {}) {
    const selected = [];
    const byId = new Map();
    const currentIds = new Set(asArray(options.currentProgramExerciseIds || options.currentExerciseIds));
    const orderedSlots = slots.slice().sort((a, b) => Number(MAJOR_PROGRAM_MUSCLES.has(muscleFamily(b.muscleGroupId))) - Number(MAJOR_PROGRAM_MUSCLES.has(muscleFamily(a.muscleGroupId))) || b.selectionRequired - a.selectionRequired || a.muscleGroupId.localeCompare(b.muscleGroupId));
    orderedSlots.forEach((slot) => {
      const pool = pools[slot.muscleGroupId];
      for (let pick = 0; pick < slot.selectionRequired; pick += 1) {
        let candidates = pool.candidates.filter((candidate) => !slot.selectedExerciseIds.includes(candidate.exerciseId) && !candidate.scores.staleness.rotationRecommended);
        const directCandidates = candidates.filter((candidate) => asArray(candidate.muscleRelationships).some((mapping) => mapping.relationship_type === "direct_load" && researchMuscleMatch(options.evidence?.research, slot.muscleGroupId, mapping.muscle_group_id)));
        if (directCandidates.length) candidates = directCandidates;
        const productiveCurrent = candidates.find((candidate) => currentIds.has(candidate.exerciseId) && candidate.scores.staleness.classification === STALENESS.PRODUCTIVE);
        const ranked = candidates.map((candidate) => ({ candidate, fit: candidateProgramFit(candidate, selected, { ...DEFAULT_POLICY, ...(options.policy || {}) }) }))
          .sort((a, b) => b.fit.predictedProgramEffectiveness - a.fit.predictedProgramEffectiveness || a.candidate.exerciseName.localeCompare(b.candidate.exerciseName));
        const choice = productiveCurrent || ranked[0]?.candidate || pool.candidates[pick];
        if (!choice) continue;
        slot.selectedExerciseIds.push(choice.exerciseId);
        const canonicalId = firstPresent(choice.researchExerciseId, choice.exerciseId);
        const existing = byId.get(canonicalId);
        if (existing) {
          existing.targetMuscleGroupIds = unique([...existing.targetMuscleGroupIds, slot.muscleGroupId]);
          existing.programSlotIds = unique([...existing.programSlotIds, slot.id]);
        } else {
          const fit = candidateProgramFit(choice, selected, { ...DEFAULT_POLICY, ...(options.policy || {}) });
          const entry = { ...deepClone(choice), muscleGroupId: slot.muscleGroupId, targetMuscleGroupIds: [slot.muscleGroupId], programSlotIds: [slot.id], selectionReason: productiveCurrent === choice ? "Preserved because this current-program exercise is productive and well tolerated." : "Highest predicted effectiveness after personal evidence, research, equipment, fatigue, and portfolio interactions.", ...fit };
          selected.push(entry);
          byId.set(canonicalId, entry);
        }
      }
    });
    return selected;
  }

  function rerankPoolsForPortfolio(pools, portfolio, options = {}) {
    return Object.fromEntries(Object.entries(pools).map(([muscleGroupId, pool]) => {
      const candidates = pool.candidates.map((candidate) => {
        const fit = candidateProgramFit(candidate, portfolio.filter((item) => !item.targetMuscleGroupIds?.includes(muscleGroupId)), { ...DEFAULT_POLICY, ...(options.policy || {}) });
        return { ...candidate, scores: { ...candidate.scores, targetMuscleEffectiveness: fit.targetMuscleEffectiveness, fullProgramFit: fit.fullProgramFit, predictedProgramEffectiveness: fit.predictedProgramEffectiveness }, scoreExplanation: { positiveFactors: fit.positiveFactors, limitingFactors: fit.limitingFactors } };
      }).sort((a, b) => b.scores.predictedProgramEffectiveness - a.scores.predictedProgramEffectiveness || a.exerciseName.localeCompare(b.exerciseName))
        .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
      return [muscleGroupId, { ...pool, candidates }];
    }));
  }

  function sessionPlacementCost(session, exercise, dayIndex, sessions) {
    const samePattern = session.exercises.filter((item) => item.diversitySignature?.movement === exercise.diversitySignature?.movement).length;
    const sameMuscle = session.exercises.filter((item) => item.targetMuscleGroupIds?.some((muscle) => exercise.targetMuscleGroupIds?.includes(muscle))).length;
    const priorDay = sessions[(dayIndex - 1 + sessions.length) % sessions.length];
    const nextDay = sessions[(dayIndex + 1) % sessions.length];
    const adjacentOverlap = [priorDay, nextDay].filter(Boolean).flatMap((item) => item.exercises).filter((item) => item.targetMuscleGroupIds?.some((muscle) => exercise.targetMuscleGroupIds?.includes(muscle))).length;
    return session.estimatedDurationMinutes + samePattern * 30 + sameMuscle * 120 + adjacentOverlap * 18 + session.spinalLoad * exercise.scores.spinalLoad / 900 + session.gripDemand * exercise.scores.gripDemand / 1100;
  }

  function distributePortfolioAcrossSessions(portfolio, options = {}) {
    const dayCount = clamp(number(options.trainingDays, 4), 1, 7);
    const splitByDays = { 1: ["Full Body"], 2: ["Upper", "Lower"], 3: ["Upper", "Lower", "Full Body"], 4: ["Upper", "Lower", "Upper", "Lower"], 5: ["Upper", "Lower", "Push", "Pull", "Accessories"], 6: ["Upper", "Lower", "Push", "Pull", "Upper", "Lower"], 7: ["Upper", "Lower", "Push", "Pull", "Upper", "Lower", "Accessories"] };
    const focuses = splitByDays[dayCount];
    const sessions = Array.from({ length: dayCount }, (_, index) => ({ id: `session_${index + 1}`, dayIndex: index, name: `Day ${index + 1}`, workoutType: focuses[index], primaryPurpose: focuses[index], baseSessionIntent: options.type === MESOCYCLE_TYPES.LOWER_FATIGUE ? "Lower-fatigue practice session" : `${focuses[index]} hypertrophy and progression`, exercises: [], estimatedDurationMinutes: 0, systemicFatigue: 0, spinalLoad: 0, gripDemand: 0, jointStress: 0 }));
    const lower = new Set(["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"]);
    const push = new Set(["chest", "front_delts", "side_delts", "triceps"]);
    const pull = new Set(["upper_back", "lats", "rear_delts", "biceps", "forearms", "traps"]);
    const accessory = new Set(["abs", "obliques", "neck", "calves", "forearms"]);
    const focusFit = (session, exercise) => {
      const muscles = new Set(asArray(exercise.targetMuscleGroupIds).map(muscleFamily));
      const matches = (set) => [...muscles].some((muscle) => set.has(muscle));
      if (session.primaryPurpose === "Full Body") return 0;
      if (session.primaryPurpose === "Lower") return matches(lower) ? 0 : matches(accessory) ? 15 : 80;
      if (session.primaryPurpose === "Push") return matches(push) ? 0 : matches(new Set(["quads", "calves"])) ? 20 : 75;
      if (session.primaryPurpose === "Pull") return matches(pull) ? 0 : matches(new Set(["hamstrings"])) ? 20 : 75;
      if (session.primaryPurpose === "Accessories") return matches(accessory) ? 0 : 55;
      if (session.primaryPurpose === "Upper") return matches(lower) ? (matches(accessory) ? 20 : 90) : 0;
      return 0;
    };
    const policy = { ...DEFAULT_POLICY, ...(options.policy || {}) };
    const capacityIssues = [];
    const sessionWorkingSets = (session) => sum(session.exercises.map((item) => number(item.plannedSets, 0)));
    const targetedExerciseCount = (session, exercise) => {
      const targets = new Set(asArray(exercise.targetMuscleGroupIds).map(muscleFamily));
      return session.exercises.filter((item) => asArray(item.targetMuscleGroupIds).map(muscleFamily).some((muscle) => targets.has(muscle))).length;
    };
    const ordered = portfolio.slice().sort((a, b) => {
      const aMajor = asArray(a.targetMuscleGroupIds).some((muscle) => MAJOR_PROGRAM_MUSCLES.has(muscleFamily(muscle)));
      const bMajor = asArray(b.targetMuscleGroupIds).some((muscle) => MAJOR_PROGRAM_MUSCLES.has(muscleFamily(muscle)));
      return Number(bMajor) - Number(aMajor)
        || Number(b.intendedRole === "primary_progression_lift") - Number(a.intendedRole === "primary_progression_lift")
        || Number(b.scores.highFatigueCompound) - Number(a.scores.highFatigueCompound)
        || b.scores.systemicFatigue - a.scores.systemicFatigue;
    });
    ordered.forEach((exercise) => {
      const relatedSlots = asArray(options.slots).filter((slot) => exercise.programSlotIds.includes(slot.id));
      const weeklySets = Math.max(1, Math.round(sum(relatedSlots.map((slot) => slot.weeklySetsTarget / Math.max(1, slot.selectionRequired))) || number(exercise.recommendedSetRange?.target, 3)));
      // One canonical exercise belongs to one scheduled day. Frequency is supplied by distinct exercises.
      const exposures = 1;
      const chosen = [];
      const plannedExposureSets = Array.from({ length: exposures }, (_, exposureIndex) => Math.floor(weeklySets / exposures) + (exposureIndex < weeklySets % exposures ? 1 : 0));
      for (let exposure = 0; exposure < exposures; exposure += 1) {
        const setsForExposure = plannedExposureSets[exposure];
        const rankedSessions = sessions.filter((session) => !chosen.some((item) => item.session === session)
          && sessionWorkingSets(session) + setsForExposure <= policy.maximumWorkingSetsPerSession
          && targetedExerciseCount(session, exercise) < policy.maximumExercisesPerMusclePerSession).map((session, index) => {
          const adjacentSameExercise = sessions.filter((other) => Math.abs(other.dayIndex - session.dayIndex) === 1 && other.exercises.some((item) => item.exerciseId === exercise.exerciseId)).length;
          const equipmentChanges = session.exercises.length && !session.exercises.some((item) => item.diversitySignature?.equipment === exercise.diversitySignature?.equipment) ? 8 : 0;
          const densityCost = session.exercises.length >= policy.maximumExercisesPerSession ? 120 : session.exercises.length * 4;
          return { session, cost: focusFit(session, exercise) + sessionPlacementCost(session, exercise, index, sessions) + adjacentSameExercise * (exercise.scores.highFatigueCompound ? 500 : 120) + equipmentChanges + densityCost };
        }).sort((a, b) => a.cost - b.cost);
        if (rankedSessions[0]) chosen.push({ session: rankedSessions[0].session, sets: setsForExposure });
        else capacityIssues.push({ exerciseId: exercise.exerciseId, exerciseName: exercise.exerciseName, muscleGroupIds: exercise.targetMuscleGroupIds, unallocatedSets: setsForExposure, reason: `No session can accept ${setsForExposure} more working sets without exceeding ${policy.maximumWorkingSetsPerSession} sets or ${policy.maximumExercisesPerMusclePerSession} exercises for the same muscle.` });
      }
      chosen.forEach(({ session: target, sets }, exposureIndex) => {
        const rest = number(exercise.recommendedRestSeconds?.target || exercise.restSeconds?.target, exercise.scores.highFatigueCompound ? 180 : 90);
        target.exercises.push({ ...exercise, plannedSets: sets, weeklySets, exposureIndex: exposureIndex + 1 });
        target.estimatedDurationMinutes = round(target.estimatedDurationMinutes + sets * (rest + 42) / 60 + 2, 1);
        target.systemicFatigue += exercise.scores.systemicFatigue * sets / 3;
        target.spinalLoad += exercise.scores.spinalLoad * sets / 3;
        target.gripDemand += exercise.scores.gripDemand * sets / 3;
        target.jointStress += exercise.scores.jointStress * sets / 3;
      });
    });
    sessions.forEach((session) => session.exercises.sort((a, b) => (a.intendedRole === "primary_progression_lift" ? -1 : 1) - (b.intendedRole === "primary_progression_lift" ? -1 : 1) || b.scores.systemicFatigue - a.scores.systemicFatigue));
    sessions.capacityIssues = capacityIssues;
    return sessions;
  }

  function reviewFullProgram(portfolio, sessions, slots, evidence, options = {}) {
    const policy = { ...DEFAULT_POLICY, ...(options.policy || {}) };
    const warnings = [];
    const scheduledCanonicalIds = new Map();
    sessions.forEach((session) => {
      const names = session.exercises.map((item) => item.exerciseName);
      const highFatigue = session.exercises.filter((item) => item.scores.highFatigueCompound);
      const workingSets = sum(session.exercises.map((item) => number(item.plannedSets, 0)));
      session.exercises.forEach((exercise) => {
        const canonicalId = firstPresent(exercise.researchExerciseId, exercise.exerciseId);
        if (!scheduledCanonicalIds.has(canonicalId)) scheduledCanonicalIds.set(canonicalId, []);
        scheduledCanonicalIds.get(canonicalId).push(session.id);
      });
      session.exerciseCount = session.exercises.length;
      session.workingSetCount = workingSets;
      const exercisesByMuscle = groupBy(session.exercises.flatMap((exercise) => asArray(exercise.targetMuscleGroupIds).map((muscle) => ({ muscle: muscleFamily(muscle), exercise }))), (item) => item.muscle);
      exercisesByMuscle.forEach((items, muscle) => {
        const distinct = unique(items.map((item) => item.exercise.exerciseId));
        if (distinct.length > policy.maximumExercisesPerMusclePerSession) warnings.push({ severity: "blocking", type: "muscle_exercise_count", sessionId: session.id, muscleGroupId: muscle, exerciseIds: distinct, conflict: `${session.name} assigns ${distinct.length} exercises to ${muscle.replaceAll("_", " ")}.`, why: `A session may use at most ${policy.maximumExercisesPerMusclePerSession} exercises for one muscle so lower-value duplication cannot crowd out primary work.`, recommendation: "Keep the highest-value compound and, when useful, one mechanically complementary exercise; remove or relocate the rest.", correctiveAction: "regenerate_affected_sessions" });
      });
      if (session.exercises.length > policy.absoluteMaximumExercisesPerSession) warnings.push({ severity: "blocking", type: "exercise_count", sessionId: session.id, exerciseIds: session.exercises.map((item) => item.exerciseId), conflict: `${session.name} contains ${session.exercises.length} exercises.`, why: "Too many separate exercises increases setup time and makes later work less likely to remain productive.", recommendation: "Remove the lowest-value redundant accessory or move it to a shorter compatible day." });
      else if (session.exercises.length > policy.maximumExercisesPerSession) warnings.push({ severity: "review", type: "exercise_count", sessionId: session.id, exerciseIds: session.exercises.map((item) => item.exerciseId), conflict: `${session.name} contains ${session.exercises.length} exercises.`, why: "The session is dense enough that setup time and later-set quality require review.", recommendation: "Prefer removing a redundant accessory or moving it to a shorter compatible day." });
      if (workingSets > policy.maximumWorkingSetsPerSession) warnings.push({ severity: "blocking", type: "working_set_count", sessionId: session.id, exerciseIds: session.exercises.map((item) => item.exerciseId), conflict: `${session.name} contains ${workingSets} working sets.`, why: `The session exceeds the hard ${policy.maximumWorkingSetsPerSession}-working-set daily limit; warm-ups are excluded.`, recommendation: "Redistribute direct volume or remove lower-priority work before activation.", correctiveAction: "regenerate_affected_sessions" });
      if (session.spinalLoad > policy.maximumSessionSpinalLoad) warnings.push({ severity: "serious", type: "spinal_load", sessionId: session.id, exerciseIds: session.exercises.filter((item) => item.scores.spinalLoad >= 65).map((item) => item.exerciseId), conflict: `Excessive spinal loading in ${session.name}: ${names.join(", ")}.`, why: "Several axially or isometrically demanding movements may reduce later-set quality and extend recovery.", recommendation: "Move one hinge, squat, or unsupported row to another day, or choose a supported/machine alternative." });
      if (highFatigue.length > policy.maximumHighFatigueCompoundsPerSession) warnings.push({ severity: "serious", type: "compound_concentration", sessionId: session.id, exerciseIds: highFatigue.map((item) => item.exerciseId), conflict: `Too many high-fatigue compounds in ${session.name}: ${highFatigue.map((item) => item.exerciseName).join(", ")}.`, why: "The session concentrates systemic fatigue and may make later exercises poor-quality work.", recommendation: "Distribute the compounds across the week or replace the lowest-priority one with a lower-fatigue accessory." });
      if (session.gripDemand > policy.maximumSessionGripDemand) warnings.push({ severity: "review", type: "grip_fatigue", sessionId: session.id, exerciseIds: session.exercises.filter((item) => item.scores.gripDemand >= 65).map((item) => item.exerciseId), conflict: `Grip demand is concentrated in ${session.name}.`, why: "Grip may limit target-muscle performance across pulls, rows, carries, and hinges.", recommendation: "Separate grip-limited lifts, use straps where appropriate, or choose a supported/cable alternative." });
      if (session.estimatedDurationMinutes > policy.sessionDurationMaximumMinutes) warnings.push({ severity: "serious", type: "session_duration", sessionId: session.id, exerciseIds: session.exercises.map((item) => item.exerciseId), conflict: `${session.name} is estimated at ${session.estimatedDurationMinutes} minutes.`, why: "An overly long session can reduce adherence and set quality.", recommendation: "Move accessory work to a shorter day or reduce redundant sets." });
      const redundantPairs = [];
      session.exercises.forEach((exercise, index) => session.exercises.slice(index + 1).forEach((other) => {
        const similarity = mechanicalRedundancyScore(exercise, other);
        if (similarity >= 0.82) redundantPairs.push({ exercise, other, similarity });
      }));
      redundantPairs.forEach(({ exercise, other, similarity }) => warnings.push({ severity: "review", type: "redundant_pattern", sessionId: session.id, exerciseIds: [exercise.exerciseId, other.exerciseId], conflict: `${exercise.exerciseName} and ${other.exerciseName} duplicate the same training role in ${session.name}.`, why: `They share a primary target, joint action, movement pattern, and closely similar loading/role profile (${Math.round(similarity * 100)}% mechanical similarity), so the second exercise crowds out more distinct work.`, recommendation: "Keep the higher-priority option and replace the other with a mechanically complementary exercise or remove it.", correctiveAction: "apply_recommended_fix" }));
    });
    scheduledCanonicalIds.forEach((sessionIds, canonicalId) => {
      if (unique(sessionIds).length > 1) warnings.push({ severity: "blocking", type: "duplicate_canonical_exercise", sessionId: null, exerciseIds: [canonicalId], conflict: `${canonicalId} is assigned on more than one training day.`, why: "Automatically generated mesocycles use each canonical exercise on only one scheduled day; aliases and duplicate labels do not bypass the rule.", recommendation: "Keep the exercise on its highest-value day and use the next compatible candidate for the other exposure.", correctiveAction: "regenerate_affected_sessions" });
    });
    groupBy(asArray(sessions.capacityIssues), (issue) => issue.exerciseId).forEach((issues) => {
      const issue = issues[0];
      const unallocatedSets = sum(issues.map((item) => item.unallocatedSets));
      warnings.push({ severity: "blocking", type: "schedule_capacity", sessionId: null, muscleGroupId: issue.muscleGroupIds?.[0] || null, exerciseIds: [issue.exerciseId], conflict: `${issue.exerciseName} has ${unallocatedSets} working set${unallocatedSets === 1 ? "" : "s"} that cannot fit the selected schedule.`, why: issue.reason, recommendation: "Increase training days, reduce selected scope or direct volume, use maintenance volume for a lower-priority muscle, or change the mesocycle objective.", resolutionOptions: ["increase_training_days", "reduce_scope", "reduce_direct_volume", "maintenance_volume", "change_objective"], correctiveAction: "regenerate_with_practical_limits" });
    });
    const musclePlans = slots.map((slot) => {
      const selected = portfolio.filter((item) => item.programSlotIds.includes(slot.id));
      const contributions = sessions.flatMap((session) => session.exercises.map((item) => ({ session, item, mapping: taxonomyContributionFor(evidence.research, item, slot.muscleGroupId) }))).filter((entry) => entry.mapping);
      const directSets = sum(contributions.filter((entry) => entry.mapping.relationship_type === "direct_load" || entry.mapping.relationship_type === "primary").map((entry) => number(entry.item.plannedSets, 0) * number(entry.mapping.fractional_set_credit, 1)));
      const secondarySets = sum(contributions.filter((entry) => entry.mapping.relationship_type === "meaningful_fractional_load" || entry.mapping.relationship_type === "secondary").map((entry) => number(entry.item.plannedSets, 0) * number(entry.mapping.fractional_set_credit, 0)));
      const isometricExposure = sum(contributions.filter((entry) => entry.mapping.relationship_type === "isometric_stabilizing_load").map((entry) => number(entry.item.plannedSets, 0) * number(entry.mapping.local_fatigue_weight, 0)));
      const sessionIds = unique(contributions.filter((entry) => number(entry.mapping.fractional_set_credit, 0) > 0).map((entry) => entry.session.id));
      const effectiveSets = round(directSets + secondarySets, 1);
      return { muscleGroupId: slot.muscleGroupId, taxonomyVersion: evidence.research.version, weeklyTargetRange: slot.weeklySetsRange, weeklyTargetVolume: slot.weeklySetsTarget, plannedFrequency: sessionIds.length, targetFrequency: slot.weeklyExposuresTarget, selectedExerciseIds: selected.map((item) => item.exerciseId), directSets: round(directSets, 1), secondarySets: round(secondarySets, 1), indirectSets: round(secondarySets, 1), incidentalSets: 0, isometricExposure: round(isometricExposure, 1), effectiveSets, targetMet: directSets >= slot.weeklySetsRange.min && directSets <= slot.weeklySetsRange.max && sessionIds.length >= slot.weeklyExposuresTarget, localFatigue: round(average(selected.map((item) => item.scores.fatigueCost)), 1), programWideFatigue: round(sum(selected.map((item) => item.scores.systemicFatigue + item.scores.spinalLoad * 0.5)), 1), sessionIds, overlapNotes: secondarySets > 0 ? "Exercise-specific fractional relationships supply secondary credit; isometric and incidental involvement remain fatigue-only." : "No material fractional hypertrophy contribution was identified." };
    });
    musclePlans.forEach((plan) => {
      if (!plan.selectedExerciseIds.length) warnings.push({ severity: "serious", type: "missing_exposure", sessionId: null, exerciseIds: [], conflict: `${plan.muscleGroupId.replaceAll("_", " ")} has no selected exercise.`, why: "The complete program would omit a represented training requirement.", recommendation: "Select an eligible candidate or explicitly remove the program slot." });
      else if (plan.directSets < plan.weeklyTargetRange.min) warnings.push({ severity: MAJOR_PROGRAM_MUSCLES.has(muscleFamily(plan.muscleGroupId)) ? "blocking" : "warning", type: "volume_below_target", sessionId: null, muscleGroupId: plan.muscleGroupId, exerciseIds: plan.selectedExerciseIds, conflict: `${plan.muscleGroupId.replaceAll("_", " ")} receives ${plan.directSets} direct sets, below its ${plan.weeklyTargetRange.min}-${plan.weeklyTargetRange.max} range.`, why: "Primary requirements are evaluated from direct working sets; secondary participation cannot silently replace them.", recommendation: "Add direct sets if schedule capacity remains, or reduce scope/use maintenance volume for a lower-priority muscle.", correctiveAction: "regenerate_with_practical_limits" });
      else if (plan.effectiveSets > plan.weeklyTargetRange.max) warnings.push({ severity: "warning", type: "volume_above_target", sessionId: null, exerciseIds: plan.selectedExerciseIds, conflict: `${plan.muscleGroupId.replaceAll("_", " ")} receives ${plan.effectiveSets} effective sets, above its ${plan.weeklyTargetRange.min}-${plan.weeklyTargetRange.max} range.`, why: "Extra overlap may add fatigue without a proportional benefit.", recommendation: "Remove low-value overlap or reduce one contributing exercise." });
      if (plan.plannedFrequency < plan.targetFrequency) warnings.push({ severity: "blocking", type: "frequency_below_target", sessionId: null, exerciseIds: plan.selectedExerciseIds, conflict: `${plan.muscleGroupId.replaceAll("_", " ")} is trained ${plan.plannedFrequency} time(s), below its ${plan.targetFrequency}-exposure target.`, why: "The allocated weekly sets are too concentrated for the intended frequency.", recommendation: "Distribute the selected exercise or a complementary lift to another compatible session." });
    });
    portfolio.filter((item) => item.scores.highFatigueCompound).forEach((exercise) => {
      const days = sessions.filter((session) => session.exercises.some((item) => item.exerciseId === exercise.exerciseId)).map((session) => session.dayIndex).sort((a, b) => a - b);
      if (days.some((day, index) => index && day - days[index - 1] <= 1)) warnings.push({ severity: "blocking", type: "consecutive_heavy_pattern", sessionId: null, exerciseIds: [exercise.exerciseId], conflict: `${exercise.exerciseName} is programmed on consecutive training days.`, why: "Repeating the same high-fatigue movement without recovery can degrade performance and increase local/systemic fatigue.", recommendation: "Separate exposures by at least one training day or use a lower-fatigue complementary exercise." });
    });
    sessions.slice(1).forEach((session, index) => {
      const prior = sessions[index];
      const priorMuscles = new Set(prior.exercises.flatMap((item) => item.targetMuscleGroupIds || []).map(muscleFamily));
      const overlap = unique(session.exercises.flatMap((item) => item.targetMuscleGroupIds || []).map(muscleFamily).filter((muscle) => priorMuscles.has(muscle)));
      const demandingOverlap = overlap.filter((muscle) => {
        const combined = [...prior.exercises, ...session.exercises].filter((item) => (item.targetMuscleGroupIds || []).map(muscleFamily).includes(muscle));
        return combined.some((item) => item.scores.highFatigueCompound || item.scores.fatigueCost >= 70);
      });
      if (demandingOverlap.length >= 2) warnings.push({ severity: "review", type: "adjacent_session_overlap", sessionId: session.id, exerciseIds: session.exercises.filter((item) => item.targetMuscleGroupIds?.some((muscle) => demandingOverlap.includes(muscleFamily(muscle)))).map((item) => item.exerciseId), conflict: `${prior.name} and ${session.name} repeat demanding work for ${demandingOverlap.join(", ")}.`, why: "Consecutive high-cost exposure may reduce recovery and next-session performance.", recommendation: "Move one demanding pattern, use a lower-fatigue complement, or insert more recovery between these sessions." });
    });
    const explanation = [
      "The exercise portfolio was selected before session construction.",
      "Demanding compounds were distributed using systemic fatigue, spinal load, grip demand, muscle overlap, and estimated duration.",
      warnings.length ? `${warnings.length} interaction warning${warnings.length === 1 ? " requires" : "s require"} review before activation.` : "No serious program interaction remains unresolved."
    ];
    return { warnings, blockingIssueCount: warnings.filter((item) => item.severity === "blocking").length, seriousWarningCount: warnings.filter((item) => ["blocking", "serious"].includes(item.severity)).length, musclePlans, explanation };
  }

  function refreshMesocycleProgram(mesocycle, evidenceInput, options = {}) {
    const evidence = evidenceInput.personal ? evidenceInput : normalizeEvidenceBundle(evidenceInput);
    const slots = deepClone(mesocycle.programSlots || []);
    let portfolio = buildProgramPortfolio(mesocycle.pools, slots, { ...mesocycle.constraints, ...options, evidence, currentProgramExerciseIds: options.currentProgramExerciseIds || mesocycle.currentProgramExerciseIds, specializationMuscleGroups: mesocycle.specializationMuscleGroups, type: mesocycle.type });
    if (options.selections) {
      slots.forEach((slot) => {
        const requested = asArray(options.selections[slot.id]);
        if (requested.length) slot.selectedExerciseIds = requested.filter((id) => slot.candidateExerciseIds.includes(id)).slice(0, slot.selectionRequired);
      });
      const selectedIds = unique(slots.flatMap((slot) => slot.selectedExerciseIds));
      portfolio = selectedIds.map((exerciseId) => {
        const slot = slots.find((item) => item.selectedExerciseIds.includes(exerciseId));
        const candidate = mesocycle.pools[slot.muscleGroupId].candidates.find((item) => item.exerciseId === exerciseId);
        const relatedSlots = slots.filter((item) => item.selectedExerciseIds.includes(exerciseId));
        const fit = candidateProgramFit(candidate, portfolio, { ...DEFAULT_POLICY, ...(options.policy || {}) });
        return { ...deepClone(candidate), muscleGroupId: slot.muscleGroupId, targetMuscleGroupIds: relatedSlots.map((item) => item.muscleGroupId), programSlotIds: relatedSlots.map((item) => item.id), selectionReason: "Selected by the user for this program slot; the engine will not undo it inside this mesocycle draft.", ...fit };
      }).filter(Boolean);
    }
    const pools = rerankPoolsForPortfolio(mesocycle.pools, portfolio, options);
    portfolio = portfolio.map((item) => {
      const ranked = pools[item.muscleGroupId]?.candidates.find((candidate) => candidate.exerciseId === item.exerciseId) || item;
      return { ...item, ...candidateProgramFit(ranked, portfolio.filter((other) => other.exerciseId !== item.exerciseId), { ...DEFAULT_POLICY, ...(options.policy || {}) }), scores: ranked.scores, scoreExplanation: ranked.scoreExplanation };
    });
    const sessions = distributePortfolioAcrossSessions(portfolio, { ...options, slots, trainingDays: mesocycle.trainingDays, type: mesocycle.type });
    slots.forEach((slot) => { slot.plannedSessionIds = sessions.filter((session) => session.exercises.some((item) => item.programSlotIds.includes(slot.id))).map((session) => session.id); });
    const programReview = reviewFullProgram(portfolio, sessions, slots, evidence, options);
    asArray(mesocycle.equipmentUnavailableMuscleGroupIds).forEach((muscleGroupId) => {
      if (!programReview.warnings.some((warning) => warning.type === "equipment_blocks_muscle" && warning.muscleGroupId === muscleGroupId)) programReview.warnings.push({ severity: "blocking", type: "equipment_blocks_muscle", muscleGroupId, sessionId: null, exerciseIds: [], conflict: `${muscleGroupId.replaceAll("_", " ")} has no exercise compatible with the selected equipment.`, why: "This muscle is in scope, but every known candidate requires equipment that is unavailable or has incomplete verified equipment metadata.", recommendation: "Add compatible equipment, add a verified exercise to the library, or intentionally remove this muscle from scope." });
      if (!programReview.musclePlans.some((plan) => plan.muscleGroupId === muscleGroupId)) programReview.musclePlans.push({ muscleGroupId, taxonomyVersion: evidence.research.version, weeklyTargetRange: { min: 0, target: 0, max: 0 }, weeklyTargetVolume: 0, plannedFrequency: 0, targetFrequency: 0, selectedExerciseIds: [], directSets: 0, secondarySets: 0, indirectSets: 0, incidentalSets: 0, isometricExposure: 0, effectiveSets: 0, targetMet: false, localFatigue: 0, programWideFatigue: 0, sessionIds: [], overlapNotes: "No equipment-compatible exercise is currently available." });
    });
    programReview.blockingIssueCount = programReview.warnings.filter((item) => item.severity === "blocking").length;
    programReview.seriousWarningCount = programReview.warnings.filter((item) => ["blocking", "serious"].includes(item.severity)).length;
    return { ...mesocycle, pools, programSlots: slots, selectedPortfolio: portfolio, activeExercises: portfolio, sessions, programReview, planningStep: Math.max(number(mesocycle.planningStep, 1), 5) };
  }

  function createMesocyclePlan(evidenceInput, options = {}) {
    const evidence = evidenceInput.personal ? evidenceInput : normalizeEvidenceBundle(evidenceInput);
    const type = Object.values(MESOCYCLE_TYPES).includes(options.type) ? options.type : MESOCYCLE_TYPES.PRIMARY;
    const createdAt = options.createdAt || isoNow(options.clock);
    const durationWeeks = chooseMesocycleDuration(evidence, { ...options, type });
    const poolOptions = { ...options, mesocycleType: type, maxCandidates: 5 };
    const unrestrictedPools = consolidateProgramPools(buildAllCandidatePools(evidence, { ...poolOptions, availableEquipment: undefined }));
    const allPools = consolidateProgramPools(buildAllCandidatePools(evidence, poolOptions));
    const availableMuscleGroupIds = Object.keys(unrestrictedPools);
    const requestedScope = asArray(options.includedMuscleGroupIds).map(muscleFamily).filter(Boolean);
    const includedMuscleGroupIds = requestedScope.length ? unique(requestedScope).filter((id) => availableMuscleGroupIds.includes(id)) : availableMuscleGroupIds;
    const pools = Object.fromEntries(Object.entries(allPools).filter(([muscleGroupId]) => includedMuscleGroupIds.includes(muscleGroupId)));
    const equipmentUnavailableMuscleGroupIds = includedMuscleGroupIds.filter((muscleGroupId) => !pools[muscleGroupId]?.candidates?.length);
    const majorMuscleGroups = new Set(["chest", "upper_back", "lats", "quads", "hamstrings", "glutes", "front_delts", "side_delts", "rear_delts"]);
    const omittedMuscleGroups = availableMuscleGroupIds.filter((id) => !includedMuscleGroupIds.includes(id)).map((muscleGroupId) => ({
      muscleGroupId,
      importance: majorMuscleGroups.has(muscleGroupId) ? "major" : "smaller",
      reasonCode: majorMuscleGroups.has(muscleGroupId) ? "outside_selected_scope" : ["front_delts", "rear_delts", "forearms"].includes(muscleGroupId) ? "indirect_stimulus" : "deprioritized_for_objective",
      explanation: majorMuscleGroups.has(muscleGroupId)
        ? `${muscleGroupId.replaceAll("_", " ")} is outside the selected scope, so this plan assigns no dedicated slot. Compound overlap may provide some indirect work, but it is not treated as sufficient direct volume.`
        : ["front_delts", "rear_delts", "forearms"].includes(muscleGroupId)
          ? `${muscleGroupId.replaceAll("_", " ")} can receive indirect stimulus from selected presses, pulls, or grip-demanding movements. It is intentionally deprioritized unless direct development is a goal.`
          : `${muscleGroupId.replaceAll("_", " ")} is outside the current objective and receives no dedicated slot. Add it when direct development, resilience, or skill is a priority.`
    }));
    const programSlots = createProgramSlots(pools, { ...options, type, evidence });
    const id = options.id || `meso_${normalizeText(type)}_${dateOnly(createdAt).replace(/-/g, "")}_${stableHash({ type, durationWeeks, groups: Object.keys(pools), createdAt }).slice(0, 6)}`;
    const draft = {
      id,
      schemaVersion: "mesocycle/2.4.0",
      type,
      name: options.name || ({
        [MESOCYCLE_TYPES.PRIMARY]: "Primary progression mesocycle",
        [MESOCYCLE_TYPES.ALTERNATIVE]: "Alternative exercise mesocycle",
        [MESOCYCLE_TYPES.LOWER_FATIGUE]: "Lower-fatigue resensitization mesocycle",
        [MESOCYCLE_TYPES.SPECIALIZATION]: "Specialization mesocycle"
      })[type],
      status: "draft",
      createdAt,
      durationWeeks,
      durationBasis: number(options.durationWeeks) > 0 ? "User-configured duration within safety bounds." : "Derived from mesocycle purpose, personal plateau history, research evaluation windows, and expected weekly exposure frequency.",
      specializationMuscleGroups: type === MESOCYCLE_TYPES.SPECIALIZATION ? asArray(options.specializationMuscleGroups).map(normalizeMuscleId) : [],
      trainingDays: number(options.trainingDays, 4),
      split: options.split || null,
      availableEquipment: asArray(options.availableEquipment),
      constraints: {
        trainingDays: number(options.trainingDays, 4),
        split: options.split || null,
        availableEquipment: asArray(options.availableEquipment),
        sessionDurationTargetMinutes: number(options.sessionDurationTargetMinutes, DEFAULT_POLICY.sessionDurationTargetMinutes),
        sessionDurationMaximumMinutes: number(options.sessionDurationMaximumMinutes, DEFAULT_POLICY.sessionDurationMaximumMinutes)
      },
      planningStep: 3,
      availableMuscleGroupIds,
      includedMuscleGroupIds,
      equipmentUnavailableMuscleGroupIds,
      omittedMuscleGroups,
      scopeConfirmed: omittedMuscleGroups.length === 0,
      currentProgramExerciseIds: asArray(options.currentProgramExerciseIds || options.currentExerciseIds),
      recentExerciseWindowDays: number(options.recentExerciseWindowDays, DEFAULT_POLICY.recentExerciseWindowDays),
      pools,
      programSlots,
      selectedPortfolio: [],
      activeExercises: [],
      sessions: [],
      programReview: { warnings: [], seriousWarningCount: 0, musclePlans: [], explanation: [] },
      preservedProductiveExerciseIds: [],
      versions: deepClone(evidence.versions),
      lifecycle: [{ status: "draft", at: createdAt }]
    };
    const refreshed = refreshMesocycleProgram(draft, evidence, options);
    refreshed.preservedProductiveExerciseIds = refreshed.selectedPortfolio.filter((item) => refreshed.currentProgramExerciseIds.includes(item.exerciseId) && item.scores.staleness.classification === STALENESS.PRODUCTIVE).map((item) => item.exerciseId);
    return refreshed;
  }

  function transitionMesocycle(mesocycle, action, options = {}) {
    const next = deepClone(mesocycle);
    const at = options.at || isoNow(options.clock);
    const allowed = {
      plan: ["draft"],
      start: ["planned"],
      complete: ["active"],
      abandon: ["draft", "planned", "active"],
      archive: ["completed", "abandoned"],
      review: ["completed", "archived"]
    };
    if (!allowed[action]?.includes(next.status)) throw new Error(`Cannot ${action} a mesocycle with status ${next.status}.`);
    if (["plan", "start"].includes(action) && asArray(next.omittedMuscleGroups).length && !next.scopeConfirmed) throw new Error("Confirm the intentionally omitted muscle groups before continuing.");
    if (action === "start" && number(next.programReview?.blockingIssueCount, 0) > 0) throw new Error("Cannot activate a mesocycle with unresolved blocking program issues.");
    if (action === "plan") next.status = "planned";
    if (action === "start") {
      next.status = "active";
      next.startedAt = at;
    }
    if (action === "complete") {
      next.status = "completed";
      next.completedAt = at;
      next.outcome = deepClone(options.outcome || {});
    }
    if (action === "abandon") {
      next.status = "abandoned";
      next.abandonedAt = at;
    }
    if (action === "archive") {
      next.status = "archived";
      next.archivedAt = at;
    }
    if (action === "review") {
      next.status = "reviewed";
      next.reviewedAt = at;
      next.review = deepClone(options.review || {});
    }
    next.lifecycle = [...asArray(next.lifecycle), { status: next.status, at }];
    return next;
  }

  function updateMesocycleSelection(evidenceInput, mesocycle, programSlotId, exerciseIds, options = {}) {
    if (!["draft", "planned"].includes(mesocycle.status)) throw new Error("Only draft or planned mesocycles can change exercise selections.");
    const selections = Object.fromEntries(asArray(mesocycle.programSlots).map((slot) => [slot.id, slot.id === programSlotId ? asArray(exerciseIds) : slot.selectedExerciseIds]));
    return refreshMesocycleProgram(deepClone(mesocycle), evidenceInput, { ...options, selections });
  }

  function canDeleteMesocycle(mesocycle) {
    const activated = asArray(mesocycle.lifecycle).some((event) => event.status === "active") || Boolean(mesocycle.startedAt);
    return !activated && ["draft", "planned", "abandoned"].includes(mesocycle.status);
  }

  function resolveExerciseCandidate(evidence, exerciseId, muscleGroupId, options = {}) {
    const candidates = buildMergedExerciseCandidates(evidence, muscleGroupId, options);
    const requestedPersonalIdentity = evidence.personal.reconciledIdentityByExerciseId?.get(exerciseId) || null;
    let candidate = candidates.find((item) => item.exerciseId === exerciseId);
    if (!candidate && !requestedPersonalIdentity) candidate = candidates.find((item) => item.researchExerciseId === exerciseId);
    if (candidate) {
      if (options.history) candidate.history = options.history;
      return candidate;
    }
    const selectedIdentity = requestedPersonalIdentity;
    const selectedResearchExerciseId = selectedIdentity?.invalid ? null : selectedIdentity?.researchExerciseId || null;
    const researchExercise = evidence.research.exerciseById.get(exerciseId) || evidence.research.exerciseById.get(selectedResearchExerciseId);
    const score = evidence.personal.scoreByExercise.get(exerciseId) || {};
    const prescription = evidence.personal.prescriptionsFor(exerciseId, muscleGroupId)[0] || (evidence.personal.prescriptionsByExercise.get(exerciseId) || [])[0] || {};
    if (!researchExercise && !Object.keys(score).length && !Object.keys(prescription).length) throw new Error(`Unknown exercise ${exerciseId} for muscle group ${muscleGroupId}.`);
    const researchExerciseId = selectedIdentity?.invalid ? null : researchExercise?.exercise_id || selectedResearchExerciseId || null;
    const mappings = evidence.research.muscleMapsByExercise.get(researchExerciseId) || [];
    const relevantMapping = mappings.find((mapping) => researchMuscleMatch(evidence.research, muscleGroupId, mapping.muscle_group_id)) || {};
    const canonicalIdentity = researchExerciseId === exerciseId && selectedIdentity?.researchIdentitySource === "canonical_id";
    return {
      exerciseId,
      researchExerciseId,
      exerciseName: firstPresent(canonicalIdentity ? researchExercise?.exercise_name : null, score.exercise_name, prescription.exercise_name, researchExercise?.exercise_name, exerciseId),
      personalScore: score,
      personalPrescription: prescription,
      muscleScore: evidence.personal.muscleScoresFor(exerciseId, muscleGroupId)[0] || {
        muscle_group: muscleGroupId,
        muscle_role: relevantMapping.relationship_type || "primary",
        contribution_weight: relevantMapping.fractional_set_credit || 1,
        research_muscle_group_id: relevantMapping.muscle_group_id
      },
      history: options.history || options.histories?.[exerciseId] || evidence.personal.historyFor(exerciseId),
      researchExercise: researchExercise || null,
      researchMappings: mappings,
      selectedIdentity,
      source: researchExercise && (Object.keys(score).length || Object.keys(prescription).length) ? "personal_and_research" : researchExercise ? "research_only" : "personal_only"
    };
  }

  function prescribedLoadFromHistory(candidate, progression, deloadState, options = {}) {
    const history = normalizeHistory(candidate.history).filter((item) => !item.prescribedReduction);
    const last = history.at(-1);
    const loads = last?.loads?.filter((value) => value > 0) || [];
    const current = loads.length ? Math.max(...loads) : number(firstPresent(last?.raw?.max_load, last?.raw?.weight, last?.raw?.load), 0);
    if (!current) return undefined;
    const exercise = candidate.researchExercise || {};
    const resistanceType = normalizeText(firstPresent(
      options.resistanceType,
      last?.raw?.resistanceType,
      last?.raw?.resistance_type,
      candidate.personalScore?.resistance_type,
      candidate.personalScore?.resistanceType
    ));
    const assisted = resistanceType === "assisted_bodyweight";
    let target = current;
    let reason = "Hold the most recent comparable load.";
    if (progression.action === "increase_load" || progression.action === "increase_top_set_load" || progression.action === "increase_load_first") {
      const personalIncrement = number(candidate.personalPrescription?.recommended_load_increment?.value, 0);
      const equipmentIncrement = number(options.equipmentIncrement, 0) || personalIncrement;
      const percent = 2.5;
      target = equipmentIncrement > 0 ? (assisted ? Math.max(0, current - equipmentIncrement) : current + equipmentIncrement) : assisted ? current * (1 - percent / 100) : current * (1 + percent / 100);
      reason = equipmentIncrement > 0 ? `Use the smallest available equipment increment (${equipmentIncrement} ${candidate.personalPrescription?.recommended_load_increment?.unit || "logged units"}).` : `Use the smallest practical increment (research default approximately ${percent}%).`;
    }
    if (["exercise_deload", "muscle_group_deload", "full_program_deload"].includes(deloadState.state)) {
      const reduction = deloadState.state === "full_program_deload" ? 15 : 10;
      target = assisted ? current * (1 + reduction / 100) : current * (1 - reduction / 100);
      reason = `${deloadState.state.replace(/_/g, " ")}: reduce loading stress approximately ${reduction}%.`;
    }
    return {
      previous: round(current, 2),
      target: round(target, 2),
      unit: candidate.personalScore?.weight_unit || candidate.personalScore?.weightUnit || null,
      adjustmentPercent: current ? round((target / current - 1) * 100, 1) : 0,
      direction: assisted ? "less_assistance_is_progress" : "more_external_load_is_progress",
      reason,
      researchIncrement: exercise.recommended_load_increment || null
    };
  }

  function applyDeloadState(basePrescription, deloadStatus) {
    const result = deepClone(basePrescription);
    if (!deloadStatus || ["normal", "readiness_adjustment"].includes(deloadStatus.state)) return result;
    if (deloadStatus.state === "light_session") {
      result.recommendationType = "light_session";
      result.workingSets.target = Math.max(1, result.workingSets.target - 1);
      result.targetRpe = { min: Math.min(result.targetRpe.min, 6), max: Math.min(result.targetRpe.max, 7) };
      result.progressionRule = "Maintain movement practice today; do not treat a planned light session as a progression test.";
      return result;
    }
    if (["exercise_deload", "muscle_group_deload", "full_program_deload"].includes(deloadStatus.state)) {
      result.recommendationType = deloadStatus.state;
      result.workingSets.target = Math.max(1, result.volume.perExercise.deload);
      result.workingSets.min = Math.min(result.workingSets.min, result.workingSets.target);
      result.workingSets.max = Math.max(result.workingSets.target, Math.min(result.workingSets.max, result.workingSets.target + 1));
      result.targetRpe = { min: 5.5, max: deloadStatus.state === "full_program_deload" ? 6.5 : 7 };
      result.targetRir = { min: deloadStatus.state === "full_program_deload" ? 3.5 : 3, max: 4.5 };
      result.setStructure = result.workingSets.target === 1 ? "single_working_set" : "straight_sets";
      result.setStructureReason = `${deloadStatus.explanation} Straight technique work avoids an unnecessary heavy peak set during the deload.`;
      delete result.topSet;
      delete result.backoffSets;
      result.progressionRule = "Do not progress load during the deload; preserve controlled technique and stop well short of failure.";
      result.holdRule = "Hold the reduced prescription for one exposure, then reassess the affected scope.";
      result.regressionRule = "If performance or pain remains worse after reduced stress, rotate the exercise or extend the affected-scope deload after review.";
    }
    return result;
  }

  function createExercisePrescriptionSnapshot(evidenceInput, options = {}) {
    const evidence = evidenceInput.personal ? evidenceInput : normalizeEvidenceBundle(evidenceInput);
    const muscleGroupId = options.muscleGroupId;
    if (!options.exerciseId || !muscleGroupId) throw new Error("exerciseId and muscleGroupId are required.");
    const createdAt = options.createdAt || isoNow(options.clock);
    const candidate = resolveExerciseCandidate(evidence, options.exerciseId, muscleGroupId, options);
    if (options.history) candidate.history = options.history;
    const score = scoreExerciseCandidate(candidate, evidence, muscleGroupId, {
      ...options,
      createdAt,
      mesocycleType: options.mesocycle?.type || options.mesocycleType,
      specializationMuscleGroups: options.mesocycle?.specializationMuscleGroups || options.specializationMuscleGroups
    });
    const muscleDefaults = aggregateMuscleResearchDefaults(evidence.research, muscleGroupId);
    const researchDefaults = researchExerciseDefaults(candidate.researchExercise, muscleDefaults);
    const personalRanges = personalPrescriptionRanges(candidate.personalPrescription);
    const repRange = blendRange(personalRanges.repRange, researchDefaults.repRange, score.personalEvidenceWeight, {
      integer: true,
      minimumWidth: DEFAULT_POLICY.minimumRepRangeWidth,
      floor: number(candidate.researchExercise?.acceptable_rep_range_low, 3),
      ceiling: number(candidate.researchExercise?.acceptable_rep_range_high, 30)
    }) || { min: 6, target: 10, max: 15 };
    const targetRir = blendRange(personalRanges.rir, researchDefaults.rir, score.personalEvidenceWeight, { floor: 0, ceiling: 5 }) || { min: 1, target: 2, max: 3 };
    const researchRpe = { min: 10 - targetRir.max, max: 10 - targetRir.min };
    const targetRpe = blendRange(personalRanges.rpe, researchRpe, score.personalEvidenceWeight, { floor: 5, ceiling: 10 }) || { min: 7, target: 8, max: 9 };
    const restSeconds = blendRange(personalRanges.restSeconds, researchDefaults.restSeconds, score.personalEvidenceWeight, { integer: true, floor: 30, ceiling: 600 }) || { min: 90, target: 150, max: 240 };
    const frequencyPerWeek = blendRange(personalRanges.frequency, researchDefaults.frequency, score.personalEvidenceWeight, { floor: 1, ceiling: 7 }) || { min: 1, target: 2, max: 3 };
    const mesocycleType = options.mesocycle?.type || options.mesocycleType || MESOCYCLE_TYPES.PRIMARY;
    const role = normalizeRole(options.role || candidate.personalPrescription?.role, candidate.researchExercise);
    const volume = determineVolumePrescription({
      personalRanges,
      researchDefaults,
      personalEvidenceWeight: score.personalEvidenceWeight,
      personalPrescription: candidate.personalPrescription,
      staleness: score.staleness,
      mesocycleType,
      specializationMuscleGroups: options.mesocycle?.specializationMuscleGroups || options.specializationMuscleGroups,
      muscleGroupId,
      currentWeeklySets: options.currentWeeklySets
    });
    const workingSets = {
      min: Math.min(volume.perExercise.normalOperatingRange.min, volume.perExercise.currentPrescribed),
      target: volume.perExercise.currentPrescribed,
      max: Math.max(volume.perExercise.normalOperatingRange.max, volume.perExercise.currentPrescribed)
    };
    const structure = chooseSetStructure({
      researchExercise: candidate.researchExercise,
      personalPrescription: candidate.personalPrescription,
      history: candidate.history,
      role,
      workingSets,
      repRange,
      personalEvidenceWeight: score.personalEvidenceWeight
    });
    const progression = determineProgressionDecision({
      history: candidate.history,
      repRange,
      targetRpe,
      staleness: score.staleness,
      setStructure: structure.setStructure,
      workingSets,
      progressionMethod: candidate.researchExercise?.preferred_progression_model || "double_progression"
    });
    const deloadStatus = assessDeloadNeed({
      exerciseStaleness: score.staleness,
      exerciseHistory: candidate.history,
      muscleExerciseHistories: options.muscleExerciseHistories,
      programMuscleHistories: options.programMuscleHistories,
      readiness: options.readiness,
      plannedLightSession: mesocycleType === MESOCYCLE_TYPES.LOWER_FATIGUE || options.plannedLightSession
    });
    const pool = rankExercisePool(evidence, muscleGroupId, {
      ...options,
      histories: options.histories,
      mesocycleType,
      maxCandidates: 5
    });
    const preferredReplacementExerciseId = pool.candidates.find((item) => item.exerciseId === candidate.exerciseId)?.preferredReplacementExerciseId || preferredReplacementFor(candidate, evidence, [], options);
    let recommendationType = volume.adjustmentType === "reduce_volume" ? "reduce_volume" : progression.recommendationType;
    if (score.staleness.rotationRecommended && !deloadStatus.exerciseSpecific) recommendationType = score.staleness.metrics.painFlag ? "substitute" : "rotate_exercise";
    const evidenceSummary = unique([
      candidate.personalPrescription?.evidence_summary,
      candidate.personalScore?.main_reason_for_score,
      score.weightingReason,
      `Research default: ${researchDefaults.repRange.min}-${researchDefaults.repRange.max} reps, ${researchDefaults.setsPerSession.min}-${researchDefaults.setsPerSession.max} sets per exercise, ${researchDefaults.rir.min}-${researchDefaults.rir.max} RIR.`,
      `Set structure: ${structure.reasoning}`,
      `Staleness: ${score.staleness.label}. ${score.staleness.reasons.join(" ")}`,
      deloadStatus.explanation
    ]);
    const userExplanation = [
      `${candidate.exerciseName} is assigned as a ${role.replace(/_/g, " ")} because its blended recommendation strength is ${Math.round(score.overallRecommendationStrength)}/100.`,
      `${volume.reason} The active target is ${workingSets.target} sets of ${repRange.min}-${repRange.max} reps at RPE ${targetRpe.min}-${targetRpe.max} (${targetRir.min}-${targetRir.max} RIR).`,
      structure.reasoning,
      progression.instruction,
      deloadStatus.explanation,
      `Personal evidence contributes ${Math.round(score.personalEvidenceWeight * 100)}% and research contributes ${Math.round(score.researchEvidenceWeight * 100)}%; ${score.weightingReason}`,
      `The recommendation would change after confirmed comparable performance, repeated fatigue or pain, a materially different readiness pattern, or outcome data showing a less redundant substitute performs better.`
    ].join(" ");
    let basePrescription = {
      schemaVersion: PRESCRIPTION_SCHEMA_VERSION,
      exerciseId: candidate.exerciseId,
      researchExerciseId: candidate.researchExerciseId,
      muscleGroupId,
      recommendationType,
      role,
      setStructure: structure.setStructure,
      setStructureReason: structure.reasoning,
      setStructureEvidenceConflict: structure.evidenceConflict,
      workingSets,
      repRange,
      targetRpe: { min: targetRpe.min, max: targetRpe.max },
      targetRir: { min: targetRir.min, max: targetRir.max },
      ...(structure.topSet ? { topSet: structure.topSet } : {}),
      ...(structure.backoffSets ? { backoffSets: structure.backoffSets } : {}),
      restSeconds,
      frequencyPerWeek,
      volume,
      progressionMethod: progression.progressionMethod,
      progressionAction: progression.action,
      progressionRule: recommendationType === "reduce_volume"
        ? `Perform ${workingSets.target} working set${workingSets.target === 1 ? "" : "s"} this exposure; do not add volume until performance and recovery are stable inside the blended weekly range.`
        : progression.instruction,
      holdRule: progression.holdRule,
      regressionRule: progression.regressionRule,
      deloadRule: candidate.personalPrescription?.deload_rule?.trigger || candidate.researchExercise?.deload_criteria || "Require repeated regression plus converging fatigue, recovery, or pain indicators; one abnormal marker is insufficient.",
      substitutionRule: candidate.researchExercise?.substitution_triggers || "Substitute after repeated pain, technical failure, confirmed staleness, or materially better same-function performance from a non-redundant alternative.",
      preferredReplacementExerciseId,
      personalEvidenceWeight: score.personalEvidenceWeight,
      researchEvidenceWeight: score.researchEvidenceWeight,
      confidence: score.confidence,
      executionBlocked: false,
      evidenceSummary,
      userExplanation,
      exerciseScore: score.overallRecommendationStrength,
      muscleSpecificScore: score.muscleSpecificity,
      staleness: score.staleness,
      deloadStatus,
      mesocycleId: options.mesocycle?.id || options.mesocycleId || null
    };
    const load = prescribedLoadFromHistory(candidate, progression, deloadStatus, options);
    if (load) basePrescription.prescribedLoad = load;
    basePrescription = applyDeloadState(basePrescription, deloadStatus);
    const readinessChange = readinessAdjustmentFor(basePrescription, options.readiness || {});
    const hardSafetyReadiness = readinessChange.signals.some((signal) => signal.domain === "illness" || signal.domain === "pain");
    const finalPrescription = hardSafetyReadiness
      ? applyReadinessAdjustment(basePrescription, options.readiness || {})
      : ["exercise_deload", "muscle_group_deload", "full_program_deload"].includes(deloadStatus.state)
        ? { ...deepClone(basePrescription), readinessAdjustment: { ...readinessChange, changed: false, explanation: `${deloadStatus.explanation} The deload already supersedes a smaller readiness adjustment.` } }
        : applyReadinessAdjustment(basePrescription, options.readiness || {});
    const recommendationId = options.recommendationId || `rx_${normalizeText(candidate.exerciseId)}_${dateOnly(createdAt).replace(/-/g, "")}_${stableHash({
      candidate: candidate.exerciseId,
      muscleGroupId,
      createdAt,
      mesocycle: basePrescription.mesocycleId,
      basePrescription,
      finalPrescription,
      readinessAdjustment: finalPrescription.readinessAdjustment || null
    }).slice(0, 8)}`;
    const snapshot = {
      recommendationId,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      recommendationVersion: PRESCRIPTION_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      personalDataVersion: evidence.versions.personal,
      researchDatabaseVersion: evidence.versions.research,
      mesocycleId: basePrescription.mesocycleId,
      exerciseId: candidate.exerciseId,
      muscleGroupId,
      exerciseScore: score.overallRecommendationStrength,
      muscleSpecificScore: score.muscleSpecificity,
      personalEvidenceWeight: score.personalEvidenceWeight,
      researchEvidenceWeight: score.researchEvidenceWeight,
      readinessAdjustment: deepClone(finalPrescription.readinessAdjustment),
      basePrescription: deepClone(basePrescription),
      finalPrescription: deepClone(finalPrescription),
      explanation: finalPrescription.userExplanation,
      evidenceSummary,
      confidence: score.confidence,
      createdAt,
      manualOverrides: [],
      overrideLocked: false
    };
    snapshot.checksum = stableHash({ ...snapshot, checksum: undefined });
    return snapshot;
  }

  function recommendationForSurface(snapshot, surface) {
    const allowed = ["coach", "template", "chart", "workout_start", "live_workout", "deload", "mesocycle"];
    if (!allowed.includes(surface)) throw new Error(`Unknown recommendation surface: ${surface}`);
    return {
      recommendationId: snapshot.recommendationId,
      surface,
      basePrescription: snapshot.basePrescription,
      finalPrescription: snapshot.finalPrescription,
      evidenceSummary: snapshot.evidenceSummary,
      confidence: snapshot.confidence,
      versions: {
        recommendation: snapshot.recommendationVersion,
        personalData: snapshot.personalDataVersion,
        researchDatabase: snapshot.researchDatabaseVersion
      }
    };
  }

  function createWorkoutPrescription(evidenceInput, options = {}) {
    const evidence = evidenceInput.personal ? evidenceInput : normalizeEvidenceBundle(evidenceInput);
    const createdAt = options.createdAt || isoNow(options.clock);
    const recommendations = asArray(options.exercises).map((exercise) => createExercisePrescriptionSnapshot(evidence, {
      ...options,
      ...exercise,
      createdAt,
      readiness: options.readiness,
      mesocycle: options.mesocycle
    }));
    return {
      workoutPrescriptionId: options.workoutPrescriptionId || `workout_rx_${dateOnly(createdAt).replace(/-/g, "")}_${stableHash(recommendations.map((item) => item.recommendationId)).slice(0, 8)}`,
      schemaVersion: "workout-prescription/1.0.0",
      createdAt,
      mesocycleId: options.mesocycle?.id || null,
      recommendationVersion: PRESCRIPTION_SCHEMA_VERSION,
      personalDataVersion: evidence.versions.personal,
      researchDatabaseVersion: evidence.versions.research,
      recommendations
    };
  }

  function boundIdentity(values, label, options = {}) {
    const normalized = values.map((value) => value === undefined ? null : value);
    if (!options.allowNull && normalized.some((value) => typeof value !== "string" || !value.trim())) throw new Error(`Invalid safety identity binding; ${label} requires non-empty identities.`);
    if (normalized.some((value) => !Object.is(value, normalized[0]))) throw new Error(`Invalid safety identity binding; ${label} identities must remain internally bound.`);
    return normalized[0];
  }

  function auditValuesMatch(actual, expected) {
    return stableStringify(actual) === stableStringify(expected);
  }

  function requireAuditTransition(actual, expected, label) {
    if (!auditValuesMatch(actual, expected)) throw new Error(`Invalid manual override lineage identity transition binding; ${label} does not match its recorded prescription transition.`);
  }

  function requireDeclaredChangePair(change, expectedFrom, label) {
    if (!change || typeof change !== "object" || Array.isArray(change) || !("from" in change) || !("to" in change) || change.from === undefined || change.to === undefined) throw new Error(`Invalid manual override lineage; ${label} requires complete from/to values.`);
    requireAuditTransition(change.from, expectedFrom, `${label}.from`);
    if (auditValuesMatch(change.from, change.to)) throw new Error(`Invalid manual override lineage bijection; ${label} is a no-op declaration.`);
    return deepClone(change.to);
  }

  function applyRecordedSetCount(prescription, target) {
    prescription.workingSets.target = target;
    prescription.workingSets.min = Math.min(prescription.workingSets.min, target);
    prescription.workingSets.max = Math.max(prescription.workingSets.max, target);
    return prescription;
  }

  function applyRecordedLoad(prescription, target) {
    prescription.prescribedLoad = {
      ...(prescription.prescribedLoad || {}),
      target,
      reason: "Manual user override; engine recommendation remains in the audit record."
    };
    return prescription;
  }

  function applyRecordedSetStructure(prescription, setStructure) {
    prescription.setStructure = setStructure;
    prescription.setStructureReason = "Manual user override for this workout; the decision engine will not replace it during the same workout.";
    if (setStructure === "top_set_backoff") {
      const topMax = Math.max(prescription.repRange.min + 1, number(prescription.repRange.target, prescription.repRange.max - 1));
      prescription.topSet = deepClone(prescription.topSet || {
        enabled: true,
        count: 1,
        repRange: { min: prescription.repRange.min, max: topMax },
        targetRpe: number(prescription.targetRpe?.max, 8.5),
        targetRir: number(prescription.targetRir?.min, 1.5)
      });
      prescription.backoffSets = deepClone(prescription.backoffSets || {
        count: Math.max(1, prescription.workingSets.target - 1),
        loadReductionPercent: deepClone(DEFAULT_POLICY.backoffReduction),
        repRange: { min: Math.max(prescription.repRange.min, number(prescription.repRange.target, prescription.repRange.min + 1)), max: prescription.repRange.max },
        targetRpe: Math.max(5, number(prescription.targetRpe?.max, 8) - 0.5),
        targetRir: number(prescription.targetRir?.min, 2) + 0.5,
        maximumAcceptableRepLossPercent: DEFAULT_POLICY.maximumRepLossPercent,
        maximumAcceptableLoadReductionPercent: DEFAULT_POLICY.maximumBackoffLoadReductionPercent,
        conversionRule: "Convert to lighter straight sets if pain, technique loss, excessive rep loss, or excessive load reduction appears."
      });
    } else if (setStructure === "multiple_top_sets") {
      prescription.topSet = deepClone(prescription.topSet || {
        enabled: true,
        count: prescription.workingSets.target,
        repRange: { min: prescription.repRange.min, max: prescription.repRange.max },
        targetRpe: number(prescription.targetRpe?.max, 8.5),
        targetRir: number(prescription.targetRir?.min, 1.5)
      });
      delete prescription.backoffSets;
    } else {
      delete prescription.backoffSets;
      delete prescription.topSet;
    }
    return prescription;
  }

  function applyRecordedDeloadRecommendation(prescription, recommendationType) {
    prescription.recommendationType = recommendationType;
    if (["exercise_deload", "muscle_group_deload", "full_program_deload"].includes(recommendationType)) {
      prescription.targetRpe = { min: 5.5, max: recommendationType === "full_program_deload" ? 6.5 : 7 };
      prescription.targetRir = { min: recommendationType === "full_program_deload" ? 3.5 : 3, max: 4.5 };
      prescription.progressionRule = "Do not progress load during the manual deload; preserve controlled technique and stop well short of failure.";
      prescription.holdRule = "Keep this reduced prescription for the selected deload scope, then reassess before resuming normal progression.";
    }
    return prescription;
  }

  function applyRecordedSafetyConfirmation(prescription, confirmation) {
    const auditTargets = prescription.safetyRestriction?.auditBaseTargets;
    if (!auditTargets?.workingSets || !auditTargets.repRange || !auditTargets.targetRpe || !auditTargets.targetRir || !auditTargets.restSeconds || !auditTargets.volume) throw new Error("Invalid safety override lineage; blocked safety prescription is missing coherent base-target audit context.");
    prescription.executionBlocked = false;
    prescription.workingSets = deepClone(auditTargets.workingSets);
    prescription.repRange = deepClone(auditTargets.repRange);
    prescription.targetRpe = deepClone(auditTargets.targetRpe);
    prescription.targetRir = deepClone(auditTargets.targetRir);
    prescription.restSeconds = deepClone(auditTargets.restSeconds);
    prescription.volume = deepClone(auditTargets.volume);
    prescription.setStructure = "straight_sets";
    prescription.setStructureReason = "Explicitly confirmed pain-free substitute using bounded base set, repetition, and effort targets; no load is inferred for a different exercise.";
    prescription.progressionAction = "use_confirmed_pain_free_substitute_without_load_target";
    prescription.progressionRule = "Complete only the confirmed pain-free substitute inside the restored base set, repetition, and RPE bounds; stop if pain occurs and do not infer a load from the original exercise.";
    prescription.userExplanation = "The painful exercise remains blocked. The user explicitly confirmed this catalog-backed substitute as pain-free, so bounded non-load targets are available for the substitute only.";
    prescription.safetyRestriction = {
      ...prescription.safetyRestriction,
      status: "resolved_by_confirmed_substitute",
      painFreeConfirmed: true,
      substituteExerciseId: confirmation.exerciseId,
      substituteResearchExerciseId: confirmation.researchExerciseId,
      confirmedAt: confirmation.confirmedAt
    };
    delete prescription.prescribedLoad;
    delete prescription.topSet;
    delete prescription.backoffSets;
    return prescription;
  }

  function prescriptionDifferenceKeys(expected, actual) {
    return [...new Set([...Object.keys(expected || {}), ...Object.keys(actual || {})])]
      .filter((key) => !auditValuesMatch(expected?.[key], actual?.[key]));
  }

  // Compatibility for snapshots written before 3.1.3. New replacements never
  // infer catalog membership from this prefix; they require a trusted record.
  function legacyPrefixedResearchIdentityForExerciseId(exerciseId) {
    return typeof exerciseId === "string" && /^ex_[a-z0-9_]+$/.test(exerciseId) ? exerciseId : null;
  }

  function engineVersionAtLeast(actual, minimum) {
    const parse = (value) => String(value || "0.0.0").split(/[+-]/)[0].split(".").map((part) => number(part, 0));
    const left = parse(actual);
    const right = parse(minimum);
    for (let index = 0; index < Math.max(left.length, right.length, 3); index += 1) {
      if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) > (right[index] || 0);
    }
    return true;
  }

  function exerciseIdentityOverrideId(recommendationId, createdAt, changes, exerciseId, researchExerciseId) {
    return `override_${stableHash({
      recommendationId,
      createdAt,
      applied: changes,
      exerciseIdentity: { exerciseId, researchExerciseId: researchExerciseId ?? null }
    })}`;
  }

  function applyRecordedExerciseReplacement(prescription, identity) {
    const sets = prescription.workingSets;
    if (!sets || ![sets.min, sets.target, sets.max].every(Number.isInteger) || sets.min < 0 || sets.target < 1 || sets.max > DEFAULT_POLICY.absoluteMaximumWorkingSetsPerSession || sets.min > sets.target || sets.target > sets.max) throw new Error("Invalid manual exercise replacement; retained working sets are outside safe schema bounds.");
    const reps = prescription.repRange;
    if (!reps || ![reps.min, reps.target, reps.max].every(Number.isInteger) || reps.min < 1 || reps.max > 100 || reps.min > reps.target || reps.target > reps.max) throw new Error("Invalid manual exercise replacement; retained repetitions are outside safe schema bounds.");
    prescription.exerciseId = identity.exerciseId;
    prescription.researchExerciseId = identity.researchExerciseId ?? null;
    delete prescription.prescribedLoad;
    delete prescription.topSet;
    delete prescription.backoffSets;
    delete prescription.setStructureEvidenceConflict;
    prescription.setStructure = "straight_sets";
    prescription.setStructureReason = "Exercise replacement reset: retain only valid session set and repetition constraints while establishing technique and load for the new exercise.";
    prescription.progressionMethod = "double_progression";
    prescription.progressionAction = "establish_replacement_baseline";
    prescription.progressionRule = "Load reset: do not transfer the prior exercise's load, previous-load anchor, increment, assistance direction, or progression decision. Establish a technically sound baseline for this exercise before progressing.";
    prescription.holdRule = "Hold load progression until at least one pain-free, technically valid exposure establishes exercise-specific repetitions, effort, resistance type, and load.";
    prescription.regressionRule = "If the replacement cannot be completed within the retained set, repetition, and effort constraints, reduce the session demand or choose another compatible exercise instead of importing the prior exercise's load history.";
    prescription.deloadRule = "Evaluate this replacement from its own comparable exposures; do not infer an exercise-specific deload from the replaced exercise's history.";
    prescription.preferredReplacementExerciseId = null;
    prescription.userExplanation = `The user selected ${identity.exerciseId} as a replacement. Valid session set, repetition, effort, rest, and volume constraints remain, but exercise-specific load and progression guidance were reset. No prior load, increment, or resistance direction transfers to the replacement.`;
    prescription.evidenceSummary = unique([
      ...asArray(prescription.evidenceSummary),
      `Manual replacement identity: ${identity.exerciseId}${identity.researchExerciseId ? ` mapped to ${identity.researchExerciseId}` : " with no canonical research mapping"}. Exercise-specific load and progression guidance require a new baseline.`
    ]);
    if (!["full_program_deload", "muscle_group_deload", "light_session", "reduce_volume"].includes(prescription.recommendationType)) prescription.recommendationType = "normal";
    return prescription;
  }

  function validateDeclaredOverrideChanges(snapshot, entry, previous, result) {
    const changes = entry.changes;
    const supported = new Set([
      "exerciseId",
      "setCount",
      "repRange",
      "load",
      "setStructure",
      "deloadRecommendation",
      "exerciseRotation",
      "mesocycleId",
      "safetyConfirmation"
    ]);
    const unknown = Object.keys(changes).filter((field) => !supported.has(field));
    if (unknown.length) throw new Error(`Invalid manual override lineage; unsupported recorded changes: ${unknown.join(", ")}.`);

    // Declared-change bijection. Each persisted declaration owns exactly one
    // user-facing dimension. Its helper below replays every deterministic
    // derived field in that dimension, and the final whole-prescription
    // comparison rejects undeclared changes in identity/research identity,
    // working sets, repetitions, full resistance/load metadata (including
    // assistance direction), RPE/RIR, rest, structure/top/back-off targets,
    // recommendation policy, safety state, volume, or mesocycle binding.
    // safetyConfirmation is the sole audit companion: it must accompany the
    // exercise identity declaration and owns the deterministic safety-derived
    // fields rather than representing a second independent identity change.
    if (changes.deloadRecommendation && changes.exerciseRotation) throw new Error("Invalid manual override lineage bijection; deloadRecommendation and exerciseRotation duplicate the recommendation-type dimension.");
    if (changes.safetyConfirmation) {
      const illegalSafetyCompanions = Object.keys(changes).filter((field) => !["exerciseId", "safetyConfirmation"].includes(field));
      if (illegalSafetyCompanions.length) throw new Error(`Invalid safety override lineage; safetyConfirmation cannot hide unrelated declarations: ${illegalSafetyCompanions.join(", ")}.`);
      if (!changes.exerciseId) throw new Error("Invalid safety override lineage; safetyConfirmation requires one exercise identity declaration.");
    }

    const expected = deepClone(previous);
    if (changes.exerciseId) {
      const exerciseId = requireDeclaredChangePair(changes.exerciseId, expected.exerciseId, "exerciseId");
      if (changes.safetyConfirmation) {
        expected.exerciseId = exerciseId;
        expected.researchExerciseId = changes.safetyConfirmation.researchExerciseId;
      } else {
        const resultResearchExerciseId = result.researchExerciseId ?? null;
        const resultIdentityCommitment = exerciseIdentityOverrideId(snapshot.recommendationId, entry.createdAt, changes, exerciseId, resultResearchExerciseId);
        const committedIdentityContract = entry.overrideId === resultIdentityCommitment;
        const legacyCanonicalResearchExerciseId = legacyPrefixedResearchIdentityForExerciseId(exerciseId);
        const researchExerciseId = committedIdentityContract ? resultResearchExerciseId : legacyCanonicalResearchExerciseId ?? resultResearchExerciseId;
        if (researchExerciseId !== null && (typeof researchExerciseId !== "string" || !researchExerciseId.trim())) throw new Error("Invalid manual override lineage; an exercise identity change requires a non-empty research identity or explicit null.");
        if (committedIdentityContract || (legacyCanonicalResearchExerciseId === null && researchExerciseId !== null)) {
          const committedOverrideId = exerciseIdentityOverrideId(snapshot.recommendationId, entry.createdAt, changes, exerciseId, researchExerciseId);
          if (entry.overrideId !== committedOverrideId) throw new Error("Invalid manual override lineage identity commitment; the catalog-resolved exercise/research identity is not bound to its override audit.");
        }
        if (committedIdentityContract) applyRecordedExerciseReplacement(expected, { exerciseId, researchExerciseId });
        else {
          expected.exerciseId = exerciseId;
          expected.researchExerciseId = researchExerciseId;
        }
      }
    }
    if (changes.safetyConfirmation) applyRecordedSafetyConfirmation(expected, changes.safetyConfirmation);
    if (changes.setCount) applyRecordedSetCount(expected, requireDeclaredChangePair(changes.setCount, expected.workingSets?.target, "setCount"));
    if (changes.repRange) expected.repRange = requireDeclaredChangePair(changes.repRange, expected.repRange, "repRange");
    if (changes.load) applyRecordedLoad(expected, requireDeclaredChangePair(changes.load, expected.prescribedLoad?.target ?? null, "load"));
    if (changes.setStructure) applyRecordedSetStructure(expected, requireDeclaredChangePair(changes.setStructure, expected.setStructure, "setStructure"));
    if (changes.deloadRecommendation) applyRecordedDeloadRecommendation(expected, requireDeclaredChangePair(changes.deloadRecommendation, expected.recommendationType, "deloadRecommendation"));
    if (changes.exerciseRotation) expected.recommendationType = requireDeclaredChangePair(changes.exerciseRotation, expected.recommendationType, "exerciseRotation");
    if (changes.mesocycleId) expected.mesocycleId = requireDeclaredChangePair(changes.mesocycleId, expected.mesocycleId ?? null, "mesocycleId");
    expected.manualOverride = { overrideId: entry.overrideId, lockedForWorkout: true, explanation: entry.reason };

    const unexpected = prescriptionDifferenceKeys(expected, result);
    if (unexpected.length) throw new Error(`Invalid manual override lineage identity/dimension bijection; actual before-to-after prescription contains undeclared or incorrectly derived changes in ${unexpected.join(", ")}.`);
  }

  function validateSafetyOverrideTransition(snapshot, entry, previous, result) {
    const confirmation = entry.changes.safetyConfirmation;
    const previousRestriction = previous.safetyRestriction;
    const resultRestriction = result.safetyRestriction;
    if (!confirmation || typeof confirmation !== "object" || Array.isArray(confirmation)) throw new Error("Invalid safety override lineage; a complete safety confirmation is required.");
    if (!previousRestriction || !resultRestriction) throw new Error("Invalid safety override lineage; both prior and resulting prescriptions must retain safety restrictions.");
    if (previousRestriction.reason !== "pain" || resultRestriction.reason !== "pain") throw new Error("Invalid safety override lineage; only a pain restriction can be resolved by a pain-free exercise confirmation.");
    if (confirmation.painFreeConfirmed !== true || typeof confirmation.confirmedAt !== "string" || !confirmation.confirmedAt.trim()) throw new Error("Invalid safety override lineage; pain-free confirmation and its timestamp are required.");
    if (!entry.changes.exerciseId) throw new Error("Invalid safety override lineage; a safety confirmation requires its exercise transition audit.");

    const originalExerciseId = boundIdentity([
      snapshot.basePrescription.exerciseId,
      previousRestriction.originalExerciseId,
      previousRestriction.auditBaseTargets?.exerciseId,
      resultRestriction.originalExerciseId,
      resultRestriction.auditBaseTargets?.exerciseId
    ], "override-history original exercise");
    const originalResearchExerciseId = boundIdentity([
      snapshot.basePrescription.researchExerciseId,
      previousRestriction.auditBaseTargets?.researchExerciseId,
      resultRestriction.auditBaseTargets?.researchExerciseId
    ], "override-history original research exercise", { allowNull: true });

    if (previousRestriction.status === "blocked") {
      boundIdentity([originalExerciseId, previous.exerciseId], "blocked override-history original exercise");
      boundIdentity([originalResearchExerciseId, previous.researchExerciseId], "blocked override-history original research exercise", { allowNull: true });
      if (previous.executionBlocked !== true) throw new Error("Invalid safety override lineage; a blocked prior prescription must remain non-executable.");
    } else if (previousRestriction.status === "resolved_by_confirmed_substitute") {
      const previousSubstituteExerciseId = boundIdentity([
        previous.exerciseId,
        previousRestriction.substituteExerciseId
      ], "prior resolved substitute exercise");
      const previousSubstituteResearchExerciseId = boundIdentity([
        previous.researchExerciseId,
        previousRestriction.substituteResearchExerciseId
      ], "prior resolved substitute research exercise");
      if (previousSubstituteExerciseId === originalExerciseId || (originalResearchExerciseId !== null && previousSubstituteResearchExerciseId === originalResearchExerciseId)) throw new Error("Invalid safety override lineage; a prior substitute cannot collapse onto its painful original identity.");
      if (previous.executionBlocked !== false || previousRestriction.painFreeConfirmed !== true) throw new Error("Invalid safety override lineage; a prior resolved substitute must retain its executable pain-free confirmation state.");
    } else throw new Error("Invalid safety override lineage; unsupported prior safety-restriction status.");

    if (resultRestriction.status !== "resolved_by_confirmed_substitute" || resultRestriction.painFreeConfirmed !== true || result.executionBlocked !== false) throw new Error("Invalid safety override lineage; the resulting prescription must be a confirmed executable substitute.");
    const substituteExerciseId = boundIdentity([
      entry.changes.exerciseId.to,
      confirmation.exerciseId,
      result.exerciseId,
      resultRestriction.substituteExerciseId
    ], "safety-confirmation resulting substitute exercise");
    const substituteResearchExerciseId = boundIdentity([
      confirmation.researchExerciseId,
      result.researchExerciseId,
      resultRestriction.substituteResearchExerciseId
    ], "safety-confirmation resulting substitute research exercise");
    boundIdentity([entry.changes.exerciseId.from, previous.exerciseId], "safety-confirmation prior exercise");
    boundIdentity([entry.createdAt, confirmation.confirmedAt, resultRestriction.confirmedAt], "safety-confirmation timestamp");
    if (substituteExerciseId === originalExerciseId || (originalResearchExerciseId !== null && substituteResearchExerciseId === originalResearchExerciseId)) throw new Error("Invalid safety override lineage; each substitute must remain different from the painful original exercise and research identity.");
    if (substituteExerciseId === previous.exerciseId || substituteResearchExerciseId === previous.researchExerciseId) throw new Error("Invalid safety override lineage; duplicate safety substitutions do not establish a new prescription transition.");
    if (result.prescribedLoad) throw new Error("Invalid safety override lineage; a confirmed substitute must not inherit a load target.");
  }

  function validateManualOverrideLineage(snapshot) {
    if (!Array.isArray(snapshot.manualOverrides)) throw new Error("Invalid manual override lineage; manualOverrides must be an array.");
    const entries = snapshot.manualOverrides;
    if (!entries.length) {
      if (snapshot.overrideLocked !== false || snapshot.finalPrescription?.manualOverride) throw new Error("Invalid manual override lineage; an empty history cannot retain an override lock or final override marker.");
      return true;
    }
    if (snapshot.overrideLocked !== true) throw new Error("Invalid manual override lineage; a non-empty override history must remain locked for the workout.");

    const overrideIds = new Set();
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Invalid manual override lineage; entry ${index} must be an object.`);
      const required = ["overrideId", "createdAt", "actor", "reason", "workoutId", "changes", "previousFinalPrescription"];
      const missing = required.filter((field) => !Object.prototype.hasOwnProperty.call(entry, field) || entry[field] === undefined);
      if (missing.length) throw new Error(`Invalid manual override lineage; entry ${index} is missing ${missing.join(", ")}.`);
      if ([entry.overrideId, entry.createdAt, entry.actor, entry.reason].some((value) => typeof value !== "string" || !value.trim())) throw new Error(`Invalid manual override lineage; entry ${index} has incomplete audit identity or provenance.`);
      if (overrideIds.has(entry.overrideId)) throw new Error(`Invalid manual override lineage; duplicate overrideId ${entry.overrideId}.`);
      overrideIds.add(entry.overrideId);
      if (!entry.changes || typeof entry.changes !== "object" || Array.isArray(entry.changes) || !Object.keys(entry.changes).length) throw new Error(`Invalid manual override lineage; entry ${index} has no recorded changes.`);

      const previous = entry.previousFinalPrescription;
      const result = entries[index + 1]?.previousFinalPrescription || snapshot.finalPrescription;
      if (!previous || typeof previous !== "object" || !result || typeof result !== "object") throw new Error(`Invalid manual override lineage; entry ${index} requires prior and resulting prescriptions.`);
      if (previous.schemaVersion !== PRESCRIPTION_SCHEMA_VERSION || result.schemaVersion !== PRESCRIPTION_SCHEMA_VERSION) throw new Error(`Invalid manual override lineage; entry ${index} uses an unsupported prescription schema.`);
      if (typeof previous.executionBlocked !== "boolean" || typeof result.executionBlocked !== "boolean") throw new Error(`Invalid manual override lineage; entry ${index} prescriptions require explicit executionBlocked state.`);

      if (index === 0) {
        if (previous.manualOverride) throw new Error("Invalid manual override lineage; the first prior prescription references an unrecorded earlier override.");
      } else {
        const priorEntry = entries[index - 1];
        boundIdentity([previous.manualOverride?.overrideId, priorEntry.overrideId], "prior prescription/override entry");
        if (previous.manualOverride?.lockedForWorkout !== true || previous.manualOverride?.explanation !== priorEntry.reason) throw new Error("Invalid manual override lineage; prior prescription override provenance is incomplete or tampered.");
      }
      boundIdentity([result.manualOverride?.overrideId, entry.overrideId], "resulting prescription/override entry");
      if (result.manualOverride?.lockedForWorkout !== true || result.manualOverride?.explanation !== entry.reason) throw new Error("Invalid manual override lineage; resulting prescription override provenance is incomplete or tampered.");

      validateDeclaredOverrideChanges(snapshot, entry, previous, result);
      const hasSafetyContext = Boolean(previous.safetyRestriction || result.safetyRestriction);
      if (hasSafetyContext && !entry.changes.safetyConfirmation) throw new Error("Invalid safety override lineage; a safety-restricted transition is missing its confirmation audit.");
      if (entry.changes.safetyConfirmation) validateSafetyOverrideTransition(snapshot, entry, previous, result);
    });
    return true;
  }

  function validateSafetyIdentityBinding(snapshot) {
    const base = snapshot.basePrescription;
    const final = snapshot.finalPrescription;
    const restriction = final.safetyRestriction;
    if (!restriction) return true;
    const audit = restriction.auditBaseTargets || {};
    const originalExerciseId = boundIdentity([
      base.exerciseId,
      restriction.originalExerciseId,
      audit.exerciseId
    ], "base/restriction/audit original exercise");
    const originalResearchExerciseId = boundIdentity([
      base.researchExerciseId,
      audit.researchExerciseId
    ], "base/audit original research exercise", { allowNull: true });

    if (restriction.status === "blocked") {
      boundIdentity([
        snapshot.exerciseId,
        final.exerciseId,
        originalExerciseId
      ], "blocked snapshot/final/original exercise");
      boundIdentity([
        final.researchExerciseId,
        originalResearchExerciseId
      ], "blocked final/original research exercise", { allowNull: true });
      return true;
    }

    if (restriction.status !== "resolved_by_confirmed_substitute") return true;
    const substituteExerciseId = boundIdentity([
      snapshot.exerciseId,
      final.exerciseId,
      restriction.substituteExerciseId
    ], "resolved snapshot/final/substitute exercise");
    const substituteResearchExerciseId = boundIdentity([
      final.researchExerciseId,
      restriction.substituteResearchExerciseId
    ], "resolved final/substitute research exercise");
    if (substituteExerciseId === originalExerciseId || (originalResearchExerciseId !== null && substituteResearchExerciseId === originalResearchExerciseId)) throw new Error("Invalid resolved safety prescription; substitute identity must remain different from the painful original.");

    const safetyEntries = asArray(snapshot.manualOverrides).filter((entry) => entry?.changes?.safetyConfirmation);
    if (!safetyEntries.length) throw new Error("Invalid resolved safety prescription; a bound safety-confirmation audit entry is required.");
    for (const entry of safetyEntries) {
      const previous = entry.previousFinalPrescription;
      const previousRestriction = previous?.safetyRestriction;
      if (!previous || !previousRestriction) throw new Error("Invalid resolved safety prescription; safety audit history must retain the previous restricted prescription.");
      boundIdentity([
        originalExerciseId,
        previousRestriction.originalExerciseId,
        previousRestriction.auditBaseTargets?.exerciseId
      ], "resolved/base/audit-history original exercise");
      boundIdentity([
        originalResearchExerciseId,
        previousRestriction.auditBaseTargets?.researchExerciseId
      ], "resolved/base/audit-history original research exercise", { allowNull: true });
      if (previousRestriction.status === "blocked") {
        boundIdentity([originalExerciseId, previous.exerciseId], "blocked audit-history original exercise");
        boundIdentity([originalResearchExerciseId, previous.researchExerciseId], "blocked audit-history original research exercise", { allowNull: true });
      } else if (previousRestriction.status === "resolved_by_confirmed_substitute") {
        boundIdentity([previous.exerciseId, previousRestriction.substituteExerciseId], "resolved audit-history substitute exercise");
        boundIdentity([previous.researchExerciseId, previousRestriction.substituteResearchExerciseId], "resolved audit-history substitute research exercise");
      } else throw new Error("Invalid resolved safety prescription; safety audit history has an unsupported restriction status.");
    }
    const latestConfirmation = safetyEntries[safetyEntries.length - 1].changes.safetyConfirmation;
    boundIdentity([substituteExerciseId, latestConfirmation.exerciseId], "resolved/latest-audit substitute exercise");
    boundIdentity([substituteResearchExerciseId, latestConfirmation.researchExerciseId], "resolved/latest-audit substitute research exercise");
    return true;
  }

  function validateSnapshot(snapshot) {
    const required = ["recommendationId", "schemaVersion", "recommendationVersion", "engineVersion", "personalDataVersion", "researchDatabaseVersion", "basePrescription", "finalPrescription", "createdAt", "manualOverrides", "overrideLocked", "checksum"];
    const missing = required.filter((field) => snapshot?.[field] === undefined || snapshot?.[field] === null);
    if (missing.length) throw new Error(`Invalid recommendation snapshot; missing ${missing.join(", ")}.`);
    if (typeof snapshot.checksum !== "string" || !SNAPSHOT_CHECKSUM_PATTERN.test(snapshot.checksum)) throw new Error("Invalid recommendation snapshot checksum; expected the current lowercase 8-hex checksum format.");
    if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new Error(`Unsupported recommendation snapshot schemaVersion ${snapshot.schemaVersion}; supported version is ${SNAPSHOT_SCHEMA_VERSION}.`);
    ["basePrescription", "finalPrescription"].forEach((field) => {
      const prescription = snapshot[field];
      if (prescription?.schemaVersion !== PRESCRIPTION_SCHEMA_VERSION) throw new Error(`Unsupported ${field} schemaVersion ${prescription?.schemaVersion}; supported version is ${PRESCRIPTION_SCHEMA_VERSION}.`);
      if (typeof prescription.executionBlocked !== "boolean") throw new Error(`Invalid ${field}; executionBlocked must be boolean.`);
    });
    if (!RECOMMENDATION_TYPES.includes(snapshot.finalPrescription.recommendationType)) throw new Error(`Invalid recommendation type ${snapshot.finalPrescription.recommendationType}.`);
    if (!SET_STRUCTURES.includes(snapshot.finalPrescription.setStructure)) throw new Error(`Invalid set structure ${snapshot.finalPrescription.setStructure}.`);
    if (!ROLES.includes(snapshot.finalPrescription.role)) throw new Error(`Invalid role ${snapshot.finalPrescription.role}.`);
    if (snapshot.exerciseId !== snapshot.finalPrescription.exerciseId) throw new Error("Invalid recommendation snapshot identity binding; snapshot exerciseId must match the final prescription.");
    if ((snapshot.mesocycleId ?? null) !== (snapshot.finalPrescription.mesocycleId ?? null)) throw new Error("Invalid recommendation snapshot mesocycle binding; snapshot and final prescription must match.");
    if (engineVersionAtLeast(snapshot.engineVersion, "3.1.3") && snapshot.explanation !== snapshot.finalPrescription.userExplanation) throw new Error("Invalid recommendation snapshot explanation binding; the top-level explanation must match the final executable prescription.");
    if (snapshot.finalPrescription.executionBlocked) {
      const final = snapshot.finalPrescription;
      if (!final.safetyRestriction || final.safetyRestriction.schemaVersion !== HARD_SAFETY_SCHEMA_VERSION || final.safetyRestriction.status !== "blocked") throw new Error("Invalid blocked prescription; versioned blocked safetyRestriction metadata is required.");
      if (!["exercise", "workout"].includes(final.safetyRestriction.scope) || !["pain", "illness"].includes(final.safetyRestriction.reason) || !String(final.safetyRestriction.resumeCriteria || "").trim() || !final.safetyRestriction.auditBaseTargets?.workingSets) throw new Error("Invalid blocked prescription; explicit safety scope, reason, resume criteria, and base-target audit context are required.");
      if ([final.workingSets?.min, final.workingSets?.target, final.workingSets?.max].some((value) => value !== 0)) throw new Error("Invalid blocked prescription; executable working sets must all be zero.");
      if (final.volume?.perExercise?.currentPrescribed !== 0 || final.volume?.perExercise?.deload !== 0 || final.volume?.perMusclePerSession?.target !== 0 || final.volume?.perMusclePerWeek?.currentPrescribed !== 0) throw new Error("Invalid blocked prescription; executable volume targets must all be zero.");
      if (final.prescribedLoad || final.topSet || final.backoffSets) throw new Error("Invalid blocked prescription; load, top-set, and back-off targets are forbidden.");
    } else if (snapshot.finalPrescription.safetyRestriction) {
      const final = snapshot.finalPrescription;
      const restriction = final.safetyRestriction;
      if (restriction.schemaVersion !== HARD_SAFETY_SCHEMA_VERSION || restriction.status !== "resolved_by_confirmed_substitute" || restriction.reason !== "pain" || restriction.painFreeConfirmed !== true) throw new Error("Invalid resolved safety prescription; confirmed pain-free substitute metadata is required.");
      if (!restriction.substituteExerciseId || restriction.substituteExerciseId !== final.exerciseId || !restriction.substituteResearchExerciseId || restriction.substituteResearchExerciseId !== final.researchExerciseId) throw new Error("Invalid resolved safety prescription; substitute exercise/research identity must match the executable prescription.");
      const originalExerciseIds = new Set([
        restriction.originalExerciseId,
        restriction.auditBaseTargets?.exerciseId,
        snapshot.basePrescription?.exerciseId
      ].filter(Boolean));
      const originalResearchExerciseIds = new Set([
        restriction.auditBaseTargets?.researchExerciseId,
        snapshot.basePrescription?.researchExerciseId,
        snapshot.basePrescription?.exerciseId,
        restriction.originalExerciseId
      ].filter(Boolean));
      if (originalExerciseIds.has(restriction.substituteExerciseId) || originalResearchExerciseIds.has(restriction.substituteResearchExerciseId)) throw new Error("Invalid resolved safety prescription; a pain-free substitute must be different from the painful original exercise and research identity.");
      if (final.prescribedLoad) throw new Error("Invalid resolved safety prescription; a substitute load must not be inferred.");
    }
    validateManualOverrideLineage(snapshot);
    validateSafetyIdentityBinding(snapshot);
    return true;
  }

  function serializeRecommendationSnapshot(snapshot) {
    verifySnapshotChecksum(snapshot);
    return JSON.stringify(deepClone(snapshot));
  }

  function verifySnapshotChecksum(snapshot) {
    validateSnapshot(snapshot);
    // This unkeyed checksum plus lineage validation detects stale, partial, and
    // internally incoherent rewrites. It is not authentication: a writer who
    // can coherently replace the whole snapshot and recompute the checksum is
    // outside this local integrity contract.
    const expected = stableHash({ ...snapshot, checksum: undefined });
    if (expected !== snapshot.checksum) throw new Error("Recommendation snapshot checksum does not match; historical evidence may have been altered.");
    return true;
  }

  function deserializeRecommendationSnapshot(serialized) {
    const snapshot = typeof serialized === "string" ? JSON.parse(serialized) : deepClone(serialized);
    verifySnapshotChecksum(snapshot);
    return snapshot;
  }

  function saveRecommendationSnapshot(storage, key, snapshot) {
    if (!storage || typeof storage.setItem !== "function") throw new Error("A Storage-compatible setItem implementation is required.");
    const resolvedKey = key || `comprehensiveFitness.recommendation.${snapshot.recommendationId}`;
    storage.setItem(resolvedKey, serializeRecommendationSnapshot(snapshot));
    return resolvedKey;
  }

  function loadRecommendationSnapshot(storage, key) {
    if (!storage || typeof storage.getItem !== "function") throw new Error("A Storage-compatible getItem implementation is required.");
    const serialized = storage.getItem(key);
    return serialized ? deserializeRecommendationSnapshot(serialized) : null;
  }

  function appendRecommendationHistory(storage, snapshot, options = {}) {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") throw new Error("A Storage-compatible implementation is required.");
    const key = options.key || HISTORY_STORAGE_KEY;
    const history = JSON.parse(storage.getItem(key) || "[]");
    const existing = history.find((item) => item.recommendationId === snapshot.recommendationId);
    if (existing) {
      if (stableStringify(existing) !== stableStringify(snapshot) && !options.allowExplicitReplace) throw new Error("A historical recommendation with this ID already exists; refusing to silently rewrite it.");
      verifySnapshotChecksum(snapshot);
      if (!options.allowExplicitReplace) return history;
      history.splice(history.indexOf(existing), 1, deepClone(snapshot));
    } else {
      verifySnapshotChecksum(snapshot);
      history.push(deepClone(snapshot));
    }
    storage.setItem(key, JSON.stringify(history));
    return history;
  }

  function recommendationHistory(storage, options = {}) {
    const key = options.key || HISTORY_STORAGE_KEY;
    return JSON.parse(storage?.getItem?.(key) || "[]").map((snapshot) => deserializeRecommendationSnapshot(snapshot));
  }

  function saveMesocycle(storage, mesocycle, key) {
    if (!storage || typeof storage.setItem !== "function") throw new Error("A Storage-compatible setItem implementation is required.");
    const resolvedKey = key || `comprehensiveFitness.mesocycle.${mesocycle.id}`;
    storage.setItem(resolvedKey, JSON.stringify(deepClone(mesocycle)));
    return resolvedKey;
  }

  function loadMesocycle(storage, key) {
    const value = storage?.getItem?.(key);
    return value ? JSON.parse(value) : null;
  }

  function hasHardSafetyMarker(prescription = {}) {
    const signals = [
      ...asArray(prescription.readinessAdjustment?.signals),
      ...asArray(prescription.deloadStatus?.readinessEvaluation?.signals)
    ];
    return prescription.executionBlocked === true
      || ["blocked", "resolved_by_confirmed_substitute"].includes(prescription.safetyRestriction?.status)
      || signals.some((signal) => signal?.domain === "illness" || signal?.domain === "pain")
      || prescription.staleness?.metrics?.painFlag === true
      || HARD_SAFETY_PROGRESSION_ACTIONS.has(prescription.progressionAction);
  }

  function catalogIdentity(item) {
    if (!item) return null;
    if (typeof item === "string") return { exerciseId: item, researchExerciseId: null, researchIdentitySpecified: false, researchIdentityFieldPresence: "absent", structured: false, catalogRecord: false, source: null };
    const exerciseId = firstPresent(item.exerciseId, item.exercise_id, item.personalExerciseId, item.personal_exercise_id);
    if (!exerciseId) return null;
    const researchIdentityFields = ["researchExerciseId", "research_exercise_id", "researchId", "research_id"];
    const researchIdentitySpecified = researchIdentityFields.some((field) => Object.prototype.hasOwnProperty.call(item, field));
    const declaredResearchIds = unique(researchIdentityFields
      .filter((field) => Object.prototype.hasOwnProperty.call(item, field))
      .map((field) => item[field]));
    const explicitResearchId = firstPresent(...declaredResearchIds);
    const researchExerciseId = explicitResearchId ?? null;
    const researchIdentityFieldPresence = !researchIdentitySpecified
      ? "absent"
      : researchExerciseId
        ? "value"
        : "blank_or_null";
    const catalogRecord = Boolean(
      firstPresent(item.exercise_id, item.personalExerciseId, item.personal_exercise_id)
      && firstPresent(
        item.exercise_name, item.exerciseName, item.prescription_id, item.score_id,
        item.equipment, item.equipment_type, item.equipmentType,
        item.equipment_requirements, item.equipmentRequirements, item.required_equipment, item.requiredEquipment
      )
    );
    return {
      exerciseId,
      researchExerciseId,
      researchIdentitySpecified,
      researchIdentityFieldPresence,
      researchIdentityConflict: declaredResearchIds.length > 1,
      structured: true,
      catalogRecord,
      source: item
    };
  }

  function equipmentOptionRefines(candidateOption, broaderOption, broaderDetailLevel) {
    return broaderOption.every((broaderItem) => candidateOption.some((candidateItem) => {
      if (candidateItem === broaderItem) return true;
      return broaderDetailLevel === 1
        && PRIMARY_EQUIPMENT_FAMILIES.has(equipmentFamily(broaderItem))
        && equipmentFamily(candidateItem) === equipmentFamily(broaderItem);
    }));
  }

  function equipmentDeclarationRefines(candidate, broader) {
    const candidateOptions = minimizePositiveEquipmentOptions(candidate.options);
    const broaderOptions = minimizePositiveEquipmentOptions(broader.options);
    return candidateOptions.every((candidateOption) => broaderOptions.some((broaderOption) => (
      equipmentOptionRefines(candidateOption, broaderOption, broader.detailLevel)
    )));
  }

  function reconcileTrustedEquipmentDeclarationBatch(identities, exerciseId) {
    const declarationsBySignature = new Map();
    [...identities]
      .sort((left, right) => String(stableStringify(left.source)).localeCompare(String(stableStringify(right.source))))
      .forEach((identity) => {
        const declaration = resolveDeclaredEquipmentMetadata(identity.source || {});
        if (!declaration.declared) return;
        const normalized = { ...declaration, options: canonicalEquipmentOptions(declaration.options) };
        const signature = `${normalized.detailLevel}:${equipmentOptionsKey(normalized.options)}`;
        if (!declarationsBySignature.has(signature)) declarationsBySignature.set(signature, normalized);
      });
    const declarations = [...declarationsBySignature.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, declaration]) => declaration);
    if (!declarations.length) return { declared: false, detailLevel: 0, options: [] };
    if (declarations.length === 1) return declarations[0];
    const refinements = declarations.filter((candidate) => declarations.every((broader) => equipmentDeclarationRefines(candidate, broader)));
    if (!refinements.length) throw new Error(`Conflicting trusted custom equipment requirements for ${exerciseId}.`);
    const highestDetailLevel = Math.max(...refinements.map((declaration) => declaration.detailLevel));
    const mostSpecific = refinements.filter((declaration) => declaration.detailLevel === highestDetailLevel);
    if (mostSpecific.length === 1) return mostSpecific[0];
    const uniqueRequirementKeys = unique(mostSpecific.map((declaration) => equipmentOptionsKey(declaration.options)));
    if (uniqueRequirementKeys.length === 1) return mostSpecific[0];
    throw new Error(`Conflicting trusted custom equipment requirements for ${exerciseId}.`);
  }

  function catalogMetadataPresent(value) {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  }

  function catalogMetadataRichness(value) {
    if (!catalogMetadataPresent(value)) return 0;
    const serializedLength = String(stableStringify(value)).length;
    if (Array.isArray(value)) return 300 + value.length * 10 + serializedLength;
    if (typeof value === "object") return 250 + Object.keys(value).length * 10 + serializedLength;
    if (typeof value === "string") return 100 + value.trim().length;
    return 50 + serializedLength;
  }

  function richestCatalogMetadata(values) {
    const ranked = values.filter(catalogMetadataPresent).sort((left, right) => {
      const scoreDifference = catalogMetadataRichness(right) - catalogMetadataRichness(left);
      return scoreDifference || String(stableStringify(left)).localeCompare(String(stableStringify(right)));
    });
    return ranked.length ? deepClone(ranked[0]) : undefined;
  }

  function mergeTrustedCatalogSourceBatch(identities, equipment, researchExerciseId) {
    const equipmentFields = new Set([...EQUIPMENT_REQUIREMENT_FIELDS, ...EQUIPMENT_SUMMARY_FIELDS]);
    const researchIdentityFields = new Set(["researchExerciseId", "research_exercise_id", "researchId", "research_id"]);
    const merged = {};
    unique(identities.flatMap((identity) => Object.keys(identity.source || {}))).sort().forEach((field) => {
      if (equipmentFields.has(field) || researchIdentityFields.has(field)) return;
      const value = richestCatalogMetadata(identities.map((identity) => identity.source?.[field]));
      if (catalogMetadataPresent(value)) merged[field] = value;
    });
    if (equipment.declared) {
      const field = equipment.detailLevel === 2 ? "equipmentRequirements" : "equipment";
      merged[field] = canonicalEquipmentOptions(equipment.options);
    }
    if (researchExerciseId) merged.researchExerciseId = researchExerciseId;
    return merged;
  }

  function reconcileTrustedCustomIdentityBatch(identities, researchIdentities) {
    if (!identities.length) throw new Error("Trusted custom identity reconciliation requires at least one record.");
    const exerciseIds = unique(identities.map((identity) => identity.exerciseId));
    if (exerciseIds.length !== 1) throw new Error("Trusted custom identity reconciliation requires matching exercise IDs.");
    const exerciseId = exerciseIds[0];
    if (identities.some((identity) => identity.researchIdentityConflict)) throw new Error(`Conflicting trusted custom research identities for ${exerciseId}.`);
    const researchExerciseIds = unique(identities.map((identity) => identity.researchExerciseId));
    if (researchExerciseIds.length > 1) throw new Error(`Conflicting trusted custom research identities for ${exerciseId}.`);
    const researchExerciseId = researchExerciseIds[0] || null;
    if (researchExerciseId && !researchIdentities.has(researchExerciseId)) throw new Error(`Trusted custom exercise ${exerciseId} maps to unknown research exercise ${researchExerciseId}.`);
    const equipment = reconcileTrustedEquipmentDeclarationBatch(identities, exerciseId);
    return {
      exerciseId,
      researchExerciseId,
      researchIdentitySpecified: identities.some((identity) => identity.researchIdentitySpecified),
      researchIdentityFieldPresence: identities.some((identity) => identity.researchIdentityFieldPresence === "value")
        ? "value"
        : identities.some((identity) => identity.researchIdentityFieldPresence === "blank_or_null")
          ? "blank_or_null"
          : "absent",
      researchIdentityConflict: false,
      structured: true,
      catalogRecord: identities.every((identity) => identity.catalogRecord),
      source: mergeTrustedCatalogSourceBatch(identities, equipment, researchExerciseId)
    };
  }

  function buildReconciledPersonalIdentityIndex(personal, research) {
    const researchIdentities = new Map(research.exerciseDatabase.map((source) => {
      const exerciseId = firstPresent(source.exercise_id, source.exerciseId);
      return [exerciseId, {
        exerciseId,
        researchExerciseId: exerciseId,
        researchIdentitySpecified: true,
        researchIdentityConflict: false,
        structured: true,
        catalogRecord: true,
        source
      }];
    }).filter(([exerciseId]) => Boolean(exerciseId)));
    const recordsByExercise = groupBy([
      ...personal.exerciseScores,
      ...personal.exercisePrescriptions,
      ...personal.exerciseMuscleScores
    ], (record) => firstPresent(record.exercise_id, record.exerciseId, record.personalExerciseId, record.personal_exercise_id));
    const identities = new Map();
    [...recordsByExercise.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([exerciseId, records]) => {
      const batch = records.map(catalogIdentity).filter((identity) => identity?.structured && identity.exerciseId === exerciseId);
      const explicitResearchIds = unique(batch.map((identity) => identity.researchExerciseId));
      const fieldPresence = explicitResearchIds.length
        ? "value"
        : batch.some((identity) => identity.researchIdentitySpecified)
          ? "blank_or_null"
          : "absent";
      const canonicalIdentity = researchIdentities.get(exerciseId);
      if (canonicalIdentity) {
        // Public research IDs are the authoritative namespace. Personal rows may
        // still contribute performance evidence, but their name, mapping, and
        // equipment metadata cannot replace or invalidate the canonical record.
        identities.set(exerciseId, {
          ...canonicalIdentity,
          researchIdentityFieldPresence: fieldPresence,
          researchIdentitySource: "canonical_id",
          canonicalMetadataQuarantined: true,
          canonicalMetadataRecordCount: records.length
        });
        return;
      }
      let researchIdentitySource = explicitResearchIds.length ? "explicit_crosswalk" : "unresolved";
      if (!explicitResearchIds.length) {
        // Pipeline crosswalks are nullable because most rows have no confident
        // explicit match. Preserve the documented fallback: blank/null and an
        // absent field may use an exact trusted name alias; a nonblank explicit
        // ID is authoritative and therefore never falls through to this branch.
        const exactCanonicalId = researchIdentities.has(exerciseId) ? exerciseId : null;
        const aliasResearchIds = unique(records.flatMap((record) => [
          record.exercise_name,
          record.exerciseName,
          record.exercise_name_recorded,
          record.exerciseNameRecorded,
          record.canonical_exercise_name,
          record.canonicalExerciseName
        ]).map((name) => research.exerciseIdByAlias.get(normalizeText(name))));
        const inferredResearchIds = unique([exactCanonicalId, ...aliasResearchIds]);
        researchIdentitySource = exactCanonicalId ? "canonical_id" : inferredResearchIds.length ? "alias_inference" : "unresolved";
        inferredResearchIds.forEach((researchExerciseId) => batch.push({
          exerciseId,
          researchExerciseId,
          researchIdentitySpecified: false,
          researchIdentityFieldPresence: "absent",
          researchIdentityConflict: false,
          structured: true,
          catalogRecord: true,
          source: {}
        }));
      }
      try {
        identities.set(exerciseId, {
          ...reconcileTrustedCustomIdentityBatch(batch, researchIdentities),
          researchIdentityFieldPresence: fieldPresence,
          researchIdentitySource
        });
      } catch (error) {
        identities.set(exerciseId, {
          ...invalidTrustedCustomIdentity(exerciseId, batch, error),
          researchIdentityFieldPresence: fieldPresence,
          researchIdentitySource: "invalid"
        });
      }
    });
    const personalIdsByResearchId = new Map();
    identities.forEach((identity, exerciseId) => {
      if (identity.invalid || !identity.researchExerciseId) return;
      if (!personalIdsByResearchId.has(identity.researchExerciseId)) personalIdsByResearchId.set(identity.researchExerciseId, []);
      personalIdsByResearchId.get(identity.researchExerciseId).push(exerciseId);
    });
    const sourcePriority = { explicit_crosswalk: 3, canonical_id: 2, alias_inference: 1, unresolved: 0 };
    // One canonical research identity owns one automatic-program slot. Prefer a
    // trusted explicit mapping, then an exact canonical ID, then alias inference;
    // stable personal IDs make equal-precedence batches order-independent.
    personalIdsByResearchId.forEach((exerciseIds) => exerciseIds.sort((left, right) => {
      const priorityDifference = number(sourcePriority[identities.get(right)?.researchIdentitySource]) - number(sourcePriority[identities.get(left)?.researchIdentitySource]);
      return priorityDifference || left.localeCompare(right);
    }));
    const selectedPersonalIdByResearchId = new Map([...personalIdsByResearchId.entries()].map(([researchExerciseId, exerciseIds]) => [researchExerciseId, exerciseIds[0]]));
    return { identities, personalIdsByResearchId, selectedPersonalIdByResearchId };
  }

  function invalidTrustedCustomIdentity(exerciseId, identities, error) {
    return {
      exerciseId,
      researchExerciseId: null,
      researchIdentitySpecified: identities.some((identity) => identity.researchIdentitySpecified),
      researchIdentityFieldPresence: identities.some((identity) => identity.researchIdentityFieldPresence === "value")
        ? "value"
        : identities.some((identity) => identity.researchIdentityFieldPresence === "blank_or_null")
          ? "blank_or_null"
          : "absent",
      researchIdentityConflict: identities.some((identity) => identity.researchIdentityConflict),
      structured: true,
      catalogRecord: true,
      invalid: true,
      invalidReason: error instanceof Error ? error.message : String(error || `Invalid trusted custom catalog identity ${exerciseId}.`),
      source: {}
    };
  }

  function rejectInvalidTrustedIdentity(identity) {
    if (identity?.invalid) throw new Error(identity.invalidReason || `Invalid trusted custom catalog identity ${identity.exerciseId}.`);
  }

  function buildTrustedExerciseCatalog(options = {}) {
    const researchIdentities = new Map();
    const customIdentityBatches = new Map();
    const reconciledCustomIdentityProfiles = new Map();
    const addResearch = (item) => {
      const identity = catalogIdentity(item);
      if (!identity?.structured || !identity.catalogRecord || !identity.exerciseId) throw new Error("Trusted research exercise catalogs require structured records with stable IDs and metadata.");
      if (identity.researchIdentityConflict) throw new Error(`Conflicting trusted research identities for ${identity.exerciseId}.`);
      if (identity.researchExerciseId !== identity.exerciseId) throw new Error(`Trusted research exercise ${identity.exerciseId} must bind its canonical research identity to the same catalog ID.`);
      const existing = researchIdentities.get(identity.exerciseId);
      if (existing && existing.researchExerciseId !== identity.researchExerciseId) throw new Error(`Conflicting trusted research catalog mapping for ${identity.exerciseId}.`);
      if (!existing) researchIdentities.set(identity.exerciseId, identity);
    };
    asArray(options.trustedResearchCatalog).forEach(addResearch);
    const callerCatalog = asArray(options.exerciseCatalog);
    // The class API always supplies engine-owned research records. Preserve the
    // raw functional API by treating a fully structured catalog as its explicit
    // trust root only when no engine-owned research catalog exists.
    const explicitCallerTrustRoot = researchIdentities.size === 0 && callerCatalog.length > 0;
    if (explicitCallerTrustRoot) {
      callerCatalog.forEach((item) => {
        const supplied = catalogIdentity(item);
        const sourceResearchId = firstPresent(item?.researchExerciseId, item?.research_exercise_id, item?.researchId, item?.research_id, item?.exercise_id);
        if (!supplied?.structured || !supplied.catalogRecord || !sourceResearchId || item?.exercise_id !== sourceResearchId) return;
        addResearch({ ...item, exerciseId: sourceResearchId, researchExerciseId: sourceResearchId });
      });
    }

    const addCustom = (item) => {
      const identity = catalogIdentity(item);
      if (!identity?.structured || !identity.catalogRecord || !identity.exerciseId) throw new Error("Trusted custom exercise catalogs require structured records with stable IDs and metadata.");
      const canonical = researchIdentities.get(identity.exerciseId);
      if (canonical) {
        if (identity.researchIdentityConflict) throw new Error(`Conflicting trusted catalog mapping for canonical exercise ${identity.exerciseId}.`);
        if (identity.researchExerciseId !== null && identity.researchExerciseId !== canonical.researchExerciseId) throw new Error(`Conflicting trusted catalog mapping for canonical exercise ${identity.exerciseId}.`);
        return;
      }
      if (!customIdentityBatches.has(identity.exerciseId)) customIdentityBatches.set(identity.exerciseId, []);
      customIdentityBatches.get(identity.exerciseId).push(identity);
    };
    const addReconciledCustomIdentityProfile = (profile) => {
      if (!profile || typeof profile !== "object" || !profile.exerciseId || !profile.structured || !profile.catalogRecord) {
        throw new Error("Trusted reconciled custom identity profiles require structured catalog identities with stable IDs and metadata.");
      }
      const canonical = researchIdentities.get(profile.exerciseId);
      // Canonical research identities always win. Reconciled personal profiles,
      // including invalid ones, are quarantined and never enter the custom map.
      if (canonical) return;
      if (!profile.invalid && profile.researchExerciseId && !researchIdentities.has(profile.researchExerciseId)) {
        throw new Error(`Trusted reconciled custom exercise ${profile.exerciseId} maps to unknown research exercise ${profile.researchExerciseId}.`);
      }
      if (profile.invalid && !String(profile.invalidReason || "").trim()) {
        throw new Error(`Invalid trusted custom catalog identity ${profile.exerciseId} must preserve its rejection reason.`);
      }
      const existing = reconciledCustomIdentityProfiles.get(profile.exerciseId);
      if (existing && stableStringify(existing) !== stableStringify(profile)) {
        throw new Error(`Conflicting trusted reconciled custom identity profiles for ${profile.exerciseId}.`);
      }
      if (!existing) reconciledCustomIdentityProfiles.set(profile.exerciseId, deepClone(profile));
    };
    asArray(options.trustedCustomIdentityProfiles).forEach(addReconciledCustomIdentityProfile);
    asArray(options.trustedCustomCatalog).forEach(addCustom);
    if (explicitCallerTrustRoot) callerCatalog.filter((item) => {
      const identity = catalogIdentity(item);
      return identity?.structured && identity.catalogRecord;
    }).forEach(addCustom);

    const customExerciseIds = unique([
      ...reconciledCustomIdentityProfiles.keys(),
      ...customIdentityBatches.keys()
    ]).sort();
    const customIdentities = new Map(customExerciseIds.map((exerciseId) => {
      const profile = reconciledCustomIdentityProfiles.get(exerciseId);
      const batch = customIdentityBatches.get(exerciseId) || [];
      if (profile?.invalid) return [exerciseId, profile];
      if (profile && !batch.length) return [exerciseId, profile];
      const identitiesToReconcile = profile ? [profile, ...batch] : batch;
      try {
        return [exerciseId, reconcileTrustedCustomIdentityBatch(identitiesToReconcile, researchIdentities)];
      } catch (error) {
        return [exerciseId, invalidTrustedCustomIdentity(exerciseId, identitiesToReconcile, error)];
      }
    }));

    const identities = new Map([...researchIdentities, ...customIdentities]);
    callerCatalog.forEach((item) => {
      const supplied = catalogIdentity(item);
      if (!supplied?.structured || !supplied.catalogRecord) throw new Error("Caller exerciseCatalog entries cannot establish identity; each must be a structured catalog object matching a trusted catalog entry.");
      if (supplied.researchIdentityConflict) throw new Error(`Caller exerciseCatalog entry ${supplied.exerciseId} declares conflicting research identities.`);
      const trusted = identities.get(supplied.exerciseId);
      if (!trusted) throw new Error(`Untrusted caller exerciseCatalog entry ${supplied.exerciseId}; caller metadata cannot establish a replacement identity.`);
      rejectInvalidTrustedIdentity(trusted);
      if (supplied.researchIdentitySpecified && supplied.researchExerciseId !== trusted.researchExerciseId) throw new Error(`Caller exerciseCatalog mapping for ${supplied.exerciseId} conflicts with its trusted catalog identity.`);
    });
    return { identities, researchIdentities };
  }

  function equipmentSourceForIdentity(identity, researchIdentities) {
    return reconciledEquipmentSource(identity, researchIdentities.get(identity?.researchExerciseId)?.source || null);
  }

  function equipmentCompatibilityForIdentity(identity, researchIdentities, availableEquipment) {
    return equipmentCompatible(equipmentSourceForIdentity(identity, researchIdentities), availableEquipment);
  }

  function applyManualOverride(snapshotInput, override = {}, options = {}) {
    const snapshot = deserializeRecommendationSnapshot(snapshotInput);
    const before = deepClone(snapshot.finalPrescription);
    const final = deepClone(snapshot.finalPrescription);
    const applied = {};
    const supportedOverrideInputFields = new Set([
      "exerciseId", "exerciseSelection", "replacementExerciseId", "researchExerciseId", "research_exercise_id",
      "painFreeConfirmed", "reason", "setCount", "workingSets", "repRange", "load", "prescribedLoad",
      "setStructure", "topSet", "backoffSets", "deloadRecommendation", "exerciseRotation", "mesocycleId"
    ]);
    const unsupportedOverrideInputs = Object.keys(override).filter((field) => override[field] !== undefined && !supportedOverrideInputFields.has(field));
    if (unsupportedOverrideInputs.length) throw new Error(`Unsupported manual override fields are not represented by the current audit contract: ${unsupportedOverrideInputs.join(", ")}.`);
    if (override.topSet !== undefined || override.backoffSets !== undefined) throw new Error("Manual topSet/backoffSets payloads are unsupported because the current audit contract records only a deterministic set-structure transition.");
    if (override.setCount !== undefined && override.workingSets?.target !== undefined) throw new Error("Duplicate set-count inputs are unsupported; use either setCount or workingSets.target.");
    if (override.load !== undefined && override.prescribedLoad?.target !== undefined) throw new Error("Duplicate load inputs are unsupported; use either load or prescribedLoad.target.");
    if (override.researchExerciseId !== undefined && override.research_exercise_id !== undefined) throw new Error("Duplicate research-identity inputs are unsupported.");
    const suppliedExerciseSelectors = [override.exerciseId, override.exerciseSelection, override.replacementExerciseId].filter((value) => value !== undefined && value !== null && value !== "");
    if (suppliedExerciseSelectors.length > 1) throw new Error("Duplicate exercise-identity inputs are unsupported; select one exercise field.");
    if (override.workingSets && Object.keys(override.workingSets).some((field) => field !== "target")) throw new Error("Manual workingSets overrides support only target; min/max remain deterministic audit-derived bounds.");
    if (override.prescribedLoad && Object.keys(override.prescribedLoad).some((field) => field !== "target")) throw new Error("Manual prescribedLoad overrides support only target; unit, assistance direction, prior load, and increment metadata remain bound to the audited prescription.");
    const { identities: catalogIdentities, researchIdentities } = buildTrustedExerciseCatalog(options);
    const safetyLocked = hasHardSafetyMarker(final) || hasHardSafetyMarker(snapshot.basePrescription);
    const selectedExerciseInput = firstPresent(override.exerciseId, override.exerciseSelection, override.replacementExerciseId);
    const suppliedSelectionIdentity = selectedExerciseInput && typeof selectedExerciseInput === "object" ? catalogIdentity(selectedExerciseInput) : null;
    if (selectedExerciseInput && typeof selectedExerciseInput === "object" && (!suppliedSelectionIdentity?.structured || !suppliedSelectionIdentity.catalogRecord)) throw new Error("Structured exerciseSelection requires a catalog record with a stable exercise ID and metadata.");
    if (suppliedSelectionIdentity?.researchIdentityConflict) throw new Error("Structured exerciseSelection declares conflicting research identities.");
    const selectedExerciseId = suppliedSelectionIdentity?.exerciseId ?? selectedExerciseInput;
    if (selectedExerciseId !== undefined && selectedExerciseId !== null && (typeof selectedExerciseId !== "string" || !selectedExerciseId.trim())) throw new Error("Manual override exercise identity must be a non-empty string or structured catalog record.");
    if (!selectedExerciseId && firstPresent(override.researchExerciseId, override.research_exercise_id)) throw new Error("A research identity may only accompany a declared exercise identity change.");
    if (!safetyLocked && override.painFreeConfirmed !== undefined) throw new Error("painFreeConfirmed is a safety audit companion and cannot accompany an ordinary manual override.");
    const allowedExerciseSource = options.allowedExerciseIds;
    if (allowedExerciseSource !== undefined && !Array.isArray(allowedExerciseSource)) throw new Error("allowedExerciseIds must be an array of exercise IDs.");
    const allowedExerciseIds = new Set(asArray(allowedExerciseSource).map((value) => {
      if (typeof value !== "string" || !value.trim()) throw new Error("allowedExerciseIds must contain only non-empty string IDs.");
      return value;
    }));
    const allowedSafetySource = options.allowedSafetySubstituteIds;
    if (allowedSafetySource !== undefined && !Array.isArray(allowedSafetySource)) throw new Error("allowedSafetySubstituteIds must be an array of exercise IDs.");
    const allowedSafetySubstituteIds = new Set(asArray(allowedSafetySource).map((value) => {
      if (typeof value !== "string" || !value.trim()) throw new Error("allowedSafetySubstituteIds must contain only non-empty string IDs.");
      const identity = catalogIdentities.get(value);
      rejectInvalidTrustedIdentity(identity);
      if (!identity?.catalogRecord || !identity.researchExerciseId) throw new Error(`Unknown allowed safety substitute ${value}; an actual trusted structured catalog object with matching exercise/research IDs is required.`);
      return value;
    }));
    let confirmedSafetyIdentity = null;
    if (safetyLocked) {
      const allowedOverrideFields = new Set(["exerciseId", "exerciseSelection", "replacementExerciseId", "researchExerciseId", "painFreeConfirmed", "reason"]);
      const blockedFields = Object.keys(override).filter((key) => override[key] !== undefined && !allowedOverrideFields.has(key));
      if (blockedFields.length) throw new Error(`Hard-safety prescriptions reject training override fields: ${blockedFields.join(", ")}.`);
      if (!selectedExerciseId) throw new Error("Hard-safety prescriptions may only accept an explicitly allowed safe substitute.");
      if (final.safetyRestriction?.reason === "illness" || final.progressionAction === "stop_for_illness") throw new Error("Illness requires holding the workout; an exercise override cannot bypass the stop instruction.");
      if (override.painFreeConfirmed !== true) throw new Error("A hard-safety pain substitute requires explicit user pain-free confirmation (painFreeConfirmed: true).");
      if (!allowedSafetySubstituteIds.has(selectedExerciseId)) throw new Error(`Safety substitute ${selectedExerciseId} was not explicitly allowed.`);
      const identity = catalogIdentities.get(selectedExerciseId);
      rejectInvalidTrustedIdentity(identity);
      const requestedResearchId = firstPresent(override.researchExerciseId, override.research_exercise_id);
      if (!identity?.structured || !identity.catalogRecord || !identity.researchExerciseId || !requestedResearchId || requestedResearchId !== identity.researchExerciseId) throw new Error(`Safety substitute ${selectedExerciseId} must preserve its coherent exercise/research identity from an actual trusted catalog object.`);
      const originalExerciseIds = new Set([
        final.safetyRestriction?.originalExerciseId,
        final.safetyRestriction?.auditBaseTargets?.exerciseId,
        snapshot.basePrescription?.exerciseId,
        snapshot.exerciseId
      ].filter(Boolean));
      const originalResearchExerciseIds = new Set([
        final.safetyRestriction?.auditBaseTargets?.researchExerciseId,
        snapshot.basePrescription?.researchExerciseId,
        final.researchExerciseId,
        final.safetyRestriction?.originalExerciseId
      ].filter(Boolean));
      if (originalExerciseIds.has(selectedExerciseId) || originalResearchExerciseIds.has(identity.researchExerciseId)) throw new Error("A pain-free substitute must be a different exercise and research identity from the painful original.");
      const equipment = equipmentCompatibilityForIdentity(identity, researchIdentities, options.availableEquipment);
      if (!equipment.eligible) throw new Error(`Safety substitute ${selectedExerciseId} is not compatible with the supplied equipment restrictions; missing ${equipment.missing.join(", ") || "verified equipment metadata"}.`);
      confirmedSafetyIdentity = identity;
    }
    if (selectedExerciseId) {
      const requestedResearchId = firstPresent(override.researchExerciseId, override.research_exercise_id);
      if (selectedExerciseId !== final.exerciseId) {
        const selectedIdentity = catalogIdentities.get(selectedExerciseId);
        rejectInvalidTrustedIdentity(selectedIdentity);
        if (!selectedIdentity?.structured || !selectedIdentity.catalogRecord) throw new Error(`Unknown manual override exercise ${selectedExerciseId}; replacements require a trusted catalog-backed identity.`);
        if (!confirmedSafetyIdentity && !allowedExerciseIds.has(selectedExerciseId)) throw new Error(`Manual override exercise ${selectedExerciseId} was not explicitly allowed for ordinary replacement.`);
        if (requestedResearchId && requestedResearchId !== selectedIdentity.researchExerciseId) throw new Error(`Manual override exercise ${selectedExerciseId} conflicts with its trusted catalog-backed research identity.`);
        if (suppliedSelectionIdentity?.researchIdentitySpecified && suppliedSelectionIdentity.researchExerciseId !== selectedIdentity.researchExerciseId) throw new Error(`Structured exerciseSelection for ${selectedExerciseId} conflicts with its trusted catalog mapping.`);
        if (!confirmedSafetyIdentity) {
          const equipment = equipmentCompatibilityForIdentity(selectedIdentity, researchIdentities, options.availableEquipment);
          if (!equipment.eligible) throw new Error(`Manual override exercise ${selectedExerciseId} is not compatible with the supplied equipment restrictions; missing ${equipment.missing.join(", ") || "verified equipment metadata"}.`);
        }
        if (!confirmedSafetyIdentity && (override.load !== undefined || override.prescribedLoad?.target !== undefined)) throw new Error("A replacement exercise cannot receive a transferred load target; establish an exercise-specific baseline first.");
        if (!confirmedSafetyIdentity && override.setStructure !== undefined) throw new Error("A replacement exercise resets to straight sets; apply a different structure only after establishing its exercise-specific baseline.");
        const selectedResearchExerciseId = selectedIdentity.researchExerciseId ?? null;
        applied.exerciseId = { from: final.exerciseId, to: selectedExerciseId };
        if (confirmedSafetyIdentity) {
          final.exerciseId = selectedExerciseId;
          final.researchExerciseId = selectedResearchExerciseId;
        } else applyRecordedExerciseReplacement(final, { exerciseId: selectedExerciseId, researchExerciseId: selectedResearchExerciseId });
      } else {
        const selectedResearchExerciseId = requestedResearchId ?? suppliedSelectionIdentity?.researchExerciseId ?? final.researchExerciseId ?? null;
        if (selectedResearchExerciseId !== (final.researchExerciseId ?? null)) throw new Error("A research-identity-only manual override is unsupported; select a different trusted catalog-backed exercise.");
      }
    }
    if (confirmedSafetyIdentity) {
      const confirmedAt = options.createdAt || isoNow(options.clock);
      applied.safetyConfirmation = {
        exerciseId: confirmedSafetyIdentity.exerciseId,
        researchExerciseId: confirmedSafetyIdentity.researchExerciseId,
        painFreeConfirmed: true,
        confirmedAt
      };
      applyRecordedSafetyConfirmation(final, applied.safetyConfirmation);
    }
    const rawSetCount = firstPresent(override.setCount, override.workingSets?.target);
    const setCount = nullableNumber(rawSetCount);
    if (rawSetCount !== undefined && rawSetCount !== null && setCount === null) throw new Error("Manual set count must be numeric.");
    if (setCount !== null) {
      if (!Number.isInteger(setCount) || setCount < 1 || setCount > DEFAULT_POLICY.absoluteMaximumWorkingSetsPerSession) throw new Error(`Manual set count must be an integer from 1 to ${DEFAULT_POLICY.absoluteMaximumWorkingSetsPerSession}.`);
      const target = setCount;
      if (target !== final.workingSets.target) {
        applied.setCount = { from: final.workingSets.target, to: target };
        applyRecordedSetCount(final, target);
      }
    }
    if (override.repRange) {
      const range = normalizeRange(override.repRange, null, true);
      if (!range) throw new Error("Manual repRange override must contain min and/or max.");
      if (range.min < 1 || range.max > 100) throw new Error("Manual repRange override must stay between 1 and 100 repetitions.");
      const normalized = targetRange(range, true);
      if (!auditValuesMatch(normalized, final.repRange)) {
        applied.repRange = { from: deepClone(final.repRange), to: deepClone(normalized) };
        final.repRange = deepClone(normalized);
      }
    }
    const rawLoad = firstPresent(override.load, override.prescribedLoad?.target);
    const load = nullableNumber(rawLoad);
    if (rawLoad !== undefined && rawLoad !== null && load === null) throw new Error("Manual load override must be numeric.");
    if (load !== null) {
      if (load < 0 || load > 1000000) throw new Error("Manual load override must be between 0 and 1,000,000 logged units.");
      if (load !== (final.prescribedLoad?.target ?? null)) {
        applied.load = { from: final.prescribedLoad?.target ?? null, to: load };
        applyRecordedLoad(final, load);
      }
    }
    if (override.setStructure) {
      if (!SET_STRUCTURES.includes(override.setStructure)) throw new Error(`Invalid manual set structure ${override.setStructure}.`);
      if (override.setStructure !== final.setStructure) {
        applied.setStructure = { from: final.setStructure, to: override.setStructure };
        applyRecordedSetStructure(final, override.setStructure);
      }
    }
    if (override.deloadRecommendation !== undefined) {
      const requested = normalizedBoolean(override.deloadRecommendation, null) === false ? "normal" : normalizedBoolean(override.deloadRecommendation, null) === true ? "exercise_deload" : override.deloadRecommendation;
      if (!RECOMMENDATION_TYPES.includes(requested)) throw new Error(`Invalid manual deload recommendation ${requested}.`);
      const to = safetyLocked ? final.recommendationType : requested;
      if (to !== final.recommendationType) {
        applied.deloadRecommendation = { from: final.recommendationType, to };
        applyRecordedDeloadRecommendation(final, to);
      }
    }
    if (override.exerciseRotation !== undefined) {
      const requested = normalizedBoolean(override.exerciseRotation, null) === false ? "hold" : normalizedBoolean(override.exerciseRotation, null) === true ? "rotate_exercise" : override.exerciseRotation;
      if (!RECOMMENDATION_TYPES.includes(requested)) throw new Error(`Invalid manual rotation recommendation ${requested}.`);
      const to = safetyLocked ? final.recommendationType : requested;
      if (to !== final.recommendationType) {
        applied.exerciseRotation = { from: final.recommendationType, to };
        final.recommendationType = to;
      }
    }
    if (override.mesocycleId && override.mesocycleId !== snapshot.mesocycleId) {
      applied.mesocycleId = { from: snapshot.mesocycleId, to: override.mesocycleId };
      snapshot.mesocycleId = override.mesocycleId;
      final.mesocycleId = override.mesocycleId;
    }
    if (!Object.keys(applied).length) throw new Error("No supported manual override field was supplied.");
    const createdAt = options.createdAt || isoNow(options.clock);
    const derivedExerciseOverrideId = applied.exerciseId
      ? exerciseIdentityOverrideId(snapshot.recommendationId, createdAt, applied, final.exerciseId, final.researchExerciseId)
      : null;
    const ordinaryExerciseReplacement = applied.exerciseId && !applied.safetyConfirmation;
    if (ordinaryExerciseReplacement && options.overrideId && options.overrideId !== derivedExerciseOverrideId) throw new Error("Ordinary exercise replacements require the derived exercise/research audit identity commitment; a caller overrideId cannot replace it.");
    const entry = {
      overrideId: options.overrideId || derivedExerciseOverrideId || `override_${stableHash({ recommendationId: snapshot.recommendationId, createdAt, applied })}`,
      createdAt,
      actor: options.actor || "user",
      reason: options.reason || override.reason || "Manual workout override",
      workoutId: options.workoutId || null,
      changes: applied,
      previousFinalPrescription: before
    };
    final.manualOverride = { overrideId: entry.overrideId, lockedForWorkout: true, explanation: entry.reason };
    snapshot.finalPrescription = final;
    snapshot.exerciseId = final.exerciseId;
    snapshot.engineVersion = ENGINE_VERSION;
    snapshot.explanation = final.userExplanation;
    snapshot.readinessAdjustment = deepClone(final.readinessAdjustment);
    snapshot.manualOverrides = [...asArray(snapshot.manualOverrides), entry];
    snapshot.overrideLocked = true;
    snapshot.checksum = stableHash({ ...snapshot, checksum: undefined });
    verifySnapshotChecksum(snapshot);
    return snapshot;
  }

  function reconcileRecommendation(snapshot, _newEngineRecommendation) {
    if (snapshot?.overrideLocked) return deepClone(snapshot);
    return deepClone(_newEngineRecommendation || snapshot);
  }

  function refreshRecommendationChecksum(snapshotInput) {
    const snapshot = deepClone(snapshotInput);
    snapshot.checksum = stableHash({ ...snapshot, checksum: undefined });
    return snapshot;
  }

  function evaluateManualOverrideOutcome(snapshotInput, outcome = {}, options = {}) {
    const snapshot = deserializeRecommendationSnapshot(snapshotInput);
    if (!snapshot.manualOverrides?.length) throw new Error("This recommendation has no manual override to evaluate.");
    const index = snapshot.manualOverrides.length - 1;
    const entry = snapshot.manualOverrides[index];
    const progressed = outcome.progressionPercent !== undefined ? number(outcome.progressionPercent) > 1 : Boolean(outcome.progressed);
    const recoveryAcceptable = outcome.recoveryCost === undefined || number(outcome.recoveryCost) < 60;
    const painFree = !outcome.pain && !outcome.discomfort;
    const completed = outcome.completed !== false && number(outcome.adherence, 1) >= 0.8;
    let result = "inconclusive";
    if (completed && progressed && recoveryAcceptable && painFree) result = "override_outperformed_or_supported";
    else if (!completed || !recoveryAcceptable || !painFree || number(outcome.progressionPercent) < -1.5) result = "engine_recommendation_likely_preferred";
    snapshot.manualOverrides[index] = {
      ...entry,
      outcome: deepClone(outcome),
      outcomeEvaluation: {
        result,
        evaluatedAt: options.evaluatedAt || isoNow(options.clock),
        explanation: result === "override_outperformed_or_supported"
          ? "The override was completed, progressed, and did not show excessive recovery cost or pain; retain it as positive personal evidence with appropriate sample-size limits."
          : result === "engine_recommendation_likely_preferred"
            ? "The override was not completed successfully or was followed by regression, excessive fatigue, or pain; weight the original engine choice more strongly after comparable confirmation."
            : "The outcome does not yet distinguish the override from the engine recommendation."
      }
    };
    snapshot.checksum = stableHash({ ...snapshot, checksum: undefined });
    return snapshot;
  }

  class PrescriptionEngine {
    constructor(input = {}) {
      this.evidence = normalizeEvidenceBundle(input);
      this.policy = { ...DEFAULT_POLICY, ...(input.policy || {}) };
    }

    evidenceWeight(input) { return calculateEvidenceWeight(input, this.policy); }
    assessStaleness(history, options) { return assessExerciseStaleness(history, { ...this.policy, ...(options || {}) }); }
    evaluateReadiness(readiness) { return evaluateReadiness(readiness); }
    assessDeload(options) { return assessDeloadNeed(options); }
    scoreExercise(exerciseId, muscleGroupId, options = {}) {
      const candidate = resolveExerciseCandidate(this.evidence, exerciseId, muscleGroupId, options);
      return scoreExerciseCandidate(candidate, this.evidence, muscleGroupId, { ...options, policy: this.policy });
    }
    rankExercisePool(muscleGroupId, options = {}) { return rankExercisePool(this.evidence, muscleGroupId, { ...options, policy: this.policy }); }
    buildAllCandidatePools(options = {}) { return buildAllCandidatePools(this.evidence, { ...options, policy: this.policy }); }
    createMesocycle(options = {}) { return createMesocyclePlan(this.evidence, { ...options, policy: this.policy }); }
    transitionMesocycle(mesocycle, action, options = {}) { return transitionMesocycle(mesocycle, action, options); }
    updateMesocycleSelection(mesocycle, programSlotId, exerciseIds, options = {}) { return updateMesocycleSelection(this.evidence, mesocycle, programSlotId, exerciseIds, { ...options, policy: this.policy }); }
    refreshMesocycle(mesocycle, options = {}) { return refreshMesocycleProgram(mesocycle, this.evidence, { ...options, policy: this.policy }); }
    canDeleteMesocycle(mesocycle) { return canDeleteMesocycle(mesocycle); }
    prescribeExercise(options = {}) { return createExercisePrescriptionSnapshot(this.evidence, { ...options, policy: this.policy }); }
    prescribeWorkout(options = {}) { return createWorkoutPrescription(this.evidence, { ...options, policy: this.policy }); }
    forSurface(snapshot, surface) { return recommendationForSurface(snapshot, surface); }
    applyManualOverride(snapshot, override, options = {}) {
      const researchCatalog = this.evidence.research.exerciseDatabase.map((item) => ({
        ...item,
        exerciseId: firstPresent(item.exercise_id, item.exerciseId),
        researchExerciseId: firstPresent(item.exercise_id, item.exerciseId)
      }));
      return applyManualOverride(snapshot, override, {
        ...options,
        trustedResearchCatalog: researchCatalog,
        // Preserve the engine's reconciled valid/invalid state directly. Turning
        // an invalid identity into a nullable catalog record would incorrectly
        // let it re-enter the override path as a genuinely unmapped exercise.
        trustedCustomIdentityProfiles: [...this.evidence.personal.reconciledIdentityByExerciseId.values()],
        trustedCustomCatalog: asArray(options.trustedExerciseCatalog),
        exerciseCatalog: asArray(options.exerciseCatalog)
      });
    }
    reconcileRecommendation(snapshot, newEngineRecommendation) { return reconcileRecommendation(snapshot, newEngineRecommendation); }
    evaluateOverride(snapshot, outcome, options) { return evaluateManualOverrideOutcome(snapshot, outcome, options); }
  }

  function createPrescriptionEngine(input = {}) {
    return new PrescriptionEngine(input);
  }

  return Object.freeze({
    ENGINE_VERSION,
    PRESCRIPTION_SCHEMA_VERSION,
    SNAPSHOT_SCHEMA_VERSION,
    HARD_SAFETY_SCHEMA_VERSION,
    HISTORY_STORAGE_KEY,
    MESOCYCLE_TYPES,
    STALENESS,
    RECOMMENDATION_TYPES,
    ROLES,
    SET_STRUCTURES,
    DEFAULT_POLICY,
    PrescriptionEngine,
    createPrescriptionEngine,
    createPersonalDataAdapter,
    createResearchDataAdapter,
    normalizeEvidenceBundle,
    loadEvidenceFromFiles,
    loadEvidenceFromUrls,
    parseCsv,
    calculateEvidenceWeight,
    derivePersonalEvidenceMetrics,
    assessExerciseStaleness,
    evaluateReadiness,
    readinessAdjustmentFor,
    applyReadinessAdjustment,
    aggregateMuscleResearchDefaults,
    buildMergedExerciseCandidates,
    scoreExerciseCandidate,
    chooseSetStructure,
    determineVolumePrescription,
    determineProgressionDecision,
    assessDeloadNeed,
    rankExercisePool,
    equipmentRequirementOptions,
    normalizeAvailableEquipmentInput,
    equipmentCompatible,
    jointActionsForExercise,
    representedMuscleGroups,
    muscleFamily,
    buildAllCandidatePools,
    chooseMesocycleDuration,
    createMesocyclePlan,
    transitionMesocycle,
    updateMesocycleSelection,
    refreshMesocycleProgram,
    canDeleteMesocycle,
    candidateProgramFit,
    mechanicalRedundancyScore,
    calculateExerciseMuscleContributions,
    recalculateHistoricalMuscleVolume,
    distributePortfolioAcrossSessions,
    reviewFullProgram,
    createExercisePrescriptionSnapshot,
    createWorkoutPrescription,
    recommendationForSurface,
    validateSnapshot,
    serializeRecommendationSnapshot,
    deserializeRecommendationSnapshot,
    saveRecommendationSnapshot,
    loadRecommendationSnapshot,
    appendRecommendationHistory,
    recommendationHistory,
    saveMesocycle,
    loadMesocycle,
    applyManualOverride,
    reconcileRecommendation,
    refreshRecommendationChecksum,
    evaluateManualOverrideOutcome
  });
});
