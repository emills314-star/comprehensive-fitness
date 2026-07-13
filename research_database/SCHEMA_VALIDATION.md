# Schema and validation

The source model is validated before application import. Run `npm.cmd run research:build` and then `npm.cmd run research:validate`.

Validation checks include:

- exact column agreement and no unexpected fields;
- lowercase persistent IDs and uniqueness within every table;
- controlled confidence/evidence vocabularies;
- canonical DOI syntax plus unique, format-checked PubMed and PubMed Central identifiers;
- mapping-table foreign-key integrity;
- study-ID integrity for every recommendation and conclusion;
- progression-rule conclusion integrity and study/conclusion citation overlap;
- rule-authority, enforcement-level, hard-blocker allowlist, and product-policy disclosure checks;
- prohibition on female-only evidence mappings;
- mixed-sex non-separable studies cannot be marked directly male-applicable;
- presence of CSV, JSON, JSON Schema, SQL, and XLSX artifacts;
- workbook sheet count and prohibition on merged cells;
- deterministic current-version archive bytes across checkout line-ending modes; and
- deterministic workbook cells, ZIP entry order, timestamps, and metadata.

Table JSON Schemas use JSON Schema draft 2020-12. `database.schema.json` validates the combined export. SQL DDL provides portable base tables; commented foreign-key statements are supplied because `ALTER TABLE` syntax differs across database engines.

Importers should treat null as unknown/not reported, not zero. Empty text is distinct from a numeric null. Pipe-delimited fields use `|`; use normalized relationship tables for frequent joins. Unknown controlled-vocabulary values must fail closed rather than be silently coerced.

Application behavior should also fail conservatively: when required progression inputs are missing, return `insufficient_data`; when evidence is low/very-low, expose the confidence and default; when pain or invalid technique is present, do not execute an automatic progression.

Version 3.0.0 is a breaking public-schema revision. `research_library` adds required `pubmed_id` and `pmc_id` string fields (empty means no verified identifier). `progression_rules` adds required `supporting_conclusion_ids`, `rule_authority`, `enforcement_level`, and `policy_disclosure`. Consumers should reject a rule import that removes these semantics or cites no conclusion with overlapping study evidence.

The current-version artifact contract contains 19 CSV, 21 JSON, 21 schema/SQL, one validation-report, and one 3.0.0 XLSX artifact. Run `node scripts/test-research-archive-integrity.js` and `node scripts/test-research-workbook-determinism.js` after the build/validator when changing source data, generators, schemas, or line-ending policy. Historical versioned workbooks are retained but are not counted as current 3.0.0 outputs.
