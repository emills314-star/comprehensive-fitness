# Comprehensive Fitness Redesign Milestone Log

## M0 — Preservation contracts and synthetic migration baseline

**Status:** IMPLEMENTED LOCALLY  
**Started:** 2026-07-30  
**Baseline revision:** `fe85e6665ec6a4896b1f1a5bbe982710358bb1b4`  
**Branch:** `codex/zero-based-redesign`  
**Checkpoint:** `3e24f93` (`chore(redesign): establish preservation baseline`)  
**Working tree at start:** Pre-existing untracked `.claude/`, `.vercel/`, `docs/redesign/`, and `redesign/prompts/`; preserve all user work.  
**Execution runtime:** Node `v24.18.0`, npm `11.16.0`; repository pins Node `22.23.x`, npm `10.9.x`  
**Visible behavior change:** None authorized

### Planned evidence

- Versioned target contract schemas.
- Synthetic app-data v1 and v2 backup fixtures.
- Legacy mesocycle/equipment compatibility fixture.
- Set-role ambiguity/provenance fixture.
- Historical recommendation/grade/execution-quality fixture.
- Active-draft recovery fixture.
- Deterministic, idempotent preservation comparison test.
- Focused backup/domain/runtime persistence regression results.

### Temporary artifacts

None beyond M0 schemas and synthetic fixtures. M0 does not introduce a production feature flag, adapter, writer, or runtime consumer.

### Documentation impact

- `docs/redesign/STATUS.md`: implementation authorization and M0 state.
- `docs/redesign/implementation/IMPLEMENTATION_EXECPLAN.md`: active sequencing authority.
- `docs/ROADMAP.md`: zero-based redesign implementation becomes active work.
- Current product/architecture/decision/UI behavior remains unchanged during M0; their implemented-state descriptions require no behavioral rewrite.

### Exit record

- Added five versioned target schemas for app data, backup, active draft, resolved actions, and prospective actual-work grades.
- Added four synthetic fixture families covering supported legacy app-data versions, legacy planner/equipment state, immutable historical recommendation/grade/execution-quality fields, role ambiguity/provenance, and interrupted active-draft state.
- Added `scripts/test-redesign-m0-preservation.js`; public discovery selected it automatically.
- Verified source-observation projection equality and idempotent backup validation/export round-trips for app-data versions 1 and 2.
- Verified incomplete decimal RPE, active exercise, exercise order, notes, completed sets, and timer state survive the synthetic active-draft serialization boundary.
- Verified fixtures contain no personal identity, personal-data path, or common private-email marker.
- Closed the executable preservation gap found during checkpoint review: current app-data v3 now exports as backup v3 and remains importable, while legacy v1/v2 backup envelopes retain their versioned compatibility path.
- Added a privacy-safe current-v3 round-trip fixture and preserved legacy/current stored grade values and versions through both the backup contract and strict app import allowlist.
- Focused passes:
  - `node scripts/test-redesign-m0-preservation.js`
  - `node scripts/test-backup-contract.js`
  - `node scripts/test-domain-integrity.js`
  - `node scripts/test-runtime-persistence.js`
- Full public gate: `npm.cmd test` passed 54/54 selected scripts (55 discovered; one private-only harness excluded).
- Static lint passed across 194 JavaScript and 3,128 JSON files.
- First sandboxed full run could not complete because the archive-integrity test was denied Git plumbing access; the approved unsandboxed rerun passed. This was an environment constraint, not a product failure.
- No production runtime consumes the target schemas yet. No current data or active draft was migrated.
- The executable backup contract and its `www/` mirror were synchronized. The shared service-worker cache advances with the immediately following M1 runtime checkpoint.

### Remaining external gates

- Independent migration verification begins when an executable migration exists.
- A complete real user export is required before any real local-data migration.
- No device, browser UI, PWA, notification, visual-baseline, or five-workout acceptance claim is made for M0.
- The full gate must be repeated on the repository-pinned Node/npm versions before M0 is called review-ready; the local environment used newer versions.

## M1 — Stable targets and logging integrity

**Status:** IMPLEMENTED LOCALLY  
**Started:** 2026-07-31  
**Completed locally:** 2026-07-31  
**Baseline revision:** `fe85e6665ec6a4896b1f1a5bbe982710358bb1b4`  
**Branch:** `codex/zero-based-redesign`  
**Checkpoint:** `2101e19` (`feat(redesign): stabilize workout targets and logging`)  
**Working tree at start:** Preserved the M0 work plus pre-existing untracked `.claude/`, `.vercel/`, `docs/redesign/`, and `redesign/prompts/`; no user work was overwritten.  
**Execution runtime:** Node `v24.18.0`, npm `11.16.0`; repository pins Node `22.23.x`, npm `10.9.x`  
**Visible behavior authority:** Final PRD §§6.1–6.4; feature dispositions C-01–C-12 and D-01–D-16  
**Primary exit gate:** Stable variant targets drive generated sessions and factual prefill; global equipment state cannot block any logged exercise; identity/role history remains intact.

### Exit record

- Migrated legacy routine target ownership into explicit stable variant/set-role targets and removed `standardWorkloadOverride` as an active gate.
- Normal engine exact set/load/rep outputs no longer rewrite routine targets or prefill editable fields.
- Factual prefills now use the corresponding prior same-variant/same-role set, explicit routine defaults, then blank.
- Global equipment preference state is decoded/discarded and no longer has an active UI writer, runtime reader, or normal logging rejection path.
- Role-aware history, named variant identity, workout history, active drafts, recommendation snapshots, and legacy planner records remain preserved.
- Added privacy-safe M1 migration data and focused contracts; updated stale UI/integration assertions.
- Fixed four-digit numeric input serialization and a mobile current-set completion/options touch collision found during required visual verification.
- Reproduced the reported RPE interaction failure in mobile Chromium: typing `7.5` over selected `7` produced `.5`, and the subsequent completion touch could be lost during blur-driven rerender.
- Added a bounded decimal replacement buffer for the active RPE field and deferred completion to the freshly rendered stable set target. The same focused edit now stores `7.5` and completes the set without clearing or reopening the field.
- Synchronized 40 public PWA assets and advanced the service-worker cache to v95 after the backup/import and RPE interaction contract changed.

### Verification record

- M1 focused migration, prescription, standards, integration, and backup/preservation suites passed.
- Full public gate passed 55/55 selected scripts; one private-only harness was correctly excluded.
- Lint, TypeScript check, Vite production build, PWA/native package verification, root/`www/` synchronization, and the 608-file public privacy guard passed.
- Five affected mobile Playwright regressions passed.
- Focused current-build visual verification passed 3/3 at 390 × 844 with long-name, 1,234.5-lb, uncompleted, completed, one-edit `7` to `7.5` RPE replacement, touch, and deleted-equipment-control states.
- Screenshots: `artifacts/ui-audit/m1/m1-mobile-stable-target-prefill.png`, `m1-mobile-stable-target-completed.png`, `m1-mobile-rpe-7-to-7-5.png`, and `m1-mobile-equipment-preference-removed.png`.

### Deletion and compatibility record

- Deleted active target-ownership checks based on `standardWorkloadOverride`.
- Deleted global equipment setting controls, event writers, normal-path readers, and equipment-only logging blocks.
- Retained only legacy decode/discard fields for backup compatibility and internal recommendation/planner equipment capabilities scheduled for M3 deletion.
- No M1 comparison path or new feature flag remains.

### Remaining gates

- Repeat on repository-pinned Node/npm before review-ready status.
- Physical-device RPE, notification, safe-area, and human workout acceptance are later gates.
- The authorized local checkpoint is `2101e19`. Push, deployment, real-data migration, baseline acceptance, and publication remain unauthorized and incomplete.

## M2 — Canonical exception resolver

**Status:** IMPLEMENTED LOCALLY — EXIT GATE PASSED
**Started:** 2026-07-31  
**Baseline checkpoint:** `2101e19`  
**Branch:** `codex/zero-based-redesign`  
**Visible behavior authority:** Final PRD §§7–8; feature dispositions B-01–B-18, C-03–C-12, H-18, X-06–X-08; recommendation engine contract §§2–15  
**Primary exit gate:** One versioned resolver is the only source of visible or stored current exception actions; ordinary cases are silent; safety precedence, scope, persistence, failure isolation, and stable-target invariants are proven.

### Exact milestone scope

- Normalize candidate input for only `pain_or_illness`, `deload`, `readiness`, `fatigue`, and `plateau`.
- Implement deterministic precedence, strictness, scope arbitration, expiry/return boundaries, supersession, and user handling.
- Persist resolved actions in current app data, active drafts, and submitted workout snapshots without rewriting historical snapshots.
- Route Today, active workout, completion, and grade through resolved actions only.
- Delete direct detector consumers, target-mutating fallbacks, duplicate recommendation stores/renderers, and visible evidence/confidence presentation assigned to M2.
- Evaluate surviving thresholds with privacy-safe ordinary, boundary, sparse, ambiguous, failure, conflict, variant, role, and nuisance fixtures; suppress any rule that does not pass calibration and independent recommendation review.

### Affected data and migration safety

- Existing `recommendationHistory`, `manualOverrides`, `workoutPrescription`, per-exercise recommendation snapshots, readiness observations, historical grades, and legacy imported fields remain readable and immutable.
- New current decisions use the versioned resolved-action contract and do not replace or recompute old records.
- Active drafts must preserve the action visible at evaluation time and the later `accepted`, `modified`, `ignored`, or `overridden` handling.
- Resolver or detector failure must produce no target mutation and must leave the logger usable; explicit pain/illness alone may use the canonical safety fallback.

### Authority/conflict review

No material contradiction was found in the final documents. Existing fatigue, readiness, plateau, and deload thresholds are implemented-state evidence only and are not automatically approved. M2 will not expose or retain a threshold merely because a legacy test passes.

### Exit record

- Added `exception-resolver.js` as the sole current resolved-action authority, with versioned candidate, resolver, and action contracts; deterministic IDs/digests; qualification, freshness, scope, precedence, strictness, supersession, expiry/return, and handling semantics.
- The only approved live rule is direct recorded current pain/injury or illness, which resolves to one session-scoped `stop_or_skip_work` action. All numeric fatigue, readiness, plateau, deload, grade, evidence, and confidence thresholds remain out of scope and cannot create a current action.
- Stable routine targets remain authoritative. Canonical actions are applied prospectively and cannot mutate the named variant's normal sets, rep range, RPE, rest, or routine defaults.
- Pain/illness is advisory, not a logging lock. Continuing records `handling: "overridden"` while add exercise/set, completion/skip, and rest controls remain usable.
- Active drafts, imports, and submitted workouts validate and retain versioned resolved actions. Existing historical recommendation snapshots, grades, and legacy fields remain readable without silent recomputation.
- Today, active workout, completion, and prospective grade consume persisted canonical actions only. Direct detector consumers, target-mutating fallbacks, legacy/modern recommendation renderers, duplicate current recommendation writers, visible confidence/evidence paths, and completion coaching were removed.
- The interim Today Program pulse and Progress score/expectation renderers were removed because they exposed an unapproved competing recommendation path. Their now-hidden analysis implementation is deletion debt assigned to M4.
- Independent recommendation-logic review approved the scoped M2 gate and explicitly marked every numeric candidate threshold out of scope.

### Files changed

- Runtime/package: `exception-resolver.js`, `app-foundation.js`, `app-workout.js`, `app-views.js`, `app-analysis.js`, `app-history.js`, `app-import.js`, `app.js`, `index.html`, `sw.js`, `scripts/sync-web.ps1`, and synchronized `www/` counterparts.
- Contract: `schemas/redesign-resolved-action.v1.schema.json`.
- Focused evidence: `scripts/test-redesign-m2-exception-resolver.js`, `scripts/test-redesign-m2-grade-bridge.js`, `scripts/test-redesign-m2-workout-writers.js`, `scripts/test-redesign-m2-app-integration.js`, `tests/fixtures/redesign-m2/`, and `tests/ui/redesign-m2-exception-resolver.spec.js`.
- Existing public contracts were modernized only where they required deleted M2 producers, renderers, confidence/evidence UI, or logging blocks.

### Verification

- Focused M0, M1, M2, backup, persistence, grade, safety, set-prescription, performance, and 38/38 application-integration contracts passed.
- Full public gate passed 59/59 selected scripts (60 discovered; one private-only harness excluded).
- Static lint passed for 203 JavaScript and 3,135 JSON files.
- TypeScript check and production Vite build passed.
- `sync:web` copied 41 public files, including the resolver; PWA/native public-only package verification passed for the 40 precached application assets. Service-worker cache is `comprehensive-fitness-pwa-v96`.
- Public privacy guard passed across 640 tracked Git or archive project files.
- Mobile Playwright passed 2/2 at 390 × 844. It verified ordinary silence, one pain action, stable 5–7 targets, exact prior performance, large loads, decimal RPE, continued logging, active-draft reload, and no horizontal overflow. Screenshots are under ignored `artifacts/ui-audit/m2/`.
- Root and packaged resolver hashes match after `sync:web`.

### Decisions, assumptions, and remaining gates

- The standalone schema remains structurally broader than the runtime semantic validator. No external schema-only action producer is authorized; align them before introducing one.
- Same-family action strictness is not parameter-aware. No numeric rule is live, so this is not an M2 defect; it must be resolved before any numeric action can be approved.
- Hidden hypertrophy/fatigue computation remains M4 deletion debt and has no visible, grade, workout, or resolver consumer.
- The temporary legacy grade bridge remains until M7; stored historical grade values/versions are preserved.
- Verification used Node 24.18.0/npm 11.16.0 rather than the repository-pinned Node 22.23.x/npm 10.9.x.
- Real private-history replay, physical-device/notification validation, desktop/native acceptance, Erik's five-workout field test, deployment, push, merge, and publication remain unperformed.
- **Checkpoint:** `243ed81` (`feat(redesign): establish canonical exception resolver`).

## M3 — Remove mesocycle and planner coupling

**Status:** COMPLETE — IMPLEMENTED LOCALLY
**Started:** 2026-07-31
**Baseline checkpoint:** `243ed81`
**Branch:** `codex/zero-based-redesign`
**Authority:** Final feature dispositions F-17 and G-04 through G-18; migration plan M3.

### Exact milestone scope

- Delete guided planner routes, views, guide/setup/build/check/create state, candidate pools, portfolios, equipment/scope/frequency setup, validation/status presentation, recommendations, lifecycle actions, and deep links.
- Remove `currentMesocycle`, mesocycle request coupling, `data.mesocycles`, `activeMesocycleId`, selection state, and all new planner writers from the normal runtime.
- Delete `guided-mesocycle.js`, planner-only engine branches, schemas, package/cache entries, and tests.
- Preserve workout/session/template facts and historical snapshots; keep only a versioned legacy backup decoder that accepts/discards obsolete planner keys without recreating active state.
- Prove by dependency search, migration fixtures, public tests, and runtime coverage that planner code is deleted rather than hidden.

### Affected data and migration safety

- Legacy backups may contain mesocycle records and relationships. They are input-only compatibility evidence, not active domain state.
- Completed workouts, session/template labels, exercise order/identity, set facts, embedded historical snapshots, and import provenance must survive import unchanged.
- No migration may delete or rewrite completed workout history. Planner-only keys are discarded only after their required workout/routine facts are represented on the preserved records.
- No production or irreplaceable personal data will be used or mutated; committed fixtures remain synthetic.

### Authority/conflict review

No final-document contradiction was found. The current planner's validation, equipment, research, confidence, quality-score, and lifecycle behavior is explicitly deleted product scope. Existing implementation effort and tests are migration evidence only and cannot justify a hidden planner subsystem.

### Implementation summary

- Deleted the guided planner module, both planner schemas, every guide/setup/build/check/create renderer and handler, planner CSS, lifecycle/storage APIs, planner cache/sync entries, and planner-only tests.
- Removed `mesocycles`, `activeMesocycleId`, `currentMesocycle`, planning draft state, training-day/equipment/scope settings, planner request inputs, and new planner linkage writers from the active runtime.
- Removed planner construction, distribution, review, lifecycle, scoring, and override paths from `prescription-engine.js`. Current recommendation and workout-prescription writers emit no mesocycle fields.
- Added one isolated legacy decoder in `backup-contract.js`. It accepts v1/v2/v3 envelopes containing obsolete planner keys, preserves workout/session/set/routine facts and immutable embedded snapshots, then discards planner-only state before strict active-data import or current export.
- Current schemas no longer require `mesocycleId` or `affectsMesocycle`; optional historical fields remain readable. Current manual overrides cannot create mesocycle changes.
- Plan now renders routines/templates only. A legacy `#mesocycle` hash has no planner destination or action graph.
- Synced the public package and advanced the service-worker cache from v96 to v97.

### Files changed

- Runtime and compatibility: `app-analysis.js`, `app-foundation.js`, `app-import.js`, `app-views.js`, `app-workout.js`, `app.js`, `backup-contract.js`, `index.html`, `prescription-engine.js`, `sw.js`, and synchronized `www/` copies.
- Deleted: `guided-mesocycle.js`, `schemas/guided-mesocycle.v1.schema.json`, `schemas/mesocycle-plan.v1.schema.json`, and `tests/ui/guided-planner-entry-regression.spec.js`.
- Contracts and package: `schemas/exercise-prescription.v2.schema.json`, `schemas/recommendation-snapshot.v1.schema.json`, `scripts/sync-web.ps1`, `scripts/verify-pwa.ps1`, and affected security/schema/package tests.
- Preservation evidence: `scripts/test-redesign-m3-planner-removal.js`, the M0 legacy fixture, and backup/import/persistence regression suites.
- Planner-only assertions were removed from engine, integration, performance, design-system, fuzz, taxonomy, and browser suites while unrelated recommendation, safety, identity, history, and deterministic-failure coverage was retained.
- Running-app evidence: `tests/ui/redesign-m3-planner-removal.spec.js`.
- Living documentation: `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, `docs/ROADMAP.md`, `docs/training-prescription-data.md`, `docs/performance.md`, and `docs/iphone-pwa-personal-coach-setup.md`.

### Data and migration result

- Synthetic legacy backups preserve record counts and workout/session/exercise/set/routine facts, including variant identity, order, load, reps, RPE, set role, duration, notes, execution-quality history, stored grade/version, and immutable embedded snapshots.
- Obsolete planner collections, active selection, nested relationship IDs, and planner/equipment settings are discarded idempotently and are not recreated by current exports.
- Orphaned obsolete active-plan IDs cannot block recovery of otherwise valid workout history.
- No production, private, or irreplaceable personal data was read, rewritten, or migrated.

### Verification

- Focused M3 decoder/deletion contract: PASS.
- Backup contract, M0 preservation, M1 stable targets, all focused M2 suites, application integration (38/38), schema contracts, security/platform, and all retained recommendation/engine suites: PASS.
- Full public gate: PASS, 60/60 selected scripts (61 discovered; one private-only harness excluded).
- Static lint: PASS, 202 JavaScript and 3,133 JSON files.
- TypeScript: PASS (`npm.cmd run redesign:typecheck`).
- Production Vite build: PASS (`npm.cmd run redesign:build`).
- Public package sync: PASS, 40 public-only assets; PWA/native verification: PASS, 39 cached assets; cache v97.
- Public privacy guard: PASS, 652 tracked Git/archive project files.
- Mobile running-app verification: PASS at 390 × 844. The rendered Plan state showed only routines/templates, a long routine name remained usable, a legacy planner hash did not expose a route, planner actions/scripts/state were absent, touch targets rendered, no error overlay appeared, and the inspected screenshot is `artifacts/ui-audit/m3/m3-mobile-plan-routines-only.png`.
- Dependency/residue search: no normal runtime planner/mesocycle reference; only the isolated compatibility decoder and historical snapshot read/validation fields remain.
- `git diff --check`: PASS apart from Git's expected CRLF notices.

### Decisions and assumptions

- Immutable embedded historical recommendation/workout snapshots remain byte-meaningful evidence even when they contain old planner labels; they are never current state or a source for new writes.
- Legacy top-level recommendation-history planner linkage is discarded because it is planning state, not an observed workout fact.
- Planner engine effort, schemas, and tests were deleted instead of retained behind navigation or a feature flag.
- The agent-browser CLI required by the optional verification skill was not installed and could not be fetched in offline-cache mode. Existing Playwright/Chromium automation performed the equivalent load, content, overlay, state, route, interaction, and screenshot checks.

### Remaining known issues and gates

- Two broader Strong-history Playwright assertions currently disagree with the shared runtime's recommendation copy/prior-row resolution. They were not caused by planner-field removal and remain separately reproducible; M3-specific Strong fixture normalization itself is planner-free.
- Verification used Node 24.18.0/npm 11.16.0 instead of the repository-pinned Node 22.23.x/npm 10.9.x.
- Real private-history replay, physical-device/notification validation, full browser matrix, independent migration verification, five-workout field testing, deployment, push, merge, and publication remain unperformed.
- **Checkpoint:** `3e102e2` (`feat(redesign): remove planner and mesocycle product`).

## M4 — Remove analytical and research clutter from execution paths

**Status:** IMPLEMENTED LOCALLY
**Started:** 2026-07-31
**Baseline checkpoint:** `3e102e2`
**Branch:** `codex/zero-based-redesign`
**Authority:** Final dispositions B-13, B-15, B-17, F-05, F-09 through F-16, X-07, and X-10; migration plan M4.

### Exact milestone scope

- Stop Today and workout Start from computing hypertrophy, weekly volume, research status, program scores, or normal plan previews.
- Delete dashboard/scorecard, hypertrophy, volume, fractional-set, “reps at weight,” research/evidence/count/version, confidence, and duplicate recommendation renderers, routes, state, styles, tests, consumers, and background producers.
- Remove the persistent Progress route/switcher for deleted analysis families while preserving source workout/set/readiness/rest/history facts and approved factual exercise history.
- Reduce internal exposure/relationship calculations to the minimum still exercised by retained recommendation evaluation; do not approve or add a numeric rule.
- Prove Today/Start removed-compute absence, Progress route absence, retained source-history integrity, and recommendation-evaluation compatibility.

### Affected data and migration safety

- Completed workouts, exercises, sets, variant identity, load/reps/RPE/role, duration, readiness/rest facts, notes, imports, stored historical grades, and immutable historical snapshots remain source observations.
- Derived hypertrophy, fractional-volume, program-score, confidence, evidence-status, and chart-view state are not source history and receive no new writer.
- No production/private personal data will be used or mutated. Synthetic fixtures and current public contracts provide deletion evidence.

### Authority/conflict review

No final-document contradiction was found. Existing calculation effort, research data, stored historical snapshots, and current UI tests do not authorize visible analysis or computation on Today/Start. Research/taxonomy inputs may remain only where a retained evaluated engine path or historical decoder demonstrably requires them.

### Implementation summary

- Today now presents the expected workout, one direct Start action, and compact alternate workouts without a normal plan comparison, score, weekly-volume link, or research status.
- Workout Start constructs stable named-variant targets and factual same-role prior prefills without generating a normal analytical prescription, confidence value, or mutable program-target context.
- Progress is one coherent destination containing a single factual per-variant performance chart, inspectable source facts, and chronological workout history.
- Dashboard, weekly/fractional volume, hypertrophy score/window/qualification, program scorecard, research/evidence/confidence presentation, persistent Progress subviews, duplicate recommendation presentation, and their state/actions/styles/tests were removed.
- The programming-family ledger and unused historical fractional-volume projection APIs were deleted from the runtime and package boundary.
- Web/native public assets were synchronized atomically; the stale ledger payload was pruned and the service-worker cache advanced to v98.

### Files changed

- Runtime/UI: `app-analysis.js`, `app-foundation.js`, `app-history.js`, `app-import.js`, `app-views.js`, `app-workout.js`, `app.js`, `index.html`, `prescription-engine.js`.
- Package boundary: `package.json`, `sw.js`, `scripts/sync-web.ps1`, `scripts/verify-pwa.ps1`, generated `www/` mirrors.
- Deleted runtime/test artifacts: `programming-family-ledger.js`, `www/programming-family-ledger.js`, `scripts/test-exercise-expectations.js`, `scripts/test-hypertrophy-score.js`, and `scripts/test-taxonomy-family-projection.js`.
- Tests: M4 removal/factual-Progress contract plus affected public and Playwright contract suites.
- Documentation: governing product, architecture, decision-engine, UI/UX, roadmap, training-prescription, redesign status, execution-plan, decision-log, and milestone-log records were reviewed and updated where current behavior changed.

### Data changes and migration safety

- No stored app-data schema or production/private data migration was performed.
- Completed workouts, exercise and variant identity, order, sets, load/reps/RPE/role, duration, readiness/rest, notes, imports, historical grades, PR-relevant source facts, and immutable legacy snapshots remain readable and unchanged.
- Historical compatibility fields remain accepted only at bounded read/import boundaries; current M4 writers do not create analytical prescription, confidence, hypertrophy, fractional-volume, program-score, research-status, or Progress-subview state.
- The canonical M2 live resolver requires no analytical exposure input. Its only approved live producer remains direct current pain/injury or illness.

### Features removed

- Today plan-versus-last and normal workout-plan preview.
- Dashboard/scorecard and weekly muscle-volume drilldowns.
- Direct/secondary/fractional-set presentation and the programming-family projection ledger.
- Program-wide and per-lift hypertrophy scores, qualification windows, and analysis caches.
- Research count/version/status, evidence, and confidence presentation.
- Persistent Progress modes/routes and duplicate recommendation surfaces.
- Separate “reps at weight” chart/test family and obsolete analytical test harnesses.

### Capabilities retained internally

- Stable routine targets and exact exercise-variant identity.
- Factual same-role prior-performance prefills.
- Chronological source history and one factual inspectable performance chart.
- Canonical pain/illness exception resolution and persisted handling.
- Narrow identity, import, historical-snapshot, and schema compatibility needed to preserve supported existing data.
- Stored historical grades and factual PR/achievement records remain for the sequenced M7 grade/completion migration.

### Verification evidence

- Focused M4 contract: `node scripts/test-redesign-m4-analytics-removal.js` — PASS.
- Full public gate: 58/58 selected scripts — PASS. Two research archive/workbook tests initially hit sandbox `spawnSync git EPERM`; both passed unchanged when rerun with read-only Git subprocess permission.
- App integration: 38/38 contracts — PASS.
- Static lint: PASS (199 JavaScript files, 3,133 JSON files).
- Type check: `npm.cmd run redesign:typecheck` — PASS.
- Production build: `npm.cmd run redesign:build` — PASS (24 modules; 262.07 kB JavaScript / 78.73 kB gzip).
- Web/PWA packaging: 39 public assets synchronized; 38-asset root/native verification PASS; service-worker cache v98.
- Privacy: PASS for 649 tracked/archive project files. The sandboxed first attempt could not invoke Git and therefore fell back to walking ignored private data; the unchanged gate passed when allowed to enumerate tracked files as designed.
- Focused Playwright: `tests/ui/redesign-m4-factual-progress.spec.js` — 2/2 PASS at 390 × 844.
- Visual evidence: `artifacts/ui-audit/m4/m4-mobile-factual-progress-point.png` and `artifacts/ui-audit/m4/m4-mobile-progress-empty.png`.
- Rendered states inspected: populated and empty Progress, long exercise/variant name, 1,234.5 load, 8.5 RPE, two-point date labels, chart-point detail, chronological source facts, and touch-sized mobile controls.
- The first populated-state run exposed a removed-helper `ReferenceError`; direct source-history selection fixed it. Visual inspection then exposed a narrow two-column layout and duplicate two-point date label; both were corrected before the final passing run.
- `git diff --check` and deleted-surface residue checks — PASS before checkpoint.

### Decisions, assumptions, and deviations

- M4 does not approve any numeric fatigue, readiness, plateau, deload, evidence, confidence, or grade threshold.
- Research/taxonomy and legacy recommendation schemas remain only where current identity/import/history compatibility tests prove a preservation need; they have no normal Today, Start, or Progress presentation.
- Stored historical `workoutAnalysis.confidence` is preserved as an immutable legacy fact rather than rewritten. No visible confidence meter or new normal prescription-confidence writer remains.
- Factual PR/achievement history remains until M7 because M7 owns the versioned actual-work grade and completion migration; M4 removed the separate analytical chart/product family without reordering that dependency.
- Verification used Node 24.18.0/npm 11.16.0 instead of the repository-pinned Node 22.23.x/npm 10.9.x.
- Physical-device/background-notification testing, real private-history replay, independent migration verification, full browser matrix, five-workout field testing, deployment, push, merge, and publication remain later gates.
- **Checkpoint:** `576f582` (`feat(redesign): remove analytical product surfaces`).

### Objective completion

**PASS.** Today and Start perform none of the deleted analytical work; Progress exposes no deleted route or persistent switcher; retained source history and exact variants remain intact; current recommendation output still crosses only the canonical M2 resolver; public, packaging, build, privacy, and mobile visual gates pass. M5 may begin after the recoverable M4 checkpoint is recorded.

## M5 — Install the two-destination shell and direct Start

**Status:** IMPLEMENTED LOCALLY
**Started:** 2026-07-31
**Baseline checkpoint:** `5da37dc`
**Branch:** `codex/zero-based-redesign`
**Authority:** Final dispositions A-01 through A-11 and migration plan M5.

### Exact milestone scope

- Make Today and Progress the only persistent destinations.
- Move routine management and Settings to contextual secondary routes; neither may appear as a persistent tab or a graveyard for deleted features.
- Make the expected-workout Start action open the active logger directly, without confirmation, mandatory-readiness, or review steps.
- Keep readiness entry optional, brief, secondary, and non-blocking before or during a workout.
- Preserve one active draft. If another workout is requested, offer only Resume, Finish, or Discard; require concise destructive confirmation before Discard and never create or replace a draft silently.
- Keep the active logger full-screen and make browser Back/close behavior coherent from active, secondary, workout-detail, and exercise-detail contexts.
- Retain only bounded old-route redirects needed to land supported links on Today, Progress, Settings, routine, workout, or exercise context.

### Affected data and migration safety

- Navigation/tab/secondary-route state and transient Start/conflict dialog state are not source workout history.
- The one active draft, its exercises/sets/notes/readiness/rest/timer state, and all submitted history remain protected.
- Routine/template records and Settings remain supported data; this milestone changes access hierarchy, not their stored content.
- No production/private data migration is required. Destructive-discard verification uses synthetic active drafts only.

### Authority/conflict review

No final-document contradiction was found. The current four-tab shell and `confirm`/`readiness`/`review` Start states are implemented-state evidence and must not be retained. The current active-draft guard is safety-critical but its choices and copy must be simplified without weakening draft preservation.

### Exit record

- The persistent shell now exposes exactly two destinations: Today and Progress. Routine management and Settings are contextual routes with an explicit return to Today, not persistent destinations or holders for removed product surfaces.
- The expected-workout Start action opens the full-screen active logger directly. It does not interpose confirmation, mandatory readiness, or review.
- Readiness remains an optional, single-step secondary entry before a workout and is available from the active logger; recording it refreshes the canonical resolved action without blocking logging.
- A second start request preserves the one active draft and offers exactly Resume, Finish, or Discard. Discard reaches a concise destructive confirmation, deletes only the selected draft after confirmation, and does not silently start or replace it.
- Browser Back from the active logger returns to Today with the draft intact and Resume available. Secondary Settings/routine routes and workout/detail contexts retain contextual return behavior; supported legacy links redirect only to retained contexts.
- The M5 shell correction retained legacy routine records' exact stored `reps` values. No visible writer remains for removed legacy settings. Obsolete planner settings, including training-goal/nutrition/experience fields, continue to be decoded then discarded before active import or current export; they are not preserved as active or current backup settings.
- A M4 boot-boundary correction discovered during M5 keeps normal boot identity-only: it loads the exercise identity catalog needed for compatibility, while the relationship map remains import-validation-only. This does not restore evidence, analytics, or a second recommendation authority.
- No production or private data migration/mutation occurred. M5 destructive-flow evidence uses synthetic active drafts only.

### Files changed

- Runtime and presentation: `app-analysis.js`, `app-foundation.js`, `app-import.js`, `app-views.js`, `app-workout.js`, `app.js`, `index.html`, `sw.js`, and synchronized `www/` mirrors.
- Packaged public boundary: `scripts/sync-web.ps1`, `scripts/verify-pwa.ps1`, service-worker cache v99, and removal of five no-longer-packaged analytical research JSON files from `www/`.
- Static contracts: the M5 shell contract plus affected integration, design, performance, safety, density, evidence-presentation, prescription-integration, and RPE/rest contracts under `scripts/`.
- Browser verification: the M5 navigation/draft suite and affected accessibility, lifecycle, Settings, Progress, history, target, safety, and compatibility specs under `tests/ui/`.
- Documentation: `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, `docs/ROADMAP.md`, `docs/training-prescription-data.md`, and the four redesign implementation/governance records.

### Features removed

- Persistent Plan/Routines and More/Settings destinations.
- Ordinary Start confirmation, mandatory-readiness, and prescription-review steps.
- Visible training-goal, nutrition-phase, experience-level, and returning-after-gap writers.
- Direct personal/research evidence import/status presentation and normal analytical evidence boot.
- Packaged analytical research JSON assets not needed by identity-only normal startup.

### Capabilities retained internally

- Exact exercise/variant identity compatibility, including Strong aliases, with the minimum catalog-only normal boot.
- On-demand relationship-map validation for supported backup/evidence compatibility imports.
- One active draft, submitted workout history, routine/template facts, exact rep targets, readiness observations, rest state, and immutable historical snapshots.
- The versioned legacy decoder that accepts obsolete planner keys, preserves approved workout/routine/history facts, and discards deleted planning-only settings before active import/current export.

### Decisions, assumptions, and deviations

- No authoritative contradiction was found. The final PRD and M3 migration decision govern the legacy settings boundary: workout/routine/history facts survive, but deleted planner settings do not become current active data or backup output.
- M5 exposed and corrected four narrow implementation defects rather than changing scope: exact legacy reps widening, a compatibility reps edit not updating its range, pointer-close blur rerendering the readiness dialog, and a custom-exercise renderer referencing a deleted prescription helper.
- The identity-only boot correction is recorded as M4 debt discovered and closed during M5. It is a boundary correction, not a new M5 product feature.
- `docs/PERFORMANCE.md` was reviewed; its current superseded-benchmark record required no M5 text change.

### Verification record

- Focused M5 mobile Playwright suite: 5/5 PASS at 390 × 844, including two-destination navigation, direct/full-screen Start, optional readiness, exact active-draft conflict actions, and confirmed discard/restart behavior.
- Strict target regressions: 2/2 PASS.
- Identity/compatibility UI: 65/65 mobile tests plus a separate 13/13 mobile suite passed; two desktop-only compatibility/rollback boundaries passed 2/2.
- Readiness dismissal and custom-exercise rendering regressions: 2/2 PASS after eliminating the numeric-blur rerender race and the deleted prescription-mapping reference.
- Public suite: one clean approved run passed 60/60 selected scripts.
- Static lint: PASS (202 JavaScript files, 3,118 JSON files, 0 inline violations).
- Type check: PASS.
- PWA verification: 33 checks PASS.
- Production Vite build: PASS with 24 modules on the approved build run.
- Privacy scan: PASS across 646 files.
- Nine M5 mobile screenshots were captured and inspected, including contextual Routines/Settings, two-destination Today, direct logger, Today Resume, optional readiness, active-draft conflict, discard confirmation, and the post-discard requested workout.

### Remaining external gates

- Pinned Node/npm, physical-device/back/close and timer/notification behavior, independent migration verification, real private-history replay, full browser matrix, five-workout field acceptance, commit, push, merge, deployment, and publication remain outside this local M5 checkpoint.

### Recoverable checkpoint

- Local milestone commit: pending creation after this evidence record and final staged privacy review.

### Objective completion

**PASS.** The M5 behavior and listed automated/visual gates pass, with no data migration or mutation. M6 may begin after the recoverable M5 checkpoint is recorded.
