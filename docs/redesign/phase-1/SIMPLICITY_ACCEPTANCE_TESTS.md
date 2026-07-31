# Comprehensive Fitness Simplicity Acceptance Tests

**Status:** Phase 1 product acceptance standard  
**Purpose:** Convert “simple again” into observable pass/fail behavior  
**Primary device target:** iPhone-class mobile viewport, including approximately `390 × 844`

A redesign does not pass because the screens look cleaner. It passes only when the normal workout requires less navigation, less reading, fewer decisions, and fewer corrective actions.

---

# 1. Global pass criteria

The release passes only when all **Critical** tests pass and no **High** test has an unresolved failure.

Priority definitions:

- **Critical** — Failure makes the app unworkable, untrustworthy, or contradicts the redesign.
- **High** — Failure materially harms the normal workout.
- **Medium** — Failure harms an infrequent or secondary flow.
- **Low** — Polish or future optimization.

---

# 2. Information architecture

| ID | Priority | Test | Pass criterion |
|---|---|---|---|
| IA-01 | Critical | Primary navigation count | The normal app has no more than two persistent primary destinations: Today and Progress |
| IA-02 | High | Settings prominence | Settings is reachable but is not a permanent bottom-navigation destination unless platform constraints make a secondary control inaccessible |
| IA-03 | High | Routine-management prominence | Routine management is not a permanent bottom-navigation destination |
| IA-04 | Critical | Active-workout focus | Persistent app navigation is hidden or clearly subordinate during an active workout |
| IA-05 | Critical | Deleted planning entry points | No mesocycle builder, candidate pool, portfolio, or Plan/Setup/Build/Check/Create entry is reachable from normal navigation |
| IA-06 | High | No dashboard duplication | There is no separate dashboard destination containing overlapping scores, volume, readiness, and recommendations |

---

# 3. Today and workout start

| ID | Priority | Test | Pass criterion |
|---|---|---|---|
| START-01 | Critical | Expected workout visibility | On launch with no active workout, the expected workout and Start action are visible in the first viewport without scrolling |
| START-02 | Critical | Start expected workout | The expected workout begins with one deliberate tap from Today |
| START-03 | High | Start a different workout | A different existing workout can be selected and started in no more than three deliberate taps from Today |
| START-04 | Critical | Required pre-workout inputs | Zero readiness fields are required before a normal workout |
| START-05 | High | Baseline readiness | Today clearly but quietly indicates that usual readiness is being used |
| START-06 | High | Optional readiness | Changed readiness can be logged from Today or the active workout without abandoning the workout flow |
| START-07 | Critical | No start modal | Starting the expected workout does not open a mandatory confirmation, readiness, evidence, or plan-review modal |
| START-08 | High | Session-level flag | When a material flag exists, its action is visible before Start without pushing the Start button out of the first viewport |
| START-09 | High | No normal coaching clutter | When no flag exists, Today does not show a coaching card that says Continue, Hold, Normal, or equivalent |
| START-10 | High | Active session recovery | If an unfinished workout exists, relaunching the app offers or directly performs Resume without losing recorded data |

---

# 4. First-set orientation

| ID | Priority | Test | Pass criterion |
|---|---|---|---|
| ORIENT-01 | Critical | First exercise visibility | Immediately after Start, the first current exercise and its first working set are visible without searching through text |
| ORIENT-02 | Critical | Required context | The current exercise view simultaneously exposes the full exercise name, previous performance, normal rep range, and target RPE |
| ORIENT-03 | High | Exercise position | The user can tell where the current exercise sits in the workout, such as `1 of 6` |
| ORIENT-04 | Critical | Full variant name | Meaningful suffixes such as Heavy or Light are not truncated beyond recognition |
| ORIENT-05 | High | No normal recommendation paragraph | A normal exercise contains no explanatory recommendation paragraph |
| ORIENT-06 | High | Progress marker limit | At most one compact progress marker is shown for a normal exercise |
| ORIENT-07 | Critical | No silent target mutation | The displayed normal rep range matches the exercise variant unless a visible temporary flag explicitly changes today's action |
| ORIENT-08 | High | Previous-set alignment | When reliable history exists, prior working-set values align with the relevant current set row |
| ORIENT-09 | High | No-history state | When no history exists, the app says so plainly and does not borrow unrelated exercise data |

---

# 5. Weight, reps, and RPE input

| ID | Priority | Test | Pass criterion |
|---|---|---|---|
| INPUT-01 | Critical | Weight entry | Weight can be entered or replaced with a standard numeric interaction |
| INPUT-02 | Critical | Rep entry | Reps can be entered or replaced with a standard numeric interaction |
| INPUT-03 | Critical | RPE entry | RPE accepts integer and half-step values, including `7.5` |
| INPUT-04 | Critical | Select-on-focus | One tap into a prefilled numeric field selects the complete current value or otherwise permits immediate replacement |
| INPUT-05 | Critical | RPE regression test | Starting from prefilled `7`, the user can enter `7.5` without tapping `7` twice or clearing the field through a workaround |
| INPUT-06 | High | Half-step controls | RPE can be adjusted in `0.5` increments without typing when desired |
| INPUT-07 | High | Prefill accuracy | Prefill uses the corresponding prior working set or routine default; it does not use a warm-up as the normal working value |
| INPUT-08 | High | Input persistence | Leaving and returning to the exercise preserves uncompleted field edits |
| INPUT-09 | High | Invalid input | Invalid values receive a concise inline correction and do not erase other set data |
| INPUT-10 | High | Normal set speed | With accurate prefill, a normal set can be reviewed, adjusted, and completed in no more than 10 seconds in a moderated usability test |
| INPUT-11 | High | Full-edit speed | When weight, reps, and RPE all change, the set can be recorded in no more than 15 seconds without navigation away from the row |
| INPUT-12 | Critical | Data correctness | The saved set contains exactly the displayed load, reps, and RPE |

---

# 6. Set state and exercise progression through the workout

| ID | Priority | Test | Pass criterion |
|---|---|---|---|
| SET-01 | Critical | Current-set state | Current, completed, and pending sets are visually distinguishable without relying solely on subtle color differences |
| SET-02 | High | Auto-advance | Completing a set advances the current state predictably |
| SET-03 | High | Scroll stability | Auto-advance does not unexpectedly move the user away from the exercise or hide the next set |
| SET-04 | Critical | Add set | A set can be added from the exercise in no more than two deliberate actions |
| SET-05 | Critical | Remove/skip set | A set can be removed or skipped without pretending it was completed |
| SET-06 | High | Actual order | Performing exercises out of template order records the actual order |
| SET-07 | High | Do next | A later exercise can be selected next without editing the routine |
| SET-08 | High | Notes | An exercise or session note can be added without blocking set logging |
| SET-09 | Critical | No mandatory set taxonomy | The user is not required to select warm-up, working, back-off, or drop-set type for every set |
| SET-10 | High | Classification correction | When an inferred set role is wrong, it can be corrected without editing raw data or rebuilding the workout |

---

# 7. Rest timer and notifications

| ID | Priority | Test | Pass criterion |
|---|---|---|---|
| REST-01 | Critical | Automatic start | Completing a set starts the appropriate rest timer within one second |
| REST-02 | Critical | Persistent visibility | Remaining rest remains visible while the user stays in the active workout |
| REST-03 | Critical | Timer controls | `−15`, `+15`, and Skip each work with one tap |
| REST-04 | High | Elapsed-over-target | After rest expires, the interface shows elapsed time beyond target rather than disappearing |
| REST-05 | High | Next-set access | The user can continue logging even if the timer is running or permission is denied |
| REST-06 | High | Sound/haptic | Rest completion produces configured sound/haptic behavior when permissions allow |
| REST-07 | High | Lock-screen behavior | A configured external notification appears when the app is backgrounded and platform permissions allow |
| REST-08 | High | Permission fallback | Denied notification permission does not impair the in-app timer |
| REST-09 | High | Resume timing | Backgrounding and returning preserves the correct remaining/elapsed time |
| REST-10 | Medium | Manual recovery | A rest timer can be restarted manually without navigating to Settings |

---

# 8. Flags and explanations

| ID | Priority | Test | Pass criterion |
|---|---|---|---|
| FLAG-01 | Critical | Silence in normal state | No flag or recommendation card appears when evidence does not justify an exception |
| FLAG-02 | Critical | Allowed categories | Visible flags are limited to fatigue, plateau, deload, readiness adjustment, and pain/illness unless a new category is explicitly approved |
| FLAG-03 | Critical | Action first | The flag's primary action is visible without expanding details |
| FLAG-04 | High | Concise default | The default visible flag contains no more than 45 words excluding controls |
| FLAG-05 | High | One action | Each exercise shows no more than one primary flag action at a time |
| FLAG-06 | High | Conflict resolution | Competing internal concerns resolve to a single coherent visible action |
| FLAG-07 | High | Reason | The default flag includes one plain-language reason tied to personal data or performance |
| FLAG-08 | High | Why on demand | Supporting detail opens only after tapping Why? |
| FLAG-09 | High | Detail limit | Why? explains trigger, supporting data, change from normal, and return criterion in no more than 120 words under ordinary conditions |
| FLAG-10 | Critical | No evidence wall | The live workout contains no research bibliography or literature citations |
| FLAG-11 | Critical | No raw confidence | The user does not see an internal confidence percentage or severity matrix |
| FLAG-12 | Critical | No fabricated certainty | Insufficient evidence produces silence or “insufficient history,” not a confident flag |
| FLAG-13 | High | Temporary target clarity | A temporary RPE/load/set adjustment is visibly distinguished from the routine's normal target |
| FLAG-14 | High | Dismiss/modify | A non-safety flag can be dismissed or modified, and that action is recorded |
| FLAG-15 | Critical | Deload clarity | A deload flag states the scope, action, expected duration, and return criterion |
| FLAG-16 | Critical | Pain/illness priority | A pain/illness warning is not visually subordinate to a grade, PR, or progression marker |

---

# 9. Overrides, substitutions, and custom variants

| ID | Priority | Test | Pass criterion |
|---|---|---|---|
| OVERRIDE-01 | Critical | Free field override | Weight, reps, RPE, and set count can be changed without asking permission |
| OVERRIDE-02 | Critical | Equipment never blocks | Equipment metadata never prevents an exercise from being logged |
| OVERRIDE-03 | Critical | Substitute existing exercise | An existing exercise/variant can replace the current one in no more than three deliberate actions after opening Substitute |
| OVERRIDE-04 | High | Workout-only default | A substitution affects the current workout by default |
| OVERRIDE-05 | High | Save to routine | The user may optionally save the substitution to the routine after or during the session |
| OVERRIDE-06 | Critical | Custom variant creation | A custom heavy/light or other named variant can be created and used during the workout |
| OVERRIDE-07 | High | Variant minimum fields | Immediate variant creation requires no more than name, rep range, target RPE, and rest target; optional metadata does not block use |
| OVERRIDE-08 | Critical | Independent history | Heavy and light variants can maintain separate targets and performance histories |
| OVERRIDE-09 | Critical | Actual session source of truth | The completed workout displays and stores the actual exercise, order, sets, values, and duration |
| OVERRIDE-10 | Critical | Grade does not punish legitimate change | A substitution, reordering, or modified set count does not reduce the grade solely because it differs from the initial prescription |
| OVERRIDE-11 | High | Insufficient comparison | A new variant with insufficient history omits progression scoring rather than using an unrelated comparison |
| OVERRIDE-12 | High | Shortened workout | A workout can be finished with planned work incomplete, with concise acknowledgment rather than a hard block |

---

# 10. Finish and completion

| ID | Priority | Test | Pass criterion |
|---|---|---|---|
| COMPLETE-01 | Critical | Finish access | Finish is consistently accessible from the active workout |
| COMPLETE-02 | High | Accidental-finish protection | Completion requires no more than two actions, including a concise confirmation |
| COMPLETE-03 | High | Incomplete-set context | The confirmation identifies incomplete planned work without forcing completion |
| COMPLETE-04 | Critical | Completion speed | The completion summary renders within two seconds under normal local conditions |
| COMPLETE-05 | Critical | One grade | The summary shows one A–F workout grade and no second overall workout score |
| COMPLETE-06 | High | Grade explanation | The grade has no more than three concise reasons |
| COMPLETE-07 | Critical | Grade uses actual work | Grade calculation uses the final completed session and context, not rigid prescription adherence |
| COMPLETE-08 | High | Improvement limit | The summary shows no more than three primary PR/progression highlights by default |
| COMPLETE-09 | High | Material concern | A meaningful fatigue, plateau, or deload observation appears without being buried below celebratory content |
| COMPLETE-10 | High | Primary action | Done is the dominant completion action |
| COMPLETE-11 | High | Progress path | View progress reaches relevant workout/exercise detail without an intermediate dashboard |
| COMPLETE-12 | Critical | No hypertrophy score | No standalone hypertrophy score appears on completion |
| COMPLETE-13 | Critical | No volume dump | No weekly muscle-volume report or direct/fractional-set breakdown appears on completion |
| COMPLETE-14 | Medium | Resume/undo | When technically feasible, a just-finished workout can be resumed for a short recovery window |
| COMPLETE-15 | High | Reward quality | The completion state feels intentionally designed and responsive without delaying Done or obscuring the facts |

---

# 11. Progress and charts

| ID | Priority | Test | Pass criterion |
|---|---|---|---|
| PROGRESS-01 | Critical | Workout history | Completed workouts are available chronologically with no mesocycle navigation requirement |
| PROGRESS-02 | Critical | Exercise history | An exercise variant's recent sessions can be found through search or a recent list |
| PROGRESS-03 | High | Chart reachability | A relevant exercise chart can be reached in no more than three actions from its completion highlight and no more than four actions from Today |
| PROGRESS-04 | High | Primary chart question | The main chart clearly communicates whether performance is trending up, flat, or down |
| PROGRESS-05 | Critical | Point details | Tapping a point reveals date, load, reps, RPE, and relevant set context |
| PROGRESS-06 | High | Improvement explanation | The user can determine how an exercise improved—load, reps, RPE efficiency, or another approved performance measure |
| PROGRESS-07 | High | Variant identity | Chart/history makes clear whether data belongs to Heavy, Light, or another variant |
| PROGRESS-08 | High | Reasonable default horizon | The default chart range emphasizes recent useful history without deleting older records |
| PROGRESS-09 | Medium | Range control | At most one simple chart-range control is present in the initial redesign |
| PROGRESS-10 | Critical | No reps-at-weight chart | The removed chart is not rebuilt under an equivalent label |
| PROGRESS-11 | Critical | No weekly muscle-volume dashboard | Progress contains no normal-path weekly muscle-volume dashboard |
| PROGRESS-12 | Critical | No program scorecard | Progress contains no overall program or hypertrophy scorecard |
| PROGRESS-13 | Critical | Historical data | Older workouts remain accessible even when calculations emphasize recent sessions |
| PROGRESS-14 | High | Active flags | Relevant exercise-level plateau/fatigue status is visible without converting the page into a coaching dashboard |

---

# 12. Routine management

| ID | Priority | Test | Pass criterion |
|---|---|---|---|
| ROUTINE-01 | High | Infrequent placement | Routine management is available but does not intrude on the normal workout |
| ROUTINE-02 | High | Basic edit | Name, day, exercise order, set count, rep range, target RPE, and rest target can be edited |
| ROUTINE-03 | High | Duplicate routine | An existing routine can be duplicated without using a mesocycle builder |
| ROUTINE-04 | Critical | Duplicate as variant | An exercise can be duplicated as a named variant with independent targets |
| ROUTINE-05 | Critical | Stable targets | Editing the exercise variant is the authoritative way to change its normal rep range and target RPE |
| ROUTINE-06 | Critical | No mesocycle workflow | No mesocycle generator or modular builder is required or promoted |
| ROUTINE-07 | Critical | No candidate pool | Adding an exercise uses direct search/create rather than a candidate-portfolio workflow |
| ROUTINE-08 | Critical | No equipment gate | Routine creation does not require an equipment-selection setup that blocks exercises |
| ROUTINE-09 | Critical | No fractional-set management | Routine editing does not require direct, secondary, or fractional-set targets |
| ROUTINE-10 | Medium | Non-blocking warning | Any future training-volume guardrail is advisory and never prevents saving the routine unless explicitly approved |

---

# 13. Data integrity and recovery

| ID | Priority | Test | Pass criterion |
|---|---|---|---|
| DATA-01 | Critical | Historical preservation | Migration preserves every completed workout record available before redesign |
| DATA-02 | Critical | Core field preservation | Load, reps, RPE, exercise identity, order, duration, readiness, and notes remain intact |
| DATA-03 | High | Rest preservation | Available rest timestamps/durations remain intact even when not routinely displayed |
| DATA-04 | Critical | Variant mapping | Existing custom/duplicate exercises are not silently collapsed into one history |
| DATA-05 | Critical | Warm-up protection | Known warm-ups do not become working-set progression records |
| DATA-06 | High | Ambiguous imports | Ambiguous Strong-import classifications can be reviewed/corrected without deleting the session |
| DATA-07 | Critical | Active-session persistence | Completed sets and in-progress inputs survive app backgrounding, termination, and relaunch |
| DATA-08 | High | Offline logging | A workout can be logged and completed without an active network connection |
| DATA-09 | High | Export | The full retained history can be exported from Settings/Data |
| DATA-10 | Critical | Destructive reset | Clearing data requires explicit destructive confirmation |
| DATA-11 | Critical | Actual versus template | Completed session data remains distinct from the originating template |
| DATA-12 | High | Flag audit | A surfaced flag, its action, and a user's dismiss/modify choice are retained for later review |
| DATA-13 | Critical | One recommendation source | Every visible flag/progress output derives from one authoritative internal contract |
| DATA-14 | High | No permanent migration shadow | Temporary legacy compatibility has an explicit removal criterion and does not become a second permanent source of truth |

---

# 14. Deleted-feature absence tests

These are regression tests. Passing requires that the feature is not merely hidden from the first screen.

| ID | Priority | Prohibited feature | Pass criterion |
|---|---|---|---|
| DELETE-01 | Critical | Mandatory readiness start flow | No mandatory form or modal exists in the normal start path |
| DELETE-02 | Critical | Normal recommendation wall | No routine coaching paragraph appears for every exercise |
| DELETE-03 | Critical | Silent rep-range rewriting | No engine path changes a routine's normal range without a visible temporary exception or explicit routine edit |
| DELETE-04 | Critical | Add-set coaching | No normal live recommendation asks Erik to increase volume |
| DELETE-05 | Critical | Evidence cards | No research/evidence cards exist in live workout, Today, or completion |
| DELETE-06 | Critical | Standalone hypertrophy score | No equivalent overall score survives under a renamed label |
| DELETE-07 | Critical | Weekly muscle-volume dashboard | No normal route exposes the old dashboard under another name |
| DELETE-08 | Critical | Direct/fractional-set UI | No normal user workflow requires or displays fractional set accounting |
| DELETE-09 | Critical | Program-wide scorecard | No overall program quality/hypertrophy score remains |
| DELETE-10 | Critical | Mesocycle builder | Routes, navigation, and user-facing state for the builder are absent |
| DELETE-11 | Critical | Candidate pools/portfolios | No equivalent multi-stage exercise-selection abstraction remains |
| DELETE-12 | Critical | Equipment blocking | No selected-equipment state makes a valid exercise unavailable |
| DELETE-13 | High | Historical mesocycle management | Workout history is not organized through planned/active/completed mesocycle states |
| DELETE-14 | Critical | User-facing confidence matrix | No confidence percentage, severity grid, or internal evidence score appears |
| DELETE-15 | High | User-facing qualifying windows | No normal control exposes six-qualifying-week or similar engine rules |
| DELETE-16 | Critical | Permanent dead routes | Deleted screens are removed from routes, state, tests, and current documentation when migration safety permits |
| DELETE-17 | Critical | Advanced-feature graveyard | Deleted capabilities are not relocated into Advanced, More, Insights, or Settings |

---

# 15. Visual, interaction, and accessibility tests

| ID | Priority | Test | Pass criterion |
|---|---|---|---|
| UX-01 | Critical | Mobile viewport | Today, current exercise, numeric inputs, timer, and completion work at approximately `390 × 844` without horizontal scrolling or clipped actions |
| UX-02 | High | Long names | Long exercise-variant names remain identifiable |
| UX-03 | High | Tap targets | Primary touch targets are at least approximately 44 × 44 points or meet the platform's accessibility guidance |
| UX-04 | High | Text scaling | Core logging remains usable with increased system text size |
| UX-05 | Critical | State distinction | Current/completed/pending and warning states do not rely solely on color |
| UX-06 | High | Keyboard avoidance | The numeric keyboard does not permanently obscure the current row or Complete action |
| UX-07 | High | Focus behavior | Moving between weight, reps, and RPE is predictable and does not require closing/reopening the keyboard |
| UX-08 | High | Loading stability | Loading/sync states do not move the Start or Complete controls unpredictably |
| UX-09 | High | Error clarity | Errors state what happened and the next action in plain language |
| UX-10 | High | Motion restraint | Animation does not delay set completion, timer use, or leaving the completion screen |
| UX-11 | High | Flag hierarchy | A material safety/recovery flag is visually prominent without turning every normal exercise into a warning surface |
| UX-12 | High | Text-density limit | No normal workout card requires scrolling solely to finish reading its explanation |
| UX-13 | High | Real-device verification | Every changed core screen is exercised on an iPhone-class device or faithful simulator, not accepted from code inspection alone |

---

# 16. End-to-end acceptance scenarios

## Scenario A — Normal workout

**Given**

- usual readiness;
- no active flag;
- existing history for every exercise;
- expected workout is correct.

**When**

1. Erik opens Comprehensive Fitness.
2. Starts the workout.
3. Logs all sets.
4. Uses the rest timer.
5. Finishes.

**Then**

- Start required one tap.
- No readiness form appeared.
- No normal recommendation paragraphs appeared.
- Every exercise showed prior performance, rep range, and target RPE.
- Weight, reps, and decimal RPE were easy to edit.
- Rest began automatically.
- Completion showed one grade, up to three improvements, and no hypertrophy score.
- The complete workout is available in Progress.

**Priority:** Critical

---

## Scenario B — Fatigue adjustment

**Given**

- evidence meets the approved material-fatigue threshold;
- the expected workout includes affected exercises.

**When**

1. Erik opens Today.
2. Reviews the flag.
3. Starts.
4. Applies or modifies the action.
5. Finishes.

**Then**

- one action was visible before or within the affected exercise;
- the normal target remained identifiable;
- the temporary adjustment was clear;
- Why? explained the personal trigger concisely;
- the app did not show competing recommendations;
- the final grade considered the actual adjusted session rather than penalizing it for reduced work.

**Priority:** Critical

---

## Scenario C — Exercise substitution and custom variant

**Given**

- the planned exercise is unavailable;
- `Leg Extension — Heavy` exists;
- `Leg Extension — Light` does not exist.

**When**

1. Erik taps Substitute.
2. Creates `Leg Extension — Light`.
3. Sets a higher rep range and lower target RPE.
4. Logs it.
5. Finishes.

**Then**

- equipment configuration did not block the flow;
- variant creation required only minimal fields;
- the new variant retained independent history;
- the completed workout recorded the actual variant;
- the grade did not decline solely because of substitution;
- saving the change to the routine was optional.

**Priority:** Critical

---

## Scenario D — RPE input regression

**Given**

- RPE is prefilled as `7`.

**When**

1. Erik taps the field once.
2. Enters `7.5`.
3. Completes the set.

**Then**

- the displayed and saved RPE is `7.5`;
- no duplicate `7` tap, field reset, or manual-clearing workaround was required.

**Priority:** Critical

---

## Scenario E — Plateau with insufficient versus sufficient evidence

**Given**

- Exercise A has enough qualifying history for an approved plateau.
- Exercise B has only two recent sessions.

**When**

- Erik opens each exercise.

**Then**

- Exercise A shows one plateau action with supporting trend and return/review criteria.
- Exercise B does not show a speculative plateau score or low-confidence warning.

**Priority:** Critical

---

## Scenario F — Interrupted workout

**Given**

- two completed sets and one edited but incomplete set.

**When**

1. The app is terminated.
2. Time passes.
3. Erik reopens it.

**Then**

- Comprehensive Fitness resumes the active workout;
- completed sets are intact;
- the incomplete edits are intact;
- current exercise/order is intact;
- elapsed/rest timing is coherent;
- no second session was created.

**Priority:** Critical

---

# 17. Five-workout field test

The redesign is not accepted solely through scripted tests.

Erik completes five representative workouts, including:

- at least one normal session;
- at least one exercise substitution;
- at least one manual readiness deviation;
- at least one custom RPE ending in `.5`;
- at least one interrupted/resumed session;
- a material flag if test data can safely simulate one.

After each workout, record:

1. How many times did the app make Erik stop and decode what it meant?
2. How many input workarounds were required?
3. Did any recommendation conflict with the stable exercise target?
4. Did any legitimate override feel punished?
5. Was the next action obvious?
6. Did completion feel rewarding?
7. Was any removed feature missed?

Release-level pass criteria:

- zero lost or corrupted sets;
- zero required input workarounds;
- no more than one moment of interface confusion in any workout;
- no wall-of-text recommendation;
- no false equipment block;
- average logging-friction rating of `2/5` or lower;
- average visual/interaction satisfaction of `4/5` or higher;
- Erik can state the reason for every surfaced flag in one sentence;
- Erik does not request restoration of a deleted feature to complete the core workout.

---

# 18. Definition of done

Comprehensive Fitness is “simple again” only when:

- logging weight, reps, and RPE is the dominant activity;
- previous performance is easier to find than an explanation;
- normal workouts are quiet;
- material backoff decisions are unmistakable;
- the app accommodates the workout that happened;
- completion is rewarding without metric clutter;
- exercise progress is understandable;
- program planning does not intrude;
- all deleted systems are genuinely absent from the permanent product;
- the five-workout field test passes.
