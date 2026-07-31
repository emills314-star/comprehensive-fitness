"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const views = fs.readFileSync("app-views.js", "utf8");
const foundation = fs.readFileSync("app-foundation.js", "utf8");
const analysis = fs.readFileSync("app-analysis.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${name}`);
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`Unclosed ${name}`);
}

const resolverScript = '<script src="./exception-resolver.js"></script>';
const foundationScript = '<script src="./app-foundation.js"></script>';
assert.ok(html.indexOf(resolverScript) >= 0, "The canonical exception resolver must be loaded");
assert.ok(html.indexOf(resolverScript) < html.indexOf(foundationScript), "The exception resolver must load before application adapters");

const resolvedActionSource = extractFunction(views, "renderResolvedAction");
const resolvedActionForScopeSource = extractFunction(views, "resolvedActionForScope");
const renderLiftHomeSource = extractFunction(views, "renderLiftHome");
const renderWorkoutSource = extractFunction(views, "renderWorkout");

assert.match(resolvedActionSource, /if \(!resolvedAction \|\| resolvedAction\.outcome !== "action"\) return ""/, "Ordinary no-action decisions must stay silent");
assert.match(resolvedActionSource, /role="status"/, "A material action must be announced as status content");
assert.match(resolvedActionSource, /<h2>[\s\S]*<p>/, "The visible intervention must stay concise");
assert.doesNotMatch(resolvedActionSource, /confidence|evidence|personalEvidenceWeight|training window|qualification|taxonomy/i, "Internal recommendation machinery must not enter the visible action card");
assert.doesNotMatch(resolvedActionSource, /<details|<meter|data-conf=/, "The normal action card must not restore evidence or confidence disclosures");

const renderResolvedAction = new Function(
  "escapeHtml",
  `${resolvedActionSource}; return renderResolvedAction;`
)((value) => String(value ?? ""));

assert.equal(renderResolvedAction(null), "", "No action must render no recommendation UI");
assert.equal(renderResolvedAction({ outcome: "no_action" }), "", "A canonical no-action result must render no recommendation UI");

const visibleAction = renderResolvedAction({
  outcome: "action",
  category: "pain_or_illness",
  scope: { type: "session" },
  action: { code: "stop_or_skip_work", parameters: {} },
  reasonCodes: ["explicit_pain_or_injury"]
}, { session: { title: "Long Full-Body Session Name" } });
assert.match(visibleAction, /Stop or skip this workout/, "The canonical action code must own the visible primary instruction");
assert.match(visibleAction, /You recorded pain or an injury concern/, "The visible reason must remain concise and factual");
assert.equal((visibleAction.match(/<article/g) || []).length, 1, "One resolved action must produce one visible action card");
assert.doesNotMatch(visibleAction, /confidence|evidence|matrix|window|taxonomy/i, "Rendered output must keep internal resolver details hidden");

assert.match(resolvedActionForScopeSource, /return actions\[0\] \|\| null/, "A scope may expose at most one primary action");
assert.match(resolvedActionForScopeSource, /exerciseVariantId/, "Exercise actions must retain exact variant scope");
assert.match(renderLiftHomeSource, /renderResolvedAction\(resolvedActionForScope\(running, "session"\)/, "Today may show only the canonical session action");
assert.match(renderWorkoutSource, /renderResolvedAction\(resolvedActionForScope\(session, "session"\)/, "The active workout may show only the canonical session action");
assert.match(views, /renderResolvedAction\(resolvedActionForScope\(owningSession, "exercise", exercise\)/, "The active exercise may show only its canonical exercise action");
assert.doesNotMatch(renderLiftHomeSource, /renderHypertrophyScore|renderRecommendation|recommendationConfidence|renderUnifiedEvidence|todayPlanPreview|weeklyMuscleVolume/, "The ordinary Today surface must not restore score, plan-analysis, or recommendation-evidence presentation");

for (const legacyRenderer of [
  "renderRecommendationHead",
  "renderUnifiedEvidence",
  "renderUnifiedPrescriptionDetails",
  "renderPrescriptionDetails",
  "renderRolePrescriptionDetails"
]) {
  assert.doesNotMatch(views, new RegExp(`function ${legacyRenderer}\\(`), `${legacyRenderer} must remain deleted from normal workout presentation`);
}
assert.doesNotMatch(analysis, /function renderRecommendation\(|coachRecommendationForExercise\(|function hypertrophyAnalysis\(|function weeklyMuscleVolume\(/, "Factual progress charts must not become a second recommendation or hidden analysis surface");
assert.match(analysis, /renderChart\("performance"[\s\S]*renderHistory\(\)/, "Progress must retain one factual chart and chronological workout history");
assert.doesNotMatch(analysis, /research exercises|research version|prescription evidence status/i, "Settings and Progress must not expose research/evidence status");

const focusAllowlist = foundation.match(/const focusActionAllowlist = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
assert.ok(focusAllowlist, "The focus restoration action allowlist must remain discoverable");
assert.doesNotMatch(focusAllowlist, /toggle-prescription-rationale/, "The deleted recommendation disclosure cannot remain a restorable focus target");
for (const action of ["set-tab", "start-template", "request-cancel-workout", "resume-active-workout", "log-template-readiness", "open-history"]) {
  assert.match(focusAllowlist, new RegExp(`"${action}"`), `${action} must remain available to focus restoration`);
}

assert.doesNotMatch(html, /(?:href|src)=["'][^"']*design-concepts\//, "The non-production prototype must never be loaded at runtime");

console.log("Quiet exception-action presentation contract passed.");
