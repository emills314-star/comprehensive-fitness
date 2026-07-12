"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const fixture = readJson("scripts/fixtures/science-evidence-contract.v1.json");
const database = require(path.join(ROOT, "research_database/source/database"));
const { data, tableColumns, VERSION, DELIMITER } = database;

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ids = (value) => Array.isArray(value)
  ? value.filter(Boolean)
  : String(value || "").split(DELIMITER || "|").filter(Boolean);
const byId = (rows, field) => new Map(rows.map((row) => [row[field], row]));
const own = (object, field) => Object.prototype.hasOwnProperty.call(object, field);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function numericSuffix(value) {
  const match = String(value).match(/(\d+)$/);
  assert.ok(match, `Expected a numeric persistent-ID suffix: ${value}`);
  return Number(match[1]);
}

function assertFieldSurface(table, fields) {
  const schema = readJson(`research_database/schema/${table}.schema.json`);
  const exported = readJson(`research_database/exports/json/${table}.json`);
  const dictionary = data.definitions_data_dictionary;

  fields.forEach((field) => {
    assert.ok(tableColumns[table].includes(field), `${table} tableColumns must include ${field}`);
    assert.ok(schema.items.required.includes(field), `${table} schema must require ${field}`);
    assert.ok(schema.items.properties[field], `${table} schema must define ${field}`);
    const definition = dictionary.find((row) => row.field_name === field);
    assert.ok(definition, `definitions_data_dictionary must define ${field}`);
    assert.ok(ids(definition.used_in_tabs).includes(table), `${field} dictionary entry must name ${table}`);
    exported.forEach((row) => assert.ok(own(row, field), `${table} export ${row.study_id || row.rule_id} must contain ${field}`));
  });
}

function assertRequiredStudy(expected) {
  const study = data.research_library.find((row) => row.study_id === expected.study_id);
  assert.ok(study, `${expected.study_id} is required`);
  assert.equal(String(study.doi).toLowerCase(), expected.doi.toLowerCase(), `${expected.study_id}.doi`);
  assert.equal(study.pubmed_id, expected.pubmed_id, `${expected.study_id}.pubmed_id`);
  assert.equal(study.pmc_id, expected.pmc_id, `${expected.study_id}.pmc_id`);
  ["publication_year", "study_type", "male_sample_size", "total_sample_size", "male_applicability"].forEach((field) => {
    assert.equal(study[field], expected[field], `${expected.study_id}.${field}`);
  });
  assert.equal(study.male_only_sample, false, `${expected.study_id} must not be labeled male-only`);
  if (expected.male_sample_size !== null && expected.total_sample_size > expected.male_sample_size) {
    assert.equal(study.mixed_sex_sample, true, `${expected.study_id} must disclose its mixed-sex sample`);
    assert.equal(study.male_results_reported_separately, false, `${expected.study_id} must not imply separable male outcomes`);
  }
  const limitations = `${study.study_limitations || ""} ${study.reviewer_notes || ""}`;
  assert.match(limitations, new RegExp(expected.limitations_pattern, "i"), `${expected.study_id} must disclose population/directness limitations`);
}

fixture.required_studies.forEach((expected) => {
  test(`required public study ${expected.study_id}`, () => assertRequiredStudy(expected));
});

test("existing studies receive verified bibliographic identifiers", () => {
  Object.entries(fixture.existing_study_enrichments).forEach(([studyId, expected]) => {
    const study = data.research_library.find((row) => row.study_id === studyId);
    assert.ok(study, `${studyId} must remain present`);
    assert.equal(study.pubmed_id, expected.pubmed_id, `${studyId}.pubmed_id`);
    if (expected.publication_year !== undefined) {
      assert.equal(study.publication_year, expected.publication_year, `${studyId}.publication_year`);
    }
    if (expected.title_pattern) {
      assert.match(study.study_title, new RegExp(expected.title_pattern, "i"), `${studyId}.study_title`);
    }
    if (expected.notes_pattern) {
      assert.match(study.reviewer_notes, new RegExp(expected.notes_pattern, "i"), `${studyId}.reviewer_notes`);
    }
  });
});

test("identifier fields are present in source, dictionary, schema, and export", () => {
  assertFieldSurface("research_library", fixture.required_fields.research_library);
});

test("DOI, PMID, and PMCID values have valid unique formats", () => {
  const seen = { doi: new Set(), pubmed_id: new Set(), pmc_id: new Set() };
  data.research_library.forEach((study) => {
    assert.match(study.doi, /^10\.\d{4,9}\/\S+$/i, `${study.study_id}.doi must be a DOI, not a URL`);
    const doiKey = study.doi.toLowerCase();
    assert.ok(!seen.doi.has(doiKey), `Duplicate DOI: ${study.doi}`);
    seen.doi.add(doiKey);

    assert.equal(typeof study.pubmed_id, "string", `${study.study_id}.pubmed_id must be a string, including empty`);
    assert.match(study.pubmed_id, /^(?:\d{7,9})?$/, `${study.study_id}.pubmed_id format`);
    if (study.pubmed_id) {
      assert.ok(!seen.pubmed_id.has(study.pubmed_id), `Duplicate PMID: ${study.pubmed_id}`);
      seen.pubmed_id.add(study.pubmed_id);
    }

    assert.equal(typeof study.pmc_id, "string", `${study.study_id}.pmc_id must be a string, including empty`);
    assert.match(study.pmc_id, /^(?:PMC\d+)?$/, `${study.study_id}.pmc_id format`);
    if (study.pmc_id) {
      assert.ok(!seen.pmc_id.has(study.pmc_id), `Duplicate PMCID: ${study.pmc_id}`);
      seen.pmc_id.add(study.pmc_id);
    }
  });
});

const conclusionScopePatterns = {
  con_0028: /ACSM|position stand|overview|scope|broad|healthy adult/i,
  con_0029: /RIR|repetitions in reserve|proximity.to.failure/i,
  con_0030: /deload|training cessation/i,
  con_0031: /HRV|heart.rate.variability|readiness/i
};
const uncertaintyPattern = /uncertain|unknown|limited|insufficient|exploratory|not (?:a )?(?:validated|universal|direct)|does not establish|cannot establish|no validated/i;

fixture.required_conclusions.forEach((expected) => {
  test(`evidence conclusion ${expected.conclusion_id} states scope and uncertainty`, () => {
    const conclusion = data.evidence_conclusions.find((row) => row.conclusion_id === expected.conclusion_id);
    assert.ok(conclusion, `${expected.conclusion_id} is required`);
    assert.equal(conclusion.topic, expected.topic, `${expected.conclusion_id}.topic`);
    const cited = ids(conclusion.supporting_study_ids);
    expected.supporting_study_ids.forEach((studyId) => assert.ok(cited.includes(studyId), `${expected.conclusion_id} must cite ${studyId}`));
    assert.ok(conclusion.key_limitations, `${expected.conclusion_id}.key_limitations must be explicit`);
    assert.ok(conclusion.application_rule, `${expected.conclusion_id}.application_rule must be explicit`);
    const narrative = [
      conclusion.research_question,
      conclusion.male_population,
      conclusion.conclusion,
      conclusion.key_limitations,
      conclusion.application_rule
    ].join(" ");
    assert.match(narrative, conclusionScopePatterns[expected.conclusion_id], `${expected.conclusion_id} must name its scientific scope`);
    if (expected.conclusion_id !== "con_0028") {
      assert.match(narrative, uncertaintyPattern, `${expected.conclusion_id} must state uncertainty rather than a universal threshold`);
    }
    assert.doesNotMatch(narrative, /proves?|guarantees?|universally optimal|settled science/i, `${expected.conclusion_id} must not overclaim`);
  });
});

test("progression-rule traceability fields exist across every data surface", () => {
  assertFieldSurface("progression_rules", fixture.required_fields.progression_rules);
  const schema = readJson("research_database/schema/progression_rules.schema.json");
  fixture.field_values.rule_authority.forEach((value) => {
    assert.ok(schema.items.properties.rule_authority.enum.includes(value), `rule_authority schema must allow ${value}`);
  });
  fixture.field_values.enforcement_level.forEach((value) => {
    assert.ok(schema.items.properties.enforcement_level.enum.includes(value), `enforcement_level schema must allow ${value}`);
  });
});

test("every rule traces to valid conclusions and overlapping studies", () => {
  const studyIds = new Set(data.research_library.map((row) => row.study_id));
  const conclusionIds = new Set(data.evidence_conclusions.map((row) => row.conclusion_id));
  const conclusions = byId(data.evidence_conclusions, "conclusion_id");

  data.progression_rules.forEach((rule) => {
    const ruleStudies = ids(rule.supporting_study_ids);
    const ruleConclusions = ids(rule.supporting_conclusion_ids);
    assert.ok(ruleStudies.length > 0, `${rule.rule_id} must cite at least one study`);
    assert.ok(ruleConclusions.length > 0, `${rule.rule_id} must cite at least one conclusion`);
    ruleStudies.forEach((studyId) => assert.ok(studyIds.has(studyId), `${rule.rule_id} cites missing ${studyId}`));
    ruleConclusions.forEach((conclusionId) => assert.ok(conclusionIds.has(conclusionId), `${rule.rule_id} cites missing ${conclusionId}`));
    const conclusionStudies = new Set(ruleConclusions.flatMap((conclusionId) => ids(conclusions.get(conclusionId).supporting_study_ids)));
    assert.ok(ruleStudies.some((studyId) => conclusionStudies.has(studyId)), `${rule.rule_id} study citations must overlap its conclusion evidence`);
  });
});

test("female-only evidence is excluded from male conclusions", () => {
  const femaleOnly = data.research_library.filter((study) => study.male_sample_size === 0 || study.male_applicability === "excluded");
  assert.ok(femaleOnly.some((study) => study.study_id === "stu_0047"), "stu_0047 must be classified as female-only/excluded for male inference");
  const conclusionCitations = new Set(data.evidence_conclusions.flatMap((row) => ids(row.supporting_study_ids)));
  const mapped = new Set(data.study_conclusion_map.map((row) => row.study_id));
  femaleOnly.forEach((study) => {
    assert.equal(study.male_sample_size, 0, `${study.study_id} excluded population must disclose zero males`);
    assert.equal(study.male_applicability, "excluded", `${study.study_id} must be excluded from male applicability`);
    assert.ok(!conclusionCitations.has(study.study_id), `${study.study_id} cannot support a male conclusion`);
    assert.ok(!mapped.has(study.study_id), `${study.study_id} cannot appear in study_conclusion_map`);
  });
});

test("pain causes immediate stop and an explicit safe substitution path", () => {
  const rule = data.progression_rules.find((row) => row.rule_id === fixture.immediate_pain_rule_id);
  assert.ok(rule, `${fixture.immediate_pain_rule_id} is required`);
  assert.equal(rule.rule_authority, "safety", `${rule.rule_id}.rule_authority`);
  assert.equal(rule.enforcement_level, "hard_blocker", `${rule.rule_id}.enforcement_level`);
  assert.ok(ids(rule.required_inputs).includes("pain"), `${rule.rule_id} must require pain input`);
  assert.match(rule.condition_logic, /pain/i, `${rule.rule_id} condition must test pain`);
  assert.doesNotMatch(rule.condition_logic, /sessions|consecutive|weeks/i, `${rule.rule_id} must act immediately`);
  assert.ok(rule.minimum_sessions_required <= 1, `${rule.rule_id} must not wait for repeated sessions`);
  assert.match(rule.recommended_action, /stop|terminate|hold/i, `${rule.rule_id} must stop the painful movement`);
  assert.match(rule.recommended_action, /safe.*substitut|substitut.*(?:safe|pain.free)/i, `${rule.rule_id} must offer only an explicit safe/pain-free substitute`);

  const rotation = data.progression_rules.find((row) => row.rule_id === "rule_0013");
  assert.ok(rotation, "rule_0013 must remain present");
  assert.doesNotMatch(`${rotation.required_inputs} ${rotation.condition_logic} ${rotation.threshold_unit_1}`, /pain.sessions/i, "rule_0013 must not delay pain handling for multiple sessions");
});

test("only named safety domains may be hard blockers", () => {
  const allowed = new RegExp(fixture.allowed_hard_blocker_pattern, "i");
  const unrelated = /plateau|fatigue|soreness|sleep|readiness|RIR|repetition|rep.range|progression|volume|frequency|velocity|rest.interval|goal|preference/i;
  const hardBlockers = data.progression_rules.filter((rule) => rule.enforcement_level === "hard_blocker");
  assert.ok(hardBlockers.length > 0, "At least the immediate pain safety blocker must exist");
  hardBlockers.forEach((rule) => {
    const description = [rule.rule_name, rule.rule_category, rule.required_inputs, rule.condition_logic, rule.recommended_action, rule.notes].join(" ");
    assert.equal(rule.rule_authority, "safety", `${rule.rule_id} hard blocker must be safety-authoritative`);
    assert.match(description, allowed, `${rule.rule_id} is outside the hard-blocker allowlist`);
    assert.doesNotMatch(description, unrelated, `${rule.rule_id} mixes advisory thresholds into a hard blocker`);
  });
});

test("numeric heuristics remain transparent advisory product policy", () => {
  const disclosure = new RegExp(fixture.policy_disclosure_pattern, "i");
  fixture.policy_rule_ids.forEach((ruleId) => {
    const rule = data.progression_rules.find((row) => row.rule_id === ruleId);
    assert.ok(rule, `${ruleId} must remain present`);
    assert.equal(rule.rule_authority, "product_policy", `${ruleId}.rule_authority`);
    assert.equal(rule.enforcement_level, "advisory", `${ruleId}.enforcement_level`);
    assert.match(rule.policy_disclosure, disclosure, `${ruleId}.policy_disclosure must identify a configurable/non-universal product policy`);
    assert.match(rule.direct_or_inferred_rule, /inferred|product.policy/i, `${ruleId} must not present policy as direct science`);
    assert.doesNotMatch(`${rule.policy_disclosure} ${rule.notes}`, /proven|universal(?:ly)? optimal|settled science/i, `${ruleId} must not overclaim its threshold`);
  });

  data.progression_rules
    .filter((rule) => rule.enforcement_level !== "hard_blocker" && (rule.threshold_value_1 !== null || rule.threshold_value_2 !== null))
    .forEach((rule) => assert.equal(rule.enforcement_level, "advisory", `${rule.rule_id} numeric threshold must be advisory`));
});

test("science records use append-only ID epochs and a new provenance row", () => {
  const baseline = fixture.append_only_baseline;
  const contracts = [
    ["research_library", "study_id", fixture.required_studies.map((row) => row.study_id)],
    ["evidence_conclusions", "conclusion_id", fixture.required_conclusions.map((row) => row.conclusion_id)],
    ["progression_rules", "rule_id", [fixture.immediate_pain_rule_id]]
  ];

  contracts.forEach(([table, idField, requiredAdditions]) => {
    const { id_prefix: prefix, maximum_suffix: baselineMax } = baseline[table];
    const currentIds = data[table].map((row) => row[idField]);
    assert.equal(new Set(currentIds).size, currentIds.length, `${table} IDs must be unique`);
    for (let suffix = 1; suffix <= baselineMax; suffix += 1) {
      const historicalId = `${prefix}${String(suffix).padStart(4, "0")}`;
      assert.ok(currentIds.includes(historicalId), `${table} must retain ${historicalId}`);
    }
    requiredAdditions.forEach((id) => {
      assert.ok(currentIds.includes(id), `${table} must append ${id}`);
      assert.ok(numericSuffix(id) > baselineMax, `${table}.${id} must be after the baseline ID range`);
    });
  });

  const changeContract = baseline.change_log;
  const currentChangeIds = data.change_log.map((row) => row.change_id);
  for (let suffix = 1; suffix <= changeContract.maximum_suffix; suffix += 1) {
    const historicalId = `${changeContract.id_prefix}${String(suffix).padStart(4, "0")}`;
    assert.ok(currentChangeIds.includes(historicalId), `change_log must retain ${historicalId}`);
  }
  assert.notEqual(VERSION, baseline.database_version, "Science contract changes require a new database version");
  const appendedChanges = data.change_log.filter((row) => numericSuffix(row.change_id) > changeContract.maximum_suffix);
  assert.ok(appendedChanges.length > 0, "Science evidence changes require an appended change-log row");
  appendedChanges.forEach((row) => assert.equal(row.database_version, VERSION, `${row.change_id} must use the current database version`));
});

test("source and generated science exports remain in parity", () => {
  ["research_library", "evidence_conclusions", "progression_rules", "study_conclusion_map", "change_log"].forEach((table) => {
    assert.deepEqual(readJson(`research_database/exports/json/${table}.json`), data[table], `${table} generated export must equal source`);
  });
});

console.log(`Science evidence contract: ${fixture.contract_version}`);
console.log(`Required fields: research_library.${fixture.required_fields.research_library.join(", research_library.")}`);
console.log(`Required fields: progression_rules.${fixture.required_fields.progression_rules.join(", progression_rules.")}`);
console.log(`Allowed rule_authority: ${fixture.field_values.rule_authority.join(" | ")}`);
console.log(`Allowed enforcement_level: ${fixture.field_values.enforcement_level.join(" | ")}`);
console.log("Delegated stable-ID contract: scripts/test-taxonomy-stable-ids.js (taxonomy portability worker)");

let failures = 0;
for (const contractCase of cases) {
  try {
    contractCase.fn();
    console.log(`PASS ${contractCase.name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${contractCase.name}: ${String(error.message).split("\n")[0]}`);
  }
}

console.log(`RESULT ${cases.length - failures} passed, ${failures} failed, ${cases.length} total`);
if (failures > 0) process.exitCode = 1;
