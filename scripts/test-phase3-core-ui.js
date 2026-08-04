const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const views = fs.readFileSync(path.join(root, "app-views.js"), "utf8");
const analysis = fs.readFileSync(path.join(root, "app-analysis.js"), "utf8");
const history = fs.readFileSync(path.join(root, "app-history.js"), "utf8");
const interactions = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(startIndex >= 0 && endIndex > startIndex, `${start} must remain independently inspectable`);
  return source.slice(startIndex, endIndex);
}

const today = section(views, "function renderLiftHome()", "function workoutProgress()");
const quickStarts = section(views, "function renderQuickStartTemplates(", "function openOptionalReadiness(");
const progress = section(analysis, "function renderLiftProgress()", "function restAlertState()");
const completedHistory = section(analysis, "function renderHistory()", "// EXERCISE_TARGET_ENGINE_START");
const templates = section(analysis, "function renderTemplates()", "function templateNumericDraftKey(");
const templateCard = section(analysis, "function renderTemplateCard(", "function renderHistory()");
const summary = section(history, "function renderCompletedWorkoutSummary(", "\n      }");

assert.match(today, /<h1>Today<\/h1>[\s\S]*Expected workout[\s\S]*data-action="start-next-template"/, "Today must identify and start the expected workout");
assert.match(today, /previewNames[\s\S]*nextTemplate\?\.exercises/, "Today may show only a concise factual exercise-name preview");
assert.doesNotMatch(today, /todayPlanPreview|renderTodayPlanPreview|Stable target|Last time|weeklyMuscleVolume|hypertrophy|open-progress/i, "Today must not retain plan comparisons or analytical review links");
assert.strictEqual((views.match(/data-action="start-next-template"/g) || []).length, 1, "Today must render exactly one primary expected-workout action");
assert.match(quickStarts, /today-template-strip[\s\S]*today-template-card/, "Alternate routines must remain secondary to the expected workout");
assert.match(quickStarts, /"resume-active-workout" : "start-template"/, "Alternate routines must retain start and resume actions");

assert.match(progress, /exercisePerformanceSeries\([\s\S]*renderChart\("performance"[\s\S]*renderHistory\(\)/, "Progress must combine one factual exercise chart with chronological workout history");
assert.match(progress, /Exercise or variant[\s\S]*Named variants and resistance types remain separate/, "Progress must retain exact exercise-variant and resistance-type selection");
assert.match(progress, /Tap a point for its date, load, reps, RPE, role, and workout/, "The factual chart must disclose its recorded point details");
assert.doesNotMatch(progress, /hypertrophy|weekly volume|fractional|reps at weight|confidence|evidence|dashboard/i, "Progress must not restore deleted analytical products");
assert.match(completedHistory, /isSessionSubmitted\(session\)[\s\S]*sessionCompletionDate[\s\S]*Completed workouts will appear here/, "Progress history must be chronological, submitted, and empty-state safe");
assert.match(completedHistory, /storedWorkoutGradeProjection\(session\)\?\.grade[\s\S]*Stored workout grade/, "Stored historical and current grades must remain factual history");

assert.match(templates, /<h1>Routines<\/h1>[\s\S]*Edit the workouts you return to[\s\S]*Starting one never replaces an existing draft/, "Contextual routine management must use product-facing guidance and state the draft-safety boundary");
assert.doesNotMatch(templates, /canonical historical completion contract|completion rate is intentionally absent/i, "Routine management must not expose implementation rationale");
assert.match(templateCard, /plan-template-card ex-block/, "Routine cards must retain the compact editor structure");
assert.doesNotMatch(templateCard, /completion rate|completionRate|confidence|evidence|hypertrophy|weekly volume/i, "Routine cards must not invent analytics or internal recommendation claims");
assert.match(templateCard, /const advice = null/, "Routine cards must not silently revive recommendation advice");
const directStartHandler = interactions.match(/if \(action === "start-template" \|\| action === "start-next-template"\)[^\r\n]*/)?.[0] || "";
assert.match(directStartHandler, /startTemplate\([^;]*defaultRecovery\(\), "usual"\)/, "Expected and alternate workout Start actions must open the logger directly");
assert.doesNotMatch(directStartHandler, /openTemplateStart|templateStartFlow/, "Direct Start must not open an intermediate confirmation or readiness sheet");

assert.match(summary, /workout-grade-hero[\s\S]*workout-grade-mark[\s\S]*Why this grade[\s\S]*reasons\.slice\(0, 3\)/, "Completed summary must retain one grade with at most three plain reasons");
assert.match(summary, /currentHighlights\.slice\(0, 3\)[\s\S]*Progress highlights/, "Completed summary must limit factual progress or PR highlights to three");
assert.match(summary, /close-completed-summary[\s\S]*open-completion-progress/, "Immediate completion must expose Done and contextual Progress actions");
assert.doesNotMatch(summary, /summary-diff-result|class="plan"|class="act"|class="dlt"|workout-confidence|confidence meter|evidence matrix|categoryScores|internalScore|achievement/i, "Completed summary must not retain plan-adherence diff, grade internals, or achievement UI");

for (const className of ["today-coach", "plan-template-card", "concise-completion", "chart-detail", "history-session-row"]) {
  assert.match(html, new RegExp(`\\.${className.replaceAll("-", "\\-")}`), `${className} styles must ship in the production stylesheet`);
}

console.log("Simplified core-screen presentation contract passed.");
