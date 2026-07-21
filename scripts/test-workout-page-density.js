"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const views = fs.readFileSync("app-views.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const workout = views.slice(views.indexOf("function renderWorkout()"), views.indexOf("function renderLiftHome()"));
const exercise = views.slice(views.indexOf("function renderExercise(exercise)"), views.indexOf("function renderSet(set, exercise"));
const setRenderer = views.slice(views.indexOf("function renderSet(set, exercise"), views.indexOf("function renderPrescriptionBrief(exercise)"));

assert.doesNotMatch(workout, /Workout board|renderWorkoutSessionBoard|sessionBoardHtml/, "Today must not render the removed Workout Board");
assert.doesNotMatch(workout, /adjustmentSummary|renderRecoveryPanel|renderActiveWorkoutAdvice/, "Today must not append recovery adjustments below the logger");
assert.match(workout, /const session = activeSession\(\);\s*if \(!session\) return renderLiftHome\(\);\s*if \(liftHomeIsVisible\(\)\)/, "Today must fail safely before reading fields from a missing session");
assert.match(exercise, /class="resistance-type-disclosure"[\s\S]*<summary>Resistance/, "Resistance type must be an inline disclosure beside deload");
assert.match(exercise, /class="exercise-set-actions"/, "Exercise set actions must use the compact action rail");
assert.match(setRenderer, /class="set-field set-previous"/, "Previous load, reps, and RPE must render in one compact column beside the current fields");
assert.doesNotMatch(setRenderer, /set-field-history|historyMarkup/, "Previous performance must not repeat below every editable field");
assert.match(setRenderer, /class="set-tools-disclosure"/, "Secondary set controls must collapse behind one compact disclosure");
assert.match(setRenderer, /class="set-progress-disclosure"/, "Progress When must be collapsed behind a native disclosure");
assert.doesNotMatch(setRenderer, /set-prescription-context/, "The removed block-level prescription grid must not return");
assert.match(html, /\.compact-workout-layout \{[^}]*grid-template-columns: minmax\(0, 1fr\) !important;/, "The compact logger must not reserve an empty Workout Board column");
assert.match(html, /\.exercise-set-actions button \{[^}]*border-radius: 999px;/, "Set actions must use the sleek pill treatment");
assert.match(html, /\.set-progress-disclosure > summary \{[^}]*min-height: 44px;/, "Collapsed progression rows must retain a 44 px touch target");
assert.match(html, /\.set-tools-disclosure:not\(\[open\]\) \{[^}]*height: 0;/, "A collapsed set must not reserve vertical space for secondary controls");
assert.match(html, /\.workout-view \.set-actions \.mini-button \{[^}]*min-height: 44px;/, "Compact set actions must retain a 44 px touch target");

console.log("Compact workout-page presentation contract passed.");
