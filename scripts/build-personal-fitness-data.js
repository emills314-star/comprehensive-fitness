"use strict";

const path = require("node:path");
const { runPipeline } = require("./personal-fitness/pipeline");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const repositoryRoot = path.resolve(__dirname, "..");
  const analysisDate = argumentValue("--analysis-date") || new Date().toISOString().slice(0, 10);
  const result = await runPipeline({ repositoryRoot, analysisDate });
  process.stdout.write(`${JSON.stringify({
    analysis_id: result.analysisMetadata.analysis_id,
    source_date_range: result.analysisMetadata.source_date_range,
    normalized_workout_sets: result.workout.records.length,
    normalized_fitbit_metrics: result.fitbit.records.length,
    normalized_nutrition_records: result.nutrition.records.length,
    exercise_scores: result.exerciseScores.length,
    muscle_rankings: result.muscleGroupRankings.length,
    prescriptions: result.prescriptions.length,
    report: path.relative(repositoryRoot, result.reportPath).replace(/\\/g, "/")
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
