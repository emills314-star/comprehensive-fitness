/*
 * Comprehensive Fitness identity and historical-snapshot compatibility layer.
 *
 * This module intentionally has no live prescription, scoring, ranking,
 * readiness, deload, override, reconciliation, persistence, or refresh API.
 * It retains only the stable identity boundary used by the shipping app and a
 * read-only validator for repository-supported historical snapshots.
 */
(function prescriptionCompatibilityUmd(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ComprehensiveFitnessPrescriptionEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function prescriptionCompatibilityFactory() {
  "use strict";

  const ENGINE_VERSION = "identity-compatibility/1.0.0";
  const SNAPSHOT_SCHEMA_PAIRS = Object.freeze({
    "1.0.0": "2.0.0",
    "1.1.0": "2.1.0",
    "1.2.0": "2.2.0",
    "1.3.0": "2.3.0",
    "1.4.0": "2.4.0"
  });
  const CURRENT_SNAPSHOT_SCHEMA_VERSION = "1.4.0";
  const CURRENT_PRESCRIPTION_SCHEMA_VERSION = "2.4.0";
  const TRAINING_PROFILE_VERSION = "training-profile/1.1.0";
  const HARD_SAFETY_SCHEMA_VERSION = "hard-safety/1.0.0";
  const SNAPSHOT_CHECKSUM_PATTERN = /^[0-9a-f]{8}$/;
  const RECOMMENDATION_TYPES = new Set([
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
  const SET_STRUCTURES = new Set([
    "straight_sets",
    "top_set_backoff",
    "multiple_top_sets",
    "single_working_set",
    "custom"
  ]);
  const ROLES = new Set([
    "primary_progression_lift",
    "secondary_hypertrophy_lift",
    "low_fatigue_accessory",
    "maintenance_lift",
    "deload_variation"
  ]);

  function number(value, fallback = 0) {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
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

  function firstPresent(...values) {
    return values.find((value) => value !== null && value !== undefined && value !== "");
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
        // Fall through to the legacy delimiter reader.
      }
    }
    return text.split(/[|;,]/).map((part) => part.trim()).filter(Boolean);
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

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
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

    function prescriptionsFor(exerciseId, muscleGroupId) {
      const records = prescriptionsByExercise.get(exerciseId) || [];
      if (!muscleGroupId) return records;
      const requested = normalizeMuscleId(muscleGroupId);
      return records.filter((item) => {
        const personalMuscle = normalizeMuscleId(item.muscle_group_id || item.muscleGroupId);
        const researchMuscle = normalizeMuscleId(item.research_muscle_group_id || item.researchMuscleGroupId);
        return personalMuscle === requested
          || researchMuscle === requested
          || personalMuscle.startsWith(requested)
          || requested.startsWith(personalMuscle);
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
      kind: "personal_identity_adapter",
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
      historyFor(exerciseId) {
        return sessionsByExercise.get(exerciseId) || [];
      }
    };
  }

  function createResearchDataAdapter(source = {}) {
    const exerciseDatabase = table(source, "exerciseDatabase", "exercise_database");
    const exerciseMuscleMap = table(source, "exerciseMuscleMap", "exercise_muscle_map");
    const exerciseById = mapBy(exerciseDatabase, (item) => item.exercise_id || item.exerciseId);
    const muscleMapsByExercise = groupBy(exerciseMuscleMap, (item) => item.exercise_id || item.exerciseId);
    const publicIdentityOwnership = new Map();
    const addPublicIdentity = (exerciseId, value, surface) => {
      const key = normalizeText(value);
      if (!exerciseId || !key) return;
      if (!publicIdentityOwnership.has(key)) publicIdentityOwnership.set(key, new Map());
      const owners = publicIdentityOwnership.get(key);
      if (!owners.has(exerciseId)) owners.set(exerciseId, new Set());
      owners.get(exerciseId).add(surface);
    };
    exerciseDatabase.forEach((exercise) => {
      const exerciseId = exercise.exercise_id || exercise.exerciseId;
      addPublicIdentity(exerciseId, exerciseId, "canonical_id");
      [exercise.exercise_name, exercise.exerciseName].forEach((name) => addPublicIdentity(exerciseId, name, "canonical_name"));
      splitMulti(exercise.exercise_aliases || exercise.exerciseAliases).forEach((alias) => addPublicIdentity(exerciseId, alias, "alias"));
    });
    const publicExerciseIdsByIdentity = new Map();
    const publicIdentitySurfacesByExercise = new Map();
    [...publicIdentityOwnership.keys()].sort().forEach((key) => {
      const owners = publicIdentityOwnership.get(key);
      const exerciseIds = [...owners.keys()].sort();
      publicExerciseIdsByIdentity.set(key, Object.freeze(exerciseIds));
      publicIdentitySurfacesByExercise.set(key, new Map(exerciseIds.map((exerciseId) => [
        exerciseId,
        Object.freeze([...owners.get(exerciseId)].sort())
      ])));
    });
    const exerciseIdByAlias = new Map();
    publicExerciseIdsByIdentity.forEach((exerciseIds, key) => {
      if (exerciseIds.length !== 1) return;
      const exerciseId = exerciseIds[0];
      const surfaces = publicIdentitySurfacesByExercise.get(key)?.get(exerciseId) || [];
      if (surfaces.includes("canonical_name") || surfaces.includes("alias")) exerciseIdByAlias.set(key, exerciseId);
    });
    return {
      kind: "research_identity_adapter",
      raw: source,
      manifest: source.manifest || {},
      version: source.manifest?.database_version || source.databaseVersion || source.version || "unknown",
      exerciseDatabase,
      exerciseMuscleMap,
      exerciseById,
      muscleMapsByExercise,
      exerciseIdByAlias,
      publicExerciseIdsByIdentity,
      publicIdentitySurfacesByExercise
    };
  }

  const EQUIPMENT_REQUIREMENT_FIELDS = Object.freeze([
    "equipment_requirements",
    "equipmentRequirements",
    "required_equipment",
    "requiredEquipment"
  ]);
  const EQUIPMENT_SUMMARY_FIELDS = Object.freeze(["equipment", "equipment_type", "equipmentType"]);
  const PRIMARY_EQUIPMENT_FAMILIES = new Set([
    "barbell",
    "dumbbell",
    "cable",
    "machine",
    "bodyweight",
    "bands",
    "kettlebell",
    "trap_bar",
    "cambered_bar",
    "ez_bar"
  ]);

  function equipmentFamily(value) {
    const text = String(value || "").toLowerCase();
    if (/barbell/.test(text)) return "barbell";
    if (/dumbbell/.test(text)) return "dumbbell";
    if (/cable/.test(text)) return "cable";
    if (/machine/.test(text)) return "machine";
    if (/bodyweight/.test(text)) return "bodyweight";
    return normalizeText(text) || "other";
  }

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

  function normalizeEquipmentRequirementOptions(options, label) {
    if (!Array.isArray(options) || !options.length) throw new Error(`${label} must declare at least one equipment option.`);
    const normalized = options.map((option) => {
      if (!Array.isArray(option) || !option.length) throw new Error(`${label} contains an empty or malformed equipment option.`);
      return unique(option.map((item) => normalizeEquipmentItem(item)));
    });
    return minimizePositiveEquipmentOptions(normalized);
  }

  function parseEquipmentRequirementString(value, label) {
    const raw = value.trim();
    if (!raw) throw new Error(`${label} must be a non-empty string or string array.`);
    const special = {
      bodyweight: [["bodyweight"]],
      bodyweight_or_belt: [["bodyweight"], ["bodyweight", "dip_belt", "plates"]],
      cable_machine: [["cable_station"]],
      dumbbell_or_machine: [["dumbbell"], ["selectorized_machine"]],
      machine_or_free_weight: [["selectorized_machine"], ["dumbbell"], ["barbell", "plates"]]
    };
    const specialValue = special[normalizeText(raw)];
    if (specialValue) return normalizeEquipmentRequirementOptions(specialValue, label);
    const delimited = raw.replace(/_or_|\s+or\s+/gi, "|").replace(/_and_|\s+and\s+/gi, "+");
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
    return minimizePositiveEquipmentOptions(requirements).every((requirementOption) => {
      const requirementFamilies = equipmentOptionFamilies(requirementOption);
      return minimizePositiveEquipmentOptions(summary).some((summaryOption) => {
        const summaryFamilies = equipmentOptionFamilies(summaryOption);
        return requirementFamilies.some((family) => summaryFamilies.includes(family));
      });
    });
  }

  function resolveDeclaredEquipmentMetadata(exercise) {
    const requirements = declaredEquipmentMetadata(exercise, EQUIPMENT_REQUIREMENT_FIELDS, "equipment requirements");
    const summary = declaredEquipmentMetadata(exercise, EQUIPMENT_SUMMARY_FIELDS, "equipment summary");
    if (requirements.declared && summary.declared && !equipmentMetadataIsConsistent(requirements.options, summary.options)) {
      throw new Error("Contradictory equipment requirements and equipment summary metadata.");
    }
    if (requirements.declared) return { declared: true, detailLevel: 2, options: requirements.options };
    if (summary.declared) return { declared: true, detailLevel: 1, options: summary.options };
    return { declared: false, detailLevel: 0, options: [] };
  }

  function catalogIdentity(item) {
    if (!item) return null;
    const exerciseId = firstPresent(item.exerciseId, item.exercise_id, item.personalExerciseId, item.personal_exercise_id);
    if (!exerciseId) return null;
    const researchIdentityFields = ["researchExerciseId", "research_exercise_id", "researchId", "research_id"];
    const researchIdentitySpecified = researchIdentityFields.some((field) => Object.prototype.hasOwnProperty.call(item, field));
    const declaredResearchIds = unique(researchIdentityFields
      .filter((field) => Object.prototype.hasOwnProperty.call(item, field))
      .map((field) => item[field]));
    const researchExerciseId = firstPresent(...declaredResearchIds) ?? null;
    const catalogRecord = Boolean(
      firstPresent(item.exercise_id, item.personalExerciseId, item.personal_exercise_id)
      && firstPresent(
        item.exercise_name,
        item.exerciseName,
        item.prescription_id,
        item.score_id,
        item.equipment,
        item.equipment_type,
        item.equipmentType,
        item.equipment_requirements,
        item.equipmentRequirements,
        item.required_equipment,
        item.requiredEquipment
      )
    );
    return {
      exerciseId,
      researchExerciseId,
      researchIdentitySpecified,
      researchIdentityFieldPresence: !researchIdentitySpecified ? "absent" : researchExerciseId ? "value" : "blank_or_null",
      researchIdentityConflict: declaredResearchIds.length > 1,
      structured: true,
      catalogRecord,
      source: item
    };
  }

  function equipmentOptionRefines(candidateOption, broaderOption, broaderDetailLevel) {
    return broaderOption.every((broaderItem) => candidateOption.some((candidateItem) => (
      candidateItem === broaderItem
      || (broaderDetailLevel === 1
        && PRIMARY_EQUIPMENT_FAMILIES.has(equipmentFamily(broaderItem))
        && equipmentFamily(candidateItem) === equipmentFamily(broaderItem))
    )));
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
    if (mostSpecific.length === 1 || unique(mostSpecific.map((declaration) => equipmentOptionsKey(declaration.options))).length === 1) return mostSpecific[0];
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
    const ranked = values.filter(catalogMetadataPresent).sort((left, right) => (
      catalogMetadataRichness(right) - catalogMetadataRichness(left)
      || String(stableStringify(left)).localeCompare(String(stableStringify(right)))
    ));
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
      merged[equipment.detailLevel === 2 ? "equipmentRequirements" : "equipment"] = canonicalEquipmentOptions(equipment.options);
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
        identities.set(exerciseId, {
          ...canonicalIdentity,
          researchIdentityFieldPresence: fieldPresence,
          researchIdentitySource: "canonical_id",
          canonicalMetadataQuarantined: true,
          canonicalMetadataRecordCount: records.length
        });
        return;
      }
      if ((research.publicExerciseIdsByIdentity.get(normalizeText(exerciseId)) || []).length) {
        identities.set(exerciseId, {
          exerciseId,
          researchExerciseId: null,
          researchIdentitySpecified: explicitResearchIds.length > 0,
          researchIdentityFieldPresence: fieldPresence,
          researchIdentityConflict: false,
          researchIdentitySource: "public_namespace_collision",
          structured: true,
          catalogRecord: true,
          invalid: true,
          publicIdentityCollision: true,
          invalidReason: `Trusted custom exercise ${exerciseId} overlaps the normalized public exercise identity namespace.`,
          source: {}
        });
        return;
      }
      let researchIdentitySource = explicitResearchIds.length ? "explicit_crosswalk" : "unresolved";
      if (!explicitResearchIds.length) {
        const aliasResearchIds = unique(records.flatMap((record) => [
          record.exercise_name,
          record.exerciseName,
          record.exercise_name_recorded,
          record.exerciseNameRecorded,
          record.canonical_exercise_name,
          record.canonicalExerciseName
        ]).map((name) => research.exerciseIdByAlias.get(normalizeText(name))));
        researchIdentitySource = aliasResearchIds.length ? "alias_inference" : "unresolved";
        aliasResearchIds.forEach((researchExerciseId) => batch.push({
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
    personalIdsByResearchId.forEach((exerciseIds) => exerciseIds.sort((left, right) => (
      number(sourcePriority[identities.get(right)?.researchIdentitySource])
      - number(sourcePriority[identities.get(left)?.researchIdentitySource])
      || left.localeCompare(right)
    )));
    const selectedPersonalIdByResearchId = new Map(
      [...personalIdsByResearchId.entries()].map(([researchExerciseId, exerciseIds]) => [researchExerciseId, exerciseIds[0]])
    );
    return { identities, personalIdsByResearchId, selectedPersonalIdByResearchId };
  }

  function normalizeEvidenceBundle(input = {}) {
    const personal = ["personal_identity_adapter", "personal_evidence_adapter"].includes(input.personal?.kind)
      ? input.personal
      : createPersonalDataAdapter(input.personalData || input.personal || {});
    const research = ["research_identity_adapter", "research_evidence_adapter"].includes(input.research?.kind)
      ? input.research
      : createResearchDataAdapter(input.researchData || input.research || {});
    const reconciled = buildReconciledPersonalIdentityIndex(personal, research);
    personal.reconciledIdentityByExerciseId = reconciled.identities;
    personal.reconciledPersonalIdsByResearchId = reconciled.personalIdsByResearchId;
    personal.selectedPersonalIdByResearchId = reconciled.selectedPersonalIdByResearchId;
    personal.crosswalkByPersonalId.clear();
    personal.personalIdsByResearchId.clear();
    reconciled.identities.forEach((identity, exerciseId) => {
      if (!identity.invalid && identity.researchExerciseId) personal.crosswalkByPersonalId.set(exerciseId, identity.researchExerciseId);
    });
    reconciled.personalIdsByResearchId.forEach((exerciseIds, researchExerciseId) => {
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

  function resolveCanonicalExerciseIdentity(evidence, value) {
    const requestedValue = typeof value === "string" ? value.trim() : "";
    if (!requestedValue) return { status: "unresolved", reason: "unknown_exercise_identity" };
    const normalizedValue = normalizeText(requestedValue);
    if (!normalizedValue) return { status: "unresolved", reason: "unknown_exercise_identity" };
    const publicExerciseIds = evidence.research.publicExerciseIdsByIdentity.get(normalizedValue) || [];
    const personalIdentity = evidence.personal.reconciledIdentityByExerciseId?.get(requestedValue) || null;
    if (personalIdentity?.publicIdentityCollision) {
      return { status: "unresolved", exerciseId: requestedValue, reason: "personal_public_identity_collision" };
    }
    if (publicExerciseIds.length > 1) return { status: "unresolved", reason: "ambiguous_public_exercise_identity" };
    if (personalIdentity?.invalid) {
      return { status: "unresolved", exerciseId: requestedValue, reason: "invalid_reconciled_identity" };
    }
    if (personalIdentity?.researchExerciseId) {
      return {
        status: "resolved",
        exerciseId: personalIdentity.researchExerciseId,
        source: `personal_${personalIdentity.researchIdentitySource || "reconciled_crosswalk"}`
      };
    }
    if (personalIdentity) {
      return { status: "unresolved", exerciseId: requestedValue, reason: "unknown_exercise_identity" };
    }
    if (publicExerciseIds.length !== 1) return { status: "unresolved", reason: "unknown_exercise_identity" };
    const researchExerciseId = publicExerciseIds[0];
    if (!evidence.research.exerciseById.has(researchExerciseId)) {
      return { status: "unresolved", reason: "unknown_exercise_identity" };
    }
    const surfaces = evidence.research.publicIdentitySurfacesByExercise.get(normalizedValue)?.get(researchExerciseId) || [];
    const source = requestedValue === researchExerciseId && surfaces.includes("canonical_id")
      ? "canonical_research_id"
      : surfaces.includes("canonical_id")
        ? "normalized_canonical_research_id"
        : surfaces.includes("canonical_name")
          ? "canonical_research_name"
          : "research_alias";
    return { status: "resolved", exerciseId: researchExerciseId, source };
  }

  function createPrescriptionEngine(input = {}) {
    const evidence = input?.personal && input?.research && input?.versions
      ? normalizeEvidenceBundle(input)
      : normalizeEvidenceBundle(input);
    return Object.freeze({
      evidence,
      resolveExerciseIdentity(value) {
        return resolveCanonicalExerciseIdentity(evidence, value);
      }
    });
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

  function validateManualOverrideLineage(snapshot, prescriptionSchemaVersion) {
    if (!Array.isArray(snapshot.manualOverrides)) throw new Error("Invalid historical manual override lineage; manualOverrides must be an array.");
    if (!snapshot.manualOverrides.length) {
      if (snapshot.overrideLocked !== false || snapshot.finalPrescription?.manualOverride) {
        throw new Error("Invalid historical manual override lineage; an empty history cannot retain an override lock or final override marker.");
      }
      return true;
    }
    if (snapshot.overrideLocked !== true) throw new Error("Invalid historical manual override lineage; a non-empty history must remain locked for the workout.");
    const overrideIds = new Set();
    snapshot.manualOverrides.forEach((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Invalid historical manual override lineage; entry ${index} must be an object.`);
      const required = ["overrideId", "createdAt", "actor", "reason", "changes", "previousFinalPrescription"];
      const missing = required.filter((field) => !Object.prototype.hasOwnProperty.call(entry, field) || entry[field] === undefined);
      if (missing.length) throw new Error(`Invalid historical manual override lineage; entry ${index} is missing ${missing.join(", ")}.`);
      if ([entry.overrideId, entry.createdAt, entry.actor, entry.reason].some((value) => typeof value !== "string" || !value.trim())) {
        throw new Error(`Invalid historical manual override lineage; entry ${index} has incomplete audit provenance.`);
      }
      if (overrideIds.has(entry.overrideId)) throw new Error(`Invalid historical manual override lineage; duplicate overrideId ${entry.overrideId}.`);
      overrideIds.add(entry.overrideId);
      if (!entry.changes || typeof entry.changes !== "object" || Array.isArray(entry.changes) || !Object.keys(entry.changes).length) {
        throw new Error(`Invalid historical manual override lineage; entry ${index} has no recorded changes.`);
      }
      if (!entry.previousFinalPrescription || entry.previousFinalPrescription.schemaVersion !== prescriptionSchemaVersion) {
        throw new Error(`Invalid historical manual override lineage; entry ${index} does not preserve its ${prescriptionSchemaVersion} prior prescription.`);
      }
      if (snapshot.schemaVersion === CURRENT_SNAPSHOT_SCHEMA_VERSION
        && !Object.prototype.hasOwnProperty.call(entry, "workoutId")) {
        throw new Error(`Invalid historical manual override lineage; entry ${index} is missing workoutId.`);
      }
    });
    const finalOverrideId = snapshot.finalPrescription?.manualOverride?.overrideId;
    if ((snapshot.schemaVersion === CURRENT_SNAPSHOT_SCHEMA_VERSION && !finalOverrideId)
      || (finalOverrideId && finalOverrideId !== snapshot.manualOverrides.at(-1).overrideId)) {
      throw new Error("Invalid historical manual override lineage; final override identity does not match the append-only audit tail.");
    }
    return true;
  }

  function validateSnapshot(snapshot) {
    const required = [
      "recommendationId",
      "schemaVersion",
      "recommendationVersion",
      "engineVersion",
      "personalDataVersion",
      "researchDatabaseVersion",
      "basePrescription",
      "finalPrescription",
      "createdAt",
      "manualOverrides",
      "overrideLocked"
    ];
    const missing = required.filter((field) => snapshot?.[field] === undefined || snapshot?.[field] === null);
    if (missing.length) throw new Error(`Invalid recommendation snapshot; missing ${missing.join(", ")}.`);
    const expectedPrescriptionVersion = SNAPSHOT_SCHEMA_PAIRS[snapshot.schemaVersion];
    if (!expectedPrescriptionVersion) {
      throw new Error(`Unsupported recommendation snapshot schemaVersion ${snapshot.schemaVersion}; supported versions are ${Object.keys(SNAPSHOT_SCHEMA_PAIRS).join(", ")}.`);
    }
    if (snapshot.recommendationVersion !== expectedPrescriptionVersion) {
      throw new Error(`Invalid recommendation snapshot version pair; ${snapshot.schemaVersion} requires recommendationVersion ${expectedPrescriptionVersion}.`);
    }
    if (snapshot.checksum === undefined || snapshot.checksum === null) {
      if (snapshot.schemaVersion !== "1.0.0") throw new Error("Invalid recommendation snapshot; missing checksum.");
    } else {
      const pattern = snapshot.schemaVersion === "1.0.0" ? /^[0-9a-f]{8,128}$/ : SNAPSHOT_CHECKSUM_PATTERN;
      if (typeof snapshot.checksum !== "string" || !pattern.test(snapshot.checksum)) {
        throw new Error("Invalid recommendation snapshot checksum; expected a lowercase hexadecimal checksum in the historical format for this schema.");
      }
    }
    if (snapshot.schemaVersion === CURRENT_SNAPSHOT_SCHEMA_VERSION) {
      const standard = snapshot.standardGuideline;
      if (!standard || standard.schemaVersion !== "standard-guideline/1.0.0") {
        throw new Error("Invalid recommendation snapshot; current snapshots require a versioned standardGuideline.");
      }
      if (!["canonical_research_and_personal", "bounded_custom_profile"].includes(standard.source)) {
        throw new Error("Invalid recommendation snapshot standardGuideline source.");
      }
      if (!standard.workingSets || !standard.repRange || !standard.targetRpe || !standard.targetRir || !standard.restSeconds) {
        throw new Error("Invalid recommendation snapshot standardGuideline ranges.");
      }
      if (typeof standard.customExercise !== "boolean" || typeof standard.explanation !== "string" || !standard.explanation.trim()) {
        throw new Error("Invalid recommendation snapshot standardGuideline disclosure.");
      }
    }
    for (const field of ["basePrescription", "finalPrescription"]) {
      const prescription = snapshot[field];
      if (prescription?.schemaVersion !== expectedPrescriptionVersion) {
        throw new Error(`Invalid recommendation snapshot version pair; ${field} must use ${expectedPrescriptionVersion}.`);
      }
      if (expectedPrescriptionVersion === "2.0.0") {
        if (prescription.executionBlocked !== undefined && typeof prescription.executionBlocked !== "boolean") {
          throw new Error(`Invalid ${field}; legacy executionBlocked must be boolean when present.`);
        }
      } else if (typeof prescription.executionBlocked !== "boolean") {
        throw new Error(`Invalid ${field}; executionBlocked must be boolean.`);
      }
      if (expectedPrescriptionVersion === CURRENT_PRESCRIPTION_SCHEMA_VERSION) {
        const currentRequired = ["programmingContext", "historyResolution", "progressionConfirmation", "scientificProvenance"];
        const missingCurrent = currentRequired.filter((requiredField) => !prescription[requiredField]);
        if (missingCurrent.length) throw new Error(`Invalid ${field}; current prescriptions require ${currentRequired.join(", ")}.`);
        if (prescription.programmingContext.profileVersion !== TRAINING_PROFILE_VERSION) {
          throw new Error(`Invalid ${field}; current prescriptions require ${TRAINING_PROFILE_VERSION}.`);
        }
      }
    }
    const final = snapshot.finalPrescription;
    if (!RECOMMENDATION_TYPES.has(final.recommendationType)) throw new Error(`Invalid recommendation type ${final.recommendationType}.`);
    if (!SET_STRUCTURES.has(final.setStructure)) throw new Error(`Invalid set structure ${final.setStructure}.`);
    if (!ROLES.has(final.role)) throw new Error(`Invalid role ${final.role}.`);
    if (snapshot.exerciseId !== final.exerciseId) {
      throw new Error("Invalid recommendation snapshot identity binding; snapshot exerciseId must match the final prescription.");
    }
    if ((snapshot.mesocycleId ?? null) !== (final.mesocycleId ?? null)) {
      throw new Error("Invalid recommendation snapshot mesocycle binding; snapshot and final prescription must match.");
    }
    if (engineVersionAtLeast(snapshot.engineVersion, "3.1.3") && snapshot.explanation !== final.userExplanation) {
      throw new Error("Invalid recommendation snapshot explanation binding; the top-level explanation must match the final executable prescription.");
    }
    if (final.executionBlocked) {
      const restriction = final.safetyRestriction;
      if (!restriction
        || restriction.schemaVersion !== HARD_SAFETY_SCHEMA_VERSION
        || restriction.status !== "blocked"
        || !["exercise", "workout"].includes(restriction.scope)
        || !["pain", "illness"].includes(restriction.reason)
        || !String(restriction.resumeCriteria || "").trim()
        || !restriction.auditBaseTargets?.workingSets) {
        throw new Error("Invalid blocked prescription; versioned scope, reason, resume criteria, and base-target audit context are required.");
      }
      if ([final.workingSets?.min, final.workingSets?.target, final.workingSets?.max].some((value) => value !== 0)) {
        throw new Error("Invalid blocked prescription; executable working sets must all be zero.");
      }
      if (final.volume?.perExercise?.currentPrescribed !== 0
        || final.volume?.perExercise?.deload !== 0
        || final.volume?.perMusclePerSession?.target !== 0
        || final.volume?.perMusclePerWeek?.currentPrescribed !== 0) {
        throw new Error("Invalid blocked prescription; executable volume targets must all be zero.");
      }
      if (final.prescribedLoad || final.topSet || final.backoffSets) {
        throw new Error("Invalid blocked prescription; load, top-set, and back-off targets are forbidden.");
      }
    } else if (final.safetyRestriction) {
      const restriction = final.safetyRestriction;
      if (restriction.schemaVersion !== HARD_SAFETY_SCHEMA_VERSION
        || restriction.status !== "resolved_by_confirmed_substitute"
        || restriction.reason !== "pain"
        || restriction.painFreeConfirmed !== true
        || !restriction.substituteExerciseId
        || restriction.substituteExerciseId !== final.exerciseId
        || !restriction.substituteResearchExerciseId
        || restriction.substituteResearchExerciseId !== final.researchExerciseId
        || final.prescribedLoad) {
        throw new Error("Invalid resolved safety prescription; confirmed substitute identity and non-load state are required.");
      }
    }
    validateManualOverrideLineage(snapshot, expectedPrescriptionVersion);
    return true;
  }

  function verifySnapshotChecksum(snapshot) {
    validateSnapshot(snapshot);
    if (snapshot.checksum === undefined || snapshot.checksum === null) return true;
    const expected = stableHash({ ...snapshot, checksum: undefined });
    if (expected !== snapshot.checksum) {
      throw new Error("Recommendation snapshot checksum does not match; historical evidence may have been altered.");
    }
    return true;
  }

  function serializeRecommendationSnapshot(snapshot) {
    verifySnapshotChecksum(snapshot);
    return JSON.stringify(deepClone(snapshot));
  }

  function deserializeRecommendationSnapshot(serialized) {
    const snapshot = typeof serialized === "string" ? JSON.parse(serialized) : deepClone(serialized);
    verifySnapshotChecksum(snapshot);
    return snapshot;
  }

  return Object.freeze({
    ENGINE_VERSION,
    normalizeEvidenceBundle,
    createPrescriptionEngine,
    serializeRecommendationSnapshot,
    deserializeRecommendationSnapshot
  });
});
