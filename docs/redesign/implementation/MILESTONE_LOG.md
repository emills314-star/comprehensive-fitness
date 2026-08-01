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

- At the M2 checkpoint, existing `recommendationHistory`, `manualOverrides`, `workoutPrescription`, per-exercise recommendation snapshots, readiness observations, historical grades, and legacy imported fields remained readable for staged migration. M8 successor decision D-026 narrows permanent preservation to owning-workout snapshots/actions/handling/overrides; retired top-level global planner/evidence collections decode/discard.
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

- Local milestone commit: `ef71085` (`Implement M5 two-destination shell and direct start`).

### Objective completion

**PASS.** The M5 behavior and listed automated/visual gates pass, with no data migration or mutation. The recoverable checkpoint is recorded, so M6 may begin.

## M6 — Simplify the active workout

**Status:** IMPLEMENTED LOCALLY
**Started:** 2026-07-31
**Baseline checkpoint:** `36f3a4b`
**Authority:** Final PRD section 6, dispositions D-01 through D-30 and E-01/E-02, recommendation-contract input and reevaluation boundaries, and migration plan M6.

### Exact scope before implementation

- Present stable variant targets and full variant names without silently rewriting routine facts.
- Keep load, reps, and decimal RPE fast to replace and edit; make completed, current, pending, and skipped set states clear with predictable advancement.
- Show compact prior facts only from the same variant and comparable set role, with unavailable or uncertain history stated truthfully.
- Keep actual-work controls for add/remove/skip/reorder, substitution, named/custom variants, exercise/session notes, and explicit role correction.
- Keep every active-workout edit scoped to the current workout by default. Routine mutation remains a separate explicit action.
- Consolidate rest into one recoverable timer surface with remaining, adjustment, Skip, elapsed-over-target, notification-permission, and navigation/reload/background behavior.
- Preserve active-draft order, entered fields, notes, timer context, provenance, and original target/reference data across supported recovery.
- Delete the plate calculator, live/completion execution-quality questionnaire and writers, duplicate timer controls, superseded input workarounds, equipment-blocking remnants, and any M6-only transition flag.

### Affected user data and migration safety

- Completed workouts and historical `executionQualityAssessment` values remain readable; M6 must stop creating or changing that field.
- Active drafts contain the mutable set facts, roles/provenance, order, notes, stable-target snapshots, manual overrides, and timer state that must round-trip without loss.
- Routine/template targets are read-only reference facts during normal logging unless the user invokes the existing explicit routine-update action.
- Exercise and variant identity, role separation, warm-up protection, substitutions, skipped/added sets, and comparable prior facts must remain unchanged by UI deletion.
- M6 uses synthetic fixtures and local browser state only. No production or private fitness data is authorized for migration or mutation.

### Authority check

- No material contradiction is identified. The migration plan explicitly allows historical execution-quality fields to remain readable while requiring live/completion UI and new writers to be removed.
- The final documents require target-device RPE and timer/notification evidence. Browser and emulated mobile verification will be completed locally; any physical-device-only result that cannot be proven will be recorded as an external acceptance gate rather than approximated in product behavior.

### Exit record

- The active logger presents each full exercise/variant name with one stable target summary and compact prior comparable facts. Prior facts are restricted to the same performance identity and comparable set role.
- Load, repetitions, and RPE remain directly editable. Invalid, non-finite, negative, fractional-repetition, and non-half-step RPE inputs are rejected before acknowledgment or mutation; a prefilled RPE of 7 still supports a one-edit replacement with 7.5.
- Completed, current, pending, and skipped set states are explicit. Warm-up classifications remain excluded from progression-qualifying comparisons.
- Normal substitution preserves a stable replacement identity, original source identity, multi-hop provenance, unfinished set position, and prior completed facts. Named custom variants retain independent targets and histories.
- Adding an exercise requires a name, working-set count, rep range, target RPE, and rest. Active-workout changes are workout-only by default; saving a substitution or target change back to the routine requires a separate explicit action.
- The completed workout remains the factual source of truth for added, removed, moved, skipped, substituted, and custom work.
- Rest uses one shared starter, shown only after a completed non-skipped set, and one timer surface. Timer authorization independently rejects incomplete/skipped sources. It persists deadline/elapsed context through reload, displays overtime, supports adjustment and Skip/Finish, and keeps the workout usable when notification permission is unavailable.
- Active-draft recovery and current imports validate strict numeric, text, enumeration, count, and nested template boundaries atomically. Invalid candidates do not partially mutate durable or in-memory state.
- Plate-calculator UI/state, live and completion execution-quality questionnaires/writers/badge, duplicate rest starters, global equipment/exclusion logging blocks, and the obsolete generic execution-block transient were removed.
- Submitted historical execution-quality and equipment/exclusion snapshot bytes remain readable as immutable compatibility evidence. No current writer, normal renderer, ranking consumer, or prescription consumer remains.
- No production or private data was migrated or mutated.

### Files changed

- Runtime and presentation: `app-analysis.js`, `app-foundation.js`, `app-history.js`, `app-import.js`, `app-sync.js`, `app-views.js`, `app-workout.js`, `app.js`, `index.html`, `sw.js`, and synchronized `www/` mirrors.
- Data contract: `docs/redesign/implementation/schemas/active-workout-draft-v2.schema.json`.
- Focused contracts: `scripts/test-redesign-m6-active-workout.js`, plus updated persistence, performance, resistance-model, integration, RPE/rest, history, safety, and package tests under `scripts/`.
- Running-app verification: `tests/ui/redesign-m6-active-workout.spec.js`, plus updated active-workout, history, lifecycle, accessibility, safety, and target specs under `tests/ui/`.
- Deleted packaged presentation asset: the controlled-execution badge image from root and `www/`.
- Living documentation: `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DECISION_ENGINE.md`, `docs/UI_UX.md`, `docs/ROADMAP.md`, and the redesign implementation/governance records.

### Verification record

- Focused M6 static contract: PASS.
- Focused M6 mobile Playwright suite: 13/13 PASS at 390 x 844, including long names, large values, exact decimal RPE, completed/skipped states, normal and custom substitutions, multi-hop provenance, routine-save choice, corrupt draft/import rejection, rest overtime, and reload recovery.
- Public suite: 61/61 selected scripts PASS (62 discovered; one private-only harness excluded).
- App integration: 38/38 PASS.
- Static lint: PASS (204 JavaScript files, 3,118 JSON files, 0 inline-script violations).
- Type check: PASS.
- Workflow validation: PASS.
- Production Vite build: PASS with 24 modules.
- PWA/native public package verification: 33 assets PASS.
- Tracked-file privacy scan: PASS across 644 files.
- Public research archive integrity: 57 hashes PASS; workbook determinism: 19 sheets PASS.
- Root/`www` parity passed for the audited runtime payloads.
- Independent M6 review initially found that the shared rest starter appeared before a set was complete. The renderer, authorization boundary, static contract, and running-app regression were corrected; the scoped independent re-review passed with no remaining local code blocker.
- Three M6 screenshots were captured and visually inspected at exactly 390 x 844:
  - `artifacts/ui-audit/m6/active-workout-stable-targets-390x844.png`
  - `artifacts/ui-audit/m6/custom-substitution-identity-390x844.png`
  - `artifacts/ui-audit/m6/overtime-reload-recovery-390x844.png`

### Decisions, assumptions, and deviations

- No M6 transition flag was needed or introduced.
- Runtime validation, rather than the intentionally declarative JSON schema alone, is the executable authority for atomic active-draft and import acceptance.
- Historical submitted execution-quality data is preserved without preserving the deleted product surface. Active drafts and new submitted workouts cannot create that field.
- The repository-pinned Node 22.23.x/npm 10.9.x gate was unavailable; verification used Node 24.18.0/npm 11.16.0.
- Physical-device RPE keyboard behavior, true OS background suspension, and notification-permission delivery remain external target-device acceptance gates. Browser/mobile/PWA recovery is locally proven and no product behavior was approximated to claim the physical result.

### Recoverable checkpoint

- Local milestone commit: `441b6cb` (`feat(redesign): simplify active workout logging`).

### Objective completion

**PASS.** Every locally executable M6 acceptance criterion passes. Active logging is materially simpler, factual history and variant separation remain protected, deleted M6 features are absent from current product paths, and no private or production data was changed. The physical-device-only checks remain explicitly unproven external gates and do not block the recoverable local M6 checkpoint.

## M7 — Version completion, grade, and Progress

**Status:** COMPLETE — IMPLEMENTED LOCALLY
**Started:** 2026-07-31
**Baseline checkpoint:** `6b9682f`
**Authority:** Final PRD sections 8–10, dispositions E-04 through E-10, F-01 through F-17, G-01 through G-18, recommendation-contract grade/persistence boundaries, and migration plan M7.

### Exact scope before implementation

- Replace the old adherence/planned-set live grade with one prospective, versioned A–F grade based on actual submitted work, logging completeness/validity, comparable performance, effort coherence, meaningful work attempted, and explicit handling of the canonical exception action.
- Do not reward obedience to a generated plan or penalize substitution, reordering, legitimate set-count change, or explicit safety/readiness adjustment merely because actual work differs from the original prescription.
- Preserve every stored historical grade value/version and immutable workout record; never silently regrade history.
- Keep one consequential Finish confirmation, then present one concise completion state with one grade, two or three plain reasons, at most three meaningful factual progress/PR highlights, the still-relevant canonical exception if any, Done, and contextual Progress.
- Remove the live legacy grade algorithm, grade confidence/category display, detailed adherence/plan diff, achievement-badge/analytics dump, PR-only presentation, and any temporary grade-comparison path.
- Retain one coherent Progress destination with chronological complete history, exact exercise/variant selection, one interpretable comparable-performance trend, inspectable point facts, and contextual workout/exercise detail.
- Ensure recent calculation/default-display windows never delete, archive, or make older history inaccessible.
- Retain secondary routine management only for basic days, ordered variants, duplication, and stable name/order/exercise/set/range/RPE/rest editing; do not restore program-generation or score systems.

### Affected user data and migration safety

- Submitted workouts, sets, roles/provenance, exact variant identity, order, duration, notes, readiness/rest facts, resolved actions, overrides, PR observations, and immutable snapshots are preservation-critical inputs.
- Historical `session.grade`, `session.gradeVersion`, and stored `workoutAnalysis.grade`/algorithm version values remain source facts. Only new submissions receive the new grade contract.
- Chart points must resolve to their exact submitted session/exercise/set facts; working/warm-up role and variant separation remain unchanged.
- Removing live grade and badge presentation must not delete stored PR arrays, historical grades, or older workout accessibility.
- M7 uses synthetic fixtures and local browser state only. No production/private fitness data is authorized for migration or mutation.

### Authority/conflict review

- No final-document contradiction is identified. The current adherence-weighted grade, plus/minus bands, confidence/category UI, detailed plan diff, and broad achievement strip are implemented-state evidence explicitly assigned for replacement/deletion in M7.
- The final contract approves the grade evidence families but no current numeric formula. M7 must introduce and document one prospective deterministic version without claiming its thresholds came from the deleted engine or research evidence.

### Implementation and verification state

- New submissions prospectively write one `comprehensive-fitness-workout-grade/2.0.0` object with algorithm version `actual-work-rubric/1.0.0`, one A-F letter, two or three structured reasons, source-session attribution, resolved-action references, and creation time. No second current grade field is written.
- The grade uses completed non-warm-up work, logging validity, comparable same-variant/same-role performance, effort coherence, actual attempts, and canonical exception handling. Pending factual prefills do not count as attempted work, and planned set count/order/substitution metadata is not a grade input.
- Accepted or modified canonical exception actions are treated as coherent handling. Ignored or overridden actions remain explicitly recorded but do not waive high-RPE or regression evidence. An applicable exercise-scoped action takes precedence over a broader session-scoped action for that exercise regardless of stored action order.
- Submitted legacy `session.grade`/`gradeVersion` and legacy stored `workoutAnalysis.grade` values remain read-only source facts. Missing historical grades display as unavailable and are not silently calculated at boot, render, import, or history-edit time.
- Completion is reduced to one grade, two or three reasons, at most three factual progress/PR highlights, one current canonical exception when present, Done, and contextual Progress. The old adherence rollup, grade categories/confidence, plan diff, achievement strip, completion notification setup, and submitted-session dock are removed from this state.
- Progress uses all submitted history for exercise/variant selection, compares one exact working-set role and resistance type at a time, keeps named variants separate, and exposes point date/load/reps/RPE/role/session/notes/source facts.
- Performance comparisons normalize each recorded load from its source unit into the current display unit while preserving the raw source fact for inspection. Derived estimated-performance comparison is intentionally bounded to 1–12 repetitions; higher-repetition observations remain visible source facts without an unbounded estimate.
- Exercise selection is keyed by exact performance identity plus resistance type, so same-name variants using external load and duration remain independently selectable. Chart point provenance comes from the selected source set and is never fabricated when absent.
- Completion Progress chooses the highlighted exact identity/resistance when available; otherwise it chooses the first completed, non-skipped working exercise in the submitted workout. A skipped exercise stored first cannot hijack that context.
- Focused static contracts passed for adaptation invariance, canonical action scope/handling, missing data, historical immutability, schema shape, unit normalization, high-repetition boundaries, role/variant/resistance separation, concise completion, and all-history access.
- Final Playwright verification passed 4/4 on mobile at 390 × 844 and 4/4 on desktop for adapted completion, no-highlight contextual Progress, immutable legacy plus/minus grades across reload, mixed-unit history, long variants, same-name multi-resistance selection, comparable-role charting, and inspectable point source facts.
- The consolidated affected mobile regression gate passed 8/8 across completion/lifecycle, compact normal-workout presentation, submitted-dock removal, routed submission idempotence, and history edit save/discard.
- Fresh screenshots under `artifacts/ui-audit/m7/` were visually inspected for concise completion, completion-to-Progress, selected point detail, long exercise names, large load/RPE values, exact variant/resistance selection, chronological old history, and touch-sized controls. No achievement/adherence/analytics/notification/submitted-dock completion surface remains.
- Full public verification passed effectively 62/62. Two sandboxed Git-child-process checks initially failed with environmental `spawn EPERM`; their unchanged focused escalated reruns passed.
- `npm.cmd run redesign:typecheck`, `npm.cmd run redesign:build` (24 Vite modules), static lint (175 JavaScript and 75 JSON files in the sanitized tracked-source mirror), workflow validation, tracked-source privacy validation (662 files, zero findings), research validation, and runtime syntax checks passed.
- `npm.cmd run sync:web` synchronized 26 public assets. Root/`www` SHA-256 parity passed for all nine changed runtime/package files, and `npm.cmd run verify:pwa` passed for 26 assets.
- `git diff --check` passed with line-ending warnings only.
- SHA-256 parity is confirmed between root and `www/` for all seven application runtime segments, `index.html`, and `sw.js`.
- Independent review found and drove corrections for ignored/overridden action grading, mixed-unit comparisons, resistance-specific selection, source provenance, no-highlight Progress context, high-repetition estimate bounds, semantic completion heading, exercise-action precedence, and the ordering strength of the UI regression. The final narrow re-review is recorded at the M7 checkpoint gate.
- Living-document review updated `PROJECT.md`, `ARCHITECTURE.md`, `DECISION_ENGINE.md`, `UI_UX.md`, and `ROADMAP.md` to describe the implemented M7 behavior and to stop describing removed achievements, adherence roll-ups, or submitted-session chrome as current behavior.

### Decisions, assumptions, and deviations

- The grade formula is prospective and versioned; no claim is made that its numeric weights came from the deleted adherence engine or from research evidence.
- Dependency audit could not reach the external npm registry under the environment policy. M7 changes no package manifest or lockfile, and all local package/build/runtime gates passed; this is recorded as an external environment limitation rather than a functional M7 failure.
- Verification used Node 24.18.0/npm 11.16.0 instead of the repository-pinned Node 22.23.x/npm 10.9.x.
- Physical-device keyboard, OS suspension, notification delivery, real private-history replay, five-workout field testing, hosted verification, deployment, push, merge, and publication remain external or later acceptance gates.
- No private or production fitness data was read, migrated, or mutated.

### Objective completion

**PASS.** New submissions have one versioned actual-work grade; legacy grades remain immutable; completion is concise; exact variants, resistance types, working-set roles, units, provenance, and old history remain trustworthy and inspectable; deleted completion/analytics surfaces are absent; static, public, build, package, privacy, running-app, visual, and independent-review gates pass. M8 may begin after the recoverable M7 checkpoint is recorded.

**Checkpoint:** `0223b36` (`feat(redesign): finalize grade and factual progress`).

## M8 — Remove concept scaffolding and dead migration structure

**Status:** COMPLETE — IMPLEMENTED LOCALLY; EXTERNAL ACCEPTANCE PENDING
**Started:** 2026-08-01
**Baseline checkpoint:** `0223b36`
**Branch:** `codex/zero-based-redesign`
**Authority:** Final disposition X-02 and end-of-migration deletion ledger; migration plan M8; final PRD data-integrity and permanent-exclusion sections.

### Exact milestone scope before implementation

- Remove the concept-only React/Vite gallery, prototype tests/scripts/configuration, and dependencies with no production consumer while preserving the final redesign package, adjudication/audit evidence, prompts/governance records, and historical design decisions.
- Remove expired legacy route redirects, compatibility writers, adapters, shadow paths, flags, dead code, orphan styles/assets, obsolete tests, stale cache/package entries, and current-intent documentation for deleted systems.
- Retain only isolated compatibility readers required to preserve supported backups, completed workout history, immutable snapshots, exact variant identity, set roles/provenance, notes, duration, readiness/rest facts, and historical grade/execution-quality values.
- Reconcile root/`www` packaging, service-worker cache/versioning, native/PWA verification, test discovery, package manifests, and living documentation.
- Do not extract inline CSS, rewrite the application stack, alter production data, or expand product scope.

### Affected user data and deletion safeguards

- M8 deletes tooling and unreachable migration/product structure, not completed workouts or current app data. No destructive data migration is planned.
- Backup v1/v2 compatibility, current backup/app-data v3, active-draft v1-to-v2 recovery, immutable historical snapshots/grades, role provenance, and exact exercise/variant identity remain preservation-critical.
- Synthetic public fixtures remain the only migration evidence used in this milestone. No private or production fitness data will be read, rewritten, or deleted.
- Every proposed compatibility deletion must first prove it is a writer/redirect/shadow path rather than the isolated reader required by a supported fixture.

### Authority/conflict review

- No authoritative contradiction is identified. M8 explicitly requires concept-toolchain deletion and the end of bounded legacy redirects/temporary coexistence.
- Owner untracked `.claude/`, `.vercel/`, and `redesign/prompts/` paths are outside the deletion set and must remain untouched.

### Documentation and governance reconciliation — 2026-08-01

- Files reviewed/updated: `CLAUDE.md`; `docs/PROJECT.md`; `docs/ARCHITECTURE.md`; `docs/DECISION_ENGINE.md`; `docs/UI_UX.md`; `docs/ROADMAP.md`; `docs/DOCUMENTATION_INVENTORY.md`; `docs/DAILY_BROWSER_QA.md`; `docs/iphone-pwa-personal-coach-setup.md`; `docs/performance.md`; `docs/push-backend.md`; `docs/training-prescription-data.md`; `docs/redesign/DECISION_LOG.md`; `docs/redesign/STATUS.md`; and both implementation records.
- Living product/UI documents now describe the fixed-light product with exactly Today and Progress as persistent destinations. Themes/color packages, cloud workout copy, planner/mesocycle, analytical dashboards, evidence/confidence, and numeric exception detectors are not described as live behavior.
- `exception-resolver.js` remains the sole action authority. Current source creates candidates only for directly recorded pain/injury or illness. Optional `meaningfully_poor` readiness is retained as a factual input and does not produce an action by itself.
- M8 adds successor decision D-025: new submissions prospectively use `actual-work-rubric/1.1.0`. Version 1.1 corrects valid-RPE coverage while retaining target/adaptation invariance. The M7 checkpoint record above remains accurate for its original `1.0.0` implementation; existing grades are not upgraded.
- M8 adds preservation decision D-026: top-level `recommendationHistory`, top-level `manualOverrides`, and `personalEvidencePackage` are retired global planner/evidence collections accepted and discarded by compatibility decoding. Embedded submitted snapshots and resolved actions/handling/overrides attached to their owning workout remain immutable.
- M8 adds service decision D-027: workout cloud-copy authorization/upload and UI/queue writers are removed. Web Push notifications, revocation, installation deletion, and bounded cleanup of residual legacy workout/mutation keys remain.
- The concept-only React/Vite product path is being removed while design/adjudication/governance documents remain historical evidence.
- `CLAUDE.md` received one strictly additive zero-based-redesign pointer; its existing content was preserved.
- Documentation verification: targeted stale-term searches, required UI documentation phrase checks, assigned-file diff review, and `git diff --check` were run. The first diff check found only four trailing spaces in the new status header; they were corrected. Final rerun is recorded by the integration owner with the M8 freeze evidence.

### Final local verification evidence

- Public Node gate: effective 51/51. The aggregate run passed 49 tests; two unchanged research archive/workbook determinism tests were blocked only by sandboxed `spawnSync git EPERM` and passed in their permitted reruns (57 manifest hashes; 19 sheets, 20,788 source cells, and 34 deterministic ZIP entries).
- Private local gate: 2/2 passed; 59 artifact checks, zero errors, and one preserved-source warning.
- Static lint: 192 JavaScript files and 3,112 JSON files passed. Type checking is not applicable because the final repository contains no TypeScript source or `tsconfig`.
- Workflow validation passed. `npm ls --all` completed without an invalid dependency tree.
- Dependency audits passed: full tree has three moderate development-only advisories and zero high/critical advisories; production has zero advisories at every severity.
- Tracked privacy passed across 647 files before staging and 580 files at the final implementation stage. Native packaging privacy passed.
- Final mobile browser gate: 144 passed, 15 configured skips. Final desktop gate: 141 passed, 18 configured skips. The one documentation sentinel that executed during a concurrent documentation rewrite was repaired and passed 2/2 across both projects afterward.
- Browser coverage includes 390 × 844, 320 CSS pixels with increased text, long names, large values, decimal RPE, empty/error/override/completion states, touch-sized controls, keyboard/focus/dialog behavior, fixed-light contrast, active rest/overtime, reload, draft recovery, import/clear failure boundaries, and absence of deleted destinations and surfaces.
- `sync:web` synchronized 26 public assets; PWA/native public-only verification passed for all 26. Capacitor synchronized Android and iOS; CocoaPods and `xcodebuild` were unavailable on Windows and were truthfully reported as external tool gaps.
- `git diff --check`, staged-scope inspection, and the final implementation privacy guard passed. Owner paths `.claude/`, `.vercel/`, and `redesign/prompts/` were not staged or modified.
- No private or production fitness data was migrated, deleted, uploaded, committed, or used as an unprotected experiment.

### Files changed and features removed

- Runtime, APIs, public package, tests, schemas, package graph, service worker, and native mirrors were reconciled in implementation checkpoint `10d3bb2` (164 files; 7,649 insertions and 30,346 deletions).
- Removed concept-only React/Vite scaffolding; prototype tests/config; obsolete prescription/recommendation schemas and live analytical test families; achievement/score assets; stale screenshots for deleted Plan/More/Dashboard/analytical surfaces; cloud-workout upload/enable paths; legacy routes/writers/shadow consumers; and obsolete cache/package entries.
- Retained only the minimum identity, direct-safety resolver, notification delivery/deletion, backup/import compatibility, historical snapshot, grade, and workout-record logic required by the final contracts.

### Recoverable checkpoint

- M8 implementation: `10d3bb2` (`feat(redesign): complete M8 deletion and integration`).
- M8 documentation reconciliation and final Codex self-audit: `acb1b02` (`docs(redesign): record M8 verification and self-audit`).

### Remaining external/unproven gates

- Repository-pinned Node 22.23.x/npm 10.9.x.
- Physical-device decimal-RPE keyboard, suspension/background, Web Push, sound/vibration, and installed-PWA behavior.
- Current hosted Vercel/Upstash/QStash state.
- Representative existing-user migration replay and owner acceptance.
- Five-workout field test and owner visual-baseline acceptance.
- Merge, push, deployment, production-data mutation, and publication.

### Objective completion

**PASS LOCALLY.** The approved M8 implementation, deletion ledger, locally executable verification, public packaging, and recoverable source checkpoint are complete. The complete redesign is not objectively approved for publication: pinned-runtime, physical-device, hosted-service, representative protected-data replay, owner visual-baseline, five-workout, and external Claude acceptance gates remain unproven.
