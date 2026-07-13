# Male Exercise Science Research Database

Version 3.0.0 is a structured, male-scoped evidence and application database for resistance training, hypertrophy, progression, dieting, recomposition, maintenance, and intentional weight gain. The canonical source is `source/database.js`; generated CSV, JSON, XLSX, SQL, and JSON Schema files must not be edited by hand.

## Important scope statement

This is an evidence-informed application database, not a medical device and not a completed formal systematic review of every question. It prioritizes male-only evidence and labels mixed-sex evidence as indirect unless male outcomes are separable. Missing male counts are stored as `null`, never guessed. Female-only evidence is excluded from recommendation mappings; excluded negative-control rows demonstrate that validation rule.

Muscle-volume thresholds, fractional set credit, plateau windows, deload triggers, and exercise-specific rep bands frequently require practical inference. These records are deliberately low-confidence where direct evidence is absent. A numerical default is an operational input for an application, not proof of a biological threshold.

Version 3.0.0 adds verified PubMed and PubMed Central identifiers, rule-to-conclusion traceability, and explicit authority and enforcement semantics. Numerical prescription rules are advisory `product_policy` unless supported as an allowlisted deterministic safety blocker. The pain rule is immediate and hard-blocking; it stops the painful movement and permits only an explicit safe, pain-free substitution path. The evidence database does not diagnose or treat injury.

## Package layout

- `workbook/`: human-readable XLSX with the 10 requested core tabs plus normalized relationship tabs.
- `exports/csv/`: one UTF-8 CSV per table.
- `exports/json/`: one JSON file per table, a manifest, and a complete database export.
- `schema/`: table-level JSON Schemas, complete database schema, and relational SQL DDL.
- `validation/`: generated referential and content-integrity report.
- `METHODOLOGY.md`: search, inclusion, extraction, grading, and update method.
- `EXECUTIVE_SUMMARY.md`: written practical summary with evidence IDs.
- `SCHEMA_VALIDATION.md`: validation and import instructions.
- `BIBLIOGRAPHY.md`: persistent DOI bibliography.
- `EXERCISE_MUSCLE_TAXONOMY.md`: authoritative relationship categories, evidence rules, versioning, review queue, and historical recalculation contract.

## Build and validate

```powershell
npm.cmd run research:build
npm.cmd run research:validate
```

Multiple values in denormalized display fields use the pipe character (`|`). Frequently queried relationships are also supplied as normalized mapping tables. Dates use `YYYY-MM-DD`; booleans are true/false; RIR is numeric; rest is seconds; protein and fat are grams per kilogram per day; weight-change rates are percent body weight per week.

Every progression rule must cite at least one conclusion and at least one overlapping study. Importers must preserve `rule_authority`, `enforcement_level`, and `policy_disclosure`; dropping these fields can turn a configurable heuristic into a misleading scientific or safety claim.

## Import guidance

Import `exports/json/database.json` for document-oriented applications. Import CSV tables plus `schema/relational_schema.sql` for a relational database. Use mapping tables rather than parsing pipe-delimited fields for study, exercise, muscle, rule, substitution, and progression-metric relationships.
