"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const publicExercises = require(path.join(ROOT, "research_database", "exports", "json", "exercise_database.json"));
const prescriptionApi = require(path.join(ROOT, "prescription-engine.js"));

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function functionSource(name) {
  const declarations = [];
  const pattern = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = pattern.exec(html))) declarations.push({ name: match[1], index: match.index });
  const index = declarations.findIndex((declaration) => declaration.name === name);
  assert.notEqual(index, -1, `Missing function ${name}`);
  const start = declarations[index].index;
  const end = declarations[index + 1]?.index || html.length;
  return html.slice(start, end);
}

function functionSourceContaining(pattern, message) {
  const declarations = [];
  const declarationPattern = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = declarationPattern.exec(html))) declarations.push({ name: match[1], index: match.index });
  for (let index = 0; index < declarations.length; index += 1) {
    const source = html.slice(declarations[index].index, declarations[index + 1]?.index || html.length);
    if (pattern.test(source)) return source;
  }
  assert.fail(message);
}

function evaluateFunction(name, context = {}) {
  return vm.runInNewContext(`(${functionSource(name).trim()})`, context, { filename: `index.html#${name}` });
}

function plain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function collectAssertions(assertions) {
  const failures = [];
  for (const [label, assertion] of assertions) {
    try {
      assertion();
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
}

function assertContains(source, pattern, message) {
  assert.match(source, pattern, message);
}

function normalizeIdentity(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function publicResearchData() {
  const read = (name) => require(path.join(ROOT, "research_database", "exports", "json", `${name}.json`));
  return {
    exerciseDatabase: publicExercises,
    exerciseMuscleMap: read("exercise_muscle_map"),
    exerciseSubstitutionMap: read("exercise_substitution_map"),
    muscleGroupRecommendations: read("muscle_group_recommendations"),
    progressionRules: read("progression_rules"),
    nutritionStrategies: read("nutrition_strategies"),
    manifest: read("manifest")
  };
}

test("readiness adapter preserves explicit safety inputs without inventing fatigue", () => {
  const source = functionSource("prescriptionReadiness");
  collectAssertions([
    ["illness passthrough", () => assertContains(source, /\billness\s*:\s*(?:Boolean\s*\()?\s*recovery\.illness/, "prescriptionReadiness must pass the explicit illness value")],
    ["pain passthrough", () => assertContains(source, /\bpain\s*:\s*(?:Boolean\s*\()?\s*recovery\.pain/, "prescriptionReadiness must pass an explicit pain value independently of free text")],
    ["affected muscle passthrough", () => assertContains(source, /\baffectedMuscle\s*:\s*recovery\.affectedMuscle/, "prescriptionReadiness must identify the affected muscle")],
    ["note is not fatigue", () => assert.doesNotMatch(source, /fatigue\s*:\s*recovery\.outsideBandNote/, "A free-text note must not fabricate a fatigue score")],
    ["note is not persistence", () => assert.doesNotMatch(source, /consecutiveLowReadinessDays\s*:\s*recovery\.outsideBandNote/, "A free-text note must not fabricate multiple low-readiness days")],
    ["note is not energy availability", () => assert.doesNotMatch(source, /energyAvailabilityLow\s*:[^\n]*outsideBandNote/, "A free-text note must not infer low energy availability")]
  ]);
});

test("safety adapters distinguish workout illness from affected-exercise pain and erase executable targets", () => {
  const readiness = evaluateFunction("prescriptionReadiness", {
    cleanRecovery: (value) => ({
      sleepHours: "", sleepQuality: "", hrv: "", restingHr: "", soreness: "",
      nutritionStatus: "", proteinStatus: "", outsideBandNote: "", illness: false,
      pain: false, affectedMuscle: "", ...value
    }),
    readinessBaseline: () => ({}),
    data: { settings: { nutritionPhase: "maintenance" } }
  });
  const illnessReadiness = plain(readiness({ illness: true, pain: false, affectedMuscle: "" }, []));
  const painReadiness = plain(readiness({ illness: false, pain: true, affectedMuscle: "chest" }, []));
  assert.equal(illnessReadiness.illness, true, "Illness must remain an explicit whole-workout safety input");
  assert.equal(illnessReadiness.pain, false, "Illness must not fabricate pain");
  assert.equal(painReadiness.illness, false, "Pain must not fabricate illness");
  assert.equal(painReadiness.pain, true, "Pain must remain an explicit affected-exercise safety input");
  assert.equal(painReadiness.affectedMuscle, "chest", "Pain scope must preserve the affected muscle");

  const converter = evaluateFunction("legacyTargetFromSnapshot", {
    data: { settings: { weightUnit: "lb" } },
    inferResistanceType: () => "external",
    convertWeightValue: (value) => value,
    isBodyweightResistance: () => false,
    progressionProfileForExercise: () => ({ increment: 5 }),
    legacyRecommendationFromSnapshot: () => ({}),
    targetText: () => ""
  });
  const blocked = (reason, scope) => ({
    recommendationId: `blocked-${reason}`,
    basePrescription: {},
    finalPrescription: {
      exerciseId: "ex_barbell_bench_press",
      recommendationType: reason === "illness" ? "hold" : "substitute",
      executionBlocked: true,
      workingSets: { min: 0, target: 0, max: 0 },
      repRange: { min: 6, target: 8, max: 10 },
      targetRpe: { min: 7, max: 8 },
      restSeconds: { min: 120, target: 180, max: 240 },
      setStructure: "straight_sets",
      userExplanation: "Synthetic safety fixture",
      confidence: "high",
      safetyRestriction: { schemaVersion: "hard-safety/1.0.0", status: "blocked", reason, scope }
    }
  });
  for (const [reason, scope] of [["illness", "workout"], ["pain", "exercise"]]) {
    const target = plain(converter(blocked(reason, scope), { name: "Bench Press", resistanceType: "external" }));
    assert.equal(target.executionBlocked, true, `${reason} must remain explicitly non-executable in the app target`);
    assert.equal(target.safetyRestriction?.scope, scope, `${reason} must retain its ${scope} safety scope`);
    for (const field of ["sets", "reps", "repLow", "repHigh", "weight", "addedLoad", "assistanceLoad"]) {
      assert.equal(Number(target[field] || 0), 0, `Blocked ${reason} target leaked executable ${field}`);
    }
    assert.deepEqual(target.warmups || [], [], `Blocked ${reason} target leaked warm-ups`);
    assert.deepEqual(target.executableActions || [], [], `Blocked ${reason} target leaked executable actions`);
  }
});

test("unified prescriptions preserve template intent and all hard workout constraints", () => {
  const unified = functionSource("unifiedPrescriptionSnapshot");
  const start = functionSource("startTemplate");
  const resistanceFallbacks = start.match(/resistanceType\s*:\s*target\.resistanceType\s*\|\|\s*templateResistanceType/g) || [];
  collectAssertions([
    ["planned working sets", () => assertContains(unified, /\b(?:plannedWorkingSets|plannedSets)\s*:/, "The engine call must receive the guided/template planned set count")],
    ["resistance type", () => assertContains(unified, /\bresistanceType\s*:/, "The engine call must receive the explicit resistance type")],
    ["time constraint", () => assertContains(unified, /\b(?:sessionDurationMinutes|timeConstraintMinutes|maxSessionMinutes)\s*:/, "The engine call must receive the session time constraint")],
    ["equipment constraint", () => assertContains(unified, /\bavailableEquipment\s*:/, "The engine call must receive available equipment")],
    ["exercise exclusions", () => assertContains(unified, /\b(?:excludedExerciseIds|exerciseExclusions)\s*:/, "The engine call must receive exercise exclusions")],
    ["muscle scope", () => assertContains(unified, /\b(?:includedMuscleGroupIds|muscleScope)\s*:/, "The engine call must receive the selected muscle scope")],
    ["exercise/set resistance fallback", () => assert.ok(resistanceFallbacks.length >= 2, `Started exercises and generated sets must retain template resistance when an engine target omits it; found ${resistanceFallbacks.length} guarded assignment(s)`)]
  ]);
});

test("unified prescription invocation forwards canonical profile fields and hard constraints unchanged", () => {
  let captured = null;
  const unified = evaluateFunction("unifiedPrescriptionSnapshot", {
    prescriptionEngine: { prescribeExercise: (input) => { captured = input; return { recommendationId: "synthetic" }; } },
    prescriptionEvidenceStatus: { state: "ready" },
    prescriptionExerciseIdentity: () => "ex_barbell_bench_press",
    normalizePrescriptionIdentity: (value) => String(value || "").trim(),
    prescriptionMuscleGroup: () => "chest",
    todayIso: () => "2026-07-14",
    prescriptionHistoryForExercise: () => [],
    prescriptionReadiness: () => ({}),
    currentMesocycle: () => null,
    prescriptionScopeHistories: () => ({ muscleExerciseHistories: [], programMuscleHistories: [] }),
    musclesForExercise: () => [{ muscle: "Chest" }],
    appMuscleFromPrescriptionGroup: () => "Chest",
    weeklyMuscleVolume: () => [],
    startOfWeekIso: (value) => value,
    prescriptionSnapshotCache: new Map(),
    analysisRevision: 1,
    JSON
  });
  const requested = {
    plannedWorkingSets: 3,
    resistanceType: "external",
    sessionDurationMinutes: 35,
    availableEquipment: ["dumbbell", "bench"],
    excludedExerciseIds: ["ex_barbell_bench_press"],
    includedMuscleGroupIds: ["chest"],
    trainingGoal: "hypertrophy",
    nutritionPhase: "deficit",
    experienceLevel: "intermediate",
    createdAt: "2026-07-14T12:00:00.000Z",
    fresh: true
  };
  unified({ name: "Bench Press" }, requested);
  for (const field of [
    "plannedWorkingSets", "resistanceType", "sessionDurationMinutes", "availableEquipment",
    "excludedExerciseIds", "includedMuscleGroupIds", "trainingGoal", "nutritionPhase", "experienceLevel"
  ]) {
    assert.deepEqual(plain(captured?.[field]), plain(requested[field]), `Unified adapter dropped or rewrote ${field}`);
  }
});

test("settings use separate canonical training, nutrition, and experience fields with legacy migration", () => {
  const defaultsStart = html.indexOf("const defaultSettings");
  assert.notEqual(defaultsStart, -1, "Missing defaultSettings");
  const defaults = html.slice(defaultsStart, defaultsStart + 3500);
  const normalize = functionSource("normalizeLoadedData");
  const unified = functionSource("unifiedPrescriptionSnapshot");
  collectAssertions([
    ["canonical defaults", () => {
      assertContains(defaults, /trainingGoal\s*:/, "Settings need a canonical trainingGoal");
      assertContains(defaults, /nutritionPhase\s*:/, "Settings need a separate nutritionPhase");
      assertContains(defaults, /experienceLevel\s*:/, "Settings need a canonical experienceLevel");
    }],
    ["canonical persistence", () => {
      assertContains(normalize, /trainingGoal\s*:/, "Loaded settings must preserve trainingGoal");
      assertContains(normalize, /nutritionPhase\s*:/, "Loaded settings must preserve nutritionPhase");
      assertContains(normalize, /experienceLevel\s*:/, "Loaded settings must preserve experienceLevel");
    }],
    ["legacy migration", () => {
      assertContains(normalize, /(?:migrate|legacy)[\s\S]{0,900}(?:storedSettings\.)?goal/i, "Legacy overloaded goal values need an explicit migration");
      assertContains(normalize, /(?:migrate|legacy)[\s\S]{0,900}(?:storedSettings\.)?trainingStatus/i, "Legacy trainingStatus needs an explicit experience migration");
    }],
    ["engine receives canonical fields", () => {
      assertContains(unified, /trainingGoal\s*:/, "Prescription invocation must receive trainingGoal");
      assertContains(unified, /nutritionPhase\s*:/, "Prescription invocation must receive nutritionPhase separately");
      assertContains(unified, /experienceLevel\s*:/, "Prescription invocation must receive experienceLevel");
    }]
  ]);
});

test("canonical exercise and taxonomy resolution are registry-first and exhaustive", () => {
  const evidence = prescriptionApi.normalizeEvidenceBundle({ researchData: publicResearchData() });
  const unresolved = [];
  for (const exercise of publicExercises) {
    const names = [exercise.exercise_name, ...String(exercise.exercise_aliases || "").split("|").filter(Boolean)];
    for (const name of names) {
      const resolved = evidence.research.exerciseIdByAlias.get(normalizeIdentity(name));
      if (resolved !== exercise.exercise_id) unresolved.push(`${name} -> ${resolved || "unresolved"}; expected ${exercise.exercise_id}`);
    }
  }
  assert.deepEqual(unresolved, [], `Public canonical names/aliases failed resolution:\n${unresolved.join("\n")}`);

  const canonical = functionSource("canonicalExerciseId");
  const muscles = functionSource("musclesForExercise");
  collectAssertions([
    ["no regex-only canonical fallback", () => assert.doesNotMatch(canonical, /return\s+researchId\s*\|\|\s*normalized/, "Known public exercises must resolve through a canonical registry instead of becoming regex-normalized pseudo IDs")],
    ["canonical identity gates analytics", () => assertContains(muscles, /canonicalExerciseId\s*\(/, "Analytics must identify canonical exercises before considering a custom-exercise regex fallback")],
    ["regex fallback is custom-only", () => assertContains(muscles, /(?:custom|uncatalogued|unmapped)[\s\S]{0,240}automaticMusclesForName|automaticMusclesForName[\s\S]{0,240}(?:custom|uncatalogued|unmapped)/i, "Regex muscle inference must be explicitly limited to custom or unmapped exercises")]
  ]);
});

test("frontend identity resolution prefers the public alias registry and namespaces uncatalogued exercises", () => {
  const normalize = (value) => String(value || "").toLowerCase().replace(/^ex_/, "").replace(/[^a-z0-9]+/g, " ").trim();
  const evidence = {
    personal: {
      exerciseScores: [
        { exercise_id: "custom_spoofed_bench", exercise_name: "Bench Press" },
        { exercise_id: "custom_my_press", exercise_name: "My Garage Press" }
      ],
      exercisePrescriptions: []
    },
    research: {
      exerciseIdByAlias: new Map([["bench press", "ex_barbell_bench_press"], ["flat bench", "ex_barbell_bench_press"]]),
      exerciseDatabase: [{ exercise_id: "ex_barbell_bench_press", exercise_name: "Barbell Bench Press" }]
    }
  };
  const prescriptionIdentity = evaluateFunction("prescriptionExerciseIdentity", {
    prescriptionEngine: { evidence },
    normalizePrescriptionIdentity: normalize
  });
  assert.equal(prescriptionIdentity("Flat Bench"), "ex_barbell_bench_press", "A public alias must resolve to its canonical research ID");
  assert.equal(prescriptionIdentity("Bench Press"), "ex_barbell_bench_press", "A custom name collision must not shadow the public registry");
  assert.equal(prescriptionIdentity("My Garage Press"), "custom_my_press", "A trusted custom identity must remain in its custom namespace");

  const canonicalId = evaluateFunction("canonicalExerciseId", {
    prescriptionEngine: { evidence },
    normalizePrescriptionIdentity: normalize
  });
  assert.equal(canonicalId("Flat Bench"), "ex_barbell_bench_press");
  assert.match(canonicalId("Uncatalogued Garage Press"), /^custom(?::|_)/, "An uncatalogued name must not become an unnamespaced pseudo-canonical ID");
});

test("backup import is bounded, allowlisted, and hostile-field safe", () => {
  const importSource = functionSource("importDataFile");
  const validatorMatch = html.match(/(?:function\s+(?:validate|sanitize|parse)(?:Backup|Imported|AppData)\w*\s*\([^)]*\)\s*\{|const\s+(?:validate|sanitize|parse)(?:Backup|Imported|AppData)\w*\s*=)/i);
  const validator = validatorMatch ? html.slice(validatorMatch.index, validatorMatch.index + 8000) : "";
  collectAssertions([
    ["file-size limit", () => assertContains(importSource, /file\.size[\s\S]{0,160}(?:MAX|LIMIT|\d{5,})|(?:MAX|LIMIT|\d{5,})[\s\S]{0,160}file\.size/, "Backup import must reject oversized files before reading them")],
    ["strict validator", () => assert.ok(validatorMatch, "Backup JSON must pass a dedicated strict validator before normalization")],
    ["validator is called", () => assertContains(importSource, /(?:validate|sanitize|parse)(?:Backup|Imported|AppData)\w*\s*\(\s*imported/i, "Import must call the strict backup validator")],
    ["no wholesale object spread", () => assert.doesNotMatch(importSource, /normalizeLoadedData\s*\(\s*\{[\s\S]{0,120}\.\.\.imported/, "Untrusted backup fields must not be spread wholesale into application state")],
    ["ID validation", () => assertContains(validator, /(?:ID_PATTERN|VALID_ID|validateId|safeId|invalid id)/i, "Session, exercise, set, and template IDs require a strict validation rule")],
    ["field allowlists", () => assertContains(validator, /(?:allowed|allowlist|permitted)[A-Za-z]*(?:Fields|Keys)|(?:Fields|Keys)[A-Za-z]*(?:allowed|allowlist|permitted)/i, "Imported entity fields must be allowlisted")],
    ["executable/prototype fields rejected", () => assertContains(validator, /__proto__|prototype|constructor|\^on|startsWith\(["']on/i, "Executable on* attributes and prototype-pollution fields must be rejected")],
    ["bounded collections", () => assertContains(validator, /MAX_(?:SESSIONS|EXERCISES|SETS|TEMPLATES)|(?:sessions|exercises|sets|templates)\.length[\s\S]{0,100}(?:MAX|LIMIT)/i, "Backup entity counts require explicit bounds")],
    ["duplicate rejection", () => assertContains(validator, /duplicate|seenIds|\.has\s*\([^)]*\.id/i, "Duplicate entity IDs must be rejected")],
    ["referential integrity", () => assertContains(validator, /orphan|sessionIds|exerciseIds|reference/i, "Orphaned exercise, set, and active-plan references must be rejected")],
    ["versioned legacy migration", () => assertContains(validator, /appDataVersion[\s\S]{0,500}(?:legacy|migrat|version)/i, "Supported legacy backups need an explicit versioned migration path")]
  ]);
});

test("cloud workout sync has separate explicit default-off consent and fails closed", () => {
  const defaultsStart = html.indexOf("const defaultSettings");
  assert.notEqual(defaultsStart, -1, "Missing defaultSettings");
  const defaults = html.slice(defaultsStart, defaultsStart + 3500);
  const normalize = functionSource("normalizeLoadedData");
  const queue = functionSource("queueActiveWorkoutSync");
  const flush = functionSource("flushWorkoutSyncQueue");
  const notifications = functionSource("enablePushNotifications");
  const notificationActionWindows = [...html.matchAll(/action\s*===\s*["'](?:request-notifications|toggle-rest-notifications|timer-notifications)["']/g)]
    .map((match) => html.slice(match.index, match.index + 900));
  collectAssertions([
    ["default off", () => assertContains(defaults, /cloudWorkoutSyncConsent\s*:\s*false/, "Cloud workout sync consent must default to false")],
    ["persisted independently", () => assertContains(normalize, /cloudWorkoutSyncConsent\s*:\s*storedSettings\.cloudWorkoutSyncConsent/, "Cloud workout sync consent must have its own persisted setting")],
    ["explicit UI control", () => assertContains(html, /data-action=["']cloud-workout-sync-consent["']/, "Settings must expose a distinct cloud workout sync consent control")],
    ["queue fails closed", () => assertContains(queue, /cloudWorkoutSyncConsent\s*!==\s*true|cloudWorkoutSyncConsent\s*===\s*true/, "Queueing must require explicit true consent")],
    ["flush fails closed", () => assertContains(flush, /cloudWorkoutSyncConsent\s*!==\s*true|cloudWorkoutSyncConsent\s*===\s*true/, "Flushing must require explicit true consent")],
    ["notification setup remains separate", () => assert.doesNotMatch(notifications, /cloudWorkoutSyncConsent/, "Enabling notifications must not enable workout upload")],
    ["notification toggles remain separate", () => assert.ok(notificationActionWindows.every((source) => !/cloudWorkoutSyncConsent\s*:\s*true/.test(source)), "A notification preference handler must never grant workout-upload consent")]
  ]);
});

test("remote deletion retries deleting responses, retains authorization on failure, and timer cancellation is versioned", () => {
  const cancel = functionSource("cancelRestPush");
  const deletion = functionSourceContaining(/\/api\/install\/delete/, "Missing frontend flow for authenticated remote installation deletion");
  collectAssertions([
    ["cancel carries timer version", () => assertContains(cancel, /timerVersion\s*:\s*Number\s*\(\s*timerSnapshot\.(?:version|timerVersion)/, "Queued and immediate timer cancellation must carry timerVersion")],
    ["deleting is retryable", () => assertContains(deletion, /status\s*===?\s*["']deleting["']|status\s*!==?\s*["']deleted["']/, "HTTP 202 deleting responses must remain retryable")],
    ["deleted is terminal", () => assertContains(deletion, /status\s*===?\s*["']deleted["']/, "Authorization may be discarded only after the server confirms deleted")],
    ["bearer retained until terminal", () => {
      const clearIndex = deletion.search(/pushIdentity\s*=\s*null|token\s*:\s*["']["']/);
      const deletedIndex = deletion.search(/status\s*===?\s*["']deleted["']/);
      assert.ok(clearIndex === -1 || (deletedIndex >= 0 && clearIndex > deletedIndex), "A failed or 202 deletion must retain the bearer needed to retry");
    }]
  ]);
});

test("quick-start cards retain native button semantics", () => {
  const source = functionSource("renderQuickStartTemplates");
  assertContains(source, /<button\s+class="quick-template-card[^>]*\stype="button"/, "Every quick-start card must remain a native type=button control");
  assert.doesNotMatch(source, /<(?:div|article|a)[^>]*class="quick-template-card[^>]*role="button"/, "Quick-start must not regress to a simulated button");
});

test("navigation, dialogs, and Lift controls expose complete focus and naming contracts", () => {
  const setTab = functionSource("setActiveTab");
  const openDialog = functionSource("openTemplateStart");
  const closeDialog = functionSource("closeTemplateStart");
  const exercise = functionSource("renderExercise");
  const actionTags = [...exercise.matchAll(/<button[^>]*data-action="(?:move-exercise|delete-exercise)"[^>]*>/g)].map((match) => match[0]);
  const equipmentGroups = [...html.matchAll(/<section\s+class="equipment-picker"[^>]*>/g)].map((match) => match[0]);
  const scopeGroups = [...html.matchAll(/<section\s+class="muscle-scope-panel"[^>]*>/g)].map((match) => match[0]);
  collectAssertions([
    ["skip link", () => assertContains(html, /<a[^>]+href=["']#main-content["'][^>]*>[^<]*(?:skip|content)/i, "Provide a keyboard-visible skip link to main content")],
    ["main target", () => assertContains(html, /<main[^>]+id=["']main-content["'][^>]*tabindex=["']-1["']|<main[^>]+tabindex=["']-1["'][^>]*id=["']main-content["']/, "The main content target must be programmatically focusable")],
    ["primary-tab focus", () => assertContains(setTab, /\.focus\s*\(/, "Primary-tab navigation must move focus to the new view heading or main region")],
    ["dialog trigger captured", () => assertContains(openDialog, /document\.activeElement|returnFocus|focusOrigin|dialogTrigger/i, "Opening a dialog must capture its focus origin")],
    ["dialog close restores focus", () => assertContains(closeDialog, /\.focus\s*\(|restoreFocus/i, "Closing a dialog must restore focus to its trigger")],
    ["contextual Lift action names", () => assert.ok(actionTags.length >= 3 && actionTags.every((tag) => /aria-label=/.test(tag) && /exercise\.name/.test(tag)), `Move/delete controls need exercise-specific accessible names; received ${actionTags.join(" | ")}`)],
    ["Available Equipment group name", () => assert.ok(equipmentGroups.length && equipmentGroups.every((tag) => /role="group"/.test(tag) && /aria-label="Available Equipment"|aria-labelledby=/.test(tag)), "Every Available Equipment picker must be a named group")],
    ["Muscle Group Scope group name", () => assert.ok(scopeGroups.length && scopeGroups.every((tag) => /role="group"/.test(tag) && /aria-label="Muscle Group Scope"|aria-labelledby=/.test(tag)), "Every Muscle Group Scope picker must be a named group")]
  ]);
});

test("loaded-data normalization uses an indexed set lookup", () => {
  const source = functionSource("normalizeLoadedData");
  collectAssertions([
    ["no quadratic set scan", () => assert.doesNotMatch(source, /model\.sets\.filter\s*\(\s*\(set\)\s*=>\s*set\.exerciseId\s*===\s*exercise\.id/, "Do not rescan every set for every exercise")],
    ["set index constructed", () => assertContains(source, /(?:setsByExercise|setIdsByExercise|setsForExerciseById)[\s\S]{0,180}new Map\s*\(|new Map\s*\([\s\S]{0,180}(?:setsByExercise|setIdsByExercise|setsForExerciseById)/, "Build a Map keyed by exercise ID before normalizing exercises")],
    ["indexed lookup used", () => assertContains(source, /(?:setsByExercise|setIdsByExercise|setsForExerciseById)\.get\s*\(\s*exercise\.id\s*\)/, "Exercise normalization must retrieve sets from the index")]
  ]);
});

test("evidence startup fetches public research at most once", () => {
  const source = functionSource("initializePrescriptionEvidence");
  const researchLoads = source.match(/loadEvidenceFromUrls\s*\(\s*\{\s*researchBaseUrl/g) || [];
  assert.ok(researchLoads.length <= 1, `initializePrescriptionEvidence performs ${researchLoads.length} full research loads; optional personal-source probing must reuse one public research bundle`);
});

(async function run() {
  let passed = 0;
  const failures = [];
  for (const item of tests) {
    try {
      await item.fn();
      passed += 1;
      console.log(`PASS ${item.name}`);
    } catch (error) {
      failures.push({ name: item.name, error });
      console.error(`FAIL ${item.name}`);
      console.error(String(error?.message || error));
    }
  }
  console.log(`\nApp integration red harness: ${passed}/${tests.length} contracts currently pass.`);
  if (failures.length) {
    console.error(`${failures.length} frontend integration contract(s) remain red.`);
    process.exitCode = 1;
  }
})();
