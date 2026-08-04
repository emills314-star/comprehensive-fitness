"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));

const conceptPaths = [
  "redesign/index.html",
  "redesign/playwright.config.ts",
  "redesign/tsconfig.json",
  "redesign/vite.config.ts",
  "redesign/src/App.tsx",
  "redesign/src/main.tsx",
  "redesign/src/styles.css",
  "redesign/src/types.ts",
  "redesign/src/concepts.ts",
  "redesign/src/contract.ts",
  "redesign/src/fixtures.ts",
  "redesign/src/vite-env.d.ts",
  "redesign/src/components/ConceptGallery.tsx",
  "redesign/src/components/ConceptPhone.tsx",
  "redesign/src/components/DualTrackPrototype.tsx",
  "redesign/src/components/FocusedMockups.tsx",
  "tests/redesign/redesign-prototype.spec.ts",
  "scripts/test-redesign-contracts.js",
  "scripts/build-app-personal-evidence.js",
  "scripts/test-set-prescriptions.js",
  "schemas/exercise-prescription.v2.schema.json",
  "schemas/recommendation-snapshot.v1.schema.json"
];
for (const relative of conceptPaths) {
  assert.equal(exists(relative), false, `Concept-only artifact must be deleted: ${relative}`);
}

const packageJson = JSON.parse(read("package.json"));
for (const script of ["redesign:dev", "redesign:build", "redesign:typecheck", "test:redesign", "audit:redesign", "build:app-evidence", "test:prescription-engine", "test:prescription-schemas", "test:prescription-integration", "test:set-prescriptions"]) {
  assert.equal(packageJson.scripts?.[script], undefined, `Concept-only npm script must be deleted: ${script}`);
}
for (const dependency of ["react", "react-dom", "@types/react", "@types/react-dom", "@vitejs/plugin-react", "typescript", "vite"]) {
  assert.equal(packageJson.dependencies?.[dependency], undefined, `Concept-only production dependency must be deleted: ${dependency}`);
  assert.equal(packageJson.devDependencies?.[dependency], undefined, `Concept-only development dependency must be deleted: ${dependency}`);
}

const packageLock = JSON.parse(read("package-lock.json"));
for (const dependency of ["react", "react-dom", "@types/react", "@types/react-dom", "@vitejs/plugin-react", "typescript", "vite"]) {
  assert.equal(packageLock.packages?.[`node_modules/${dependency}`], undefined, `Lockfile must prune concept-only package: ${dependency}`);
}

for (const badge of [
  "badge-e1rm-peak.png",
  "badge-personal-record.png",
  "badge-plan-complete.png",
  "badge-progression.png",
  "badge-smart-training.png",
  "badge-target-precision.png",
  "badge-volume-record.png"
]) {
  assert.equal(exists(`resources/achievements/${badge}`), false, `Orphan achievement asset must be deleted: ${badge}`);
  assert.equal(exists(`www/resources/achievements/${badge}`), false, `Packaged orphan achievement asset must be deleted: ${badge}`);
}

assert.equal(exists("tests/ui/protected-surfaces.spec.js"), false, "The obsolete Lift/Dashboard protection suite must be deleted");
for (const obsoleteBaseline of [
  "tests/ui/__screenshots__/desktop/more-desktop.png",
  "tests/ui/__screenshots__/desktop/plan-desktop.png",
  "tests/ui/__screenshots__/mobile/more-mobile.png",
  "tests/ui/__screenshots__/mobile/plan-mobile.png"
]) {
  assert.equal(exists(obsoleteBaseline), false, `Deleted destination baseline must be removed: ${obsoleteBaseline}`);
}

const foundation = read("app-foundation.js");
const analysis = read("app-analysis.js");
const workout = read("app-workout.js");
const imports = read("app-import.js");
const views = read("app-views.js");
const history = read("app-history.js");
const interactions = read("app.js");
const backupSource = read("backup-contract.js");
const styleSource = read("index.html");
const syncSource = read("app-sync.js");
const pushDeliverySource = read("api/push/deliver.js");
const navigationSource = [
  foundation.match(/const currentDestinationIds = \[[^\]]+\]/)?.[0] || "",
  foundation.match(/function tabFromLocation\(\)\s*\{[\s\S]*?\n\s*\}/)?.[0] || "",
  foundation.match(/function normalizedDestination\(tab\)\s*\{[\s\S]*?\n\s*\}/)?.[0] || ""
].join("\n");
assert.doesNotMatch(
  navigationSource,
  /\b(?:plan|more|data|dashboard|charts|lift|progress-overview|progress-lifts|progress-history)\b/,
  "Expired route adapters must not survive M8"
);
for (const destination of ["today", "progress", "workout", "routines", "settings"]) {
  assert.match(navigationSource, new RegExp(`"${destination}"`), `Current destination must remain allowlisted: ${destination}`);
}

const defaultSettings = foundation.match(/const defaultSettings = \{[\s\S]*?\n\s*\};/)?.[0] || "";
assert.ok(defaultSettings, "Active default settings must remain independently inspectable");
assert.doesNotMatch(defaultSettings, /trainingGoal|nutritionPhase|experienceLevel|returningAfterGap|availableEquipment/, "Deleted planning settings must not survive in active defaults");
const emptyDataSource = foundation.match(/function emptyData\(\)\s*\{[\s\S]*?\n\s*\}/)?.[0] || "";
assert.doesNotMatch(emptyDataSource, /recommendationHistory|manualOverrides|personalEvidencePackage/, "Fresh active state must not recreate deleted top-level domains");
const setSemanticsSource = foundation.match(/function setTypeSemantics\(set\)\s*\{[\s\S]*?(?=\n\s*function explicitStrongSetType\()/)?.[0] || "";
assert.ok(setSemanticsSource, "Canonical set semantics must remain available");
assert.doesNotMatch(setSemanticsSource, /countsTowardScore|countsTowardVolume|purpose === "score"|purpose === "volume"/, "Actual-work semantics must not consult deleted score or volume flags");
assert.doesNotMatch([interactions, views, workout].join("\n"), /isWorkingSet\([^)]*,\s*"score"\)|isWorkingSet\([^)]*,\s*"volume"\)/, "Normal app paths must use canonical actual-work semantics without obsolete score or volume purposes");
assert.doesNotMatch(foundation, /function convertAppWeightUnit\(/, "Display-unit changes must not rewrite historical records or checksums");
assert.match(foundation, /function setAppWeightUnitPreference\(/, "The display-only weight-unit preference must remain");
assert.doesNotMatch(workout, /data\.manualOverrides|countsTowardScore:\s*|countsTowardVolume:\s*/, "Current workout writers must not recreate global overrides or obsolete score/volume flags");
assert.doesNotMatch(analysis, /function setPrescriptionForRole\(|baseSessionIntent/, "Dead live-prescription and session-intent helpers must be deleted");
assert.doesNotMatch(imports, /personalEvidenceBundleForImport|importPersonalEvidenceFile/, "Direct personal-evidence import must be deleted");
assert.doesNotMatch(imports, /recommendationHistory:\s*\[\]|manualOverrides:\s*\[\]|personalEvidencePackage:\s*null|countsTowardScore:\s*semantics|countsTowardVolume:\s*semantics/, "Current imports must not recreate deleted top-level domains or score/volume writers");
assert.doesNotMatch(views, /\b(?:setPrescription|finalPrescription|exercise\.prescription)\b|Review prescription/, "Views must not render legacy prescription fallbacks");
assert.doesNotMatch(history, /\b(?:setPrescription|finalPrescription|exercise\.prescription)\b/, "Completion and Progress must not grade from legacy prescription fallbacks");

const backupContract = require("../backup-contract.js");
const legacyBackupDomains = {
  appDataVersion: 3,
  sessions: [], exercises: [], sets: [], templates: [], settings: {},
  recommendationHistory: [{ id: "legacy-recommendation" }],
  manualOverrides: [{ id: "legacy-override" }],
  personalEvidencePackage: { legacy: true }
};
const exportedBackup = backupContract.createBackupExport(legacyBackupDomains);
const decodedLegacyBackup = backupContract.decodeLegacyBackup(legacyBackupDomains);
for (const decoded of [exportedBackup, decodedLegacyBackup]) {
  assert.equal(Object.hasOwn(decoded, "recommendationHistory"), false, "Current backup output must not retain the deleted recommendation history domain");
  assert.equal(Object.hasOwn(decoded, "manualOverrides"), false, "Current backup output must not retain the deleted top-level manual override domain");
  assert.equal(Object.hasOwn(decoded, "personalEvidencePackage"), false, "Current backup output must not retain the deleted personal evidence domain");
}
assert.match(backupSource, /TOP_LEVEL_KEYS[\s\S]*?"recommendationHistory", "manualOverrides"/, "The isolated legacy decoder must still recognize old backup fields");
assert.match(backupSource, /delete decoded\.recommendationHistory;[\s\S]*?delete decoded\.manualOverrides;[\s\S]*?delete decoded\.personalEvidencePackage;/, "Legacy backup fields must be discarded at the compatibility boundary");
assert.match(backupSource, /"activeWorkoutDraft"[\s\S]*?validateActiveWorkoutDraft\(backup\.activeWorkoutDraft\)/, "Current backups may preserve only a validated versioned active workout draft");
assert.doesNotMatch(backupSource, /if \(backup\[key\] == null\) backup\[key\] = \[\];[\s\S]{0,160}recommendationHistory|recommendationHistory[\s\S]{0,160}if \(backup\[key\] == null\) backup\[key\] = \[\];/, "Current backup validation must not default a deleted recommendation history array");

assert.doesNotMatch(workout, /research_library|sourceCount|Public research database|source records reload/i, "Clear Data must not expose research database status or record counts");
assert.doesNotMatch(views, /#progress-history|return-lift-home|Return to Lift Home/, "Views must not retain expired history hashes or Lift Home copy/actions");
assert.match(views, /href="#progress" data-action="open-session" data-session-id=/, "Previous-session links must retain the open-session action while targeting canonical Progress");
assert.doesNotMatch(interactions, /dataset\.tab === "lift"|returnToLiftHome|return-lift-home/, "Interactions must not retain Lift-tab or Lift Home branches");
assert.match(interactions, /dataset\.tab === "today"[\s\S]*?returnToToday\(\)/, "Today must remain the canonical history-return destination");
assert.doesNotMatch(syncSource, /#lift/, "Rest-completion links must not create the deleted Lift hash");
assert.doesNotMatch(pushDeliverySource, /#lift/, "Push rest-completion links must not create the deleted Lift hash");
assert.match(syncSource, /#workout/, "Rest-completion links must open the active workout context");
assert.match(pushDeliverySource, /#workout/, "Push rest-completion links must open the active workout context");

for (const selector of [".lift-home-score", ".coach-recommendation-wrap", ".progress-workspace", ".progress-workspace-header", ".plan-volume-alerts"]) {
  assert.equal(styleSource.includes(selector), false, `Audited orphan style must be deleted: ${selector}`);
}
assert.match(styleSource, /\.dhead > \* \{ color: color-mix\(in srgb, var\(--muted\) 30%, var\(--text\)\);/, "Settings table headings must use contrast-safe semantic ink in every theme");
assert.doesNotMatch(views, /update its grade and performance history/, "History-edit confirmation must not claim that saving recalculates the stored historical grade");
assert.match(views, /stored historical grade and algorithm version remain unchanged/, "History-edit confirmation must state that historical grade facts remain immutable");

const prescriptionApi = require("../prescription-engine");
assert.deepEqual(
  Object.keys(prescriptionApi).sort(),
  ["ENGINE_VERSION", "createPrescriptionEngine", "deserializeRecommendationSnapshot", "normalizeEvidenceBundle", "serializeRecommendationSnapshot"].sort(),
  "The compatibility module must not expose a live prescription/recommendation product API"
);
assert.deepEqual(
  Object.keys(prescriptionApi.createPrescriptionEngine({})).sort(),
  ["evidence", "resolveExerciseIdentity"],
  "The compatibility engine instance must expose identity resolution only"
);

for (const retained of [
  "docs/redesign/final/FINAL_REDESIGN_PRD.md",
  "docs/redesign/final/FINAL_FEATURE_DISPOSITION.md",
  "docs/redesign/final/RECOMMENDATION_ENGINE_CONTRACT.md",
  "docs/redesign/final/MIGRATION_AND_ACCEPTANCE_PLAN.md",
  "docs/redesign/audits/ADJUDICATION_MATRIX.md",
  "schemas/redesign-app-data.v3.schema.json",
  "schemas/redesign-backup.v3.schema.json",
  "schemas/redesign-active-draft.v2.schema.json",
  "schemas/redesign-resolved-action.v1.schema.json",
  "schemas/redesign-workout-grade.v2.schema.json",
  "tests/fixtures/redesign-m0/backup-v1-legacy.json",
  "tests/fixtures/redesign-m0/backup-v2-mesocycle-equipment.json",
  "tests/fixtures/redesign-m0/backup-v3-current.json"
]) {
  assert.equal(exists(retained), true, `Authoritative or preservation-critical artifact must remain: ${retained}`);
}

const serviceWorker = read("sw.js");
const cacheVersion = Number(serviceWorker.match(/comprehensive-fitness-pwa-v(\d+)/)?.[1] || 0);
assert.ok(cacheVersion >= 102, "M8 must advance the service-worker cache beyond every deleted surface");
assert.doesNotMatch(serviceWorker, /guided-mesocycle|programming-family-ledger|resources\/achievements/i, "Deleted assets must not remain in the app shell");

console.log("M8 deletion contract passed (prototype/toolchain, routes, assets, package graph, cache, and preservation boundary).");
