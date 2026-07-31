const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const views = fs.readFileSync(path.join(root, "app-views.js"), "utf8");
const analysis = fs.readFileSync(path.join(root, "app-analysis.js"), "utf8");
const history = fs.readFileSync(path.join(root, "app-history.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(startIndex >= 0 && endIndex > startIndex, `${start} must remain independently inspectable`);
  return source.slice(startIndex, endIndex);
}

const today = section(views, "function renderLiftHome()", "function workoutProgress()");
const todayPlan = section(views, "function renderTodayPlanPreview(", "function renderLiftHome()");
const quickStarts = section(views, "function renderQuickStartTemplates()", "function openTemplateStart(");
const progress = section(views, "function renderProgressOverview()", "function dashboardWeekEnd(");
const templates = section(analysis, "function renderTemplates()", "function templateNumericDraftKey(");
const templateCard = section(analysis, "function renderTemplateCard(", "function renderHistory(");
const exerciseResult = section(history, "function renderWorkoutExerciseResult(", "const workoutAchievementAssets");
const summary = section(history, "function renderCompletedWorkoutSummary(", "\n      }");

assert.match(today, /<h1>Today<\/h1>[\s\S]*Next action/, "Today must identify the expected workout and retain one current action");
assert.doesNotMatch(today, /What changed since you last ran this|readiness can adjust today|targets and evidence stay together/i, "ordinary Today must not lead with legacy recommendation or evidence messaging");
assert.match(today, /todayPlanPreview\(nextTemplate\)[\s\S]*renderTodayPlanPreview\(nextTemplate, planPreview\)/, "Today must derive and render its plan-versus-last-performance preview");
assert.match(todayPlan, /data-action="start-next-template"/, "Today must expose one primary next-template action");
assert.match(todayPlan, /Stable target[\s\S]*Last time[\s\S]*Effort/, "Today must show stable routine targets beside factual prior performance");
assert.doesNotMatch(todayPlan, /confidence|evidence|recommendation/i, "ordinary Today must keep internal recommendation machinery invisible");
assert.strictEqual((views.match(/data-action="start-next-template"/g) || []).length, 1, "Today must render exactly one next-template action");
assert.match(today, /data-action="open-progress"/, "Today must retain the weekly-review action");
assert.match(quickStarts, /today-template-strip[\s\S]*today-template-card/, "Today quick starts must use the Phase 3 presentation");
assert.match(quickStarts, /"return-active-workout" : "start-template"/, "Today must retain quick-template start actions");

assert.match(progress, /bucket\.targetLow[\s\S]*bucket\.targetHigh[\s\S]*bucket\.sets/, "Progress must use the real weekly planned range and actual weighted sets");
assert.match(progress, /class="volume-table diff"[\s\S]*class="volume-table-head"[\s\S]*Muscle \/ planned range[\s\S]*Logged[\s\S]*Delta/, "Progress must render one shared header for its continuous comparison table");
assert.match(progress, /class="volume-card-toggle volume-table-row"[\s\S]*class="plan volume-muscle-cell"[\s\S]*class="act"[\s\S]*class="dlt"[\s\S]*class="d /, "Each muscle must render as one plan, actual, and delta row");
assert.doesNotMatch(progress, /volume-detail-hero|Weekly target[\s\S]*Status/, "Progress drilldown must not repeat the row's muscle, target, and status facts");
assert.match(progress, /bucket\.status === "over" \? "out"/, "Exceeding a volume ceiling must render as an out-of-tolerance delta");
assert.doesNotMatch(progress, /style="--meter:/, "Progress must not retain the prototype-style inline meter");

assert.match(templates, /Choose the repeatable workout that fits today/, "Plan must use product-facing planning guidance");
assert.doesNotMatch(templates, /canonical historical completion contract|completion rate is intentionally absent/i, "Plan must not expose implementation rationale");
assert.match(templateCard, /plan-template-card ex-block/, "Template cards must use the Phase 3 plan structure");
assert.doesNotMatch(templateCard, /completion rate|completionRate/i, "Plan must not invent a template completion metric");
assert.doesNotMatch(templates, /volumeFlags|plan-volume-alerts|open-plan-volume-warning/, "Plan must not retain the deleted recommendation-era volume warning path");
assert.match(templateCard, /const advice = null/, "Phase 3 must not silently revive template advice");

assert.match(exerciseResult, /summary-diff-result[\s\S]*class="diff"[\s\S]*class="plan"[\s\S]*class="act"[\s\S]*class="dlt"/, "Completed exercise results must expose plan, actual, and judgment slots");
assert.match(summary, /completionHeadline[\s\S]*workout-confidence[\s\S]*workout-grade-mark[\s\S]*confidence[\s\S]*exerciseResults/, "Completed summary must retain one grade owner, explicit confidence evidence, and the exercise diff");
for (const className of ["today-plan-preview", "volume-table", "plan-template-card", "summary-diff-result"]) {
  assert.match(html, new RegExp(`\\.${className.replaceAll("-", "\\-")}`), `${className} styles must ship in the production stylesheet`);
}

console.log("Phase 3 core-screen presentation contract passed.");
