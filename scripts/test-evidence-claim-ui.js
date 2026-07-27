"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const engine = require("../prescription-engine.js");

const root = path.resolve(__dirname, "..");
const views = fs.readFileSync(path.join(root, "app-views.js"), "utf8");
const foundation = fs.readFileSync(path.join(root, "app-foundation.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const decisionEngine = fs.readFileSync(path.join(root, "docs", "DECISION_ENGINE.md"), "utf8");
const uiUx = fs.readFileSync(path.join(root, "docs", "UI_UX.md"), "utf8");
const uiAudit = fs.readFileSync(path.join(root, "tests", "ui", "ui-audit.spec.js"), "utf8");
const lifecycleAudit = fs.readFileSync(path.join(root, "tests", "ui", "template-workout-history-lifecycles.spec.js"), "utf8");
const prescriptionSurface = views.slice(
  views.indexOf("function renderRolePrescriptionDetails"),
  views.indexOf("function renderPlateCalculator")
);
const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || "";
const evidenceFoundation = style.slice(
  style.indexOf("/* Evidence & Change foundation."),
  style.indexOf(".plan-meta")
);

const completeMetrics = (comparableExposures) => ({
  comparableExposures,
  statedConfidence: 1,
  observationSpanDays: 168,
  rpeCompleteness: 1,
  recoveryCompleteness: 1,
  nutritionCompleteness: 1,
  variationConsistency: 1,
  muscleAttributionConfidence: 1,
  confoundingPenalty: 0,
  programChangePenalty: 0
});

assert.deepEqual(
  [2, 3, 5, 8].map((count) => engine.calculateEvidenceWeight(completeMetrics(count)).confidence),
  ["research_default", "low", "moderate", "high"],
  "the UI confidence contract must remain grounded in the engine's four categorical outputs"
);
assert.equal(engine.calculateEvidenceWeight(completeMetrics(2)).personalEvidenceWeight, 0, "research_default must retain zero personal evidence weight");

for (const [key, level] of [["research_default", 1], ["low", 2], ["moderate", 3], ["high", 4]]) {
  assert.match(prescriptionSurface, new RegExp(`${key}: \\{ level: ${level},`), `${key} must map only to UI confidence level ${level}`);
  assert.match(style, new RegExp(`\\.claim-card\\[data-conf="${level}"\\]`), `claim-card level ${level} treatment must be shipped`);
  assert.match(style, new RegExp(`\\.meter\\[data-conf="${level}"\\]`), `meter level ${level} treatment must be shipped`);
}

assert.doesNotMatch(prescriptionSurface, /set\.setPrescription\?\.confidence \|\| set\.prescriptionConfidence \|\| "low"/, "prescription evidence must not fabricate a low confidence fallback");
assert.match(prescriptionSurface, /<section class="prescription-brief unified-prescription/, "unified prescriptions must render as always-visible sections");
assert.match(prescriptionSurface, /<section class="recommendation-rationale" aria-label="Recommendation evidence"/, "recommendation evidence must be an always-visible labelled section");
assert.match(prescriptionSurface, /class="claim-card prescription-claim/, "the prescription target must render as a confidence-bearing claim");
assert.match(prescriptionSurface, /class="claim-projection-grid prescription-claim-projections"/, "rest, frequency, and role projections must remain inside the unified confidence claim");
assert.match(prescriptionSurface, /class="claim-projection-rule"/, "progression rules must remain inside their confidence claim");
assert.match(prescriptionSurface, /class="role-evidence-copy"/, "stored role rationale must remain separately identified as evidence");
assert.match(prescriptionSurface, /<div class="role-prescription"/, "role prescription groups without headings must use neutral container semantics");
assert.doesNotMatch(prescriptionSurface, /role-confidence-label|role-prescription-claim|Today\\?'s target/, "role evidence must not restate exercise-level confidence or set-row targets");
assert.doesNotMatch(prescriptionSurface, /<article class="role-prescription"/, "role prescription groups must not expose unnamed article landmarks");
assert.doesNotMatch(prescriptionSurface, /role-progression-facts|prescription-fact-grid/, "forward-looking prescription values must not return to fact-styled grids");
assert.doesNotMatch(style, /\.role-progression-facts|\.prescription-fact-grid/, "obsolete current-tinted projection grids must not be shipped");
assert.doesNotMatch(prescriptionSurface, /<details class="prescription-brief|<summary[^>]*toggle-prescription-rationale/, "the prescription/evidence surface must not restore nested disclosures");
assert.doesNotMatch(prescriptionSurface, /aria-expanded|data-action=/, "always-visible prescription evidence must not add disclosure state or a keyboard stop");

const focusAllowlist = foundation.match(/const focusActionAllowlist = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
assert.ok(focusAllowlist, "the focus restoration action allowlist must remain discoverable");
assert.doesNotMatch(focusAllowlist, /toggle-prescription-rationale/, "the removed disclosure action was never a restorable focus descriptor");
for (const action of ["set-tab", "start-template", "request-cancel-workout", "return-active-workout", "open-history"]) {
  assert.match(focusAllowlist, new RegExp(`"${action}"`), `${action} must remain available to focus restoration`);
}

for (const selector of [".chip", ".claim-card", ".drow", ".diff", ".tap", ".rollup", ".callout", ".meter[data-conf]"]) {
  assert.ok(evidenceFoundation.includes(selector), `${selector} must be ported into the production inline stylesheet`);
}
assert.doesNotMatch(evidenceFoundation, /--fs-data/, "the evidence system must not consume the set-grid-only data type step");
const evidenceFontSizes = [...evidenceFoundation.matchAll(/font-size:\s*([^;]+);/g)].map((match) => match[1].trim());
assert.ok(evidenceFontSizes.every((value) => value.startsWith("var(--fs-")), "the evidence system must use the declared type scale");
assert.match(style, /color-mix\(in srgb, var\(--muted-2\) 70%, var\(--text\)\)/, "provisional text must retain muted-2 semantics while meeting package contrast");
assert.doesNotMatch(html, /(?:href|src)=["'][^"']*design-concepts\//, "the non-production prototype must never be loaded at runtime");

for (const contrastName of [
  "chip",
  "cc-title",
  "cc-value",
  "cc-why",
  "claim-projection-label",
  "claim-projection-value",
  "claim-projection-rule-label",
  "claim-projection-rule-value",
  "prescription-base-label",
  "prescription-base-value",
  "role-evidence-copy",
  "evidence-confidence-label",
  "evidence-confidence-copy"
]) {
  assert.match(uiAudit, new RegExp(`data-contrast-name="${contrastName}"`), `${contrastName} must be covered across every package and theme`);
}
assert.match(uiAudit, /effectiveBackground/, "confidence contrast must composite translucent package surfaces");
assert.match(lifecycleAudit, /page\.keyboard\.press\("Tab"\)/, "the live prescription surface must have a real keyboard traversal regression");
assert.match(lifecycleAudit, /Tab must cross the non-interactive prescription evidence and land on the next real workout control/, "focus traversal must assert the next durable control");

assert.match(decisionEngine, /\| `research_default` \|[^\n]+\| `1` \|/, "Decision Engine documentation must record the research_default UI mapping");
assert.match(decisionEngine, /\| `moderate` \|[^\n]+\| `3` \|/, "Decision Engine documentation must record the moderate UI mapping");
assert.match(uiUx, /Exact numeric targets belong to the generated set rows/, "UI/UX documentation must preserve single-owner claim/fact separation");

console.log("Prescription claim-and-evidence contract passed.");
