# Complete UI Reinvention: 15 Design Systems

> **Status:** IMPLEMENTED concept dossier and non-production comparison lab; PARTIALLY IMPLEMENTED editable Figma source
> **Decision:** Dual Track is the recommended direction; production cutover remains PLANNED
> **Synthetic fixture:** All examples use the fictional Sample Athlete and contain no imported or personal fitness data.

## Blank-slate rule

The current interface is not a visual reference. It is used only to inventory authoritative behavior and data contracts. Navigation, hierarchy, components, styling, and layouts in this study were designed from zero. Color, typography, and imagery do not earn uniqueness credit.

The interactive evidence is the separate React/TypeScript lab under `redesign/`. Run `npm run redesign:dev`, then open `http://127.0.0.1:4175`. The lab exposes all 15 systems, all eight screen families, raw scores, capability classifications, the uniqueness rubric, and the Dual Track journey.

## UI-neutral capability contract

Every direction must present the same 22 capabilities: next action, readiness, template start, active logging, set roles, rest timer, prescription evidence, pain-safe substitution, audited overrides, explicit submission, completion summary, templates, mesocycle planning, progress overview, lift analysis, history editing, settings, privacy controls, import/export, sync consent, offline/update state, and data-conflict recovery.

The representative screen families are:

1. Next action / home
2. Readiness and workout start
3. Active workout and rest
4. Prescription, evidence, and safety
5. Submission and completion
6. Templates and mesocycle planning
7. Progress, lift analysis, and history
8. Settings, privacy, import/export, and sync

## Evaluation method

Backend feasibility is scored out of 100: domain-contract reuse 30, state/persistence reuse 20, adapter effort 20, PWA/Capacitor/performance fit 15, and safety/accessibility/test migration risk 15. Experience quality is scored out of 100: in-gym speed 25, screen economy 20, clarity 20, aesthetic coherence 15, accessibility 10, and planning/analytics scalability 10.

`Final = experience × 0.60 + backend × 0.40`. Scores are comparative design evidence, not claims that implementation work is already complete.

| Rank | Direction | Experience | Backend | Final | Decision note |
|---:|---|---:|---:|---:|---|
| 1 | Dual Track | 91 | 86 | **89.0** | Winner: fastest balanced live workflow with persistent context |
| 2 | Bento Studio | 85 | 92 | **87.8** | Finalist: safest broad migration and strongest responsive composition |
| 3 | Set Stack | 88 | 87 | **87.6** | Finalist: best raw set-entry speed and screen economy |
| 4 | Weekline | 86 | 88 | 86.8 | Excellent temporal continuity; weaker for long active sessions |
| 5 | Mission Console | 84 | 85 | 84.4 | Strong readiness/finality; risks over-framing routine workouts |
| 6 | Iron Ledger | 79 | 91 | 83.8 | Lowest migration risk; less immediate action hierarchy |
| 7 | Stadium Live | 82 | 84 | 82.8 | Energizing live session; broadcast density needs restraint |
| 8 | Editorial Performance | 78 | 87 | 81.6 | Excellent explanations and analysis; slower under the bar |
| 9 | Body Atlas | 82 | 75 | 79.2 | Exceptional muscle comprehension; geometry/accessibility cost |
| 10 | Coach Thread | 80 | 78 | 79.2 | Clear deterministic guidance; transcript accumulation risk |
| 11 | Command Gym | 73 | 80 | 75.8 | Expert speed and keyboard access; poor novice discoverability |
| 12 | Training Workshop | 75 | 76 | 75.4 | Strong manipulation metaphor; accessible direct manipulation is costly |
| 13 | Program Circuit | 76 | 73 | 74.8 | Best system explanation; graph navigation is difficult on phones |
| 14 | Orbit | 74 | 70 | 72.4 | Memorable spatial identity; rectangular screen and input penalties |
| 15 | Quest Map | 77 | 65 | 72.2 | Strong continuity; persistent unlocks exceed the current contract |

## The directions

### 1. Dual Track — winner

A music-sequencer model places exercises on parallel lanes, set roles in clips, and the current set in a persistent thumb dock. A playhead makes interruption recovery immediate. Planning becomes a week arrangement board; progress overlays performance tracks. Phone lanes stack vertically; wider layouts lengthen the time axis and place analysis beside it. Primary grammar: scrub, tap, arm, commit.

### 2. Bento Studio — finalist

An adaptive studio composes task modules by context. Today is a priority tile with a set strip, planning is a modular canvas, and analytics are resizable insight modules. Phone modules collapse to a deliberate reading order; larger screens use masonry without changing priority. Primary grammar: open, pin, expand, resolve. Its risk is drifting into an undifferentiated dashboard.

### 3. Set Stack — finalist

The current set occupies the foreground as a card; a stack and exercise rail preserve what comes next. Planning uses sortable session decks and progress uses before/after card stories. Phone exposes one card; desktop fans future cards. Primary grammar: advance, defer, inspect, undo. All gesture actions require visible equivalents.

### 4. Weekline

A continuous timeline makes today, readiness, recovery, upcoming work, and history one temporal system. Phone uses a vertical spine; desktop unfolds days horizontally. Sessions expand in place, plans use a scheduling rail, and progress is longitudinal. Primary grammar: scrub, expand, reschedule, compare.

### 5. Mission Console

Readiness is preflight, exercise groups are mission stages, live sets are telemetry, and submission is debrief. Phone reveals one stage; desktop becomes a multi-panel console. Primary grammar: check, arm, execute, debrief. Copy must avoid implying medical precision.

### 6. Iron Ledger

A dated training notebook embeds current actions into a compact ledger. History editing feels native, plans become folios, and progress appears as annotations across entries. Phone is one narrow page; desktop becomes an indexed two-page spread. Primary grammar: write, stamp, annotate, index.

### 7. Stadium Live

The workout is a broadcast: lineup, current attempt, clock, event ticker, and recap. Phone prioritizes the score and attempt; desktop adds splits and statistics. Planning uses a team sheet and progress becomes season statistics. Primary grammar: start event, record attempt, review replay.

### 8. Editorial Performance

Today is a front page, the plan is an issue, and progress is a reported feature. Phone reads as one article; wider screens add columns without changing order. Primary grammar: read, reveal, annotate, continue. It excels at explanation and analysis, not rapid repetitive logging.

### 9. Body Atlas

An anatomical map is primary navigation. Regions expose readiness, volume, upcoming work, and progress; logging moves into a selected-region sheet. Phone alternates map and sheet; desktop keeps both visible. Primary grammar: locate, select, isolate, compare. A complete linear and keyboard alternative is mandatory.

### 10. Coach Thread

A deterministic coaching transcript presents existing decisions and embeds safe actions inline. Planning is a guided interview and progress a review thread. Phone preserves chronology; desktop pins context and evidence. Primary grammar: answer, choose, explain, confirm. It does not imply AI or open-ended inference.

### 11. Command Gym

A command surface fronts dense results and context-aware mobile shortcuts. Workout logging uses a numeric console; planning uses structured command composition. Phone pairs prompt and chips; desktop adds palette and results pane. Primary grammar: type, choose, execute, recall.

### 12. Training Workshop

Exercises are tools, programs are trays, and the current workout is a workbench. Phone stacks trays above a dock; desktop exposes a spatial bench and inventory. Primary grammar: pick up, configure, place, inspect. Every direct manipulation requires a non-drag equivalent.

### 13. Program Circuit

Exercises, muscles, sessions, fatigue, and progression become connected nodes. A workout traverses an active path; planning edits a dependency graph; progress shows signal strength. Phone shows one branch plus outline; desktop exposes the graph and inspector. Primary grammar: trace, branch, inspect, reroute.

### 14. Orbit

The current action stays at the center while readiness, plan, progress, and data occupy stable satellites. Sets form a ring; plans nest orbits; progress uses concentric arcs. Phone includes a linear fallback list. Primary grammar: rotate, center, expand, return.

### 15. Quest Map

A mesocycle is a route, workouts are stages, and evidence-backed milestones mark the journey. Phone follows a vertical path; desktop opens the terrain. Primary grammar: choose route, enter stage, complete, unlock. Persistent unlock state is not present today; it is explicitly scored as requiring backend change and is not fabricated by the concept.

## Capability feasibility evidence

Classifications mean: **R** = Reused without presentation-semantic change, **A** = Adapted through the typed UI boundary, **N** = New UI only with no backend change, and **B** = Requires backend change.

The common evidence baseline is complete and explicit:

| Capability | Fit | Capability | Fit |
|---|:---:|---|:---:|
| Next action | N | Readiness | A |
| Template start | A | Active logging | A |
| Set roles | R | Rest timer | A |
| Prescription/evidence | R | Pain-safe substitution | A |
| Audited overrides | A | Explicit submission | R |
| Completion summary | A | Templates | A |
| Mesocycle planning | A | Progress overview | A |
| Lift analysis | A | History editing | A |
| Settings | A | Privacy | R |
| Import/export | R | Sync consent | R |
| Offline/update state | R | Conflict recovery | R |

Per-concept deviations from that baseline follow; capabilities not listed retain the baseline. This is a lossless classification of all 330 concept/capability combinations.

| Direction | Deviations from baseline |
|---|---|
| Dual Track | Next action A; progress overview N; lift analysis N |
| Bento Studio | Progress overview N |
| Set Stack | Next action A; active logging N; history editing N |
| Weekline | Mesocycle planning N; progress overview N |
| Mission Console | Readiness N; explicit submission A; summary N |
| Iron Ledger | Next action A; history editing N |
| Stadium Live | Active logging N; summary N; progress overview N |
| Editorial Performance | Summary N; progress overview N; lift analysis N |
| Body Atlas | Mesocycle planning N; progress overview N; lift analysis N |
| Coach Thread | Readiness N; mesocycle planning N; conflict recovery N |
| Command Gym | Settings N; import/export A |
| Training Workshop | Template start N; active logging N; mesocycle planning N |
| Program Circuit | Active logging N; mesocycle planning N; progress overview N; conflict recovery N |
| Orbit | Active logging N; mesocycle planning N; progress overview N |
| Quest Map | Mesocycle planning B; progress overview B; summary N |

## State, responsive, and accessibility contract

Each system must represent the same state vocabulary:

- Empty: explain what is absent and offer one safe next action.
- Loading: preserve layout and announced progress without suggesting data exists.
- Offline: keep local actions available, label unavailable network effects, and preserve pending intent.
- Failure: retain user input, state the failed operation, and offer retry or safe exit.
- Destructive confirmation: name the exact scope and recovery implications.
- Conflicting data: show both copies, provenance, and an explicit resolution choice.
- Update available: separate notification from installation and stale-asset recovery.

At 320 px, no workflow depends on horizontal page scrolling; dense spatial concepts receive linear alternatives. At 390 px, the active action stays thumb reachable. At 768 px, planning and evidence can appear adjacent. At 1280 px, analysis gains width but never changes canonical action order. All visible gesture, drag, radial, map, and graph controls need keyboard and assistive-technology equivalents. Reduced motion, 200% text, focus order, high contrast, and target size are release gates.

## Finalist comparison

| Measure | Dual Track | Bento Studio | Set Stack |
|---|---|---|---|
| Typical next-set action | Select clip, edit dock, commit | Open priority tile, edit strip, commit | Edit foreground card, advance |
| Interruption recovery | Best: playhead + current clip + dock | Good: priority tile persists | Good: foreground card, weaker future context |
| Information density | High but spatially ordered | Adaptive and safest across sizes | Extremely economical, intentionally narrow |
| Accessibility risk | Medium: lanes need linear semantics | Low-medium: conventional module reading order | Medium: gestures need visible equivalents |
| Engineering risk | Medium | Low | Medium |
| Planning scalability | Strong arrangement model | Strongest general-purpose model | Weaker beyond sortable decks |

Dual Track wins without blending concepts: it retains its sequencer metaphor, parallel lanes, playhead, and logging dock. Bento modules and Set Stack cards are not imported into the winner.

## Editable Figma source

**PARTIALLY IMPLEMENTED:** [Complete Fitness — 15 UI Reinventions](https://www.figma.com/design/FVvZCYKEFFlOLkLGz2J0Xn) contains the editable foundations created before the connected Figma Starter-plan tool-call limit was reached: four variable collections, 75 concept primitive colors, and semantic aliases for the first 12 directions. The automation limit prevented creation of the remaining aliases, components, and screen canvases. **NEEDS REVIEW:** resume the same file after the plan limit resets; do not recreate or silently substitute flattened screenshots.

The repository lab is the complete inspectable design evidence in this phase. Figma remains a joint source of truth only after its missing production checklist is completed.

## Focused six-direction screen study

**IMPLEMENTED:** The lab now opens on a 30-screen comparison for Dual Track, Weekline, Mission Control, Editorial Performance, Body Atlas, and Coach Thread. One shared tab switch updates all six directions across five tasks: active workout, reps/sets editing, template selection, recommendation exploration, and warning flags.

Dual Track now uses Bento Studio’s light canvas and blue action color (`#F2F7FB` / `#2B7FFF`). Mission Control and Editorial Performance use that exact palette while retaining their own console and publication structures. Weekline, Body Atlas, and Coach Thread retain their distinct established palettes. This focused study changes mockup presentation only; it does not change the original structural scores, winner decision, domain behavior, or production entry.
