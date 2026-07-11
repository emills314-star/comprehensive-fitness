# Schema and validation

The source model is validated before application import. Run `npm.cmd run research:build` and then `npm.cmd run research:validate`.

Validation checks include:

- exact column agreement and no unexpected fields;
- lowercase persistent IDs and uniqueness within every table;
- controlled confidence/evidence vocabularies;
- mapping-table foreign-key integrity;
- study-ID integrity for every recommendation and conclusion;
- prohibition on female-only evidence mappings;
- mixed-sex non-separable studies cannot be marked directly male-applicable;
- presence of CSV, JSON, JSON Schema, SQL, and XLSX artifacts;
- workbook sheet count and prohibition on merged cells.

Table JSON Schemas use JSON Schema draft 2020-12. `database.schema.json` validates the combined export. SQL DDL provides portable base tables; commented foreign-key statements are supplied because `ALTER TABLE` syntax differs across database engines.

Importers should treat null as unknown/not reported, not zero. Empty text is distinct from a numeric null. Pipe-delimited fields use `|`; use normalized relationship tables for frequent joins. Unknown controlled-vocabulary values must fail closed rather than be silently coerced.

Application behavior should also fail conservatively: when required progression inputs are missing, return `insufficient_data`; when evidence is low/very-low, expose the confidence and default; when pain or invalid technique is present, do not execute an automatic progression.

