(function programmingFamilyLedgerUmd(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ComprehensiveFitnessProgrammingFamilyLedger = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function programmingFamilyLedgerFactory() {
  "use strict";

  const PROGRAMMING_FAMILY_VERSION = "programming-family/1.0.0";
  const HISTORICAL_LEDGER_VERSION = "historical-family-volume/1.0.0";
  const PERSONAL_MAPPING_VERSION = "personal-muscle-mapping/1.0.0";
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
  const RELATIONSHIP_PRIORITY = Object.freeze({ direct_load: 4, meaningful_fractional_load: 3, isometric_stabilizing_load: 2, minor_incidental_load: 1, unknown_insufficient_evidence: 0 });
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function programmingFamilyId(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!normalized) return "";
    const canonical = normalized.startsWith("mg_") ? normalized : `mg_${normalized}`;
    if (CANONICAL_TO_PROGRAMMING_FAMILY[canonical]) return CANONICAL_TO_PROGRAMMING_FAMILY[canonical];
    const family = PROGRAMMING_FAMILY_ALIASES[normalized] || normalized.replace(/^mg_/, "");
    if (PROGRAMMING_FAMILIES.includes(family)) return family;
    return normalized.startsWith("mg_") ? "" : family;
  }

  function normalizeRelationship(relationship = {}) {
    const canonicalMuscleGroupId = relationship.canonicalMuscleGroupId || relationship.muscleGroupId || relationship.muscle_group_id || "";
    // Canonical taxonomy ownership is authoritative; a conflicting supplied family cannot redirect it.
    const canonicalFamily = CANONICAL_TO_PROGRAMMING_FAMILY[String(canonicalMuscleGroupId).trim().toLowerCase()];
    const family = canonicalFamily || programmingFamilyId(relationship.programmingFamilyId || relationship.programming_family_id || canonicalMuscleGroupId);
    if (!family) return null;
    const relationshipType = relationship.relationshipType || relationship.relationship_type || "unknown_insufficient_evidence";
    const rawCredit = relationship.setContribution ?? relationship.set_contribution ?? relationship.fractional_set_credit;
    const setContribution = relationshipType === "direct_load" ? 1 : relationshipType === "meaningful_fractional_load" ? Math.max(0, number(rawCredit)) : 0;
    const defaultFatigue = relationshipType === "direct_load" ? 1 : relationshipType === "meaningful_fractional_load" ? Math.max(0.5, setContribution) : relationshipType === "isometric_stabilizing_load" ? 0.5 : 0;
    const localFatigueWeight = Math.max(0, number(relationship.localFatigueWeight ?? relationship.local_fatigue_weight, defaultFatigue));
    const taxonomyVersion = String(relationship.taxonomyVersion ?? relationship.taxonomy_version ?? "").trim() || null;
    const relationshipSource = taxonomyVersion ? "taxonomy" : String(relationship.relationshipSource ?? relationship.relationship_source ?? "").trim() || "unknown";
    const mappingVersion = String(relationship.mappingVersion ?? relationship.mapping_version ?? "").trim() || null;
    return { ...relationship, canonicalMuscleGroupId, programmingFamilyId: family, relationshipType, setContribution, localFatigueWeight, taxonomyVersion, relationshipSource, mappingVersion };
  }

  function coalesceRelationshipsByProgrammingFamily(relationships) {
    const families = new Map();
    (relationships || []).map(normalizeRelationship).filter(Boolean).forEach((relationship) => {
      const current = families.get(relationship.programmingFamilyId) || { programmingFamilyId: relationship.programmingFamilyId, selected: null, localFatigueWeight: 0, isometricFatigueWeight: 0, canonicalMuscleGroupIds: new Set(), relationships: [] };
      current.localFatigueWeight += relationship.localFatigueWeight;
      if (relationship.relationshipType === "isometric_stabilizing_load") current.isometricFatigueWeight += relationship.localFatigueWeight;
      if (relationship.canonicalMuscleGroupId) current.canonicalMuscleGroupIds.add(relationship.canonicalMuscleGroupId);
      current.relationships.push(relationship);
      const selected = current.selected;
      const candidateDirect = relationship.relationshipType === "direct_load";
      const selectedDirect = selected?.relationshipType === "direct_load";
      if (!selected || (candidateDirect && !selectedDirect)
        || (candidateDirect === selectedDirect && relationship.setContribution > selected.setContribution)
        || (candidateDirect === selectedDirect && relationship.setContribution === selected.setContribution && (RELATIONSHIP_PRIORITY[relationship.relationshipType] || 0) > (RELATIONSHIP_PRIORITY[selected.relationshipType] || 0))) current.selected = relationship;
      families.set(relationship.programmingFamilyId, current);
    });
    return Array.from(families.values()).map((family) => ({
      muscleGroupId: family.programmingFamilyId,
      programmingFamilyId: family.programmingFamilyId,
      canonicalMuscleGroupIds: Array.from(family.canonicalMuscleGroupIds).sort(),
      relationshipType: family.selected?.relationshipType || "unknown_insufficient_evidence",
      setContribution: family.selected?.setContribution || 0,
      localFatigueWeight: family.localFatigueWeight,
      isometricFatigueWeight: family.isometricFatigueWeight,
      taxonomyVersion: family.selected?.taxonomyVersion || null,
      relationshipSource: family.selected?.relationshipSource || "unknown",
      mappingVersion: family.selected?.mappingVersion || null,
      relationshipCount: family.relationships.length
    }));
  }

  function projectHistoricalVolume(records = [], relationshipResolver = (record) => record?.muscleRelationships || []) {
    const sourceRecords = clone(records || []);
    const taxonomyVersions = new Set();
    const mappingVersions = new Set();
    const totals = new Map();
    let missingRelationshipProvenance = sourceRecords.length === 0;
    sourceRecords.forEach((record, index) => {
      const relationships = (relationshipResolver(record, index) || []).map(normalizeRelationship).filter(Boolean);
      if (!relationships.length) missingRelationshipProvenance = true;
      relationships.forEach((relationship) => {
        if (relationship.relationshipSource === "taxonomy" && relationship.taxonomyVersion) taxonomyVersions.add(relationship.taxonomyVersion);
        else if (relationship.relationshipSource === "personal_mapping" && relationship.mappingVersion === PERSONAL_MAPPING_VERSION) mappingVersions.add(relationship.mappingVersion);
        else missingRelationshipProvenance = true;
      });
      const workingSets = Math.max(0, number(record.workingSets, number(record.sets, 0)));
      coalesceRelationshipsByProgrammingFamily(relationships).forEach((relationship) => {
        const current = totals.get(relationship.programmingFamilyId) || { programmingFamilyId: relationship.programmingFamilyId, directSets: 0, fractionalSets: 0, weightedHypertrophySets: 0, isometricExposure: 0, localFatigueExposure: 0, canonicalMuscleGroupIds: new Set(), contributions: [] };
        const effectiveSets = workingSets * relationship.setContribution;
        if (relationship.relationshipType === "direct_load") current.directSets += effectiveSets;
        else if (relationship.relationshipType === "meaningful_fractional_load") current.fractionalSets += effectiveSets;
        current.weightedHypertrophySets += effectiveSets;
        current.isometricExposure += workingSets * relationship.isometricFatigueWeight;
        current.localFatigueExposure += workingSets * relationship.localFatigueWeight;
        relationship.canonicalMuscleGroupIds.forEach((id) => current.canonicalMuscleGroupIds.add(id));
        current.contributions.push({ recordIndex: index, workingSets, relationshipType: relationship.relationshipType, relationshipSource: relationship.relationshipSource, taxonomyVersion: relationship.taxonomyVersion, mappingVersion: relationship.mappingVersion, setContribution: relationship.setContribution, effectiveSets, localFatigueExposure: workingSets * relationship.localFatigueWeight, canonicalMuscleGroupIds: relationship.canonicalMuscleGroupIds });
        totals.set(relationship.programmingFamilyId, current);
      });
    });
    const taxonomyVersion = taxonomyVersions.size === 0 ? (mappingVersions.size ? "not_applicable" : "unknown") : missingRelationshipProvenance || taxonomyVersions.size > 1 ? "mixed" : [...taxonomyVersions][0];
    const projectionStatus = sourceRecords.length === 0 ? "empty" : !missingRelationshipProvenance && taxonomyVersions.size <= 1 && mappingVersions.size <= 1 ? "ready" : "blocked_unverifiable_provenance";
    const familyTotals = projectionStatus === "ready" ? [...totals.values()].sort((a, b) => a.programmingFamilyId.localeCompare(b.programmingFamilyId)).map((item) => ({
      ...item,
      canonicalMuscleGroupIds: [...item.canonicalMuscleGroupIds].sort(),
      directSets: round(item.directSets), fractionalSets: round(item.fractionalSets), weightedHypertrophySets: round(item.weightedHypertrophySets),
      isometricExposure: round(item.isometricExposure), localFatigueExposure: round(item.localFatigueExposure),
      contributions: item.contributions.map((entry) => ({ ...entry, effectiveSets: round(entry.effectiveSets), localFatigueExposure: round(entry.localFatigueExposure) }))
    })) : [];
    return {
      ledgerVersion: HISTORICAL_LEDGER_VERSION,
      programmingFamilyVersion: PROGRAMMING_FAMILY_VERSION,
      personalMappingVersion: mappingVersions.size === 1 ? [...mappingVersions][0] : mappingVersions.size > 1 ? "mixed" : "not_used",
      taxonomyVersion,
      projectionStatus,
      sourceRecords,
      familyTotals,
      rollbackContract: Object.freeze({ strategy: "recalculate_from_immutable_records", persistentMigrationRequired: false, sourceRecordsMutated: false })
    };
  }

  return Object.freeze({ PROGRAMMING_FAMILY_VERSION, HISTORICAL_LEDGER_VERSION, PERSONAL_MAPPING_VERSION, CANONICAL_TO_PROGRAMMING_FAMILY, programmingFamilyId, normalizeRelationship, coalesceRelationshipsByProgrammingFamily, projectHistoricalVolume });
});
