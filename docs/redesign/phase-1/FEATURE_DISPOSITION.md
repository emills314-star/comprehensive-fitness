# Comprehensive Fitness Feature Disposition

**Status:** Phase 1 zero-based product decision  
**Decision standard:** No current feature survives because it already exists. Each capability is classified according to Erik's demonstrated use, its contribution to the redesigned core jobs, and whether the user must interact with it to receive the value.

## Disposition definitions

- **KEEP** — Directly valuable and already appropriate for the normal experience.
- **SIMPLIFY** — Valuable capability with excessive workflow, presentation, terminology, or granularity.
- **HIDE IN THE ENGINE** — Potentially valuable logic that should not require routine user attention.
- **DELETE** — Burden exceeds practical value.
- **DEFER** — Insufficient evidence to justify preserving or rebuilding it now.

---

# A. Starting and navigating

| Feature or family | Current apparent purpose | Evidence of actual value | Interaction or cognitive cost | Disposition | Final behavior |
|---|---|---|---|---|---|
| Today landing screen | Entry point for scheduled workouts and readiness | Erik uses Today at the start of workouts | Current design requires scrolling to find the appropriate day | **SIMPLIFY** | Show the expected workout in the first viewport with a single Start button; provide Choose another workout as a secondary action |
| Multi-day workout list on Today | Lets the user choose any routine day | Erik sometimes chooses whichever day makes sense | Scanning and scrolling add friction before every session | **SIMPLIFY** | Surface one expected workout; open a compact routine picker only when Erik chooses another |
| Start-workout confirmation modal | Prevents accidental starts and offers readiness choices | No evidence that confirmation improves the workout | Adds an unnecessary decision before logging | **DELETE** | Start the expected workout immediately; support easy cancel or discard recovery |
| Readiness choice modal before every workout | Forces a choice between baseline and today's metrics | Erik normally skips readiness and uses baseline | Repeatedly asks for data he does not usually enter | **DELETE** | Use baseline automatically; readiness changes are optional from Today or the active workout |
| Persistent bottom-navigation Routines/Templates tab | Gives constant access to infrequent program editing | Erik has not changed the routine once | Gives rare work equal prominence to daily logging | **DELETE** | Routine management is reachable from Choose another workout and Settings, not permanent bottom navigation |
| Permanent Dashboard destination | Aggregates scores, volume, and analytics | No evidence that a separate dashboard drives workout behavior | Creates another destination and encourages metric clutter | **DELETE** | Today and Progress absorb the few valuable outputs |
| Settings | Houses integrations, data, notifications, and maintenance | Necessary but infrequent | Low cost if kept secondary | **KEEP** | Reach through a gear/profile control, not bottom navigation |
| Active-workout full-screen mode | Keeps logging focused | Directly supports the core task | Low cost and high clarity | **KEEP** | Hide normal navigation while a workout is active |
| Resume active workout | Recovers interrupted sessions | Real workouts can be interrupted | Losing progress would be unacceptable | **KEEP** | Reopen directly into the active session with elapsed time and recorded sets intact |
| Prevent starting a second workout while one is active | Protects session state | Avoids conflicting active sessions | A hard block can feel rigid if no recovery choice exists | **SIMPLIFY** | Offer Resume, Finish, or Discard; do not silently replace the active session |
| Cancel/discard workout | Supports mistakes and changed plans | Necessary recovery path | Confirmation is appropriate because data loss is consequential | **KEEP** | One clear cancel action with a concise destructive confirmation |

---

# B. Readiness and exception detection

| Feature or family | Current apparent purpose | Evidence of actual value | Interaction or cognitive cost | Disposition | Final behavior |
|---|---|---|---|---|---|
| Usual-readiness baseline | Avoids daily entry when the user is normal | Erik normally trains from his regular baseline | Minimal if automatic | **KEEP** | Baseline is assumed and recorded without requiring a form |
| Manual readiness logging | Captures meaningful day-specific deviations | Erik considers readiness necessary when today differs | Current form interrupts most workouts despite low usage | **SIMPLIFY** | Optional sheet for poor recovery, unusual soreness, pain/illness, unusually good readiness, and a note |
| Sleep, HRV, and resting-HR integration | Adds objective recovery context | These metrics have historically influenced Erik's interpretation | Manual entry is burdensome; raw metrics can distract | **HIDE IN THE ENGINE** | Sync automatically when available; show raw values only inside the optional readiness detail |
| Soreness input | Helps localize fatigue | Potentially useful when soreness is meaningfully different | Muscle-by-muscle questionnaires are excessive | **SIMPLIFY** | Optional quick selection only when soreness changes the workout |
| Illness/injury toggle | Prevents inappropriate normal training | Consequential when present | Low frequency but high importance | **KEEP** | Quick, optional exception input that can trigger a clear stop/modify warning |
| General readiness score | Compresses multiple metrics into a number | No evidence that the score itself changes behavior | Adds another number to interpret | **DELETE** | Use the inputs internally; show an action only if a threshold is materially crossed |
| Normal/Readiness-Adjusted/Light/Deload intervention taxonomy | Standardizes internal recommendation states | Internal structure may help consistency | User-facing labels require learning model terminology | **HIDE IN THE ENGINE** | Translate the state into a plain action such as “Cap at RPE 7” or “Use light work today” |
| Muscle-group fatigue detection | Warns when recovery may be inadequate | This is one of the main reasons Erik wants intelligence in the app | False positives or constant badges would undermine trust | **KEEP** | Show only when material, with affected scope, one action, and a short reason |
| Exercise-level fatigue detection | Detects local performance decline | Could change load, RPE, or set decisions | Becomes noisy if shown for ordinary variance | **KEEP** | Require meaningful evidence; otherwise remain silent |
| Plateau detection | Identifies repeated lack of progress | Erik explicitly says a plateau flag would change behavior | Complex explanation can obscure the signal | **KEEP** | One concise flag with the trend, the next action, and on-demand details |
| Deload detection | Identifies when broader recovery is needed | A central unmet need | High harm if opaque or over-triggered | **KEEP** | Prominent session-level flag with exact duration/action and return criteria |
| Pain/illness warning | Encourages modification or stopping | Consequential and user-reported | Low burden when conditional | **KEEP** | Immediate, plain-language warning; never buried under a score |
| Flag severity/confidence matrices | Exposes internal certainty and priority | No evidence that numeric confidence helps Erik act | Adds terminology and false precision | **HIDE IN THE ENGINE** | Use confidence to decide whether to surface the flag; do not show a score |
| Multiple simultaneous recommendation cards | Shows every model output | No demonstrated value | Creates the wall of text Erik reports | **DELETE** | Resolve competing logic into one primary action per exercise and one session-level action when needed |
| Recommendation evidence citations | Justifies advice with research | Erik says he can lose all evidence | High reading cost during a workout | **DELETE** | Maintain research-informed rules in documentation, not the live interface |
| Long “Why this recommendation” text | Explains model reasoning | Erik consults explanation only when advice differs | Current wall of text makes the difference harder to understand | **SIMPLIFY** | Default card contains action plus one sentence; Why? opens a short trigger-and-data explanation |
| Recommendation confidence/severity badges | Communicate model certainty | No actual use identified | Extra colors and labels compete with the action | **DELETE** | Use visual priority only for meaningful flags |
| Research database visible in the app | Makes scientific support inspectable | No evidence it is used during training | Turns the logger into a reference tool | **DELETE** | Keep research outside the workout product and in developer/product documentation |

---

# C. Normal progression and targets

| Feature or family | Current apparent purpose | Evidence of actual value | Interaction or cognitive cost | Disposition | Final behavior |
|---|---|---|---|---|---|
| Template-defined rep range | Establishes the intended style of an exercise | Erik relies on the rep range and distinguishes heavy from light variants | Confusion occurs when the engine silently changes it | **KEEP** | The exercise variant owns a stable range until Erik edits it |
| Template-defined target RPE | Guides effort | Erik checks this before working sets | Low cost when compact | **KEEP** | Show beside the rep range and use it for progress interpretation |
| Automatic rep-range rewriting | Adjusts prescriptions based on engine logic | Erik often ignores changed ranges and follows his established range | Creates mistrust and forces explanation reading | **DELETE** | Never silently change the normal range; a flag may recommend a temporary cap or alternate target |
| Normal per-exercise recommendation paragraphs | Explains add reps/load/sets/hold decisions | Erik mostly does his own thing | Repetitive text crowds the live workout | **DELETE** | Prior performance plus targets are the normal guidance |
| Progress-ready detection | Identifies when the top of range was achieved at suitable RPE | Erik wants to understand whether progression is available | Full prescription logic is more than he needs | **SIMPLIFY** | Show a compact factual cue such as “Top of range last time” or “Progress available”; details are optional |
| Exact add-rep recommendation | Tells Erik precisely how many reps to attempt | Limited evidence that it changes behavior | Can conflict with his judgment and template intent | **DEFER** | Do not rebuild as a primary feature until repeated use demonstrates value |
| Exact add-load recommendation | Selects the next load | Original use case included it, but current behavior does not rely on it | May create friction when equipment increments or intent differ | **DEFER** | Preserve enough history to support a future simple rule; no prominent live prescription now |
| Add-set recommendation | Increases weekly volume | Erik does not cite this as useful and has low volume tolerance | High recovery consequence and high model complexity | **DELETE** | Set-count changes happen through explicit routine edits; flags may temporarily reduce sets |
| Hold recommendation | Confirms no progression | Prior performance and target already communicate this | Adds a card without changing action | **DELETE** | Silence means proceed normally |
| Lower-RPE recommendation | Reduces effort under fatigue/readiness concerns | This is the normal recommendation most likely to change Erik's behavior | Valuable only when linked to a credible reason | **KEEP** | Surface only as part of a fatigue/readiness/deload flag |
| Load/set/rep adjustment object | Gives the engine a structured output | Useful for consistent flag behavior | User should not see the object model | **HIDE IN THE ENGINE** | Convert into one plain action and preserve it for auditing |
| Progression expectation and return criteria | Defines how long an adjustment lasts | Useful for temporary backoff guidance | Excessive if always shown | **HIDE IN THE ENGINE** | Show return criteria only within Why? for an active flag |

---

# D. Live workout and set logging

| Feature or family | Current apparent purpose | Evidence of actual value | Interaction or cognitive cost | Disposition | Final behavior |
|---|---|---|---|---|---|
| Weight entry | Records load | Indispensable | Current friction depends on input implementation | **KEEP** | Fast numeric input with prior value prefilled |
| Rep entry | Records performance | Indispensable | Low when prefilled and easy to overwrite | **KEEP** | Fast integer input with prior value prefilled |
| RPE entry | Records effort | Indispensable to interpretation | Current selection behavior requires duplicate taps | **KEEP** | One tap selects the current value; decimal entry and 0.5 steps work immediately |
| Previous-set performance | Gives context for today's set | One of the three indispensable capabilities | Can become cluttered if buried in text | **KEEP** | Show the corresponding prior working set directly in the set row |
| Previous-workout summary | Gives exercise-level context | Erik checks it before working sets | Low if concise | **KEEP** | Display last date and best/relevant working-set summary near the exercise header |
| Current-set highlighting | Shows where the user is | Supports fast scanning | Low cost | **KEEP** | Strong, accessible current state distinct from completed and untouched sets |
| Completed/untouched set states | Shows progress through the exercise | Useful during logging | Low cost | **KEEP** | Completed, current, and pending states remain visually distinct |
| Automatic current-set advance | Moves focus after completion | Reduces taps | Can be disruptive if it jumps unexpectedly | **SIMPLIFY** | Advance predictably after completion; never scroll the user away without preserving context |
| Add set | Accommodates actual training | Erik wants arbitrary overrides | Low cost when secondary | **KEEP** | One secondary action inside the exercise |
| Remove/skip set | Accommodates shortened or adjusted training | Required for fatigue and real-world changes | Can be confused with completion | **KEEP** | Explicit remove/skip behavior with no grade penalty merely for deviation |
| Reorder exercises | Accommodates equipment and preference | Real-world gyms require it | Drag interfaces can be fiddly | **KEEP** | Simple reorder or “Do next” action; record actual order |
| Substitute exercise | Handles unavailable equipment and variations | Explicitly requested | Current equipment rules can block use | **KEEP** | Replace quickly and optionally save the substitution to the routine |
| Custom exercise creation | Supports movements not in the library | Erik manually invents variations | Taxonomy forms can become burdensome | **KEEP** | Require only name and basic targets; metadata is optional |
| Named exercise variants | Separates heavy and light versions of the same movement | Directly matches Erik's leg-extension example | Low cost if duplication is easy | **KEEP** | “Duplicate as variant,” custom label, independent range and history |
| Equipment-availability blocking | Restricts exercise use based on equipment configuration | Actively frustrates Erik | Prevents logging real work | **DELETE** | Equipment is optional metadata and never a hard gate |
| Exercise library taxonomy during logging | Classifies muscles and equipment | May support internal analysis | Makes custom variations harder | **HIDE IN THE ENGINE** | Infer or attach mappings in the background; permit manual correction in settings if needed |
| Exercise notes | Captures context not represented by numbers | Erik identifies notes as trustworthy history | Can clutter set rows | **KEEP** | Optional exercise/session note behind a compact action |
| Session notes | Captures broad context | Useful for later interpretation | Low if optional | **KEEP** | Optional at any point and on completion |
| Workout duration | Preserves session context | Erik says duration matters | No manual work required | **KEEP** | Record automatically |
| Exercise order | Preserves actual session sequence | Erik says order matters | No manual work beyond normal interaction | **KEEP** | Store actual order automatically |
| Warm-up logging | Preserves complete session while protecting progression data | Prior app issues showed warm-up misclassification can corrupt analysis | Visible set-type controls can add work | **SIMPLIFY** | Warm-up rows may be visually marked; classification is inferred/prefilled and correctable |
| Working-set classification | Protects progression and fatigue calculations | Necessary internally even though Erik does not want to manage it | Requiring a label every set is excessive | **HIDE IN THE ENGINE** | Infer from template/import/context; expose correction only when ambiguous |
| Back-off and drop-set classification | Distinguishes intentional set structures | Can improve interpretation | Detailed set-type management is not part of the core use case | **HIDE IN THE ENGINE** | Preserve when already known; do not force routine classification |
| Rest timer | Supports training pace | One of the three indispensable capabilities | Low when automatic and persistent | **KEEP** | Start after a completed set; show remaining time with +15, −15, and Skip |
| Exercise-specific rest defaults | Matches different movement demands | Useful without repeated entry | Settings can become over-detailed | **SIMPLIFY** | One default per exercise variant, editable from routine or timer |
| Lock-screen/live notification | Keeps timer useful away from the app | Supports real workouts | Permission setup is occasional | **KEEP** | Notify at rest completion with sound/haptic according to settings |
| Sound and vibration controls | Makes timer noticeable | Useful and user-specific | Low if centralized in Settings | **KEEP** | Simple on/off and system-permission-aware behavior |
| Elapsed-rest display | Shows time beyond the target | Useful when the user does not resume immediately | Low cost | **KEEP** | Timer changes to elapsed-over-target after completion |
| Per-set rest button | Allows manual rest control | Useful as recovery path | Redundant if the timer always starts correctly | **SIMPLIFY** | Keep a manual start/restart action in timer controls rather than every set row |
| Full exercise name visibility | Prevents ambiguity between variants | Critical for heavy/light/custom variants | Truncation causes mistakes | **KEEP** | Names wrap or expand without hiding the meaningful suffix |

---

# E. Overrides, grading, and completion

| Feature or family | Current apparent purpose | Evidence of actual value | Interaction or cognitive cost | Disposition | Final behavior |
|---|---|---|---|---|---|
| Free load/rep/RPE override | Lets actual training differ from the template | Explicitly required | Low if inputs work well | **KEEP** | Any field may be changed without permission or warning unless a safety flag is relevant |
| Save change to this workout versus routine | Distinguishes one-off and permanent edits | Useful when substitutions occur | Asking on every change would be annoying | **SIMPLIFY** | Default to this workout; offer Save to routine as a secondary completion/action choice |
| Grade based on prescription adherence | Scores how closely the user followed the initial plan | Conflicts with Erik's expectation that legitimate accommodations count | Punishes adaptive training | **DELETE** | Do not score deviation itself |
| Workout grade | Makes completion rewarding and summarizes session quality | Erik explicitly cares about it | Can become opaque or duplicative | **SIMPLIFY** | One A–F grade with two or three plain reasons, based on actual completed work, effort, progress, logging completeness, and response to active flags |
| Hypertrophy score | Estimates stimulus quality | Erik enjoys seeing it | Overlaps with grade and implies precision without a distinct action | **DELETE** | Fold any valid inputs into the grade or flags; do not display a second score |
| Exercise progression summary | Shows where performance improved | Erik explicitly wants this | Low if limited to meaningful changes | **KEEP** | Completion summary identifies load, reps, RPE efficiency, or estimated-strength improvements |
| PR detection | Rewards notable performance | Erik explicitly wants PRs | Too many PR types can become noise | **SIMPLIFY** | Show meaningful weight, rep, and performance PRs; cap completion highlights |
| PR summary page | Gives a dedicated celebration screen | Rewarding but can add another step | Separate page is unnecessary | **DELETE** | Integrate PRs into the single completion summary and Progress |
| Post-workout completion experience | Creates closure and reward | Explicitly valued | Can become a dashboard dump | **KEEP** | One concise screen: grade, up to three improvements, any material flag, and Done/View progress |
| Recommendation for next time on completion | Prepares future progression | Useful only when material or clearly supported | Routine advice can duplicate what the live screen will show | **SIMPLIFY** | Show only a progress-ready fact or active backoff/plateau/deload action |
| Confetti/celebration effects | Makes logging fun | “Fun” is part of success, but no specific effect is required | Excess animation can slow completion | **DEFER** | First prove a polished, responsive completion state; add restrained celebration only if it improves experience |
| Completion confirmation | Prevents accidental finish | Data loss/early finish is consequential | One extra tap is acceptable | **KEEP** | Finish plus one concise confirmation; permit immediate resume/undo when feasible |

---

# F. Progress, history, and analytics

| Feature or family | Current apparent purpose | Evidence of actual value | Interaction or cognitive cost | Disposition | Final behavior |
|---|---|---|---|---|---|
| Completed-workout history | Supports review and data trust | Required for memory and interpretation | Low when chronological | **KEEP** | Progress contains a simple workout-history list |
| Exercise history | Shows prior sessions for one movement | Directly supports progression | Low and useful | **KEEP** | Search/select an exercise or variant and view recent sessions |
| Exercise charts | Visualize progression | Erik wants useful charts but says current charts are not there yet | Too many metrics make charts hard to interpret | **SIMPLIFY** | One primary performance trend with tappable points and concise session details; add only a second view when it answers a distinct question |
| Clickable chart points | Explains individual data points | Needed to understand how improvement occurred | Low cost | **KEEP** | Tap reveals load, reps, RPE, date, and set context |
| “Reps at weight” chart | Shows a narrow performance view | Previously identified as low-value | Adds chart clutter | **DELETE** | Use a unified exercise-performance history |
| Date-window selector | Changes analysis horizon | Sometimes useful for review | Visible windows encourage analytical fiddling | **SIMPLIFY** | Default to a useful recent horizon; one simple range switch in Progress only |
| Six qualifying weeks control | Defines engine analysis data | Internal consistency may be valuable | User should not manage qualification rules | **HIDE IN THE ENGINE** | Engine chooses relevant recent exposures and documents the rule outside the workout UI |
| Six-month active retention | Limits recommendation/chart scope | Recent data is most relevant | Deleting older data undermines trust | **SIMPLIFY** | Preserve all history; calculations default to recent data; older sessions remain reviewable |
| Weekly muscle-volume dashboard | Displays sets by muscle | No current use identified; Erik can lose it | Exposes complex accounting and creates dashboard burden | **DELETE** | Use minimal recent exposure internally for fatigue detection |
| Direct/secondary/fractional-set display | Explains muscle-volume math | No evidence it helps decisions | Requires learning taxonomy and invites argument over fractions | **DELETE** | Never display in the normal product |
| Direct/secondary/fractional-set calculation | Supports volume and fatigue logic | Some exposure mapping may be useful internally | Full precision may exceed actual reliability | **HIDE IN THE ENGINE** | Retain only the minimum mapping that demonstrably improves flags |
| Program-wide hypertrophy score | Summarizes the routine | No demonstrated decision value | Adds another score and planning surface | **DELETE** | No replacement |
| Per-lift hypertrophy score | Summarizes recent exercise quality | Overlaps progression chart and grade | Pseudo-precision and metric clutter | **DELETE** | Show actual performance trend and flags |
| Overall dashboard scorecards | Aggregate progress, recovery, and volume | No evidence they guide action | Compete with the logger's core | **DELETE** | Today shows only an active exception; Progress shows historical facts |
| Muscle-group progress charts | Aggregate exercises | Potentially useful but not demonstrated | Requires taxonomy decisions and can obscure actual lifts | **DEFER** | Reconsider only after exercise-level charts are useful and repeatedly used |
| Recovery-impact charts | Connect readiness and performance | Potential future analytical value | High complexity and low immediate use | **DEFER** | Preserve underlying data; do not build a normal-path screen |
| Archived historical mesocycles | Organizes workouts by program block | Erik has not used mesocycle management | Adds a planning concept to historical review | **DELETE** | Preserve workouts and routine names without a mesocycle interface |

---

# G. Routines, templates, and mesocycles

| Feature or family | Current apparent purpose | Evidence of actual value | Interaction or cognitive cost | Disposition | Final behavior |
|---|---|---|---|---|---|
| Basic routine/template | Defines exercise order, sets, range, RPE, and rest | Required to surface the expected workout | Low if editing is infrequent | **KEEP** | Maintain simple routines with days and exercise variants |
| Duplicate routine | Speeds future changes | Potentially useful when a new program is eventually needed | Low cost | **KEEP** | Secondary routine-management action |
| Edit routine | Changes order, targets, and exercises | Necessary even if rarely used | Can become complex if it exposes engine logic | **SIMPLIFY** | Edit name, day, exercises, sets, rep range, target RPE, and rest only |
| Automatic mesocycle generation | Designs an entire program | Erik has never changed his routine with it | Large workflow and maintenance burden | **DELETE** | No replacement in the core app |
| Modular mesocycle builder | Lets the user construct a block step by step | Not used | Large multi-page workflow | **DELETE** | Use ordinary routine editing when needed |
| Guide/Setup/Build/Check/Create tabs | Structures the mesocycle builder | No value without the builder | Navigation and state complexity | **DELETE** | No replacement |
| “Plan your mesocycle” guide | Teaches programming guardrails | Not used in current workflow | Makes the tracker a course | **DELETE** | Guidance may exist as an external note if later requested |
| Exercise candidate pool | Suggests options for a slot | No demonstrated use | Confusing and adds selection layers | **DELETE** | Search or create an exercise directly |
| Selected exercise portfolio | Reviews program-wide choices | No demonstrated use | Adds abstract planning terminology | **DELETE** | Routine editor shows the actual exercises |
| Equipment-filter setup | Constrains program generation | Actively contributes to unavailable-equipment frustration | Creates hard gates and setup work | **DELETE** | Optional equipment metadata only |
| Muscle-group scope selection | Defines program focus | No actual use demonstrated | Adds program-design decisions | **DELETE** | Routine editing is explicit |
| Frequency badges and target-status colors | Validate program frequency | No actual use demonstrated | Adds visual states and taxonomy | **DELETE** | No replacement |
| Maximum sets/day guardrail | Prevents excessive sessions | Could be a useful warning | Hard blocks conflict with overrides | **HIDE IN THE ENGINE** | At most a non-blocking warning during routine editing, not live logging |
| Maximum exercises/muscle/day guardrail | Prevents redundant programming | No demonstrated use | Requires reliable taxonomy | **DEFER** | Do not rebuild unless routine editing becomes frequent |
| Program-wide exercise reuse rules | Enforce variety across days | No demonstrated use | Can block legitimate choices | **DELETE** | Erik controls routine content |
| Recommended muscles/exercises in builder | Guides program completion | No current use | Adds algorithmic planning | **DELETE** | No replacement |
| Historical mesocycle lifecycle states | Tracks planned, active, and completed blocks | Not used | Adds state and terminology | **DELETE** | Routines may be active/inactive; workouts preserve dates |
| Program recommendation quality score | Grades exercise-science logic | Useful during development audit, not during workouts | User-facing score would be irrelevant | **HIDE IN THE ENGINE** | Keep as an engineering evaluation process, not an app feature |

---

# H. Data, imports, settings, and quality systems

| Feature or family | Current apparent purpose | Evidence of actual value | Interaction or cognitive cost | Disposition | Final behavior |
|---|---|---|---|---|---|
| Load, reps, and RPE history | Supports all useful progression and fatigue interpretation | Explicitly indispensable | None beyond normal logging | **KEEP** | Preserve permanently unless Erik explicitly deletes data |
| Exercise order history | Preserves session context | Explicitly requested | Automatic | **KEEP** | Store actual order |
| Session duration history | Preserves context | Explicitly requested | Automatic | **KEEP** | Store start, finish, active duration, and pause behavior where available |
| Readiness deviation history | Explains unusual sessions | Explicitly requested | Low when optional | **KEEP** | Store baseline/deviation and available objective metrics |
| Notes history | Captures context | Explicitly requested | Optional | **KEEP** | Store session and exercise notes |
| Rest-duration history | May support fatigue interpretation | Timer already produces it | No manual cost | **HIDE IN THE ENGINE** | Preserve automatically; expose only where useful |
| Strong import | Brings existing history into Comprehensive Fitness | Historically important to the app | One-time complexity, not daily burden | **KEEP** | Place in Settings/Data with clear import review |
| Warm-up inference during import | Prevents corrupted working-set history | Known prior issue | Hidden logic is appropriate | **HIDE IN THE ENGINE** | Infer conservatively and allow correction for ambiguous sessions |
| Data export | Protects ownership and portability | Important even if infrequent | Low when in Settings | **KEEP** | Export complete workout history in a documented format |
| Clear local data | Supports reset and recovery | Necessary but destructive | Appropriate confirmation burden | **KEEP** | Require explicit destructive confirmation |
| Data retention controls | Let the user manage active/archive windows | No demonstrated need | Adds settings and risk of accidental loss | **DELETE** | Preserve all data; internal analysis may use recent windows |
| Notification settings | Controls timer alerts | Directly supports rest timer | Low and infrequent | **KEEP** | Centralized sound/haptic/lock-screen controls |
| Privacy policy and support | Required utility and trust | Necessary | Navigation bugs are avoidable | **KEEP** | Standard Settings pages with a reliable back/close path |
| Weekly UI-consistency audit automation | Detects visual drift | Supports the desired polished experience without user effort | No user-facing cost | **KEEP** | Continue as an engineering-quality process |
| Browser/device visual verification | Ensures changes work in the real app | Necessary for a polished mobile experience | Development cost only | **KEEP** | Required definition-of-done step |
| Research-backed logic audit | Evaluates whether warning logic is defensible | Important because flags may change training behavior | Should not create workout UI | **KEEP** | Maintain as engineering/product validation outside the live experience |
| Multiple documentation sources of truth | Captures evolving decisions | Existing breadth may help history | Contradictions create implementation drift | **SIMPLIFY** | Final redesign documents become authoritative; archive or mark older specs superseded |
| Multiple recommendation sources of truth | Supports different screens/features | No user value; likely source of contradictions | High maintenance and trust cost | **DELETE** | One internal flag/progress contract feeds every visible output |
| Feature flags that permanently hide deleted systems | Enables gradual rollout | Useful temporarily | Becomes hidden maintenance burden if permanent | **SIMPLIFY** | Permit only time-limited migration flags with explicit deletion criteria |

---

# I. Final disposition summary

## Keep or simplify in the normal product

- Today with one expected workout
- optional readiness deviation
- weight, reps, and RPE logging
- previous performance
- stable rep range and target RPE
- active-set clarity
- rest timer and notifications
- free overrides
- substitutions and custom variants
- workout grade
- concise PR/progression summary
- exercise history and useful charts
- basic routine editing
- data import/export and settings
- material fatigue, plateau, pain/illness, readiness, and deload flags

## Keep only inside the engine

- objective readiness sync
- recent exposure calculations
- set qualification
- warm-up/working-set inference
- exercise/muscle mapping
- flag severity and confidence
- structured adjustment duration and return criteria
- rest-duration history
- minimum logic needed to make flags reliable

## Delete from the product

- mandatory readiness-start flow
- normal recommendation walls
- silent rep-range rewriting
- routine add-set prescriptions
- evidence cards and research citations
- separate hypertrophy scores
- weekly muscle-volume dashboards
- direct/fractional-set displays
- program-wide scorecards
- mesocycle builder/generator
- candidate pools and exercise portfolios
- builder guardrail workflows
- equipment blocking
- historical mesocycle management
- user-controlled qualification windows
- permanent hidden copies of deleted systems

## Defer

- exact normal add-load/add-rep prescriptions
- muscle-group progress charts
- recovery-impact charts
- advanced programming guardrails
- celebration effects beyond a polished completion state

---

# J. Governing product rule

**When training is normal, Comprehensive Fitness should mostly show history and accept data. When training is not normal, Comprehensive Fitness should state one clear action and why it matters.**
