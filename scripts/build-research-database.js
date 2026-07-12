"use strict";

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { VERSION, REVIEW_DATE, DELIMITER, controlledVocabularies, tableColumns, data } = require("../research_database/source/database");

const root = path.resolve(__dirname, "..", "research_database");
const csvDir = path.join(root, "exports", "csv");
const jsonDir = path.join(root, "exports", "json");
const schemaDir = path.join(root, "schema");
const workbookDir = path.join(root, "workbook");
[csvDir, jsonDir, schemaDir, workbookDir].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

const csvEscape = (value) => {
  if (value === null || value === undefined) return "";
  const string = typeof value === "boolean" ? String(value) : String(value);
  return /[",\r\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
};

const tableJsonSchemas = {};
const propertySchema = (table, field) => {
  const dictionary = data.definitions_data_dictionary.find((row) => row.field_name === field && row.used_in_tabs.split(DELIMITER).includes(table));
  const schema = {};
  if (dictionary?.data_type === "boolean") schema.type = "boolean";
  else if (dictionary?.data_type === "integer") schema.type = ["integer", "null"];
  else if (dictionary?.data_type === "decimal") schema.type = ["number", "null"];
  else schema.type = ["string", "null"];
  if (dictionary?.data_type === "date") schema.pattern = "^\\d{4}-\\d{2}-\\d{2}$";
  const vocabulary = controlledVocabularies[field] || (field === "male_applicability" ? controlledVocabularies.applicability : null);
  if (vocabulary) schema.enum = schema.type.includes?.("null") ? [...vocabulary, null] : vocabulary;
  if (/(^|_)id$/.test(field) && !field.endsWith("_ids")) schema.pattern = "^[a-z][a-z0-9_]*$";
  return schema;
};

for (const [table, rows] of Object.entries(data)) {
  const columns = tableColumns[table];
  if (!columns) throw new Error(`Missing columns for ${table}`);
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\r\n") + "\r\n";
  fs.writeFileSync(path.join(csvDir, `${table}.csv`), csv, "utf8");
  fs.writeFileSync(path.join(jsonDir, `${table}.json`), JSON.stringify(rows, null, 2) + "\n", "utf8");
  tableJsonSchemas[table] = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://comprehensive-fitness.local/schema/${VERSION}/${table}.schema.json`,
    title: table,
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: columns,
      properties: Object.fromEntries(columns.map((field) => [field, propertySchema(table, field)]))
    }
  };
  fs.writeFileSync(path.join(schemaDir, `${table}.schema.json`), JSON.stringify(tableJsonSchemas[table], null, 2) + "\n", "utf8");
}

const manifest = {
  database_name: "male_resistance_training_evidence_database",
  database_version: VERSION,
  last_reviewed_date: REVIEW_DATE,
  population_scope: "resistance-trained and resistance-training-eligible males",
  source_of_truth: "research_database/source/database.js",
  multi_value_delimiter: DELIMITER,
  tables: Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, { record_count: rows.length, primary_id_field: tableColumns[name].find((field) => /(^|_)id$/.test(field)) || null }])),
  controlled_vocabularies: controlledVocabularies,
  caveat: "Operational ranges are not individualized medical advice and low-confidence values are not proven physiological thresholds."
};
fs.writeFileSync(path.join(jsonDir, "database.json"), JSON.stringify({ manifest, tables: data }, null, 2) + "\n", "utf8");
fs.writeFileSync(path.join(jsonDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
fs.writeFileSync(path.join(schemaDir, "database.schema.json"), JSON.stringify({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Male resistance training evidence database",
  type: "object",
  required: ["manifest", "tables"],
  properties: {
    manifest: { type: "object" },
    tables: { type: "object", required: Object.keys(data), properties: Object.fromEntries(Object.keys(data).map((name) => [name, tableJsonSchemas[name]])) }
  }
}, null, 2) + "\n", "utf8");

const sqlType = (field) => {
  const dictionary = data.definitions_data_dictionary.find((row) => row.field_name === field);
  if (dictionary?.data_type === "boolean") return "BOOLEAN";
  if (dictionary?.data_type === "integer") return "INTEGER";
  if (dictionary?.data_type === "decimal") return "REAL";
  if (dictionary?.data_type === "date") return "DATE";
  return "TEXT";
};
const sql = ["-- Generated schema for male resistance-training evidence database v" + VERSION, "-- Pipe-delimited list fields have normalized mapping-table equivalents where relationships are frequently queried.", ""];
for (const [table, columns] of Object.entries(tableColumns)) {
  const id = columns.find((field) => /(^|_)id$/.test(field));
  sql.push(`CREATE TABLE ${table} (`);
  sql.push(columns.map((field) => `  ${field} ${sqlType(field)}${field === id ? " PRIMARY KEY" : ""}`).join(",\n"));
  sql.push(");\n");
}
const fks = [
  ["exercise_muscle_map", "exercise_id", "exercise_database", "exercise_id"], ["exercise_muscle_map", "muscle_group_id", "muscle_group_recommendations", "muscle_group_id"],
  ["exercise_taxonomy_review_queue", "exercise_id", "exercise_database", "exercise_id"],
  ["exercise_substitution_map", "exercise_id", "exercise_database", "exercise_id"], ["exercise_substitution_map", "substitute_exercise_id", "exercise_database", "exercise_id"],
  ["study_conclusion_map", "study_id", "research_library", "study_id"], ["study_conclusion_map", "conclusion_id", "evidence_conclusions", "conclusion_id"],
  ["study_exercise_map", "study_id", "research_library", "study_id"], ["study_exercise_map", "exercise_id", "exercise_database", "exercise_id"],
  ["study_muscle_group_map", "study_id", "research_library", "study_id"], ["study_muscle_group_map", "muscle_group_id", "muscle_group_recommendations", "muscle_group_id"],
  ["rule_exercise_map", "rule_id", "progression_rules", "rule_id"], ["rule_exercise_map", "exercise_id", "exercise_database", "exercise_id"],
  ["rule_muscle_group_map", "rule_id", "progression_rules", "rule_id"], ["rule_muscle_group_map", "muscle_group_id", "muscle_group_recommendations", "muscle_group_id"],
  ["exercise_progression_metric_map", "exercise_id", "exercise_database", "exercise_id"]
];
sql.push("-- Add these foreign keys in engines that support ALTER TABLE ADD CONSTRAINT:");
fks.forEach(([table, field, refTable, refField]) => sql.push(`-- ALTER TABLE ${table} ADD FOREIGN KEY (${field}) REFERENCES ${refTable}(${refField});`));
fs.writeFileSync(path.join(schemaDir, "relational_schema.sql"), sql.join("\n") + "\n", "utf8");

const bibliography = [
  "# Bibliography",
  "",
  `Database version ${VERSION}; reviewed ${REVIEW_DATE}. IDs are persistent and correspond to the research library. Links resolve through DOI.org when a DOI is available.`,
  "",
  ...data.research_library.map((study) => `- **${study.study_id}** — ${study.full_citation}${study.male_applicability === "excluded" ? " *(excluded from male recommendation mappings)*" : ""}`)
];
fs.writeFileSync(path.join(root, "BIBLIOGRAPHY.md"), bibliography.join("\n") + "\n", "utf8");

const workbook = new ExcelJS.Workbook();
workbook.creator = "Comprehensive Fitness research database builder";
workbook.created = new Date(`${REVIEW_DATE}T00:00:00Z`);
workbook.modified = workbook.created;
workbook.subject = "Male-specific resistance training evidence database";
workbook.title = `Male Exercise Science Database v${VERSION}`;
const sheetNames = {
  executive_summary: "01 Executive Summary", research_library: "02 Research Library", evidence_conclusions: "03 Evidence Conclusions",
  muscle_group_recommendations: "04 Muscle Groups", exercise_database: "05 Exercises", progression_rules: "06 Progression Rules",
  nutrition_strategies: "07 Diet Recomp Bulk", evidence_gaps: "08 Evidence Gaps", definitions_data_dictionary: "09 Data Dictionary",
  change_log: "10 Change Log", exercise_muscle_map: "Map Exercise Muscle", exercise_taxonomy_review_queue: "Taxonomy Review Queue", exercise_substitution_map: "Map Substitutions",
  study_conclusion_map: "Map Study Conclusion", study_exercise_map: "Map Study Exercise", study_muscle_group_map: "Map Study Muscle",
  rule_exercise_map: "Map Rule Exercise", rule_muscle_group_map: "Map Rule Muscle", exercise_progression_metric_map: "Map Exercise Metrics"
};
for (const [table, rows] of Object.entries(data)) {
  const columns = tableColumns[table];
  const sheet = workbook.addWorksheet(sheetNames[table], { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((header) => ({ header, key: header, width: Math.min(60, Math.max(12, header.length + 2)) }));
  rows.forEach((row) => sheet.addRow(columns.map((column) => row[column] ?? null)));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: columns.length } };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.getRow(1).height = 32;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true };
  });
  sheet.eachColumnKey = undefined;
}
const workbookPath = path.join(workbookDir, `male_exercise_science_database_v${VERSION}.xlsx`);
workbook.xlsx.writeFile(workbookPath).then(() => {
  console.log(JSON.stringify({ version: VERSION, workbook: workbookPath, tables: Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length])) }, null, 2));
}).catch((error) => { console.error(error); process.exitCode = 1; });
