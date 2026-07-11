"use strict";

const fs = require("fs");
const path = require("path");
const { loadEvidenceFromFiles } = require("../prescription-engine");

const root = path.resolve(__dirname, "..");
const outputArg = process.argv.find((value) => value.startsWith("--output="));
const output = outputArg
  ? path.resolve(root, outputArg.slice("--output=".length))
  : path.join(root, "personal_fitness_data", "derived", "app_personal_evidence.json");

const evidence = loadEvidenceFromFiles(root);
if (!evidence.personal.exercisePrescriptions.length || !evidence.personal.exerciseScores.length) {
  throw new Error("Build the personal fitness analysis before creating the private app evidence package.");
}

const packageData = {
  schemaVersion: "personal-evidence-package/1.0.0",
  createdAt: new Date().toISOString(),
  personalDataVersion: evidence.versions.personal,
  researchDatabaseVersion: evidence.versions.research,
  privacy: "private_local_only_do_not_deploy",
  personalData: {
    exercisePrescriptions: evidence.personal.exercisePrescriptions,
    exerciseScores: evidence.personal.exerciseScores,
    exerciseMuscleScores: evidence.personal.exerciseMuscleScores,
    exerciseSessionMetrics: evidence.personal.exerciseSessionMetrics,
    weeklyMuscleVolumeResponse: evidence.personal.weeklyMuscleVolumeResponse,
    recoveryRules: evidence.personal.recoveryRules,
    muscleGroupSweetSpots: evidence.personal.muscleGroupSweetSpots,
    metadata: evidence.personal.metadata
  }
};

fs.mkdirSync(path.dirname(output), { recursive: true });
const temporary = output + ".tmp";
fs.writeFileSync(temporary, JSON.stringify(packageData), "utf8");
fs.renameSync(temporary, output);
console.log(`Private app evidence package written to ${path.relative(root, output)} (${packageData.personalData.exercisePrescriptions.length} prescriptions).`);
