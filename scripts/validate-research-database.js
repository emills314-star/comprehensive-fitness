"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const { VERSION, DELIMITER, controlledVocabularies, tableColumns, data } = require("../research_database/source/database");
const {
  CANONICAL_TO_PROGRAMMING_FAMILY,
  programmingFamilyForMuscle
} = require("../research_database/source/exercise-muscle-taxonomy");

const errors = [];
const warnings = [];
const root = path.resolve(__dirname, "..", "research_database");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const idSets = {};
const primaryId = {};
for (const [table, rows] of Object.entries(data)) {
  const columns = tableColumns[table];
  if (!columns) { errors.push(`${table}: missing column definition`); continue; }
  const id = columns.find((field) => /(^|_)id$/.test(field));
  primaryId[table] = id;
  idSets[table] = new Set();
  rows.forEach((row, index) => {
    const extras = Object.keys(row).filter((field) => !columns.includes(field));
    const missing = columns.filter((field) => !(field in row));
    if (extras.length) errors.push(`${table}[${index}]: extra fields ${extras.join(",")}`);
    if (missing.length) errors.push(`${table}[${index}]: missing fields ${missing.join(",")}`);
    if (id) {
      if (!/^[a-z][a-z0-9_]*$/.test(String(row[id] || ""))) errors.push(`${table}[${index}]: invalid ${id}`);
      if (idSets[table].has(row[id])) errors.push(`${table}: duplicate ${id} ${row[id]}`);
      idSets[table].add(row[id]);
    }
    ["confidence_rating", "evidence_strength"].forEach((field) => {
      if (field in row && !controlledVocabularies[field].includes(row[field])) errors.push(`${table}[${index}]: invalid ${field} ${row[field]}`);
    });
    for (const [field, vocabulary] of Object.entries(controlledVocabularies)) {
      if (field in row && row[field] !== null && !vocabulary.includes(row[field])) errors.push(`${table}[${index}]: ${field} is outside controlled vocabulary (${row[field]})`);
    }
    Object.entries(row).forEach(([field, value]) => {
      if (/(^date_|_date$)/.test(field) && value && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) errors.push(`${table}[${index}]: invalid ISO date in ${field}`);
      if (typeof value === "number" && !Number.isFinite(value)) errors.push(`${table}[${index}]: non-finite number in ${field}`);
    });
    if (table === "progression_rules") {
      try { JSON.parse(row.condition_logic); } catch { errors.push(`${table}[${index}]: condition_logic is not valid JSON`); }
    }
  });
}

const refs = [
  ["exercise_muscle_map", "exercise_id", "exercise_database"], ["exercise_muscle_map", "muscle_group_id", "muscle_group_recommendations"],
  ["exercise_substitution_map", "exercise_id", "exercise_database"], ["exercise_substitution_map", "substitute_exercise_id", "exercise_database"],
  ["study_conclusion_map", "study_id", "research_library"], ["study_conclusion_map", "conclusion_id", "evidence_conclusions"],
  ["study_exercise_map", "study_id", "research_library"], ["study_exercise_map", "exercise_id", "exercise_database"],
  ["study_muscle_group_map", "study_id", "research_library"], ["study_muscle_group_map", "muscle_group_id", "muscle_group_recommendations"],
  ["rule_exercise_map", "rule_id", "progression_rules"], ["rule_exercise_map", "exercise_id", "exercise_database"],
  ["rule_muscle_group_map", "rule_id", "progression_rules"], ["rule_muscle_group_map", "muscle_group_id", "muscle_group_recommendations"],
  ["exercise_progression_metric_map", "exercise_id", "exercise_database"]
];
refs.forEach(([table, field, target]) => data[table].forEach((row) => { if (!idSets[target].has(row[field])) errors.push(`${table}.${field}: broken reference ${row[field]}`); }));

const studies = idSets.research_library;
for (const [table, rows] of Object.entries(data)) rows.forEach((row, index) => Object.entries(row).forEach(([field, value]) => {
  if (field === "supporting_study_ids" || field === "conflicting_study_ids") String(value || "").split(DELIMITER).filter(Boolean).forEach((studyId) => { if (!studies.has(studyId)) errors.push(`${table}[${index}].${field}: ${studyId} missing`); });
}));

const femaleOnly = data.research_library.filter((row) => row.male_sample_size === 0).map((row) => row.study_id);
for (const studyId of femaleOnly) if (data.study_conclusion_map.some((row) => row.study_id === studyId)) errors.push(`Female-only ${studyId} mapped to a conclusion`);
data.research_library.forEach((row) => {
  if (row.mixed_sex_sample && !row.male_results_reported_separately && row.male_applicability === "direct") errors.push(`${row.study_id}: mixed non-separable sample marked direct`);
  if (row.male_sample_size === null) warnings.push(`${row.study_id}: male sample size unavailable and intentionally null`);
});

const dois = new Map();
data.research_library.filter((row) => row.doi).forEach((row) => {
  if (dois.has(row.doi)) errors.push(`Duplicate DOI ${row.doi} in ${dois.get(row.doi)} and ${row.study_id}`);
  dois.set(row.doi, row.study_id);
});
data.evidence_conclusions.forEach((row) => { if (!row.supporting_study_ids) errors.push(`${row.conclusion_id}: conclusion lacks supporting study IDs`); });
const requiredMuscles = ["chest","upper_back","lats","traps","front_delts","side_delts","rear_delts","biceps","triceps","forearms","spinal_erectors","abdominals","obliques","glutes","quadriceps","hamstrings","adductors","abductors","calves","neck_musculature"];
const presentMuscles = new Set(data.muscle_group_recommendations.map((row) => row.muscle_group));
requiredMuscles.forEach((muscle) => { if (!presentMuscles.has(muscle)) errors.push(`Required muscle group missing: ${muscle}`); });
const canonicalIds = new Set(Object.keys(CANONICAL_TO_PROGRAMMING_FAMILY));
const databaseMuscleIds = new Set(data.muscle_group_recommendations.map((row) => row.muscle_group_id));
[...canonicalIds].filter((id) => !databaseMuscleIds.has(id)).forEach((id) => errors.push(`Canonical taxonomy ID missing from database: ${id}`));
[...databaseMuscleIds].filter((id) => !canonicalIds.has(id)).forEach((id) => errors.push(`Database muscle ID lacks a programming-family projection: ${id}`));
data.muscle_group_recommendations.forEach((row) => {
  const expected = programmingFamilyForMuscle(row.muscle_group_id);
  if (row.programming_family_id !== expected) errors.push(`${row.muscle_group_id}: programming_family_id ${row.programming_family_id} should be ${expected}`);
});
data.exercise_muscle_map.forEach((row) => {
  const expected = programmingFamilyForMuscle(row.muscle_group_id);
  if (row.programming_family_id !== expected) errors.push(`${row.exercise_muscle_map_id}: programming_family_id ${row.programming_family_id} should be ${expected}`);
});
const exercisesById = new Map(data.exercise_database.map((row) => [row.exercise_id, row]));
data.muscle_group_recommendations.forEach((row) => String(row.effective_exercises || "").split(DELIMITER).filter(Boolean).forEach((exerciseId) => {
  if (!exercisesById.has(exerciseId)) errors.push(`${row.muscle_group_id}: effective exercise does not exist: ${exerciseId}`);
}));
data.exercise_database.forEach((row) => {
  [row.primary_muscles, row.secondary_muscles].flatMap((value) => String(value || "").split(DELIMITER)).filter(Boolean).forEach((muscleId) => {
    if (!databaseMuscleIds.has(muscleId)) errors.push(`${row.exercise_id}: referenced muscle does not exist: ${muscleId}`);
  });
});
const normalizedExerciseNames = new Map();
const normalizeExerciseName = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
data.exercise_database.forEach((row) => [row.exercise_name, ...String(row.exercise_aliases || "").split(DELIMITER)].filter(Boolean).forEach((name) => {
  const normalized = normalizeExerciseName(name);
  const existing = normalizedExerciseNames.get(normalized);
  if (existing && existing !== row.exercise_id) errors.push(`Exercise name/alias collision: ${name} maps to ${existing} and ${row.exercise_id}`);
  normalizedExerciseNames.set(normalized, row.exercise_id);
}));
const mappedExercises = new Set(data.exercise_muscle_map.map((row) => row.exercise_id));
data.exercise_database.forEach((row) => { if (!mappedExercises.has(row.exercise_id)) errors.push(`${row.exercise_id}: exercise has no taxonomy relationships`); });
const relationshipKeys = new Set();
data.exercise_muscle_map.forEach((row) => {
  const key = `${row.exercise_id}|${row.muscle_group_id}`;
  if (relationshipKeys.has(key)) errors.push(`Duplicate exercise/muscle relationship: ${key}`);
  relationshipKeys.add(key);
});
const woodchop = data.exercise_muscle_map.find((row) => row.exercise_id === "ex_cable_woodchop" && row.muscle_group_id === "mg_obliques");
if (!woodchop || woodchop.relationship_type !== "direct_load" || Number(woodchop.fractional_set_credit) !== 1) errors.push("Cable woodchop must provide direct dynamic oblique loading.");
const dictionaryFields = new Set(data.definitions_data_dictionary.map((row) => row.field_name));
Object.values(tableColumns).flat().forEach((field) => { if (!dictionaryFields.has(field)) errors.push(`Data dictionary missing ${field}`); });
for (const [table, rows] of Object.entries(data)) {
  if (table === "definitions_data_dictionary") continue;
  for (const field of tableColumns[table]) {
    const definition = data.definitions_data_dictionary.find((row) => row.field_name === field && row.used_in_tabs.split(DELIMITER).includes(table));
    if (!definition) continue;
    rows.forEach((row, index) => {
      const value = row[field];
      if (value === null || value === undefined) return;
      if (definition.data_type === "boolean" && typeof value !== "boolean") errors.push(`${table}[${index}].${field}: expected boolean`);
      if (definition.data_type === "integer" && !(typeof value === "number" && Number.isInteger(value))) errors.push(`${table}[${index}].${field}: expected integer`);
      if (definition.data_type === "decimal" && typeof value !== "number") errors.push(`${table}[${index}].${field}: expected number`);
      if (["string","date","delimited_string"].includes(definition.data_type) && typeof value !== "string") errors.push(`${table}[${index}].${field}: expected string`);
    });
  }
}

const expectedFiles = Object.keys(data).flatMap((table) => [path.join(root,"exports","csv",`${table}.csv`), path.join(root,"exports","json",`${table}.json`), path.join(root,"schema",`${table}.schema.json`)]);
expectedFiles.forEach((file) => { if (!fs.existsSync(file)) errors.push(`Missing export ${file}`); });

async function finish() {
  const manifestPath = path.join(root, "exports", "json", "manifest.json");
  if (!fs.existsSync(manifestPath)) errors.push(`Missing manifest ${manifestPath}`);
  else {
    let manifest = null;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch (error) { errors.push(`Manifest is not valid JSON: ${error.message}`); }
    if (manifest) {
      if (manifest.database_version !== VERSION) errors.push(`Manifest version ${manifest.database_version} does not match source ${VERSION}`);
      for (const [table, rows] of Object.entries(data)) {
        const entry = manifest.tables?.[table];
        if (!entry) { errors.push(`Manifest lacks table ${table}`); continue; }
        if (entry.record_count !== rows.length) errors.push(`Manifest count for ${table} is ${entry.record_count}; expected ${rows.length}`);
        const files = {
          csv_sha256: path.join(root, "exports", "csv", `${table}.csv`),
          json_sha256: path.join(root, "exports", "json", `${table}.json`),
          schema_sha256: path.join(root, "schema", `${table}.schema.json`)
        };
        for (const [field, file] of Object.entries(files)) {
          if (!/^[a-f0-9]{64}$/.test(String(entry[field] || ""))) errors.push(`Manifest ${table}.${field} is missing or invalid`);
          else if (fs.existsSync(file) && sha256File(file) !== entry[field]) errors.push(`Manifest ${table}.${field} does not match ${file}`);
        }
      }
    }
  }
  const workbookPath = path.join(root, "workbook", `male_exercise_science_database_v${VERSION}.xlsx`);
  if (!fs.existsSync(workbookPath)) errors.push(`Missing workbook ${workbookPath}`);
  else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(workbookPath);
    if (workbook.worksheets.length !== Object.keys(data).length) errors.push(`Workbook has ${workbook.worksheets.length} sheets; expected ${Object.keys(data).length}`);
    workbook.worksheets.forEach((sheet) => { if (sheet.mergedCells && Object.keys(sheet.mergedCells).length) errors.push(`${sheet.name}: merged cells are prohibited`); });
  }
  const report = { database_version: VERSION, valid: errors.length === 0, errors, warning_count: warnings.length, warnings, record_counts: Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length])) };
  fs.mkdirSync(path.join(root, "validation"), { recursive: true });
  fs.writeFileSync(path.join(root, "validation", "validation_report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
}
finish().catch((error) => { console.error(error); process.exitCode = 1; });
