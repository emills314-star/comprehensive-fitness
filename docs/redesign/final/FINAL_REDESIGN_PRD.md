# Comprehensive Fitness Final Redesign PRD

**Status:** FINAL PRODUCT AUTHORITY, partly superseded by D-028 (2026-10-31)  
**Date:** 2026-07-30  
**Superseded clauses:** [D-028](../DECISION_LOG.md) makes the app a per-session coach (load, reps, and working-set count, revised after each set) with Google Health recovery shown as information. Its normal-coaching, prefill, reason-text, and wearable-integration prohibitions no longer apply; see [`../coach/COACH_V1_CONTRACT.md`](../coach/COACH_V1_CONTRACT.md). All other clauses stand.  
**Implementation status:** Not started or authorized by this document  
**Adjudication evidence:** [`../audits/ADJUDICATION_MATRIX.md`](../audits/ADJUDICATION_MATRIX.md)  
**Companion contracts:** [`FINAL_FEATURE_DISPOSITION.md`](FINAL_FEATURE_DISPOSITION.md), [`RECOMMENDATION_ENGINE_CONTRACT.md`](RECOMMENDATION_ENGINE_CONTRACT.md), [`MIGRATION_AND_ACCEPTANCE_PLAN.md`](MIGRATION_AND_ACCEPTANCE_PLAN.md)

## 1. Authority and scope

This PRD is the final product-intent authority for the zero-based redesign. The Phase 1 documents are proposals and the Claude audit is advisory evidence. Current code and documentation remain evidence of implemented behavior, data coupling, and migration risk; they do not establish that a feature belongs in the final product.

The adjudication used this authority order:

1. Erik's actual behavior and original product jobs.
2. The simplest product that reliably serves those jobs.
3. Data integrity and recommendation correctness.
4. Technical feasibility and migration risk.
5. Existing architecture and sunk development effort.

When this PRD conflicts with a Phase 1 proposal, the final package wins. When it conflicts with the current application, it describes intended future behavior, not an already implemented fact. Implementation must update the living product/architecture/decision/UI documents when behavior actually changes.

## 2. Product decision

Comprehensive Fitness is a strong-quality workout logger with a quiet spotter.

It helps Erik start the intended workout quickly, see stable targets and relevant prior performance, record actual sets without friction, time rest, and review meaningful progress. It speaks up only for a credible fatigue, plateau, deload, readiness, pain, or illness exception that should change today's action.

It is not a program-design system, a research browser, a volume dashboard, a normal-progression coach, or a collection of fitness scores.

## 3. Jobs to be done

### 3.1 Start

When Erik is ready to train, show the expected workout immediately and let him begin with one deliberate tap. If he wants another routine day, make that choice available without turning Today into a planning dashboard. Do not require readiness entry or a confirmation ritual.

### 3.2 Execute

During each exercise, make these facts obvious:

- the full exercise-variant name;
- the stable set count, rep range, and target RPE;
- relevant prior performance for the same variant and set role;
- the current set and its completion state;
- the rest timer.

Let Erik record the workout he actually performs: different load, reps, RPE, set count, order, or exercise. The logger must not require the actual workout to pretend it matched the original plan.

### 3.3 Interpret exceptions

Use readiness and training history to identify rare, material exceptions. If no credible exception exists, remain silent. If one exists, give one plain action and one short reason, with concise detail available on demand.

### 3.4 Finish

Provide rewarding but factual closure: one workout grade, a small number of meaningful progress or PR highlights, and any still-relevant exception. Do not turn completion into an analytics dump or a second recommendation feed.

### 3.5 Review progress

Let Erik find completed workouts, inspect a specific exercise variant, understand chart points, and see how comparable performance changed. Preserve the facts behind the trend rather than replacing them with hypertrophy, volume, confidence, or program-quality scores.

### 3.6 Trust the record

Preserve load, reps, RPE, set roles, variant identity, order, duration, notes, readiness deviations, rest observations where recorded, imported provenance, and immutable historical snapshots. Support complete export and safe import. Removed product concepts do not justify deleting historical workout facts.

## 4. Product topology

There are exactly two persistent destinations:

1. **Today**
2. **Progress**

Neither destination has persistent subnavigation that acts like additional primary destinations.

The following are contextual or secondary, not persistent destinations:

- active workout;
- workout detail;
- exercise detail;
- alternate-workout picker;
- routine management;
- Settings;
- privacy and support;
- import, export, and clear-data actions.

While a workout is active, the logger owns the screen. Persistent app navigation is hidden. Today provides the route back through Resume.

There is no Dashboard, Plan, Routines/Templates bottom tab, More tab, Insights tab, Advanced section, or hidden destination for deleted features.

## 5. Today

Today opens on the next expected workout in the first useful viewport.

It contains:

- workout/routine-day identity;
- a concise exercise preview;
- one primary **Start** action;
- a secondary **Choose another workout** action;
- optional readiness-deviation entry;
- **Resume** instead of Start when an active draft exists;
- at most one resolved session exception when the engine contract permits it.

Today does not run or display hypertrophy analysis, weekly muscle-volume analysis, program scoring, research-status checks, evidence panels, normal exercise recommendations, or mesocycle planning.

### 5.1 Start behavior

Start opens the active workout directly. It does not open a confirmation, mandatory readiness, or prescription-review modal.

If another workout draft is active, starting a new one is not allowed. Present only:

- Resume;
- Finish;
- Discard.

Discard requires a concise destructive confirmation. The product never silently replaces the active draft.

### 5.2 Readiness behavior

Usual readiness is the default and needs no acknowledgement. A readiness deviation is optional and can be recorded before or during the workout.

Optional input may include:

- meaningfully poor or unusually good readiness;
- unusual soreness;
- pain, injury, or illness;
- a note;
- already available objective metrics with recorded provenance.

Skipping readiness cannot reduce logging capability, create a warning, lower a grade, or make the product appear incomplete. This redesign does not authorize a new wearable or health-service integration.

## 6. Active workout

### 6.1 Stable variant targets

A named exercise variant owns:

- normal set count;
- normal rep range;
- target RPE;
- rest default.

These targets remain stable until Erik explicitly edits that routine/variant. The normal recommendation engine may not rewrite them. A fatigue/readiness/deload exception may temporarily lower load, set count, or effort ceiling, but it may not silently change the variant's rep range.

Heavy, light, and custom variants have separate identity, targets, and history. Full names remain visible so meaningful suffixes are not lost.

### 6.2 Set row

Each set row supports fast load, rep, and RPE entry; clear complete/current/pending states; and predictable advancement.

Factual prefill priority is:

1. the corresponding prior working set from the most recent comparable workout for the same variant/role;
2. an explicit routine default;
3. blank.

An exact normal add-load or add-rep recommendation is not a prefill source.

RPE accepts 0.5 increments and must support immediate replacement of an existing value. Erik's reported mobile-device friction remains authoritative evidence of an outcome problem. The implementation mechanism is **NEEDS REVIEW** until target-device reproduction.

### 6.3 Prior performance

Show a compact previous-workout summary and corresponding prior working-set facts for the same exercise variant. Matching is role-aware and identity-safe. Warm-up, back-off, drop, and working sets are not silently compared as though interchangeable.

Missing or ambiguous history is shown as unavailable or uncertain source data; it is not invented.

### 6.4 Actual-workout control

The user can:

- add, remove, or skip a set;
- reorder exercises or choose what to do next;
- substitute an exercise;
- create a minimally specified custom exercise;
- duplicate/name a distinct variant;
- change load, reps, or RPE freely;
- add exercise or session notes;
- make a change for this workout only;
- explicitly save a suitable change to the routine.

The default is always **this workout only**. Logging does not mutate a routine implicitly.

Equipment can be descriptive metadata. A global equipment preference cannot prevent selecting an exercise, disable set/timer controls, reject actual work, or force a replacement.

### 6.5 Set roles and imported provenance

Warm-ups remain loggable. Set roles may be inferred or prefilled to protect comparable history, but ambiguous classification is correctable. Imported values retain original source/provenance. The product distinguishes `recorded` from `inferred`; it does not translate provenance into a visible model-confidence score.

### 6.6 Rest timer

The rest timer:

- starts from a completed set;
- uses the exercise variant's rest default;
- exposes remaining time;
- supports simple adjustment and Skip;
- shows elapsed-over-target after the target;
- survives the active-workout states required for real use;
- can notify at completion when the platform and permission allow it.

Sound, haptic, lock-screen, background, and installed-PWA behavior require browser and target-device verification. Source intent alone is not acceptance evidence.

### 6.7 Recovery and interruption

An active draft preserves entered sets, order, notes, elapsed state, timer context required for recovery, and the original historical/prescription reference needed for audit. It survives the supported reload/crash recovery path.

The system has one active workout. Finish and Discard are explicit. An immutable submitted workout is not silently recomputed when rules later change.

## 7. Quiet-spotter behavior

The engine is an exception resolver, not a normal-session narrator.

It may surface only:

- a direct pain/illness safety action;
- a session-level deload or readiness/fatigue action;
- a stricter exercise-level fatigue action;
- a plateau action;
- a factual progress-ready marker that does not prescribe exact load or reps.

The complete arbitration, evidence, persistence, and failure rules are defined in [`RECOMMENDATION_ENGINE_CONTRACT.md`](RECOMMENDATION_ENGINE_CONTRACT.md).

Normal behavior is:

- stable targets;
- relevant prior facts;
- no recommendation card;
- no confidence/severity badge;
- no evidence citation;
- no “hold” message;
- no exact add-rep/add-load prescription;
- no silent target mutation.

Pain/illness has the highest priority. The product gives a plain warning and cannot claim safety. If Erik chooses to continue, the logger records the actual workout and the explicit override; a warning does not authorize corrupting or blocking the record.

## 8. Completion and grade

Finishing requires one concise confirmation because accidental completion is consequential.

The completion screen contains:

- one versioned A-F grade;
- two or three plain grade reasons;
- at most three meaningful progress or PR highlights;
- the one still-relevant exception action, if any;
- Done and contextual Progress actions.

The grade is based on the actual completed workout. Its allowed evidence includes:

- logging completeness and data validity;
- comparable performance change;
- effort coherence;
- completion of meaningful work actually attempted;
- coherent handling of an active exception.

The grade does not reward mere adherence to the original prescription and does not penalize substitution, reordering, a legitimate set-count change, or an explicit safety/readiness adjustment merely because it differed from the plan.

There is no separate hypertrophy score, confidence score, execution-quality questionnaire, program score, or adherence score. Historical grades keep their stored value and algorithm version. A new algorithm never silently rewrites them.

No confetti or new celebration effect is authorized. Polish, responsiveness, clarity, and factual recognition are the required reward.

## 9. Progress

Progress is one coherent destination, not a dashboard plus persistent Overview/Lifts/History modes.

Its default view provides:

- chronological completed-workout history;
- exercise/variant search or selection;
- an interpretable exercise performance trend;
- contextual routes to workout and exercise details.

Exercise detail provides:

- recent comparable sessions;
- a primary chart with tappable points;
- point detail containing date, load, reps, RPE, role, and session context;
- a simple contextual date range when needed;
- relevant notes and source facts.

All history remains reviewable. A recent calculation/display window does not delete, archive, or make older records unavailable.

Progress does not contain:

- weekly muscle-volume dashboards;
- direct/secondary/fractional-set display;
- hypertrophy scores;
- overall scorecards;
- “reps at weight” as a separate chart;
- recovery-impact charts;
- muscle-group chart families;
- mesocycle archives;
- research/evidence status;
- persistent Progress subnavigation.

## 10. Routines and Settings

### 10.1 Routines

Routine management is secondary because it is infrequent. It supports:

- basic routines and days;
- ordered exercise variants;
- duplicate routine;
- edit name/order/exercises;
- edit stable sets, rep range, target RPE, and rest.

It does not contain program generation, mesocycle building, candidate pools, portfolios, muscle/frequency validation, equipment setup, programming guardrails, recommended muscles/exercises, lifecycle states, or program-quality scores.

### 10.2 Settings

Settings is limited to secondary utility:

- timer notification behavior and permission status;
- import;
- complete export;
- clear local data;
- privacy;
- support;
- contextual access to routine management.

Settings is not a refuge for deleted analytics, research, planner, recommendation, equipment, execution-quality, or confidence features.

## 11. Data and integrity contract

The redesign preserves:

- completed workouts and all recorded set observations;
- exercise and variant identity;
- actual exercise order;
- timestamps and durations with known semantics;
- exercise and session notes;
- readiness deviations and supplied objective metrics;
- rest observations where captured;
- original import values and provenance;
- immutable submitted snapshots;
- stored historical grade and algorithm version;
- routine/template facts required to understand history.

The following do not survive as active product state:

- mesocycle planning/lifecycle records;
- global equipment constraints;
- visible research/evidence status;
- user-facing confidence state;
- old adherence-grade active inputs;
- execution-quality questionnaire state for new workouts;
- planner-only selections, pools, validation state, and program scores.

Legacy compatibility may decode removed fields to preserve source history, but it does not create an active hidden domain, route, writer, renderer, or future record. Historical preservation is not permission to preserve the old product.

Import and migration are versioned, idempotent, and tested against synthetic legacy fixtures. A complete pre-migration export is required. The independent active-draft store and primary app data are both in migration scope.

## 12. Permanent exclusions

The following are outside the final product:

- mesocycle generation, building, lifecycle, and archives;
- normal exact load/rep/set coaching;
- automatic normal rep-range rewriting;
- multiple recommendation cards or presentation paths;
- mandatory readiness;
- global equipment blocking;
- hypertrophy and program-quality scores;
- volume dashboards and visible fractional-set accounting;
- Dashboard, Plan, More, Insights, Advanced, or permanent Routines navigation;
- research database status, citations, and evidence panels in the app;
- confidence/severity meters and badges;
- plate calculator;
- per-exercise execution-quality questionnaire;
- PR-only destination;
- muscle-group and recovery-impact chart families;
- permanent feature flags hiding deleted systems.

None may be retained under a new label or relocated to a secondary screen.

## 13. Product success and release gates

The redesign succeeds only when:

1. Erik can start his expected workout without a mandatory modal or readiness decision.
2. The active logger makes stable targets, prior performance, entry, current state, and timer immediately usable.
3. Erik can log actual work without equipment or recommendation logic blocking it.
4. Normal sessions are quiet; exception output is singular, actionable, and evaluated.
5. Completion provides one trustworthy grade and concise factual progress.
6. Progress answers workout-history and exercise-trend questions without score/dashboard clutter.
7. all pre-migration history and active-draft recovery survive verified migration;
8. deleted systems have no route, normal-path compute, active writer/reader, hidden state, permanent flag, or current-intent documentation;
9. target-device RPE and timer/notification behavior pass verification;
10. a five-workout field test confirms that the redesign is materially faster, quieter, and more trustworthy for Erik.

Automated tests, privacy review, browser/device checks, an independent review, and Erik's five-workout acceptance are required before publication can be authorized. This document does not authorize implementation, migration, deployment, commit, push, or publication.

## 14. Explicit non-inference rules

Codex must not infer or add:

- a new feature because retained data could support it;
- a user interface because a calculation remains internal;
- a direct wearable integration from permission to consume already available data;
- exact normal load/rep recommendations through prefill, completion copy, notifications, charts, or grade logic;
- an Advanced, More, Insights, Settings, Help, or hidden-route graveyard;
- current thresholds, grade weights, or formulas as approved merely because tests pass;
- a requirement to extract CSS, rewrite the stack, or remove generated `www/` packaging from file size/coupling alone;
- permission to delete historical workout facts while deleting their old interface;
- implementation or publication authority from final product approval.
