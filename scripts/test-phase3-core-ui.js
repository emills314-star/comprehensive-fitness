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
const quickStarts = section(views, "function renderQuickStartTemplates()", "function openTemplateStart(");
const progress = section(views, "function renderProgressOverview()", "function dashboardWeekEnd(");
const templates = section(analysis, "function renderTemplates()", "function templateNumericDraftKey(");
const templateCard = section(analysis, "function renderTemplateCard(", "function renderHistory(");
const exerciseResult = section(history, "function renderWorkoutExerciseResult(", "const workoutAchievementAssets");
const summary = section(history, "function renderCompletedWorkoutSummary(", "\n      }");

assert.match(today, /What the plan asks today|Build the plan before chasing the outcome/, "Today must lead with one current decision");
assert.match(today, /data-action="start-next-template"/, "Today must expose one primary next-template action");
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
assert.match(templates, /const volumeFlags = \[\]/, "Phase 3 must not silently revive the dead Plan volume path");
assert.match(templateCard, /const advice = null/, "Phase 3 must not silently revive template advice");

assert.match(exerciseResult, /summary-diff-result[\s\S]*class="diff"[\s\S]*class="plan"[\s\S]*class="act"[\s\S]*class="dlt"/, "Completed exercise results must expose plan, actual, and judgment slots");
assert.match(summary, /<h2>Workout analysis<\/h2>[\s\S]*workout-grade-mark[\s\S]*workout-confidence/, "Completed summary must retain one grade owner and explicit confidence evidence");
for (const className of ["today-coach", "volume-table", "plan-template-card", "summary-diff-result"]) {
  assert.match(html, new RegExp(`\\.${className.replaceAll("-", "\\-")}`), `${className} styles must ship in the production stylesheet`);
}

console.log("Phase 3 core-screen presentation contract passed.");
