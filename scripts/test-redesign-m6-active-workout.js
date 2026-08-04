"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const foundation = read("app-foundation.js");
const views = read("app-views.js");
const workout = read("app-workout.js");
const sync = read("app-sync.js");
const history = read("app-history.js");
const imports = read("app-import.js");
const interactions = read("app.js");
const html = read("index.html");

function functionSource(input, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(input);
  assert.ok(match, `Missing production function ${name}`);
  const paramsStart = input.indexOf("(", match.index);
  let paramsDepth = 0;
  let paramsQuote = "";
  let paramsEscaped = false;
  let paramsEnd = -1;
  for (let index = paramsStart; index < input.length; index += 1) {
    const current = input[index];
    if (paramsQuote) {
      if (paramsEscaped) paramsEscaped = false;
      else if (current === "\\") paramsEscaped = true;
      else if (current === paramsQuote) paramsQuote = "";
      continue;
    }
    if (current === "'" || current === '"' || current === "`") {
      paramsQuote = current;
      continue;
    }
    if (current === "(") paramsDepth += 1;
    if (current === ")") {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        paramsEnd = index;
        break;
      }
    }
  }
  assert.notEqual(paramsEnd, -1, `Missing parameter terminator for ${name}`);
  const bodyStart = input.indexOf("{", paramsEnd + 1);
  assert.notEqual(bodyStart, -1, `Missing body for ${name}`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < input.length; index += 1) {
    const current = input[index];
    const next = input[index + 1];
    if (lineComment) {
      if (current === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === quote) quote = "";
      continue;
    }
    if (current === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (current === "'" || current === '"' || current === "`") {
      quote = current;
      continue;
    }
    if (current === "{") depth += 1;
    if (current === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(match.index, index + 1);
    }
  }
  assert.fail(`Unclosed production function ${name}`);
}

const renderWorkout = functionSource(views, "renderWorkout");
const renderExercise = functionSource(views, "renderExercise");
const renderSet = functionSource(views, "renderSet");
const renderTimer = functionSource(views, "renderTimer");
const substitute = functionSource(workout, "applyExerciseSubstitution");
const addExercise = functionSource(workout, "addExercise");
const patchSetValue = functionSource(workout, "patchSetValue");
const patchSession = functionSource(workout, "patchSession");
const patchExercise = functionSource(workout, "patchExercise");
const patchTemplate = functionSource(workout, "patchTemplate");
const userSelectedIdentity = functionSource(workout, "userSelectedExerciseIdentity");
const stableCustomIdentity = functionSource(foundation, "stableCustomPerformanceExerciseId");
const normalizeLoadedData = functionSource(foundation, "normalizeLoadedData");
const activeDraftSnapshot = functionSource(foundation, "activeWorkoutDraftSnapshot");
const validateActiveDraft = functionSource(foundation, "validateActiveWorkoutDraftEnvelope");
const restoreActiveDraft = functionSource(foundation, "restoreActiveWorkoutDraft");
const updateTemplate = functionSource(workout, "updateTemplateFromExercise");
const patchTemplateName = functionSource(workout, "patchTemplateExerciseName");
const startTemplate = functionSource(workout, "startTemplate");
const validateImport = functionSource(imports, "validateImportedAppData");
const importDataFile = functionSource(imports, "importDataFile");
const submitWorkoutPrs = functionSource(history, "submitWorkoutPrs");

const deletedPresentationSource = [views, workout, history, interactions, html].join("\n");
assert.doesNotMatch(deletedPresentationSource, /plate-calculator|plate-diagram|Plate calculator|renderPlateCalculator|isBarbellExercise/, "M6 must delete the plate calculator code, markup, and styles");
assert.doesNotMatch(views, /renderExecutionQualityAssessment|exercise-execution-quality|Execution quality/, "The active and completion presentation must not retain the execution-quality questionnaire");
assert.doesNotMatch(workout, /executionQualityAssessment/, "Active-workout creation and mutation must not write a new execution-quality value");
assert.doesNotMatch(history, /executionQualityAssessment/, "Completion and grade code must not read or write the deleted live questionnaire");
assert.doesNotMatch(interactions, /exercise-execution-quality|executionQualityAssessment/, "Delegated events must not retain an execution-quality writer");
assert.doesNotMatch(foundation.match(/const defaultSettings\s*=\s*\{[\s\S]*?\n\s*\};/)?.[0] || "", /executionQuality/i, "M6 must not introduce a replacement execution-quality default");

assert.match(imports, /allowedExerciseFields[\s\S]*"executionQualityAssessment"/, "Historical execution-quality observations must remain import-readable");
assert.match(imports, /executionQualityAssessment[\s\S]*\["controlled",\s*"breakdown",\s*"not_assessed"\]/, "The compatibility reader must validate the historical vocabulary");
assert.match(foundation, /executionQualityValues[\s\S]*exercise\.executionQualityAssessment[\s\S]*executionQualityAssessment/, "Loaded historical execution-quality observations must be preserved without creating new values");
assert.match(validateImport, /appDataVersion[\s\S]*\[1,\s*2,\s*3\]/, "The import boundary must continue accepting supported legacy-v1 history");
assert.match(validateImport, /executionQualityAssessment[\s\S]*throw new Error\(`Exercise \$\{index \+ 1\} execution quality is invalid\.`\)/, "The import boundary must reject invented execution-quality values");
assert.match(validateImport, /validateTemplateWarmups[\s\S]*allowedFields[\s\S]*numericDomains[\s\S]*targetRepMin[\s\S]*targetRepMax[\s\S]*targetRpeMin[\s\S]*targetRpeMax/, "Nested template warm-ups must have an explicit allowlist, numeric domains, and ordered target bounds");
assert.match(validateImport, /validateTemplateSetTypes[\s\S]*allowedFields[\s\S]*validTypes[\s\S]*rawType === "working" \? "straight"[\s\S]*delete copied\.count[\s\S]*copied\.setCount = count/, "Nested set roles must have an explicit allowlist and normalize legacy working/count records");
assert.match(validateImport, /totalSetCount[\s\S]*totalSetCount > 100/, "Nested set roles must reject templates describing more than 100 total sets");
assert.match(importDataFile, /validateAndSanitizeBackup[\s\S]*decodeLegacyBackup[\s\S]*validateImportedAppData/, "Every backup version must traverse the strict envelope, legacy decoder, and active import validator in order");
assert.match(normalizeLoadedData, /const submittedExercise = submittedSessionIds\.has\(exercise\.sessionId\)[\s\S]*if \(!submittedExercise\)/, "Compatibility cleanup must distinguish mutable active work from immutable submitted history");
assert.match(normalizeLoadedData, /if \(!submittedExercise\)[\s\S]*delete retainedExercise\.executionQualityAssessment/, "Active exercise normalization must delete the historical-only execution-quality field before re-save");
assert.match(normalizeLoadedData, /if \(!isSessionSubmitted\(normalizedSession\)\) delete normalizedSession\.exerciseQualityAnswers/, "Active session normalization must delete the historical-only execution-quality answer container");
assert.doesNotMatch(normalizeLoadedData, /\?\.finalPrescription|finalPrescription\?\./, "Active normalization must not read the obsolete final-prescription fallback");
assert.doesNotMatch(normalizeLoadedData, /delete retainedExercise\.(?:recommendationSnapshot|originalPrescription|basePrescription|finalPrescription|prescription|setPrescription|programTargetContext|appliedTargetContext)/, "Active-draft audit and prescription references must survive compatibility normalization");
assert.doesNotMatch(renderExercise, /recommendationSnapshot|originalPrescription|basePrescription|finalPrescription|programTargetContext|appliedTargetContext/, "Preserved legacy audit references must remain inert in the active logger");
assert.match(submitWorkoutPrs, /isSessionSubmitted\(item\)[\s\S]*sessionComesBefore\(item,\s*session\)/, "PR comparisons must scan all earlier submitted sessions");
assert.doesNotMatch(submitWorkoutPrs, /six|6\s*\*\s*30|month|183|180\s*\*\s*24|Date\.now\(\)\s*-/, "Lifetime PR comparisons must not apply the recent six-month display window");

assert.match(renderExercise, /escapeHtml\(exercise\.name\)/, "The full actual exercise/variant name must remain visible");
assert.doesNotMatch(renderExercise, /exercise\.name\.(?:slice|substring)|truncate|text-overflow/, "A meaningful exercise-variant suffix must not be truncated in markup");
assert.match(renderExercise, /targetRepMin[\s\S]*targetRepMax[\s\S]*targetRpe/, "The active exercise header must derive its stable target from the stored set target facts");

assert.match(views, /data-action="exercise-substitute-name"/, "The active logger must expose the planned ordinary-substitution name selector");
assert.match(views, /data-action="apply-exercise-substitution"/, "The active logger must expose a separate Apply substitution action");
assert.match(interactions, /action === "apply-exercise-substitution"[\s\S]*applyExerciseSubstitution/, "The delegated action must use one substitution mutation boundary");
assert.match(substitute, /field:\s*"exerciseVariant"/, "Substitution must record an exercise-variant override");
assert.match(substitute, /action:\s*"substitute_exercise"/, "Substitution must use the auditable action vocabulary");
assert.match(substitute, /lockedForWorkout:\s*true/, "The substitution override must be scoped to the actual workout");
assert.match(substitute, /from:\s*\{[\s\S]*name[\s\S]*performanceExerciseId[\s\S]*researchExerciseId[\s\S]*\}/, "The override must retain the original actual identity");
assert.match(substitute, /to:\s*\{[\s\S]*name[\s\S]*performanceExerciseId[\s\S]*researchExerciseId[\s\S]*\}/, "The override must retain the replacement actual identity");
assert.match(substitute, /identitySource/, "The replacement must receive its own resolved identity source");
assert.match(userSelectedIdentity, /identitySource === "user_declared_custom"/, "An existing exact custom variant must retain its stable identity");
assert.match(userSelectedIdentity, /stableCustomPerformanceExerciseId\(name\)/, "Custom substitution must delegate generated IDs to the shared bounded identity helper");
assert.match(stableCustomIdentity, /const slug[\s\S]*\.slice\(0,\s*112\)[\s\S]*fingerprint[\s\S]*`custom_\$\{slug\}_\$\{[\s\S]*padStart\(8,\s*"0"\)/, "The shared identity helper must cap the slug and add a deterministic hash below the 128-character ID limit");
assert.match(userSelectedIdentity, /researchExerciseId:\s*""[\s\S]*identitySource:\s*"user_declared_custom"/, "An unmapped custom variant must not borrow a canonical research identity");
assert.match(substitute, /const name = String\(requestedName \|\| ""\)\.trim\(\)[\s\S]*name\.length > 256[\s\S]*return/, "Substitution must accept the full 256-character name and reject longer variants before mutation");
assert.match(addExercise, /const name = String\(addExerciseDraft \|\| ""\)\.trim\(\)[\s\S]*name\.length > 256[\s\S]*userSelectedExerciseIdentity\(name\)/, "Add Exercise must normalize the display name once and enforce the same 256-character boundary");
assert.doesNotMatch(substitute, /addExerciseSetCount|addExerciseRepMin|addExerciseRepMax|addExerciseTargetRpe|addExerciseRestSeconds/, "Ordinary substitution must not depend on the separate Add Exercise target draft");
for (const action of ["add-exercise-set-count", "add-exercise-rep-min", "add-exercise-rep-max", "add-exercise-target-rpe", "add-exercise-rest-seconds"]) {
  assert.match(renderWorkout, new RegExp(`data-action="${action}"`), `Add Exercise must visibly expose ${action}`);
}
assert.match(addExercise, /const setCount = Number\(addExerciseSetCount\)[\s\S]*const repMin = Number\(addExerciseRepMin\)[\s\S]*const repMax = Number\(addExerciseRepMax\)[\s\S]*const targetRpe = Number\(addExerciseTargetRpe\)[\s\S]*const restSeconds = Number\(addExerciseRestSeconds/, "Add Exercise must parse its visible stable-target draft inside its own mutation boundary");
assert.match(addExercise, /setCount < 1[\s\S]*repMin > repMax[\s\S]*targetRpe \* 2[\s\S]*restSeconds > 3600[\s\S]*return/, "Add Exercise must fail closed on invalid set, rep-range, half-step RPE, or rest targets");
assert.match(addExercise, /stableTargetSnapshot:\s*\{\s*sets:\s*setCount,\s*repLow:\s*repMin,\s*repHigh:\s*repMax,\s*rpe:\s*targetRpe,\s*restSeconds\s*\}[\s\S]*Array\.from\(\{\s*length:\s*setCount\s*\}[\s\S]*targetRepMin:\s*repMin[\s\S]*targetRepMax:\s*repMax[\s\S]*targetRpe[\s\S]*targetRestSeconds:\s*restSeconds/, "A new exercise must create target-complete working rows from the visible stable targets");
assert.match(patchSetValue, /const domains[\s\S]*reps:\s*\{\s*min:\s*0,\s*integer:\s*true[\s\S]*weight:\s*\{\s*min:\s*0[\s\S]*rpe:\s*\{\s*min:\s*0,\s*max:\s*10,\s*step:\s*0\.5[\s\S]*durationSeconds:\s*\{\s*min:\s*0,\s*integer:\s*true[\s\S]*distance:\s*\{\s*min:\s*0/, "Set writers must enforce integer reps/duration, non-negative load/distance, and half-step RPE");
assert.match(patchSetValue, /if \(invalid\)[\s\S]*return false;[\s\S]*acknowledgeActiveSet\(setId\)/, "Invalid set input must be rejected before acknowledging or mutating the active set");
assert.match(patchSetValue, /field === "weight"[\s\S]*patch\.weightUnit = data\.settings\.weightUnit/, "Editing a load must store the current display unit on that set");
assert.match(patchSession, /patch\.title\.length > 256[\s\S]*return false[\s\S]*patch\.notes\.length > 4096[\s\S]*return false/, "Session storage must reject titles over 256 and notes over 4,096 before mutation");
assert.match(patchExercise, /patch\.notes\.length > 4096[\s\S]*return false/, "Exercise storage must reject notes over 4,096 before mutation");
assert.match(patchTemplate, /patch\.name\.length > 256[\s\S]*return false[\s\S]*patch\.notes\.length > 4096[\s\S]*return false/, "Routine storage must reject names over 256 and notes over 4,096 before mutation");
assert.match(views, /data-action="session-title"[\s\S]*maxlength="256"/, "The visible workout title editor must expose the 256-character boundary");
assert.match(views, /data-action="session-notes"[\s\S]*maxlength="4096"/, "The visible workout note editor must expose the 4,096-character boundary");
assert.match(patchTemplateName, /const normalizedName = String\(name \|\| ""\)\.trim\(\)[\s\S]*normalizedName\.length > 256[\s\S]*return/, "Routine rename must reject an overlong name before mutating the routine");
assert.match(patchTemplateName, /exercise\.identitySource === "user_declared_custom"[\s\S]*exerciseIdentityFields\(\{\s*\.\.\.exercise,\s*name:\s*normalizedName\s*\}\)[\s\S]*userSelectedExerciseIdentity\(normalizedName\)/, "Routine rename must preserve a declared custom ID while resolving a different known/base variant to a separate identity");
assert.match(startTemplate, /name:\s*templateExercise\.name[\s\S]*exerciseIdentityFields\(templateExercise\)/, "Routine start must carry the full stored name and bounded stable identity into the active workout");
assert.match(startTemplate, /getMostRecentWorkoutSets\(templateExercise\.name[\s\S]*canonicalExerciseId:\s*templateExercise\.performanceExerciseId/, "Routine start must query prior comparable history with the renamed variant identity");
assert.match(substitute, /completed[\s\S]*incomplete|incomplete[\s\S]*completed/, "Completed source work and incomplete replacement work must be separated");
assert.match(substitute, /if \(!incompleteIds\.size\)[\s\S]*stableTargetSnapshot[\s\S]*normalizeSetTypeCode\(source\.setType[\s\S]*=== "warmup" \? "straight"/, "Warm-up-only recorded work must seed a non-warm-up replacement set from stable working targets");
assert.match(substitute, /isWarmup:\s*false[\s\S]*countsTowardProgression:\s*true/, "The seeded replacement row must be an incomplete progression-eligible working set");
assert.doesNotMatch(substitute, /countsTowardScore:\s*|countsTowardVolume:\s*/, "New replacement rows must not write obsolete score or volume flags");
assert.doesNotMatch(substitute, /data\.manualOverrides/, "Substitution must not recreate the obsolete aggregate override ledger");
assert.match(substitute, /manualOverrides/, "The actual exercise record must receive the substitution audit entry");
assert.doesNotMatch(substitute, /data\.templates|patchTemplateExercise|updateTemplateFromExercise/, "An ordinary substitution must not mutate routine defaults");
assert.match(interactions, /action === "update-template-exercise"[\s\S]*updateTemplateFromExercise/, "Routine mutation must remain a separate explicit action");
assert.match(updateTemplate, /patchTemplateExercise/, "The explicit routine-save path must remain available");
assert.match(updateTemplate, /const substitutions[\s\S]*routineSourceSubstitution = substitutions\[0\][\s\S]*sourcePerformanceId/, "Multi-hop routine save must resolve the routine slot from the earliest substitution source identity");
assert.match(updateTemplate, /structureExerciseIds[\s\S]*exercise\.id[\s\S]*substitutions\.map\(\(entry\) => entry\.exerciseRuntimeId[\s\S]*structureSets/, "Explicit routine save must union every substitution source runtime row with the current replacement");
assert.match(updateTemplate, /workSets\.length[\s\S]*templateSetTypesFromHistory\(workSets[\s\S]*warmupSets\.map/, "Explicit routine save must preserve the complete working-set count, roles, stable targets, and warm-up structure");

assert.equal((views.match(/class="workout-rest-starter/g) || []).length, 1, "The active logger must define exactly one shared rest starter");
assert.match(views, /class="workout-rest-starter[^"]*"[^>]*data-action="start-timer"|data-action="start-timer"[^>]*class="workout-rest-starter/, "The one rest starter must use the established timer action");
assert.match(views, /const sourceSet = completed\.at\(-1\);/, "The shared rest starter must not appear before a completed set exists");
assert.match(foundation, /timer_requires_completed_set/, "Timer authorization must reject incomplete or skipped source sets");
assert.match(renderWorkout, /workout-timer-slot/, "The timer and shared starter must live in the workout-level timer slot");
assert.doesNotMatch(renderSet, /set-rest-button|data-action="start-timer"/, "No set row may repeat a rest-start button");
assert.doesNotMatch(html, /\.set-rest-button/, "Deleted per-set rest-button styling must not remain");

assert.match(renderTimer, /data-phase="\$\{[\s\S]*overtime/, "The timer renderer must expose an explicit overtime phase");
assert.match(renderTimer, /data-timer-progress-label/, "The recoverable timer must retain one stable progress label");
assert.match(renderTimer, /\+/, "The rendered overtime value must be visibly prefixed with +");
assert.match(sync, /dataset\.phase\s*=\s*["']overtime["']|dataset\.phase\s*=[^;\n]*overtime/, "Incremental timer updates must preserve the overtime phase");
assert.match(sync, /progressLabel\.textContent[\s\S]*\+/, "Incremental timer updates must preserve the +mm:ss overtime label");
assert.match(interactions, /visibilitychange[\s\S]*Date\.now\(\)[\s\S]*render|visibilitychange[\s\S]*sync/, "Returning from the background must reconcile timer state from wall-clock time");
assert.match(interactions, /popstate[\s\S]*render/, "Navigation must preserve and re-render the active workout without creating another timer");

for (const field of ["session", "exercises", "sets", "timer", "resolvedActions"]) {
  assert.match(activeDraftSnapshot, new RegExp(`\\b${field}\\b`), `The active-draft snapshot must preserve ${field}`);
}
assert.match(restoreActiveDraft, /candidate\.session/, "Draft recovery must apply the validated session title/notes and elapsed facts");
assert.match(restoreActiveDraft, /candidate\.exercises/, "Draft recovery must apply validated exercise order, names, notes, identities, and overrides");
assert.match(restoreActiveDraft, /candidate\.sets/, "Draft recovery must apply validated entered values, roles, targets, and provenance");
assert.match(restoreActiveDraft, /candidate\.timer/, "Draft recovery must apply one validated timer context");
assert.match(restoreActiveDraft, /workoutState:\s*"active"/, "Recovered data must remain the one mutable active draft");
assert.match(validateActiveDraft, /contractVersion[\s\S]*comprehensive-fitness-active-draft\/2\.0\.0[\s\S]*version/, "Recovery must reject an unknown or malformed draft contract");
assert.match(validateActiveDraft, /isLegacyV1[\s\S]*Number\(snapshot\.version\) === 1/, "Recovery must retain the supported timerless legacy-v1 draft path");
assert.match(validateActiveDraft, /exercise\.order[\s\S]*Number\.isInteger[\s\S]*Number\(exercise\.order\)\s*<\s*0/, "Recovery must reject invalid exercise order");
assert.match(validateActiveDraft, /validSetTypes[\s\S]*set\.setType[\s\S]*return null/, "Recovery must reject an invented set role");
assert.match(validateActiveDraft, /validClassificationSources[\s\S]*set\.classificationSource[\s\S]*return null/, "Recovery must reject invented role provenance");
assert.match(validateActiveDraft, /numericSetDomains[\s\S]*reps:\s*\{\s*min:\s*0,\s*integer:\s*true[\s\S]*durationSeconds:\s*\{\s*min:\s*0,\s*integer:\s*true[\s\S]*rpe:\s*\{\s*min:\s*0,\s*max:\s*10,\s*step:\s*0\.5/, "Recovery must mirror the integer reps/duration and half-step RPE storage domains");
assert.match(validateActiveDraft, /targetRestSeconds:\s*\{\s*min:\s*0,\s*max:\s*3600,\s*integer:\s*true[\s\S]*targetRepMin[\s\S]*targetRepMax[\s\S]*>[\s\S]*targetRpeMin[\s\S]*targetRpeMax[\s\S]*>/, "Recovery must reject excessive target rest and inverted target rep/RPE ranges");
assert.match(validateActiveDraft, /snapshot\.session\.title[\s\S]*length > 256[\s\S]*snapshot\.session\.notes[\s\S]*length > 4096[\s\S]*exercise\.notes[\s\S]*length > 4096/, "Recovery must enforce title and note storage limits before replacement");
assert.match(validateActiveDraft, /durationSeconds\s*<\s*5[\s\S]*durationSeconds\s*>\s*3600/, "Recovery must reject an invalid timer duration");
assert.match(validateActiveDraft, /exerciseIds[\s\S]*setIds[\s\S]*pendingNextSetId/, "Recovery must validate exercise, set, and timer cross-references before replacement");
assert.match(restoreActiveDraft, /if \(!candidate\) return false;[\s\S]*data\.sessions\s*=/, "A failed draft candidate must leave the loaded application state untouched");

console.log("Redesign M6 active-workout contracts passed (deletions, identity-safe substitution, shared/overtime rest, and lossless draft recovery).");
