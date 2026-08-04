# Comprehensive Fitness Migration and Acceptance Plan

**Status:** FINAL MIGRATION PLAN; EXECUTION NOT AUTHORIZED  
**Date:** 2026-07-30  
**Product authority:** [`FINAL_REDESIGN_PRD.md`](FINAL_REDESIGN_PRD.md)  
**Feature authority:** [`FINAL_FEATURE_DISPOSITION.md`](FINAL_FEATURE_DISPOSITION.md)  
**Engine authority:** [`RECOMMENDATION_ENGINE_CONTRACT.md`](RECOMMENDATION_ENGINE_CONTRACT.md)  
**Evidence:** [`../audits/ADJUDICATION_MATRIX.md`](../audits/ADJUDICATION_MATRIX.md)

## 1. Purpose and boundary

This plan defines how to move from the current application to the final redesign without treating technical coupling as permanent product scope and without sacrificing workout history, active-draft recovery, or recommendation correctness.

It does not authorize implementation, dependency changes, data migration, baseline acceptance, commit, push, merge, deployment, or publication.

Implementation may begin only in a separately authorized task. Every application revision must follow the repository documentation loop: inspect governing docs before work, change code/tests/docs together, update `docs/ROADMAP.md` when implementation status changes, and report every unresolved mismatch as **NEEDS REVIEW**.

## 2. Migration principles

1. Product scope is fixed by the final package; coupling changes order, not outcome.
2. Preserve source observations before removing active concepts.
3. Stable variant targets must become authoritative before deleting the old prescription path.
4. A canonical exception resolver must exist before deleting every old producer consumer.
5. UI removal is incomplete while normal-path computation, state, routes, writers, tests, or current-intent docs survive.
6. Compatibility readers do not imply compatibility writers or hidden active domains.
7. Every temporary adapter and feature flag has a named deletion gate.
8. Root runtime files remain the edit source while `www/` is generated packaging.
9. CSS extraction or a framework rewrite is not a migration prerequisite.
10. Publication is a separate owner decision after all applicable gates pass.

## 3. Protected invariants

The following must remain true at every deployable migration checkpoint:

- no completed workout is lost, duplicated, silently regraded, or recomputed;
- load, reps, RPE, roles, variant identity, order, duration, notes, readiness, rest observations, and import provenance remain attributable;
- one recoverable active draft remains recoverable or is explicitly and losslessly migrated;
- the user can record actual work even if recommendation logic is unavailable;
- a second active workout cannot be created;
- stable target ownership is unambiguous;
- old backups can be evaluated/imported through a versioned compatibility path without recreating deleted active features;
- a complete export is available before destructive schema cleanup;
- private fitness/health data is never placed in public docs, fixtures, audit artifacts, commits, or deployments.

## 4. Required evidence baseline

Before implementation changes:

1. Record the candidate revision, branch, dirty-worktree state, runtime/package versions, and generated-package status.
2. Inventory every route, state field, schema field, backup field, active-draft field, producer, consumer, cache entry, test, and current-intent document for:
   - mesocycles/planner;
   - equipment constraints;
   - recommendation/prescription/confidence/evidence;
   - grade/hypertrophy/volume;
   - execution-quality questionnaire;
   - navigation/Progress switcher;
   - React/Vite concept tooling.
3. Build privacy-safe synthetic fixtures for:
   - each supported backup version;
   - a backup with mesocycle and equipment fields;
   - imported warm-up/working/back-off/drop ambiguity;
   - active workouts at meaningful recovery boundaries;
   - historical prescription/recommendation/confidence fields;
   - historical grade and execution-quality fields.
4. Capture current behavior only where it will be used for migration comparison. A current screenshot or passing test is not a redesign acceptance baseline by default.
5. Produce and verify a complete user export outside any public artifact path before migrating real local data.

The five focused current-state tests run during adjudication passed, but they prove existing contracts only:

- `scripts/test-backup-contract.js`
- `scripts/test-domain-integrity.js`
- `scripts/test-workout-grade.js`
- `scripts/test-evidence-claim-ui.js`
- `scripts/test-phase3-core-ui.js`

## 5. Sequenced migration

Each milestone ends with focused tests, documentation review, a final-diff check, and an explicit list of temporary artifacts still present.

### M0. Freeze scope and establish preservation contracts

**Work**

- Translate the final feature and engine contracts into implementation issue/test coverage without adding scope.
- Version the target active-data, backup, active-draft, resolved-action, and grade contracts.
- Establish immutable historical-record and pre-migration-export fixtures.
- Define the legacy compatibility-reader boundary.
- Establish privacy review and local-only data handling.

**Temporary accommodation**

- Current UI and engines remain unchanged.

**Exit gate**

- Synthetic migrations are idempotent, source observations compare losslessly, active drafts restore, and exported fixtures round-trip.

**Delete at exit**

- Nothing; this milestone creates evidence and contracts only.

### M1. Make stable targets and logging integrity authoritative

**Work**

- Move normal set count, rep range, target RPE, and rest ownership to the named exercise variant.
- Migrate current templates/routines to explicit stable values.
- Set factual input prefill priority to the corresponding prior working set for the same variant/role, explicit routine default, then blank.
- Separate mutation authorization/data integrity from advice.
- Clear/ignore global equipment constraints and remove their ability to block exercise selection or logging.
- Preserve role-aware previous-performance matching and identity-safe variants.

**Temporary accommodation**

- The old prescription can be generated in non-visible comparison mode to find unintended target changes.
- Legacy backup import may read and discard equipment preferences.

**Exit gate**

- Generated sessions retain stable routine targets across normal cases.
- Exact engine load/rep outputs do not prefill fields.
- Every exercise can be logged regardless of legacy equipment preference.
- History/variant/role matching passes migration and regression fixtures.

**Delete at exit**

- `standardWorkloadOverride` as a target-ownership gate;
- active global equipment writers/readers and hard-rejection behavior;
- old normal target mutation and prefill consumers;
- the M1 comparison path once evidence is accepted.

### M2. Establish the canonical exception resolver

**Work**

- Adapt current fatigue, readiness, plateau, deload, and pain/illness candidates to the normalized candidate boundary.
- Implement the precedence, scope, evidence, silence, persistence, and failure rules in the engine contract.
- Version and persist resolved actions and user handling.
- Add calibrated evaluation fixtures and historical replay using approved privacy-safe data.
- Connect grade logic only to the resolved action, never raw detectors.

**Temporary accommodation**

- Existing detectors may run in a non-visible shadow comparison.
- A single old visible path may remain only until the new resolver meets the visible-output gate; it cannot be shown alongside the new result.

**Exit gate**

- At most one session and one stricter exercise action are returned.
- Ordinary cases produce no action.
- Stable ranges never change.
- Direct pain/illness input wins precedence.
- Detector failure keeps logging usable.
- Independent recommendation-logic review approves each surviving rule/threshold or marks it out of scope.

**Delete at exit**

- every direct UI consumer of a detector;
- fallback target mutation;
- legacy/modern recommendation renderers;
- duplicate recommendation storage paths;
- confidence/evidence presentation;
- shadow adapters and migration flag after accepted comparison;
- detectors that do not support an approved category.

### M3. Remove mesocycle and planner coupling across layers

**Work**

- Remove mesocycle routes, builder views, guide/setup/build/check/create state, candidate pools, portfolios, equipment setup, scope/frequency validation, recommendations, and lifecycle presentation.
- Remove `currentMesocycle` and planner data from workout/prescription requests.
- Remove planner-only engine code, schemas, active-domain state, writers, service-worker entries, and tests.
- Migrate any workout/routine facts needed for historical understanding into non-mesocycle records.
- Keep a versioned legacy backup decoder that accepts obsolete planning keys without recreating active state.

**Temporary accommodation**

- A read-only migration adapter may map legacy relationships to preserved workout/routine facts.
- Legacy backups may still contain mesocycle keys.

**Exit gate**

- Old backups import workout/session/template facts without loss.
- No normal runtime request, route, state, or writer references a mesocycle.
- A dependency search and runtime coverage prove removed builder code is not merely hidden.

**Delete at exit**

- builder/UI/routes and deep links;
- `guided-mesocycle.js`;
- planner-only prescription-engine branches and schemas;
- `data.mesocycles`, `activeMesocycleId`, selection state, and new writes;
- planner validation/quality-score runtime;
- planner tests, cache entries, and current-intent docs;
- temporary mapping code that is not needed by the isolated legacy decoder.

### M4. Remove analytical and research clutter from execution paths

**Work**

- Stop Today from computing hypertrophy, weekly volume, research status, program scores, or normal plan previews.
- Remove dashboard/scorecard, hypertrophy, volume, fractional-set display, “reps at weight,” research-status, evidence, confidence, and duplicate recommendation UI.
- Reduce internal muscle exposure calculations to only what an approved fatigue rule demonstrably needs.
- Preserve all source history.

**Temporary accommodation**

- Internal comparison instrumentation may measure removed computation until performance/behavior equivalence is established; it is local engineering evidence only.

**Exit gate**

- Today and Start perform no removed analysis.
- Progress has no removed route or persistent switcher.
- Recommendation evaluation still passes with the minimum retained exposure inputs.

**Delete at exit**

- removed renderers/routes/state/styles/tests;
- Today consumers and background producers;
- unused fractional/volume/hypertrophy calculation code;
- research/evidence/count/version UI;
- instrumentation and feature flags used for comparison.

### M5. Install the two-destination shell and direct start flow

**Work**

- Make Today and Progress the only persistent destinations.
- Replace the persistent Progress mode switcher with one home and contextual drilldowns.
- Make Start direct.
- Keep optional readiness secondary and non-blocking.
- Implement the one-active-draft Resume/Finish/Discard conflict path.
- Keep Settings/routines secondary and the active logger full-screen.

**Temporary accommodation**

- Old hashes may redirect to the appropriate new Today, Progress, Settings, routine, workout, or exercise context.

**Exit gate**

- Persistent-choice audit finds only Today and Progress.
- Start has no confirmation/readiness/review modal.
- Active-draft conflict cannot create a second workout.
- Browser back/close behavior is coherent from secondary and detail screens.

**Delete at exit**

- Plan/More/Routines/Dashboard persistent routes;
- Progress switcher and `progressView` active state;
- start confirmation/readiness/review modal states;
- obsolete hashes after the documented redirect-support window;
- temporary navigation flag.

### M6. Simplify the active workout

**Work**

- Implement stable-target headers, full variant names, role-aware prior facts, clear set states, fast inputs, factual prefill, and predictable advancement.
- Keep add/remove/skip/reorder/substitute/custom variant/notes.
- Default edits to the current workout and make routine mutation explicit.
- Simplify warm-up/role correction.
- Consolidate timer controls and preserve active-draft recovery.
- Remove plate calculator and execution-quality questionnaire.

**Temporary accommodation**

- Historical execution-quality fields remain readable.
- Existing input code may remain until target-device RPE reproduction identifies the actual defect and chosen fix.

**Exit gate**

- Mobile/browser automated coverage passes.
- Target-device RPE replacement and completion behavior passes.
- Timer survives required navigation/background/reload cases and permission states.
- Substitution/variant identity/history fixtures remain correct.
- Active-draft recovery loses no entered data.

**Delete at exit**

- plate-calculator code/state/styles/tests;
- execution-quality live/completion UI and new writers;
- duplicate timer buttons and superseded input workarounds;
- equipment-blocking remnants;
- M6 UI migration flag.

### M7. Version completion, grade, and Progress

**Work**

- Introduce one versioned grade based on actual work under the final contract.
- Preserve old stored grades and versions without silent regrading.
- Build one concise completion state with limited factual highlights.
- Provide chronological workout history and exercise-variant trend/detail.
- Make chart points inspectable.

**Temporary accommodation**

- Legacy grade details may be decoded in historical records without retaining the old live algorithm or confidence UI.

**Exit gate**

- Grade fixtures cover substitutions, reorder, set changes, readiness/safety actions, missing data, and historical versions.
- Completion has one grade and no analytics dump.
- Chart points resolve to correct source observations.
- All history remains accessible beyond recent calculation/display windows.

**Delete at exit**

- old adherence-weighted live grade algorithm and planned-set penalties;
- grade confidence/category display;
- hypertrophy/volume/program scores;
- PR-only page;
- old Progress mode state/routes;
- any temporary regrade/comparison path.

### M8. Remove concept scaffolding and all dead migration structure

**Work**

- Remove the concept-only React/Vite gallery, tests, scripts, configs, and dependencies that have no production consumer.
- Preserve the final redesign package, adjudication matrix, audit, prompts/governance records, and historical decision evidence.
- Remove every expired feature flag and compatibility writer.
- Update living docs to the verified implementation state.
- Synchronize generated `www/`, verify root/generated parity, update service-worker cache/versioning, and run native/PWA sync checks required by the repository.

**Temporary accommodation**

- None.

**Exit gate**

- Dependency/file/route/state/schema/test/doc searches find no active deleted feature.
- Generated packaging matches the root source and stale caches cannot serve removed UI.
- Final diff contains no private data, credentials, local exports, or generated audit artifacts with user data.

**Delete at exit**

- all expired flags, adapters, shadow paths, dead code, orphan styles/assets, obsolete tests, prototype-only runtime dependencies, stale cache entries, and current-intent documentation for removed systems.

Do not extract inline CSS or rewrite the application stack unless a separately evidenced implementation need is approved.

## 6. Data migration matrix

| Data family | Permanent treatment | Migration treatment | Forbidden outcome |
| --- | --- | --- | --- |
| Completed workouts and sets | Preserve | Versioned lossless migration/compatibility read | Deletion or recomputation |
| Exercise/variant identity | Preserve | Normalize without merging distinct named variants | Silent heavy/light/custom collapse |
| Set roles | Preserve with provenance | Conservative inference and correction; keep original imported value | Treat unknown as working or fabricate certainty |
| Order/duration/notes/readiness/rest | Preserve when recorded | Retain semantics/provenance; missing remains missing | Invent values or discard context |
| Active workout draft | Preserve/recover | Migrate independent draft store and timer-relevant state | Start a second draft or lose entries |
| Historical prescription/action snapshots | Preserve immutable | Isolated decoder and versioned new resolved-action contract | Re-render/recompute through old engine |
| Historical grades | Preserve value/version | New formula applies prospectively | Silent historical regrade |
| Historical execution-quality answers | Preserve read-only | Stop new writes and remove UI dependence | Treat missing as positive/negative |
| Mesocycle planning/lifecycle | Remove from active domain | Decode legacy keys; retain only workout/routine facts | Hidden active mesocycle arrays/writers |
| Global equipment preference | Remove | Accept/discard legacy preference | Hidden blocker |
| Research/evidence/confidence UI state | Remove | Preserve source snapshots only if historically embedded | Active user-facing status or score |
| All workout history beyond recent window | Preserve | Recent window affects computation/default view only | Six-month deletion/archive |

## 7. Acceptance suites

### 7.1 Contract and unit coverage

- stable variant-target ownership;
- factual prefill priority;
- role/variant-aware previous matching;
- set-role inference and original-value preservation;
- one-active-draft integrity;
- timer state and duration semantics;
- import/export/backup versioning and idempotency;
- grade versioning and actual-work basis;
- resolver qualification, precedence, scope, silence, expiry, and failure;
- no normal exact load/rep/set recommendation;
- no equipment block;
- immutable submitted snapshots.

### 7.2 Migration coverage

For every supported legacy backup and active-draft fixture:

- dry-run/preview;
- import;
- second import/idempotency;
- export;
- source-observation comparison;
- relationship and identity comparison;
- historical snapshot/grade comparison;
- absence of recreated active mesocycle/equipment/confidence state;
- recovery from an interrupted migration.

An independent migration verifier must review the preservation evidence before any real local-data migration is accepted.

### 7.3 UI and accessibility coverage

- only two persistent destinations at all supported viewport sizes;
- direct Start and optional readiness;
- one-active-workout conflict flow;
- full-screen logger;
- full exercise/variant names;
- clear current/completed/pending states without color alone;
- keyboard/focus/label/touch-target behavior;
- numeric and decimal RPE behavior;
- add/remove/skip/reorder/substitute/custom variant;
- notes and timer controls;
- concise completion;
- Progress history, chart-point inspection, and contextual navigation;
- Settings/privacy/support return paths;
- text scaling, contrast, reduced motion, and screen-reader semantics.

### 7.4 Browser, PWA, and target-device coverage

Verify on the supported browser/device matrix:

- cold and cached load;
- installed PWA;
- background/foreground timer behavior;
- lock-screen/live notification and denied-permission behavior;
- sound/haptic controls;
- reload/crash active-draft recovery;
- software keyboard and numeric RPE entry;
- scroll/focus after set completion;
- offline/reconnect behavior where supported;
- service-worker upgrade from the prior release;
- generated `www/` parity.

Source inspection and desktop emulation do not satisfy the target-device RPE or notification gate.

### 7.5 Performance coverage

Measure before and after on the same representative fixture/device:

- Today render work;
- Start-to-usable-logger time;
- set-completion interaction latency;
- chart/detail interaction;
- bundle/cache behavior.

Removed analytics/research/planner computation must not remain on Today or Start. Acceptance requires no user-perceptible regression in the core logging loop and documented removal of unnecessary work; this plan does not invent an arbitrary millisecond promise without a measured baseline.

### 7.6 Privacy and publication coverage

- use synthetic fixtures in committed tests;
- keep raw, normalized, derived, report, backup, and local database artifacts containing personal data untracked and unpublished;
- inspect complete Git status and staged file list before any separately authorized commit/push;
- exclude credentials, tokens, environment files, deployment secrets, and app-data exports;
- verify logs and screenshots do not expose health/fitness records;
- perform an independent privacy review before publication authorization.

## 8. Deletion acceptance

A DELETE ruling passes only when all applicable layers are absent:

- persistent navigation and contextual routes;
- visible controls/copy/styles/assets;
- normal-path computation and event handlers;
- active state/defaults/writers/readers;
- request and engine inputs;
- schema fields for new records;
- service-worker/cache/package references;
- production dependencies used only by the feature;
- tests that enforce the old experience;
- current-intent documentation;
- permanent flags or hidden entry points.

The following may remain:

- immutable historical source fields;
- isolated versioned legacy decoders;
- synthetic migration fixtures;
- adjudication/audit/decision history clearly labeled as historical evidence.

Search alone is not proof of deletion, and a hidden route is not deletion. Runtime, backup, migration, and generated-package checks are required.

## 9. Five-workout human field test

After automated, migration, privacy, independent, and target-device checks pass, Erik performs five real workouts with the candidate revision.

For each workout, record without adding new product features:

- whether the expected workout was immediately clear;
- whether Start required any unnecessary decision;
- whether readiness could be skipped without consequence;
- whether load, reps, and decimal RPE were entered correctly on the first intended interaction;
- whether prior performance matched the correct variant/role;
- whether the timer behaved correctly in the actual device state;
- whether overrides, reordering, substitutions, and notes reflected actual work;
- whether recommendation output was absent when not useful and actionable/trustworthy when present;
- whether active-draft recovery was needed and correct;
- whether completion felt concise, factual, and rewarding;
- whether Progress made the completed work and exercise trend understandable.

The field test passes only if:

1. all five workouts start without a mandatory confirmation/readiness/review flow;
2. no workout loses or corrupts recorded data;
3. decimal RPE entry and set completion work reliably on the target device;
4. no equipment or recommendation state prevents logging actual work;
5. no normal session produces a wall of coaching, competing action, or exact normal progression prescription;
6. any surfaced exception is understood and judged useful, or it is removed/recalibrated before acceptance;
7. completion and Progress facts match the source workout;
8. Erik judges the candidate materially faster, quieter, and more trustworthy than the current product.

A failure is not resolved by hiding the offending feature or documenting it as Advanced. Fix, remove, or recalibrate the behavior and repeat the affected acceptance evidence.

## 10. Final review and release state

The candidate can be called **review-ready** only after:

- all milestone exit gates through M8 pass;
- automated, migration, UI/accessibility, device/PWA, performance, and privacy evidence is complete;
- the final diff and generated package are cross-checked;
- living documentation matches verified implementation;
- an independent product/architecture/recommendation/migration review finds no unresolved critical mismatch.

It can be called **approved for publication** only after the five-workout field test passes, required human acceptance is recorded, and Erik explicitly authorizes publication of the named revision and destination.

It can be called **published** only after that exact revision reaches that exact destination and hosted/device verification succeeds.

## 11. Codex non-inference rules

Codex must not:

- begin implementation from this plan without a separate authorization;
- keep two approaches because migration is difficult;
- turn compatibility readers into permanent writers or hidden product state;
- move deleted features to Advanced, More, Insights, Settings, Help, or feature flags;
- add a wearable integration, new chart, celebration effect, guardrail, score, or recommendation category;
- approve a current engine threshold or grade weight without the required evaluation;
- accept a visual baseline or field-test result on Erik's behalf;
- infer publication authority from implementation authority;
- delete or publish personal fitness/health data.
