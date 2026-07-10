const fs = require("node:fs");

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Usage: node scripts/preview-strong-migration.js <strong.csv>");
const html = fs.readFileSync("index.html", "utf8");
const engineSource = html.match(/\/\/ DOMAIN_INTEGRITY_ENGINE_START([\s\S]*?)\/\/ DOMAIN_INTEGRITY_ENGINE_END/)?.[1];
if (!engineSource) throw new Error("Domain integrity engine not found.");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  const headers = rows.shift().map((value) => value.trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

const factory = new Function(`
  const ACTIVE_HISTORY_MONTHS = 6, SET_CLASSIFIER_VERSION = 2, DOMAIN_MIGRATION_VERSION = 2;
  const localDateIso = (date) => date.toISOString().slice(0, 10);
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const isoNow = () => new Date().toISOString();
  const canonicalExerciseId = (name) => name;
  const id = () => "preview";
  const isBodyweightResistance = () => false;
  const templateSetTypesFromHistory = () => [];
  ${engineSource}
  return { classifyImportedExerciseSets };
`);
const engine = factory();
const text = fs.readFileSync(sourcePath, "utf8");
const rows = parseCsv(text).filter((row) => row.Date && row["Exercise Name"] && !/rest/i.test(row["Set Order"] || "") && (Number(row.Reps) > 0 || Number(row.Weight) > 0 || Number(row.Seconds) > 0 || Number(row.Distance) > 0));
const groups = new Map();
rows.forEach((row, index) => {
  const key = [row.Date, row["Workout Name"], row["Exercise Name"]].join("|");
  const list = groups.get(key) || [];
  list.push({ id: String(index), sequence: list.length + 1, setNumber: Number(row["Set Order"]) || list.length + 1, sourceSetOrder: row["Set Order"], weight: Number(row.Weight) || 0, reps: Number(row.Reps) || 0, previewContext: { date: row.Date, workout: row["Workout Name"], exercise: row["Exercise Name"] } });
  groups.set(key, list);
});
const counts = { inspected: 0, warmup: 0, top: 0, backoff: 0, straight: 0, drop: 0, failure: 0, ambiguous: 0 };
const ambiguousExamples = [];
groups.forEach((sets) => {
  const exerciseName = sets[0]?.previewContext?.exercise || "";
  const resistanceType = /pull.?up|chin.?up|push.?up|side plank|bodyweight|assisted/i.test(exerciseName) ? (/assisted/i.test(exerciseName) ? "assisted_bodyweight" : "bodyweight") : "external";
  engine.classifyImportedExerciseSets(sets, resistanceType, "strong").forEach((item) => {
  counts.inspected += 1;
  if (Object.hasOwn(counts, item.type)) counts[item.type] += 1;
  if (item.reviewRequired) {
    counts.ambiguous += 1;
    ambiguousExamples.push({ ...item.set.previewContext, setOrder: item.set.sourceSetOrder, weight: item.set.weight, reps: item.set.reps, reason: item.reason });
  }
  });
});
console.log(JSON.stringify({ sourcePath, workoutExerciseGroups: groups.size, ...counts, ambiguousExamples }, null, 2));
