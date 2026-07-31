"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const foundation = fs.readFileSync("app-foundation.js", "utf8");
const workout = fs.readFileSync("app-workout.js", "utf8");
const views = fs.readFileSync("app-views.js", "utf8");
const interactions = fs.readFileSync("app.js", "utf8");
const imports = fs.readFileSync("app-import.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${name}`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `Missing body for ${name}`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`Unclosed ${name}`);
}

assert.match(views, /canReturnToActiveSession = historyReadOnly && hasActiveWorkout\(\)[\s\S]*data-action="return-to-active-session"/, "History opened during a workout must expose a dedicated return affordance");
assert.match(foundation, /priorExerciseId: entry\.exercise\.id/, "Comparable prior sets must retain the exact submitted exercise identity");
assert.match(views, /data-action="open-session"[\s\S]*data-exercise-id="[\s\S]*data-return-exercise-id="/, "Previous must carry both the historical and active exercise identities");
assert.match(interactions, /action === "return-to-active-session"[\s\S]*activeSessionId = activeWorkoutId;[\s\S]*viewingHistorySessionId = "";[\s\S]*workoutFocusExerciseId = returnExerciseId;[\s\S]*focusWorkoutExercise\(returnExerciseId\)/, "Returning must restore the canonical active workout and its originating exercise");
assert.match(html, /\.return-active-session-fab \{[^}]*bottom: calc\(86px \+ env\(safe-area-inset-bottom\)\);[^}]*position: fixed;[^}]*z-index: 18;/, "The return affordance must float above navigation and safe-area insets");

assert.match(views, /function renderStandardWorkloadControls\([\s\S]*numericStepper\(\{ field: "sets"[\s\S]*numericStepper\(\{ field: "rep-min"[\s\S]*numericStepper\(\{ field: "rep-max"/, "Every exercise default editor must expose the variant-owned set and rep targets");
assert.doesNotMatch(extractFunction(views, "renderStandardWorkloadControls"), /recommendationSnapshotForDisplay|unifiedPrescriptionSnapshot|renderRecommendation/, "Editing stable exercise targets must not revive a recommendation snapshot or renderer");
assert.match(views, /numericStepper\(\{ field: "target-rpe-min"[\s\S]*numericStepper\(\{ field: "target-rpe-max"[\s\S]*numericStepper\(\{ field: "working-rest"/, "Shared defaults must expose an exact target RPE range beside the dose and rest targets");
assert.match(views, /numericStepper\(\{ field: "working-rest"[\s\S]*numericStepper\(\{ field: "warmup-rest"/, "Shared defaults must distinguish warm-up and working-set rest");
assert.match(views, /data-individual-set-disclosure[\s\S]*Drop sets, different reps, RPE or rest/, "The per-set targets must stay behind a nested disclosure");
assert.match(views, /data-set-default-field="type"[\s\S]*field: "rep-min"[\s\S]*field: "target-rpe-min"[\s\S]*field: "target-rpe-max"[\s\S]*field: "rest"[\s\S]*setField: true/, "The nested editor must expose independent type, rep range, RPE range, and rest targets per set");
assert.match(views, /data-numeric-stepper[\s\S]*data-action="adjust-exercise-default"[\s\S]*Decrease[\s\S]*Increase/, "Exercise defaults must use the bounded down/value/up stepper pattern");
assert.doesNotMatch(views, /Program benchmark|Broad exercise guidance|guidance-benchmark-strip/, "The normal workout editor must not retain a research benchmark card");
assert.match(interactions, /action === "adjust-exercise-default"[\s\S]*data-numeric-stepper[\s\S]*dispatchEvent\(new Event\("input"/, "Stepper buttons must update the native numeric input and its existing delegated behavior");
assert.match(views, /data-action="apply-standard-workload"/, "Exercise defaults must expose an explicit apply action");
assert.doesNotMatch(views, /data-standard-save-template/, "Applying workout targets must not retain an inline routine-mutation toggle");
assert.match(views, /data-action="update-template-exercise"[\s\S]*Save today’s targets to routine[\s\S]*only action here that changes the routine/, "Template workouts must expose a separate explicit routine-save action");
assert.match(interactions, /action === "apply-standard-workload"[\s\S]*applyExerciseDefaultTargets/, "The exercise-default action must route through the workout-only audited target writer");
assert.match(interactions, /changedControl\.matches\?\.\("\[data-default-field\]"\)[\s\S]*enabled\.value = "false"[\s\S]*changedControl\.matches\?\.\("\[data-set-default-field\]"\)[\s\S]*enabled\.value = "true"/, "The most recently edited shared or individual target surface must become authoritative");
const applyExerciseDefaultTargetsSource = extractFunction(workout, "applyExerciseDefaultTargets");
assert.match(applyExerciseDefaultTargetsSource, /completedWorking[\s\S]*desiredIncompletePlan/, "Applying exercise defaults must preserve completed work and rebuild only unfinished rows");
assert.match(applyExerciseDefaultTargetsSource, /action: "exercise_default_targets"/, "Applying exercise defaults must append the audited workout-only action");
assert.doesNotMatch(applyExerciseDefaultTargetsSource, /patchTemplateExercise|setTypes:|warmups:/, "Applying current-workout defaults must not silently mutate the source routine");
assert.match(workout, /function updateTemplateFromExercise\([\s\S]*patchTemplateExercise\([\s\S]*setTypes: templateSetTypesFromHistory[\s\S]*warmups:/, "The separate explicit routine-save action must persist exact working and warm-up targets");
assert.doesNotMatch(workout, /standardWorkloadOverride/, "The deleted target-ownership gate must not remain in the active workout writer");
assert.match(workout, /sessions: data\.sessions\.map\([\s\S]*updatedAt: now[\s\S]*manualOverrides: \[\.\.\.data\.manualOverrides, overrideEntry\]/, "Applying exercise defaults must update the owning active session and its top-level audit ledger");
assert.match(workout, /targetRpeMin > targetRpeMax[\s\S]*Choose an ordered target RPE range from 1 to 10 in 0\.5 steps/, "Shared defaults must reject reversed or off-step target RPE ranges");
assert.match(workout, /rowTargetRpeMin > rowTargetRpeMax[\s\S]*needs an ordered target RPE range from 1 to 10 in 0\.5 steps/, "Individual targets must reject reversed or off-step target RPE ranges");
assert.match(workout, /completedWorking[\s\S]*incompleteWorking[\s\S]*set\.completed[\s\S]*desiredIncompletePlan/, "Applying defaults must preserve completed work and rebuild unfinished working rows only");
assert.match(html, /\.numeric-stepper \{[^}]*grid-template-columns: 44px minmax\(0, 1fr\) 44px[\s\S]*\.range-steppers \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)[\s\S]*\.individual-set-row \{[^}]*grid-template-columns:/, "Shared and individual target editors must retain readable responsive stepper grids");
assert.match(html, /\.individual-set-row \.numeric-stepper \{[^}]*grid-template-columns: 36px minmax\(52px, 1fr\) 36px;[\s\S]*\.individual-set-row \.numeric-stepper button \{[^}]*min-width: 36px;[\s\S]*\.individual-set-row \.numeric-stepper input \{[^}]*min-width: 52px;/, "Individual set targets must reserve more room for the numeric value while shrinking their arrow controls");
assert.match(html, /@media \(max-width: 360px\)[\s\S]*\.individual-set-row \.range-steppers \{ grid-template-columns: minmax\(0, 1fr\); \}/, "Very narrow screens must stack individual min/max steppers instead of clipping their values");
assert.match(html, /:where\(\.compact-disclosure,[\s\S]*\) > summary::after \{[\s\S]*content: "[^"]+";[\s\S]*\}\s*:where\(\.compact-disclosure,[\s\S]*\)\[open\] > summary::after \{[\s\S]*background: var\(--rest-accent\);[\s\S]*transform: rotate\(180deg\);/, "Section disclosures must render one persistent caret that rotates and gains the quiet rest accent when open");
assert.match(workout, /function stableSetTypesForWorkoutStart\([\s\S]*const sourceTypes = \(templateExercise\.setTypes \|\| \[\]\)[\s\S]*repMin: Math\.max\(1, Number\(type\.repMin \|\| templateExercise\.repMin[\s\S]*repMax: Math\.max\(1, Number\(type\.repMax \|\| templateExercise\.repMax/, "Workout start must project each saved routine role and its stable rep range without a normal analytical prescription writer");
assert.match(workout, /function factualSetPrefillForWorkoutStart\([\s\S]*const sameRole = \(previousSets \|\| \[\]\)\.filter[\s\S]*previousComparableSet[\s\S]*const priorLoad = previousComparableSet \? resistanceLoad[\s\S]*const reps = Number\(previousComparableSet\?\.reps/, "Workout start must prefill load and reps only from factual same-role prior performance");
assert.match(imports, /"repMin", "repMax", "standardWorkloadOverride", "standardRoleWorkload"/, "Backup validation must accept legacy shared and role-specific workload fields for migration");
assert.doesNotMatch(imports, /role workload requires an enabled standard workload override/, "Legacy role targets must migrate without reviving the deleted ownership gate");
const startTemplate = extractFunction(workout, "startTemplate");
assert.match(startTemplate, /stableTargetForTemplateExercise\(templateExercise,/, "Workout start must construct each exercise from its stable variant target");
assert.match(startTemplate, /session\.resolvedActions = [\s\S]{0,160}resolveWorkoutExceptions\(/, "Workout start must persist the canonical exception result before projecting exercises");
assert.match(startTemplate, /resolvedActionForVariant\(session\.resolvedActions, exerciseVariantId\)[\s\S]*applyResolvedActionToStableTarget\(historyTarget, resolvedAction\)/, "Only a canonical resolved action may prospectively reduce the stable target");
assert.match(startTemplate, /stableTargetSnapshot:[\s\S]*resolvedActionId:/, "The started exercise must preserve both its stable facts and canonical exception identity");
assert.doesNotMatch(startTemplate, /coachTargetForTemplateExercise|adjustTargetForRecovery|unifiedPrescriptionSnapshot|prescriptionSnapshotWithTemplateStandard/, "Workout start must not invoke the legacy recommendation or readiness-target pipeline");
assert.doesNotMatch(startTemplate, /recommendationHistory|recommendationSnapshot:\s*target|applyManualOverride/, "Workout start must not create recommendation snapshots or engine manual overrides");
assert.match(startTemplate, /delete session\.workoutPrescription/, "Starting a current workout must remove any replaceable draft prescription payload");
assert.match(foundation, /function resolveWorkoutExceptions\([\s\S]*applyDecisionHandling\(decision, handling\)/, "Explicit user handling of a resolved safety action must remain auditable");

console.log("Active-workout return and standard-workload contracts passed.");
