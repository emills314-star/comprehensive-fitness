# Comprehensive Fitness Simplified Product Specification

**Status:** Phase 1 zero-based product specification  
**Product direction:** Strong-quality logging with exception-based coaching  
**Primary user:** Erik

---

# 1. Product summary

Comprehensive Fitness is a fast personal workout logger with a quiet risk-management layer.

The normal experience is intentionally simple:

1. Open the app.
2. See the expected workout.
3. Start in one tap.
4. See what happened last time.
5. Enter weight, reps, and RPE.
6. Use the rest timer.
7. Finish.
8. See a concise grade and where performance improved.

The intelligence layer stays silent unless the available evidence indicates:

- fatigue;
- a plateau;
- pain or illness;
- a meaningful readiness deviation;
- a need for lighter work; or
- a deload.

Comprehensive Fitness does not require Erik to inspect or manage the logic that produced the alert.

---

# 2. Product architecture

## 2.1 Primary destinations

Comprehensive Fitness has two persistent primary destinations.

### Today

Purpose:

- identify the expected workout;
- show a material pre-workout flag, when one exists;
- start the workout;
- choose another workout when necessary.

### Progress

Purpose:

- review completed workouts;
- inspect exercise or exercise-variant history;
- view PRs;
- understand where and how performance changed;
- view concise exercise-level charts.

## 2.2 Secondary destinations

### Settings

Reached through a gear or profile control.

Contains:

- readiness and wearable integration;
- notifications and timer behavior;
- routine management;
- exercise library/variant management;
- data import/export;
- privacy and support.

### Routine picker

Reached through **Choose another workout** on Today.

It permits:

- selecting a different existing workout;
- starting it;
- opening routine management as a secondary action.

## 2.3 Active workout

An active workout is a full-screen mode. Persistent app navigation is hidden so the user can focus on logging.

If an unfinished workout exists, launching Comprehensive Fitness resumes it by default.

---

# 3. Core information model

This section defines product behavior, not database architecture.

## 3.1 Routine

A routine contains one or more workout days.

Each workout day contains an ordered list of exercise variants.

## 3.2 Exercise variant

An exercise variant is the unit that owns normal targets and history.

Examples:

- `Leg Extension — Heavy`
- `Leg Extension — Light`
- `Bench Press`
- `Cable Curl — Long-Length`

An exercise variant contains:

- display name;
- optional underlying movement family;
- normal working-set count;
- normal rep range;
- target RPE;
- rest target;
- optional notes;
- optional equipment metadata.

The movement family may support internal aggregation. It never prevents the variant from being used.

Heavy and light variants maintain independent progression histories unless Erik explicitly chooses to view them together later.

## 3.3 Workout session

A workout session records the work actually completed, including:

- routine and workout-day origin, when applicable;
- actual exercise order;
- actual exercise variants used;
- actual sets;
- start, pause, resume, and completion times;
- optional session note;
- baseline or changed readiness;
- active flags and whether their action was followed, modified, or dismissed.

## 3.4 Set

A set records:

- load;
- reps;
- RPE;
- completion time;
- rest duration where available;
- inferred or known set role;
- optional note.

The normal user interface requires only load, reps, and RPE.

## 3.5 Readiness record

A readiness record stores:

- `usual baseline` or `changed today`;
- selected manual deviations;
- optional note;
- synced sleep, HRV, and resting heart rate when available.

No daily readiness score is required.

## 3.6 Flag

A flag is a material exception, not a routine recommendation.

Every flag contains:

- category;
- scope;
- primary action;
- one-sentence reason;
- optional supporting details;
- duration or return criterion when relevant;
- severity and confidence internally.

Only the action and concise reason appear by default.

## 3.7 Progress marker

A progress marker is a factual signal, not a coaching essay.

Examples:

- `Top of range last time`
- `Rep PR`
- `Load PR`
- `Same reps at lower RPE`
- `Progress available`

A progress marker may appear compactly. It does not rewrite the exercise's rep range or force a prescription.

---

# 4. Normal workout journey

## 4.1 App launch

When no workout is active, Comprehensive Fitness opens to Today.

Today immediately shows:

- expected workout name;
- expected day or context;
- approximate exercise count;
- optional estimated duration if reliable;
- readiness status: `Using usual readiness`;
- a prominent **Start workout** button;
- **Choose another workout**;
- a material session-level flag, if one exists.

The expected workout card is visible without scrolling.

## 4.2 Starting

Tapping **Start workout** starts the expected workout immediately.

There is no mandatory:

- confirmation modal;
- readiness questionnaire;
- mesocycle check;
- evidence review;
- workout-plan review;
- recommendation summary.

If Erik wants to record changed readiness, he may tap **Readiness** before starting or from the active workout.

## 4.3 First exercise

The active workout opens with:

- exercise position, such as `1 of 6`;
- full exercise-variant name;
- normal rep range;
- target RPE;
- relevant previous performance;
- current set rows;
- active flag, only when applicable.

The first working set is visible without searching through recommendation text.

## 4.4 Logging a set

A set row uses a compact grid:

| Set | Last time | Weight | Reps | RPE | Complete |
|---|---|---|---|---|---|

Behavior:

- Weight, reps, and RPE are prefilled from the most relevant prior set or routine default.
- Tapping a numeric field selects the complete current value.
- Typing replaces the selected value immediately.
- RPE accepts decimal values such as `7.5`.
- RPE can be adjusted in `0.5` increments.
- The user never needs to tap the same digit twice to make the field editable.
- Completing a set records it and starts rest.
- The next set becomes current.
- Completed, current, and pending sets are visually distinct.
- The view does not unexpectedly jump away from the current exercise.

## 4.5 Rest

After set completion:

- the timer starts automatically;
- the remaining time stays visible;
- controls include `−15`, `+15`, and `Skip`;
- rest completion produces the configured sound and haptic;
- lock-screen/live notification support is used when permission exists;
- if the target expires, the display shows elapsed time beyond the target;
- a manual restart control is available in the timer interface.

The timer should not require returning to a separate screen.

## 4.6 Moving through exercises

The user may:

- complete exercises in order;
- choose a later exercise next;
- reorder exercises;
- substitute an exercise;
- create a variant;
- add or remove sets;
- add an exercise;
- skip an exercise.

Actual order is recorded automatically.

---

# 5. Today screen specification

## Purpose

Start the appropriate workout with minimal thought.

## Entry conditions

- app launched without an active workout;
- user returns from Progress;
- user completes or discards a prior workout.

## Visible information

Required:

- expected workout name;
- workout day/context;
- exercise count;
- Start workout;
- Choose another workout;
- `Using usual readiness` or a concise changed-readiness state.

Conditional:

- one material session-level fatigue, deload, pain/illness, or readiness flag;
- most recent workout completion status;
- sync problem only when it affects current behavior.

## Primary action

**Start workout**

## Secondary actions

- Choose another workout
- Readiness
- Settings
- Progress navigation

## State transitions

- Start workout → Active workout
- Choose another workout → Routine picker
- Readiness → Readiness sheet
- Progress → Progress
- Settings → Settings

## Explicitly absent

- full readiness questionnaire;
- weekly muscle-volume dashboard;
- hypertrophy score;
- program score;
- mesocycle builder status;
- exercise portfolio;
- evidence cards;
- normal per-exercise recommendations;
- long analytics feed;
- a scrollable list of every routine day.

---

# 6. Readiness behavior

## 6.1 Default

The default state is:

> Using usual readiness

No form is shown and no input is required.

## 6.2 Changed-readiness sheet

The optional sheet supports quick selection of:

- poor sleep or recovery;
- unusually sore;
- pain or injury;
- illness;
- unusually good readiness;
- other, with note.

When device data is available, it may show:

- sleep duration;
- HRV compared with personal baseline;
- resting heart rate compared with personal baseline.

Device metrics are prefilled context, not required fields.

## 6.3 Result

After a changed-readiness entry:

- the state is recorded;
- any material adjustment appears as one flag;
- the action is explicit;
- no internal readiness score is shown;
- Erik may accept, modify, or dismiss the action;
- the completed session records what he actually did.

## 6.4 No-data behavior

When wearable data is missing or stale:

- do not fabricate a score;
- continue from usual readiness unless Erik logs a deviation;
- show sync status only in the optional detail or Settings unless it materially affects a flag.

---

# 7. Active workout screen specification

## Purpose

Record the workout quickly while keeping the current exercise, historical context, and rest status clear.

## Entry conditions

- workout started;
- active workout resumed.

## Visible information

### Header

- workout name;
- elapsed session time;
- exercise progress;
- Finish;
- overflow for notes, readiness, and cancel.

### Current exercise

- full exercise-variant name;
- normal rep range;
- target RPE;
- previous workout date;
- relevant prior working-set values;
- compact progress marker when applicable;
- flag card only when applicable;
- set rows.

### Secondary exercise controls

- Add set
- Substitute
- Reorder/Do next
- Add note
- Exercise settings

### Persistent rest area

- remaining or elapsed rest;
- `−15`;
- `+15`;
- `Skip`;
- manual restart when needed.

## Primary action

Complete the current set.

## Secondary actions

Modify inputs, change exercise order, substitute, add/remove set, log readiness change, finish, or cancel.

## State transitions

- Complete set → Record set, start rest, advance current set
- Substitute → Exercise picker/variant creator
- Finish → Finish confirmation
- Confirm finish → Completion summary
- Cancel → Destructive confirmation
- Close/relaunch app → Resume active workout

## Explicitly absent

- a paragraph explaining the normal prescription;
- program-wide volume information;
- research citations;
- candidate exercises unless substitution is opened;
- mesocycle navigation;
- hypertrophy score;
- confidence score;
- direct/fractional set math;
- multiple competing recommendation cards;
- mandatory set-type selection.

---

# 8. Exercise card and set-row behavior

## 8.1 Exercise header

The exercise header must answer:

1. What exercise variant is this?
2. What is the normal rep range?
3. What is the target RPE?
4. What happened last time?
5. Is there a material reason not to proceed normally?

It should not answer every analytical question the engine could calculate.

## 8.2 Prior performance

The set row shows the corresponding prior working set when a reliable match exists.

The exercise header may show a concise prior summary such as:

> Last: 155 × 8 @8, 145 × 9 @8

A tap may open fuller history without leaving or losing the active workout.

## 8.3 Prefill rules

Normal prefill priority:

1. the corresponding prior completed working set for the same exercise variant;
2. the routine default;
3. blank when no reliable value exists.

A temporary active flag may offer adjusted values, but the app must visibly identify the adjustment and allow immediate override.

## 8.4 Stable target rules

- Normal rep range comes from the exercise variant.
- Normal target RPE comes from the exercise variant.
- The app does not silently rewrite either.
- A temporary flag may state a different cap or range for the current session.
- Temporary adjustments expire according to their return criterion and do not silently rewrite the routine.

## 8.5 Progress markers

When supported, one compact marker may appear:

- Top of range last time
- Progress available
- Rep PR last session
- Same performance at lower RPE

A marker is not a mandatory instruction.

## 8.6 Set classification

- Warm-ups may be visually marked with a small, familiar indicator.
- Working-set status is inferred from the routine and history.
- Back-off/drop-set metadata is preserved when known.
- A correction control is available only when the inference is wrong.
- The user is not asked to classify every set.

---

# 9. Flag system

## 9.1 Allowed visible flag categories

### Fatigue

Scope may be:

- exercise;
- muscle group;
- session.

Example:

> **Back off chest today**  
> Cap pressing at RPE 7 and perform one fewer working set.

### Plateau

Example:

> **Bench progress has stalled**  
> Repeat the current load today; review the exercise after this session.

### Deload

Example:

> **Deload recommended**  
> Use light work this week and cap working sets at RPE 6–7.

### Readiness adjustment

Example:

> **Recovery is below your normal range**  
> Keep today's exercises, but cap work at RPE 7.

### Pain or illness

Example:

> **Do not train through this pain flag**  
> Replace or skip the affected movement.

## 9.2 Visible anatomy of a flag

Every visible flag contains:

1. category/title;
2. action;
3. one concise reason;
4. **Why?** when more detail is useful;
5. Dismiss or modify when safe.

## 9.3 Why? details

The detail view is limited to:

- trigger;
- supporting personal data;
- how today's action differs from normal;
- duration or return criterion;
- what would invalidate the flag.

It does not include:

- a research bibliography;
- internal object fields;
- raw confidence scores;
- every alternative considered;
- a lengthy coaching essay.

## 9.4 Conflict resolution

When multiple systems identify concerns:

- the engine resolves them before presentation;
- the most consequential action wins;
- one primary session action and one primary exercise action may exist;
- duplicate actions are merged;
- the user never sees contradictory cards.

## 9.5 Normal state

When no material exception exists:

- no flag card appears;
- no `Hold` card appears;
- no `Continue` card appears;
- no evidence paragraph appears.

Silence means proceed normally using the displayed targets and prior performance.

---

# 10. Override behavior

## 10.1 Governing rule

The app records what Erik did, not what the template hoped he would do.

## 10.2 Permitted overrides

During a workout, Erik may:

- change weight;
- change reps;
- change RPE;
- change set count;
- reorder exercises;
- skip an exercise;
- add an exercise;
- substitute an exercise;
- create a custom variant;
- shorten the workout;
- pause and resume.

## 10.3 Equipment behavior

Equipment metadata:

- may help search;
- may help internal muscle mapping;
- may be edited later;
- may never make an exercise unavailable for logging.

## 10.4 Exercise substitutions

The substitution flow:

1. Tap Substitute.
2. Search existing exercise or variant.
3. Select it, or create a variant.
4. Continue the workout.

After the workout, Comprehensive Fitness may offer:

- Keep this change for this workout only
- Save this substitution to the routine

The default is workout-only.

## 10.5 Custom variants

Creating a variant requires:

- name;
- normal rep range;
- target RPE;
- normal rest target.

Set count may inherit from the replaced exercise.

Muscle and equipment metadata are optional and may be inferred.

## 10.6 Grading an override

The grade uses:

- work actually completed;
- actual effort;
- progress relative to the same exercise variant's history;
- whether an active safety/recovery flag was reasonably handled;
- completeness and internal consistency of the log.

The grade does not automatically decline because Erik:

- changed order;
- substituted equipment;
- used a different exercise variant;
- added or removed a set;
- deviated from the initial prescription.

When history is insufficient for a new variant, the grade omits progression rather than inventing a comparison.

---

# 11. Finish and completion

## 11.1 Finish behavior

Tapping Finish opens a concise confirmation that includes:

- number of incomplete planned sets, when any;
- Finish workout;
- Return to workout.

After confirmation, the summary appears immediately.

## 11.2 Completion summary screen

### Purpose

Create closure, reward useful performance, and surface the few facts worth carrying forward.

### Visible information

Required:

- Workout complete
- A–F grade
- two or three short grade reasons
- up to three meaningful improvement/PR highlights
- any material fatigue, plateau, or deload observation
- Done
- View progress

Conditional:

- Save substitution to routine
- Add session note
- resume/undo finish for a brief recovery period

### Primary action

Done

### Secondary actions

- View progress
- Save routine change
- Add/edit note
- Resume/undo when available

### Explicitly absent

- separate hypertrophy score;
- program-wide score;
- full weekly volume report;
- every PR category;
- full charts embedded on the completion screen;
- evidence citations;
- multiple next-session prescriptions.

## 11.3 Workout grade

The grade is one concise summary, not a mathematical claim of physiological adaptation.

It considers:

- logging completeness;
- effort relative to the final targets and context;
- meaningful performance progress;
- sensible response to active fatigue/readiness flags;
- whether the completed work was internally coherent.

The explanation must be understandable in two or three bullets.

Examples:

> **A — Strong, controlled progression**
> - Added one rep on bench at the same RPE.
> - Matched row performance with lower effort.
> - Completed the session without a fatigue flag.

> **B — Productive adjusted session**
> - Reduced pressing effort as recommended.
> - Preserved performance on pulling movements.
> - One planned exercise was skipped.

## 11.4 Hypertrophy score

There is no separate user-facing hypertrophy score.

Any defensible inputs from the old score may support:

- the workout grade;
- progress markers;
- fatigue analysis.

The old score itself is not preserved under a new name.

---

# 12. Progress screen specification

## Purpose

Answer:

- What have I done?
- Where did I improve?
- Is this exercise trending up, flat, or down?
- What were the exact sets behind the trend?

## Entry conditions

- bottom navigation;
- View progress after completion;
- tap prior performance in an active workout.

## Default view

The Progress home shows:

- recent completed workouts;
- recent meaningful PRs;
- exercises with recent improvement or active plateau/fatigue flags;
- exercise search.

It does not show a program-wide scorecard.

## Workout detail

A completed workout shows:

- date and duration;
- readiness deviation, when present;
- actual exercise order;
- completed sets;
- grade and reasons;
- PRs/improvements;
- notes;
- flags and actions that were active.

## Exercise detail

An exercise variant shows:

- normal rep range and target RPE;
- most recent sessions;
- best relevant performances;
- meaningful PRs;
- one primary trend chart;
- tappable data points;
- active progress/fatigue/plateau status when present.

## Chart behavior

The primary chart should answer whether performance is improving while preserving context.

Each point reveals:

- date;
- load;
- reps;
- RPE;
- relevant set;
- optional estimated-performance value when used.

A second chart/view is permitted only when it answers a distinct question that the primary chart cannot answer clearly.

The initial redesign does not include:

- weekly muscle-volume charts;
- direct/fractional set charts;
- reps-at-weight chart;
- program-wide hypertrophy charts;
- a matrix of every muscle group.

---

# 13. Routine picker and routine management

## 13.1 Routine picker

Purpose:

- select a workout other than the expected one.

Visible:

- current routine;
- workout-day names;
- exercise count;
- Start;
- Manage routines.

No mesocycle state is required.

## 13.2 Routine management

Routine management supports:

- create routine;
- duplicate routine;
- rename routine;
- activate/deactivate routine;
- add/remove/reorder workout days;
- add/remove/reorder exercise variants;
- edit set count;
- edit rep range;
- edit target RPE;
- edit rest target;
- duplicate an exercise as a variant.

Routine management does not include:

- automatic mesocycle generation;
- candidate pools;
- selected exercise portfolios;
- equipment gating;
- direct/fractional-set targets;
- weekly muscle-volume scorecards;
- guide/setup/build/check/create stages;
- program quality score.

## 13.3 Program changes

Because routine editing is rare:

- it is not shown during normal logging;
- it is not a permanent bottom-navigation tab;
- saving a one-off workout change to the routine is always optional;
- the current workout is never interrupted by a program-design wizard.

---

# 14. Settings specification

Settings contains:

## Readiness and integrations

- wearable connection/sync status;
- usual readiness baseline behavior;
- optional manual readiness preferences.

## Timer and notifications

- sound;
- haptic;
- lock-screen/live notification permission;
- global default rest time when an exercise has no default.

## Exercises and routines

- manage routines;
- manage exercise variants;
- optionally correct movement/equipment metadata.

## Data

- import Strong data;
- review ambiguous warm-up classifications;
- export complete data;
- clear data with destructive confirmation.

## Support and privacy

- support;
- privacy policy;
- reliable close/back navigation.

Settings does not contain an Advanced graveyard for deleted product features.

---

# 15. Error, empty, and unusual states

## 15.1 No previous history

Show:

- `No previous sets for this variant`;
- routine targets;
- blank or sensible routine-default inputs.

Do not invent a recommendation or compare against another variant without explicit mapping.

## 15.2 Insufficient evidence for a flag

Remain silent.

Do not show:

- low-confidence warnings;
- numeric uncertainty;
- placeholder coaching.

## 15.3 Wearable not synced

Continue from usual readiness.

Offer a small sync-status link in the optional readiness detail or Settings.

## 15.4 Exercise unavailable

The app never blocks the exercise.

Offer Substitute while allowing the original to remain loggable.

## 15.5 Custom variant not mapped

Allow logging immediately.

Flag the metadata for later background/manual completion without interrupting the workout.

## 15.6 App closed during workout

Persist:

- completed sets;
- current inputs;
- elapsed/pause timing;
- active rest timer where supported;
- actual exercise order.

Resume directly into the session.

## 15.7 Notification permission denied

The in-app timer remains fully functional.

Settings explains how to enable external alerts, without blocking use.

## 15.8 Offline

Workout logging, timer, history needed for the active session, and completion work locally.

Sync occurs later when connectivity returns.

## 15.9 Conflicting flags

Resolve to one primary action before display.

Log the underlying signals for later auditing.

## 15.10 Unusual override

Record it.

When the app cannot make a reliable comparison, mark the progression analysis as unavailable rather than grading the user against an unrelated exercise.

---

# 16. Data preservation requirements

Comprehensive Fitness must preserve:

- all completed workout sessions;
- load;
- reps;
- RPE;
- actual exercise order;
- session duration;
- set timestamps and available rest duration;
- readiness baseline/deviation;
- available sleep, HRV, and resting-HR context;
- session and exercise notes;
- exercise-variant identity;
- routine origin;
- substitutions;
- skipped/removed sets where useful for audit;
- active flags and their actions;
- manual overrides.

Older history is not deleted merely because calculations emphasize recent sessions.

## 16.1 Calculation windows

The engine may use recent qualifying exposures.

The user does not manage:

- qualifying-week rules;
- deload exclusions;
- fractional-set windows;
- selected analysis horizons during a workout.

A simple chart-range control may exist in Progress.

## 16.2 Source of truth

For a completed workout, the source of truth is the recorded actual session.

The original template remains historical context, not the final record.

---

# 17. Recommendation and flag contract at the product level

## 17.1 Normal output

When no material exception exists:

- no coaching card;
- stable targets;
- prior performance;
- optional factual progress marker.

## 17.2 Exception output

A surfaced exception must contain:

- `scope`: session, muscle group, or exercise;
- `category`: fatigue, plateau, deload, readiness, pain/illness;
- `action`: one primary instruction;
- `reason`: one short sentence;
- `details`: optional;
- `duration/return`: when temporary;
- `override`: allowed unless the product must present a safety warning.

## 17.3 Prohibited behavior

The engine must not:

- silently change a routine's rep range;
- display multiple contradictory actions;
- produce an evidence wall;
- turn insufficient data into a confident warning;
- penalize all deviations from the initial prescription;
- block an exercise because of equipment metadata;
- expose internal taxonomy as required user input.

---

# 18. Explicit exclusions from the redesigned core

The redesigned core does not include:

- automatic mesocycle generation;
- modular mesocycle builder;
- exercise candidate pools;
- selected exercise portfolios;
- Plan/Setup/Build/Check/Create workflow;
- weekly muscle-volume dashboard;
- direct/fractional-set display;
- program-wide hypertrophy score;
- per-lift hypertrophy score;
- a separate PR summary page;
- a readiness score dashboard;
- a normal recommendation card for each exercise;
- research citations in the workout experience;
- equipment availability as a blocker;
- user-facing confidence and severity matrices;
- user-controlled qualifying-week logic;
- multiple permanent recommendation systems.

---

# 19. Second deletion pass outcome

A second pass removed the following from the first simplified concept:

- a third permanent Routines navigation item;
- a pre-start readiness choice;
- a normal Hold/Continue recommendation;
- a separate hypertrophy score;
- embedded full charts on completion;
- a dedicated PR page;
- a normal add-set recommendation;
- visible equipment setup;
- visible set-taxonomy management;
- a permanent analytics dashboard.

The remaining product supports the actual workout without asking Erik to manage the engine.

---

# 20. Definition of the redesigned experience

The redesign is complete when the ordinary experience is:

> I open Comprehensive Fitness and the right workout is already there. I start without filling out a form. The exercise shows what I did last time, my normal rep range, and my target RPE. I log weight, reps, and RPE without fighting the fields. The rest timer runs automatically. The app lets me change anything I need to change. Most of the time it stays out of the way. When fatigue, a plateau, pain, or a deload is genuinely relevant, it tells me exactly what to do in one clear message. When I finish, I see a rewarding grade and exactly where I improved.
